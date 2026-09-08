import { createHash } from 'node:crypto';
import { pool } from '../db/pool.js';
import type { SourceResolution } from '../types/domain.js';
import {
  fetchWithGuards,
  FETCH_TIMEOUT_MS,
  __allowPrivateNetworkHostForTests,
  __resetPrivateNetworkTestAllowlist,
} from './ssrfGuardedFetch.js';
import { canonicalizeUrl } from './sourceCanonicalization.js';

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

/** Computation-only result of resolving a source artifact — never persists anything (§1.4a). */
export interface ComputedSourceResolution {
  resolution: SourceResolution;
  resolvedContent: string | null;
  canonicalUrl: string | null; // §4.8 SOL-MEDIUM-1 — url-type, content-retrieved only; null otherwise
  resolvedContentHash: string | null; // §4.8 SOL-MEDIUM-1 — any type, content-retrieved only; null otherwise
}

/** Source Resolver, computation half (Architecture §1.4a). Fetches/checks a single SourceArtifact
 *  and classifies the result into the four-way `SourceResolution.status` (G-9), WITHOUT persisting
 *  anything — the caller controls its own persist. `resolveSourceArtifact` (below) is the only
 *  caller that persists unconditionally; `recheckSourceArtifact.ts` calls this function directly
 *  so it can gate its own conditional, compare-and-set `UPDATE` on a pre-call read, never on a
 *  state this same call already overwrote. */
export async function computeSourceResolution(artifact: {
  id: string;
  type: string;
  raw: string;
}): Promise<ComputedSourceResolution> {
  // Explicit branch on known types (Sol review item 4 fix) — SourceArtifactType is an open
  // discriminator (Decision 1.1); any value other than the two known variants must NOT fall
  // through into URL-fetching logic.
  if (artifact.type === 'text') {
    if (artifact.raw.trim().length === 0) {
      return {
        resolution: {
          status: 'reachable-no-content',
          resolvedAt: new Date().toISOString(),
          noContentReason: 'Submitted text content was blank or whitespace-only.',
        },
        resolvedContent: null,
        canonicalUrl: null,
        resolvedContentHash: null,
      };
    }
    return {
      resolution: { status: 'content-retrieved', resolvedAt: new Date().toISOString() },
      resolvedContent: artifact.raw,
      canonicalUrl: null, // text sources never get a canonical_url (§4.8)
      resolvedContentHash: hashContent(artifact.raw),
    };
  } else if (artifact.type === 'url') {
    return resolveUrl(artifact.raw);
  } else {
    return {
      resolution: {
        status: 'unreachable',
        resolvedAt: new Date().toISOString(),
        failureReason: `Unsupported source artifact type: '${artifact.type}'`,
      },
      resolvedContent: null,
      canonicalUrl: null,
      resolvedContentHash: null,
    };
  }
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Source Resolver — Architecture §4/§1.4a. Fetches/checks a single SourceArtifact, computes its
 *  resolution via `computeSourceResolution`, and persists the result unconditionally — this is the
 *  ONLY caller of `computeSourceResolution` that persists unconditionally; every other caller
 *  controls its own persist. `type: 'text'` artifacts are already content — no network call is
 *  made; they resolve to `content-retrieved` immediately, with the pasted text itself as the
 *  resolved content (unless blank/whitespace-only, §1.4b). */
export async function resolveSourceArtifact(sourceArtifactId: string): Promise<SourceResolution> {
  const artifactResult = await pool.query<SourceArtifactRow>(
    'SELECT id, type, raw FROM source_artifact WHERE id = $1',
    [sourceArtifactId],
  );
  if (artifactResult.rowCount === 0) {
    throw new Error(`resolveSourceArtifact: source_artifact ${sourceArtifactId} does not exist`);
  }
  const artifact = artifactResult.rows[0];

  const computed = await computeSourceResolution(artifact);

  await persistResolution(
    sourceArtifactId,
    computed.resolution,
    computed.resolvedContent,
    computed.canonicalUrl,
    computed.resolvedContentHash,
  );
  return computed.resolution;
}

async function resolveUrl(rawUrl: string): Promise<ComputedSourceResolution> {
  const resolvedAt = new Date().toISOString();

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      resolution: { status: 'unreachable', resolvedAt, failureReason: `Invalid URL: ${rawUrl}` },
      resolvedContent: null,
      canonicalUrl: null,
      resolvedContentHash: null,
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
      canonicalUrl: null,
      resolvedContentHash: null,
    };
  }

  try {
    const { statusCode, statusMessage, body, finalUrl } = await fetchWithGuards(url);

    if (statusCode < 200 || statusCode >= 300) {
      return {
        resolution: {
          status: 'unreachable',
          resolvedAt,
          failureReason: `HTTP ${statusCode} ${statusMessage}`.trim(),
        },
        resolvedContent: null,
        canonicalUrl: null,
        resolvedContentHash: null,
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
            'JS-rendered pages — measured JS-rendered pages typically return substantial raw ' +
            'HTML regardless of visible content, but paywall/login-wall behavior was not ' +
            'measured — that judgment belongs to downstream content extraction, not this ' +
            'fetch-layer check.',
        },
        resolvedContent: null,
        canonicalUrl: null,
        resolvedContentHash: null,
      };
    }

    return {
      resolution: { status: 'content-retrieved', resolvedAt },
      resolvedContent: body,
      canonicalUrl: canonicalizeUrl(finalUrl),
      resolvedContentHash: hashContent(body),
    };
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
      canonicalUrl: null,
      resolvedContentHash: null,
    };
  }
}

async function persistResolution(
  sourceArtifactId: string,
  resolution: SourceResolution,
  resolvedContent: string | null,
  canonicalUrl: string | null,
  resolvedContentHash: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE source_artifact
     SET resolution_status = $2,
         resolution_resolved_at = $3,
         resolution_failure_reason = $4,
         resolution_no_content_reason = $5,
         resolved_content = $6,
         canonical_url = $7,
         resolved_content_hash = $8,
         resolution_revision = resolution_revision + 1
     WHERE id = $1`,
    [
      sourceArtifactId,
      resolution.status,
      resolution.resolvedAt ?? null,
      resolution.failureReason ?? null,
      resolution.noContentReason ?? null,
      resolvedContent,
      canonicalUrl,
      resolvedContentHash,
    ],
  );
}
