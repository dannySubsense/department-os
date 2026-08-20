import { pool } from '../db/pool.js';
import { DEPARTMENTS } from '../config/departments.js';
import { LAST_ACTIVITY_SUBQUERY } from './lastActivity.js';
import type {
  ProblemDepartmentOverview,
  InvestigationSummary,
  GenerationRunSummary,
} from '../types/readModels.js';
import type { InvestigationStatus } from '../types/domain.js';

interface InvestigationRow {
  id: string;
  status: InvestigationStatus;
  status_reason: string | null;
  created_at: Date;
  last_activity_at: Date;
}

interface GenerationRunRow {
  id: string;
  investigation_id: string;
  runtime_identifier: string;
  outcome: 'in-progress' | 'succeeded' | 'failed';
  started_at: Date;
  completed_at: Date | null;
}

function mapInvestigationRow(row: InvestigationRow): InvestigationSummary {
  return {
    id: row.id,
    status: row.status,
    statusReason: row.status_reason ?? undefined,
    createdAt: row.created_at.toISOString(),
    lastActivityAt: row.last_activity_at.toISOString(),
  };
}

function mapGenerationRunRow(row: GenerationRunRow): GenerationRunSummary {
  return {
    generationRunId: row.id,
    investigationId: row.investigation_id,
    runtimeIdentifier: row.runtime_identifier,
    outcome: row.outcome,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

/** Assembles `ProblemDepartmentOverview` — Architecture §5.3. Every array/count degrades honestly
 *  to `[]`/`0` on an empty database; the API never special-cases "empty" into a different shape
 *  (the React screen renders the explicit empty state client-side). */
export async function getProblemDepartmentOverview(): Promise<ProblemDepartmentOverview> {
  const department = DEPARTMENTS.find((d) => d.id === 'problem-department');
  if (!department) {
    throw new Error(
      "getProblemDepartmentOverview: 'problem-department' not found in DEPARTMENTS registry",
    );
  }

  const investigationsResult = await pool.query<InvestigationRow>(
    `SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
       FROM investigation i
       JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
      ORDER BY i.created_at ASC, i.id ASC`,
  );

  const lastActiveResult = await pool.query<{ id: string }>(
    `SELECT i.id
       FROM investigation i
       JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
      ORDER BY la.last_activity_at DESC, i.id ASC
      LIMIT 1`,
  );

  const sourceCountResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM source_artifact`,
  );

  const evidenceCountResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM evidence_item`,
  );

  const recentRunsResult = await pool.query<GenerationRunRow>(
    `SELECT id, investigation_id, runtime_identifier, outcome, started_at, completed_at
       FROM generation_run
      ORDER BY started_at DESC, id ASC`,
  );

  return {
    department,
    investigations: investigationsResult.rows.map(mapInvestigationRow),
    lastActiveInvestigationId: lastActiveResult.rows[0]?.id ?? null,
    sourceCount: sourceCountResult.rows[0]?.count ?? 0,
    evidenceCount: evidenceCountResult.rows[0]?.count ?? 0,
    recentRuns: recentRunsResult.rows.map(mapGenerationRunRow),
  };
}
