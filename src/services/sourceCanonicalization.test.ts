import { describe, expect, it } from 'vitest';
import { canonicalizeUrl } from './sourceCanonicalization.js';

// Unit coverage for canonicalizeUrl (04-ROADMAP.md C2-S2 Tests list, §4.8 SOL-MEDIUM-1 fix).

describe('canonicalizeUrl', () => {
  it('lowercases scheme and host', () => {
    expect(canonicalizeUrl('HTTPS://Example.COM/Path')).toBe('https://example.com/Path');
  });

  it('collapses a trailing-slash-only path to a bare root', () => {
    expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(canonicalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('strips common tracking query parameters but preserves other params', () => {
    const result = canonicalizeUrl(
      'https://example.com/page?utm_source=x&gclid=y&fbclid=z&real=1',
    );
    expect(result).toBe('https://example.com/page?real=1');
  });

  it('removes the fragment', () => {
    expect(canonicalizeUrl('https://example.com/page#section')).toBe(
      'https://example.com/page',
    );
  });

  it('returns null for a value that does not parse as a URL', () => {
    expect(canonicalizeUrl('not a url')).toBeNull();
  });
});
