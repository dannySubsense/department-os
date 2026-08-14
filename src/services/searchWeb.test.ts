import { beforeEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { pool } from '../db/pool.js';
import {
  __allowPrivateNetworkHostForTests,
  __resetPrivateNetworkTestAllowlist,
} from './ssrfGuardedFetch.js';
import type { SearchWebAdapterResult } from '../types/domain.js';
import { withProvenanceCollector, type CapturedToolInvocation } from './provenanceContext.js';
import { createGenerationRun } from './provenanceRecorder.js';

/** searchWeb orchestrator coverage (Architecture §1.6 items 2/4): query-limited short-circuit
 *  persistence, per-URL controlled retrieval, SourceArtifact creation with
 *  origin: 'landscape-research' on retrieved, and the provably-not-dropped persistence guarantee.
 *
 *  Per Danny's explicit requirement, blocked/failed classifications are produced via deterministic
 *  local-fixture HTTP servers (a 403 responder, and a connection-refused port), never live
 *  internet or unpredictable real-world URLs. */

const searchWebAdapterMock = vi.fn<(query: string) => Promise<SearchWebAdapterResult>>();

vi.mock('./searchWebAdapter.js', () => ({
  searchWebAdapter: (query: string) => searchWebAdapterMock(query),
}));

const { searchWeb, persistSucceeded } = await import('./searchWeb.js');

let fixtureBaseUrl: string;
let fixtureServer: ReturnType<typeof createServer>;
let refusedPort: number;

beforeAll(async () => {
  fixtureServer = createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('substantial retrievable content here '.repeat(20));
      return;
    }
    if (req.url === '/forbidden') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('forbidden');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, resolve));
  const port = (fixtureServer.address() as AddressInfo).port;
  fixtureBaseUrl = `http://localhost:${port}`;
  __allowPrivateNetworkHostForTests('localhost');

  // Deterministic connection-refused fixture: bind an ephemeral port, capture it, then close the
  // listener immediately — nothing is listening on this port for the lifetime of the test run, so
  // a connection attempt reliably fails with ECONNREFUSED (no reliance on live internet or
  // unpredictable real-world hosts).
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, resolve));
  refusedPort = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
});

afterAll(async () => {
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  __resetPrivateNetworkTestAllowlist();
  await pool.end();
});

beforeEach(async () => {
  searchWebAdapterMock.mockReset();
  await pool.query(
    'TRUNCATE web_search_result, query_limitation, web_search_query, source_artifact, submission, investigation CASCADE',
  );
});

async function insertInvestigation(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO investigation (status) VALUES ('open') RETURNING id`,
  );
  return result.rows[0].id;
}

// migration 006 added web_search_query.generation_run_id -> generation_run(id) FK: every
// generationRunId used below must reference a real generation_run row, not a bare randomUUID().
async function insertGenerationRun(investigationId: string): Promise<string> {
  const run = await createGenerationRun({
    investigationId,
    runtimeIdentifier: 'test-runtime',
  });
  return run.id;
}

describe('searchWeb — query-limited short-circuit', () => {
  it('persists a WebSearchQuery with results: [] and a QueryLimitation, and never attempts retrieval', async () => {
    const investigationId = await insertInvestigation();
    const generationRunId = await insertGenerationRun(investigationId);

    searchWebAdapterMock.mockResolvedValueOnce({
      outcome: 'query-limited',
      query: 'limited query',
      performedAt: new Date().toISOString(),
      selectedResultUrls: [],
      queryLimitation: {
        id: '',
        webSearchQueryId: '',
        reason: 'provider error: 429 rate limited',
        occurredAt: new Date().toISOString(),
      },
    });

    const result = await searchWeb({ investigationId, generationRunId, query: 'limited query' });

    expect(result.results).toEqual([]);
    expect(result.queryLimitation).toBeDefined();
    expect(result.queryLimitation?.reason).toBe('provider error: 429 rate limited');

    const persistedQuery = await pool.query(
      `SELECT * FROM web_search_query WHERE id = $1`,
      [result.id],
    );
    expect(persistedQuery.rowCount).toBe(1);
    expect(persistedQuery.rows[0].query_limitation_id).not.toBeNull();

    const persistedResults = await pool.query(
      `SELECT * FROM web_search_result WHERE web_search_query_id = $1`,
      [result.id],
    );
    expect(persistedResults.rowCount).toBe(0);

    const persistedLimitation = await pool.query(
      `SELECT * FROM query_limitation WHERE web_search_query_id = $1`,
      [result.id],
    );
    expect(persistedLimitation.rowCount).toBe(1);
    expect(persistedLimitation.rows[0].reason).toBe('provider error: 429 rate limited');
  });
});

describe('searchWeb — controlled retrieval, classification, and not-dropped persistence', () => {
  it('persists exactly one WebSearchResult per selected URL, classifying retrieved/blocked/failed via deterministic fixtures, and creates a SourceArtifact (origin: landscape-research) only for the retrieved one', async () => {
    const investigationId = await insertInvestigation();
    const generationRunId = await insertGenerationRun(investigationId);

    const retrievedUrl = `${fixtureBaseUrl}/ok`;
    const blockedUrl = `${fixtureBaseUrl}/forbidden`; // deterministic 403 -> blocked
    const failedUrl = `http://localhost:${refusedPort}/unreachable`; // deterministic ECONNREFUSED -> failed

    searchWebAdapterMock.mockResolvedValueOnce({
      outcome: 'succeeded',
      query: 'mixed outcomes query',
      performedAt: new Date().toISOString(),
      selectedResultUrls: [retrievedUrl, blockedUrl, failedUrl],
    });

    const result = await searchWeb({
      investigationId,
      generationRunId,
      query: 'mixed outcomes query',
    });

    // Not-dropped guarantee: exactly N results for N selected URLs, one per URL.
    expect(result.results).toHaveLength(3);
    expect(new Set(result.results.map((r) => r.url))).toEqual(
      new Set([retrievedUrl, blockedUrl, failedUrl]),
    );

    const byUrl = Object.fromEntries(result.results.map((r) => [r.url, r]));

    expect(byUrl[retrievedUrl].status).toBe('retrieved');
    expect(byUrl[retrievedUrl].sourceArtifactId).toBeDefined();
    expect(byUrl[retrievedUrl].failureReason).toBeUndefined();

    expect(byUrl[blockedUrl].status).toBe('blocked');
    expect(byUrl[blockedUrl].failureReason).toMatch(/403/);
    expect(byUrl[blockedUrl].sourceArtifactId).toBeUndefined();

    expect(byUrl[failedUrl].status).toBe('failed');
    expect(byUrl[failedUrl].sourceArtifactId).toBeUndefined();

    // Persisted rows match in-memory result exactly — one row per selected URL, none omitted.
    const persistedResults = await pool.query(
      `SELECT url, status, source_artifact_id FROM web_search_result WHERE web_search_query_id = $1`,
      [result.id],
    );
    expect(persistedResults.rowCount).toBe(3);

    const persistedArtifact = await pool.query(
      `SELECT origin FROM source_artifact WHERE id = $1`,
      [byUrl[retrievedUrl].sourceArtifactId],
    );
    expect(persistedArtifact.rows[0].origin).toBe('landscape-research');
  }, 20_000);

  it('persists zero WebSearchResult rows when the adapter succeeds with zero selected URLs (legitimate empty result set, not a limitation)', async () => {
    const investigationId = await insertInvestigation();
    const generationRunId = await insertGenerationRun(investigationId);

    searchWebAdapterMock.mockResolvedValueOnce({
      outcome: 'succeeded',
      query: 'zero results query',
      performedAt: new Date().toISOString(),
      selectedResultUrls: [],
    });

    const result = await searchWeb({ investigationId, generationRunId, query: 'zero results query' });

    expect(result.results).toEqual([]);
    expect(result.queryLimitation).toBeUndefined();

    const persistedQuery = await pool.query(`SELECT * FROM web_search_query WHERE id = $1`, [result.id]);
    expect(persistedQuery.rows[0].query_limitation_id).toBeNull();
  });
});

describe('persistSucceeded — transaction rollback / not-dropped invariant (QC finding, direct unit coverage)', () => {
  // NOTE on scope: as written, `persistedResults.length !== results.length` inside
  // `persistSucceeded` (searchWeb.ts) is compared against the SAME loop that produces
  // `persistedResults` by pushing exactly once per `results` iteration — the implementation's own
  // comment above that assertion documents this as unreachable-by-construction ("the only
  // divergence path is a throw, which already propagates past any outer check"). There is no
  // legitimate input, through `searchWeb()` or through `persistSucceeded()` directly, that makes
  // `persistedResults.length` diverge from `results.length` without an exception already having
  // been thrown first. So this test proves the thing that assertion is actually a backstop for:
  // that ANY failure mid-persistence-loop (a real one — a UNIQUE constraint violation from a
  // duplicate URL reaching persistence, which `searchWeb()`'s pre-loop dedup is supposed to
  // prevent from ever happening) rolls back the WHOLE transaction, leaving zero rows of any kind —
  // never a partial/truncated WebSearchResult set.
  it('rolls back the entire transaction and persists zero rows when a duplicate URL in `results` violates the UNIQUE(web_search_query_id, url) constraint mid-loop', async () => {
    const investigationId = await insertInvestigation();
    const generationRunId = await insertGenerationRun(investigationId);
    const performedAt = new Date().toISOString();

    const duplicateUrl = 'https://example.com/duplicate-forced-for-test';
    const results = [
      {
        url: duplicateUrl,
        retrievedAt: performedAt,
        status: 'failed' as const,
        failureReason: 'connection error',
      },
      {
        url: duplicateUrl, // deliberately mismatched/duplicate — not reachable via searchWeb()'s
        // public input path post-dedup, constructed directly here to force the persistence loop
        // to hit the UNIQUE constraint on its second INSERT.
        retrievedAt: performedAt,
        status: 'failed' as const,
        failureReason: 'connection error',
      },
    ];

    await expect(
      persistSucceeded(
        { investigationId, generationRunId, query: 'duplicate url forced' },
        performedAt,
        results,
        undefined,
      ),
    ).rejects.toThrow();

    const persistedQueries = await pool.query(
      `SELECT * FROM web_search_query WHERE investigation_id = $1`,
      [investigationId],
    );
    expect(persistedQueries.rowCount).toBe(0);

    const persistedResults = await pool.query(`SELECT * FROM web_search_result`);
    expect(persistedResults.rowCount).toBe(0);
  });
});

describe('searchWeb — partial-success queryLimitation (finding 1)', () => {
  it('persists BOTH retrieved results AND a query_limitation row in the same transaction when one web_search_tool_result block succeeds and another errors, and outcome stays succeeded with URLs present', async () => {
    const investigationId = await insertInvestigation();
    const generationRunId = await insertGenerationRun(investigationId);
    const retrievedUrl = `${fixtureBaseUrl}/ok`;

    searchWebAdapterMock.mockResolvedValueOnce({
      outcome: 'succeeded',
      query: 'partial success query',
      performedAt: new Date().toISOString(),
      selectedResultUrls: [retrievedUrl],
      queryLimitation: {
        id: '',
        webSearchQueryId: '',
        reason: 'one web_search_tool_result block errored while another produced URLs',
        occurredAt: new Date().toISOString(),
      },
    });

    const result = await searchWeb({
      investigationId,
      generationRunId,
      query: 'partial success query',
    });

    // outcome must not be conflated with 'query-limited' — this is a succeeded call with URLs.
    expect(result.results).toHaveLength(1);
    expect(result.results[0].url).toBe(retrievedUrl);
    expect(result.results[0].status).toBe('retrieved');
    expect(result.queryLimitation).toBeDefined();
    expect(result.queryLimitation?.reason).toMatch(/one web_search_tool_result block errored/);

    const persistedResults = await pool.query(
      `SELECT * FROM web_search_result WHERE web_search_query_id = $1`,
      [result.id],
    );
    expect(persistedResults.rowCount).toBe(1);

    const persistedLimitation = await pool.query(
      `SELECT * FROM query_limitation WHERE web_search_query_id = $1`,
      [result.id],
    );
    expect(persistedLimitation.rowCount).toBe(1);
  });
});

describe('searchWeb — dedup of duplicate selectedResultUrls (finding 3)', () => {
  it('persists exactly one WebSearchResult per unique URL and does not lose the WebSearchQuery when selectedResultUrls contains an exact duplicate', async () => {
    const investigationId = await insertInvestigation();
    const generationRunId = await insertGenerationRun(investigationId);
    const retrievedUrl = `${fixtureBaseUrl}/ok`;

    searchWebAdapterMock.mockResolvedValueOnce({
      outcome: 'succeeded',
      query: 'duplicate url query',
      performedAt: new Date().toISOString(),
      selectedResultUrls: [retrievedUrl, retrievedUrl], // exact duplicate across aggregated blocks
    });

    const result = await searchWeb({
      investigationId,
      generationRunId,
      query: 'duplicate url query',
    });

    // Search record not lost, no rollback: the WebSearchQuery is present and exactly one result.
    expect(result.id).toBeDefined();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].url).toBe(retrievedUrl);

    const persistedQuery = await pool.query(`SELECT * FROM web_search_query WHERE id = $1`, [result.id]);
    expect(persistedQuery.rowCount).toBe(1);

    const persistedResults = await pool.query(
      `SELECT * FROM web_search_result WHERE web_search_query_id = $1`,
      [result.id],
    );
    expect(persistedResults.rowCount).toBe(1);
  });
});

describe('searchWeb — provenance telemetry (Architecture §1.9 "searchWeb telemetry")', () => {
  it('records "web_search" and "url-fetch" recordToolInvocation calls with correct outcomes when a collector scope is open, without changing searchWeb\'s own return value or persistence', async () => {
    const investigationId = await insertInvestigation();
    const generationRunId = await insertGenerationRun(investigationId);

    const retrievedUrl = `${fixtureBaseUrl}/ok`;
    const blockedUrl = `${fixtureBaseUrl}/forbidden`;
    const failedUrl = `http://localhost:${refusedPort}/unreachable`;

    searchWebAdapterMock.mockResolvedValueOnce({
      outcome: 'succeeded',
      query: 'provenance scoped query',
      performedAt: new Date().toISOString(),
      selectedResultUrls: [retrievedUrl, blockedUrl, failedUrl],
    });

    const captured: CapturedToolInvocation[] = [];
    const collector = { record: (inv: CapturedToolInvocation) => captured.push(inv) };

    const result = await withProvenanceCollector(collector, () =>
      searchWeb({ investigationId, generationRunId, query: 'provenance scoped query' }),
    );

    // Instrumentation does not alter searchWeb's own behavior — same shape/assertions as the
    // unscoped "controlled retrieval" test above.
    expect(result.results).toHaveLength(3);
    const byUrl = Object.fromEntries(result.results.map((r) => [r.url, r]));
    expect(byUrl[retrievedUrl].status).toBe('retrieved');
    expect(byUrl[blockedUrl].status).toBe('blocked');
    expect(byUrl[failedUrl].status).toBe('failed');

    const webSearchInvocations = captured.filter((inv) => inv.toolName === 'web_search');
    expect(webSearchInvocations).toHaveLength(1);
    expect(webSearchInvocations[0].outcome).toBe('retrieved');

    const urlFetchInvocations = captured.filter((inv) => inv.toolName === 'url-fetch');
    expect(urlFetchInvocations).toHaveLength(3);
    expect(new Set(urlFetchInvocations.map((inv) => inv.outcome))).toEqual(
      new Set(['retrieved', 'blocked', 'failed']),
    );
  }, 20_000);

  it('records a "web_search" invocation with outcome "query-limited" when the adapter reports query-limited, with a scope open', async () => {
    const investigationId = await insertInvestigation();
    const generationRunId = await insertGenerationRun(investigationId);

    searchWebAdapterMock.mockResolvedValueOnce({
      outcome: 'query-limited',
      query: 'provenance limited query',
      performedAt: new Date().toISOString(),
      selectedResultUrls: [],
      queryLimitation: {
        id: '',
        webSearchQueryId: '',
        reason: 'provider error: 429 rate limited',
        occurredAt: new Date().toISOString(),
      },
    });

    const captured: CapturedToolInvocation[] = [];
    const collector = { record: (inv: CapturedToolInvocation) => captured.push(inv) };

    const result = await withProvenanceCollector(collector, () =>
      searchWeb({ investigationId, generationRunId, query: 'provenance limited query' }),
    );

    expect(result.results).toEqual([]);
    expect(captured).toHaveLength(1);
    expect(captured[0].toolName).toBe('web_search');
    expect(captured[0].outcome).toBe('query-limited');
  });

  it('is a no-op that does not throw or alter behavior when searchWeb runs with no provenance collector scope open (all prior describe blocks in this file already exercise this — this test asserts it explicitly)', async () => {
    const investigationId = await insertInvestigation();
    const generationRunId = await insertGenerationRun(investigationId);

    searchWebAdapterMock.mockResolvedValueOnce({
      outcome: 'succeeded',
      query: 'no scope query',
      performedAt: new Date().toISOString(),
      selectedResultUrls: [],
    });

    await expect(
      searchWeb({ investigationId, generationRunId, query: 'no scope query' }),
    ).resolves.toMatchObject({ results: [] });
  });
});

describe('persistSucceeded — atomicity, no orphan SourceArtifact on rollback (finding 4)', () => {
  it('leaves no orphan source_artifact row when the transaction fails after the source_artifact insert but before commit', async () => {
    const investigationId = await insertInvestigation();
    const generationRunId = await insertGenerationRun(investigationId);
    const performedAt = new Date().toISOString();

    const retrievedUrl = 'https://example.com/atomicity-forced-for-test';
    // Two results for the SAME url: the first is 'retrieved' (inserts a source_artifact, then a
    // web_search_result row), the second is a duplicate url which fails the UNIQUE constraint on
    // its web_search_result insert — forcing a failure AFTER the first source_artifact insert has
    // already happened inside this same transaction, but before COMMIT.
    const results = [
      {
        url: retrievedUrl,
        retrievedAt: performedAt,
        status: 'retrieved' as const,
        resolvedContent: 'retrieved content used to create a source_artifact row',
      },
      {
        url: retrievedUrl,
        retrievedAt: performedAt,
        status: 'failed' as const,
        failureReason: 'connection error',
      },
    ];

    const beforeCount = await pool.query(`SELECT count(*)::int AS n FROM source_artifact`);

    await expect(
      persistSucceeded(
        { investigationId, generationRunId, query: 'atomicity forced' },
        performedAt,
        results,
        undefined,
      ),
    ).rejects.toThrow();

    const afterCount = await pool.query(`SELECT count(*)::int AS n FROM source_artifact`);
    expect(afterCount.rows[0].n).toBe(beforeCount.rows[0].n);

    const orphan = await pool.query(
      `SELECT * FROM source_artifact WHERE investigation_id = $1`,
      [investigationId],
    );
    expect(orphan.rowCount).toBe(0);
  });
});
