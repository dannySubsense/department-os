import { pool } from '../db/pool.js';
import type { SourceResolution } from '../types/domain.js';

/** Below this many non-whitespace characters of fetched body text, a successfully-fetched
 *  (2xx) response is treated as `reachable-no-content` rather than `content-retrieved`. This is
 *  a deliberately simple MVP heuristic (Architecture §4/Roadmap Slice 3 — "a reasonable heuristic
 *  ... is acceptable, document your heuristic explicitly"), not real content extraction: a page
 *  that renders almost entirely client-side (JS-only), sits behind a paywall/login-wall
 *  interstitial, or serves an empty body tends to return very little raw text in the initial
 *  HTML response, while genuine article/document content does not. PROVISIONAL — unvalidated
 *  against real-world paywall/JS-shell samples; owner: Ledger. Revisit if false
 *  positives/negatives are observed in practice. */
const MIN_CONTENT_LENGTH = 200;

/** Fetch timeout — bounds how long a single unreachable/hanging source can block resolution.
 *  PROVISIONAL — unvalidated; owner: Ledger. */
const FETCH_TIMEOUT_MS = 10_000;

interface SourceArtifactRow {
  id: string;
  type: string;
  raw: string;
}

/** Source Resolver — Architecture §4. Fetches/checks a single SourceArtifact and classifies the
 *  result into the four-way `SourceResolution.status` (G-9), persisting the result back onto the
 *  `source_artifact` row. `type: 'text'` artifacts are already content — no network call is made;
 *  they resolve to `content-retrieved` immediately. */
export async function resolveSourceArtifact(sourceArtifactId: string): Promise<SourceResolution> {
  const artifactResult = await pool.query<SourceArtifactRow>(
    'SELECT id, type, raw FROM source_artifact WHERE id = $1',
    [sourceArtifactId],
  );
  if (artifactResult.rowCount === 0) {
    throw new Error(`resolveSourceArtifact: source_artifact ${sourceArtifactId} does not exist`);
  }
  const artifact = artifactResult.rows[0];

  const resolution: SourceResolution =
    artifact.type === 'text'
      ? { status: 'content-retrieved', resolvedAt: new Date().toISOString() }
      : await resolveUrl(artifact.raw);

  await persistResolution(sourceArtifactId, resolution);
  return resolution;
}

async function resolveUrl(rawUrl: string): Promise<SourceResolution> {
  const resolvedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(rawUrl, { signal: controller.signal });

    if (!response.ok) {
      return {
        status: 'unreachable',
        resolvedAt,
        failureReason: `HTTP ${response.status} ${response.statusText}`.trim(),
      };
    }

    const body = await response.text();
    const contentLength = body.trim().length;

    if (contentLength < MIN_CONTENT_LENGTH) {
      return {
        status: 'reachable-no-content',
        resolvedAt,
        noContentReason:
          'Response returned successfully but contained little or no extractable text — ' +
          'likely a paywall, login wall, JS-only render, or empty page.',
      };
    }

    return { status: 'content-retrieved', resolvedAt };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      status: 'unreachable',
      resolvedAt,
      failureReason: isAbort
        ? `Request timed out after ${FETCH_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : 'Unknown fetch error',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function persistResolution(
  sourceArtifactId: string,
  resolution: SourceResolution,
): Promise<void> {
  await pool.query(
    `UPDATE source_artifact
     SET resolution_status = $2,
         resolution_resolved_at = $3,
         resolution_failure_reason = $4,
         resolution_no_content_reason = $5
     WHERE id = $1`,
    [
      sourceArtifactId,
      resolution.status,
      resolution.resolvedAt ?? null,
      resolution.failureReason ?? null,
      resolution.noContentReason ?? null,
    ],
  );
}
