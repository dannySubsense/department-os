import { pool } from '../db/pool.js';
import type { Decision, RecommendationDecision, ReconsiderationConditionType } from '../types/domain.js';

/** Thrown when zero non-whitespace-only reconsideration conditions were supplied for a
 *  `decision === 'Watch'` request (02-ARCHITECTURE.md §4.3). No `Decision`/
 *  `ReconsiderationCondition` row is persisted — the transaction is rolled back before this is
 *  thrown. */
export class WatchRequiresConditionError extends Error {}

/** Thrown when `briefVersionId` does not resolve to an existing `brief_version` row
 *  (SOL-MEDIUM-5 fix, §4.3). No `Decision`/`ReconsiderationCondition` row is persisted — the
 *  transaction is rolled back before this is thrown. Checked BEFORE the Watch ≥1-condition rule,
 *  so a request carrying both defects reports this error, never `WatchRequiresConditionError`. */
export class BriefVersionNotFoundError extends Error {
  constructor(public readonly briefVersionId: string) {
    super(`recordDecision: brief version ${briefVersionId} does not exist`);
    this.name = 'BriefVersionNotFoundError';
  }
}

export interface RecordDecisionInput {
  briefVersionId: string;
  decision: RecommendationDecision;
  rationale?: string;
  reconsiderationConditions?: Array<{
    type: ReconsiderationConditionType;
    otherTypeLabel?: string;
    description: string;
  }>;
}

interface DecisionRow {
  id: string;
  brief_version_id: string;
  decision: RecommendationDecision;
  decided_at: Date;
  rationale: string | null;
}

/** `recordDecision` — 02-ARCHITECTURE.md §4.3. Route-level body-shape validation (malformed JSON,
 *  wrong field types) happens BEFORE this function is ever called, as a distinct 400 case,
 *  entirely outside any transaction. This function itself: (1) opens its transaction first; (2)
 *  inside that same open transaction, checks `briefVersionId` existence BEFORE evaluating
 *  `decision`/`reconsiderationConditions` at all — a miss throws `BriefVersionNotFoundError`,
 *  zero writes; (3) only once existence passes, evaluates the Watch ≥1-non-whitespace-condition
 *  rule, still inside the same open transaction — a miss throws `WatchRequiresConditionError`,
 *  zero writes; (4) only once both checks pass, inserts Decision + its ReconsiderationConditions
 *  and commits. No `decidedBy` parameter (§1.2). Never mutates or reassigns an existing
 *  `Decision.briefVersionId`. Does not reject a second Decision on the same `briefVersionId`. */
export async function recordDecision(input: RecordDecisionInput): Promise<Decision> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const briefVersionResult = await client.query<{ id: string }>(
      `SELECT id FROM brief_version WHERE id = $1 FOR UPDATE`,
      [input.briefVersionId],
    );
    if (briefVersionResult.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new BriefVersionNotFoundError(input.briefVersionId);
    }

    const rawConditions = input.reconsiderationConditions ?? [];
    const validConditions = rawConditions.filter((c) => c.description.trim().length > 0);
    if (input.decision === 'Watch' && validConditions.length === 0) {
      await client.query('ROLLBACK');
      throw new WatchRequiresConditionError();
    }

    const decisionResult = await client.query<DecisionRow>(
      `INSERT INTO decision (brief_version_id, decision, rationale)
       VALUES ($1, $2, $3)
       RETURNING id, brief_version_id, decision, decided_at, rationale`,
      [input.briefVersionId, input.decision, input.rationale ?? null],
    );
    const decisionRow = decisionResult.rows[0];

    const reconsiderationConditionIds: string[] = [];
    if (input.decision === 'Watch') {
      for (const condition of validConditions) {
        const conditionResult = await client.query<{ id: string }>(
          `INSERT INTO reconsideration_condition (decision_id, type, other_type_label, description)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [decisionRow.id, condition.type, condition.otherTypeLabel ?? null, condition.description.trim()],
        );
        reconsiderationConditionIds.push(conditionResult.rows[0].id);
      }
    }

    await client.query('COMMIT');

    return {
      id: decisionRow.id,
      briefVersionId: decisionRow.brief_version_id,
      decision: decisionRow.decision,
      decidedAt: decisionRow.decided_at.toISOString(),
      rationale: decisionRow.rationale ?? undefined,
      reconsiderationConditionIds,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      // transaction may already be aborted — safe to ignore
    });
    throw err;
  } finally {
    client.release();
  }
}
