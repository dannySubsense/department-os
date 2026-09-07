import { pool } from '../db/pool.js';
import { DEPARTMENTS } from '../config/departments.js';
import { LAST_ACTIVITY_SUBQUERY } from './lastActivity.js';
import type {
  MissionControlView,
  InvestigationSummary,
  GenerationRunSummary,
  BriefSummary,
  EvidenceSummary,
} from '../types/readModels.js';
import type { InvestigationStatus, RecommendationDecision, EvidenceLabel } from '../types/domain.js';

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

interface BriefVersionRow {
  id: string;
  investigation_id: string;
  version_number: number;
  created_at: Date;
  recommendation: { decision: RecommendationDecision };
}

interface EvidenceRow {
  id: string;
  investigation_id: string;
  label: EvidenceLabel;
  excerpt_or_summary: string;
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

/** Assembles `MissionControlView` from independent queries — Architecture §5.3. Every array
 *  degrades honestly to `[]` on an empty database; never fabricated data (§5.1). */
export async function getMissionControlView(): Promise<MissionControlView> {
  // 1. problemDepartment.investigationCount
  const investigationCountResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM investigation`,
  );

  // 2. activeWork.active
  const activeResult = await pool.query<InvestigationRow>(
    `SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
       FROM investigation i
       JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
      WHERE EXISTS (
          SELECT 1 FROM generation_run gr
           WHERE gr.investigation_id = i.id AND gr.outcome = 'in-progress'
        )
      ORDER BY la.last_activity_at DESC, i.id ASC`,
  );

  // 3. activeWork.readyNotStarted
  const readyNotStartedResult = await pool.query<InvestigationRow>(
    `SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
       FROM investigation i
       JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
      WHERE i.status = 'open'
        AND NOT EXISTS (SELECT 1 FROM generation_run gr WHERE gr.investigation_id = i.id)
      ORDER BY la.last_activity_at DESC, i.id ASC`,
  );

  // 4. activeWork.needsAttention
  const needsAttentionResult = await pool.query<InvestigationRow>(
    `SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
       FROM investigation i
       JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
      WHERE i.status IN ('blocked', 'generation-failed')
        AND NOT EXISTS (
          SELECT 1 FROM generation_run gr
           WHERE gr.investigation_id = i.id AND gr.outcome = 'in-progress'
        )
      ORDER BY la.last_activity_at DESC, i.id ASC`,
  );

  // 5. activeWork.recentCompleted (corrected — excludes blocked/generation-failed explicitly)
  const recentCompletedResult = await pool.query<InvestigationRow>(
    `SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
       FROM investigation i
       JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
      WHERE i.status NOT IN ('blocked', 'generation-failed')
        AND NOT EXISTS (
          SELECT 1 FROM generation_run gr
           WHERE gr.investigation_id = i.id AND gr.outcome = 'in-progress'
        )
        AND (
          i.status = 'brief-generated'
          OR EXISTS (
            SELECT 1 FROM generation_run gr2
             WHERE gr2.investigation_id = i.id AND gr2.outcome <> 'in-progress'
          )
        )
      ORDER BY la.last_activity_at DESC, i.id ASC`,
  );

  // 6. activeActivity
  const activeActivityResult = await pool.query<GenerationRunRow>(
    `SELECT id, investigation_id, runtime_identifier, outcome, started_at, completed_at
       FROM generation_run
      WHERE outcome = 'in-progress'
      ORDER BY started_at DESC, id ASC`,
  );

  // 7. recent.investigations
  const recentInvestigationsResult = await pool.query<InvestigationRow>(
    `SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
       FROM investigation i
       JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
      ORDER BY la.last_activity_at DESC, i.id ASC`,
  );

  // 8. recent.briefs
  const recentBriefsResult = await pool.query<BriefVersionRow>(
    `SELECT bv.id, pb.investigation_id, bv.version_number, bv.created_at, bv.recommendation
       FROM brief_version bv
       JOIN problem_brief pb ON pb.id = bv.problem_brief_id
      ORDER BY bv.created_at DESC, bv.id ASC`,
  );

  // 9. recent.evidence
  const recentEvidenceResult = await pool.query<EvidenceRow>(
    `SELECT e.id, sa.investigation_id, e.label, e.excerpt_or_summary
       FROM evidence_item e
       JOIN source_artifact sa ON sa.id = e.source_artifact_id
      ORDER BY e.created_at DESC NULLS LAST, e.id ASC`,
  );

  const recent: {
    investigations: InvestigationSummary[];
    briefs: BriefSummary[];
    evidence: EvidenceSummary[];
  } = {
    investigations: recentInvestigationsResult.rows.map(mapInvestigationRow),
    briefs: recentBriefsResult.rows.map((row) => ({
      briefVersionId: row.id,
      investigationId: row.investigation_id,
      versionNumber: row.version_number,
      createdAt: row.created_at.toISOString(),
      recommendationDecision: row.recommendation.decision,
    })),
    evidence: recentEvidenceResult.rows.map((row) => ({
      evidenceItemId: row.id,
      investigationId: row.investigation_id,
      label: row.label,
      excerptOrSummary: row.excerpt_or_summary,
    })),
  };

  const activeWork = {
    active: activeResult.rows.map(mapInvestigationRow),
    readyNotStarted: readyNotStartedResult.rows.map(mapInvestigationRow),
    needsAttention: needsAttentionResult.rows.map(mapInvestigationRow),
    recentCompleted: recentCompletedResult.rows.map(mapInvestigationRow),
  };

  const problemDepartmentConfig = DEPARTMENTS.find((d) => d.id === 'problem-department');
  if (!problemDepartmentConfig) {
    throw new Error("getMissionControlView: 'problem-department' not found in DEPARTMENTS registry");
  }

  return {
    problemDepartment: {
      id: problemDepartmentConfig.id,
      name: problemDepartmentConfig.name,
      thesis: problemDepartmentConfig.thesis,
      investigationCount: investigationCountResult.rows[0]?.count ?? 0,
      activeCount: activeWork.active.length,
      needsAttentionCount: activeWork.needsAttention.length,
      recentCompletedCount: activeWork.recentCompleted.length,
    },
    activeWork,
    activeActivity: activeActivityResult.rows.map(mapGenerationRunRow),
    recent,
  };
}
