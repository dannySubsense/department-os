# Architecture: Product Surface — Checkpoint 2

**Status**: Draft (pending Frank spec-gate + human approval)
**Date**: 2026-08-22, revised 2026-08-23 to resolve external-review (Codex + Sol) findings 1-8 and
11 against `01-REQUIREMENTS.md`'s 2026-08-23 tightened US-1 AC5, US-4/US-6 stale-run AC, and US-13
AC2 — see §1.3-§1.5 for the newly-reconciled assumptions this revision corrects, and §3-§5 for the
resulting schema/contract changes. Every prior binding correction (§1.1, §1.2, the SSRF fix, the
US-12 validity design, existing route contracts) is unchanged except where a finding required it.
Revised again 2026-08-24: §1.3's re-verification pass, §1.4's H-1 correction (reuse `POST /api/investigations`, no new `:id/sources` route), §3.1b's H-2 correction (benign no-op vs. genuine conflict), §4.2 steps 5/5b's two-catch correction, and §4.9/§5.2's timing-constant engineering-ownership reframing (`POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` derived from real-run measurement, not asserted at spec time).
**Feeds**: `01-REQUIREMENTS.md` (13 user stories, including US-12/US-13 restored to scope per
Danny's 2026-08-22 material-scope-correction ruling; see that document for the canonical
acceptance-criteria enumeration — count not restated here per this repo's no-manually-asserted-counts discipline)

## 0. Scope Discipline

This document does not modify `docs/specs/product-surface-checkpoint-1/*` or
`docs/specs/problem-department-mvp/*` — both are read-only inputs. It designs exactly the scope
`01-REQUIREMENTS.md` sets: one Express write connector, one Express read connector, a real
`getBriefForReview` read service, real `Decision`/`ReconsiderationCondition` persistence, one React
workspace route, two live-defect fixes (`ssrfGuardedFetch` DNS lookup, the inert Blocked-retry
generation gap), and the wiring that makes all of the above reachable end-to-end from the browser.

This revision (2026-08-22 material scope correction) additionally designs the Slice 12
validity/invalidation service and browser-visible decision history (US-12) and the scoped,
evidence-driven resubmission correction path (US-13) — both restored to this checkpoint's scope by
Danny's ruling on the two Open Questions the prior draft deferred. Both are additive to the design
below, not a rewrite of it: §1.1/§1.2's reconciliation, §3.1-3.5's schemas, §4.2-4.6's contracts,
and §5's SPA design are unchanged except where a new §-suffix subsection below explicitly extends
them (§3.6, §3.7, §4.2's revised Generation Eligibility Rule, §4.7, §4.8, §5.3's added component).

It does not select a new runtime, storage technology, or web framework — this sprint extends the
already-adopted stack (`problem-department-mvp/02-ARCHITECTURE.md` §Scope Discipline; Express +
Postgres + React/Vite, confirmed live).

**Checkpoint-1 edit boundary — explicit and bounded (Finding 11a, external review).** This sprint
edits exactly one category of already-shipped Checkpoint-1 surface: the per-row "Open"/"Open
current view" affordance on `ProblemDepartmentScreen`/`MissionControlScreen`
(`product-surface-checkpoint-1/02-ARCHITECTURE.md` §6), changing ONLY its navigation target — from
the legacy `<a href="/investigations/{id}">` full-page link to a React Router `<Link>`/`navigate()`
call targeting this sprint's new workspace route (§5.3). No other Checkpoint-1 file, component,
prop, route, or rendered content is touched, added, or removed. Checkpoint-1's own
`02-ARCHITECTURE.md`/`03-UI-SPEC.md` remain the locked spec of record for everything else about
those two screens; this single call-site retarget is the one, bounded exception Checkpoint 1's own
architecture already anticipated ("no client-side route exists ... yet," quoted again at §5.3) —
not a reopening of Checkpoint 1's closed scope, and not a precedent for touching anything else
under `docs/specs/product-surface-checkpoint-1/`.

---

## 1. Reconciliation Notes (binding corrections to what Requirements assumed already existed)

Two places where `01-REQUIREMENTS.md`'s binding product-direction text describes a mechanism as
"the same X already established" or "already wired" that, on inspection of live code, does not
yet exist in the form described. Per this repo's "no silent overwrite" discipline these are
recorded here, not silently patched over — each has a single reasoned resolution, not a HALT.

### 1.1 No DB-enforced concurrent-generation uniqueness exists yet

Requirements US-3 AC2 states the 409-on-concurrent-generation behavior should rely "on the same
DB-enforced uniqueness pattern already established for this concern in `generateBriefVersion`'s
own `createGenerationRun`." Inspection of `src/services/provenanceRecorder.ts::createGenerationRun`
and migration `006_generation_run_provenance.sql` finds no such uniqueness constraint:
`generation_run` has no unique index preventing two rows with the same `investigation_id` and
`outcome = 'in-progress'` — `createGenerationRun` inserts unconditionally. The only existing
uniqueness at this layer is `brief_version_generation_run_id_unique` (one `BriefVersion` per
`GenerationRun`), which does not prevent two concurrent `GenerationRun`s for one Investigation.

**Resolution**: this sprint adds the constraint the requirement assumed already existed, as a new
migration (`009_generation_run_investigation_in_progress_unique.sql`, §3.5) — a partial unique
index: `UNIQUE (investigation_id) WHERE outcome = 'in-progress'`. The connector's insert path (via
`createGenerationRun`, unchanged signature) becomes the single atomic check: a second concurrent
`POST .../generation-runs` for the same Investigation fails at `INSERT` with Postgres error code
`23505` (unique violation), which the connector catches and maps to `409` — no check-then-act
race, no new column on `generation_run` beyond the index, and `createGenerationRun`'s existing
signature and callers (`generateBriefVersion`'s own phase 1) are unchanged. This is the DB-enforced
pattern the requirement described in intent; it did not yet exist in code and is built here rather
than assumed.

### 1.2 `Decision.decidedBy` cannot be carried forward as specified

`problem-department-mvp/02-ARCHITECTURE.md` §3's `Decision` interface and `recordDecision`
contract both carry `decidedBy: string` (a human-identity field). `01-REQUIREMENTS.md`'s Interview
Q2 ruling and this sprint's binding product direction are explicit and repeated: "NO actor/identity
field on Decision," "`Decision` carries no actor/identity field — UI-facing copy uses product
language ('Your decision'), never a hardcoded name." No `recordDecision.ts`/`Decision` type exists
in live code yet (confirmed: no such file under `src/services/`, no `Decision` interface in
`src/types/domain.ts`) — so this is a first-implementation, not a breaking change to shipped code.

**Resolution**: this sprint's `Decision` schema and `recordDecision` contract (§3.4, §4.3) **omit**
`decidedBy` entirely — a REVISION of the prior architecture's field list, binding per this sprint's
own explicit Interview ruling, which postdates and supersedes the MVP architecture's unbuilt
forward reference on this one field. No other field of the prior `Decision`/`recordDecision` shape
changes.

### 1.3 `generateBriefVersion` needs one additive hook to make honest progress observable (Finding 1)

Per `01-REQUIREMENTS.md`'s Constraints "Assumes" clause, a downstream finding that
`generateBriefVersion`'s internal contract is insufficient is "a blocking finding to raise, not
something to silently work around." External review found exactly this: the prior draft's
Generation Run Connector (§4.2) `await`ed `generateBriefVersion` to completion before responding,
so the browser could not begin polling `GET .../workspace` until generation had already finished —
defeating US-4's honest-progress design entirely.

**Resolution**: `generateBriefVersion`'s exported signature gains one new, optional, additive
parameter: `onRunCreated?: (generationRun: GenerationRun) => void`, invoked synchronously
immediately after Phase 1's `createGenerationRun` call succeeds (`generateBriefVersion.ts:231`),
before Phase 2 (preflight validation) begins. This is not a change to any pipeline phase, prompt,
extraction, analysis, or recommendation logic — Out of Scope's "no re-implementation or
modification of `generateBriefVersion`'s internal pipeline" is unaffected, since no phase's own
logic, order, or output changes. It has zero effect on any existing or future caller that omits the
parameter. §4.2 specifies exactly how the connector uses this hook to return to the browser the
instant the concurrency-guarding `GenerationRun` row exists, without waiting for the rest of the
run — and how a failure that occurs after that point still writes a real, terminal, failed
`GenerationRun`/`GenerationStep` in every ordinary business-logic/DB-error path. **Independently
re-verified this pass (2026-08-24), reading `generateBriefVersion.ts:290-714` in full, line by
line, not re-asserted**: every `failRun` call (`generateBriefVersion.ts:322-326`), the preflight
catch (`:294-315`), the Phase 4 stale-conflict and transition-declined paths (`:561-592`,
`:646-675`), the Phase 4 transaction catch (`:681-696`), and the outermost Phase 2/3 catch
(`:700-715`) each call `attemptGenerationFailedTransition` then `finalizeGenerationRun` (or, for
the two caller-contract error types, `finalizeGenerationRun` alone) BEFORE rethrowing — this part
of the claim holds. **One real gap the prior "confirmed live" wording did not disclose**: the
outermost catch at `:700-715` is the last layer inside `generateBriefVersion` itself — nothing
wraps it. If `finalizeGenerationRun`, `attemptGenerationFailedTransition`, or `client.release()`
(`:698`) itself throws while already executing inside any of these catch/failRun blocks, that
throw is not caught by a further layer within the function and propagates un-finalized. So the
accurate claim is: every business-logic and DB-query error after Phase 1 finalizes exactly once
before rethrowing; a failure of the finalization write path itself (a meta-failure, not a business
error) is the one class of post-Phase-1 rejection that can leave a `GenerationRun` without a
terminal record. §4.2 step 5b's safety net is corrected below to account for this.

### 1.4 `AddSourceInline` reuses and extends the existing `POST /api/investigations` route (Finding 4, corrected — Danny's binding ruling on H-1, `05-REVIEW.md` § Spec-Gate Disposition, "H-1 — RESOLVED, Danny's binding ruling, 2026-08-24")

**Corrected verification record.** The prior draft of this section asserted "no such route exists in
live code." That assertion was false and has been withdrawn — see `05-REVIEW.md` § Spec-Gate
Disposition, "H-1 — RESOLVED, Danny's binding ruling, 2026-08-24" for the full correction record;
it is not repeated here. Live, `src/web/apiRoutes.ts:41-74` (shipped by
Checkpoint 1) already defines `POST /api/investigations`, already accepts an optional
`investigationId` in its body to add artifacts to an existing Investigation rather than only create
one, already runs `submitSources` → `resolveInvestigationSources` → `transitionInvestigationStatus`
in that order, and already responds `201` JSON — never a redirect. `03-UI-SPEC.md` Flow US-2 step 3
correctly stated this route exists; this section previously did not.

**Danny's binding ruling (2026-08-24): reuse and extend the existing route. Do not add a new
`POST /api/investigations/:id/sources` route.** `AddSourceInline` calls the existing
`POST /api/investigations` with `investigationId` set in the body — the same client-visible contract
`StartInvestigationForm` already uses for the create case, extended (not duplicated) for the
add-to-existing case.

**What "extend" requires, precisely (this is a real behavior change, not a route rename).** The live
route's current body unconditionally calls `transitionInvestigationStatus(submission.investigationId,
allUnreachable ? 'blocked' : 'open', ...)` and responds with that assumed target status, without
checking the transition function's own return value or reading back the row it actually wrote. Two
defects follow if this sequence is extended unchanged onto an existing Investigation:

1. **The `'brief-generated'` case.** `transitionInvestigationStatus.ts`'s own
   `ALLOWED_PRIOR_STATUSES` map already declines any transition into `'open'`/`'blocked'` from a
   `'brief-generated'` prior status (`'open'`'s only allowed prior is `['blocked']`; `'blocked'`'s
   only allowed prior is `['open']`) — so the guarded `UPDATE` already no-ops for this case at the
   database layer. But the unmodified route ignores the returned `boolean` and reports the *assumed*
   `status` (`'open'`/`'blocked'`) back to the client regardless — a false response describing a
   write that did not happen. This is the mechanism that would have silently killed US-13's path if
   left unexamined, and is why the route handler must branch explicitly rather than call
   `transitionInvestigationStatus` unconditionally (§3.1b, §4.1 detail the exact branch).
2. **Every other existing-Investigation case must report real, read-back state, not an assumed
   one.** Even where the guard permits the transition, the route must confirm it happened (or surface
   its rejection as a real error) rather than construct the response body from the value it *intended*
   to write.

**Resolution**: `POST /api/investigations`'s handler (`src/web/apiRoutes.ts`, existing route, edited
in place — not duplicated) branches on the pre-mutation status of an existing `investigationId`
(read via `getInvestigation`, §4.1/§3.1b's exact contract):

- No `investigationId` in the body: unchanged — create a new Investigation, run the existing
  three-service sequence, respond with its real resulting status.
- Existing `investigationId`, current status is **not** `'brief-generated'`: append the sources (the
  existing `submitSources`/`resolveInvestigationSources` sequence, unchanged), then attempt the
  existing `transitionInvestigationStatus` call as today — but check its returned `boolean` this
  time. If it returns `true`, respond with the real (freshly re-read) status. If it returns `false`,
  re-read the Investigation's real current status and compare it to the status observed in step 2
  (before this request attempted anything): if unchanged, the guard declined only because there was
  nothing to transition — a benign no-op, not an error — and the route responds `201` with that real
  (unchanged) status exactly as the `true` branch does (H-2 correction, §3.1b step 6); only a
  freshly-read status that differs from step 2's is a genuine conflict, and only that case surfaces
  the real current status as a `409` error (§3.1b, §4.1).
- Existing `investigationId`, current status **is** `'brief-generated'`: append the sources, but do
  **not** call `transitionInvestigationStatus` at all for this request — not even as a no-op call
  relying on the guard to decline it. The Investigation remains `'brief-generated'` in the response.
  Whether it becomes generation-eligible again is answered exclusively by §4.8's
  `hasEligibleNewEvidenceSinceCurrentBriefVersion`, read on the next `GET .../workspace` poll — this
  route never flips that Investigation back to `'open'` itself, directly or via an unconditional
  call it happens to be relying on the transition guard to swallow.
- Every response reports the real, freshly-read `investigation.status` (via `getInvestigation`,
  called after all mutations complete) — never the value the handler intended or attempted to write.

No existing route is duplicated and no new path segment is added. `submitSources`,
`resolveInvestigationSources`, and `transitionInvestigationStatus` remain unmodified — the change is
entirely in `POST /api/investigations`'s own handler: it now reads current status before deciding
whether to attempt a transition, and reads real status back before responding, in both the
new-Investigation and existing-Investigation cases.

### 1.5 US-13 eligibility cannot be a bare timestamp comparison (Finding 5)

The prior draft's `hasNewEvidenceSinceCurrentBriefVersion` (§4.8) was a bare
`source_artifact.added_at > BriefVersion.createdAt` check. `01-REQUIREMENTS.md`'s 2026-08-23
tightened US-13 AC2 explicitly disqualifies unreachable/unresolved, empty, duplicate-of-
already-consumed, and already-reflected-in-current-Brief sources from unlocking eligibility — a
bare timestamp comparison cannot express any of those four disqualifiers.

**Resolution**: §4.8 replaces the check with `hasEligibleNewEvidenceSinceCurrentBriefVersion`,
querying `source_artifact.resolution_status` (already-persisted column, `001_initial_schema.sql`)
and cross-referencing the evidence actually consumed by the current `BriefVersion` via the existing
`evidence_item` / `claim_version_evidence` / `claim_version` / `brief_version.claim_version_ids`
chain (all already-persisted, unchanged tables) — no new column, no new table, no re-implementation
of `generateBriefVersion`'s own pipeline.

---

## 2. Components

| Component | Responsibility | Location | Satisfies |
|---|---|---|---|
| **Generation Run Connector** | `POST /api/investigations/:id/generation-runs` — validates Investigation eligibility, prevents concurrent runs via §1.1's DB constraint, determines initial-vs-correction server-side, supplies a real runtime identifier, kicks off `generateBriefVersion` in-process and responds `202` the instant its `GenerationRun` row exists (Finding 1, §4.2) rather than awaiting full completion, maps its typed outcomes to distinct terminal states observable via the Workspace Read Model | `src/web/apiRoutes.ts` (new route) | US-3, US-6, US-8 |
| **Add-Source Connector** | Existing `POST /api/investigations` route, extended in place (not duplicated) — adds source(s) to an existing Investigation via the real, unmodified `submitSources`/`resolveInvestigationSources` services, branches on pre-mutation status to skip `transitionInvestigationStatus` entirely for a `'brief-generated'` Investigation (never transitions it back to `'open'`), and returns real, read-back-after-write status as JSON (§1.4, §3.1b, §4.1) | `src/web/apiRoutes.ts` (existing route, edited) | US-2, US-5, US-8, US-13 |
| **Workspace Read Model** | `GET /api/investigations/:id/workspace` — assembles investigation identity, sources, latest `GenerationRun`/`GenerationStep`s, and (once available) Brief + decision summary from persisted rows only; structurally incapable of expressing an unpersisted claim (§3.2) | `src/services/getInvestigationWorkspace.ts` (new) | US-1, US-4, US-5, US-6 |
| **Brief Review Read Service** | `getBriefForReview(briefVersionId)` — resolves `getInvestigation` → `ProblemBrief.currentVersionId` → fully-resolved Brief content from existing persisted tables; same read chain and return shape `problem-department-mvp/02-ARCHITECTURE.md` §4 already specifies (unimplemented until now) | `src/services/getBriefForReview.ts` (new) | US-9 |
| **Decision Recorder** | `recordDecision(input)` — persists an append-only `Decision`, enforces the Watch ≥1-condition rule server-side, never mutates or reassigns `briefVersionId` | `src/services/recordDecision.ts` (new) | US-10 |
| **Decision History Read Helper** | `getDecisionsForBriefVersion(briefVersionId)` — chronological (`decidedAt` ASC) `Decision[]` for one version, used by both `getBriefForReview.priorDecisions` and the workspace's decision-history panel | `src/services/getDecisionsForBriefVersion.ts` (new) | US-10 |
| **SSRF-Guarded Fetch (fixed)** | Existing shared module; `safeLookup`'s DNS-branch callback contract corrected to satisfy Node 22's `{ all: true }` custom-lookup shape | `src/services/ssrfGuardedFetch.ts` (fix, not new) | US-7 |
| **Investigation Workspace Screen** | React route `/departments/problem-department/investigations/:investigationId` — single durable URL covering open/blocked/generation-failed/brief-generated states; polls the Workspace Read Model while a run is in-progress; hosts the Brief review panel and Decision form once available | `src/client/screens/InvestigationWorkspaceScreen.tsx` (new) | US-1 through US-6, US-9, US-10 |
| **Start Investigation Form (updated)** | Existing component; `onSubmitted` now navigates into the workspace route instead of triggering a same-page re-fetch | `src/client/components/StartInvestigationForm.tsx` (edit — call-site only, contract unchanged) | US-2 |
| **Validity/Invalidation Service** | `assignValidityState`/`getAssignedState`/`getAssignedStateAsRecorded` (§4.7) — append-only `StatusEvent` writer and the two bitemporal read queries; no browser-reachable route this checkpoint (Out of Scope) | `src/services/validityState.ts` (new) | US-12 |
| **Dependent-Decision Reconstruction** | Computed inside `assignValidityState` (§4.7) — every `Decision` bound to a `BriefVersion` that referenced the invalidated target while its assigned state was last `'valid'`, reconstructed via `getAssignedStateAsRecorded` | `src/services/validityState.ts` (same module, not a separate file) | US-12 |
| **Decision History / Validity Read Model** | Extends `getInvestigationWorkspace` and `getBriefForReview` (§3.2, §3.3) with `assignedState`/`isSuperseded` per `BriefVersion`, sourced from `getAssignedState` — feeds `DecisionHistoryBanner` (§5.3) | `src/services/getInvestigationWorkspace.ts`, `src/services/getBriefForReview.ts` (both edited, not new files) | US-12 |
| **Resubmission Eligibility Check** | `hasEligibleNewEvidenceSinceCurrentBriefVersion(investigationId)` (§4.8, revised per Finding 5) — the single server-side gate that makes a `'brief-generated'` Investigation generation-eligible again, evaluated against `source_artifact.resolution_status` and the evidence actually consumed by the current `BriefVersion`, never by status or timestamp alone | `src/services/getInvestigationWorkspace.ts` (helper used by both the Generation Eligibility Rule and `InvestigationWorkspaceView.generationEligible`) | US-13 |
| **Prior-Version Navigation Resolver** | Resolves a human-readable `versionNumber` (never a raw `BriefVersion` UUID) to its `BriefVersion` row for a given Investigation, reload-stably (Finding 3, §3.1a, §4.1) | `src/web/apiRoutes.ts` (route), `src/services/getBriefForReview.ts` (unchanged callee) | US-1 AC5, US-12, US-13 |
| **Stale/Interrupted Run Detector** | Computes a run's `livenessState` at read time from persisted facts only — never a stored field (Finding 8, §4.9) | `src/services/getInvestigationWorkspace.ts` (helper) | US-4, US-6 |
| **Decision Lineage / Condition Resolver** | Extends `getDecisionsForBriefVersion` to join `reconsideration_condition` and return resolved condition content (never a bare ID), and to carry each `Decision`'s owning `BriefVersion`'s human-readable version reference for the whole-Investigation lineage view, distinct from the per-version list (Finding 6, §4.5) | `src/services/getDecisionsForBriefVersion.ts` (edited) | US-10, US-12 |

No component list entry is added for "job queue" or "worker" — direct in-process execution only
(Out of Scope, `01-REQUIREMENTS.md`). No component list entry is added for a "mark invalid" route
or control — `assignValidityState` (above) has no browser-reachable trigger this checkpoint (Out of
Scope, US-12). No component list entry is added for a generic "Generate correction" button —
US-13's trigger is evidence-submission-gated only (Out of Scope).

---

## 3. Data Schemas

All types below extend `src/types/domain.ts` (existing types referenced, not restated in full) and
`src/types/readModels.ts` (existing pattern: `MissionControlView`/`ProblemDepartmentOverview`
already live there as plain read-model interfaces alongside the domain types).

### 3.1 `POST .../generation-runs` request/response (Generation Run Connector, Finding 11b: corrected heading — this route is POST, not GET)

```typescript
// src/web/apiRoutes.ts — request body
interface CreateGenerationRunRequestBody {
  // Empty on the wire today — no client-supplied flag determines initial-vs-correction (US-3 AC3);
  // this interface exists so the contract is explicit and additive if a future field is needed.
}

// 202 on success (Finding 1) — sent the instant the concurrency-guarding GenerationRun row
// exists, NOT after generateBriefVersion finishes (§4.2). The client never learns
// briefVersionId/versionNumber from this response; it learns them from the next
// GET .../workspace poll's latestGenerationRun/briefs once the run reaches a terminal outcome
// (§3.2) — no fact is claimed here before it is real (US-4).
interface CreateGenerationRunResponseBody {
  generationRunId: string;
}

// 409 — a GenerationRun is already in-progress for this Investigation (§1.1)
interface GenerationRunConflictResponseBody {
  error: 'generation-already-in-progress';
  existingGenerationRunId: string;
}

// 422 — Investigation exists but is not in an eligible status (e.g. 'blocked')
interface GenerationRunIneligibleResponseBody {
  error: 'investigation-not-eligible';
  currentStatus: InvestigationStatus;
  reason: string;
}

// 404 — Investigation does not exist
interface GenerationRunNotFoundResponseBody {
  error: 'investigation-not-found';
}

// 422 — generateBriefVersion's own typed failure outcomes, surfaced distinctly (US-3 AC6), never
// collapsed into one generic message
interface GenerationRunFailedResponseBody {
  error: 'brief-generation-failed' | 'invalid-supersede-target' | 'stale-correction-conflict';
  message: string;
}
```

### 3.1a `GET .../brief-versions/by-version/:versionNumber` and `POST .../decisions` request/response

(G6, revised per Finding 3) Full contract for the two routes named in prose in §5.2. The GET route
is addressed by a human-readable `versionNumber` (a positive integer, "Version 2 of 3"), never a
raw `BriefVersion` UUID — this is what makes US-1 AC5's prior-version navigation, and US-12's
supersession banner link, both reload-stable and demonstrable in the browser per the Anti-Patterns
"no UUIDs as navigable content" rule.

```typescript
// GET /api/investigations/:investigationId/brief-versions/by-version/:versionNumber
// No request body (GET). Path params only. versionNumber is parsed as a positive integer; a
// non-numeric or non-positive value is a 400 before any DB lookup.

// 200 — success
// Response body IS GetBriefForReviewResult verbatim (§3.3's pointer) — no wrapper object. The
// result's own `version` field carries this BriefVersion's versionNumber back to the client, so
// the screen can render "Version 2 of 3" without a second round trip.

// 400 — versionNumber is not a positive integer
interface BriefVersionRouteInvalidVersionResponseBody {
  error: 'invalid-version-number';
}

// 404 — the Investigation itself does not exist
interface BriefVersionRouteInvestigationNotFoundResponseBody {
  error: 'investigation-not-found';
}

// 404 — the Investigation exists (and may or may not have a ProblemBrief at all), but no
// BriefVersion with this versionNumber exists under this Investigation's ProblemBrief lineage —
// resolved via getInvestigation(investigationId).problemBriefId, then
// SELECT id FROM brief_version WHERE problem_brief_id = $1 AND version_number = $2, reusing the
// same lookup getInvestigationWorkspace already performs (§4.4 step 1/3), not a second
// independent existence check invented for this route. The resolved BriefVersion's own raw id is
// used only as an internal service-call parameter to getBriefForReview below — it is never placed
// in a URL or rendered as the navigable reference (Anti-Patterns).
interface BriefVersionRouteVersionNotFoundResponseBody {
  error: 'brief-version-not-found';
}

// POST /api/brief-versions/:briefVersionId/decisions
// briefVersionId here is the internal id the client obtained from the GET response above
// (GetBriefForReviewResult.version.id) — an API parameter, not a user-facing navigable reference,
// so this does not conflict with the Anti-Patterns "no raw UUIDs as primary content" rule (that
// rule governs what a human reads/navigates by, not internal service-call plumbing).
// Deliberately NOT nested under /investigations/:id — a Decision is scoped to one BriefVersion,
// matching submitDecision's client signature (§5.2: submitDecision(briefVersionId, body)), which
// carries no investigationId parameter.

interface SubmitDecisionRequestBody {
  decision: RecommendationDecision;                    // 'Approve' | 'Reject' | 'Watch'
  rationale?: string;
  reconsiderationConditions?: Array<{
    type: ReconsiderationConditionType;
    otherTypeLabel?: string;
    description: string;
  }>;                                                   // same shape as recordDecision's own
                                                          // input (§4.3) — not redefined, reused
}

// 201 — success. Response body IS the persisted Decision (§3.4) verbatim, including its
// server-generated id and decidedAt — no wrapper object, no ReconsiderationCondition sub-objects
// beyond what Decision.reconsiderationConditionIds already carries.

// 400 — malformed body: decision field missing or not one of the three literal values; a supplied
// reconsiderationConditions[i].type not one of ReconsiderationConditionType's values; or
// type === 'other' with otherTypeLabel missing/blank — a request-shape defect, checked before any
// service call
interface SubmitDecisionInvalidRequestResponseBody {
  error: 'invalid-request';
  message: string;
}

// 404 — briefVersionId does not resolve to an existing BriefVersion row
interface SubmitDecisionVersionNotFoundResponseBody {
  error: 'brief-version-not-found';
}

// 422 — decision === 'Watch' and zero valid (non-whitespace-only) conditions were supplied —
// maps 1:1 from recordDecision's WatchRequiresConditionError (§4.3)
interface SubmitDecisionWatchRequiresConditionResponseBody {
  error: 'watch-requires-condition';
  message: string;
}
```

No residual is left undetermined for either route — both are fully pinned: exact path, method,
request shape, every distinct response shape, and every status code.

### 3.1b `POST /api/investigations` extended request/response (Add-Source Connector, §1.4, Finding 4, H-1-corrected)

**This is the existing, live route (`src/web/apiRoutes.ts:41-74`), edited in place — not a new
route.** Its request/response shapes already exist in `src/client/api.ts` today
(`CreateInvestigationRequestBody`/`CreateInvestigationResponseBody`); this section pins the extended
handler behavior and the one additive response field, rather than defining a second endpoint.

```typescript
// POST /api/investigations — unchanged wire shape (src/client/api.ts, existing)
interface CreateInvestigationRequestBody {
  artifacts: Array<{ type: string; raw: string }>;
  investigationId?: string;              // present -> add to an existing Investigation (this
                                          // section); absent -> create a new one (unchanged)
}

// 201 — success. investigationId + status are populated from a fresh getInvestigation read taken
// AFTER submitSources + resolveInvestigationSources + (conditionally) transitionInvestigationStatus
// have all completed — never the value the handler intended or attempted to write (§1.4).
// sourcesAdded is additive (new field; existing callers that ignore it are unaffected).
interface CreateInvestigationResponseBody {
  investigationId: string;
  status: InvestigationStatus;
  sourcesAdded: number;                  // NEW field — count of artifacts accepted this request
}

// 400 — zero non-blank artifacts supplied (existing behavior, unchanged)
interface CreateInvestigationInvalidRequestResponseBody {
  error: 'at-least-one-artifact-required';
}

// 404 — investigationId supplied but does not exist (NEW response — the unmodified handler had no
// existing-investigation lookup to fail; getInvestigation's not-found error is now caught here)
interface CreateInvestigationNotFoundResponseBody {
  error: 'investigation-not-found';
}

// 409 — NEW response, narrowed by the H-2 correction. Only reachable when investigationId is
// supplied, its current status is NOT 'brief-generated', transitionInvestigationStatus.ts's own
// ALLOWED_PRIOR_STATUSES guard declined the attempted transition, AND the Investigation's real
// current status (re-read after the decline) has DIVERGED from the status observed in step 2
// (before this request attempted anything) — i.e. a genuine concurrent conflict, not the row
// sitting where this request itself found it. A guard decline whose re-read status matches step
// 2's is a benign no-op (sources already persisted, nothing needed to change) and responds 201
// via step 7, not 409 — see step 6. Reports the real, read-back current status — never the target
// the handler attempted.
interface CreateInvestigationTransitionConflictResponseBody {
  error: 'invalid-status-transition';
  investigationId: string;
  status: InvestigationStatus;           // the REAL current status, read back after the decline
  message: string;
}
```

**Handler branch (extends the existing `apiRoutes.post('/api/investigations', ...)` body; every
step below after the artifacts-presence check is either identical to today's live code or an
explicit addition — none of `submitSources`, `resolveInvestigationSources`, or
`transitionInvestigationStatus` is modified):**

1. `artifacts` empty/non-array → `400` (unchanged).
2. If `investigationId` is present, read its current status via `getInvestigation(investigationId)`
   BEFORE any mutation. Not found → `404` (NEW — the unmodified handler had no such check; it relied
   on `submitSources` to fail some other way). If `investigationId` is absent, there is no prior
   status to branch on — proceed as today (unchanged create path).
3. `submitSources({ investigationId, origin: 'human', artifacts })`, then
   `resolveInvestigationSources(submission.investigationId)` — identical to today, unmodified.
4. **Branch on the status read in step 2** (this step does not run at all for a brand-new
   Investigation — proceed straight to step 5's unconditional transition, exactly as today):
   - Status was `'brief-generated'`: **do not call `transitionInvestigationStatus` at all.** Skip
     directly to step 6. This is the one behavior change §1.4 requires — it must be an explicit
     skip, not a reliance on the transition guard to silently decline an unconditional call, because
     Forge building the unconditional version first (the naive extension) and only later noticing the
     guard happens to save it is exactly the failure mode H-1 flagged.
   - Status was anything else (`'open'`, `'blocked'`, `'generation-failed'`): call
     `transitionInvestigationStatus(submission.investigationId, allUnreachable ? 'blocked' : 'open',
     allUnreachable ? 'No submitted source was reachable.' : null)` — identical call to today's live
     code — but this time **check its returned `boolean`.**
5. (New-Investigation path only, `investigationId` absent at step 2): call
   `transitionInvestigationStatus` unconditionally exactly as today's live code does, and check its
   returned `boolean` the same way as step 4's non-`'brief-generated'` branch below.
6. If step 4/5's `transitionInvestigationStatus` call returned `false` (the guard declined it —
   `ALLOWED_PRIOR_STATUSES` did not permit the target from whatever the row's real current status
   was), do **not** assume this is an error. Re-read the Investigation's real current status via
   `getInvestigation` and compare it to the status observed in step 2 (before this request attempted
   anything):
   - **Unchanged** (freshly-read status equals step 2's status) — **H-2 correction**: this is a
     benign no-op, not a conflict. The sources submitted in step 3 were already persisted
     successfully; the guard simply declined because there was nothing to transition (the row was
     already sitting where the attempted target would have put it, or in a status this target can
     never move it from — e.g. `'open'`→`'open'`, `'blocked'`→`'blocked'`, or either
     `'generation-failed'` sub-case, per the real `ALLOWED_PRIOR_STATUSES` map). Do **not** respond
     `409`. Proceed to step 7 exactly as the `true` branch does, using this freshly-read (unchanged)
     status.
   - **Diverged** (freshly-read status differs from step 2's status) — a genuine conflict: something
     else moved the row between step 2's read and this transition attempt, to a state neither branch
     anticipated. Respond `409` with `CreateInvestigationTransitionConflictResponseBody`, reporting
     that freshly-read real status.

   (Why compare against step 2's status rather than against the attempted target: for the
   `'generation-failed'` sub-cases the guard declines the transition even though the row's real
   status never equalled the target — `ALLOWED_PRIOR_STATUSES.open` only permits `'blocked'` as a
   prior, so a `'generation-failed'` row is declined when the target is `'open'` even though
   `'generation-failed'` ≠ `'open'`. Comparing to the target would misclassify that case as a
   conflict; comparing to step 2's own pre-attempt read correctly identifies it as benign, because
   the row is exactly where this request itself found it — nothing external moved it.)
7. If step 6 found the transition succeeded (`true`), or found a benign no-op (H-2), or the
   `'brief-generated'` case was skipped in step 4: re-read the Investigation's real current status
   via `getInvestigation` one final time and respond `201` with `CreateInvestigationResponseBody`,
   using that freshly-read `status` — never the value the handler attempted or assumed.

This is a real change to the live route's branching logic, not a find-and-replace of a route string:
the existing route gains a pre-mutation status read, a `'brief-generated'`-skip branch, and a
post-mutation status read-back before responding. `submitSources` and `resolveInvestigationSources`
gain no new call, no new parameter, no new behavior; `transitionInvestigationStatus.ts` is not
modified — its existing `ALLOWED_PRIOR_STATUSES` guard is what step 6 now actually checks instead of
ignoring.

### 3.2 `GET .../workspace` response (Workspace Read Model)

The defining constraint (US-4, Anti-Patterns): every field is a projection of a persisted row or a
persisted-row's absence. There is no field this shape *could* be extended with to claim
"currently executing" beyond the latest persisted step, a percent figure, or a pre-persistence
success — that guarantee is structural, enforced by the shape below never carrying an
in-memory/derived-during-the-run value, only rows already committed at query time.

```typescript
// src/types/readModels.ts

interface WorkspaceInvestigationSummary {
  id: string;
  createdAt: string;
  status: InvestigationStatus;              // 'open' | 'blocked' | 'generation-failed' | 'brief-generated'
  statusReason: string | null;
  sourceCount: number;
  sources: Array<{
    id: string;
    type: SourceArtifactType;
    raw: string;
    resolutionStatus: SourceResolution['status'];
    failureReason?: string;                 // populated only when resolutionStatus === 'unreachable'
    noContentReason?: string;                // populated only when resolutionStatus === 'reachable-no-content'
  }>;
}

/** Exactly the persisted GenerationStep facts (US-4 AC1) — no field here is ever computed from
 *  "what the pipeline is doing right now"; every value is read from a `generation_step` row that
 *  already exists at query time. Revised (Finding 2): `validationRecords`/`toolInvocations` are
 *  already computed and persisted server-side by `provenanceRecorder.ts`'s `rowToGenerationStep`
 *  (`step_data` JSONB column, `generation_step`) — this shape was simply not exposing them; no new
 *  persistence, only closing the read-model gap to what 03-UI-SPEC.md's provenance rail already
 *  claims to render ("validation attempts... tool outcomes... per run, all runs"). */
interface WorkspaceGenerationStepSummary {
  component: string;
  startedAt: string;
  completedAt: string;
  outcome: 'succeeded' | 'failed';
  error?: string;
  modelIdentifier?: string;
  validationRecords?: SchemaValidationRecord[]; // existing domain type (provenanceRecorder.ts) —
                                                 // per-attempt tool-call validation, verbatim
  toolInvocations?: ToolInvocationRecord[];     // existing domain type — searchWeb-shaped calls
}

/** One WebSearchQuery + its results, scoped to one GenerationRun (Finding 2 — 03-UI-SPEC.md's
 *  SearchScopeNotice and provenance rail claim to render "queries actually performed and any
 *  failed/blocked retrievals" per run; this closes that gap against the already-persisted
 *  `web_search_query`/`web_search_result`/`query_limitation` tables (migration 005), no new
 *  persistence). */
interface WorkspaceWebSearchQuerySummary {
  id: string;
  query: string;
  performedAt: string;
  scopeNote: string | null;
  limitations: string[];
  results: Array<{
    url: string;
    retrievedAt: string;
    status: 'retrieved' | 'blocked' | 'failed';
    failureReason?: string;
  }>;
}

/** One GenerationRun as reported to the workspace. `outcome: 'in-progress'` combined with
 *  `steps: []` is the ONLY honest way to represent "a run started but no step has completed yet" —
 *  there is no separate "currently executing" field to populate instead (US-4 AC3/AC4).
 *  `livenessState` (Finding 8, US-4's stale/interrupted AC) is computed at READ time from
 *  persisted facts only (§4.9) — it is never itself a stored column, since a crashed process
 *  cannot write to its own row. */
interface WorkspaceGenerationRunSummary {
  id: string;
  outcome: 'in-progress' | 'succeeded' | 'failed';
  livenessState: 'active' | 'stale-or-interrupted' | 'terminal'; // §4.9 — 'terminal' whenever
                                              // outcome !== 'in-progress'; for outcome ===
                                              // 'in-progress', 'active' or 'stale-or-interrupted'
                                              // per the read-time detection in §4.9. This is the
                                              // ONLY field the UI may use to distinguish a healthy
                                              // in-progress run from one that crashed or was
                                              // interrupted (Anti-Patterns — never
                                              // indistinguishable, US-4).
  startedAt: string;
  completedAt: string | null;               // null iff outcome === 'in-progress'
  runtimeIdentifier: string;
  steps: WorkspaceGenerationStepSummary[];   // persisted steps only, in step_index order —
                                              // absence of the "next" component is not represented
                                              // by a placeholder row; it is simply not in this array
  webSearchQueries: WorkspaceWebSearchQuerySummary[]; // every WebSearchQuery for this run
                                              // (`web_search_query.generation_run_id = this run's
                                              // id`), Finding 2 — [] for a run with no web research
                                              // step yet, never a different shape
}

interface WorkspaceBriefSummary {
  briefVersionId: string;
  versionNumber: number;
  createdAt: string;
  isCurrent: boolean;                        // true iff this is ProblemBrief.currentVersionId
  assignedState: AssignedValidityState;      // this version's current-knowledge state (US-12) —
                                              // getAssignedState({ targetType: 'brief-version',
                                              // targetId: briefVersionId }), 'valid' by construction
                                              // when no StatusEvent exists yet (§3.6, §4.7)
  isSuperseded: boolean;                     // structural fact (US-12) — true iff some other
                                              // BriefVersion under the same problemBriefId names
                                              // this one via supersedesVersionId; never conflated
                                              // with assignedState
}

/** Revised (Finding 6): `versionNumber` is the human-readable version reference (US-1 AC5) this
 *  Decision's owning BriefVersion carries — required so the whole-Investigation lineage view can
 *  label each Decision with which version it belongs to, without exposing `briefVersionId` (a raw
 *  UUID) as the label a human reads. `reconsiderationConditions` already carries resolved content
 *  (type/otherTypeLabel/description), never a bare `ReconsiderationCondition` id — this shape was
 *  already correct; the gap Finding 6 identified was in `getDecisionsForBriefVersion`'s own return
 *  type (§4.5), which populated only ids before this revision. */
interface WorkspaceDecisionSummary {
  id: string;
  briefVersionId: string;                    // internal id — not rendered as primary content
  versionNumber: number;                     // human-readable version reference (US-1 AC5) for
                                              // this Decision's owning BriefVersion
  decision: RecommendationDecision;          // 'Approve' | 'Reject' | 'Watch'
  decidedAt: string;
  rationale?: string;
  reconsiderationConditions: Array<{
    type: ReconsiderationConditionType;
    otherTypeLabel?: string;
    description: string;
  }>;
}

/** US-12: AssignedValidityState is imported unchanged from
 *  problem-department-mvp/02-ARCHITECTURE.md §3 ("Bitemporal validity (Q-3)") — restated as a
 *  pointer, not redefined, per §3.6 below. */

/** GET /api/investigations/:id/workspace response. */
interface InvestigationWorkspaceView {
  investigation: WorkspaceInvestigationSummary;
  generationRuns: WorkspaceGenerationRunSummary[]; // ALL runs for this Investigation, newest first —
                                              // US-6 AC2 "all prior successful and failed steps/runs
                                              // remain visible ... nothing is hidden on failure"
  latestGenerationRun: WorkspaceGenerationRunSummary | null; // = generationRuns[0], denormalized for
                                              // the client's poll-target convenience (US-4 AC2/AC5)
  briefs: WorkspaceBriefSummary[];           // every BriefVersion for this Investigation's
                                              // ProblemBrief lineage, if any, newest first
  decisionLineage: WorkspaceDecisionSummary[]; // Revised (Finding 6, was `decisions`): every
                                              // Decision across every BriefVersion in this
                                              // Investigation's ProblemBrief lineage, decidedAt ASC
                                              // (US-10 AC7/AC11) — chronological across the WHOLE
                                              // Investigation, each entry labeled with its own
                                              // `versionNumber` (US-1 AC5). This is a distinct,
                                              // requirements-distinct surface from the per-version
                                              // decision list: the per-version list is
                                              // `getBriefForReview(briefVersionId).priorDecisions`
                                              // (§3.3), scoped to exactly the BriefVersion being
                                              // viewed — neither is a substitute presentation of
                                              // the other (US-10 AC11), and this field is never
                                              // filtered down to "current version only" for any
                                              // caller — that filtering, when wanted, is the
                                              // per-version list's job, not this one's.
  generationEligible: boolean;               // See "Generation Eligibility Rule" below §4.2 —
                                              // this field is that rule's single server-computed
                                              // output; restated nowhere else, never re-derived by
                                              // the client (single source of truth for the "can I
                                              // submit a generation request" affordance)
}
```

`sourceCount` and every array above degrade to `0`/`[]` for a freshly-submitted, pre-generation
Investigation — never a different response shape (matches Checkpoint 1's own "never a different
shape on empty" pattern, §5.1 note in `product-surface-checkpoint-1/02-ARCHITECTURE.md`).

`InvestigationWorkspaceView` gains one more field for US-13's resubmission gate:

```typescript
interface InvestigationWorkspaceView {
  // ...(all fields above, unchanged)...
  newEvidenceSinceCurrentBriefVersion: boolean; // Revised (Finding 5): §4.8's
                                              // hasEligibleNewEvidenceSinceCurrentBriefVersion
                                              // result, computed server-side against real
                                              // resolution-status and already-consumed-evidence
                                              // facts (§4.8), not a bare timestamp comparison;
                                              // false for an Investigation with no BriefVersion yet
                                              // (there is nothing to be "new since"). This is the
                                              // field generationEligible's 'brief-generated' branch
                                              // reads (§4.2's revised rule) — the client never
                                              // re-derives it itself.
}
```

### 3.3 `getBriefForReview` return shape

Unchanged from `problem-department-mvp/02-ARCHITECTURE.md` §4's forward-referenced contract — no
new fields, no removed fields. Restated here only as a pointer, not copied, per this project's "no
manually-asserted counts / no duplicated canonical shapes" discipline:

```typescript
function getBriefForReview(briefVersionId: string): Promise<GetBriefForReviewResult>;
// GetBriefForReviewResult = the exact return type documented in
// problem-department-mvp/02-ARCHITECTURE.md §4 "Review Surface (read model)" — version,
// assignedState, isSuperseded, problemStatements, claimVersions (with resolvedEvidence + per-claim
// assignedState), demandSignals, demandConfidence, existingSolutions, gapHypotheses,
// negativeFindings, uncertainty, recommendation, personalPullNotes, priorDecisions.
```

**No narrowing (revised, 2026-08-22 material scope correction)**: the prior draft of this
document deferred `assignedState`/`isSuperseded` to a documented fallback because
`StatusEvent`/`assignValidityState` were out of scope. Per Danny's 2026-08-22 ruling, US-12 restores
Slice 12's full contract to this checkpoint, so `getBriefForReview`'s `assignedState` fields (both
the top-level `BriefVersion` one and each `claimVersions[i].assignedState`) resolve through the real
`getAssignedState` query (§4.7) against actual `StatusEvent` rows (§3.6) — not a hardcoded
`'valid'` literal. Because no browser control ever calls `assignValidityState` this checkpoint (Out
of Scope), every `StatusEvent` row this sprint's own surface can produce is `[]` until Forge's own
test harness or a future sprint appends one directly — so `getAssignedState`'s documented
`'valid'`-when-no-`StatusEvent`-exists fallback (`problem-department-mvp/02-ARCHITECTURE.md` §4,
Query 1) is still the value every field resolves to in practice today. The distinction from the
prior draft is real: this is the query's own honest fallback behavior against an empty table, not a
short-circuit that skips the query — `getBriefForReview` calls `getAssignedState` unconditionally
for every `BriefVersion`/`ClaimVersion` it resolves, so the moment any `StatusEvent` row exists
(from a future in-scope invalidation trigger, or from `assignValidityState` invoked directly in a
later sprint), the surface reflects it with no code change. `isSuperseded` is unaffected either way
(`BriefVersion.supersedesVersionId` already exists and is populated on every correction, including
US-13's). `priorDecisions` (Finding 6) resolves through §4.5's revised `getDecisionsForBriefVersion`
— resolved reconsideration-condition content, never bare ids — the same function
`getInvestigationWorkspace`'s `decisionLineage` calls; `getBriefForReview`'s own call is scoped to
exactly `briefVersionId`, which is what makes `priorDecisions` the correctly per-version-scoped list
US-10 AC11 requires, distinct from `decisionLineage`'s whole-Investigation view.

### 3.4 `Decision` / `ReconsiderationCondition` (new persisted types — §1.2 resolution applied)

```typescript
// src/types/domain.ts — additions

/** NEW union, first defined by this checkpoint (M-2 correction) — problem-department-mvp §3 uses
 *  the same name in an unbuilt spec document, but no `ReconsiderationConditionType` exists
 *  anywhere in `src/` today; this is this checkpoint's own first implementation of it, not a
 *  reference to a live type. Values mirror migration 010's `reconsideration_condition.type` CHECK
 *  constraint exactly (§3.5) — the two are the same enumeration, declared once here and enforced
 *  once there. */
type ReconsiderationConditionType =
  | 'new-evidence'
  | 'product-change'
  | 'stronger-demand-signal'
  | 'feasibility-shift'
  | 'price-change'
  | 'market-event'
  | 'other';

interface ReconsiderationCondition {
  id: string;
  decisionId: string;
  type: ReconsiderationConditionType;       // NEW union, first defined here — see comment above
  otherTypeLabel?: string;                  // required when type === 'other'
  description: string;
}

/** No actor/identity field (§1.2). Immutable once created — a revisit creates a new Decision, it
 *  never edits an existing one (matches problem-department-mvp §3's existing doc comment, minus
 *  decidedBy). */
interface Decision {
  id: string;
  briefVersionId: string;                   // bound to the specific version reviewed — never
                                             // reassigned on a later correction (US-10 AC1)
  decision: RecommendationDecision;         // 'Approve' | 'Reject' | 'Watch'
  decidedAt: string;
  rationale?: string;
  reconsiderationConditionIds: string[];    // length >= 1 iff decision === 'Watch' (US-10 AC4)
}
```

### 3.5 Migrations (new)

```sql
-- 009_generation_run_investigation_in_progress_unique.sql (§1.1)
CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_run_investigation_in_progress_unique
  ON generation_run (investigation_id)
  WHERE outcome = 'in-progress';

-- 010_decision_and_reconsideration_condition.sql (§1.2, §3.4)
-- Append-only, same reject_update_or_delete() trigger pattern as brief_version/problem_statement
-- (007_problem_brief_and_versioning.sql).
CREATE TABLE IF NOT EXISTS decision (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id          UUID NOT NULL REFERENCES brief_version(id),
  decision                  TEXT NOT NULL CHECK (decision IN ('Approve', 'Reject', 'Watch')),
  decided_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  rationale                 TEXT
  -- No decided_by / actor column — §1.2, Interview Q2 binding ruling.
);

CREATE TABLE IF NOT EXISTS reconsideration_condition (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id       UUID NOT NULL REFERENCES decision(id),
  type              TEXT NOT NULL CHECK (type IN
                       ('new-evidence', 'product-change', 'stronger-demand-signal',
                        'feasibility-shift', 'price-change', 'market-event', 'other')),
  other_type_label  TEXT,
  description       TEXT NOT NULL CHECK (length(trim(description)) > 0),
  CONSTRAINT reconsideration_condition_other_type_label_required
    CHECK (type <> 'other' OR (other_type_label IS NOT NULL AND length(trim(other_type_label)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_decision_brief_version_id ON decision (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_reconsideration_condition_decision_id
  ON reconsideration_condition (decision_id);

-- Server-side, transaction-scoped enforcement of "Watch requires >=1 condition" happens in
-- recordDecision.ts (insert Decision + its ReconsiderationConditions in one transaction; if
-- decision = 'Watch' and zero conditions were supplied, roll back and reject before either table
-- is written — US-10 AC4's "no Decision persisted on rejection"). A CHECK constraint cannot
-- express a cross-table cardinality rule directly; the transaction boundary is the enforcement
-- mechanism, matching this doc set's existing pattern of combining DB CHECKs for intra-row rules
-- with app-layer transaction discipline for cross-row/cross-table rules (e.g.
-- brief_version_problem_statement_ids_non_empty is a backstop, not the sole enforcement, per
-- 007's own header note).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'decision_immutable' AND tgrelid = 'decision'::regclass) THEN
    CREATE TRIGGER decision_immutable BEFORE UPDATE OR DELETE ON decision
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reconsideration_condition_immutable' AND tgrelid = 'reconsideration_condition'::regclass) THEN
    CREATE TRIGGER reconsideration_condition_immutable BEFORE UPDATE OR DELETE ON reconsideration_condition
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
END $$;
```

Migration numbering: `008_reconcile_brief_versioning_constraints.sql` is the highest existing
migration (confirmed via `ls src/db/migrations/`); `009`/`010` are the next two numbers, assigned
here rather than left to Forge to guess, matching this doc set's existing practice of naming exact
migration files in architecture (§1.6 of the MVP architecture did the same for `005`). `011` (§3.6)
is the third, added by this revision.

### 3.6 `StatusEvent` (new persisted type — US-12)

Schema and semantics reused verbatim from `problem-department-mvp/02-ARCHITECTURE.md` §3
("Bitemporal validity (Q-3)") and §4's `assignValidityState`/`getAssignedState`/
`getAssignedStateAsRecorded` — not redesigned. Restated here (not merely pointed to) because this
checkpoint is the first to actually build it:

```typescript
// src/types/domain.ts — additions

/** Answers "what validity state did Department OS assign to this item at time T" — never "was
 *  this item objectively valid at time T." Append-only; a correction is a new StatusEvent with a
 *  later recordedAt (and possibly an earlier effectiveAt, for a late-discovered correction), never
 *  an edit to an existing event. */
type AssignedValidityState = 'valid' | 'challenged' | 'invalidated';

interface StatusEvent {
  id: string;
  sequence: number;                 // Finding 7 — DB-assigned monotonic insertion order (BIGSERIAL),
                                     // the deterministic tiebreak when two events share the same
                                     // (effectiveAt, recordedAt); never caller-supplied, never reused
  targetType: 'claim-version' | 'brief-version';
  targetId: string;                 // ClaimVersion.id or BriefVersion.id — validated to exist as a
                                     // row of this targetType BEFORE this row is ever inserted
                                     // (Finding 7, §4.7 orchestration step 0)
  assignedState: AssignedValidityState;
  effectiveAt: string;              // when this state became true in the represented world
  recordedAt: string;               // when Department OS learned/recorded it
  recordedBy: string;               // which service/process recorded it (e.g. 'forge-verification',
                                     // 'test-harness') — not a human-actor identity field; this
                                     // sprint has no browser-reachable caller (Out of Scope, US-12),
                                     // so no UI ever populates this from a person. Carried forward
                                     // unchanged from the already-committed MVP contract, distinct
                                     // from the actor-identity prohibition on Decision (§1.2), which
                                     // concerns a *human reviewer* field on a *decision* record, not
                                     // a system-provenance field on an internal service call.
  reason: string;
}
```

```sql
-- 011_status_event.sql (US-12) — append-only, same reject_update_or_delete() trigger pattern.
CREATE TABLE IF NOT EXISTS status_event (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence       BIGSERIAL NOT NULL, -- Finding 7: deterministic ordering tiebreak, DB-assigned,
                                      -- always distinct and monotonic by insertion order
  target_type    TEXT NOT NULL CHECK (target_type IN ('claim-version', 'brief-version')),
  target_id      UUID NOT NULL,
  assigned_state TEXT NOT NULL CHECK (assigned_state IN ('valid', 'challenged', 'invalidated')),
  effective_at   TIMESTAMPTZ NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by    TEXT NOT NULL,
  reason         TEXT NOT NULL CHECK (length(trim(reason)) > 0)
  -- target_id intentionally has no FK: it references claim_version.id OR brief_version.id
  -- depending on target_type, and Postgres has no polymorphic FK — matches this doc set's existing
  -- practice of enforcing polymorphic-target integrity in application code, not the schema, when a
  -- CHECK/FK cannot express it (see 010's decision/reconsideration_condition note, same pattern).
);

CREATE INDEX IF NOT EXISTS idx_status_event_target
  ON status_event (target_type, target_id, effective_at DESC, recorded_at DESC, sequence DESC);
-- Finding 7: index order matches the exact ORDER BY getAssignedState/getAssignedStateAsRecorded
-- use (§4.7) — effective_at, then recorded_at, then sequence, all DESC — so "latest" resolves via
-- one index scan, not a sort.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'status_event_immutable' AND tgrelid = 'status_event'::regclass) THEN
    CREATE TRIGGER status_event_immutable BEFORE UPDATE OR DELETE ON status_event
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
END $$;
```

No mutable `status`/`validity` column is added to `claim`, `claim_version`, or `brief_version` —
assigned validity state is always answered by querying `status_event` (Non-Functional Requirements,
binding).

---

## 4. API Contracts

### 4.1 Express routes (`src/web/apiRoutes.ts`, mounted exactly as existing routes are)

```typescript
// POST /api/investigations/:id/generation-runs
// 202 CreateGenerationRunResponseBody (Finding 1 — sent as soon as the GenerationRun row exists,
//     not after generateBriefVersion finishes; terminal outcome observed via the next
//     GET .../workspace poll, never via this response) |
// 404 GenerationRunNotFoundResponseBody | 409 GenerationRunConflictResponseBody |
// 422 GenerationRunIneligibleResponseBody
apiRoutes.post('/api/investigations/:id/generation-runs', async (req, res) => { /* §4.2 */ });

// GET /api/investigations/:id/workspace
// 200 InvestigationWorkspaceView | 404 { error: 'investigation-not-found' }
apiRoutes.get('/api/investigations/:id/workspace', async (req, res) => { /* calls
  getInvestigationWorkspace(req.params.id) */ });

// POST /api/investigations  (existing route, EXTENDED IN PLACE — §1.4, §3.1b, Finding 4,
// H-1-corrected; no new route/path segment is added for the add-source case)
// 201 CreateInvestigationResponseBody | 400 CreateInvestigationInvalidRequestResponseBody |
// 404 CreateInvestigationNotFoundResponseBody (NEW, existing-investigationId-not-found) |
// 409 CreateInvestigationTransitionConflictResponseBody (NEW, genuine guard-declined conflict
// only — H-2 correction; a benign same-status guard decline responds 201, not 409, §3.1b step 6)
apiRoutes.post('/api/investigations', async (req, res) => { /* §3.1b's exact 7-step branch —
  unchanged for the no-investigationId create case; for an existing investigationId, reads status
  via getInvestigation BEFORE mutating, skips transitionInvestigationStatus entirely when that
  status is 'brief-generated', otherwise calls it and checks its returned boolean, then always
  re-reads real status via getInvestigation before responding */ });

// GET /api/investigations/:investigationId/brief-versions/by-version/:versionNumber
// (§3.1a, revised Finding 3 — addressed by a human-readable version number, not a raw UUID)
// 200 GetBriefForReviewResult |
// 400 BriefVersionRouteInvalidVersionResponseBody |
// 404 BriefVersionRouteInvestigationNotFoundResponseBody |
// 404 BriefVersionRouteVersionNotFoundResponseBody
apiRoutes.get(
  '/api/investigations/:investigationId/brief-versions/by-version/:versionNumber',
  async (req, res) => { /* getInvestigation(investigationId) not-found check, then
    SELECT id FROM brief_version WHERE problem_brief_id = investigation.problemBriefId AND
    version_number = :versionNumber (404 if none), then getBriefForReview(resolved briefVersionId) */ },
);

// POST /api/brief-versions/:briefVersionId/decisions  (§3.1a)
// 201 Decision |
// 400 SubmitDecisionInvalidRequestResponseBody |
// 404 SubmitDecisionVersionNotFoundResponseBody |
// 422 SubmitDecisionWatchRequiresConditionResponseBody
apiRoutes.post(
  '/api/brief-versions/:briefVersionId/decisions',
  async (req, res) => { /* body-shape validation (400) before any service call, then
    recordDecision({ briefVersionId: req.params.briefVersionId, ...req.body }) (§4.3) */ },
);
```

### 4.2 Generation Run Connector — orchestration

**Revised, Finding 1 — the connector no longer awaits `generateBriefVersion`'s full result.** It
returns the instant the concurrency-guarding `GenerationRun` row exists (§1.3's `onRunCreated`
hook), using a promise-race so a genuine 409 conflict (thrown before `onRunCreated` ever fires) is
still detected and reported synchronously, while the pipeline itself keeps running un-awaited after
the response is sent.

```typescript
// src/web/apiRoutes.ts handler body, delegating to a small orchestration function so it is
// independently unit-testable without an HTTP layer:
async function createGenerationRunForInvestigation(investigationId: string): Promise<
  | { outcome: 'started'; generationRunId: string }
  | { outcome: 'not-found' }
  | { outcome: 'conflict'; existingGenerationRunId: string }
  | { outcome: 'ineligible'; currentStatus: InvestigationStatus; reason: string }
>;
// Note: 'generation-failed'/'created' full-pipeline-result outcomes are REMOVED from this
// function's return type (Finding 1) — the route no longer waits for generateBriefVersion's
// resolution, so it can no longer report the pipeline's own typed outcomes synchronously. The
// client observes BriefGenerationFailedError / InvalidSupersedeTargetError /
// StaleCorrectionConflictError outcomes via the next GET .../workspace poll's
// latestGenerationRun.outcome === 'failed' + its steps' recorded error text (§3.2, §4.4) — the
// same honest-progress mechanism US-4 already specifies for every other terminal outcome. This is
// not a loss of information: every one of those three error classes already causes
// generateBriefVersion to finalize a real, terminal, failed GenerationRun/GenerationStep before
// rethrowing (confirmed, §1.3) — the workspace read model was always the correct place to observe
// a terminal outcome that happens after the response is sent; the prior draft's design just never
// let the response return early enough for that to matter.
```

Steps (each numbered step maps directly to one US-3 acceptance criterion):

1. `getInvestigation(investigationId)` (existing, unchanged). Not found → `{ outcome: 'not-found' }`
   (404). Confirms the Investigation row before any write is attempted (US-3 AC1).
2. Eligibility check, applying the **Generation Eligibility Rule** (the single definition; every
   other reference in this document, and `generationEligible` in §3.2, points here rather than
   restating it) — **revised, 2026-08-22 material scope correction (US-13 restored)**:

   > A new generation run may be triggered from:
   > - `'open'` (initial generation, US-3) — always eligible;
   > - `'generation-failed'` (retry, US-6 AC3) — always eligible;
   > - `'brief-generated'` (correction, US-13) — eligible **if and only if**
   >   `hasEligibleNewEvidenceSinceCurrentBriefVersion(investigationId)` (§4.8, revised Finding 5)
   >   is `true`. A
   >   `'brief-generated'` Investigation with no newly added source since its current
   >   `BriefVersion` was created remains ineligible — status alone never grants eligibility (US-13
   >   AC2, Non-Functional Requirements).
   >
   > and only when no `GenerationRun` for this Investigation currently has
   > `outcome === 'in-progress'` in every case above. `'blocked'` is never eligible (US-3 AC1, US-5
   > AC1) regardless of evidence state. `generationEligible` in §3.2 is this rule evaluated
   > server-side; the client never re-derives it.

   This revises the prior draft's blanket "`'brief-generated'` is never eligible" rule, which
   reflected US-13 being out of scope at the time. The evidence-gated branch above is the only
   change; the `'open'`/`'generation-failed'` branches, and the concurrent-run guard, are unchanged
   from the prior draft.

   Ineligible → `{ outcome: 'ineligible', currentStatus, reason }` (422); when the ineligible cause
   is specifically a `'brief-generated'` Investigation with no new evidence, `reason` states that
   explicitly (e.g. `"no new source evidence has been added since the current Brief version"`) so
   the connector's 422 is distinguishable from a `'blocked'` 422 by message, not only by
   `currentStatus`. This mirrors, at the connector boundary, the same `ALLOWED_PRIOR_STATUSES`
   reasoning `transitionInvestigationStatus.ts` already encodes for status transitions — it does not
   duplicate that module's logic, it gates entry to `generateBriefVersion` before that module's own
   internal checks would run. Per `01-REQUIREMENTS.md`'s Constraints, this checkpoint continues to
   assume `transitionInvestigationStatus.ts`'s existing `ALLOWED_PRIOR_STATUSES['brief-generated'] =
   ['open', 'generation-failed', 'brief-generated']` self-transition entry is sufficient for US-13
   and requires no change — the eligibility gate above is additive, in the connector, not a change
   to that module.
3. Determine `supersedesVersionId` server-side (US-3 AC3, US-13 AC3): read `ProblemBrief` for
   this Investigation via the existing `getInvestigation` result's `problemBriefId`; if a
   `ProblemBrief` exists, pass its `currentVersionId` as `supersedesVersionId` (a correction); if
   none exists, omit it (an initial generation). The client never supplies this flag — there is no
   field for it in `CreateGenerationRunRequestBody` (§3.1). **Revised, 2026-08-22**: the prior draft
   stated this branch was unreachable through this connector because `'brief-generated'` was never
   eligible; US-13 restores exactly this path — a `'brief-generated'` Investigation with new
   evidence (step 2's revised rule) reaches this step with a `ProblemBrief` already existing, so
   `supersedesVersionId` is set to its `currentVersionId` and this is now the live US-13 correction
   path, not dead code. It is also still reachable for an `'open'`/`'generation-failed'`
   Investigation that happens to already have a `ProblemBrief` (e.g. a prior correction attempt that
   failed) — unchanged from the prior draft's reasoning for that case.
4. Resolve `runtimeIdentifier` from server configuration (an environment variable or equivalent
   configured value — not a route parameter, not a hardcoded literal string presented as
   provenance). **Numeric/string constant note**: no specific runtime-identifier value is
   prescribed by this document; whichever value Forge wires must be a real, meaningful identifier
   of the actual execution environment (e.g. a package version or deployment tag), never a
   placeholder string — this is a qualitative requirement (US-3 AC4), not a number requiring a
   PROVISIONAL tag.
5. **Kick off `generateBriefVersion` without awaiting its resolution (Finding 1)**, racing a
   `runCreated` promise against its rejection so a genuine concurrency conflict is still caught
   synchronously:
   ```typescript
   let resolveRunCreated: (run: GenerationRun) => void;
   let rejectRunCreated: (err: unknown) => void;
   const runCreated = new Promise<GenerationRun>((resolve, reject) => {
     resolveRunCreated = resolve;
     rejectRunCreated = reject;
   });

   const pipeline = generateBriefVersion({
     investigationId,
     supersedesVersionId,
     runtimeIdentifier,
     onRunCreated: (run) => resolveRunCreated(run), // §1.3 — fires the instant Phase 1's INSERT
                                                     // (createGenerationRun) succeeds
   });
   // Synchronization catch (Finding 1) — NOT step 5b's safety net (that is attached separately,
   // below, only once `generationRun` is genuinely assigned). This handler's sole job is to relay a
   // pre-Phase-1 rejection into `runCreated` so the try/catch immediately below can respond to the
   // client synchronously. The ONLY way `generateBriefVersion` can reject BEFORE `onRunCreated` ever
   // fires is a failure inside or before `createGenerationRun` itself (Phase 1) — most concretely,
   // §1.1's partial unique index rejecting a concurrent INSERT with a 23505 error. For every OTHER
   // rejection (anything after Phase 1), this handler is a no-op: `runCreated` has already resolved
   // by the time such a rejection reaches here (standard promise semantics — a second resolve/reject
   // on an already-settled promise is silently ignored). This handler MUST NOT write a terminal
   // record and MUST NOT reference `generationRun` — it can run at a point where that binding does
   // not yet exist.
   pipeline.catch((err) => {
     rejectRunCreated(err);
   });

   let generationRun: GenerationRun;
   try {
     generationRun = await runCreated;
   } catch (err) {
     // isUniqueViolation is a NEW helper this checkpoint must create (no equivalent exists in
     // src/ today) — signature `isUniqueViolation(err: unknown, constraintName: string): boolean`,
     // checking that `err` is a Postgres error whose `code` property is `'23505'` AND whose
     // `constraint` property equals `constraintName`. It has no other caller in this document; it
     // exists purely to discriminate this one concurrency-guard rejection from a genuinely
     // unexpected pre-Phase-1 failure.
     if (isUniqueViolation(err, 'idx_generation_run_investigation_in_progress_unique')) {
       const existing = await pool.query<{ id: string }>(
         `SELECT id FROM generation_run WHERE investigation_id = $1 AND outcome = 'in-progress'`,
         [investigationId],
       );
       return { outcome: 'conflict', existingGenerationRunId: existing.rows[0].id };
     }
     throw err; // genuinely unexpected pre-Phase-1 failure — 500, not swallowed
   }
   ```
   The concurrent-generation guard is still `createGenerationRun`'s own `INSERT`, backed by §1.1's
   partial unique index — unchanged from the prior draft. What changes is WHEN the route learns the
   outcome: as soon as `onRunCreated` fires (i.e. the instant the INSERT commits), not after the
   full pipeline resolves.
5b. **After `runCreated` resolves, the route returns to the client — it does not `await pipeline`.**
   `pipeline` (the full `generateBriefVersion` call) keeps running in the same Node process,
   observed by nothing else in this request/response cycle. A SECOND `.catch()` — the safety net —
   is attached to `pipeline` at this point, i.e. only after the `try`/`catch` above has completed
   successfully and `generationRun` is genuinely assigned. Because it is attached here rather than
   at step 5, it can never observe a pre-Phase-1 rejection (those are already fully handled by the
   synchronization catch and the `try`/`catch` at step 5 above, which already returned a `409`
   response or rethrew a `500` before this line is even reached) and it can never dereference an
   unassigned `generationRun`:
   ```typescript
   pipeline.catch(async (err) => {
     if (
       err instanceof BriefGenerationFailedError ||
       err instanceof InvalidSupersedeTargetError ||
       err instanceof StaleCorrectionConflictError
     ) {
       // Ordinary case: pipeline has already durably finalized its own GenerationRun/GenerationStep
       // row before this handler runs (§1.3) — no second write, log only.
       console.error('generateBriefVersion typed failure (already finalized)', {
         generationRunId: generationRun.id,
         err,
       });
       return;
     }
     // NOT one of the three typed errors: generateBriefVersion's own internal finalization write
     // (finalizeGenerationRun / attemptGenerationFailedTransition) itself threw. Write the terminal
     // record ourselves, re-reading current state first — never assume 'in-progress', in case a
     // prior partial write already landed. Binding ordering contract (generateBriefVersion.ts:258-
     // 262, :306-309, :690-692, restated here because this safety net is a second, out-of-band
     // writer subject to the same rule): recordGenerationStep MUST be called BEFORE
     // finalizeGenerationRun, because finalize computes modelIdentifiers/toolsInvoked from the step
     // log at call time — reversing the order produces a finalized run that misrepresents its own
     // contents.
     await recordGenerationStep({
       generationRunId: generationRun.id,
       step: { outcome: 'failed', /* ... remaining GenerationStep fields */ },
     });
     await finalizeGenerationRun({
       generationRunId: generationRun.id,
       outcome: 'failed',
       briefVersionId: null, // no BriefVersion was produced — this meta-failure path never reaches one
     });
     console.error('generateBriefVersion meta-failure — wrote terminal record', {
       generationRunId: generationRun.id,
       err,
     });
   });
   ```
   `recordGenerationStep` and `finalizeGenerationRun` (`src/services/provenanceRecorder.ts:95-98`,
   `:139-144`) each take a single object parameter, not positional arguments; `briefVersionId:
   string | null` is a required field on `finalizeGenerationRun`'s input, `null` here because this
   meta-failure path never produces a `BriefVersion`. The route handler this step lives in needs a
   `pool` import (used at step 5a's conflict lookup above) that is not otherwise implied by this
   sample. `runCreated`/`onRunCreated`'s `resolveRunCreated`/`rejectRunCreated` are assigned inside a
   `Promise` executor, so their declarations need definite-assignment handling (TypeScript `!`, or
   an equivalent non-null assertion at the call sites) — otherwise the compiler cannot see they are
   always assigned before use.
   This is still "no queue/worker/background-job abstraction" (Out of Scope, unchanged): the SAME
   Node process, the SAME function call, just not blocking the HTTP response on its full resolution.
6. On success (`runCreated` resolved without the connector ever seeing a conflict): `{ outcome:
   'started', generationRunId: generationRun.id }` (`202` — §3.1). The client learns the run's
   eventual `briefVersionId`/`versionNumber`/terminal outcome exclusively from the next
   `GET .../workspace` poll (§3.2, §4.4) — never from this response.
7. This function no longer catches `BriefGenerationFailedError` / `InvalidSupersedeTargetError` /
   `StaleCorrectionConflictError` itself (Finding 1 — they can no longer surface before the
   response is sent, since the response is sent before the pipeline resolves). US-3 AC6's "never
   collapses them into one generic error" requirement is satisfied instead by `generateBriefVersion`
   itself, which already writes each error class's own real reason string into the failed run's
   `GenerationStep.error` (§1.3, `generateBriefVersion.ts:290-714`) — the workspace read model
   surfaces that distinct, real text per run/step (§3.2), never a generic collapsed message.

This function does not itself call `transitionInvestigationStatus` — `generateBriefVersion`
already owns every status transition it needs to make (per
`problem-department-mvp/02-ARCHITECTURE.md` §4's documented behavior), and this connector does not
duplicate that responsibility.

### 4.3 `recordDecision`

```typescript
// src/services/recordDecision.ts
function recordDecision(input: {
  briefVersionId: string;
  decision: RecommendationDecision;
  rationale?: string;
  reconsiderationConditions?: Array<{
    type: ReconsiderationConditionType;
    otherTypeLabel?: string;
    description: string;
  }>;
}): Promise<Decision>;
// Rejects (throws a typed WatchRequiresConditionError) if decision === 'Watch' and
// reconsiderationConditions is empty/absent, OR every supplied condition's `description` is
// whitespace-only after trim (01-REQUIREMENTS.md Edge Cases — "Watch submitted with a condition
// field present but whitespace-only"). No Decision or ReconsiderationCondition row is persisted on
// rejection — enforced by performing the validation BEFORE opening the insert transaction, and by
// the transaction covering both tables (§3.5).
// No decidedBy parameter (§1.2). Never mutates or reassigns an existing Decision's briefVersionId.
// Does not reject a second Decision on the same briefVersionId (matches problem-department-mvp §4's
// documented multi-Decision-per-version behavior, unchanged).

export class WatchRequiresConditionError extends Error {}
```

### 4.4 `getInvestigationWorkspace`

```typescript
// src/services/getInvestigationWorkspace.ts
function getInvestigationWorkspace(investigationId: string): Promise<InvestigationWorkspaceView | null>;
// Returns null iff no Investigation row exists for investigationId — the Express handler maps
// null to 404 (§4.1), never a 200 with an empty/placeholder body (US-1 AC4).
```

Assembly, read-only, no writes:

1. `getInvestigation(investigationId)` (existing) → `investigation`, `sourceArtifacts`. `null` short-circuits to `null`.
2. New SQL read: all `generation_run` rows for `investigationId`, each joined to its
   `generation_step` rows ordered by `step_index` (with `step_data`'s `validationRecords`/
   `toolInvocations` mapped through, Finding 2) and its `web_search_query`/`web_search_result`/
   `query_limitation` rows (Finding 2, §3.2's `WorkspaceWebSearchQuerySummary`), ordered
   `started_at DESC` — populates `generationRuns`/`latestGenerationRun`. `livenessState` (Finding
   8) is computed per run per §4.9, inline in this same read, not a second query.
3. If `investigation.problemBriefId` is set: all `brief_version` rows for that `problemBriefId`,
   ordered `version_number DESC` — populates `briefs`, with `isCurrent` computed against
   `ProblemBrief.currentVersionId`, and (US-12, §4.7) `assignedState` via
   `getAssignedState({ targetType: 'brief-version', targetId: briefVersion.id })` and
   `isSuperseded` via the same structural check as `getBriefForReview`, both computed inline in
   this same loop.
4. If `briefs` is non-empty: `getDecisionsForBriefVersion` (§4.5, revised Finding 6) for every
   `briefVersionId` in `briefs`, unioned and sorted `decidedAt ASC`, each entry labeled with its
   owning BriefVersion's `versionNumber` (from the `briefs` array already assembled in step 3) —
   populates `decisionLineage` (was `decisions`; renamed to make explicit this is the
   whole-Investigation lineage view, distinct from `getBriefForReview.priorDecisions`'s
   per-version list — US-10 AC11).
5. (US-13, §4.8, revised Finding 5) `hasEligibleNewEvidenceSinceCurrentBriefVersion(investigationId)`
   — populates `newEvidenceSinceCurrentBriefVersion`.
6. `generationEligible` computed per §4.2's revised Generation Eligibility Rule, reading
   `investigation.status`, whether any `generationRuns` entry has `outcome === 'in-progress'`, and
   (for the `'brief-generated'` branch only) step 5's `newEvidenceSinceCurrentBriefVersion` result.

### 4.5 `getDecisionsForBriefVersion`

```typescript
// src/services/getDecisionsForBriefVersion.ts

/** Revised, Finding 6: returns resolved reconsideration-condition CONTENT, never a bare
 *  ReconsiderationCondition id — the persisted Decision domain type (§3.4) stores
 *  `reconsiderationConditionIds: string[]` (correctly normalized), but every READ surface this
 *  sprint exposes (this function, and therefore both getInvestigationWorkspace's
 *  `decisionLineage` and getBriefForReview's `priorDecisions`) must resolve those ids to their
 *  actual `type`/`otherTypeLabel`/`description` before returning — the UI never receives an id it
 *  would have to render opaquely or resolve itself. */
export interface DecisionWithResolvedConditions {
  id: string;
  briefVersionId: string;
  decision: RecommendationDecision;
  decidedAt: string;
  rationale?: string;
  reconsiderationConditions: Array<{
    type: ReconsiderationConditionType;
    otherTypeLabel?: string;
    description: string;
  }>;
}

function getDecisionsForBriefVersion(briefVersionId: string): Promise<DecisionWithResolvedConditions[]>;
// Ordered decidedAt ASC. LEFT JOINs reconsideration_condition (aggregated per decision_id via
// json_agg, one query, not N+1) and maps each row's type/other_type_label/description straight
// through — no id-only intermediate shape is constructed or returned by this function.
```

### 4.6 `ssrfGuardedFetch.ts` fix (US-7)

Re-read `src/services/ssrfGuardedFetch.ts` in full this pass (not only the DNS branch). `safeLookup`
has **three** call sites for its `callback` parameter, all inside the same function:

1. `allowedTestHosts` bypass (`:135-138`) — forwards `(hostname, options, callback)` unchanged to
   the real `dns.lookup`.
2. IP-literal branch (`:140-153`) — hostname is already a literal IP; no DNS resolution needed.
3. DNS-resolution branch (`:155-181`) — the branch containing the defect (§ below).

**Declared signature today** (`:130-134`): `(err, address: string, family: number) => void` — a
fixed 3-arg shape. This is the defect's root cause at the type level: Node's custom-`lookup`
contract is not one fixed shape, it is selected by the caller's `options.all` — `{ all: true }`
(the shape Node's `autoSelectFamily` Happy-Eyeballs path uses) expects `callback(err, addresses)`
where `addresses` is an **array**; `{ all: false }`/omitted expects `callback(err, address,
family)`, the single-value shape. A callback typed and implemented for only the second shape
cannot correctly serve a caller using the first.

**Fix — widen the declared signature to the union, and make every call site branch on
`options.all`:**

```typescript
export function safeLookup(
  hostname: string,
  options: dns.LookupOneOptions | dns.LookupAllOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void,
): void
```

**Call-site cast (`:216` in `fetchWithGuards`) — unchanged, still required.** The single call site passing `safeLookup` to Node's `fetch`/`http` options (`lookup: safeLookup as unknown as net.LookupFunction`) keeps this cast unchanged by the widened callback signature. Node's own `net.LookupFunction` type still declares only the fixed `(err, address, family)` shape it has always declared — Node's public type does not model the `options.all`-conditional union this fix introduces — so the mismatch the cast was added to satisfy is not narrowed by this fix and the cast cannot be removed. Forge keeps it as-is; no edit is needed at `:216`.

Call-site-by-call-site disposition — every one is addressed, none left ambiguous:

1. **`allowedTestHosts` bypass — no change.** It forwards the caller's own `options` object
   unchanged to the real `dns.lookup`, which already natively implements the `options.all`
   contract correctly (this is Node's own, already-correct implementation — the bug exists only in
   this file's hand-rolled branches below). No edit needed here; call out explicitly so Forge does
   not "fix" a branch that already works.
2. **IP-literal branch — must branch on `options.all`.** Currently unconditionally
   `callback(null, hostname, net.isIPv6(hostname) ? 6 : 4)` (the single-value shape). Fix:
   ```typescript
   if (options.all) {
     callback(null, [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }]);
   } else {
     callback(null, hostname, net.isIPv6(hostname) ? 6 : 4);
   }
   ```
   This branch was not previously suspected of the defect (see G2 disposition below), but the
   signature widening applies to it too, so it must be updated in the same edit or it stops
   typechecking against the new callback type while still being called with the old 3-arg shape.
3. **DNS-resolution branch — the primary fix.** After the existing all-or-nothing block check
   passes (`blocked` is falsy — no resolved address was disallowed, this check itself is unchanged,
   see below), branch on `options.all`:
   ```typescript
   if (options.all) {
     callback(null, addresses);
   } else {
     const chosen = addresses[0];
     callback(null, chosen.address, chosen.family);
   }
   ```
   The err-path callbacks (`:157`, `:161`) keep their existing 3-arg `(err, '', 0)` shape — an
   error path has no address data to shape either way, and Node accepts the 3-arg error form
   regardless of `options.all`.

**The blocking check is fail-closed and correct as-is and must not change**: if *any* resolved
address is disallowed, the entire hostname is rejected with `EBLOCKEDHOST` — no address proceeds,
in either the `options.all` or non-`options.all` branch. There is no "filter out only the blocked
addresses and proceed with the rest" behavior in the live code, and implementing one would convert
this guard from fail-closed to fail-open; it must not be built. No change to `isDisallowedIp`,
`decodeMappedIpv4Hex`, `inIpv4Cidr`, `ipv4ToInt`, or any constant.

**IP-literal exemption claim — withdrawn as an assertion (G2).** The prior draft of this section
asserted "Node 22 skips the custom `lookup` for literal-IP hosts," citing only this file's own
comment (`ssrfGuardedFetch.ts:199-202`) as if it were an external confirmation — it is not; it is
this codebase's own prior reasoning about itself, unverified against Node's actual documented or
observed behavior. That assertion is removed. What **is** verified this pass, and is kept: `url`-
type sources with **hostnames** (not IP literals) fail to resolve correctly under Node 22's
`autoSelectFamily` + `{ all: true }` custom-`lookup` contract, because the DNS-resolution branch's
callback shape does not match what that contract requires (confirmed by direct inspection of the
branch's callback invocation vs. Node's documented `{ all: true }` custom-`lookup` shape).

Whether IP-literal hosts are *also* affected — i.e., whether Node's `http`/`https`/`net` layer
actually invokes the custom `lookup` option at all for a URL whose hostname is already a literal
IP, under this repo's live Node version — is **not** asserted either way in this document.
**Diagnosing the exact failure boundary, including whether IP-literal hosts are affected, is
Forge implementation work for C2-S1**, not a design-time claim. Forge must observe actual behavior
(e.g., by instrumenting `safeLookup`'s entry and confirming whether it is invoked at all for an
IP-literal `startUrl`) before writing any test that depends on a skip/no-skip assumption.

**Regression coverage (US-7 AC2) — executable today, not dependent on the unresolved boundary:**

1. A behavioral test asserting that a real, actually-reachable **hostname-based** source
   (resolving via real DNS on the production code path — not the `allowedTestHosts` bypass branch
   that previously masked this bug in the suite) is fetched successfully end-to-end under the
   Node version this repo runs (`package.json`'s declared engine / the CI runner's actual Node
   version — Forge confirms which at implementation time; this document does not assert a specific
   patch version).
2. A direct unit test on `safeLookup` (not routed through `fetchWithGuards`, and not using the
   `allowedTestHosts` fixture, which bypasses this exact branch) asserting the IP-literal branch's
   new `options.all === true` arm: call `safeLookup('8.8.8.8', { all: true }, callback)` and
   assert `callback` is invoked with `(null, [{ address: '8.8.8.8', family: 4 }])` — the
   array-shaped result call-site disposition 2 adds. `8.8.8.8` (Google Public DNS) is used instead
   of a loopback/private literal because it must actually reach the edited success arm at
   `ssrfGuardedFetch.ts:151`: `127.0.0.1` is rejected by the fail-closed block check at
   `ssrfGuardedFetch.ts:142-148` before that arm is ever reached (`isDisallowedIp` →
   `inIpv4Cidr(ip, '127.0.0.0', 8)` matches it directly). `8.8.8.8` is verified against every
   range `isDisallowedIp` blocks (`ssrfGuardedFetch.ts:94-106`): not in `10.0.0.0/8`,
   `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `0.0.0.0/8`,
   `100.64.0.0/10` (CGNAT), `224.0.0.0/4` (multicast), `240.0.0.0/4` (reserved), or
   `192.0.0.0/24` (IETF protocol assignments) — so `isDisallowedIp('8.8.8.8')` returns `false` and
   the test reaches the IP-literal `{ all: true }` success arm this test exists to cover, not the
   block-check branch. This is the one edited code path with no asserting test before this fix; it
   must exercise call-site disposition 2 directly, not the bypass branch (disposition 1), which is
   unchanged and does not contain the new arm.
3. A regression case (unchanged from the prior draft) asserting that a hostname resolving to a
   mixed allowed/disallowed address set is still rejected in full with `EBLOCKEDHOST` under
   `{ all: true }` — proves the block semantics were not weakened by the shape fix.
4. A regression case asserting `safeLookup` invoked with `options.all` falsy (a direct unit call,
   not routed through `fetchWithGuards`) returns the single-value `(err, address, family)` shape
   for both the IP-literal and DNS-resolution branches — proves the non-`{ all: true }` invocation
   path (call-site disposition 2 and 3 above) was not broken by widening the signature.

None of these four require the skip/no-skip claim to be true or false — all four assert observed,
reproducible behavior under the real code path.

### 4.7 Validity/Invalidation Service (US-12)

Contract reused verbatim from `problem-department-mvp/02-ARCHITECTURE.md` §4 ("Validity /
Invalidation Service (Q-3)" and the two `getAssignedState*` queries) — not redesigned, per
`01-REQUIREMENTS.md`'s binding instruction to reuse the exact already-committed bitemporal contract.

```typescript
// src/services/validityState.ts (new)

function assignValidityState(input: {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  assignedState: AssignedValidityState;
  effectiveAt: string;              // when this became true in the represented world; may be in
                                     // the past, to record a late-discovered correction
  reason: string;
  recordedBy: string;               // system/process identifier, not a human actor (§3.6)
}): Promise<{
  statusEvent: StatusEvent;
  dependentDecisionIds: string[];   // computed at call time, not stored redundantly — see steps
                                     // below (US-12 AC2)
}>;

/** Revised (Finding 7): thrown by assignValidityState BEFORE the append-only INSERT when
 *  targetId does not exist as a row of the claimed targetType — since the row can never be
 *  corrected once written, existence/type is validated at write time, not left as a possible
 *  dangling reference. */
class InvalidValidityTargetError extends Error {}

// Query 1 — current-knowledge: "what state is currently assigned as effective at time T?"
// Latest StatusEvent for (targetType, targetId) with effectiveAt <= asOf, evaluated against
// everything ever recorded (no recordedAt bound); 'valid' if no StatusEvent exists. This answer
// CAN change over time if a later, backdated StatusEvent is recorded — expected (US-12 AC5).
// Ordering (Finding 7): "latest" is ORDER BY effective_at DESC, recorded_at DESC, sequence DESC
// LIMIT 1 — `sequence` (§3.6, a monotonic BIGSERIAL) is the deterministic tiebreak for two events
// on the same target with equal effective_at AND equal recorded_at (both are caller-supplied /
// clock-derived and not guaranteed distinct); `sequence` is DB-assigned insertion order and is
// always distinct, so ordering is fully deterministic in every case, never ambiguous.
function getAssignedState(input: {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  asOf?: string;                    // defaults to now
}): Promise<AssignedValidityState>;

// Query 2 — as-of-knowledge: "what state had Department OS recorded as effective at time T, as of
// knowledge-time K?" Latest StatusEvent with effectiveAt <= asOf AND recordedAt <= knownAsOf;
// 'valid' if none exists. knownAsOf is required — no default (US-12 AC4).
function getAssignedStateAsRecorded(input: {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  asOf?: string;                    // defaults to knownAsOf
  knownAsOf: string;                // required, no default
}): Promise<AssignedValidityState>;
```

**`assignValidityState` orchestration** (US-12 AC2, dependent-decision reconstruction):

0. **Target existence/type validation (Finding 7), BEFORE the INSERT.** Within the same
   transaction as step 1's insert: `SELECT 1 FROM claim_version WHERE id = $1` (when
   `targetType === 'claim-version'`) or `SELECT 1 FROM brief_version WHERE id = $1` (when
   `targetType === 'brief-version'`). Zero rows → roll back, throw `InvalidValidityTargetError` —
   no `StatusEvent` is ever written for a dangling or wrong-type target. This closes the gap a
   polymorphic (non-FK) `target_id` column (§3.6) would otherwise leave open, since Postgres cannot
   enforce it declaratively.
1. Append a new `StatusEvent` row (`status_event`, §3.6) — never an update to an existing row.
   Same transaction as step 0, so validation and insert are atomic (no window where a status_event
   references a target that was concurrently deleted — not that any table in this schema is
   deletable today, but the transaction boundary makes this true structurally rather than by
   accident of "nothing deletes yet").
2. Resolve every `BriefVersion` that references `targetId`: when `targetType === 'brief-version'`,
   the single matching `BriefVersion` itself; when `targetType === 'claim-version'`, every
   `BriefVersion` whose `claimVersionIds` includes `targetId` (reverse lookup via
   `WHERE $1 = ANY(brief_version.claim_version_ids)` against the `brief_version.claim_version_ids
   UUID[]` column, migration 007, unchanged schema).
3. For each matching `BriefVersion`, read every `Decision` bound via `Decision.briefVersionId`
   (`getDecisionsForBriefVersion`, §4.5, reused unmodified).
4. Filter to `Decision`s where `getAssignedStateAsRecorded({ targetType, targetId, asOf:
   decision.decidedAt, knownAsOf: decision.decidedAt })` returns `'valid'` — i.e. the target's
   assigned state, reconstructed exactly as Department OS knew it at the moment the decision was
   made, was last `'valid'`. `knownAsOf = Decision.decidedAt` is the exact contract
   `problem-department-mvp/02-ARCHITECTURE.md` (~line 2222) and `01-REQUIREMENTS.md`'s task description bind — reused, not
   redesigned.
5. `dependentDecisionIds` = the filtered `Decision.id[]`. An Investigation/`BriefVersion` with zero
   `Decision`s recorded yet returns `[]` — a real, correct answer, not an error (Edge Cases table).

**No browser-reachable trigger.** `assignValidityState` is called only from service code, a test
harness, or Forge verification this checkpoint (Out of Scope) — no Express route, no client `api.ts`
export, no UI control anywhere in §5 invokes it.

**Read-side wiring**: `getBriefForReview` (§3.3) and `getInvestigationWorkspace` (§4.4, revised
below) both call `getAssignedState` per `BriefVersion`/`ClaimVersion` they resolve — this is the
only change to either function's *behavior* this revision makes; neither function's *return shape*
changes (`assignedState` was already a documented field in both, previously resolving through the
fallback described in §3.3's revised note).

`getInvestigationWorkspace` (§4.4) step 3 is revised to additionally compute, per `BriefVersion` in
`briefs`: `assignedState` via `getAssignedState({ targetType: 'brief-version', targetId:
briefVersion.id })`, and `isSuperseded` via the same structural check `getBriefForReview` already
uses (`BriefVersion.supersedesVersionId` — some other row in this `problemBriefId`'s lineage names
this one). No new query round-trip beyond what §4.7 already requires — `getAssignedState` is called
once per `BriefVersion` in the existing loop, not added as a separate pass.

### 4.8 Resubmission Eligibility Check (US-13, revised per Finding 5 / tightened 01-REQUIREMENTS.md 2026-08-23)

```typescript
// src/services/getInvestigationWorkspace.ts (helper, not a separate file — used by both
// InvestigationWorkspaceView.newEvidenceSinceCurrentBriefVersion (§3.2) and the Generation Run
// Connector's revised eligibility rule, §4.2 step 2)
function hasEligibleNewEvidenceSinceCurrentBriefVersion(investigationId: string): Promise<boolean>;
// Renamed from hasNewEvidenceSinceCurrentBriefVersion (Finding 5) — the prior name and mechanism
// (bare added_at > createdAt) could not express the tightened AC2 disqualifiers below; the new
// name states what it actually checks: eligible, not merely present.
```

**Mechanism** (US-13 AC2 — a source counts toward eligibility only when it is genuinely new,
usable, and not already consumed by the current `BriefVersion`; unreachable/unresolved, empty,
duplicate-of-consumed, and already-reflected sources never unlock eligibility):

1. Read `ProblemBrief.currentVersionId` for `investigationId`; if no `ProblemBrief` exists yet,
   return `false` (there is nothing to be "new since" — an initial generation is gated by the
   `'open'` branch of §4.2's rule, not this one).
2. Read that `BriefVersion.createdAt` and `claimVersionIds` (existing `UUID[]` column, migration
   007).
3. **Consumed-evidence set** — the identity (`raw`) of every `source_artifact` this Investigation's
   current `BriefVersion` was actually generated from, via the existing evidence chain (no new
   table):
   ```sql
   SELECT DISTINCT sa.raw
     FROM source_artifact sa
     JOIN evidence_item ei ON ei.source_artifact_id = sa.id
     JOIN claim_version_evidence cve ON cve.evidence_item_id = ei.id
    WHERE sa.investigation_id = $1
      AND cve.claim_version_id = ANY($2::uuid[]) -- currentBriefVersion.claimVersionIds
   ```
4. **Candidate new sources** — usable, submitted after the current `BriefVersion` was created:
   ```sql
   SELECT raw FROM source_artifact
    WHERE investigation_id = $1
      AND added_at > $currentBriefVersionCreatedAt
      AND resolution_status = 'content-retrieved' -- excludes 'unresolved'/'unreachable'
                                                    -- (AC2 "unreachable or unresolved") AND
                                                    -- 'reachable-no-content' (AC2 "empty") in one
                                                    -- column check — no new column needed,
                                                    -- resolution_status already distinguishes all
                                                    -- four outcomes (001_initial_schema.sql)
   ```
5. Eligible iff at least one candidate's `raw` (trimmed, case-normalized) does NOT appear in the
   consumed-evidence set from step 3 — this is the "duplicate of an already-consumed source" check
   (AC2 third bullet): the same URL/document resubmitted verbatim never counts, even as a distinct
   `Source` row.
6. **"Already reflected in the current BriefVersion" (AC2 fourth bullet) is satisfied
   structurally, not by an extra query**: a candidate source is one whose `added_at` postdates the
   current `BriefVersion.createdAt` (step 4's own filter) — evidence extraction for a `BriefVersion`
   only ever runs at that version's own generation time (`generateBriefVersion`'s unmodified
   pipeline), so no source added AFTER that generation ran can already be linked into that same
   version's evidence chain. A source added before generation, by construction, is already covered
   by step 3's consumed-evidence set if it was actually used, or was never a candidate in step 4 to
   begin with if it postdates nothing. This is stated explicitly, not left implicit, so Forge does
   not add a redundant fifth query that step 3+4's combination already makes unreachable.
7. Return the step-5 boolean directly.

**Why this replaces a bare timestamp comparison (Finding 5)**: `added_at > createdAt` alone could
not express any of AC2's four disqualifiers. This mechanism adds exactly two already-persisted
signals — `resolution_status` (excludes unreachable/unresolved/empty) and the existing evidence
chain (excludes duplicate-of-consumed) — with no new column, no new table, no content-hashing
infrastructure invented beyond a plain string-equality/trim comparison on `source_artifact.raw`
(sufficient for the "same URL/document resubmitted verbatim" case AC2 names; a fuzzier
content-similarity dedup is not required by the AC and is not built). No coupling to
`submitSources`/`resolveInvestigationSources` (both remain completely unmodified, per
`01-REQUIREMENTS.md`'s Constraints "Assumes" list) and no call into `assignValidityState` (US-12) —
this function only reads.

### 4.9 Stale/Interrupted Run Detection (US-4, Finding 8)

**Mechanism**: computed at `getInvestigationWorkspace` read time (§4.4 step 2), never a stored
column — no process can write to a crashed run's own row, so "stale" and "interrupted" are, for
this MVP's direct-in-process-no-crash-recovery design (Out of Scope, unchanged), the SAME
detectable signal: no further `GenerationStep` progress recorded for longer than a threshold, on a
run that has not reached a terminal `outcome`. This is honest about what a single Node process can
actually observe — there is no separate process-liveness signal available (Out of Scope: no
queue/worker/process registry), so this checkpoint does not claim to distinguish "the process is
technically still running but stuck" from "the process crashed"; both present identically to a
client with no other process to query, and both are disclosed the same way.

```typescript
// Computed inline in getInvestigationWorkspace's existing generationRuns read (§4.4 step 2), not a
// separate query per run.
function computeLivenessState(run: {
  outcome: 'in-progress' | 'succeeded' | 'failed';
  startedAt: string;
  latestStepCompletedAt: string | null; // completedAt of steps[steps.length - 1], or null if no
                                         // step has been recorded yet
}): 'active' | 'stale-or-interrupted' | 'terminal' {
  if (run.outcome !== 'in-progress') return 'terminal';
  const lastProgressAt = run.latestStepCompletedAt ?? run.startedAt;
  const elapsedMs = Date.now() - new Date(lastProgressAt).getTime();
  return elapsedMs > STALE_THRESHOLD_MS ? 'stale-or-interrupted' : 'active';
}
```

**`STALE_THRESHOLD_MS` — engineering-owned, derived at Forge implementation time from real
measurement, not asserted here as a specific number.** `STALE_THRESHOLD_MS` and `POLL_INTERVAL_MS`
(§5.2) are both engineering parameters — how often to poll and how long silence must persist before
a run is disclosed as stale are questions about observed system behavior (actual generation
latency, actual concurrent load, actual endpoint cost), not product decisions Danny is positioned
to ratify by inspection at spec time. No existing timeout in this codebase's LLM/API client
configuration is directly reusable here: `src/services/llmClient.ts` (the LLM client
`generateBriefVersion` calls into) configures no timeout at all; the only existing timeout constant
in this codebase is `FETCH_TIMEOUT_MS = 10_000` (`src/services/ssrfGuardedFetch.ts`), which bounds
a single outbound source-URL fetch, not an LLM generation call or a polling cadence — cited here
for completeness, not reused as a source for this value.

**Derivation methodology (to be executed during Forge, before implementation is considered
complete)**:
1. Run real generation end-to-end and record actual elapsed time per `GenerationStep` and per full
   run — this is the same real-pipeline measurement `01-REQUIREMENTS.md`'s acceptance criteria now
   require Forge to report; do not estimate or guess at this figure.
2. From that measured distribution, set `STALE_THRESHOLD_MS` to the measured legitimate-processing
   time (a conservative percentile of observed step/run latency, not the minimum or the average)
   plus an explicit safety margin stated as a ratio or fixed addition — sized so that normal
   latency variance never trips a false stale warning, and documented as such next to the constant.
3. Set `POLL_INTERVAL_MS` from the same measurement plus expected concurrency (how many simultaneous
   investigation workspaces/polls this single-process design realistically serves, §4.2/Out of
   Scope) and endpoint cost (poll frequency vs. the actual DB read load `getInvestigationWorkspace`
   performs per poll) — frequent enough that the UI feels active during a real generation run,
   infrequent enough not to impose meaningful load at expected concurrency.
4. Record the derived values, the measured inputs they were computed from, and the safety-margin
   arithmetic as code comments directly next to `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` in
   their implementation file — not in a separate tracking artifact — per Danny's explicit
   instruction on where derived-constant evidence belongs.

This document does not assert a specific numeric default for either constant. Nothing in §4.9
depends on `STALE_THRESHOLD_MS`'s specific magnitude — only on the behavioral contract that it is
some measured-and-margined duration of no `GenerationStep` progress on a non-terminal run.

**Surfaced to the workspace** as `WorkspaceGenerationRunSummary.livenessState` (§3.2) — the ONLY
field the UI may use to distinguish a healthy in-progress run from a stale/interrupted one; the
underlying `outcome` column is never overloaded to carry this distinction (`outcome` stays exactly
`'in-progress' | 'succeeded' | 'failed'`, matching the persisted `generation_run.outcome` CHECK
constraint unchanged). Polling behavior (§5.2) stops or transitions to a non-misleading state once
`livenessState === 'stale-or-interrupted'`, per US-4's last AC — the client does not keep polling a
run indefinitely once it has been disclosed as stale/interrupted, since no further progress will
ever be recorded for it.

---

## 5. React SPA — Route and Component Boundaries

### 5.1 Router change

```typescript
// src/client/App.tsx — two new <Route>s, added inside the existing <Routes> (Checkpoint 1's shell,
// PersistentNav, and the two existing routes are unchanged):
<Route
  path="/departments/problem-department/investigations/:investigationId"
  element={<InvestigationWorkspaceScreen />}
/>
<Route
  path="/departments/problem-department/investigations/:investigationId/versions/:versionNumber"
  element={<InvestigationWorkspaceScreen />}
/>
```

Both routes render the SAME `InvestigationWorkspaceScreen` component (Finding 3) — the second is
not a distinct screen or a "lineage browser" (Out of Scope, unchanged), it is the same workspace
told which version to display via `versionNumber` (`useParams`), reload-stable because the version
is in the URL path itself, not component state. When `versionNumber` is absent, the screen shows
`ProblemBrief.currentVersionId`'s content (current behavior, unchanged); when present, it fetches
that specific prior version via `GET .../brief-versions/by-version/:versionNumber` (§3.1a, §4.1)
instead.

Direct URL access and in-app navigation resolve to the same component and the same data fetch
(`GET .../workspace` on mount) — no separate "entered via link" vs. "entered via URL bar" code
path (US-1 AC1).

### 5.2 `InvestigationWorkspaceScreen` — state and polling

```typescript
// src/client/screens/InvestigationWorkspaceScreen.tsx
interface InvestigationWorkspaceScreenState {
  workspace: InvestigationWorkspaceView | null;  // null while loading or on not-found
  notFound: boolean;
  error: string | null;
  brief: GetBriefForReviewResult | null;         // fetched separately once a target version is
                                                   // known (either workspace.briefs' isCurrent
                                                   // entry, or the :versionNumber route param —
                                                   // §5.1, Finding 3)
  decisionSubmission: { pending: boolean; error: string | null; confirmedDecisionId: string | null };
}
```

Polling (US-4 AC2): while `workspace.latestGenerationRun?.livenessState === 'active'` (§3.2, §4.9 —
revised, Finding 8: polling keys off `livenessState`, not the bare `outcome === 'in-progress'`
check the prior draft used, so a stale/interrupted run does not poll forever), the screen re-fetches
`GET .../workspace` at an interval governed by `POLL_INTERVAL_MS` — **engineering-owned,
derived during Forge from real measured generation timing, expected concurrency, and endpoint cost,
per §4.9's derivation methodology; not a specific value fixed at spec time.** The behavioral
requirement this document commits to is: polling frequent enough that the UI reads as actively
progressing during a real generation run, without imposing meaningful load on
`getInvestigationWorkspace` at expected concurrency (§4.9). `STALE_THRESHOLD_MS` is likewise
derived, not asserted here as a multiple of a fixed `POLL_INTERVAL_MS` value — see §4.9 for the
full methodology and where the derived values and their measured evidence get recorded. Polling
stops (clears the interval) once `livenessState` transitions to `'terminal'`
or `'stale-or-interrupted'` (US-4 AC5, revised) — implemented as a `useEffect` keyed on
`workspace.latestGenerationRun?.livenessState`, not a fixed-count poll budget (no additional
numeric constant is introduced for "max polls"). When `livenessState === 'stale-or-interrupted'`,
the screen renders an explicit disclosure (§5.3's `GenerationProgressPanel`) instead of continuing
to imply the run is healthily in progress.

Brief content (§3.3's `getBriefForReview` result) is fetched once per displayed version: the
current version when no `:versionNumber` route param is present (via `workspace.briefs`' `isCurrent`
entry's `versionNumber`), or the routed `:versionNumber` directly when present (US-1 AC5, Finding
3) — via `GET /api/investigations/:investigationId/brief-versions/by-version/:versionNumber` (full
contract §3.1a, §4.1) thin-wrapping `getBriefForReview` — not embedded inside
`InvestigationWorkspaceView` itself, keeping the frequently-polled workspace payload small and the
seven-element Brief payload fetched exactly once per version, not re-fetched on every poll tick.
`submitDecision` below posts to `POST /api/brief-versions/:briefVersionId/decisions` (full contract
§3.1a, §4.1) — always against the internal `briefVersionId` the fetched `GetBriefForReviewResult`
itself carries, so a decision is only ever recorded against the exact version currently on screen,
prior or current alike (US-10 AC1).

```typescript
// src/client/api.ts — additions
export async function fetchInvestigationWorkspace(investigationId: string): Promise<InvestigationWorkspaceView>;
export async function createGenerationRun(investigationId: string): Promise<CreateGenerationRunResponseBody>;
export async function addSourcesToInvestigation(
  investigationId: string,
  artifacts: Array<{ type: SourceArtifactType; raw: string }>,
): Promise<CreateInvestigationResponseBody>; // §1.4, §3.1b, H-1-corrected — thin wrapper around the
                                              // EXISTING createInvestigation/POST /api/investigations
                                              // (src/client/api.ts, unmodified), always supplying
                                              // investigationId; not a call to a separate route
export async function fetchBriefForReviewByVersionNumber(
  investigationId: string,
  versionNumber: number,
): Promise<GetBriefForReviewResult>; // §3.1a, revised Finding 3
export async function submitDecision(
  briefVersionId: string,
  body: { decision: RecommendationDecision; rationale?: string; reconsiderationConditions?: ReconsiderationConditionInput[] },
): Promise<Decision>;
```

### 5.3 Component boundaries inside the screen

| Component | Responsibility |
|---|---|
| `InvestigationIdentityHeader` | Renders creation date, status, status reason, source count as the primary human-readable identity (US-1 AC3) — a shortened id may appear only as a secondary, explicitly-labeled detail, never the primary label |
| `AddSourceInline` | Revised (Finding 4/§1.4, H-1-corrected): its OWN small form (not a reuse of `StartInvestigationForm`, which has no `investigationId` prop and always calls `createInvestigation` with `investigationId` omitted — a new-Investigation-only call site, not a route difference), calling `addSourcesToInvestigation(investigationId, artifacts)` (§5.2) — a thin wrapper that always supplies `investigationId` to the EXISTING, extended `POST /api/investigations` (§3.1b). No `:id/sources` sub-route exists or is added. Mounted directly in the workspace for the Blocked-recovery, generation-failed-retry, AND `'brief-generated'` resubmission paths (US-2 AC3/AC4, US-5 AC3, US-8 AC1, US-13 AC1) — no navigation away from the workspace URL on submit; on success, triggers a workspace re-fetch (never a redirect). This is the ONLY control that can make a `'brief-generated'` Investigation generation-eligible again — there is no separate "regenerate"/"Generate correction" button anywhere in this component tree (Out of Scope, US-13), and submitting against a `'brief-generated'` Investigation never itself flips its status (§1.4/§3.1b's explicit skip branch) — only §4.8's eligibility check, read on the next poll, can make `GenerateButton` eligible. After a successful submission, the workspace re-fetch (`workspace.newEvidenceSinceCurrentBriefVersion`, §3.2, computed per §4.8's revised mechanism) is what flips `GenerateButton`'s (below) enabled state — `AddSourceInline` itself never directly triggers a generation request. |
| `GenerationProgressPanel` | Renders `latestGenerationRun`'s persisted steps only (US-4), including per-step `modelIdentifier`/`validationRecords`/`toolInvocations` and the run's `webSearchQueries` (§3.2, Finding 2) — no percent bar, no "currently executing" claim beyond the latest persisted step's `component` name. Revised (Finding 8): when `latestGenerationRun.livenessState === 'stale-or-interrupted'`, renders an explicit, honest disclosure (e.g. "This run has not reported progress recently and may have been interrupted") distinct from, and never visually identical to, the `'active'` in-progress rendering. |
| `GenerateButton` | Issues `POST .../generation-runs` (§4.1) when `workspace.generationEligible` is `true`; disabled with an honest, specific reason string otherwise (e.g. "add a new source to enable correction" for an ineligible `'brief-generated'` Investigation, sourced from the connector's 422 `reason` on a stale attempt, or computed client-side from `generationEligible === false` + `status === 'brief-generated'` + `!newEvidenceSinceCurrentBriefVersion` for the pre-emptive disabled state) — never a bare unconditional "Generate correction" affordance (Out of Scope, US-13) |
| `BlockedSourcesPanel` | Renders each `unreachable` source with its real `failureReason` (US-5 AC2) |
| `BriefReviewPanel` | Renders all seven Brief elements uncollapsed by default from `getBriefForReview`'s result — unchanged rendering contract from `problem-department-mvp`'s Slice 10 forward reference, now actually wired |
| `DecisionForm` / `DecisionConfirmationPanel` | Approve/Reject/Watch controls; in-place confirmation on the same URL (US-10 AC9); no Reopen affordance anywhere |
| `DecisionHistoryBanner` | Revised, US-12 + Finding 6 (was `DecisionHistoryList`, a plain chronological log; Trace row 23 restored to full scope). Renders TWO requirements-distinct lists, never merged (US-10 AC11): (1) `priorDecisions` from the currently-displayed version's own `GetBriefForReviewResult` (§3.3) — scoped to exactly that `briefVersionId`, with resolved reconsideration-condition content (§4.5); (2) `workspace.decisionLineage` (§3.2, was `decisions`) — every Decision across the WHOLE Investigation's ProblemBrief lineage, each entry explicitly labeled with its own `versionNumber` (e.g. "Decision recorded against Version 1"), rendered as a clearly separate section, never interleaved into list (1) without that per-entry label. Also renders, without burying and without requiring scrolling/interaction: the current `BriefVersion`'s `assignedState` (§3.2, via `workspace.briefs.find(b => b.isCurrent)`) as an explicit, human-readable statement ONLY when it is non-`'valid'` (`'challenged'`/`'invalidated'`) — never rendered when `'valid'`, per US-12 AC6's "never mistake a stale-but-displayed decision" framing; and `isSuperseded` with a NAVIGABLE link to the current version, addressed by its human-readable `versionNumber` (§5.1's versioned route, US-1 AC5, US-12's last AC) — not merely informative text — when `true`. No raw `StatusEvent` row, `targetId`, `briefVersionId`, or `ReconsiderationCondition` id is rendered as primary content anywhere in this component (Anti-Patterns, binding) — `assignedState` renders as a plain-language statement ("This Brief version has been challenged" / "invalidated"), not the enum literal verbatim, and every reconsideration condition renders its actual `description` text. |

`StartInvestigationForm.onSubmitted` (existing, `src/client/components/StartInvestigationForm.tsx`)
changes its one call site in `ProblemDepartmentScreen` from "trigger a same-page re-fetch" to "call
`navigate(`/departments/problem-department/investigations/${investigationId}`)`" — the component's
own props/contract (`onSubmitted: (investigationId: string) => void`) does not change; only what
the parent does with the callback changes (US-2 AC1). `AddSourceInline` (§5.3, revised Finding 4)
is a SEPARATE, new component — not this one reused — because `StartInvestigationForm` has no
`investigationId` prop and always calls `createInvestigation` (a new-Investigation-only route);
`AddSourceInline` calls `addSourcesToInvestigation` (§5.2) instead, and its own `onSubmitted`
equivalent triggers a workspace re-fetch, never a navigation, since the operator is already at the
destination.

The legacy Express route `GET /investigations/:id` (`src/web/server.ts:117-160`) is **not**
modified, fixed, or extended by this sprint — it remains exactly as `01-REQUIREMENTS.md` found it,
its `brief-generated` branch still 501ing. Every new browser-facing link this sprint adds (from
`ProblemDepartmentScreen`'s per-row "Open" affordance, from `StartInvestigationForm`'s submit
handler, from Mission Control) points at the new React route instead. This is a call-site change in
`ProblemDepartmentScreen.tsx`/`MissionControlScreen.tsx` (both existing, Checkpoint 1) from the
plain `<a href="/investigations/{id}">` full-page navigation Checkpoint 1 documented
(`product-surface-checkpoint-1/02-ARCHITECTURE.md` §6) to a React Router `<Link>`/`navigate()` call
targeting the new workspace route — the one call-site edit Checkpoint 1's own architecture already
flagged as pending this future workspace's existence ("no client-side route exists ... yet").

---

## 6. Patterns

| Pattern | Usage | Rationale |
|---|---|---|
| Server-computed derived flags (`generationEligible`, `isCurrent`) | Workspace/Brief read models | Single source of truth for client-facing affordance gating — the client never re-derives "can I submit a generation request" from raw status + run-list itself, avoiding drift between server and client eligibility logic |
| DB-enforced uniqueness over check-then-act | Concurrent-generation guard (§1.1) | Matches this doc set's existing pattern (`brief_version_generation_run_id_unique`, `problem_brief.investigation_id UNIQUE`) — a partial unique index is atomic at the database layer; an app-layer "check then insert" would race under concurrent requests |
| Typed error classes mapped 1:1 to a real, persisted, distinct outcome | `generateBriefVersion`'s own finalization (§1.3) surfaced via the Workspace Read Model (§3.2, §4.4), not via the connector's HTTP response (revised, Finding 1 — the connector no longer awaits the pipeline, so it can no longer map these synchronously) | `generateBriefVersion`'s three exported error classes already write their own real reason text into a terminal, failed `GenerationRun`/`GenerationStep` before rethrowing; the workspace read model surfaces that distinct text per run, never collapsing it into one generic message |
| Read model as a separate, purpose-built assembly function (not a shared "get everything" call) | `getInvestigationWorkspace` vs. `getBriefForReview` | The workspace payload is polled at `POLL_INTERVAL_MS` (§4.9, §5.2 — engineering-derived, not fixed here) and must stay small (no seven-element Brief content); the Brief payload is fetched once per version and can be large — matching Checkpoint 1's own `getMissionControlView`/`getProblemDepartmentOverview` split by call frequency and payload shape |
| Append-only persistence with `reject_update_or_delete()` trigger | `decision`, `reconsideration_condition`, `status_event` | Matches every other Brief-lineage table in this codebase (`brief_version`, `problem_statement`, `negative_finding`, etc.) — one established immutability mechanism, not a second one invented for this sprint |
| Assigned state answered exclusively by query, never a stored field | `getAssignedState`/`getAssignedStateAsRecorded` over `status_event` (§4.7) | Reused unchanged from the already-committed MVP contract (Q-3) — a mutable `status` column could not answer "what did we assign at time T," and this checkpoint does not reopen that decision |
| Eligibility gated by real, already-persisted signals (resolution status + consumed-evidence chain), not a mutable flag | `hasEligibleNewEvidenceSinceCurrentBriefVersion` (§4.8, revised Finding 5) | No new write path, no risk of a "pending correction" flag drifting out of sync with reality, and now expresses all four of US-13 AC2's disqualifiers (unreachable/unresolved, empty, duplicate-of-consumed, already-reflected) — keeps `submitSources`/`resolveInvestigationSources` fully unmodified (Constraints) |
| Two independent service calls, no shared trigger | `assignValidityState` (US-12) vs. `generateBriefVersion` with `supersedesVersionId` (US-13) | Danny's explicit 2026-08-22 ruling — neither operation invokes, depends on, or is gated by the other; enforced structurally by §4.8's mechanism containing no call into §4.7's module |

### Anti-Patterns (Do Not Use)

- Client-side polling-interval jitter/backoff logic not specified here — no additional numeric
  constant (backoff multiplier, max-interval cap) is introduced; a single fixed `POLL_INTERVAL_MS`
  (§5.2, §4.9 — engineering-derived at Forge time from real measurement, not a value fixed here) is
  the only interval this design uses.
- A shared "get everything about an Investigation" mega-read-model merging workspace polling data
  and full Brief content into one payload — rejected per the Patterns row above.
- Deriving `generationEligible` independently on the client from `status`/`generationRuns` — the
  server-computed field is the only source of truth (Patterns table).
- A queue/worker abstraction for `generateBriefVersion` invocation — explicitly out of scope; the
  connector calls it directly, in-process, with no separate worker/queue layer (§1.3, §4.2). This is
  NOT the same as awaiting it to completion: per Finding 1, the connector returns `202` the instant
  `onRunCreated` fires (§1.3), and `generateBriefVersion` continues un-awaited after that point
  (§4.2 steps 5/5b's promise-race). **Blocking the response on the full pipeline — awaiting
  `generateBriefVersion` in the same request/response cycle — is the anti-pattern this bullet
  prohibits, not the design used here.** The lack of a queue/worker means a process crash mid-run is
  not recoverable (honestly documented as not process-crash durable, §4.2 step 5b's comment; this
  must also appear as disclosed, non-alarming copy in the UI spec this document feeds, not silently
  omitted) — that limitation is about crash-durability, not about whether the HTTP response waits for
  completion, which it does not.
- Re-deriving `assignedState`/superseded coloring in the client from raw `BriefVersion` fields —
  `getBriefForReview` already computes and returns both; the client renders what it is given.
- A browser-reachable route, control, or `api.ts` export for `assignValidityState` — none exists in
  §4/§5 and none may be added this checkpoint (Out of Scope, US-12).
- A generic "Generate correction" control, or any control that fires a generation request against a
  `'brief-generated'` Investigation without a preceding evidence submission in the same session's
  server-side state — `GenerateButton` (§5.3) has no such unconditional code path.
- `assignValidityState` invoked from `hasEligibleNewEvidenceSinceCurrentBriefVersion`, `AddSourceInline`,
  or any part of the US-13 path, and vice versa — the two services share no call graph edge
  (Patterns table).

---

## 7. Dependencies

No new third-party dependency is introduced. This sprint extends the existing stack:

| Dependency | Version | Purpose |
|---|---|---|
| `express` | (existing, unchanged) | New routes mounted on the existing `apiRoutes` router |
| `pg` | (existing, unchanged) | New migrations/queries follow the existing `pool`/`PoolClient` pattern |
| `react-router-dom` | (existing, unchanged) | One new `<Route>`; `useNavigate`/`useParams` already used elsewhere in the SPA (Checkpoint 1) |
| `vite` / `vitest` | (existing, unchanged) | New client/server test files follow existing conventions |

---

## 8. Integration Points

- **`generateBriefVersion`** (`src/services/generateBriefVersion.ts`) — called directly, unmodified
  signature, by the new Generation Run Connector. No change to its internal pipeline, prompts, or
  extraction behavior (Out of Scope, binding).
- **`transitionInvestigationStatus`** (`src/services/transitionInvestigationStatus.ts`) —
  function itself is NOT modified; `generateBriefVersion` continues to own every status transition
  its own run needs. `POST /api/investigations`'s existing call site (`src/web/apiRoutes.ts:60-64`)
  is extended, not duplicated: the handler now reads pre-mutation status via `getInvestigation`
  first, skips this call entirely when that status is `'brief-generated'` (§1.4, §3.1b), and checks
  this function's returned `boolean` in every other case rather than ignoring it (H-1-corrected).
  The legacy `POST /investigations` form route's own call site (`src/web/server.ts:93`) is
  untouched.
- **`getInvestigation`** (`src/services/getInvestigation.ts`) — read by
  `getInvestigationWorkspace`, the Generation Run Connector's eligibility check, and (NEW this
  revision, H-1-corrected) `POST /api/investigations`'s extended handler — once before mutation, to
  branch on an existing Investigation's real current status, and once after, to respond with real,
  read-back status rather than an assumed one (§1.4, §3.1b); unmodified signature.
- **`submitSources` / `resolveInvestigationSources`** (existing) — reused unmodified, no new call,
  no new parameter, no new behavior. `AddSourceInline` (§5.3) calls them via the EXISTING
  `POST /api/investigations` route, extended in place (§1.4, §3.1b, H-1-corrected) — no new HTTP
  entry point is added onto them; the prior draft's `POST /api/investigations/:id/sources` is
  removed from this design.
- **Checkpoint 1 shell** (`src/client/App.tsx`, `PersistentNav`) — the new route is added inside
  the existing `<Routes>` sibling to `PersistentNav`, per Checkpoint 1's own documented mount
  structure (`product-surface-checkpoint-1/02-ARCHITECTURE.md` §6) — `PersistentNav` is never
  remounted on navigation into or within the workspace.
- **`ssrfGuardedFetch.ts`** — fixed in place (§4.6); both its existing call sites
  (`resolveSourceArtifact.ts`, `searchWeb`'s controlled retrieval path,
  `problem-department-mvp/02-ARCHITECTURE.md` §1.6) receive the fix automatically, with no
  independent re-application required — the shared-module design that section already established
  is exactly what makes this a one-file fix.
- **`generateBriefVersion`'s `supersedesVersionId` contract** (`generateBriefVersion.ts:108-160`,
  confirmed directly against source per `01-REQUIREMENTS.md`) — US-13's correction path calls the
  exact same connector (§4.2) and the exact same `generateBriefVersion` signature US-3 already
  uses; no new pipeline entrypoint, parameter, or overload is added for US-13 (Out of Scope,
  binding: "no re-implementation or modification of `generateBriefVersion`'s internal pipeline").
- **`source_artifact.added_at` / `resolution_status`** (`001_initial_schema.sql`, existing
  columns) and **`evidence_item` / `claim_version_evidence` / `brief_version.claim_version_ids`**
  (`004_claims_and_evidence.sql`, `007_problem_brief_and_versioning.sql`, existing) — read by
  §4.8's `hasEligibleNewEvidenceSinceCurrentBriefVersion` (revised, Finding 5); no schema change to
  any of these tables this checkpoint.
- **`generateBriefVersion`'s Phase-1 `createGenerationRun` call** (`generateBriefVersion.ts:231`) —
  gains one additive, optional `onRunCreated` hook parameter (§1.3, Finding 1); every other line of
  `generateBriefVersion.ts` is unchanged.

---

## Output Verification

- [x] Every `01-REQUIREMENTS.md` user story (US-1 through US-13, including US-12/US-13 restored by
      the 2026-08-22 material scope correction) has explicit architecture coverage (Components
      table `Satisfies` column, or the relevant §4/§5 subsection).
- [x] Schemas are complete TypeScript, not pseudocode (§3).
- [x] No implementation code bodies — only exact signatures/shapes and step-by-step orchestration
      contracts (§4.2, §4.4).
- [x] Every pattern is justified against an existing precedent in this codebase (§6).
- [x] Integration points identified for every existing service this sprint calls into (§8).
- [x] Both reconciliation gaps found during this design pass (§1.1, §1.2) are resolved with a
      stated reason, not silently patched or left as a HALT.
- [x] Two numeric constants total: `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` (§4.9, §5.2 —
      engineering-owned, neither fixed as a specific number at spec time; both derived during Forge
      from real measured generation timing, expected concurrency, and endpoint cost, per §4.9's
      explicit derivation methodology, with the derived values and their measured evidence recorded
      as code comments next to the constants, not a separate tracking artifact). §1.1's partial
      unique index remains a structural DB constraint, not a magic number. §4.7's bitemporal queries
      and §4.8's eligibility check remain pure comparisons against already-existing columns, not
      thresholds.
- [x] External review findings 1-8 and 11 (Codex + Sol, 2026-08-23) are each resolved with a stated
      mechanism, not a prose assurance: Finding 1 — §1.3, §4.2 (fire-and-forget + `onRunCreated`
      hook); Finding 2 — §3.2 (`validationRecords`/`toolInvocations`/`webSearchQueries` closed
      against real persisted tables); Finding 3 — §3.1a, §5.1 (human-readable `versionNumber`
      route, reload-stable); Finding 4 — §1.4, §3.1b (reuse and extend the existing `POST /api/investigations` route, no new `:id/sources` route);
      Finding 5 — §1.5, §4.8 (`hasEligibleNewEvidenceSinceCurrentBriefVersion` against real
      resolution-status + consumed-evidence chain); Finding 6 — §3.2, §4.5 (`decisionLineage` split
      from per-version `priorDecisions`, resolved condition content); Finding 7 — §3.6, §4.7
      (`sequence` column, target-existence validation before insert); Finding 8 — §4.9
      (`livenessState`, engineering-derived threshold per §4.9); Finding 11 — §0 (Checkpoint-1 edit boundary), §3.1
      (heading fix), and no "API response alone is sufficient" language found anywhere in this
      document (verified by search, not asserted).
- [x] US-12's full Slice 12 contract (`StatusEvent`, `assignValidityState`,
      `getAssignedState`/`getAssignedStateAsRecorded`, dependent-decision reconstruction,
      browser-visible non-valid/prior-decisions/supersession-history surfacing) is reused verbatim
      from the already-committed `problem-department-mvp/02-ARCHITECTURE.md` contract (§3.6, §4.7)
      — not redesigned — and carries no browser-reachable invalidation trigger (§4.7, §5.3,
      Anti-Patterns).
- [x] US-13's resubmission-driven correction path is gated exclusively on new-evidence-submitted
      (§4.2's revised rule, §4.8), calls the existing, unmodified `generateBriefVersion`
      `supersedesVersionId` contract (§8), and preserves every prior `BriefVersion` and its bound
      `Decision`(s) unmodified and independently retrievable (§3.4, §3.5's append-only tables — no
      new mutation path is introduced).
- [x] `assignValidityState` (US-12) and `generateBriefVersion` with `supersedesVersionId` (US-13)
      remain two independent operations with no shared trigger, control, or endpoint (§4.2 step 3
      comment, §4.7's "no browser-reachable trigger," §4.8's mechanism note, §6 Patterns/
      Anti-Patterns) — Danny's 2026-08-22 decoupling ruling is enforced structurally, not only by
      documentation.
