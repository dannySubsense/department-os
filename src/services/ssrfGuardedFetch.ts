import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

/** Shared SSRF-hardened fetch machinery (Architecture §1.6 addendum) — extracted from
 *  `resolveSourceArtifact.ts` (Slice 4/checkpoint-correction) so both the Source Resolver and the
 *  Landscape Researcher's controlled retrieval path (Slice 6) import one hardened implementation
 *  rather than maintaining two independently-drifting copies. Pure move: no behavior change from
 *  the original module-private implementation. */

/** Fetch timeout — bounds how long a single unreachable/hanging source can block resolution.
 *  PROVISIONAL — unvalidated; owner: Ledger. */
export const FETCH_TIMEOUT_MS = 10_000;

/** Response body size cap (Sol review item 2 — SSRF hardening): a malicious or misbehaving source
 *  could otherwise stream an unbounded response into memory. PROVISIONAL — unvalidated against
 *  real-world source sizes; owner: Ledger. Revisit if legitimate long-form sources are seen
 *  truncating. */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

/** Redirect hop cap — bounds how long a redirect chain can be followed before giving up.
 *  PROVISIONAL — unvalidated; owner: Ledger. */
export const MAX_REDIRECTS = 5;

/** Test-only escape hatch (Sol review item 2 fix). Private/loopback-network blocking is applied
 *  to every hostname by default, including `localhost`/`127.0.0.1` — necessary for the SSRF
 *  regression tests, which deliberately target loopback/private addresses to prove the guard
 *  works. Fixture-server-based tests legitimately run their fixture HTTP servers on `localhost`;
 *  those tests opt that exact hostname into this allowlist via `__allowPrivateNetworkHostForTests`
 *  in `beforeAll`/`beforeEach`, while SSRF regression tests target raw IP literals (e.g.
 *  `127.0.0.1`, `169.254.169.254`) that are never added here, so the guard is still exercised for
 *  real. Only ever called from `*.test.ts` files. */
const allowedTestHosts = new Set<string>();

export function __allowPrivateNetworkHostForTests(host: string): void {
  allowedTestHosts.add(host.toLowerCase());
}

export function __resetPrivateNetworkTestAllowlist(): void {
  allowedTestHosts.clear();
}

/** IPv4 CIDR check via unsigned 32-bit int comparison — no extra dependency needed for the
 *  ranges this guard cares about. */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    n = (n << 8) | octet;
  }
  return n >>> 0;
}

export function inIpv4Cidr(ip: string, base: string, prefixLen: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  const mask = prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** WHATWG `URL` normalizes IPv4-mapped IPv6 addresses to COMPRESSED HEX form before hostname
 *  ever reaches this guard — e.g. `http://[::ffff:127.0.0.1]/` becomes `hostname` `[::ffff:7f00:1]`,
 *  never the dotted-quad form. A regex matching only the dotted form (`::ffff:a.b.c.d`) is
 *  therefore dead code against any real URL-derived hostname and lets the entire mapped-address
 *  class through unblocked (confirmed live: `http://[::ffff:7f00:1]/` reached a local loopback
 *  listener). This decodes both hex-group forms Node's `URL` actually produces —
 *  `::ffff:HHHH:HHHH` and the less-common `::ffff:0:HHHH:HHHH` — back to dotted-quad IPv4 so the
 *  embedded address can be run through the existing IPv4 range check. Returns null if `ip` is not
 *  a recognized IPv4-mapped IPv6 hex form. */
export function decodeMappedIpv4Hex(ip: string): string | null {
  const match = ip.match(/^::ffff:(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!match) return null;
  const high = parseInt(match[1], 16);
  const low = parseInt(match[2], 16);
  if (Number.isNaN(high) || Number.isNaN(low)) return null;
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join('.');
}

/** Sol review item 2: blocks RFC 1918 private ranges, loopback, link-local (including the common
 *  cloud-metadata-endpoint SSRF target 169.254.169.254), CGNAT (RFC 6598), multicast, reserved/
 *  future-use, IETF protocol assignments, and IPv6 loopback/unique-local/link-local equivalents.
 *  Applied to every IP a hostname resolves to, and to every redirect hop (see `fetchWithGuards`)
 *  — not just the initial URL. */
export function isDisallowedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return (
      inIpv4Cidr(ip, '10.0.0.0', 8) ||
      inIpv4Cidr(ip, '172.16.0.0', 12) ||
      inIpv4Cidr(ip, '192.168.0.0', 16) ||
      inIpv4Cidr(ip, '127.0.0.0', 8) ||
      inIpv4Cidr(ip, '169.254.0.0', 16) ||
      inIpv4Cidr(ip, '0.0.0.0', 8) ||
      inIpv4Cidr(ip, '100.64.0.0', 10) || // CGNAT (RFC 6598)
      inIpv4Cidr(ip, '224.0.0.0', 4) || // multicast
      inIpv4Cidr(ip, '240.0.0.0', 4) || // reserved/future use
      inIpv4Cidr(ip, '192.0.0.0', 24) // IETF protocol assignments
    );
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fe80:')) return true; // link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // unique local fc00::/7
    // IPv4-mapped IPv6, dotted-quad form (::ffff:a.b.c.d) — retained defensively in case a
    // hostname ever reaches this guard via a path other than WHATWG `URL` normalization.
    const dottedMapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dottedMapped) return isDisallowedIp(dottedMapped[1]);
    // IPv4-mapped IPv6, compressed-hex form — the form `URL.hostname` actually produces.
    const hexMapped = decodeMappedIpv4Hex(normalized);
    if (hexMapped) return isDisallowedIp(hexMapped);
    return false;
  }
  return true; // unrecognized format — fail closed
}

/** Custom `lookup` for `http.request`/`https.request`: validates the destination IP BEFORE the
 *  socket connects (avoiding a DNS-resolve-then-separately-connect TOCTOU/rebinding gap), and is
 *  invoked fresh for every redirect hop since each hop issues its own request through this same
 *  option (Sol review item 2 — "must also apply to every redirect hop"). */
export function safeLookup(
  hostname: string,
  options: dns.LookupOneOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
): void {
  if (allowedTestHosts.has(hostname.toLowerCase())) {
    dns.lookup(hostname, options, callback);
    return;
  }

  if (net.isIP(hostname)) {
    if (isDisallowedIp(hostname)) {
      callback(
        Object.assign(new Error(`Blocked request to disallowed network address: ${hostname}`), {
          code: 'EBLOCKEDHOST',
        }),
        '',
        0,
      );
      return;
    }
    callback(null, hostname, net.isIPv6(hostname) ? 6 : 4);
    return;
  }

  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    if (!addresses || addresses.length === 0) {
      callback(new Error(`DNS resolution for '${hostname}' returned no addresses`), '', 0);
      return;
    }
    const blocked = addresses.find((a) => isDisallowedIp(a.address));
    if (blocked) {
      callback(
        Object.assign(
          new Error(
            `Blocked request to disallowed network address: ${blocked.address} (resolved from '${hostname}')`,
          ),
          { code: 'EBLOCKEDHOST' },
        ),
        '',
        0,
      );
      return;
    }
    const chosen = addresses[0];
    callback(null, chosen.address, chosen.family);
  });
}

export interface FetchResult {
  statusCode: number;
  statusMessage: string;
  body: string;
}

/** Performs the HTTP(S) request with SSRF guards: caller is responsible for protocol validation
 *  before calling this; this handles IP-safety (via `safeLookup`, applied per-hop), manual
 *  redirect-following with the same guard re-applied at every hop, a request timeout, and a
 *  response-size cap enforced while streaming (never buffers past `MAX_RESPONSE_BYTES`). */
export async function fetchWithGuards(
  startUrl: URL,
  redirectsLeft = MAX_REDIRECTS,
): Promise<FetchResult> {
  const client = startUrl.protocol === 'https:' ? https : http;

  // Node's `net`/`http` layer skips the custom `lookup` option entirely when the hostname is
  // already a literal IP address (no DNS resolution is needed to connect) — so `safeLookup` alone
  // never runs for IP-literal URLs like `http://127.0.0.1/...` or a redirect Location pointing at
  // a raw IP. Validate IP literals explicitly, up front, before ever attempting to connect.
  const bareHost = startUrl.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets, if present
  if (net.isIP(bareHost) && !allowedTestHosts.has(bareHost.toLowerCase())) {
    if (isDisallowedIp(bareHost)) {
      throw new Error(`Blocked request to disallowed network address: ${bareHost}`);
    }
  }

  return new Promise<FetchResult>((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const req = client.request(
      startUrl,
      { signal: controller.signal, lookup: safeLookup as unknown as net.LookupFunction },
      (res) => {
        const statusCode = res.statusCode ?? 0;

        // Redirect handling — validated at every hop, not just the initial URL.
        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          res.resume(); // discard body
          clearTimeout(timeout);
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          let nextUrl: URL;
          try {
            nextUrl = new URL(res.headers.location, startUrl);
          } catch {
            reject(new Error(`Invalid redirect location: ${res.headers.location}`));
            return;
          }
          if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
            reject(
              new Error(
                `Redirect to unsupported URL protocol '${nextUrl.protocol}' — only http/https are allowed.`,
              ),
            );
            return;
          }
          fetchWithGuards(nextUrl, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        let exceeded = false;

        res.on('data', (chunk: Buffer) => {
          if (exceeded) return;
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_RESPONSE_BYTES) {
            exceeded = true;
            clearTimeout(timeout);
            res.destroy();
            req.destroy();
            reject(
              new Error(`Response exceeded maximum size of ${MAX_RESPONSE_BYTES} bytes`),
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          if (exceeded) return;
          clearTimeout(timeout);
          resolve({
            statusCode,
            statusMessage: res.statusMessage ?? '',
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });

        res.on('error', (err) => {
          if (exceeded) return;
          clearTimeout(timeout);
          reject(err);
        });
      },
    );

    req.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (controller.signal.aborted) {
        const abortErr = new Error('Request aborted');
        abortErr.name = 'AbortError';
        reject(abortErr);
        return;
      }
      reject(err);
    });

    req.end();
  });
}
