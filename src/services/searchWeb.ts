import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { searchWebAdapter } from './searchWebAdapter.js';
import { fetchWithGuards } from './ssrfGuardedFetch.js';
import { classifyRetrievalOutcome, type RetrievalOutcome } from './classifyRetrievalOutcome.js';
import type { QueryLimitation, WebSearchQuery, WebSearchResult } from '../types/domain.js';

export interface SearchWebInput {
  investigationId: string;
  generationRunId: string;
  query: string;
}

/** Landscape Researcher — independent web research (Architecture §4 `searchWeb`, §1.6 addendum).
 *
 *  1. Calls the searchWeb adapter (`searchWebAdapter.ts`), which returns `SearchWebAdapterResult`
 *     — `'succeeded'` (with `selectedResultUrls`, possibly empty) or `'query-limited'` (with a
 *     `QueryLimitation`, no result set was ever produced).
 *  2. On `'query-limited'`, persists `WebSearchQuery` with `results: []` and `queryLimitation`
 *     set, and returns immediately — no retrieval is attempted.
 *  3. On `'succeeded'`, first DEDUPES `selectedResultUrls` (case-sensitive exact match — plausible
 *     when the adapter aggregates URLs across up to 5 `web_search_tool_result` blocks per turn),
 *     then runs one controlled retrieval attempt per DEDUPED url through the shared
 *     `ssrfGuardedFetch` module, classifies each into `WebSearchResult.status` via the
 *     blocked/failed rule (`classifyRetrievalOutcome.ts`), and persists exactly one
 *     `WebSearchResult` per DEDUPED url, plus its `SourceArtifact` (when retrieved), in the SAME
 *     transaction as the `WebSearchQuery` row, asserting `persistedResults.length ===
 *     dedupedResultUrls.length` before commit — this is a "no attempt dropped after dedup"
 *     invariant, not "every originally-selected (pre-dedup) URL is individually retried". A
 *     `queryLimitation` may also be set on a `'succeeded'` outcome (partial-block failure — see
 *     `SearchWebAdapterResult.queryLimitation`'s doc comment) and is persisted alongside the
 *     results in this same transaction. */
export async function searchWeb(input: SearchWebInput): Promise<WebSearchQuery> {
  const adapterResult = await searchWebAdapter(input.query);

  if (adapterResult.outcome === 'query-limited') {
    if (!adapterResult.queryLimitation) {
      throw new Error(
        'searchWeb: adapter returned outcome "query-limited" with no queryLimitation — programming error',
      );
    }
    return persistQueryLimited(input, adapterResult.queryLimitation.reason, adapterResult.performedAt);
  }

  // Dedup selectedResultUrls before the retrieval loop: aggregating URLs across up to 5
  // web_search_tool_result blocks per turn (finding 1) makes an exact-duplicate URL plausible. A
  // duplicate would otherwise hit the UNIQUE(web_search_query_id, url) constraint at persistence
  // time, roll back the whole transaction, and lose the entire WebSearchQuery — inverting the
  // not-dropped invariant into a total-loss invariant. Case-sensitive exact-match dedup only — a
  // documented scope decision, not URL normalization (e.g. trailing slash, query-param order are
  // deliberately left as distinct URLs; over-engineering normalization is out of scope here).
  const dedupedResultUrls = [...new Set(adapterResult.selectedResultUrls)];
  const results: RetrievedClassification[] = [];

  for (const url of dedupedResultUrls) {
    results.push(await retrieveAndClassify(url));
  }

  return persistSucceeded(
    input,
    adapterResult.performedAt,
    results,
    adapterResult.queryLimitation,
  );
}

/** Intermediate shape produced by `retrieveAndClassify` — carries the retrieved body alongside the
 *  classification instead of persisting the SourceArtifact itself. The SourceArtifact insert must
 *  happen inside the SAME transaction as the WebSearchResult insert (Architecture §1.6
 *  "persisted together, in one transaction") — done in `persistSucceeded` below — so a rollback
 *  never leaves an orphaned SourceArtifact with no corresponding WebSearchResult. */
export interface RetrievedClassification {
  url: string;
  retrievedAt: string;
  status: WebSearchResult['status'];
  failureReason?: string;
  resolvedContent?: string; // set only when status === 'retrieved'
}

async function retrieveAndClassify(rawUrl: string): Promise<RetrievedClassification> {
  const retrievedAt = new Date().toISOString();

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    const { status, failureReason } = classifyRetrievalOutcome({ kind: 'invalid-url', rawUrl });
    return { url: rawUrl, retrievedAt, status, failureReason };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    const outcome: RetrievalOutcome = { kind: 'unsupported-protocol', protocol: url.protocol };
    const { status, failureReason } = classifyRetrievalOutcome(outcome);
    return { url: rawUrl, retrievedAt, status, failureReason };
  }

  try {
    const { statusCode, statusMessage, body } = await fetchWithGuards(url);
    const { status, failureReason } = classifyRetrievalOutcome({
      kind: 'http-response',
      statusCode,
      statusMessage,
      bodyLength: body.trim().length,
    });

    if (status === 'retrieved') {
      return { url: rawUrl, retrievedAt, status, resolvedContent: body };
    }
    return { url: rawUrl, retrievedAt, status, failureReason };
  } catch (err) {
    const { status, failureReason } = classifyRetrievalOutcome({
      kind: 'error',
      error: err instanceof Error ? err : new Error(String(err)),
    });
    return { url: rawUrl, retrievedAt, status, failureReason };
  }
}

async function persistQueryLimited(
  input: SearchWebInput,
  reason: string,
  performedAt: string,
): Promise<WebSearchQuery> {
  const webSearchQueryId = randomUUID();
  const queryLimitationId = randomUUID();
  const occurredAt = new Date().toISOString();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO web_search_query
         (id, investigation_id, generation_run_id, query, performed_at, limitations, query_limitation_id)
       VALUES ($1, $2, $3, $4, $5, '{}', $6)`,
      [webSearchQueryId, input.investigationId, input.generationRunId, input.query, performedAt, queryLimitationId],
    );

    await client.query(
      `INSERT INTO query_limitation (id, web_search_query_id, reason, occurred_at)
       VALUES ($1, $2, $3, $4)`,
      [queryLimitationId, webSearchQueryId, reason, occurredAt],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    id: webSearchQueryId,
    investigationId: input.investigationId,
    generationRunId: input.generationRunId,
    query: input.query,
    performedAt,
    results: [],
    limitations: [],
    queryLimitation: {
      id: queryLimitationId,
      webSearchQueryId,
      reason,
      occurredAt,
    },
  };
}

/** Exported for direct unit testing only (test-only access, no seam/flag needed — this is a plain
 *  named export, not gated production behavior). Lets `searchWeb.test.ts` exercise the
 *  persistence/rollback path with a `results` array constructed directly, bypassing the
 *  adapter+retrieval pipeline in `searchWeb()`. */
export async function persistSucceeded(
  input: SearchWebInput,
  performedAt: string,
  results: RetrievedClassification[],
  queryLimitation: QueryLimitation | undefined,
): Promise<WebSearchQuery> {
  const webSearchQueryId = randomUUID();
  const queryLimitationId = queryLimitation ? randomUUID() : null;
  const queryLimitationOccurredAt = queryLimitation ? new Date().toISOString() : null;

  const client = await pool.connect();
  const persistedResults: WebSearchResult[] = [];
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO web_search_query
         (id, investigation_id, generation_run_id, query, performed_at, limitations, query_limitation_id)
       VALUES ($1, $2, $3, $4, $5, '{}', $6)`,
      [
        webSearchQueryId,
        input.investigationId,
        input.generationRunId,
        input.query,
        performedAt,
        queryLimitationId,
      ],
    );

    if (queryLimitation && queryLimitationId && queryLimitationOccurredAt) {
      // Partial-success limitation (finding 1) — some web_search_tool_result blocks errored while
      // others produced URLs. Persisted inside the same transaction as everything else here.
      await client.query(
        `INSERT INTO query_limitation (id, web_search_query_id, reason, occurred_at)
         VALUES ($1, $2, $3, $4)`,
        [queryLimitationId, webSearchQueryId, queryLimitation.reason, queryLimitationOccurredAt],
      );
    }

    for (const result of results) {
      // SourceArtifact insert moved INSIDE this transaction (Architecture §1.6 "persisted
      // together, in one transaction") — a rollback below now never leaves an orphaned
      // SourceArtifact with no corresponding WebSearchResult.
      let sourceArtifactId: string | undefined;
      if (result.status === 'retrieved' && result.resolvedContent !== undefined) {
        const artifactResult = await client.query<{ id: string }>(
          `INSERT INTO source_artifact
             (investigation_id, submission_id, type, raw, origin,
              resolution_status, resolution_resolved_at, resolved_content)
           VALUES ($1, NULL, 'url', $2, 'landscape-research', 'content-retrieved', now(), $3)
           RETURNING id`,
          [input.investigationId, result.url, result.resolvedContent],
        );
        sourceArtifactId = artifactResult.rows[0].id;
      }

      const persistedResult: WebSearchResult = {
        url: result.url,
        retrievedAt: result.retrievedAt,
        status: result.status,
        failureReason: result.failureReason,
        sourceArtifactId,
      };

      await client.query(
        `INSERT INTO web_search_result
           (web_search_query_id, url, retrieved_at, status, failure_reason, source_artifact_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          webSearchQueryId,
          persistedResult.url,
          persistedResult.retrievedAt,
          persistedResult.status,
          persistedResult.failureReason ?? null,
          persistedResult.sourceArtifactId ?? null,
        ],
      );
      persistedResults.push(persistedResult);
    }

    // Provably-not-dropped assertion (Architecture §1.6), checked once at the real point of
    // divergence risk — immediately after the persistence loop, before commit. (The prior
    // duplicate check in the caller was unreachable dead code: `persistedResults` is pushed
    // exactly once per loop iteration here, so the only divergence path is a throw, which already
    // propagates past any outer check.)
    if (persistedResults.length !== results.length) {
      throw new Error(
        `searchWeb: persistedResults.length (${persistedResults.length}) !== results.length ` +
          `(${results.length}) before commit — refusing to persist a truncated WebSearchResult set`,
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    id: webSearchQueryId,
    investigationId: input.investigationId,
    generationRunId: input.generationRunId,
    query: input.query,
    performedAt,
    results: persistedResults,
    limitations: [],
    queryLimitation:
      queryLimitation && queryLimitationId && queryLimitationOccurredAt
        ? { id: queryLimitationId, webSearchQueryId, reason: queryLimitation.reason, occurredAt: queryLimitationOccurredAt }
        : undefined,
  };
}
