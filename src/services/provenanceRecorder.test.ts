import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import {
  createGenerationRun,
  finalizeGenerationRun,
  recordGenerationStep,
  runStepWithProvenance,
} from './provenanceRecorder.js';
import { recordToolInvocation } from './provenanceContext.js';

/** Provenance Recorder — Architecture §1.9 point 4. Live-DB coverage of the GenerationRun/
 *  GenerationStep lifecycle: happy-path sequential steps, and the durable try/finally guarantee
 *  that a component throwing mid-execution still results in a finalized (not orphaned) run with a
 *  failed step recorded — not left dangling in 'in-progress'. */

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE generation_step, generation_run, investigation CASCADE');
});

async function insertInvestigation(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO investigation (status) VALUES ('open') RETURNING id`,
  );
  return result.rows[0].id;
}

/** Inserts a real, schema-valid brief_version row referencing the given investigation and
 *  generationRunId, for tests that need a genuine FK target for finalizeGenerationRun's
 *  briefVersionId (generation_run_brief_version_id_fkey, Slice 9 migration 007/008) rather than
 *  an unrelated randomUUID() that would violate the validated FK on a correctly-migrated DB. */
async function insertBriefVersion(investigationId: string, generationRunId: string): Promise<string> {
  const problemBrief = await pool.query<{ id: string }>(
    `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
    [investigationId],
  );
  const briefVersion = await pool.query<{ id: string }>(
    `INSERT INTO brief_version (
       problem_brief_id, version_number, generation_run_id,
       problem_statement_ids, claim_version_ids,
       demand_confidence_classification, uncertainty_statement, recommendation
     ) VALUES ($1, 1, $2, $3, $4, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
     RETURNING id`,
    [problemBrief.rows[0].id, generationRunId, [randomUUID()], [randomUUID()]],
  );
  return briefVersion.rows[0].id;
}

describe('createGenerationRun / recordGenerationStep / finalizeGenerationRun — happy path', () => {
  it('persists an in-progress run, appends sequential steps in order, and finalizes to succeeded', async () => {
    const investigationId = await insertInvestigation();

    const run = await createGenerationRun({
      investigationId,
      runtimeIdentifier: 'test-runtime-1',
    });
    expect(run.outcome).toBe('in-progress');
    expect(run.stepLog).toEqual([]);

    const persisted = await pool.query(`SELECT outcome, completed_at FROM generation_run WHERE id = $1`, [run.id]);
    expect(persisted.rows[0].outcome).toBe('in-progress');
    expect(persisted.rows[0].completed_at).toBeNull();

    await recordGenerationStep({
      generationRunId: run.id,
      step: {
        component: 'demandAnalyzer',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        outcome: 'succeeded',
        inputRefs: [],
        outputRefs: ['ref-1'],
      },
    });
    await recordGenerationStep({
      generationRunId: run.id,
      step: {
        component: 'uncertaintyCompiler',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        outcome: 'succeeded',
        inputRefs: ['ref-1'],
        outputRefs: ['ref-2'],
      },
    });

    const briefVersionId = await insertBriefVersion(investigationId, run.id);
    const finalized = await finalizeGenerationRun({
      generationRunId: run.id,
      outcome: 'succeeded',
      briefVersionId,
    });

    expect(finalized.outcome).toBe('succeeded');
    expect(finalized.briefVersionId).toBe(briefVersionId);
    expect(finalized.completedAt).not.toBe('');
    // Correct step ordering, matching insertion order.
    expect(finalized.stepLog.map((s) => s.component)).toEqual(['demandAnalyzer', 'uncertaintyCompiler']);

    const row = await pool.query(`SELECT outcome, completed_at FROM generation_run WHERE id = $1`, [run.id]);
    expect(row.rows[0].outcome).toBe('succeeded');
    expect(row.rows[0].completed_at).not.toBeNull();
  });

  it('rejects a second finalization of the same run as a programming-error-level assertion', async () => {
    const investigationId = await insertInvestigation();
    const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime-2' });

    await finalizeGenerationRun({ generationRunId: run.id, outcome: 'succeeded', briefVersionId: null });

    await expect(
      finalizeGenerationRun({ generationRunId: run.id, outcome: 'succeeded', briefVersionId: null }),
    ).rejects.toThrow(/already finalized/);
  });
});

describe('runStepWithProvenance — durable try/finally on throw (Architecture §1.9 point 4, Danny binding)', () => {
  it('records a failed GenerationStep with the thrown error message and leaves no in-progress run when a step throws mid-execution, when wrapped in finalizeGenerationRun\'s finally', async () => {
    const investigationId = await insertInvestigation();
    const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime-3' });

    let caught: unknown;
    try {
      await runStepWithProvenance({
        generationRunId: run.id,
        component: 'gapHypothesisGenerator',
        inputRefs: [],
        fn: async () => {
          throw new Error('forced mid-execution failure for provenance test');
        },
        getOutputRefs: () => [],
      });
    } catch (err) {
      caught = err;
    } finally {
      // Mirrors Slice 9's binding contract: finalizeGenerationRun runs in the finally block
      // wrapping the whole pipeline, so a component throw still reaches a terminal outcome.
      await finalizeGenerationRun({
        generationRunId: run.id,
        outcome: caught ? 'failed' : 'succeeded',
        briefVersionId: null,
      });
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('forced mid-execution failure for provenance test');

    const finalRow = await pool.query(`SELECT outcome FROM generation_run WHERE id = $1`, [run.id]);
    expect(finalRow.rows[0].outcome).toBe('failed'); // terminal, not dangling 'in-progress'

    const steps = await pool.query(
      `SELECT component, outcome, error FROM generation_step WHERE generation_run_id = $1 ORDER BY step_index`,
      [run.id],
    );
    expect(steps.rowCount).toBe(1);
    expect(steps.rows[0].component).toBe('gapHypothesisGenerator');
    expect(steps.rows[0].outcome).toBe('failed');
    expect(steps.rows[0].error).toBe('forced mid-execution failure for provenance test');
  });

  it('records a succeeded GenerationStep and returns fn\'s result on the happy path, capturing tool invocations made inside fn via the provenance collector scope it opens', async () => {
    const investigationId = await insertInvestigation();
    const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime-4' });

    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'landscapeResearcher',
      inputRefs: ['ref-a'],
      fn: async () => {
        recordToolInvocation({
          toolName: 'web_search',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          outcome: 'retrieved',
        });
        return 'step-result';
      },
      getOutputRefs: () => [],
    });

    expect(result).toBe('step-result');

    const steps = await pool.query(
      `SELECT component, outcome, step_data FROM generation_step WHERE generation_run_id = $1`,
      [run.id],
    );
    expect(steps.rowCount).toBe(1);
    expect(steps.rows[0].outcome).toBe('succeeded');
    expect(steps.rows[0].step_data.toolInvocations).toHaveLength(1);
    expect(steps.rows[0].step_data.toolInvocations[0].toolName).toBe('web_search');
  });

  it('QC BLOCKER-2 fix: two separate callForcedTool invocations of the SAME tool name within one step produce two separate SchemaValidationRecords, not one merged record with a fabricated attempts sequence', async () => {
    const investigationId = await insertInvestigation();
    const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime-5' });

    await runStepWithProvenance({
      generationRunId: run.id,
      component: 'gapHypothesisGenerator',
      inputRefs: [],
      fn: async () => {
        // First real callForcedTool() call to 'identify_existing_solutions': attempt 1 invalid,
        // attempt 2 (repair) valid — a real, correctly-bounded 2-attempt call.
        const firstCallId = 'call-1';
        recordToolInvocation({
          toolName: 'identify_existing_solutions',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          modelIdentifier: 'test-model',
          attemptNumber: 1,
          rawOutput: { bad: true },
          valid: false,
          validationError: 'first call, attempt 1: invalid',
          callId: firstCallId,
        });
        recordToolInvocation({
          toolName: 'identify_existing_solutions',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          modelIdentifier: 'test-model',
          attemptNumber: 2,
          rawOutput: { bad: false },
          valid: true,
          callId: firstCallId,
        });

        // Second, SEPARATE callForcedTool() call to the SAME tool name later in the same step:
        // valid on the first attempt — a real, correctly-bounded 1-attempt call.
        const secondCallId = 'call-2';
        recordToolInvocation({
          toolName: 'identify_existing_solutions',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          modelIdentifier: 'test-model',
          attemptNumber: 1,
          rawOutput: { bad: false },
          valid: true,
          callId: secondCallId,
        });
        return 'ok';
      },
      getOutputRefs: () => [],
    });

    const steps = await pool.query(
      `SELECT step_data FROM generation_step WHERE generation_run_id = $1`,
      [run.id],
    );
    expect(steps.rowCount).toBe(1);
    const validationRecords = steps.rows[0].step_data.validationRecords;

    // Two distinct records, not one merged record.
    expect(validationRecords).toHaveLength(2);
    for (const record of validationRecords) {
      expect(record.toolName).toBe('identify_existing_solutions');
      // Each real call is bounded by 1 + MAX_REPAIR_ATTEMPTS (= 2) attempts, never more.
      expect(record.attempts.length).toBeLessThanOrEqual(2);
    }

    const firstRecord = validationRecords.find((r: { attempts: unknown[] }) => r.attempts.length === 2);
    const secondRecord = validationRecords.find((r: { attempts: unknown[] }) => r.attempts.length === 1);
    expect(firstRecord).toBeDefined();
    expect(secondRecord).toBeDefined();
    // Correctly-bounded attempt-number sequence within each call, not the fabricated [1, 1, 2]
    // shape a toolName-only grouping would have produced by merging both calls.
    expect(firstRecord.attempts.map((a: { attemptNumber: number }) => a.attemptNumber)).toEqual([1, 2]);
    expect(firstRecord.finalOutcome).toBe('valid');
    expect(secondRecord.attempts.map((a: { attemptNumber: number }) => a.attemptNumber)).toEqual([1]);
    expect(secondRecord.finalOutcome).toBe('valid');
  });
});
