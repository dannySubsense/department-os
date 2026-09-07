import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import { createGenerationRun, recordGenerationStep } from './provenanceRecorder.js';
import {
  abandonGenerationRun,
  __setAbandonHeartbeatRaceDelayForTests,
  __resetAbandonHeartbeatRaceDelayForTests,
} from '../web/apiRoutes.js';

/**
 * C2-S3 04-ROADMAP.md Tests — SOL-HIGH-1 fix, "precision/collision proof": a direct test against a
 * real Postgres connection asserting `heartbeat_revision` never false-positives/false-negatives
 * under ordinary TIMESTAMPTZ round-tripping.
 *
 * The heartbeat-versus-abandonment race (§1.6 step 3/4) below: an earlier attempt used
 * `vi.spyOn(pool, 'connect')` to inject a renewal between `abandonGenerationRun`'s step-3
 * classification read and its step-4 guarded UPDATE — this failed, because `pg-pool`'s own
 * `Pool.query` calls `connect` internally, so the spy fired on the classification read's own query,
 * not the intended window. The real fix is a dedicated production test seam,
 * `__setAbandonHeartbeatRaceDelayForTests` (src/web/apiRoutes.ts) — a strict no-op by default,
 * invoked only between the classification read and the guarded UPDATE — used below to land a real
 * `recordGenerationStep` renewal deterministically inside that exact window.
 */

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE generation_run_consumed_source, brief_version, problem_brief,
              generation_step, generation_run, source_artifact, submission, investigation CASCADE`,
  );
});

async function seedOpenInvestigation(): Promise<string> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  return submission.investigationId;
}

/** Seeds a run with two artificially-close GenerationSteps (so computeLivenessState has an
 *  observed cadence to compare against), then backdates lease_heartbeat_at far enough past that
 *  cadence that abandonGenerationRun's own classification read reports 'stale-or-interrupted' and
 *  proceeds toward its guarded UPDATE — mirrors src/web/abandonGenerationRun.test.ts's own
 *  seedStaleRun helper. */
async function seedStaleRun(investigationId: string): Promise<{ id: string; fenceToken: number }> {
  const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });
  const t0 = new Date(Date.now() - 60_000).toISOString();
  const t1 = new Date(Date.now() - 59_900).toISOString();
  await recordGenerationStep({
    generationRunId: run.id,
    fenceToken: run.fenceToken,
    step: { component: 'Step A', outcome: 'succeeded', startedAt: t0, completedAt: t0, inputRefs: [], outputRefs: [] },
  });
  await recordGenerationStep({
    generationRunId: run.id,
    fenceToken: run.fenceToken,
    step: { component: 'Step B', outcome: 'succeeded', startedAt: t1, completedAt: t1, inputRefs: [], outputRefs: [] },
  });
  await pool.query(`UPDATE generation_run SET lease_heartbeat_at = $1, started_at = $2 WHERE id = $3`, [
    new Date(Date.now() - 55_000).toISOString(),
    t0,
    run.id,
  ]);
  const reread = await pool.query<{ fence_token: number }>(`SELECT fence_token FROM generation_run WHERE id = $1`, [
    run.id,
  ]);
  return { id: run.id, fenceToken: reread.rows[0].fence_token };
}

describe('heartbeat_revision — precision/collision proof (SOL-HIGH-1 fix)', () => {
  it('two immediate-succession reads with no intervening write compare heartbeat_revision equal', async () => {
    const investigationId = await seedOpenInvestigation();
    const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });

    const readA = await pool.query<{ heartbeat_revision: number }>(
      `SELECT heartbeat_revision FROM generation_run WHERE id = $1`,
      [run.id],
    );
    const readB = await pool.query<{ heartbeat_revision: number }>(
      `SELECT heartbeat_revision FROM generation_run WHERE id = $1`,
      [run.id],
    );
    expect(readB.rows[0].heartbeat_revision).toBe(readA.rows[0].heartbeat_revision);
  });

  it('two immediate-succession real recordGenerationStep renewals advance heartbeat_revision by exactly 2, never comparing falsely equal', async () => {
    const investigationId = await seedOpenInvestigation();
    const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });

    const before = await pool.query<{ heartbeat_revision: number }>(
      `SELECT heartbeat_revision FROM generation_run WHERE id = $1`,
      [run.id],
    );

    const step = (component: string) => ({
      generationRunId: run.id,
      fenceToken: run.fenceToken,
      step: {
        component,
        outcome: 'succeeded' as const,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        inputRefs: [],
        outputRefs: [],
      },
    });
    await recordGenerationStep(step('Step 1'));
    await recordGenerationStep(step('Step 2'));

    const after = await pool.query<{ heartbeat_revision: number }>(
      `SELECT heartbeat_revision FROM generation_run WHERE id = $1`,
      [run.id],
    );
    expect(after.rows[0].heartbeat_revision).toBe(before.rows[0].heartbeat_revision + 2);
    expect(after.rows[0].heartbeat_revision).not.toBe(before.rows[0].heartbeat_revision);
  });
});

describe('heartbeat_revision — abandon-versus-heartbeat race (§1.6 step 3/4, SOL-HIGH-1 fix)', () => {
  afterEach(() => {
    __resetAbandonHeartbeatRaceDelayForTests();
  });

  it('rejects abandon when a concurrent recordGenerationStep renews heartbeat_revision between the classification read and the guarded UPDATE', async () => {
    const investigationId = await seedOpenInvestigation();
    const run = await seedStaleRun(investigationId);

    // Uses the real test-only seam (src/web/apiRoutes.ts __setAbandonHeartbeatRaceDelayForTests),
    // which fires exactly in the window between abandonGenerationRun's step-3 classification read
    // and its step-4 guarded fence-increment UPDATE. Injects a real recordGenerationStep renewal —
    // no spying on pool.connect, which fired too early via pg-pool's internal query→connect call.
    __setAbandonHeartbeatRaceDelayForTests(async () => {
      await recordGenerationStep({
        generationRunId: run.id,
        fenceToken: run.fenceToken,
        step: {
          component: 'Concurrent heartbeat renewal',
          outcome: 'succeeded',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          inputRefs: [],
          outputRefs: [],
        },
      });
    });

    const revisionBeforeAbandon = await pool.query<{ heartbeat_revision: number }>(
      `SELECT heartbeat_revision FROM generation_run WHERE id = $1`,
      [run.id],
    );

    const result = await abandonGenerationRun(investigationId, run.id);

    // The guarded UPDATE's heartbeat_revision clause must catch this — a fence-token-only guard
    // would not, since the concurrent renewal above only advances heartbeat_revision, never
    // fence_token.
    expect(result.outcome).toBe('not-eligible');

    const steps = await pool.query<{ component: string }>(
      `SELECT component FROM generation_step WHERE generation_run_id = $1`,
      [run.id],
    );
    expect(steps.rows.map((r) => r.component)).not.toContain('Operator abandonment');

    const row = await pool.query<{ outcome: string; heartbeat_revision: number }>(
      `SELECT outcome, heartbeat_revision FROM generation_run WHERE id = $1`,
      [run.id],
    );
    expect(row.rows[0].outcome).toBe('in-progress');

    // Pins the SPECIFIC branch this test exists to prove: the guarded UPDATE's WHERE clause was
    // genuinely evaluated against the injected renewal's real post-renewal heartbeat_revision value
    // (not skipped, and not comparing a stale/unadvanced value) — the persisted revision must have
    // advanced by exactly 1 (the single injected recordGenerationStep call above) past the value
    // read before abandonGenerationRun ran, proving the injected renewal actually landed inside the
    // classification-read-to-guarded-UPDATE window and the guard read it.
    expect(row.rows[0].heartbeat_revision).toBe(revisionBeforeAbandon.rows[0].heartbeat_revision + 1);
  });
});
