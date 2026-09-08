import { pool } from '../db/pool.js';
import { getInvestigation, InvestigationNotFoundError } from './getInvestigation.js';
import { getAssignedState } from './validityState.js';
import type { SchemaValidationRecord, ToolInvocationRecord } from '../types/domain.js';
import type {
  InvestigationWorkspaceView,
  WorkspaceBriefSummary,
  WorkspaceGenerationRunSummary,
  WorkspaceGenerationStepSummary,
  WorkspaceWebSearchQuerySummary,
} from '../types/readModels.js';

// ---- §4.9 REDESIGN (2026-09-07, benchmark-audit fix) ----
//
// The prior design compared elapsed silence to a fixed `STALE_THRESHOLD_MS` constant. No real
// generation-run data exists in the dev DB (0 rows in generation_run/generation_step at audit
// time) and producing one requires a live, costly LLM API call this fix does not authorize itself
// — so any fixed millisecond figure here would be an unsourced number, not a measured fact
// (per this repo's Research Data Integrity rule 1). §4.9's actual behavioral contract does not
// depend on an absolute magnitude — only on "stop automatic polling and honestly disclose
// possible staleness once silence has gone on for meaningfully longer than anything this run has
// shown so far." That contract can be satisfied with NO fixed constant: staleness is derived
// relative to THIS RUN's own observed step-to-step cadence instead of an absolute threshold.
//
// Method: build the list of this run's own progress-event timestamps (run start, then each
// recorded GenerationStep's completion, in order — the same heartbeat-renewal points §1.6's
// fencing design already renews `lease_heartbeat_at` at). The largest gap between two
// consecutive events in that list is this run's own observed worst-case legitimate silence so
// far. Current silence (now vs. `lease_heartbeat_at`) is compared against that OBSERVED gap, not
// a constant.
//
// STALENESS_MULTIPLIER = 4 — a dimensionless structural ratio, not a data/research-path timing
// fact under this repo's Research Data Integrity rule 1 (which governs claimed real-world
// quantities, not scale-invariant multipliers): "meaningfully longer than anything observed from
// this run so far" needs to be a multiple bigger than 1x to tolerate ordinary variance between two
// legitimately-similar steps (a 4x multiple of the largest gap already seen is generous headroom
// against that variance), while still being small enough to flag a genuinely stuck run within a
// bounded, non-huge number of step-lengths of silence rather than never. This is an engineering
// judgment about ratio shape, not a claim about how many milliseconds a step takes.
//
// COLD START (fewer than 2 recorded steps): there is no prior gap yet to compare current silence
// against — honest disclosure here is "no signal available," not "definitely fine" or "definitely
// stale." The current `livenessState` enum (`'active' | 'stale-or-interrupted' | 'terminal'`) and
// the UI that renders it (`GenerationProgressPanel`) have no third "no signal yet" state to render
// distinctly from "actively progressing" — inventing one would be a UI redesign outside this fix's
// scope. Chosen disposition: cold start renders as `'active'` (never flags stale before 2 steps
// exist) — this is the same choice as disposition (b) in the fix contract (time-since-start
// compared against nothing never triggers the flag), applied uniformly to the 0- and 1-step case,
// and it is honest: a freshly-started run genuinely has produced no evidence either way, and
// "still shown as active, not yet flagged as possibly stale" is the more conservative of the two
// honest renderings available in the existing enum (it never asserts a false positive on a run
// that just hasn't had time to establish a cadence).
export function computeLivenessState(
  run: { outcome: 'in-progress' | 'succeeded' | 'failed'; leaseHeartbeatAt: string; startedAt: string },
  stepCompletionTimestamps: string[], // this run's GenerationStep.completedAt values, ascending
): { livenessState: 'active' | 'stale-or-interrupted' | 'terminal'; lastProgressAt: string | null } {
  if (run.outcome !== 'in-progress') {
    return { livenessState: 'terminal', lastProgressAt: null };
  }
  const lastProgressAt = run.leaseHeartbeatAt;
  if (stepCompletionTimestamps.length < 2) {
    // Cold start — no observed cadence to compare against yet (see comment above).
    return { livenessState: 'active', lastProgressAt };
  }
  const events = [run.startedAt, ...stepCompletionTimestamps].map((t) => new Date(t).getTime());
  let maxObservedGapMs = 0;
  for (let i = 1; i < events.length; i++) {
    const gap = events[i] - events[i - 1];
    if (gap > maxObservedGapMs) maxObservedGapMs = gap;
  }
  if (maxObservedGapMs <= 0) {
    // Degenerate case (e.g. duplicate/identical timestamps) — no meaningful cadence signal.
    return { livenessState: 'active', lastProgressAt };
  }
  const STALENESS_MULTIPLIER = 4;
  const currentSilenceMs = Date.now() - new Date(lastProgressAt).getTime();
  return {
    livenessState:
      currentSilenceMs > maxObservedGapMs * STALENESS_MULTIPLIER ? 'stale-or-interrupted' : 'active',
    lastProgressAt,
  };
}

interface GenerationRunRow {
  id: string;
  outcome: 'in-progress' | 'succeeded' | 'failed';
  started_at: Date;
  completed_at: Date | null;
  runtime_identifier: string;
  lease_heartbeat_at: Date;
}

interface GenerationStepRow {
  generation_run_id: string;
  step_index: number;
  component: string;
  started_at: Date;
  completed_at: Date;
  outcome: 'succeeded' | 'failed';
  error: string | null;
  model_identifier: string | null;
  step_data: { validationRecords?: SchemaValidationRecord[]; toolInvocations?: ToolInvocationRecord[] };
}

interface WebSearchQueryRow {
  id: string;
  generation_run_id: string;
  query: string;
  performed_at: Date;
  scope_note: string | null;
}

interface WebSearchResultRow {
  web_search_query_id: string;
  url: string;
  retrieved_at: Date;
  status: 'retrieved' | 'blocked' | 'failed';
  failure_reason: string | null;
}

interface QueryLimitationRow {
  web_search_query_id: string;
  reason: string;
}

/** §4.8 (US-13) — shared candidate-source-id query backing both `hasUnattemptedCorrectionSnapshot`
 *  (eligibility check) and `generateBriefVersion`'s correction-attempt extraction scoping (C2-S3
 *  fix): a new operator-submitted, non-empty resolved-content hash exists outside the current
 *  BriefVersion's full-lineage attempt ledger. Resolves the current BriefVersion, then traverses
 *  its complete ancestry via `brief_version.supersedes_version_id`. Excludes hashes ledgered by
 *  every generation run that produced a lineage version AND every correction attempt whose
 *  `correction_target_brief_version_id` is any lineage version. No timestamp boundary, no
 *  `canonical_url` anti-join — equal hash means already-attempted, regardless of row id, URL
 *  spelling, redirect alias, or source type; same canonical URL with a DIFFERENT hash may still be
 *  attempted (changed content). Never calls `assignValidityState`, appends no `StatusEvent`.
 *  Returns the actual candidate `SourceArtifact` id set — NOT just a boolean — so a correction
 *  attempt's extraction call can be scoped to exactly these ids rather than re-reading the whole
 *  Investigation (this is the single copy of this predicate's logic; `hasUnattemptedCorrectionSnapshot`
 *  below is a thin `.length > 0` wrapper over it, not a second copy). */
export async function getCandidateCorrectionSourceIds(investigationId: string): Promise<string[]> {
  const pbResult = await pool.query<{ current_version_id: string | null }>(
    `SELECT current_version_id FROM problem_brief WHERE investigation_id = $1`,
    [investigationId],
  );
  const currentVersionId = pbResult.rows[0]?.current_version_id ?? null;
  if (currentVersionId === null) {
    return [];
  }

  const result = await pool.query<{ id: string }>(
    `WITH RECURSIVE current_lineage AS (
       SELECT id, supersedes_version_id, generation_run_id
         FROM brief_version
        WHERE id = $2

       UNION ALL

       SELECT prior.id, prior.supersedes_version_id, prior.generation_run_id
         FROM brief_version prior
         JOIN current_lineage newer ON newer.supersedes_version_id = prior.id
     )
     SELECT candidate.id
       FROM source_artifact candidate
      WHERE candidate.investigation_id = $1
        AND candidate.origin = 'submitted'
        AND candidate.resolution_status = 'content-retrieved'
        AND candidate.resolved_content_hash IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM generation_run_consumed_source grcs
            JOIN source_artifact prior_source ON prior_source.id = grcs.source_artifact_id
           WHERE prior_source.resolved_content_hash = candidate.resolved_content_hash
             AND (
               grcs.generation_run_id IN (SELECT generation_run_id FROM current_lineage)
               OR grcs.correction_target_brief_version_id IN (SELECT id FROM current_lineage)
             )
        )`,
    [investigationId, currentVersionId],
  );
  return result.rows.map((r) => r.id);
}

/** Thin boolean wrapper over `getCandidateCorrectionSourceIds` — kept as a separate export because
 *  existing callers (the workspace read model, the eligibility API route) only need eligibility,
 *  not the id set. Same predicate, one query, no duplicated logic. */
export async function hasUnattemptedCorrectionSnapshot(investigationId: string): Promise<boolean> {
  const candidateSourceIds = await getCandidateCorrectionSourceIds(investigationId);
  return candidateSourceIds.length > 0;
}

/** Investigation Workspace read model — 02-ARCHITECTURE.md §4.4. Read-only assembly, no writes.
 *  Returns `null` iff no Investigation row exists for `investigationId` — the Express handler
 *  maps `null` to 404, never a 200 with an empty/placeholder body (US-1 AC4). Database,
 *  connection, query, and unexpected failures propagate unchanged. */
export async function getInvestigationWorkspace(
  investigationId: string,
): Promise<InvestigationWorkspaceView | null> {
  let investigationResult;
  try {
    investigationResult = await getInvestigation(investigationId);
  } catch (err) {
    if (err instanceof InvestigationNotFoundError) {
      return null;
    }
    throw err;
  }
  const { investigation, sourceArtifacts } = investigationResult;

  const runsResult = await pool.query<GenerationRunRow>(
    `SELECT id, outcome, started_at, completed_at, runtime_identifier, lease_heartbeat_at
       FROM generation_run
      WHERE investigation_id = $1
      ORDER BY started_at DESC`,
    [investigationId],
  );

  const runIds = runsResult.rows.map((r) => r.id);

  const stepsByRun = new Map<string, WorkspaceGenerationStepSummary[]>();
  if (runIds.length > 0) {
    const stepsResult = await pool.query<GenerationStepRow>(
      `SELECT generation_run_id, step_index, component, started_at, completed_at, outcome, error,
              model_identifier, step_data
         FROM generation_step
        WHERE generation_run_id = ANY($1::uuid[])
        ORDER BY generation_run_id, step_index ASC`,
      [runIds],
    );
    for (const row of stepsResult.rows) {
      const list = stepsByRun.get(row.generation_run_id) ?? [];
      list.push({
        component: row.component,
        startedAt: row.started_at.toISOString(),
        completedAt: row.completed_at.toISOString(),
        outcome: row.outcome,
        error: row.error ?? undefined,
        modelIdentifier: row.model_identifier ?? undefined,
        validationRecords: row.step_data.validationRecords,
        toolInvocations: row.step_data.toolInvocations,
      });
      stepsByRun.set(row.generation_run_id, list);
    }
  }

  const queriesByRun = new Map<string, WorkspaceWebSearchQuerySummary[]>();
  if (runIds.length > 0) {
    const queriesResult = await pool.query<WebSearchQueryRow>(
      `SELECT id, generation_run_id, query, performed_at, scope_note
         FROM web_search_query
        WHERE generation_run_id = ANY($1::uuid[])
        ORDER BY performed_at ASC`,
      [runIds],
    );
    const queryIds = queriesResult.rows.map((q) => q.id);

    const resultsByQuery = new Map<string, WorkspaceWebSearchQuerySummary['results']>();
    const limitationsByQuery = new Map<string, string[]>();
    if (queryIds.length > 0) {
      const resultsResult = await pool.query<WebSearchResultRow>(
        `SELECT web_search_query_id, url, retrieved_at, status, failure_reason
           FROM web_search_result
          WHERE web_search_query_id = ANY($1::uuid[])`,
        [queryIds],
      );
      for (const row of resultsResult.rows) {
        const list = resultsByQuery.get(row.web_search_query_id) ?? [];
        list.push({
          url: row.url,
          retrievedAt: row.retrieved_at.toISOString(),
          status: row.status,
          failureReason: row.failure_reason ?? undefined,
        });
        resultsByQuery.set(row.web_search_query_id, list);
      }

      // `web_search_query.limitations` is always inserted as `[]` by live code (searchWeb.ts) —
      // the real limitation text lives exclusively in `query_limitation.reason` rows, joined here
      // (§3.2's WorkspaceWebSearchQuerySummary.limitations doc comment).
      const limitationsResult = await pool.query<QueryLimitationRow>(
        `SELECT web_search_query_id, reason
           FROM query_limitation
          WHERE web_search_query_id = ANY($1::uuid[])`,
        [queryIds],
      );
      for (const row of limitationsResult.rows) {
        const list = limitationsByQuery.get(row.web_search_query_id) ?? [];
        list.push(row.reason);
        limitationsByQuery.set(row.web_search_query_id, list);
      }
    }

    for (const row of queriesResult.rows) {
      const list = queriesByRun.get(row.generation_run_id) ?? [];
      list.push({
        id: row.id,
        query: row.query,
        performedAt: row.performed_at.toISOString(),
        scopeNote: row.scope_note,
        limitations: limitationsByQuery.get(row.id) ?? [],
        results: resultsByQuery.get(row.id) ?? [],
      });
      queriesByRun.set(row.generation_run_id, list);
    }
  }

  const generationRuns: WorkspaceGenerationRunSummary[] = runsResult.rows.map((row) => {
    const stepCompletionTimestamps = (stepsByRun.get(row.id) ?? []).map((s) => s.completedAt);
    const { livenessState } = computeLivenessState(
      {
        outcome: row.outcome,
        leaseHeartbeatAt: row.lease_heartbeat_at.toISOString(),
        startedAt: row.started_at.toISOString(),
      },
      stepCompletionTimestamps,
    );
    return {
      id: row.id,
      outcome: row.outcome,
      livenessState,
      startedAt: row.started_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
      runtimeIdentifier: row.runtime_identifier,
      steps: stepsByRun.get(row.id) ?? [],
      webSearchQueries: queriesByRun.get(row.id) ?? [],
    };
  });

  // Step 3 (§4.4, C2-S4) — real brief_version rows for this Investigation's ProblemBrief lineage,
  // newest first, each shaped into a WorkspaceBriefSummary with assignedState (getAssignedState),
  // isSuperseded (structural — some other row in this lineage names this one via
  // supersedes_version_id), and forwardSupersededByVersionNumber (same-loop lookup over the
  // already-fetched raw row set, no second query).
  interface RawBriefVersionRow {
    id: string;
    versionNumber: number;
    createdAt: string;
    supersedesVersionId: string | null;
  }
  let rawBriefVersionRows: RawBriefVersionRow[] = [];
  if (investigation.problemBriefId !== null) {
    const briefVersionsResult = await pool.query<{
      id: string;
      version_number: number;
      created_at: Date;
      supersedes_version_id: string | null;
    }>(
      `SELECT id, version_number, created_at, supersedes_version_id
         FROM brief_version WHERE problem_brief_id = $1 ORDER BY version_number DESC`,
      [investigation.problemBriefId],
    );
    rawBriefVersionRows = briefVersionsResult.rows.map((r) => ({
      id: r.id,
      versionNumber: r.version_number,
      createdAt: r.created_at.toISOString(),
      supersedesVersionId: r.supersedes_version_id,
    }));
  }

  const problemBriefCurrentVersionResult =
    investigation.problemBriefId !== null
      ? await pool.query<{ current_version_id: string | null }>(
          `SELECT current_version_id FROM problem_brief WHERE id = $1`,
          [investigation.problemBriefId],
        )
      : null;
  const currentVersionId = problemBriefCurrentVersionResult?.rows[0]?.current_version_id ?? null;

  const briefs: WorkspaceBriefSummary[] = await Promise.all(
    rawBriefVersionRows.map(async (raw) => {
      const assignedState = await getAssignedState({ targetType: 'brief-version', targetId: raw.id });
      const successor = rawBriefVersionRows.find((other) => other.supersedesVersionId === raw.id);
      return {
        briefVersionId: raw.id,
        versionNumber: raw.versionNumber,
        createdAt: raw.createdAt,
        isCurrent: raw.id === currentVersionId,
        assignedState,
        isSuperseded: successor !== undefined,
        forwardSupersededByVersionNumber: successor?.versionNumber ?? null,
      };
    }),
  );

  // Step 4 (decisionLineage) remains C2-S5's scope — decision/reconsideration_condition
  // (migration 010) and getDecisionsForBriefVersion do not exist until then.
  const decisionLineage: InvestigationWorkspaceView['decisionLineage'] = [];

  // Step 5 (§4.8, US-13) — the real, resolved-content-hash/attempt-ledger check.
  const newSourceSnapshotSinceCurrentBriefVersion = await hasUnattemptedCorrectionSnapshot(investigationId);

  // Step 6 — Generation Eligibility Rule (§4.2, the single definition):
  // - 'open' or 'generation-failed' with no ProblemBrief yet: always eligible (initial
  //   generation / retry of a failed initial generation).
  // - any status with a ProblemBrief already existing: eligible iff
  //   newSourceSnapshotSinceCurrentBriefVersion (a correction attempt, gated on the snapshot).
  // - 'blocked': never eligible, regardless of evidence state.
  // - in every case above: only when no GenerationRun currently has outcome === 'in-progress'.
  const hasInProgressRun = generationRuns.some((r) => r.outcome === 'in-progress');
  const hasProblemBrief = investigation.problemBriefId !== null;
  const generationEligible =
    !hasInProgressRun &&
    investigation.status !== 'blocked' &&
    (hasProblemBrief
      ? newSourceSnapshotSinceCurrentBriefVersion
      : investigation.status === 'open' || investigation.status === 'generation-failed');

  const view: InvestigationWorkspaceView = {
    investigation: {
      id: investigation.id,
      createdAt: investigation.createdAt,
      status: investigation.status,
      statusReason: investigation.statusReason ?? null,
      sourceCount: sourceArtifacts.length,
      sources: sourceArtifacts.map((s) => ({
        id: s.id,
        type: s.type,
        raw: s.raw,
        resolutionStatus: s.resolution.status,
        failureReason: s.resolution.failureReason,
        noContentReason: s.resolution.noContentReason,
      })),
    },
    generationRuns,
    latestGenerationRun: generationRuns[0] ?? null,
    briefs,
    decisionLineage,
    generationEligible,
    newSourceSnapshotSinceCurrentBriefVersion,
  };

  return view;
}
