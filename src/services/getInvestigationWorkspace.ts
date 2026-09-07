import { pool } from '../db/pool.js';
import { getInvestigation, InvestigationNotFoundError } from './getInvestigation.js';
import type { SchemaValidationRecord, ToolInvocationRecord } from '../types/domain.js';
import type {
  InvestigationWorkspaceView,
  WorkspaceGenerationRunSummary,
  WorkspaceGenerationStepSummary,
  WorkspaceWebSearchQuerySummary,
} from '../types/readModels.js';

/** Stale/Interrupted Run Detection (02-ARCHITECTURE.md §4.9). Computed at read time, never a
 *  stored column — `staleThresholdMs` is a PARAMETER, not a closed-over module constant, so this
 *  slice can build and unit-test this function's pure branching logic against an arbitrary
 *  injected value before the real, engineering-derived `STALE_THRESHOLD_MS` exists (C2-S3's own
 *  scope — wiring the real constant into this function's one call site below). */
export function computeLivenessState(
  run: { outcome: 'in-progress' | 'succeeded' | 'failed'; leaseHeartbeatAt: string },
  staleThresholdMs: number,
): { livenessState: 'active' | 'stale-or-interrupted' | 'terminal'; lastProgressAt: string | null } {
  if (run.outcome !== 'in-progress') {
    return { livenessState: 'terminal', lastProgressAt: null };
  }
  const lastProgressAt = run.leaseHeartbeatAt;
  const elapsedMs = Date.now() - new Date(lastProgressAt).getTime();
  return {
    livenessState: elapsedMs > staleThresholdMs ? 'stale-or-interrupted' : 'active',
    lastProgressAt,
  };
}

// test-only threshold, not STALE_THRESHOLD_MS — see 02-ARCHITECTURE.md §4.9. C2-S3 wires the
// real, engineering-derived constant (measured from real generation timing) into this call site;
// this slice's own Done-When does not require that derivation to exist yet.
const PLACEHOLDER_STALE_THRESHOLD_MS = 5 * 60 * 1000;

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
    const { livenessState } = computeLivenessState(
      { outcome: row.outcome, leaseHeartbeatAt: row.lease_heartbeat_at.toISOString() },
      PLACEHOLDER_STALE_THRESHOLD_MS,
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

  // Steps 3-4 (briefs/decisions) — no ProblemBrief/Decision row can exist yet in this slice.
  const briefs: InvestigationWorkspaceView['briefs'] = [];
  const decisionLineage: InvestigationWorkspaceView['decisionLineage'] = [];

  // Step 5 (§4.8, US-13) — hasUnattemptedCorrectionSnapshot is C2-S3's own scope; honestly false
  // until that mechanism exists.
  const newSourceSnapshotSinceCurrentBriefVersion = false;

  // Step 6 — Generation Eligibility Rule (§4.2), for this slice's reachable statuses ('open',
  // 'blocked'): status === 'open' AND no run has outcome === 'in-progress'.
  const hasInProgressRun = generationRuns.some((r) => r.outcome === 'in-progress');
  const generationEligible = investigation.status === 'open' && !hasInProgressRun;

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
