import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';

/** R-4 validator coverage for `analyzeDemand` (QC finding F-4). `demandAnalyzer.test.ts` mocks
 *  `callForcedTool` entirely, which means `validateRawDemandAnalysis` — the real R-4 enum/shape
 *  validator — never actually runs in that file. This file instead mocks the Anthropic SDK one
 *  layer down (same technique as `llmClient.test.ts`), leaving the real `callForcedTool` AND the
 *  real `validateRawDemandAnalysis` closure it is called with in the loop, so malformed
 *  model-shaped input is genuinely rejected by production validation code, not by a test double
 *  standing in for it. Deliberately a separate file rather than added to `demandAnalyzer.test.ts`:
 *  that file's top-level `vi.mock('./llmClient.js', ...)` and this file's
 *  `vi.mock('@anthropic-ai/sdk', ...)` are mutually exclusive within one module graph. */
const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

const { analyzeDemand } = await import('./demandAnalyzer.js');

function toolUseResponse(input: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'analyze_demand', input }],
  };
}

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE claim_version_evidence, evidence_item, claim_version, claim, source_artifact, submission, investigation CASCADE',
  );
  createMock.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

async function seedInvestigationWithEvidence(excerpts: string[]): Promise<{ investigationId: string }> {
  const submission = await submitSources({
    origin: 'human',
    artifacts: [{ type: 'text', raw: excerpts.join('\n') }],
  });
  const sourceArtifactId = submission.sourceArtifactIds[0];
  for (const excerpt of excerpts) {
    await pool.query(
      `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label) VALUES ($1, $2, 'observation')`,
      [sourceArtifactId, excerpt],
    );
  }
  return { investigationId: submission.investigationId };
}

const validClassification = {
  level: 'Insufficient',
  narrative: 'placeholder',
  citedSignalIndices: [],
};

describe('analyzeDemand — real validateRawDemandAnalysis (R-4) execution', () => {
  it('rejects a demand signal with a type value outside the DemandSignalType enum, on both the original attempt and the one repair attempt', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    const badInput = {
      demandSignals: [{ type: 'made-up-signal-type', evidenceIndices: [0] }],
      confidenceClassification: validClassification,
    };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await analyzeDemand(investigationId);

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/"made-up-signal-type" is not a valid DemandSignalType/);
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal).toBeUndefined();
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a demand signal of type 'other-observed-behavior' with no otherTypeLabel", async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    const badInput = {
      demandSignals: [{ type: 'other-observed-behavior', evidenceIndices: [0] }],
      confidenceClassification: validClassification,
    };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await analyzeDemand(investigationId);

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(
      /otherTypeLabel is required when type is 'other-observed-behavior'/,
    );
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal).toBeUndefined();
  });

  it('rejects a demand signal with an empty evidenceIndices array', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    const badInput = {
      demandSignals: [{ type: 'workarounds', evidenceIndices: [] }],
      confidenceClassification: validClassification,
    };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await analyzeDemand(investigationId);

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/evidenceIndices must be a non-empty array/);
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal).toBeUndefined();
  });

  it('rejects a confidenceClassification.level value outside the DemandConfidenceLevel enum', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    const badInput = {
      demandSignals: [],
      confidenceClassification: { level: 'Definitely', narrative: 'placeholder', citedSignalIndices: [] },
    };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await analyzeDemand(investigationId);

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/"Definitely" is not a valid DemandConfidenceLevel/);
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal).toBeUndefined();
  });

  it('LlmValidationError path: rejects on the original attempt, the one repair attempt is ALSO invalid, and the run returns generationFailed:true with no negativeFindingSignal (R-4 fail-closed, no coercion)', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    createMock
      .mockResolvedValueOnce(
        toolUseResponse({ demandSignals: [{ type: 'bogus-1', evidenceIndices: [0] }], confidenceClassification: validClassification }),
      )
      .mockResolvedValueOnce(
        toolUseResponse({ demandSignals: [{ type: 'bogus-2', evidenceIndices: [0] }], confidenceClassification: validClassification }),
      );

    const result = await analyzeDemand(investigationId);

    // Exactly 2 calls (original + bounded repair) — proves the repair loop genuinely ran, not a
    // single-shot mock standing in for it.
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.generationFailed).toBe(true);
    expect(result.demandSignalCandidates).toHaveLength(0);
    expect(result.demandConfidenceClassificationCandidate.level).toBe('Insufficient');
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal).toBeUndefined();
    expect(result.generationFailureReason).toMatch(/failed schema validation after bounded repair/);
  });

  it('F-1: a generic (non-validation) API error thrown by the LLM call is caught by the outer try/catch and converts to generationFailed:true with no negativeFindingSignal, instead of propagating as an unhandled rejection', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    createMock.mockRejectedValueOnce(new Error('simulated Anthropic API outage'));

    const result = await analyzeDemand(investigationId);

    expect(result.generationFailed).toBe(true);
    expect(result.demandSignalCandidates).toHaveLength(0);
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal).toBeUndefined();
    expect(result.generationFailureReason).toMatch(
      /Demand analysis failed with an unexpected error: simulated Anthropic API outage/,
    );
  });

  it('F-2: when the model proposes demand signals but ALL of them are dropped by fail-closed evidenceIndices filtering (every cited index is out of range), the run returns generationFailed:true rather than a confident populated result', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['Only one real evidence item exists.']);
    // Structurally valid per validateRawDemandAnalysis (real numbers, non-empty array) — but every
    // index is out of range against the single seeded EvidenceItem, so the real post-validation
    // fail-closed filter in analyzeDemand must drop both signals.
    createMock.mockResolvedValueOnce(
      toolUseResponse({
        demandSignals: [
          { type: 'workarounds', evidenceIndices: [7] },
          { type: 'existing-spend', evidenceIndices: [8, 9] },
        ],
        confidenceClassification: {
          level: 'Emerging',
          narrative: 'Two signals indicate emerging demand.',
          citedSignalIndices: [0, 1],
        },
      }),
    );

    const result = await analyzeDemand(investigationId);

    // Only 1 call — this scenario passes validation on the first attempt; the failure comes from
    // post-validation entity filtering, not from the repair loop.
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.generationFailed).toBe(true);
    expect(result.demandSignalCandidates).toHaveLength(0);
    expect(result.demandConfidenceClassificationCandidate.citedDemandSignalIds).toHaveLength(0);
    expect(result.demandConfidenceClassificationCandidate.negativeFindingSignal).toBeUndefined();
    expect(result.generationFailureReason).toMatch(
      /All proposed demand signals were dropped by fail-closed per-entity evidence validation/,
    );
  });
});
