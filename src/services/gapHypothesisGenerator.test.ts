import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Mocked-LLM tests for `generateGapHypotheses` — same rationale as `demandAnalyzer.test.ts`.
 *  Unlike `researchLandscape`/`analyzeDemand`, this function takes all its evidence/candidate
 *  inputs as call-time parameters rather than reading from the DB (Architecture §1.7 — the
 *  Slice-5 dependency is expressed as optional parameters, not an internal fetch), so no DB
 *  seeding is needed here — plain in-memory fixtures are the actual call-time contract. */
vi.mock('./llmClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmClient.js')>();
  return {
    ...actual,
    callForcedTool: vi.fn(),
  };
});

const { callForcedTool } = await import('./llmClient.js');
const { generateGapHypotheses } = await import('./gapHypothesisGenerator.js');

beforeEach(() => {
  vi.mocked(callForcedTool).mockReset();
});

afterEach(() => {
  vi.mocked(callForcedTool).mockReset();
});

const evidenceItems = [
  { id: 'ev-1', sourceArtifactId: 'sa-1', excerptOrSummary: 'CompetitorApp has no automation.', label: 'observation' as const },
  { id: 'ev-2', sourceArtifactId: 'sa-2', excerptOrSummary: 'Users want automation.', label: 'observation' as const },
];

const existingSolutionCandidates = [
  {
    localId: 'sol-1',
    name: 'CompetitorApp',
    whatItAddresses: 'X',
    howPeopleCopeNow: 'Manual work',
    whereItsInadequate: 'No automation',
    evidenceItemIds: ['ev-1'] as [string, ...string[]],
  },
];

describe('generateGapHypotheses', () => {
  it('produces GapHypothesisCandidates each tagged with exactly one GapCategory and citing evidence into allEvidenceItems', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        gapHypotheses: [
          { category: 'capability', statement: 'No solution offers automated X.', evidenceIndices: [0, 1] },
        ],
      },
    });

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(result.generationFailed).toBe(false);
    expect(result.gapHypothesisCandidates).toHaveLength(1);
    expect(result.gapHypothesisCandidates[0].category).toBe('capability');
    expect(result.gapHypothesisCandidates[0].evidenceItemIds).toEqual(['ev-1', 'ev-2']);
    expect(result.negativeFindingSignal).toBeUndefined();
  });

  it("requires otherCategoryLabel to be carried through when category is 'other'", async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        gapHypotheses: [
          {
            category: 'other',
            otherCategoryLabel: 'regulatory-fit',
            statement: 'No solution handles the regional compliance requirement.',
            evidenceIndices: [0],
          },
        ],
      },
    });

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(result.gapHypothesisCandidates[0].category).toBe('other');
    expect(result.gapHypothesisCandidates[0].otherCategoryLabel).toBe('regulatory-fit');
  });

  it('returns generationFailed:true with no LLM call when both existingSolutionCandidates and demandSignalCandidates are empty/absent', async () => {
    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates: [],
      allEvidenceItems: evidenceItems,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.gapHypothesisCandidates).toEqual([]);
    expect(result.negativeFindingSignal).toBeUndefined();
    expect(callForcedTool).not.toHaveBeenCalled();
  });

  it('still runs (does NOT short-circuit) when existingSolutionCandidates is empty but demandSignalCandidates is non-empty', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { gapHypotheses: [] },
    });

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates: [],
      allEvidenceItems: evidenceItems,
      demandSignalCandidates: [{ localId: 'ds-1', type: 'paid-labor', evidenceItemIds: ['ev-2'] as [string, ...string[]] }],
    });

    expect(callForcedTool).toHaveBeenCalledTimes(1);
    expect(result.generationFailed).toBe(false);
    expect(result.gapHypothesisCandidates).toEqual([]);
    expect(result.negativeFindingSignal).toBeDefined();
  });

  it('drops a gap hypothesis whose evidenceIndices resolve to zero valid evidence items (fail-closed, not persisted-empty)', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        gapHypotheses: [
          { category: 'trust', statement: 'A real gap.', evidenceIndices: [0] },
          { category: 'price', statement: 'A hallucinated gap.', evidenceIndices: [99] },
        ],
      },
    });

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(result.gapHypothesisCandidates).toHaveLength(1);
    expect(result.gapHypothesisCandidates[0].category).toBe('trust');
  });

  it('F-2: when the model proposes hypotheses but ALL are dropped by fail-closed evidenceIndices filtering, returns generationFailed:true rather than a confident empty result', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        gapHypotheses: [
          { category: 'usability', statement: 'Ghost gap A.', evidenceIndices: [99] },
          { category: 'workflow-fit', statement: 'Ghost gap B.', evidenceIndices: [98, 97] },
        ],
      },
    });

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.gapHypothesisCandidates).toEqual([]);
    expect(result.negativeFindingSignal).toBeUndefined();
    expect(result.generationFailureReason).toMatch(
      /All proposed gap hypotheses were dropped by fail-closed per-entity evidence validation/,
    );
  });

  it('populates negativeFindingSignal iff gapHypothesisCandidates is empty and generationFailed is false', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { gapHypotheses: [] },
    });

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(result.generationFailed).toBe(false);
    expect(result.gapHypothesisCandidates).toEqual([]);
    expect(result.negativeFindingSignal).toBeDefined();
    expect(result.negativeFindingSignal?.statement.length).toBeGreaterThan(0);
  });

  it('F-1: a generic (non-validation) API error thrown by the LLM call is caught by the outer try/catch and converts to generationFailed:true, instead of propagating as an unhandled rejection', async () => {
    vi.mocked(callForcedTool).mockRejectedValueOnce(new Error('simulated Anthropic API outage'));

    const result = await generateGapHypotheses({
      investigationId: 'inv-1',
      existingSolutionCandidates,
      allEvidenceItems: evidenceItems,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.gapHypothesisCandidates).toEqual([]);
    expect(result.negativeFindingSignal).toBeUndefined();
    expect(result.generationFailureReason).toMatch(
      /Gap hypothesis generation failed with an unexpected error: simulated Anthropic API outage/,
    );
  });
});
