import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Mocked-LLM tests for `compileUncertainty` — same rationale as `gapHypothesisGenerator.test.ts`:
 *  this function takes all its evidence/candidate/upstream-result inputs as call-time parameters
 *  (Architecture §1.8 — neither Slice 7 component calls Slices 5/6's functions itself), so no DB
 *  seeding is needed here — plain in-memory fixtures are the actual call-time contract. This file
 *  focuses on the deterministic, code-level seeding logic (Architecture §1.8 step 2) and the
 *  generationFailed boundary (an upstream generationFailed:true is content, never propagated as
 *  this function's own generationFailed) — the invariants this design step exists to protect. */
vi.mock('./llmClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmClient.js')>();
  return {
    ...actual,
    callForcedTool: vi.fn(),
  };
});

const { callForcedTool, LlmValidationError } = await import('./llmClient.js');
const { compileUncertainty } = await import('./uncertaintyCompiler.js');

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

const cleanEvidenceItems = [
  { id: 'ev-1', sourceArtifactId: 'sa-1', excerptOrSummary: 'Users report late payments.', label: 'observation' as const },
];

const cleanClaimVersions = [
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

describe('compileUncertainty — deterministic pre-LLM seeding', () => {
  it('seeds whatsUndeterminable (not its own generationFailed) from upstream generationFailed:true on Demand/Landscape/Gap-Hypothesis inputs', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { whatsUnknown: [], whatWouldChangeConclusion: [], whatsUndeterminable: [] },
    });

    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems: cleanEvidenceItems,
      claimVersions: cleanClaimVersions,
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
        generationFailed: true,
        generationFailureReason: 'simulated landscape failure',
      },
      gapHypothesisGeneration: {
        gapHypothesisCandidates: [],
        generationFailed: true,
        generationFailureReason: 'simulated gap hypothesis failure',
      },
    });

    // compileUncertainty's OWN generationFailed must NOT become true just because upstream steps failed.
    expect(result.generationFailed).toBe(false);
    expect(
      result.uncertaintyStatementCandidate.whatsUndeterminable.some((s) =>
        s.includes('simulated demand analysis failure'),
      ),
    ).toBe(true);
    expect(
      result.uncertaintyStatementCandidate.whatsUndeterminable.some((s) =>
        s.includes('simulated landscape failure'),
      ),
    ).toBe(true);
    expect(
      result.uncertaintyStatementCandidate.whatsUndeterminable.some((s) =>
        s.includes('simulated gap hypothesis failure'),
      ),
    ).toBe(true);
  });

  it('surfaces contradicting ClaimVersionEvidenceRef stances into whatsUnknown, naming the claim, without flooding per-evidence-entry', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { whatsUnknown: [], whatWouldChangeConclusion: [], whatsUndeterminable: [] },
    });

    const contradictingClaimVersions = [
      {
        id: 'cv-contra',
        claimId: 'claim-contra',
        versionNumber: 1,
        createdAt: new Date().toISOString(),
        text: 'The market is large.',
        evidence: [
          { evidenceItemId: 'ev-1', stance: 'supporting' as const },
          { evidenceItemId: 'ev-2', stance: 'contradicting' as const },
          { evidenceItemId: 'ev-3', stance: 'contradicting' as const },
        ] as [{ evidenceItemId: string; stance: 'supporting' | 'contradicting'; relevanceNote?: string }, ...unknown[]],
        supersedesVersionId: null,
      },
    ];

    const { demandAnalysis, landscapeResearch, gapHypothesisGeneration } = okUpstream();
    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems: cleanEvidenceItems,
      claimVersions: contradictingClaimVersions as never,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
    });

    const matches = result.uncertaintyStatementCandidate.whatsUnknown.filter((s) =>
      s.includes('The market is large.'),
    );
    // One sentence per ClaimVersion with a contradiction, not one per contradicting evidence entry.
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatch(/contradicting evidence/);
  });

  it('surfaces assumption/unknown-labeled evidence as a summarized whatsUndeterminable entry', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { whatsUnknown: [], whatWouldChangeConclusion: [], whatsUndeterminable: [] },
    });

    const evidenceItems = [
      { id: 'ev-1', sourceArtifactId: 'sa-1', excerptOrSummary: 'We assume the market is $50M.', label: 'assumption' as const },
      { id: 'ev-2', sourceArtifactId: 'sa-1', excerptOrSummary: 'Unclear whether users would pay.', label: 'unknown' as const },
      { id: 'ev-3', sourceArtifactId: 'sa-1', excerptOrSummary: 'Confirmed fact.', label: 'fact' as const },
    ];

    const { demandAnalysis, landscapeResearch, gapHypothesisGeneration } = okUpstream();
    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems,
      claimVersions: cleanClaimVersions,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
    });

    const summaryMatches = result.uncertaintyStatementCandidate.whatsUndeterminable.filter((s) =>
      s.includes('assumption/unknown'),
    );
    expect(summaryMatches).toHaveLength(1);
    expect(summaryMatches[0]).toMatch(/^2 piece\(s\) of evidence/);
  });

  it('never-empty-array policy: a genuinely-clean category gets a sentinel sentence, never []', async () => {
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { whatsUnknown: [], whatWouldChangeConclusion: [], whatsUndeterminable: [] },
    });

    const { demandAnalysis, landscapeResearch, gapHypothesisGeneration } = okUpstream();
    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems: cleanEvidenceItems,
      claimVersions: cleanClaimVersions,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
    });

    expect(result.generationFailed).toBe(false);
    for (const category of [
      result.uncertaintyStatementCandidate.whatsUnknown,
      result.uncertaintyStatementCandidate.whatWouldChangeConclusion,
      result.uncertaintyStatementCandidate.whatsUndeterminable,
    ]) {
      expect(category.length).toBeGreaterThanOrEqual(1);
    }
    expect(result.uncertaintyStatementCandidate.whatWouldChangeConclusion[0]).toMatch(
      /No specific finding that would change the conclusion/,
    );
    expect(result.uncertaintyStatementCandidate.whatsUndeterminable[0]).toMatch(
      /No unresolved what's-undeterminable items/,
    );
  });

  it('F-1: returns generationFailed:true with a defensive-guard reason when both problemStatementCandidates and evidenceItems are empty, without calling the LLM', async () => {
    const { demandAnalysis, landscapeResearch, gapHypothesisGeneration } = okUpstream();
    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates: [],
      evidenceItems: [],
      claimVersions: [],
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/uncertainty compilation cannot run/);
    expect(callForcedTool).not.toHaveBeenCalled();
  });

  it('F-1: LlmValidationError from the forced-tool call returns generationFailed:true while preserving code-derived seeded items', async () => {
    vi.mocked(callForcedTool).mockRejectedValueOnce(
      new LlmValidationError('schema mismatch after repair', { malformed: true }, 3),
    );

    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems: cleanEvidenceItems,
      claimVersions: cleanClaimVersions,
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
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/failed schema validation after bounded repair/);
    expect(
      result.uncertaintyStatementCandidate.whatsUndeterminable.some((s) =>
        s.includes('simulated demand analysis failure'),
      ),
    ).toBe(true);
  });

  it('F-1: an unexpected error escaping the function body converts to generationFailed:true rather than an unhandled throw', async () => {
    vi.mocked(callForcedTool).mockRejectedValueOnce(new Error('simulated Anthropic API outage'));

    const { demandAnalysis, landscapeResearch, gapHypothesisGeneration } = okUpstream();
    const result = await compileUncertainty({
      investigationId: 'inv-1',
      problemStatementCandidates,
      evidenceItems: cleanEvidenceItems,
      claimVersions: cleanClaimVersions,
      demandAnalysis,
      landscapeResearch,
      gapHypothesisGeneration,
    });

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(
      /Uncertainty compilation failed with an unexpected error: simulated Anthropic API outage/,
    );
  });
});
