import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { extractClaimsAndEvidence } from './extractClaimsAndEvidence.js';
import { analyzeDemand } from './demandAnalyzer.js';
import { extractPersonalPull } from './personalPullExtractor.js';
import { researchLandscape } from './landscapeResearcher.js';
import { generateGapHypotheses } from './gapHypothesisGenerator.js';
import { compileUncertainty } from './uncertaintyCompiler.js';
import { generateRecommendation } from './recommendationEngine.js';
import { getEvidenceForInvestigation } from './getEvidenceForInvestigation.js';
import { getClaimVersionsForInvestigation } from './getClaimVersionsForInvestigation.js';
import { transitionInvestigationStatus } from './transitionInvestigationStatus.js';
import {
  createGenerationRun,
  finalizeGenerationRun,
  recordGenerationStep,
  runStepWithProvenance,
} from './provenanceRecorder.js';
import { persistBriefVersion } from './persistBriefVersion.js';
import type { BriefElement, BriefVersion, EvidenceItem, InvestigationStatus } from '../types/domain.js';

/** Brief Assembler (SLICE-09-DESIGN.md revision 8; Architecture §4). The single entrypoint
 *  orchestrating Slices 4-8 and producing one assembled, immutable `BriefVersion`, or none. */

/** Pipeline, validation, or infrastructure failure — the run could not produce a usable Brief.
 *  `investigationStatus` reflects the ACTUAL, OBSERVED resulting status of the Investigation —
 *  read back from the row AFTER every status-mutating attempt for this run has completed (or
 *  declined), never assumed from which branch this function took. In the common case that is
 *  'generation-failed' for a failed INITIAL generation and 'brief-generated' for a failed
 *  CORRECTION (finding 8: a failed correction's write path never even attempts a transition, so
 *  its pre-existing healthy status is left untouched by construction) — but
 *  `transitionInvestigationStatus`'s guarded UPDATE can decline (e.g. the Investigation was
 *  concurrently observed 'blocked', which `ALLOWED_PRIOR_STATUSES['generation-failed']`
 *  deliberately excludes — 'blocked' must never be silently overwritten, G-13), in which case the
 *  Investigation is left exactly as observed and THAT status is what this field reports. Typed as
 *  the full `InvestigationStatus` union, not a narrowed subset, because that observed value is
 *  never assumed to be one of a fixed shortlist. */
export class BriefGenerationFailedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly generationRunId: string,
    public readonly investigationStatus: InvestigationStatus,
  ) {
    super(reason);
    this.name = 'BriefGenerationFailedError';
  }
}

/** CALLER-CONTRACT class — every condition is evaluated at preflight, before any LLM call, so
 *  these are "wrong on arrival," independent of any concurrent race. */
export class InvalidSupersedeTargetError extends Error {
  constructor(
    public readonly reason: string,
    public readonly investigationId: string,
    public readonly generationRunId: string,
    public readonly suppliedSupersedesVersionId: string | undefined,
  ) {
    super(reason);
    this.name = 'InvalidSupersedeTargetError';
  }
}

/** GENUINE STALE RACE class — thrown whenever a preflight-validated target no longer matches what
 *  phase 4 observes under the `investigation` row lock. `expectedSupersedesVersionId: null` means
 *  "expected no ProblemBrief to exist yet" (a first-generation race). */
export class StaleCorrectionConflictError extends Error {
  constructor(
    public readonly problemBriefId: string,
    public readonly expectedSupersedesVersionId: string | null,
    public readonly actualCurrentVersionId: string,
    public readonly generationRunId: string,
  ) {
    super(
      expectedSupersedesVersionId === null
        ? `StaleCorrectionConflict: no ProblemBrief existed for this Investigation when generation ` +
          `began, but one now exists (current version ${actualCurrentVersionId}) — another ` +
          `first-generation call won the race; regenerate as a correction against the current ` +
          `version.`
        : `StaleCorrectionConflict: supersedesVersionId ${expectedSupersedesVersionId} is no longer ` +
          `ProblemBrief.currentVersionId (now ${actualCurrentVersionId}) — regenerate against the ` +
          `current version.`,
    );
    this.name = 'StaleCorrectionConflictError';
  }
}

interface ProblemBriefRow {
  id: string;
  current_version_id: string | null;
}

interface BriefVersionRow {
  id: string;
  problem_brief_id: string;
  version_number: number;
}

function dedupeEvidenceById(items: EvidenceItem[]): EvidenceItem[] {
  const byId = new Map<string, EvidenceItem>();
  for (const item of items) byId.set(item.id, item);
  return Array.from(byId.values());
}

/** Phase 2 step 0 (SLICE-09-DESIGN.md §3) — read-only, no lock, no transaction. Validates and
 *  snapshots the supersede target BEFORE any LLM call. Throws InvalidSupersedeTargetError for
 *  every caller-contract-wrong-on-arrival case. */
async function preflightValidateSupersedeTarget(
  investigationId: string,
  supersedesVersionId: string | undefined,
  generationRunId: string,
): Promise<{ preflightCurrentVersionId: string | null; supersedesRow: BriefVersionRow | null }> {
  const pbResult = await pool.query<ProblemBriefRow>(
    `SELECT id, current_version_id FROM problem_brief WHERE investigation_id = $1`,
    [investigationId],
  );
  const problemBriefRow = pbResult.rows[0] ?? null;

  if (supersedesVersionId !== undefined) {
    if (problemBriefRow === null) {
      throw new InvalidSupersedeTargetError(
        'supersedesVersionId was supplied but no ProblemBrief exists yet for this Investigation — there is nothing to correct',
        investigationId,
        generationRunId,
        supersedesVersionId,
      );
    }
    const bvResult = await pool.query<BriefVersionRow>(
      `SELECT id, problem_brief_id, version_number FROM brief_version WHERE id = $1`,
      [supersedesVersionId],
    );
    const supersedesRow = bvResult.rows[0] ?? null;
    if (supersedesRow === null || supersedesRow.problem_brief_id !== problemBriefRow.id) {
      throw new InvalidSupersedeTargetError(
        `supersedesVersionId ${supersedesVersionId} does not reference a BriefVersion belonging to this Investigation's ProblemBrief`,
        investigationId,
        generationRunId,
        supersedesVersionId,
      );
    }
    if (problemBriefRow.current_version_id !== supersedesVersionId) {
      throw new InvalidSupersedeTargetError(
        `supersedesVersionId ${supersedesVersionId} is not the current version of this ProblemBrief (current: ${problemBriefRow.current_version_id})`,
        investigationId,
        generationRunId,
        supersedesVersionId,
      );
    }
    return { preflightCurrentVersionId: problemBriefRow.current_version_id, supersedesRow };
  }

  if (problemBriefRow !== null) {
    throw new InvalidSupersedeTargetError(
      'supersedesVersionId was not supplied, but a ProblemBrief already exists for this Investigation — target the current version explicitly',
      investigationId,
      generationRunId,
      undefined,
    );
  }
  return { preflightCurrentVersionId: null, supersedesRow: null };
}

async function evidenceItemsAreLocal(investigationId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const result = await pool.query<{ id: string }>(
    `SELECT ei.id FROM evidence_item ei
       JOIN source_artifact sa ON sa.id = ei.source_artifact_id
      WHERE ei.id = ANY($1::uuid[]) AND sa.investigation_id = $2`,
    [ids, investigationId],
  );
  const found = new Set(result.rows.map((r) => r.id));
  return ids.every((id) => found.has(id));
}

async function sourceArtifactIsLocal(investigationId: string, sourceArtifactId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM source_artifact WHERE id = $1 AND investigation_id = $2`,
    [sourceArtifactId, investigationId],
  );
  return (result.rowCount ?? 0) > 0;
}

async function claimVersionOwnership(
  claimVersionId: string,
  investigationId: string,
): Promise<{ total: number; local: number }> {
  const totalResult = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM claim_version_evidence WHERE claim_version_id = $1`,
    [claimVersionId],
  );
  const localResult = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c
       FROM claim_version_evidence cve
       JOIN evidence_item ei ON ei.id = cve.evidence_item_id
       JOIN source_artifact sa ON sa.id = ei.source_artifact_id
      WHERE cve.claim_version_id = $1 AND sa.investigation_id = $2`,
    [claimVersionId, investigationId],
  );
  return { total: Number(totalResult.rows[0].c), local: Number(localResult.rows[0].c) };
}

/** Reads back the Investigation's ACTUAL, current status — never assumed from which code path is
 *  reporting it. Used on every failure/conflict path (BLOCKING 1's "never ignore the return
 *  value" applied to what gets REPORTED, not just what gets checked): `transitionInvestigationStatus`'s
 *  guarded UPDATE can decline (e.g. the row was concurrently observed 'blocked', which
 *  'generation-failed''s allowed-prior-states deliberately excludes), and a failed CORRECTION
 *  never even attempts a transition — in both cases the only honest source of truth for what
 *  status to report is a fresh read of the row, taken AFTER every status-mutating attempt this
 *  run made has already completed or declined. Always reads via the pool, never a `client` that
 *  may belong to an already-rolled-back transaction. */
async function readActualInvestigationStatus(investigationId: string): Promise<InvestigationStatus> {
  const result = await pool.query<{ status: InvestigationStatus }>(
    `SELECT status FROM investigation WHERE id = $1`,
    [investigationId],
  );
  if (result.rows.length === 0) {
    throw new Error(`generateBriefVersion: investigation ${investigationId} does not exist while reading back its resulting status`);
  }
  return result.rows[0].status;
}

export async function generateBriefVersion(input: {
  investigationId: string;
  supersedesVersionId?: string;
  runtimeIdentifier: string;
}): Promise<BriefVersion> {
  const { investigationId } = input;
  const isCorrection = input.supersedesVersionId !== undefined;

  // ---- Phase 1: run creation ----
  const generationRun = await createGenerationRun({ investigationId, runtimeIdentifier: input.runtimeIdentifier });
  const generationRunId = generationRun.id;

  // ---- Phase 2 step 0: preflight validation and snapshot (CALLER-A — the ONLY place
  // InvalidSupersedeTargetError is ever thrown) ----
  let preflightCurrentVersionId: string | null;
  let supersedesRow: BriefVersionRow | null;
  /** Attempts the 'generation-failed' transition for an INITIAL generation failure only (finding
   *  8 — a failed correction never attempts this transition at all, by construction; no DB write
   *  here for that case). Never retries and never forces the status if the guarded UPDATE declines
   *  (returns false) — per the design's "leave the Investigation exactly as this concurrent
   *  observation found it" language (e.g. the row was concurrently observed 'blocked', which
   *  `ALLOWED_PRIOR_STATUSES['generation-failed']` deliberately excludes — 'blocked' must never be
   *  silently overwritten, G-13).
   *
   *  Composer ruling (round 3): a declined transition's `GenerationStep` must NAME the observed
   *  status, not merely say "left as observed" — the thrown exception is transient, the
   *  `GenerationStep` is the durable audit record. So this function reads the Investigation's
   *  ACTUAL status back exactly ONCE — after the transition attempt (or immediately, for a
   *  correction, which never attempts one) — and both records that value in the declined-step's
   *  `error` text (when the transition declined) AND returns it, so every caller reuses the SAME
   *  observation for whatever it reports/throws next, rather than re-reading and risking a second,
   *  possibly-different answer. No new provenance concept, no schema change — the existing
   *  `GenerationStep`/`recordGenerationStep` API (Architecture §1.9; 'Brief Assembler' is an
   *  existing Section 2 component name, already used for this run's other structural-failure
   *  steps).
   *
   *  ORDERING CONTRACT (Sol review, binding, unchanged): every call site MUST call this BEFORE
   *  `finalizeGenerationRun` for the same run, never after — `finalizeGenerationRun` computes
   *  `modelIdentifiers`/`toolsInvoked` from the step log at call time, so a step recorded here
   *  after finalization already ran would be invisible to those aggregates and the finalized run
   *  would misrepresent its own contents. */
  async function attemptGenerationFailedTransition(reason: string): Promise<InvestigationStatus> {
    let transitioned = true; // correction case: no transition is attempted at all — not a decline
    if (!isCorrection) {
      transitioned = await transitionInvestigationStatus(investigationId, 'generation-failed', reason);
    }
    // Single read-back (Composer ruling: exactly once, reused by both the record below and the
    // caller) — never re-read separately after this point on this path.
    const resultingStatus = await readActualInvestigationStatus(investigationId);
    if (!isCorrection && !transitioned) {
      await recordGenerationStep({
        generationRunId,
        step: {
          component: 'Brief Assembler',
          outcome: 'failed',
          error:
            `Transition to generation-failed declined; Investigation remained ${resultingStatus}. ` +
            `No retry or forced overwrite was attempted. Underlying failure: ${reason}`,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          inputRefs: [],
          outputRefs: [],
        },
      });
    }
    return resultingStatus;
  }

  try {
    const preflight = await preflightValidateSupersedeTarget(investigationId, input.supersedesVersionId, generationRunId);
    preflightCurrentVersionId = preflight.preflightCurrentVersionId;
    supersedesRow = preflight.supersedesRow;
  } catch (err) {
    if (err instanceof InvalidSupersedeTargetError) {
      // CALLER-CONTRACT error — distinct semantics preserved exactly: no BriefGenerationFailedError
      // conversion, no Investigation status transition. Only the exactly-once finalization applies.
      await finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null });
      throw err;
    }
    // BLOCKING 1 fix: any OTHER error during preflight (DB error, connection failure, unexpected
    // throw) previously escaped this boundary with the GenerationRun left stranded
    // `outcome: 'in-progress'` forever. Now handled with the same
    // transition-attempt-and-record -> finalize (exactly once) -> read-back -> rethrow-as-
    // BriefGenerationFailedError contract every other failure path in this function uses. Sol
    // review (binding): any declined-transition GenerationStep MUST be recorded BEFORE
    // finalizeGenerationRun — finalizeGenerationRun computes modelIdentifiers/toolsInvoked from
    // the step log, so a step appended after finalization is invisible to those aggregates and
    // the finalized run would misrepresent its own contents. No unconditional `finally`, exactly
    // one finalization on this path.
    const reason = err instanceof Error ? err.message : String(err);
    const resultingStatus = await attemptGenerationFailedTransition(reason);
    await finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null });
    throw new BriefGenerationFailedError(reason, generationRunId, resultingStatus);
  }

  /** Terminal-fail helper for every phase-2/3 hard-stop class. Attempts-and-records the
   *  'generation-failed' transition (see `attemptGenerationFailedTransition` above) BEFORE
   *  finalizing the run exactly once (no client) — a declined-transition step must be visible in
   *  the step log finalizeGenerationRun aggregates from, never appended after — then reports the
   *  SAME observed status `attemptGenerationFailedTransition` already read back. Never returns. */
  async function failRun(reason: string): Promise<never> {
    const resultingStatus = await attemptGenerationFailedTransition(reason);
    await finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null });
    throw new BriefGenerationFailedError(reason, generationRunId, resultingStatus);
  }

  try {
    // ---- Evidence universe for this run (§3 Phase 2) — captured BEFORE step 1 runs ----
    const startSnapshot = await getEvidenceForInvestigation(investigationId);

    // ---- Phase 2, step 1: Extraction & Clustering Engine (class 1 — Q-2 precheck) ----
    const extraction = await runStepWithProvenance({
      generationRunId,
      component: 'Extraction & Clustering Engine',
      inputRefs: [],
      getOutputRefs: (r) => [...r.claimVersions.map((cv) => cv.id), ...r.evidenceItems.map((e) => e.id)],
      fn: () => extractClaimsAndEvidence(investigationId),
    });
    if (extraction.generationFailed || extraction.problemStatementCandidates.length === 0) {
      await failRun(
        extraction.generationFailureReason ??
          'Extraction & Clustering Engine could not establish any ProblemStatement candidate',
      );
    }

    // ---- Phase 3, check 1(a)/(b) — ClaimVersion evidence-chain ownership verification, run
    // immediately after Extraction (before any further LLM spend, same "no LLM spend on an
    // already-doomed run" principle as G-1's class-2 precedence): this check depends only on
    // THIS run's own extraction output, never on Demand/Landscape/Gap, so there is no reason to
    // defer it to the end of the pipeline — an Extraction result whose accepted ProblemStatements
    // do not survive independent ownership verification is exactly as doomed as a Q-2 failure. ----
    const thisRunClaimVersionIds = new Set(extraction.claimVersions.map((cv) => cv.id));
    const claimVersionIdsUnion = Array.from(
      new Set(extraction.problemStatementCandidates.flatMap((p) => p.supportingClaimVersionIds)),
    );
    for (const claimVersionId of claimVersionIdsUnion) {
      if (!thisRunClaimVersionIds.has(claimVersionId)) {
        await failRun(
          `ClaimVersion ${claimVersionId} cited by a ProblemStatement candidate does not belong to this run's own extraction result`,
        );
      }
      const { total, local } = await claimVersionOwnership(claimVersionId, investigationId);
      if (local < 1 || local !== total) {
        await failRun(
          `ClaimVersion ${claimVersionId}'s evidence chain failed ownership verification (local=${local}, total=${total})`,
        );
      }
    }

    // ---- Phase 2, step 2: Demand Analyzer (class 2 — hard stop) ----
    const demand = await runStepWithProvenance({
      generationRunId,
      component: 'Demand Analyzer',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () => analyzeDemand(investigationId),
    });
    if (demand.generationFailed) {
      await failRun(demand.generationFailureReason ?? 'Demand Analyzer failed');
    }

    // ---- Phase 2, step 3: Personal Pull Extractor (never blocks) ----
    const personalPull = await runStepWithProvenance({
      generationRunId,
      component: 'Personal Pull Extractor',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () => extractPersonalPull(investigationId),
    });

    // ---- Phase 2, step 4: Landscape Researcher (class 2 — hard stop) ----
    const landscape = await runStepWithProvenance({
      generationRunId,
      component: 'Landscape Researcher',
      inputRefs: [],
      getOutputRefs: (r) => r.webSearchQueries.map((q) => q.id),
      fn: () => researchLandscape(investigationId, generationRunId),
    });
    if (landscape.generationFailed) {
      await failRun(landscape.generationFailureReason ?? 'Landscape Researcher failed');
    }

    const allEvidenceItems = dedupeEvidenceById([
      ...startSnapshot,
      ...extraction.evidenceItems,
      ...landscape.landscapeEvidenceItems,
    ]);

    // ---- Phase 2, step 5: Gap Hypothesis Generator (class 2 — hard stop) ----
    const gap = await runStepWithProvenance({
      generationRunId,
      component: 'Gap Hypothesis Generator',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () =>
        generateGapHypotheses({
          investigationId,
          existingSolutionCandidates: landscape.existingSolutionCandidates,
          allEvidenceItems,
          demandSignalCandidates: demand.demandSignalCandidates,
          demandConfidenceClassificationCandidate: demand.demandConfidenceClassificationCandidate,
        }),
    });
    if (gap.generationFailed) {
      await failRun(gap.generationFailureReason ?? 'Gap Hypothesis Generator failed');
    }

    // ---- Phase 2, step 6: Uncertainty Compiler (class 3 — own failure only) ----
    const claimVersionsForUncertainty = await getClaimVersionsForInvestigation(investigationId);
    const uncertainty = await runStepWithProvenance({
      generationRunId,
      component: 'Uncertainty Compiler',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () =>
        compileUncertainty({
          investigationId,
          problemStatementCandidates: extraction.problemStatementCandidates,
          evidenceItems: allEvidenceItems,
          claimVersions: claimVersionsForUncertainty,
          demandAnalysis: demand,
          landscapeResearch: landscape,
          gapHypothesisGeneration: gap,
        }),
    });
    if (uncertainty.generationFailed) {
      await failRun(uncertainty.generationFailureReason ?? 'Uncertainty Compiler failed');
    }

    // ---- Phase 2, step 7: Recommendation Engine (class 3 — own failure only) ----
    const recommendation = await runStepWithProvenance({
      generationRunId,
      component: 'Recommendation Engine',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () =>
        generateRecommendation({
          problemStatementCandidates: extraction.problemStatementCandidates,
          demandAnalysis: demand,
          landscapeResearch: landscape,
          gapHypothesisGeneration: gap,
          uncertaintyStatementCandidate: uncertainty.uncertaintyStatementCandidate,
        }),
    });
    if (recommendation.generationFailed) {
      await failRun(recommendation.generationFailureReason ?? 'Recommendation Engine failed');
    }

    // ---- Phase 3, check 1(c): full ownership for every OTHER Brief-scoped entity's evidence
    // citations (ClaimVersion ownership itself was already verified immediately after Extraction,
    // above) ----
    const universe = dedupeEvidenceById([
      ...startSnapshot,
      ...extraction.evidenceItems,
      ...landscape.landscapeEvidenceItems,
    ]);
    const universeIds = new Set(universe.map((e) => e.id));
    const universeSourceArtifactIds = new Set(universe.map((e) => e.sourceArtifactId));

    async function verifyEvidenceItemIds(label: string, ids: string[]): Promise<void> {
      for (const id of ids) {
        if (!universeIds.has(id)) {
          await failRun(`${label} cites EvidenceItem ${id} outside this run's evidence universe`);
        }
      }
      const local = await evidenceItemsAreLocal(investigationId, ids);
      if (!local) {
        await failRun(`${label} cites an EvidenceItem that does not belong to this Investigation`);
      }
    }

    for (const c of demand.demandSignalCandidates) {
      await verifyEvidenceItemIds('DemandSignal candidate', c.evidenceItemIds);
    }
    for (const c of landscape.existingSolutionCandidates) {
      await verifyEvidenceItemIds('ExistingSolution candidate', c.evidenceItemIds);
    }
    for (const c of gap.gapHypothesisCandidates) {
      await verifyEvidenceItemIds('GapHypothesis candidate', c.evidenceItemIds);
    }
    for (const c of personalPull.personalPullNoteCandidates) {
      const local = await sourceArtifactIsLocal(investigationId, c.sourceArtifactId);
      if (!local || !universeSourceArtifactIds.has(c.sourceArtifactId)) {
        await failRun(
          `PersonalPullNote candidate cites SourceArtifact ${c.sourceArtifactId} outside this Investigation's evidence universe`,
        );
      }
    }

    // ---- Phase 3, check 2: four-element negativeFindings fail-closed rule — TERMINAL-FAIL DIRECTLY ----
    const negativeFindingRows: Array<{ element: BriefElement; statement: string }> = [];

    function checkElement(
      element: BriefElement,
      idsNonEmpty: boolean,
      negativeFindingSignal: { statement: string } | undefined,
    ): string | null {
      if (idsNonEmpty && negativeFindingSignal) {
        return `${element}: both a non-empty id array and a NegativeFinding signal were present — exactly one is required`;
      }
      if (!idsNonEmpty && !negativeFindingSignal) {
        return `${element}: neither a non-empty id array nor a NegativeFinding signal was present`;
      }
      if (!idsNonEmpty && negativeFindingSignal) {
        if (negativeFindingSignal.statement.trim().length === 0) {
          return `${element}: NegativeFinding signal has an empty statement`;
        }
        negativeFindingRows.push({ element, statement: negativeFindingSignal.statement });
      }
      return null;
    }

    const check2Errors = [
      checkElement(
        'demand-signal-type',
        demand.demandSignalCandidates.length > 0,
        demand.demandConfidenceClassificationCandidate.negativeFindingSignal,
      ),
      checkElement('existing-solution', landscape.existingSolutionCandidates.length > 0, landscape.negativeFindingSignal),
      checkElement('gap-hypothesis', gap.gapHypothesisCandidates.length > 0, gap.negativeFindingSignal),
    ].filter((e): e is string => e !== null);

    if (check2Errors.length > 0) {
      await failRun(`negativeFindings fail-closed rule violated: ${check2Errors.join('; ')}`);
    }

    // ---- Phase 4: persistence (the one short transaction) + finalization ----
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM investigation WHERE id = $1 FOR UPDATE', [investigationId]);

      const pbResult = await client.query<ProblemBriefRow>(
        `SELECT id, current_version_id FROM problem_brief WHERE investigation_id = $1`,
        [investigationId],
      );
      const problemBriefRow = pbResult.rows[0] ?? null;
      const currentVersionIdAtLock = problemBriefRow?.current_version_id ?? null;

      if (preflightCurrentVersionId !== currentVersionIdAtLock) {
        await client.query('ROLLBACK');
        if (problemBriefRow === null) {
          throw new Error(
            'generateBriefVersion assertion failure: preflight observed a ProblemBrief but none exists at lock time — problem_brief rows are never deleted',
          );
        }
        const startedAt = new Date().toISOString();
        const errorMessage =
          preflightCurrentVersionId === null
            ? `StaleCorrectionConflict: no ProblemBrief existed at preflight time; one now exists (current version ${currentVersionIdAtLock})`
            : `StaleCorrectionConflict: expected current version ${preflightCurrentVersionId}, actual ${currentVersionIdAtLock}`;
        await recordGenerationStep({
          generationRunId,
          step: {
            component: 'Brief Assembler',
            outcome: 'failed',
            error: errorMessage,
            startedAt,
            completedAt: new Date().toISOString(),
            inputRefs: preflightCurrentVersionId === null ? [] : [preflightCurrentVersionId],
            outputRefs: [],
          },
        });
        await finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null });
        throw new StaleCorrectionConflictError(
          problemBriefRow.id,
          preflightCurrentVersionId,
          currentVersionIdAtLock as string,
          generationRunId,
        );
      }

      const versionNumber = isCorrection ? (supersedesRow as BriefVersionRow).version_number + 1 : 1;
      const briefVersionId = randomUUID();
      const problemBriefId = problemBriefRow?.id ?? randomUUID();
      const problemStatementIds = extraction.problemStatementCandidates.map(() => randomUUID());
      const demandSignalIds = demand.demandSignalCandidates.map(() => randomUUID());
      const existingSolutionIds = landscape.existingSolutionCandidates.map(() => randomUUID());
      const gapHypothesisIds = gap.gapHypothesisCandidates.map(() => randomUUID());
      const personalPullNoteIds = personalPull.personalPullNoteCandidates.map(() => randomUUID());
      const negativeFindingsWithIds = negativeFindingRows.map((nf) => ({ id: randomUUID(), ...nf }));
      const demandNegativeFindingId = negativeFindingsWithIds.find((nf) => nf.element === 'demand-signal-type')?.id;

      if (!isCorrection) {
        await client.query(`INSERT INTO problem_brief (id, investigation_id) VALUES ($1, $2)`, [
          problemBriefId,
          investigationId,
        ]);
      }

      const briefVersion = await persistBriefVersion({
        client,
        briefVersionId,
        problemBriefId,
        versionNumber,
        supersedesVersionId: input.supersedesVersionId ?? null,
        generationRunId,
        problemStatementCandidates: extraction.problemStatementCandidates,
        problemStatementIds,
        claimVersionIds: claimVersionIdsUnion,
        demandSignalCandidates: demand.demandSignalCandidates,
        demandSignalIds,
        demandConfidenceClassificationCandidate: demand.demandConfidenceClassificationCandidate,
        demandNegativeFindingId,
        existingSolutionCandidates: landscape.existingSolutionCandidates,
        existingSolutionIds,
        gapHypothesisCandidates: gap.gapHypothesisCandidates,
        gapHypothesisIds,
        personalPullNoteCandidates: personalPull.personalPullNoteCandidates,
        personalPullNoteIds,
        uncertaintyStatementCandidate: uncertainty.uncertaintyStatementCandidate,
        recommendationCandidate: recommendation.recommendationCandidate,
        negativeFindings: negativeFindingsWithIds,
      });

      await client.query(`UPDATE problem_brief SET current_version_id = $1 WHERE id = $2`, [
        briefVersionId,
        problemBriefId,
      ]);

      const transitioned = await transitionInvestigationStatus(investigationId, 'brief-generated', null, {
        client,
        problemBriefId,
      });
      if (!transitioned) {
        await client.query('ROLLBACK');
        const startedAt = new Date().toISOString();
        await recordGenerationStep({
          generationRunId,
          step: {
            component: 'Brief Assembler',
            outcome: 'failed',
            error:
              'Investigation status transition to brief-generated returned false — status was not ' +
              'in an allowed prior state at update time',
            startedAt,
            completedAt: new Date().toISOString(),
            inputRefs: [],
            outputRefs: [],
          },
        });
        await finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null });
        // BLOCKING 1's return-value check, applied to what gets REPORTED too: this UPDATE targeted
        // 'brief-generated' and declined — do not assume 'generation-failed' as the resulting
        // status (this is not a generic initial-failure path, and no transitionInvestigationStatus
        // call to 'generation-failed' was ever made here). Read back the row's actual status,
        // taken after the rollback above.
        const resultingStatus = await readActualInvestigationStatus(investigationId);
        throw new BriefGenerationFailedError(
          'Investigation status transition to brief-generated failed unexpectedly during assembly',
          generationRunId,
          resultingStatus,
        );
      }

      await finalizeGenerationRun({ generationRunId, outcome: 'succeeded', briefVersionId, client });

      await client.query('COMMIT');
      return briefVersion;
    } catch (err) {
      if (err instanceof StaleCorrectionConflictError || err instanceof BriefGenerationFailedError) {
        throw err;
      }
      try {
        await client.query('ROLLBACK');
      } catch {
        // transaction may already be aborted/rolled back — safe to ignore
      }
      // Sol review (binding): a declined-transition GenerationStep must be recorded BEFORE
      // finalizeGenerationRun, never after — finalize computes modelIdentifiers/toolsInvoked from
      // the step log at call time.
      const reason = err instanceof Error ? err.message : String(err);
      const resultingStatus = await attemptGenerationFailedTransition(reason);
      await finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null });
      throw new BriefGenerationFailedError(reason, generationRunId, resultingStatus);
    } finally {
      client.release();
    }
  } catch (err) {
    if (
      err instanceof InvalidSupersedeTargetError ||
      err instanceof StaleCorrectionConflictError ||
      err instanceof BriefGenerationFailedError
    ) {
      throw err;
    }
    // Uncaught exception anywhere in phase 2/3 not represented by a component's own
    // generationFailed field — transition-attempt-and-record (initial only) BEFORE finalizing
    // exactly once (Sol review: ordering constraint, same reasoning as above), then rethrow.
    const reason = err instanceof Error ? err.message : String(err);
    const resultingStatus = await attemptGenerationFailedTransition(reason);
    await finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null });
    throw new BriefGenerationFailedError(reason, generationRunId, resultingStatus);
  }
}

// Re-exported for callers that need the PoolClient type without importing 'pg' directly.
export type { PoolClient };
