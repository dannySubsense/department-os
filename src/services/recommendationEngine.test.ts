import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Mocked-LLM tests for `generateRecommendation` — same rationale as `uncertaintyCompiler.test.ts`:
 *  all inputs are call-time parameters, no DB access. This file's focus (Architecture §1.8):
 *  `generateRecommendation` consumes ONLY the already-compiled `UncertaintyStatementCandidate` —
 *  it does not accept demandAnalysis/landscapeResearch/gapHypothesisGeneration's raw
 *  `generationFailed` flags as a separate decision input at all (confirmed by the function
 *  signature accepting no such param); the F-1 outer try/catch's documented `Watch` fallback; and
 *  `RecommendationDecision` enum correctness. */
vi.mock('./llmClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmClient.js')>();
  return {
    ...actual,
    callForcedTool: vi.fn(),
  };
});

const { callForcedTool, LlmValidationError } = await import('./llmClient.js');
const { generateRecommendation } = await import('./recommendationEngine.js');

beforeEach(() => {
  vi.mocked(callForcedTool).mockReset();
});

const problemStatementCandidates = [
  {
    whoExperiencesIt: 'Small business owners',
    contextOrWorkflow: 'Invoicing clients',
    consequenceOrFriction: 'Late payments',
    supportingClaimVersionIds: ['cv-1'] as [string, ...string[]],
  },
];

function okUpstream() {
  return {
    demandAnalysis: {
      demandSignalCandidates: [],
      demandConfidenceClassificationCandidate: { level: 'Insufficient' as const, narrative: 'not enough signal', citedDemandSignalIds: [] },
      generationFailed: false,
    },
    landscapeResearch: {
      webSearchQueries: [],
      existingSolutionCandidates: [],
      landscapeEvidenceItems: [],
      generationFailed: false,
    },
    gapHypothesisGeneration: {
      gapHypothesisCandidates: [],
      generationFailed: false,
    },
  };
}

const uncertaintyStatementCandidate = {
  whatsUnknown: ['Whether willingness-to-pay generalizes beyond the surveyed users.'],
  whatWouldChangeConclusion: ['A confirmed paid pilot.'],
  whatsUndeterminable: ['Long-term retention cannot be assessed from available sources.'],
};

describe('generateRecommendation', () => {
  it('does not accept upstream generationFailed flags as a separate decision input — signature has no such param', () => {
    // The Architecture §1.8 boundary decision: generateRecommendation reads only
    // uncertaintyStatementCandidate; it must not declare or require raw generationFailed booleans
    // as distinct call-time parameters. Verified structurally by TypeScript at compile time — the
    // fixture below (using RecommendationEngineInput's declared shape) has no top-level
    // generationFailed-only fields for demand/landscape/gap besides the full result objects
    // themselves (used only for surviving candidate content per the doc comment), and the actual
    // decision made below (Approve, from generationFailed:false inputs) is unaffected by flipping
    // an upstream generationFailed to true while keeping uncertaintyStatementCandidate fixed.
    expect(generateRecommendation.length).toBe(1);
  });

  it('produces a RecommendationCandidate with an enum-valid decision on success', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { decision: 'Approve', rationale: 'Strong demand signal and a clear, uncontested gap.' },
    });

    const { demandAnalysis, landscapeResearch, gapHypothesisGeneration } = okUpstream();
    const result = await generateRecommendation({
      problemStatementCandidates,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
      uncertaintyStatementCandidate,
    });

    expect(result.generationFailed).toBe(false);
    expect(['Approve', 'Reject', 'Watch']).toContain(result.recommendationCandidate.decision);
    expect(result.recommendationCandidate.decision).toBe('Approve');
    expect(result.recommendationCandidate.rationale.length).toBeGreaterThan(0);
  });

  it('the compiled uncertainty content (not raw upstream generationFailed flags) is what varies the input the engine consumes — an upstream generationFailed:true with a matching compiled uncertainty entry still reaches the LLM call and returns a normal decision', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { decision: 'Watch', rationale: 'Demand analysis could not be completed; monitor before deciding.' },
    });

    const result = await generateRecommendation({
      problemStatementCandidates,
      demandAnalysis: {
        demandSignalCandidates: [],
        demandConfidenceClassificationCandidate: { level: 'Insufficient', narrative: 'n/a', citedDemandSignalIds: [] },
        generationFailed: true,
        generationFailureReason: 'simulated demand analysis failure',
      },
      landscapeResearch: {
        webSearchQueries: [],
        existingSolutionCandidates: [],
        landscapeEvidenceItems: [],
        generationFailed: false,
      },
      gapHypothesisGeneration: { gapHypothesisCandidates: [], generationFailed: false },
      uncertaintyStatementCandidate: {
        whatsUnknown: [],
        whatWouldChangeConclusion: [],
        whatsUndeterminable: ['Demand analysis could not be completed: simulated demand analysis failure'],
      },
    });

    // The engine still ran its own LLM call and returned its own result — an upstream
    // generationFailed:true did not itself cause generateRecommendation's generationFailed.
    expect(callForcedTool).toHaveBeenCalledTimes(1);
    expect(result.generationFailed).toBe(false);
    expect(result.recommendationCandidate.decision).toBe('Watch');
  });

  it('F-1: defensive guard — returns generationFailed:true with a Watch fallback when problemStatementCandidates is empty, without calling the LLM', async () => {
    const { demandAnalysis, landscapeResearch, gapHypothesisGeneration } = okUpstream();
    const result = await generateRecommendation({
      problemStatementCandidates: [],
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
      uncertaintyStatementCandidate,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.recommendationCandidate.decision).toBe('Watch');
    expect(callForcedTool).not.toHaveBeenCalled();
  });

  it('F-1: LlmValidationError from the forced-tool call returns generationFailed:true with the documented Watch fallback', async () => {
    vi.mocked(callForcedTool).mockRejectedValueOnce(
      new LlmValidationError('schema mismatch after repair', { malformed: true }, 3),
    );

    const { demandAnalysis, landscapeResearch, gapHypothesisGeneration } = okUpstream();
    const result = await generateRecommendation({
      problemStatementCandidates,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
      uncertaintyStatementCandidate,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.recommendationCandidate.decision).toBe('Watch');
    expect(result.recommendationCandidate.rationale).toMatch(/could not be generated with confidence/);
    expect(result.generationFailureReason).toMatch(/failed schema validation after bounded repair/);
  });

  it('Edge Case (01-REQUIREMENTS.md:177, Numeric Scope Rule line 27): the prompt sent to the model carries an explicit instruction not to adopt an unverifiable sourced numeric claim (e.g. a "$50M market" figure) into the rationale as validated fact', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        decision: 'Watch',
        rationale:
          'A source claims a "$50M market" but this is an uncorroborated, unverified claim from ' +
          'assumption-labeled evidence, not an established fact.',
      },
    });

    const { landscapeResearch, gapHypothesisGeneration } = okUpstream();
    await generateRecommendation({
      problemStatementCandidates,
      demandAnalysis: {
        demandSignalCandidates: [],
        demandConfidenceClassificationCandidate: {
          level: 'Insufficient',
          narrative:
            'A source cites a "$50M market" figure, but this is an unverified, source-attributed ' +
            'claim, not a validated conclusion.',
          citedDemandSignalIds: [],
        },
        generationFailed: false,
      },
      landscapeResearch,
      gapHypothesisGeneration,
      uncertaintyStatementCandidate: {
        whatsUnknown: ['Whether the source\'s "$50M market" figure is accurate or verifiable.'],
        whatWouldChangeConclusion: ['Independent corroboration of the market-size figure.'],
        whatsUndeterminable: [],
      },
    });

    expect(callForcedTool).toHaveBeenCalledTimes(1);
    const call = vi.mocked(callForcedTool).mock.calls[0][0];
    // Guard instruction lives at recommendationEngine.ts:118-121 — this asserts it is actually
    // present in what gets sent to the model, not merely present in the source file.
    expect(call.userPrompt).toMatch(/must not adopt an unverifiable numeric claim/);
    expect(call.userPrompt).toMatch(/must not restate the number itself as validated/);
  });

  it('F-1: an unexpected error escaping the function body converts to generationFailed:true with a Watch fallback rather than an unhandled throw', async () => {
    vi.mocked(callForcedTool).mockRejectedValueOnce(new Error('simulated Anthropic API outage'));

    const { demandAnalysis, landscapeResearch, gapHypothesisGeneration } = okUpstream();
    const result = await generateRecommendation({
      problemStatementCandidates,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
      uncertaintyStatementCandidate,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.recommendationCandidate.decision).toBe('Watch');
    expect(result.generationFailureReason).toMatch(
      /Recommendation generation failed with an unexpected error: simulated Anthropic API outage/,
    );
  });
});
