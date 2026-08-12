import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { getInvestigation } from './getInvestigation.js';
import { callForcedTool, LlmValidationError } from './llmClient.js';
import type {
  ClaimVersion,
  ClaimVersionEvidenceRef,
  EvidenceItem,
  EvidenceLabel,
  NonEmptyArray,
  ProblemStatementCandidate,
} from '../types/domain.js';

/** Test-only race-window widener for the F-2 advisory-lock regression test. Production code always
 *  calls this hook (right before each claim_version INSERT — see its call site below), but it
 *  defaults to a no-op — it only ever does something after a `*.test.ts` file calls
 *  `__setF2RaceDelayForTests` to install a delay. The hook receives the in-transaction `PoolClient`
 *  so a test can run a genuine DB-side `pg_sleep(...)` on it immediately before the write, forcing
 *  two concurrent calls to attempt their conflicting `INSERT`s at effectively the same instant.
 *  This placement (at the write, not the earlier existing-claims read) was chosen empirically:
 *  delaying at the read was found unreliable even with a real, synchronized-deadline DB-side sleep
 *  — whichever of the two concurrent calls happened to reach the read microseconds earlier
 *  routinely finished its entire remaining select-through-commit pipeline before the other call's
 *  own read round-trip completed, so the "loser" always ended up reading already-committed data
 *  and no collision ever occurred. Delaying right before the write, after `versionNumber` has
 *  already been computed from each call's own (possibly stale) in-memory snapshot, sidesteps that
 *  entirely — it forces the actual `UNIQUE(claim_id, version_number)` collision to occur regardless
 *  of how the earlier read happened to interleave. Same pattern as
 *  `__allowPrivateNetworkHostForTests` in resolveSourceArtifact.ts — a module-level test-only
 *  override, never invoked with a non-default value outside test code. */
let f2RaceDelayForTests: ((client: PoolClient) => Promise<void>) | null = null;

export function __setF2RaceDelayForTests(delay: ((client: PoolClient) => Promise<void>) | null): void {
  f2RaceDelayForTests = delay;
}

const EVIDENCE_LABELS: EvidenceLabel[] = [
  'fact',
  'observation',
  'interpretation',
  'assumption',
  'unknown',
];
const STANCES = ['supporting', 'contradicting', 'neutral-context'] as const;
type Stance = (typeof STANCES)[number];

// ---- Raw (unvalidated-beyond-shape) shapes the model's tool call returns ----

interface RawEvidenceItem {
  sourceArtifactId: string;
  excerptOrSummary: string;
  label: string;
}

interface RawEvidenceRef {
  evidenceIndex: number;
  stance: string;
  relevanceNote?: string;
}

interface RawClaim {
  text: string;
  matchesExistingClaimId?: string;
  evidenceRefs: RawEvidenceRef[];
}

interface RawProblemStatement {
  whoExperiencesIt: string;
  contextOrWorkflow: string;
  consequenceOrFriction: string;
  supportingClaimIndices: number[];
}

interface RawExtraction {
  evidenceItems: RawEvidenceItem[];
  claims: RawClaim[];
  problemStatements: RawProblemStatement[];
}

export interface ExtractionResult {
  claimVersions: ClaimVersion[];
  evidenceItems: EvidenceItem[];
  problemStatementCandidates: ProblemStatementCandidate[];
  /** Explicit generation-failure signal (roadmap Slice 4 note) — 'problem-statement' is
   *  non-negatable (Q-2), so an inability to establish any specific problem statement is surfaced
   *  here rather than as a NegativeFinding. Slice 9 is the consumer that maps this to
   *  `Investigation.status = 'generation-failed'`. */
  generationFailed: boolean;
  generationFailureReason?: string;
}

const TOOL_NAME = 'extract_claims_and_evidence';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    evidenceItems: {
      type: 'array',
      description:
        'Every discrete piece of evidence found across the provided sources. Evidence items are ' +
        'shared: the same item may later be cited by multiple claims with different stances, so ' +
        'extract each distinct piece of evidence once here rather than duplicating it per claim.',
      items: {
        type: 'object',
        properties: {
          sourceArtifactId: {
            type: 'string',
            description: 'Exact sourceArtifactId this evidence was found in, from the CONTEXT.',
          },
          excerptOrSummary: { type: 'string' },
          label: { type: 'string', enum: EVIDENCE_LABELS },
        },
        required: ['sourceArtifactId', 'excerptOrSummary', 'label'],
      },
    },
    claims: {
      type: 'array',
      description:
        'Distinct assertions extracted/clustered from the sources. Restatements of the same ' +
        'underlying assertion should be merged into one claim, not listed twice.',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          matchesExistingClaimId: {
            type: 'string',
            description:
              'If this claim restates an EXISTING CLAIM listed in the CONTEXT, its exact id. ' +
              'Omit or leave empty if this is a new claim not previously seen.',
          },
          evidenceRefs: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                evidenceIndex: {
                  type: 'integer',
                  description: 'Index into the evidenceItems array above.',
                },
                stance: { type: 'string', enum: STANCES },
                relevanceNote: { type: 'string' },
              },
              required: ['evidenceIndex', 'stance'],
            },
          },
        },
        required: ['text', 'evidenceRefs'],
      },
    },
    problemStatements: {
      type: 'array',
      description:
        'One entry per specific, concrete problem statement supportable by the claims above. If ' +
        'the material is too vague or general to establish any specific problem, return an empty ' +
        'array here rather than inventing one.',
      items: {
        type: 'object',
        properties: {
          whoExperiencesIt: { type: 'string' },
          contextOrWorkflow: { type: 'string' },
          consequenceOrFriction: { type: 'string' },
          supportingClaimIndices: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Indices into the claims array above that support this problem statement.',
          },
        },
        required: [
          'whoExperiencesIt',
          'contextOrWorkflow',
          'consequenceOrFriction',
          'supportingClaimIndices',
        ],
      },
    },
  },
  required: ['evidenceItems', 'claims', 'problemStatements'],
} as const;

function isStance(value: unknown): value is Stance {
  return typeof value === 'string' && (STANCES as readonly string[]).includes(value);
}

function isEvidenceLabel(value: unknown): value is EvidenceLabel {
  return typeof value === 'string' && (EVIDENCE_LABELS as readonly string[]).includes(value);
}

/** Structural/enum validation only (R-4) — referential integrity across the multi-entity response
 *  (does evidenceIndex resolve, does matchesExistingClaimId resolve, is a citation array actually
 *  non-empty) is deliberately handled as a separate post-processing filter in
 *  `extractClaimsAndEvidence`, not here — see that function's doc comment for the stated
 *  rationale (roadmap Slice 4: drop the unsupported entity rather than failing the whole call). */
function validateRawExtraction(input: unknown): { valid: true; value: RawExtraction } | { valid: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: 'tool input is not an object' };
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.evidenceItems)) {
    return { valid: false, error: 'evidenceItems is not an array' };
  }
  if (!Array.isArray(obj.claims)) {
    return { valid: false, error: 'claims is not an array' };
  }
  if (!Array.isArray(obj.problemStatements)) {
    return { valid: false, error: 'problemStatements is not an array' };
  }

  for (let i = 0; i < obj.evidenceItems.length; i++) {
    const e = obj.evidenceItems[i] as Record<string, unknown>;
    if (typeof e?.sourceArtifactId !== 'string' || e.sourceArtifactId.length === 0) {
      return { valid: false, error: `evidenceItems[${i}].sourceArtifactId is missing/invalid` };
    }
    if (typeof e?.excerptOrSummary !== 'string' || e.excerptOrSummary.length === 0) {
      return { valid: false, error: `evidenceItems[${i}].excerptOrSummary is missing/invalid` };
    }
    if (!isEvidenceLabel(e?.label)) {
      return { valid: false, error: `evidenceItems[${i}].label "${String(e?.label)}" is not a valid EvidenceLabel` };
    }
  }

  for (let i = 0; i < obj.claims.length; i++) {
    const c = obj.claims[i] as Record<string, unknown>;
    if (typeof c?.text !== 'string' || c.text.length === 0) {
      return { valid: false, error: `claims[${i}].text is missing/invalid` };
    }
    if (!Array.isArray(c?.evidenceRefs)) {
      return { valid: false, error: `claims[${i}].evidenceRefs is not an array` };
    }
    for (let j = 0; j < c.evidenceRefs.length; j++) {
      const ref = c.evidenceRefs[j] as Record<string, unknown>;
      if (typeof ref?.evidenceIndex !== 'number') {
        return { valid: false, error: `claims[${i}].evidenceRefs[${j}].evidenceIndex is not a number` };
      }
      if (!isStance(ref?.stance)) {
        return { valid: false, error: `claims[${i}].evidenceRefs[${j}].stance "${String(ref?.stance)}" is invalid` };
      }
    }
  }

  for (let i = 0; i < obj.problemStatements.length; i++) {
    const p = obj.problemStatements[i] as Record<string, unknown>;
    if (typeof p?.whoExperiencesIt !== 'string' || p.whoExperiencesIt.length === 0) {
      return { valid: false, error: `problemStatements[${i}].whoExperiencesIt is missing/invalid` };
    }
    if (typeof p?.contextOrWorkflow !== 'string' || p.contextOrWorkflow.length === 0) {
      return { valid: false, error: `problemStatements[${i}].contextOrWorkflow is missing/invalid` };
    }
    if (typeof p?.consequenceOrFriction !== 'string' || p.consequenceOrFriction.length === 0) {
      return { valid: false, error: `problemStatements[${i}].consequenceOrFriction is missing/invalid` };
    }
    if (!Array.isArray(p?.supportingClaimIndices)) {
      return { valid: false, error: `problemStatements[${i}].supportingClaimIndices is not an array` };
    }
  }

  return { valid: true, value: obj as unknown as RawExtraction };
}

interface ExistingClaimContext {
  claimId: string;
  latestVersionId: string;
  latestVersionNumber: number;
  text: string;
}

/** Investigation-scoped lookup of existing claims for the clustering heuristic. `Claim` carries
 *  no `investigationId` field (Architecture §3 — Claims are shared, not hard-scoped) so scoping
 *  is derived by joining through claim_version_evidence -> evidence_item -> source_artifact,
 *  taking each claim's highest version_number as "latest". */
async function getExistingClaimsForInvestigation(
  client: PoolClient,
  investigationId: string,
): Promise<ExistingClaimContext[]> {
  const result = await client.query<{
    claim_id: string;
    id: string;
    version_number: number;
    text: string;
  }>(
    `SELECT DISTINCT ON (cv.claim_id) cv.claim_id, cv.id, cv.version_number, cv.text
     FROM claim_version cv
     WHERE cv.claim_id IN (
       SELECT DISTINCT c.id
       FROM claim c
       JOIN claim_version cv2 ON cv2.claim_id = c.id
       JOIN claim_version_evidence cve ON cve.claim_version_id = cv2.id
       JOIN evidence_item ei ON ei.id = cve.evidence_item_id
       JOIN source_artifact sa ON sa.id = ei.source_artifact_id
       WHERE sa.investigation_id = $1
     )
     ORDER BY cv.claim_id, cv.version_number DESC`,
    [investigationId],
  );
  return result.rows.map((r) => ({
    claimId: r.claim_id,
    latestVersionId: r.id,
    latestVersionNumber: r.version_number,
    text: r.text,
  }));
}

function buildUserPrompt(
  sources: Array<{ id: string; type: string; raw: string; resolvedContent: string }>,
  existingClaims: ExistingClaimContext[],
): string {
  const sourcesBlock = sources
    .map(
      (s) =>
        `<source id="${s.id}" type="${s.type}">\n${s.resolvedContent}\n</source>`,
    )
    .join('\n\n');

  const existingClaimsBlock =
    existingClaims.length > 0
      ? `EXISTING CLAIMS IN THIS INVESTIGATION (cite matchesExistingClaimId if a claim below ` +
        `restates one of these, otherwise omit it):\n` +
        existingClaims.map((c) => `- id="${c.claimId}": ${c.text}`).join('\n')
      : 'EXISTING CLAIMS IN THIS INVESTIGATION: none yet.';

  return (
    `Extract claims and evidence from the following sources for a problem-discovery investigation.\n\n` +
    `${existingClaimsBlock}\n\n` +
    `SOURCES:\n${sourcesBlock}\n\n` +
    `Instructions:\n` +
    `- Extract every EvidenceItem you find (facts, observations, interpretations, assumptions) and ` +
    `label each with exactly one of: fact, observation, interpretation, assumption, unknown. When ` +
    `you are not confident in a label, prefer "unknown" or "assumption" over guessing — never omit ` +
    `the label.\n` +
    `- Extract claims (assertions) supported by that evidence. Merge restatements of the same ` +
    `assertion into one claim (whether against an existing claim above or a new one within this ` +
    `same batch).\n` +
    `- For every claim, cite the evidence that relates to it via evidenceIndex, and record whether ` +
    `each cited piece of evidence supports, contradicts, or is merely neutral/contextual to that ` +
    `specific claim. Evidence contradicting a claim is just as important to record as evidence ` +
    `supporting it — never omit contradicting evidence.\n` +
    `- A claim with zero supporting evidence will be discarded downstream, so only include claims ` +
    `you can cite at least one piece of evidence for.\n` +
    `- Produce one problemStatements entry per specific, concrete problem the sources establish, ` +
    `each backed by supportingClaimIndices. If the sources are on-topic but too vague/general to ` +
    `establish any specific problem, return an empty problemStatements array — do not invent one.`
  );
}

/** Extraction & Clustering Engine + Evidence Labeler (Architecture §2 component table; Roadmap
 *  Slice 4). Reads an Investigation's reachable sources (via `getInvestigation`, using the
 *  `resolvedContent` Slice 3 persists), calls the LLM once via forced tool-use to extract
 *  evidence, cluster claims, and propose problem-statement candidates, then persists
 *  `Claim`/`ClaimVersion`/`EvidenceItem`/`ClaimVersionEvidence` transactionally.
 *
 *  Clustering/matching heuristic (spec leaves the exact algorithm to implementation judgment):
 *  the existing Claims already recorded for this Investigation (derived via the evidence-graph
 *  join above, since `Claim` carries no `investigationId` field) are listed in the prompt by id
 *  and text, and the model is asked to set `matchesExistingClaimId` when a newly-extracted claim
 *  restates one of them. This is LLM-based semantic clustering, not string/embedding similarity —
 *  chosen because DDR-0001 already establishes forced tool-use as the validated structured-output
 *  mechanism, and claim restatement ("same assertion, different wording") is exactly the kind of
 *  judgment a string-similarity heuristic handles poorly. A hallucinated `matchesExistingClaimId`
 *  (an id not in the listed set) is treated as "no match" — falls back to creating a new Claim —
 *  rather than aborting the whole extraction.
 *
 *  Fail-closed per-entity filtering (roadmap Slice 4 note, distinguishing this slice's specific
 *  instruction from Architecture §4's general "run fails" R-4 language): a claim resolving to zero
 *  valid evidence references is not persisted as a ClaimVersion at all; a problemStatements
 *  candidate resolving to zero valid supporting claims is dropped. If every candidate is dropped
 *  (or the model returned none), the whole extraction reports `generationFailed: true` —
 *  'problem-statement' is non-negatable (Q-2), so this is surfaced as a generation-failure signal
 *  for Slice 9, not a NegativeFinding.
 *
 *  F-2 fix — single-writer enforcement per Investigation: the existing-claims lookup used to run
 *  outside the transaction, so two concurrent extraction runs on the SAME Investigation could both
 *  read `latestVersionNumber = N` and both attempt to insert version `N+1`, racing on the
 *  `UNIQUE(claim_id, version_number)` constraint. Concurrent extraction runs on one Investigation
 *  are not a legitimate concurrent-write scenario by this app's design (extraction is triggered at
 *  one specific point in the flow, not something two simultaneous user actions can fan out into),
 *  so this is enforced as an explicit single-writer constraint: a `pg_advisory_xact_lock` keyed on
 *  `investigationId` is acquired as the first statement inside the transaction, so a second
 *  concurrent call blocks until the first commits/rolls back, and the lock is released
 *  automatically at transaction end (no separate unlock bookkeeping needed).
 *
 *  F-3 fix — comprehensive `generationFailed` conversion: any error that escapes the LLM call or
 *  the persistence transaction (DB errors, transient connection failures, unexpected exceptions —
 *  not just the two specific bugs this fixed) is caught by the outer try/catch below and converted
 *  to a `generationFailed` result rather than an unhandled throw, per the roadmap's fail-closed
 *  per-run semantics for Slice 9 to consume. */
export async function extractClaimsAndEvidence(investigationId: string): Promise<ExtractionResult> {
  const { sourceArtifacts } = await getInvestigation(investigationId);
  const usableSources = sourceArtifacts.filter(
    (s): s is typeof s & { resolvedContent: string } =>
      s.resolution.status === 'content-retrieved' && typeof s.resolvedContent === 'string',
  );

  if (usableSources.length === 0) {
    return {
      claimVersions: [],
      evidenceItems: [],
      problemStatementCandidates: [],
      generationFailed: true,
      generationFailureReason:
        'No source with retrieved content is available for this Investigation — extraction cannot run.',
    };
  }

  const knownSourceIds = new Set(usableSources.map((s) => s.id));

  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;

    // F-2: advisory lock scoped to this Investigation, held for the rest of this transaction and
    // released automatically at COMMIT/ROLLBACK. Serializes concurrent extraction runs against the
    // same Investigation rather than letting them race on the existing-claims read below.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [investigationId]);

    // Test-only seam (see __setF2RaceDelayForTests doc comment) — no-op unless a test installed a
    // delay. Widens the race window between lock acquisition and the existing-claims read below so
    // the F-2 regression test can deterministically force two concurrent calls to overlap here.
    const existingClaims = await getExistingClaimsForInvestigation(client, investigationId);
    const existingClaimIds = new Map(existingClaims.map((c) => [c.claimId, c]));

    let raw: RawExtraction;
    try {
      const result = await callForcedTool<RawExtraction>({
        systemPrompt:
          'You are the Extraction & Clustering Engine and Evidence Labeler for Department OS ' +
          'Problem Department. You extract evidence and claims from source material for a problem ' +
          'discovery investigation, strictly via the provided tool call — never respond in free text.',
        userPrompt: buildUserPrompt(usableSources, existingClaims),
        toolName: TOOL_NAME,
        toolDescription: 'Record extracted evidence items, clustered claims, and problem statement candidates.',
        inputSchema: INPUT_SCHEMA,
        validate: validateRawExtraction,
      });
      raw = result.value;
    } catch (err) {
      if (err instanceof LlmValidationError) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return {
          claimVersions: [],
          evidenceItems: [],
          problemStatementCandidates: [],
          generationFailed: true,
          generationFailureReason: `Extraction failed schema validation after bounded repair: ${err.message}`,
        };
      }
      throw err;
    }

    // Drop evidence items citing a source outside this Investigation's usable set — referential
    // integrity, not a literal-union/enum validity concern, so filtered here rather than causing a
    // whole-call repair (see validateRawExtraction's doc comment).
    const evidenceIndexValid: boolean[] = raw.evidenceItems.map((e) => knownSourceIds.has(e.sourceArtifactId));

    // Persist EvidenceItem rows up front (immutable, shared) — index-aligned with raw.evidenceItems
    // for claims below to resolve evidenceRefs against; invalid ones get a null id and are
    // filtered out wherever referenced.
    const evidenceItemIds: Array<string | null> = new Array(raw.evidenceItems.length).fill(null);
    const persistedEvidenceItems: EvidenceItem[] = [];
    for (let i = 0; i < raw.evidenceItems.length; i++) {
      if (!evidenceIndexValid[i]) continue;
      const e = raw.evidenceItems[i];
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label)
         VALUES ($1, $2, $3) RETURNING id`,
        [e.sourceArtifactId, e.excerptOrSummary, e.label],
      );
      evidenceItemIds[i] = inserted.rows[0].id;
      persistedEvidenceItems.push({
        id: inserted.rows[0].id,
        sourceArtifactId: e.sourceArtifactId,
        excerptOrSummary: e.excerptOrSummary,
        label: e.label as EvidenceLabel,
      });
    }

    // F-1: precedence used when the same resolved evidenceItemId is cited more than once within
    // one claim's evidenceRefs (see dedup below) — higher wins.
    const STANCE_PRECEDENCE: Record<Stance, number> = {
      contradicting: 2,
      supporting: 1,
      'neutral-context': 0,
    };

    // For each raw claim, resolve its evidenceRefs to persisted evidence_item ids + valid stance.
    // Claims resolving to zero valid refs are not persisted (roadmap Slice 4 fail-closed rule) —
    // claimVersionId[i] stays null and is skipped by problemStatements resolution below.
    const claimVersionResults: Array<{
      claimVersion: ClaimVersion;
    } | null> = [];

    for (let i = 0; i < raw.claims.length; i++) {
      const c = raw.claims[i];

      // F-1: `claim_version_evidence`'s PK is (claim_version_id, evidence_item_id) — the prompt
      // explicitly asks the model to record both supporting AND contradicting evidence, which can
      // naturally lead it to cite the same resolved evidenceItemId twice with different stances for
      // one claim, which would otherwise crash the insert below on a duplicate-key violation.
      // Resolution: dedupe to exactly one stance per (claimVersionId, evidenceItemId), keeping the
      // higher-precedence stance — 'contradicting' beats 'supporting' beats 'neutral-context',
      // since a contradiction is the more significant signal to preserve when the model gave
      // conflicting judgments about the same excerpt. This map IS the source persisted below AND
      // the source of the in-memory `evidence` array returned on `ClaimVersion` — the two can never
      // diverge (Architecture §3: the read-shape is "not a second source of truth").
      const dedupedRefsByEvidenceItemId = new Map<string, ClaimVersionEvidenceRef>();
      for (const ref of c.evidenceRefs) {
        const evidenceId = evidenceItemIds[ref.evidenceIndex];
        if (!evidenceId) continue; // out-of-range index or an invalid evidence item — dropped
        const stance = ref.stance as Stance;
        const current = dedupedRefsByEvidenceItemId.get(evidenceId);
        if (!current || STANCE_PRECEDENCE[stance] > STANCE_PRECEDENCE[current.stance as Stance]) {
          dedupedRefsByEvidenceItemId.set(evidenceId, {
            evidenceItemId: evidenceId,
            stance,
            relevanceNote: ref.relevanceNote,
          });
        }
      }
      const resolvedRefs = Array.from(dedupedRefsByEvidenceItemId.values());

      if (resolvedRefs.length === 0) {
        claimVersionResults.push(null);
        continue;
      }
      const evidence = resolvedRefs as NonEmptyArray<ClaimVersionEvidenceRef>;

      const existing =
        c.matchesExistingClaimId != null ? existingClaimIds.get(c.matchesExistingClaimId) : undefined;

      let claimId: string;
      let versionNumber: number;
      let supersedesVersionId: string | null;
      if (existing) {
        claimId = existing.claimId;
        versionNumber = existing.latestVersionNumber + 1;
        supersedesVersionId = existing.latestVersionId;
      } else {
        const claimInsert = await client.query<{ id: string; created_at: Date }>(
          `INSERT INTO claim DEFAULT VALUES RETURNING id, created_at`,
        );
        claimId = claimInsert.rows[0].id;
        versionNumber = 1;
        supersedesVersionId = null;
      }

      // Test-only seam (see __setF2RaceDelayForTests doc comment) — no-op unless a test installed a
      // delay. Widens the race window right before the write two concurrent calls can genuinely
      // collide on: `versionNumber` above was computed from the (possibly stale, pre-lock-fix)
      // in-memory `existingClaims` snapshot, so this is the exact point the F-2 regression test
      // needs both concurrent calls to reach at the same moment to reliably force the
      // `UNIQUE(claim_id, version_number)` collision the advisory lock exists to prevent.
      if (f2RaceDelayForTests) await f2RaceDelayForTests(client);

      const versionInsert = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO claim_version (claim_id, version_number, text, supersedes_version_id)
         VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
        [claimId, versionNumber, c.text, supersedesVersionId],
      );
      const claimVersionId = versionInsert.rows[0].id;

      for (const ref of evidence) {
        await client.query(
          `INSERT INTO claim_version_evidence (claim_version_id, evidence_item_id, stance, relevance_note)
           VALUES ($1, $2, $3, $4)`,
          [claimVersionId, ref.evidenceItemId, ref.stance, ref.relevanceNote ?? null],
        );
      }

      claimVersionResults.push({
        claimVersion: {
          id: claimVersionId,
          claimId,
          versionNumber,
          createdAt: versionInsert.rows[0].created_at.toISOString(),
          text: c.text,
          evidence,
          supersedesVersionId,
        },
      });

      // Keep the in-transaction "existing claims" view current so a later raw claim in this same
      // batch that also matches this same existing Claim id supersedes THIS new version, not the
      // stale pre-run one.
      if (existing) {
        existingClaimIds.set(claimId, {
          claimId,
          latestVersionId: claimVersionId,
          latestVersionNumber: versionNumber,
          text: c.text,
        });
      }
    }

    const persistedClaimVersions = claimVersionResults
      .filter((r): r is { claimVersion: ClaimVersion } => r !== null)
      .map((r) => r.claimVersion);

    // Resolve problemStatements candidates against the claims that actually got persisted.
    const problemStatementCandidates: ProblemStatementCandidate[] = [];
    for (const p of raw.problemStatements) {
      const supportingIds: string[] = [];
      for (const idx of p.supportingClaimIndices) {
        const resolved = claimVersionResults[idx];
        if (resolved) supportingIds.push(resolved.claimVersion.id);
      }
      if (supportingIds.length === 0) continue; // dropped — no surviving claim support
      problemStatementCandidates.push({
        whoExperiencesIt: p.whoExperiencesIt,
        contextOrWorkflow: p.contextOrWorkflow,
        consequenceOrFriction: p.consequenceOrFriction,
        supportingClaimVersionIds: supportingIds as NonEmptyArray<string>,
      });
    }

    // F-6: this COMMIT persists Claims/EvidenceItems even on the `generationFailed: true` path
    // below (zero surviving problem-statement candidates). That is deliberate, not a bug — per
    // Architecture §3, Claim/EvidenceItem are shared, Brief-independent entities, so a run that
    // fails to establish a specific problem statement should not discard the extraction/labeling
    // progress it DID make; only the `ProblemStatementCandidate` output is affected.
    await client.query('COMMIT');
    transactionOpen = false;

    if (problemStatementCandidates.length === 0) {
      return {
        claimVersions: persistedClaimVersions,
        evidenceItems: persistedEvidenceItems,
        problemStatementCandidates: [],
        generationFailed: true,
        generationFailureReason:
          'The Extraction & Clustering Engine could not establish any specific, evidence-supported ' +
          'problem statement from the reachable source material.',
      };
    }

    return {
      claimVersions: persistedClaimVersions,
      evidenceItems: persistedEvidenceItems,
      problemStatementCandidates,
      generationFailed: false,
    };
  } catch (err) {
    // F-3: convert ANY escaping error (DB errors, transient connection failures, unexpected
    // exceptions — not just F-1/F-2's specific bugs) into the `generationFailed` signal Slice 9
    // consumes, rather than an unhandled throw. The underlying error is captured in the reason, not
    // swallowed.
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => {
        // Best-effort — the connection may already be unusable (e.g. the error that got us here
        // WAS a connection failure). client.release() below still runs regardless.
      });
    }
    return {
      claimVersions: [],
      evidenceItems: [],
      problemStatementCandidates: [],
      generationFailed: true,
      generationFailureReason: `Extraction failed with an unexpected error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  } finally {
    client.release();
  }
}
