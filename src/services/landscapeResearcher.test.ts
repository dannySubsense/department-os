import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';

/** Mocked-LLM tests for `researchLandscape` — same rationale as `demandAnalyzer.test.ts`: the
 *  invariants under test (orchestration ordering, fail-closed per-entity filtering,
 *  `negativeFindingSignal` trigger semantics, generationFailed propagation) are deterministic
 *  properties of the orchestration/filtering logic, not of a real model's judgment.
 *
 *  Mocking decision for `searchWeb` (explicit, per task instructions): mocked entirely, not
 *  exercised via real deterministic fixtures the way `searchWeb.test.ts` does. `researchLandscape`
 *  does not own any of `searchWeb`'s own retrieval/classification logic (already covered by
 *  `searchWeb.test.ts`) — this file's job is to verify `researchLandscape`'s own orchestration
 *  (which queries it issues, how it collects `retrieved` SourceArtifact ids, how it wires the
 *  combined evidence array into the second LLM call), which is more cleanly isolated by treating
 *  `searchWeb` as a black box returning a `WebSearchQuery` shape than by re-deriving real adapter
 *  fixtures here. `extractClaimsAndEvidenceForSourceArtifacts` is mocked for the same reason —
 *  its own persistence/filtering behavior is covered by `extractClaimsAndEvidence.mocked.test.ts`. */
vi.mock('./llmClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmClient.js')>();
  return {
    ...actual,
    callForcedTool: vi.fn(),
  };
});
vi.mock('./searchWeb.js', () => ({
  searchWeb: vi.fn(),
}));
vi.mock('./extractClaimsAndEvidence.js', () => ({
  extractClaimsAndEvidenceForSourceArtifacts: vi.fn(),
}));

const { callForcedTool } = await import('./llmClient.js');
const { searchWeb } = await import('./searchWeb.js');
const { extractClaimsAndEvidenceForSourceArtifacts } = await import('./extractClaimsAndEvidence.js');
const { researchLandscape } = await import('./landscapeResearcher.js');

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE claim_version_evidence, evidence_item, claim_version, claim, source_artifact, submission, investigation CASCADE',
  );
  vi.mocked(callForcedTool).mockReset();
  vi.mocked(searchWeb).mockReset();
  vi.mocked(extractClaimsAndEvidenceForSourceArtifacts).mockReset();
});

/** Seeds an Investigation with one source and N EvidenceItem rows directly — matches
 *  `demandAnalyzer.test.ts`'s established pattern for seeding pre-existing evidence without
 *  re-exercising Slice 4's own extraction pipeline. */
async function seedInvestigationWithEvidence(
  excerpts: string[],
): Promise<{ investigationId: string; sourceArtifactId: string; evidenceItemIds: string[] }> {
  const submission = await submitSources({
    origin: 'human',
    artifacts: [{ type: 'text', raw: excerpts.join('\n') }],
  });
  const sourceArtifactId = submission.sourceArtifactIds[0];
  const evidenceItemIds: string[] = [];
  for (const excerpt of excerpts) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label)
       VALUES ($1, $2, 'observation') RETURNING id`,
      [sourceArtifactId, excerpt],
    );
    evidenceItemIds.push(result.rows[0].id);
  }
  return { investigationId: submission.investigationId, sourceArtifactId, evidenceItemIds };
}

function fakeWebSearchQuery(overrides: Partial<import('../types/domain.js').WebSearchQuery>) {
  return {
    id: `wsq-${Math.random()}`,
    investigationId: 'inv',
    generationRunId: 'run',
    query: 'placeholder',
    performedAt: new Date().toISOString(),
    results: [],
    limitations: [],
    ...overrides,
  };
}

describe('researchLandscape', () => {
  it('proposes queries, issues searchWeb sequentially per proposed query, and identifies ExistingSolutionCandidates over combined evidence', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigationWithEvidence([
      'Users complain there is no good tool for X.',
    ]);

    vi.mocked(callForcedTool)
      .mockResolvedValueOnce({
        attempts: 1,
        value: { queries: ['existing tools for X', 'competitors to X'] },
      })
      .mockResolvedValueOnce({
        attempts: 1,
        value: {
          existingSolutions: [
            {
              name: 'CompetitorApp',
              whatItAddresses: 'X, partially',
              howPeopleCopeNow: 'People use CompetitorApp and a spreadsheet',
              whereItsInadequate: 'No automation',
              evidenceIndices: [0, 1],
            },
          ],
        },
      });

    const landscapeSourceArtifactId = 'sa-landscape-1';
    vi.mocked(searchWeb)
      .mockResolvedValueOnce(
        fakeWebSearchQuery({
          query: 'existing tools for X',
          results: [
            { url: 'https://a.example', retrievedAt: new Date().toISOString(), status: 'retrieved', sourceArtifactId: landscapeSourceArtifactId },
          ],
        }),
      )
      .mockResolvedValueOnce(fakeWebSearchQuery({ query: 'competitors to X', results: [] }));

    const landscapeEvidenceItem = {
      id: 'ev-landscape-1',
      sourceArtifactId: landscapeSourceArtifactId,
      excerptOrSummary: 'CompetitorApp exists and is missing automation.',
      label: 'observation' as const,
    };
    vi.mocked(extractClaimsAndEvidenceForSourceArtifacts).mockResolvedValueOnce({
      claimVersions: [],
      evidenceItems: [landscapeEvidenceItem],
      problemStatementCandidates: [],
      generationFailed: false,
    });

    const result = await researchLandscape(investigationId, 'run-1');

    expect(vi.mocked(searchWeb)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(extractClaimsAndEvidenceForSourceArtifacts)).toHaveBeenCalledWith(
      investigationId,
      [landscapeSourceArtifactId],
    );
    expect(result.generationFailed).toBe(false);
    expect(result.webSearchQueries).toHaveLength(2);
    expect(result.landscapeEvidenceItems).toEqual([landscapeEvidenceItem]);
    expect(result.existingSolutionCandidates).toHaveLength(1);
    expect(result.existingSolutionCandidates[0].name).toBe('CompetitorApp');
    // Cites into the COMBINED (original + landscape) evidence array — index 0 is the original
    // evidence item, index 1 is the newly-extracted landscape evidence item.
    expect(result.existingSolutionCandidates[0].evidenceItemIds).toEqual([
      expect.any(String),
      landscapeEvidenceItem.id,
    ]);
    expect(result.negativeFindingSignal).toBeUndefined();
    void sourceArtifactId;
  });

  it('skips extraction and returns landscapeEvidenceItems: [] when zero WebSearchResults are retrieved', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['Some evidence about a problem.']);

    vi.mocked(callForcedTool)
      .mockResolvedValueOnce({ attempts: 1, value: { queries: ['a query with no hits'] } })
      .mockResolvedValueOnce({ attempts: 1, value: { existingSolutions: [] } });

    vi.mocked(searchWeb).mockResolvedValueOnce(
      fakeWebSearchQuery({ query: 'a query with no hits', results: [] }),
    );

    const result = await researchLandscape(investigationId, 'run-1');

    expect(vi.mocked(extractClaimsAndEvidenceForSourceArtifacts)).not.toHaveBeenCalled();
    expect(result.generationFailed).toBe(false);
    expect(result.landscapeEvidenceItems).toEqual([]);
    expect(result.existingSolutionCandidates).toEqual([]);
    expect(result.negativeFindingSignal).toBeDefined();
    expect(result.negativeFindingSignal?.statement.length).toBeGreaterThan(0);
  });

  it('returns generationFailed:true with no negativeFindingSignal when no evidence exists for the Investigation, without calling searchWeb', async () => {
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'no evidence yet' }] });

    const result = await researchLandscape(submission.investigationId, 'run-1');

    expect(result.generationFailed).toBe(true);
    expect(result.negativeFindingSignal).toBeUndefined();
    expect(callForcedTool).not.toHaveBeenCalled();
    expect(searchWeb).not.toHaveBeenCalled();
  });

  it('propagates generationFailed:true when the scoped extraction call itself fails, prefixing the reason', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['Evidence seeding a search.']);

    vi.mocked(callForcedTool).mockResolvedValueOnce({ attempts: 1, value: { queries: ['some query'] } });
    vi.mocked(searchWeb).mockResolvedValueOnce(
      fakeWebSearchQuery({
        query: 'some query',
        results: [{ url: 'https://a.example', retrievedAt: new Date().toISOString(), status: 'retrieved', sourceArtifactId: 'sa-x' }],
      }),
    );
    vi.mocked(extractClaimsAndEvidenceForSourceArtifacts).mockResolvedValueOnce({
      claimVersions: [],
      evidenceItems: [],
      problemStatementCandidates: [],
      generationFailed: true,
      generationFailureReason: 'simulated extraction failure',
    });

    const result = await researchLandscape(investigationId, 'run-1');

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/Landscape evidence extraction failed/);
    expect(result.generationFailureReason).toMatch(/simulated extraction failure/);
    expect(result.negativeFindingSignal).toBeUndefined();
    // The second LLM call (identify_existing_solutions) must never run once extraction failed.
    expect(callForcedTool).toHaveBeenCalledTimes(1);
  });

  it('uses non-empty evidenceItems from the scoped extraction call even when its inner generationFailed is true (zero problem-statement candidates is expected for landscape pages, not a failure)', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['Evidence seeding a search.']);

    vi.mocked(callForcedTool)
      .mockResolvedValueOnce({ attempts: 1, value: { queries: ['some query'] } })
      .mockResolvedValueOnce({ attempts: 1, value: { existingSolutions: [] } });
    vi.mocked(searchWeb).mockResolvedValueOnce(
      fakeWebSearchQuery({
        query: 'some query',
        results: [{ url: 'https://a.example', retrievedAt: new Date().toISOString(), status: 'retrieved', sourceArtifactId: 'sa-x' }],
      }),
    );
    const landscapeEvidenceItem = {
      id: 'ev-landscape-nonempty',
      sourceArtifactId: 'sa-x',
      excerptOrSummary: 'CompetitorApp describes its own product, not our problem.',
      label: 'observation' as const,
    };
    vi.mocked(extractClaimsAndEvidenceForSourceArtifacts).mockResolvedValueOnce({
      claimVersions: [],
      evidenceItems: [landscapeEvidenceItem],
      problemStatementCandidates: [],
      generationFailed: true,
      generationFailureReason:
        'The Extraction & Clustering Engine could not establish any specific, evidence-supported problem statement from the reachable source material.',
    });

    const result = await researchLandscape(investigationId, 'run-1');

    expect(result.generationFailed).toBe(false);
    expect(result.landscapeEvidenceItems).toEqual([landscapeEvidenceItem]);
  });

  it('F-2: when the model proposes existing solutions but ALL are dropped by fail-closed evidenceIndices filtering, returns generationFailed:true rather than a confident empty result', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One real evidence item.']);

    vi.mocked(callForcedTool)
      .mockResolvedValueOnce({ attempts: 1, value: { queries: ['a query'] } })
      .mockResolvedValueOnce({
        attempts: 1,
        value: {
          existingSolutions: [
            { name: 'Ghost', whatItAddresses: 'x', howPeopleCopeNow: 'y', whereItsInadequate: 'z', evidenceIndices: [99] },
          ],
        },
      });
    vi.mocked(searchWeb).mockResolvedValueOnce(fakeWebSearchQuery({ query: 'a query', results: [] }));

    const result = await researchLandscape(investigationId, 'run-1');

    expect(result.generationFailed).toBe(true);
    expect(result.existingSolutionCandidates).toEqual([]);
    expect(result.negativeFindingSignal).toBeUndefined();
    expect(result.generationFailureReason).toMatch(
      /All proposed existing solutions were dropped by fail-closed per-entity evidence validation/,
    );
  });

  it('F-1: an unexpected error escaping the function body converts to generationFailed:true rather than an unhandled throw', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['Evidence.']);

    vi.mocked(callForcedTool).mockRejectedValueOnce(new Error('simulated Anthropic API outage'));

    const result = await researchLandscape(investigationId, 'run-1');

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(
      /Landscape research failed with an unexpected error: simulated Anthropic API outage/,
    );
    expect(result.negativeFindingSignal).toBeUndefined();
  });

  it('BLOCKER-2: a mid-loop searchWeb throw returns the WebSearchQueries successfully issued before the throw, not an empty array', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['Evidence.']);

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: { queries: ['query 1', 'query 2', 'query 3', 'query 4'] },
    });

    const query1 = fakeWebSearchQuery({ query: 'query 1', results: [] });
    const query2 = fakeWebSearchQuery({ query: 'query 2', results: [] });
    vi.mocked(searchWeb)
      .mockResolvedValueOnce(query1)
      .mockResolvedValueOnce(query2)
      .mockRejectedValueOnce(new Error('simulated DB error on query 3'));

    const result = await researchLandscape(investigationId, 'run-1');

    expect(result.generationFailed).toBe(true);
    expect(result.webSearchQueries).toEqual([query1, query2]);
    expect(vi.mocked(searchWeb)).toHaveBeenCalledTimes(3);
  });
});
