import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import dns from 'node:dns';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ipv4ToInt,
  inIpv4Cidr,
  decodeMappedIpv4Hex,
  isDisallowedIp,
  safeLookup,
  fetchWithGuards,
  __allowPrivateNetworkHostForTests,
  __resetPrivateNetworkTestAllowlist,
} from './ssrfGuardedFetch.js';

/** Direct unit coverage for ssrfGuardedFetch.ts's pure helper exports, now that this module has
 *  its own identity (Architecture §1.6 extraction step). The end-to-end network-guard behavior
 *  (fetchWithGuards/safeLookup wired through real requests) already has passing coverage via
 *  resolveSourceArtifact.ssrf.test.ts, which exercises this module indirectly — these tests add
 *  the pure-function edge cases that indirect coverage doesn't reach directly (malformed input,
 *  boundary values), without duplicating the existing end-to-end suite. */

describe('ipv4ToInt', () => {
  it('parses a valid dotted-quad IPv4 address', () => {
    // Computed via multiplication (not `<<`) since `192 << 24` overflows into a signed int32
    // in JS, which would make this expected value wrong for octets >= 128 — the exact class of
    // bug `ipv4ToInt`'s `>>> 0` coercion exists to avoid.
    expect(ipv4ToInt('192.168.1.1')).toBe(192 * 2 ** 24 + 168 * 2 ** 16 + 1 * 2 ** 8 + 1);
  });

  it('returns null for a malformed address (wrong octet count)', () => {
    expect(ipv4ToInt('1.2.3')).toBeNull();
  });

  it('returns null for an out-of-range octet', () => {
    expect(ipv4ToInt('1.2.3.999')).toBeNull();
  });
});

describe('inIpv4Cidr', () => {
  it('returns true for an address inside the given CIDR range', () => {
    expect(inIpv4Cidr('10.1.2.3', '10.0.0.0', 8)).toBe(true);
  });

  it('returns false for an address outside the given CIDR range', () => {
    expect(inIpv4Cidr('11.1.2.3', '10.0.0.0', 8)).toBe(false);
  });
});

describe('decodeMappedIpv4Hex', () => {
  it('decodes the compressed-hex IPv4-mapped IPv6 form (::ffff:7f00:1) to dotted-quad', () => {
    expect(decodeMappedIpv4Hex('::ffff:7f00:1')).toBe('127.0.0.1');
  });

  it('decodes the less-common ::ffff:0:HHHH:HHHH form to dotted-quad', () => {
    expect(decodeMappedIpv4Hex('::ffff:0:7f00:1')).toBe('127.0.0.1');
  });

  it('returns null for a non-IPv4-mapped IPv6 address', () => {
    expect(decodeMappedIpv4Hex('2001:db8::1')).toBeNull();
  });
});

describe('isDisallowedIp', () => {
  it('blocks CGNAT range (100.64.0.0/10, RFC 6598)', () => {
    expect(isDisallowedIp('100.64.1.1')).toBe(true);
  });

  it('blocks IPv6 loopback (::1)', () => {
    expect(isDisallowedIp('::1')).toBe(true);
  });

  it('allows a public IPv4 address', () => {
    expect(isDisallowedIp('93.184.216.34')).toBe(false);
  });

  it('fails closed on an unrecognized address format', () => {
    expect(isDisallowedIp('not-an-ip')).toBe(true);
  });
});

/** C2-S1 regression coverage (Architecture §4.6): the Node 22 defect fixed `safeLookup`'s
 *  callback contract to honor `options.all` on both the IP-literal and DNS-resolution branches,
 *  which was previously hardcoded to the single-value shape regardless of what the caller asked
 *  for — starving any Node-internal caller (e.g. `http.request`'s own `lookup` re-invocation
 *  pattern under Node 22) that requests `{ all: true }`. These tests call `safeLookup` directly,
 *  never through `fetchWithGuards`/`allowedTestHosts`, so they exercise the real production
 *  branches, not a test bypass. */
describe('safeLookup — options.all support (C2-S1 Node 22 fix, §4.6)', () => {
  it('returns an array-of-one LookupAddress for an allowed IP literal when options.all is true (Test 2)', () => {
    // 8.8.8.8 (not 127.0.0.1) — 127.0.0.1 is rejected by the fail-closed block check before ever
    // reaching this arm; 8.8.8.8 clears every range `isDisallowedIp` blocks, so it correctly
    // reaches the `options.all` branch this test exists to cover.
    return new Promise<void>((resolve, reject) => {
      safeLookup('8.8.8.8', { all: true }, (err, address) => {
        try {
          expect(err).toBeNull();
          expect(address).toEqual([{ address: '8.8.8.8', family: 4 }]);
          resolve();
        } catch (assertionError) {
          reject(assertionError as Error);
        }
      });
    });
  });

  it('returns the single-value (address, family) shape for an IP literal when options.all is falsy (Test 4a)', () => {
    return new Promise<void>((resolve, reject) => {
      safeLookup('8.8.8.8', {}, (err, address, family) => {
        try {
          expect(err).toBeNull();
          expect(address).toBe('8.8.8.8');
          expect(family).toBe(4);
          resolve();
        } catch (assertionError) {
          reject(assertionError as Error);
        }
      });
    });
  });

  it('returns the single-value (address, family) shape for a DNS-resolved hostname when options.all is falsy (Test 4b)', () => {
    const lookupSpy = vi
      .spyOn(dns, 'lookup')
      // Existing test file has no prior DNS-mocking pattern to follow (indirect coverage in
      // resolveSourceArtifact.ssrf.test.ts uses a real fixture HTTP server, not a DNS mock) — this
      // spies on the one `dns.lookup` call `safeLookup`'s DNS-resolution branch makes, so the test
      // stays network-independent without introducing a new mocking library.
      .mockImplementation(((_hostname: string, _options: unknown, callback: (...args: any[]) => void) => {
        callback(null, [{ address: '93.184.216.34', family: 4 }]);
      }) as unknown as typeof dns.lookup);

    return new Promise<void>((resolve, reject) => {
      safeLookup('safelookup-dns-test.invalid', {}, (err, address, family) => {
        try {
          expect(err).toBeNull();
          expect(address).toBe('93.184.216.34');
          expect(family).toBe(4);
          resolve();
        } catch (assertionError) {
          reject(assertionError as Error);
        } finally {
          lookupSpy.mockRestore();
        }
      });
    });
  });

  it('rejects a hostname resolving to a mixed allowed/disallowed address set in full under options.all — block semantics not weakened (Test 3)', () => {
    const lookupSpy = vi
      .spyOn(dns, 'lookup')
      .mockImplementation(((_hostname: string, _options: unknown, callback: (...args: any[]) => void) => {
        callback(null, [
          { address: '93.184.216.34', family: 4 }, // public, allowed
          { address: '127.0.0.1', family: 4 }, // loopback, disallowed
        ]);
      }) as unknown as typeof dns.lookup);

    return new Promise<void>((resolve, reject) => {
      safeLookup('mixed-address-set-test.invalid', { all: true }, (err, address) => {
        try {
          expect(err).not.toBeNull();
          expect((err as NodeJS.ErrnoException).code).toBe('EBLOCKEDHOST');
          // Fail-closed: the whole result is rejected, not filtered down to the allowed address.
          expect(address).toBe('');
          resolve();
        } catch (assertionError) {
          reject(assertionError as Error);
        } finally {
          lookupSpy.mockRestore();
        }
      });
    });
  });
});

/** C2-S1 Test 1 (§4.6): a real, actually-reachable hostname-based source must resolve
 *  successfully end-to-end on the production code path — not the `allowedTestHosts` bypass —
 *  under this repo's live Node version. This is the exact regression the Node 22 defect broke
 *  (hostname-based `url` sources silently starving resolution); a bypassed/mocked path cannot
 *  prove the production `lookup` wiring itself works. */
describe('fetchWithGuards — real network resolution (C2-S1 Node 22 regression, Test 1)', () => {
  it('resolves a real, reachable hostname-based URL end-to-end without using allowedTestHosts', async () => {
    const result = await fetchWithGuards(new URL('http://example.com/'));
    expect(result.statusCode).toBeGreaterThanOrEqual(200);
    expect(result.statusCode).toBeLessThan(400);
  }, 15_000);
});

/** C2-S1 §4.6a (SOL-MEDIUM-1 fix): `FetchResult.finalUrl` must reflect the terminal URL of a
 *  redirect chain, not the originally-requested URL — required before C2-S2/C2-S3 can derive
 *  `canonical_url` from the real post-redirect destination. */
describe('fetchWithGuards — finalUrl reflects the terminal URL of a redirect chain (§4.6a, Test 5)', () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { Location: '/final' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('terminal');
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
    __allowPrivateNetworkHostForTests('localhost');
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    __resetPrivateNetworkTestAllowlist();
  });

  it('returns finalUrl equal to the terminal URL after following a redirect, not the originally-requested URL', async () => {
    const result = await fetchWithGuards(new URL(`${baseUrl}/start`));
    expect(result.finalUrl).toBe(`${baseUrl}/final`);
    expect(result.finalUrl).not.toBe(`${baseUrl}/start`);
  });
});
