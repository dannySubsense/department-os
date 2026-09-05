# MIN_CONTENT_LENGTH — Real Measurement Artifact

**Constant under audit:** `MIN_CONTENT_LENGTH` (was `= 200`, `src/services/resolveSourceArtifact.ts`)
**Measured:** 2026-09-05 (`measuredAt` in the JSON record: `2026-09-05T21:00:25.317Z`)
**Governing rule:** DDR-0002 (`docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md`)
**Status of this document:** a real, persisted measurement. It is the artifact the
`resolveSourceArtifact.ts` comment previously promised ("pending a real, artifact-backed
`benchmark` run (tracked file, not a comment, holding the URL list, script, and byte counts)").

**Finding, stated up front:** the measurement does **not** produce a sourced value for 200. It
produces the opposite result — evidence that **no raw-body-length threshold can perform the job
this constant was assigned**, and that on the measured sample every threshold from 1 to 558 is
observationally identical to 200. The recommendation is DDR-0002 **branch (c) — redesign around a
mechanism that needs no such number**, not a new number.

---

## What the constant actually gated

In `resolveSourceArtifact.ts`, `MIN_CONTENT_LENGTH` was compared against `body.trim().length` —
the raw decoded HTTP response body, HTML markup and inline script payload included, **before any
parsing or text extraction**. It was reached only on a 2xx response (non-2xx short-circuits to
`unreachable` earlier in the same function), and it decided `content-retrieved` vs
`reachable-no-content`. That classification gates US-13 evidence-eligibility in the
product-surface-checkpoint-2 spec. The same signal was imported by `classifyRetrievalOutcome.ts`
for the Landscape Researcher's `retrieved`/`blocked` decision.

So the question this measurement had to answer is not "is 200 a good number?" but: **does
`body.trim().length` carry enough information about real content to separate content-bearing from
content-empty 2xx pages at any cutoff?**

---

## Method (reproducible)

Script: `scripts/measure-min-content-length.ts`
Run: `npx tsx scripts/measure-min-content-length.ts`
Raw output record: `scripts/min-content-length-measurement.json` (URL list, timestamp, every
measured field — tracked alongside this document so the table below is generated from the run,
not retyped).

Per URL the harness records: HTTP status; `body.trim().length` (**the exact expression production
compared against the constant**); raw UTF-8 byte length; and a crude extracted-text length
(strip `<script>`/`<style>`/`<noscript>`/comments/tags, collapse entities and whitespace). The
extraction is deliberately crude and is **not** proposed as production code — it exists only to
give a second axis to compare raw length against.

The 18-URL sample was labelled `content-bearing` / `near-empty-or-error` by hand **before**
fetching, from each page's actual purpose, and is weighted toward this product's real domain:
government statistics and press releases, research abstracts, industry analysis, server-rendered
news indexes, commercial landing pages, a market-research source behind a wall (Crunchbase), plus
genuinely empty/stub/404 pages as negatives.

The measurement was **run twice**, roughly ten minutes apart. Every conclusion below held
identically on both runs; only live-page byte counts drifted slightly (e.g. Hacker News 34,958 →
34,965) and gnu.org returned a 403 on the first run and a transport error on the second. The table
below is the second run.

### One deviation from production, recorded rather than hidden

The harness was written to call production `fetchWithGuards` directly. **It cannot**: on Node 22
(this repo's runtime, `v22.22.0`) every hostname-based fetch through `fetchWithGuards` fails with
`Invalid IP address: undefined` before a single byte is read. `http(s).request` invokes the custom
`lookup` option with `{ hints, all: true }`, and under `all` Node requires the callback to receive
an **array** of `{address, family}`; production `safeLookup` always calls back with a scalar
`(null, address, family)` triple.

Reproduction: `node scripts/repro-safelookup-all.mjs` →
```
node v22.22.0
scalar-callback (production shape): ERR Invalid IP address: undefined
array-callback  (honours all)     : STATUS 200
```

This is a **production defect in `src/services/ssrfGuardedFetch.ts`**, not a measurement artifact,
and it is out of scope for this constant audit to fix — it is recorded here and should be raised as
its own defect. Its consequence for this audit is worth stating plainly: as the code stands on
Node 22, the content-length classification is **unreachable for every hostname-based URL**, because
resolution throws before the comparison. The harness therefore re-implements the guarded fetch with
the single difference that its `lookup` honours `options.all`, importing the real `isDisallowedIp`,
`MAX_REDIRECTS`, `MAX_RESPONSE_BYTES` and `FETCH_TIMEOUT_MS` from the production module so IP
policy, hop cap, size cap and timeout are the real ones. Like production, it sets no request
headers.

---

## Data

`raw trimmed chars` is the value production compared to the constant. 2xx responses first (these
are the only ones that reach the comparison), each group sorted by raw length.

| URL | pre-labelled | HTTP | raw trimmed chars | raw bytes | extracted text chars | text/raw |
|---|---|---|---|---|---|---|
| https://linear.app/ | content-bearing | 200 | 1267170 | 1267263 | 10124 | 0.0080 |
| https://stripe.com/ | content-bearing | 200 | 651587 | 652690 | 12863 | 0.0197 |
| https://vercel.com/ | content-bearing | 200 | 524181 | 524267 | 3673 | 0.0070 |
| https://www.federalreserve.gov/newsevents/pressreleases/monetary20240131a.htm | content-bearing | 200 | 82382 | 82387 | 10803 | 0.1311 |
| https://blog.pragmaticengineer.com/ | content-bearing | 200 | 54092 | 54181 | 14641 | 0.2707 |
| https://arxiv.org/abs/1706.03762 | content-bearing | 200 | 43644 | 43644 | 4875 | 0.1117 |
| https://news.ycombinator.com/ | content-bearing | 200 | 34965 | 34971 | 4003 | 0.1145 |
| https://www.iana.org/domains/reserved | near-empty-or-error | 200 | 10495 | 10499 | 2685 | 0.2558 |
| https://httpbin.org/html | near-empty-or-error | 200 | 3739 | 3741 | 3594 | 0.9612 |
| https://example.com/ | near-empty-or-error | 200 | 558 | 559 | 142 | 0.2545 |
| https://httpbin.org/status/200 | near-empty-or-error | 200 | 0 | 0 | 0 | — |
| https://github.com/this-org-does-not-exist-zzqq/nope | near-empty-or-error | 404 | 266800 | 266833 | 2904 | 0.0109 |
| https://www.crunchbase.com/organization/stripe | content-bearing | 403 | 5485 | 5485 | 749 | 0.1366 |
| https://www.bls.gov/news.release/empsit.nr0.htm | content-bearing | 403 | 1325 | 1325 | 551 | 0.4158 |
| https://en.wikipedia.org/wiki/Market_research | content-bearing | 403 | 125 | 126 | 125 | 1.0000 |
| https://en.wikipedia.org/wiki/Product-market_fit | content-bearing | 403 | 125 | 126 | 125 | 1.0000 |
| https://www.wikipedia.org/wiki/ThisPageDoesNotExist_ZZQQ | near-empty-or-error | 403 | 125 | 126 | 125 | 1.0000 |
| https://www.gnu.org/philosophy/free-sw.html | content-bearing | transport error | — | — | — | — |

18 URLs attempted. 11 returned 2xx and therefore actually reach the length comparison; 6 returned
403/404 and short-circuit to `unreachable` before the constant is consulted; 1 failed at the
transport layer.

---

## Analysis

### 1. On the measured sample, 200 is indistinguishable from any threshold in [1, 558]

The 11 raw-trimmed-length values that reach the comparison, sorted:

```
0, 558, 3739, 10495, 34965, 43644, 54092, 82382, 524181, 651587, 1267170
```

There is exactly one gap below 3739, and it is between **0** and **558**. Every threshold in the
closed interval **[1, 558]** produces byte-identical classification across all 11 rows. 200 is a
point inside that interval with nothing distinguishing it from 1, 50, or 500. Whatever the value
200 was chosen to express, the only distinction it actually draws on real data is
**"the body was completely empty."**

### 2. Raw length does not rank content — the JS-shell failure mode is confirmed, not hypothetical

The text/raw ratio across 2xx responses spans **0.0070 to 0.9612 — a factor of 137**. Raw length is
dominated by markup and inline JS payload, which varies independently of how much content the page
carries. The clearest single comparison in the data:

- `https://vercel.com/` — **524,181** raw chars → **3,673** chars of extracted text
- `https://httpbin.org/html` — **3,739** raw chars → **3,594** chars of extracted text

**140x more raw body buys 2% more actual text.** A raw-length ordering is not a content ordering.
Any cutoff on this axis measures page weight, not content.

### 3. The threshold false-positived on the canonical empty page

`https://example.com/` — the IANA placeholder, near-empty by design, 142 chars of extracted
boilerplate — returns 558 raw chars and was classified **`content-retrieved`** at the old
threshold, clearing it by 2.8x. Raising the threshold to catch it does not help: it would have to
exceed 558, and the next real signal above that is 3,739. Any cutoff placed to exclude
example.com's boilerplate sits arbitrarily in a ~3,180-char no-man's-land containing no measured
page, and would still admit vercel.com's 524,181 raw chars of near-contentless shell.

### 4. Sub-threshold bodies in this sample are 403s, which never reach the constant

The sub-200 raw lengths measured (125, 125, 125) are all **403 challenge/blocked responses**, which
`resolveUrl` classifies `unreachable` before the length check. That is a second, independent reason
the constant did no separating work here: the short bodies it existed to catch are already caught
upstream by status code.

Worth flagging separately, though out of this audit's scope: production sets **no request headers**,
and 5 of 18 URLs — including Wikipedia, bls.gov and Crunchbase, all squarely in this product's
research domain — returned **403** to that header-less request. Those become `unreachable` for a
reason that is about the fetcher, not the source.

---

## Conclusion and recommendation

**`MIN_CONTENT_LENGTH = 200` cannot be sourced, and the mechanism cannot be fixed by choosing a
different number.** Raw body length is not a proxy for content: it fails to rank content
(0.0070–0.9612 ratio spread; 140x raw-length difference for 2% text difference), it admits the
canonical empty page, and the only boundary it demonstrably resolves on real data is empty vs
non-empty.

**Recommended disposition: DDR-0002 branch (c) — redesign around a mechanism that needs no such
number.** Concretely, the honest form of the check that the data supports is:

```ts
if (body.trim().length === 0) { /* reachable-no-content */ }
```

This deletes the constant, changes classification on **zero** of the 11 measured 2xx responses, and
reduces the check to exactly what it can truthfully claim: *the server returned a 2xx with an empty
body.* It is a redesign of the claim as well as the code — the old `noContentReason` prose ("likely
an empty or near-empty page") asserted a "near-empty" discrimination the mechanism has now been
measured not to possess.

**What a real content-quality gate would require** (a product/spec decision for US-13
evidence-eligibility, not a threshold to tune): extraction first, then a threshold on *extracted
text*, calibrated against a labelled sample of this domain's sources. That is a different mechanism,
and any threshold on it would need its own measurement under DDR-0002. This document does not
propose one and does not authorize one; adopting the extraction path is Danny's call.

**Not resolved by this document:** whether the US-13 evidence-eligibility rule in
product-surface-checkpoint-2 still holds once `reachable-no-content` collapses to "empty body only",
and `02-ARCHITECTURE.md`'s description of this threshold, which still documents the old behaviour
and quotes its old failure message.

---

## Addendum — concurrent deletion, recorded for honesty about ordering

While this measurement was being taken, another writer working in the same tree **independently
deleted `MIN_CONTENT_LENGTH`** and replaced both call sites (`resolveSourceArtifact.ts` and
`classifyRetrievalOutcome.ts`) with `body.trim().length === 0` / `bodyLength === 0` — the same
redesign this document recommends. That change was not made by this measurement and was not caused
by it; the two agree, but the agreement is convergent, not causal.

This matters for provenance and is stated rather than smoothed over: had the measurement come out
differently, the deletion would already have been applied. **The evidence for the redesign is this
document; the code change preceded it.** Anyone reviewing the merged result should treat this
artifact as the retrospective justification and confirm the two are merged together, so the code
does not land carrying a rationale that exists only in a commit message.
