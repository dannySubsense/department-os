import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from '../services/submitSources.js';
import { createGenerationRun, recordGenerationStep, finalizeGenerationRun } from '../services/provenanceRecorder.js';
import { attemptGenerationFailedTransition } from '../services/generateBriefVersion.js';

/**
 * C2-S3 04-ROADMAP.md Tests: "Abandon and retry recovery" (02-ARCHITECTURE.md §1.6) and
 * "lock order does not deadlock, real two-connection contention" (§1.6/§3.1c).
 *
 * `abandonGenerationRun` (src/web/apiRoutes.ts) had zero test coverage before this file.
 */
const { abandonGenerationRun } = await import('./apiRoutes.js');

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

async function seedCorrectionInvestigation(): Promise<string> {
  const investigationId = await seedOpenInvestigation();
  const brief = await pool.query<{ id: string }>(
    `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
    [investigationId],
  );
  await pool.query(
    `UPDATE investigation SET problem_brief_id = $1, status = 'brief-generated' WHERE id = $2`,
    [brief.rows[0].id, investigationId],
  );
  return investigationId;
}

/** Seeds a run with two artificially-close GenerationSteps (so computeLivenessState has an
 *  observed cadence to compare against), then backdates lease_heartbeat_at far enough past that
 *  cadence that the relative-cadence check (getInvestigationWorkspace.ts's computeLivenessState,
 *  STALENESS_MULTIPLIER = 4) classifies the run 'stale-or-interrupted'. */
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
  // Observed cadence between t0 and t1 is ~100ms; back-date lease_heartbeat_at far beyond
  // 4x that so current silence is unambiguously 'stale-or-interrupted'.
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

describe('abandonGenerationRun — eligibility rejections', () => {
  it('rejects 409/not-eligible when the run is still active/healthy', async () => {
    const investigationId = await seedOpenInvestigation();
    const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });
    // Fresh run: lease_heartbeat_at defaults to started_at (now) — computeLivenessState reports
    // 'active' (cold start, fewer than 2 steps).
    const result = await abandonGenerationRun(investigationId, run.id);
    expect(result).toEqual({ outcome: 'not-eligible', currentOutcome: 'in-progress', livenessState: 'active' });
  });

  it('rejects 409/not-eligible when the run is already terminal', async () => {
    const investigationId = await seedOpenInvestigation();
    const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });
    await finalizeGenerationRun({
      generationRunId: run.id,
      outcome: 'succeeded',
      briefVersionId: null,
      fenceToken: run.fenceToken,
    });
    const result = await abandonGenerationRun(investigationId, run.id);
    expect(result).toEqual({ outcome: 'not-eligible', currentOutcome: 'succeeded', livenessState: 'terminal' });
  });
});

describe('abandonGenerationRun — genuine stale runs succeed', () => {
  it('abandons a genuinely stale non-correction run, clearing the concurrency guard', async () => {
    const investigationId = await seedOpenInvestigation();
    const run = await seedStaleRun(investigationId);

    const result = await abandonGenerationRun(investigationId, run.id);
    expect(result).toEqual({ outcome: 'abandoned' });

    const row = await pool.query<{ outcome: string }>(`SELECT outcome FROM generation_run WHERE id = $1`, [run.id]);
    expect(row.rows[0].outcome).toBe('failed');

    const steps = await pool.query<{ component: string }>(
      `SELECT component FROM generation_step WHERE generation_run_id = $1 ORDER BY step_index`,
      [run.id],
    );
    expect(steps.rows.at(-1)!.component).toBe('Operator abandonment');

    const investigation = await pool.query<{ status: string }>(
      `SELECT status FROM investigation WHERE id = $1`,
      [investigationId],
    );
    expect(investigation.rows[0].status).toBe('generation-failed');

    // Concurrency guard cleared: a fresh run can now be created for this Investigation.
    const fresh = await createGenerationRun({ investigationId, runtimeIdentifier: 'retry' });
    expect(fresh.outcome).toBe('in-progress');
  });

  it('abandons a genuinely stale correction run without touching Investigation status', async () => {
    const investigationId = await seedCorrectionInvestigation();
    const run = await seedStaleRun(investigationId);

    const result = await abandonGenerationRun(investigationId, run.id);
    expect(result).toEqual({ outcome: 'abandoned' });

    const row = await pool.query<{ outcome: string }>(`SELECT outcome FROM generation_run WHERE id = $1`, [run.id]);
    expect(row.rows[0].outcome).toBe('failed');

    const investigation = await pool.query<{ status: string }>(
      `SELECT status FROM investigation WHERE id = $1`,
      [investigationId],
    );
    // Correction abandon never attempts a status transition — status is left exactly as it was.
    expect(investigation.rows[0].status).toBe('brief-generated');
  });
});

describe('abandonGenerationRun — lost-race case (run resolves before abandon is called)', () => {
  it('re-reads and reports the real persisted outcome, never fabricating an Operator abandonment step, when the run legitimately finalized first', async () => {
    const investigationId = await seedOpenInvestigation();
    const run = await seedStaleRun(investigationId);

    // Simulate the legitimate pipeline winning the race and finalizing this run BEFORE the
    // operator's abandon request reaches the server (04-ROADMAP.md C2-S3: "seed a run, call
    // finalizeGenerationRun directly to simulate the legitimate pipeline completing first, then
    // call abandonGenerationRun for the same run").
    await finalizeGenerationRun({
      generationRunId: run.id,
      outcome: 'succeeded',
      briefVersionId: null,
      fenceToken: run.fenceToken,
    });

    const result = await abandonGenerationRun(investigationId, run.id);
    // Must NOT respond as though it had just finalized the run 'failed' — it re-reads and reports
    // the run's real, already-persisted outcome (step 4's own branch), never the stale value
    // captured at its own step-1-3 read.
    expect(result).toEqual({ outcome: 'not-eligible', currentOutcome: 'succeeded', livenessState: 'terminal' });

    const steps = await pool.query<{ component: string }>(
      `SELECT component FROM generation_step WHERE generation_run_id = $1`,
      [run.id],
    );
    expect(steps.rows.map((r) => r.component)).not.toContain('Operator abandonment');

    const row = await pool.query<{ outcome: string }>(`SELECT outcome FROM generation_run WHERE id = $1`, [run.id]);
    expect(row.rows[0].outcome).toBe('succeeded'); // never overwritten to 'failed'
  });
});

describe('abandonGenerationRun — lock order avoids Postgres deadlock (40P01)', () => {
  it('does not deadlock when a concurrent transaction holds investigation FOR UPDATE first', async () => {
    const investigationId = await seedOpenInvestigation();
    const run = await seedStaleRun(investigationId);

    const connA = await pool.connect();
    try {
      await connA.query('BEGIN');
      // Connection A locks `investigation` first, matching abandonGenerationRun's own order —
      // this must never deadlock, only block B.
      await connA.query('SELECT id FROM investigation WHERE id = $1 FOR UPDATE', [investigationId]);

      const abandonPromise = abandonGenerationRun(investigationId, run.id);
      // Give abandonGenerationRun's own transaction a moment to reach and block on its
      // `investigation FOR UPDATE` acquisition (it must block, not proceed, not deadlock).
      await new Promise((resolve) => setTimeout(resolve, 300));

      await connA.query('COMMIT');

      const result = await abandonPromise;
      expect(result).toEqual({ outcome: 'abandoned' });
    } finally {
      connA.release();
    }

    const row = await pool.query<{ outcome: string }>(`SELECT outcome FROM generation_run WHERE id = $1`, [run.id]);
    expect(row.rows[0].outcome).toBe('failed');
  });

  it('does not deadlock in the second direction: connection A holds investigation FOR UPDATE while connection B runs attemptGenerationFailedTransition (04-ROADMAP.md §1.6/§3.1c)', async () => {
    const investigationId = await seedOpenInvestigation();
    const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });

    const connA = await pool.connect();
    try {
      await connA.query('BEGIN');
      // Connection A locks `investigation` first, matching attemptGenerationFailedTransition's
      // own lock order (investigation FOR UPDATE, then generation_run via assertFenceOwnership) —
      // this must never deadlock, only block B.
      await connA.query('SELECT id FROM investigation WHERE id = $1 FOR UPDATE', [investigationId]);

      const transitionPromise = attemptGenerationFailedTransition({
        investigationId,
        generationRunId: run.id,
        fenceToken: run.fenceToken,
        isCorrection: false,
        reason: 'second-direction deadlock-avoidance test',
      });
      // Give attemptGenerationFailedTransition's own transaction a moment to reach and block on
      // its `investigation FOR UPDATE` acquisition (it must block, not proceed, not deadlock).
      await new Promise((resolve) => setTimeout(resolve, 300));

      await connA.query('COMMIT');

      const resultingStatus = await transitionPromise;
      expect(resultingStatus).toBe('generation-failed');
    } finally {
      connA.release();
    }

    const investigation = await pool.query<{ status: string }>(
      `SELECT status FROM investigation WHERE id = $1`,
      [investigationId],
    );
    expect(investigation.rows[0].status).toBe('generation-failed');
  });
});
