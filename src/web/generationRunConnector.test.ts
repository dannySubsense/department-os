import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from '../services/submitSources.js';
import { createGenerationRun, finalizeGenerationRun } from '../services/provenanceRecorder.js';
import { getInvestigationWorkspace } from '../services/getInvestigationWorkspace.js';

/** C2-S3 §4.2 — the Generation Run Connector's two-`.catch` split
 * (04-ROADMAP.md C2-S3 Tests list: "synchronization-catch mapping isolation" and "finalization
 * safety-net write-order proof" / "read-before-write discrimination"). `generateBriefVersion` is
 * mocked at its module boundary for the safety-net tests below — those tests are about the
 * CONNECTOR's own dispatch logic (which `.catch` fires, what it reads/writes), not about the real
 * seven-component pipeline (already covered by `generateBriefVersion.test.ts`). The
 * synchronization-catch test below deliberately does NOT mock `generateBriefVersion` — it forces a
 * genuine real Postgres 23505 at Phase 1's own real `createGenerationRun` INSERT, which is the one
 * scenario a mock could not honestly stand in for. */
vi.mock('../services/generateBriefVersion.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/generateBriefVersion.js')>();
  return { ...actual, generateBriefVersion: vi.fn(actual.generateBriefVersion) };
});

const { generateBriefVersion } = await import('../services/generateBriefVersion.js');
const { createGenerationRunForInvestigation } = await import('./apiRoutes.js');
// The REAL implementation, captured before mocking, so beforeEach can restore it as the default
// per-test implementation — `mockClear()` alone only clears call history, it does NOT undo a
// `mockImplementation(...)` a prior test installed, so without this restoration a test relying on
// the real implementation running (e.g. the synchronization-catch / terminal-outcome-lookup tests)
// could silently inherit a PRIOR test's fake implementation (and that prior test's closed-over,
// already-truncated investigationId), firing a background write that lands after this test's own
// window and throws a real FK violation once the next beforeEach's TRUNCATE has run.
const realGenerateBriefVersion = (
  await vi.importActual<typeof import('../services/generateBriefVersion.js')>(
    '../services/generateBriefVersion.js',
  )
).generateBriefVersion;

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE generation_run_consumed_source, brief_version, problem_brief,
              generation_step, generation_run, source_artifact, submission, investigation CASCADE`,
  );
  // mockClear (not mockReset): resetting would strip the real-implementation wrapping the module
  // mock factory establishes above. Explicitly restore the real implementation as this test's
  // starting default on every run — mockClear() alone does not undo a mockImplementation(...) a
  // prior test installed. Tests that need a fake implementation call mockImplementation(...)
  // explicitly before use, which overrides this default regardless.
  vi.mocked(generateBriefVersion).mockClear();
  vi.mocked(generateBriefVersion).mockImplementation(realGenerateBriefVersion);
});

async function seedOpenInvestigation(): Promise<string> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  return submission.investigationId;
}

describe('createGenerationRunForInvestigation — ordinary not-found/ineligible cases', () => {
  it('returns not-found for a nonexistent investigation id', async () => {
    const result = await createGenerationRunForInvestigation('00000000-0000-0000-0000-000000000000');
    expect(result).toEqual({ outcome: 'not-found' });
  });

  it('returns ineligible for a blocked investigation, without invoking the pipeline', async () => {
    const investigationId = await seedOpenInvestigation();
    await pool.query(`UPDATE investigation SET status = 'blocked' WHERE id = $1`, [investigationId]);

    const result = await createGenerationRunForInvestigation(investigationId);
    expect(result).toEqual({
      outcome: 'ineligible',
      currentStatus: 'blocked',
      reason: 'the Investigation is blocked',
    });
    expect(generateBriefVersion).not.toHaveBeenCalled();
  });
});

describe('createGenerationRunForInvestigation — synchronization-catch mapping isolation (real 23505)', () => {
  it('maps a real, deterministically-forced 23505 unique violation to a conflict outcome entirely via the FIRST .catch, before generationRun is ever assigned', async () => {
    const investigationId = await seedOpenInvestigation();

    // Deterministic two-connection SQL-level control (same tier as C2-S3's unique-index-level
    // proof) — seed connection A with a real, uncommitted in-progress GenerationRun row for this
    // Investigation, held open. The connector's own real INSERT (via generateBriefVersion's real
    // Phase 1 -> createGenerationRun) will then genuinely block on A's uncommitted row and, once A
    // commits, receive the real 23505 the partial unique index raises.
    const connA = await pool.connect();
    try {
      await connA.query('BEGIN');
      await connA.query(
        `INSERT INTO generation_run
           (investigation_id, outcome, started_at, completed_at, runtime_identifier)
         VALUES ($1, 'in-progress', now(), NULL, 'connection-a')`,
        [investigationId],
      );

      const resultPromise = createGenerationRunForInvestigation(investigationId);
      // Give the connector's own real INSERT a moment to reach the lock wait before A commits —
      // the ordering (A holds uncommitted, connector's real INSERT blocks, A commits, connector's
      // INSERT unblocks-and-rejects) is what forces the real 23505 deterministically.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await connA.query('COMMIT');

      const result = await resultPromise;
      expect(result.outcome).toBe('conflict');
      if (result.outcome === 'conflict') {
        expect(result.stillInProgress).toBe(true);
      }
    } finally {
      connA.release();
    }

    // No stray GenerationStep was written by the synchronization catch itself for the rejected
    // (connector-side) attempt — only connection A's own single seeded row exists.
    const rows = await pool.query(`SELECT count(*) FROM generation_run WHERE investigation_id = $1`, [
      investigationId,
    ]);
    expect(Number(rows.rows[0].count)).toBe(1);
  });
});

describe('createGenerationRunForInvestigation — finalization safety net (§4.2 step 5b)', () => {
  it('writes a terminal record only when the real persisted GenerationRun is still in-progress at rejection time', async () => {
    const investigationId = await seedOpenInvestigation();
    // Created INSIDE the mock, not before calling createGenerationRunForInvestigation — the real
    // connector's own eligibility check (an in-progress GenerationRun row for this Investigation)
    // runs BEFORE `generateBriefVersion` is ever invoked (§4.2 Step 2). Pre-creating the row here
    // would trip that check itself and short-circuit to `ineligible`, never reaching the mock.
    let run: Awaited<ReturnType<typeof createGenerationRun>>;
    vi.mocked(generateBriefVersion).mockImplementation(async (input) => {
      run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });
      input.onRunCreated?.(run);
      throw new Error('simulated meta-failure after run creation');
    });

    const result = await createGenerationRunForInvestigation(investigationId);
    expect(result).toEqual({ outcome: 'started', generationRunId: run!.id });

    // The safety net's write is asynchronous (attached only after runCreated resolves) — poll
    // briefly for the real terminal row rather than asserting instantaneously.
    let finalOutcome: string | null = null;
    for (let i = 0; i < 20; i++) {
      const row = await pool.query<{ outcome: string }>(`SELECT outcome FROM generation_run WHERE id = $1`, [
        run!.id,
      ]);
      finalOutcome = row.rows[0].outcome;
      if (finalOutcome === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(finalOutcome).toBe('failed');

    const steps = await pool.query<{ component: string; outcome: string }>(
      `SELECT component, outcome FROM generation_step WHERE generation_run_id = $1 ORDER BY step_index`,
      [run!.id],
    );
    expect(steps.rows).toHaveLength(1);
    expect(steps.rows[0].component).toBe('Generation Run Connector: finalization safety net');
    expect(steps.rows[0].outcome).toBe('failed');
  });

  it('performs NO further write when the real persisted GenerationRun is already terminal at rejection time (read-before-write, never error-class inference)', async () => {
    const investigationId = await seedOpenInvestigation();
    // Created INSIDE the mock — see the sibling test above for why (the connector's own
    // eligibility check runs before `generateBriefVersion` is invoked).
    let run: Awaited<ReturnType<typeof createGenerationRun>>;
    vi.mocked(generateBriefVersion).mockImplementation(async (input) => {
      run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });
      input.onRunCreated?.(run);
      // Simulate the run's OWN legitimate finalization already having committed before the
      // rejection reaches the safety net (the ordinary case).
      await pool.query(
        `UPDATE generation_run SET outcome = 'succeeded', completed_at = now() WHERE id = $1`,
        [run.id],
      );
      // The SAME error class a meta-failure would raise — proving the handler's decision is
      // driven by the read, not by the error's class/identity.
      throw new Error('simulated meta-failure after run creation');
    });

    const result = await createGenerationRunForInvestigation(investigationId);
    expect(result).toEqual({ outcome: 'started', generationRunId: run!.id });

    // Give the safety net a moment to run (it must observe 'succeeded' and do nothing further).
    await new Promise((resolve) => setTimeout(resolve, 300));

    const row = await pool.query<{ outcome: string }>(`SELECT outcome FROM generation_run WHERE id = $1`, [
      run!.id,
    ]);
    expect(row.rows[0].outcome).toBe('succeeded'); // unchanged by the safety net

    const steps = await pool.query(`SELECT count(*) FROM generation_step WHERE generation_run_id = $1`, [
      run!.id,
    ]);
    expect(Number(steps.rows[0].count)).toBe(0); // no fabricated terminal write
  });

  it('consumes and logs a rejection when the safety net\'s own getGenerationRunOutcome read itself throws, attempting no write and surfacing no unhandled rejection', async () => {
    const investigationId = await seedOpenInvestigation();
    const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });
    // Delete the row out from under the safety net's own read — getGenerationRunOutcome will throw
    // "no GenerationRun found" when it tries to read this id.
    await pool.query(`DELETE FROM generation_run WHERE id = $1`, [run.id]);

    vi.mocked(generateBriefVersion).mockImplementation(async (input) => {
      input.onRunCreated?.(run);
      throw new Error('simulated meta-failure after run creation');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const result = await createGenerationRunForInvestigation(investigationId);
      expect(result).toEqual({ outcome: 'started', generationRunId: run.id });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      errorSpy.mockRestore();
    }
  });
});

describe('createGenerationRunForInvestigation — non-blocking response proof (04-ROADMAP.md C2-S3 Tests)', () => {
  it('resolves via onRunCreated well before the underlying generateBriefVersion pipeline itself resolves', async () => {
    const investigationId = await seedOpenInvestigation();
    const PIPELINE_DELAY_MS = 500;
    let pipelineResolvedAt: number | null = null;
    // Captured so the test can await the background pipeline's real settlement before finishing —
    // otherwise its fire-and-forget createGenerationRun/finalizeGenerationRun calls land after
    // this test has already returned, racing the NEXT test's beforeEach TRUNCATE and throwing a
    // real FK violation against tables that no longer contain this test's rows.
    let pipelineSettled: Promise<unknown> = Promise.resolve();

    vi.mocked(generateBriefVersion).mockImplementation(async (input) => {
      pipelineSettled = (async () => {
        const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });
        input.onRunCreated?.(run);
        await new Promise((resolve) => setTimeout(resolve, PIPELINE_DELAY_MS));
        pipelineResolvedAt = Date.now();
        await finalizeGenerationRun({
          generationRunId: run.id,
          outcome: 'succeeded',
          briefVersionId: null,
          fenceToken: run.fenceToken,
        });
      })();
      return pipelineSettled as unknown as Promise<Awaited<ReturnType<typeof generateBriefVersion>>>;
    });

    const startedAt = Date.now();
    const result = await createGenerationRunForInvestigation(investigationId);
    const connectorResolvedAt = Date.now();

    expect(result.outcome).toBe('started');
    // The connector must have returned well before the pipeline's own artificial delay elapsed —
    // i.e., before the pipeline itself reached a terminal outcome.
    expect(connectorResolvedAt - startedAt).toBeLessThan(PIPELINE_DELAY_MS / 2);
    expect(pipelineResolvedAt).toBeNull();

    // Immediately after the POST-equivalent resolves 'started', a workspace read must show the
    // run genuinely still in-progress while the pipeline continues in the background — the
    // service-level proof that the response does not block on full completion.
    const workspace = await getInvestigationWorkspace(investigationId);
    expect(workspace).not.toBeNull();
    expect(workspace?.latestGenerationRun?.outcome).toBe('in-progress');
    expect(pipelineResolvedAt).toBeNull();

    // Let the background pipeline fully settle before this test ends, so its writes land inside
    // this test's own window, not the next test's post-TRUNCATE one.
    await pipelineSettled;
  });
});

describe('createGenerationRunForInvestigation — terminal-outcome lookup correctness (04-ROADMAP.md C2-S3 Tests)', () => {
  it('a conflicting run that has already reached a real terminal outcome by lookup time returns stillInProgress: false, not a crash or a fabricated in-progress conflict', async () => {
    const investigationId = await seedOpenInvestigation();

    const connA = await pool.connect();
    try {
      await connA.query('BEGIN');
      const insertResult = await connA.query<{ id: string }>(
        `INSERT INTO generation_run
           (investigation_id, outcome, started_at, completed_at, runtime_identifier)
         VALUES ($1, 'in-progress', now(), NULL, 'connection-a')
         RETURNING id`,
        [investigationId],
      );
      const conflictingRunId = insertResult.rows[0].id;

      const resultPromise = createGenerationRunForInvestigation(investigationId);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await connA.query('COMMIT');

      // Between the real 23505 rejection and the connector's own lookup, the conflicting run
      // reaches a real terminal outcome — the lookup must NOT be filtered on
      // outcome = 'in-progress' and must reflect this honestly.
      await pool.query(
        `UPDATE generation_run SET outcome = 'succeeded', completed_at = now() WHERE id = $1`,
        [conflictingRunId],
      );

      const result = await resultPromise;
      expect(result.outcome).toBe('conflict');
      if (result.outcome === 'conflict') {
        expect(result.existingGenerationRunId).toBe(conflictingRunId);
        expect(result.stillInProgress).toBe(false);
      }
    } finally {
      connA.release();
    }
  });

  it('throws a real, non-crashing error rather than dereferencing an empty rows[0] when the lookup finds no GenerationRun row after a unique violation', async () => {
    const investigationId = await seedOpenInvestigation();

    // Force the connector down the conflict-lookup branch with a real-shaped 23505 error, then
    // ensure zero GenerationRun rows exist for this investigation before the lookup runs — the
    // lookup's own `rows.length === 0` guard must fire, not an unguarded rows[0] dereference.
    const fakeUniqueViolation = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      { code: '23505', constraint: 'idx_generation_run_investigation_in_progress_unique' },
    );
    vi.mocked(generateBriefVersion).mockImplementation(async () => {
      throw fakeUniqueViolation;
    });

    await expect(createGenerationRunForInvestigation(investigationId)).rejects.toThrow(
      /Unique violation on .* but no GenerationRun row found on lookup/,
    );
  });
});
