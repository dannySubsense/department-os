# Roadmap: Product Surface — Checkpoint 2

**Status**: Draft (pending Frank spec-gate + human approval).

This roadmap states the following binding design decisions directly, as the current, final state:

- The Add-Source Connector reuses and extends the existing `POST /api/investigations` route rather
 than adding a new `POST /api/investigations/:id/sources` route (`02-ARCHITECTURE.md`
 §1.4/§3.1b/§4.1/§5.2/§5.3).
- A guard-declined status transition on that route whose freshly-read post-decline status is
 unchanged from the pre-mutation status is a benign `201` no-op, not a `409` — only a genuinely
 diverged re-read status is a `409` conflict.
- The Generation Run Connector's finalization safety net covers a meta-failure of
 `finalizeGenerationRun`/`attemptGenerationFailedTransition`/`client.release` itself, not an
 ordinary business-logic/DB error: the connector attaches TWO separate `.catch` handlers to
 `pipeline` — a synchronization catch, attached immediately after invoking `generateBriefVersion`,
 that relays only a pre-Phase-1 rejection into `runCreated` and never references `generationRun` or
 writes a terminal record; and a finalization safety net, attached separately only after
 `generationRun = await runCreated` resolves successfully, so it can never fire before
 `generationRun` is assigned. It writes a terminal outcome only when its own read of the run's real
 persisted state shows the run still `'in-progress'`. `isUniqueViolation` is the new helper this
 design introduces.
- `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` are engineering-owned constants derived at Forge time
 from real measurement — never PROVISIONAL values with a named human owner, and never specific
 numbers asserted anywhere in this document (`02-ARCHITECTURE.md` §4.9/§5.2, `01-REQUIREMENTS.md`'s
 Non-Functional Requirement). C2-S3, the slice that implements the polling/liveness logic, executes
 the real-run measurement-and-report step and records the derived values, their measured evidence,
 and the safety-margin arithmetic as code comments next to the constants, as part of its own
 Implementation Notes and Tests — not a separate tracking artifact.

**Feeds from**: `01-REQUIREMENTS.md` (13 user stories — tightened US-1 AC5, US-4/US-6 stale-run
ACs, US-13 AC2, and the Non-Functional Requirement that Forge measure real runs and report observed
request rate, persisted-update gaps, longest legitimate silence, and observed stale/interrupted-
warning behavior before `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` are derived — see that document for
the canonical acceptance-criteria enumeration), `02-ARCHITECTURE.md` (component table, migrations
`009`/`010`/`011`/`012`, the `StatusEvent` schema with `sequence` tiebreak §3.6, the non-blocking
Generation Run Connector §4.2/§1.3 including the two-catch split and the `isUniqueViolation` helper,
the version-numbered Brief route §3.1a/§5.1, the real `AddSourceInline`/Add-Source Connector reusing
and extending the existing `POST /api/investigations` route §1.4/§3.1b — including the
benign-no-op-vs-genuine-conflict branch in §3.1b step 6, the Resubmission Eligibility Check
`hasEligibleNewEvidenceSinceCurrentBriefVersion` §4.8/§1.5, the Stale/Interrupted Run Detector §4.9,
`decisionLineage` split from per-version `priorDecisions` §3.2/§4.5 — see that document for the
canonical component enumeration), `03-UI-SPEC.md` (the two-route SPA design §5.1, the
Stale/Interrupted panel variant, the real `AddSourceInline` component, the split
`DecisionHistoryBanner` lists, the version-navigation interaction), `NORTH-STAR.md`.

---

## 0. Slice-Identifier Discipline (binding, restated)

This roadmap is the active continuation of one unfinished Problem Department MVP stream that
already has two other locally-numbered roadmaps: `problem-department-mvp` (Slices 1-9 built,
Slices 10-12 SUPERSEDED) and `product-surface-checkpoint-1` (its own Slices 1-2, built). To keep
"Slice 1" unambiguous across three roadmaps, every Forge task in this document is identified as
`C2-S1`, `C2-S2`,... — sprint-local to this roadmap only. No bare "Slice N" header appears below.

---

## 1. Slice Count and Why (unchanged: still five `C2-S` slices)

Every mechanism this roadmap describes lands inside the same five-slice linear dependency
chain — none requires an additional slice, because each mechanism's real data/service dependency
already sits at one of the five slice boundaries below:

- Non-blocking start (`onRunCreated`) and stale/interrupted disclosure (`livenessState`) both
 live inside the Generation Run Connector and the honest-progress panel — both are **C2-S3**'s
 scope. The read-model *field* `livenessState` (structural, computed per-run) is defined in
 **C2-S2**'s Workspace Read Model, because it costs nothing to define correctly the first time a
 `generationRuns` query is written, but the only slice that can *produce* a real in-progress or
 stale run to test/demonstrate it against is **C2-S3**, which is where the live test coverage and
 browser demonstration for `livenessState` land — matching this roadmap's own "assign the full
 demonstration to the earliest point it is genuinely real" discipline.
- `validationRecords`/`toolInvocations`/`webSearchQueries` are a Workspace Read Model shape
 requirement — **C2-S2** (where the real `generation_run`/`generation_step`/`web_search_query` join
 query is first built) defines the complete shape and tests it against real pre-existing seeded
 rows; **C2-S3**'s `GenerationProgressPanel` and **C2-S4**'s `ProvenanceRail` are where these fields
 are first *rendered* — each owning slice's Files/Tests carry that rendering, not duplicated.
- Version-numbered Brief navigation (`.../versions/:versionNumber`) requires
 `BriefReviewPanel`/`getBriefForReview` to exist, which is **C2-S4**'s own scope — the route, the
 second React Route, and the version-indicator header all land there with a real test and browser
 demonstration (navigate to a specific prior version produced by C2-S4's own live corrective-
 generation demo, reload it, confirm it renders).
- `AddSourceInline` is its own real component, reusing and extending the existing
 `POST /api/investigations` route — never a new `POST /api/investigations/:id/sources` route
 (`02-ARCHITECTURE.md` §1.4/§3.1b) — and this lands at its point of origin, **C2-S2**, which is
 where `AddSourceInline` is first built (for Blocked recovery) and where the existing
 `POST /api/investigations` route handler is therefore extended in place, not deferred. C2-S3 and
 C2-S4 host additional *instances* of the same real component, unchanged.
- The tightened `hasEligibleNewEvidenceSinceCurrentBriefVersion` (replacing a bare timestamp check)
 stays in **C2-S3**. The `decisionLineage` split from per-version `priorDecisions`, with resolved
 reconsideration-condition content, stays in **C2-S5**, which already owns
 `getDecisionsForBriefVersion`/`DecisionHistoryBanner`.
- `StatusEvent.sequence`'s deterministic tiebreak and write-time target-existence/type validation
 split across the same read/write boundary this roadmap already establishes for US-12: the
 `sequence` column and the read queries' `ORDER BY... sequence DESC` tiebreak are schema/read
 concerns and land in **C2-S4** (which owns migration `011` and the two `getAssignedState*` read
 queries); the write-time `InvalidValidityTargetError` validation is a concern of
 `assignValidityState` (the writer), which cannot be built before `getDecisionsForBriefVersion`
 exists, so it stays in **C2-S5**.
- Checkpoint-1 edit-boundary language, GET/POST heading accuracy, and browser-only demonstration
 language are cross-cutting corrections applied to every slice's own text below, not a new slice.
- **US-5 AC3** is satisfied jointly by C2-S2 and C2-S3, and neither slice's own Done-When claims it
 complete independently: C2-S2 delivers the real add-source-to-Blocked mechanism and the resulting
 `generationEligible: true` computation; C2-S3 delivers the clickable trigger and is the only point
 at which the full AC3 behavior — source added, status returns to `'open'`, generation triggered and
 watched to a terminal outcome — is actually clickable and browser-demonstrable end to end. This is
 stated explicitly in both C2-S2's and C2-S3's text below, with the integrated test and browser
 demonstration living in C2-S3 (the earliest point the full behavior is real).
- **US-12 (`StatusEvent`/validity)** splits across two existing slices, not one, because its own
 two service functions have different real dependencies: `getAssignedState`/
 `getAssignedStateAsRecorded` (the read queries, §4.7) are pure queries over `status_event` with
 no dependency on `Decision` — and `getBriefForReview` (§3.3) already calls `getAssignedState`
 unconditionally the moment it exists (§4.7 "Read-side wiring"). `getBriefForReview` is built in
 **C2-S4** — so the `StatusEvent` type, migration `011`, and the two read queries, including the
 `sequence` tiebreak column and ordering, stay in C2-S4, to avoid `getBriefForReview` depending
 forward on a slice that hasn't run yet. `assignValidityState` (the writer, with dependent-decision
 reconstruction and write-time target validation) genuinely does depend on
 `getDecisionsForBriefVersion` (§4.5), which is built in **C2-S5** — so the writer, and the
 `DecisionHistoryBanner` component that renders its read-side output alongside
 `priorDecisions`/`decisionLineage`, stay in C2-S5, extending the slice that already owns
 Decision Recording and History. This is a dependency-driven split of one user story's two service
 functions, not two overlapping slices for one story.
- **US-13 (evidence-driven correction)**'s mechanism lands in **C2-S3** — C2-S3's own browser
 demonstration already produces a real `'brief-generated'` Investigation with a real `BriefVersion`,
 so the mechanism is genuinely testable there without forward-depending on a later slice. The
 clickable UI affordance for it — `AddSourceInline` and `GenerateButton` hosted inside
 `BriefGeneratedSummaryPanel` — cannot exist before that panel does, and `BriefGeneratedSummaryPanel`
 is `'brief-generated'`'s dedicated panel, built in **C2-S4**. The closing five-item regression is
 **C2-S5**'s own scope — C2-S5 owns the closing regression test/demonstration that exercises all
 five items together, the same "assign the full demo to the earliest point it is genuinely real"
 discipline this roadmap already applies to US-8.
- Both restored user stories decompose along the same linear `C2-S2 → C2-S3 → C2-S4 → C2-S5`
 dependency chain the five slices already follow — no new slice is needed because each restored
 piece lands in whichever existing slice first has the real data/service dependency it needs, never
 earlier (forward dependency) and never held back later than necessary (which would strand a
 testable piece of work as an unowned Open Item).
- `AddSourceInline`'s connector is C2-S2's own scope: reusing and extending the existing
 `POST /api/investigations` route in place — instead of adding a new
 `POST /api/investigations/:id/sources` route — is stated entirely within C2-S2's own Files,
 Implementation Notes, Tests, and Browser Demonstration. No other slice's ownership, dependency, or
 sequencing is affected.
- The extended route's guard-decline branch, in C2-S2, compares the pre-mutation status observed
 before this request attempted anything to the post-decline re-read status — an unchanged
 comparison is a benign no-op (`201`), only a genuine divergence is a conflict (`409`). C2-S2's own
 Tests assert `201` for the benign-no-op cases and reserve `409` for a real, specifiable
 concurrent-conflict case only. This is stated entirely within C2-S2's own scope and does not affect
 any other slice's ownership, dependency, or sequencing.
- `generateBriefVersion`'s outermost catch has no wrapper — if finalization itself
 (`finalizeGenerationRun`, `attemptGenerationFailedTransition`, or `client.release`) throws while
 already inside a catch block, that throw propagates un-finalized. C2-S3's connector attaches TWO
 separate `.catch` handlers to `pipeline`, at two different points: the synchronization catch,
 attached immediately after `generateBriefVersion` is invoked, whose sole job is to relay a
 pre-Phase-1 rejection into `runCreated` so the `try`/`catch` around `await runCreated` can respond
 synchronously — it never references `generationRun` and never writes a terminal record, because it
 can run at a point where that binding does not yet exist; and the finalization safety net, attached
 separately, only after `generationRun = await runCreated` has resolved successfully, which decides
 solely on a `getGenerationRunOutcome` READ of the run's real persisted state, never on the
 rejection's JavaScript error class: if the read shows the run already terminal, it logs only; if
 the read shows it still `'in-progress'`, it itself writes a terminal `GenerationStep`/
 `GenerationRun` for the run before logging. This is stated entirely within C2-S3's own Files,
 Implementation Notes, and Tests.
- The rest of §1's reasoning (the US-7/US-8 standalone-vs-folded split, the "pair backend with
 browser-reachable UI in the same slice" discipline) is not restated in full here.

---

## 2. Dependency Map

| Slice | Depends On | Why |
|---|---|---|
| C2-S1 — Fix Node 22 URL resolution | — | Standalone module fix; no new schema, no new route, no new screen |
| C2-S2 — Investigation Workspace scaffold (identity, sources via the extended `POST /api/investigations` Add-Source Connector, Blocked, nav wiring, full Workspace Read Model shape) | — | Reads existing tables (`getInvestigation`, `sourceArtifacts`, `generation_run`/`generation_step`/`web_search_query`); **new migration `009`, schema only** — §1.1's partial unique index plus §1.6's `fence_token`/`lease_heartbeat_at` columns and stranded-row backfill, moved to this slice because this slice's own Workspace Read Model reads `generation_run.lease_heartbeat_at` (via `computeLivenessState`, §4.9) and that column must exist for this slice's own read query to be real, not stubbed; the FENCING/write-guard LOGIC that reads/writes `fence_token` at write time remains C2-S3's own scope (no `GenerationRun` is created yet in this slice, so there is nothing to fence); the existing `POST /api/investigations` route handler is extended in place here because `AddSourceInline` is first built here |
| C2-S3 — Generation Run Connector (non-blocking start) + honest in-progress/stale-interrupted/failed panels + evidence-gated eligibility mechanism | C2-S2 (needs the workspace screen, route, and the extended `POST /api/investigations` Add-Source Connector to host the trigger control, progress panel, and the integrated US-5 AC3 demonstration; ALSO now needs C2-S2's migration `009` — `fence_token`/`lease_heartbeat_at` — to exist before this slice's write-guard logic can read/write those columns) | New migration `012` (`generation_run_consumed_source`, §4.8); migration `009` is now C2-S2's own scope (schema only), not this slice's — this slice implements the fencing WRITE-GUARD logic (`recordGenerationStep`/`finalizeGenerationRun`/`runStepWithProvenance`/`abandonGenerationRun`, §1.6) against columns C2-S2 already added; connector and `hasEligibleNewEvidenceSinceCurrentBriefVersion` are otherwise independently testable at the service layer, but every browser demonstration requires C2-S2's screen and real add-source path to exist |
| C2-S4 — Brief Review (read service + panel + provenance rail, rendering the Brief's real fields) + version-numbered Brief navigation + `StatusEvent` schema/read queries with `sequence` tiebreak + evidence-driven correction UI (US-13, UI) | C2-S3 (needs a real, browser-triggered `BriefVersion` to read, and the real eligibility mechanism to gate the correction UI on) | the versioned route resolves `ProblemBrief.currentVersionId` (or a specific `versionNumber`) to a `briefVersionId` before calling `getBriefForReview(briefVersionId)` (`02-ARCHITECTURE.md` §2/§3.3/§4.1 — resolution is the route's job, not the service's); the version-numbered route needs a `BriefVersion` and its own lineage to navigate against |
| C2-S5 — Decision Recording and History + `assignValidityState` with write-time target validation + `DecisionHistoryBanner` + US-13 closing regression | C2-S4 (needs a rendered `briefVersionId`, and the versioned-route navigation built, to demonstrate US-13's full five-item path against a specific prior version's own URL rather than a raw id) | New migration `010`; `recordDecision` requires an existing `brief_version` row (FK); `assignValidityState`'s dependent-decision reconstruction requires `getDecisionsForBriefVersion`, built in this slice |

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
 actual rendered form and its real submit control. Confirm the Investigation's persisted,
 rendered `evidenceCount`/aggregate resolution state reflects the new source as resolved (not
 blocked/unreachable) — the only per-Investigation resolution signal the existing Checkpoint-1
 surface actually renders (`src/types/readModels.ts`'s aggregate `sourceCount`/`evidenceCount`
 fields; there is no per-source `resolutionStatus` view on this surface). Correction (2026-09-05,
 independent review): the per-*source* `resolutionStatus` claim originally required here cannot be
 demonstrated on the Checkpoint-1 surface, which has no per-source view — that demonstration moves
 to C2-S2's `SourcesList` component, the real place a per-source `resolutionStatus` is rendered.

**Done When:**
- [ ] All tests above pass; Frank forge-gate PASS.
- [ ] The browser demonstration above is performed and observed against real persisted data
 (aggregate resolution reflected on the existing Checkpoint-1 surface — not a per-source
 `resolutionStatus` claim, which is C2-S2's Done-When below).
- [ ] Stop point for Danny's product review: a real `url` source resolves successfully, reflected
 in the existing Checkpoint-1 UI's aggregate resolution state.

---

## C2-S2 — Investigation Workspace Scaffold (Identity, Sources via the Extended `POST /api/investigations` Add-Source Connector, Blocked, Navigation, Full Workspace Read Model Shape)

**Goal:** One durable workspace URL exists, reachable from submission and from every existing
per-row "Open" link; it shows an Investigation's identity, sources, real generation history (if
any already exists, rendered with its full real provenance fields), and (if applicable) the
Blocked outcome with in-place recovery via `AddSourceInline` — the real, standalone component
calling the existing, extended `POST /api/investigations` route (`02-ARCHITECTURE.md` §1.4/§3.1b),
never a new `:id/sources` route, never a `StartInvestigationForm` reuse, and never the legacy
form-post-and-redirect route.

**Depends On:** — (parallel to C2-S1; sequenced second for narrative flow, not a hard dependency)

**Satisfies:** US-1 (all ACs except AC5, which is C2-S4's scope), US-2 (ACs 1, 3, 5, 6, 7 fully;
AC2's real `url` resolution demonstrated using C2-S1's fix; **AC4 only jointly with C2-S3 — this
slice delivers the real add-source-to-Blocked re-resolution mechanism and the resulting
`status` returning to `'open'`/`generationEligible: true` computation, but this slice's own
Done-When does not claim AC4 independently, since no generation-trigger control exists yet to
demonstrate "generation becomes eligible again" end to end — see C2-S3's Depends On/Satisfies for
the completing half, the same joint-completion pattern as US-5 AC3 below**), US-5 (ACs 1-2, 4 fully;
**AC3 only jointly with
C2-S3 — this slice delivers the real add-source-to-Blocked mechanism and the resulting
`generationEligible: true` computation, but this slice's own Done-When does not claim AC3
independently, since no generation-trigger control exists yet — see C2-S3's Depends On/Satisfies for
the completing half**), US-6 (AC2's requirement that real, pre-existing generation history,
including its full provenance fields, is never under-reported).

**Files:**
- `src/types/readModels.ts` — add `WorkspaceInvestigationSummary`, `WorkspaceGenerationStepSummary`
 (including `validationRecords`/`toolInvocations`), `WorkspaceWebSearchQuerySummary`, `WorkspaceGenerationRunSummary` (including `livenessState` — the field is
 defined and computed here since it costs nothing to define correctly the first time this shape is
 written; see C2-S3 for the first slice that can produce and demonstrate a real non-`'active'`
 value), `WorkspaceBriefSummary`, `WorkspaceDecisionSummary`, `InvestigationWorkspaceView` (full
 shape per `02-ARCHITECTURE.md` §3.2, including `newEvidenceSinceCurrentBriefVersion` and
 `decisionLineage` — both stay `false`/`[]` until C2-S3/C2-S5 populate them for real; the shape is
 defined once, correctly, here, closing the field-omission gap)
- `src/types/domain.ts` — **add `ReconsiderationConditionType`, `ReconsiderationCondition`,
 `Decision` (moved earlier from C2-S5 — a real sequencing bug: this
 slice's own `WorkspaceDecisionSummary` (above) references `ReconsiderationConditionType` in its
 `reconsiderationConditions[i].type` field, so that type must exist by the time this slice's own
 `readModels.ts` is written, not three slices later. Defined here exactly per §3.4's shape (no
 `decidedBy` field, §1.2's binding resolution) — this slice adds ONLY the type declarations; no
 migration (`010`, still C2-S5's own scope, since the DB CHECK constraint the type enumeration
 mirrors is a write-side concern with no dependency this early), no service logic, no route. C2-S5
 (below) states it operates on these already-defined types, not that it defines
 them.**
- `src/types/domain.ts` — **also add `AssignedValidityState` (§3.6, US-12) here, for the identical
 sequencing reason as `ReconsiderationConditionType`/`ReconsiderationCondition`/`Decision` above: this
 slice's own `WorkspaceBriefSummary` (above, `readModels.ts`) references `assignedState:
 AssignedValidityState`, so the type must exist by the time this slice's own `readModels.ts` is
 written, not two slices later in C2-S4. Moved earlier from C2-S4 — the same sequencing-bug class,
 caught on the same pass. This slice adds ONLY the type-alias declaration (`'valid' | 'challenged' |
 'invalidated'`, §3.6); migration `011`, the `status_event` table, and both real read queries
 (`getAssignedState`/`getAssignedStateAsRecorded`) remain C2-S4's own scope exactly as before — no
 schema, no service logic, no route exists yet for this type. C2-S4 (below) states it operates on
 this already-defined type, not that it defines it.**
- `src/db/migrations/009_generation_run_investigation_in_progress_unique.sql` (new — exact SQL per
 `02-ARCHITECTURE.md` §3.5/§1.1, including the stranded-row backfill statement that runs BEFORE
 the `CREATE UNIQUE INDEX`, so the migration succeeds even against a dev/test database that
 already has multiple `'in-progress'` rows for one Investigation. **Also adds, in the same
 migration file, §1.6's fencing/heartbeat columns**: `ALTER TABLE generation_run ADD COLUMN IF NOT
 EXISTS fence_token INTEGER NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS lease_heartbeat_at
 TIMESTAMPTZ NOT NULL DEFAULT now()`. Moved to THIS slice, schema only — the concurrent-run
 uniqueness index and the fencing/heartbeat columns are additive `generation_run` schema changes
 this slice's own Workspace Read Model needs (`lease_heartbeat_at`, read by `computeLivenessState`,
 §4.9, for every seeded run this slice's tests fixture); the WRITE-GUARD logic that reads/writes
 `fence_token` at write time (`recordGenerationStep`/`finalizeGenerationRun`/`abandonGenerationRun`)
 is C2-S3's own scope — no `GenerationRun` is created by any code path in this slice, so there is
 nothing yet to fence.
- `src/db/migrations/013_source_artifact_resolution_revision.sql` (new — exact SQL per
 `02-ARCHITECTURE.md` §1.4a/§3.5: `ALTER TABLE source_artifact ADD COLUMN IF NOT EXISTS
 resolution_revision INTEGER NOT NULL DEFAULT 0`. Created in this slice, alongside `009` — both
 additive `ALTER TABLE`s this slice's own `recheckSourceArtifact.ts` compute/persist split needs;
 `resolution_revision` is the sole CAS condition for the recheck guard, added 2026-09-05 per
 independent review because the pre-existing `resolution_status`/`resolution_resolved_at` pair is
 not collision-free.)
- `src/client/components/SourcesList.tsx` (new — subcomponent of `InvestigationIdentityHeader`,
 `02-ARCHITECTURE.md` §5.3, added 2026-09-05 per independent review) — renders each `source_artifact`
 row's real, persisted `resolutionStatus` individually, with `failureReason`/`noContentReason`
 where applicable. Closes the gap C2-S1's Done-When left when its per-source `resolutionStatus`
 browser demonstration was moved to this slice (see C2-S1's Done-When and this slice's own
 Browser Demonstration bullet, above).
- `src/services/resolveSourceArtifact.ts` — edit, two changes, both required before
 `recheckSourceArtifact.ts` (below) can be correct: (1) **`02-ARCHITECTURE.md` §1.4a's
 compute/persist split** — extract the existing type-branch resolution logic
 (`resolveSourceArtifact.ts:40-69` today) into a new, non-persisting export
 `computeSourceResolution(artifact: { id, type, raw }): Promise<{ resolution, resolvedContent }>`;
 `resolveSourceArtifact(sourceArtifactId)` keeps its existing external signature/behavior — fetch
 the row, call `computeSourceResolution`, persist unconditionally via the existing
 `persistResolution`, return the resolution — a pure refactor, zero behavior change for every
 existing caller (`submitSources`/`resolveInvestigationSources`) and their existing tests. (2)
 **`02-ARCHITECTURE.md` §1.4b's blank-text fix** — `computeSourceResolution`'s `type === 'text'`
 branch gains an emptiness check (`artifact.raw.trim().length === 0` → `'reachable-no-content'`,
 matching the `type === 'url'` branch's existing `MIN_CONTENT_LENGTH` semantics) instead of
 unconditionally resolving `'content-retrieved'`. Both edits land together because
 `recheckSourceArtifact.ts` (below), built in this same slice, is the split's first caller and
 must call `computeSourceResolution` directly (never `resolveSourceArtifact`) to avoid the
 CAS-defeating double-persist §1.4a documents.
- `src/services/getInvestigationWorkspace.ts` (new) — steps 1, 2, and 6 of §4.4's assembly built for
 real: step 1 `getInvestigation`; step 2 the real `generation_run`/`generation_step`/
 `web_search_query`/`web_search_result`/`query_limitation` join query,
 returning full generation history AND full per-step `validationRecords`/`toolInvocations` and
 per-run `webSearchQueries` for any Investigation that already has runs, with `livenessState`
 computed inline via `02-ARCHITECTURE.md` §4.9's `computeLivenessState` function.
 This slice builds and unit-tests `computeLivenessState`
 itself as a pure function taking `staleThresholdMs` as a parameter (§4.9), NOT closed over a
 module constant — its ONE call site here is wired with an explicit, clearly-labeled test-only
 placeholder value (never presented as `STALE_THRESHOLD_MS`) until C2-S3 exists to supply the real
 engineering-derived constant. This slice does NOT need `STALE_THRESHOLD_MS` to exist to be
 complete — only C2-S3's wiring of the real value does; step 6: `generationEligible` computed
 per §4.2's Generation Eligibility Rule — for this slice's reachable statuses (`'open'`,
 `'blocked'`), this evaluates to `status === 'open'` AND no run has `outcome === 'in-progress'`.
 Steps 3-4 (briefs/decisions) return `[]`/`[]` placeholders — no `ProblemBrief`/`Decision` row can
 exist yet.
- `src/web/apiRoutes.ts`:
 - `GET /api/investigations/:id/workspace` (new route).
 - `POST /api/investigations` (`02-ARCHITECTURE.md` §1.4/§3.1b/§4.1): the handler gains the pre-mutation
 `getInvestigation` status read, the `'brief-generated'`-skip branch (adding sources to an
 existing `investigationId` whose current status is `'brief-generated'` does NOT call
 `transitionInvestigationStatus` at all — the Investigation remains `'brief-generated'`), the
 `false`-return check on `transitionInvestigationStatus` for every other existing-Investigation
 case — comparing the freshly-read post-decline status against the pre-mutation status observed
 in step 2: **unchanged is a benign no-op, responding `201` exactly as the `true` branch does** —
 only a genuine divergence (something else moved the row
 between step 2's read and this request's own transition attempt) responds `409
 CreateInvestigationTransitionConflictResponseBody` — and the post-mutation `getInvestigation`
 re-read before every response. `submitSources` and `transitionInvestigationStatus` themselves
 are unmodified — the exact 7-step branch is §3.1b's own. Returns `201 CreateInvestigationResponseBody`
 (now carrying the additive `sourcesAdded`
 field, including for the benign-no-op case above), `400`, the new
 `404 CreateInvestigationNotFoundResponseBody`, or the new
 `409 CreateInvestigationTransitionConflictResponseBody` (genuine concurrent conflict only —
 never for a decline whose re-read status matches step 2's own), never a
 redirect. This extension is built in THIS slice, not deferred, because `AddSourceInline` (below)
 needs the real, extended route to call from its very first mount point.
- `src/services/resolveInvestigationSources.ts` — edited: skips already-terminally-resolved `source_artifact` rows instead of
 re-fetching every source on every call, reusing their persisted status for the `allUnreachable`
 aggregate. Built in THIS slice because it is a direct, necessary consequence of the Add-Source
 Connector this slice already delivers — a second `POST /api/investigations` call against an
 Investigation with prior resolved sources is reachable from this slice's own `AddSourceInline`
 the moment it exists. No new parameter, no signature change; behavior is a no-op for every
 existing (Checkpoint-1) call site, verified by that call site's own unmodified test suite still
 passing. **Live code before this slice does not yet contain this fix** (baseline SHA `6bd4765`
 unconditionally re-fetches/overwrites every source on every call) — implementing it is this
 slice's own required work, not a description of already-shipped behavior.
- `src/services/recheckSourceArtifact.ts` (new) — single-artifact re-check service per
 `02-ARCHITECTURE.md` §1.4a's re-check status-branch rule — calls `computeSourceResolution` (NEVER
 `resolveSourceArtifact`, per §1.4a — calling the persisting function here would clobber this
 call's own CAS guard columns before the guard evaluates) against exactly one `source_artifact`
 row, then persists the computed result itself via the single guarded `UPDATE` §1.4a specifies,
 then reads the Investigation's current persisted `status`. **If,
 and only if, `status === 'blocked'`**, it re-reads the full source set to recompute
 `allUnreachable` and, **if `allUnreachable` is false** (at least one source across the whole
 Investigation is now reachable/resolved
 per `02-ARCHITECTURE.md` §1.4a's re-check status-branch rule; NOT "if no unreachable source remains," which would
 wrongly keep a `'blocked'` Investigation blocked whenever any sibling source is still unreachable),
 calls `transitionInvestigationStatus(
 investigationId, 'open',...)`, checking the returned boolean, never assuming the write happened.
 For every other status (`'open'`, `'brief-generated'`, `'generation-failed'`),
 `transitionInvestigationStatus` is never called. Built in THIS slice because it is
 the explicit-re-verification counterpart the C1 fix above requires to exist in the same slice that
 removes implicit re-verification — US-5 AC4/US-2's intentional-re-verification AC would otherwise
 be unsatisfiable between this slice and whichever slice eventually added it.
- `src/web/apiRoutes.ts` — add `POST /api/source-artifacts/:id/recheck` (new route,
 `02-ARCHITECTURE.md` §1.4a): 200 with `{ sourceArtifactId, resolutionStatus, investigationStatus }`
 on success, 404 for a nonexistent `source_artifact` id.
- `src/client/api.ts` — add `recheckSourceArtifact(sourceArtifactId)` (§1.4a), a thin wrapper around
 the new route.
- `src/client/screens/InvestigationWorkspaceScreen.tsx` (new) — mount, fetch-on-mount, not-found and
 error states (US-1 AC4), renders regions 1-2 only (Header, Outcome/Status Panel: Open/Eligible and
 Blocked variants only).
- `src/client/components/InvestigationIdentityHeader.tsx` (new).
- `src/client/components/OutcomeStatusPanel/OpenEligiblePanel.tsx` (new — identity/eligibility fact
 display only; `GenerateButton` itself is built and wired in C2-S3, which owns this file's
 completion).
- `src/client/components/OutcomeStatusPanel/BlockedSourcesPanel.tsx` (new — renders each unreachable source with its real `failureReason` (US-5 AC2), a real `AddSourceInline` instance for adding another source, and its own per-source "Re-check this source" control calling `recheckSourceArtifact(sourceArtifactId)` (US-5 AC4, `03-UI-SPEC.md` § Interactions, Outcome/Status Panel — Blocked row) and re-fetching the workspace on completion).
- `src/client/components/AddSourceInline.tsx` (new — its OWN small
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
- `src/client/api.ts` — **edit existing `createInvestigation` and `CreateInvestigationResponseBody`:**
 `CreateInvestigationResponseBody` gains the additive `sourcesAdded: number` field (§3.1b) so the
 client-side type matches the server's new response shape. `createInvestigation`'s error-handling
 branch (`:42-51`) currently discards the response body's `error` code into a bare `Error` message
 string — this cannot discriminate `400`/`404`/`409` by CODE, and cannot carry the `409` response's
 real current `status` field, both of which `03-UI-SPEC.md` requires (distinct inline messages per
 `error` code; the `409` case renders the real current status, never the attempted target). Edit:
 parse and preserve the response body's typed shape (`{ error: string; status?: InvestigationStatus;
 message?: string }`) into a typed error object (e.g. a `CreateInvestigationApiError` class carrying
 `code`/`status`/`message`) instead of a bare `Error` — callers (`AddSourceInline`, C2-S2 below;
 `StartInvestigationForm`, unchanged) can then branch on `.code` and read `.status` directly, rather
 than string-matching a message. No change to the function's success path or its `fetch` call shape.
- `src/client/App.tsx` — add the new `<Route>` for
 `/departments/problem-department/investigations/:investigationId` (§5.1; the second,
 version-scoped route is C2-S4's addition).
- `src/client/screens/ProblemDepartmentScreen.tsx` — edit: `StartInvestigationForm`'s existing
 `onSubmitted` callback prop (component's own props/contract unchanged — no
 `StartInvestigationForm.tsx` edit is needed; the parent's own callback handler now calls
 `navigate(...)` into the workspace route instead of re-fetching the overview).
- `src/client/components/InvestigationPortfolioTable.tsx` — edit: this is the file that actually
 renders the per-row affordance.
 Per-row link target updated from the legacy `<a href="/investigations/{id}">` to a
 `<Link>`/`navigate` targeting the new workspace route, rendered for all four
 `InvestigationStatus` values including `'brief-generated'` — the existing "Brief ready — review
 workspace not yet available." plain-text branch is removed; `'brief-generated'` rows now render
 the same "Open current view" (or an acceptable label variant, e.g. "Review brief") `<Link>` as
 every other status (this is the one, bounded Checkpoint-1 edit
 `02-ARCHITECTURE.md` §0 explicitly permits: retargeting this per-row navigation affordance ONLY,
 now correctly scoped to the file that contains it. No other Checkpoint-1 file, component, prop,
 route, or rendered content is touched, added, or removed; Checkpoint-1's own
 `02-ARCHITECTURE.md`/`03-UI-SPEC.md` remain the locked spec of record for everything else about
 these screens, and Checkpoint-1's own shipped behavior is otherwise fully preserved).
- `src/client/screens/MissionControlScreen.tsx` — edit: same per-row link-target update, applied
 ONLY to this screen's own inline `RecentInvestigationsList` row-rendering function.
- `src/client/screens/ProblemDepartmentScreen.test.tsx` — edit: rewrite the assertions that
 currently require a plain `<a href="/investigations/{id}">` "not a router Link" (line ~195-209)
 and that require NO interactive control for a `'brief-generated'` row (line ~213-235) to instead
 assert a router `<Link>`/navigable control targeting the new workspace route renders for every
 `InvestigationStatus` value, including `'brief-generated'`. **Also edit
 `:242-255`'s `expect(links[1]).toHaveAttribute('href', '/investigations/inv-other')`
 asserts the legacy Express path; rewrite to assert the new workspace route
 (`/departments/problem-department/investigations/inv-other`) instead.**
- `src/client/screens/MissionControlScreen.test.tsx` — edit: same rewrite for the equivalent
 assertions in this screen's own test file (line ~196-230). **Also edit
 `:249-266`'s equivalent
 `expect(links[1]).toHaveAttribute('href', '/investigations/inv-second')` assertion — rewrite to
 assert the new workspace route in place of the legacy Express path.**

**Implementation Notes:**
- **New migration `009` in this slice (schema only — Finding-4 sequencing fix).** `generation_run`/
 `generation_step`/`web_search_query` already exist (migrations `005`/`006`); this slice's read
 model queries them for real, correctly reporting any pre-existing generation history including
 its full provenance fields (US-6 AC2). What is new in THIS slice is migration `009` itself
 (moved earlier from C2-S3, above) — its two additive columns (`fence_token`,
 `lease_heartbeat_at`) and its partial unique index exist so this slice's own
 `computeLivenessState` call (§4.9) reads a real `lease_heartbeat_at` column rather than one that
 does not exist until a later slice. Only the fencing WRITE-GUARD logic (which writes
 `fence_token`) remains C2-S3's scope; only the `briefs`/`decisions`/`decisionLineage` arrays are
 honestly empty in this slice.
- `PersistentNav` is not remounted on navigation into the workspace (§8, §5.1).
- The legacy Express `GET /investigations/:id` route is left exactly as found — not touched. The
 legacy Express `POST /investigations` form-post-and-redirect route (`src/web/server.ts`) is also
 left exactly as found — it is a distinct, separate route from `POST /api/investigations`, which is
 the JSON API route this slice extends in place (§1.4/§3.1b). No new
 path segment is added anywhere; the extension is entirely inside `POST /api/investigations`'s own
 handler branching.
- **US-5 AC3, joint completion (half 1 of 2).** This slice delivers the real mechanism half of AC3:
 a genuinely reachable source added from the workspace via `AddSourceInline` → the existing,
 extended `POST /api/investigations` route → real re-resolution → real `Investigation.status`
 returning to `'open'` → the next `GET.../workspace` re-fetch computing `generationEligible: true`
 for real. **This slice's own Done-When does NOT claim AC3 complete** — there is no
 generation-trigger control built yet (that is `GenerateButton`, C2-S3's own scope), so "generation
 becomes eligible again" cannot be demonstrated as a clickable, generation-triggering path here.
 C2-S3's own Implementation Notes and Done-When state the other half and the integrated
 demonstration.

**Tests:**
- [ ] `getInvestigationWorkspace`: returns `null` for a nonexistent id; returns a populated view for
 `open`/`blocked` Investigations with correct `sourceCount`, `sources`, `generationEligible`.
- [ ] `getInvestigationWorkspace`: for an Investigation with pre-existing, real `generation_run`/
 `generation_step`/`web_search_query` rows (seeded directly against the real tables, not
 mocked), returns the full real generation history in `generationRuns`/`latestGenerationRun`
 **including real, non-empty `validationRecords`/`toolInvocations` per step and real
 `webSearchQueries` per run** — never an empty array or omitted field for an
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
- [ ] **Required (benign no-op, NOT 409)**: adding a source to an Investigation
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
- [ ] **Required regression (the exact bug this design prevents)**: `POST
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
- [ ] **Required regression, C1 fix (`resolveInvestigationSources` skip-already-resolved,
 `02-ARCHITECTURE.md` §1.4 C1)**: seed a real Investigation with one `source_artifact` row
 already persisted in a terminal state (e.g. `'content-retrieved'` with real stored content),
 then issue a second real `POST /api/investigations` request adding a new, distinct source to
 the same `investigationId`. Assert, by re-reading the row directly (not inferred from the
 response): the pre-existing row's `resolution_status`, `resolution_*` fields, and stored
 content are BYTE-IDENTICAL to their pre-request values (not merely unchanged in state name);
 only the newly submitted row transitions from `'unresolved'` to a terminal state. This is the
 exact defect this fix closes and must be asserted directly against persisted rows, not only
 against the aggregate `allUnreachable`/response `status`.
- [ ] `recheckSourceArtifact`: given one seeded `'unreachable'` `source_artifact` row and at least
 one other already-resolved sibling row on the same Investigation, re-checking the target row
 updates ONLY that row's persisted resolution state (sibling row asserted byte-identical
 before/after); given a seeded `'blocked'` Investigation where the target now resolves reachable
 and this was the only reachable source, asserts `transitionInvestigationStatus(investigationId,
 'open',...)` is called (§1.4a's re-check status-branch rule), checked, not assumed; a paired test given a
 non-`'blocked'` Investigation (`'open'`/`'brief-generated'`/`'generation-failed'`) asserts
 `transitionInvestigationStatus` is NEVER called by this function — the explicit-skip half of
 §1.4a's re-check status-branch rule, not merely the guard declining silently.
- [ ] **New, required — server-side no-overwrite guard.** Given one seeded
 `source_artifact` row already in a terminal, non-`'unreachable'` state (e.g.
 `'content-retrieved'`, with real stored content), call `recheckSourceArtifact` (or
 `POST /api/source-artifacts/:id/recheck`) against that row's id: assert the call is rejected
 with `409 RecheckNotEligibleResponseBody`, that `computeSourceResolution` is never invoked for
 this row, and — by re-reading the row directly, not inferred from the response — that its
 persisted `resolution_status`, `resolution_*` fields, and stored content are byte-identical to
 their pre-attempt values. A paired positive test confirms a genuinely `'unreachable'` source is
 unaffected by this guard and still re-checks normally (already covered by the test above).
- [ ] **New, required — CAS guard is real, not defeated by an internal unconditional write
 (§1.4a's compute/persist split, closes the Finding-3 defect).** Two real, concurrently issued
 `recheckSourceArtifact` calls against the same `'unreachable'` row (a real DB-level or
 test-harness synchronization point interleaving them, not mocked): exactly one call's `UPDATE`
 lands (`rowCount === 1`), the other observes `rowCount === 0` and returns the row's real current
 state without writing; re-reading the row directly confirms it reflects exactly the winner's
 result, never a lost update, and confirms `computeSourceResolution` was called by both
 (each computes independently) but `persistResolution`/any unconditional write path was invoked
 by NEITHER — the only write against this row across both calls is the single winning guarded
 `UPDATE`. This is the regression test for the specific defect Finding 3 identified: without the
 split, `resolveSourceArtifact`'s own internal `persistResolution` call would make both calls
 write unconditionally before either CAS guard evaluates, so this test would previously observe
 TWO writes and a `rowCount` outcome that does not correspond to "one real winner." **CAS
 mechanism correction (Sol finding, `02-ARCHITECTURE.md` §1.4a, migration `013`):** the guard is
 the new monotonic `resolution_revision` column (`UPDATE ... WHERE id = $1 AND
 resolution_revision = $read`, incremented atomically by the same statement), not the
 `(resolution_status, resolution_resolved_at)` pair alone — the doc had previously acknowledged
 that pair is not collision-free (two identical concurrent writes could both report success),
 which directly contradicted this test's exactly-one-writer requirement. This test's
 `rowCount === 1`/`rowCount === 0` split is only a real exactly-one-writer guarantee because it is
 exercising the `resolution_revision` CAS, not the older, weaker guard.
- [ ] **New, required — blank/whitespace-only text does not resolve `'content-retrieved'`
 (§1.4b, closes the Finding-2 defect).** A `source_artifact` seeded/submitted with `type: 'text'`
 and `raw: '   '` (or any string that trims to zero length) resolves to
 `'reachable-no-content'` with a real `noContentReason`, never `'content-retrieved'`, via both
 `resolveSourceArtifact` (normal add-source path) and `computeSourceResolution` called directly.
 A paired positive test confirms non-blank `type: 'text'` content still resolves
 `'content-retrieved'` exactly as before (no regression to the ordinary case).
- [ ] `POST /api/source-artifacts/:id/recheck`: 200 with real read-back
 `{ sourceArtifactId, resolutionStatus, investigationStatus }`; 404 for a nonexistent id; 409
 `RecheckNotEligibleResponseBody` for a source whose persisted `resolution_status` is not
 `'unreachable'`.
- [ ] `BlockedSourcesPanel`: clicking "Re-check this source" for one rendered unreachable source
 calls the real recheck endpoint for that source's id only and triggers a workspace re-fetch.
- [ ] `BlockedSourcesPanel`, negative assertion: render the panel with a
 seeded `'reachable-no-content'` source (its `noContentReason` present and rendered) alongside
 an `'unreachable'` one; assert NO "Re-check this source" control renders for the
 `'reachable-no-content'` row, while the `'unreachable'` row's own control still renders.
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
- **C1 fix + explicit re-check, both real and rendered:** on a Blocked Investigation with at least
 two unreachable sources, click "Re-check this source" on ONE of them (a real click on the real
 rendered control) against a now-reachable host. Confirm, on the rendered screen, that source
 updates while the OTHER still-unreachable source's row remains rendered exactly as before
 (same `failureReason`, not silently cleared or altered). Separately, add a distinct new source via
 `AddSourceInline` to an Investigation that already has a resolved source, and confirm — via the
 actual rendered panel and a direct database read of the pre-existing row — that the pre-existing
 source's rendered state is unchanged by the add-source submission.
- **Per-source `resolutionStatus`, rendered (moved from C2-S1, 2026-09-05 independent-review
 correction):** in the same workspace, confirm `SourcesList` (under `InvestigationIdentityHeader`)
 renders each individual source's real, persisted `resolutionStatus` (`content-retrieved`,
 `unreachable`, etc., with `failureReason`/`noContentReason` where applicable) — this is the first
 slice where a per-source view exists; C2-S1's own Checkpoint-1 surface only has the aggregate
 counts C2-S1's Done-When checks.

**Done When:**
- [ ] All tests above pass; Frank forge-gate PASS.
- [ ] All eight browser demonstration bullets above are performed and observed against real
 persisted data.
- [ ] Stop point for Danny's product review: submitting sources lands in a durable workspace;
 Blocked recovery works in place via the real `AddSourceInline` component and the extended
 `POST /api/investigations` route; direct URL/reload/not-found all behave correctly; both
 updated call sites route to the new screen; pre-existing generation history (if any) renders
 honestly with its full real provenance fields; adding a source never silently overwrites an
 already-resolved sibling source's persisted state, intentional single-source re-check via
 the explicit "Re-check this source" control works end to end, and `SourcesList` renders each
 source's real per-source `resolutionStatus`. **US-5 AC3 is NOT claimed complete by this slice
 alone — see C2-S3.**

---

## C2-S3 — Generation Run Connector (Non-Blocking Start), Honest In-Progress / Stale-Interrupted Disclosure, Blocked-Retry Fix, Generation-Failed, Evidence-Driven Eligibility Mechanism (US-13, mechanism)

**Goal:** A real generation request can be issued from the browser and the connector responds the
instant the concurrency-guarding `GenerationRun` row exists — NOT after the full pipeline
completes — so honest polling can genuinely observe a real in-progress run before
generation finishes; a genuinely stalled or interrupted run is detected and disclosed as a distinct
state, never silently indistinguishable from a healthy one; a Generation-Failed run
can be retried; the Blocked-recovery path delivered in C2-S2 now actually re-triggers real
generation (US-8, and — jointly with C2-S2 — the full clickable demonstration of US-5 AC3); and the revised, tightened Generation Eligibility Rule's evidence-gated `'brief-generated'`
branch (US-13) is built against `hasEligibleNewEvidenceSinceCurrentBriefVersion` (replacing
the prior draft's bare timestamp comparison with the real
resolution-status/consumed-evidence check) and independently service-tested against a real
`BriefVersion` this slice's own demonstration produces. This slice also owns the real-run
measurement required before `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` are
derived (`01-REQUIREMENTS.md` Non-Functional Requirements, `02-ARCHITECTURE.md` §4.9) — this is the
first slice at which a real generation run, with real persisted-step timing, exists to measure.

**Depends On:** C2-S2 (workspace screen, route, and the extended `POST /api/investigations`
Add-Source Connector must exist to host the trigger control, progress panel, and the integrated
demonstration).

**Satisfies:** US-2 (**AC4, completed jointly with C2-S2 — this is the first and only slice whose
own Done-When claims AC4, and only because it supplies the real, clickable `GenerateButton` and
completes the "generation becomes eligible again" demonstration together with C2-S2's re-resolution
mechanism, in one continuous browser session**), US-3 (all ACs — `POST /api/investigations/:id/generation-runs` and
`createGenerationRunForInvestigation` in full), US-4 (all ACs — `GenerationProgressPanel`, the
polling `useEffect`, and the stale/interrupted disclosure in full), US-5 (**AC3, completed jointly
with C2-S2 — this is the first and only slice whose
own Done-When claims AC3, and only because it supplies the real, clickable `GenerateButton` and
completes the integrated demonstration together with C2-S2's mechanism, in one continuous browser
session**), US-6 (all ACs), US-8 (all ACs), US-13 (mechanism only — AC2's tightened eligibility gate
and AC3's `supersedesVersionId` contract, service-level; AC1's UI affordance, AC4/AC5's
supersession/decision-retrievability, and the full five-item browser demonstration are
C2-S4/C2-S5's scope).

**Files:**
- `src/services/generateBriefVersion.ts` — edit: add one new, optional, additive parameter,
 `onRunCreated?: (generationRun: GenerationRun) => void` (`02-ARCHITECTURE.md`
 §1.3), invoked synchronously immediately after Phase 1's `createGenerationRun` call succeeds,
 before Phase 2 begins. Zero effect on any caller that omits the parameter. **Also edit, per `02-ARCHITECTURE.md` §1.3: the `InvalidSupersedeTargetError`
 preflight catch (`:294-299`) gains one `recordGenerationStep` call, matching the ordering contract
 — BEFORE the existing `finalizeGenerationRun` call — with a new, distinctly-named `component:
 'Preflight: supersede-target validation'`, `error: err.message`. This is a genuinely new
 component string for a genuinely new preflight check, not a reuse of the
 `StaleCorrectionConflictError` step's own `component: 'Brief Assembler'` (`:573-584`) — that step
 is Phase 4's lock-time divergence check (`:561-592`), not a preflight catch, and is unrelated to
 this one.** No pipeline phase, prompt, extraction, analysis, or
 recommendation logic is touched by these two edits (Out of Scope, unchanged) — this bullet does NOT claim exclusive ownership of every line
 of this file; the separate Files bullet below (`GenerationRunAlreadyFinalizedError`/
 `GenerationRunLostFinalizationRaceError`) makes further, mechanically distinct edits to this
 SAME file — the local `try`/`catch`, `ROLLBACK`, new error class, and the `:681-684`/`:700-707`
 rethrow-list additions — which are pipeline error-handling/finalization plumbing, not pipeline
 business logic, and are itemized in full where they are introduced, not here.
- Migration `009` (`fence_token`/`lease_heartbeat_at` columns, §1.1's partial unique index) is
 **NOT this slice's own file** — it was moved to C2-S2 (Finding-4 sequencing fix, above), since
 C2-S2's own Workspace Read Model needs `lease_heartbeat_at` to exist for `computeLivenessState`
 to read a real column. This slice consumes those already-existing columns for the first time to
 WRITE through them (the fencing write-guard logic below) — it adds no migration of its own for
 this purpose.
- `src/db/migrations/012_generation_run_consumed_source.sql` (new — exact SQL per
 `02-ARCHITECTURE.md` §4.8/§3.5: `generation_run_consumed_source (generation_run_id, source_artifact_id)`,
 the real per-run consumed-evidence ledger `hasEligibleNewEvidenceSinceCurrentBriefVersion` reads).
- `src/db/migrations/014_source_artifact_identity_fingerprint.sql` (new — exact SQL per
 `02-ARCHITECTURE.md` §4.8: `ALTER TABLE source_artifact ADD COLUMN IF NOT EXISTS
 canonical_identity TEXT, ADD COLUMN IF NOT EXISTS resolved_content_fingerprint TEXT`. Created in
 this slice, alongside `012` — both belong to the slice that builds the resubmission eligibility
 mechanism.)
- `src/services/resolveSourceArtifact.ts` — a further edit, in THIS slice (added 2026-09-05 per
 independent review — the columns migration `014` creates must be populated by the same slice, or
 the eligibility query's `IS NULL`-treated-as-eligible fallback silently degrades finding 4's fix
 to id-anti-join-only): `computeSourceResolution` (split out in C2-S2, §1.4a) gains the
 `canonical_identity`/`resolved_content_fingerprint` computation described in §4.8 — URL
 normalization for `canonical_identity` (`type: 'url'` only, `NULL` for `type: 'text'`), and
 `sha256(trim(resolvedContent))` for `resolved_content_fingerprint` on any `'content-retrieved'`
 result of either type. `resolveSourceArtifact`'s own existing unconditional persist call adds
 both fields to its `INSERT`/`UPDATE`.
- `src/services/recheckSourceArtifact.ts` — a further edit, in THIS slice (same reason as above):
 the CAS-guarded `UPDATE` (§1.4a, built in C2-S2) adds `canonical_identity`/
 `resolved_content_fingerprint` to its `SET` list, populated from the same
 `computeSourceResolution` call this function already makes — no second computation, no second
 network fetch.
- `src/services/extractClaimsAndEvidence.ts` — same file, a further edit (corrected ledger source,
 `02-ARCHITECTURE.md` §4.8): its return type gains one additive field, `usableSourceIds: string[]`
 (the array its own top-level wrapper already computes internally — the real `content-retrieved`
 source set this run's Extraction step actually considered — now surfaced rather than discarded).
 No new import, no independent second read of the Investigation.
- `src/services/generateBriefVersion.ts` — same file, a further edit (corrected ledger source,
 `02-ARCHITECTURE.md` §4.8): immediately after Extraction (`:333`) resolves, captures
 `extraction.usableSourceIds` directly as `consideredSourceArtifactIds` — NOT
 `universeSourceArtifactIds`, which is derived from `EvidenceItem` rows and so omits any
 `'content-retrieved'` source that yielded zero extracted evidence, and NOT an independent
 `getInvestigation` re-read bounded by `resolution.resolvedAt <= generationRun.startedAt` (a prior
 draft's approach), which would leave open a narrower gap: a source resolved between the run's
 start and Extraction's own read at `:333` IS actually read by Extraction, yet a `startedAt`-only
 filter would exclude it from the ledger. `usableSourceIds` closes both gaps with no timestamp
 comparison at all (§4.8). One additive `INSERT INTO generation_run_consumed_source
 (generation_run_id, source_artifact_id)` per id in `consideredSourceArtifactIds`, written at
 `:479` (Phase 3 check 1(c), the same established point in the pipeline). This is its own
 standalone `INSERT`, NOT attached to any `recordGenerationStep` call — Phase 3's
 ownership-verification checks are not a `GenerationStep` and have no `recordGenerationStep` call
 of their own to attach to. No change to what the pipeline extracts or how (§4.8).
- `src/web/apiRoutes.ts` — new route: `POST /api/investigations/:id/generation-runs` (a POST route), plus the `createGenerationRunForInvestigation` orchestration function (§4.2) as an independently unit-testable, non-HTTP-coupled function that:
 - attaches a FIRST `.catch` to `pipeline` immediately after invoking `generateBriefVersion`
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
 `GET.../workspace`'s `latestGenerationRun.outcome === 'failed'` and its steps' real recorded
 `error` text (§4.2 step 7, unchanged US-3 AC6 guarantee, relocated mechanism);
 - implements step 2's revised, tightened Generation Eligibility Rule (§4.2) in full, including the
 `'brief-generated'` branch gated on `hasEligibleNewEvidenceSinceCurrentBriefVersion` (US-13 AC2)
 and the distinct 422 `reason` string for "no new evidence" vs. `'blocked'` ineligibility;
 - attaches a SECOND, separate `.catch` to `pipeline`, only after `generationRun = await runCreated` has resolved successfully, so
 it structurally can never fire before `generationRun` is assigned and can never observe a
 pre-Phase-1 rejection (those are already fully handled by the synchronization catch and the
 `try`/`catch` above). **This handler never infers persisted state from the rejection's
 JavaScript error class** — a typed error class is not proof the finalizing DB write actually
 committed. It instead calls the new `getGenerationRunOutcome(generationRunId)` read helper
 (new, small addition to `src/services/provenanceRecorder.ts`) to READ the run's real persisted
 `outcome` first. If that read itself throws, the rejection is consumed and logged, never
 rethrown, and no write is attempted. If the read succeeds and shows the run is already terminal
 (`'succeeded'`/`'failed'`), it logs only — no further write, regardless of err's class. If the
 read shows the run is still `'in-progress'`, it performs a guarded, best-effort terminal write
 (`recordGenerationStep` called BEFORE `finalizeGenerationRun` — binding ordering, §4.2 step
 5b), never assuming that write itself succeeds; if the write throws, that rejection is likewise
 consumed and logged, never left as a second unhandled rejection.
- `src/services/getInvestigationWorkspace.ts` — edit:
 (a) extend `generationEligible`'s computation to also treat `'generation-failed'` as an eligible
 status (retry, US-6 AC3);
 (b) add `hasEligibleNewEvidenceSinceCurrentBriefVersion(investigationId)` (§4.8) — querying
 `source_artifact.resolution_status` (excludes unreachable/unresolved/empty in one column check)
 and anti-joining against the new `generation_run_consumed_source` table (migration `012`, this
 slice — the real per-run record of exactly which `source_artifact` rows the current
 `BriefVersion`'s producing `GenerationRun` actually read), both by `source_artifact.id` (excludes
 already-reflected-in-the-current-Brief) and by `canonical_identity`/`resolved_content_fingerprint`
 equality (migration `014`, §4.8 — corrected 2026-09-05 per independent review; replaces trimmed
 `raw` content equality, which misses equivalent URLs/redirects with different raw text) against
 every consumed row's own canonical identity/fingerprint (excludes duplicate-of-consumed under a
 newly-submitted, distinctly-`id`d
 row) — no coupling to `submitSources`/`resolveInvestigationSources`; wired into
 `InvestigationWorkspaceView.newEvidenceSinceCurrentBriefVersion` and into `generationEligible`'s
 `'brief-generated'` branch;
 (c) wire the real, derived `STALE_THRESHOLD_MS` into `computeLivenessState`'s (defined and
 unit-tested as a pure parameterized function in C2-S2, §4.9's sequencing fix) ONE call site in
 `getInvestigationWorkspace`, replacing C2-S2's explicit test-only placeholder value, and exercise
 it against real in-progress and stale runs for the first time this slice can produce one.
- `src/web/apiRoutes.ts` — same file as `createGenerationRunForInvestigation` above, new route:
 `POST /api/investigations/:id/generation-runs/:runId/abandon`, plus `abandonGenerationRun`
 (`02-ARCHITECTURE.md` §1.6, new) as a small, independently unit-testable orchestration function
 filed beside `createGenerationRunForInvestigation` — calling the SAME
 `computeLivenessState` this slice wires above, and `recordGenerationStep`/`finalizeGenerationRun`/
 `createGenerationRun`/`transitionInvestigationStatus` (all `src/services/provenanceRecorder.ts`
 except the last, ALL FOUR EDITED this slice per `02-ARCHITECTURE.md` §1.6):
 - `createGenerationRun`'s `INSERT` gains `RETURNING fence_token` (its other columns/values
 unchanged); the returned `GenerationRun` (`src/types/domain.ts`, edited to add a `fenceToken:
 number` field) carries this token back to `generateBriefVersion`'s Phase 1, which holds it
 in-memory for every subsequent write this run makes.
 - `recordGenerationStep` and `finalizeGenerationRun` each gain a required `fenceToken: number`
 field on their existing single object parameter (object parameter, not positional — matching
 this file's existing convention). `recordGenerationStep`'s `INSERT` is preceded by a guarded
 `UPDATE generation_run SET lease_heartbeat_at = now() WHERE id = $1 AND fence_token = $2`; a
 `rowCount === 0` result is a silent no-op (no `GenerationStep` is inserted) — the caller has been
 fenced out. `finalizeGenerationRun`'s `SELECT`-then-`UPDATE` is replaced with a single atomic
 `UPDATE... WHERE id = $1 AND outcome = 'in-progress' AND fence_token = $7 RETURNING
 investigation_id, started_at, runtime_identifier`, checked row count, and a new
 `GenerationRunAlreadyFinalizedError` thrown on `rowCount === 0` (covers both a lost outcome race
 and a fenced-out token — the caller does not need to distinguish which).
 - `runStepWithProvenance` (`src/services/provenanceRecorder.ts:328-390`) — the wrapper
 `generateBriefVersion.ts`'s seven Slice 4-7 component steps (Extraction & Clustering Engine,
 Demand Analyzer, Personal Pull Extractor, Landscape Researcher, Gap Hypothesis Generator,
 Uncertainty Compiler, Recommendation Engine — `generateBriefVersion.ts:333,372,384,393,411,431,452`)
 call instead of calling `recordGenerationStep` directly — also gains a required `fenceToken: number`
 field on its own input, threaded straight through to BOTH of its own internal
 `recordGenerationStep` calls (success path `:348-362`, catch path `:370-386`), so these seven
 progress-writes renew the heartbeat and honor the fence exactly like the file's three direct
 `recordGenerationStep` call sites do — without this edit, fencing/heartbeat is invisible to these
 seven call sites entirely.
 - Every existing caller of `recordGenerationStep`/`finalizeGenerationRun`/`runStepWithProvenance` —
 `generateBriefVersion`'s three DIRECT `recordGenerationStep` call sites (`:272`, `:573`, `:649`)
 plus the fourth this slice adds to the `InvalidSupersedeTargetError` preflight catch (above), its
 SEVEN `runStepWithProvenance` call sites (`:333,372,384,393,411,431,452`, above), its eight
 `finalizeGenerationRun` call sites (`:298`, `:313`, `:324`, `:585`, `:663`, `:677`, `:695`, `:713`),
 and §4.2's meta-failure safety net above — is updated to pass the `fenceToken` captured from
 `createGenerationRun`'s return value at Phase 1, and (for `finalizeGenerationRun`) to catch
 `GenerationRunAlreadyFinalizedError`,
 with seven of the eight `finalizeGenerationRun` sites treating it as a graceful no-op and exactly
 one (`generateBriefVersion.ts:677`, the success-path finalization inside the still-open Phase-4
 transaction) instead letting it propagate so that transaction rolls back rather than committing a
 Brief the system's own audit trail simultaneously records as a failed run (§1.6's full
 disposition). `generateBriefVersion.ts` also gains a local `try`/`catch` wrapped immediately
 around `:677`'s `finalizeGenerationRun` call, catching only `GenerationRunAlreadyFinalizedError`,
 issuing its own `ROLLBACK`, then throwing the new `GenerationRunLostFinalizationRaceError`
 (extends `Error`, carries `generationRunId`); this new error class is added to both the
 `:681-684` inner catch's and the `:700-707` outer catch's rethrow-without-refinalizing lists
 (§1.6) — mechanism (a), not (b).
- `src/client/screens/InvestigationWorkspaceScreen.tsx` — edit: add polling `useEffect` keyed on
 `workspace.latestGenerationRun?.livenessState === 'active'` (polling at an interval governed by `POLL_INTERVAL_MS` —
 engineering-owned, derived during THIS slice's implementation from real measured generation
 timing, expected concurrency, and endpoint cost, per `02-ARCHITECTURE.md` §4.9's derivation
 methodology; no specific value is asserted here — see Implementation Notes below for the
 derivation requirement); clears on transition to `'terminal'` OR `'stale-or-interrupted'`.
- `src/client/components/GenerateButton.tsx` (new — the shared component the "Output Verification"
 checklist below already claims this slice owns; explicit Files entry closes that gap) — one
 component, one behavioral contract, taking `label`/`enabled`/`onClick` props; hosted by
 `OpenEligiblePanel` (this slice, "Start generation"), `GenerationFailedPanel` (this slice, "Retry
 generation"), and `BriefGeneratedSummaryPanel` (C2-S4, "Regenerate with new evidence") — three
 label states, one component, never three divergent implementations.
- `src/client/components/OutcomeStatusPanel/OpenEligiblePanel.tsx` — edit (created C2-S2): mounts the
 shared `GenerateButton` component (above), enabled iff `workspace.generationEligible === true`,
 labeled "Start generation" when hosted here.
- `src/client/components/OutcomeStatusPanel/GenerationProgressPanel.tsx` (new) — persisted-steps
 list including real per-step `modelIdentifier`/`validationRecords`/`toolInvocations` and the run's
 real `webSearchQueries` array (these fields exist in the read model
 since C2-S2; this is the first slice to render them); fixed honest-gap sentence when
 `livenessState === 'active'`; **a distinct, visually-non-identical stale/interrupted disclosure
 when `livenessState === 'stale-or-interrupted'`** — "This run has not reported
 progress recently and may have been interrupted." plus a real, rendered **"Refresh status"** and **"Abandon and retry"** (§1.6, new)
 button that re-issues one
 `GET.../workspace` read on click, independent of the (now-cleared) automatic polling interval —
 never a claim that no further progress can ever be recorded. The "Abandon and retry" button calls
 `POST.../generation-runs/:runId/abandon` (§1.6) and, on success, triggers a workspace re-fetch.
 Automatic polling stops the instant `livenessState` transitions to
 `'stale-or-interrupted'`, same as on a terminal outcome — `Refresh status` remains available and
 keeps working for as long as the run stays non-terminal, and `livenessState` may honestly revert
 to `'active'` on a subsequent refresh if fresh progress has in fact landed. No percent/"currently
 executing"/"thinking" claim in either state. **Rendered only when `workspace.briefs.length === 0`
 (no `BriefVersion` exists yet — the first-ever-run case) or the displayed `BriefVersion` is
 current (§5.4 rule 1, this checkpoint; `briefs.length === 0` disjunct closes the first-run
 reachability gap) — never reachable, and never mounts "Abandon and retry" or any other control,
 while viewing a prior version (a prior version can only be viewed when `briefs.length > 0`); that
 case instead renders `ViewingPriorVersionPanel`'s read-only notice, C2-S4's own scope.**
- `src/client/components/OutcomeStatusPanel/GenerationFailedPanel.tsx` (new) — `investigation.statusReason`
 when present; **otherwise falls back to the failed run's
 own persisted step/error text, per `02-ARCHITECTURE.md` §5.4 rule 3's content contract** — never a
 blank/generic message in either case; failed run's persisted steps (including GenerationStep's own fields),
 the shared `GenerateButton` hosted here, labeled "Retry generation," enabled per the same
 server-computed `generationEligible` — `'generation-failed'` is an eligible status per §4.2 — and,
 per `03-UI-SPEC.md`'s Component Hierarchy (the Generation-Failed retry mount point), a second real,
 rendered instance of `AddSourceInline` (reused unmodified from C2-S2) for adding new source
 evidence before retrying. Selected only when the displayed `BriefVersion` is current — §5.4 rule 2
 (`ViewingPriorVersionPanel`) precedes and wins for any prior-version view, including a failed
 correction.
- `src/client/api.ts` — add `createGenerationRun`.

**Implementation Notes:**
- Concurrency guard is the migration's partial unique index + `INSERT` failure mapped to `409` — no
 check-then-act race (§4.2 step 5).
- `supersedesVersionId` and `runtimeIdentifier` are determined server-side only — no client-supplied
 flag for either.
- Two `.catch` handlers exist, at two different points: the
 FIRST is attached immediately after `generateBriefVersion` is invoked (step 5) and exists purely
 to relay a pre-Phase-1 rejection into `runCreated` for the synchronous `try`/`catch` below — it
 never references `generationRun` and never writes a terminal record. The SECOND is attached
 separately, only after `generationRun = await runCreated` has resolved successfully (step 5b) —
 it exists for Node process hygiene (preventing an unhandled-rejection crash on the now-un-awaited
 `pipeline`) AND as the finalization safety net. If that read shows the run already
 terminal, it logs only (the ordinary case, where `generateBriefVersion` already durably finalized
 its own row per §1.3). If the read shows the run still `'in-progress'`, it performs one guarded,
 best-effort terminal write (never assumed to succeed) — the one case §1.3's re-verification found
 `generateBriefVersion` cannot always finalize on its own (a meta-failure of the finalization write
 path itself). The safety net's own read or write rejecting is consumed and logged in both cases,
 never rethrown, never a second unhandled rejection.
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
- **US-5 AC3, joint completion (half 2 of 2).** This slice supplies the other half of AC3: the
 real, clickable `GenerateButton` in `OpenEligiblePanel`, and this is the FIRST slice at which the
 complete AC3 chain — real add-source (C2-S2) → real re-resolution → real status returns to
 `'open'` → real click on a real trigger control → real generation request → honest progress to a
 terminal outcome — can be demonstrated end to end in one continuous browser session. Accordingly,
 this slice's own Done-When is the one place in this roadmap that claims US-5 AC3 complete — it does
 so via the integrated test and browser demonstration below, not via this slice's code in isolation;
 C2-S2's own mechanism remains a necessary precondition, not restated or reproduced here.

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
- [ ] `createGenerationRunForInvestigation`: not-found and ineligible (`blocked`) — ordinary,
 request-level tests through the real function, no seam.
- [ ] **Two-tier concurrency coverage: (a)** unique-index-level proof.
 Proves the partial unique index itself — the actual correctness
 guarantee — deterministically allows exactly one of two racing inserts. The real statement
 under test is `createGenerationRun`'s own `INSERT INTO generation_run (...) VALUES ($1, $2,
 NULL, 'in-progress', $3, NULL, $4, '{}', '{}')` (`src/services/provenanceRecorder.ts`,
 `createGenerationRun`, currently issued on the module-level `pool` with no `client` parameter
 — it is reached via `generateBriefVersion`'s Phase 1, NOT via any SQL the connector itself
 issues; the connector issues no SQL at step 5, it calls `generateBriefVersion`, which calls
 `createGenerationRun`). The test opens two real, separate `pool` clients (`pool.connect`,
 not the module `pool` object itself, so each side holds its own session/transaction) and
 drives them through the REAL Postgres locking sequence, not a simplified "insert-then-commit-
 both" shape that would hang:
 1. Client A: `BEGIN`, then execute the real INSERT above (same `investigation_id`, distinct
 `id`). Do NOT commit yet.
 2. Client B: `BEGIN`, then issue the same real INSERT (same `investigation_id`, its own
 distinct `id`) — but do NOT `await` this call before proceeding to step 3. Postgres will
 BLOCK B's INSERT the moment it attempts to acquire the partial unique index entry A already
 holds uncommitted; B's `INSERT` does not return (resolve or reject) until A's transaction
 ends. Awaiting it here before A commits would hang the test.
 3. Client A: `COMMIT`. This is what unblocks B — B's `INSERT` was waiting on A's row lock, not
 on A's `COMMIT` per se, but the lock is only released at A's transaction end, so A's commit
 is the actual unblocking event.
 4. NOW await client B's still-pending INSERT promise from step 2. It resolves at this point —
 not at any `COMMIT` of B's own — because Postgres re-checks the unique constraint against
 A's now-committed row as soon as B's INSERT is unblocked, and raises the conflict
 immediately, at the INSERT statement itself. Assert this rejects with a real Postgres error
 whose `code` is `'23505'`.
 5. Client B: `ROLLBACK` (the failed INSERT has left B's transaction in an aborted state; a
 `COMMIT` here would itself error — `ROLLBACK` is the correct, and only, way to close it).
 This needs no request-level timing, no hook, and no seam, because it never invokes the
 connector function at all — it tests the constraint `createGenerationRun`'s real INSERT
 depends on, in isolation, via two independently-controlled connections whose ordering
 (A's uncommitted insert, B's blocked insert, A's commit, B's unblock-and-reject) is exactly
 how Postgres actually serializes this conflict — not a hypothetical "both commit, one fails"
 shape that does not describe real Postgres row-lock behavior.
 **(b) HTTP-level connector test (existing, 422-vs-409 disposition work elsewhere in this
 document) — unchanged, does not attempt to force the race.** Two real HTTP requests against
 `POST.../generation-runs` for the same Investigation, issued without artificial synchronization
 — asserts each individual response is either a well-formed `409` (real `23505` caught and
 mapped) or a well-formed `422` (lost the eligibility read too), i.e. that the connector's own
 response-mapping code is correct for whichever outcome real scheduling produces, WITHOUT
 asserting which of the two outcomes occurs on any given run (scheduling-dependent and honestly
 left nondeterministic at the HTTP layer, since that is the layer's real behavior) — this is the
 test that actually exercises `createGenerationRunForInvestigation`'s own code path end to end;
 tier (a) above exercises the constraint alone, deterministically, and is not a substitute for
 it.
- [ ] **New, required — terminal-outcome lookup correctness**: a real 23505 unique-violation is triggered, and BEFORE the connector's own
 conflict lookup runs, the conflicting `GenerationRun` row is made to reach a real terminal
 outcome (test seeds/finalizes it directly between the INSERT rejection and the lookup) —
 asserts the connector's lookup query is NOT filtered on `outcome = 'in-progress'`, correctly
 finds the now-terminal row, and returns `stillInProgress: false` rather than crashing or
 fabricating a still-in-progress conflict; a paired ordinary-case test (conflicting run still
 genuinely in-progress at lookup time) asserts `stillInProgress: true`. A third test asserts the
 lookup query never dereferences an empty `rows[0]` — verified by the query's own `LIMIT 1`
 row-count check being exercised, not assumed.
- [ ] **New, required — non-blocking response proof**: an integration test that issues `POST
.../generation-runs` against a real Investigation whose `generateBriefVersion` pipeline is
 made observably slow (e.g. a test-only delay hook or a multi-step real generation), asserts
 the `POST` resolves `202` BEFORE the pipeline itself reaches a terminal outcome, and then
 asserts an immediate `GET.../workspace` call in the same test returns
 `latestGenerationRun.outcome === 'in-progress'` while the pipeline is still running — this is
 the service-level proof that the response genuinely does not block on full completion.
- [ ] **New, required — synchronization-catch mapping isolation**: this test's purpose is to
 verify the FIRST `.catch`'s (the synchronization catch's) own mapping behavior specifically
 — that a real `23505` reaching it is mapped to `409` via `isUniqueViolation` entirely before
 `generationRun` is ever assigned, with no `GenerationStep`/`GenerationRun` write attempted —
 NOT general concurrent-request handling, which the adjacent tier-(b) HTTP-level test already
 covers with its honestly-nondeterministic 409-or-422 framing. Two uncoordinated real concurrent
 HTTP `POST.../generation-runs` requests cannot deterministically force this: per §4.2 step 2, the ordinary outcome for two concurrent POSTs is `422` (the pre-`INSERT`
 eligibility read fires first for both); `409` only occurs in the narrow both-pass-eligibility-
 then-race-to-`INSERT` window, which is exactly what tier-(b) already asserts is
 non-deterministic. This test therefore uses the SAME deterministic two-connection SQL-level
 control tier-(a) above establishes (`pool.connect`, real `BEGIN`/uncommitted `INSERT`/
 `COMMIT` sequencing) to reliably force the `23505` — but, unlike tier-(a), drives it through
 the connector's OWN code path, not raw SQL against the table directly: seed connection A with
 an in-flight, uncommitted `createGenerationRun` INSERT (held open via a test-only hook/seam on
 the connector's call into `provenanceRecorder.ts`, or by directly invoking
 `createGenerationRunForInvestigation` for connection A and pausing it after its `INSERT` but
 before commit), then invoke the connector's real request-handling path for connection B against
 the same Investigation while A is still uncommitted, then commit A. B's connector-level call
 is what must genuinely receive the real `23505` from the real partial unique index and route it
 through its own synchronization catch. Assert B's response is `409`, mapped via
 `isUniqueViolation`, and that no `GenerationStep`/`GenerationRun` write was attempted by this
 handler itself for B's request (it only relays the rejection into `runCreated`) — this is
 deterministic because the interleaving (A uncommitted, B's real INSERT attempt, A's commit,
 B's unblock-and-reject) is forced by the harness, not left to real scheduling, exactly as
 tier-(a) forces it at the raw-SQL layer.
- [ ] **New, required — finalization safety-net write-order proof**: a test double/injection point forces `finalizeGenerationRun` (or
 `attemptGenerationFailedTransition`) to throw during a real `generateBriefVersion` run,
 already inside one of its own catch/failRun blocks, AFTER a real `GenerationRun` row already
 exists (i.e. after `onRunCreated` has already fired and `generationRun` is genuinely assigned
 on the connector side) — a genuine meta-failure of the finalization write path itself, distinct
 from an ordinary business-logic/DB error — and asserts the connector's own SECOND
 `pipeline.catch` handler (§4.2 step 5b) calls `getGenerationRunOutcome(generationRun.id)`,
 observes the real persisted row is still `'in-progress'` (the finalization write never landed
 because it threw), and itself writes a terminal `outcome: 'failed'` `GenerationStep`/
 `GenerationRun` for `generationRun.id` before logging — confirmed by a real, direct row-read
 after the test that the run is NOT left permanently `'in-progress'` with no terminal record.
 The same test additionally asserts WRITE ORDER: the terminal `GenerationStep` insert's
 timestamp/call-order precedes `finalizeGenerationRun`'s call (record-step-before-finalize —
 `02-ARCHITECTURE.md` §4.2 step 5b, binding constraint 10) — via a spy/mock on both calls
 asserting invocation order, or an equivalent mechanism.
- [ ] **New, required — read-before-write discrimination, never error-class inference**: given a real `GenerationRun` whose finalization already durably succeeded (a
 typed-error path that DID commit its terminal write), a test forces the SAME typed error class
 to reach the second `.catch` handler (e.g. by re-invoking the handler directly, or by
 constructing the race), and asserts the handler's `getGenerationRunOutcome` read observes the
 row is already terminal and performs NO further write (no additional `GenerationStep`
 inserted, no second finalization timestamp) — proving the handler's decision is driven by the
 READ, not by the error's class, since the same error class must be handled differently
 (log-only vs. best-effort write) depending on what the read finds. A further test asserts that
 when the safety net's own `getGenerationRunOutcome` read itself throws (a real injected DB
 error), the handler consumes and logs that rejection and attempts no write — confirmed by no
 uncaught/unhandled rejection surfacing in the test process and no row mutation occurring.
- [ ] `createGenerationRunForInvestigation`: given a real `'brief-generated'` Investigation (this
 slice's own demonstration produces one) with no source added since the current `BriefVersion`,
 the request is rejected `422` with a `reason` naming "no new evidence," distinct in message
 from the `'blocked'` `422`; given a genuinely new, usable, not-already-consumed source, the
 same request is accepted and `supersedesVersionId` is set to the current
 `ProblemBrief.currentVersionId` (US-13 AC2, AC3, service-level, real DB rows).
- [ ] **New, required — `InvalidSupersedeTargetError` step recording (US-3 AC6)**: a real correction request whose `supersedesVersionId` no longer
 matches `ProblemBrief.currentVersionId` (a genuine race, real seeded rows) throws
 `InvalidSupersedeTargetError`; the resulting `GenerationRun` is asserted to carry exactly one
 real `GenerationStep` with `outcome: 'failed'` and `error` equal to the real thrown message
 text (not empty, not generic) — proving `steps: []` no longer reaches the browser for this
 error class, and the workspace read model surfaces distinct text for it same as the other two
 error classes.
- [ ] `hasEligibleNewEvidenceSinceCurrentBriefVersion`: `false` when no `ProblemBrief`
 exists yet; `false` for a source whose `resolution_status` is `unreachable` or not yet
 resolved; `false` for a `reachable-no-content` (empty) source; `false` for a source whose
 `canonical_identity` OR `resolved_content_fingerprint` (migration `014`, §4.8, corrected
 2026-09-05 per independent review — replaces trimmed-`raw` string equality, which misses
 equivalent URLs/redirects with different raw text) matches a source already consumed by the
 current `BriefVersion`'s evidence chain, even as a distinct `Source` row; `true` given a real,
 genuinely new, `content-retrieved` source not already consumed — real seeded rows against real
 tables, not mocked. **New, required — canonical-identity dedup, distinct raw strings (Sol
 finding)**: two distinct `source_artifact` rows with different raw submitted strings (e.g. a
 shortlink and its resolved destination URL, or the same URL with/without a tracking parameter)
 but the same `canonical_identity` or the same `resolved_content_fingerprint` — both correctly
 disqualified as duplicates; asserts the check is NOT satisfied by raw string/URL text equality
 alone (a real row pair with distinct raw text and matching canonical identity must be excluded
 even though a naive `trim(raw)` comparison would have wrongly admitted it).
- [ ] **New, required — mid-run over/under-recording guard, ledgered against Extraction's own real
 read set (§4.8), not a `started_at` boundary**: a real source resolved to `content-retrieved`
 with `resolution_resolved_at` AFTER `generateBriefVersion`'s own Extraction step has already
 executed its real read (`generateBriefVersion.ts:333` / `extractClaimsAndEvidence.ts:391`'s
 `usableSourceIds` computation) does NOT get a `generation_run_consumed_source` row for that run,
 even though the run's later `:479` ledger-write read (after Extraction/Landscape have already
 executed) observes it as `content-retrieved` — because `consideredSourceArtifactIds` is captured
 directly from `extraction.usableSourceIds`, Extraction's own already-executed read, never
 re-derived at `:479` — asserted directly against real seeded rows and the real ledger table, not
 mocked; a source resolved BEFORE Extraction's own read at `:333`/`:391` DOES get a row, whether
 that resolution happened before or after the run's `started_at` (a source resolved in the window
 between `started_at` and Extraction's own read is still correctly recorded consumed, since
 Extraction's real read set includes it — a `started_at`-bounded check would have wrongly excluded
 this case, which is exactly the gap this ledger design closes). Both cases feed
 `hasEligibleNewEvidenceSinceCurrentBriefVersion`: the source resolved after Extraction's own read
 correctly remains eligible for a subsequent correction; the source resolved before Extraction's
 own read correctly does not.
- [ ] **New, required — "Refresh status" continued observation**: given a real run whose `livenessState` reads
 `'stale-or-interrupted'` (real elapsed time exceeds the measured `STALE_THRESHOLD_MS`, no
 new `GenerationStep` written), a click on the rendered "Refresh status" control issues one
 real `GET.../workspace` request; a paired test seeds a real new `GenerationStep` for that run
 between two clicks and asserts the SECOND click's response shows `livenessState === 'active'`
 again (a genuine reversion, proving observation continues honestly past the threshold rather
 than being permanently disabled); confirms no `GET.../workspace` call ever mutates any row
 (read-only assertion holds for both the automatic poll and the manual refresh path).
- [ ] **New, required — "Abandon and retry" recovery (`02-ARCHITECTURE.md` §1.6, whole-package
 convergence)**: `POST.../generation-runs/:runId/abandon` rejected `409` when
 `livenessState === 'active'`; rejected `409` when `outcome !== 'in-progress'`; against a real,
 genuinely stale non-correction run, writes exactly one `GenerationStep`, finalizes
 `outcome: 'failed'`, transitions the Investigation to `'generation-failed'`, and a subsequent
 `POST.../generation-runs` for the same Investigation succeeds (real proof the concurrency
 guard is cleared); against a real, genuinely stale CORRECTION run (an Investigation with an
 existing `ProblemBrief`), the same abandon call leaves `investigation.status` unchanged
 (`'brief-generated'`, no transition attempted) — matching `attemptGenerationFailedTransition`'s
 existing correction behavior; `finalizeGenerationRun` called twice for the same
 `generationRunId` (a real, direct call, not mocked) — the second call throws
 `GenerationRunAlreadyFinalizedError` (`02-ARCHITECTURE.md` §1.6, item
 1 — this slice implements §1.6's atomic guarded `UPDATE... WHERE outcome = 'in-progress'`
 plus checked row count, replacing the prior non-atomic check-then-act in
 `provenanceRecorder.ts:139-193`) — the concurrency-safety guarantee this action's
 split-brain-avoidance argument depends on, exercised directly. **New, required — genuine race
 (`02-ARCHITECTURE.md` §1.6)**: two near-simultaneous `finalizeGenerationRun` calls for the same
 `generationRunId` with different outcomes, issued via `Promise.allSettled` with no artificial
 delay between them — exactly one resolves normally and the persisted row's `outcome` matches
 it; the other rejects with `GenerationRunAlreadyFinalizedError`. A further test drives this
 through `abandonGenerationRun` itself: seed a run, call `finalizeGenerationRun` directly to
 simulate the legitimate pipeline completing first, then call `abandonGenerationRun` for the
 same run — asserts it does NOT respond as if it had just finalized the run `'failed'`, but
 instead re-reads and responds with the run's real, already-persisted outcome (§1.6 step 4's own branch); AND asserts `GenerationStep[]` for this
 run contains NO step with `component: 'Operator abandonment'` — the lost-race case must leave
 no fabricated abandonment record behind, not merely a corrected response.
- [ ] **New, required — heartbeat-vs-fence race (Sol finding, `02-ARCHITECTURE.md` §1.6)**: seed a
 real `'in-progress'` run whose `lease_heartbeat_at` is stale enough to classify
 `livenessState === 'stale-or-interrupted'`; between reading that stale state and issuing
 `abandonGenerationRun`'s fence-increment `UPDATE`, commit a real `recordGenerationStep` call for
 the SAME run (a genuine heartbeat renewal, e.g. a resumed worker) — asserts the abandonment
 `UPDATE` returns `rowCount === 0` (because it is now gated on the exact `lease_heartbeat_at`
 value read at the stale-check, per the corrected architecture, and that value has since
 changed) and the endpoint responds `409`, NOT a successful abandonment — proving a run that
 resumes between stale-classification and the abandon click cannot be fenced out from under
 itself. Without this gate, the fence-increment used only `id`/`outcome`/the previously-read
 fence token and would have succeeded regardless of the intervening heartbeat renewal.
- [ ] **New, required — unfenced pre-Phase-4 writes cannot survive abandonment (Sol finding,
 `02-ARCHITECTURE.md` §1.6's `beginFencedWrite`)**: seed a real `GenerationRun`, advance it past
 Extraction (a real `extractClaimsAndEvidence`/`extractClaimsAndEvidenceForSourceArtifacts` call
 that has begun but not yet committed its evidence/claim writes, or an equivalent
 test-controlled pause point), then call `abandonGenerationRun` for the same run from a second
 connection — asserts the paused writer's subsequent evidence/claim/landscape-search/
 consumed-source-ledger writes are rejected with `GenerationRunFencedOutError` (via
 `beginFencedWrite`'s token check) rather than committing, and a direct row-read after the test
 confirms none of those rows exist for the abandoned run. A paired test then starts a genuine
 retry (`createGenerationRun` for the same Investigation) and asserts its own Extraction read
 (`extraction.usableSourceIds`) reflects only its own run's real evidence — none of the abandoned
 run's rejected writes are visible to or consumed by the retry. This is the test that closes the
 gap an earlier revision of this document left open by treating these writes as harmless because
 "accretive" — verified false against `getEvidenceForInvestigation.ts`/
 `getClaimVersionsForInvestigation.ts` (no run filter, read unfiltered by run at the start of
 every run) during independent review.
- [ ] **New, required — lost finalization race propagation**: seed a real
 `'in-progress'` `GenerationRun` mid-Phase-4 (a real transaction open on a real assembled
 `BriefVersion`, immediately before the `:677` finalize call); before that call runs, call
 `finalizeGenerationRun({ outcome: 'failed' })` directly for the SAME `generationRunId` to
 simulate a concurrent `abandonGenerationRun` winning the race; then let `:677`'s own call
 proceed and assert it throws `GenerationRunLostFinalizationRaceError` (not swallowed, not
 re-thrown as `BriefGenerationFailedError`); assert the Phase-4 transaction rolled back — no
 `BriefVersion` row persisted, `ProblemBrief.currentVersionId` NOT advanced, Investigation
 status NOT transitioned to `'brief-generated'`; assert `finalizeGenerationRun` was NOT called a
 second time for this run (no re-finalization, no re-recorded `'generation-failed'` step); and
 assert the run's final persisted `outcome` remains `'failed'` (the abandon's own write), never
 overwritten by the would-have-succeeded pipeline.
- [ ] `getInvestigationWorkspace`: `generationRuns`/`latestGenerationRun`/`generationEligible`
 correctly reflect a real in-progress, succeeded, and failed run each; a `'generation-failed'`
 Investigation reports `generationEligible: true`; a `'brief-generated'` Investigation's
 `generationEligible` and `newEvidenceSinceCurrentBriefVersion` both track the helper's real
 result; `livenessState` is `'active'` for a real, recently-progressing in-progress run and
 `'stale-or-interrupted'` for a real in-progress run directly seeded with a stale
 `startedAt`/last-step-completion beyond the derived `STALE_THRESHOLD_MS`.
- [ ] `GenerationProgressPanel`, CURRENT-version case only (this component is scoped to
 current-version display; the prior-version case is C2-S4's `ViewingPriorVersionPanel`, see
 that slice's own negative-assertion test): renders exactly the persisted `steps` array
 including real `validationRecords`/`toolInvocations`; renders the run's `webSearchQueries`;
 renders the fixed gap sentence when `livenessState === 'active'`; renders the distinct,
 differently-styled stale/interrupted disclosure, WITH both "Refresh status" and "Abandon and
 retry" controls, when `livenessState === 'stale-or-interrupted'`; renders neither control when
 `livenessState === 'active'`; never renders a percent or "currently executing" claim beyond
 the last row.
- [ ] Polling: integration/component test asserts no further fetch after a terminal `outcome` AND
 no further fetch after a transition to `'stale-or-interrupted'` — two distinct assertions.
- [ ] `GenerateButton`: renders labeled "Start generation" in `OpenEligiblePanel` and "Retry
 generation" in `GenerationFailedPanel`, for the same underlying component.
- [ ] **Integrated test (US-5 AC3)**: Blocked → real `AddSourceInline` submission (C2-S2's real
 connector) → `status` returns to `'open'` → real `POST.../generation-runs` accepted → run
 progresses to a terminal outcome — the full path, exercised as one continuous test, not a
 partial mock, and not split across two separate per-slice tests that individually assert only
 half the chain.
- [ ] Frank forge-gate: PASS.

**Browser Demonstration (required — real, rendered screen, real clicks, real persisted data):**
- From an eligible Open workspace (from C2-S1/C2-S2's real resolved source), click the real,
 rendered "Start generation" control. **Confirm, by watching the actual rendered screen through at
 least one poll tick, that a real in-progress run — with real persisted steps, not a placeholder —
 is visible BEFORE the run reaches its terminal outcome** (the live, browser-observed proof of
 the Generation Run Connector's non-blocking start — the response returning before completion is not merely inferred
 from network tooling, it is observed as a genuinely different, real screen state that renders and
 is visible for a real interval before the terminal state replaces it). Confirm the panel shows
 only persisted steps and the fixed honest-gap sentence — no percent, no "currently executing," no
 "thinking" copy. Confirm polling stops the moment the run reaches success or failure.
- Trigger a second generation request while the first is still in-progress (e.g. a second browser
 tab, a real click on its own rendered "Start generation" control) and confirm the UI surfaces a
 `422` inline (`02-ARCHITECTURE.md` §4.2 step 2 — the ordinary
 visible-in-progress case fails the Generation Eligibility Rule before any `INSERT` is attempted, so
 it is `422`, not `409`; `409` is reserved for the narrow simultaneous-`INSERT` race exercised only
 by this slice's direct concurrent-request test, not by this browser demonstration), naming the
 reason ("a generation run is already in progress for this investigation"), with no duplicate run
 created.
- **Stale/interrupted disclosure**: using a real in-progress `GenerationRun` seeded (via
 this slice's own test/Forge-verification harness) with no step progress beyond the derived
 `STALE_THRESHOLD_MS`, load or reload the workspace in the browser and confirm the rendered screen
 shows the distinct stale/interrupted disclosure — not the ordinary in-progress rendering — and
 confirm, by observing the rendered screen over a further real interval, that no further visible
 state change/poll-driven update occurs (polling has genuinely stopped).
- Reach a genuine Generation-Failed outcome (a real failure condition, not simulated) and confirm
 `statusReason` and the failed run's steps render on screen; click the real "Retry generation"
 control and confirm a new, separate `GenerationRun` is created and the prior failed run remains
 visible.
- **Full US-5 AC3 / US-8 path live**: from a genuinely Blocked Investigation, use the real,
 rendered `AddSourceInline` form to add a reachable source, confirm status returns to `'open'` on
 the rendered screen, click the real "Start generation" control, and watch it progress to a
 terminal outcome — all in the same workspace URL, no restart, entirely through real clicks on the
 real rendered surface. This single demonstration is what satisfies US-5 AC3 for this checkpoint —
 neither this bullet's constituent halves nor any other slice's demonstration substitutes for it.
- **Abandon and retry recovery, live**: seed a genuinely stale/
 interrupted `GenerationRun` (the same seeding mechanism as the stale/interrupted-disclosure bullet
 above), load the workspace in the browser, confirm the rendered "Abandon and retry" control is
 present, click it, and confirm on the real rendered screen that the run's stale/interrupted
 disclosure clears, the concurrency guard is lifted, and a new "Start generation" click
 successfully starts a fresh, separate `GenerationRun` — all in the same workspace URL, no restart.

**Service-Level Verification (not a browser step — proven by the tests listed above):**
- **US-13 mechanism check**: once a real generation run from this same demonstration succeeds and
 the Investigation is `'brief-generated'`, this slice's own service-level tests above (not a
 browser step) are the proof that a direct `createGenerationRunForInvestigation` call against it,
 with no new source added, is rejected with the "no new evidence" reason.

**Done When:**
- [ ] All tests above pass; Frank forge-gate PASS.
- [ ] All six browser demonstration bullets above are performed and observed against real
 persisted data, and the service-level US-13 mechanism check above is confirmed by its listed
 tests.
- [ ] The real-run measurement and `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` derivation described in
 Implementation Notes and Tests above are complete, with the derived values and their measured
 evidence recorded as code comments next to the constants.
- [ ] Stop point for Danny's product review: a real generation run can be triggered and its
 genuinely non-blocking start is visible in the browser; the run can be watched honestly,
 retried after failure, and disclosed distinctly if stale/interrupted; **the full Blocked →
 reachable source → eligible → triggered → terminal-outcome path (US-5 AC3, US-8) works
 end-to-end from the browser and is claimed complete by this slice jointly with C2-S2**; and the evidence-gated correction eligibility rule is confirmed real at the service
 level against a live `'brief-generated'` Investigation (its UI affordance follows in C2-S4).

---

## C2-S4 — Brief Review (Read Service, Panel, Provenance Rail Rendering), Version-Numbered Brief Navigation (US-1 AC5), `StatusEvent` Schema/Read Queries with Sequence Tiebreak (US-12, read-side), Evidence-Driven Correction UI (US-13)

**Goal:** A real Brief Review panel renders persisted Brief content for the current version and
for any prior version, reachable by a human-readable version number (the `.../versions/:versionNumber`
route, never a raw `BriefVersion` UUID); assigned validity state and supersession are answered by
real bitemporal queries, ordered deterministically via `StatusEvent.sequence` rather than a hardcoded fallback; and adding new evidence to a `'brief-generated'`
Investigation from the workspace becomes a real, clickable path to a correcting generation run.

**Depends On:** C2-S3 (a real `BriefVersion` must exist, produced by a browser-triggered generation
run, before there is anything to read; the evidence-gated eligibility mechanism must already exist
for this slice's UI affordance to be meaningful).

**Satisfies:** US-1 AC5 (the version-numbered `.../versions/:versionNumber` route and its
human-readable, reload-stable navigation), US-9 (a real `getBriefForReview` read service wired to a
real `BriefReviewPanel` rendering all seven required elements uncollapsed by default, plus the
Research/Provenance Rail), US-12 (read-side only — new
schema including `sequence`, `getAssignedState`, `getAssignedStateAsRecorded`, and their wiring into
`getBriefForReview`/`getInvestigationWorkspace` — `assignValidityState` itself and the
`DecisionHistoryBanner` are C2-S5's scope), US-13 (AC1's UI affordance; AC4's
new-`BriefVersion`-becomes-current and prior-version-preserved behavior, now browser-demonstrable
via the real versioned route this slice builds — AC5's decision-retrievability half, and the full
five-item demonstration, remain C2-S5's scope).

**Files:**
- `src/types/domain.ts` — add `StatusEvent` (with `sequence: number`) — schema reused verbatim
 from `problem-department-mvp/02-ARCHITECTURE.md`, restated in full in `02-ARCHITECTURE.md` §3.6.
 `AssignedValidityState` is NOT added here — it was moved to C2-S2 (a real sequencing bug: C2-S2's
 own `WorkspaceBriefSummary` references it two slices before this bullet would otherwise have
 defined it, the same class of defect already caught and fixed for
 `ReconsiderationConditionType`/`ReconsiderationCondition`/`Decision`); this slice operates on the
 already-defined type, it does not define it.
- `src/db/migrations/011_status_event.sql` (new — exact SQL per `02-ARCHITECTURE.md` §3.6, and the `reject_update_or_delete` immutability trigger; no mutable
 `status`/`validity` column added to `claim`, `claim_version`, or `brief_version`; `target_id`
 intentionally carries no FK — polymorphic target, enforced in application code, not schema).
- `src/services/validityState.ts` (new) — `getAssignedState` and `getAssignedStateAsRecorded` only,
 per `02-ARCHITECTURE.md` §4.7's two query contracts, **both using `ORDER BY effective_at DESC,
 recorded_at DESC, sequence DESC LIMIT 1` as their "latest" resolution** — the
 `sequence` column is the deterministic tiebreak when two `StatusEvent`s share identical
 `effective_at` AND `recorded_at`. This slice does NOT build `assignValidityState` — the writer,
 and its own write-time `InvalidValidityTargetError` validation, move to
 C2-S5, the first slice with `getDecisionsForBriefVersion` available for the writer's
 dependent-decision reconstruction step; this file is edited again, not recreated, in C2-S5.
- `src/services/getBriefForReview.ts` (new) — exact contract per `02-ARCHITECTURE.md` §3.3/§4's
 pointer to `problem-department-mvp/02-ARCHITECTURE.md` §4 (unchanged shape); `assignedState` now
 resolves via a real, unconditional call to `getAssignedState({ targetType: 'brief-version' |
 'claim-version', targetId })` (§4.7 "Read-side wiring") — the query is real as of this slice, and
 correctly still resolves `'valid'` for every target given the zero `StatusEvent` rows this
 checkpoint's own surface can produce (no browser-reachable writer — Out of Scope), which is
 `getAssignedState`'s own documented no-rows fallback, not a special case coded here. **`priorDecisions` interim value** — closes a real sequencing gap: `getDecisionsForBriefVersion`
 and migration `010` (`decision`/`reconsideration_condition`) do not exist until C2-S5, so THIS
 slice's `getBriefForReview` returns `priorDecisions: []` unconditionally — a real, correct answer
 ("no Decision has ever been recorded, because the table doesn't exist yet"), not a placeholder
 masquerading as data, matching this doc set's existing "never a different shape on empty" pattern.
 C2-S5 edits this same function to wire the real query in, per its own Files entry below.**
- `src/web/apiRoutes.ts` — new route: **`GET
 /api/investigations/:investigationId/brief-versions/by-version/:versionNumber`** (exact contract per `02-ARCHITECTURE.md` §3.1a): parses `versionNumber`
 as a positive integer (400 `invalid-version-number` before any DB lookup); resolves
 `getInvestigation(investigationId)` (404 `investigation-not-found` if none); looks up
 `SELECT id FROM brief_version WHERE problem_brief_id = $1 AND version_number = $2` (404
 `brief-version-not-found` if none); 200 body is `GetBriefForReviewResult` verbatim (no wrapper
 object) via `getBriefForReview` on the resolved internal id — that internal id is used only as a
 service-call parameter, never placed in a URL or rendered as the navigable reference.
- `src/services/getInvestigationWorkspace.ts` — edit: add step 3 of §4.4 (real `brief_version` query
 populating `briefs`, deferred from C2-S2/C2-S3), including per `BriefVersion`: `assignedState` via
 `getAssignedState({ targetType: 'brief-version', targetId: briefVersion.id })`, `isSuperseded`
 via the same structural check `getBriefForReview` uses, and `forwardSupersededByVersionNumber`
 via the same-loop lookup
 `02-ARCHITECTURE.md` §4.4 specifies: find the other `BriefVersion` in `briefs` whose own
 `supersedesVersionId` equals this one's id and return its `versionNumber`, or `null` if none.
- `src/client/components/InvestigationIdentityHeader.tsx` (edit — created C2-S2) — this is the first slice where `assignedState`/
 `isSuperseded` become real (via `getBriefForReview`/`getInvestigationWorkspace` above), so this
 slice adds the compact non-valid/supersession notice to the header — the displayed version's
 `assignedState` as a plain-language statement only when non-`'valid'`, and `isSuperseded` as a
 navigable `versionNumber`-addressed link when `true` (binding: sourced from the routed/
 displayed `GetBriefForReviewResult`, never `workspace.briefs.find(isCurrent)`). Given this
 checkpoint's own surface produces zero `StatusEvent` rows (no in-scope writer, C2-S5's
 `assignValidityState` has no browser trigger), the notice correctly renders nothing extra for
 every real Investigation this slice's own browser demonstration can produce — its non-`'valid'`
 branch is exercised by C2-S5's direct-service-call demonstration instead (§ that slice). **Also
 adds, in this same file edit: the
 BACKWARD supersession link.** Whenever the displayed version's own `supersedesVersionId` is
 non-null, renders a second, navigable link (human-readable `versionNumber`, resolved against
 `workspace.briefs`, never a raw UUID) to that specific prior version — `02-ARCHITECTURE.md`'s
 Components table entry "`InvestigationIdentityHeader` (backward link...)" and `03-UI-SPEC.md`'s
 Sections table row already specify this component as the sole owner of both directions; this Files
 entry is the one place that binds the implementation to this slice, alongside the forward
 `isSuperseded` link and non-`'valid'` notice above, since all three are one component edit.
- `src/client/App.tsx` — edit: add the SECOND `<Route>` (§5.1):
 `/departments/problem-department/investigations/:investigationId/versions/:versionNumber` —
 renders the SAME `InvestigationWorkspaceScreen` component as the first route; the version param is
 read via `useParams`, never derived from in-memory navigation history, so the URL alone is
 reload-stable.
- `src/client/screens/InvestigationWorkspaceScreen.tsx` — edit: fetch `getBriefForReview` once a
 target version is known — the routed `:versionNumber` when present, or `workspace.briefs`'
 `isCurrent: true` entry's own `versionNumber` when absent (not on every poll tick, and not
 re-fetched for identity/sources/runs, which are version-independent); add regions 3-4 rendering,
 including `RunHistoryList`'s `validationRecords`/`toolInvocations`/`webSearchQueries` fields in the
 Provenance Rail; render the header's "Version N of M" / "(current)" / (when viewing a prior
 version whose own `isSuperseded` is true) forward-link-to-its-own-immediate-successor indicator
 once ≥1 `BriefVersion` exists; render region 2's explicit
 **Version Not Found** state (`02-ARCHITECTURE.md` §5.4 rule 0) — region 1 (Investigation identity) still renders normally, but region
 2 carries NO status-derived content and mounts no generation-trigger control (`AddSourceInline`,
 `GenerateButton`) — when a routed `:versionNumber` IS PRESENT and its brief fetch 404s while the
 Investigation itself resolves; this state is never rendered on the non-versioned route merely
 because no `BriefVersion` exists yet (that ordinary pre-generation case renders region 2's normal
 status-based Open/Eligible panel per rule 4, unaffected by this rule).
- `src/client/components/OutcomeStatusPanel/BriefGeneratedSummaryPanel.tsx` (new) — compact
 confirmation + anchor-scroll link to region 3; renders only for the CURRENT version (correction
 always targets `ProblemBrief.currentVersionId`); **also hosts, per US-13 AC1**, `AddSourceInline`
 (reused unmodified from C2-S2) for resubmitting new source evidence, and the shared
 `GenerateButton` (built C2-S3), here rendering a third, real label state — "Regenerate with new
 evidence" — enabled iff `workspace.generationEligible` is `true` for this Investigation (which for
 this status requires `workspace.newEvidenceSinceCurrentBriefVersion === true`, per the tightened eligibility rule) and disabled with an honest, specific reason string otherwise ("Add a new
 source to enable a corrected Brief."); after a successful `AddSourceInline` submission, the
 workspace re-fetch is what flips this control's enabled state — `AddSourceInline` itself never
 directly triggers a generation request.
- `src/client/components/OutcomeStatusPanel/ViewingPriorVersionPanel.tsx` (new) — Outcome/Status Panel
 variant selected by `02-ARCHITECTURE.md` §5.4 rule 2 (the displayed `BriefVersion.isCurrent ===
 false`, evaluated BEFORE any run-outcome-selected/mutating variant — so this renders regardless of
 `investigation.status` and regardless of `latestGenerationRun?.outcome`, including `'failed'` AND
 `'in-progress'`): a minimal, read-only statement ("You are
 viewing a prior version of this Brief. No correction can be triggered from this view.") plus a
 navigable link forward to this version's own immediate successor (`forwardSupersededByVersionNumber`,
 the same fact `InvestigationIdentityHeader` already resolves — not necessarily the current version
 in a lineage of 3+). **When `workspace.latestGenerationRun?.outcome
 === 'in-progress'` (against the current version, whether `livenessState` is `'active'` or
 `'stale-or-interrupted'`), also renders a distinct, clearly labeled read-only notice — "A
 generation run is currently active/stalled on the current version — go to the current workspace to
 view or manage it" — with a real navigable link to the current version's workspace route (this checkpoint's binding rule: "Abandon and retry" and every other current-run-mutating control must live
 only in the current-version context, never here). The data this notice's condition needs
 (`workspace.latestGenerationRun`) is already present in the Workspace Read Model regardless of
 which version is displayed — `02-ARCHITECTURE.md` §3.2/§4.4 — no new field.** Imports neither `AddSourceInline` nor
 `GenerateButton` nor the abandon control — the no-current-run-mutating-control-on-a-prior-version invariant is structural (this
 component has no code path that could render any of them), not a runtime suppression inside
 `BriefGeneratedSummaryPanel`, `GenerationFailedPanel`, or `GenerationProgressPanel` (the last of
 which, per C2-S3's own Files entry, is now scoped to current-version display only — same
 correction, applied at its point of origin). Built in this slice, alongside
 `BriefGeneratedSummaryPanel` (also new this slice) — **not** `GenerationFailedPanel`, which is
 built and owned by C2-S3. `ViewingPriorVersionPanel` and `BriefGeneratedSummaryPanel` are Outcome/
 Status Panel variants that cannot be demonstrated without the versioned route this
 slice delivers; `GenerationFailedPanel` needed no such dependency and was already real and
 demonstrable in C2-S3.
- `src/client/components/BriefReviewPanel/` (new directory) — `ProblemDefinitionSection`,
 `ClaimsAndEvidenceSection`, `DemandEvidenceSection`, `PersonalPullSection`,
 `ExistingSolutionLandscapeSection`, `GapHypothesisSection`, `UncertaintySection`,
 `SystemRecommendationSection`, `NegativeFindingNotice`.
- `src/client/components/ProvenanceRail/` (new directory) — `EvidenceProvenanceList`,
 `SearchScopeNotice`,
 `CitationScopeNotice`, `RunHistoryList`, `TechnicalDisclosurePanel` (collapsed by default — the one permitted
 exception).
- `src/client/api.ts` — add `fetchBriefForReviewByVersionNumber`, matching the route above.

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
- The versioned route is narrowly scoped: it navigates to exactly one
 specific prior version via the current-vs-superseded pointer/lineage lookup — it is not a general
 "all versions" browser, index, or list (unchanged Out of Scope boundary).

**Tests:**
- [ ] `getAssignedState`/`getAssignedStateAsRecorded`: given zero `status_event` rows, both return
 `'valid'`; given a real, directly-seeded `StatusEvent` row, `getAssignedState` returns the
 seeded state for an `asOf` at/after its `effectiveAt`, and `'valid'` for an `asOf` before it;
 `getAssignedStateAsRecorded` additionally diverges correctly on `knownAsOf` given two seeded
 rows with different `recordedAt` values; **`sequence`-tiebreak test**: given two
 real, directly-seeded `StatusEvent` rows for the same target with IDENTICAL `effectiveAt` AND
 `recordedAt`, both queries deterministically return the state of whichever row was inserted
 last (highest `sequence`) — asserted against real seeded rows, not a mocked ordering.
- [ ] `getBriefForReview`: resolves the full chain for a real generated Brief; `assignedState` is
 sourced from a real `getAssignedState` call (verified by seeding a non-`'valid'` `StatusEvent`
 row directly and confirming the response reflects it).
- [ ] `getInvestigationWorkspace`: `briefs[].assignedState`/`briefs[].isSuperseded` reflect real
 seeded `StatusEvent`/supersession state; `briefs[].forwardSupersededByVersionNumber` is `null`
 for a non-superseded version and equals the real successor's `versionNumber` for a superseded
 one, seeded via a real second `BriefVersion` with `supersedesVersionId` set.
- [ ] `GET.../brief-versions/by-version/:versionNumber`: 400 for a non-numeric or non-positive
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
 a working forward link to that version's own immediate successor (not necessarily the current
 version in a lineage of 3+).
- [ ] **New, required — Region 4 version-scoping split (Sol finding, corrects a contradiction: an
 earlier revision of this document claimed Region 4 does not change on version navigation while
 also scoping `EvidenceProvenanceList` to the displayed version).** Navigating between two real
 `BriefVersion`s of the same Investigation asserts: `EvidenceProvenanceList` DOES change —
 it re-fetches and renders the newly-displayed version's own evidence/provenance content (never
 the previously-displayed version's content persisting after navigation); `SearchScopeNotice`,
 `CitationScopeNotice`, and `RunHistoryList` do NOT change — they continue rendering the same
 whole-Investigation run/search history regardless of which version is displayed. A single test
 asserting only "Region 4 is unchanged" or only "Region 4 always refetches" is insufficient and
 must be replaced by this split assertion.
- [ ] **Version Not Found, region 2**: render `InvestigationWorkspaceScreen` at a routed `:versionNumber` that
 does not resolve for a real Investigation (the 404 `brief-version-not-found` case above).
 Confirm region 1 (Investigation identity) still renders normally, and confirm region 2 renders
 ONLY the "Version N does not exist for this Investigation" message — no `AddSourceInline`, no
 `GenerateButton`, and none of the status-derived Outcome/Status Panel variants
 (`BriefGeneratedSummaryPanel`, `GenerationFailedPanel`, `BlockedSourcesPanel`, the Open/Eligible
 panel) mounted. Separately, confirm the ordinary non-versioned route for a freshly-submitted
 `'open'` Investigation with no `BriefVersion` yet does NOT render this state and instead renders
 the normal Open/Eligible panel with its "Start generation" control present — the negative case
 this rule's condition exists to preserve.
- [ ] **`ViewingPriorVersionPanel`, negative assertion (closes a coverage gap in the current-run-
 mutating-control exclusion this document establishes — matching the same precedent used for
 rule 0's negative test and
 `BlockedSourcesPanel`'s negative test)**: seed a real Investigation whose CURRENT version's
 `GenerationRun` is `'in-progress'`, once with `livenessState: 'active'` and once with
 `livenessState: 'stale-or-interrupted'`; in both cases, navigate to a PRIOR version's own
 versioned URL and confirm `ViewingPriorVersionPanel` renders the read-only notice plus its
 navigable link to the current version's workspace, and assert NO "Abandon and retry" control —
 and no other current-run-mutating control (`AddSourceInline`, `GenerateButton`) — is mounted
 anywhere on the rendered page.
- [ ] `BriefGeneratedSummaryPanel`: `GenerateButton` disabled with the honest reason string when
 `newEvidenceSinceCurrentBriefVersion` is `false`; enabled once a real source is added and the
 workspace re-fetch reflects `true` (component-level, wired to C2-S3's real service).
- [ ] Regression test for US-13 AC4: triggering a correction from a real `'brief-generated'`
 Investigation with new evidence produces a new `BriefVersion`, `ProblemBrief.currentVersionId`
 advances to it, and the prior `BriefVersion` remains independently retrievable both by its own
 id AND via `GET.../brief-versions/by-version/:priorVersionNumber` after the new
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
 — for every run (not only the latest), all observed on the rendered screen.
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
- **Version navigation live**: from the now-current (second) `BriefVersion`'s
 view, follow the real, rendered backward supersession reference (the current version's own
 `supersedesVersionId` link, region 1) (or navigate directly by typing the versioned URL, e.g.
 `.../versions/1`, into the browser address bar) to the FIRST `BriefVersion`'s own view. Confirm, on
 the rendered screen, that the FIRST version's own content renders — not the current version's
 content re-labeled — and that the header clearly discloses "Version 1 of 2." **Reload this exact
 versioned URL** and confirm it re-renders the identical first-version content, not the current
 version (the binding reload-stability requirement). Follow the real forward link this FIRST
 version's own `forwardSupersededByVersionNumber` provides (rendered because this version's own
 `isSuperseded` is true) and confirm it lands on the current version's own view — no separate
 "jump to current version" affordance exists (corrected); in a
 two-version lineage this forward link's target IS the current version, reached in a single hop.

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
target's existence and type BEFORE ever writing a `StatusEvent`; the
workspace's decision-history surface renders real non-`'valid'` assigned state and real
supersession, not simulated; and US-13's full five-item corrective-generation path — including a
pre-existing Decision that survives the correction untouched, verified via the real versioned
navigation route — is demonstrated live, closing out both restored scopes.

**Depends On:** C2-S4 (needs a rendered `briefVersionId` and the versioned-route navigation, so
US-13's full five-item path can be demonstrated against a specific prior version's own URL rather
than a raw id).

**Satisfies:** US-10 (`recordDecision`, Approve/Reject/Watch controls, the Watch
≥1-condition server-side guard, in-place confirmation, the per-version `priorDecisions` list and the
whole-Investigation `decisionLineage` list rendered by `DecisionHistoryBanner`), US-12
(`assignValidityState` with write-time target validation), US-13 (AC5's
decision-retrievability half, and the full five-item closing regression across all restored
scopes).

**Files:**
- `src/db/migrations/010_decision_and_reconsideration_condition.sql` (new — exact SQL per
 `02-ARCHITECTURE.md` §3.5, including the `reject_update_or_delete` immutability triggers).
- `src/types/domain.ts` — **NO edit needed: `Decision`,
 `ReconsiderationCondition`, and `ReconsiderationConditionType` are already defined by C2-S2
 (moved there because C2-S2's own `WorkspaceDecisionSummary` needs `ReconsiderationConditionType`
 to exist first — a real forward-dependency sequencing bug the prior draft did not catch). This
 slice's own work is the SERVICE logic (`recordDecision`, `getDecisionsForBriefVersion`) and the
 migration below that operate on those already-defined types — not their definition.**
- `src/services/recordDecision.ts` (new) — exact contract per §4.3, including
 `WatchRequiresConditionError` and the whitespace-only-condition trim rule.
- `src/services/getDecisionsForBriefVersion.ts` (new) — exact contract per §4.5, **returning
 `DecisionWithResolvedConditions[]` — every reconsideration condition resolved to its
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
- `src/services/validityState.ts` (new) — `assignValidityState` per §4.7 (the two read queries,
 `getAssignedState`/`getAssignedStateAsRecorded`, already exist since C2-S4; this slice adds the
 writer, with write-time target validation and dependent-decision reconstruction):
 - **Step 0**: within the same transaction as the
 insert, `SELECT 1 FROM claim_version WHERE id = $1` (or `brief_version`, matching `targetType`)
 — zero rows rolls back and throws `InvalidValidityTargetError`; NO `StatusEvent` is ever
 written for a dangling or wrong-type target.
 - Appends a new `StatusEvent` row (never an update), reverse-resolves every dependent
 `BriefVersion`, reads every bound `Decision` via `getDecisionsForBriefVersion`, and filters to
 those where `getAssignedStateAsRecorded({..., asOf: decision.decidedAt, knownAsOf:
 decision.decidedAt })` was last `'valid'` — returning `dependentDecisionIds`.
 - No browser-reachable route, control, or `api.ts` export calls this function (Out of Scope,
 US-12) — exercised only by this slice's own service tests and by the direct-service-call this
 slice's browser demonstration uses to seed a real, persisted non-`'valid'` state.
- `src/client/components/DecisionSection/DecisionForm.tsx` (new).
- `src/client/components/DecisionSection/DecisionConfirmationPanel.tsx` (new).
- `src/client/components/DecisionSection/DecisionHistoryBanner.tsx` (new — renders TWO requirements-distinct lists, never merged: (1) the displayed version's own
 `priorDecisions`, scoped to exactly that `briefVersionId`; (2) `workspace.decisionLineage`, the
 whole-Investigation chronological view, each entry labeled by its own human-readable version
 reference, rendered as a real, clickable React Router `<Link>`/`navigate` call to that version's
 own versioned route (§5.1), matching `InvestigationIdentityHeader`'s forward/backward
 supersession-link navigation pattern (C2-S4) — never a plain, non-navigable label. The compact
 non-`'valid'`/supersession notice is NOT rendered here —
 it was repositioned to `InvestigationIdentityHeader` in C2-S4 (region 1) so the existing "never
 buried or require scrolling" requirement is physically satisfiable; this component renders only
 the two chronological lists. No raw `StatusEvent` row, `targetId`, `briefVersionId`, or
 `ReconsiderationCondition` id
 rendered as primary content anywhere).
- `src/client/api.ts` — add `submitDecision`.
- `src/client/screens/InvestigationWorkspaceScreen.tsx` — edit: render region 5 once ≥1
 `BriefVersion` exists; wire `decisionSubmission` state (§5.2); decision controls act on whichever
 version (current or prior, reached via C2-S4's versioned route) is currently on screen.

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
 or component this slice touches** — every call site that needs "this
 version's decisions" uses `priorDecisions`; every call site that needs "every decision across the
 Investigation's lineage" uses `decisionLineage`; neither is filtered from the other client-side.

**Tests:**
- [ ] `recordDecision`: persists Approve/Reject/Watch correctly; rejects zero-condition and
 whitespace-only-condition Watch attempts with no row written to either table (transaction
 rollback verified); never accepts a `decidedBy`-shaped input.
- [ ] **New, required — Decision against a nonexistent BriefVersion returns 404, zero writes (Sol
 finding, `02-ARCHITECTURE.md` §4.3's `BriefVersionNotFoundError`).** Service-level: calling
 `recordDecision` with a `briefVersionId` that does not exist asserts `BriefVersionNotFoundError`
 is thrown BEFORE any insert (verified by a real row-count check against both the decision table
 and the reconsideration-condition table — zero rows written, no partial transaction artifact).
 Route-level: `POST .../decisions` against a nonexistent `briefVersionId` responds
 `404 brief-version-not-found`, not a generic `500` — closing the gap where an unguarded
 foreign-key violation could otherwise surface as an unmapped server error.
- [ ] **New, required — Decision success triggers both list refetches, never a client-fabricated
 list (Sol finding, `02-ARCHITECTURE.md` §5.2/§5.3, `03-UI-SPEC.md` Flow US-10 step 6).** After a
 real `201` `recordDecision` response (which carries only `Decision` plus condition IDs, not
 resolved condition objects), a component/integration test asserts the UI issues exactly two
 refetches — `GET .../workspace` (populating `decisionLineage`) and the displayed version's
 `GET .../brief-versions/by-version/:versionNumber` (populating `priorDecisions`) — and that both
 rendered lists show the real, persisted Decision with its real resolved reconsideration-condition
 text (type/otherTypeLabel/description), without a full-page reload or navigation. A negative
 assertion confirms neither list is ever constructed from the submission's own request/response
 payload client-side.
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
- [ ] **`assignValidityState` write-time validation**: given a `targetId`
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
 `sequence` values, confirming the reconstruction is stable under the same
 deterministic tiebreak C2-S4's read queries use** — real seeded rows, not mocked.
- [ ] `getAssignedState` vs. `getAssignedStateAsRecorded` divergence (US-12 AC5): a backdated
 `StatusEvent` changes `getAssignedState`'s answer for an `asOf` between the two timestamps,
 while `getAssignedStateAsRecorded` with `knownAsOf` before the correction's `recordedAt`
 still returns the pre-correction state.
- [ ] `DecisionHistoryBanner`: renders both `priorDecisions` and `decisionLineage` as two separate,
 labeled lists, never merged, and each `decisionLineage` entry's version label is a real, clickable
 navigation target — clicking it performs a client-side route transition to that version's own
 versioned route and the target version's content renders on screen, matching this screen's other
 version-reference navigation affordances (browser-demonstrated, not merely a unit assertion that a
 `<Link>` element exists) — this component no longer renders the
 `assignedState`/`isSuperseded` notice.
- [ ] **New, required — `InvestigationIdentityHeader` binds its compact notice to the DISPLAYED
 version, not the current one**: given an Investigation
 with a superseded prior `BriefVersion` whose real, seeded `assignedState` is non-`'valid'`
 (e.g. `'challenged'`) while the CURRENT version's real `assignedState` is `'valid'`, navigating
 to the prior version's own versioned URL (`.../versions/N`) renders
 `InvestigationIdentityHeader`'s non-`'valid'` statement (the PRIOR version's real fact), and
 navigating back to the current version renders NO non-`'valid'` statement (the CURRENT
 version's real, different fact) — proving the binding tracks whichever version is on screen,
 not `workspace.briefs.find(b => b.isCurrent)`. The same test also asserts
 the prior version's real `isSuperseded: true` renders on the prior version's own page.
- [ ] **New, required — backward supersession link**: given
 a current `BriefVersion` with a non-null `supersedesVersionId` (produced by this slice's own
 correction demonstration), `InvestigationIdentityHeader` on the current version's page renders
 a real, navigable link (human-readable `versionNumber`, resolved against `workspace.briefs`,
 never a raw UUID) to the specific prior version it supersedes; following it lands on that
 prior version's own versioned URL — closing the gap where only a forward (prior→current) link
 previously existed.
- [ ] Full US-13 five-item regression (service/route level): a real prior `Decision` exists against
 the current `BriefVersion` → a real new source is added → eligibility flips → a real
 generation run with `supersedesVersionId` set completes → the new `BriefVersion` is current
 and reviewable → the prior `BriefVersion` AND its `Decision` remain retrievable via
 `GET.../brief-versions/by-version/:priorVersionNumber`, unmodified, and
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
 `InvestigationIdentityHeader` now
 renders the real, persisted non-`'valid'` statement on the rendered screen — not a simulated or
 client-fabricated one. This one step is legitimately not a click-driven
 demonstration, since no such control exists this checkpoint (Out of Scope) — the reload and
 rendered-result observation IS the required browser verification of the read-side surface.
- **US-13 full five-item demonstration**, using the real versioned route, not a raw
 internal id: (1) confirm the existing Brief and the Decision recorded against it above are both
 visible on the rendered screen; (2) from the same Investigation Workspace, submit materially new
 source evidence via the real, rendered `AddSourceInline`; (3) click the real "Regenerate with new
 evidence" control and confirm a new, real, persisted `GenerationRun` is created and progresses to
 a terminal outcome, observed on the rendered screen; (4) confirm the resulting new `BriefVersion`
 is current and `InvestigationIdentityHeader`, on the new CURRENT version's own page,
 renders the real BACKWARD link (from this version's own `supersedesVersionId`, non-null after the
 correction) to the specific prior version it supersedes, with a real, working, version-numbered
 link (note: the CURRENT version's
 own `isSuperseded` is always `false` and no forward link renders from here; the affordance
 under test is the backward one); (5) click that link (or navigate directly to the
 prior version's own
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
7. **Joint-completion discipline (binding)**: wherever this roadmap splits one requirement's
 complete behavior across two slices (currently: US-5 AC3 across C2-S2/C2-S3), the earlier slice's
 own Done-When must not claim that requirement complete — only the later slice, at the point the
 full behavior is genuinely demonstrable end to end, claims it, and does so via an explicit,
 cross-referenced integrated test and browser demonstration, not by restating the earlier slice's
 work. US-5 AC3 is satisfied jointly by C2-S2 and C2-S3 only when (a) the dependency between them
 is stated explicitly in both slices' own text, (b) neither slice's own Done-When claims
 independent completion of AC3, and (c) an integrated test and browser demonstration prove the
 complete behavior — all three already hold in this document (C2-S2, C2-S3). This same discipline
 applies to any other joint-completion pattern discovered during Forge, resolved the same way, not
 silently claimed by whichever slice happens to run first.
8. **Add-Source route (binding)**: `AddSourceInline`'s connector is the existing, extended
 `POST /api/investigations` route (`02-ARCHITECTURE.md` §1.4/§3.1b/§4.1) — no
 `POST /api/investigations/:id/sources` route exists or is added anywhere in this roadmap. Any
 Forge implementation that introduces a new `:id/sources` path segment is out of conformance with
 this roadmap and must be corrected, not accepted as an equivalent alternative.
9. **Guard-decline response discipline (binding)**: the extended `POST /api/investigations` route's
 guard-decline branch compares the freshly-read post-decline status to the pre-mutation status
 observed in step 2 of `02-ARCHITECTURE.md` §3.1b, not to the attempted target status. An
 unchanged comparison is a benign no-op and responds `201`; only a genuine divergence responds
 `409`. Any Forge implementation that responds `409` for every guard-declined transition,
 regardless of whether the row actually moved, is out of conformance with this roadmap and must
 be corrected, not accepted as an equivalent alternative.
10. **Finalization safety-net discipline (binding, `02-ARCHITECTURE.md` §1.3/§4.2)**:
 `generateBriefVersion`'s outermost catch has no wrapper — a meta-failure of
 `finalizeGenerationRun`/`attemptGenerationFailedTransition`/`client.release` itself, occurring
 while already inside one of the function's own catch/failRun blocks, propagates un-finalized.
 The connector attaches TWO separate `.catch` handlers to `pipeline`, at two different points:
 the synchronization catch (attached immediately, relays only a pre-Phase-1 rejection into
 `runCreated`, never references `generationRun`, never writes a terminal record) and the
 finalization safety net (attached separately, only after `generationRun = await runCreated`
 resolves successfully, so it can structurally never fire before `generationRun` is assigned).
 The second handler MUST decide solely on `getGenerationRunOutcome`'s READ of the run's real
 persisted state, never on the rejection's JavaScript error class (this roadmap's own C2-S3 test,
 "read-before-write discrimination, never error-class inference") — and write a terminal outcome
 itself only when that read shows the run still `'in-progress'`. When it does write, it MUST
 record the terminal `GenerationStep` BEFORE calling `finalizeGenerationRun` — the same
 record-step-before-finalize ordering `generateBriefVersion` itself observes at
 `src/services/generateBriefVersion.ts:258-262`, `:306-309`, `:690-692`. Any Forge implementation
 that attaches only one `.catch`, or whose safety-net handler treats every rejection as
 already-finalized (log only, no distinguishing check), or whose safety-net handler is attached
 before `generationRun` is assigned, or whose safety-net handler calls `finalizeGenerationRun`
 before recording the terminal `GenerationStep` (reversed ordering), is out of conformance with
 this roadmap and must be corrected, not accepted as an equivalent alternative.
11. **`POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` derivation discipline (binding,
 `02-ARCHITECTURE.md` §4.9/§5.2, `01-REQUIREMENTS.md` Non-Functional Requirements)**: both
 constants are engineering-owned and derived by Forge, at C2-S3's own implementation time, from
 real measurement of the implemented system — never asserted as specific numbers anywhere in
 this roadmap, never a PROVISIONAL value pending confirmation. C2-S3's own Implementation Notes
 and Tests require the measurement-and-report step and the derivation methodology in full; the
 derived values and their measured evidence are recorded as code comments next to the constants
 in their implementation file, not in a separate tracking artifact. Any Forge implementation that
 hardcodes either constant without a recorded derivation, or that asserts a specific value at spec
 time rather than deriving one from real measurement, is out of conformance with this roadmap and
 must be corrected, not accepted as an equivalent alternative.

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
 stale/interrupted DISCLOSURE is not recovery — it is honesty about a state nothing
 automatically fixes.
- Fixing or reusing the legacy Express `GET /investigations/:id` route — left exactly as found.
- Knowledge surface, Evidence index, or Runs index routes — reserved-only, unchanged.
- Any change to `generateBriefVersion`'s internal pipeline, prompts, or extraction logic (the
 `onRunCreated` hook is additive only — not a pipeline change).
- **A browser-reachable trigger for `assignValidityState`** — no "mark invalid/challenged" button,
 control, or route anywhere in this checkpoint's surface. The service and its read-side surfacing
 ARE built (C2-S4/C2-S5) — only the human-initiated write trigger is deferred.
- **A generic, unconditional "Generate correction" control** decoupled from new-evidence submission
 — US-13's trigger is reachable ONLY via `AddSourceInline`'s hosted submission inside
 `BriefGeneratedSummaryPanel` (C2-S4).
- **A UI for browsing full `BriefVersion` lineage/history as an index or list.**
- **A dedicated `POST /api/investigations/:id/sources` route** — this roadmap reuses and extends
 the existing `POST /api/investigations` route instead; a separate `:id/sources` path segment is
 explicitly not built.

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
 progress BEFORE it reaches a terminal outcome.
5. Remain in the same workspace route through Success, Blocked, and Generation-Failed outcomes.
6. Recover from Blocked through a genuine retry producing a new persisted run — the joint
 C2-S2/C2-S3 US-5 AC3 path: source added, status returns to `'open'`, generation triggered and
 watched to a terminal outcome.
7. Review the persisted Brief: sources, evidence, claims, uncertainty, recommendation, provenance —
 including its full real `validationRecords`/`toolInvocations`/`webSearchQueries` fields (Finding
 2).
8. Record Approve, Reject, and Watch decisions (each demonstrated at least once across the full
 run).
9. From a `'brief-generated'` Investigation carrying at least one recorded Decision, add materially
 new source evidence from the same workspace, click the real "Regenerate with new evidence"
 control, and confirm the new `BriefVersion` supersedes the prior one while the prior
 `BriefVersion` and its Decision remain independently retrievable at their own real,
 human-readable versioned URL — not merely true in the database.
10. Confirm `InvestigationIdentityHeader` (region 1), on the new CURRENT version's own page
 produced by step 9, renders the real BACKWARD `supersedesVersionId` link to the specific prior
 version step 9's correction superseded. The new CURRENT version's own `isSuperseded` is always
 `false` (§5.3's binding rule; only a non-current version's own facts can ever be `true`), so no
 forward `isSuperseded` link exists on this page to follow; the backward link is the real,
 rendered affordance here. Follow it (a real click), and — using the one available caller this
 checkpoint provides for `assignValidityState` (a direct service call, since no browser control
 exists) — confirm a real, persisted non-`'valid'` assigned state renders on reload as an honest
 statement, not a simulated one. `InvestigationIdentityHeader`, not `DecisionHistoryBanner`,
 renders this non-`'valid'` assigned-state notice and the supersession links — `DecisionHistoryBanner`
 contains neither, per both slices' own Files/Tests.
11. Reload and confirm the persisted resulting state and decision history — including the
 supersession and validity-state facts from steps 9-10 — survive the reload.
12. Confirm, using a real seeded stale/interrupted run, that the
 workspace discloses it distinctly on the rendered screen and that polling has genuinely stopped
 — not indefinitely re-polling a run that will never progress further.
13. **(§1.6)** From step 12's stale/interrupted run, click the real, rendered "Abandon and
 retry" control; confirm the run finalizes `'failed'` on reload, the concurrency guard clears, and
 a subsequent real `POST.../generation-runs` for the SAME Investigation succeeds — proving the
 Investigation is not permanently blocked by a stale run. This is the closing-gate proof that
 §1.6's recovery mechanism works end to end from the browser, not only at the service layer.

The successful end-to-end path AND the separate Blocked/retry path AND the separate
Generation-Failed path AND the evidence-driven correction path (step 9) AND the stale/interrupted
disclosure path (step 12) AND the abandon-and-retry recovery path (step 13) must ALL be
demonstrated. After this gate is observed and Frank's binding
forge-gate has returned PASS on the assembled slices, the checkpoint stops for Danny and Sol review
before merge, per this repo's independent-review discipline.

---

## Output Verification

- [x] Every `02-ARCHITECTURE.md` component appears in exactly one slice's Files list as a `(new)`
 declaration, with subsequent edits attributed to later slices: Generation Run Connector (C2-S3,
 non-blocking, including the two-catch split and the new `isUniqueViolation` helper), Add-Source
 Connector (C2-S2, reusing and extending the existing `POST /api/investigations` route), Workspace
 Read Model (C2-S2/S3/S4/S5, incrementally completed — full field shape including provenance
 fields and `livenessState` defined in C2-S2), Brief Review Read Service (C2-S4), Decision Recorder
 (C2-S5), Decision History Read Helper (C2-S5, resolved-content shape), SSRF-Guarded Fetch fix
 (C2-S1), Investigation Workspace Screen (C2-S2, extended in S3/S4/S5), Start Investigation Form
 update (C2-S2), Stale Run Abandonment (`abandonGenerationRun`, C2-S3, filed in
 `src/web/apiRoutes.ts` beside the Generation Run Connector), Validity/Invalidation Service
 (`validityState.ts`, created C2-S4 for the read queries with the `sequence` tiebreak, edited C2-S5
 to add the writer including its write-time validation), Decision History / Validity Read Model
 (C2-S4 read-side fields, C2-S5 writer-dependent banner), Resubmission Eligibility Check
 (`hasEligibleNewEvidenceSinceCurrentBriefVersion`, C2-S3), Prior-Version Navigation Resolver
 (C2-S4), Stale/Interrupted Run Detector (C2-S2 field, C2-S3 mechanism). `OpenEligiblePanel.tsx` is
 created and owned by C2-S2; C2-S3 edits the same file to add `GenerateButton` — one creating
 declaration, subsequent edits.
- [x] Every `03-UI-SPEC.md` component appears in the hierarchy above: `InvestigationIdentityHeader`
 (C2-S2, extended C2-S4 for the version indicator), `AddSourceInline` (created C2-S2, hosting
 extended in C2-S3/C2-S4), `GenerationProgressPanel`/`GenerateButton`/`GenerationFailedPanel`
 (C2-S3, including the stale/interrupted disclosure and provenance field rendering; third label
 state added C2-S4), `BriefGeneratedSummaryPanel` (C2-S4), `ViewingPriorVersionPanel` (C2-S4),
 `BriefReviewPanel` and its eight sub-sections + `NegativeFindingNotice` (C2-S4), `ProvenanceRail`
 and its five sub-components (C2-S4, provenance field rendering), `DecisionForm`/
 `DecisionConfirmationPanel`/`DecisionHistoryBanner` (C2-S5, the two-list `priorDecisions`/
 `decisionLineage` split).
- [x] No circular dependency: C2-S2 → C2-S3 → C2-S4 → C2-S5 is strictly linear; C2-S1 is parallel;
 the US-5 AC3 joint-completion split and the Add-Source route-reuse design follow this same chain
 without introducing a back-edge (§1 above).
- [x] Each slice has testable Done-When criteria, including the binding three-part bar (tests/QC,
 Frank forge-gate PASS, browser demonstration on real persisted data). Every slice's Done-When has
 been checked against what that slice's own real file/test/demonstration scope can independently
 prove: US-5 AC3 completion is claimed only by C2-S3, jointly with C2-S2, via an explicit
 cross-referenced note in both slices; the Add-Source Connector's contract is
 `POST /api/investigations`, extended in place, stated in C2-S2's Files/Implementation
 Notes/Tests/Browser Demonstration — no `POST /api/investigations/:id/sources` route appears
 anywhere; the guard-declined-transition test list in C2-S2's own Files/Tests asserts `201` for a
 benign no-op and reserves `409` for a genuine concurrent conflict; the finalization safety net's
 meta-failure coverage — the two-catch split, the new `isUniqueViolation` helper, and the
 synchronization-catch and finalization-safety-net tests, the latter forcing the failure AFTER a
 real `generationRun` already exists — is stated in C2-S3's own Files/Implementation Notes/Tests;
 `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` are stated throughout (Files, Implementation Notes, Tests,
 Deferred, Sequence Rules) as engineering-derived-at-Forge-time constants, never asserted as
 specific numbers, with the measurement-and-derivation obligation assigned explicitly to C2-S3.
- [x] File paths are concrete, not placeholders. Both route contracts formalized in
 `02-ARCHITECTURE.md` §3.1a are stated exactly as specified there — the version-numbered Brief
 route is `GET.../brief-versions/by-version/:versionNumber`, and no separate GET/POST
 method-heading mismatch exists anywhere in this document — and the Add-Source Connector's
 contract is `POST /api/investigations`, extended in place, per §3.1b — not a new `:id/sources`
 route; benign no-op vs. genuine conflict, not "any decline is a conflict."
- [x] The Checkpoint-level closing gate (US-11) is stated once, at the end, explicitly separate from
 every individual slice's Done-When, and includes the US-13 correction path (step 9), the US-12
 validity/supersession read-side check (step 10), and the stale/interrupted disclosure path
 (step 12).
- [x] Generation eligibility is stated once, canonically, by pointer to `02-ARCHITECTURE.md` §4.2
 step 2's rule, in every slice (C2-S2, C2-S3, C2-S4) that computes, gates on, or hosts a control
 for it.
- [x] `GenerateButton`'s three real label states are stated consistently across their owning
 slices' Files, Implementation Notes, and Tests.
- [x] Both US-12 and US-13 are assigned to owned `C2-S` slices with real service tests, read-model
 tests, component tests, and browser demonstrations against real persisted data.
- [x] Every browser demonstration bullet in this document requires operating the real, rendered
 product surface — real clicks, real observed screen states, never an API response standing in for
 a rendered screen. C2-S3's US-13 mechanism check is service-level test coverage, stated explicitly
 in its own "Service-Level Verification" list, distinct from that slice's Browser Demonstration
 list; C2-S2's own closing provenance bullet checks the rendered screen itself, not fetched
 payload/dev-visible state.
- [x] Every external-review-identified gap this document closes has a stated, slice-owning
 mechanism, not a prose assurance: the non-blocking connector and `onRunCreated` (C2-S3, with the
 required test and browser demonstration proving in-progress observed before completion, plus the
 two-catch split — the synchronization catch's own required test, and the finalization
 safety-net's required test, which forces the meta-failure AFTER a real `generationRun` already
 exists); provenance field completeness (C2-S2 read-model shape/data, C2-S3/C2-S4 rendering); the
 real Add-Source Connector calling the real, extended existing `POST /api/investigations` route
 from its first mount point (C2-S2); the renamed, tightened eligibility check with disqualifier
 tests (C2-S3); the `decisionLineage`/`priorDecisions` split with resolved condition content
 (C2-S5); the `StatusEvent.sequence` schema column and read-query ordering (C2-S4) and write-time
 target validation (C2-S5); the `livenessState` field (C2-S2 definition, C2-S3 mechanism, UI,
 tests, demonstration, plus the engineering-derived-constant measurement obligation); the
 Checkpoint-1 edit-boundary language (§0/every slice's file notes), GET route naming accuracy
 (C2-S4), and browser-demonstration-only language (C2-S3).
