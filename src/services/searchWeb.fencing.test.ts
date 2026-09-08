import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import type { SearchWebAdapterResult } from '../types/domain.js';
import { createGenerationRun } from './provenanceRecorder.js';

/**
 * C2-S3 §1.6 SOL-HIGH-2 fencing coverage for `searchWeb`'s two write paths
 * (`persistQueryLimited`/`persistSucceeded`), guarded by `assertFenceOwnership`. Mirrors the
 * established abandon-simulation mechanism used by
 * `extractClaimsAndEvidence.mocked.test.ts`'s "abandon-then-retry" test: the real abandon flow's
 * DB effect (`fence_token` incremented, `outcome` set `'failed'`) is reproduced directly via SQL
 * rather than driving the full `abandonGenerationRun` HTTP/service path, keeping this test focused
 * on fence rejection itself, not abandon eligibility (which has its own coverage elsewhere).
 *
 * `persistQueryLimited` is not exported (test-only access was granted to `persistSucceeded` only)
 * — its guard is exercised through the real `searchWeb()` entrypoint with the adapter mocked to
 * return `'query-limited'`, matching `searchWeb.test.ts`'s own established mocking convention.
 */

const searchWebAdapterMock = vi.fn<(query: string) => Promise<SearchWebAdapterResult>>();

vi.mock('./searchWebAdapter.js', () => ({
  searchWebAdapter: (query: string) => searchWebAdapterMock(query),
}));

const { searchWeb, persistSucceeded } = await import('./searchWeb.js');
const { GenerationRunFencedOutError } = await import('./provenanceRecorder.js');

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  searchWebAdapterMock.mockReset();
  await pool.query(
    'TRUNCATE web_search_result, query_limitation, web_search_query, source_artifact, submission, investigation, generation_run CASCADE',
  );
});

async function insertInvestigation(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO investigation (status) VALUES ('open') RETURNING id`,
  );
  return result.rows[0].id;
}

async function seedFencedOutRun(investigationId: string): Promise<{ id: string; staleFenceToken: number }> {
  const run = await createGenerationRun({ investigationId, runtimeIdentifier: 'test-runtime' });
  const staleFenceToken = run.fenceToken;
  // Reproduce the real abandon flow's DB effect directly (`abandonGenerationRun`,
  // src/web/apiRoutes.ts, steps 4-6): fence_token incremented, outcome finalized 'failed' — the
  // caller's already-captured fenceToken is now stale.
  const bumped = await pool.query<{ fence_token: number }>(
    `UPDATE generation_run SET outcome = 'failed', completed_at = now(), fence_token = fence_token + 1
      WHERE id = $1 AND outcome = 'in-progress'
    RETURNING fence_token`,
    [run.id],
  );
  expect(bumped.rowCount).toBe(1);
  expect(bumped.rows[0].fence_token).not.toBe(staleFenceToken);
  return { id: run.id, staleFenceToken };
}

describe('searchWeb — persistQueryLimited rejects a fenced-out fenceToken (§1.6 SOL-HIGH-2)', () => {
  it('throws GenerationRunFencedOutError and persists no WebSearchQuery/QueryLimitation row', async () => {
    const investigationId = await insertInvestigation();
    const { id: generationRunId, staleFenceToken } = await seedFencedOutRun(investigationId);

    searchWebAdapterMock.mockResolvedValueOnce({
      outcome: 'query-limited',
      query: 'fenced out limited query',
      performedAt: new Date().toISOString(),
      selectedResultUrls: [],
      queryLimitation: {
        id: '',
        webSearchQueryId: '',
        reason: 'provider error: 429 rate limited',
        occurredAt: new Date().toISOString(),
      },
    });

    await expect(
      searchWeb({
        investigationId,
        generationRunId,
        fenceToken: staleFenceToken,
        query: 'fenced out limited query',
      }),
    ).rejects.toThrow(GenerationRunFencedOutError);

    const persistedQueries = await pool.query(
      `SELECT * FROM web_search_query WHERE investigation_id = $1`,
      [investigationId],
    );
    expect(persistedQueries.rowCount).toBe(0);

    const persistedLimitations = await pool.query(`SELECT * FROM query_limitation`);
    expect(persistedLimitations.rowCount).toBe(0);
  });
});

describe('persistSucceeded — rejects a fenced-out fenceToken (§1.6 SOL-HIGH-2)', () => {
  it('throws GenerationRunFencedOutError before any INSERT, rolling back and persisting no WebSearchQuery/WebSearchResult/SourceArtifact row', async () => {
    const investigationId = await insertInvestigation();
    const { id: generationRunId, staleFenceToken } = await seedFencedOutRun(investigationId);
    const performedAt = new Date().toISOString();

    const beforeArtifactCount = await pool.query(`SELECT count(*)::int AS n FROM source_artifact`);

    await expect(
      persistSucceeded(
        { investigationId, generationRunId, fenceToken: staleFenceToken, query: 'fenced out succeeded query' },
        performedAt,
        [
          {
            url: 'https://example.com/fenced-out-forced-for-test',
            retrievedAt: performedAt,
            status: 'retrieved',
            resolvedContent: 'content that must never be persisted for a fenced-out run',
          },
        ],
        undefined,
      ),
    ).rejects.toThrow(GenerationRunFencedOutError);

    const persistedQueries = await pool.query(
      `SELECT * FROM web_search_query WHERE investigation_id = $1`,
      [investigationId],
    );
    expect(persistedQueries.rowCount).toBe(0);

    const persistedResults = await pool.query(`SELECT * FROM web_search_result`);
    expect(persistedResults.rowCount).toBe(0);

    const afterArtifactCount = await pool.query(`SELECT count(*)::int AS n FROM source_artifact`);
    expect(afterArtifactCount.rows[0].n).toBe(beforeArtifactCount.rows[0].n);
  });
});
