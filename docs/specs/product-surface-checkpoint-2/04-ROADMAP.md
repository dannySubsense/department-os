# Roadmap: Product Surface — Checkpoint 2

**Status**: Draft (pending Frank spec-gate + human approval) — revised for the 2026-08-23
external-review correction (Findings 1-8, 11 from Codex + Sol), Danny's G12 binding resolution
on joint slice completion, and Danny's 2026-08-24 binding H-1 ruling (reuse and extend the existing
`POST /api/investigations` route rather than adding `POST /api/investigations/:id/sources` —
`02-ARCHITECTURE.md` §1.4/§3.1b/§4.1/§5.2/§5.3, recorded in `05-REVIEW.md`'s "Spec-Gate
Disposition" section, entry "H-1 — RESOLVED, Danny's binding ruling, 2026-08-24"). Further revised 2026-08-24 to
sync C2-S2's test list to `02-ARCHITECTURE.md` §1.4/§3.1b's H-2 correction (a guard-declined
transition whose re-read status is unchanged from the pre-mutation read is a benign 201 no-op, not
a 409 — only a genuinely diverged re-read status is a 409 conflict). Further revised 2026-08-24 to
sync C2-S3's test list to `02-ARCHITECTURE.md` §4.2 step 5b's corrected finalization safety net (a
meta-failure of `finalizeGenerationRun`/`attemptGenerationFailedTransition`/`client.release()`
itself, not an ordinary business-logic/DB error, requires the connector's own `pipeline.catch()` to
write a terminal outcome so no `GenerationRun` is ever left permanently `'in-progress'` with no
terminal record). Further revised 2026-08-24 to sync C2-S3's Files/Implementation Notes/Tests to
`02-ARCHITECTURE.md` §4.2 steps 5/5b's corrected TWO-catch design (the single safety net previously
described is split into two `.catch()` handlers attached at different points on `pipeline`: step
5's synchronization catch, attached immediately, relays only a pre-Phase-1 rejection into
`runCreated` and never references `generationRun`/writes a terminal record; step 5b's finalization
safety net is attached separately, only after `generationRun = await runCreated` resolves
successfully, so it can never fire before `generationRun` is assigned) and to add `isUniqueViolation`
to C2-S3's Files list as the new helper this slice creates. Further revised 2026-08-24 to reframe
`POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` as engineering-owned constants derived at Forge time
from real measurement — never PROVISIONAL values with Danny as named owner, and never specific
numbers asserted in this document — per `02-ARCHITECTURE.md` §4.9/§5.2's corrected framing and
`01-REQUIREMENTS.md`'s new Non-Functional Requirement, and to require C2-S3 (the slice that
implements the polling/liveness logic) to execute the real-run measurement-and-report step and
record the derived values, their measured evidence, and the safety-margin arithmetic as code
comments next to the constants — as part of C2-S3's own Implementation Notes and Tests, not a
separate tracking artifact.
**Date**: 2026-08-23, revised 2026-08-24 for the H-1 route correction, revised again 2026-08-24 for
the H-2 test-list sync, revised again 2026-08-24 for the §4.2 step 5b finalization-safety-net
test-list sync, revised again 2026-08-24 for the §4.2 steps 5/5b two-catch Files/Implementation
Notes/Tests sync, revised again 2026-08-24 for the engineering-derived-constant reframing of
`POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS`.
**Feeds from**: `01-REQUIREMENTS.md` (13 user stories, 2026-08-23 revision — tightened US-1 AC5,
US-4/US-6 stale-run ACs, US-13 AC2, and the new Non-Functional Requirement that Forge measure real
runs and report observed request rate, persisted-update gaps, longest legitimate silence, and
observed stale/interrupted-warning behavior before `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` are
derived — see that document for the canonical acceptance-criteria enumeration), `02-ARCHITECTURE.md`
(2026-08-23 revision, H-1-corrected 2026-08-24, H-2-corrected 2026-08-24, §4.2 steps 5/5b-corrected
2026-08-24, §4.9/§5.2 corrected 2026-08-24 for the engineering-derived-constant framing — component
table, migrations `009`/`010`/`011`, the
`StatusEvent` schema with `sequence` tiebreak §3.6, the revised non-blocking Generation Run
Connector §4.2/§1.3 including the two-catch split (step 5's synchronization catch, step 5b's
finalization safety net) and the new `isUniqueViolation` helper, the version-numbered Brief route
§3.1a/§5.1, the real `AddSourceInline`/Add-Source Connector reusing and extending the existing
`POST /api/investigations` route §1.4/§3.1b — including the H-2-corrected benign-no-op-vs-
genuine-conflict branch in §3.1b step 6, the revised Resubmission Eligibility Check
`hasEligibleNewEvidenceSinceCurrentBriefVersion` §4.8/§1.5, the Stale/Interrupted Run Detector §4.9,
`decisionLineage` split from per-version `priorDecisions` §3.2/§4.5 — see that document for the
canonical component enumeration), `03-UI-SPEC.md` (2026-08-23 revision — the two-route SPA design
§5.1, the Stale/Interrupted panel variant, the real `AddSourceInline` component, the split
`DecisionHistoryBanner` lists, the version-navigation interaction), `NORTH-STAR.md`.

---

## 0. Slice-Identifier Discipline (binding, restated)

This roadmap is the active continuation of one unfinished Problem Department MVP stream that
already has two other locally-numbered roadmaps: `problem-department-mvp` (Slices 1-9 built,
Slices 10-12 SUPERSEDED) and `product-surface-checkpoint-1` (its own Slices 1-2, built). To keep
"Slice 1" unambiguous across three roadmaps, every Forge task in this document is identified as
`C2-S1`, `C2-S2`, ... — sprint-local to this roadmap only. No bare "Slice N" header appears below.

---

## 1. Slice Count and Why (unchanged: still five `C2-S` slices)

The 2026-08-23 external-review corrections (Findings 1-8, 11), Danny's G12 joint-completion
resolution, and Danny's 2026-08-24 H-1 route-reuse ruling do not add or remove a slice — every
correction lands inside the existing linear dependency chain, because each corrected mechanism's
real data/service dependency already sits at one of the five slice boundaries below:

- **Finding 1** (non-blocking start, `onRunCreated`) and **Finding 8** (stale/interrupted
  `livenessState`) both live inside the Generation Run Connector and the honest-progress panel —
  both already **C2-S3**'s scope. The read-model *field* `livenessState` (structural, computed
  per-run) is defined in **C2-S2**'s Workspace Read Model (it costs nothing to define correctly the
  first time a `generationRuns` query is written), but the only slice that can *produce* a real
  in-progress or stale run to test/demonstrate it against is **C2-S3**, which is where the
  live test coverage and browser demonstration for `livenessState` land — matching this roadmap's
  own "assign the full demonstration to the earliest point it is genuinely real" discipline.
- **Finding 2** (`validationRecords`/`toolInvocations`/`webSearchQueries` closing the read-model
  gap) is a Workspace Read Model shape correction — **C2-S2** (where the real
  `generation_run`/`generation_step`/`web_search_query` join query is first built) defines the
  complete shape and is tested against real pre-existing seeded rows; **C2-S3**'s
  `GenerationProgressPanel` and **C2-S4**'s `ProvenanceRail` are where these fields are first
  *rendered* — each owning slice's Files/Tests are updated accordingly, not duplicated.
- **Finding 3** (version-numbered Brief navigation, `.../versions/:versionNumber`) requires
  `BriefReviewPanel`/`getBriefForReview` to exist, which is **C2-S4**'s own scope — the route, the
  second React Route, and the version-indicator header all land there with a real test and browser
  demonstration (navigate to a specific prior version produced by C2-S4's own live corrective-
  generation demo, reload it, confirm it renders).
- **Finding 4, H-1-corrected (2026-08-24)** (`AddSourceInline` as its own real component, reusing
  and extending the existing `POST /api/investigations` route — Danny's binding ruling; NOT a new
  `POST /api/investigations/:id/sources` route, `02-ARCHITECTURE.md` §1.4/§3.1b) is corrected at its
  point of origin — **C2-S2**, which is where `AddSourceInline` is first built (for Blocked
  recovery) and where the existing `POST /api/investigations` route handler must therefore be
  extended in place, not deferred. C2-S3 and C2-S4 continue to host additional *instances* of the
  same real component, unchanged.
- **Finding 5** (tightened `hasEligibleNewEvidenceSinceCurrentBriefVersion`, replacing the bare
  timestamp check) stays in **C2-S3**, which already owned the eligibility mechanism — only its
  internal query and test coverage are corrected, not its owning slice.
- **Finding 6** (`decisionLineage` split from per-version `priorDecisions`, resolved
  reconsideration-condition content) stays in **C2-S5**, which already owned
  `getDecisionsForBriefVersion`/`DecisionHistoryBanner` — the correction is to that slice's own
  Files/Tests, not a relocation.
- **Finding 7** (`StatusEvent.sequence` deterministic tiebreak; target-existence/type validation
  before write) splits across the same read/write boundary this roadmap already established for
  US-12: the `sequence` column and the read queries' `ORDER BY ... sequence DESC` tiebreak are
  schema/read concerns and land in **C2-S4** (which already owns migration `011` and the two
  `getAssignedState*` read queries); the write-time `InvalidValidityTargetError` validation is a
  concern of `assignValidityState` (the writer), which — unchanged from the prior draft's own
  dependency reasoning — cannot be built before `getDecisionsForBriefVersion` exists, so it stays in
  **C2-S5**.
- **Finding 11** (Checkpoint-1 edit-boundary language, GET/POST heading accuracy, browser-only
  demonstration language) is a cross-cutting correction applied to every slice's own text below, not
  a new slice.
- **Danny's G12 resolution** confirms, rather than changes, this roadmap's existing US-5 AC3 split:
  C2-S2 delivers the real add-source-to-Blocked mechanism and the resulting `generationEligible:
  true` computation; C2-S3 delivers the clickable trigger and the only point at which the full AC3
  behavior — source added, status returns to `'open'`, generation triggered and watched to a
  terminal outcome — is actually clickable and browser-demonstrable end to end. Per G12, **neither
  slice's own Done-When may claim AC3 complete independently** — this is now stated explicitly in
  both C2-S2's and C2-S3's text below, with the integrated test and browser demonstration living in
  C2-S3 (the earliest point the full behavior is real).
- **US-12 (`StatusEvent`/validity)** splits across two existing slices, not one, because its own
  two service functions have different real dependencies: `getAssignedState`/
  `getAssignedStateAsRecorded` (the read queries, §4.7) are pure queries over `status_event` with
  no dependency on `Decision` — and `getBriefForReview` (§3.3) already calls `getAssignedState`
  unconditionally the moment it exists (§4.7 "Read-side wiring"). `getBriefForReview` is built in
  **C2-S4** — so the `StatusEvent` type, migration `011`, and the two read queries stay in C2-S4
  (carried forward unchanged by this correction pass; Finding 7 only adds the `sequence` tiebreak
  column and ordering to these same two queries, it does not move them), to avoid `getBriefForReview`
  depending forward on a slice that hasn't run yet. `assignValidityState` (the writer, with
  dependent-decision reconstruction, now also carrying Finding 7's write-time target validation)
  genuinely does depend on `getDecisionsForBriefVersion` (§4.5), which is built in **C2-S5** — so the
  writer, and the `DecisionHistoryBanner` component that renders its read-side output alongside
  `priorDecisions`/`decisionLineage` (Finding 6), stay in C2-S5, extending the slice that already owns
  Decision Recording and History. This is a dependency-driven split of one user story's two service
  functions, not two overlapping slices for one story.
- **US-13 (evidence-driven correction)** splits three ways for the same reason: the eligibility
  rule and `hasEligibleNewEvidenceSinceCurrentBriefVersion` helper (§4.2, §4.8 — renamed from
  `hasNewEvidenceSinceCurrentBriefVersion` per Finding 5, with its bare-timestamp check replaced by
  the real resolution-status/consumed-evidence chain) live inside the Generation Run Connector and
  the Workspace Read Model, both already owned by **C2-S3** — and C2-S3's own browser demonstration
  already produces a real `'brief-generated'` Investigation with a real `BriefVersion`, so the
  mechanism is genuinely testable there without forward-depending on a later slice. The clickable UI
  affordance for it — `AddSourceInline` and `GenerateButton` hosted inside
  `BriefGeneratedSummaryPanel` — cannot exist before that panel does, and `BriefGeneratedSummaryPanel`
  is `'brief-generated'`'s dedicated panel, built in **C2-S4**; the trigger becomes clickable and
  browser-demonstrable there, alongside Finding 3's version-numbered navigation, which this same
  slice needs to make the resulting prior version reload-stably reachable. The full five-item
  demonstration Danny specified (existing Brief AND existing Decision, both remaining retrievable
  after the correction, reached via Finding 3's real versioned route rather than a raw internal id)
  cannot be genuinely performed before a real `Decision` exists, which is **C2-S5**'s own scope — so
  C2-S5 also owns the closing regression test/demonstration that exercises all five items together,
  the same "assign the full demo to the earliest point it is genuinely real" discipline this roadmap
  already applied to US-8.
- Restated: no new slice is needed because both restored user stories decompose along the same
  linear `C2-S2 → C2-S3 → C2-S4 → C2-S5` dependency chain the five slices already follow — each
  restored piece lands in whichever existing slice first has the real data/service dependency it
  needs, never earlier (forward dependency) and never held back later than necessary (which would
  strand a testable piece of work as an unowned Open Item, the defect this correction exists to fix).
- **H-1 (Danny's binding ruling, 2026-08-24)** confirms, rather than changes, this same slice
  ownership: because `AddSourceInline`'s connector was always C2-S2's own scope (Finding 4), reusing
  and extending the existing `POST /api/investigations` route in place — instead of adding a new
  `POST /api/investigations/:id/sources` route — is a same-slice correction to C2-S2's own Files,
  Implementation Notes, Tests, and Browser Demonstration, not a relocation across slices. No other
  slice's ownership, dependency, or sequencing changes as a result.
- **H-2 (2026-08-24 correction, `02-ARCHITECTURE.md` §1.4/§3.1b)** confirms, rather than changes,
  the same C2-S2 ownership: the extended route's guard-decline branch compares the pre-mutation
  status observed before this request attempted anything to the post-decline re-read status — an
  unchanged comparison is a benign no-op (`201`), only a genuine divergence is a conflict (`409`).
  This is a same-slice correction to C2-S2's own Files and Tests (the test list previously required
  asserting `409` for every guard-decline case; it is corrected below to assert `201` for the
  benign-no-op cases and reserve `409` for a real, specifiable concurrent-conflict case only) — not
  a relocation across slices, and not a change to any other slice's ownership, dependency, or
  sequencing.
- **§4.2 steps 5/5b, corrected (2026-08-24, `02-ARCHITECTURE.md` §1.3 re-verification)** confirms,
  rather than changes, the same C2-S3 ownership: `generateBriefVersion`'s outermost catch has no
  wrapper — if finalization itself (`finalizeGenerationRun`, `attemptGenerationFailedTransition`, or
  `client.release()`) throws while already inside a catch block, that throw propagates un-finalized.
  The connector attaches TWO separate `.catch()` handlers to `pipeline`, at two different points:
  step 5's synchronization catch, attached immediately after `generateBriefVersion` is invoked, whose
  sole job is to relay a pre-Phase-1 rejection into `runCreated` so the `try`/`catch` around `await
  runCreated` can respond synchronously — it never references `generationRun` and never writes a
  terminal record, because it can run at a point where that binding does not yet exist; and step 5b's
  finalization safety net, attached separately, only after `generationRun = await runCreated` has
  resolved successfully, which distinguishes typed errors (already finalized by `generateBriefVersion`
  itself — log only) from an untyped/unexpected rejection (finalization itself failed) and, only in
  the second case, itself writes a terminal `GenerationStep`/`GenerationRun` for the run before
  logging — a same-slice correction to C2-S3's own Files, Implementation Notes, and Tests, not a
  relocation across slices.
- The rest of §1's original reasoning (the US-7/US-8 standalone-vs-folded split, the "pair backend
  with browser-reachable UI in the same slice" discipline) is unchanged by this correction pass and
  is not restated in full here.

---

## 2. Dependency Map

| Slice | Depends On | Why |
|---|---|---|
| C2-S1 — Fix Node 22 URL resolution | — | Standalone module fix; no new schema, no new route, no new screen |
| C2-S2 — Investigation Workspace scaffold (identity, sources via the extended `POST /api/investigations` Add-Source Connector, Blocked, nav wiring, full Workspace Read Model shape) | — | Reads only existing tables (`getInvestigation`, `sourceArtifacts`, `generation_run`/`generation_step`/`web_search_query`); no new migration; the existing `POST /api/investigations` route handler is extended in place here (Finding 4, H-1-corrected — reuse, not a new `:id/sources` route; H-2-corrected — benign no-op vs. genuine conflict) because `AddSourceInline` is first built here |
| C2-S3 — Generation Run Connector (non-blocking start, Finding 1) + honest in-progress/stale-interrupted/failed panels (Finding 8) + evidence-gated eligibility mechanism (Finding 5, US-13 mechanism only) | C2-S2 (needs the workspace screen, route, and the extended `POST /api/investigations` Add-Source Connector to host the trigger control, progress panel, and the G12 joint US-5 AC3 demonstration) | New migration `009`; connector and `hasEligibleNewEvidenceSinceCurrentBriefVersion` are otherwise independently testable at the service layer, but every browser demonstration requires C2-S2's screen and real add-source path to exist |
| C2-S4 — Brief Review (read service + panel + provenance rail, rendering Finding 2's real fields) + version-numbered Brief navigation (Finding 3) + `StatusEvent` schema/read queries with `sequence` tiebreak (Finding 7, read half) + evidence-driven correction UI (US-13, UI) | C2-S3 (needs a real, browser-triggered `BriefVersion` to read, and the real eligibility mechanism to gate the correction UI on) | `getBriefForReview` resolves `ProblemBrief.currentVersionId`; the version-numbered route needs a `BriefVersion` and its own lineage to navigate against — this slice's own live corrective-generation demo is what produces the second version Finding 3's demonstration navigates to |
| C2-S5 — Decision Recording and History (Finding 6, `decisionLineage`/`priorDecisions` split) + `assignValidityState` with write-time target validation (Finding 7, write half) + `DecisionHistoryBanner` + US-13 closing regression | C2-S4 (needs a rendered `briefVersionId`, and the versioned-route navigation Finding 3 built, to demonstrate US-13's full five-item path against a specific prior version's own URL rather than a raw id) | New migration `010`; `recordDecision` requires an existing `brief_version` row (FK); `assignValidityState`'s dependent-decision reconstruction requires `getDecisionsForBriefVersion`, built in this slice |

No circular dependency exists — the chain is strictly linear: C2-S2 → C2-S3 → C2-S4 → C2-S5.
C2-S1 is parallel/independent and sequenced first only because it unblocks a fully-honest US-2 AC2
demonstration in every later slice — not because any later slice's code depends on it.

---

## C2-S1 — Fix Node 22 URL Resolution Defect

**Goal:** `url`-type sources resolve correctly on this runtime; the Landscape Researcher's web
research is no longer silently starved.

**Depends On:** —

**Satisfies:** US-7 (all ACs).

**Files:**
- `src/services/ssrfGuardedFetch.ts` — edit, per `02-ARCHITECTURE.md` §4.6 in full:
  - Widen `safeLookup`'s declared callback signature from the fixed 3-arg shape to the union
    `(err, address: string | dns.LookupAddress[], family?: number) => void`, selected by the
    caller's `options.all`.
  - Call site 1 (`allowedTestHosts` bypass): NO CHANGE — forwards the caller's `options` unchanged
    to the real `dns.lookup`, which already implements the `options.all` contract correctly.
  - Call site 2 (IP-literal branch): branch on `options.all` — array-of-one shape when `true`,
    existing single-value shape when falsy/omitted.
  - Call site 3 (DNS-resolution branch): branch on `options.all` — full `addresses` array when
    `true`, first-choice single-value shape when falsy/omitted; this is the primary fix. The
    existing all-or-nothing `isDisallowedIp` block-and-reject check (fail-closed) is UNCHANGED in
    both branches of this call site.
- `src/services/ssrfGuardedFetch.test.ts` (or equivalent existing test file — confirm exact name
  during Forge) — add the four regression tests specified verbatim in §4.6:
  1. A real, actually-reachable hostname-based source resolves successfully end-to-end on the
     production code path (not the `allowedTestHosts` bypass) under this repo's live Node version.
  2. A direct unit test on `safeLookup` (not routed through `fetchWithGuards`, not using the
     `allowedTestHosts` fixture) asserting the IP-literal branch's new `options.all === true` arm:
     `safeLookup('8.8.8.8', { all: true }, callback)` → `callback(null, [{ address: '8.8.8.8',
     family: 4 }])`. `8.8.8.8` is used because `127.0.0.1` is rejected by the fail-closed block
     check before ever reaching this arm; `8.8.8.8` is verified against every range
     `isDisallowedIp` blocks, so it correctly reaches the arm this test exists to cover.
  3. A hostname resolving to a mixed allowed/disallowed address set is still rejected in full with
     `EBLOCKEDHOST` under `{ all: true }` — proves block semantics were not weakened.
  4. A direct unit call to `safeLookup` with `options.all` falsy returns the single-value
     `(err, address, family)` shape for both the IP-literal and DNS-resolution branches.

**Implementation Notes:**
- After the existing all-or-nothing `isDisallowedIp` block-and-reject check passes, the
  DNS-resolution branch invokes the callback with the full resolved `addresses` array when
  `options.all` is true, and the existing single-value shape when it is not.
- The block-and-reject check itself is untouched — fail-closed, never filter-and-proceed (§4.6).
- No change to `isDisallowedIp`, `decodeMappedIpv4Hex`, `inIpv4Cidr`, `ipv4ToInt`, or any constant.
- Both existing call sites into `safeLookup` from the rest of the file
  (`resolveSourceArtifact.ts`, `searchWeb`'s retrieval path) receive the fix automatically.
- No claim is made about whether Node 22 invokes the custom `lookup` at all for an IP-literal
  host — Forge instruments `safeLookup`'s entry to observe this before writing any test that
  depends on a skip/no-skip assumption (§4.6, G2).

**Tests:**
- [ ] Regression tests 1-4 above.
- [ ] Existing SSRF-blocking tests (disallowed IPs, private ranges) still pass unchanged.
- [ ] Frank forge-gate: PASS.

**Browser Demonstration (required — real, rendered screen, real clicks, real persisted data):**
- From the existing Checkpoint-1 Problem Department overview (`StartInvestigationForm`, unchanged
  this slice), submit a real `url`-type source pointing at a genuinely reachable host, using the
  actual rendered form and its real submit control. Confirm the source's persisted
  `resolutionStatus` is `content-retrieved`, not `unreachable`, viewed via the actual rendered
  result of the submission — not inferred from an API response alone.

**Done When:**
- [ ] All tests above pass; Frank forge-gate PASS.
- [ ] The browser demonstration above is performed and observed against real persisted data.
- [ ] Stop point for Danny's product review: a real `url` source resolves successfully in the
      existing Checkpoint-1 UI.

---

## C2-S2 — Investigation Workspace Scaffold (Identity, Sources via the Extended `POST /api/investigations` Add-Source Connector, Blocked, Navigation, Full Workspace Read Model Shape)

**Goal:** One durable workspace URL exists, reachable from submission and from every existing
per-row "Open" link; it shows an Investigation's identity, sources, real generation history (if
any already exists, rendered with its full real provenance fields), and (if applicable) the
Blocked outcome with in-place recovery via `AddSourceInline` — the real, standalone component
calling the existing, extended `POST /api/investigations` route (Danny's binding H-1 ruling,
`02-ARCHITECTURE.md` §1.4/§3.1b), never a new `:id/sources` route, never a `StartInvestigationForm`
reuse, and never the legacy form-post-and-redirect route.

**Depends On:** — (parallel to C2-S1; sequenced second for narrative flow, not a hard dependency)

**Satisfies:** US-1 (all ACs except AC5, which is C2-S4's scope), US-2 (ACs 1, 3; AC2's real `url`
resolution demonstrated using C2-S1's fix), US-5 (ACs 1-2 fully; **AC3 only jointly with C2-S3 —
see G12 note below, this slice's own Done-When does not claim AC3 independently**), US-6 (AC2's
requirement that real, pre-existing generation history, including its full provenance fields, is
never under-reported).

**Files:**
- `src/types/readModels.ts` — add `WorkspaceInvestigationSummary`, `WorkspaceGenerationStepSummary`
  (including `validationRecords`/`toolInvocations`, Finding 2), `WorkspaceWebSearchQuerySummary`
  (Finding 2), `WorkspaceGenerationRunSummary` (including `livenessState`, Finding 8 — the field is
  defined and computed here since it costs nothing to define correctly the first time this shape is
  written; see C2-S3 for the first slice that can produce and demonstrate a real non-`'active'`
  value), `WorkspaceBriefSummary`, `WorkspaceDecisionSummary`, `InvestigationWorkspaceView` (full
  shape per `02-ARCHITECTURE.md` §3.2, including `newEvidenceSinceCurrentBriefVersion` and
  `decisionLineage` — both stay `false`/`[]` until C2-S3/C2-S5 populate them for real; the shape is
  defined once, correctly, here, per Finding 2's binding closing of the field-omission gap)
- `src/services/getInvestigationWorkspace.ts` (new) — steps 1, 2, and 5 of §4.4's assembly built for
  real: step 1 `getInvestigation`; step 2 the real `generation_run`/`generation_step`/
  `web_search_query`/`web_search_result`/`query_limitation` join query (Finding 2 — closing the
  read-model gap against tables that already exist, migrations `005`/`006`, no new persistence),
  returning full generation history AND full per-step `validationRecords`/`toolInvocations` and
  per-run `webSearchQueries` for any Investigation that already has runs, with `livenessState`
  computed inline per `02-ARCHITECTURE.md` §4.9's `computeLivenessState` function (structural —
  `'terminal'` whenever `outcome !== 'in-progress'`, otherwise `'active'`/`'stale-or-interrupted'`
  against `STALE_THRESHOLD_MS` — the engineering-derived constant defined and derived in C2-S3, per
  §4.9); step 5: `generationEligible` computed per §4.2's Generation
  Eligibility Rule — for this slice's reachable statuses (`'open'`, `'blocked'`), this evaluates to
  `status === 'open'` AND no run has `outcome === 'in-progress'`. Steps 3-4 (briefs/decisions)
  return `[]`/`[]` placeholders — no `ProblemBrief`/`Decision` row can exist yet.
- `src/web/apiRoutes.ts`:
  - `GET /api/investigations/:id/workspace` (new route).
  - `POST /api/investigations` (**Finding 4, H-1-corrected — existing route, edited in place, not
    duplicated**, `02-ARCHITECTURE.md` §1.4/§3.1b/§4.1): the handler gains the pre-mutation
    `getInvestigation` status read, the `'brief-generated'`-skip branch (adding sources to an
    existing `investigationId` whose current status is `'brief-generated'` does NOT call
    `transitionInvestigationStatus` at all — the Investigation remains `'brief-generated'`), the
    `false`-return check on `transitionInvestigationStatus` for every other existing-Investigation
    case — comparing the freshly-read post-decline status against the pre-mutation status observed
    in step 2: **unchanged is a benign no-op, responding `201` exactly as the `true` branch does
    (H-2 correction, §3.1b step 6)** — only a genuine divergence (something else moved the row
    between step 2's read and this request's own transition attempt) responds `409
    CreateInvestigationTransitionConflictResponseBody` — and the post-mutation `getInvestigation`
    re-read before every response. `submitSources`, `resolveInvestigationSources`, and
    `transitionInvestigationStatus` themselves are unmodified — the exact 7-step branch is §3.1b's
    own. Returns `201 CreateInvestigationResponseBody` (now carrying the additive `sourcesAdded`
    field, including for the benign-no-op case above), `400`, the new
    `404 CreateInvestigationNotFoundResponseBody`, or the new
    `409 CreateInvestigationTransitionConflictResponseBody` (genuine concurrent conflict only, per
    the H-2 correction — never for a decline whose re-read status matches step 2's own), never a
    redirect. This extension is built in THIS slice, not deferred, because `AddSourceInline` (below)
    needs the real, extended route to call from its very first mount point.
- `src/client/screens/InvestigationWorkspaceScreen.tsx` (new) — mount, fetch-on-mount, not-found and
  error states (US-1 AC4), renders regions 1-2 only (Header, Outcome/Status Panel: Open/Eligible and
  Blocked variants only).
- `src/client/components/InvestigationIdentityHeader.tsx` (new).
- `src/client/components/OutcomeStatusPanel/OpenEligiblePanel.tsx` (new — identity/eligibility fact
  display only; `GenerateButton` itself is built and wired in C2-S3, which owns this file's
  completion).
- `src/client/components/OutcomeStatusPanel/BlockedSourcesPanel.tsx` (new).
- `src/client/components/AddSourceInline.tsx` (new — **Finding 4, H-1-corrected**: its OWN small
  form component, calling `addSourcesToInvestigation(investigationId, artifacts)` (§5.2) — a thin
  wrapper that always supplies `investigationId` to the EXISTING, extended
  `POST /api/investigations` route. No `:id/sources` sub-route exists or is added. This is
  explicitly NOT a wrapper around `StartInvestigationForm`, which has no `investigationId` prop and
  always calls `createInvestigation` with `investigationId` omitted — a new-Investigation-only call
  site, not a route difference. `AddSourceInline` is reused unmodified by C2-S3
  (generation-failed retry hosting) and C2-S4 (`'brief-generated'` resubmission hosting, US-13) —
  this slice builds the one real component and extends the one real route it calls; later slices
  only change which panel hosts an instance of it).
- `src/client/api.ts` — add `fetchInvestigationWorkspace`, `addSourcesToInvestigation` (§5.2 — a
  thin wrapper around the existing `createInvestigation`/`POST /api/investigations` call, always
  supplying `investigationId`; not a call to a separate route).
- `src/client/App.tsx` — add the new `<Route>` for
  `/departments/problem-department/investigations/:investigationId` (§5.1; the second,
  version-scoped route is C2-S4's addition, per Finding 3).
- `src/client/components/StartInvestigationForm.tsx` — edit call site only: `onSubmitted` now
  supports a navigate-away mode (used by `ProblemDepartmentScreen`); component's own props/contract
  unchanged.
- `src/client/screens/ProblemDepartmentScreen.tsx` — edit: `StartInvestigationForm`'s `onSubmitted`
  now calls `navigate(...)` into the workspace route; per-row "Open current view" link target
  updated from the legacy `<a href="/investigations/{id}">` to a `<Link>`/`navigate()` targeting the
  new workspace route for all four `InvestigationStatus` values (**Finding 11a** — this is the one,
  bounded Checkpoint-1 edit `02-ARCHITECTURE.md` §0 explicitly permits: retargeting this per-row
  navigation affordance ONLY. No other Checkpoint-1 file, component, prop, route, or rendered
  content is touched, added, or removed; Checkpoint-1's own `02-ARCHITECTURE.md`/`03-UI-SPEC.md`
  remain the locked spec of record for everything else about these screens, and Checkpoint-1's own
  shipped behavior is otherwise fully preserved).
- `src/client/screens/MissionControlScreen.tsx` — edit: same per-row link-target update (Finding
  11a — same bounded exception, no other change).

**Implementation Notes:**
- No new migration in this slice — `generation_run`/`generation_step`/`web_search_query` already
  exist (migrations `005`/`006`) and this slice's read model queries them for real, correctly
  reporting any pre-existing generation history including its full provenance fields (US-6 AC2,
  Finding 2); only the `briefs`/`decisions`/`decisionLineage` arrays are honestly empty in this
  slice.
- `PersistentNav` is not remounted on navigation into the workspace (§8, §5.1).
- The legacy Express `GET /investigations/:id` route is left exactly as found — not touched. The
  legacy Express `POST /investigations` form-post-and-redirect route (`src/web/server.ts`) is also
  left exactly as found — it is a distinct, separate route from `POST /api/investigations`, which is
  the JSON API route this slice extends in place (Danny's binding H-1 ruling, §1.4/§3.1b). No new
  path segment is added anywhere; the extension is entirely inside `POST /api/investigations`'s own
  handler branching.
- **G12 (Danny's binding resolution) — US-5 AC3 joint completion, half 1 of 2.** This slice delivers
  the real mechanism half of AC3: a genuinely reachable source added from the workspace via
  `AddSourceInline` → the existing, extended `POST /api/investigations` route → real re-resolution →
  real `Investigation.status` returning to `'open'` → the next `GET .../workspace` re-fetch computing
  `generationEligible: true` for real. **This slice's own Done-When does NOT claim AC3 complete** —
  there is no generation-trigger control built yet (that is `GenerateButton`, C2-S3's own scope), so
  "generation becomes eligible again" cannot be demonstrated as a clickable, generation-triggering
  path here. The explicit cross-reference: C2-S3's Implementation Notes and Done-When state the
  other half and the integrated demonstration.

**Tests:**
- [ ] `getInvestigationWorkspace`: returns `null` for a nonexistent id; returns a populated view for
      `open`/`blocked` Investigations with correct `sourceCount`, `sources`, `generationEligible`.
- [ ] `getInvestigationWorkspace`: for an Investigation with pre-existing, real `generation_run`/
      `generation_step`/`web_search_query` rows (seeded directly against the real tables, not
      mocked), returns the full real generation history in `generationRuns`/`latestGenerationRun`
      **including real, non-empty `validationRecords`/`toolInvocations` per step and real
      `webSearchQueries` per run** (Finding 2) — never an empty array or omitted field for an
      Investigation that actually has this data persisted.
- [ ] `getInvestigationWorkspace`: `livenessState` is `'terminal'` for every seeded
      `succeeded`/`failed` run in this slice's fixtures (no real in-progress run exists yet to
      exercise `'active'`/`'stale-or-interrupted'` — that is C2-S3's own test scope).
- [ ] `GET /api/investigations/:id/workspace`: 200 with the view; 404 with
      `{ error: 'investigation-not-found' }` for a nonexistent id.
- [ ] `POST /api/investigations` (existing-`investigationId` case, extended per §3.1b): 201 with
      `CreateInvestigationResponseBody` reflecting the real, read-back `status` and the additive
      `sourcesAdded` count after the full `submitSources` → `resolveInvestigationSources` →
      (conditional) `transitionInvestigationStatus` sequence completes against real rows; 400 for
      zero non-blank artifacts; 404 `investigation-not-found` for a nonexistent `investigationId`.
- [ ] **H-2 correction, required (benign no-op, NOT 409)**: adding a source to an Investigation
      whose real current status is unchanged by the attempted transition — specifically, a genuinely
      reachable source added to an Investigation already `'open'` (guard declines `'open'`→`'open'`
      since `ALLOWED_PRIOR_STATUSES.open` only permits `'blocked'`), an unreachable source added to
      one already `'blocked'` (same reasoning, reversed), and both `'generation-failed'` sub-cases
      (target `'open'` given a reachable source, and target `'blocked'` given an all-unreachable
      one — the guard declines both, since neither `'open'` nor `'blocked'` lists
      `'generation-failed'` as an allowed prior) — in every one of these four cases, asserts the
      response is `201`, not `409`, with `status` correctly unchanged from what it was immediately
      before the request, and confirms the submitted source(s) are actually persisted (re-read via
      `getInvestigation`/`getInvestigationWorkspace` after the call) — real seeded rows and real DB
      calls for each case, not mocked.
- [ ] **Genuine concurrent-conflict test (409, a real race, not simulated)**: two real, concurrently
      issued `POST /api/investigations` requests against the same `'blocked'` Investigation, each
      adding a now-reachable source, interleaved via a real DB-level or test-harness synchronization
      point (not a mocked race) so that the first request's transition to `'open'` commits between
      the second request's own step-2 pre-mutation read (still `'blocked'`) and its own transition
      attempt: the second request's transition is guard-declined (current status is now `'open'`,
      which `ALLOWED_PRIOR_STATUSES.open` does not list as an allowed prior for a repeat `'open'`
      target), and because its freshly-read post-decline status (`'open'`) diverges from its own
      step-2 read (`'blocked'`), it is asserted to respond `409
      CreateInvestigationTransitionConflictResponseBody` with the real, freshly-read `'open'`
      status — the one genuine same-request conflict case this design can produce.
- [ ] **Required regression (the exact bug the corrected design prevents)**: `POST
      /api/investigations` given an existing `investigationId` whose current, real status is
      `'brief-generated'` — adding a source does NOT call `transitionInvestigationStatus` at all
      (asserted directly, not merely inferred from the response), and the response's `status` field
      remains `'brief-generated'`, never reverting to `'open'`. Also assert the submitted source(s)
      are persisted regardless (sources are still added even though status does not change) —
      confirmed by re-reading `getInvestigation`/`getInvestigationWorkspace` after the call.
- [ ] `InvestigationWorkspaceScreen`: renders not-found state on 404; renders identity header with
      human-readable fields (never raw UUID as primary label) on 200.
- [ ] `AddSourceInline`: submitting a source from the Blocked panel calls the real, extended
      `POST /api/investigations` endpoint (not a mocked/fabricated success) and triggers a workspace
      re-fetch, not a navigation.
- [ ] Frank forge-gate: PASS.

**Browser Demonstration (required — real, rendered screen, real clicks, real persisted data):**
- Submit a source set that resolves entirely unreachable (real unreachable hosts, not mocked) via
  `StartInvestigationForm` on the Problem Department overview. Confirm the browser navigates to
  `/departments/problem-department/investigations/{id}` and the Blocked panel shows each source's
  real `failureReason`, observed on the actual rendered screen.
- From within that same workspace, use `AddSourceInline`'s real, rendered form to add a genuinely
  reachable source, clicking its real submit control. Confirm, without leaving the URL and observed
  on the rendered screen, the panel switches to Open/Eligible.
- Load the same workspace URL directly (paste into the address bar / reload) and confirm identical
  rendered content to the navigated-in view (US-1 AC1).
- Load a nonexistent `investigationId` and confirm the explicit not-found state, rendered on screen
  (US-1 AC4).
- From Mission Control and the Problem Department overview, click an existing Investigation's "Open
  current view" row (a real click on the rendered row) and confirm it lands on the new workspace
  route, not the legacy Express page.
- For an Investigation with real, pre-existing generation history, confirm the workspace screen
  itself renders correctly — without error, without a raw-JSON fallback, without silently dropping
  into a Blocked/empty-state treatment it does not belong in — on the actual rendered screen. This
  slice's own regions (Header, Outcome/Status Panel) do not yet render Research/Provenance content
  (`GenerationProgressPanel`/`ProvenanceRail` are C2-S3/C2-S4's own scope); this bullet's rendered-
  screen check is that the presence of real, non-empty generation history in the fetched view does
  not break or alter this slice's own rendered regions. Full provenance rendering, and its own
  dedicated rendered-screen verification that the data is not silently dropped, is C2-S4's own
  browser demonstration bullet, once `ProvenanceRail` exists to render it.

**Done When:**
- [ ] All tests above pass; Frank forge-gate PASS.
- [ ] All six browser demonstration bullets above are performed and observed against real
      persisted data.
- [ ] Stop point for Danny's product review: submitting sources lands in a durable workspace;
      Blocked recovery works in place via the real `AddSourceInline` component and the extended
      `POST /api/investigations` route; direct URL/reload/not-found all behave correctly; both
      updated call sites route to the new screen; pre-existing generation history (if any) renders
      honestly with its full real provenance fields. **US-5 AC3 is NOT claimed complete by this
      slice alone — see C2-S3.**

---

## C2-S3 — Generation Run Connector (Non-Blocking Start), Honest In-Progress / Stale-Interrupted Disclosure, Blocked-Retry Fix, Generation-Failed, Evidence-Driven Eligibility Mechanism (US-13, mechanism)

**Goal:** A real generation request can be issued from the browser and the connector responds the
instant the concurrency-guarding `GenerationRun` row exists — NOT after the full pipeline
completes (**Finding 1**) — so honest polling can genuinely observe a real in-progress run before
generation finishes; a genuinely stalled or interrupted run is detected and disclosed as a distinct
state, never silently indistinguishable from a healthy one (**Finding 8**); a Generation-Failed run
can be retried; the Blocked-recovery path delivered in C2-S2 now actually re-triggers real
generation (US-8, and — jointly with C2-S2 — the full clickable demonstration of US-5 AC3, per
G12); and the revised, tightened Generation Eligibility Rule's evidence-gated `'brief-generated'`
branch (US-13) is built against `hasEligibleNewEvidenceSinceCurrentBriefVersion` (**Finding 5** —
replacing the prior draft's bare timestamp comparison with the real
resolution-status/consumed-evidence check) and independently service-tested against a real
`BriefVersion` this slice's own demonstration produces. This slice also owns the real-run
measurement Danny's binding ruling requires before `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` are
derived (`01-REQUIREMENTS.md` Non-Functional Requirements, `02-ARCHITECTURE.md` §4.9) — this is the
first slice at which a real generation run, with real persisted-step timing, exists to measure.

**Depends On:** C2-S2 (workspace screen, route, and the extended `POST /api/investigations`
Add-Source Connector must exist to host the trigger control, progress panel, and the G12 joint
demonstration).

**Satisfies:** US-3 (all ACs), US-4 (all ACs, including the stale/interrupted AC — Finding 8), US-5
(**AC3 completed jointly with C2-S2 — see below, this is the first and only slice whose own
Done-When claims AC3, and only because it completes the integrated demonstration together with
C2-S2's mechanism, per Danny's G12 resolution**), US-6 (all ACs), US-8 (all ACs), US-13 (mechanism
only — AC2's tightened eligibility gate and AC3's `supersedesVersionId` contract, service-level;
AC1's UI affordance, AC4/AC5's supersession/decision-retrievability, and the full five-item browser
demonstration are C2-S4/C2-S5's scope).

**Files:**
- `src/services/generateBriefVersion.ts` — edit: add one new, optional, additive parameter,
  `onRunCreated?: (generationRun: GenerationRun) => void` (**Finding 1**, `02-ARCHITECTURE.md`
  §1.3), invoked synchronously immediately after Phase 1's `createGenerationRun` call succeeds,
  before Phase 2 begins. Zero effect on any caller that omits the parameter. No other line of this
  file changes — no pipeline phase, prompt, extraction, analysis, or recommendation logic is
  touched (Out of Scope, unchanged).
- `src/db/migrations/009_generation_run_investigation_in_progress_unique.sql` (new — exact SQL per
  `02-ARCHITECTURE.md` §3.5).
- `src/web/apiRoutes.ts` — new route: `POST /api/investigations/:id/generation-runs` (**Finding
  11b confirmed: this is a POST route; no GET/POST heading mismatch found for this route in this
  document**), plus the `createGenerationRunForInvestigation` orchestration function (§4.2,
  **revised, Finding 1**) as an independently unit-testable, non-HTTP-coupled function that:
  - attaches a FIRST `.catch()` to `pipeline` immediately after invoking `generateBriefVersion`
    (§4.2 step 5) — the synchronization catch — whose sole job is to relay a pre-Phase-1 rejection
    into `runCreated`'s reject path so the `try`/`catch` around `await runCreated`, immediately
    below, can respond to the client synchronously; this handler MUST NOT reference `generationRun`
    (it can run at a point where that binding does not yet exist) and MUST NOT write a terminal
    record; for every rejection after Phase 1 it is a no-op, since `runCreated` has already resolved
    by the time such a rejection reaches it (standard promise semantics);
  - creates `isUniqueViolation(err: unknown, constraintName: string): boolean` (**new helper this
    slice creates — no equivalent exists in `src/` today**, §4.2 step 5) — checks that `err` is a
    Postgres error whose `code` property is `'23505'` AND whose `constraint` property equals
    `constraintName`; its sole caller is the `try`/`catch` around `await runCreated`, where it
    discriminates the concurrency-guard's own conflict (mapped to `409`) from a genuinely
    unexpected pre-Phase-1 failure (rethrown, `500`);
  - races an `onRunCreated`-resolved promise against the pipeline's own rejection (via the
    synchronization catch above), so a genuine `409` concurrency conflict (thrown before
    `onRunCreated` ever fires) is still caught and reported synchronously;
  - returns `202 { generationRunId }` the INSTANT that race resolves via `onRunCreated` — never
    after `generateBriefVersion`'s full result;
  - no longer catches or maps `BriefGenerationFailedError`/`InvalidSupersedeTargetError`/
    `StaleCorrectionConflictError` itself, since the response is sent before the pipeline can
    reject with any of them — those three outcomes are observed later, exclusively via
    `GET .../workspace`'s `latestGenerationRun.outcome === 'failed'` and its steps' real recorded
    `error` text (§4.2 step 7, unchanged US-3 AC6 guarantee, relocated mechanism);
  - implements step 2's revised, tightened Generation Eligibility Rule (§4.2) in full, including the
    `'brief-generated'` branch gated on `hasEligibleNewEvidenceSinceCurrentBriefVersion` (US-13 AC2)
    and the distinct 422 `reason` string for "no new evidence" vs. `'blocked'` ineligibility;
  - attaches a SECOND, separate `.catch()` to `pipeline` — **step 5b's finalization safety net
    (`02-ARCHITECTURE.md` §4.2 step 5b, corrected 2026-08-24 per §1.3's re-verification)** — only
    after `generationRun = await runCreated` has resolved successfully, so it structurally can never
    fire before `generationRun` is assigned and can never observe a pre-Phase-1 rejection (those are
    already fully handled by the synchronization catch and the `try`/`catch` above, which already
    returned a `409` response or rethrew a `500` before this second catch is even attached): this
    handler distinguishes typed errors (`BriefGenerationFailedError`/`InvalidSupersedeTargetError`/
    `StaleCorrectionConflictError` — already finalized by `generateBriefVersion` itself, log only)
    from an untyped/unexpected rejection (finalization itself failed — `finalizeGenerationRun`/
    `attemptGenerationFailedTransition`/`client.release()` threw while already inside a catch
    block), and only in the second case itself writes a terminal `outcome: 'failed'`
    `GenerationStep`/`GenerationRun` for the run — `recordGenerationStep` called BEFORE
    `finalizeGenerationRun` (binding ordering, §4.2 step 5b), re-reading current state first, not
    assuming `in-progress` — before logging.
- `src/services/getInvestigationWorkspace.ts` — edit:
  (a) extend `generationEligible`'s computation to also treat `'generation-failed'` as an eligible
  status (retry, US-6 AC3);
  (b) add `hasEligibleNewEvidenceSinceCurrentBriefVersion(investigationId)` (**renamed from
  `hasNewEvidenceSinceCurrentBriefVersion`, Finding 5**, §4.8) — querying
  `source_artifact.resolution_status` (excludes unreachable/unresolved/empty in one column check)
  and cross-referencing the evidence actually consumed by the current `BriefVersion` via the
  existing `evidence_item`/`claim_version_evidence`/`claim_version_ids` chain (excludes
  duplicate-of-consumed, string-equality on trimmed `raw`) — no new column, no new table, no
  coupling to `submitSources`/`resolveInvestigationSources`; wired into
  `InvestigationWorkspaceView.newEvidenceSinceCurrentBriefVersion` and into `generationEligible`'s
  `'brief-generated'` branch;
  (c) exercise `computeLivenessState` (defined structurally in C2-S2) against real in-progress and
  stale runs for the first time this slice can produce one.
- `src/client/screens/InvestigationWorkspaceScreen.tsx` — edit: add polling `useEffect` keyed on
  `workspace.latestGenerationRun?.livenessState === 'active'` (**Finding 8 — revised from a bare
  `outcome === 'in-progress'` check**, polling at an interval governed by `POLL_INTERVAL_MS` —
  engineering-owned, derived during THIS slice's implementation from real measured generation
  timing, expected concurrency, and endpoint cost, per `02-ARCHITECTURE.md` §4.9's derivation
  methodology; no specific value is asserted here — see Implementation Notes below for the
  derivation requirement); clears on transition to `'terminal'` OR `'stale-or-interrupted'`.
- `src/client/components/OutcomeStatusPanel/OpenEligiblePanel.tsx` — edit (created C2-S2): adds the
  shared `GenerateButton` component, enabled iff `workspace.generationEligible === true`, labeled
  "Start generation" when hosted here.
- `src/client/components/OutcomeStatusPanel/GenerationProgressPanel.tsx` (new) — persisted-steps
  list including real per-step `modelIdentifier`/`validationRecords`/`toolInvocations` and the run's
  real `webSearchQueries` array (**Finding 2 rendering** — these fields exist in the read model
  since C2-S2; this is the first slice to render them); fixed honest-gap sentence when
  `livenessState === 'active'`; **a distinct, visually-non-identical stale/interrupted disclosure
  (Finding 8) when `livenessState === 'stale-or-interrupted'`** — "This run has not reported
  progress recently and may have been interrupted. No further automatic action is available here —
  this may require Forge or operations follow-up." No cancel/restart control (none exists
  server-side). Polling stops the instant `livenessState` transitions to `'stale-or-interrupted'`,
  same as on a terminal outcome. No percent/"currently executing"/"thinking" claim in either state.
- `src/client/components/OutcomeStatusPanel/GenerationFailedPanel.tsx` (new) — `statusReason`,
  failed run's persisted steps (including Finding 2's fields), the shared `GenerateButton` hosted
  here, labeled "Retry generation," enabled per the same server-computed `generationEligible` —
  `'generation-failed'` is an eligible status per §4.2 — and, per `03-UI-SPEC.md`'s Component
  Hierarchy (the Generation-Failed retry mount point), a second real, rendered instance of
  `AddSourceInline` (reused unmodified from C2-S2) for adding new source evidence before retrying.
- `src/client/api.ts` — add `createGenerationRun`.

**Implementation Notes:**
- Concurrency guard is the migration's partial unique index + `INSERT` failure mapped to `409` — no
  check-then-act race (§4.2 step 5).
- `supersedesVersionId` and `runtimeIdentifier` are determined server-side only — no client-supplied
  flag for either.
- **Two separate `.catch()` handlers are attached to `pipeline`, at two different points in the
  connector, not one (`02-ARCHITECTURE.md` §4.2 steps 5/5b, corrected 2026-08-24)**: the FIRST is
  attached immediately after `generateBriefVersion` is invoked (step 5) and exists purely to relay a
  pre-Phase-1 rejection into `runCreated` for the synchronous `try`/`catch` below — it never
  references `generationRun` and never writes a terminal record. The SECOND is attached separately,
  only after `generationRun = await runCreated` has resolved successfully (step 5b) — it exists for
  Node process hygiene (preventing an unhandled-rejection crash on the now-un-awaited `pipeline`)
  AND as the finalization safety net: for the ordinary case (success or any of the three typed
  failures), `generateBriefVersion` has already durably finalized its own `GenerationRun`/
  `GenerationStep` row by the time this handler runs (§1.3, confirmed against
  `generateBriefVersion.ts:290-714`'s existing "finalizes exactly once before rethrowing"
  guarantee) and this handler only logs; but if `finalizeGenerationRun`/
  `attemptGenerationFailedTransition`/`client.release()` itself threw — a meta-failure of the
  finalization write path, the one class of post-Phase-1 rejection §1.3's re-verification found
  `generateBriefVersion` cannot finalize on its own — this second handler is the last-resort
  persistence path for that one case only, never for the ordinary case, and never reachable by the
  first handler (which is structurally incapable of dereferencing `generationRun`).
- This is still "no queue/worker/background-job abstraction" (Out of Scope, unchanged) — same Node
  process, same function call, just not blocking the HTTP response on full resolution.
- This connector does not call `transitionInvestigationStatus` itself — `generateBriefVersion`
  already owns every transition it needs.
- **`POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` are engineering-owned, derived during THIS slice's
  own implementation, not asserted as numbers anywhere in this roadmap** (`02-ARCHITECTURE.md` §4.9,
  Danny's binding ruling — how often to poll and how long silence must persist before a run is
  disclosed as stale are questions about observed system behavior, not product decisions Danny is
  positioned to ratify by inspection at spec time). Before this slice's own Done-When can be marked
  complete, Forge must: (1) run real generation end-to-end and record actual elapsed time per
  `GenerationStep` and per full run — the same real-pipeline measurement `01-REQUIREMENTS.md`'s
  Non-Functional Requirements section requires; (2) report the measured evidence: observed request
  rate against the workspace endpoint, observed gaps between persisted-progress updates, the longest
  legitimate silence observed during a healthy run (time between one `GenerationStep` persisting and
  the next, or between run-start and the first step), and the observed behavior of the
  stale/interrupted warning against that measurement; (3) from that measured distribution, set
  `STALE_THRESHOLD_MS` to the measured legitimate-processing time (a conservative percentile of
  observed step/run latency, not the minimum or the average) plus an explicit safety margin stated
  as a ratio or fixed addition, and set `POLL_INTERVAL_MS` from the same measurement plus expected
  concurrency and endpoint cost — per §4.9's full derivation methodology; (4) record the derived
  values, the measured inputs they were computed from, and the safety-margin arithmetic as code
  comments directly next to `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` in their implementation
  file — not in a separate tracking artifact — per Danny's explicit instruction on where
  derived-constant evidence belongs. If measurement later shows either value needs revision, only
  that one constant and its comment change — no other mechanism in this slice depends on its
  specific magnitude.
- Eligibility is the single, revised rule in `02-ARCHITECTURE.md` §4.2 step 2 — the client never
  re-derives it; `generationEligible` is always read from the server response.
- `hasEligibleNewEvidenceSinceCurrentBriefVersion` never calls `assignValidityState` and appends no
  `StatusEvent` — no dependency on `validityState.ts` (built starting C2-S4) is introduced.
- `GenerateButton` is one component with one behavioral contract; its rendered label is
  context-determined — `OpenEligiblePanel` → "Start generation," `GenerationFailedPanel` → "Retry
  generation." A third label state (correction) is added when `BriefGeneratedSummaryPanel` is built
  in C2-S4.
- **G12 (Danny's binding resolution) — US-5 AC3 joint completion, half 2 of 2.** This slice supplies
  the other half of AC3: the real, clickable `GenerateButton` in `OpenEligiblePanel`, and this is
  the FIRST slice at which the complete AC3 chain — real add-source (C2-S2) → real re-resolution →
  real status returns to `'open'` → real click on a real trigger control → real generation request →
  honest progress to a terminal outcome — can be demonstrated end to end in one continuous browser
  session. Accordingly, and only accordingly, this slice's own Done-When is the one place in this
  roadmap that claims US-5 AC3 complete — it does so via the integrated test and browser
  demonstration below, not via this slice's code in isolation; C2-S2's own mechanism remains a
  necessary, explicitly cross-referenced precondition, not restated or reproduced here.

**Tests:**
- [ ] **Required, per `01-REQUIREMENTS.md`'s Non-Functional Requirements and `02-ARCHITECTURE.md`
      §4.9's derivation methodology**: Forge measures real generation runs during this slice's own
      implementation and reports observed request rate against the workspace endpoint, observed gaps
      between persisted-progress updates, the longest legitimate silence observed during a healthy
      run, and the observed behavior of the stale/interrupted warning against that measurement;
      `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` are derived from this evidence, with the
      derivation — the measured inputs and the safety-margin arithmetic — recorded as code comments
      next to the constants in their implementation file (not a separate tracking artifact) before
      this slice's own Done-When can be marked complete.
- [ ] `createGenerationRunForInvestigation`: not-found, ineligible (`blocked`), and a genuine
      concurrent-request test asserting the second request gets `409` via the real DB constraint —
      the promise-race mechanism, not a mocked race.
- [ ] **New, required by Finding 1**: an integration test that issues `POST
      .../generation-runs` against a real Investigation whose `generateBriefVersion` pipeline is
      made observably slow (e.g. a test-only delay hook or a multi-step real generation), asserts
      the `POST` resolves `202` BEFORE the pipeline itself reaches a terminal outcome, and then
      asserts an immediate `GET .../workspace` call in the same test returns
      `latestGenerationRun.outcome === 'in-progress'` while the pipeline is still running — this is
      the service-level proof that the response genuinely does not block on full completion.
- [ ] **New, required — synchronization catch (`02-ARCHITECTURE.md` §4.2 step 5, corrected
      2026-08-24)**: a real, direct concurrency-conflict case (two real concurrent
      `POST .../generation-runs` requests against the same Investigation, the second's `INSERT`
      genuinely rejected by the real partial unique index) is asserted to be caught by the FIRST
      `.catch()` and mapped to `409` via `isUniqueViolation`, entirely before `generationRun` is ever
      assigned — confirmed by asserting no `GenerationStep`/`GenerationRun` write is attempted by
      this handler itself for that request (it only relays the rejection into `runCreated`).
- [ ] **New, required — finalization safety net (`02-ARCHITECTURE.md` §4.2 step 5b, corrected
      2026-08-24)**: a test double/injection point forces `finalizeGenerationRun` (or
      `attemptGenerationFailedTransition`) to throw during a real `generateBriefVersion` run,
      already inside one of its own catch/failRun blocks, AFTER a real `GenerationRun` row already
      exists (i.e. after `onRunCreated` has already fired and `generationRun` is genuinely assigned
      on the connector side) — a genuine meta-failure of the finalization write path itself, distinct
      from an ordinary business-logic/DB error — and asserts the connector's own SECOND
      `pipeline.catch()` handler (§4.2 step 5b) recognizes this rejection is NOT one of the three
      typed errors (`BriefGenerationFailedError`/`InvalidSupersedeTargetError`/
      `StaleCorrectionConflictError`), re-reads the run's current state, and itself writes a terminal
      `outcome: 'failed'` `GenerationStep`/`GenerationRun` for `generationRun.id` before logging —
      confirmed by a real, direct row-read after the test that the run is NOT left permanently
      `'in-progress'` with no terminal record. The same test additionally asserts WRITE ORDER: the
      terminal `GenerationStep` insert's timestamp/call-order precedes `finalizeGenerationRun`'s call
      (record-step-before-finalize — `02-ARCHITECTURE.md` §4.2 step 5b, binding constraint 10) —
      via a spy/mock on both calls asserting invocation order, or an equivalent mechanism. A paired assertion in the same test suite confirms the
      ordinary case is unchanged: when the rejection reaching the second `.catch()` IS one of the
      three typed errors, the handler performs no second write for that run (asserted directly
      against the real row — e.g. no additional `GenerationStep` inserted, no second finalization
      timestamp), since `generateBriefVersion` already finalized it.
- [ ] `createGenerationRunForInvestigation`: given a real `'brief-generated'` Investigation (this
      slice's own demonstration produces one) with no source added since the current `BriefVersion`,
      the request is rejected `422` with a `reason` naming "no new evidence," distinct in message
      from the `'blocked'` `422`; given a genuinely new, usable, not-already-consumed source, the
      same request is accepted and `supersedesVersionId` is set to the current
      `ProblemBrief.currentVersionId` (US-13 AC2, AC3, service-level, real DB rows).
- [ ] `hasEligibleNewEvidenceSinceCurrentBriefVersion` (Finding 5): `false` when no `ProblemBrief`
      exists yet; `false` for a source whose `resolution_status` is `unreachable` or not yet
      resolved; `false` for a `reachable-no-content` (empty) source; `false` for a source whose
      (trimmed) `raw` duplicates a source already consumed by the current `BriefVersion`'s evidence
      chain, even as a distinct `Source` row; `true` given a real, genuinely new, `content-retrieved`
      source not already consumed — real seeded rows against real tables, not mocked.
- [ ] `getInvestigationWorkspace`: `generationRuns`/`latestGenerationRun`/`generationEligible`
      correctly reflect a real in-progress, succeeded, and failed run each; a `'generation-failed'`
      Investigation reports `generationEligible: true`; a `'brief-generated'` Investigation's
      `generationEligible` and `newEvidenceSinceCurrentBriefVersion` both track the helper's real
      result; `livenessState` is `'active'` for a real, recently-progressing in-progress run and
      `'stale-or-interrupted'` for a real in-progress run directly seeded with a stale
      `startedAt`/last-step-completion beyond the derived `STALE_THRESHOLD_MS` (Finding 8, real
      seeded rows).
- [ ] `GenerationProgressPanel`: renders exactly the persisted `steps` array including real
      `validationRecords`/`toolInvocations`; renders the run's `webSearchQueries`; renders the fixed
      gap sentence when `livenessState === 'active'`; renders the distinct, differently-styled
      stale/interrupted disclosure when `livenessState === 'stale-or-interrupted'`, with no
      cancel/restart control rendered in either case; never renders a percent or "currently
      executing" claim beyond the last row.
- [ ] Polling: integration/component test asserts no further fetch after a terminal `outcome` AND
      no further fetch after a transition to `'stale-or-interrupted'` — two distinct assertions.
- [ ] `GenerateButton`: renders labeled "Start generation" in `OpenEligiblePanel` and "Retry
      generation" in `GenerationFailedPanel`, for the same underlying component.
- [ ] **G12 integrated test (US-5 AC3)**: Blocked → real `AddSourceInline` submission (C2-S2's real
      connector) → `status` returns to `'open'` → real `POST .../generation-runs` accepted → run
      progresses to a terminal outcome — the full path, exercised as one continuous test, not a
      partial mock, and not split across two separate per-slice tests that individually assert only
      half the chain.
- [ ] Frank forge-gate: PASS.

**Browser Demonstration (required — real, rendered screen, real clicks, real persisted data; no
API-response-only step stands in for a browser demonstration — Finding 11c, swept and corrected
below):**
- From an eligible Open workspace (from C2-S1/C2-S2's real resolved source), click the real,
  rendered "Start generation" control. **Confirm, by watching the actual rendered screen through at
  least one poll tick, that a real in-progress run — with real persisted steps, not a placeholder —
  is visible BEFORE the run reaches its terminal outcome** (the live, browser-observed proof of
  Finding 1's non-blocking start — the response returning before completion is not merely inferred
  from network tooling, it is observed as a genuinely different, real screen state that renders and
  is visible for a real interval before the terminal state replaces it). Confirm the panel shows
  only persisted steps and the fixed honest-gap sentence — no percent, no "currently executing," no
  "thinking" copy. Confirm polling stops the moment the run reaches success or failure.
- Trigger a second generation request while the first is still in-progress (e.g. a second browser
  tab, a real click on its own rendered "Start generation" control) and confirm the UI surfaces the
  `409` inline, naming the reason, with no duplicate run created.
- **Stale/interrupted disclosure (Finding 8)**: using a real in-progress `GenerationRun` seeded (via
  this slice's own test/Forge-verification harness) with no step progress beyond the derived
  `STALE_THRESHOLD_MS`, load or reload the workspace in the browser and confirm the rendered screen
  shows the distinct stale/interrupted disclosure — not the ordinary in-progress rendering — and
  confirm, by observing the rendered screen over a further real interval, that no further visible
  state change/poll-driven update occurs (polling has genuinely stopped).
- Reach a genuine Generation-Failed outcome (a real failure condition, not simulated) and confirm
  `statusReason` and the failed run's steps render on screen; click the real "Retry generation"
  control and confirm a new, separate `GenerationRun` is created and the prior failed run remains
  visible.
- **G12 — full US-5 AC3 / US-8 path live**: from a genuinely Blocked Investigation, use the real,
  rendered `AddSourceInline` form to add a reachable source, confirm status returns to `'open'` on
  the rendered screen, click the real "Start generation" control, and watch it progress to a
  terminal outcome — all in the same workspace URL, no restart, entirely through real clicks on the
  real rendered surface. This single demonstration is what satisfies US-5 AC3 for this checkpoint —
  neither this bullet's constituent halves nor any other slice's demonstration substitutes for it.

**Service-Level Verification (not a browser demonstration — no clickable UI exists yet for this
check; Finding 9's audit discipline requires this be stated honestly rather than counted among the
Browser Demonstration bullets above; `BriefGeneratedSummaryPanel`, where the US-13 UI affordance
becomes browser-demonstrable, is C2-S4's own scope):**
- **US-13 mechanism check**: once a real generation run from this same demonstration succeeds and
  the Investigation is `'brief-generated'`, this slice's own service-level tests above (not a
  browser step) are the proof that a direct `createGenerationRunForInvestigation` call against it,
  with no new source added, is rejected with the "no new evidence" reason.

**Done When:**
- [ ] All tests above pass; Frank forge-gate PASS.
- [ ] All five browser demonstration bullets above are performed and observed against real
      persisted data, and the service-level US-13 mechanism check above is confirmed by its listed
      tests.
- [ ] The real-run measurement and `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` derivation described in
      Implementation Notes and Tests above are complete, with the derived values and their measured
      evidence recorded as code comments next to the constants.
- [ ] Stop point for Danny's product review: a real generation run can be triggered and its
      genuinely non-blocking start is visible in the browser; the run can be watched honestly,
      retried after failure, and disclosed distinctly if stale/interrupted; **the full Blocked →
      reachable source → eligible → triggered → terminal-outcome path (US-5 AC3, US-8) works
      end-to-end from the browser and is claimed complete by this slice jointly with C2-S2, per
      G12**; and the evidence-gated correction eligibility rule is confirmed real at the service
      level against a live `'brief-generated'` Investigation (its UI affordance follows in C2-S4).

---

## C2-S4 — Brief Review (Read Service, Panel, Provenance Rail Rendering), Version-Numbered Brief Navigation (US-1 AC5), `StatusEvent` Schema/Read Queries with Sequence Tiebreak (US-12, read-side), Evidence-Driven Correction UI (US-13)

**Goal:** The complete, real Problem Brief — all seven required elements, evidence, provenance
(rendering Finding 2's real `validationRecords`/`toolInvocations`/`webSearchQueries` fields), and
honesty notices — renders in the workspace once a generation has actually succeeded through the
browser; the operator can navigate directly to, and reload-stably view, one specific prior
`BriefVersion` via a human-readable version number (**Finding 3** — the `.../versions/:versionNumber`
route, never a raw `BriefVersion` UUID); assigned validity state and supersession are answered by
real bitemporal queries, ordered deterministically via `StatusEvent.sequence` (**Finding 7, read
half**) rather than a hardcoded fallback; and adding new evidence to a `'brief-generated'`
Investigation from the workspace becomes a real, clickable path to a correcting generation run.

**Depends On:** C2-S3 (a real `BriefVersion` must exist, produced by a browser-triggered generation
run, before there is anything to read; the evidence-gated eligibility mechanism must already exist
for this slice's UI affordance to be meaningful).

**Satisfies:** US-1 AC5 (new — Finding 3), US-9 (all ACs), US-12 (read-side only: `StatusEvent`
schema including `sequence`, `getAssignedState`, `getAssignedStateAsRecorded`, and their wiring into
`getBriefForReview`/`getInvestigationWorkspace` — `assignValidityState` itself and the
`DecisionHistoryBanner` are C2-S5's scope), US-13 (AC1's UI affordance; AC4's
new-`BriefVersion`-becomes-current and prior-version-preserved behavior, now browser-demonstrable
via the real versioned route this slice builds — AC5's decision-retrievability half, and the full
five-item demonstration, remain C2-S5's scope).

**Files:**
- `src/types/domain.ts` — add `StatusEvent` (with `sequence: number`, **Finding 7**),
  `AssignedValidityState` (§3.6, US-12) — schema reused verbatim from
  `problem-department-mvp/02-ARCHITECTURE.md`, restated in full in `02-ARCHITECTURE.md` §3.6.
- `src/db/migrations/011_status_event.sql` (new — exact SQL per `02-ARCHITECTURE.md` §3.6,
  **including the `sequence BIGSERIAL` deterministic-insertion-order tiebreak column and its
  matching index `(target_type, target_id, effective_at DESC, recorded_at DESC, sequence DESC)`,
  Finding 7**, and the `reject_update_or_delete()` immutability trigger; no mutable
  `status`/`validity` column added to `claim`, `claim_version`, or `brief_version`; `target_id`
  intentionally carries no FK — polymorphic target, enforced in application code, not schema).
- `src/services/validityState.ts` (new) — `getAssignedState` and `getAssignedStateAsRecorded` only,
  per `02-ARCHITECTURE.md` §4.7's two query contracts, **both using `ORDER BY effective_at DESC,
  recorded_at DESC, sequence DESC LIMIT 1` as their "latest" resolution (Finding 7)** — the
  `sequence` column is the deterministic tiebreak when two `StatusEvent`s share identical
  `effective_at` AND `recorded_at`. This slice does NOT build `assignValidityState` — the writer,
  and its own write-time `InvalidValidityTargetError` validation (Finding 7, write half), move to
  C2-S5, the first slice with `getDecisionsForBriefVersion` available for the writer's
  dependent-decision reconstruction step; this file is edited again, not recreated, in C2-S5.
- `src/services/getBriefForReview.ts` (new) — exact contract per `02-ARCHITECTURE.md` §3.3/§4's
  pointer to `problem-department-mvp/02-ARCHITECTURE.md` §4 (unchanged shape); `assignedState` now
  resolves via a real, unconditional call to `getAssignedState({ targetType: 'brief-version' | 
  'claim-version', targetId })` (§4.7 "Read-side wiring") — the query is real as of this slice, and
  correctly still resolves `'valid'` for every target given the zero `StatusEvent` rows this
  checkpoint's own surface can produce (no browser-reachable writer — Out of Scope), which is
  `getAssignedState`'s own documented no-rows fallback, not a special case coded here.
- `src/web/apiRoutes.ts` — new route: **`GET
  /api/investigations/:investigationId/brief-versions/by-version/:versionNumber`** (**Finding 3,
  corrected route shape — addressed by a human-readable, positive-integer version number, NEVER a
  raw `BriefVersion` UUID**, exact contract per `02-ARCHITECTURE.md` §3.1a): parses `versionNumber`
  as a positive integer (400 `invalid-version-number` before any DB lookup); resolves
  `getInvestigation(investigationId)` (404 `investigation-not-found` if none); looks up
  `SELECT id FROM brief_version WHERE problem_brief_id = $1 AND version_number = $2` (404
  `brief-version-not-found` if none); 200 body is `GetBriefForReviewResult` verbatim (no wrapper
  object) via `getBriefForReview` on the resolved internal id — that internal id is used only as a
  service-call parameter, never placed in a URL or rendered as the navigable reference.
- `src/services/getInvestigationWorkspace.ts` — edit: add step 3 of §4.4 (real `brief_version` query
  populating `briefs`, deferred from C2-S2/C2-S3), including per `BriefVersion`: `assignedState` via
  `getAssignedState({ targetType: 'brief-version', targetId: briefVersion.id })` and `isSuperseded`
  via the same structural check `getBriefForReview` uses.
- `src/client/App.tsx` — edit: add the SECOND `<Route>` (**Finding 3**, §5.1):
  `/departments/problem-department/investigations/:investigationId/versions/:versionNumber` —
  renders the SAME `InvestigationWorkspaceScreen` component as the first route; the version param is
  read via `useParams`, never derived from in-memory navigation history, so the URL alone is
  reload-stable.
- `src/client/screens/InvestigationWorkspaceScreen.tsx` — edit: fetch `getBriefForReview` once a
  target version is known — the routed `:versionNumber` when present, or `workspace.briefs`'
  `isCurrent: true` entry's own `versionNumber` when absent (not on every poll tick, and not
  re-fetched for identity/sources/runs, which are version-independent); add regions 3-4 rendering,
  including Finding 2's `validationRecords`/`toolInvocations`/`webSearchQueries` fields in the
  Provenance Rail; render the header's "Version N of M" / "(current)" / back-to-current-version
  indicator once ≥1 `BriefVersion` exists (Finding 11 header disclosure); render an explicit
  "Version N does not exist for this Investigation" state (regions 1-2 still render) when the
  routed `versionNumber`'s brief fetch 404s while the Investigation itself resolves.
- `src/client/components/OutcomeStatusPanel/BriefGeneratedSummaryPanel.tsx` (new) — compact
  confirmation + anchor-scroll link to region 3; renders only for the CURRENT version (correction
  always targets `ProblemBrief.currentVersionId`); **also hosts, per US-13 AC1**, `AddSourceInline`
  (reused unmodified from C2-S2) for resubmitting new source evidence, and the shared
  `GenerateButton` (built C2-S3), here rendering a third, real label state — "Regenerate with new
  evidence" — enabled iff `workspace.generationEligible` is `true` for this Investigation (which for
  this status requires `workspace.newEvidenceSinceCurrentBriefVersion === true`, per Finding 5's
  tightened rule) and disabled with an honest, specific reason string otherwise ("Add a new
  source to enable a corrected Brief."); after a successful `AddSourceInline` submission, the
  workspace re-fetch is what flips this control's enabled state — `AddSourceInline` itself never
  directly triggers a generation request.
- `src/client/components/BriefReviewPanel/` (new directory) — `ProblemDefinitionSection`,
  `ClaimsAndEvidenceSection`, `DemandEvidenceSection`, `PersonalPullSection`,
  `ExistingSolutionLandscapeSection`, `GapHypothesisSection`, `UncertaintySection`,
  `SystemRecommendationSection`, `NegativeFindingNotice`.
- `src/client/components/ProvenanceRail/` (new directory) — `EvidenceProvenanceList`,
  `SearchScopeNotice` (**Finding 2 — reads real `webSearchQueries[].scopeNote`/`limitations`**),
  `CitationScopeNotice`, `RunHistoryList` (**Finding 2 — renders each step's real
  `validationRecords`/`toolInvocations` and each run's real `webSearchQueries`, real field names,
  not a paraphrase**), `TechnicalDisclosurePanel` (collapsed by default — the one permitted
  exception).
- `src/client/api.ts` — add `fetchBriefForReviewByVersionNumber` (matches the corrected route name,
  Finding 3).

**Implementation Notes:**
- All seven elements and every Provenance Rail subsection except `TechnicalDisclosurePanel` render
  uncollapsed by default.
- Evidence stance is read from `ClaimVersionEvidenceRef`, never `EvidenceItem`.
- Demand confidence renders only as Insufficient/Emerging/Substantiated.
- `NegativeFindingNotice` renders for exactly the four negatable elements; Problem Definition never
  renders it.
- Reload of either route re-fetches the same target version and must render identical content
  (US-9's reload guarantee, extended by US-1 AC5 to prior versions).
- `status_event` starts empty this checkpoint (no browser-reachable writer) — `getAssignedState`
  correctly returns `'valid'` for every target this slice ever queries; this is the query's own
  documented no-rows behavior, exercised by a real (not mocked) call in this slice's tests.
- `BriefGeneratedSummaryPanel`'s `AddSourceInline`/`GenerateButton` hosting is the ONLY control this
  checkpoint that can make a `'brief-generated'` Investigation generation-eligible again.
- **Finding 3's version-numbered route is deliberately narrow**: it navigates to exactly one
  specific prior version via the current-vs-superseded pointer/lineage lookup — it is not a general
  "all versions" browser, index, or list (unchanged Out of Scope boundary).

**Tests:**
- [ ] `getAssignedState`/`getAssignedStateAsRecorded`: given zero `status_event` rows, both return
      `'valid'`; given a real, directly-seeded `StatusEvent` row, `getAssignedState` returns the
      seeded state for an `asOf` at/after its `effectiveAt`, and `'valid'` for an `asOf` before it;
      `getAssignedStateAsRecorded` additionally diverges correctly on `knownAsOf` given two seeded
      rows with different `recordedAt` values; **`sequence`-tiebreak test (Finding 7)**: given two
      real, directly-seeded `StatusEvent` rows for the same target with IDENTICAL `effectiveAt` AND
      `recordedAt`, both queries deterministically return the state of whichever row was inserted
      last (highest `sequence`) — asserted against real seeded rows, not a mocked ordering.
- [ ] `getBriefForReview`: resolves the full chain for a real generated Brief; `assignedState` is
      sourced from a real `getAssignedState` call (verified by seeding a non-`'valid'` `StatusEvent`
      row directly and confirming the response reflects it).
- [ ] `getInvestigationWorkspace`: `briefs[].assignedState`/`briefs[].isSuperseded` reflect real
      seeded `StatusEvent`/supersession state.
- [ ] `GET .../brief-versions/by-version/:versionNumber`: 400 for a non-numeric or non-positive
      `versionNumber`; 404 `investigation-not-found` for a nonexistent Investigation; 404
      `brief-version-not-found` for a real Investigation with no `BriefVersion` at that number; 200
      with the correctly-resolved `GetBriefForReviewResult` for a real `versionNumber` under a real
      `ProblemBrief` lineage with ≥2 versions (this slice's own live-correction demo below produces
      the second version needed for this test).
- [ ] Component tests: all seven sections render uncollapsed by default; `PersonalPullSection`
      renders structurally separate from Demand; `NegativeFindingNotice` renders for a real
      negative-finding row and never for Problem Definition; `SearchScopeNotice`/`CitationScopeNotice`
      always render, `SearchScopeNotice` reading real `webSearchQueries` fields; `RunHistoryList`
      renders real per-step `validationRecords`/`toolInvocations` and per-run `webSearchQueries`;
      `TechnicalDisclosurePanel` starts collapsed.
- [ ] `InvestigationWorkspaceScreen` with a `:versionNumber` route param: fetches and renders that
      specific prior version's own content, distinct from the current version's content, with the
      header's "Version N of M" indicator correctly reflecting the routed (non-current) version and
      a working link back to the current version.
- [ ] `BriefGeneratedSummaryPanel`: `GenerateButton` disabled with the honest reason string when
      `newEvidenceSinceCurrentBriefVersion` is `false`; enabled once a real source is added and the
      workspace re-fetch reflects `true` (component-level, wired to C2-S3's real service).
- [ ] Regression test for US-13 AC4: triggering a correction from a real `'brief-generated'`
      Investigation with new evidence produces a new `BriefVersion`, `ProblemBrief.currentVersionId`
      advances to it, and the prior `BriefVersion` remains independently retrievable both by its own
      id AND via `GET .../brief-versions/by-version/:priorVersionNumber` (Finding 3) after the new
      version exists.
- [ ] Frank forge-gate: PASS.

**Browser Demonstration (required — real, rendered screen, real clicks, real persisted data):**
- From a workspace with a real, browser-completed generation run (produced in C2-S3's demonstration
  or a fresh one), confirm the Brief-Generated summary panel appears, and clicking its real link
  scrolls to a fully rendered, uncollapsed Complete Brief Review with all seven elements populated
  from real generated content.
- Confirm the Provenance Rail shows real evidence excerpts/sources/stance, the real
  `SearchScopeNotice` queries performed, the fixed `CitationScopeNotice`, and per-run
  runtime/model/step data — including real `validationRecords`/`toolInvocations`/`webSearchQueries`
  (Finding 2) — for every run (not only the latest), all observed on the rendered screen.
- Expand the Technical Disclosure control (a real click) and confirm it was collapsed by default and
  now shows real raw validation detail.
- Reload the workspace and confirm the same Brief content renders identically.
- **US-13 live** (produces the second `BriefVersion` this slice's own version-navigation
  demonstration below depends on): from the same `'brief-generated'` workspace, confirm
  `BriefGeneratedSummaryPanel`'s correction control is disabled with an honest reason, rendered on
  screen. Use the real, rendered `AddSourceInline` to add a genuinely new source. Confirm, without
  leaving the URL and observed on the rendered screen, the control becomes enabled. Click it (a real
  click), confirm a new generation run progresses honestly to success, and confirm the new
  `BriefVersion` is reviewable while the prior `BriefVersion` remains reachable.
- **Version-numbered navigation (required, Finding 3)**: from the now-current (second) `BriefVersion`'s
  view, follow the real, rendered supersession/prior-version reference (or navigate directly by
  typing the versioned URL, e.g. `.../versions/1`, into the browser address bar) to the FIRST
  `BriefVersion`'s own view. Confirm, on the rendered screen, that the FIRST version's own content
  renders — not the current version's content re-labeled — and that the header clearly discloses
  "Version 1 of 2." **Reload this exact versioned URL** and confirm it re-renders the identical
  first-version content, not the current version (the binding reload-stability requirement). Follow
  the real "back to current version" link and confirm it lands on the current version's own view.

**Done When:**
- [ ] All tests above pass; Frank forge-gate PASS.
- [ ] All six browser demonstration bullets above are performed and observed against real persisted
      data.
- [ ] Stop point for Danny's product review: a real, complete Brief is reviewable in the browser
      with nothing required collapsed by default and its full real provenance fields rendered;
      survives reload identically; assigned validity state is answered by a real, deterministically-
      ordered bitemporal query; an evidence-driven correction can be triggered live and produces a
      real, independently-reviewable new Brief version without discarding the prior one; and a
      specific prior `BriefVersion` can be reached and reload-stably viewed via its own
      human-readable version number, never a raw UUID.

---

## C2-S5 — Decision Recording and History (`decisionLineage`/`priorDecisions` Split), `assignValidityState` with Write-Time Target Validation, `DecisionHistoryBanner`, US-13 Closing Regression

**Goal:** Approve, Reject, and Watch decisions can be recorded against the exact reviewed Brief
version from the browser, persist durably, and appear in two requirements-distinct chronological
views — a per-version `priorDecisions` list and a whole-Investigation `decisionLineage` (**Finding
6**, each `decisionLineage` entry labeled by its own version number, every reconsideration
condition rendered as resolved text, never a bare id) — both surviving reload; the
validity/invalidation write path (`assignValidityState`) is real, service-tested, and validates its
target's existence and type BEFORE ever writing a `StatusEvent` (**Finding 7, write half**); the
workspace's decision-history surface renders real non-`'valid'` assigned state and real
supersession, not simulated; and US-13's full five-item corrective-generation path — including a
pre-existing Decision that survives the correction untouched, verified via the real versioned
navigation route (Finding 3) — is demonstrated live, closing out both restored scopes.

**Depends On:** C2-S4 (a rendered `briefVersionId`, and the version-numbered navigation route
Finding 3 built, must exist; `assignValidityState`'s dependent-decision reconstruction needs
`getDecisionsForBriefVersion`, built in this slice).

**Satisfies:** US-10 (all ACs), US-12 (write-side completion: `assignValidityState` with its
write-time validation, Finding 7; `DecisionHistoryBanner`, revised to render the two
requirements-distinct lists per Finding 6), US-13 (AC5's decision-retrievability requirement and
the full five-item browser demonstration, now exercised via the real versioned-route navigation
Finding 3 built rather than a raw internal id).

**Files:**
- `src/db/migrations/010_decision_and_reconsideration_condition.sql` (new — exact SQL per
  `02-ARCHITECTURE.md` §3.5, including the `reject_update_or_delete()` immutability triggers).
- `src/types/domain.ts` — add `Decision`, `ReconsiderationCondition` (no `decidedBy` field, per
  §1.2's binding resolution).
- `src/services/recordDecision.ts` (new) — exact contract per §4.3, including
  `WatchRequiresConditionError` and the whitespace-only-condition trim rule.
- `src/services/getDecisionsForBriefVersion.ts` (new) — exact contract per §4.5, **returning
  `DecisionWithResolvedConditions[]` (Finding 6) — every reconsideration condition resolved to its
  real `type`/`otherTypeLabel`/`description`, never a bare `ReconsiderationCondition` id**, one
  query with an aggregated join, no N+1.
- `src/web/apiRoutes.ts` — new route: `POST /api/brief-versions/:briefVersionId/decisions` (exact
  contract per §3.1a — deliberately not nested under `/investigations/:id`; request body
  `SubmitDecisionRequestBody`; 201 response body is the persisted `Decision` verbatim; 400
  `invalid-request`, 404 `brief-version-not-found`, 422 `watch-requires-condition`).
- `src/services/getInvestigationWorkspace.ts` — edit: add step 4 of §4.4 — real
  `getDecisionsForBriefVersion` union across all `briefs`, **populating `decisionLineage` (Finding
  6 — was `decisions`; the whole-Investigation chronological view, `decidedAt` ASC, each entry
  labeled with its owning `BriefVersion`'s `versionNumber` from the `briefs` array already
  assembled in step 3) — a distinct, requirements-distinct surface from `getBriefForReview`'s
  per-version `priorDecisions`, never a substitute presentation of it and never merged into one
  undifferentiated list**.
- `src/services/getBriefForReview.ts` — edit: wire real `priorDecisions` (version-scoped, via
  `getDecisionsForBriefVersion(briefVersionId)`), resolved-condition content per Finding 6.
- `src/services/validityState.ts` — edit (created C2-S4 with the two read queries): add
  `assignValidityState({ targetType, targetId, assignedState, effectiveAt, reason, recordedBy })`
  (§4.7):
  - **Step 0 (Finding 7, new, write-time target validation)**: within the same transaction as the
    insert, `SELECT 1 FROM claim_version WHERE id = $1` (or `brief_version`, matching `targetType`)
    — zero rows rolls back and throws `InvalidValidityTargetError`; NO `StatusEvent` is ever
    written for a dangling or wrong-type target.
  - Appends a new `StatusEvent` row (never an update), reverse-resolves every dependent
    `BriefVersion`, reads every bound `Decision` via `getDecisionsForBriefVersion`, and filters to
    those where `getAssignedStateAsRecorded({ ..., asOf: decision.decidedAt, knownAsOf:
    decision.decidedAt })` was last `'valid'` — returning `dependentDecisionIds`.
  - No browser-reachable route, control, or `api.ts` export calls this function (Out of Scope,
    US-12) — exercised only by this slice's own service tests and by the direct-service-call this
    slice's browser demonstration uses to seed a real, persisted non-`'valid'` state.
- `src/client/components/DecisionSection/DecisionForm.tsx` (new).
- `src/client/components/DecisionSection/DecisionConfirmationPanel.tsx` (new).
- `src/client/components/DecisionSection/DecisionHistoryBanner.tsx` (new — **Finding 6, revised**:
  renders TWO requirements-distinct lists, never merged: (1) the displayed version's own
  `priorDecisions`, scoped to exactly that `briefVersionId`; (2) `workspace.decisionLineage`, the
  whole-Investigation chronological view, each entry labeled by its own human-readable version
  reference. Also renders, without burying: the current `BriefVersion`'s `assignedState` as a
  plain-language statement ONLY when non-`'valid'`; and `isSuperseded` with a link to the current
  version addressed by human-readable `versionNumber` (**Finding 3**, not a raw UUID). No raw
  `StatusEvent` row, `targetId`, `briefVersionId`, or `ReconsiderationCondition` id rendered as
  primary content anywhere.
- `src/client/api.ts` — add `submitDecision`.
- `src/client/screens/InvestigationWorkspaceScreen.tsx` — edit: render region 5 once ≥1
  `BriefVersion` exists; wire `decisionSubmission` state (§5.2); decision controls act on whichever
  version (current or prior, reached via Finding 3's versioned route) is currently on screen.

**Implementation Notes:**
- Watch requires ≥1 non-whitespace reconsideration condition, enforced both client-side and
  server-side — validation runs before the insert transaction opens.
- No `decidedBy`/actor field anywhere; UI copy uses "Your decision" only.
- No Reopen control, button, or route exists anywhere in the rendered workspace after a Reject.
- Multiple Decisions may exist per `briefVersionId`; history renders all of them, `decidedAt` ASC.
- A `Decision` is never reassigned to a later, superseding `BriefVersion`.
- Successful submission renders an in-place confirmation on the same URL — no navigation.
- `assignValidityState` (US-12) is never invoked as a side effect of `AddSourceInline`/
  `hasEligibleNewEvidenceSinceCurrentBriefVersion`/the correction connector path (US-13), and vice
  versa — verified by a test asserting no `status_event` row is written by a full US-13 correction
  path, and no generation-eligibility check runs as part of `assignValidityState`.
- **`decisionLineage` and `priorDecisions` are never conflated or merged in any read model, service,
  or component this slice touches (Finding 6, binding)** — every call site that needs "this
  version's decisions" uses `priorDecisions`; every call site that needs "every decision across the
  Investigation's lineage" uses `decisionLineage`; neither is filtered from the other client-side.

**Tests:**
- [ ] `recordDecision`: persists Approve/Reject/Watch correctly; rejects zero-condition and
      whitespace-only-condition Watch attempts with no row written to either table (transaction
      rollback verified); never accepts a `decidedBy`-shaped input.
- [ ] `getDecisionsForBriefVersion`: returns `decidedAt` ASC; correctly aggregates resolved
      reconsideration-condition content (type/otherTypeLabel/description) without N+1 queries;
      **never returns a bare `ReconsiderationCondition` id in place of resolved content (Finding
      6)**.
- [ ] `getInvestigationWorkspace`: `decisionLineage` correctly unions decisions across ≥2 real
      `BriefVersion`s (produced via a real US-13 correction in this slice's own test setup), each
      entry correctly labeled with its own `versionNumber`, and is demonstrably distinct from
      `getBriefForReview(oneOfThoseVersionIds).priorDecisions` (which returns only that one
      version's decisions) — an explicit test asserting the two are NOT the same list for an
      Investigation with decisions against more than one version.
- [ ] `DecisionForm`: Watch submit stays disabled with zero/whitespace-only conditions; Approve/
      Reject enabled as soon as a type is selected.
- [ ] Component test: after a Reject, no Reopen affordance renders anywhere in the tree.
- [ ] Regression test: two Decisions recorded against the same `briefVersionId` both appear, in
      order, in the same per-version history list.
- [ ] **`assignValidityState` write-time validation (Finding 7, new, required)**: given a `targetId`
      that does not exist as a row of the claimed `targetType` (a real, dangling/nonexistent UUID),
      `assignValidityState` throws `InvalidValidityTargetError` and NO `status_event` row is
      written (asserted by a direct row-count check against the real table before/after); given a
      `targetId` that DOES exist but as a row of the OTHER `targetType` (e.g. a real
      `claim_version.id` passed with `targetType: 'brief-version'`), the same rejection and
      no-write guarantee holds.
- [ ] `assignValidityState`: appends a real `StatusEvent` row (never updates one); given a
      `BriefVersion` with zero Decisions, `dependentDecisionIds` is `[]`; given ≥1 real Decision
      recorded while the target's `getAssignedStateAsRecorded` was `'valid'`, that Decision's id is
      included; given a Decision recorded after the target was already `'challenged'`/
      `'invalidated'` at that same knowledge-time, it is excluded; **dependent-decision
      reconstruction is exercised against real `StatusEvent` rows carrying real, DB-assigned
      `sequence` values (Finding 7), confirming the reconstruction is stable under the same
      deterministic tiebreak C2-S4's read queries use** — real seeded rows, not mocked.
- [ ] `getAssignedState` vs. `getAssignedStateAsRecorded` divergence (US-12 AC5): a backdated
      `StatusEvent` changes `getAssignedState`'s answer for an `asOf` between the two timestamps,
      while `getAssignedStateAsRecorded` with `knownAsOf` before the correction's `recordedAt`
      still returns the pre-correction state.
- [ ] `DecisionHistoryBanner`: renders both `priorDecisions` and `decisionLineage` as two separate,
      labeled lists, never merged (Finding 6); renders the non-`'valid'` assigned-state statement
      only when a real seeded `StatusEvent` makes it non-`'valid'`, and never when it is `'valid'`;
      renders the `isSuperseded` link, addressed by human-readable `versionNumber` (Finding 3), only
      for a real superseded `BriefVersion` produced via a real US-13 correction run in this slice's
      own test setup.
- [ ] Full US-13 five-item regression (service/route level): a real prior `Decision` exists against
      the current `BriefVersion` → a real new source is added → eligibility flips → a real
      generation run with `supersedesVersionId` set completes → the new `BriefVersion` is current
      and reviewable → the prior `BriefVersion` AND its `Decision` remain retrievable via
      `GET .../brief-versions/by-version/:priorVersionNumber` (Finding 3), unmodified, and
      unreassigned.
- [ ] Frank forge-gate: PASS.

**Browser Demonstration (required — real, rendered screen, real clicks, real persisted data):**
- From a real reviewed Brief (from C2-S4), record a Watch decision with zero conditions using the
  real, rendered form; confirm the submit control stays disabled (client) and, if bypassed via
  direct request, the server rejects it with no phantom history entry.
- Record a real Watch decision with one named condition via the real form; confirm the in-place
  confirmation and its appearance in the per-version history list without navigation, rendered as
  its actual resolved condition text.
- Record a real Approve or Reject decision; confirm Reject leaves no Reopen control anywhere and all
  evidence/provenance remains visible unchanged, all observed on the rendered screen.
- Reload the workspace and confirm the same Brief and the same two decision lists (per-version and
  whole-lineage), in the same order, render identically.
- **US-12 live**: using a direct service call (this checkpoint's only available caller — no browser
  control exists, Out of Scope), record a real `assignValidityState` call against the current
  `BriefVersion` reviewed above. Reload the workspace in the browser and confirm
  `DecisionHistoryBanner` now renders the real, persisted non-`'valid'` statement on the rendered
  screen — not a simulated or client-fabricated one. This one step is legitimately not a click-driven
  demonstration, since no such control exists this checkpoint (Out of Scope) — the reload and
  rendered-result observation IS the required browser verification of the read-side surface.
- **US-13 full five-item demonstration**, using the real versioned route (Finding 3), not a raw
  internal id: (1) confirm the existing Brief and the Decision recorded against it above are both
  visible on the rendered screen; (2) from the same Investigation Workspace, submit materially new
  source evidence via the real, rendered `AddSourceInline`; (3) click the real "Regenerate with new
  evidence" control and confirm a new, real, persisted `GenerationRun` is created and progresses to
  a terminal outcome, observed on the rendered screen; (4) confirm the resulting new `BriefVersion`
  is current and `DecisionHistoryBanner` shows the prior version as superseded with a real, working,
  version-numbered link; (5) click that link (or navigate directly to the prior version's own
  `.../versions/N` URL) and confirm it, and its per-version decision history, remain fully intact
  and retrievable, reload-stably, on the rendered screen.

**Done When:**
- [ ] All tests above pass; Frank forge-gate PASS.
- [ ] All six browser demonstration bullets above are performed and observed against real
      persisted data, with Approve, Reject, and Watch each demonstrated at least once.
- [ ] Stop point for Danny's product review: decisions are recordable, durable, and both decision
      views (per-version and whole-lineage) survive reload without ever being conflated; assigned
      validity state and supersession render real, persisted, non-simulated facts, correctly
      ordered under the `sequence` tiebreak; `assignValidityState` refuses to write against a
      dangling or wrong-type target; and a full evidence-driven correction leaves the prior Brief
      and its decision history intact and reachable via its own real, human-readable versioned URL.

---

## 3. Sequence Rules

1. Complete each `C2-S` slice fully — tests, Frank forge-gate PASS, and its specified browser
   demonstration — before starting the next.
2. No partial slice work carried silently into the next slice's scope.
3. If blocked, HALT and report; do not skip ahead to a later slice to make apparent progress.
4. `C2-S1` may run before or interleaved with `C2-S2` (no functional dependency between them) but
   both must be complete before `C2-S3` begins, since `C2-S3`'s demonstration exercises real `url`
   resolution inside the workspace screen and the real Add-Source Connector C2-S2 builds.
5. No new slices are added to this roadmap without human approval, per this repo's Decision
   Discipline.
6. `src/services/validityState.ts` is created in C2-S4 (read queries only) and edited, not
   recreated, in C2-S5 (adds the writer with its Finding-7 write-time validation) — the same file,
   two ordered contributions, never two `(new)` declarations for the same path (mirrors this
   roadmap's `OpenEligiblePanel.tsx` C2-S2/C2-S3 pattern and `getInvestigationWorkspace.ts`'s
   own five-slice incremental pattern).
7. **G12 (binding, new this revision)**: wherever this roadmap splits one requirement's complete
   behavior across two slices (currently: US-5 AC3 across C2-S2/C2-S3), the earlier slice's own
   Done-When must not claim that requirement complete — only the later slice, at the point the full
   behavior is genuinely demonstrable end to end, claims it, and does so via an explicit,
   cross-referenced integrated test and browser demonstration, not by restating the earlier slice's
   work. This same discipline applies to any other joint-completion pattern discovered during Forge
   (Finding 9's broader audit instruction) — if one is found, it is resolved the same way, not
   silently claimed by whichever slice happens to run first. **G12 itself reflects Danny's ruling as
   recorded in `05-REVIEW.md`'s "Spec-Gate Disposition" section (dated 2026-08-23)** — that
   section, not this roadmap, is the on-record source of the ruling; it states in full: "US-5 AC3
   may be satisfied jointly by C2-S2 and C2-S3 only when (a) the dependency between them is stated
   explicitly in both slices' own text, (b) neither slice's own Done-When claims independent
   completion of AC3, and (c) an integrated test and browser demonstration prove the complete
   behavior. ACCEPTED." This rule applies that recorded ruling throughout this document as
   already-binding, not as an open item awaiting decision.
8. **H-1 (binding, new this revision)**: `AddSourceInline`'s connector is the existing, extended
   `POST /api/investigations` route (`02-ARCHITECTURE.md` §1.4/§3.1b/§4.1, Danny's binding ruling
   recorded in `05-REVIEW.md`'s "Spec-Gate Disposition" section, entry "H-1 — RESOLVED, Danny's
   binding ruling, 2026-08-24") — no `POST /api/investigations/:id/sources` route exists or is
   added anywhere in this roadmap. Any Forge implementation that introduces a new `:id/sources` path
   segment is out of conformance with this roadmap and must be corrected, not accepted as an
   equivalent alternative.
9. **H-2 (binding, new this revision)**: the extended `POST /api/investigations` route's
   guard-decline branch compares the freshly-read post-decline status to the pre-mutation status
   observed in step 2 of `02-ARCHITECTURE.md` §3.1b, not to the attempted target status. An
   unchanged comparison is a benign no-op and responds `201`; only a genuine divergence responds
   `409`. Any Forge implementation that responds `409` for every guard-declined transition,
   regardless of whether the row actually moved, is out of conformance with this roadmap and must
   be corrected, not accepted as an equivalent alternative.
10. **§4.2 steps 5/5b (binding, new this revision, `02-ARCHITECTURE.md` §1.3/§4.2 re-verification,
    2026-08-24)**: `generateBriefVersion`'s outermost catch has no wrapper — a meta-failure of
    `finalizeGenerationRun`/`attemptGenerationFailedTransition`/`client.release()` itself, occurring
    while already inside one of the function's own catch/failRun blocks, propagates un-finalized.
    The connector attaches TWO separate `.catch()` handlers to `pipeline`, at two different points:
    step 5's synchronization catch (attached immediately, relays only a pre-Phase-1 rejection into
    `runCreated`, never references `generationRun`, never writes a terminal record) and step 5b's
    finalization safety net (attached separately, only after `generationRun = await runCreated`
    resolves successfully, so it can structurally never fire before `generationRun` is assigned).
    The second handler MUST distinguish the three typed, already-finalized errors from a
    meta-failure and write a terminal outcome itself only for the meta-failure case. When it does
    write, it MUST record the terminal `GenerationStep` BEFORE calling `finalizeGenerationRun` — the
    same record-step-before-finalize ordering `generateBriefVersion` itself observes at
    `src/services/generateBriefVersion.ts:258-262`, `:306-309`, `:690-692`. Any Forge implementation
    that attaches only one `.catch()`, or whose safety-net handler treats every rejection as
    already-finalized (log only, no distinguishing check), or whose safety-net handler is attached
    before `generationRun` is assigned, **or whose safety-net handler calls `finalizeGenerationRun`
    before recording the terminal `GenerationStep` (reversed ordering)**, is out of conformance with
    this roadmap and must be corrected, not accepted as an equivalent alternative.
11. **`POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` (binding, new this revision, `02-ARCHITECTURE.md`
    §4.9/§5.2, `01-REQUIREMENTS.md` Non-Functional Requirements, Danny's binding ruling)**: both
    constants are engineering-owned and derived by Forge, at C2-S3's own implementation time, from
    real measurement of the implemented system — never asserted as specific numbers anywhere in
    this roadmap, never a Danny-owned PROVISIONAL value pending his confirmation. C2-S3's own
    Implementation Notes and Tests require the measurement-and-report step and the derivation
    methodology in full; the derived values and their measured evidence are recorded as code
    comments next to the constants in their implementation file, not in a separate tracking
    artifact. Any Forge implementation that hardcodes either constant without a recorded derivation,
    or that asserts a specific value at spec time rather than deriving one from real measurement, is
    out of conformance with this roadmap and must be corrected, not accepted as an equivalent
    alternative.

## 4. Deferred (Not This Roadmap)

- A Reopen mechanism for Rejected Investigations — unchanged ruling from `problem-department-mvp`
  Q-5.
- A scheduler, `nextCheckAt` field, or automatic recheck for Watch conditions.
- Server-Sent Events, WebSocket, or any live-update transport other than interval polling — deferred
  reconsideration if the engineering-derived `POLL_INTERVAL_MS` (§4.9) proves insufficient in
  practice.
- Authenticated-actor support on `Decision` — no identity abstraction added now.
- A durable job queue, worker process, or crash-recoverable generation orchestration — direct
  in-process execution only, honestly disclosed as not crash-durable; this checkpoint's
  stale/interrupted DISCLOSURE (Finding 8) is not recovery — it is honesty about a state nothing
  automatically fixes.
- Fixing or reusing the legacy Express `GET /investigations/:id` route — left exactly as found.
- Knowledge surface, Evidence index, or Runs index routes — reserved-only, unchanged.
- Any change to `generateBriefVersion`'s internal pipeline, prompts, or extraction logic (the
  `onRunCreated` hook, Finding 1, is additive only — not a pipeline change).
- **A browser-reachable trigger for `assignValidityState`** — no "mark invalid/challenged" button,
  control, or route anywhere in this checkpoint's surface. The service and its read-side surfacing
  ARE built (C2-S4/C2-S5) — only the human-initiated write trigger is deferred.
- **A generic, unconditional "Generate correction" control** decoupled from new-evidence submission
  — US-13's trigger is reachable ONLY via `AddSourceInline`'s hosted submission inside
  `BriefGeneratedSummaryPanel` (C2-S4).
- **A UI for browsing full `BriefVersion` lineage/history as an index or list** — Finding 3's
  version-numbered navigation is narrowly one-specific-version-at-a-time, not a lineage browser.
- A client-side polling backoff/jitter/max-poll-count mechanism — no additional numeric constant is
  introduced beyond `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS`, both engineering-owned and derived
  at Forge time per §4.9's methodology, not fixed at spec time.
- **A dedicated `POST /api/investigations/:id/sources` route** — H-1 (Danny's binding ruling)
  reuses and extends the existing `POST /api/investigations` route instead; a separate `:id/sources`
  path segment is explicitly not built.

---

## 5. Checkpoint-Level Closing Gate (binding — separate from every C2-S slice's own Done-When)

Checkpoint 2 cannot close on any individual slice's forge-gate PASS alone, including `C2-S5`'s.
Before this checkpoint closes, one continuous, live, browser-driven demonstration against real
persisted data — real clicks on the real rendered surface, not passing tests, not isolated
per-slice demonstrations alone, and not an API response standing in for a rendered screen (Finding
11c) — must show, in one browser session (individual runs/paths may be separate genuine
Investigations, per US-11):

1. Enter through Mission Control.
2. Submit a real Investigation.
3. Trigger the real generation pipeline via a real click.
4. Observe persisted run and step progress (honest polling, no fabricated percent/current-step
   claims), including — at least once across this session — a real observation of the run in
   progress BEFORE it reaches a terminal outcome (Finding 1's non-blocking start, confirmed live).
5. Remain in the same workspace route through Success, Blocked, and Generation-Failed outcomes.
6. Recover from Blocked through a genuine retry producing a new persisted run (the G12-joint US-5
   AC3 path).
7. Review the persisted Brief: sources, evidence, claims, uncertainty, recommendation, provenance —
   including its full real `validationRecords`/`toolInvocations`/`webSearchQueries` fields (Finding
   2).
8. Record Approve, Reject, and Watch decisions (each demonstrated at least once across the full
   run).
9. From a `'brief-generated'` Investigation carrying at least one recorded Decision, add materially
   new source evidence from the same workspace, click the real "Regenerate with new evidence"
   control, and confirm the new `BriefVersion` supersedes the prior one while the prior
   `BriefVersion` and its Decision remain independently retrievable at their own real,
   human-readable versioned URL (Finding 3) — not merely true in the database.
10. Confirm `DecisionHistoryBanner` renders the real `isSuperseded` link produced by step 9, follow
    it (a real click), and — using the one available caller this checkpoint provides for
    `assignValidityState` (a direct service call, since no browser control exists) — confirm a
    real, persisted non-`'valid'` assigned state renders on reload as an honest statement, not a
    simulated one.
11. Reload and confirm the persisted resulting state and decision history — including the
    supersession and validity-state facts from steps 9-10 — survive the reload.
12. **(New, this revision, Finding 8)** Confirm, using a real seeded stale/interrupted run, that the
    workspace discloses it distinctly on the rendered screen and that polling has genuinely stopped
    — not indefinitely re-polling a run that will never progress further.

The successful end-to-end path AND the separate Blocked/retry path AND the separate
Generation-Failed path AND the evidence-driven correction path (step 9) AND the stale/interrupted
disclosure path (step 12) must ALL be demonstrated. After this gate is observed and Frank's binding
forge-gate has returned PASS on the assembled slices, the checkpoint stops for Danny and Sol review
before merge, per this repo's independent-review discipline.

---

## Output Verification

- [x] Every `02-ARCHITECTURE.md` component appears in exactly one slice's Files list as a `(new)`
      declaration, with subsequent edits attributed to later slices: Generation Run Connector
      (C2-S3, revised non-blocking per Finding 1, including §4.2 steps 5/5b's two-catch split and
      the new `isUniqueViolation` helper), Add-Source Connector (**C2-S2, corrected per
      Finding 4, H-1-corrected 2026-08-24 — the existing `POST /api/investigations` route extended
      in place, not a new `:id/sources` route; H-2-corrected 2026-08-24 — benign no-op vs. genuine
      conflict** — was previously undated/deferred), Workspace Read Model
      (C2-S2/S3/S4/S5, incrementally completed, full field shape including Finding 2's
      provenance fields and Finding 8's `livenessState` defined in C2-S2), Brief Review Read Service
      (C2-S4), Decision Recorder (C2-S5), Decision History Read Helper (C2-S5, Finding 6 resolved-
      content shape), SSRF-Guarded Fetch fix (C2-S1), Investigation Workspace Screen (C2-S2,
      extended in S3/S4/S5), Start Investigation Form update (C2-S2), Validity/Invalidation Service
      (`validityState.ts` — created C2-S4 with the two read queries including Finding 7's
      `sequence` tiebreak, edited C2-S5 to add the writer including Finding 7's write-time
      validation), Decision History / Validity Read Model (C2-S4 read-side fields, C2-S5
      writer-dependent banner), Resubmission Eligibility Check
      (`hasEligibleNewEvidenceSinceCurrentBriefVersion`, renamed per Finding 5, C2-S3), Prior-
      Version Navigation Resolver (**C2-S4, new this revision, Finding 3**), Stale/Interrupted Run
      Detector (**field defined C2-S2, exercised/demonstrated C2-S3, Finding 8; its two engineering
      constants derived by Forge in C2-S3 from real measurement, per §4.9**).
      `OpenEligiblePanel.tsx` is created and owned by C2-S2; C2-S3 edits the same file to add
      `GenerateButton` — one creating declaration, subsequent edits.
- [x] Every `03-UI-SPEC.md` component appears in the hierarchy above: `InvestigationIdentityHeader`
      (C2-S2, extended C2-S4 for Finding 11's version indicator), `AddSourceInline` (**C2-S2,
      corrected per Finding 4, H-1-corrected 2026-08-24 to be a real component calling the real,
      extended existing `POST /api/investigations` route from its first mount point**, hosting
      extended in C2-S3/C2-S4), `GenerationProgressPanel`/`GenerateButton`/
      `GenerationFailedPanel` (C2-S3, including Finding 8's stale/interrupted disclosure and
      Finding 2's field rendering; third label state added C2-S4), `BriefGeneratedSummaryPanel`
      (C2-S4), `BriefReviewPanel` and its eight sub-sections + `NegativeFindingNotice` (C2-S4),
      `ProvenanceRail` and its five sub-components (C2-S4, Finding 2's field rendering),
      `DecisionForm`/`DecisionConfirmationPanel`/`DecisionHistoryBanner` (C2-S5, Finding 6's
      two-list split).
- [x] No circular dependency: C2-S2 → C2-S3 → C2-S4 → C2-S5 is strictly linear; C2-S1 is parallel;
      every Finding's correction, G12's joint-completion split, and H-1's route-reuse correction
      follow this same chain without introducing a back-edge (§1 above).
- [x] Each slice has testable Done-When criteria, including the binding three-part bar (tests/QC,
      Frank forge-gate PASS, browser demonstration on real persisted data), and — per Finding 9's
      audit — every slice's Done-When has been checked against what that slice's own real
      file/test/demonstration scope can independently prove; the one place a slice previously
      over-claimed (the prior draft's US-5 AC3 language) is corrected via G12's explicit joint-
      completion note in both C2-S2 and C2-S3; the one place a slice previously described a
      now-removed route (the prior draft's `POST /api/investigations/:id/sources`) is corrected via
      H-1 in C2-S2's Files/Implementation Notes/Tests/Browser Demonstration; the one place a
      slice's test list previously asserted `409` for every guard-declined transition is corrected
      via H-2 in C2-S2's Files/Tests; the one place a slice's test list previously did not cover a
      meta-failure of the finalization write path itself is corrected via the §4.2 steps 5/5b
      two-catch sync in C2-S3's Files/Implementation Notes/Tests, including the new
      `isUniqueViolation` helper and the synchronization-catch test confirming the meta-failure
      safety-net test forces the failure AFTER a real `generationRun` already exists; the one place
      this roadmap previously asserted specific numeric values for `POLL_INTERVAL_MS`/
      `STALE_THRESHOLD_MS` framed as PROVISIONAL-owner-Danny is corrected throughout (Files,
      Implementation Notes, Tests, Deferred, Sequence Rules) to the engineering-derived-at-Forge-time
      framing, with the measurement-and-derivation obligation assigned explicitly to C2-S3.
- [x] File paths are concrete, not placeholders. Both route contracts formalized in
      `02-ARCHITECTURE.md` §3.1a are stated exactly as specified there, including **Finding 3's
      corrected route shape** (`GET .../brief-versions/by-version/:versionNumber`, not the prior
      draft's `:briefVersionId` — this was itself the GET-route content this document's Finding 11b
      sweep specifically checked; no separate GET/POST method-heading mismatch was found anywhere
      else in this document), and the Add-Source Connector's H-1-corrected and H-2-corrected
      contract (`POST /api/investigations`, extended in place, per §3.1b — not a new `:id/sources`
      route; benign no-op vs. genuine conflict, not "any decline is a conflict").
- [x] The Checkpoint-level closing gate (US-11) is stated once, at the end, explicitly separate from
      every individual slice's Done-When, and now includes the US-13 correction path (step 9), the
      US-12 validity/supersession read-side check (step 10), and the stale/interrupted disclosure
      path (step 12, new this revision).
- [x] Generation eligibility is stated once, canonically, by pointer to `02-ARCHITECTURE.md` §4.2
      step 2's revised, tightened rule, in every slice (C2-S2, C2-S3, C2-S4) that computes, gates
      on, or hosts a control for it.
- [x] `GenerateButton`'s three real label states are stated consistently across their owning
      slices' Files, Implementation Notes, and Tests.
- [x] Both restored scopes (US-12, US-13) are assigned to owned `C2-S` slices with real service
      tests, read-model tests, component tests, and browser demonstrations against real persisted
      data.
- [x] Every browser demonstration bullet in this document requires operating the real, rendered
      product surface — real clicks, real observed screen states — per Finding 11c; the one prior
      instance of an API-response-only "demonstration" (C2-S3's old US-13 mechanism-check bullet)
      is withdrawn as a browser demonstration and reassigned as service-level test coverage, stated
      explicitly in C2-S3's own text above (in its own "Service-Level Verification" list, distinct
      from that slice's Browser Demonstration list); C2-S2's own closing provenance bullet is
      likewise corrected to check the rendered screen itself, not fetched payload/dev-visible state.
- [x] External review findings 1-8 and 11 are each resolved in this document with a stated,
      slice-owning mechanism, not a prose assurance: Finding 1 — C2-S3 (non-blocking connector,
      `onRunCreated`, new required test + browser demonstration proving in-progress observed before
      completion, plus §4.2 steps 5/5b's two-catch split — the synchronization catch's own required
      test, and the finalization safety-net's required test, which forces the meta-failure AFTER a
      real `generationRun` already exists, for the one un-wrapped-outermost-catch gap §1.3's
      re-verification found); Finding 2 — C2-S2 (read-model shape/data), C2-S3/C2-S4
      (rendering); Finding 3 —
      C2-S4 (versioned route, second React Route, navigation demonstration with reload); Finding 4
      — C2-S2 (real `AddSourceInline` calling the real, extended existing `POST /api/investigations`
      route from its first mount point, H-1-corrected 2026-08-24); Finding 5 — C2-S3
      (renamed, tightened eligibility check with disqualifier tests); Finding 6 — C2-S5
      (`decisionLineage`/`priorDecisions` split, resolved condition content); Finding 7 — C2-S4
      (schema `sequence` column + read-query ordering) and C2-S5 (write-time target validation);
      Finding 8 — C2-S2 (field defined) and C2-S3 (mechanism, UI, tests, demonstration, plus the
      engineering-derived-constant measurement obligation); Finding 11
      — §0/every slice's file notes (11a, Checkpoint-1 edit boundary language), C2-S4 (11b, GET
      route naming accuracy), C2-S3 (11c, browser-demonstration-only language swept).
