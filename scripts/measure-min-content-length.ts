/** MIN_CONTENT_LENGTH measurement harness (DDR-0002 branch (a) attempt).
 *
 *  Fetches a fixed sample of real URLs and records, per URL:
 *   - HTTP status
 *   - raw body length in characters, `body.trim().length` — the EXACT quantity
 *     `resolveSourceArtifact.ts` compared against MIN_CONTENT_LENGTH
 *   - raw body length in UTF-8 bytes
 *   - a crude extracted-text length (script/style/tag stripping, entity + whitespace collapse)
 *
 *  Run: npx tsx scripts/measure-min-content-length.ts
 *  Output: markdown table on stdout + JSON to scripts/min-content-length-measurement.json
 *
 *  The extraction here is deliberately crude and is NOT production code — it exists only to
 *  answer the question "does raw body length track real content?" It is not proposed as a
 *  replacement implementation.
 */
import { writeFileSync } from 'node:fs';
import dns from 'node:dns';
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';
import {
  isDisallowedIp,
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  FETCH_TIMEOUT_MS,
} from '../src/services/ssrfGuardedFetch.js';

/** DEVIATION FROM PRODUCTION, recorded deliberately and reproducibly.
 *
 *  This harness originally imported `fetchWithGuards` from the production module directly. On
 *  Node 22 (this repo's runtime, v22.22.0) EVERY hostname-based fetch through that function fails
 *  with `Invalid IP address: undefined` before any bytes are read. Cause: `http(s).request` invokes
 *  the custom `lookup` option with `{ hints, all: true }` and, when `all` is set, requires the
 *  callback to be given an ARRAY of `{address, family}`. Production `safeLookup` always calls back
 *  with a scalar `(null, address, family)` triple, which Node then reads as `undefined` under the
 *  `all` contract. Reproduce: `node scripts/repro-safelookup-all.mjs`.
 *
 *  That is a production defect in `ssrfGuardedFetch.ts`, NOT a measurement artifact, and it is out
 *  of scope for this constant-audit harness to fix. To take the measurement at all, this harness
 *  re-implements the same guarded fetch with one difference: its `lookup` honours `options.all`.
 *  It imports the real `isDisallowedIp`, `MAX_REDIRECTS`, `MAX_RESPONSE_BYTES` and
 *  `FETCH_TIMEOUT_MS` from production so the IP policy, hop cap, size cap and timeout are the real
 *  ones, and it computes `body.trim().length` exactly as `resolveSourceArtifact.ts` did. No
 *  request headers are set, matching production. */
function measuringLookup(
  hostname: string,
  options: dns.LookupAllOptions,
  callback: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void,
): void {
  if (net.isIP(hostname)) {
    if (isDisallowedIp(hostname)) {
      callback(new Error(`Blocked: ${hostname}`), '', 0);
      return;
    }
    const fam = net.isIPv6(hostname) ? 6 : 4;
    callback(null, options.all ? [{ address: hostname, family: fam }] : hostname, fam);
    return;
  }
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    if (!addresses?.length) return callback(new Error(`No addresses for ${hostname}`), '', 0);
    const blocked = addresses.find((a) => isDisallowedIp(a.address));
    if (blocked) return callback(new Error(`Blocked: ${blocked.address}`), '', 0);
    callback(null, options.all ? addresses : addresses[0].address, addresses[0].family);
  });
}

interface FetchResult {
  statusCode: number;
  body: string;
}

function guardedFetch(startUrl: URL, redirectsLeft = MAX_REDIRECTS): Promise<FetchResult> {
  const client = startUrl.protocol === 'https:' ? https : http;
  return new Promise<FetchResult>((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const req = client.request(
      startUrl,
      { signal: controller.signal, lookup: measuringLookup as unknown as net.LookupFunction },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          res.resume();
          clearTimeout(timeout);
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
          guardedFetch(new URL(res.headers.location, startUrl), redirectsLeft - 1).then(
            resolve,
            reject,
          );
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        let exceeded = false;
        res.on('data', (c: Buffer) => {
          if (exceeded) return;
          received += c.length;
          if (received > MAX_RESPONSE_BYTES) {
            exceeded = true;
            clearTimeout(timeout);
            res.destroy();
            req.destroy();
            reject(new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes`));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          if (exceeded) return;
          clearTimeout(timeout);
          resolve({ statusCode, body: Buffer.concat(chunks).toString('utf-8') });
        });
        res.on('error', (e) => {
          if (!exceeded) {
            clearTimeout(timeout);
            reject(e);
          }
        });
      },
    );
    req.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    req.end();
  });
}

interface Sample {
  url: string;
  /** Expected class, assigned by a human before fetching, from the page's actual purpose. */
  expected: 'content-bearing' | 'near-empty-or-error';
  note: string;
}

const SAMPLES: Sample[] = [
  // --- Genuinely content-bearing: the kind of source a Problem Department investigation cites ---
  { url: 'https://en.wikipedia.org/wiki/Market_research', expected: 'content-bearing', note: 'reference article, server-rendered' },
  { url: 'https://en.wikipedia.org/wiki/Product-market_fit', expected: 'content-bearing', note: 'reference article, server-rendered' },
  { url: 'https://www.bls.gov/news.release/empsit.nr0.htm', expected: 'content-bearing', note: 'government statistics release (labour market)' },
  { url: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20240131a.htm', expected: 'content-bearing', note: 'government press release' },
  { url: 'https://arxiv.org/abs/1706.03762', expected: 'content-bearing', note: 'research paper abstract page' },
  { url: 'https://news.ycombinator.com/', expected: 'content-bearing', note: 'server-rendered news/discussion index' },
  { url: 'https://blog.pragmaticengineer.com/', expected: 'content-bearing', note: 'industry analysis blog index' },
  { url: 'https://www.gnu.org/philosophy/free-sw.html', expected: 'content-bearing', note: 'long-form essay, static HTML' },
  { url: 'https://stripe.com/', expected: 'content-bearing', note: 'commercial landing page (marketing copy is real content)' },
  { url: 'https://linear.app/', expected: 'content-bearing', note: 'commercial landing page, JS-heavy framework' },
  { url: 'https://vercel.com/', expected: 'content-bearing', note: 'commercial landing page, JS-heavy framework' },
  { url: 'https://www.crunchbase.com/organization/stripe', expected: 'content-bearing', note: 'market-research source behind a wall — a KEY adversarial case' },

  // --- Genuinely near-empty / error / no-usable-content ---
  { url: 'https://example.com/', expected: 'near-empty-or-error', note: 'IANA placeholder page — near-empty by design' },
  { url: 'https://httpbin.org/status/200', expected: 'near-empty-or-error', note: '2xx with a genuinely empty body' },
  { url: 'https://httpbin.org/html', expected: 'near-empty-or-error', note: 'tiny fixture page, minimal real content' },
  { url: 'https://www.wikipedia.org/wiki/ThisPageDoesNotExist_ZZQQ', expected: 'near-empty-or-error', note: 'nonexistent path — error page' },
  { url: 'https://github.com/this-org-does-not-exist-zzqq/nope', expected: 'near-empty-or-error', note: '404 from a large JS app' },
  { url: 'https://www.iana.org/domains/reserved', expected: 'near-empty-or-error', note: 'short administrative stub page' },
];

function extractedTextLength(html: string): number {
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length;
}

interface Row extends Sample {
  status: number | null;
  error: string | null;
  rawTrimmedChars: number | null;
  rawBytes: number | null;
  extractedChars: number | null;
  textRatio: number | null;
}

async function main(): Promise<void> {
  const rows: Row[] = [];
  for (const s of SAMPLES) {
    process.stderr.write(`fetching ${s.url}\n`);
    try {
      const { statusCode, body } = await guardedFetch(new URL(s.url));
      const rawTrimmedChars = body.trim().length;
      const extractedChars = extractedTextLength(body);
      rows.push({
        ...s,
        status: statusCode,
        error: null,
        rawTrimmedChars,
        rawBytes: Buffer.byteLength(body, 'utf-8'),
        extractedChars,
        textRatio: rawTrimmedChars > 0 ? extractedChars / rawTrimmedChars : null,
      });
    } catch (err) {
      rows.push({
        ...s,
        status: null,
        error: err instanceof Error ? err.message : String(err),
        rawTrimmedChars: null,
        rawBytes: null,
        extractedChars: null,
        textRatio: null,
      });
    }
  }

  writeFileSync(
    new URL('./min-content-length-measurement.json', import.meta.url),
    JSON.stringify({ measuredAt: new Date().toISOString(), rows }, null, 2),
  );

  console.log('| URL | expected | HTTP | raw trimmed chars | raw bytes | extracted text chars | text/raw |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| ${r.url} | ${r.expected} | ${r.status ?? `ERR: ${r.error}`} | ${r.rawTrimmedChars ?? '—'} | ` +
        `${r.rawBytes ?? '—'} | ${r.extractedChars ?? '—'} | ${r.textRatio !== null ? r.textRatio.toFixed(4) : '—'} |`,
    );
  }
}

void main();
