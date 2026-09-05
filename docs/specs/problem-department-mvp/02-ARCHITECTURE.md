# Architecture: Problem Department — Vertical Slice MVP

**Status**: Frank spec-gate: PASS (attempt 2/3, 2026-08-08) — all four PR-review blocking
findings (bitemporal query, evidence-stance placement, ProblemBrief immutability, non-empty
citation contract) and the resulting NegativeFinding gap independently re-verified fixed.
**Date**: 2026-08-08
**Feeds**: `01-REQUIREMENTS.md` (13 stories / see Acceptance Criteria section for current count)

## Scope Discipline

Per `docs/roadmap.md`, `docs/milestones/problem-department-mvp.md`, and `docs/principles.md`, this
document does **not** select: an agent runtime, a database/storage technology, a web/application
framework, a backend language, or deployment infrastructure. Those are explicitly reserved for the
runtime-evaluation exercise this milestone exists to run. Everything below is expressed as
**domain model, service responsibilities, and contracts** — a shape any candidate runtime and
storage technology must be able to satisfy, and a shape the runtime evaluation can be scored
against.

This document also does not design the Opportunity schema (acknowledged future concept only).

**Q-8 (runtime adoption scope, binding)**: This milestone practically evaluates and adopts a
runtime for its own implementation. That adoption is not a permanent Department OS platform
commitment and may be revisited through a future DDR.

---

## 1. Two Explicit Architectural Decisions (flagged as open by Requirements)

### 1.1 Source-artifact types beyond URL/text

**Decision**: `SourceArtifact.type` is an **open, string-keyed discriminator**, not a closed
enum — this MVP implements exactly two variants, `url` and `text`, but the schema shape does not
assume these are the only two that will ever exist.

**Reasoning**: Requirements' "Assumes" section names URL/text as the only two types Intake/Interview
actually specified, and explicitly defers file uploads/screenshots as "an open question for
architecture." Given the sibling constraint that the *submission* input contract must not
hard-code a human-only origin (US-1 AC2) and the Interview's confirmed future need for
collector-fed and multi-channel sources (bookmarks, browser history, notes-app saves), the
artifact-type field carries the same shape risk as the origin field: closing it to exactly
`{url, text}` would require a breaking schema change the moment a third type (e.g. `file`,
`screenshot`) is needed. Following the same extensibility pattern the requirements already mandate
for demand-signal types (US-4 AC1 — named list, extensible to "other") avoids re-litigating this
later. This is not scope creep: no third type is built, validated, or retrieved in this MVP —
only the type discriminator is left open rather than closed.

**Typing correction (G-2, Review Section 3)**: `'url' | 'text' | string` collapses to plain
`string` in TypeScript — the literals are absorbed and provide zero type safety, autocomplete, or
exhaustiveness checking, which is not what "open but guided" means. The schemas in Section 3 below
use `'url' | 'text' | (string & {})`, which preserves literal-type hints in tooling while staying
structurally open to any future string value. Same fix applies to `SubmissionOrigin`.

### 1.2 Submission-to-Brief cardinality

**Decision**: One **Investigation** aggregates one-or-more **SourceArtifacts** from one-or-more
submission calls, and produces **exactly one Problem Brief identity** (a lineage of ordered,
immutable `BriefVersion`s). Splitting a single Investigation's evidence into multiple distinct
problems is out of scope for this MVP.

**Reasoning**: This matches Requirements' explicit "Assumes" statement, which cites milestone step 7
("Generate one cited Problem Brief") and flags splitting as a future architecture question, not
one to resolve now. Architecturally this is realized by keeping `Investigation` and
`ProblemBrief` as two distinct entities (rather than collapsing submission directly into Brief)
specifically so that a future split — one Investigation later found to contain N distinct
problems — is a additive schema change (Investigation gains a one-to-many relationship to
ProblemBrief) rather than a breaking one. No multi-brief logic is built now; the join table shape
already supports it without redesign.

Neither decision required a HALT: both have a single reasoned answer traceable to explicit
Requirements/Interview language, and both are structured so the deferred alternative remains a
additive (not breaking) future change — consistent with "YAGNI governs timing, not removal of
requirements" (`docs/principles.md`).

### 1.3 Claim validity and claim/evidence carriage across Brief versions (Danny's binding decisions, Q-3/Q-4)

**Q-3 decision (validity at time T)**: Claim and Brief-version validity is represented through an
**append-only, bitemporal status-event log** — never a mutable status field. Every status
assignment carries both `effectiveAt` (when the status became true in the represented world) and
`recordedAt` (when Department OS learned or recorded it). Historical status events are never
mutated.

**Two distinct queries, not one (PR-review binding correction)**: filtering only by `effectiveAt`
and using `recordedAt` merely as a tie-breaker lets a correction recorded later, but backdated to
an earlier `effectiveAt`, silently change the answer for a past decision — the system would no
longer be able to reconstruct the evidence state it actually had on record at the time that
decision was made. This system therefore exposes two distinct queries, never conflated:

1. **Current-knowledge query** — *"what state is currently assigned as effective at time T?"* —
   the latest status event with `effectiveAt <= T`, evaluated against everything ever recorded
   (i.e. no `recordedAt` bound). This answers "what do we now believe was true at T."
2. **As-of-knowledge query** — *"what state had Department OS recorded as effective at time T, as
   of recorded time K?"* — the latest status event with `effectiveAt <= T` **and** `recordedAt <=
   K`. This reconstructs what Department OS actually knew at knowledge-time K, immune to later
   backdated corrections. Every `Decision` binds to a reproducible evidence-state cutoff (its own
   `decidedAt`, used as K) sufficient to answer this query for any claim/brief-version it relied
   on — see `getAssignedState` and `getAssignedStateAsRecorded` in Section 4.

**Framing correction, binding**: the query this system answers is *"what validity state did
Department OS assign to this claim version at time T"* — never *"was the claim objectively valid
at time T."* `StatusEvent.assignedState`, every API name touching it (`getAssignedState`, not
`getValidityAt`/`isValid`), and any UI copy this feeds must preserve that framing. This is not
cosmetic: `StatusEvent` records Department OS's own epistemic state, not ground truth about the
world.

**Q-4 decision (claims/evidence across Brief versions)**: Claims and evidence are **shared,
independently versioned records**, not copied into every `BriefVersion` and not loosely referenced
by a mutable record. Concretely:
- `Claim` is a stable identity only (no text, no status).
- `ClaimVersion` is immutable and versioned; a correction creates a new `ClaimVersion`, it never
  edits an existing one.
- `EvidenceItem` is an immutable record, shared across whichever `ClaimVersion`s cite it.
- `BriefVersion` references the **exact** `ClaimVersion` ids (and, transitively, evidence ids) it
  used, through an explicit array field — not a copy of the claim text, and not a foreign key to
  the mutable `Claim` identity that could silently resolve to "whatever the claim currently says."
- Each `Decision` binds to one exact `BriefVersion` (unchanged from the existing design).
- If a claim changes, a new `ClaimVersion` is created and the earlier version is superseded or
  invalidated through a `StatusEvent`, per Q-3. Existing `BriefVersion`s and `Decision`s keep
  referencing the original `ClaimVersion` — their evidence state does not change retroactively.

This directly resolves the required traversal: **Invalidated `ClaimVersion` → `BriefVersion`s that
used it → `Decision`s bound to those `BriefVersion`s** is answerable by (1) reading the `StatusEvent`
that invalidated the `ClaimVersion`, (2) reverse-querying `BriefVersion.claimVersionIds` for that
id, (3) reading `Decision.briefVersionId` for each matching `BriefVersion`. No step requires
mutating a shared record.

This fixes **G-3** (invalidation's "valid at markedAt" query was unanswerable — no status history
existed) and **G-4** (claim/evidence carriage across versions was undefined — copy-vs-reference was
never stated). See Section 3 for the exact schemas and Section 4 for the resulting API contract
changes.

### 1.4 Reject is reconsiderable, not reopenable (Danny's binding decision, Q-5)

**Decision**: Rejection does not close or mutate the Investigation lineage. A `Decision` of
`Reject` on a given `BriefVersion` is immutable, and the Investigation and its full lineage remain
retained exactly as recorded. A human may add new source material via `submitSources` at any time;
that initiates a new generation run (`generateBriefVersion`) and produces a new, independent
`BriefVersion`, which receives its own independent `Decision`. This is **reconsiderable**, not
reopenable: nothing is unlocked, reversed, or set into an indefinite active runtime state — a
rejected `BriefVersion` stays exactly as decided, and reconsideration is a new, distinct version
with its own evidence and its own outcome.

**No new mechanism required**: this is fully satisfied by machinery already specified above —
`Investigation` is never deleted or archived on Reject (no such transition exists in
`InvestigationStatus`), `BriefVersion`s are append-only and never mutated (Section 1.3/Pattern
table), and `Decision` already supports more than one record accumulating against the same
`problemBriefId` lineage over time, one per `BriefVersion` (Decision Recorder, Section 2; G-11).
No dedicated Reopen mechanism, no mutable Investigation-lifecycle field, and no schema addition is
introduced for this decision.

### 1.5 Landscape Researcher performs independent web research (Danny's binding decision, Q-6)

**Decision**: "Human-seeded" defines how an Investigation begins; "no collectors" excludes
automated discovery/ingestion channels. Neither limits the Landscape Researcher's workflow to the
submitted artifacts. Independent web research is **required** for existing-solution and competitor
research (US-5) — human-submitted artifacts seed the Investigation; they do not bound its research
corpus.

**Capability contract** (vendor-agnostic — no search API/provider is selected by this document):
the Landscape Researcher must be able to (1) search the public web, (2) retrieve and inspect
selected results, (3) preserve the query, the URL, the retrieval timestamp, and the relevant
retrieved material for every search performed, (4) cite landscape conclusions (`ExistingSolution`,
`GapHypothesis`) through the same evidence/provenance model as every other Brief element — never a
separate, unverifiable citation path, and (5) record search scope and limitations, including
failed or blocked retrievals, rather than silently omitting them.

**Design call (stated, not silent)**: `SourceArtifact` as originally specified assumes
submission-origin only — every artifact reachable via `Investigation` arrived through a
`Submission`. Independent web research produces artifacts the Landscape Researcher retrieves
itself, mid-generation, outside any `Submission`. Rather than forcing web-retrieved material
through the human-submission path (which would misrepresent its provenance) or inventing a
parallel evidence entity (which would fragment the citation model Q-4 just unified), this
architecture adds one field — `SourceArtifact.origin` — distinguishing `'submitted'` from
`'landscape-research'`, and a `WebSearchQuery`/`WebSearchResult` pair that records the search act
itself and links each retrieved result to the `SourceArtifact` it produces. Once a web result
becomes a `SourceArtifact`, it flows through the **existing** `EvidenceItem` →
`ClaimVersion`/`ExistingSolution`/`GapHypothesis` provenance chain unchanged — no second citation
model is introduced. See Section 3 for exact schemas and Section 4 for the `searchWeb` contract.

### 1.6 `searchWeb` adapter boundary, controlled-retrieval classification, and non-dropped
persistence (Danny's binding direction; resolves DDR-0001 Row 9 PROVISIONAL, owner: Ledger)

**Binding framing (Danny, explicit)**: the product contract for classifying web-search result
retrieval lives at the `searchWeb` **adapter boundary** — code this architecture and its Forge
slice own — never inside Anthropic's (or any other provider's) built-in search-tool behavior.
DDR-0001 Row 9 could not provoke a genuine blocked/failed retrieval against the live Anthropic API
to confirm its documented `WebSearchToolResultError` surfaces cleanly; that is not a gap this
architecture tries to close by coaxing provider behavior (not reliably reproducible, out of
scope). Instead, the classification is moved to a boundary this codebase controls end to end: a
provider-agnostic `searchWeb` adapter contract, plus a controlled, SSRF-hardened retrieval path
for every result URL the provider hands back. Whichever runtime/provider DDR-0001 selects for
search plugs into this adapter; the classification behavior does not depend on that provider
implementing anything beyond "return result URLs, or fail."

**Existing SSRF-hardened fetch machinery (Slice 4/checkpoint-correction) — reusable, but not yet
factored for reuse.** `src/services/resolveSourceArtifact.ts` already implements every primitive
the controlled retrieval path below needs: protocol allowlisting (http/https only), private/
loopback/CGNAT/link-local/reserved/multicast IPv4 blocking, IPv4-mapped IPv6 decoding before the
same IPv4 check, a custom DNS `lookup` applied per-redirect-hop (closing the resolve-then-connect
TOCTOU gap), manual redirect-chain following with the guard re-applied at every hop, a streaming
response-size cap, and a request timeout. **All of it is currently module-private** —
`fetchWithGuards`, `safeLookup`, `isDisallowedIp`, `decodeMappedIpv4Hex`, `inIpv4Cidr`,
`ipv4ToInt`, and the `MAX_RESPONSE_BYTES`/`MAX_REDIRECTS`/`FETCH_TIMEOUT_MS` constants are neither
exported nor located outside `resolveSourceArtifact.ts` — so today there is nothing to import.
This slice's implementation work therefore includes an explicit extraction step, not a
reimplementation:

- Extract the network-guard primitives (everything from `isDisallowedIp` through `fetchWithGuards`,
  `safeLookup`, and the three timing/size constants) out of `resolveSourceArtifact.ts` into a new
  shared module, `src/services/ssrfGuardedFetch.ts`, exporting them.
- `resolveSourceArtifact.ts` imports from the new shared module instead of defining these
  primitives locally — no behavior change to Source Resolver, pure move.
- The new controlled-retrieval path (below) imports the same shared module. Two call sites, one
  hardened implementation — a fix to the SSRF guard (e.g. a new disallowed-range case) applies to
  both Source Resolver and Landscape Researcher retrieval automatically, rather than requiring the
  same fix to be independently re-applied twice.
- `MIN_CONTENT_LENGTH` (a raw-response-body-length threshold — corrected 2026-09-05, Frank
  spec-gate FAIL: this constant does not detect paywalls or JS-only rendering, since it compares
  raw HTTP body length before any content extraction, and real paywalled/JS-shell pages typically
  ship substantial raw HTML regardless of visible content; it functions only as a near-empty/
  literally-empty response guard, and is unsourced — no mathematical, scientific, or programmatic
  precedent has been shown for 200 specifically. See `src/services/resolveSourceArtifact.ts`'s own
  comment for the fuller correction.) stays specific to Source
  Resolver's four-way `SourceResolution.status` and is **not** moved into the shared module as-is;
  the controlled retrieval path below reuses the same heuristic value by importing the constant,
  but maps its outcome onto the three-way `blocked`/`failed`/`retrieved` classification defined
  next, not onto `SourceResolution`'s four-way status (the two call sites classify outcomes into
  different, non-interchangeable enums for different consumers).

**1. `searchWeb` adapter contract — provider-level search-call failure ("query limitations")**

A `searchWeb` call has two possible outcomes at the adapter boundary, before any individual result
URL is ever touched: the provider's search call itself succeeded (it returned zero or more result
URLs to consider), or the search call itself failed/errored (no result set was ever produced —
provider outage, rate limit, quota/auth failure, malformed-query rejection, etc.). The latter is a
**query limitation**, recorded explicitly rather than surfaced as an empty, indistinguishable
"zero results" outcome (Q-6 AC5 — "record search scope and limitations ... rather than silently
omitting them"):

```typescript
/** The searchWeb adapter's own outcome, decided at the adapter boundary — never inferred from
 *  provider-SDK-specific error shapes leaking into the rest of the pipeline. `query-limited` means
 *  the provider's search call itself failed to produce a result set; it is categorically distinct
 *  from a successful call that legitimately returned zero results (see selectedResultUrls: []
 *  below, which is NOT a query limitation). */
interface QueryLimitation {
  id: string;
  webSearchQueryId: string;          // the WebSearchQuery this limitation is attached to — a
                                      // WebSearchQuery row is created even when the search call
                                      // fails, so the attempt itself is never dropped (see
                                      // Persistence, below)
  reason: string;                    // e.g. "provider error: 429 rate limited", "search API
                                      // request timed out", "malformed query rejected by provider"
  occurredAt: string;                // client-captured — never trusted from the provider
}

/** Return shape of the searchWeb adapter call, before any result-URL retrieval is attempted. */
interface SearchWebAdapterResult {
  outcome: 'succeeded' | 'query-limited';
  query: string;
  performedAt: string;               // client-captured
  selectedResultUrls: string[];      // present when outcome === 'succeeded'; an empty array here
                                      // is a legitimate, non-limited "zero results found" outcome —
                                      // categorically different from 'query-limited'
  queryLimitation?: QueryLimitation; // populated when outcome === 'query-limited', OR when
                                      // outcome === 'succeeded' on a partial-success case where
                                      // some but not all search blocks failed (URLs were still
                                      // collected from the blocks that succeeded); reason +
                                      // occurredAt populated, id assigned on persistence
}
```

**2. Controlled retrieval path — per-selected-URL classification**

For every URL in `selectedResultUrls` on a `'succeeded'` adapter result, the Landscape Researcher
runs a controlled retrieval attempt through the shared `ssrfGuardedFetch` module and classifies the
outcome into exactly one of three states — extending, not replacing, the `WebSearchResult` shape
already defined in Section 3:

```typescript
/** One retrieval attempt for one selected result URL — exactly one WebSearchResult row per URL
 *  in SearchWebAdapterResult.selectedResultUrls, success or failure alike (see Persistence). */
interface WebSearchResult {
  url: string;
  retrievedAt: string;               // client-captured completion timestamp for this attempt —
                                      // never a provider-supplied value (e.g. not Anthropic's
                                      // page_age, which is a freshness estimate, not a retrieval
                                      // timestamp — DDR-0001 Row 9 evidence)
  status: 'retrieved' | 'blocked' | 'failed';
  failureReason?: string;            // populated for status !== 'retrieved'; see classification
                                      // rule below for what goes in this field for each status
  sourceArtifactId?: string;         // set only when status === 'retrieved'; the SourceArtifact
                                      // (origin: 'landscape-research') this result produced
}
```

**3. Blocked vs. failed — the principled, testable distinction**

The two non-`retrieved` states are not interchangeable "something went wrong" buckets. They are
kept distinct because they mean different things about *why* material is unavailable, and because
`03-UI-SPEC.md`'s `SearchScopeNotice` (Slice 6/10) needs to describe the two differently to a human
reviewer rather than collapsing them into one undifferentiated failure line. The dividing line:

> **`blocked`** = a deliberate, attributable refusal was obtained — something (the origin server, or
> this system's own network policy) affirmatively said no, with an identifiable reason.
>
> **`failed`** = no attributable refusal was obtained — the operation could not be completed at all,
> or the target does not exist/work, with no signal that access was deliberately withheld.

Concretely, classified by the shared retrieval module's outcome:

| Classification | Triggers | `failureReason` example |
|---|---|---|
| `blocked` | HTTP `401` or `403` | `"HTTP 403 Forbidden"` |
| `blocked` | HTTP `451` (legal/regulatory unavailability) | `"HTTP 451 Unavailable For Legal Reasons"` |
| `blocked` | 2xx response, but body length below the shared `MIN_CONTENT_LENGTH` threshold (a near-empty/literally-empty raw response — corrected 2026-09-05, Frank spec-gate FAIL: this does NOT detect paywalls or JS-only rendering, which typically return substantial raw HTML; same signal `resolveSourceArtifact.ts` uses for `reachable-no-content`, mapped here onto `blocked` rather than a four-way status, since for search-result retrieval "content withheld" reads as blocked, not merely content-free) | `"Response returned successfully but the raw response body was very short (under <MIN_CONTENT_LENGTH> characters) — likely an empty or near-empty page. This check does not detect paywalls, login walls, or JS-rendered pages, which typically return substantial raw HTML regardless of visible content."` |
| `blocked` | `ssrfGuardedFetch` rejects the destination before any request left the process (`EBLOCKEDHOST` — private/loopback/CGNAT/reserved-range target) | `"Blocked by network policy: disallowed network address"` |
| `failed` | DNS resolution failure | `"DNS resolution failed for '<host>'"` |
| `failed` | Connection error/reset, or request timeout (`AbortError`) | `"Request timed out after <FETCH_TIMEOUT_MS>ms"` |
| `failed` | Response exceeded the shared `MAX_RESPONSE_BYTES` cap | `"Response exceeded maximum size of <MAX_RESPONSE_BYTES> bytes"` |
| `failed` | Redirect chain exceeded `MAX_REDIRECTS`, or a redirect `Location` is invalid/unsupported-protocol | `"Too many redirects"` / `"Invalid redirect location: <value>"` |
| `failed` | Any other non-2xx, non-{401,403,451} HTTP status (e.g. `404`, `500`, `502`) | `"HTTP 404 Not Found"` |
| `failed` | Malformed URL — the selected result's URL string could not be parsed at all | `"Malformed URL — could not be parsed: '<value>'"` |
| `failed` | Unsupported protocol — the selected result's URL parses, but its scheme is not http/https | `"Unsupported URL protocol '<value>' — only http/https are allowed."` |

**Explicitly out of scope for this MVP (stated, not silently omitted)**: robots.txt-disallowed
signals are not implemented — this MVP does no robots.txt fetch/parse; if a future slice adds one,
a robots-disallowed rejection is a `blocked` case per the rule above (a deliberate, attributable
refusal), and this table gains a row then, not now. HTTP `429` (rate-limited) is classified `failed`
here — the *retrieval* being rate-limited is a could-not-complete condition on this attempt, not a
deliberate content-access refusal; this is distinct from the *search-call* itself being rate-limited
at the adapter boundary, which is a `QueryLimitation` (item 1, above), not a `WebSearchResult`.

This rule is unit-testable directly: `classifyRetrievalOutcome(outcome: ssrfGuardedFetch's raw
result or thrown error)` is a pure function from a bounded set of inputs (HTTP status code, or one
of the shared module's typed error conditions) to `{ status, failureReason }` — every row in the
table above is one test case, with no reliance on live network behavior.

**4. Persistence — provably not dropped**

Per this project's Research Data Integrity discipline ("never silently discard bytes; assert
`len(cached) == len(source)`, or carry a first-class flag into every downstream table"), an ordered,
deduplicated `selectedResultUrls` list is defined **before** retrieval begins (case-sensitive
exact-match dedup — plausible because the adapter aggregates URLs across up to 5
`web_search_tool_result` blocks per turn; see item 1). Provider-returned duplicates are collapsed
at this point and must **not** create duplicate audit records downstream. The not-dropped
invariant applies to this deduplicated list: each unique selected URL must produce exactly one
`WebSearchResult` record, success or failure alike (including `blocked` and `failed` attempts) —
never a silently-shorter results array, and never more than one record per unique URL. Concretely:

- `WebSearchQuery` and its `results: WebSearchResult[]` (and, on the query-limited path, its
  `queryLimitation`) are persisted together, in one transaction, once all retrieval attempts for
  that query have settled (all attempts run with the existing per-attempt `FETCH_TIMEOUT_MS`
  bound, so this is bounded, not open-ended).
- Before that transaction commits, the implementation asserts
  `persistedResults.length === deduplicatedSelectedResultUrls.length` (mirroring the "assert
  `len(cached) == len(source)`" discipline directly, applied to the deduplicated list) — a
  mismatch is a programming-error-level defect (e.g. an attempt that threw outside the
  classification path and was swallowed rather than resolving to a `failed` `WebSearchResult`) and
  must throw rather than persist a truncated array. This is a code-level invariant this Forge
  slice implements and tests directly, not a database constraint alone.
- At the schema level, `web_search_result` (new table, migration `005_web_search_query_results.sql`
  — next number after `004_claims_and_evidence.sql`) enforces: `web_search_query_id` NOT NULL
  REFERENCES `web_search_query(id)`; `url` NOT NULL; `status` NOT NULL CHECK IN
  `('retrieved','blocked','failed')`; `retrieved_at` NOT NULL (client-captured, always present
  regardless of outcome); `failure_reason` NOT NULL exactly when `status <> 'retrieved'` (a CHECK
  constraint, not app-layer-only); `source_artifact_id` REFERENCES `source_artifact(id)`, NOT NULL
  exactly when `status = 'retrieved'`; UNIQUE `(web_search_query_id, url)` — a URL cannot silently
  produce two divergent records for the same query. `web_search_query` itself carries `id`,
  `investigation_id` NOT NULL REFERENCES `investigation(id)`, `generation_run_id` NOT NULL
  REFERENCES `generation_run(id)`, `query` NOT NULL, `performed_at` NOT NULL, `scope_note`
  nullable, `limitations` (text array, may be empty), and a `query_limitation_id` nullable
  REFERENCES a `query_limitation(id)` row (the `QueryLimitation` type above) — nullable because
  most queries succeed and carry no limitation, populated exactly when `outcome ===
  'query-limited'`. `query_limitation` carries `id`, `web_search_query_id` NOT NULL REFERENCES
  `web_search_query(id)`, `reason` NOT NULL, `occurred_at` NOT NULL. Both `web_search_query` and
  `web_search_result` follow this doc set's existing append-only pattern (Section 5) — immutable
  once persisted, via the same `BEFORE UPDATE OR DELETE` trigger pattern `004_claims_and_evidence.sql`
  already established; a corrected/retried search is a new `WebSearchQuery` row, never an edit to
  an existing one.
- `WebSearchQuery`/`WebSearchResult`/`QueryLimitation` are **not** Brief-scoped entities — none of
  the three carries a `briefVersionId` (Section 3, existing shape) — so, per the roadmap's Slice
  4/5–7 correction note (Brief-scoped entities defer to a `*Candidate` in-memory shape until Slice
  9), that deferral does **not** apply here: these three are `investigationId`/`generationRunId`-
  scoped, exactly like `GenerationRun`/`GenerationStep`, and are persisted directly by Slice 6, not
  carried as a candidate shape into Slice 9.
- This closes DDR-0001 Row 9's PROVISIONAL flag: the classification and non-drop guarantee are now
  a property of this codebase's own adapter boundary and persistence layer, independently
  verifiable by unit test, rather than a hoped-for behavior of a specific provider's SDK.

---

---

### 1.7 Landscape Researcher & Gap Hypothesis Generator — orchestration, candidate shapes, and
evidence-extraction scoping (Slice 6, remaining two components; addition to close the roadmap's
Slice 6 design gap — owner: Ledger)

**Confirmation (no schema changes to `ExistingSolution`/`GapHypothesis`/`WebSearchQuery`/
`WebSearchResult`/`QueryLimitation`)**: Section 3's existing shapes for these five types are
sufficient as-is. Both `ExistingSolution.evidenceItemIds` and `GapHypothesis.evidenceItemIds` are
already `NonEmptyArray<string>` (non-empty by contract, Section 4 citation-validation note,
enforced by Slice 8's R-4 fail-closed boundary once persisted at Slice 9). Per the roadmap's
established "Brief-scoped entities defer to a `*Candidate` in-memory shape until Slice 9"
correction (already applied to `ProblemStatement`/`DemandSignal`/`DemandConfidenceClassification`/
`PersonalPullNote`), `ExistingSolution` and `GapHypothesis` — both of which carry `briefVersionId`,
which does not exist until Slice 9 — get the same treatment: this slice returns candidate shapes,
never persists these two directly. `WebSearchQuery`/`WebSearchResult`/`QueryLimitation` are
unaffected by this — Section 1.6 already established they are `investigationId`/
`generationRunId`-scoped and persisted directly by `searchWeb` (already implemented).

**New candidate types to add to `src/types/domain.ts`** (implementation step, not performed here —
this document specifies the exact shapes; Forge adds them alongside the existing
`DemandSignalCandidate`/`ProblemStatementCandidate` candidates in the same file):

```typescript
/** Candidate shape for `ExistingSolution` (Architecture §3), minus `id`/`briefVersionId`. `localId`
 *  mirrors `DemandSignalCandidate.localId` — a synthetic per-run handle so
 *  `GapHypothesisCandidate` (below) and Slice 9's persistence step can reference a specific
 *  landscape entry before it has a real `ExistingSolution.id`. */
export interface ExistingSolutionCandidate {
  localId: string;
  name: string;
  whatItAddresses: string;
  howPeopleCopeNow: string;
  whereItsInadequate: string;
  evidenceItemIds: NonEmptyArray<string>; // non-empty by contract — R-4 fail-closed, Section 4
}

export type GapCategory =
  | 'capability' | 'usability' | 'price' | 'workflow-fit' | 'trust'
  | 'integration' | 'accessibility' | 'distribution' | 'other';

/** Candidate shape for `GapHypothesis` (Architecture §3), minus `id`/`briefVersionId`. */
export interface GapHypothesisCandidate {
  category: GapCategory;
  otherCategoryLabel?: string; // required when category === 'other'
  statement: string; // specific, falsifiable claim about what's missing
  evidenceItemIds: NonEmptyArray<string>; // non-empty by contract — R-4 fail-closed, Section 4
}
```

**Evidence-extraction scoping decision (the actual design gap this addition closes)**: `searchWeb`
(implemented) creates new `SourceArtifact` rows (`origin: 'landscape-research'`) for every
successfully retrieved result, but does not extract `EvidenceItem`s from them — that is
`extractClaimsAndEvidence`'s job (Slice 4). `extractClaimsAndEvidence(investigationId)` as it
exists today is **not safe to call a second time** after `searchWeb` runs: it reads *every*
`content-retrieved` `SourceArtifact` for the Investigation (via `getInvestigation`) unconditionally,
so a second call would re-run LLM extraction over sources already processed by Slice 4's own pass
and persist duplicate `EvidenceItem` rows for the same content — silent data duplication, not
data loss, but a correctness defect all the same, and exactly the kind of unexamined-assumption
gap this project's Research Data Integrity discipline exists to catch before it ships.

**Resolution**: refactor `extractClaimsAndEvidence.ts` to expose the existing pipeline body as a
scoped operation, with the current export becoming a thin wrapper:

```typescript
// extractClaimsAndEvidence.ts — refactor, not a new file

/** Extracts and persists EvidenceItem/Claim/ClaimVersion rows from EXACTLY the given
 *  sourceArtifactIds (each must belong to investigationId and be 'content-retrieved') — the
 *  existing extraction/persistence body, scoped by an explicit id set instead of "every usable
 *  source for this Investigation." Existing-claim dedup/reuse logic (getExistingClaimsForInvestigation)
 *  is unchanged: still reads the Investigation's full existing-claims set, so a claim restated in a
 *  newly-scoped source still resolves to its existing Claim identity rather than forking one. */
export async function extractClaimsAndEvidenceForSourceArtifacts(
  investigationId: string,
  sourceArtifactIds: string[],
): Promise<ExtractionResult>;

/** Unchanged public contract — now a thin wrapper: resolves investigationId to its full
 *  content-retrieved sourceArtifactIds set, then delegates. No behavior change for Slice 4's own
 *  call site. */
export async function extractClaimsAndEvidence(investigationId: string): Promise<ExtractionResult>;
```

This is a minimal, behavior-preserving refactor of Slice 4's existing module (same transaction,
same advisory lock, same LLM prompt shape, same fail-closed per-item filtering) — not a new
extraction mechanism. The Landscape Researcher (below) is the second call site, invoking the scoped
function with only the `SourceArtifact.id`s `searchWeb` just created with `status: 'retrieved'`.

**Landscape Researcher — orchestration and signature**

```typescript
export interface LandscapeResearchResult {
  webSearchQueries: WebSearchQuery[];            // one per searchWeb call issued this run
  existingSolutionCandidates: ExistingSolutionCandidate[];
  landscapeEvidenceItems: EvidenceItem[];         // EvidenceItems extracted from newly-retrieved
                                                   // landscape-research SourceArtifacts this run —
                                                   // returned so the Gap Hypothesis Generator and
                                                   // Slice 9 don't have to re-derive this set
  /** Mirrors demandAnalyzer's generationFailed pattern — set on infra/LLM failure only, never on a
   *  legitimate zero-competitors finding (see negativeFindingSignal). */
  generationFailed: boolean;
  generationFailureReason?: string;
  /** Populated iff existingSolutionCandidates is empty AND generationFailed === false — carries
   *  what Slice 9 needs to construct a NegativeFinding row with element: 'existing-solution'
   *  (roadmap Slice 6 Implementation Notes). Unset on every generationFailed: true path. */
  negativeFindingSignal?: { statement: string };
}

export async function researchLandscape(
  investigationId: string,
  generationRunId: string,
): Promise<LandscapeResearchResult>;
```

Orchestration, inside the same outer try/catch discipline as `analyzeDemand` (F-1 pattern — the
entire function body, including the evidence read below, is wrapped so any unexpected error
converts to `generationFailed: true` rather than an unhandled throw):

1. Read the Investigation's already-persisted evidence via the existing
   `getEvidenceForInvestigation(investigationId)` helper (same helper Slice 5 uses — Q-6's
   "independent web research" requirement means this evidence *seeds query construction*, it does
   not bound what gets searched for or retrieved). If zero evidence exists, mirror
   `analyzeDemand`'s empty-evidence branch: `generationFailed: true`, explanatory reason, no search
   attempted.
2. One forced-tool LLM call (`callForcedTool`, new tool name `propose_landscape_queries`) over that
   evidence, producing 1-or-more free-text search query strings aimed at existing
   solutions/competitors/alternatives for the problem the evidence describes. (Per Q-6/Section 1.5:
   this call reasons over evidence *content*, but the requirement that research proceed
   independently of what a submitted artifact claims about competitors is enforced by prompt
   instruction — mirroring `demandAnalyzer`'s "never treat personal motivation as a demand signal"
   instruction pattern — not by withholding the evidence itself, since the LLM needs to know
   *what problem* it's researching solutions for.) Schema-validated (R-4): non-empty array of
   non-empty strings. On `LlmValidationError` after bounded repair, return `generationFailed: true`
   per the same pattern as `analyzeDemand`'s LLM-failure branch.
3. For each proposed query, call `searchWeb({ investigationId, generationRunId, query })`
   (implemented, Section 1.6/4) — sequentially, not in parallel, to keep the per-query
   `WebSearchQuery`/`WebSearchResult` transaction boundaries (already implemented in `searchWeb.ts`)
   independently observable and to keep total outbound request concurrency bounded. Collect every
   returned `WebSearchQuery` into `webSearchQueries`.
4. Collect the `sourceArtifactId`s of every `WebSearchResult` with `status: 'retrieved'` across all
   queries this run. If this set is empty (zero queries returned a retrieved result — Edge Case
   "Landscape web search returns zero results"), skip step 5 and go straight to step 6 with
   `landscapeEvidenceItems: []`.
5. Call `extractClaimsAndEvidenceForSourceArtifacts(investigationId, retrievedSourceArtifactIds)`
   (new scoped function, above) to extract and persist `EvidenceItem`s from just the newly-retrieved
   landscape sources. On `generationFailed: true` from this call, propagate it as this function's
   own `generationFailed: true` (extraction failure on the landscape sources is a Landscape
   Researcher failure, not a silent "zero solutions found" outcome) with the inner
   `generationFailureReason` prefixed for traceability. On success, its `evidenceItems` becomes
   `landscapeEvidenceItems`.
6. Second forced-tool LLM call (`callForcedTool`, tool name `identify_existing_solutions`) over
   the union of the original evidence (step 1) and `landscapeEvidenceItems` (step 5) — an existing
   solution's evidence may legitimately come from either set (e.g. a submitted artifact already
   named a competitor, corroborated by a web result). Same index-into-combined-evidence-array
   pattern as `analyzeDemand`'s `evidenceIndices`; same fail-closed per-entity filter (drop any
   candidate whose `evidenceIndices` resolve to zero valid combined-evidence items — mirrors
   `demandAnalyzer.ts`'s F-2 "all-dropped means the whole call is untrustworthy" rule: if the model
   proposed ≥1 solution but fail-closed filtering drops all of them, return `generationFailed: true`,
   not a confident empty result).
7. `negativeFindingSignal` populated iff surviving `existingSolutionCandidates.length === 0` AND
   `generationFailed === false` (identical trigger discipline to
   `DemandConfidenceClassificationCandidate.negativeFindingSignal`).

**Gap Hypothesis Generator — orchestration and signature**

Per the roadmap's own sequencing ("can be built in parallel with Slice 5... sequenced after it here
for a linear Forge session, not because of a hard dependency"), the Landscape Researcher itself has
no Slice-5 dependency (confirmed by step 1-6 above, which reads only Slice-4-persisted evidence).
The Gap Hypothesis Generator, however, is explicitly asked (this task's framing) to analyze landscape
entries against Slice 5's demand output — so that dependency is expressed as **optional call-time
parameters**, not an internal fetch, keeping the module itself decoupled and leaving the actual
wiring (call this only once both Slice 5 and Slice 6's Landscape step have produced their
candidates for the same `GenerationRun`) to Slice 8's Provenance Recorder orchestration:

```typescript
export interface GapHypothesisGenerationResult {
  gapHypothesisCandidates: GapHypothesisCandidate[];
  generationFailed: boolean;
  generationFailureReason?: string;
  /** Populated iff gapHypothesisCandidates is empty AND generationFailed === false — carries what
   *  Slice 9 needs to construct a NegativeFinding row with element: 'gap-hypothesis'. */
  negativeFindingSignal?: { statement: string };
}

export async function generateGapHypotheses(input: {
  investigationId: string;
  existingSolutionCandidates: ExistingSolutionCandidate[];
  /** All evidence available to reason over — original Investigation evidence plus
   *  landscapeEvidenceItems, i.e. researchLandscape's combined evidence array (step 6, above). A
   *  GapHypothesis may cite evidence that never went through an ExistingSolution (e.g. a direct
   *  demand-signal excerpt describing what's missing). */
  allEvidenceItems: EvidenceItem[];
  /** Optional — present when Slice 5 has already run for this GenerationRun (Provenance Recorder
   *  wiring decision, not this function's concern). Absent, this component still runs: it produces
   *  gap hypotheses from evidence + landscape alone, without a demand cross-reference. */
  demandSignalCandidates?: DemandSignalCandidate[];
  demandConfidenceClassificationCandidate?: DemandConfidenceClassificationCandidate;
}): Promise<GapHypothesisGenerationResult>;
```

Orchestration (same F-1 outer try/catch, same R-4 validate-repair-fail forced-tool call, same
fail-closed per-entity citation filter and same "all proposed hypotheses dropped by the filter ⇒
`generationFailed: true`" rule as `analyzeDemand`'s F-2 and the Landscape Researcher's step 6
above):

1. If `existingSolutionCandidates.length === 0` and no demand-signal input was supplied, there is
   nothing to reason a gap from — mirror `analyzeDemand`'s empty-input branch:
   `generationFailed: true` with an explanatory reason, no LLM call attempted. (A `demandSignalCandidates`-only
   input with zero existing solutions is still meaningful — "no competitors found" is itself
   evidence of a gap — so this short-circuit requires **both** inputs to be absent/empty, not
   either.)
2. One forced-tool LLM call (tool name `identify_gap_hypotheses`) over `existingSolutionCandidates`,
   `allEvidenceItems`, and (when present) the demand-signal inputs, instructed to propose zero-or-
   more falsifiable `GapHypothesis` statements, each tagged with exactly one `GapCategory` (or
   `'other'` + `otherCategoryLabel`) and citing ≥1 index into `allEvidenceItems`. Schema-validated
   per the existing `GapCategory` nine-member closed union (R-4).
3. Fail-closed per-entity filter: drop any hypothesis whose evidence indices resolve to zero valid
   items in `allEvidenceItems`. If the model proposed ≥1 hypothesis but the filter drops all of
   them, return `generationFailed: true` (untrustworthy result, same F-2 rule).
4. `negativeFindingSignal` populated iff surviving `gapHypothesisCandidates.length === 0` AND
   `generationFailed === false`.

**Files (Forge implementation — not produced by this design step):**
- `src/types/domain.ts` — add `ExistingSolutionCandidate`, `GapCategory`, `GapHypothesisCandidate`
  (types only, above)
- `src/services/extractClaimsAndEvidence.ts` — refactor: extract the existing body into
  `extractClaimsAndEvidenceForSourceArtifacts(investigationId, sourceArtifactIds)`;
  `extractClaimsAndEvidence(investigationId)` becomes a thin wrapper that resolves the full
  content-retrieved id set and delegates. No behavior change to the existing export's contract or
  its existing tests.
- `src/services/landscapeResearcher.ts` — new; `researchLandscape` (above)
- `src/services/gapHypothesisGenerator.ts` — new; `generateGapHypotheses` (above)
- Corresponding `*.test.ts` files for both new services, plus a regression test on
  `extractClaimsAndEvidence.ts` confirming the wrapper's behavior is unchanged and a new test on
  `extractClaimsAndEvidenceForSourceArtifacts` confirming it does not reprocess ids outside the
  given scope.

**Out of scope for Slice 6 (explicit, not silently deferred):**
- Persisting `ExistingSolution`/`GapHypothesis` rows — both stay candidate-only in memory, exactly
  like `DemandSignal`/`DemandConfidenceClassification`; Slice 9 (Brief Assembler) persists them,
  remaps `localId` -> real `id` (mirroring `DemandSignalCandidate.localId`'s documented remap), and
  constructs the two `NegativeFinding` rows (`element: 'existing-solution'` /
  `element: 'gap-hypothesis'`) from the `negativeFindingSignal` fields above.
- `GenerationStep`/`SchemaValidationRecord` provenance wrapping around these two components' forced-
  tool calls — Slice 8 (Provenance Recorder) wraps this slice's LLM calls, same as it wraps Slices
  4/5/7's.
- Wiring `generateGapHypotheses`'s optional Slice-5 parameters into an actual pipeline call —
  Slice 8's orchestration decision (which `GenerationRun` step order actually invokes this with
  Slice 5's output attached), not this slice's.
- Query-count/result-count caps for `researchLandscape`'s query proposal step — no numeric bound is
  introduced here (e.g. "propose at most N queries"); per this project's Research Data Integrity
  discipline, an unsourced cap does not pass, and none is cited for this MVP. If Forge/Danny later
  wants one, it needs a named owner and PROVISIONAL marker, added as its own change, not folded in
  silently here.

---

### 1.8 Uncertainty Compiler & Recommendation Engine — orchestration, candidate shapes, and the
generationFailed interpretation boundary (Slice 7; addition to close the roadmap's Slice 7 design
gap — owner: Ledger)

**Confirmation (no schema changes to `UncertaintyStatement`/`Recommendation`)**: Section 3's
existing shapes for these two types are sufficient as-is — `UncertaintyStatement` (`briefVersionId`,
`whatsUnknown: string[]`, `whatWouldChangeConclusion: string[]`, `whatsUndeterminable: string[]`)
and `Recommendation` (`briefVersionId`, `decision: RecommendationDecision`, `rationale: string`)
already match US-6/US-7 exactly. Both carry `briefVersionId`, which does not exist until Slice 9 —
same treatment as `ProblemStatement`/`DemandSignal`/`ExistingSolution`/`GapHypothesis` before them
(roadmap's "Brief-scoped entities defer to a `*Candidate` in-memory shape until Slice 9"
correction): this slice returns candidate shapes, never persists these two directly.

**New candidate types to add to `src/types/domain.ts`** (alongside the existing `*Candidate` types;
implementation step, not performed here):

```typescript
/** Candidate shape for `UncertaintyStatement` (Architecture §3), minus `briefVersionId`. No
 *  `localId` — unlike `DemandSignalCandidate`/`ExistingSolutionCandidate`, nothing downstream
 *  references an individual uncertainty item by id; the Recommendation Engine and Slice 9 consume
 *  the three arrays wholesale, not by index. Like `ProblemStatementCandidate`, this is a
 *  non-negatable required element (see "Never-empty-array policy" below) — there is no
 *  NegativeFinding path for uncertainty; `UncertaintyStatement` is not one of the four elements
 *  Q-2 named as negatable (Section 3 `BriefElement`), so it is always constructed on success, the
 *  same footing as ProblemStatement. */
export interface UncertaintyStatementCandidate {
  whatsUnknown: string[];
  whatWouldChangeConclusion: string[];
  whatsUndeterminable: string[];
}

/** Candidate shape for `Recommendation` (Architecture §3), minus `briefVersionId`. Also
 *  non-negatable — `RecommendationDecision` has no "insufficient information" member; a run that
 *  cannot produce a trustworthy recommendation fails closed (`generationFailed: true`) rather than
 *  emitting a placeholder decision. */
export interface RecommendationCandidate {
  decision: RecommendationDecision;
  rationale: string; // must reference Brief evidence — never bare/scored (Q-1, US-7 AC1)
}
```

**Never-empty-array policy for `UncertaintyStatementCandidate` (roadmap Implementation Notes: "must
populate all three named lists, even if some are single-item")**: the roadmap's own test wording —
"uncertainty names ≥1 item in each of the three categories (or explicitly states none apply, per
whatever null-representation the implementation chooses — but never omits the field)" — leaves the
null-representation choice to this design step. Chosen representation: **every array always
contains at least one string**; when the Uncertainty Compiler genuinely finds nothing for a
category, it populates that category with one explicit sentinel string (e.g. `"No unresolved
[category] were identified for this Investigation's evidence."`), never a bare `[]`. This mirrors
`DemandConfidenceClassificationCandidate.narrative`'s "explain the absence in prose" pattern rather
than introducing a second, competing "empty means nothing found" convention that would need its own
UI-copy branch. `UncertaintyStatement` is never subject to `NegativeFinding` (it is not in
`BriefElement`) — this sentinel-string convention is how "genuinely nothing to report" is expressed
for this element, not the `NegativeFinding` mechanism.

**New read helper required (gap identified by this design step): `getClaimVersionsForInvestigation`**

Neither existing read helper exposes what the Uncertainty Compiler needs to detect unresolved
contradictions: `getEvidenceForInvestigation` (Slice 5) returns flat `EvidenceItem[]` with `label`
but no claim/stance context, and no helper currently reads `ClaimVersion` (with its embedded
`evidence: NonEmptyArray<ClaimVersionEvidenceRef>`, carrying `stance`) back out for an
Investigation — Slice 4's `extractClaimsAndEvidence` returns `claimVersions: ClaimVersion[]` as
part of its own in-process `ExtractionResult`, but that result is not retained anywhere for a later
slice to re-read. This is a genuine gap, not an oversight to route around silently:

```typescript
// getClaimVersionsForInvestigation.ts — new file, same shape/pattern as
// getEvidenceForInvestigation.ts (Slice 5): joins claim_version_evidence -> evidence_item ->
// source_artifact.investigation_id to scope ClaimVersion rows to one Investigation (mirroring the
// existing investigation-scoping approach 004_claims_and_evidence.sql's own comment documents for
// `Claim`, which carries no investigation_id column of its own), denormalizing each ClaimVersion's
// evidence array exactly as ClaimVersion/ClaimVersionEvidenceRef (Architecture §3) already specify.
export async function getClaimVersionsForInvestigation(
  investigationId: string,
  client?: PoolClient,
): Promise<ClaimVersion[]>;
```

**Design decision: neither component calls `analyzeDemand`/`researchLandscape`/
`generateGapHypotheses` directly — the generationFailed-collision boundary (BLOCKER-1 lesson)**

Slice 6's QC pass 1 BLOCKER-1 happened because downstream code read another component's
`generationFailed` flag and conflated "this call found nothing new" with "this call failed." The
risk surface for that exact mistake exists here too: `DemandAnalysisResult.generationFailed`,
`LandscapeResearchResult.generationFailed`, and `GapHypothesisGenerationResult.generationFailed`
each mean *"my own LLM/infra call failed"* — narrower than "there is nothing to say about demand /
landscape / gaps." If the Uncertainty Compiler or Recommendation Engine called into those three
functions itself and then folded their `generationFailed` flags into its *own* generationFailed
decision (e.g. `generationFailed: demandAnalysis.generationFailed || landscapeResearch.generationFailed`),
that would be exactly the same defect class in a new location: a Slice 5/6 component's own
infra failure would silently abort Slice 7 entirely, when the *correct* interpretation of "Demand
Analyzer failed" in the Uncertainty Compiler's context is not "I have failed too" — it is "this is
itself a fact worth naming as uncertainty" (US-6's "what's undeterminable from available sources"
category exists precisely for this).

Two structural decisions close this off, rather than leaving it to inline case-by-case judgment
inside the implementation:

1. **Neither component calls Slices 5/6's functions.** Following the same "optional call-time
   parameters, not an internal fetch" decoupling the roadmap already established for
   `generateGapHypotheses`'s `demandSignalCandidates`/`demandConfidenceClassificationCandidate`
   inputs, both `compileUncertainty` and `generateRecommendation` receive Slices 5/6's **already-
   computed result objects, verbatim, by their own distinct field names** — never a merged/derived
   boolean. This means there is exactly one call site in the whole pipeline that ever reads
   `analyzeDemand`/`researchLandscape`/`generateGapHypotheses`'s `generationFailed` fields directly
   for their *original* meaning: Slice 8's Provenance Recorder orchestration, which invokes those
   three functions in the first place and is the only code with the actual context to decide
   "should the whole `GenerationRun` fail because this step failed." Slice 7 never re-derives that
   judgment from a flag it didn't originate.
2. **Only the Uncertainty Compiler ever re-interprets an upstream `generationFailed: true` into
   uncertainty content; the Recommendation Engine never does this itself.** `compileUncertainty`
   is the single place in Slice 7 that reads `demandAnalysis.generationFailed` /
   `landscapeResearch.generationFailed` / `gapHypothesisGeneration.generationFailed` at all — and
   it interprets each, for its OWN context, as content: an upstream `generationFailed: true` is
   deterministically (code-level, before any LLM call — see step 2 of the orchestration below)
   seeded into `whatsUndeterminable` as an explicit sentence naming which pipeline step failed and
   why (`generationFailureReason`), never treated as a reason for the Uncertainty Compiler's own
   `generationFailed` to become `true`. `generateRecommendation` does not receive the raw Slice
   5/6 result objects' `generationFailed` fields as a decision input at all — it receives only the
   **already-compiled** `UncertaintyStatementCandidate` (whose `whatsUndeterminable` array already
   names any upstream failures in prose) plus the surviving candidate arrays. This means the
   interpretation of "what does an upstream failure mean here" happens in exactly one function, is
   testable in isolation there, and cannot silently diverge between the two Slice 7 components.

`compileUncertainty`'s and `generateRecommendation`'s **own** `generationFailed` flags are reserved
exclusively for their own failures: their own `LlmValidationError` after bounded repair, or an
unexpected error caught by their own F-1 outer try/catch — never a blind propagation of an
upstream component's flag.

**Uncertainty Compiler — orchestration and signature**

```typescript
export interface UncertaintyCompilerInput {
  investigationId: string;
  problemStatementCandidates: ProblemStatementCandidate[]; // Slice 4 output — always non-empty by
    // the time this runs (Q-2 fail-closed upstream guarantees generateBriefVersion never reaches
    // Slice 7 with zero ProblemStatements), but read defensively, not assumed (see step 1 below)
  evidenceItems: EvidenceItem[];       // combined original + landscape evidence — same combined
    // array researchLandscape's step 6 and gapHypothesisGenerator's allEvidenceItems already use
  claimVersions: ClaimVersion[];       // NEW — via getClaimVersionsForInvestigation, above
  demandAnalysis: DemandAnalysisResult;                 // Slice 5 result, verbatim, own field name
  landscapeResearch: LandscapeResearchResult;           // Slice 6 result, verbatim, own field name
  gapHypothesisGeneration: GapHypothesisGenerationResult; // Slice 6 result, verbatim, own field name
}

export interface UncertaintyCompilationResult {
  uncertaintyStatementCandidate: UncertaintyStatementCandidate;
  /** Own failure only — never a propagation of demandAnalysis/landscapeResearch/
   *  gapHypothesisGeneration.generationFailed (see boundary discussion above). */
  generationFailed: boolean;
  generationFailureReason?: string;
}

export async function compileUncertainty(
  input: UncertaintyCompilerInput,
): Promise<UncertaintyCompilationResult>;
```

Orchestration (F-1 outer try/catch around the entire function body, matching `analyzeDemand`/
`researchLandscape`):

1. Defensive empty-input guard, mirroring `analyzeDemand`'s empty-evidence branch even though this
   path should be unreachable given Q-2's upstream fail-closed guarantee: if
   `problemStatementCandidates.length === 0` and `evidenceItems.length === 0`, return
   `generationFailed: true` with an explanatory reason, no LLM call attempted.
2. **Deterministic, code-level seeding (not model-derived) — this is where the generationFailed
   boundary decision above is implemented:**
   - For each of `demandAnalysis`, `landscapeResearch`, `gapHypothesisGeneration` with
     `generationFailed === true`, append one sentence to a `seededUndeterminable: string[]` array
     naming the failed step and echoing its `generationFailureReason` verbatim (e.g. "Demand
     confidence could not be assessed: <generationFailureReason>").
   - Scan `claimVersions` for any `evidence` entry with `stance === 'contradicting'`; for each
     `ClaimVersion` with at least one such entry, append one sentence to a
     `seededUnknown: string[]` array naming the claim (by `text`) and noting it has contradicting
     evidence on record (per-`ClaimVersion`, not per-evidence-entry, to avoid one heavily-cited
     claim flooding the list).
   - Scan `evidenceItems` for `label === 'assumption'` or `label === 'unknown'`; if any exist,
     append one summary sentence (count + one representative excerpt) to `seededUndeterminable`,
     not one line per item (avoids an unbounded list for a source with many low-certainty
     excerpts).
3. One forced-tool LLM call (`callForcedTool`, tool name `compile_uncertainty`) over
   `problemStatementCandidates`, `evidenceItems`, `claimVersions`, the demand/landscape/gap
   candidate summaries, and the `seededUnknown`/`seededUndeterminable` items from step 2, with an
   explicit instruction: *the seeded items are already-identified and MUST be included verbatim (or
   paraphrased without losing meaning) in the corresponding output array; add any further items the
   evidence supports beyond these, but never drop a seeded item.* Schema requires all three keys
   present (`whatsUnknown`/`whatWouldChangeConclusion`/`whatsUndeterminable`, each an array of
   non-empty strings — may be structurally empty at the model-output level; step 5 below enforces
   the never-empty policy). On `LlmValidationError` after bounded repair, return
   `generationFailed: true` (own failure) — but see step 4: the seeded items are NOT lost even on
   this failure path, since they are code-derived, not model-derived.
4. **Fallback on own LLM failure**: if step 3 raises `LlmValidationError`, do not discard the
   step-2 seeded items — a schema-validation failure on the *model's* elaboration is not a reason
   to also lose the deterministic, code-computed findings. Return `generationFailed: true` (this
   is still Slice 7's own generation failing — the model call is what failed) but this is a design
   note for Slice 8/9, not a contradiction: per the existing fail-closed discipline (mirrors
   `analyzeDemand`), a `generationFailed: true` result is never persisted regardless of how much
   partial content it carries, so the seeded-items-preserved detail matters only for
   provenance/debuggability (Slice 8's `SchemaValidationRecord.attempts`), not for output
   correctness.
5. On success, merge each category: `finalCategory = dedupe(seededCategory ++ modelCategory)`. If
   the merged array for a category is empty, populate it with the one sentinel string from the
   "Never-empty-array policy" above (`whatsUnknown`/`whatWouldChangeConclusion` realistically reach
   this only when evidence is thin but not absent; `whatsUndeterminable` reaches it only when no
   upstream step failed, no contradiction exists, and no low-certainty evidence exists — a
   legitimately clean case).
6. Return `generationFailed: false` with the merged, never-empty-per-category
   `UncertaintyStatementCandidate`.
7. Outer catch (F-1): `generationFailed: true`, reason from the caught error — own failure only.

**Recommendation Engine — orchestration and signature**

```typescript
export interface RecommendationEngineInput {
  problemStatementCandidates: ProblemStatementCandidate[];
  demandAnalysis: DemandAnalysisResult;
  landscapeResearch: LandscapeResearchResult;
  gapHypothesisGeneration: GapHypothesisGenerationResult;
  /** The ALREADY-COMPILED uncertainty output — the sole channel through which an upstream Slice
   *  5/6 generationFailed is represented to the Recommendation Engine (see boundary discussion
   *  above). This function does not read demandAnalysis.generationFailed /
   *  landscapeResearch.generationFailed / gapHypothesisGeneration.generationFailed itself to make
   *  its own decision — those fields are included above only so the prompt can present the
   *  surviving candidate content (demandSignalCandidates, existingSolutionCandidates,
   *  gapHypothesisCandidates), not so this function re-derives failure semantics from them. */
  uncertaintyStatementCandidate: UncertaintyStatementCandidate;
}

export interface RecommendationResult {
  recommendationCandidate: RecommendationCandidate;
  /** Own failure only — never derived from any upstream component's generationFailed. */
  generationFailed: boolean;
  generationFailureReason?: string;
}

export async function generateRecommendation(
  input: RecommendationEngineInput,
): Promise<RecommendationResult>;
```

Orchestration (same F-1 outer try/catch, same R-4 validate-repair-fail forced-tool call):

1. Defensive guard, mirroring the Uncertainty Compiler's step 1 (should be unreachable given Q-2):
   if `problemStatementCandidates.length === 0`, return `generationFailed: true`.
2. One forced-tool LLM call (`callForcedTool`, tool name `generate_recommendation`) over
   `problemStatementCandidates`, `demandAnalysis.demandConfidenceClassificationCandidate`,
   `demandAnalysis.demandSignalCandidates`, `landscapeResearch.existingSolutionCandidates`,
   `gapHypothesisGeneration.gapHypothesisCandidates`, and the full
   `uncertaintyStatementCandidate` (all three arrays), producing exactly one `decision` (schema
   enum `'Approve' | 'Reject' | 'Watch'`) and one `rationale` string. Prompt instructions,
   mirroring `demandAnalyzer.ts`'s existing numeric-confidence guard: (a) rationale must reference
   specific evidence/signals/gaps by content, never a bare label and never a system-generated
   numeric score (Q-1/US-7 AC1); (b) rationale must not adopt an unverifiable numeric claim from
   evidence (e.g. a source's "$50M market" figure) as an established fact — if such a figure
   appears only in `assumption`/`unknown`-labeled evidence or as an uncorroborated claim, the
   rationale may reference that the claim exists and is unverified, but must not restate the number
   itself as validated (roadmap Slice 7 Edge Case row).
3. Schema validation (R-4): enum membership + non-empty `rationale` string. No further per-entity
   citation-index resolution is needed here (unlike `analyzeDemand`/`researchLandscape`/
   `generateGapHypotheses`): `rationale` is a single free-text narrative field, not an array of
   indexed, individually-citable sub-entities, so the fail-closed per-entity-drop pattern (F-2)
   does not apply — this mirrors `DemandConfidenceClassificationCandidate.narrative`'s existing
   treatment (narrative fields are validated for non-emptiness, not decomposed into a citation
   index array). Content-level verification that the rationale genuinely references specific
   evidence (beyond non-emptiness) is a prompt-engineering/PR-review-time concern, not a mechanical
   schema check this slice invents an unsourced heuristic (e.g. a minimum length) to approximate —
   consistent with this project's "no unsourced numeric constants" rule.
4. On `LlmValidationError` after bounded repair, return `generationFailed: true` with a
   `RecommendationCandidate` fallback of `decision: 'Watch'` (the most conservative default — never
   `Approve`/`Reject` on a result the system does not trust) and a `rationale` stating the
   validation failure explicitly. This fallback object exists only for a uniform return shape
   (mirrors `analyzeDemand`'s `Insufficient`-default-on-failure pattern) — Slice 9 never persists it
   because `generationFailed: true` short-circuits Brief assembly the same way an unestablished
   `ProblemStatement` does (Section 4 `generateBriefVersion`).
5. No `negativeFindingSignal` field: `RecommendationDecision` is a closed three-value union with no
   "none/unknown" member, and `Recommendation` is not one of `BriefElement`'s four negatable
   elements (Section 3) — same non-negatable footing as `ProblemStatement`/
   `UncertaintyStatement`. A `Recommendation` is always produced on success, never recorded as an
   explicit absence.
6. Outer catch (F-1): `generationFailed: true`, `decision: 'Watch'` fallback, reason from the
   caught error.

**Files (Forge implementation — not produced by this design step):**
- `src/types/domain.ts` — add `UncertaintyStatementCandidate`, `RecommendationCandidate` (types
  only, above)
- `src/services/getClaimVersionsForInvestigation.ts` — new; `getClaimVersionsForInvestigation`
  (above), same helper pattern as `getEvidenceForInvestigation.ts`
- `src/services/uncertaintyCompiler.ts` — new; `compileUncertainty` (above)
- `src/services/recommendationEngine.ts` — new; `generateRecommendation` (above)
- Corresponding `*.test.ts` and `*.validation.test.ts` files for both new services (mirroring
  `landscapeResearcher.test.ts`/`landscapeResearcher.validation.test.ts`'s split), plus a test on
  `getClaimVersionsForInvestigation` confirming investigation-scoping and stance denormalization.

**Out of scope for Slice 7 (explicit, not silently deferred):**
- Persisting `UncertaintyStatement`/`Recommendation` rows — both stay candidate-only in memory,
  exactly like every other Brief-scoped Slice 4–6 output; Slice 9 (Brief Assembler) persists them
  as embedded fields on the new `BriefVersion` (`uncertaintyStatement`/`recommendation`, Section 3
  — not id-array-referenced like `demandSignalIds`/`existingSolutionIds`, since neither candidate
  carries a `localId` — see "no `localId`" note above).
- `GenerationStep`/`SchemaValidationRecord` provenance wrapping around these two components' forced-
  tool calls — Slice 8 (Provenance Recorder) wraps this slice's LLM calls, same as it wraps Slices
  4/5/6's.
- Wiring `compileUncertainty`'s and `generateRecommendation`'s inputs into an actual pipeline call
  (assembling `UncertaintyCompilerInput`/`RecommendationEngineInput` from the real outputs of
  Slices 4–6 for one `GenerationRun`, and sequencing Uncertainty Compiler before Recommendation
  Engine so the latter can consume the former's output) — Slice 8's orchestration decision, per the
  same "wiring is Slice 8's concern, not this slice's" split already applied to
  `generateGapHypotheses`'s optional demand-signal parameters (Section 1.7).
- A mechanical/heuristic check that `Recommendation.rationale` genuinely cites specific evidence
  (beyond non-emptiness and prompt instruction) — no unsourced length/keyword heuristic is
  introduced here; if Forge/Danny later wants one, it needs a named owner and PROVISIONAL marker,
  added as its own change.

---


### 1.9 Provenance Recorder — `callForcedTool` telemetry, `LlmValidationError` full-history carriage,
`GenerationRun` lifecycle ownership, and `searchWeb` telemetry (Slice 8; addition to close the
roadmap's Slice 8 design gap — owner: Ledger; binding direction: Danny)

**Framing (resolves the roadmap-ambiguity question this design step was asked to resolve
explicitly, not guess at):** Roadmap Slice 9 states `generateBriefVersion` is "the single
entrypoint orchestrating Slices 4–8" — i.e. Slice 9, not Slice 8, is what actually sequences calls
into Slices 4–7 and decides step order. Earlier sections of this document (1.7, 1.8) used the
looser phrase "Slice 8's orchestration decision" for pipeline wiring; read against the roadmap,
that phrasing is imprecise, not a genuine conflict — Slice 8 owns the *Provenance Recorder
machinery* (schemas, persistence, and the instrumentation hooks below) and Slice 9 owns *calling*
that machinery around the real pipeline sequence, because no orchestrator exists to drive it until
Slice 9's `generateBriefVersion` is built. This section therefore specifies Provenance Recorder
functions and instrumentation as a **library Slice 9 calls**, not a standalone orchestrator Slice 8
builds and runs itself. Everything below is instrumentation of the existing execution path per
Danny's binding direction — no new validation layer, no new repair mechanism, `MAX_REPAIR_ATTEMPTS
= 1` unchanged (confirmed explicitly in point 5).

#### 1. `callForcedTool` attempt telemetry — capture mechanism and shape

**Decision: capture via an optional `AsyncLocalStorage`-based collector, not a return-value change
and not a per-call-site callback parameter.** Three options were weighed:

| Option | Cost across the 7+ existing call sites | Verdict |
|---|---|---|
| Extend `ForcedToolCallResult<T>`/`LlmValidationError` to carry per-attempt telemetry directly | Zero signature churn for *consumption* (existing sites only read `.value`/`err.message`, confirmed below), but telemetry is unreachable for a step that `throw`s past its own catch, and any later step that also needs it (e.g. Provenance Recorder writing `GenerationStep.validationRecords`) has no way to receive it without every intermediate call site (the 7 component functions) threading it through their own return types — real churn, and still doesn't solve the throw case cleanly. | Rejected — solves "carry a value" but not "route it to a listener several call frames away." |
| Add an `onAttempt` callback parameter to `CallForcedToolParams<T>`, forwarded by each of the 7 component functions via a new optional input field | Optional parameter, so no *existing* call (including `llmClient.test.ts` and all component `.test.ts` files) needs to change to keep compiling/passing. But *using* it for provenance requires each of the 7 component functions (`demandAnalyzer`, `uncertaintyCompiler`, `recommendationEngine`, `extractClaimsAndEvidence`, `personalPullExtractor`, `landscapeResearcher` [2 call sites], `gapHypothesisGenerator`) to accept and forward the callback — 8 small, additive edits. | Workable, but more surface area than necessary for a cross-cutting concern. |
| **`AsyncLocalStorage`-scoped collector: `callForcedTool` and `searchWeb` call a module-level `recordToolInvocation()` after every attempt; the orchestrator opens a collection scope with `withProvenanceCollector()` around each step** | **Zero changes to `callForcedTool`'s public signature, zero changes to any of the 7 component functions' signatures, zero changes to any existing test.** The instrumentation is entirely internal to `llmClient.ts` and `searchWeb.ts`; it is inert (no-op) unless a collector scope is active, which only Slice 9's orchestrator ever opens. | **Chosen** — genuinely the least invasive of the three; the standard pattern for cross-cutting request-scoped telemetry that must survive being several call frames removed from the code that needs to consume it. |

**New shared module, `src/services/provenanceContext.ts`:**

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

/** One captured attempt/invocation, generic enough to cover both callForcedTool's schema-validated
 *  attempts and searchWeb's non-schema-validated tool calls (web_search, url-fetch) — see "searchWeb
 *  telemetry" below. Not every field applies to every invocation kind; unused fields are omitted,
 *  never populated with a placeholder (Research Data Integrity discipline — no fabricated values). */
export interface CapturedToolInvocation {
  toolName: string;                 // e.g. 'identify_existing_solutions' (callForcedTool tool name),
                                     // 'web_search' (searchWeb adapter call), 'url-fetch' (searchWeb
                                     // per-URL controlled retrieval)
  startedAt: string;                // client-captured (DDR-0001 Row 4: API provides no wall-clock
                                     // timing; this codebase must capture it itself)
  completedAt: string;
  modelIdentifier?: string;         // set for LLM-backed invocations (callForcedTool, searchWeb's
                                     // web_search adapter call which also invokes the model); unset
                                     // for the pure-HTTP url-fetch invocation
  attemptNumber?: number;           // set for callForcedTool attempts (1 = original, 2 = repair);
                                     // unset for searchWeb invocations (no repair concept there)
  fieldPath?: string;               // callForcedTool only — which SchemaValidationRecord this
                                     // attempt belongs to (mirrors existing SchemaValidationRecord.fieldPath)
  rawOutput?: unknown;              // callForcedTool: the tool-call input as produced. searchWeb:
                                     // omitted (body content is persisted as SourceArtifact.resolved
                                     // content already — not duplicated into provenance)
  valid?: boolean;                  // callForcedTool: schema-validation result. searchWeb: unset —
                                     // see outcome below, a differently-shaped result (3-4 way, not
                                     // boolean)
  validationError?: string;         // callForcedTool only, present iff valid === false
  outcome?: 'retrieved' | 'blocked' | 'failed' | 'query-limited'; // searchWeb only — mirrors
                                     // WebSearchResult.status plus the adapter-level 'query-limited'
                                     // case; unset for callForcedTool attempts
  failureReason?: string;           // searchWeb only, present iff outcome !== 'retrieved'
  tokenUsage?: { inputTokens: number; outputTokens: number }; // present when the underlying API
                                     // response included usage data — DDR-0001 Row 4: a
                                     // provider-rejected request yields no usage data, so this is
                                     // optional, never defaulted to {0,0} (that would misrepresent
                                     // "not measured" as "measured zero")
}

export interface ProvenanceCollector {
  record(invocation: CapturedToolInvocation): void;
}

const storage = new AsyncLocalStorage<ProvenanceCollector>();

/** Opens a collection scope for the duration of `fn`. Every `recordToolInvocation` call made by
 *  code running inside `fn` (however deep the call stack — this is the whole point of
 *  AsyncLocalStorage over a passed-down parameter) is routed to `collector`. Nested scopes are not
 *  used by this design (Slice 9 opens exactly one scope per GenerationStep, never nests them). */
export function withProvenanceCollector<T>(collector: ProvenanceCollector, fn: () => Promise<T>): Promise<T> {
  return storage.run(collector, fn);
}

/** No-op when no collector scope is active (e.g. a direct unit test of demandAnalyzer.ts calling
 *  callForcedTool with no Provenance Recorder involved at all) — this is what makes the
 *  instrumentation inert by default and safe to leave in place at every callForcedTool/searchWeb
 *  call site regardless of whether a caller cares about provenance. */
export function recordToolInvocation(invocation: CapturedToolInvocation): void {
  storage.getStore()?.record(invocation);
}
```

**`callForcedTool` internal change (implementation, not shown as a public-contract change — the
exported function signature and `CallForcedToolParams<T>` are unchanged):** inside the existing
`for (attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS + 1; attempt++)` loop, wrap the existing
`anthropic.messages.create` call with `startedAt`/`completedAt` capture, read `response.usage`
(`input_tokens`/`output_tokens`) when present, and after computing `result = params.validate(...)`
call `recordToolInvocation({...})` with that attempt's full telemetry — on both the valid and
invalid branch, before either returning or looping to the next attempt. This is instrumentation of
the existing loop body, not a new control-flow path.

#### 2. `LlmValidationError` and `ForcedToolCallResult<T>` — additive, not breaking

**Correction to the task framing, found during this design step, not assumed:** re-reading every
catch site confirms **no breaking change to `LlmValidationError`'s shape is actually required**,
and making one would be actively harmful — `src/services/llmClient.test.ts` (a call site in its own
right) asserts `validationErr.attempts` is the numeric *count* (`toBe(2)`) and
`validationErr.rawOutput` is the *last* raw output (`toEqual({ ok: 'bad-2' })`); `result.attempts`
in the same file is asserted as a numeric count too. Repurposing either field's type to carry an
array would break these already-green, QC-passed assertions for no functional gain — the full
history can be added as a **new, additional field** instead.

**Every catch site checked (8 total — 7 production services + the test file), what it reads, what
changes for it:**

| Site | Reads today | Change required |
|---|---|---|
| `demandAnalyzer.ts` | `err instanceof LlmValidationError`, `err.message` | None |
| `extractClaimsAndEvidence.ts` | `err instanceof LlmValidationError`, `err.message` | None |
| `recommendationEngine.ts` | `err instanceof LlmValidationError`, `err.message` | None |
| `uncertaintyCompiler.ts` | `err instanceof LlmValidationError`, `err.message` | None |
| `personalPullExtractor.ts` | `err instanceof LlmValidationError`, `err.message` | None |
| `landscapeResearcher.ts` (×2 call sites) | `err instanceof LlmValidationError`, `err.message` | None |
| `gapHypothesisGenerator.ts` | `err instanceof LlmValidationError`, `err.message` | None |
| `llmClient.test.ts` | `err.attempts` (number), `err.rawOutput` (last raw output), `result.attempts` (number) | None — both existing fields keep their current type and value; only a new field is added |

None of the 7 production services reads `.rawOutput` or `.attempts` at all — every one narrows only
on `instanceof LlmValidationError` and then reads `.message` to build its own
`generationFailureReason`/absence-narrative string. This is exactly the shape of change Danny's
direction anticipated needing to scope explicitly if unavoidable — here it turns out to be
avoidable entirely: zero of the 8 call sites requires modification.

**Refined shapes (both additive):**

```typescript
export interface ForcedToolCallResult<T> {
  value: T;
  attempts: number;                         // UNCHANGED — count, as before
  attemptHistory: SchemaValidationAttempt[]; // NEW — full per-attempt record, length === attempts,
                                              // using the refined SchemaValidationAttempt shape
                                              // (Section 3, point 3 below); populated regardless of
                                              // whether a provenance collector scope is active —
                                              // this is the function's own accounting, independent
                                              // of the AsyncLocalStorage side-channel above, which
                                              // exists to route telemetry to a *listener*, not to be
                                              // the sole record of it
}

export class LlmValidationError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: unknown,       // UNCHANGED — last raw output, as before
    public readonly attempts: number,         // UNCHANGED — count, as before
    public readonly attemptHistory: SchemaValidationAttempt[], // NEW — full history, same shape as
                                              // ForcedToolCallResult.attemptHistory above
  ) {
    super(message);
    this.name = 'LlmValidationError';
  }
}
```

`callForcedTool` builds one `attemptHistory` array as it loops (it already computes every field
needed per attempt — `rawOutput`, `valid`, `validationError` — for the existing `lastRawOutput`/
`lastError` variables; this refactor retains each attempt's record instead of overwriting it),
independent of whether `recordToolInvocation` is also called for that attempt. `attemptHistory` is
the durable, always-present record (returned on success, thrown on failure); the
`AsyncLocalStorage` collector (point 1) is the routing mechanism for a listener several frames away
(Slice 9's orchestrator) that needs the same data attached to a specific `GenerationStep` before
the calling component function has even returned.

#### 3. `GenerationRun`/`GenerationStep`/`SchemaValidationRecord`/`SchemaValidationAttempt` — schema
refinement (not a rebuild; Section 3's existing shapes are the base)

**`SchemaValidationAttempt` — add timing, model identity, token usage:**

```typescript
interface SchemaValidationAttempt {
  attemptNumber: number;             // unchanged
  rawOutput: string;                 // unchanged
  valid: boolean;                    // unchanged
  validationError?: string;          // unchanged
  startedAt: string;                 // NEW — client-captured (DDR-0001 Row 4)
  completedAt: string;               // NEW
  modelIdentifier: string;           // NEW — the MODEL constant value at call time; recorded per
                                      // attempt (not just once per step) so a future change that
                                      // varies the model on repair remains representable without a
                                      // further schema change
  tokenUsage?: { inputTokens: number; outputTokens: number }; // NEW — optional per DDR-0001 Row 4's
                                      // documented asymmetry: a provider-rejected request yields no
                                      // usage data
}
```

**`SchemaValidationRecord` — add tool name (currently absent; `GenerationStep.modelIdentifier`
exists but nothing records *which tool* produced a given structured output when a step invokes more
than one forced-tool call, e.g. Landscape Researcher's `propose_landscape_queries` and
`identify_existing_solutions`):**

```typescript
interface SchemaValidationRecord {
  fieldPath: string;                 // unchanged
  toolName: string;                  // NEW — the callForcedTool toolName that produced this record
  attempts: SchemaValidationAttempt[]; // unchanged shape reference, refined attempt shape above
  finalOutcome: 'valid' | 'invalid'; // unchanged
}
```

**`GenerationStep` — add outcome, generic tool-invocation telemetry (for non-schema-validated calls
like `searchWeb`), and an unexpected-error slot for the throw case:**

```typescript
interface GenerationStep {
  component: string;                 // unchanged
  startedAt: string;                 // unchanged
  completedAt: string;               // unchanged
  outcome: 'succeeded' | 'failed';   // NEW — required. 'failed' covers both "produced a terminal-
                                      // failed SchemaValidationRecord" and "threw an unexpected
                                      // error" (see error field below) — a step is never left
                                      // outcome-less.
  error?: string;                    // NEW — null/absent when outcome === 'succeeded'. When
                                      // outcome === 'failed', `error` records the component's
                                      // modeled `generationFailureReason`, or the normalized thrown
                                      // error when execution throws. `validationRecords` remain the
                                      // structured record of validation ATTEMPTS and do NOT replace
                                      // the terminal failure reason. If both exist: use
                                      // `generationFailureReason` for a normally-returned modeled
                                      // failure, and the caught exception for a thrown failure.
                                      //
                                      // NOT "iff outcome === 'failed'": `outcome` also becomes
                                      // 'failed' when ONLY the validationRecords classifier trips
                                      // (some validationRecord has finalOutcome === 'invalid')
                                      // while the returned result is not itself a modeled failure.
                                      // In that branch `error` is left undefined and
                                      // `validationRecords` carries the detail. Audited 2026-08-14:
                                      // that pairing is UNREACHABLE for all seven current
                                      // components — an invalid final attempt only arises from
                                      // bounded-repair exhaustion, which always throws, and every
                                      // component converts that throw into `generationFailed: true`
                                      // WITH a reason. The branch is specified here because the
                                      // type permits it, not because it occurs.
                                      //
                                      // CONTRACT CORRECTION (Composer ruling, 2026-08-14) — this
                                      // text previously stated `error` was populated ONLY for an
                                      // unexpected thrown error, explicitly excluding
                                      // schema-validation terminal-fails. That encoded a FALSE
                                      // IMPLEMENTATION ASSUMPTION: that failures reach the recorder
                                      // only via thrown exceptions. In fact all seven pipeline
                                      // components catch internally and RETURN
                                      // `generationFailed: true`, so the throw path is effectively
                                      // unreachable for them and the old rule left `error`
                                      // populated almost never. This is a contract correction, not
                                      // a new architectural decision — no DDR required.
  modelIdentifier?: string;          // unchanged
  inputRefs: string[];               // unchanged
  outputRefs: string[];              // unchanged
  validationRecords?: SchemaValidationRecord[]; // unchanged, refined record shape above
  toolInvocations?: ToolInvocationRecord[]; // NEW — non-schema-validated tool telemetry (searchWeb's
                                      // web_search adapter call and per-URL url-fetch retrieval
                                      // attempts); unset for steps with no such calls
}

/** Persisted projection of provenanceContext.ts's CapturedToolInvocation for invocations that are
 *  NOT schema-validated structured output (searchWeb's two call kinds) — kept as a distinct type
 *  from SchemaValidationAttempt because it has no attemptNumber/repair concept and a differently-
 *  shaped outcome (3-4-way status, not boolean valid/invalid). */
interface ToolInvocationRecord {
  toolName: string;                  // 'web_search' | 'url-fetch'
  startedAt: string;
  completedAt: string;
  outcome: 'retrieved' | 'blocked' | 'failed' | 'query-limited';
  failureReason?: string;            // present iff outcome !== 'retrieved'
  modelIdentifier?: string;          // set for 'web_search' (the adapter's own LLM call), unset for
                                      // 'url-fetch' (plain HTTP, no model involved)
}
```

**`GenerationRun` — add the in-progress lifecycle state (point 4 requires a durable row to exist
before the pipeline has produced any outcome at all):**

```typescript
interface GenerationRun {
  id: string;
  investigationId: string;
  briefVersionId: string | null;
  outcome: 'in-progress' | 'succeeded' | 'failed'; // REFINED — 'in-progress' is NEW. Set at
                                      // creation (point 4), before any Slice 4 step begins; moved to
                                      // 'succeeded'/'failed' only by finalizeGenerationRun. A row
                                      // that is still 'in-progress' after the process that created
                                      // it has ended represents exactly the one gap this design
                                      // cannot close from inside the process (a hard crash/OOM kill
                                      // after createGenerationRun and before either finalization
                                      // path runs — see the exactly-once contract at point 4;
                                      // this comment previously said "the try/finally's finally
                                      // block", corrected 2026-08-14 with that ruling) — named
                                      // explicitly, not silently assumed away; see point 4.
  startedAt: string;                 // unchanged — now set at createGenerationRun time, not
                                      // retroactively at finalization
  completedAt: string;               // unchanged — but now genuinely only meaningful once
                                      // outcome !== 'in-progress'; a caller reading completedAt on
                                      // an 'in-progress' row must not treat it as populated
                                      // (implementation detail: nullable at the persistence layer
                                      // even though the TS interface keeps it non-optional for the
                                      // succeeded/failed cases, which are the only ones Section 4's
                                      // existing read paths consume)
  runtimeIdentifier: string;         // unchanged
  modelIdentifiers: string[];        // unchanged — computed by finalizeGenerationRun as the union of
                                      // every step's modelIdentifier + every attempt's
                                      // modelIdentifier across stepLog, not asserted per-step
  toolsInvoked: string[];            // unchanged — computed by finalizeGenerationRun as the union of
                                      // every SchemaValidationRecord.toolName + every
                                      // ToolInvocationRecord.toolName across stepLog
  stepLog: GenerationStep[];         // unchanged — appended to by recordGenerationStep, in order, as
                                      // each step completes or fails (point 4)
}
```

No other Section 3 schema changes. `GenerationStep.component` naming against Section 2's component
list (already a stated constraint) is unaffected by any of the above.

#### 4. `GenerationRun` lifecycle — creation before Slice 4, ordered step recording, durable
finalization on the unhappy path

**New Provenance Recorder functions (Section 4 API contract addition):**

```typescript
/** Must be called by Slice 9's generateBriefVersion BEFORE the first Slice 4 step begins (Danny,
 *  binding) — not after the pipeline completes, and not lazily on first step. Persists a
 *  GenerationRun row immediately with outcome: 'in-progress', stepLog: [], briefVersionId: null,
 *  so a durable row exists for the full duration of the run, including the window before any step
 *  has produced output. */
function createGenerationRun(input: {
  investigationId: string;
  runtimeIdentifier: string;
}): Promise<GenerationRun>;

/** Called once per completed OR failed component step, in pipeline order — appends exactly one
 *  entry to the persisted GenerationRun.stepLog (never replaces or reorders existing entries; this
 *  is an append, matching the append-only pattern already established for BriefVersion/StatusEvent
 *  elsewhere in this document, Section 5). Slice 9's orchestrator calls this from inside each
 *  step's own try/finally (see runStepWithProvenance below) — so a step that throws still produces
 *  a stepLog entry with outcome: 'failed' and error set, rather than being silently omitted from
 *  the record. */
function recordGenerationStep(input: {
  generationRunId: string;
  step: GenerationStep;
}): Promise<void>;

/** EXACTLY-ONCE FINALIZATION (Composer ruling, 2026-08-14, design gate round 2 — supersedes the
 *  "call it from a finally block" instruction previously stated here). The original wording and
 *  Slice 9's in-transaction success finalization, implemented literally, produce DOUBLE
 *  finalization — which this function's own idempotency contract (below) treats as a
 *  programming-error-level defect. The two are reconciled as follows, and there is exactly one
 *  finalization per run on every path:
 *
 *    - SUCCESS  -> finalize INSIDE Slice 9's phase-4 assembly transaction, using the supplied
 *                  transaction client. The run's success and the Brief it produced commit or roll
 *                  back together; a committed Brief can never be left with an in-progress run.
 *                  EVERY read and write performed inside a successful finalization — INCLUDING
 *                  loadStepLog and the modelIdentifiers/toolsInvoked computation derived from it —
 *                  must use that same client, never the pool. A pool read inside a transaction
 *                  cannot see the transaction's own uncommitted rows.
 *    - FAILURE  -> finalize AFTER the rollback and BEFORE the rethrow, on its own connection. The
 *                  run record and its stepLog are audit records and must survive the rollback that
 *                  discards the Brief.
 *    - NO unconditional second finalization anywhere. Specifically: no bare `finally` block that
 *                  finalizes regardless of outcome, since both paths above have already finalized.
 *
 *  The intent the superseded wording was protecting is preserved: a failed run is still finalized
 *  even when a component throws — that is the FAILURE path above, which runs before the rethrow.
 *  Sets completedAt, outcome, briefVersionId, and the computed modelIdentifiers/toolsInvoked union
 *  described above. Idempotency: calling this twice for the same generationRunId is a
 *  programming-error-level defect (Forge implements this as a hard assertion, not a silent
 *  overwrite) — exactly one finalization per run. */
function finalizeGenerationRun(input: {
  generationRunId: string;
  outcome: 'succeeded' | 'failed';
  briefVersionId: string | null;
}): Promise<GenerationRun>;

/** Convenience wrapper Slice 9's orchestrator uses around each Slice 4-7 component call — NOT a
 *  new orchestration layer (Slice 9 still owns deciding step order, inputs, and what "the pipeline"
 *  is); this only removes the repetitive try/finally + telemetry-collection boilerplate every call
 *  site would otherwise duplicate. Opens a provenanceContext.ts collector scope (point 1) around
 *  `fn`, so every callForcedTool/searchWeb invocation `fn` triggers (however many call frames deep)
 *  is captured; on return, builds GenerationStep.validationRecords from callForcedTool-shaped
 *  invocations and toolInvocations from searchWeb-shaped ones, and calls recordGenerationStep. On
 *  throw, still calls recordGenerationStep with outcome: 'failed' and error: the caught message,
 *  using whatever partial telemetry the collector accumulated before the throw, then rethrows —
 *  the caller (generateBriefVersion) is what decides whether one failed step aborts the whole run
 *  (per the existing R-4/negativeFindings fail-closed rules already specified for Slices 4-7, which
 *  this function does not alter). */
function runStepWithProvenance<T>(input: {
  generationRunId: string;
  component: string;                 // matches a Section 2 component name
  inputRefs: string[];
  getOutputRefs: (result: T) => string[];  // NEW — REQUIRED (Composer ruling, 2026-08-14). Each
                                      // caller explicitly maps its OWN result shape to the ids of
                                      // records the step produced (GenerationStep.outputRefs). A
                                      // component with no referenceable outputs supplies
                                      // `() => []`, making emptiness DELIBERATE rather than
                                      // silently inferred. Required, not optional: an earlier fix
                                      // inferred outputRefs from an internal whitelist of known
                                      // field names, which returned [] silently for any
                                      // unrecognised result shape — unacceptable in an audit
                                      // field. That whitelist was removed entirely.
  fn: () => Promise<T>;
}): Promise<T>;
```

**Durability characteristics, stated explicitly (not assumed):** `createGenerationRun` +
per-step `recordGenerationStep` + the exactly-once `finalizeGenerationRun` contract above closes
the specific gap Danny named — a component throwing mid-pipeline still leaves a `GenerationRun` row
with `outcome: 'failed'`, a real `stepLog` up to and including the failed step, and no orphaned
`in-progress` row for any crash the process can observe, because the failure path finalizes after
rollback and before the rethrow. (This paragraph previously said "a `finally`-block
`finalizeGenerationRun`"; corrected 2026-08-14 alongside the exactly-once ruling above, since a
`finally` that finalizes unconditionally would double-finalize the success path.) A successful run
additionally cannot be left in-progress at all: its finalization commits inside the same
transaction as the `BriefVersion` it produced. The one gap this cannot close from inside the
process — a hard process kill (OOM, `SIGKILL`, host failure) after `createGenerationRun` and before
either finalization path executes — is named here rather than silently assumed away: such a row is
left `outcome: 'in-progress'` indefinitely. No reconciliation/sweep job
is designed for this MVP (an unsourced "assume abandoned after N minutes" timeout would itself be
exactly the kind of unsourced-numeric-constant this project's Research Data Integrity discipline
forbids); if Forge/Danny wants one, it needs a named owner, a cited timeout value, and a PROVISIONAL
marker, added as its own change — not folded in silently here.

**Ordering guarantee:** because `recordGenerationStep` is called from each step's own
`try/finally` (via `runStepWithProvenance`), `stepLog` entries land in true execution order even
when a later step never runs (the pipeline stops at the first `generationFailed: true`/thrown
step per Slices 4-7's existing fail-closed contracts) — there is no separate re-ordering or
sequence-number bookkeeping needed; array-append order is call order.

#### 5. `searchWeb` telemetry

`searchWeb.ts` does not call `callForcedTool` (its LLM call lives in `searchWebAdapter.ts`,
invoking Anthropic's `web_search` server tool directly — Section 1.6), so it does not get
`callForcedTool`'s instrumentation "for free." Two `recordToolInvocation` (point 1) call sites are
added directly to `searchWeb.ts`, both additive — no change to `searchWeb`'s public signature or
return shape:

1. **Around the `searchWebAdapter(input.query)` call** — `toolName: 'web_search'`,
   `startedAt`/`completedAt` captured around the call, `modelIdentifier: MODEL` (searchWebAdapter
   already imports `MODEL` from `llmClient.ts`), `outcome` derived from
   `SearchWebAdapterResult.outcome` (`'query-limited'` maps directly;
   `'succeeded'` maps to `'retrieved'` for this adapter-level invocation specifically — distinct
   from any individual URL's later retrieval outcome), `failureReason` = `queryLimitation.reason`
   when present. This is the one adapter-boundary telemetry point (Section 1.6's existing
   classification logic is unchanged; this only observes its outcome).
2. **Inside `retrieveAndClassify(rawUrl)`, per URL** — `toolName: 'url-fetch'`, `startedAt`/
   `completedAt` captured around the `fetchWithGuards` call (or the URL-parse/protocol-check
   short-circuits, which still get a `startedAt === completedAt` telemetry record rather than being
   silently unrecorded — consistent with the "never silently discard" discipline already governing
   `WebSearchResult` persistence, Section 1.6 item 4), no `modelIdentifier` (plain HTTP, no model
   involved), `outcome`/`failureReason` taken directly from `classifyRetrievalOutcome`'s existing
   return value (`'retrieved' | 'blocked' | 'failed'` — `'query-limited'` never applies at this
   per-URL granularity).

Both call sites are inert when no `provenanceContext.ts` collector scope is active (e.g. Slice 6's
existing `searchWeb.test.ts` unit tests, which call `searchWeb` directly with no Provenance Recorder
involved) — identical no-op-by-default behavior to `callForcedTool`'s instrumentation. This keeps
the *instrumentation itself* zero-churn to Slice 6's tests. It does not extend to Slice 8's
migration 006, which adds a (`NOT VALID`) foreign key from `web_search_query.generation_run_id` to
the new `generation_run` table — that constraint required `searchWeb.test.ts` to insert a real
`generation_run` row and use its id instead of a bare `randomUUID()` for `generationRunId`, since
Slice 6 predates `generation_run` existing at all. That test churn is a real, direct consequence of
Slice 8's schema change, not zero.

`GenerationStep.toolInvocations` for the Landscape Researcher's step (Slice 9's orchestrator wraps
`researchLandscape` in one `runStepWithProvenance` call per the existing component boundary,
Section 2) therefore ends up containing one `'web_search'` entry per `searchWeb` call
`researchLandscape` makes (one per proposed query, Section 1.7 step 3) plus one `'url-fetch'` entry
per selected result URL across all of those calls — giving `GenerationRun.toolsInvoked` genuine
`'web_search'`/`'url-fetch'` membership from a real run, not a hardcoded/defaulted list (closing the
existing `toolsInvoked` doc comment's "e.g. `'url-fetch'`, `'search'`" placeholder with the actual
values this design produces).

#### 6. Confirmation: instrumentation only

- **No new validation layer.** Every schema-validation decision (`valid`/`invalid`,
  `finalOutcome`) is still made by exactly one place: `params.validate(...)` inside
  `callForcedTool`, unchanged. This design adds *observation* of that existing decision (timing,
  token usage, tool name, full history) — it does not add a second check, a stricter check, or a
  parallel validator.
- **No new repair mechanism.** `MAX_REPAIR_ATTEMPTS = 1` is untouched, still the sole constant
  governing the loop bound, still `for (attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS + 1;
  attempt++)`. `attemptHistory`'s length is bounded by the same `1 + MAX_REPAIR_ATTEMPTS` the
  existing `SchemaValidationRecord.attempts` doc comment already specifies (Section 3) — this design
  makes that bound observable per-attempt (timing/tokens/model), it does not raise it, lower it, or
  add a second retry path anywhere (`searchWeb` has no repair concept at all — a `'blocked'`/
  `'failed'`/`'query-limited'` `WebSearchResult`/`QueryLimitation` is recorded and the run proceeds
  or fails per Section 1.6's existing, unchanged rules).
- **No new model calls.** Every `recordToolInvocation` call site observes a call
  (`anthropic.messages.create` inside `callForcedTool`'s existing loop, `searchWebAdapter`'s
  existing call, `fetchWithGuards`'s existing HTTP fetch) that was already going to happen under
  Slices 4-7's/Section 1.6's existing behavior — none of this design's additions issue a call that
  would not otherwise occur.
- **Existing one-repair behavior is preserved and now durable/observable**, per Danny's framing
  verbatim: every attempt (original + the one repair) is recorded with full context
  (`SchemaValidationAttempt`'s refined shape) whether the step ultimately succeeds or terminal-fails,
  and that record survives in `GenerationRun.stepLog` regardless of which outcome the step reaches —
  "observable and durable," not "re-validated" or "re-tried."

**Files (Forge implementation — not produced by this design step):**
- `src/services/provenanceContext.ts` — new; `CapturedToolInvocation`, `ProvenanceCollector`,
  `withProvenanceCollector`, `recordToolInvocation` (point 1)
- `src/services/llmClient.ts` — internal-only change: `callForcedTool`'s loop body gains
  timing/token-usage capture and two new `recordToolInvocation` call sites (valid/invalid branches);
  `ForcedToolCallResult<T>` gains `attemptHistory`; `LlmValidationError` gains a fourth constructor
  parameter, `attemptHistory` — public signature of `callForcedTool` itself is unchanged
- `src/services/searchWeb.ts` — two new `recordToolInvocation` call sites (point 5); no change to
  `searchWeb`'s exported signature or `WebSearchQuery`/`WebSearchResult` persistence
- `src/types/domain.ts` — `SchemaValidationAttempt`/`SchemaValidationRecord`/`GenerationStep`/
  `GenerationRun` refinements (point 3), new `ToolInvocationRecord`
- `src/services/provenanceRecorder.ts` — new; `createGenerationRun`, `recordGenerationStep`,
  `finalizeGenerationRun`, `runStepWithProvenance` (point 4) and their persistence
- Corresponding `*.test.ts` for `provenanceContext.ts` and `provenanceRecorder.ts`; a regression
  test on `llmClient.test.ts` confirming `result.attempts`/`err.attempts`/`err.rawOutput` are
  unchanged in type/value while `result.attemptHistory`/`err.attemptHistory` carry the full
  per-attempt record; a regression test on `searchWeb.test.ts` confirming existing behavior is
  unchanged with no collector scope active, plus a new test asserting
  `recordToolInvocation` is called with the expected `toolName`/`outcome` shape when a collector
  scope IS active.

**Out of scope for Slice 8 (explicit, not silently deferred):**
- Actually wiring `runStepWithProvenance`/`createGenerationRun`/`finalizeGenerationRun` into a real
  Slice 4–7 call sequence — that is Slice 9's `generateBriefVersion`, per the Framing note above and
  the roadmap's own Slice 9 ownership of "the single entrypoint orchestrating Slices 4–8."
- Any reconciliation/sweep job for a `GenerationRun` left `outcome: 'in-progress'` after a hard
  process kill — named as an open gap in point 4, not solved here; no unsourced timeout constant is
  introduced.
- Persisting `ToolInvocationRecord`/refined `SchemaValidationAttempt` fields via a new migration —
  the exact table/column shape for these fields on the existing `generation_run`/`generation_step`
  tables (numbering continues from whichever migration Slice 6's `005_web_search_query_results.sql`
  and Slice 4-7's own migrations left off) is a Forge implementation detail this design step does
  not fix a specific file name for, since Slice 8's actual migration count depends on what Slices
  4-7 already shipped by the time Slice 8 is reached.

---

## 2. Components

Each component is a **service responsibility boundary**, not a technology binding. In candidate
runtime evaluation, each maps to one or more agent steps, tool calls, or orchestration nodes —
the evaluation's job is to observe how cleanly a given runtime expresses these boundaries, not to
predetermine which runtime hosts them.

| Component | Responsibility | Satisfies |
|---|---|---|
| **Intake Service** | Accepts a submission (one or more source artifacts), validates non-empty, creates one `Investigation` + `SourceArtifact` records | US-1 |
| **Source Resolver** | Attempts to fetch/normalize each `SourceArtifact` (URL fetch or text passthrough); marks unreachable sources as `status: 'unreachable'` without dropping them; on successful fetch, marks `status: 'content-retrieved'` if usable content was extracted or `status: 'reachable-no-content'` if the fetch succeeded but yielded no extractable content (paywall/login-wall/JS-only) — G-9; blocks Brief generation only if zero sources are `content-retrieved` or `reachable-no-content` (i.e. all `unreachable`) | US-1, Edge Case (dead URL) |
| **Extraction & Clustering Engine** | Reads reachable sources, produces one-or-more `ProblemStatement`s, and either creates new `Claim`+`ClaimVersion` pairs or, when a source restates an existing claim, a new `ClaimVersion` under the existing `Claim` identity; clusters `EvidenceItem`s under the `ClaimVersion`(s) they support | US-2 |
| **Evidence Labeler** | Assigns exactly one certainty label (`fact\|observation\|interpretation\|assumption\|unknown`) to every `EvidenceItem`; records contradicting evidence explicitly rather than discarding it; defaults to the most conservative label when uncertain | US-3, Edge Case (unlabelable claim) |
| **Demand Analyzer** | Two-part, deliberately non-mergeable output: (a) tags observed `DemandSignal`s against the named/extensible type list; (b) produces a single `DemandConfidenceClassification` (`Insufficient\|Emerging\|Substantiated`) with a reasoned narrative citing signals and gaps | US-4 |
| **Personal Pull Extractor** | Personal Pull may be retained as contextual source material when present — it is not a required Problem Brief element and this component never blocks generation on its absence; when retained, it is recorded into `PersonalPullNote`, a field structurally outside `DemandSignal`/`DemandConfidenceClassification`, and is never fed to the Demand Analyzer or permitted to increase demand confidence | US-12 |
| **Landscape Researcher** | Conducts independent web research (search, retrieve, inspect — not limited to submitted artifacts, Q-6 binding); records existing solutions/competitors, current coping behavior, and where coping is inadequate, as evidence-linked `ExistingSolution` entries; preserves every search's query/URL/retrieval-time/scope/limitations via `WebSearchQuery` | US-5, Q-6 |
| **Gap Hypothesis Generator** | Produces one-or-more `GapHypothesis` entries, each with a named category and citations into the evidence set (never asserted without a citation) | US-5 |
| **Uncertainty Compiler** | Produces one `UncertaintyStatement` naming what's unknown, what would change the conclusion, and what's undeterminable | US-6 |
| **Recommendation Engine** | Produces one `Recommendation` (`Approve\|Reject\|Watch`) with a written rationale citing Brief evidence — never a bare label or score | US-7 |
| **Brief Assembler** | Assembles the outputs of the above into one immutable `BriefVersion`, referencing the exact `ClaimVersion` and evidence ids used (Section 1.3/Q-4) — never copying claim text into the version; on correction, creates a new `BriefVersion` that supersedes rather than mutates; never allows in-place edits to a published version | US-10 |
| **Provenance Recorder** | Wraps every Brief-generating run (every component above, for a given Investigation) with a `GenerationRun` record capturing runtime/model/tool identity and outcome, sufficient to reconstruct how a specific claim was produced — including for runs that fail to produce a `BriefVersion` | US-11 |
| **Decision Recorder** | Persists a human `Decision` (`Approve\|Reject\|Watch`) bound to a specific `BriefVersion.id`; enforces the Watch reconsideration-condition constraint; never migrates a Decision to a newer version; permits more than one `Decision` to accumulate on the same `BriefVersion` over time (e.g. Watch later revisited as Approve/Reject) | US-8, US-9 |
| **Validity/Invalidation Service** | Appends a `StatusEvent` (Section 1.3/Q-3) marking a `ClaimVersion` or `BriefVersion`'s assigned validity state as `challenged`/`invalidated`; on invalidation, computes and surfaces every `Decision` bound to a `BriefVersion` that referenced the affected item while it was last assigned `valid` | US-10 |
| **Review Surface** | Minimal interface exposing all seven Brief elements for one `BriefVersion` and accepting a `Decision` submission (with reconsideration conditions for Watch); also exposes an Investigation's status/sources for the pre-Brief state | US-13, G-15 |

---

## 3. Data Schemas

Interfaces below are the **contract**, not an implementation language commitment — they specify
exact field shapes any storage/runtime choice must be able to represent (relationally,
document-style, or otherwise). Timestamps are ISO-8601 strings; IDs are opaque stable strings
(UUID or equivalent) — no format is prescribed.

```typescript
// ---- Shared ----

/** Non-empty-by-contract citation collections (PR-review binding correction). `string[]` permits
 *  an empty array, which would let a major claim/signal/gap satisfy the declared type with zero
 *  citations. Every required citation field below is typed as NonEmptyArray<string>, not
 *  string[]. This is a type-level hint only — TypeScript cannot statically prove array length at
 *  every call site — so it MUST be paired with runtime validation before persistence or
 *  downstream use (Section 4, R-4's fail-closed structured-output boundary): reject empty
 *  citation arrays the same way an out-of-schema enum value is rejected, participate in the same
 *  bounded-repair-then-fail-closed path, and never silently default or coerce an empty array into
 *  a placeholder citation. */
type NonEmptyArray<T> = [T, ...T[]];

// ---- Intake ----

/** A submission is the human (or future collector) act of handing sources to the system.
 *  Origin is NOT hard-coded to human — US-1 AC2. */
interface Submission {
  id: string;
  investigationId: string;          // the Investigation this submission contributes to
  origin: SubmissionOrigin;         // extensible — 'human' today, collector-fed origins later
  submittedAt: string;
  sourceArtifactIds: string[];      // one-or-more; empty submissions are rejected pre-persistence
}

/** Open, not closed — see Decision 1.1. 'human' is the only value produced by this MVP.
 *  '(string & {})' preserves literal-type hints in tooling while staying structurally open —
 *  a bare '| string' collapses to plain string and loses all literal-type value (G-2). */
type SubmissionOrigin = 'human' | (string & {});

interface SourceArtifact {
  id: string;
  investigationId: string;
  type: SourceArtifactType;         // open discriminator — see Decision 1.1
  raw: string;                      // the URL string, or the pasted text body
  resolution: SourceResolution;
  addedAt: string;
  origin: SourceArtifactOrigin;     // NEW (Q-6) — distinguishes human-submitted material from
                                     // material the Landscape Researcher retrieved itself during
                                     // independent web research; see Decision 1.5
}

/** 'submitted' is every artifact reachable via a Submission (all artifacts before this revision).
 *  'landscape-research' is a web result the Landscape Researcher retrieved on its own initiative —
 *  Q-6. Open, not closed — same extensibility pattern as SourceArtifactType/SubmissionOrigin. */
type SourceArtifactOrigin = 'submitted' | 'landscape-research' | (string & {});

/** MVP implements exactly 'url' | 'text'. Third-party types (file, screenshot, ...) are a
 *  future additive change, not a breaking one — Decision 1.1. Same '(string & {})' fix as
 *  SubmissionOrigin (G-2). */
type SourceArtifactType = 'url' | 'text' | (string & {});

/** Four-way status (G-9 fix): 'reachable' success was previously a single value, collapsing
 *  "content extracted" and "reachable but zero usable content" (paywall/login-wall/JS-only) into
 *  one indistinguishable state — violating 01-REQUIREMENTS' binding Constraint that these be
 *  recorded as distinguishable. Values map directly onto 03-UI-SPEC's four-way display (no
 *  translation layer): unresolved->"pending", unreachable->"unreachable",
 *  content-retrieved->"content retrieved", reachable-no-content->"reachable, no usable content
 *  found". */
interface SourceResolution {
  status: 'unresolved' | 'unreachable' | 'content-retrieved' | 'reachable-no-content';
  resolvedAt?: string;
  failureReason?: string;           // populated only when status === 'unreachable'
  noContentReason?: string;         // populated only when status === 'reachable-no-content'
                                     // (e.g. paywall, login-wall, JS-only render)
}

/** One Investigation aggregates 1..N SourceArtifacts across 1..N Submissions and produces
 *  exactly one Problem Brief identity for this MVP — see Decision 1.2. */
interface Investigation {
  id: string;
  createdAt: string;
  status: InvestigationStatus;
  statusReason?: string;            // free-text detail, e.g. which sources failed
  problemBriefId: string | null;    // set once the first BriefVersion is generated
}

/** 'blocked' and 'generation-failed' are kept as distinct literal values rather than a single
 *  'blocked' + reason string (G-13). Reasoning: these are two different remedies exposed to the
 *  user (03-UI-SPEC's Blocked/Failed State needs to render "add another source" only for
 *  'blocked', never for 'generation-failed') — a type-level distinction lets the UI switch on the
 *  status itself rather than parsing free text, and prevents a Forge session from wiring the
 *  wrong remedy to the wrong failure by construction. */
type InvestigationStatus =
  | 'open'                          // accepting submissions, no Brief yet
  | 'blocked'                       // zero reachable sources — no Brief can be generated
  | 'generation-failed'             // sources reachable, but the pipeline failed to produce a
                                     // usable Brief (e.g. required elements could not be
                                     // populated, or a structured output failed schema
                                     // validation after bounded repair)
  | 'brief-generated';

// ---- Evidence & Claims (Q-4: stable identity + immutable versions, shared across Briefs) ----

type EvidenceLabel = 'fact' | 'observation' | 'interpretation' | 'assumption' | 'unknown';

/** Immutable once created. Shared — may be cited by any number of ClaimVersions across any
 *  number of BriefVersions. Never carries a mutable status; validity is assigned to the
 *  ClaimVersion(s) that cite it via StatusEvent, not to the evidence itself. Carries no `stance`
 *  field (PR-review binding correction): stance is not intrinsic to the evidence — the same item
 *  may support one ClaimVersion, contradict another, and be neutral/contextual to a third. Stance
 *  lives on the ClaimVersionEvidence relationship below. */
interface EvidenceItem {
  id: string;
  sourceArtifactId: string;         // provenance — which source this evidence came from
  excerptOrSummary: string;
  label: EvidenceLabel;             // exactly one — US-3 AC1
}

/** The claim-evidence relationship, not the evidence item, carries stance (PR-review binding
 *  correction). Replaces ClaimVersion.evidenceItemIds: string[] as the citation mechanism —
 *  ClaimVersion now cites evidence through this join, letting the same EvidenceItem support one
 *  ClaimVersion while contradicting another. Immutable once created (part of the immutable
 *  ClaimVersion it belongs to). */
interface ClaimVersionEvidence {
  claimVersionId: string;
  evidenceItemId: string;
  stance: 'supporting' | 'contradicting' | 'neutral-context';
  relevanceNote?: string;           // optional relationship-specific rationale, distinct from the
                                     // EvidenceItem's own excerptOrSummary
}

/** Stable identity only. No text, no status field — both live on ClaimVersion / StatusEvent.
 *  Never mutated after creation. */
interface Claim {
  id: string;
  createdAt: string;
}

/** Immutable once created — a correction creates a new ClaimVersion under the same Claim.id,
 *  it never edits this record (Q-4). */
interface ClaimVersion {
  id: string;
  claimId: string;                  // stable Claim identity this is a version of
  versionNumber: number;            // monotonic per claimId, starts at 1
  createdAt: string;
  text: string;
  evidence: NonEmptyArray<ClaimVersionEvidenceRef>; // every major claim traces to source
                                     // evidence, with an explicit stance for THIS claim — US-10
                                     // AC1; non-empty by contract, not just by convention — see
                                     // NonEmptyArray and Section 4 citation-validation note
  supersedesVersionId: string | null; // null for version 1 of this Claim
}

/** A single ClaimVersionEvidence row, denormalized onto the ClaimVersion that owns it for
 *  single-fetch reads; evidenceItemId resolves to the shared, independently-retained
 *  EvidenceItem. Persisted identically to ClaimVersionEvidence above — this is a read-shape
 *  convenience, not a second source of truth. */
interface ClaimVersionEvidenceRef {
  evidenceItemId: string;
  stance: 'supporting' | 'contradicting' | 'neutral-context';
  relevanceNote?: string;
}

interface ProblemStatement {
  id: string;
  briefVersionId: string;
  whoExperiencesIt: string;
  contextOrWorkflow: string;
  consequenceOrFriction: string;
  supportingClaimVersionIds: NonEmptyArray<string>; // exact ClaimVersion ids — Q-4; non-empty by
                                     // contract (Section 4 citation-validation note)
}

// ---- Bitemporal validity (Q-3) ----

/** Answers "what validity state did Department OS assign to this item at time T" — never
 *  "was this item objectively valid at time T." Append-only; a correction is a new StatusEvent
 *  with a later recordedAt (and possibly an earlier effectiveAt, for a late-discovered
 *  correction), never an edit to an existing event. */
type AssignedValidityState = 'valid' | 'challenged' | 'invalidated';

interface StatusEvent {
  id: string;
  targetType: 'claim-version' | 'brief-version';
  targetId: string;                 // ClaimVersion.id or BriefVersion.id
  assignedState: AssignedValidityState;
  effectiveAt: string;              // when this state became true in the represented world
  recordedAt: string;               // when Department OS learned/recorded it
  recordedBy: string;
  reason: string;
}

// ---- Demand ----

/** Closed nine-member union; extensibility to 'other' is provided by the
 *  'other-observed-behavior' member plus otherTypeLabel, not by an open string. US-4 AC1. */
type DemandSignalType =
  | 'recurring-complaints'
  | 'workarounds'
  | 'existing-spend'
  | 'paid-labor'
  | 'switching-behavior'
  | 'willingness-to-pay'
  | 'rfps'
  | 'feature-requests'
  | 'other-observed-behavior';

interface DemandSignal {
  id: string;
  briefVersionId: string;
  type: DemandSignalType;
  otherTypeLabel?: string;          // required when type === 'other-observed-behavior'
  evidenceItemIds: NonEmptyArray<string>; // non-empty by contract (Section 4 citation-validation note)
}

/** Qualitative only — never a numeric score anywhere. US-4 AC2/AC3. */
type DemandConfidenceLevel = 'Insufficient' | 'Emerging' | 'Substantiated';

interface DemandConfidenceClassification {
  briefVersionId: string;           // one per BriefVersion
  level: DemandConfidenceLevel;
  narrative: string;                // must cite which signals/gaps drove the classification
  citedDemandSignalIds: string[];
  negativeFindingRef?: string;      // PR-review traceability fix, B-1/B-2 corrected (this
                                     // revision) — the `id` of the NegativeFinding row with
                                     // element: 'demand-signal-type' for this briefVersionId.
                                     // Trigger is exact and independent of level/
                                     // citedDemandSignalIds: populated if and only if such a
                                     // NegativeFinding row exists (i.e. demandSignalIds is
                                     // empty — no demand signals were found at all). Absent
                                     // whenever that row does not exist, including cases where
                                     // demandSignalIds is non-empty but citedDemandSignalIds is
                                     // empty (signals existed but none drove the classification —
                                     // not a negative-finding condition).
}

/** Personal Pull may be retained as contextual source material, but it is NOT a required
 *  Problem Brief element and is NOT a demand-signal type (NORTH-STAR.md; PR-review binding
 *  correction — this component previously implied a mandatory-capture obligation that does not
 *  exist in the approved decision). Structurally separate from DemandSignal/
 *  DemandConfidenceClassification — never merged in, never counted toward either, and must never
 *  increase demand confidence. US-12, US-4 AC4. */
interface PersonalPullNote {
  id: string;
  briefVersionId: string;
  sourceArtifactId: string;
  text: string;
  label: 'contextual-motivation';   // fixed — cannot be relabeled into a demand field
}

// ---- Landscape & Gap ----

/** One record per web search the Landscape Researcher performs (Q-6, binding). Preserves query,
 *  every retrieved-or-attempted URL, retrieval timestamps, and search scope/limitations —
 *  including failed or blocked retrievals, which are recorded, never silently dropped.
 *  `queryLimitation` (Section 1.6 addendum) is the searchWeb-adapter-boundary failure path: set
 *  iff the provider's search call itself failed to produce a result set, in which case `results`
 *  is `[]` by construction (there was nothing to retrieve) — categorically distinct from a
 *  successful call that legitimately returned zero results (queryLimitation absent, results: []
 *  is then simply "nothing found," not "the search failed"). */
interface WebSearchQuery {
  id: string;
  investigationId: string;
  generationRunId: string;          // ties the search to the GenerationRun that performed it
  query: string;
  performedAt: string;
  results: WebSearchResult[];
  scopeNote?: string;                // e.g. result-count cap, date range, or other scope actually applied
  limitations: string[];             // e.g. "rate-limited after 3 queries", "no results past page 1"
  queryLimitation?: QueryLimitation; // Section 1.6 — set iff the searchWeb adapter call itself
                                      // failed/errored (provider outage, rate limit, quota/auth
                                      // failure, malformed-query rejection); absent on every
                                      // successful adapter call regardless of result count
}

/** Provider-level searchWeb-adapter-call failure — Section 1.6. Distinct from WebSearchResult:
 *  this means no result set was ever produced to iterate, not that an individual result URL's
 *  retrieval failed. */
interface QueryLimitation {
  id: string;
  webSearchQueryId: string;
  reason: string;                    // e.g. "provider error: 429 rate limited", "search API
                                      // request timed out", "malformed query rejected by provider"
  occurredAt: string;                // client-captured — never trusted from the provider
}

/** One retrieval attempt for one selected result URL from a successful WebSearchQuery — exactly
 *  one row per URL, success or failure alike (Section 1.6 "Persistence — provably not dropped").
 *  Classification rule (blocked = deliberate, attributable refusal; failed = could not complete /
 *  no refusal signal obtained) is specified in full, with a worked classification table, in
 *  Section 1.6 item 3 — not restated here. */
interface WebSearchResult {
  url: string;
  retrievedAt: string;               // client-captured completion timestamp for this attempt —
                                      // never a provider-supplied value (e.g. not Anthropic's
                                      // `page_age`, which is a freshness estimate, not a retrieval
                                      // timestamp — DDR-0001 Row 9 evidence)
  status: 'retrieved' | 'blocked' | 'failed';
  failureReason?: string;            // populated when status !== 'retrieved'; see Section 1.6's
                                      // classification table for the exact value per cause
  sourceArtifactId?: string;         // set only when status === 'retrieved'; the SourceArtifact
                                      // (origin: 'landscape-research') this result produced, which
                                      // then flows through the existing EvidenceItem/ClaimVersion/
                                      // ExistingSolution/GapHypothesis citation model unchanged
}

interface ExistingSolution {
  id: string;
  briefVersionId: string;
  name: string;
  whatItAddresses: string;
  howPeopleCopeNow: string;
  whereItsInadequate: string;
  evidenceItemIds: NonEmptyArray<string>; // non-empty by contract (Section 4 citation-validation note)
}

type GapCategory =
  | 'capability' | 'usability' | 'price' | 'workflow-fit' | 'trust'
  | 'integration' | 'accessibility' | 'distribution' | 'other';

interface GapHypothesis {
  id: string;
  briefVersionId: string;
  category: GapCategory;
  otherCategoryLabel?: string;      // required when category === 'other'
  statement: string;                // specific, falsifiable claim about what's missing
  evidenceItemIds: NonEmptyArray<string>; // must be evidence-supported, not asserted bare;
                                     // non-empty by contract (Section 4 citation-validation note)
}

// ---- Uncertainty & Recommendation ----

interface UncertaintyStatement {
  briefVersionId: string;           // one per BriefVersion
  whatsUnknown: string[];
  whatWouldChangeConclusion: string[];
  whatsUndeterminable: string[];
}

type RecommendationDecision = 'Approve' | 'Reject' | 'Watch';

interface Recommendation {
  briefVersionId: string;           // one per BriefVersion — the system's own suggestion
  decision: RecommendationDecision;
  rationale: string;                // must reference Brief evidence — never bare/scored
}

// ---- Negative findings (G-1 fix) ----

/** Carrier for "explicitly recorded absence" — restricted to the four elements Danny's
 *  original Q-2 decision named as negatable: Evidence, Demand Signal Type, Existing-Solution
 *  Landscape, and Gap Hypothesis. PR-review binding correction (this revision): Problem Statement
 *  is deliberately EXCLUDED — Q-2 required it to "contain a specific problem" with no absence
 *  path, and a prior revision incorrectly generalized this carrier to all five elements (adding
 *  an or-clause to element 1 that was never re-checked against Q-2). If no ProblemStatement can
 *  be established, `generateBriefVersion` fails explicitly (G-1/R-4 fail-closed path) — it does
 *  not produce a BriefVersion carrying a NegativeFinding for 'problem-statement'. Kept as a small
 *  entity keyed by (briefVersionId, element) rather than four nullable fields on BriefVersion, so
 *  the shape generalizes uniformly across the four negatable elements — the same four elements
 *  03-UI-SPEC.md's NegativeFindingNotice renders (G-18). Evidence and Demand Signal Type
 *  deliberately do NOT gain a "none-found" member on their respective closed unions
 *  (EvidenceLabel, DemandSignalType) — those unions describe what WAS found; absence is recorded
 *  here instead, one level up, exactly as Existing-Solution Landscape and Gap Hypothesis already
 *  do via their empty id arrays plus this same carrier. */
type BriefElement =
  | 'evidence'
  | 'demand-signal-type'
  | 'existing-solution'
  | 'gap-hypothesis';

interface NegativeFinding {
  id: string;                       // B-1 fix (PR-review) — added so other records can hold a
                                     // resolvable reference; the (briefVersionId, element)
                                     // composite key alone could not be pointed at.
  briefVersionId: string;
  element: BriefElement;
  statement: string;                // non-empty, explicit — e.g. "No demand signal types were
                                     // found" (never a placeholder or restatement of the label)
}

// ---- Problem Brief identity & versioning ----

/** PR-review binding correction, option (a) chosen (Danny left the choice open): ProblemBrief's
 *  SUBSTANTIVE content is immutable — id, investigationId, createdAt never change, and no Brief
 *  content is ever edited in place. `currentVersionId` is explicitly carved out as **derived
 *  index state**, not substantive content: it is the one field on this record permitted to
 *  update, and it updates exactly once per new BriefVersion becoming current (on
 *  `generateBriefVersion` success). This resolves the prior contradiction (the record was
 *  described as "never mutated" while also carrying a pointer that had to move) by naming the one
 *  mutation this record undergoes rather than papering over it as "advisory only." Reasoning for
 *  (a) over (b) (derive-from-lineage): `getInvestigation` and `getBriefForReview` already resolve
 *  the current version via `problemBriefId -> ProblemBrief.currentVersionId ->
 *  getBriefForReview(briefVersionId)` (Section 4, Q-7) — removing the field would require every
 *  such lookup to instead scan `BriefVersion`s by `problemBriefId` and pick the one with the
 *  highest `versionNumber` not named by any other version's `supersedesVersionId`, which is
 *  strictly more storage-layer work for the same answer and duplicates the "compute superseded at
 *  read time" logic BriefVersion's own doc comment already performs for a different purpose. (a)
 *  keeps one small, explicitly-named, single-writer index field; every historical `BriefVersion`
 *  remains independently readable and immutable regardless. */
interface ProblemBrief {
  id: string;
  investigationId: string;
  createdAt: string;
  currentVersionId: string;         // derived index state, NOT substantive content — see comment
                                     // above. Updated by generateBriefVersion on every successful
                                     // run for this problemBriefId, and only there. Every prior
                                     // BriefVersion remains independently readable via its own id.
}

/** No stored mutable 'status' field (Q-3). Assigned validity ('valid'/'challenged'/'invalidated')
 *  is read from the latest StatusEvent for this BriefVersion. "Superseded" is a structural fact,
 *  not an assigned state: a BriefVersion is superseded iff some other BriefVersion under the
 *  same problemBriefId names it via supersedesVersionId. Both are computed at read time — see
 *  getBriefForReview in Section 4 — never stored redundantly to avoid a second mutable field. */
interface BriefVersion {
  id: string;
  problemBriefId: string;
  versionNumber: number;            // monotonic, starts at 1
  createdAt: string;
  supersedesVersionId: string | null; // null for version 1
  generationRunId: string;          // provenance — the run that produced this version — US-11

  // The seven required elements (01's Required Brief Elements section) — each resolved via the sub-entities above,
  // referenced here for a single-fetch Brief read:
  problemStatementIds: string[];
  claimVersionIds: string[];        // exact ClaimVersion ids used by this version — Q-4. Never
                                     // a reference to Claim (the mutable-identity level) and
                                     // never a copy of claim text.
  demandSignalIds: string[];
  demandConfidenceClassification: DemandConfidenceClassification;
  existingSolutionIds: string[];
  gapHypothesisIds: string[];
  negativeFindings: NegativeFinding[]; // 0..4 rows — one per element in this list that had
                                     // nothing to report (Evidence, Demand Signal Type,
                                     // Existing-Solution, Gap Hypothesis — NOT Problem Statement,
                                     // which is non-negatable per Q-2/PR-review correction); an
                                     // element with a non-empty id array carries no row here —
                                     // see fail-closed rule at generateBriefVersion (G-1)
  uncertaintyStatement: UncertaintyStatement;
  recommendation: Recommendation;
  personalPullNoteIds: string[];    // may be empty
}

// ---- Provenance ----

/** One record per Brief-generating run — covers every component in Section 2's pipeline for a
 *  given Investigation. 'investigationId' (required) replaces 'briefVersionId' as the mandatory
 *  anchor because a run can legitimately complete without producing a BriefVersion (fail-closed
 *  pipeline, Investigation -> 'blocked'/'generation-failed'); 'briefVersionId' is nullable and
 *  set only when the run succeeds, so failed-run provenance — the runs most worth investigating —
 *  remains recordable (G-12). Deliberately runtime-agnostic: 'runtimeIdentifier' names whichever
 *  candidate executed the run, without committing the schema to one runtime. US-11. */
interface GenerationRun {
  id: string;
  investigationId: string;
  briefVersionId: string | null;    // set only when outcome === 'succeeded'
  outcome: 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string;
  runtimeIdentifier: string;        // e.g. candidate runtime name/version under evaluation
  modelIdentifiers: string[];       // every model invoked during the run
  toolsInvoked: string[];           // named tools/capabilities used (e.g. 'url-fetch', 'search')
  stepLog: GenerationStep[];        // ordered, one entry per component in Section 2
}

interface GenerationStep {
  component: string;                // matches a Section 2 component name
  startedAt: string;
  completedAt: string;
  modelIdentifier?: string;
  inputRefs: string[];              // IDs of records this step read
  outputRefs: string[];             // IDs of records this step produced
  validationRecords?: SchemaValidationRecord[]; // one entry per schema-constrained structured
                                     // output this step produced (Section 3 literal-union field
                                     // or typed object) subject to R-4's validation/repair
                                     // mechanism — a step may produce more than one, e.g. one
                                     // EvidenceLabel per EvidenceItem
}

/** R-4 mitigation (Danny, binding). Every model-produced structured output — every field typed
 *  as a closed literal union, object schema, or NonEmptyArray<T> citation collection in Section 3
 *  (EvidenceLabel, DemandConfidenceLevel, GapCategory, RecommendationDecision, ClaimVersion.evidence,
 *  and every other required citation field, etc.) — is validated against its declared schema
 *  before persistence or downstream use. An out-of-schema value, an invalid enum member, or an
 *  empty required-citation array is never silently coerced, defaulted, or treated as valid (see
 *  Anti-Patterns). On validation failure the step may attempt a bounded repair: re-prompt the
 *  model with the original output and the validation error, and re-validate the result.
 *
 *  MAX_REPAIR_ATTEMPTS = 1 (one repair attempt, i.e. at most two total generation attempts per
 *  field: original + one repair). Source: Danny's binding decision text names "1-2 attempts" as
 *  reasonable; 1 is chosen as the smaller bound to keep the loop provably non-open-ended and
 *  because a single validation-error-guided re-prompt is the standard bounded-repair shape — a
 *  second failure after being shown the exact error is treated as a genuine generation failure,
 *  not a transient one worth more retries. This constant is configuration, not hardcoded per
 *  call site; a future PR changing it does not require a schema change.
 *
 *  If the repaired output still fails validation, the step is terminal-failed: it does not
 *  produce a usable outputRef for the failed field, and the owning GenerationRun.outcome is set
 *  to 'failed' (composing with the existing outcome field — no parallel failure-tracking
 *  mechanism). All attempts remain in provenance via SchemaValidationRecord.attempts, so the
 *  original invalid output, the validation error, and every repair attempt are reconstructable
 *  after the fact, on both failed and eventually-successful steps. */
interface SchemaValidationRecord {
  fieldPath: string;                 // e.g. 'GapHypothesis.category' — which schema field this validates
  attempts: SchemaValidationAttempt[]; // length 1 (no repair needed) up to 1 + MAX_REPAIR_ATTEMPTS
  finalOutcome: 'valid' | 'invalid';  // 'invalid' iff every attempt, including repairs, failed validation
}

interface SchemaValidationAttempt {
  attemptNumber: number;             // 1 = original generation; 2 = first repair; etc.
  rawOutput: string;                 // the model's output as produced, prior to validation —
                                      // retained even when invalid; never overwritten or discarded
  valid: boolean;
  validationError?: string;          // present iff valid === false; the exact error fed back
                                      // into the next repair attempt's re-prompt
}

// ---- Decision ----

type ReconsiderationConditionType =
  | 'new-evidence' | 'product-change' | 'stronger-demand-signal'
  | 'feasibility-shift' | 'price-change' | 'market-event' | 'other';

interface ReconsiderationCondition {
  id: string;
  decisionId: string;
  type: ReconsiderationConditionType;
  otherTypeLabel?: string;          // required when type === 'other'
  description: string;
}

/** More than one Decision may exist for the same briefVersionId over time (e.g. Watch later
 *  revisited as Approve/Reject) — see getBriefForReview's priorDecisions (G-11). Each Decision
 *  remains individually immutable once created; a revisit creates a new Decision, it never
 *  edits an existing one. */
interface Decision {
  id: string;
  briefVersionId: string;           // bound to the specific version evaluated — US-8 AC1
  decision: RecommendationDecision; // 'Approve' | 'Reject' | 'Watch'
  decidedBy: string;                // human identity
  decidedAt: string;
  rationale?: string;
  reconsiderationConditionIds: string[]; // required, length >= 1, iff decision === 'Watch' (US-9 AC2)
}
```

---

## 4. API Contracts (service-level, runtime-agnostic)

These are the operations each component in Section 2 exposes. They are stated as functions, not
HTTP/RPC endpoints — how they're transported (REST, direct tool-call, in-process) is a
runtime/framework decision this document does not make.

```typescript
// Intake Service
function submitSources(input: {
  investigationId?: string;         // omit to start a new Investigation
  origin: SubmissionOrigin;
  artifacts: Array<{ type: SourceArtifactType; raw: string }>;
}): Promise<Submission>;
// Rejects (throws / returns error) if artifacts.length === 0 — US-1 AC3.
// Every SourceArtifact created here is persisted with origin: 'submitted' (Q-6/Decision 1.5).

// Landscape Researcher — independent web research (Q-6, binding)
function searchWeb(input: {
  investigationId: string;
  generationRunId: string;
  query: string;
}): Promise<WebSearchQuery>;
// Not limited to submitted artifacts — "human-seeded" bounds how the Investigation begins, not
// its research corpus (Q-6). Each retrieved result that becomes usable evidence is persisted as a
// SourceArtifact with origin: 'landscape-research', then cited by ExistingSolution/GapHypothesis
// through the existing EvidenceItem chain — no separate citation path. Failed or blocked
// retrievals are recorded on WebSearchResult, never dropped.
//
// Internally (Section 1.6, addendum — resolves DDR-0001 Row 9): (1) calls the searchWeb adapter,
// which returns SearchWebAdapterResult — outcome 'succeeded' (with selectedResultUrls, possibly
// empty) or 'query-limited' (with a QueryLimitation, no result set was ever produced); (2) on
// 'query-limited', persists WebSearchQuery with results: [] and queryLimitation set, and returns
// immediately — no retrieval is attempted; (3) on 'succeeded', first dedupes selectedResultUrls
// (provider-returned duplicates collapsed before retrieval, so they never create duplicate audit
// records), then runs one controlled retrieval attempt per deduplicated URL through the shared
// ssrfGuardedFetch module (extracted from resolveSourceArtifact.ts's existing SSRF-hardened fetch
// machinery — Section 1.6), classifies each into WebSearchResult.status via the blocked/failed
// rule in Section 1.6 item 3, and persists exactly one WebSearchResult per unique selected URL
// (including blocked and failed attempts) in the same transaction as the WebSearchQuery row,
// asserting persistedResults.length === deduplicatedSelectedResultUrls.length before commit.

// Source Resolver
function resolveSourceArtifact(sourceArtifactId: string): Promise<SourceResolution>;
function resolveInvestigationSources(investigationId: string): Promise<{
  allUnreachable: boolean;          // true only when every SourceResolution.status === 'unreachable';
                                     // if true, caller must mark Investigation 'blocked'
  resolutions: SourceResolution[];
}>;

// Investigation read model (G-15) — 03-UI-SPEC's Flow 2 / Blocked-Failed State and Flow 1's
// confirmation screen both assume this exists; it was previously undefined.
//
// Q-7 confirmation (binding, no gap): this is the single durable Investigation URL contract.
// Revisiting investigationId always resolves through this one read: status === 'open' renders as
// "generating"; status === 'blocked' | 'generation-failed' renders with statusReason as the
// blocking reason and, per InvestigationStatus's documented split (G-13), the correct next
// action; status === 'brief-generated' resolves problemBriefId -> ProblemBrief.currentVersionId
// -> getBriefForReview(briefVersionId) to present the finished Brief. The Brief is presented FROM
// the Investigation resource (a lookup chain), not a replacement of it — lineage (every prior
// BriefVersion, every Decision) remains reachable through the same investigationId. No
// notification, dashboard, list view, or polling client is required; manual revisit is
// sufficient.
function getInvestigation(investigationId: string): Promise<{
  investigation: Investigation;     // includes status, statusReason, problemBriefId
  sourceArtifacts: Array<SourceArtifact & { resolution: SourceResolution }>;
}>;

// Brief generation pipeline entrypoint — orchestrates Extraction through Recommendation,
// wrapped in one GenerationRun. Fails closed: does not produce a BriefVersion with fewer than
// all seven required elements populated. Two distinct populated-ness rules apply, per Q-2
// (Danny, binding) and its PR-review correction (this revision):
//   - Problem Statement is NON-NEGATABLE: at least one valid ProblemStatement record MUST exist.
//     If none can be established from the submitted/researched material, this is a hard failure
//     of the run — no BriefVersion is persisted, Investigation.status does NOT transition to
//     'brief-generated', and no NegativeFinding row for 'problem-statement' is ever constructed
//     (BriefElement no longer includes that literal). This is exactly the "cannot satisfy a
//     required, non-negatable element" case the R-4 fail-closed path already covers.
//   - Evidence, Demand Signal Type, Existing-Solution Landscape, and Gap Hypothesis MAY be
//     negatable: "populated" for each means EITHER its id array is non-empty OR a NegativeFinding
//     row for that element exists on this BriefVersion with a non-empty statement, but not both —
//     both empty/absent is a validation failure on the same R-4 fail-closed path as an
//     out-of-schema enum value, and both populated is likewise invalid on that same path (G-1).
// On failure (either rule), still persists a GenerationRun with
// outcome: 'failed' and briefVersionId: null (G-12), and moves the Investigation to
// 'generation-failed' (sources were reachable, but no specific problem — or another required
// element — could be established/validated) or leaves/sets it 'blocked' (no reachable sources)
// as appropriate (G-13). A run that cannot establish a ProblemStatement is a 'generation-failed'
// case, not a new status: sources were reachable (the pipeline ran), it is the pipeline's OUTPUT
// that failed the required-element check — the same failure shape R-4 already defines for any
// other unsatisfiable required field, so no new InvestigationStatus literal is needed.
function generateBriefVersion(input: {
  investigationId: string;
  supersedesVersionId?: string;     // present only for corrections
  runtimeIdentifier: string;
}): Promise<BriefVersion>;

// Decision Recorder
function recordDecision(input: {
  briefVersionId: string;
  decision: RecommendationDecision;
  decidedBy: string;
  rationale?: string;
  reconsiderationConditions?: Array<{ type: ReconsiderationConditionType; otherTypeLabel?: string; description: string }>;
}): Promise<Decision>;
// Rejects if decision === 'Watch' and reconsiderationConditions is empty/absent — US-9 AC2.
// Never mutates or reassigns an existing Decision's briefVersionId. Does not reject a second
// Decision on the same briefVersionId — see Decision's doc comment and getBriefForReview's
// priorDecisions (G-11).

// Validity / Invalidation Service (Q-3)
function assignValidityState(input: {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  assignedState: AssignedValidityState;
  effectiveAt: string;              // when this became true in the represented world; may be
                                     // in the past, to record a late-discovered correction
  reason: string;
  recordedBy: string;
}): Promise<{
  statusEvent: StatusEvent;
  dependentDecisionIds: string[];   // computed at call time, not stored redundantly: every
                                     // Decision bound to a BriefVersion that referenced targetId
                                     // (directly if targetType is 'brief-version'; via
                                     // BriefVersion.claimVersionIds if 'claim-version') while
                                     // that BriefVersion/ClaimVersion's assigned state was last
                                     // 'valid' — US-10 AC3.
}>;

// Two distinct, non-conflatable queries (PR-review binding correction — Section 1.3). Both named
// 'getAssignedState*', not 'getValidityAt'/'isValid', to keep the epistemic framing explicit at
// the API boundary per Q-3's binding wording correction.

// Query 1 — current-knowledge: "what state is currently assigned as effective at time T?"
// Implementation: latest StatusEvent for (targetType, targetId) with effectiveAt <= asOf,
// evaluated against everything ever recorded (no recordedAt bound); ordered by effectiveAt then
// recordedAt as a tie-break; 'valid' if no StatusEvent exists yet. This answer CAN change over
// time if a later, backdated StatusEvent is recorded — that is expected behavior for this query.
function getAssignedState(input: {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  asOf?: string;                    // defaults to now; the "at time T" query
}): Promise<AssignedValidityState>;

// Query 2 — as-of-knowledge: "what state had Department OS recorded as effective at time T, as of
// recorded time K?" Reconstructs what the system actually knew at knowledge-time K, immune to
// later backdated corrections. Every Decision binds to a reproducible evidence-state cutoff by
// calling this with knownAsOf = the Decision's own decidedAt, sufficient to reconstruct the exact
// evidence state that decision relied on, regardless of any correction recorded afterward.
// Implementation: latest StatusEvent for (targetType, targetId) with effectiveAt <= asOf AND
// recordedAt <= knownAsOf, tie-broken by recordedAt; 'valid' if no such StatusEvent exists.
function getAssignedStateAsRecorded(input: {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  asOf?: string;                    // defaults to knownAsOf; the "at time T" cutoff
  knownAsOf: string;                // the knowledge-time cutoff K — required, no default
}): Promise<AssignedValidityState>;

// Review Surface (read model)
function getBriefForReview(briefVersionId: string): Promise<{
  version: BriefVersion;
  assignedState: AssignedValidityState;    // this version's own current-knowledge state, via
                                            // getAssignedState (not getAssignedStateAsRecorded —
                                            // Review is a live surface, not a decision-time
                                            // reconstruction; G-2)
  isSuperseded: boolean;                   // structural fact, not an assigned state — see
                                            // BriefVersion's doc comment
  problemStatements: ProblemStatement[];
  claimVersions: Array<ClaimVersion & {
    resolvedEvidence: Array<ClaimVersionEvidenceRef & { item: EvidenceItem }>; // ClaimVersion.evidence
                                            // refs resolved against the shared EvidenceItem store —
                                            // stance read here is per-relationship, per-claim, not
                                            // per-EvidenceItem (PR-review binding correction)
    assignedState: AssignedValidityState;
  }>;
  demandSignals: DemandSignal[];
  demandConfidence: DemandConfidenceClassification;
  existingSolutions: ExistingSolution[];
  gapHypotheses: GapHypothesis[];
  negativeFindings: NegativeFinding[]; // = version.negativeFindings, surfaced at top level for
                                        // 03-UI-SPEC.md's NegativeFindingNotice (G-18) to key off
                                        // directly without re-deriving from BriefVersion
  uncertainty: UncertaintyStatement;
  recommendation: Recommendation;
  personalPullNotes: PersonalPullNote[];
  priorDecisions: Decision[];              // every Decision already bound to this exact version,
                                            // in decidedAt order — not singular; a Watch decided
                                            // earlier can be followed by a later Approve/Reject
                                            // on the same version (G-11).
}>;
```

**Citation presence is enforced, not merely declared (PR-review binding correction)**: every
required citation field (`ClaimVersion.evidence`, `ProblemStatement.supportingClaimVersionIds`,
`DemandSignal.evidenceItemIds`, `ExistingSolution.evidenceItemIds`, `GapHypothesis.evidenceItemIds`)
is typed `NonEmptyArray<T>`, not `string[]`, and — because TypeScript's tuple-based
`NonEmptyArray` cannot statically prove length at every construction site (e.g. a spread from an
untrusted model output) — is additionally validated at runtime before persistence, as one more
field participating in R-4's fail-closed structured-output boundary (Section 3
`SchemaValidationRecord`/`SchemaValidationAttempt`): an empty citation array is treated exactly
like an out-of-schema enum value — it is never silently defaulted, coerced, or left empty; it may
receive one bounded repair attempt; if repair also fails to produce a non-empty, valid citation
array, the step and its owning `GenerationRun` fail explicitly (`outcome: 'failed'`), with the
original invalid output, the validation error, and the repair attempt retained in
`SchemaValidationRecord.attempts`. `DemandConfidenceClassification.citedDemandSignalIds` is the one
deliberate exception, left as `string[]`: an `Insufficient` classification can correctly cite zero
signals (that is the evidentiary state it's reporting), so an empty array there is a valid,
meaningful answer, not a missing citation.

**Accepted MVP limitation — citation presence, not citation correctness (R-1)**: guaranteeing a
citation array is non-empty does not validate that the cited evidence actually *supports* the
claim, gap, or classification it's attached to. A model could populate a syntactically valid,
non-empty citation array with irrelevant ids and pass every check above. Solving claim-evidence
relevance validation is a real, unsolved research problem and is explicitly out of scope for this
MVP. This architecture guarantees **citation presence**, not **citation correctness** — stated
plainly here so the limitation is named, not discovered later, and so it is never read to also
mean required citations may be absent (they may not — see the enforcement paragraph above). This
must also be surfaced as explicit copy on the Investigation Screen's Completed state
(`03-UI-SPEC.md`) so a human reviewer is not misled into treating a populated citation list as
independent verification; that UI change is not made by this document and is flagged here for
`03-UI-SPEC.md` to pick up.

---

## 5. Patterns

| Pattern | Usage | Rationale |
|---|---|---|
| **Append-only versioning (event-sourced Brief lineage)** | `ProblemBrief` is a stable identity; every generation or correction produces a new immutable `BriefVersion` linked via `supersedesVersionId` | Directly satisfies US-10 AC2 and the Interview's named anti-goal ("must not build a system where the latest generated prose overwrites historical evidence") — the same failure class as the global Research Data Integrity postmortem |
| **Bitemporal, append-only status log (never a mutable status field)** | `StatusEvent` is the sole source of assigned validity for `ClaimVersion`/`BriefVersion`; `effectiveAt` and `recordedAt` are tracked separately and no event is ever edited | Q-3 (binding decision) — the previous single mutable `status` field could not answer "what state did we assign at time T" and directly violated the doc's own in-place-mutation anti-pattern; this closes G-3 |
| **Stable identity + immutable version (Claim/ClaimVersion split)** | `Claim` carries no mutable content; every correction is a new `ClaimVersion` under the same `Claim.id`; `BriefVersion` references exact `ClaimVersion` ids, never the mutable `Claim` identity | Q-4 (binding decision) — makes "which exact claim text did this Brief version rely on" a stored fact, not a moving target; closes G-4 |
| **Stance on the claim-evidence relationship, not on the evidence item** | `EvidenceItem` carries no `stance`; `ClaimVersionEvidence`/`ClaimVersionEvidenceRef` carries `stance` per (claimVersionId, evidenceItemId) pair | PR-review binding correction — the same shared `EvidenceItem` may support one `ClaimVersion`, contradict another, and be neutral to a third; stance is relationship-scoped, not item-intrinsic |
| **Non-empty citation collections, enforced not declared** | Required citation fields typed `NonEmptyArray<T>`, validated at runtime through the R-4 schema/repair path rather than trusted from the TypeScript type alone | PR-review binding correction — `string[]` permitted an empty array to satisfy a "required and non-empty" claim asserted only in prose; this closes that gap for `ClaimVersion.evidence`, `ProblemStatement.supportingClaimVersionIds`, and every `evidenceItemIds` field except the deliberately-exempted `citedDemandSignalIds` |
| **Derived single-writer index field on an otherwise-immutable identity record** | `ProblemBrief.currentVersionId` is the one field permitted to update, exactly once per successful `generateBriefVersion` call, on an otherwise-immutable record | PR-review binding correction, option (a) — names the one mutation explicitly rather than describing the record as "never mutated" while carrying a pointer that must move; every historical `BriefVersion` remains independently immutable and readable regardless |
| **Decision-to-version binding (foreign key, not "latest")** | `Decision.briefVersionId` always points at the exact version evaluated; there is no `Decision.problemBriefId` shortcut that could resolve to "whatever is current" | Satisfies US-8 AC2 — a correction must never silently migrate a prior decision's meaning |
| **Provenance wrapping per generation run, anchored to Investigation not BriefVersion** | Every Brief-generating pipeline execution is wrapped in one `GenerationRun`, keyed to `investigationId` (required) with `briefVersionId` set only on success | Satisfies US-11 without the circular-reference/unrecordable-failure problem of anchoring to `BriefVersion` (G-12) — this is the shape the runtime evaluation observes and scores |
| **Two-track demand model (signal type vs. confidence)** | `DemandSignal` (what evidence) and `DemandConfidenceClassification` (how strongly, qualitative) are separate entities with a one-directional citation link (confidence cites signals, never the reverse) | Structurally prevents the two from merging into one field/score — US-4's core constraint |
| **Fixed-value quarantine field for Personal Pull** | `PersonalPullNote.label` is a literal type (`'contextual-motivation'`), not an open string, and the type has no field compatible with `DemandSignalType`/`DemandConfidenceLevel` | Makes "Personal Pull counted toward demand" a type error, not just a convention — US-12, US-4 AC4 |
| **Element-level negative-finding carrier, restricted to four negatable elements** | `NegativeFinding` (keyed by `briefVersionId`, `element`) records "nothing found" for `evidence`, `demand-signal-type`, `existing-solution`, `gap-hypothesis` only — `BriefElement` deliberately excludes `'problem-statement'`; those closed unions gain no `'none-found'` member either, and `DemandSignal.evidenceItemIds`/`ExistingSolution.evidenceItemIds`/`GapHypothesis.evidenceItemIds` keep their `NonEmptyArray` typing unweakened | G-1 fix, PR-review corrected (this revision) — Q-2 (Danny, binding) named only four elements as negatable; Problem Statement must contain a specific problem or the run fails closed. A `'none-found'` union member or a relaxed `NonEmptyArray` would also have reopened the empty-citation loophole R-4 closed |
| **Demand-confidence-to-negative-finding traceability link** | `DemandConfidenceClassification.negativeFindingRef?: string` holds the `id` of the `NegativeFinding` row (element: `'demand-signal-type'`) for this `BriefVersion`, populated if and only if that row exists (`demandSignalIds` empty — no demand signals found at all); never derived from `level` or `citedDemandSignalIds` | PR-review traceability fix, B-1 (unresolvable ref) and B-2 (wrong/self-contradictory trigger) corrected this revision — `NegativeFinding` gained an `id` field, and the trigger is now row-existence, not an inference from a classification field that can legitimately be empty for unrelated reasons |
| **Fail-closed pipeline (no partial Brief)** | `generateBriefVersion` either returns a `BriefVersion` with all seven elements populated (Problem Statement non-negatable — at least one valid record required; the other four negatable per the row above), or does not produce one at all (Investigation moves to `blocked` or `generation-failed`, per which failure occurred) | Satisfies US-1 AC3 and the "no Brief with no evidentiary basis" requirement; the `blocked`/`generation-failed` split closes G-13; PR-review corrected (this revision) to restore Problem Statement as non-negatable per Q-2 |
| **Open discriminator over closed enum, where the domain evidence says so** | `SourceArtifactType`, `SubmissionOrigin` typed as `'known-literal' \| (string & {})` rather than a bare `\| string` | Decision 1.1, corrected per G-2 — matches the pattern Requirements already mandates for demand-signal "other" while actually retaining literal-type value in tooling |
| **Adapter-boundary classification, not provider-trusted classification** | `searchWeb`'s `SearchWebAdapterResult` (`succeeded`/`query-limited`) and the controlled-retrieval `blocked`/`failed`/`retrieved` classification are both decided by this codebase's own adapter and `ssrfGuardedFetch` module, never inferred from a specific provider's SDK error shapes or trusted timestamps | Danny's binding direction (Section 1.6) — resolves DDR-0001 Row 9's PROVISIONAL flag by moving the classification to a boundary this system controls and can unit test, instead of depending on unconfirmed provider behavior |

### Anti-Patterns (Do Not Use)

- **In-place Brief mutation**: editing fields on an existing `BriefVersion` after creation — violates US-10 AC2 and the Interview's named anti-goal directly.
- **Mutable status fields for assigned validity**: no `status: ClaimStatus`/`BriefVersionStatus` field exists anywhere in Section 3 — assigned validity is always read from `StatusEvent` via `getAssignedState`. Any future PR adding a mutable status field back onto `Claim`, `ClaimVersion`, or `BriefVersion` reintroduces G-3 and is an architecture violation.
- **Copying claim/evidence content into a BriefVersion**: `BriefVersion` stores `claimVersionIds` (exact immutable version references), never a copy of claim text and never a reference to the mutable `Claim` identity. Any future PR that denormalizes claim text directly onto `BriefVersion` violates Q-4.
- **Numeric confidence anywhere**: no field in any schema above is numeric for demand confidence, recommendation strength, or market size — enforced by using literal string unions, not `number` types, for every judgment field. Any future PR introducing a `score: number` field on `DemandConfidenceClassification`, `Recommendation`, or any Brief element is an architecture violation, not a style choice.
- **Auto-scheduling Watch rechecks**: no `nextCheckAt`/cron-like field exists on `Decision` or `ReconsiderationCondition` — reconsideration is manual by design for this slice (US-9 AC3).
- **Runtime-specific types leaking into the domain model**: no schema above references a specific agent runtime's SDK types, message formats, or tool-call conventions — `GenerationRun.runtimeIdentifier` is a string precisely so the model stays valid across every candidate the runtime evaluation tests.
- **Treating citation presence as citation correctness**: no component or contract above verifies that cited evidence actually supports the claim it's attached to (R-1, explicitly accepted MVP limitation). Do not represent a populated `evidence`/`evidenceItemIds`/`supportingClaimVersionIds` array as verified in any UI copy, log message, or downstream consumer.
- **Empty required-citation arrays**: no required citation field (`ClaimVersion.evidence`, `ProblemStatement.supportingClaimVersionIds`, `DemandSignal.evidenceItemIds`, `ExistingSolution.evidenceItemIds`, `GapHypothesis.evidenceItemIds`) may be persisted or returned empty — an empty array fails the same R-4 validation/repair/fail-closed path as an out-of-schema enum value. `DemandConfidenceClassification.citedDemandSignalIds` is the sole named exception (Section 4).
- **Stance stored on EvidenceItem**: no schema above reintroduces a `stance` field on `EvidenceItem` — stance is relationship-scoped (`ClaimVersionEvidence`/`ClaimVersionEvidenceRef`), never item-intrinsic, because the same shared item can support one claim and contradict another.
- **Silent coercion of out-of-schema values**: no component may map an invalid enum member or malformed structured output to a default, a "nearest valid" guess, or a placeholder, and continue as if the field were valid (R-4, Danny binding). The only paths for an out-of-schema value are: bounded repair via `SchemaValidationRecord` (Section 3), or the step — and its `GenerationRun` — failing explicitly with `outcome: 'failed'`. A future PR adding a fallback/default branch on validation failure reintroduces R-4 and is an architecture violation.
- **Dropped or partial `WebSearchResult` sets**: no code path may persist a `WebSearchQuery` whose `results` array is shorter than the adapter's `selectedResultUrls` on a `'succeeded'` outcome — every selected URL gets exactly one `WebSearchResult` row, success or failure alike (Section 1.6). A future PR that skips persisting a `failed`/`blocked` attempt (e.g. only persisting `retrieved` results) reintroduces the exact silent-data-loss failure mode this section exists to prevent.
- **A "no problem established" NegativeFinding, or any BriefVersion persisted without a ProblemStatement**: `BriefElement` does not include `'problem-statement'`; no component may construct a `NegativeFinding` row with that element value, and `generateBriefVersion` must fail explicitly (no `BriefVersion` persisted, `Investigation.status` not moved to `'brief-generated'`) rather than complete with zero `ProblemStatement` records. Q-2 (Danny, binding) required Problem Definition to contain a specific problem with no absence path; a prior revision incorrectly generalized the negative-finding mechanism to this element and is reverted by this correction — reintroducing it is an architecture violation, not a style choice.

---

## 6. Dependencies

Per the milestone's explicit scope boundary, this document does not select libraries, a
database, or an agent-runtime SDK — those choices are the output of the runtime evaluation this
milestone runs, not an input to it. In their place, this section specifies the **capabilities**
any candidate runtime/storage combination must provide to satisfy the schemas and API contracts
above, since that is what the evaluation needs to observe and measure:

| Capability required | Why | Evaluation observes |
|---|---|---|
| Durable, queryable persistence of the Section 3 entities with foreign-key-style integrity (a `Decision` cannot reference a nonexistent `BriefVersion`) | US-8, US-10 | Whether the candidate's storage layer enforces or merely hopes for referential integrity |
| Append-only / immutable-record support (or enforced-at-application-layer immutability) for `BriefVersion`, `ClaimVersion`, `EvidenceItem`, and `StatusEvent` | US-10 AC2, Q-3, Q-4 | Whether versions and status history can be corrupted by accidental in-place writes |
| Efficient reverse lookup of `BriefVersion`s by a member `claimVersionId` (an array-contains or join-table query) | Q-4 traversal requirement | Whether the candidate's storage layer supports this without a full scan per invalidation |
| Multi-step orchestration with per-step provenance capture (model/tool/timing per `GenerationStep`), including on failed runs | US-11, G-12 | How much provenance instrumentation the runtime provides natively vs. requires hand-rolling, and whether failure paths are captured as readily as success paths |
| Fetch/resolve capability for URL-type `SourceArtifact`s, with graceful unreachable-source handling | US-1, Edge Case (dead URL) | Error-handling ergonomics of the runtime's tool-call layer |
| A structured-output or schema-constrained generation mode capable of producing the exact literal unions in Section 3 (`EvidenceLabel`, `DemandConfidenceLevel`, `GapCategory`, `RecommendationDecision`) without free-text drift | US-3, US-4, US-5, US-7 | Whether the candidate can reliably emit constrained enums, or requires post-hoc validation/repair |
| Schema/enum validation of structured model output with a bounded re-prompt-and-repair path (Section 3 `SchemaValidationRecord`, MAX_REPAIR_ATTEMPTS = 1), and explicit run-failure (not silent coercion) when repair also fails | R-4 (Danny binding) | Whether the candidate exposes validation errors in a form usable for re-prompting, and whether failed validation naturally surfaces as a recordable `GenerationRun` failure rather than requiring bespoke plumbing |
| A minimal read/write surface reachable by a human (no requirement on framework) for the Review Surface, including the pre-Brief Investigation state | US-13, G-15 | Effort to stand up even a minimal interactive surface atop the candidate |
| A tool or adapter through which the runtime can search the public web and retrieve/inspect selected results, preserving query/URL/retrieval-time and surfacing failed or blocked retrievals — no specific search API/provider selected here | US-5, Q-6 (binding) | Whether the candidate can plug in web search/retrieval via a tool call or adapter at all, and how cleanly it preserves the Q-6 provenance fields, without this document locking in a vendor |

---

## 7. Integration Points

- **Department OS Core** (`docs/architecture.md`): every entity in Section 3 is a Core domain
  record, evidence record, workflow-state record, or decision record — Problem Department does
  not own separate storage. This MVP is the first concrete exercise of "a module without Core
  underneath it is not a complete vertical slice" (`docs/principles.md`). The `StatusEvent` log in
  particular is a direct instance of Core's general "workflow state" concept and should be modeled
  as such rather than as a Problem-Department-specific table, since other modules will need the
  same bitemporal-validity pattern.
- **Future Opportunity concept**: `ProblemBrief`/`BriefVersion` deliberately do not reference an
  `Opportunity` entity — no such schema exists yet, per Interview Q5. The only forward-compatible
  seam left open is that `Decision.decision === 'Approve'` is a fact Core can query later to
  populate a future Opportunity-handoff process; this MVP does not build that handoff.
- **Future Personal Pull path**: `PersonalPullNote` stays a field on `BriefVersion`, not a
  first-class artifact — per Interview Q5's explicit rejection of a path-agnostic Brief schema.
  No convergence point is designed here.
- **Future multi-channel/collector-fed submissions**: `SubmissionOrigin` and
  `SourceArtifactType`'s open-discriminator shape (Decision 1.1, corrected per G-2) is the only
  accommodation made; no collector integration is built.
- **Runtime evaluation harness** (outside this document's scope to design): consumes the
  Section 6 capability table as its scoring rubric when comparing candidate runtimes against a
  real implementation of this pipeline.

---

## Output Verification

- [x] Every requirement (US-1 through US-13, and every AC in 01-REQUIREMENTS.md's Acceptance
      Criteria section) has explicit architecture coverage in Sections 2–5.
- [x] Schemas are complete, precise interfaces — no pseudocode, no `any`.
- [x] No implementation details (no chosen language, framework, database, or runtime).
- [x] Patterns are justified against specific ACs or the Research Data Integrity precedent.
- [x] Integration points identified (Core, and explicit non-integration with Opportunity/Personal
      Pull/collectors, stated as deliberate boundaries, not omissions).
- [x] Both flagged open items (source-artifact types, submission-to-Brief cardinality) resolved
      with explicit reasoning; neither required a HALT.
- [x] Danny's binding Q-3/Q-4 decisions implemented exactly, with the epistemic-framing wording
      correction propagated into schema naming, API naming, and UI-copy flag (R-1).
- [x] Review gaps G-2, G-3, G-4, G-11, G-12, G-13, G-15 closed; R-1 and R-4 (schema validation /
      bounded-repair mechanism, Section 3) both named as explicit, accepted-and-implemented items
      rather than silently dropped.
- [x] Danny's binding Q-5/Q-6/Q-7/Q-8 decisions implemented: Q-5 (Reject reconsiderable via new
      run/BriefVersion, no new mechanism) and Q-7 (getInvestigation already satisfies the single
      durable-URL contract) confirmed against existing design; Q-6 (independent web research
      capability contract, vendor-unselected) added as new schema/component/capability-table
      content; Q-8 (runtime-adoption wording) tightened in Scope Discipline.
- [x] PR-review binding fixes (post-Frank-PASS, this revision) implemented: (1) bitemporal query
      split into `getAssignedState` (current-knowledge) and `getAssignedStateAsRecorded`
      (as-of-knowledge, K-bound), preventing backdated corrections from rewriting a past decision's
      evidence state; (2) `EvidenceItem.stance` removed, replaced by the `ClaimVersionEvidence`/
      `ClaimVersionEvidenceRef` relationship; (3) `ProblemBrief` immutability contradiction resolved
      — option (a), `currentVersionId` named explicitly as the one derived-index field permitted to
      update; (4) citation collections retyped `NonEmptyArray<T>` and enforced at runtime through
      the R-4 fail-closed path, not just declared in prose; (5) gate-status line corrected to match
      `GATE-LOG.md`; (6) Personal Pull wording aligned to NORTH-STAR.md's "may be retained,
      optional" framing.
- [x] PR-review binding correction (post-commit 370a2c3, this revision): the NegativeFinding
      generalization mistakenly extended to `'problem-statement'` is reverted. `BriefElement` now
      names only the four elements Q-2 (Danny, binding) declared negatable (evidence,
      demand-signal-type, existing-solution, gap-hypothesis); Problem Statement is restored as
      non-negatable — `generateBriefVersion` must establish at least one valid `ProblemStatement`
      or fail explicitly via the existing R-4 fail-closed path, persisting no `BriefVersion` and
      leaving `Investigation.status` at `'generation-failed'` (reasoning stated inline at
      `generateBriefVersion`'s doc comment, Section 4) rather than transitioning to
      `'brief-generated'`. `DemandConfidenceClassification.negativeFindingRef?: string` added
      (Section 3) so an `Insufficient` classification can point at the exact `NegativeFinding` row
      it relied on, closing the traceability gap between an empty `citedDemandSignalIds` and a
      recorded absence.
- [x] `searchWeb` adapter-boundary contract, controlled-retrieval `blocked`/`failed`/`retrieved` classification (with a principled, testable dividing rule), and the provably-not-dropped persistence shape are specified (Section 1.6 addendum) — resolves DDR-0001 Row 9's PROVISIONAL flag ahead of Slice 6, per Danny's binding direction that this classification belongs at the adapter boundary, not inside a specific provider's behavior.
