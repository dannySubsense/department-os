import { pool } from '../db/pool.js';
import type { SourceResolution } from '../types/domain.js';
import {
  fetchWithGuards,
  FETCH_TIMEOUT_MS,
  __allowPrivateNetworkHostForTests,
  __resetPrivateNetworkTestAllowlist,
} from './ssrfGuardedFetch.js';

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

    // No numeric threshold here, deliberately. This replaced `MIN_CONTENT_LENGTH = 200`, which was
    // MEASURED on 2026-09-05 and found unable to do its job at ANY value — artifact:
    // `docs/specs/problem-department-mvp/min-content-length-measurement.md` (18 real URLs, re-run
    // with `npx tsx scripts/measure-min-content-length.ts`; run twice, same conclusions). Two
    // results from that run bound what this check may claim: (1) across the 11 sampled 2xx
    // responses every threshold in [1, 558] classified all 11 identically, so 200 drew no
    // distinction beyond "the body was empty"; (2) raw body length does not rank content —
    // text/raw spanned 0.0070-0.9612, and vercel.com's 524,181 raw chars carried 3,673 chars of
    // text against httpbin.org/html's 3,739 raw chars carrying 3,594. Emptiness is therefore the
    // only property this fetch-layer check can honestly assert; the claim is deliberately reduced
    // to match the evidence. Anything stronger (paywall, JS shell, thin content) requires
    // extraction first, and any threshold on extracted text would need its own DDR-0002
    // measurement before use — none is proposed or authorized here.
    if (body.trim().length === 0) {
      return {
        resolution: {
          status: 'reachable-no-content',
          resolvedAt,
          noContentReason:
            'Response returned successfully but the raw response body was empty or ' +
            'whitespace-only. This check does not detect paywalls, login walls, or ' +
            'JS-rendered pages, which typically return substantial raw HTML regardless of ' +
            'visible content — that judgment belongs to downstream content extraction, not ' +
            'this fetch-layer check.',
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
