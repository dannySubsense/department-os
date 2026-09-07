import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';

/** Regression suite for the Slice 8 correction to `runStepWithProvenance`'s outcome
 *  classification, `error` propagation, and `outputRefs` population (Architecture §1.9 point 3;
 *  `GenerationStep` — src/types/domain.ts:382-397). Written independently of the concurrent
 *  implementation fix — every assertion is derived from the CONTRACT (domain.ts,
 *  02-ARCHITECTURE.md §1.9) and from the seven real components' actual failure shapes, not from
 *  reading provenanceRecorder.ts.
 *
 *  Why a new file rather than extending provenanceRecorder.test.ts: the existing file's throw-based
 *  and placeholder-string-return fixtures do not exercise the return-normally-with-
 *  `generationFailed: true` shape every real component actually produces (see file header there for
 *  the audit finding) — this file exists specifically to close that gap, not to duplicate the
 *  existing happy-path/throw/QC-BLOCKER-2 coverage, which remains valid and is left untouched. */

vi.mock('./llmClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmClient.js')>();
  return {
    ...actual,
    callForcedTool: vi.fn(),
  };
});

const { callForcedTool } = await import('./llmClient.js');
const { createGenerationRun, finalizeGenerationRun, recordGenerationStep, runStepWithProvenance } =
  await import('./provenanceRecorder.js');
const { recordToolInvocation } = await import('./provenanceContext.js');
const { generateGapHypotheses } = await import('./gapHypothesisGenerator.js');
const { analyzeDemand } = await import('./demandAnalyzer.js');
const { extractPersonalPull } = await import('./personalPullExtractor.js');
const { researchLandscape } = await import('./landscapeResearcher.js');
const { compileUncertainty } = await import('./uncertaintyCompiler.js');
const { generateRecommendation } = await import('./recommendationEngine.js');
const { extractClaimsAndEvidence } = await import('./extractClaimsAndEvidence.js');

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  vi.mocked(callForcedTool).mockReset();
  await pool.query('TRUNCATE generation_step, generation_run, investigation CASCADE');
});

afterEach(() => {
  vi.mocked(callForcedTool).mockReset();
});

async function insertInvestigation(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO investigation (status) VALUES ('open') RETURNING id`,
  );
  return result.rows[0].id;
}

async function newRun(runtimeIdentifier: string) {
  const investigationId = await insertInvestigation();
  return createGenerationRun({ investigationId, runtimeIdentifier });
}

async function fetchStep(generationRunId: string) {
  const rows = await pool.query(
    `SELECT component, outcome, error, output_refs, step_data FROM generation_step
     WHERE generation_run_id = $1 ORDER BY step_index`,
    [generationRunId],
  );
  return rows.rows;
}

/** Minimal, unused-field-safe stubs for the upstream Slice 4-6 result shapes that
 *  uncertaintyCompiler/recommendationEngine take as input — both components short-circuit on their
 *  own precondition guard before reading these deeply, so the exact field content doesn't matter,
 *  only that it type-checks as a genuinely-succeeded upstream result. */
const stubDemandAnalysis = {
  demandSignalCandidates: [],
  demandConfidenceClassificationCandidate: {
    level: 'Insufficient' as const,
    narrative: 'stub',
    citedDemandSignalIds: [],
  },
  generationFailed: false as const,
};
const stubLandscapeResearch = {
  webSearchQueries: [],
  existingSolutionCandidates: [],
  landscapeEvidenceItems: [],
  generationFailed: false as const,
};
const stubGapHypothesisGeneration = {
  gapHypothesisCandidates: [],
  generationFailed: false as const,
};

describe('runStepWithProvenance — outcome classification for a fn that RETURNS NORMALLY with generationFailed: true (defect 1 + 2)', () => {
  // (a) No tool invocation at all — gapHypothesisGenerator's own precondition guard
  // (gapHypothesisGenerator.ts:207-215) returns generationFailed: true with NO callForcedTool call.
  it('[a] gapHypothesisGenerator precondition failure (no existing-solution/demand input, no LLM call) records outcome failed with error from generationFailureReason — WOULD FAIL against unfixed code (currently records succeeded)', async () => {
    const run = await newRun('test-a-gap-precondition');

    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'gapHypothesisGenerator',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () =>
        generateGapHypotheses({
          investigationId: run.investigationId,
          existingSolutionCandidates: [],
          allEvidenceItems: [],
        }),
    });
    expect(result.generationFailed).toBe(true);

    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe(result.generationFailureReason);
    expect(step.error).toMatch(/nothing to reason a gap hypothesis from/);
  });

  // (b) The fail-closed-drop shape — a VALID callForcedTool response whose every candidate is
  // dropped by post-filtering (gapHypothesisGenerator.ts:265-275). Audit's highest-value single
  // test: currently recorded 'succeeded' because the wrapped fn returns normally and no
  // SchemaValidationRecord is ever marked invalid.
  it('[b] gapHypothesisGenerator fail-closed-drop (valid LLM output, all candidates dropped by evidence-index filter) records outcome failed — WOULD FAIL against unfixed code (currently records succeeded)', async () => {
    const run = await newRun('test-b-gap-fail-closed-drop');

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        gapHypotheses: [
          {
            category: 'capability',
            statement: 'A hypothesis citing an evidenceIndex that resolves to nothing.',
            evidenceIndices: [7], // out of range — allEvidenceItems has 1 entry (index 0 only)
          },
        ],
      },
    } as never);

    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'gapHypothesisGenerator',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () =>
        generateGapHypotheses({
          investigationId: run.investigationId,
          existingSolutionCandidates: [
            {
              localId: 'sol-1',
              name: 'CompetitorApp',
              whatItAddresses: 'X',
              howPeopleCopeNow: 'Manual work',
              whereItsInadequate: 'No automation',
              evidenceItemIds: ['ev-1'],
            },
          ],
          allEvidenceItems: [
            { id: 'ev-1', sourceArtifactId: 'sa-1', excerptOrSummary: 'x', label: 'observation' },
          ],
        }),
    });
    expect(result.generationFailed).toBe(true);
    expect(result.gapHypothesisCandidates).toHaveLength(0);

    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe(result.generationFailureReason);
    expect(step.error).toMatch(/dropped by fail-closed/);
  });
});

describe('runStepWithProvenance — per-component coverage of the no-invalid-attempt generationFailed: true shape (defect 1 + 2, requirement c)', () => {
  it('demandAnalyzer: no EvidenceItem for the Investigation (demandAnalyzer.ts precondition, no LLM call) records outcome failed', async () => {
    const run = await newRun('test-c-demand');
    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'demandAnalyzer',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () => analyzeDemand(run.investigationId),
    });
    expect(result.generationFailed).toBe(true);

    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe(result.generationFailureReason);
  });

  it('personalPullExtractor: DB read throws for a malformed investigationId (outer F-1 catch, personalPullExtractor.ts:159-167) records outcome failed', async () => {
    const run = await newRun('test-c-personal-pull');
    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'personalPullExtractor',
      inputRefs: [],
      getOutputRefs: () => [],
      // Not a valid UUID — getEvidenceForInvestigation's query throws, caught by the component's
      // own outer try/catch and converted to a normal generationFailed: true return, never an
      // unhandled throw out of fn.
      fn: () => extractPersonalPull('not-a-valid-uuid'),
    });
    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toBeDefined();

    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe(result.generationFailureReason);
  });

  it('landscapeResearcher: no EvidenceItem for the Investigation (landscapeResearcher.ts precondition, no LLM call) records outcome failed', async () => {
    const run = await newRun('test-c-landscape');
    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'landscapeResearcher',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () => researchLandscape(run.investigationId, run.id),
    });
    expect(result.generationFailed).toBe(true);

    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe(result.generationFailureReason);
  });

  // Genuinely distinct from [a] (precondition guard, gapHypothesisGenerator.ts:207-215, no LLM
  // call at all) and from [b] (valid LLM output, all candidates dropped by the fail-closed
  // evidenceIndices filter, gapHypothesisGenerator.ts:267-275). This exercises the OUTER catch
  // (gapHypothesisGenerator.ts:289-297): an unexpected non-LlmValidationError thrown by
  // callForcedTool itself propagates past the inner catch (which only handles LlmValidationError,
  // gapHypothesisGenerator.ts:236-245, rethrowing anything else) and is converted to a normal
  // generationFailed: true return by the component's own outer try/catch — never an unhandled
  // throw out of fn, so runStepWithProvenance's `catch` branch is not what's under test here.
  it('gapHypothesisGenerator: unexpected non-validation error from callForcedTool (outer catch, gapHypothesisGenerator.ts:289-297) records outcome failed', async () => {
    const run = await newRun('test-c-gap-outer-catch');

    vi.mocked(callForcedTool).mockRejectedValueOnce(new Error('simulated transport failure'));

    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'gapHypothesisGenerator',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () =>
        generateGapHypotheses({
          investigationId: run.investigationId,
          existingSolutionCandidates: [
            {
              localId: 'sol-1',
              name: 'CompetitorApp',
              whatItAddresses: 'X',
              howPeopleCopeNow: 'Manual work',
              whereItsInadequate: 'No automation',
              evidenceItemIds: ['ev-1'],
            },
          ],
          allEvidenceItems: [
            { id: 'ev-1', sourceArtifactId: 'sa-1', excerptOrSummary: 'x', label: 'observation' },
          ],
        }),
    });
    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/simulated transport failure/);

    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe(result.generationFailureReason);
  });

  it('uncertaintyCompiler: no ProblemStatement candidates and no EvidenceItems (uncertaintyCompiler.ts precondition, no LLM call) records outcome failed', async () => {
    const run = await newRun('test-c-uncertainty');
    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'uncertaintyCompiler',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () =>
        compileUncertainty({
          investigationId: run.investigationId,
          problemStatementCandidates: [],
          evidenceItems: [],
          claimVersions: [],
          demandAnalysis: stubDemandAnalysis,
          landscapeResearch: stubLandscapeResearch,
          gapHypothesisGeneration: stubGapHypothesisGeneration,
        }),
    });
    expect(result.generationFailed).toBe(true);

    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe(result.generationFailureReason);
  });

  it('recommendationEngine: no ProblemStatement candidates (recommendationEngine.ts precondition, no LLM call) records outcome failed', async () => {
    const run = await newRun('test-c-recommendation');
    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'recommendationEngine',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () =>
        generateRecommendation({
          problemStatementCandidates: [],
          demandAnalysis: stubDemandAnalysis,
          landscapeResearch: stubLandscapeResearch,
          gapHypothesisGeneration: stubGapHypothesisGeneration,
          uncertaintyStatementCandidate: {
            whatsUnknown: ['stub'],
            whatWouldChangeConclusion: ['stub'],
            whatsUndeterminable: ['stub'],
          },
        }),
    });
    expect(result.generationFailed).toBe(true);

    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe(result.generationFailureReason);
  });

  it('extractClaimsAndEvidence: no content-retrieved SourceArtifact for the Investigation (precondition, no LLM call) records outcome failed', async () => {
    const run = await newRun('test-c-extraction');
    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'extractClaimsAndEvidence',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () => extractClaimsAndEvidence(run.investigationId),
    });
    expect(result.generationFailed).toBe(true);

    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe(result.generationFailureReason);
  });
});

describe('runStepWithProvenance — outputRefs population (defect 3)', () => {
  // This test was written independently of the fix, assuming `getOutputRefs` would be the channel
  // for "which records this step produced" (the architecture-documented signature at the time
  // exposed no such channel — that information exists only in fn's own return value). The
  // Composer's ruling of 2026-08-14 settled it: `getOutputRefs: (result: T) => string[]` is a
  // REQUIRED field on the input, now specified at 02-ARCHITECTURE.md §1.9 point 4. The original
  // comment here described it as *optional* — corrected, since the fix made it required and every
  // call site in this file must supply one.
  it('outputRefs is populated with the ids of records a step genuinely produced, not hardcoded [] — WOULD FAIL against unfixed code (currently always [])', async () => {
    const run = await newRun('test-d-output-refs');

    await runStepWithProvenance({
      generationRunId: run.id,
      component: 'demandAnalyzer',
      inputRefs: [],
      getOutputRefs: (result: { id: string }) => [result.id],
      fn: async () => ({ id: 'produced-record-xyz' }),
    });

    const [step] = await fetchStep(run.id);
    expect(step.output_refs).toEqual(['produced-record-xyz']);
  });
});

describe('finalizeGenerationRun — run-level outcome/step-log consistency (requirement e)', () => {
  it('a run finalized as failed always has at least one step recorded as failed — no finalized run has outcome failed while every step reads succeeded', async () => {
    const run = await newRun('test-e-consistency');

    await runStepWithProvenance({
      generationRunId: run.id,
      component: 'demandAnalyzer',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: () => analyzeDemand(run.investigationId),
    });

    const finalized = await finalizeGenerationRun({
      generationRunId: run.id,
      outcome: 'failed',
      briefVersionId: null,
    });

    expect(finalized.outcome).toBe('failed');
    const steps = await fetchStep(run.id);
    const anyStepFailed = steps.some((s) => s.outcome === 'failed');
    // The specific defect under regression: a run finalized 'failed' whose only step was
    // misclassified 'succeeded' would violate this invariant.
    expect(anyStepFailed).toBe(true);
  });
});

describe('regression guard — schema-validation exhaustion still classifies as failed after the fix (requirement f)', () => {
  it('a step whose SchemaValidationRecord reaches finalOutcome invalid (exhausted repair attempts) still records outcome failed, with error set from the component-provided reason', async () => {
    const run = await newRun('test-f-regression-guard');

    const result = await runStepWithProvenance({
      generationRunId: run.id,
      component: 'demandAnalyzer',
      inputRefs: [],
      getOutputRefs: () => [],
      fn: async () => {
        const callId = randomUUID();
        // Mirrors callForcedTool's own instrumentation of an exhausted (1 + MAX_REPAIR_ATTEMPTS)
        // invalid sequence — attempt 1 invalid, attempt 2 (repair) also invalid.
        recordToolInvocation({
          toolName: 'classify_demand_signals',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          modelIdentifier: 'test-model',
          attemptNumber: 1,
          rawOutput: { bad: true },
          valid: false,
          validationError: 'attempt 1: invalid',
          callId,
        });
        recordToolInvocation({
          toolName: 'classify_demand_signals',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          modelIdentifier: 'test-model',
          attemptNumber: 2,
          rawOutput: { bad: true },
          valid: false,
          validationError: 'attempt 2 (repair): invalid',
          callId,
        });
        // Mirrors what demandAnalyzer's own LlmValidationError catch branch returns on exhaustion
        // (demandAnalyzer.ts:274-288): generationFailed: true, normal return, no throw.
        return {
          demandSignalCandidates: [],
          demandConfidenceClassificationCandidate: {
            level: 'Insufficient' as const,
            narrative: 'stub',
            citedDemandSignalIds: [],
          },
          generationFailed: true,
          generationFailureReason: 'Demand analysis failed schema validation after bounded repair: stub',
        };
      },
    });
    expect(result.generationFailed).toBe(true);

    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe(result.generationFailureReason);
    const validationRecords = step.step_data.validationRecords;
    expect(validationRecords).toHaveLength(1);
    expect(validationRecords[0].finalOutcome).toBe('invalid');
  });
});

describe('recordGenerationStep — direct-call regression guard for defect 1/2 (bypassing runStepWithProvenance)', () => {
  it('a directly-recorded GenerationStep with outcome: failed and error set persists both fields verbatim (sanity check on the persistence layer itself, independent of the classifier fix)', async () => {
    const run = await newRun('test-direct-record');
    await recordGenerationStep({
      generationRunId: run.id,
      step: {
        component: 'demandAnalyzer',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        outcome: 'failed',
        error: 'direct-record sanity check',
        inputRefs: [],
        outputRefs: [],
      },
    });
    const [step] = await fetchStep(run.id);
    expect(step.outcome).toBe('failed');
    expect(step.error).toBe('direct-record sanity check');
  });
});
