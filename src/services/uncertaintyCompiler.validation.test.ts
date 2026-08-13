import { beforeEach, describe, expect, it, vi } from 'vitest';

/** R-4 validator coverage for `compileUncertainty` (mirrors `gapHypothesisGenerator.validation.test.ts`'s
 *  rationale, per this project's QC precedent flagging missing real-validator coverage as blocking).
 *  `uncertaintyCompiler.test.ts` mocks `callForcedTool` entirely, so `validateRawUncertainty` — the
 *  real R-4 structural validator — never actually runs there. This file mocks the Anthropic SDK
 *  one layer down instead, leaving the real `callForcedTool` AND the real `validateRawUncertainty`
 *  closure in the loop. */
const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

const { compileUncertainty } = await import('./uncertaintyCompiler.js');

function toolUseResponse(input: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'compile_uncertainty', input }],
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
const evidenceItems = [
  { id: 'ev-1', sourceArtifactId: 'sa-1', excerptOrSummary: 'Users report late payments.', label: 'observation' as const },
];
const claimVersions = [
  {
    id: 'cv-1',
    claimId: 'claim-1',
    versionNumber: 1,
    createdAt: new Date().toISOString(),
    text: 'Late payments are a recurring problem.',
    evidence: [{ evidenceItemId: 'ev-1', stance: 'supporting' as const }] as [
      { evidenceItemId: string; stance: 'supporting'; relevanceNote?: string },
    ],
    supersedesVersionId: null,
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

describe('compileUncertainty — real validateRawUncertainty (R-4) execution', () => {
  it('rejects a compile_uncertainty response where whatsUnknown is not an array, on both the original and the one repair attempt', async () => {
    const badInput = {
      whatsUnknown: 'not-an-array',
      whatWouldChangeConclusion: [],
      whatsUndeterminable: [],
    };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems,
      claimVersions,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/whatsUnknown is not an array/);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a compile_uncertainty response missing the required whatsUndeterminable field', async () => {
    const badInput = { whatsUnknown: [], whatWouldChangeConclusion: [] };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems,
      claimVersions,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/whatsUndeterminable is not an array/);
  });

  it('rejects a whatsUnknown entry that is a non-string item', async () => {
    const badInput = { whatsUnknown: [123], whatWouldChangeConclusion: [], whatsUndeterminable: [] };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems,
      claimVersions,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/whatsUnknown\[0\] is missing\/invalid/);
  });

  it('rejects a whatsUndeterminable entry that is an empty string', async () => {
    const badInput = { whatsUnknown: [], whatWouldChangeConclusion: [], whatsUndeterminable: [''] };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems,
      claimVersions,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/whatsUndeterminable\[0\] is missing\/invalid/);
  });

  it('LlmValidationError path: repair attempt is also invalid, run returns generationFailed:true, preserving code-derived seeded items rather than losing them', async () => {
    const badInput = { whatsUnknown: 'nope', whatWouldChangeConclusion: [], whatsUndeterminable: [] };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const contradictingClaimVersions = [
      {
        id: 'cv-contra',
        claimId: 'claim-contra',
        versionNumber: 1,
        createdAt: new Date().toISOString(),
        text: 'The market is large.',
        evidence: [
          { evidenceItemId: 'ev-1', stance: 'contradicting' as const },
        ] as [{ evidenceItemId: string; stance: 'contradicting'; relevanceNote?: string }],
        supersedesVersionId: null,
      },
    ];

    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems,
      claimVersions: contradictingClaimVersions as never,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(
      /Uncertainty compilation failed schema validation after bounded repair/,
    );
    // Code-derived seeded items are preserved even on the LLM-failure path.
    expect(
      result.uncertaintyStatementCandidate.whatsUnknown.some((s) => s.includes('The market is large.')),
    ).toBe(true);
  });
});
