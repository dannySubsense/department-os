import { pool } from '../db/pool.js';
import type { SourceResolution } from '../types/domain.js';
import {
  fetchWithGuards,
  FETCH_TIMEOUT_MS,
  __allowPrivateNetworkHostForTests,
  __resetPrivateNetworkTestAllowlist,
} from './ssrfGuardedFetch.js';

/** Below this many non-whitespace characters of fetched body text, a successfully-fetched
 *  (2xx) response is treated as `reachable-no-content` rather than `content-retrieved`. This is
 *  a deliberately simple MVP heuristic (Architecture §4/Roadmap Slice 3 — "a reasonable heuristic
 *  ... is acceptable, document your heuristic explicitly"), not real content extraction: a page
 *  that renders almost entirely client-side (JS-only), sits behind a paywall/login-wall
 *  interstitial, or serves an empty body tends to return very little raw text in the initial
 *  HTML response, while genuine article/document content does not. PROVISIONAL — unvalidated
 *  against real-world paywall/JS-shell samples; owner: Ledger. Revisit if false
 *  positives/negatives are observed in practice. Reused (imported, not copied) by the Landscape
 *  Researcher's controlled retrieval path (Architecture §1.6). */
export const MIN_CONTENT_LENGTH = 200;

interface SourceArtifactRow {
  id: string;
  type: string;
  raw: string;
}

// SSRF-hardened fetch machinery (protocol allowlisting, private/loopback/CGNAT/link-local/
// reserved/multicast IP blocking, IPv4-mapped IPv6 decoding, per-redirect-hop guard
// re-application, streaming size cap, and request timeout) now lives in the shared
// `ssrfGuardedFetch.ts` module (Architecture §1.6) — re-exported here so existing test imports
// (`from './resolveSourceArtifact.js'`) keep working unchanged. Pure move, no behavior change.
export { __allowPrivateNetworkHostForTests, __resetPrivateNetworkTestAllowlist };

/** Source Resolver — Architecture §4. Fetches/checks a single SourceArtifact and classifies the
 *  result into the four-way `SourceResolution.status` (G-9), persisting the result — and, per
 *  Sol review item 1, a durable content snapshot — back onto the `source_artifact` row.
 *  `type: 'text'` artifacts are already content — no network call is made; they resolve to
 *  `content-retrieved` immediately, with the pasted text itself as the resolved content. */
export async function resolveSourceArtifact(sourceArtifactId: string): Promise<SourceResolution> {
  const artifactResult = await pool.query<SourceArtifactRow>(
    'SELECT id, type, raw FROM source_artifact WHERE id = $1',
    [sourceArtifactId],
  );
  if (artifactResult.rowCount === 0) {
    throw new Error(`resolveSourceArtifact: source_artifact ${sourceArtifactId} does not exist`);
  }
  const artifact = artifactResult.rows[0];

  // Explicit branch on known types (Sol review item 4 fix) — SourceArtifactType is an open
  // discriminator (Decision 1.1); any value other than the two known variants must NOT fall
  // through into URL-fetching logic.
  let resolution: SourceResolution;
  let resolvedContent: string | null;
  if (artifact.type === 'text') {
    resolution = { status: 'content-retrieved', resolvedAt: new Date().toISOString() };
    resolvedContent = artifact.raw;
  } else if (artifact.type === 'url') {
    const result = await resolveUrl(artifact.raw);
    resolution = result.resolution;
    resolvedContent = result.resolvedContent;
  } else {
    resolution = {
      status: 'unreachable',
      resolvedAt: new Date().toISOString(),
      failureReason: `Unsupported source artifact type: '${artifact.type}'`,
    };
    resolvedContent = null;
  }

  await persistResolution(sourceArtifactId, resolution, resolvedContent);
  return resolution;
}

async function resolveUrl(
  rawUrl: string,
): Promise<{ resolution: SourceResolution; resolvedContent: string | null }> {
  const resolvedAt = new Date().toISOString();

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      resolution: { status: 'unreachable', resolvedAt, failureReason: `Invalid URL: ${rawUrl}` },
      resolvedContent: null,
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      resolution: {
        status: 'unreachable',
        resolvedAt,
        failureReason: `Unsupported URL protocol '${url.protocol}' — only http/https are allowed.`,
      },
      resolvedContent: null,
    };
  }

  try {
    const { statusCode, statusMessage, body } = await fetchWithGuards(url);

    if (statusCode < 200 || statusCode >= 300) {
      return {
        resolution: {
          status: 'unreachable',
          resolvedAt,
          failureReason: `HTTP ${statusCode} ${statusMessage}`.trim(),
        },
        resolvedContent: null,
      };
    }

    const contentLength = body.trim().length;

    if (contentLength < MIN_CONTENT_LENGTH) {
      return {
        resolution: {
          status: 'reachable-no-content',
          resolvedAt,
          noContentReason:
            'Response returned successfully but contained little or no extractable text — ' +
            'likely a paywall, login wall, JS-only render, or empty page.',
        },
        resolvedContent: null,
      };
    }

    return { resolution: { status: 'content-retrieved', resolvedAt }, resolvedContent: body };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      resolution: {
        status: 'unreachable',
        resolvedAt,
        failureReason: isAbort
          ? `Request timed out after ${FETCH_TIMEOUT_MS}ms`
          : err instanceof Error
            ? err.message
            : 'Unknown fetch error',
      },
      resolvedContent: null,
    };
  }
}

async function persistResolution(
  sourceArtifactId: string,
  resolution: SourceResolution,
  resolvedContent: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE source_artifact
     SET resolution_status = $2,
         resolution_resolved_at = $3,
         resolution_failure_reason = $4,
         resolution_no_content_reason = $5,
         resolved_content = $6
     WHERE id = $1`,
    [
      sourceArtifactId,
      resolution.status,
      resolution.resolvedAt ?? null,
      resolution.failureReason ?? null,
      resolution.noContentReason ?? null,
      resolvedContent,
    ],
  );
}
