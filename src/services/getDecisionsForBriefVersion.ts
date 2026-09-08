import { pool } from '../db/pool.js';
import type { RecommendationDecision, ReconsiderationConditionType } from '../types/domain.js';

/** Revised — returns resolved reconsideration-condition CONTENT, never a bare
 *  ReconsiderationCondition id — the persisted Decision domain type (§3.4) stores
 *  `reconsiderationConditionIds: string[]` (correctly normalized), but every READ surface this
 *  sprint exposes (this function, and therefore both getInvestigationWorkspace's
 *  `decisionLineage` and getBriefForReview's `priorDecisions`) must resolve those ids to their
 *  actual `type`/`otherTypeLabel`/`description` before returning — the UI never receives an id it
 *  would have to render opaquely or resolve itself (02-ARCHITECTURE.md §4.5). */
export interface DecisionWithResolvedConditions {
  id: string;
  briefVersionId: string;
  decision: RecommendationDecision;
  decidedAt: string;
  rationale?: string;
  reconsiderationConditions: Array<{
    type: ReconsiderationConditionType;
    otherTypeLabel?: string;
    description: string;
  }>;
}

interface DecisionWithConditionsRow {
  id: string;
  brief_version_id: string;
  decision: RecommendationDecision;
  decided_at: Date;
  rationale: string | null;
  reconsideration_conditions: Array<{
    type: ReconsiderationConditionType;
    other_type_label: string | null;
    description: string;
  }> | null;
}

/** `getDecisionsForBriefVersion` — 02-ARCHITECTURE.md §4.5. Ordered `decided_at` ASC. LEFT JOINs
 *  `reconsideration_condition` (aggregated per `decision_id` via `json_agg`, one query, not N+1)
 *  and maps each row's `type`/`other_type_label`/`description` straight through — no id-only
 *  intermediate shape is constructed or returned by this function. */
export async function getDecisionsForBriefVersion(
  briefVersionId: string,
): Promise<DecisionWithResolvedConditions[]> {
  const result = await pool.query<DecisionWithConditionsRow>(
    `SELECT d.id, d.brief_version_id, d.decision, d.decided_at, d.rationale,
            (
              SELECT json_agg(
                       json_build_object(
                         'type', rc.type,
                         'other_type_label', rc.other_type_label,
                         'description', rc.description
                       )
                     )
                FROM reconsideration_condition rc
               WHERE rc.decision_id = d.id
            ) AS reconsideration_conditions
       FROM decision d
      WHERE d.brief_version_id = $1
      ORDER BY d.decided_at ASC`,
    [briefVersionId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    briefVersionId: row.brief_version_id,
    decision: row.decision,
    decidedAt: row.decided_at.toISOString(),
    rationale: row.rationale ?? undefined,
    reconsiderationConditions: (row.reconsideration_conditions ?? []).map((c) => ({
      type: c.type,
      otherTypeLabel: c.other_type_label ?? undefined,
      description: c.description,
    })),
  }));
}
