import { pool } from '../db/pool.js';
import { getDecisionsForBriefVersion } from './getDecisionsForBriefVersion.js';
import type { AssignedValidityState, StatusEvent } from '../types/domain.js';

/** Validity/Invalidation Service (US-12) — 02-ARCHITECTURE.md §4.7. C2-S4 built the two real read
 *  queries, `getAssignedState` and `getAssignedStateAsRecorded`. C2-S5 (this revision) adds the
 *  writer, `assignValidityState`, with write-time target existence/type validation and
 *  dependent-decision reconstruction. No browser-reachable route, control, or `api.ts` export
 *  calls `assignValidityState` (Out of Scope, US-12) — exercised only by service tests and a
 *  direct-service-call browser demonstration. */

interface GetAssignedStateInput {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  asOf?: string; // defaults to now
}

/** Query 1 — current-knowledge: "what state is currently assigned as effective at time T?"
 *  Latest StatusEvent for (targetType, targetId) with effectiveAt <= asOf, evaluated against
 *  everything ever recorded (no recordedAt bound); 'valid' if no StatusEvent exists. This answer
 *  CAN change over time if a later, backdated StatusEvent is recorded — expected (US-12 AC5).
 *  Ordering: "latest" is ORDER BY effective_at DESC, recorded_at DESC, sequence DESC LIMIT 1 —
 *  `sequence` (a monotonic BIGSERIAL) is the deterministic tiebreak for two events on the same
 *  target with equal effective_at AND equal recorded_at; `sequence` is DB-assigned insertion
 *  order and is always distinct, so ordering is fully deterministic in every case. */
export async function getAssignedState(input: GetAssignedStateInput): Promise<AssignedValidityState> {
  const asOf = input.asOf ?? new Date().toISOString();
  const result = await pool.query<{ assigned_state: AssignedValidityState }>(
    `SELECT assigned_state
       FROM status_event
      WHERE target_type = $1 AND target_id = $2 AND effective_at <= $3
      ORDER BY effective_at DESC, recorded_at DESC, sequence DESC
      LIMIT 1`,
    [input.targetType, input.targetId, asOf],
  );
  return result.rows[0]?.assigned_state ?? 'valid';
}

interface GetAssignedStateAsRecordedInput {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  asOf?: string; // defaults to knownAsOf
  knownAsOf: string; // required, no default
}

/** Query 2 — as-of-knowledge: "what state had Department OS recorded as effective at time T, as
 *  of knowledge-time K?" Latest StatusEvent with effectiveAt <= asOf AND recordedAt <= knownAsOf;
 *  'valid' if none exists. `knownAsOf` is required — no default (US-12 AC4). Same
 *  `sequence`-tiebreak ordering as `getAssignedState`. */
export async function getAssignedStateAsRecorded(
  input: GetAssignedStateAsRecordedInput,
): Promise<AssignedValidityState> {
  const asOf = input.asOf ?? input.knownAsOf;
  const result = await pool.query<{ assigned_state: AssignedValidityState }>(
    `SELECT assigned_state
       FROM status_event
      WHERE target_type = $1 AND target_id = $2 AND effective_at <= $3 AND recorded_at <= $4
      ORDER BY effective_at DESC, recorded_at DESC, sequence DESC
      LIMIT 1`,
    [input.targetType, input.targetId, asOf, input.knownAsOf],
  );
  return result.rows[0]?.assigned_state ?? 'valid';
}

/** Thrown by `assignValidityState` BEFORE the append-only INSERT when `targetId` does not exist
 *  as a row of the claimed `targetType` — since the row can never be corrected once written,
 *  existence/type is validated at write time, not left as a possible dangling reference. */
export class InvalidValidityTargetError extends Error {}

interface AssignValidityStateInput {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  assignedState: AssignedValidityState;
  effectiveAt: string; // when this became true in the represented world; may be in the past, to
  // record a late-discovered correction
  reason: string;
  recordedBy: string; // system/process identifier, not a human actor (§3.6)
}

interface StatusEventRow {
  id: string;
  sequence: string; // BIGSERIAL — returned as string by node-pg, converted below
  target_type: 'claim-version' | 'brief-version';
  target_id: string;
  assigned_state: AssignedValidityState;
  effective_at: Date;
  recorded_at: Date;
  recorded_by: string;
  reason: string;
}

interface RawBriefVersionForDependentLookup {
  id: string;
  claim_version_ids: string[];
}

/** `assignValidityState` orchestration — 02-ARCHITECTURE.md §4.7 (US-12 AC2, dependent-decision
 *  reconstruction). No browser-reachable trigger — called only from service code, a test harness,
 *  or Forge verification this checkpoint (Out of Scope). Never invoked as a side effect of any
 *  US-13 correction path, and vice versa. */
export async function assignValidityState(
  input: AssignValidityStateInput,
): Promise<{ statusEvent: StatusEvent; dependentDecisionIds: string[] }> {
  const client = await pool.connect();
  let statusEventRow: StatusEventRow;
  try {
    await client.query('BEGIN');

    // Step 0 — target existence/type validation, BEFORE the INSERT, same transaction.
    const tableName = input.targetType === 'claim-version' ? 'claim_version' : 'brief_version';
    const existsResult = await client.query<{ exists: number }>(
      `SELECT 1 AS exists FROM ${tableName} WHERE id = $1`,
      [input.targetId],
    );
    if (existsResult.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new InvalidValidityTargetError(
        `assignValidityState: no ${input.targetType} row exists for targetId ${input.targetId}`,
      );
    }

    // Step 1 — append a new StatusEvent row (never an update), same transaction as step 0.
    const insertResult = await client.query<StatusEventRow>(
      `INSERT INTO status_event (target_type, target_id, assigned_state, effective_at, recorded_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, sequence, target_type, target_id, assigned_state, effective_at, recorded_at, recorded_by, reason`,
      [input.targetType, input.targetId, input.assignedState, input.effectiveAt, input.recordedBy, input.reason],
    );
    statusEventRow = insertResult.rows[0];

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      // transaction may already be aborted — safe to ignore
    });
    throw err;
  } finally {
    client.release();
  }

  // Step 2 — resolve every BriefVersion that references targetId.
  let dependentBriefVersionIds: string[];
  if (input.targetType === 'brief-version') {
    dependentBriefVersionIds = [input.targetId];
  } else {
    const reverseResult = await pool.query<RawBriefVersionForDependentLookup>(
      `SELECT id, claim_version_ids FROM brief_version WHERE $1 = ANY(claim_version_ids)`,
      [input.targetId],
    );
    dependentBriefVersionIds = reverseResult.rows.map((r) => r.id);
  }

  // Step 3/4/5 — for each matching BriefVersion, read every bound Decision, filter to those where
  // the target's assigned state as known at decidedAt was last 'valid', collect the filtered ids.
  const dependentDecisionIds: string[] = [];
  for (const briefVersionId of dependentBriefVersionIds) {
    const decisions = await getDecisionsForBriefVersion(briefVersionId);
    for (const decision of decisions) {
      const stateAsKnown = await getAssignedStateAsRecorded({
        targetType: input.targetType,
        targetId: input.targetId,
        asOf: decision.decidedAt,
        knownAsOf: decision.decidedAt,
      });
      if (stateAsKnown === 'valid') {
        dependentDecisionIds.push(decision.id);
      }
    }
  }

  const statusEvent: StatusEvent = {
    id: statusEventRow.id,
    sequence: Number(statusEventRow.sequence),
    targetType: statusEventRow.target_type,
    targetId: statusEventRow.target_id,
    assignedState: statusEventRow.assigned_state,
    effectiveAt: statusEventRow.effective_at.toISOString(),
    recordedAt: statusEventRow.recorded_at.toISOString(),
    recordedBy: statusEventRow.recorded_by,
    reason: statusEventRow.reason,
  };

  return { statusEvent, dependentDecisionIds };
}
