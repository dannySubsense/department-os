import { pool } from '../db/pool.js';
import type { AssignedValidityState } from '../types/domain.js';

/** Validity/Invalidation Service (US-12) — 02-ARCHITECTURE.md §4.7. This slice (C2-S4) builds
 *  only the two real read queries, `getAssignedState` and `getAssignedStateAsRecorded` — the
 *  writer, `assignValidityState`, and its own write-time `InvalidValidityTargetError` validation,
 *  are C2-S5's scope (the first slice with `getDecisionsForBriefVersion` available for the
 *  writer's dependent-decision reconstruction step). This file is edited again, not recreated, in
 *  C2-S5. */

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
