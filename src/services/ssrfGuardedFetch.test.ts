import { describe, expect, it } from 'vitest';
import { ipv4ToInt, inIpv4Cidr, decodeMappedIpv4Hex, isDisallowedIp } from './ssrfGuardedFetch.js';

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
