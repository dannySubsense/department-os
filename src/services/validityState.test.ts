import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { getAssignedState, getAssignedStateAsRecorded } from './validityState.js';

// Integration coverage for getAssignedState / getAssignedStateAsRecorded
// (04-ROADMAP.md C2-S4 Tests list, 02-ARCHITECTURE.md §4.7).

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(`TRUNCATE status_event`);
});

async function seedStatusEvent(input: {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  assignedState: 'valid' | 'challenged' | 'invalidated';
  effectiveAt: string;
  recordedAt?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO status_event (target_type, target_id, assigned_state, effective_at, recorded_at, recorded_by, reason)
     VALUES ($1, $2, $3, $4, COALESCE($5, now()), 'test-operator', 'test reason')`,
    [input.targetType, input.targetId, input.assignedState, input.effectiveAt, input.recordedAt ?? null],
  );
}

const TARGET_ID = '11111111-1111-1111-1111-111111111111';

describe('getAssignedState', () => {
  it("returns 'valid' when zero status_event rows exist for the target", async () => {
    const result = await getAssignedState({ targetType: 'brief-version', targetId: TARGET_ID });
    expect(result).toBe('valid');
  });

  it('returns the seeded state for an asOf at/after effectiveAt, and valid before it', async () => {
    const effectiveAt = new Date('2026-01-01T00:00:00Z').toISOString();
    await seedStatusEvent({
      targetType: 'brief-version',
      targetId: TARGET_ID,
      assignedState: 'invalidated',
      effectiveAt,
    });

    const before = await getAssignedState({
      targetType: 'brief-version',
      targetId: TARGET_ID,
      asOf: new Date('2025-12-31T23:59:59Z').toISOString(),
    });
    expect(before).toBe('valid');

    const atEffective = await getAssignedState({
      targetType: 'brief-version',
      targetId: TARGET_ID,
      asOf: effectiveAt,
    });
    expect(atEffective).toBe('invalidated');

    const after = await getAssignedState({
      targetType: 'brief-version',
      targetId: TARGET_ID,
      asOf: new Date('2026-06-01T00:00:00Z').toISOString(),
    });
    expect(after).toBe('invalidated');
  });

  it('deterministically returns the highest-sequence row when two rows share identical effectiveAt AND recordedAt', async () => {
    const sameEffectiveAt = new Date('2026-02-01T00:00:00Z').toISOString();
    const sameRecordedAt = new Date('2026-02-01T00:00:01Z').toISOString();
    await seedStatusEvent({
      targetType: 'brief-version',
      targetId: TARGET_ID,
      assignedState: 'challenged',
      effectiveAt: sameEffectiveAt,
      recordedAt: sameRecordedAt,
    });
    await seedStatusEvent({
      targetType: 'brief-version',
      targetId: TARGET_ID,
      assignedState: 'invalidated',
      effectiveAt: sameEffectiveAt,
      recordedAt: sameRecordedAt,
    });

    const result = await getAssignedState({ targetType: 'brief-version', targetId: TARGET_ID });
    // The second-inserted row has the higher `sequence` (BIGSERIAL, insertion order) — it must win.
    expect(result).toBe('invalidated');
  });
});

describe('getAssignedStateAsRecorded', () => {
  it("returns 'valid' when zero status_event rows exist for the target", async () => {
    const result = await getAssignedStateAsRecorded({
      targetType: 'claim-version',
      targetId: TARGET_ID,
      knownAsOf: new Date().toISOString(),
    });
    expect(result).toBe('valid');
  });

  it('diverges correctly on knownAsOf given two seeded rows with different recordedAt values', async () => {
    const effectiveAt = new Date('2026-01-01T00:00:00Z').toISOString();
    const firstRecordedAt = new Date('2026-01-05T00:00:00Z').toISOString();
    const secondRecordedAt = new Date('2026-01-10T00:00:00Z').toISOString();
    await seedStatusEvent({
      targetType: 'claim-version',
      targetId: TARGET_ID,
      assignedState: 'challenged',
      effectiveAt,
      recordedAt: firstRecordedAt,
    });
    await seedStatusEvent({
      targetType: 'claim-version',
      targetId: TARGET_ID,
      assignedState: 'invalidated',
      effectiveAt,
      recordedAt: secondRecordedAt,
    });

    const beforeEitherRecorded = await getAssignedStateAsRecorded({
      targetType: 'claim-version',
      targetId: TARGET_ID,
      knownAsOf: new Date('2026-01-02T00:00:00Z').toISOString(),
    });
    expect(beforeEitherRecorded).toBe('valid');

    const knowingOnlyFirst = await getAssignedStateAsRecorded({
      targetType: 'claim-version',
      targetId: TARGET_ID,
      knownAsOf: new Date('2026-01-07T00:00:00Z').toISOString(),
    });
    expect(knowingOnlyFirst).toBe('challenged');

    const knowingBoth = await getAssignedStateAsRecorded({
      targetType: 'claim-version',
      targetId: TARGET_ID,
      knownAsOf: secondRecordedAt,
    });
    expect(knowingBoth).toBe('invalidated');
  });

  it('deterministically returns the highest-sequence row when two rows share identical effectiveAt AND recordedAt', async () => {
    const sameEffectiveAt = new Date('2026-03-01T00:00:00Z').toISOString();
    const sameRecordedAt = new Date('2026-03-01T00:00:01Z').toISOString();
    await seedStatusEvent({
      targetType: 'claim-version',
      targetId: TARGET_ID,
      assignedState: 'challenged',
      effectiveAt: sameEffectiveAt,
      recordedAt: sameRecordedAt,
    });
    await seedStatusEvent({
      targetType: 'claim-version',
      targetId: TARGET_ID,
      assignedState: 'invalidated',
      effectiveAt: sameEffectiveAt,
      recordedAt: sameRecordedAt,
    });

    const result = await getAssignedStateAsRecorded({
      targetType: 'claim-version',
      targetId: TARGET_ID,
      knownAsOf: sameRecordedAt,
    });
    expect(result).toBe('invalidated');
  });
});
