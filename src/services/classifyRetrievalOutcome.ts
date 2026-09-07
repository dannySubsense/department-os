/** Pure classification function for the Landscape Researcher's controlled retrieval path
 *  (Architecture §1.6 item 3 — "Blocked vs. failed"). Deliberately separated from the retrieval
 *  I/O itself so every row of the classification table is a plain unit test with no reliance on
 *  live network behavior, per the architecture's own framing of this rule as unit-testable.
 *
 *  blocked = a deliberate, attributable refusal was obtained.
 *  failed  = no attributable refusal was obtained (could not complete, or no signal access was
 *            deliberately withheld). */

import { MAX_RESPONSE_BYTES, MAX_REDIRECTS, FETCH_TIMEOUT_MS } from './ssrfGuardedFetch.js';

export interface RetrievalClassification {
  status: 'retrieved' | 'blocked' | 'failed';
  failureReason?: string;
}

/** Raw input this pure function classifies: either a completed HTTP response (status code + body
 *  length), or a thrown error from `ssrfGuardedFetch`/protocol-validation, or a rejection prior to
 *  ever attempting a request (malformed URL / unsupported protocol / EBLOCKEDHOST). */
export type RetrievalOutcome =
  | { kind: 'http-response'; statusCode: number; statusMessage: string; bodyLength: number }
  | { kind: 'invalid-url'; rawUrl: string }
  | { kind: 'unsupported-protocol'; protocol: string }
  | { kind: 'error'; error: Error };
// NOTE: 'blocked-before-request' was removed (QC finding, Slice 6 fix) — no caller ever
// constructed it. ssrfGuardedFetch's pre-request EBLOCKEDHOST rejection surfaces as a THROWN
// error and is already classified via the 'error' kind's EBLOCKEDHOST branch below, producing the
// identical "Blocked by network policy: disallowed network address" message the Architecture
// §1.6 classification table specifies for that row.

export function classifyRetrievalOutcome(outcome: RetrievalOutcome): RetrievalClassification {
  switch (outcome.kind) {
    case 'invalid-url':
      // A URL PARSE failure — distinct from the genuine unsupported-protocol case below (e.g.
      // ftp://...), which parses fine but names a protocol this system refuses. The prior message
      // ("Unsupported URL protocol — malformed URL ...") falsely asserted a protocol cause for
      // what is actually a parse failure; this string is surfaced to human reviewers.
      return {
        status: 'failed',
        failureReason: `Malformed URL — could not be parsed: '${outcome.rawUrl}'`,
      };

    case 'unsupported-protocol':
      return {
        status: 'failed',
        failureReason: `Unsupported URL protocol '${outcome.protocol}' — only http/https are allowed.`,
      };

    case 'http-response': {
      const { statusCode, statusMessage, bodyLength } = outcome;

      if (statusCode === 401 || statusCode === 403) {
        return { status: 'blocked', failureReason: `HTTP ${statusCode} ${statusMessage}`.trim() };
      }
      if (statusCode === 451) {
        return {
          status: 'blocked',
          failureReason: `HTTP 451 Unavailable For Legal Reasons`,
        };
      }
      if (statusCode >= 200 && statusCode < 300) {
        // Emptiness only — no numeric threshold. Mirrors resolveSourceArtifact.ts after the
        // measured removal of `MIN_CONTENT_LENGTH = 200`; evidence and the reasoning this check is
        // limited to: `docs/specs/problem-department-mvp/min-content-length-measurement.md`.
        if (bodyLength === 0) {
          return {
            status: 'blocked',
            failureReason:
              'Response returned successfully but the raw response body was empty or ' +
              'whitespace-only. This check does not detect paywalls, login walls, or ' +
              'JS-rendered pages — measured JS-rendered pages typically return substantial raw ' +
              'HTML regardless of visible content, but paywall/login-wall behavior was not ' +
              'measured — that judgment belongs to downstream content extraction, not this ' +
              'fetch-layer check.',
          };
        }
        return { status: 'retrieved' };
      }
      // Any other non-2xx, non-{401,403,451} status (404, 429, 500, 502, ...).
      return { status: 'failed', failureReason: `HTTP ${statusCode} ${statusMessage}`.trim() };
    }

    case 'error': {
      const err = outcome.error;
      const message = err.message ?? '';

      if (err.name === 'AbortError') {
        return {
          status: 'failed',
          failureReason: `Request timed out after ${FETCH_TIMEOUT_MS}ms`,
        };
      }
      if ((err as NodeJS.ErrnoException).code === 'EBLOCKEDHOST') {
        return {
          status: 'blocked',
          failureReason: 'Blocked by network policy: disallowed network address',
        };
      }
      if (message.startsWith('Too many redirects')) {
        return { status: 'failed', failureReason: 'Too many redirects' };
      }
      if (message.startsWith('Invalid redirect location')) {
        return { status: 'failed', failureReason: message };
      }
      if (message.startsWith('Response exceeded maximum size')) {
        return {
          status: 'failed',
          failureReason: `Response exceeded maximum size of ${MAX_RESPONSE_BYTES} bytes`,
        };
      }
      if (message.startsWith('Blocked request to disallowed network address')) {
        return {
          status: 'blocked',
          failureReason: 'Blocked by network policy: disallowed network address',
        };
      }
      if (message.toLowerCase().includes('dns') || (err as NodeJS.ErrnoException).code === 'ENOTFOUND') {
        return { status: 'failed', failureReason: `DNS resolution failed: ${message}` };
      }
      if (message.startsWith('Redirect to unsupported URL protocol')) {
        return { status: 'failed', failureReason: message };
      }
      // Connection error/reset or any other unrecognized error — no attributable refusal signal.
      return { status: 'failed', failureReason: message || 'Unknown fetch error' };
    }

    default: {
      // Exhaustiveness guard — TypeScript proves this is unreachable given the union above.
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

// MAX_REDIRECTS is imported so it is available for callers building the redirect-chain
// error message consistently with the shared module's constant; re-exported for convenience.
export { MAX_REDIRECTS };
