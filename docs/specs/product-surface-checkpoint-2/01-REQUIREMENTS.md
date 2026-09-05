# Requirements: Product Surface — Checkpoint 2

**Status**: Draft (pending Frank spec-gate + human approval) — returned for rework after Frank
attempt-1 PASS by Danny's material scope ruling, 2026-08-22 (see "Resolved Scope Corrections"
below). Further revised 2026-08-23 to address external-review (Codex + Sol) findings 3, 5, 6, 8 —
see inline AC changes in US-1, US-4, US-10, US-12, US-13 and the revised Out of Scope line below.
Further revised 2026-08-24 to remove asserted polling-interval/stale-threshold numeric constants
per Danny's ruling that timing values are an engineering decision, not a product decision — see the
revised US-4 ACs and Non-Functional Requirements below.
**Date**: 2026-08-24

## Summary

Complete the Problem Department MVP's remaining browser-to-decision path. A human must be able to,
entirely in the browser, inside the existing Department OS shell (`docs/specs/product-surface-checkpoint-1/`,
CLOSED PASS, SHA `152a124`): submit a source, watch a real `generateBriefVersion` run progress
honestly, review the persisted Problem Brief with its evidence/provenance, and record
Approve/Reject/Watch — then reload and see the same Brief and decision history. This sprint is the
replan and completion of `docs/specs/problem-department-mvp/`'s Slices 10, 11, and 12 (now marked
SUPERSEDED, never built), plus two verified live defects blocking that path. It does not modify
Checkpoint 1's shipped shell/nav/overview and does not renumber any prior spec's slices — this
sprint's own tasks are qualified `C2-S1`, `C2-S2`,... local to its own roadmap. Following Danny's
2026-08-22 ruling on the two Open Questions this document originally carried, this sprint's scope
now includes, in full: (1) Slice 12's original `StatusEvent`-backed validity/invalidation service
and read-side decision-history surface (US-12), and (2) a scoped, evidence-driven corrective
Brief-generation path from the browser (US-13) — see "Resolved Scope Corrections" below for the
exact ruling and its boundaries.

Verified against source at SHA `152a124` before writing this document:
- The React app currently has only `/` and `/departments/problem-department` (Checkpoint 1). No
 workspace route exists yet.
- The legacy Express route `GET /investigations/:id` (`src/web/server.ts:150`) 501s its
 `brief-generated` branch (`'Brief review surface is not implemented yet.'`) — confirmed live in
 `src/web/server.ts`.
- `generateBriefVersion` (`src/services/generateBriefVersion.ts`) already persists a real
 `GenerationRun`/`GenerationStep`/`BriefVersion` on success, including honest
 initial-vs-correction handling via `ALLOWED_PRIOR_STATUSES` and `transitionInvestigationStatus`.
 Confirmed real, already wired for direct in-process invocation — not something this sprint
 reimplements or modifies internally (pipeline phases, prompts, extraction/analysis/recommendation
 logic), only calls from a new endpoint. Its `supersedesVersionId` contract is verified
 directly (`generateBriefVersion.ts:108-160`): when supplied, it must reference a `BriefVersion`
 belonging to the Investigation's `ProblemBrief` AND be that `ProblemBrief`'s current
 `current_version_id` at preflight time, or an `InvalidSupersedeTargetError`/
 `StaleCorrectionConflictError` is thrown — this is the exact machinery US-13 below calls, not a
 new contract invented for US-13.
- `submitSources`/`resolveInvestigationSources` are real and already wired from the browser
 (`src/web/server.ts:66-93`).
- `getBriefForReview` and `recordDecision` are specified (`docs/specs/problem-department-mvp/
 04-ROADMAP.md` Slice 10/11; `SLICE-09-DESIGN.md` lines ~335, ~1499 forward-reference their exact
 contract shape) but not implemented — confirmed no such files exist yet under `src/services/`.
- `transitionInvestigationStatus.ts` (`src/services/transitionInvestigationStatus.ts:23-31`)
 **already allows `'blocked' -> 'open'`** (`open: ['blocked']` in `ALLOWED_PRIOR_STATUSES`), and
 `server.ts:93` already calls it on successful re-resolution. This narrows Interview defect (b) —
 see "Defect Reconciliation Note" below; the status-stuck half of the originally reported defect
 is not reproducible against current code, but the "nothing re-triggers generation" half is real
 and confirmed (no route anywhere calls `generateBriefVersion`). The same live map also confirms
 US-13's path: `ALLOWED_PRIOR_STATUSES['brief-generated'] = ['open', 'generation-failed',
 'brief-generated']` (`transitionInvestigationStatus.ts:30`) — a `'brief-generated'` Investigation
 can already transition back to `'brief-generated'`, i.e. the self-transition a correction run
 needs is already permitted; no change to this file is required for US-13.
- `ssrfGuardedFetch.ts:179` confirms the failing behavior verbatim: `callback(null, chosen.address,
 chosen.family)` returns a single address, and hostname-based `url`-type sources fail to resolve
 under Node 22 — this failing behavior is directly reproduced and confirmed. The specific root
 cause — that Node 22's `autoSelectFamily` invokes the custom `lookup` with `{ all: true }`,
 expecting an array — is supported by documented-contract inspection, not by an isolated
 reproduction of that exact call shape; the full root-cause/boundary (including whether
 literal-IP hosts are unaffected) is not independently confirmed and is assigned to C2-S1 as Forge
 implementation work (instrument `safeLookup`'s entry to observe the actual `options.all`/callback
 shape at each call site before finalizing the fix).
- No DB-enforced uniqueness constraint preventing two concurrent `GenerationRun`s for the same
 Investigation exists in live code today — verified against `provenanceRecorder.ts`'s
 `createGenerationRun` and migration `006`. `02-ARCHITECTURE.md` §1.1 confirms this gap and
 specifies a new migration (`009`, a partial unique index) as this sprint's own addition. US-3
 AC2 below is written accordingly, as something this checkpoint must build, not as an existing
 guarantee it merely relies on.
- `resolveInvestigationSources` (`src/services/resolveInvestigationSources.ts`), as it exists in
 live code today (verified at baseline SHA `6bd4765`), unconditionally selects and re-resolves
 EVERY `source_artifact` row for an Investigation on every call, overwriting each row's persisted
 `resolution_status`/`resolution_*` fields and stored content regardless of whether that row was
 already terminally resolved. No skip-already-resolved logic exists yet. Because this same
 function is called on every Add-Source request, adding one source to an existing
 `'brief-generated'` Investigation today would silently re-fetch and could overwrite the
 persisted resolution state of every OTHER source the current `BriefVersion` was already
 generated from. This is a required, not-yet-implemented fix for this checkpoint (US-2 AC5,
 US-13 AC covering resubmission, `02-ARCHITECTURE.md` §1.4 C1) — not an existing guarantee this
 checkpoint merely relies on.

### Defect Reconciliation Note (not a HALT — documented per Constraints, no silent overwrite)

The Interview (seed question 1) characterized defect (b) as "resubmitting after Blocked never
returns Investigation status to `'open'`... `ALLOWED_PRIOR_STATUSES.open` only allows `['blocked']`."
Reading the actual code: `ALLOWED_PRIOR_STATUSES.open = ['blocked']` is exactly what **permits**
the `blocked -> open` transition (it lists the allowed *prior* states for the `open` target), and
`server.ts:93` already invokes it on a successful resolution pass. This status-recovery half of the
retry loop is not reproducible as broken against current code. What remains genuinely broken,
confirmed by inspection: no route or service anywhere calls `generateBriefVersion` after a
resubmission (or ever, from the browser) — so even when status correctly returns to `'open'`,
nothing regenerates. This sprint's connector (C2-S3, covering the generation-runs endpoint) is the
fix; the requirement below is scoped to the confirmed-real half of the defect (US-2, AC covering
retry) rather than re-asserting the unreproduced status-stuck claim as fact.

## Scope

- One durable React workspace route:
 `/departments/problem-department/investigations/:investigationId`, mounted inside the existing
 Checkpoint-1 shell (persistent nav, not a standalone page).
- New Express routes (exact set, count not asserted here as load-bearing — see
 `02-ARCHITECTURE.md` §4.1 for the canonical enumeration): a generation-run connector endpoint
 (`POST /api/investigations/:id/generation-runs`), a workspace read endpoint
 (`GET /api/investigations/:id/workspace`), a stale-run abandonment endpoint, a versioned
 Brief-review read endpoint, a decision-recording endpoint, and a per-source-artifact recheck
 endpoint (`POST /api/source-artifacts/:id/recheck` — US-5 AC4/US-2 AC6, the one genuinely new
 path segment per `02-ARCHITECTURE.md` §1.4a) — plus the existing
 Checkpoint-1 `POST /api/investigations` route extended in place (not duplicated) to also accept
 adding sources to an existing Investigation (§1.4/§4.1).
- A real `getBriefForReview` read service, wired to a Brief-review panel in the workspace.
- Real, append-only `Decision`/`ReconsiderationCondition` persistence wired to `recordDecision`,
 with Approve/Reject/Watch controls and full chronological decision history in the workspace.
- Real, append-only `StatusEvent` persistence and the Slice-12 validity/invalidation service
 (`assignValidityState`, `getAssignedState`, `getAssignedStateAsRecorded`), plus dependent-decision
 reconstruction and a browser-visible decision-history surface showing non-`'valid'` state, prior
 decisions, and supersession history (US-12 — restored to scope per Danny's 2026-08-22 ruling).
- A scoped, evidence-driven corrective Brief-generation path: adding/resubmitting materially new,
 usable, not-already-consumed source evidence to a `'brief-generated'` Investigation makes
 generation eligible again specifically because of that new evidence, and triggers a new
 `generateBriefVersion` run with `supersedesVersionId` set to the current `BriefVersion` (US-13 —
 restored to scope per Danny's 2026-08-22 ruling, replacing the earlier "brief-generated is never
 eligible" exclusion; eligibility criteria tightened 2026-08-23, see US-13 AC2).
- Direct, reload-stable navigation to a specific prior `BriefVersion` via a human-readable version
 reference (US-1 AC5), so US-12's supersession banner and US-13's retrievability claims are
 demonstrable in the browser, not only true in the database.
- Fix for the confirmed Node 22 `ssrfGuardedFetch` URL-resolution defect, with regression coverage.
- Fix for the confirmed browser retry gap (resubmission after Blocked must re-trigger real
 generation), with regression coverage.
- Final cross-slice, end-to-end browser demonstration (success, Blocked/retry, Generation-Failed)
 before the checkpoint can close.

## Out of Scope

- NOT: modifying `docs/specs/product-surface-checkpoint-1/*` or any of that sprint's shipped
 routes/components — completed history.
- NOT: authentication, authorization, or any actor/identity concept on `Decision` or elsewhere —
 single-operator tool (Interview Q2).
- NOT: a durable job queue, worker process, or crash-recoverable generation orchestration — direct
 in-process execution for this MVP; explicitly and honestly not process-crash durable. (This does
 not exempt the run from honest stale/interrupted-state disclosure — see US-4's new AC below; a
 run that crashes must be disclosed as such, even though nothing automatically recovers it.)
- NOT: a Reopen mechanism for Rejected investigations (unchanged ruling from
 `problem-department-mvp` Q-5; reconsideration happens via new source material → new
 `generateBriefVersion` run → new `BriefVersion` → independent new `Decision`).
- NOT: a scheduler, `nextCheckAt` field, or automatic recheck for Watch conditions.
- NOT: a UI for a human to initiate `assignValidityState` (validity/invalidation write path) — no
 "mark invalid/challenged" button, control, or route anywhere in this sprint's surface. This is
 unchanged from Slice 12's original boundary. `assignValidityState` itself, and the read-side
 surfacing of its results, ARE in scope this checkpoint (US-12) — only the human-initiated
 *write* trigger for invalidation remains out of scope.
- NOT: a generic "Generate correction" button decoupled from evidence submission. US-13's
 corrective generation trigger is specifically and only reachable by adding/resubmitting new
 source evidence to a `'brief-generated'` Investigation — there is no separate, unconditional
 "regenerate" control that fires a correction run against unchanged evidence.
- NOT: coupling invalidation (`assignValidityState`, US-12) and corrective Brief generation
 (US-13) into one operation or one control. They are separate services, triggered separately, and
 neither implies or invokes the other.
- NOT: Investigation/Brief list, dashboard, search, or filter views beyond what Checkpoint 1
 already shipped (overview).
- NOT: Server-Sent Events, WebSocket, or any live-update transport other than interval polling.
- NOT: selection of a permanent visual design system beyond what Checkpoint 1 established.
- NOT: any change to `generateBriefVersion`'s internal pipeline logic, LLM prompts, or evidence/
 claim/demand/landscape/uncertainty/recommendation extraction behavior — this sprint calls that
 pipeline, it does not modify it (US-13 calls the same entrypoint with `supersedesVersionId` set;
 it does not add a new pipeline).
- NOT: Knowledge surface (`/knowledge`), Evidence index, or Runs index routes — reserved-only per
 `DESIGN-PROPOSAL.md` §15 item 7, unchanged by this sprint.
- NOT: a UI for browsing/listing full `BriefVersion` lineage history as an index (e.g. no dedicated
 "all versions" list/gallery view) — unchanged from Slice 12's original boundary. This is
 narrower than it originally read: direct navigation to view one SPECIFIC prior `BriefVersion`,
 reached via the current-vs-superseded pointer and referenced by a human-readable version label
 (not a raw UUID), IS in scope — see US-1 AC5. That single-target navigation is the narrow
 exception needed to make US-12's supersession banner and US-13's "prior Brief and decision
 history remain retrievable" claims independently demonstrable in the browser; it is not a
 general lineage browser, index, or list of all versions.
- Deferred: SSE/WebSocket transport reconsideration if polling proves insufficient in practice.
- Deferred: authenticated-actor support on `Decision` — architecture should not foreclose it, but
 no identity abstraction is added now.

## Resolved Scope Corrections

This document originally deferred two items as Open Questions pending Danny's answer. Danny
answered both directly, on the record, in conversation on 2026-08-22, and returned the
specification for material correction rather than approving it as-is: restore the full Slice 12
validity/invalidation contract (US-12) and a scoped, evidence-driven resubmission-correction path
(US-13) into this checkpoint's scope. Both rulings are now binding and are fully incorporated above
(this document's Summary section) and in the User Stories below — this section states them
explicitly so the correction is traceable to its source rather than silently absorbed into the
requirement text. (This is a separate ruling from `05-REVIEW.md`'s "Resolved Decisions" → "Add-Source route" ruling — that ruling concerns
the `POST /api/investigations` route design, not this scope-restoration ruling.)

1. **"Challenged/invalidated validity requirements" means exactly Slice 12's original scope** —
 not a distinct, additional artifact (none was found, and none exists). Slice 12's full
 contract — append-only `StatusEvent` records, `assignValidityState`, the two distinct
 `getAssignedState`/`getAssignedStateAsRecorded` queries, dependent-decision reconstruction, and
 browser-visible non-valid state / prior decisions / supersession history — is restored into
 this checkpoint's scope in full (US-12). The one boundary that does NOT move: no browser
 control that *initiates* invalidation is in scope (unchanged from Slice 12's own original
 boundary, restated in Out of Scope above).
2. **A scoped resubmission-driven correction path is restored to scope** (US-13), reversing the
 earlier "`'brief-generated'` is never generation-eligible" exclusion — but only as a trigger
 tied to submitting new evidence, never as a generic, unconditional "Generate correction"
 control. Invalidation (US-12) and corrective generation (US-13) remain separate operations by
 Danny's explicit instruction — see Out of Scope.

---

## User Stories

**US-1 — Durable investigation workspace**
As the operator,
I want a single durable URL for each Investigation
(`/departments/problem-department/investigations/:investigationId`) that shows its identity,
sources, generation history, current honest status, and (once generated) its Brief and decision
history,
so that I never depend on the legacy 501ing Express route and can always return to the same place
regardless of how the Investigation reached its current state.

Acceptance Criteria:
- [ ] Given a valid `investigationId`, navigating directly to the workspace URL renders the same
 content as navigating to it via the Problem Department overview — no state or data differs
 by entry path.
- [ ] The workspace never reuses or redirects to the legacy `/investigations/:id` Express route.
- [ ] The header shows investigation identity via human-readable fields (creation date, status,
 status reason, source count) — never a raw UUID as the primary label. A shortened ID may
 appear only as a secondary, clearly-labeled detail.
- [ ] Given an `investigationId` that does not exist, the workspace renders an explicit not-found
 state, not a blank screen, crash, or silent redirect.
- [ ] The workspace supports navigating to and viewing a SPECIFIC prior `BriefVersion` (not only
 the current one) for the same Investigation, reload-stably (a direct reload of that
 version's view re-renders the same prior version, not the current one) — referenced by a
 human-readable version identifier (e.g. a sequential version number/label such as "Version 2
 of 3"), never by a raw `BriefVersion` UUID as the navigable reference. This is narrowly
 scoped to reaching one specific prior version via the current-vs-superseded pointer (see the
 revised Out of Scope entry above) — it is what makes US-12's supersession banner and US-13's
 "prior Brief and decision history remain retrievable" claims independently demonstrable in
 the browser, not only true in the database.

**US-2 — Submit and reach the workspace**
As the operator,
I want to submit one or more sources from the Problem Department overview and land in the new
durable workspace for that Investigation,
so that the submission flow and the review flow are one continuous browser experience.

Acceptance Criteria:
- [ ] Submitting source(s) via "Start Investigation" calls the existing real
 `submitSources`/`resolveInvestigationSources` services (`resolveInvestigationSources` requires
 a skip-already-resolved fix this checkpoint, `02-ARCHITECTURE.md` §1.4 C1 — not yet present in
 live code as of this document's baseline verification; a no-op for THIS create-path call once
 built, since every row is freshly unresolved at first submission) and navigates the browser
 into the new workspace route for the resulting `investigationId`.
- [ ] Given a `url`-type source pointing at a genuinely reachable host, resolution succeeds against
 the fixed `ssrfGuardedFetch` (see US-7) — verified via a live/browser-visible demonstration,
 not only a unit test with a mocked DNS lookup.
- [ ] Given an Investigation reaches `'blocked'` (all sources unreachable), the workspace lets the
 operator add another source without leaving the workspace URL.
- [ ] Given a source is added from within the workspace and re-resolution finds at least one
 reachable source, `Investigation.status` returns to `'open'` and generation becomes eligible
 again from the same workspace — demonstrated live, not simulated (see Defect Reconciliation
 Note; this AC exercises the real `blocked -> open` transition end-to-end through the browser,
 including the "generation becomes eligible again" half the Interview flagged as broken).
- [ ] **Binding, no silent overwrite of already-resolved evidence (required this checkpoint,
 `02-ARCHITECTURE.md` §1.4 C1).** Adding a source to an Investigation that already has one or
 more `source_artifact` rows in a terminal resolution state (`'unreachable'`,
 `'content-retrieved'`, or `'reachable-no-content'`) — in particular any source already
 consumed by the current `BriefVersion`'s generation — MUST NOT re-resolve, re-fetch, or
 overwrite those already-resolved rows' persisted `resolution_status`, `resolution_*` fields,
 or stored content as a side effect of the add-source request. Only the newly submitted
 source(s) are resolved; every already-terminally-resolved row's persisted state is reused
 as-is, including for the `allUnreachable` aggregate the Blocked/Open decision depends on. This
 is a binding acceptance criterion for this checkpoint, not a description of existing behavior
 — live code today does not yet satisfy it (see verified-against-source note above).
- [ ] The no-silent-overwrite rule above must not remove the operator's ability to
 intentionally retry a source that previously failed to resolve. This checkpoint provides a
 distinct, explicit, single-source "Re-check this source" action (see US-5 AC4) scoped to
 exactly one `source_artifact`, wholly separate from the bulk add-source submission path —
 re-verification is never triggered as a side effect of adding an unrelated new source, and
 never happens automatically or silently. **This AC is scoped to the retry-a-previously-failed-
 source case only, which the "Re-check this source" control (rendered per-unreachable-source in
 `BlockedSourcesPanel`) makes reachable.** Re-checking a single source that has merely gone
 stale on an otherwise-healthy (`'open'`/`'brief-generated'`) Investigation — i.e. one that
 already resolved to a terminal, non-`'unreachable'` state — has no rendered affordance anywhere
 in this checkpoint's surface and is explicitly OUT OF SCOPE this checkpoint (narrowed from the
 prior draft's broader "may have gone stale" framing, which was unreachable in the browser for
 any Investigation not currently `'blocked'`). A future checkpoint may add a re-check affordance
 to another panel's source list if a real need for it is identified; nothing in this checkpoint
 builds toward that.
- [ ] **Binding, server-side enforcement of the re-check scope above (required this checkpoint,
 `02-ARCHITECTURE.md` §1.4a).** The single-source re-check route/service (US-5 AC4) MUST reject,
 server-side, any attempt to re-check a `source_artifact` whose persisted `resolution_status` is
 not `'unreachable'` — the client declining to render the "Re-check this source" control for a
 non-`'unreachable'` source is necessary but not sufficient protection on its own. The rejection
 MUST NOT call the resolution service or write anything; the row's persisted state and stored
 content are left byte-identical. This is what makes the AC above's scope actually binding rather
 than a UI-only convention.

**US-3 — Trigger real generation from the browser**
As the operator,
I want to issue one real generation request for a reachable Investigation from the workspace,
so that a Brief is actually produced by the real pipeline, not simulated or faked in the UI.

Acceptance Criteria:
- [ ] `POST /api/investigations/:id/generation-runs` verifies the Investigation exists and is in an
 eligible status before calling `generateBriefVersion`; an ineligible Investigation (e.g.
 `'blocked'`) is rejected with an explicit error, no `GenerationRun` fabricated. A
 `'brief-generated'` Investigation is eligible ONLY per US-13's evidence-driven rule below —
 never eligible on status alone.
- [ ] A second concurrent generation request for the same Investigation while one is already
 `'in-progress'` is rejected — in the ordinary two-tab case, with `422 investigation-not-eligible`
 from the pre-INSERT eligibility read (this is
 the case that actually fires for two browser tabs, since the eligibility read observes the
 first request's already-persisted `'in-progress'` run before the second request ever reaches
 the index); not queued, not silently dropped, not double-run. `409` is reserved for the
 narrow simultaneous-INSERT race specifically (both requests pass the eligibility read before
 either INSERT commits) — genuinely rare, not the ordinary case, per `02-ARCHITECTURE.md`
 §4.2's round-10 decision. No DB-enforced uniqueness constraint for this concern exists in live
 code today; this checkpoint must BUILD it — a new partial unique index (migration `009`, per
 `02-ARCHITECTURE.md` §1.1) enforcing at most one non-terminal `GenerationRun` per
 Investigation, so the narrow race is caught even when the eligibility read itself loses to a
 simultaneous INSERT, not merely a pre-request application-level check.
- [ ] The endpoint determines initial-vs-correction server-side from `ProblemBrief.currentVersionId`
 — never trusts a client-supplied flag for this determination.
- [ ] The endpoint passes an honest, real, configured runtime identifier to `generateBriefVersion`
 — never a hardcoded placeholder string presented as if it were meaningful provenance.
- [ ] The endpoint calls the existing `generateBriefVersion` directly, in-process — no queue,
 worker, or background-job abstraction is introduced — but it does NOT synchronously await the
 pipeline's full result. It returns `202` the instant the concurrency-guarding `GenerationRun`
 row is durably created, before the pipeline itself reaches any terminal outcome. There is no synchronous response
 body carrying the pipeline's final outcome.
- [ ] `generateBriefVersion`'s real typed outcomes (`BriefVersion` success,
 `BriefGenerationFailedError`, `InvalidSupersedeTargetError`, `StaleCorrectionConflictError`)
 are surfaced distinctly — never collapsed into one generic error — but exclusively through the
 browser observing persisted workspace state (the next `GET.../workspace` poll's
 `latestGenerationRun.outcome`/its `GenerationStep.error` text), never through the `POST`
 response itself, which never carries the final outcome.

**US-4 — Honest in-progress state**
As the operator,
I want to watch a generation run in progress using only facts the system has actually persisted,
so that I am never shown fabricated activity, percentages, or claims about what is "currently"
happening beyond what has been recorded — and, if the run actually crashed or was interrupted, that
this is disclosed honestly rather than shown as if it were still healthily in progress.

Acceptance Criteria:
- [ ] `GET /api/investigations/:id/workspace` returns only persisted facts: run start time,
 runtime identifier, persisted completed/failed `GenerationStep`s with their completion times
 and outcomes, models/tools actually recorded, validation attempts/errors actually recorded,
 the latest recorded step, and the fact that the run remains in progress.
- [ ] While the newest run is in-progress, the browser polls this endpoint at a fixed interval
 frequent enough that the operator perceives the workspace as actively updating during a
 healthy run — never indefinite silence with no visible progress signal for an extended
 period — while never polling so frequently that it creates unreasonable application or
 database load. The exact interval is an engineering decision, not a product decision: it is
 configurable (not a hardcoded, unchangeable literal), and its value is derived by
 architecture/Forge from measurement of real runs, per this document's Non-Functional
 Requirements below — this AC states only the required behavior, not a number.
- [ ] The UI never displays: which component is "currently executing" beyond the latest persisted
 step, a percent-complete figure, token-by-token activity, or any statement that an agent is
 "thinking."
- [ ] The UI never claims a step succeeded before its `GenerationStep` row exists — between
 persisted steps, the only honest statement shown is that the run remains in progress and the
 current component is not yet reported.
- [ ] A run that has gone STALE (no further `GenerationStep` progress recorded for an
 operator-observable period) or was INTERRUPTED (the process that started it is confirmed
 gone, or it otherwise ended without ever writing a terminal `GenerationRun` outcome —
 success or failure) MUST be detectable as a distinct state from a healthy in-progress run,
 and the workspace MUST disclose it honestly (an explicit stale/interrupted indication, not
 indefinite "in progress" text) once detected. This state must never be silently
 indistinguishable from a healthy run still actively progressing. The stale/interrupted
 threshold must be well clear of normal model/retrieval/validation processing latency —
 normal legitimate processing time for a healthy run must never trigger a false stale/
 interrupted warning. Detecting and disclosing this state is a read-side determination only:
 it must never itself mutate persisted workflow state (no automatic status change on
 `Investigation`/`GenerationRun`, and no automatic run termination triggered by the warning
 itself — only a human decision or a separately-defined recovery mechanism, if any, may do
 that). The exact detection mechanism and threshold value are architecture's/Forge's
 responsibility to derive from measurement, configurable rather than hardcoded, with a
 citable precedent or an explicit PROVISIONAL-tag-with-named-owner per this document's
 Non-Functional Requirements — this AC states only that the state must exist, be detectable,
 be disclosed, and never falsely trigger during legitimate processing time.
 **The "separately-defined recovery mechanism" this AC anticipated is now defined
 (2026-08-24, whole-package convergence, `02-ARCHITECTURE.md` §1.6): an explicit,
 human-triggered "Abandon and retry" action, available only once a run is already disclosed
 stale/interrupted by this AC's own mechanism, that finalizes the run `'failed'` and clears the
 concurrency guard for a real retry. This is the human decision this AC already contemplated,
 not a new automatic mutation — the read-side disclosure itself still never mutates anything.**
- [ ] Polling stops once the run reaches a terminal persisted outcome (success, failed) — verified
 by absence of further polling requests after that point in a browser-visible demonstration.
 Automatic polling also stops (or transitions to a non-misleading state) once a run is
 disclosed as stale/interrupted per the AC above, to avoid imposing indefinite automatic load
 against a run that may not progress further. This is NOT a claim that no further progress can
 ever be recorded, and observation does not end permanently: a real, honest continued-
 observation mechanism (e.g. an explicit "Refresh status" action) remains available so the
 operator can keep checking, and the disclosed state must honestly revert if real progress is
 in fact later recorded. Silence alone is never treated as proof the process stopped.

**US-5 — Blocked outcome and recovery**
As the operator,
I want a genuinely Blocked Investigation to show me exactly which sources failed and why, and let
me recover without leaving the workspace,
so that I can fix the input and continue without restarting the flow.

Acceptance Criteria:
- [ ] Given all sources are unreachable, no `GenerationRun` is fabricated or displayed as if one
 ran.
- [ ] The workspace shows each unreachable source and its recorded failure reason (not a generic
 "failed" label).
- [ ] The operator can add another source directly from the workspace; real resolution runs before
 generation becomes eligible again (see US-2 AC4). This AC (US-5 AC3) is a description of
 required end-to-end behavior, not a claim that any single implementation slice proves it in
 isolation — where the roadmap splits this behavior across slices, each slice's own
 Done-When must not assert independent completion of this AC; see `04-ROADMAP.md` for the
 binding slice-level dependency statement (Danny's G12 resolution).
- [ ] **Explicit single-source re-check action (US-5 AC4, satisfies US-2's "intentional
 re-verification remains explicitly possible" AC).** Each rendered `'unreachable'` source ONLY
 in the Blocked panel
 exposes its own "Re-check this source" control, scoped to exactly that one `source_artifact`.
 Triggering it re-resolves ONLY
 that source and updates ONLY its own persisted `resolution_status`/`resolution_*` fields —
 every other source's persisted state is untouched. This is the sole mechanism by which an
 already-terminally-resolved source may be intentionally re-verified; it is never invoked
 automatically, on a timer, or as a side effect of the bulk add-source submission (US-2's
 no-silent-overwrite AC). **A re-check attempt against a source whose persisted
 `resolution_status` is not `'unreachable'` is rejected server-side (not merely absent from the
 UI) — see US-2's binding server-side-enforcement AC (added above, this checkpoint) for the exact
 requirement.** See `02-ARCHITECTURE.md` §1.4a for the exact service/route contract.

**US-6 — Generation-Failed outcome and retry**
As the operator,
I want a genuinely failed generation run to show its real failure reason and let me retry with a
fresh run,
so that failure is transparent and recoverable without losing prior history.

Acceptance Criteria:
- [ ] Given `Investigation.status === 'generation-failed'`, the workspace shows
 `Investigation.statusReason` and the real failed `GenerationRun`/`GenerationStep`.
- [ ] All prior successful and failed steps/runs remain visible in the workspace's provenance rail
 — nothing is hidden or discarded on failure.
- [ ] Retrying creates a new `GenerationRun` via US-3's endpoint — it never rewrites or mutates the
 failed run's own rows.
- [ ] A `'generation-failed'` run that is itself later found to be stale/interrupted (per US-4's
 stale/interrupted disclosure requirement — e.g. a run that never reached a terminal
 `GenerationRun` outcome at all) is disclosed as such, distinctly from a run that recorded a
 genuine `BriefGenerationFailedError` outcome — the two are never presented identically.

**US-7 — Fix Node 22 URL resolution defect**
As the operator,
I want `url`-type sources to actually resolve on the runtime this product runs on,
so that the Landscape Researcher's web research is not silently starved of all retrieval.

Acceptance Criteria:
- [ ] `ssrfGuardedFetch.ts`'s `safeLookup` is fixed so it correctly satisfies Node 22's
 `autoSelectFamily`-driven `{ all: true }` custom-lookup contract (returning an array of
 addresses, not a single address passed as if it were one).
- [ ] A regression test exercises the actual production code path (not the `allowedTestHosts`
 branch that previously bypassed this bug in the suite) against a real reachable host.
- [ ] A browser-visible demonstration shows a real `url`-type source submitted through the browser
 resolving successfully (`content-retrieved`, not `unreachable`) and its content reaching the
 real generation pipeline.

**US-8 — Fix inert Blocked-retry generation gap**
As the operator,
I want resubmitting sources after a Blocked outcome to actually re-trigger generation once eligible,
so that the retry path the UI already invites me to use actually works end-to-end.

Acceptance Criteria:
- [ ] Given a Blocked Investigation, adding a reachable source and confirming resolution succeeds,
 the workspace makes it possible to issue a new generation request (via US-3's endpoint)
 without leaving the workspace or restarting the Investigation.
- [ ] A regression test demonstrates the full path: Blocked → add reachable source → resolution
 succeeds → status returns to `'open'` → generation request accepted → new `GenerationRun`
 progresses honestly (US-4) to a terminal outcome.
- [ ] A browser-visible demonstration (not just an automated test) shows this same path against
 real persisted data, per the Interview's testing-bar ruling.

**US-9 — Review the complete Brief**
As the operator,
I want to read all seven required Brief elements for the current `BriefVersion`, with evidence,
provenance, and honesty caveats, without anything collapsed by default,
so that I can make an informed decision.

Acceptance Criteria:
- [ ] A real `getBriefForReview(briefVersionId)` read service (**corrected, round-13 integrator
 trace, item 4 — verified against `problem-department-mvp/02-ARCHITECTURE.md:2234` and
 surrounding context: the function's own signature was ALREADY `getBriefForReview(briefVersionId:
 string)` in the MVP spec of record — it never took an Investigation id or resolved
 `currentVersionId` itself. `getInvestigation` → `ProblemBrief.currentVersionId` →
 `getBriefForReview(briefVersionId)` was always a CALLER-side resolution chain, not part of
 this function's own signature. What changes this sprint is which caller performs that
 resolution: previously `getInvestigation` was the (only) caller resolving
 `currentVersionId` before calling `getBriefForReview`; this sprint, the versioned workspace
 route performs that resolution itself — against either the current version or a routed
 `:versionNumber` — because `getInvestigation`'s own resolution path only ever reaches the
 CURRENT version and cannot serve US-1 AC5's prior-version viewing.** loads the
 fully-resolved Brief content for the given `briefVersionId` from the existing persisted
 tables — no new brief-shaped write path is introduced, and `getBriefForReview`'s own
 contract is unchanged (`02-ARCHITECTURE.md` §3.3).
- [ ] All seven required elements render, uncollapsed by default: (1) Problem Definition, (2)
 Claims and Evidence (contradicting evidence inline, stance read from
 `ClaimVersionEvidenceRef`, not from `EvidenceItem`), (3) Demand Evidence (signal types +
 qualitative confidence as Insufficient/Emerging/Substantiated — never a numeric score), (4)
 Existing-Solution Landscape, (5) Gap Hypothesis, (6) Uncertainty, (7) System Recommendation
 with rationale.
- [ ] Personal Pull, when present, renders visually and structurally separate from the Demand
 sections — never merged into or presented as Demand evidence.
- [ ] Uncertainty, negative findings, and contradicting evidence are never collapsed by default.
- [ ] `NegativeFindingNotice` renders a populated, non-error, non-loading absence statement for
 exactly the four negatable elements (Evidence, Demand Evidence's signal-type field,
 Existing-Solution Landscape, Gap Hypothesis) when a matching `NegativeFinding` row exists;
 Problem Definition never renders it under any circumstance.
- [ ] `SearchScopeNotice` renders the queries actually performed and any failed/blocked retrievals,
 regardless of whether any Existing Solution was found.
- [ ] A fixed, always-visible `CitationScopeNotice` states that citation presence is not
 independent proof of citation correctness.
- [ ] Runtime identifier, models/tools used, steps, validation attempts, and tool outcomes are
 shown; raw provenance JSON is not the primary interface — detailed raw validation output may
 sit behind an explicit technical-disclosure control (e.g. expand/collapse), separate from the
 required-uncollapsed sections above.
- [ ] Given the workspace is reloaded after generation completes, the same persisted Brief content
 renders identically — no re-fetch produces different content from the same `BriefVersion`.
- [ ] Given the workspace is navigated to a specific prior `BriefVersion` (US-1 AC5), this same
 service renders that prior version's own persisted Brief content — not the current version's
 content re-labeled — and the workspace makes clear which version is being viewed.

**US-10 — Record a decision**
As the operator,
I want to record Approve, Reject, or Watch against the exact Brief version I reviewed, and see the
full history of decisions for it,
so that my decision is durable, accountable, and never silently lost or migrated.

Acceptance Criteria:
- [ ] Approve, Reject, and Watch each persist via `recordDecision`, bound to the exact
 `briefVersionId` reviewed (`Decision.briefVersionId` never reassigned on a later correction).
- [ ] Approve does not trigger any Prototype Department call or build step.
- [ ] Reject retains the Investigation, Brief, evidence, and provenance unchanged and unremoved; no
 Reopen operation/button/route exists anywhere in this sprint's surface.
- [ ] Watch requires at least one named reconsideration condition; the server rejects a Watch
 request with zero conditions even if a client-side check is bypassed — no `Decision`
 persisted on rejection.
- [ ] Watch's named reconsideration condition(s) render in the workspace as their actual resolved
 text/content (the `ReconsiderationCondition`'s human-readable description field) — never as a
 raw `ReconsiderationCondition` ID, foreign key, or other opaque identifier standing in for the
 condition's content.
- [ ] No `nextCheckAt` or scheduler field exists on `Decision`/`ReconsiderationCondition`.
- [ ] `Decision` carries no actor/identity field — UI-facing copy uses product language ("Your
 decision"), never a hardcoded name.
- [ ] Multiple `Decision`s may exist against the same `briefVersionId`; the workspace shows all of
 them in chronological order (`decidedAt`), not just the latest.
- [ ] A later `BriefVersion` never inherits or replaces an earlier version's `Decision` — decisions
 remain bound to the specific version reviewed (see US-13 AC5 — this holds across corrective
 generation runs, not only across independently-submitted new Investigations).
- [ ] Given a successful decision submission, an in-place confirmation renders on the same
 workspace URL — no navigation away from the Investigation occurs.
- [ ] Given the workspace is reloaded after recording a decision, the same Brief and the same
 decision history render identically.
- [ ] The decision list shown when viewing a specific `BriefVersion` (the current version, or a
 prior version reached via US-1 AC5) is scoped to `Decision` rows whose `briefVersionId`
 equals that specific version — a `Decision` bound to a different `BriefVersion` under the
 same Investigation is never included in that per-version list. Separately and distinctly,
 the workspace also surfaces the Investigation's full decision LINEAGE — every `Decision`
 across every `BriefVersion` under the Investigation's `ProblemBrief`, in chronological order,
 each one labeled with which `BriefVersion` it belongs to (via the human-readable version
 reference from US-1 AC5). The per-version list and the whole-lineage view are
 requirements-distinct: neither is a substitute presentation of the other, and they are never
 merged into a single undifferentiated list without per-`Decision` version attribution.

**US-11 — Cross-slice end-to-end browser demonstration**
As Danny (reviewer),
I want one continuous, live, browser-driven demonstration covering the success path and the
Blocked/retry and Generation-Failed paths separately, against real persisted data,
so that "backend complete + green tests" is never mistaken for "the browser path works."

Acceptance Criteria:
- [ ] Mission Control → submit a real Investigation → real generation → honest persisted
 run/step progress → workspace shows success, Blocked, and Generation-Failed outcomes each in
 a separate, genuine (not simulated) run — the success path AND Blocked/retry AND
 Generation-Failed paths are each independently demonstrated, not inferred from the happy path
 alone.
- [ ] From a genuine Blocked state, the operator retries via a real new source and reaches a new
 persisted run progressing honestly to a terminal outcome.
- [ ] The completed Brief, its evidence/sources/claims/uncertainty/recommendation/provenance, and a
 recorded Approve/Reject/Watch decision are all reviewed live in the browser.
- [ ] Reloading the workspace after the demonstration confirms the same persisted Brief and
 decision history.
- [ ] This demonstration is a precondition of the checkpoint's close, distinct from and in addition
 to each slice's own per-slice tests/QC/Frank forge-gate.

**US-12 — Validity/invalidation service and browser-visible decision history**
As the operator,
I want the workspace to show whether the current `ClaimVersion`/`BriefVersion` has been challenged
or invalidated, which decisions were made while it was last assigned `'valid'`, and whether the
current version has been superseded,
so that I never mistake a stale-but-displayed decision for one still grounded in currently-assigned
validity — the exact Slice 12 contract from `problem-department-mvp/04-ROADMAP.md:1013-1088`,
restored to this checkpoint's scope in full per Danny's 2026-08-22 ruling.

Acceptance Criteria:
- [ ] Append-only `StatusEvent` records are persisted for `(targetType, targetId)` pairs where
 `targetType` is `'claim-version'` or `'brief-version'`; `Claim`, `ClaimVersion`, and
 `BriefVersion` carry no mutable `status` column — assigned validity state is answered
 exclusively by query, never by a stored field.
- [ ] `assignValidityState({ targetType, targetId, assignedState, effectiveAt, reason, recordedBy })`
 appends a new `StatusEvent` and returns `dependentDecisionIds`: computed by (1) appending the
 event, (2) reverse-querying `BriefVersion.claimVersionIds` for the affected `ClaimVersion.id`
 (or matching the `BriefVersion.id` directly when `targetType === 'brief-version'`), (3) for
 each matching `BriefVersion`, reading every `Decision` bound via `Decision.briefVersionId`,
 filtered to decisions made while the target's assigned state — reconstructed via
 `getAssignedStateAsRecorded` with `knownAsOf = Decision.decidedAt` for each candidate — was
 last `'valid'`. `assignValidityState` has no browser-reachable trigger this checkpoint (see
 Out of Scope) — it is called only from service code / test harness / Forge verification.
- [ ] `getAssignedState({ targetType, targetId, asOf? })` — current-knowledge query: the latest
 `StatusEvent` for `(targetType, targetId)` with `effectiveAt <= asOf`, evaluated against
 everything ever recorded (no `recordedAt` bound); defaults to `'valid'` when no `StatusEvent`
 exists. Given an `asOf` before any `StatusEvent`'s `effectiveAt`, returns `'valid'`.
- [ ] `getAssignedStateAsRecorded({ targetType, targetId, asOf?, knownAsOf })` — as-of-knowledge
 query: reconstructs what Department OS actually knew at knowledge-time `knownAsOf`, immune to
 later backdated corrections. Latest `StatusEvent` with `effectiveAt <= asOf` AND
 `recordedAt <= knownAsOf`; `'valid'` if none exists. `knownAsOf` is required — no default.
 `getAssignedState` and `getAssignedStateAsRecorded` are two distinct, non-conflatable
 functions (never named `getValidityAt`/`isValid`) — neither is a thin wrapper around the
 other for any caller that cares about the divergence.
- [ ] Given a late-discovered correction (a `StatusEvent` with `effectiveAt` in the past but
 `recordedAt` now), `getAssignedState` for an `asOf` between the two timestamps reflects the
 new event without mutating any prior event, while `getAssignedStateAsRecorded` called with
 `knownAsOf` before the correction's `recordedAt` still returns the pre-correction state —
 demonstrating the two queries diverge as designed.
- [ ] The workspace renders, without burying and without requiring scrolling/interaction to
 reveal: `priorDecisions` (plural, via `DecisionHistoryBanner`), the current `getAssignedState`
 result when non-`'valid'` (`'challenged'`/`'invalidated'`), and `isSuperseded` with a link to
 the version that directly superseded it (its immediate successor via `supersedesVersionId`) —
 the strength of this clause differs by content category, and is stated explicitly here
 rather than left to be inferred (resolved): the
 non-`'valid'`/`isSuperseded` facts are each a SINGLE compact fact (a status word or a
 one-target link) that CAN be made unconditionally visible with no scroll, so for those two the
 clause is read literally and enforced by relocating them to the always-visible
 `InvestigationIdentityHeader` (`02-ARCHITECTURE.md` §5.3). `priorDecisions` is
 structurally a LIST (zero to many chronological entries) — a list cannot be guaranteed to fit
 entirely above the fold the way one status word can, so for `priorDecisions` the clause is
 read as `03-UI-SPEC.md`'s region-5 `DecisionHistoryBanner` already applies it: never
 collapsed by default, never tucked behind a click/expand interaction to become visible at all
 — every entry that exists is directly on the page once the operator reaches region 5, none
 hidden behind pagination or an accordion. This is a real, intentional distinction between a
 single-fact notice and a list, not an unexplained exemption. **Component ownership (2026-08-24, whole-package
 convergence)**: the non-`'valid'` statement and the `isSuperseded` forward link are rendered
 by `InvestigationIdentityHeader`, not `DecisionHistoryBanner` — `02-ARCHITECTURE.md` §5.3's
 binding rationale is that a compact fact requiring "never buried or scrolling" is only
 physically satisfiable in the always-visible identity region, not inside the decision-history
 list; `DecisionHistoryBanner` renders the two chronological decision lists only. `isSuperseded`
 is a distinct structural fact (some other `BriefVersion` under the same `problemBriefId` names
 this one via `supersedesVersionId`), never conflated with assigned validity state.
- [ ] Given the current `BriefVersion` has a non-null `supersedesVersionId`, the workspace surfaces
 a link/reference to that specific prior version, navigable via US-1 AC5's human-readable,
 reload-stable version-reference mechanism — the supersession banner is not only informative
 text naming that a prior version exists, but an actual navigable reference to it.
- [ ] Given the DISPLAYED `BriefVersion` (current or a prior version reached via US-1 AC5's
 versioned route) itself has a non-null `supersedesVersionId`, the workspace ALSO surfaces a
 backward-facing navigable link to that specific prior version — not only the forward link from
 a superseded version to its successor. Both directions are rendered by
 `InvestigationIdentityHeader` (`02-ARCHITECTURE.md` §5.3), resolved from the displayed
 version's own `supersedesVersionId` against the already-fetched version list, never a raw
 UUID. This closes the gap where, after a correction, a user reviewing the new current version
 had no visible control back to the version it corrected — only a URL typed by hand.
- [ ] Given the workspace is reloaded, the same assigned-state, prior-decisions, and
 supersession-history facts render identically — no re-fetch produces a different answer for
 the same recorded state.

**US-13 — Resubmission-driven Brief correction**
As the operator,
I want to add or resubmit materially new source evidence to an Investigation whose status is
`'brief-generated'`, and have that action make a new, correctly-superseding generation run
eligible,
so that a Brief can be corrected from real new evidence without losing the prior version or the
decisions already recorded against it — a scoped path restored to this checkpoint's scope per
Danny's 2026-08-22 ruling, reversing the earlier "`'brief-generated'` is never eligible" exclusion.

Acceptance Criteria:
- [ ] The Investigation Workspace lets the operator add a new source to a `'brief-generated'`
 Investigation via the same source-submission mechanism used elsewhere in the workspace
 (`submitSources`, unchanged; `resolveInvestigationSources`, modified — `02-ARCHITECTURE.md`
 §1.4 C1 — to skip re-fetching sources already resolved from a prior call, so this add-source
 request does not silently rewrite the resolution state of evidence the current Brief was
 already built from) — without leaving the workspace URL.
- [ ] Generation becomes eligible again for a `'brief-generated'` Investigation ONLY when at least
 one added/resubmitted source is genuinely NEW and USABLE evidence that has not already been
 consumed by, or incorporated into, the current `BriefVersion` — never because the
 `'brief-generated'` status alone permits it, never merely because a source row was added
 *after* the current `BriefVersion`'s `createdAt` timestamp, and never via a bare
 "regenerate"/"Generate correction" control with no new-evidence precondition (see Out of
 Scope). A source does NOT count toward eligibility, and must not unlock a new generation
 request, when it is any of:
 - **Unreachable or unresolved** — resolution did not complete to usable retrieved content
 (e.g. still pending, or resolved to an `unreachable`/error outcome);
 - **Empty** — resolved but its content is empty or effectively empty (no usable evidentiary
 content);
 - **A duplicate of an already-consumed source, by canonical identity or by resolved-content
 fingerprint** — a source is disqualified as a duplicate if EITHER (a) its canonical source
 identity (the normalized, redirect-resolved target the source ultimately refers to — not
 the literal submitted string) matches the canonical identity of a source already consumed
 by the current `BriefVersion`, OR (b) its resolved content fingerprint (a deterministic
 fingerprint of the retrieved, resolved document content — not the raw submitted text)
 matches the resolved-content fingerprint of a source already consumed by the current
 `BriefVersion` — regardless of whether it is a distinct `Source`/`source_artifact` row,
 and regardless of whether its raw submitted string (URL text or pasted text) is
 byte-identical to the original submission. Two rows whose raw submitted strings differ
 (e.g. a redirecting shortlink vs. its resolved destination URL, or the same URL submitted
 with/without a tracking query parameter) but which share canonical identity or resolved
 content are the same duplicate for this rule; equality of the raw submitted string alone is
 NEITHER necessary NOR sufficient to establish or rule out a duplicate;
 - **Already reflected in the current `BriefVersion`** — a replay of evidence the current
 Brief already incorporated, rather than evidence genuinely new to it.
 A `'brief-generated'` Investigation with no newly added source satisfying all of the above
 remains ineligible for a new generation request. The exact server-side mechanism for
 evaluating these conditions — the canonical-identity scheme and the resolved-content
 fingerprinting scheme themselves — is architecture's responsibility to design; this AC states
 the eligibility requirement (dedup MUST be evaluated against canonical source identity and
 resolved-content fingerprint, and MUST NOT be evaluated by comparing raw submitted strings or
 raw URL text for equality), not the implementation.
- [ ] The resulting generation request (via US-3's endpoint) calls `generateBriefVersion` with
 `supersedesVersionId` set to `ProblemBrief.currentVersionId` at request time — the same
 contract `generateBriefVersion.ts:108-160` already validates (must belong to this
 Investigation's `ProblemBrief` and must equal the current version, or
 `InvalidSupersedeTargetError`/`StaleCorrectionConflictError` is thrown and reported
 distinctly per US-3's last AC).
- [ ] On success, a new `BriefVersion` is created and `ProblemBrief.currentVersionId` advances to
 it; the prior `BriefVersion` row is preserved unmodified and remains independently
 retrievable — by its own id, via the superseded-version link (US-12), and via direct
 navigation using its human-readable version reference (US-1 AC5) — after the new version
 exists.
- [ ] Every `Decision` bound to the prior `BriefVersion`'s `briefVersionId` remains retrievable,
 intact, and unreassigned after the new `BriefVersion` is created — decisions are never
 inherited or migrated onto the new version (binding rule carried from the original Interview
 stage and from US-10).
- [ ] `assignValidityState` (US-12) is never invoked as a side effect of this generation-eligibility
 change, and adding a new source never itself appends a `StatusEvent` — invalidation and
 corrective generation remain fully independent operations, confirmed by absence of any call
 from this path into the validity service.
- [ ] A browser-visible demonstration shows: a `'brief-generated'` Investigation → new,
 genuinely-usable, not-already-consumed source added from the workspace → generation becomes
 eligible → a real generation run with `supersedesVersionId` set progresses honestly (US-4) to
 a terminal outcome → the new `BriefVersion` is reviewable (US-9) → the prior `BriefVersion`,
 reached via its own navigable version reference (US-1 AC5), and its decision history remain
 reachable and unchanged.

---

## Slice 10/11/12 Requirement Trace

Source: `docs/specs/problem-department-mvp/04-ROADMAP.md` lines 867-1190 (Slices 10, 11, 12), cross-
checked against `docs/specs/product-surface/DESIGN-PROPOSAL.md` §14's partial reconciliation of
Slice 10, verified directly against the roadmap text rather than copied from §14 uncritically.

| # | Original Requirement (Slice/lines) | Disposition | Reason | Where It Lands Here |
|---|---|---|---|---|
| 1 | `getInvestigation` → `ProblemBrief.currentVersionId` → `getBriefForReview` chain (S10, "Files" bullet 1) | REVISED | What is REVISED is only which caller performs the `currentVersionId` resolution step of the chain: previously `getInvestigation` was the sole caller resolving to the current version before invoking `getBriefForReview`; this sprint, the versioned workspace route performs that resolution itself (current version, or a routed `:versionNumber`), because `getInvestigation`'s resolution path only ever reaches the current version and cannot serve US-1 AC5's prior-version viewing | US-9 |
| 2 | All seven Brief elements rendered without collapse-by-default (S10 Impl. Notes) | RETAINED | Unchanged requirement | US-9 |
| 3 | No system-generated numeric confidence anywhere on screen (S10 Impl. Notes) | RETAINED | Unchanged; demand levels stay qualitative | US-9 |
| 4 | Personal Pull visually/structurally separated from Demand (S10 Impl. Notes) | RETAINED | Unchanged | US-9 |
| 5 | `priorDecisions`/`isSuperseded` per-`ClaimVersion` and `BriefVersion` returned by `getBriefForReview` (S10 Impl. Notes) | RETAINED | `isSuperseded` and field presence unchanged; `priorDecisions`' own element SHAPE changes per `02-ARCHITECTURE.md` §3.3 (resolved reconsideration-condition content, not bare ids) — the function is retained and still called the same way, only one field's internal shape differs; rendering of non-`'valid'` state and supersession itself is US-12's concern (trace row 23) | US-9 (data), US-12 / trace row 23 (banner) |
| 6 | `CitationScopeNotice`, fixed and always visible (S10 Impl. Notes) | RETAINED | Unchanged | US-9 |
| 7 | Evidence stance read from `ClaimVersionEvidenceRef`, not `EvidenceItem` (S10 Impl. Notes) | RETAINED | Unchanged, confirmed correct per PR-review binding correction already applied to the roadmap text | US-9 |
| 8 | `SearchScopeNotice` — queries + failed/blocked retrievals, shown regardless of outcome (S10 Impl. Notes) | RETAINED | Unchanged | US-9 |
| 9 | `NegativeFindingNotice` for exactly 4 of 7 elements; Problem Definition never negatable (S10 Impl. Notes, Q-2) | RETAINED | Unchanged | US-9 |
| 10 | Investigation Screen — Completed State as a dedicated full-page screen gated on status (S10 Goal/Tests) | REVISED | This sprint uses one persistent workspace URL covering ALL states (in-progress/blocked/failed/completed), not a status-gated separate screen — matches this sprint's explicit binding input ("one React workspace route... present investigation identity... in all states"), consistent with `DESIGN-PROPOSAL.md` §14's "MOVED" characterization, verified against the roadmap's own status-gate text (line 915, using the roadmap's own inconsistent `'completed'` vs. the real `'brief-generated'` enum value) | US-1 |
| 11 | `DecisionForm` explicitly excluded from Slice 10 (S10 Impl. Notes) | RETAINED (boundary preserved) | Slice 10's own scope boundary; decision form remains a separate concern here too | US-10 |
| 12 | Persistence for `Decision`, `ReconsiderationCondition` (S11 "Files") | RETAINED | Not yet built; same data model | US-10 |
| 13 | `recordDecision` service function (S11 "Files") | RETAINED | Not yet built; same contract, forward-referenced already by `SLICE-09-DESIGN.md` | US-3, US-10 |
| 14 | `DecisionForm` + `DecisionConfirmationPanel`, in-place non-navigating on the same URL (S11 "Files"/Impl. Notes) | REVISED | Location context changes from "Investigation Screen" to "workspace route" (same one-URL principle as row 10), but the in-place/non-navigating behavior itself is unchanged | US-10 |
| 15 | `Decision.briefVersionId` fixed FK, never reassigned (S11 Impl. Notes) | RETAINED | Unchanged; also independently exercised by US-13's corrective-generation path | US-10, US-13 |
| 16 | Watch requires ≥1 reconsideration condition, server-enforced (S11 Impl. Notes) | RETAINED | Unchanged | US-10 |
| 17 | No `nextCheckAt`/scheduler field (S11 Impl. Notes) | RETAINED | Unchanged | US-10 |
| 18 | Approve does not trigger Prototype Department call/build (S11 Impl. Notes) | RETAINED | Unchanged | US-10 |
| 19 | Reject is reconsiderable, not reopenable — no Reopen mechanism (S11 Impl. Notes, Q-5) | RETAINED | Unchanged, reconfirmed by this sprint's own Out of Scope | US-10, Out of Scope |
| 20 | Multiple Decisions may exist per `briefVersionId`; `priorDecisions: Decision[]` plural (S11 Impl. Notes, G-11) | RETAINED | Unchanged | US-10 |
| 21 | Persistence for `StatusEvent` (bitemporal validity) (S12 "Files") | RETAINED | Restored to scope per Danny's 2026-08-22 ruling (see "Resolved Scope Corrections") — the original Slice 12 contract is not superseded, only previously deferred against an unresolved Open Question that is now resolved | US-12 |
| 22 | `assignValidityState`, `getAssignedState`, `getAssignedStateAsRecorded` service functions (S12 "Files") | RETAINED | Same ruling as row 21 — the two-query split (PR-review binding correction, `SLICE-09-DESIGN.md`) is preserved exactly, including `getAssignedStateAsRecorded`'s required `knownAsOf` with no default | US-12 |
| 23 | `DecisionHistoryBanner` surfacing `priorDecisions` and non-`'valid'` assigned state (S12 "Files"/Impl. Notes) | REVISED | The `priorDecisions`-surfacing half was always RETAINED via US-10, rendered by `DecisionHistoryBanner`; the non-`'valid'` assigned-state and `isSuperseded`/backward-link halves, previously deferred pending rows 21/22, are now built, but rendered by `InvestigationIdentityHeader` instead (2026-08-24 component-ownership correction, `02-ARCHITECTURE.md` §5.3) — REVISED both in location (this sprint's workspace surface, not a separate "Completed State" screen, same as row 10) and in which component owns the compact facts, not in scope or content | US-12 |
| 24 | No UI for a human to initiate `assignValidityState` (S12 Impl. Notes, "Out of Scope") | RETAINED | Unchanged — still out of scope; now the only remaining validity-related boundary, since the service and read-side (rows 21-23) are built | Out of Scope |
| 25 | `getInvestigation`'s `brief-generated` branch (currently 501s in the legacy Express route) must be replaced by the real completed-state surface (S10 dependency chain, confirmed live at `src/web/server.ts:150`) | REVISED | Confirmed live: the legacy route's 501 is real and unfixed. This sprint does not fix the legacy Express route — it builds the React workspace as the one true durable surface instead, per this sprint's explicit "do NOT reuse the legacy Express page" binding input | US-1 |

**Summary of disposition:** 20 of 25 traced items RETAINED (in substance, several with a location
REVISION from "separate screen" to "one workspace URL"; rows 1, 10, 14, 23, 25 are REVISED — 5
total), 0 MOVED, 0 REMOVED outright. No original requirement is silently dropped without a stated
disposition. (Two prior draft counts have now been superseded here: "20 RETAINED / 3 REVISED / 2
MOVED" undercounted REVISED rows and reflected rows 21-22 as MOVED before Danny's 2026-08-22 ruling
restored them to RETAINED; a later "21 of 25 RETAINED / 4 REVISED" also undercounted REVISED by one
row. This line is corrected against an independent, round-15 per-row recount of the table's own
Disposition column above, not carried forward from either prior count.)

---

## Non-Functional Requirements

- **No authentication/authorization.** Single-operator tool. No actor/identity field is added to
 `Decision` or any other entity. UI copy uses product language ("Your decision"), never a
 hardcoded name (Interview Q2).
- **Testing/verification bar** (Interview Q3, binding): each `C2-S` slice meets the existing
 per-slice standard — tests/QC rounds, Frank forge-gate PASS, and a specified browser-visible
 demonstration against real persisted data (not fixtures alone). In addition, before the
 checkpoint itself can close: one final cross-slice end-to-end browser demonstration (US-11)
 covering the success path AND the Blocked/retry path AND the Generation-Failed path separately —
 passing tests or isolated per-screen demonstrations alone do not satisfy this gate. After Frank
 returns green on implementation + demonstration evidence, the checkpoint stops for Danny and Sol
 review before merge, per this repo's independent-review discipline.
- **Direct in-process generation execution**, not process-crash durable. This must be stated
 honestly in both the architecture doc and any user-facing status copy that could otherwise imply
 durability guarantees that do not exist. A durable queue is explicitly deferred until
 interrupted-run recovery is a demonstrated need, not built preemptively. This honest-disclosure
 requirement is distinct from, and does not satisfy, US-4's requirement that a stale/interrupted
 run still be detected and disclosed as such rather than shown as indefinitely "in progress" —
 "not crash-durable" governs recovery; "must disclose staleness/interruption" governs the UI's
 honesty about the run's actual state.
- **Polling interval and stale/interrupted threshold are engineering decisions, derived from
 measurement, not asserted here.** Danny's binding ruling: this specification defines the required
 BEHAVIOR (US-4's ACs above) — it must never assert or imply a specific numeric value for either
 the poll interval or the stale/interrupted threshold. Both are configurable values (not hardcoded
 literals) whose actual defaults are derived by architecture/Forge, per the architecture
 document's methodology (being updated separately), against real measurement of the implemented
 system, not a guess made at spec time. As part of implementing US-4, Forge must measure real
 runs and report: observed request rate against the workspace endpoint, observed gaps between
 persisted-progress updates, the longest legitimate silence observed during a healthy run (i.e.
 time between one `GenerationStep` persisting and the next, or between run-start and the first
 step), and the observed behavior of the stale/interrupted warning against that measurement — this
 evidence, not a value asserted in this document, is what the actual defaults get derived from.
 Whatever values are ultimately chosen still need their own citable derivation (this measurement)
 or an explicit PROVISIONAL-tag-with-named-owner, per the general "No fabricated numbers" rule
 below — the same rule that applies to every other predetermined constant in this document.
- **No fabricated numbers.** Every predetermined numeric constant introduced during architecture or
 implementation (timeouts, retry counts, the poll interval, the stale/interrupted detection
 threshold, etc.) needs its own citable precedent — for timing values, this means the real-run
 measurement described above — an explicit PROVISIONAL-tag-with-named-owner, or deletion. No
 numeric value is asserted as a requirement in this document itself; this document constrains only
 the behavior those values must satisfy (see US-4).
- **Regression coverage for both confirmed defects** (US-7, US-8) is mandatory, not optional
 cleanup — assigned to the earliest relevant slice in the eventual roadmap, not deferred to a
 separate repair slice outside this checkpoint's own roadmap.
- **No mutable status field for validity.** `Claim`, `ClaimVersion`, and `BriefVersion` must never
 gain a `status`/`validity` column; assigned validity state is always answered by querying
 append-only `StatusEvent` records (US-12), never by reading a stored field.
- **Invalidation and correction stay decoupled.** `assignValidityState` (US-12) and
 `generateBriefVersion` with `supersedesVersionId` set (US-13) are separate service calls with no
 shared trigger, control, or endpoint — an architecture or implementation that couples them (e.g.
 one button firing both, or one endpoint accepting parameters for both) violates Danny's
 2026-08-22 ruling and must be raised, not built.
- **Honest run-liveness disclosure is binding, not optional polish.** A generation run must never
 be silently reported as still in-progress if it actually crashed or was interrupted — this was
 already a binding NFR carried from the original "Honest progress" direction; US-4's new AC makes
 it a first-class, testable requirement rather than an implication left to infer. This disclosure
 is read-side only and must never itself mutate persisted workflow state (see US-4's stale/
 interrupted AC).
- **US-13 duplicate/eligibility evaluation is identity- and content-based, never raw-string-based.**
 The "duplicate of an already-consumed source" check (US-13 AC2) MUST compare canonical source
 identity and resolved-content fingerprint — never raw submitted string or URL text equality
 (e.g. `trim(raw)` comparison, or source-row-id comparison alone). Two source rows that resolve
 to the same canonical identity or the same resolved content are the same duplicate for
 eligibility purposes regardless of differing raw submitted text (equivalent URLs, redirects,
 tracking-parameter variants, or the same document fetched via two different routes). This
 governs architecture's canonical-identity/content-fingerprint design and the roadmap's required
 regression test (two distinct source rows sharing the same canonical URL and the same resolved
 content, both correctly disqualified as duplicates).

---

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Direct workspace URL for a nonexistent `investigationId` | Explicit not-found state, not blank/crash/silent redirect |
| Direct workspace URL for an Investigation with no `GenerationRun` yet (freshly submitted, still `'open'`) | Workspace shows identity/sources/eligibility state; generation request available; no fabricated run |
| Two browser tabs both trigger generation for the same Investigation concurrently | Second request rejected `422 investigation-not-eligible` by the pre-INSERT eligibility read (the ordinary case — `02-ARCHITECTURE.md` §4.2, US-3 AC2); `409` and the new partial unique index (migration `009`) are reserved for the narrow simultaneous-INSERT race only; no duplicate `GenerationRun`, no silent overwrite either way |
| `url`-type source that is a real but permanently-unreachable host | Resolution genuinely fails (distinct from the Node 22 bug); recorded as unreachable with real reason, contributing to Blocked if all sources fail |
| Reload mid-generation (run still in-progress) | Workspace re-renders honest in-progress state from persisted facts only; polling resumes |
| Reload after a terminal outcome | Same persisted terminal state renders identically; no re-poll |
| A run's owning process is confirmed gone (or no step progress for an operator-observable period) with no terminal `GenerationRun` outcome ever written | Workspace detects and discloses the run as stale/interrupted (US-4), never as indefinite "in progress"; automatic polling does not continue indefinitely against it, but a real continued-observation mechanism (e.g. "Refresh status") remains available and honestly reflects continued progress if any is later recorded; the disclosure itself never mutates persisted workflow state |
| A healthy run's legitimate processing time for one step (real model/retrieval/validation latency) is unusually long but the process is still alive and progressing normally | No false stale/interrupted warning — the threshold must stay well clear of normal legitimate processing time, not merely the common case |
| Watch submitted with a condition field present but whitespace-only | Server rejects as if zero conditions were given — a whitespace-only string is not a named condition |
| Correction (retry after Generation-Failed) racing against a concurrent successful initial generation | `generateBriefVersion`'s existing `StaleCorrectionConflictError`/`InvalidSupersedeTargetError` typed outcomes are surfaced distinctly by the connector (US-3), not collapsed into a generic failure |
| A `BriefVersion` is later superseded after a Decision was recorded against it | The original `Decision` remains bound to the original (now-superseded) `BriefVersion`; workspace does not migrate or re-attribute it to the new version; the prior version remains reachable via its own navigable version reference (US-1 AC5) |
| Brief with zero `ExistingSolution` results found | `SearchScopeNotice` still renders queries/limitations; absence is a `NegativeFindingNotice`, not an empty/error state |
| Very long evidence excerpt or claim text | Renders in full within the uncollapsed section — no silent truncation of required content (truncation for layout purposes, if any, must be an explicit, disclosed "show more," never data loss) |
| `assignValidityState` invalidates a `ClaimVersion` referenced by a `BriefVersion` with no `Decision`s yet recorded | `dependentDecisionIds` is an empty array — a real, correct answer, not an error |
| A `StatusEvent` is backdated (`effectiveAt` in the past, `recordedAt` now) after a `Decision` was already recorded against the affected `BriefVersion` | `getAssignedStateAsRecorded` with `knownAsOf` before the backdated event's `recordedAt` still returns the pre-correction state for that Decision's own dependent-decision computation; `getAssignedState` reflects the new event for any `asOf` on/after the backdated `effectiveAt` — the two queries diverge as designed, not a bug |
| A `'brief-generated'` Investigation is regenerated without any new source having been added (e.g. a stale/replayed request) | Rejected — generation-eligibility for a `'brief-generated'` Investigation requires new, usable, not-already-consumed evidence to have actually been added (US-13 AC2); no request bypasses this by status alone |
| A `'brief-generated'` Investigation has a new `Source` row added, but that source is unreachable, empty, a duplicate of an already-consumed source, or already reflected in the current Brief | Rejected — none of these count as the "new, usable evidence" US-13 AC2 requires; generation does not become eligible from a disqualified source alone |
| Two distinct `Source`/`source_artifact` rows under the same Investigation share the same canonical source identity (e.g. a shortlink and its resolved destination URL, or the same URL with/without a tracking query parameter) or the same resolved-content fingerprint, but differ in their raw submitted string | Both rows are correctly recognized as the same duplicate for US-13 AC2 eligibility purposes — the second row never unlocks corrective generation on the strength of its raw submitted string differing from the first; raw-string/URL-text equality is never used, alone, to decide this either way |
| A corrective generation run (US-13) fails (`BriefGenerationFailedError`) | The prior `BriefVersion` remains `ProblemBrief.currentVersionId` and fully reviewable; the Investigation's resulting status is read back from the actual row per `generateBriefVersion`'s documented failure-status behavior, never assumed |
| Operator navigates to a specific prior `BriefVersion` (US-1 AC5) and reloads that URL | The same prior version's content, and its own scoped decision list (US-10), render identically — reload never silently falls back to showing the current version instead |

---

## Anti-Patterns / Prohibitions

- **No UUIDs or raw DB field names as primary user-facing content**, anywhere in this sprint's
 surface — investigation identity, Brief identity, GenerationRun identity, and any other entity
 reference must use human-readable labels/dates/statuses/version numbers/named components; a
 shortened ID may appear only as a clearly-labeled secondary detail, never as the primary label a
 human reads to identify something. This applies explicitly to the prior-`BriefVersion`
 navigation added in US-1 AC5: the navigable reference is a human-readable version label, never a
 raw `BriefVersion` UUID.
- **No simulated workflow activity, evidence, provenance, or generation.** Every fact shown in the
 in-progress, Blocked, Generation-Failed, or Completed states must trace to a real persisted row.
 No percent-complete bar, no "currently executing: X" claim beyond the latest persisted step, no
 placeholder/skeleton content presented as if it were real data.
- **No fabricated `GenerationRun` or `GenerationStep`.** A Blocked Investigation must never show a
 run that did not happen.
- **No silently indistinguishable stale/interrupted run.** A run that has gone stale or was
 interrupted must never be shown identically to a healthy in-progress run (US-4).
- **No numeric confidence/demand score anywhere** — demand level is always
 Insufficient/Emerging/Substantiated, never a number.
- **No actor/identity field on `Decision`.** No hardcoded "Danny" or any synthetic user field.
- **No Reopen mechanism, button, route, or endpoint** for a Rejected Investigation, anywhere in
 this sprint's surface.
- **No scheduler or `nextCheckAt` field** for Watch reconsideration.
- **No queue, worker, or background-job abstraction** for generation execution this sprint — direct
 in-process only, honestly disclosed as not crash-durable.
- **No silent collapse of `generateBriefVersion`'s typed error outcomes** into one generic failure
 message at the connector boundary.
- **No re-implementation or modification of `generateBriefVersion`'s internal pipeline** — this
 sprint calls it, it does not alter extraction/analysis/recommendation logic. Permitted edit
 categories — (1) the additive, optional `onRunCreated?: (generationRun: GenerationRun) => void`
 parameter (§1.3), invoked once, synchronously, immediately after Phase 1's `createGenerationRun`
 succeeds, with zero effect on any caller that omits it; (2) one new `recordGenerationStep` call
 added to the `InvalidSupersedeTargetError` preflight catch (§1.3's 2026-08-24 correction), matching
 the ordering contract every other failure path in that file already follows; (3) one new `catch
 (GenerationRunAlreadyFinalizedError)` block added at each of the file's EIGHT existing finalization
 sites (§1.6, corrected to the real, grep-verified count of eight, C1 —
 the prior "three" figure was never checked against live code), where seven of those eight sites
 treat a lost finalization race as a graceful, logged no-op; (4) the eighth site
 (`generateBriefVersion.ts:677`, the success-path finalization inside the still-open Phase-4
 transaction) instead re-throws a new `GenerationRunLostFinalizationRaceError` after issuing
 `ROLLBACK`, so a success that loses this specific race cannot commit a Brief the system's own audit
 trail simultaneously records as a failed run (§1.6's full per-site disposition, C2) — a distinct
 exception from (3) because it changes the rethrow behavior at one specific site rather than adding
 a uniform catch block; (5) **fencing/heartbeat threading (§1.6)** — a
 required `fenceToken: number` field added to every one of the file's eleven real
 `recordGenerationStep`-bearing progress-write call sites: its three direct `recordGenerationStep`
 calls (`:272`, `:573`, `:649`), the fourth added by category (2) above, its seven
 `runStepWithProvenance` calls
 (`:333,372,384,393,411,431,452` — `runStepWithProvenance` itself, in
 `src/services/provenanceRecorder.ts`, also gains this field and threads it to its own two internal
 `recordGenerationStep` calls), and its eight `finalizeGenerationRun` calls (the same eight sites
 named in category (3)) — a mechanical signature addition to every real call site, not a change to
 any call site's own decision logic; and (6) **the resubmission-eligibility consumed-source ledger
 write (§4.8, US-13 AC2)** — one new, additive field on `extractClaimsAndEvidence`'s return type,
 `usableSourceIds: string[]` (the same array that function's own top-level wrapper already computes
 internally to determine which `'content-retrieved'` sources this run's Extraction step actually
 considered, now surfaced rather than discarded), captured by `generateBriefVersion.ts` immediately
 after Extraction (`:333`) resolves as `consideredSourceArtifactIds` — deliberately NOT derived from
 `universeSourceArtifactIds`/`EvidenceItem` rows, which omit a `'content-retrieved'` source that
 produced zero extracted evidence, and deliberately NOT a second, independent `getInvestigation`
 read bounded by a timestamp comparison, which would leave a narrower timing gap open (§4.8) —
 followed by one standalone `INSERT INTO generation_run_consumed_source` per id in that set at
 `:479`, independent of any `GenerationStep` write. All six exception CATEGORIES are
 error-finalization/observability/audit-ledger plumbing, not pipeline logic — no phase's own order,
 inputs, or output changes in any case.
- **No fabricated numeric constants** — every predetermined number needs a citable precedent, an
 explicit PROVISIONAL-tag-with-named-owner, or deletion. This applies to the poll interval and the
 stale/interrupted threshold exactly as it applies to every other constant: neither is asserted as
 a number in this document, and neither may be hardcoded as an unchangeable literal in
 implementation.
- **No silent dropping of Slice 10/11/12 requirements** — every item in the Trace table above has a
 stated disposition; anything discovered missing during architecture/roadmap work must be added to
 that table with its own disposition, not quietly absorbed or dropped.
- **No mutable `status`/`validity` column on `Claim`, `ClaimVersion`, or `BriefVersion`** — assigned
 validity state is always a query result (US-12), never a stored field.
- **No browser control that initiates `assignValidityState`** — the service and its read-side
 surfacing are in scope; the human-facing write trigger is not.
- **No generic "Generate correction" control decoupled from new-evidence submission** — US-13's
 eligibility is earned specifically by adding new source evidence, never granted by status alone
 or by an unconditional regenerate button.
- **No eligibility unlocked by a disqualified source alone** — an unreachable/unresolved, empty,
 duplicate-of-already-consumed, or already-reflected-in-the-current-Brief source must never make
 a `'brief-generated'` Investigation eligible for a new generation request (US-13 AC2).
- **No raw-string/URL-text equality as the dedup test.** The "duplicate of an already-consumed
 source" determination (US-13 AC2) must never be implemented as, or reduced to, a comparison of
 raw submitted strings, trimmed raw text, or source-row IDs — canonical source identity and
 resolved-content fingerprint are the only bases for this determination.
- **No coupling of invalidation and corrective generation** — `assignValidityState` and a
 `supersedesVersionId`-driven `generateBriefVersion` call remain two independent operations with
 independent triggers.
- **No opaque reconsideration-condition IDs in the UI** — Watch conditions render as their actual
 resolved text, never a raw `ReconsiderationCondition` ID (US-10).
- **No conflating a per-`BriefVersion` decision list with the whole-Investigation decision
 lineage** — the two are requirements-distinct surfaces (US-10) and are never merged into one
 undifferentiated list without per-`Decision` version attribution.

---

## Constraints

- Must: integrate into the real Checkpoint-1 shell (persistent nav, existing routes) — verified
 directly against Checkpoint-1's shipped code, not assumed from its spec docs alone.
- Must: fix both confirmed live defects (Node 22 URL resolution; the generation-trigger gap in the
 retry loop) within this sprint's own roadmap, with regression coverage and browser-visible
 demonstrations, per the Interview's binding ruling.
- Must: build Slice 12's full original contract (`StatusEvent`, `assignValidityState`,
 `getAssignedState`, `getAssignedStateAsRecorded`, dependent-decision reconstruction, browser-
 visible non-valid/prior-decisions/supersession-history surfacing) within this checkpoint — no
 further deferral, per Danny's 2026-08-22 ruling.
- Must: implement US-13's corrective-generation trigger as evidence-driven only, gated on
 genuinely new, usable, not-already-consumed source evidence (US-13 AC2) — never as a
 status-driven, timestamp-only, or unconditional control, per Danny's 2026-08-22 ruling as
 tightened by the 2026-08-23 external-review correction.
- Must: evaluate US-13's "duplicate of an already-consumed source" test (US-13 AC2) against
 canonical source identity and resolved-content fingerprint — never against raw submitted
 string/URL text equality alone, per the 2026-09-05 external-review correction (see
 Non-Functional Requirements and Anti-Patterns above).
- Must: detect and honestly disclose a stale or interrupted generation run (US-4) as a state
 distinct from a healthy in-progress run — never silently indistinguishable from one — and this
 disclosure must never itself mutate persisted workflow state.
- Must: implement the poll interval and the stale/interrupted threshold as configurable values,
 derived by architecture/Forge from measurement of real runs (see Non-Functional Requirements) —
 never as unchangeable hardcoded literals, and never asserted as a specific number in this
 document.
- Must: support reload-stable browser navigation to a specific prior `BriefVersion` via a
 human-readable version reference (US-1 AC5), so US-12's and US-13's retrievability claims are
 demonstrable in the browser, not only true in the database.
- Must not: modify `docs/specs/product-surface-checkpoint-1/*`.
- Must not: reuse the legacy `/investigations/:id` Express route as the finished workspace.
- Must not: add an actor/identity abstraction to `Decision`.
- Must not: couple `assignValidityState` and corrective `generateBriefVersion` calls into one
 operation, control, or endpoint.
- Must not: build a general `BriefVersion` lineage index/browser (list of all versions) — only
 direct navigation to one specific prior version via the current-vs-superseded pointer is in
 scope (see revised Out of Scope entry).
- Must not: evaluate US-13's duplicate-source test by comparing raw submitted strings, trimmed raw
 text, or source-row IDs alone — see the canonical-identity/resolved-content-fingerprint
 requirement above.
- Assumes: `generateBriefVersion`, `submitSources`, and `transitionInvestigationStatus` remain
 correct and unmodified in their internal contracts except where this document's US-7/US-8 fixes
 require touching `ssrfGuardedFetch.ts` specifically (US-7), and except for `generateBriefVersion`'s
 own six named, additive exceptions above (the `onRunCreated` hook, the
 `InvalidSupersedeTargetError` catch's added `recordGenerationStep` call, the
 `GenerationRunAlreadyFinalizedError` catch added at its eight finalization sites (`generateBriefVersion.ts:298,313,324,585,663,677,695,713`), the `GenerationRunLostFinalizationRaceError`
 class's addition to the `:681-684` inner catch's and `:700-707` outer catch's rethrow-without-
 refinalizing lists (§1.6's mechanism (a), C3/C5
 integrator trace, item 3: these rethrow-list edits are not finalization sites and were not covered
 by the eight-site figure above; named here as their own, fourth exception), the `fenceToken`
 threading across all eleven real `recordGenerationStep`-bearing progress-write call sites
 including inside `runStepWithProvenance` itself (§1.6, exception category (5) above,
 `src/services/provenanceRecorder.ts` also edited for this), and the `usableSourceIds`-derived
 `consideredSourceArtifactIds`/`generation_run_consumed_source` ledger `INSERT` at `:479` (§4.8,
 exception category (6) above) — these are real, already-justified edits this document's own Out
 of Scope section now names, not a contradiction of this Assumes clause). `resolveInvestigationSources` is another real,
 already-justified exception to this Assumes clause (`02-ARCHITECTURE.md` §1.4) — modified to skip already-resolved `source_artifact` rows rather than
 re-fetch every source on every call, a no-op for every call site except the Add-Source Connector's
 second-and-later calls against an Investigation with prior resolved sources — if downstream
 architecture work finds any OTHER assumption in this list false, that is a blocking finding to
 raise, not something to silently work around.
- Assumes: `transitionInvestigationStatus.ts`'s existing `ALLOWED_PRIOR_STATUSES['brief-generated']
 = ['open', 'generation-failed', 'brief-generated']` self-transition entry is sufficient for
 US-13's correction path and needs no change — verified directly against live source; if
 downstream architecture work finds this insufficient, that is a blocking finding to raise, not
 something to silently work around.
</content>
