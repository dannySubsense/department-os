import { beforeEach, describe, expect, it, vi } from 'vitest';

/** R-4 validator coverage for `generateGapHypotheses` (mirrors `demandAnalyzer.validation.test.ts`'s
 *  F-4 rationale, and QC's Slice 5 finding it addresses). `gapHypothesisGenerator.test.ts` mocks
 *  `callForcedTool` entirely, so `validateRawGapHypotheses` — the real R-4 enum/shape validator —
 *  never actually runs there. This file mocks the Anthropic SDK one layer down instead, leaving
 *  the real `callForcedTool` AND the real `validateRawGapHypotheses` closure in the loop. */
const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});

const { generateGapHypotheses } = await import('./gapHypothesisGenerator.js');

function toolUseResponse(input: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'identify_gap_hypotheses', input }],
  };
}

beforeEach(() => {
  createMock.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

const evidenceItems = [
  { id: 'ev-1', sourceArtifactId: 'sa-1', excerptOrSummary: 'excerpt', label: 'observation' as const },
];
const existingSolutionCandidates = [
  {
    localId: 'sol-1',
    name: 'X',
    whatItAddresses: 'y',
    howPeopleCopeNow: 'z',
    whereItsInadequate: 'w',
    evidenceItemIds: ['ev-1'] as [string, ...string[]],
  },
];

describe('generateGapHypotheses — real validateRawGapHypotheses (R-4) execution', () => {
  it('rejects a category value outside the 9-member GapCategory enum, on both the original and the one repair attempt', async () => {
    const badInput = {
      gapHypotheses: [{ category: 'made-up-category', statement: 'x', evidenceIndices: [0] }],
    };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(
      /gapHypotheses\[0\]\.category "made-up-category" is not a valid GapCategory/,
    );
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("rejects category: 'other' with no otherCategoryLabel", async () => {
    const badInput = {
      gapHypotheses: [{ category: 'other', statement: 'x', evidenceIndices: [0] }],
    };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(
      /gapHypotheses\[0\]\.otherCategoryLabel is required when category is 'other'/,
    );
  });

  it('rejects a hypothesis with an empty evidenceIndices array', async () => {
    const badInput = {
      gapHypotheses: [{ category: 'trust', statement: 'x', evidenceIndices: [] }],
    };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(
      /gapHypotheses\[0\]\.evidenceIndices must be a non-empty array/,
    );
  });

  it('rejects a hypothesis missing the required statement field', async () => {
    const badInput = {
      gapHypotheses: [{ category: 'trust', evidenceIndices: [0] }],
    };
    createMock.mockResolvedValueOnce(toolUseResponse(badInput)).mockResolvedValueOnce(toolUseResponse(badInput));

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/gapHypotheses\[0\]\.statement is missing\/invalid/);
  });

  it('LlmValidationError path: repair attempt is also invalid, run returns generationFailed:true with no negativeFindingSignal (R-4 fail-closed, no coercion)', async () => {
    createMock
      .mockResolvedValueOnce(
        toolUseResponse({ gapHypotheses: [{ category: 'bogus-1', statement: 'x', evidenceIndices: [0] }] }),
      )
      .mockResolvedValueOnce(
        toolUseResponse({ gapHypotheses: [{ category: 'bogus-2', statement: 'x', evidenceIndices: [0] }] }),
      );

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.generationFailed).toBe(true);
    expect(result.gapHypothesisCandidates).toEqual([]);
    expect(result.negativeFindingSignal).toBeUndefined();
    expect(result.generationFailureReason).toMatch(
      /Gap hypothesis generation failed schema validation after bounded repair/,
    );
  });
});
