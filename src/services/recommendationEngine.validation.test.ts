import { beforeEach, describe, expect, it, vi } from 'vitest';

/** R-4 validator coverage for `generateRecommendation` (mirrors `uncertaintyCompiler.validation.test.ts`'s
 *  rationale). `recommendationEngine.test.ts` mocks `callForcedTool` entirely, so
 *  `validateRawRecommendation` — the real R-4 enum/shape validator — never actually runs there.
 *  This file mocks the Anthropic SDK one layer down instead, leaving the real `callForcedTool` AND
 *  the real `validateRawRecommendation` closure in the loop. */
const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

const { generateRecommendation } = await import('./recommendationEngine.js');

function toolUseResponse(input: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'generate_recommendation', input }],
  };
}

beforeEach(() => {
  createMock.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

const problemStatementCandidates = [
  {
    whoExperiencesIt: 'Small business owners',
    contextOrWorkflow: 'Invoicing clients',
    consequenceOrFriction: 'Late payments',
    supportingClaimVersionIds: ['cv-1'] as [string, ...string[]],
  },
];
const demandAnalysis = {
  demandSignalCandidates: [],
  demandConfidenceClassificationCandidate: { level: 'Insufficient' as const, narrative: 'n/a', citedDemandSignalIds: [] },
  generationFailed: false,
};
const landscapeResearch = {
  webSearchQueries: [],
  existingSolutionCandidates: [],
  landscapeEvidenceItems: [],
  generationFailed: false,
};
const gapHypothesisGeneration = { gapHypothesisCandidates: [], generationFailed: false };
const uncertaintyStatementCandidate = {
  whatsUnknown: ['Whether the finding generalizes.'],
  whatWouldChangeConclusion: ['A confirmed paid pilot.'],
  whatsUndeterminable: ['Retention cannot be assessed.'],
};

describe('generateRecommendation — real validateRawRecommendation (R-4) execution', () => {
  it('rejects a decision value outside the Approve|Reject|Watch enum, on both the original and the one repair attempt', async () => {
    const badInput = { decision: 'Maybe', rationale: 'Some rationale referencing evidence.' };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await generateRecommendation({
      problemStatementCandidates,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
      uncertaintyStatementCandidate,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.recommendationCandidate.decision).toBe('Watch');
    expect(result.generationFailureReason).toMatch(/decision must be one of Approve, Reject, Watch/);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a response with an empty rationale string', async () => {
    const badInput = { decision: 'Approve', rationale: '' };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await generateRecommendation({
      problemStatementCandidates,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
      uncertaintyStatementCandidate,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/rationale must be a non-empty string/);
  });

  it('rejects a response missing the required decision field', async () => {
    const badInput = { rationale: 'A rationale with no decision.' };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await generateRecommendation({
      problemStatementCandidates,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
      uncertaintyStatementCandidate,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/decision must be one of Approve, Reject, Watch/);
  });

  it('LlmValidationError path: repair attempt is also invalid, run returns generationFailed:true with the documented Watch fallback (R-4 fail-closed, no coercion)', async () => {
    createMock
      .mockResolvedValueOnce(toolUseResponse({ decision: 'bogus-1', rationale: 'x' }))
      .mockResolvedValueOnce(toolUseResponse({ decision: 'bogus-2', rationale: 'x' }));

    const result = await generateRecommendation({
      problemStatementCandidates,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
      uncertaintyStatementCandidate,
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.generationFailed).toBe(true);
    expect(result.recommendationCandidate.decision).toBe('Watch');
    expect(result.generationFailureReason).toMatch(
      /Recommendation generation failed schema validation after bounded repair/,
    );
  });
});
