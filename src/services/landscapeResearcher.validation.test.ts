import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';

/** R-4 validator coverage for `researchLandscape` (mirrors `demandAnalyzer.validation.test.ts`'s
 *  F-4 rationale). `landscapeResearcher.test.ts` mocks `callForcedTool` entirely, so
 *  `validateRawProposedQueries`/`validateRawExistingSolutions` — the real R-4 structural
 *  validators — never actually run in that file. This file mocks the Anthropic SDK one layer
 *  down instead, leaving the real `callForcedTool` AND the real validator closures in the loop.
 *
 *  `searchWeb` is mocked at the module level here too (not the SDK) — `searchWebAdapter.ts` uses
 *  the SAME `@anthropic-ai/sdk` client `callForcedTool` does, so mocking only the SDK would also
 *  drive `searchWeb`'s own retrieval call through this file's mock, entangling two independent
 *  validation surfaces. Mocking `searchWeb` directly isolates this file to exactly
 *  `researchLandscape`'s own two forced-tool calls (propose_landscape_queries,
 *  identify_existing_solutions), which is what R-4 coverage is actually about here. */
const createMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: createMock };
    },
  };
});
vi.mock('./searchWeb.js', () => ({
  searchWeb: vi.fn(),
}));
vi.mock('./extractClaimsAndEvidence.js', () => ({
  extractClaimsAndEvidenceForSourceArtifacts: vi.fn(),
}));

const { researchLandscape } = await import('./landscapeResearcher.js');
const { searchWeb } = await import('./searchWeb.js');

function toolUseResponse(name: string, input: unknown) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_1', name, input }],
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
  vi.mocked(searchWeb).mockReset();
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

describe('researchLandscape — real validateRawProposedQueries/validateRawExistingSolutions (R-4) execution', () => {
  it('rejects a propose_landscape_queries response with an empty queries array, on both the original and the one repair attempt', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    const badInput = { queries: [] };
    createMock
      .mockResolvedValueOnce(toolUseResponse('propose_landscape_queries', badInput))
      .mockResolvedValueOnce(toolUseResponse('propose_landscape_queries', badInput));

    const result = await researchLandscape(investigationId, 'run-1');

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/queries must be a non-empty array/);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(searchWeb).not.toHaveBeenCalled();
  });

  it('rejects a propose_landscape_queries response containing a non-string query entry', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    const badInput = { queries: [123] };
    createMock
      .mockResolvedValueOnce(toolUseResponse('propose_landscape_queries', badInput))
      .mockResolvedValueOnce(toolUseResponse('propose_landscape_queries', badInput));

    const result = await researchLandscape(investigationId, 'run-1');

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(/queries\[0\] is missing\/invalid/);
  });

  it('rejects an identify_existing_solutions entry with a missing required field (whereItsInadequate)', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    vi.mocked(searchWeb).mockResolvedValueOnce({
      id: 'wsq-1',
      investigationId,
      generationRunId: 'run-1',
      query: 'q',
      performedAt: new Date().toISOString(),
      results: [],
      limitations: [],
    });
    createMock.mockResolvedValueOnce(toolUseResponse('propose_landscape_queries', { queries: ['q'] }));
    const badSolution = {
      existingSolutions: [
        { name: 'X', whatItAddresses: 'y', howPeopleCopeNow: 'z', evidenceIndices: [0] },
      ],
    };
    createMock
      .mockResolvedValueOnce(toolUseResponse('identify_existing_solutions', badSolution))
      .mockResolvedValueOnce(toolUseResponse('identify_existing_solutions', badSolution));

    const result = await researchLandscape(investigationId, 'run-1');

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(
      /existingSolutions\[0\]\.whereItsInadequate is missing\/invalid/,
    );
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('rejects an identify_existing_solutions entry with an empty evidenceIndices array', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    vi.mocked(searchWeb).mockResolvedValueOnce({
      id: 'wsq-1',
      investigationId,
      generationRunId: 'run-1',
      query: 'q',
      performedAt: new Date().toISOString(),
      results: [],
      limitations: [],
    });
    createMock.mockResolvedValueOnce(toolUseResponse('propose_landscape_queries', { queries: ['q'] }));
    const badSolution = {
      existingSolutions: [
        { name: 'X', whatItAddresses: 'y', howPeopleCopeNow: 'z', whereItsInadequate: 'w', evidenceIndices: [] },
      ],
    };
    createMock
      .mockResolvedValueOnce(toolUseResponse('identify_existing_solutions', badSolution))
      .mockResolvedValueOnce(toolUseResponse('identify_existing_solutions', badSolution));

    const result = await researchLandscape(investigationId, 'run-1');

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toMatch(
      /existingSolutions\[0\]\.evidenceIndices must be a non-empty array/,
    );
  });

  it('LlmValidationError path: repair attempt is also invalid, run returns generationFailed:true with no negativeFindingSignal (R-4 fail-closed, no coercion)', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['One piece of evidence.']);
    createMock
      .mockResolvedValueOnce(toolUseResponse('propose_landscape_queries', { queries: [] }))
      .mockResolvedValueOnce(toolUseResponse('propose_landscape_queries', { queries: [] }));

    const result = await researchLandscape(investigationId, 'run-1');

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.generationFailed).toBe(true);
    expect(result.negativeFindingSignal).toBeUndefined();
    expect(result.generationFailureReason).toMatch(
      /Landscape query proposal failed schema validation after bounded repair/,
    );
  });
});
