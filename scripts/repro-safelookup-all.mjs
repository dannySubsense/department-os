/** Minimal reproduction of the `safeLookup` / `options.all` defect in
 *  `src/services/ssrfGuardedFetch.ts`, found 2026-09-05 while taking the MIN_CONTENT_LENGTH
 *  measurement (see docs/specs/problem-department-mvp/min-content-length-measurement.md).
 *
 *  On Node 22, http(s).request calls the custom `lookup` with `{ hints, all: true }` and, when
 *  `all` is set, requires an ARRAY of { address, family }. Production `safeLookup` always calls
 *  back with a scalar triple, so every hostname-based fetch fails before reading any bytes.
 *
 *  Run: node scripts/repro-safelookup-all.mjs
 *  Expected on Node 22: "scalar-callback (production shape): ERR Invalid IP address: undefined"
 *                       "array-callback  (honours all):      STATUS 200"
 */
import dns from 'node:dns';
import https from 'node:https';

function attempt(label, honourAll) {
  return new Promise((resolve) => {
    const lookup = (host, opts, cb) =>
      dns.lookup(host, { all: true }, (e, a) => {
        if (e) return cb(e, '', 0);
        if (honourAll && opts.all) return cb(null, a);
        return cb(null, a[0].address, a[0].family);
      });
    const req = https.request(new URL('https://example.com/'), { lookup }, (r) => {
      console.log(`${label}: STATUS ${r.statusCode}`);
      r.resume();
      r.on('end', resolve);
    });
    req.on('error', (e) => { console.log(`${label}: ERR ${e.message}`); resolve(); });
    req.end();
  });
}

console.log(`node ${process.version}`);
await attempt('scalar-callback (production shape)', false);
await attempt('array-callback  (honours all)     ', true);
