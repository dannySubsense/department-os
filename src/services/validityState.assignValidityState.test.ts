import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import { recordDecision } from './recordDecision.js';
import { assignValidityState, InvalidValidityTargetError } from './validityState.js';

// Integration coverage for assignValidityState's write-time target validation and
// dependent-decision reconstruction (04-ROADMAP.md C2-S5 Tests list, 02-ARCHITECTURE.md §4.7).

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE status_event, reconsideration_condition, decision, negative_finding, gap_hypothesis,
              existing_solution, demand_signal, problem_statement, brief_version, problem_brief,
              generation_step, generation_run, claim_version_evidence, evidence_item, claim_version,
              claim, source_artifact, submission, investigation CASCADE`,
  );
});

async function seedBriefVersion(): Promise<{ investigationId: string; briefVersionId: string }> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  const investigationId = submission.investigationId;
  const runResult = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, 'succeeded', now(), now(), 'test-runtime') RETURNING id`,
    [investigationId],
  );
  const briefResult = await pool.query<{ id: string }>(
    `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
    [investigationId],
  );
  const briefVersionResult = await pool.query<{ id: string }>(
    `INSERT INTO brief_version
       (problem_brief_id, version_number, generation_run_id, problem_statement_ids, claim_version_ids,
        demand_signal_ids, demand_confidence_classification, existing_solution_ids, gap_hypothesis_ids,
        uncertainty_statement, recommendation, personal_pull_note_ids)
     VALUES ($1, 1, $2, $3, $4, '{}', '{}'::jsonb, '{}', '{}', '{}'::jsonb, '{}'::jsonb, '{}')
     RETURNING id`,
    [briefResult.rows[0].id, runResult.rows[0].id, [randomUUID()], [randomUUID()]],
  );
  const briefVersionId = briefVersionResult.rows[0].id;
  await pool.query(`UPDATE problem_brief SET current_version_id = $1 WHERE id = $2`, [
    briefVersionId,
    briefResult.rows[0].id,
  ]);
  return { investigationId, briefVersionId };
}

async function seedClaimVersion(): Promise<string> {
  const claimResult = await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`);
  const claimVersionResult = await pool.query<{ id: string }>(
    `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, 'claim text') RETURNING id`,
    [claimResult.rows[0].id],
  );
  return claimVersionResult.rows[0].id;
}

const DANGLING_ID = '00000000-0000-0000-0000-000000000000';

describe('assignValidityState — write-time target validation', () => {
  it('throws InvalidValidityTargetError and writes NO status_event row for a dangling/nonexistent targetId', async () => {
    const before = await pool.query(`SELECT count(*) FROM status_event`);
    await expect(
      assignValidityState({
        targetType: 'brief-version',
        targetId: DANGLING_ID,
        assignedState: 'invalidated',
        effectiveAt: new Date().toISOString(),
        reason: 'test',
        recordedBy: 'test-harness',
      }),
    ).rejects.toBeInstanceOf(InvalidValidityTargetError);
    const after = await pool.query(`SELECT count(*) FROM status_event`);
    expect(after.rows[0].count).toBe(before.rows[0].count);
    expect(after.rows[0].count).toBe('0');
  });

  it('throws InvalidValidityTargetError and writes NO status_event row when targetId exists but as the OTHER targetType (real claim_version.id passed as brief-version)', async () => {
    const claimVersionId = await seedClaimVersion();
    await expect(
      assignValidityState({
        targetType: 'brief-version',
        targetId: claimVersionId,
        assignedState: 'invalidated',
        effectiveAt: new Date().toISOString(),
        reason: 'test',
        recordedBy: 'test-harness',
      }),
    ).rejects.toBeInstanceOf(InvalidValidityTargetError);
    const count = await pool.query(`SELECT count(*) FROM status_event`);
    expect(count.rows[0].count).toBe('0');
  });

  it('throws InvalidValidityTargetError and writes NO status_event row when a real brief_version.id is passed as targetType claim-version', async () => {
    const { briefVersionId } = await seedBriefVersion();
    await expect(
      assignValidityState({
        targetType: 'claim-version',
        targetId: briefVersionId,
        assignedState: 'invalidated',
        effectiveAt: new Date().toISOString(),
        reason: 'test',
        recordedBy: 'test-harness',
      }),
    ).rejects.toBeInstanceOf(InvalidValidityTargetError);
    const count = await pool.query(`SELECT count(*) FROM status_event`);
    expect(count.rows[0].count).toBe('0');
  });
});

describe('assignValidityState — real StatusEvent append and dependentDecisionIds reconstruction', () => {
  it('appends a real StatusEvent row (never updates one) for a valid target', async () => {
    const { briefVersionId } = await seedBriefVersion();
    const result = await assignValidityState({
      targetType: 'brief-version',
      targetId: briefVersionId,
      assignedState: 'challenged',
      effectiveAt: new Date().toISOString(),
      reason: 'seeded correction',
      recordedBy: 'test-harness',
    });
    expect(result.statusEvent.assignedState).toBe('challenged');
    expect(result.statusEvent.targetId).toBe(briefVersionId);

    const rows = await pool.query(`SELECT * FROM status_event WHERE target_id = $1`, [briefVersionId]);
    expect(rows.rowCount).toBe(1);

    // A second call inserts a second row — never an UPDATE of the first.
    await assignValidityState({
      targetType: 'brief-version',
      targetId: briefVersionId,
      assignedState: 'invalidated',
      effectiveAt: new Date().toISOString(),
      reason: 'second correction',
      recordedBy: 'test-harness',
    });
    const rowsAfter = await pool.query(
      `SELECT * FROM status_event WHERE target_id = $1 ORDER BY sequence ASC`,
      [briefVersionId],
    );
    expect(rowsAfter.rowCount).toBe(2);
    expect(rowsAfter.rows[0].assigned_state).toBe('challenged');
    expect(rowsAfter.rows[1].assigned_state).toBe('invalidated');
  });

  it('given a BriefVersion with zero Decisions, dependentDecisionIds is []', async () => {
    const { briefVersionId } = await seedBriefVersion();
    const result = await assignValidityState({
      targetType: 'brief-version',
      targetId: briefVersionId,
      assignedState: 'challenged',
      effectiveAt: new Date().toISOString(),
      reason: 'test',
      recordedBy: 'test-harness',
    });
    expect(result.dependentDecisionIds).toEqual([]);
  });

  it('includes a Decision recorded while the target was last "valid" as-of its own decidedAt, using real seeded StatusEvent rows with real DB-assigned sequence values', async () => {
    const { briefVersionId } = await seedBriefVersion();
    // No StatusEvent yet — target is implicitly 'valid'. Record a Decision now.
    const decision = await recordDecision({ briefVersionId, decision: 'Approve' });

    const result = await assignValidityState({
      targetType: 'brief-version',
      targetId: briefVersionId,
      assignedState: 'invalidated',
      effectiveAt: new Date().toISOString(),
      reason: 'later correction',
      recordedBy: 'test-harness',
    });

    expect(result.dependentDecisionIds).toEqual([decision.id]);
    // The StatusEvent this call itself wrote carries a real, DB-assigned sequence value.
    expect(result.statusEvent.sequence).toBeGreaterThan(0);
  });

  it('excludes a Decision recorded AFTER the target was already challenged/invalidated at that same knowledge-time', async () => {
    const { briefVersionId } = await seedBriefVersion();

    // Seed a real StatusEvent (challenged) BEFORE the Decision is recorded, with a real,
    // DB-assigned sequence value — the target is already non-'valid' by the time the Decision
    // below is decided.
    const earlyEffectiveAt = new Date(Date.now() - 60_000).toISOString();
    await pool.query(
      `INSERT INTO status_event (target_type, target_id, assigned_state, effective_at, recorded_by, reason)
       VALUES ('brief-version', $1, 'challenged', $2, 'test-harness', 'seeded prior challenge')`,
      [briefVersionId, earlyEffectiveAt],
    );

    const decision = await recordDecision({ briefVersionId, decision: 'Approve' });

    const result = await assignValidityState({
      targetType: 'brief-version',
      targetId: briefVersionId,
      assignedState: 'invalidated',
      effectiveAt: new Date().toISOString(),
      reason: 'a later correction',
      recordedBy: 'test-harness',
    });

    expect(result.dependentDecisionIds).not.toContain(decision.id);
    expect(result.dependentDecisionIds).toEqual([]);
  });

  it('dependent-decision reconstruction is stable under the sequence tiebreak for two StatusEvent rows sharing identical effectiveAt/recordedAt', async () => {
    const { briefVersionId } = await seedBriefVersion();
    const decision = await recordDecision({ briefVersionId, decision: 'Watch', reconsiderationConditions: [{ type: 'new-evidence', description: 'x' }] });

    // Two real StatusEvent rows with IDENTICAL effective_at/recorded_at, seeded directly so their
    // only distinguishing, deterministic ordering signal is the real, DB-assigned `sequence`
    // column (BIGSERIAL) — the second-inserted row must win under getAssignedStateAsRecorded's own
    // ORDER BY ... sequence DESC tiebreak, matching C2-S4's read queries.
    const sameTimestamp = new Date(Date.now() - 30_000).toISOString();
    await pool.query(
      `INSERT INTO status_event (target_type, target_id, assigned_state, effective_at, recorded_at, recorded_by, reason)
       VALUES ('brief-version', $1, 'valid', $2, $2, 'test-harness', 'first, same timestamp')`,
      [briefVersionId, sameTimestamp],
    );
    await pool.query(
      `INSERT INTO status_event (target_type, target_id, assigned_state, effective_at, recorded_at, recorded_by, reason)
       VALUES ('brief-version', $1, 'invalidated', $2, $2, 'test-harness', 'second, same timestamp, higher sequence wins')`,
      [briefVersionId, sameTimestamp],
    );

    // Since the decision was recorded AFTER both seeded rows (its decidedAt is now), and the
    // higher-sequence (second-inserted) row is 'invalidated', the target's state as known at the
    // Decision's own decidedAt is 'invalidated' — the Decision must be excluded.
    const result = await assignValidityState({
      targetType: 'brief-version',
      targetId: briefVersionId,
      assignedState: 'challenged',
      effectiveAt: new Date().toISOString(),
      reason: 'yet another correction',
      recordedBy: 'test-harness',
    });
    expect(result.dependentDecisionIds).not.toContain(decision.id);
  });
});
