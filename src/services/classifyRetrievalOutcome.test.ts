import { describe, expect, it } from 'vitest';
import { classifyRetrievalOutcome } from './classifyRetrievalOutcome.js';
import { MAX_RESPONSE_BYTES, FETCH_TIMEOUT_MS } from './ssrfGuardedFetch.js';
import { MIN_CONTENT_LENGTH } from './resolveSourceArtifact.js';

/** Full-table coverage of Architecture §1.6 item 3's blocked/failed classification rule — one
 *  test per table row, pure function, no network. */

describe('classifyRetrievalOutcome — blocked cases', () => {
  it('classifies HTTP 401 as blocked', () => {
    const result = classifyRetrievalOutcome({
      kind: 'http-response',
      statusCode: 401,
      statusMessage: 'Unauthorized',
      bodyLength: 1000,
    });
    expect(result.status).toBe('blocked');
    expect(result.failureReason).toBe('HTTP 401 Unauthorized');
  });

  it('classifies HTTP 403 as blocked', () => {
    const result = classifyRetrievalOutcome({
      kind: 'http-response',
      statusCode: 403,
      statusMessage: 'Forbidden',
      bodyLength: 1000,
    });
    expect(result.status).toBe('blocked');
    expect(result.failureReason).toBe('HTTP 403 Forbidden');
  });

  it('classifies HTTP 451 (legal/regulatory unavailability) as blocked', () => {
    const result = classifyRetrievalOutcome({
      kind: 'http-response',
      statusCode: 451,
      statusMessage: 'Unavailable For Legal Reasons',
      bodyLength: 1000,
    });
    expect(result.status).toBe('blocked');
    expect(result.failureReason).toBe('HTTP 451 Unavailable For Legal Reasons');
  });

  it('classifies a 2xx response with body length below MIN_CONTENT_LENGTH as blocked (paywall/login-wall/JS-only heuristic)', () => {
    const result = classifyRetrievalOutcome({
      kind: 'http-response',
      statusCode: 200,
      statusMessage: 'OK',
      bodyLength: MIN_CONTENT_LENGTH - 1,
    });
    expect(result.status).toBe('blocked');
    expect(result.failureReason).toMatch(/paywall|login wall|JS-only/i);
  });

  it('classifies a thrown EBLOCKEDHOST error (from safeLookup mid-redirect) as blocked', () => {
    const err = Object.assign(new Error('Blocked request to disallowed network address: 10.0.0.5'), {
      code: 'EBLOCKEDHOST',
    });
    const result = classifyRetrievalOutcome({ kind: 'error', error: err });
    expect(result.status).toBe('blocked');
    expect(result.failureReason).toMatch(/blocked by network policy/i);
  });

  it('classifies a thrown "Blocked request to disallowed network address" error (from fetchWithGuards\' up-front IP-literal check, no error code set) as blocked', () => {
    const err = new Error('Blocked request to disallowed network address: 127.0.0.1');
    const result = classifyRetrievalOutcome({ kind: 'error', error: err });
    expect(result.status).toBe('blocked');
    expect(result.failureReason).toMatch(/blocked by network policy/i);
  });
});

describe('classifyRetrievalOutcome — failed cases', () => {
  it('classifies a DNS resolution failure as failed', () => {
    const err = Object.assign(new Error("DNS resolution for 'nonexistent.example' returned no addresses"), {
      code: 'ENOTFOUND',
    });
    const result = classifyRetrievalOutcome({ kind: 'error', error: err });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toMatch(/dns/i);
  });

  it('classifies a request timeout (AbortError) as failed', () => {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    const result = classifyRetrievalOutcome({ kind: 'error', error: err });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe(`Request timed out after ${FETCH_TIMEOUT_MS}ms`);
  });

  it('classifies a connection error/reset as failed (no attributable refusal signal)', () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    const result = classifyRetrievalOutcome({ kind: 'error', error: err });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('socket hang up');
  });

  it('classifies a response exceeding MAX_RESPONSE_BYTES as failed', () => {
    const err = new Error(`Response exceeded maximum size of ${MAX_RESPONSE_BYTES} bytes`);
    const result = classifyRetrievalOutcome({ kind: 'error', error: err });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe(`Response exceeded maximum size of ${MAX_RESPONSE_BYTES} bytes`);
  });

  it('classifies "Too many redirects" as failed', () => {
    const err = new Error('Too many redirects');
    const result = classifyRetrievalOutcome({ kind: 'error', error: err });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('Too many redirects');
  });

  it('classifies an invalid redirect Location as failed', () => {
    const err = new Error('Invalid redirect location: not-a-url');
    const result = classifyRetrievalOutcome({ kind: 'error', error: err });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('Invalid redirect location: not-a-url');
  });

  it('classifies any other non-2xx, non-{401,403,451} HTTP status (e.g. 404) as failed', () => {
    const result = classifyRetrievalOutcome({
      kind: 'http-response',
      statusCode: 404,
      statusMessage: 'Not Found',
      bodyLength: 1000,
    });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('HTTP 404 Not Found');
  });

  it('classifies HTTP 500 as failed', () => {
    const result = classifyRetrievalOutcome({
      kind: 'http-response',
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      bodyLength: 1000,
    });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('HTTP 500 Internal Server Error');
  });

  it('classifies HTTP 429 (rate-limited retrieval) as failed, not blocked — the search-call-level rate limit is a QueryLimitation, not this retrieval classification', () => {
    const result = classifyRetrievalOutcome({
      kind: 'http-response',
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      bodyLength: 1000,
    });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('HTTP 429 Too Many Requests');
  });

  it('classifies a malformed URL as failed', () => {
    const result = classifyRetrievalOutcome({ kind: 'invalid-url', rawUrl: 'not a url' });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toMatch(/malformed url/i);
  });

  it('classifies an unsupported protocol (not http/https) on the selected result as failed', () => {
    const result = classifyRetrievalOutcome({ kind: 'unsupported-protocol', protocol: 'ftp:' });
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe(
      "Unsupported URL protocol 'ftp:' — only http/https are allowed.",
    );
  });
});

describe('classifyRetrievalOutcome — retrieved', () => {
  it('classifies a 2xx response with body length at/above MIN_CONTENT_LENGTH as retrieved, no failureReason', () => {
    const result = classifyRetrievalOutcome({
      kind: 'http-response',
      statusCode: 200,
      statusMessage: 'OK',
      bodyLength: MIN_CONTENT_LENGTH,
    });
    expect(result.status).toBe('retrieved');
    expect(result.failureReason).toBeUndefined();
  });
});
