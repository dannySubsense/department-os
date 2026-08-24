# UI Spec: Product Surface — Checkpoint 2

**Status**: Draft (pending Frank spec-gate + human approval) — revised 2026-08-23 to resolve
external-review (Codex + Sol) UI-side findings 2, 3, 4, 6, 8, 11 against `02-ARCHITECTURE.md`'s
2026-08-23 revision (§4.9 `livenessState`, §3.1a/§5.1 version-numbered Brief route, §1.4/§3.1b/§5.3
real `AddSourceInline` calling the extended `POST /api/investigations` route, §3.2/§4.5 `decisionLineage` split
from per-version `priorDecisions`, §3.2 `validationRecords`/`toolInvocations`/`webSearchQueries`).
Prior revision's material scope correction (US-12, US-13 restored) is unchanged except where a
finding required it — see inline "Finding N" call-outs below for exactly what changed.

**Revised again 2026-08-24 (H-1 sync, `05-REVIEW.md`'s Spec-Gate Disposition section (H-1), Danny's binding ruling).** The prior draft
of this document described `AddSourceInline` as calling a new, dedicated
`POST /api/investigations/:id/sources` route. That route does not exist and was never built —
Danny's ruling is to reuse and extend the existing, already-shipped `POST /api/investigations`
route instead (branching on a body-supplied `investigationId`, `02-ARCHITECTURE.md` §1.4/§3.1b),
not to add a new path segment. Every reference to the old route below is corrected to the real,
extended contract; nothing else in this document changes.

**Revised again 2026-08-24 (POLL_INTERVAL_MS/STALE_THRESHOLD_MS reframing, Danny's binding ruling,
`02-ARCHITECTURE.md` §4.9/§5.2).** The prior draft of this document asserted specific numeric
values (e.g. "~2 seconds," "~2000ms") for `POLL_INTERVAL_MS` and framed both constants as
PROVISIONAL values pending Danny's sign-off. Danny's ruling: these are engineering decisions, not
his to ratify. Both constants are engineering-owned, derived at Forge implementation time via the
explicit methodology in `02-ARCHITECTURE.md` §4.9 (measure real pipeline timing, derive
`STALE_THRESHOLD_MS` from that measurement plus a safety margin, derive `POLL_INTERVAL_MS` from the
same measurement plus expected concurrency and endpoint cost), and recorded as code comments next
to the constants once derived — not asserted as a specific number here. Every reference to these
constants below is corrected to the behavioral framing; nothing else in this document changes.

**Traces to**: `01-REQUIREMENTS.md` (US-1 through US-13; acceptance criteria as enumerated there —
this document does not restate a count),
`02-ARCHITECTURE.md` (Components §2, `InvestigationWorkspaceView` §3.2 including
`newEvidenceSinceCurrentBriefVersion`/`decisionLineage`/`livenessState`, `GetBriefForReviewResult`
§3.3 including `priorDecisions`, `Decision`/`ReconsiderationCondition` §3.4, the version-numbered
Brief route §3.1a, the real, extended Add-Source Connector §1.4/§3.1b (the existing
`POST /api/investigations` route, not a new one), `StatusEvent`/`AssignedValidityState`
§3.6, API contracts §4 including the revised Generation Eligibility Rule (§4.2), the
Validity/Invalidation Service (§4.7, read-side only), the Resubmission Eligibility Check
`hasEligibleNewEvidenceSinceCurrentBriefVersion` (§4.8), Stale/Interrupted Run Detection (§4.9),
React route/component boundaries §5 including the two-route SPA design (§5.1), the revised
`DecisionHistoryBanner`/`AddSourceInline` components (§5.3)), `NORTH-STAR.md`.

Scope boundary restated (binding): **one new screen** — `InvestigationWorkspaceScreen`, mounted at
`/departments/problem-department/investigations/:investigationId` **and**
`/departments/problem-department/investigations/:investigationId/versions/:versionNumber` (Finding
3, `02-ARCHITECTURE.md` §5.1 — both routes render the same component; the second is not a distinct
screen), inside the existing, already-shipped Checkpoint-1 shell (`PersistentNav`, Mission Control,
Problem Department overview — all unchanged, read-only inputs to this document, per
`02-ARCHITECTURE.md` §0). This document also specifies the two required call-site edits inside
Checkpoint 1's existing screens (Mission Control, Problem Department overview) that redirect their
per-row "Open current view" affordance from the legacy Express route to this new React route —
those are edits to existing components' navigation targets, not new screens, and do not otherwise
change Checkpoint 1's shipped layout, data, or visual treatment.

This document does not restate Checkpoint 1's Visual Direction section — that section's Grounding,
identity/shell, mission-control/workbench character, typography, palette, spacing, and desktop-
layout rules (`product-surface-checkpoint-1/03-UI-SPEC.md`, "Visual Direction (Binding)") apply
unchanged to every screen and component specified here. Deviations or additions specific to this
sprint's new content (the research-workbench layout, honest-progress copy, decision controls,
non-valid/supersession surfacing, evidence-driven correction trigger) are called out explicitly
below; everything else — monospace data register, semantic status hues, hairline section borders,
no card-shadow chrome, no fake agent theater — is inherited, not redesigned.

**No browser control initiates `assignValidityState` anywhere in this document** — US-12's surface
is strictly read-only (Out of Scope, `01-REQUIREMENTS.md`; Anti-Patterns, `02-ARCHITECTURE.md` §6).
**No generic "Generate correction" control decoupled from new-evidence submission exists anywhere in
this document** — US-13's generation-trigger control is reachable only after a new source has been
added to a `'brief-generated'` Investigation (Out of Scope, `01-REQUIREMENTS.md`).

**Decision controls are available on whatever `BriefVersion` is currently displayed — current or
prior — not restricted to the current version only (Finding 11, resolved as determined, not a gap).**
`02-ARCHITECTURE.md` §5.2 states explicitly that `submitDecision` "posts... always against the
internal `briefVersionId` the fetched `GetBriefForReviewResult` itself carries, so a decision is
only ever recorded against the exact version currently on screen, **prior or current alike**"; and
`01-REQUIREMENTS.md` US-10 AC1 requires recording "against the exact Brief version I reviewed" with
no current-version restriction. This document therefore does NOT gate Approve/Reject/Watch on
`isCurrent` — doing so would contradict both source documents. What US-1 AC5/US-9's last AC and
Finding 11 DO require, and what this revision adds throughout (§ Layout Structure region 1, §
Sections, § Interactions), is that the workspace **always and unambiguously discloses which version
is on screen** ("Version 2 of 3" / "Version 3 of 3 (current)") so a decision recorded against a
prior version is never mistaken by the operator for one recorded against the current Brief.

---

## Screens

| Screen | Route | Purpose | Entry Point |
|---|---|---|---|
| Investigation Workspace | `/departments/problem-department/investigations/:investigationId` (current version) and `/departments/problem-department/investigations/:investigationId/versions/:versionNumber` (Finding 3 — a specific prior `BriefVersion`, addressed by its human-readable version number, never a raw `BriefVersion` UUID) | Single durable surface, at two reload-stable URLs, covering an Investigation's identity, sources, generation history (honest in-progress/stale-or-interrupted/blocked/failed/succeeded), Brief review (current or a specific prior version), evidence/provenance, decision recording, non-valid/supersession surfacing, and evidence-driven correction | Submitting sources via Start Investigation (Problem Department overview); the per-row "Open current view" affordance on Mission Control or the Problem Department overview; the `DecisionHistoryBanner`'s `isSuperseded` link (navigates to the versioned route); direct URL / reload of either route |

No other screen is added or modified this sprint. Mission Control and the Problem Department
overview keep their exact Checkpoint-1 layouts (`product-surface-checkpoint-1/03-UI-SPEC.md`) —
only the destination their per-row link points at changes (§ Interactions, "Open Investigation
Workspace (updated navigation target)"). Both workspace routes render the same
`InvestigationWorkspaceScreen` component (§ Component Hierarchy) — the versioned route is a URL
parameter that changes which `BriefVersion` the same screen fetches and displays, not a second
screen design.

---

## User Flows

### Flow: US-1 — Load the workspace directly or via navigation, in any state

1. User starts at: any URL; either clicks into the workspace from Mission Control / the Problem
   Department overview, or loads `/departments/problem-department/investigations/:investigationId`
   (current version) or `.../investigations/:investigationId/versions/:versionNumber` (a specific
   prior version, Finding 3) directly (browser URL bar, reload, bookmark).
2. User sees: a loading indicator (Checkpoint-1's plain, static treatment — no fake agent theater),
   then either the populated workspace or an explicit not-found state.
3. System response: `GET /api/investigations/:id/workspace` on mount, always. If the URL carries a
   `:versionNumber`, an additional `GET .../brief-versions/by-version/:versionNumber` fetch resolves
   that specific prior version's Brief content (§ Flow: Navigate to a Prior Brief Version, below);
   otherwise the Brief fetch targets `workspace.briefs`' `isCurrent` entry. The workspace renders
   identically regardless of entry path — same component, same fetches, no "entered via link" vs.
   "entered via URL" code path (`02-ARCHITECTURE.md` §5.1).
4. End state: user is on the workspace, in whichever section corresponds to
   `investigation.status` — open/eligible, blocked, generation-failed, or brief-generated — per §
   Screen: Investigation Workspace below, with the header always disclosing which `BriefVersion` is
   displayed (Finding 11).

**Success path:** `InvestigationWorkspaceView` renders with real data; header always shows
human-readable identity (creation date, status, status reason, source count, and — once ≥1
`BriefVersion` exists — "Version N of M" / "Version N of M (current)") — never a raw UUID as
primary content.
**Not-found path:** `GET .../workspace` returns 404 → the workspace renders an explicit
"Investigation not found" state (message + link back to the Problem Department overview) — never a
blank screen, crash, or silent redirect. If the `:versionNumber`-route brief fetch instead returns
404 (`error: 'brief-version-not-found'`, `02-ARCHITECTURE.md` §3.1a) while the Investigation itself
resolves, the workspace still renders regions 1-2 (Investigation identity + Outcome/Status Panel)
and shows an explicit "Version N does not exist for this Investigation" message in place of regions
3-5, rather than silently substituting the current version's content.
**Error path:** any other fetch failure → single explicit error message in place of the workspace
body, matching Checkpoint 1's Page-Load Fetch error-state pattern.

### Flow: US-1 AC5 — Navigate to and view a prior Brief Version (Finding 3)

1. User starts at: the workspace, viewing the current `BriefVersion`, with the
   `DecisionHistoryBanner` visible (region 5) showing `isSuperseded: true` for some earlier version
   in this Investigation's lineage — OR the whole-Investigation `decisionLineage` list (§ Flow
   US-10), each entry labeled with its own human-readable version reference.
2. User sees: every reference to a specific `BriefVersion` other than the one currently on screen
   — the `isSuperseded` supersession statement's forward link, and each `decisionLineage` entry's
   version label — rendered as a real, clickable navigation target labeled by its version NUMBER
   (e.g. "Version 1", never `BriefVersion.id`).
3. User action: clicks a version reference.
4. System response: client-side route transition (`navigate()`, no full-page reload) to
   `/departments/problem-department/investigations/:investigationId/versions/:versionNumber`. The
   screen re-fetches `GET .../workspace` (unchanged — identity/sources/runs/decisionLineage are
   version-independent) and `GET .../brief-versions/by-version/:versionNumber` for the target
   version's Brief content.
5. User sees: the same five-region layout, now showing the target version's own persisted Brief
   content, its own per-version `priorDecisions` list, and a header/banner statement making clear
   this is "Version N of M" — not the current version — with its own navigation back to the current
   version if `isCurrent === false` (from that version's `getBriefForReview` result, always
   available since the current `BriefVersion`'s own `versionNumber` is knowable from
   `workspace.briefs`).
6. End state: URL is the versioned route; reload of this exact URL re-renders the identical prior
   version's content (US-1 AC5's binding reload-stability requirement) — never falling back to the
   current version.

**Success path:** as above.
**Non-existent version path:** navigating to a `versionNumber` with no matching `BriefVersion` under
this Investigation's lineage → the explicit "Version N does not exist" message (§ Flow US-1,
Not-found path) — never a silent substitution.
**Decision-recording-on-a-prior-version path:** Approve/Reject/Watch remain available while viewing
a prior version (§ Header note, above) — a decision recorded here binds to that prior version's
`briefVersionId`, exactly as `02-ARCHITECTURE.md` §5.2 specifies; the confirmation and the version
indicator both make unambiguous which version the decision was recorded against.

### Flow: US-2 — Submit sources and land in the workspace

1. User starts at: `/departments/problem-department` (Checkpoint-1 screen, unchanged), using
   `StartInvestigationForm`.
2. User action: enters one or more sources, submits.
3. System response: `POST /api/investigations` (existing, unchanged) creates the Investigation and
   resolves sources; on success the form calls `navigate('/departments/problem-department/
   investigations/{investigationId}')` instead of Checkpoint 1's prior same-page re-fetch.
4. User sees: the workspace for the new Investigation, in whichever state resolution produced —
   `open` (at least one reachable source) or `blocked` (all sources unreachable).
5. End state: user is inside the durable workspace, continuous with the submission they just made.

**Success path (reachable source):** workspace renders `open`/eligible state; generation trigger
available (Flow US-3).
**Blocked path:** workspace renders the Blocked outcome (§ Screen, Outcome/Status Panel — Blocked)
in the same load, no separate screen.
**Error path:** submission itself fails (e.g. malformed input) → `StartInvestigationForm` shows its
existing inline error, no navigation occurs (unchanged from Checkpoint 1).

### Flow: US-3/US-4 — Trigger generation and watch honest progress

1. User starts at: the workspace, `workspace.generationEligible === true` — the single
   server-computed flag (`02-ARCHITECTURE.md` §3.2/§4.2's Generation Eligibility Rule), true
   whenever `investigation.status` is `'open'` or `'generation-failed'` and no
   `GenerationRun` for the Investigation currently has `outcome === 'in-progress'`, OR
   `investigation.status === 'brief-generated'` AND
   `workspace.newEvidenceSinceCurrentBriefVersion === true` and no run is in-progress (US-13 —
   see Flow US-13 below for the full path). A `'brief-generated'` Investigation with no newly
   added source remains ineligible.
2. User sees: a "Start generation" (initial) or "Retry generation" control in the Outcome/Status
   Panel, enabled.
3. User action: clicks the control.
4. System response: `POST /api/investigations/:id/generation-runs`. On `202` (revised —
   `02-ARCHITECTURE.md` §1.3/§4.2, the connector responds the instant the `GenerationRun` row
   exists, not after the pipeline finishes), the workspace re-fetches `GET .../workspace`
   immediately and begins polling — frequently enough that the panel reads as actively progressing
   without imposing unreasonable load, per `POLL_INTERVAL_MS`'s engineering-derived value
   (`02-ARCHITECTURE.md` §4.9/§5.2 — not asserted as a specific number here) — while
   `latestGenerationRun.livenessState === 'active'` (Finding 8 — revised from a bare
   `outcome === 'in-progress'` check; see step 5a below).
5. User sees, on each poll tick: only persisted facts — run start time, runtime identifier,
   persisted completed/failed `GenerationStep`s (component name, times, outcome, model identifier,
   per-step `validationRecords`/`toolInvocations` when present, and the run's `webSearchQueries` —
   Finding 2, § Screen, Research/Provenance Rail), and the fixed honest copy for the gap between
   persisted steps: **"The run is still in progress. The current component is not reported until
   its step is persisted."** No percent figure, no "currently executing: X" claim beyond the latest
   persisted step, no "thinking" language.
5a. **Stale/interrupted disclosure (Finding 8, `02-ARCHITECTURE.md` §4.9).** If a poll tick returns
   `latestGenerationRun.livenessState === 'stale-or-interrupted'` (no further `GenerationStep`
   progress recorded for longer than `STALE_THRESHOLD_MS` — an engineering-derived duration with a
   safety margin over measured legitimate-processing time, `02-ARCHITECTURE.md` §4.9; not asserted
   as a specific number here — on a run that has not reached a terminal
   `outcome`), the panel switches from the ordinary in-progress rendering to a DISTINCT,
   visually-non-identical disclosure state: **"This run has not reported progress recently and may
   have been interrupted. No further automatic action is available here — this may require Forge or
   operations follow-up."** This is informational copy only — no "cancel" or "restart" control is
   rendered, because `02-ARCHITECTURE.md` defines no such route or service this checkpoint
   (Anti-Patterns; no phantom control). Polling stops the instant `livenessState` transitions to
   `'stale-or-interrupted'` — the screen does not keep polling a run indefinitely once it has been
   disclosed as stale (US-4's last AC).
6. System response: on the run reaching a terminal outcome (`succeeded` | `failed`), polling stops
   (no further requests) and the workspace re-renders into the corresponding outcome section
   without a route change.
7. End state: same URL throughout; user reviews either the new Brief (Flow US-9) or the
   Generation-Failed outcome (Flow US-6). If the run superseded a prior `BriefVersion` (US-13), the
   prior version and its decisions remain reachable via the `DecisionHistoryBanner` (Flow US-12) and
   the versioned route (Flow US-1 AC5).

**Success path:** as above.
**Ineligible-request path:** the control is disabled/hidden whenever the server-provided
`workspace.generationEligible` is `false` (this covers every disqualifying case — a run already
in-progress, `status === 'blocked'`, `status === 'brief-generated'` with no new evidence, or any
other condition the Generation Eligibility Rule excludes — the control never derives its own subset
of these cases); if a stale click still reaches the server and receives `409`/`422`, the workspace
shows an inline error naming the reason (`error: 'generation-already-in-progress'` → "A generation
run is already in progress for this investigation."; `error: 'investigation-not-eligible'` → the
server's `reason`, e.g. "no new source evidence has been added since the current Brief version") and
re-fetches the workspace to resync client state — never a silently swallowed failure.
**Error path (typed pipeline failure):** the run reaches `outcome === 'failed'` on a later poll (it
can no longer be observed synchronously from the `POST` response — the connector no longer awaits
the pipeline, `02-ARCHITECTURE.md` §4.2) — the workspace shows that specific persisted `error`
message (never a generic "something went wrong") and the run's persisted failed state is visible in
the provenance rail on the next `GET .../workspace`.
**Stale/interrupted path:** as step 5a above — a distinct, honest state, never rendered
indistinguishably from a healthily-progressing run.

### Flow: US-5 — Blocked outcome and in-workspace recovery

1. User starts at: the workspace, `investigation.status === 'blocked'`.
2. User sees: the Outcome/Status Panel renders each unreachable source with its real
   `failureReason` (or `noContentReason` for reachable-but-contentless sources) — never a generic
   "failed" label — and no fabricated `GenerationRun` is shown as if one ran (`workspace.
   generationRuns` for a genuinely all-sources-unreachable Investigation is `[]` or contains only
   runs from a prior, different state).
3. User action: uses the inline `AddSourceInline` control (its own real component — Finding 4, see
   § Interactions "Add Source Inline" below — pre-filled with `investigationId`) to submit another
   source, without leaving the URL.
4. System response: `AddSourceInline` calls the existing, extended `POST /api/investigations`
   route (`02-ARCHITECTURE.md` §1.4/§3.1b, H-1-corrected — the same route
   `StartInvestigationForm` uses for creation, with `investigationId` set in the body rather than a
   dedicated `:id/sources` path) with `{ artifacts, investigationId }`. The handler reads the
   Investigation's pre-mutation status, runs `submitSources` → `resolveInvestigationSources`
   unmodified, and — because this Investigation's status was `'blocked'`, not `'brief-generated'`
   — attempts `transitionInvestigationStatus`, checking its real returned boolean; on at least one
   reachable source it succeeds and `Investigation.status` returns to `'open'`. The `201` response
   body's `status` field reflects this real, freshly-read-back value (`CreateInvestigationResponseBody`,
   never the value the handler merely attempted to write). The workspace re-fetches
   `GET .../workspace`, at which point `generationEligible` becomes `true`.
5. End state: user is still on the workspace URL; the Outcome/Status Panel now shows the eligible/
   open state and the generation trigger (Flow US-3) is available.

**Success path:** as above.
**Still-blocked path:** the newly added source also resolves as unreachable → the panel re-renders
with the updated (still all-unreachable) source list and reasons, read from the same real
`status`/re-fetch — never an assumed optimistic "it probably worked" state; user can
add another source again, same in-place flow.

### Flow: US-6 — Generation-Failed outcome and retry

1. User starts at: the workspace, `investigation.status === 'generation-failed'`.
2. User sees: `investigation.statusReason`, the real failed `GenerationRun` and its persisted
   `GenerationStep`s (including the failed step's `error`, and any `validationRecords`/
   `toolInvocations` recorded before failure — Finding 2), plus every prior successful/failed run
   still visible in the provenance rail (§ Screen, Research/Provenance Rail) — nothing hidden or
   discarded; a "Retry generation" control, enabled iff `workspace.generationEligible === true`
   (the same server-provided flag read by every other generation-trigger control in this document —
   per the Generation Eligibility Rule, `'generation-failed'` is eligible whenever no run is
   currently in-progress, so this control is enabled in the ordinary case).
3. User action: clicks "Retry generation."
4. System response: `POST /api/investigations/:id/generation-runs` (same endpoint as Flow US-3) —
   creates a new `GenerationRun`; the failed run's own rows are never rewritten or mutated.
5. End state: workspace shows the new run progressing honestly (Flow US-4) on the same URL; the
   prior failed run remains in the provenance rail's run history.

### Flow: US-9 — Review the complete Brief

1. User starts at: the workspace, `investigation.status === 'brief-generated'` (or any state where
   `workspace.briefs` contains at least one entry) — with or without a `:versionNumber` route param
   (Flow US-1 AC5).
2. User sees: the workspace issues one additional fetch — `GET .../workspace/../brief-versions/
   by-version/:versionNumber` targeting either the routed prior version or, when no `:versionNumber`
   is present, the `isCurrent: true` entry's own `versionNumber` (`02-ARCHITECTURE.md` §3.1a, §5.2)
   — and renders the Complete Brief Review panel with all seven required elements uncollapsed by
   default: Problem Definition, Claims and Evidence (with contradicting evidence inline and stance
   read per-`ClaimVersionEvidenceRef`), Demand Evidence (signal types + qualitative Insufficient/
   Emerging/Substantiated confidence), Existing-Solution Landscape, Gap Hypothesis, Uncertainty,
   System Recommendation with rationale — plus Personal Pull rendered separately, structurally apart
   from Demand. The panel header states which version is displayed (Finding 11 — "Version N of M" /
   "Version N of M (current)"). The Brief-Generated summary panel above this one may render an
   evidence-driven correction control (Flow US-13, current version only — § Sections) — no
   unconditional "generate" control ever appears in this panel itself.
3. User action: optionally expands the technical-disclosure control to see raw validation/runtime
   detail (never the default view).
4. End state: user has read the full Brief plus its evidence/provenance without needing to expand
   anything to see the required content, and knows unambiguously which version they read.

**Success path:** as above; reload re-fetches the same version's content (by `versionNumber` when
routed, otherwise by `isCurrent`) and renders identical content (US-9 AC "reload produces the same
content", extended by US-1 AC5 to prior versions).
**Zero-existing-solutions path:** `SearchScopeNotice` still renders queries/limitations;
`NegativeFindingNotice` renders the populated absence statement for Existing-Solution Landscape
(one of the four negatable elements) — never an empty/error-styled section.

### Flow: US-10 — Record a decision and view decision history

1. User starts at: the workspace, Brief panel visible (Flow US-9 complete) — for whichever version
   (current or prior, Finding 11) is on screen.
2. User sees: the Decision area — Approve / Reject / Watch controls (available for the version
   currently displayed, current or prior alike — § header note above), and below them the
   `DecisionHistoryBanner` (§ Flow US-12; extended by this checkpoint), which renders TWO
   requirements-distinct lists, never merged (Finding 6, US-10 AC11):
   - **this version's own `priorDecisions`** (from `GetBriefForReviewResult.priorDecisions`,
     `decidedAt` ascending) — scoped to exactly the `briefVersionId` on screen;
   - **the whole-Investigation `decisionLineage`** (`workspace.decisionLineage`, `decidedAt`
     ascending, across every `BriefVersion` in this Investigation's lineage), each entry explicitly
     labeled with its own human-readable version reference (e.g. "Decision recorded against Version
     1") — never presented as if it were the same list as the per-version one.
3. User action (Approve/Reject): clicks the control; optional rationale text.
4. User action (Watch): clicks Watch, then must enter at least one named reconsideration condition
   before the Watch submit control becomes enabled — the client blocks submission with zero
   conditions (whitespace-only text does not count as a condition, matching the server's own trim
   check).
5. System response: `POST /api/brief-versions/:briefVersionId/decisions` (via `recordDecision`)
   persists the `Decision` bound to the exact `briefVersionId` currently on screen.
6. User sees: an in-place confirmation on the same URL (no navigation) — the new `Decision` appears
   at the end of both the (still-visible, unchanged) per-version `priorDecisions` list and the
   whole-Investigation `decisionLineage` list.
7. End state: reload re-fetches the workspace and Brief; the same Brief and the same two decision
   lists render identically, in the same order.

**Success path:** as above.
**Watch-rejected path (client-side):** submit control stays disabled until ≥1 non-whitespace
condition is entered — no request is sent for a zero-condition Watch attempt.
**Watch-rejected path (server-side, defense in depth):** if a request somehow reaches the server
with zero/whitespace-only conditions, the server rejects it (`error: 'watch-requires-condition'`);
the workspace shows an inline error and does not add a phantom entry to either decision list,
matching "no Decision persisted on rejection."
**Reject path:** after a recorded Reject, no Reopen control, button, or route is rendered anywhere
in the workspace — the Investigation, Brief, evidence, and provenance remain visible and unchanged.
**Multiple-decisions path:** a Watch followed later by an Approve on the same `briefVersionId` both
appear, in order, in both decision lists — never only the latest.
**Every reconsideration condition renders its resolved content, never a raw ID (Finding 6):** each
entry in both the per-version `priorDecisions` list and the whole-Investigation `decisionLineage`
list shows a Watch decision's condition(s) as their actual `type`/`otherTypeLabel`/`description`
text (`02-ARCHITECTURE.md` §4.5's resolved shape) — no `ReconsiderationCondition.id` or other opaque
identifier ever stands in for the condition's content anywhere in this document.

### Flow: US-12 — Decision History Banner: non-valid state and supersession

1. User starts at: the workspace, Brief panel visible (Flow US-9 complete) — the
   `DecisionHistoryBanner` renders in region 5 alongside the Decision controls, regardless of
   whether any `StatusEvent` has ever been recorded against the current `BriefVersion` (US-12 has no
   browser-reachable write trigger this checkpoint; the banner is purely a read-side surface over
   whatever `getAssignedState`/`isSuperseded` already resolve to).
2. User sees, without scrolling or interacting to reveal it:
   - the two decision lists described in Flow US-10 (per-version `priorDecisions`, whole-lineage
     `decisionLineage`), never hidden behind this banner's other content;
   - the displayed `BriefVersion`'s `assignedState` (`GetBriefForReviewResult.assignedState` for
     whichever version is on screen) rendered as a plain-language statement — **only when
     non-`'valid'`** (e.g. "This Brief version has been challenged." / "This Brief version has been
     invalidated."); when `assignedState === 'valid'`, the banner renders no validity statement at
     all (US-12 AC6 — "never mistake a stale-but-displayed decision" is satisfied by silence on the
     common case, not by a redundant "This Brief version is valid" line);
   - `isSuperseded` — when `true`, a plain-language statement ("A newer version of this Brief
     exists.") with a **navigable link addressed by human-readable version number** (Finding 3 — was
     a link "via `ProblemBrief.currentVersionId`," a raw UUID; now the versioned route,
     `.../versions/:versionNumber`, resolved from `ProblemBrief.currentVersionId`'s own
     `versionNumber` in `workspace.briefs`) — clicking it performs the client-side navigation
     described in Flow US-1 AC5; `isSuperseded` is never merged with or presented as if it were the
     `assignedState` line — they are two structurally distinct facts (§ Sections, Decision Area and
     History).
3. User action: none required to see any of the above — this is the binding "without burying"
   requirement (US-12 AC6). Optionally, the user follows the supersession link to the current
   version's own workspace (Flow US-1 AC5).
4. **No control on this banner, or anywhere else in the workspace, lets the user set or change
   `assignedState`** — no "mark invalid," "challenge," or "revalidate" button exists (Out of Scope,
   US-12).
5. End state: reload re-fetches the workspace and Brief; the same `assignedState`, both decision
   lists, and `isSuperseded` facts render identically (US-12 AC7).

**Common-case path (never invalidated):** `assignedState === 'valid'` for every `BriefVersion` this
checkpoint's own surface can ever produce (no in-scope write path appends a `StatusEvent` — §
Interactions, "Decision History Banner"); the banner shows only the two decision lists and, if
applicable, the supersession link — matching Checkpoint 1's own "no fake state" discipline (nothing
is fabricated to demonstrate a non-`'valid'` state that this checkpoint's own surface cannot
produce).
**Superseded path:** a `BriefVersion` superseded by a US-13 correction shows `isSuperseded: true`
with the version-numbered link forward to the new current version, while its own per-version
`priorDecisions` remain visible unchanged when that superseded version is itself viewed (Flow US-1
AC5).

### Flow: US-13 — Add evidence to a completed Investigation and trigger corrective generation

1. User starts at: the workspace, `investigation.status === 'brief-generated'`, viewing the CURRENT
   version — the Brief-Generated summary panel (§ Sections) is showing. (`AddSourceInline`/
   "Regenerate with new evidence" render only in this panel, which itself renders only for the
   current version — a prior version's view has no correction-trigger surface, since correction
   always targets `ProblemBrief.currentVersionId`.)
2. User sees: an `AddSourceInline` control — its own small component (Finding 4, not a reuse of
   `StartInvestigationForm`, which has no `investigationId` prop and always creates a new
   Investigation) — now also mounted in the Brief-Generated summary panel, plus a
   generation-trigger control labeled to communicate its evidence-driven nature (e.g. "Regenerate
   with new evidence") rather than a bare "Generate correction" — disabled, with an explicit reason
   ("Add a new source to enable a corrected Brief."), while `workspace.
   newEvidenceSinceCurrentBriefVersion === false`.
3. User action: submits a new source via `AddSourceInline`, without leaving the workspace URL.
4. System response: `AddSourceInline` calls the existing, extended `POST /api/investigations`
   route with `{ artifacts, investigationId }` (`02-ARCHITECTURE.md` §1.4/§3.1b, H-1-corrected —
   the SAME route `StartInvestigationForm` uses to create a new Investigation, not a separate
   `:id/sources` route and not `StartInvestigationForm`'s own `createInvestigation` call). Because
   this Investigation's pre-mutation status is `'brief-generated'`, the handler runs
   `submitSources`/`resolveInvestigationSources` unmodified but explicitly **skips**
   `transitionInvestigationStatus` entirely for this request — the Investigation's status remains
   `'brief-generated'` in the `201` response (`CreateInvestigationResponseBody: { investigationId,
   status, sourcesAdded }`, real read-back state, never an assumed one). This route never flips a
   `'brief-generated'` Investigation back to `'open'`, directly or via an unconditional transition
   call it happens to rely on a guard to decline. On completion the workspace re-fetches
   `GET .../workspace`. The new `source_artifact.added_at` now postdates the current
   `BriefVersion.createdAt` and passes `hasEligibleNewEvidenceSinceCurrentBriefVersion`'s real
   resolution-status/consumed-evidence checks (`02-ARCHITECTURE.md` §4.8), so `workspace.
   newEvidenceSinceCurrentBriefVersion` flips to `true` — that flag, not `investigation.status`, is
   what changes as a result of this request.
5. User sees: the "Regenerate with new evidence" control becomes enabled — specifically and only
   because of step 4's real, re-fetched eligibility result, never because `'brief-generated'` status
   alone permits it, and never because of an assumed optimistic response from `AddSourceInline`'s
   own submission.
6. User action: clicks "Regenerate with new evidence."
7. System response: `POST /api/investigations/:id/generation-runs` (same endpoint as Flow US-3),
   which resolves `supersedesVersionId` server-side to `ProblemBrief.currentVersionId` and calls
   `generateBriefVersion` — a real new `GenerationRun` begins.
8. User sees: the workspace switches into the honest in-progress state (Flow US-4) on the same URL.
9. System response: on success, a new `BriefVersion` is created and `ProblemBrief.currentVersionId`
   advances to it; the prior `BriefVersion` row and every `Decision` bound to it are preserved
   unmodified.
10. End state: the new `BriefVersion` is reviewable (Flow US-9); the prior `BriefVersion` remains
    independently retrievable at its own versioned URL (Flow US-1 AC5) and its decision history
    remains intact, surfaced via the `DecisionHistoryBanner`'s `isSuperseded` link (Flow US-12) —
    the workspace makes this explicit rather than implying the prior version was overwritten.

**Success path:** as above.
**No-new-evidence path:** the "Regenerate with new evidence" control stays disabled with its stated
reason; a stale/replayed request that reaches the server anyway is rejected `422` with
`error: 'investigation-not-eligible'` and a reason naming the missing new evidence — matching the
Ineligible-request path in Flow US-3/US-4, not a distinct error surface.
**Corrective run fails path:** the run reaches `outcome === 'failed'` on a later poll (§ Flow
US-3/4's revised error path) — the prior `BriefVersion` remains `ProblemBrief.currentVersionId` and
fully reviewable, unchanged from before the attempt; the workspace re-reads `investigation.status`
from the next `GET .../workspace` rather than assuming a status.
**Concurrent-generation path:** identical to Flow US-3/US-4's `409` handling — no duplicate
`GenerationRun`, no silent overwrite.
**Add-source-fails path:** `AddSourceInline`'s own `POST /api/investigations` request fails
(`400`/`404`/`409` — §3.1b's `CreateInvestigationInvalidRequestResponseBody`/
`CreateInvestigationNotFoundResponseBody`/`CreateInvestigationTransitionConflictResponseBody`) →
the form shows its own inline error (§ Interactions, "Add Source Inline") and
`newEvidenceSinceCurrentBriefVersion` is not touched — no optimistic flip of the "Regenerate"
control's enabled state ever occurs client-side.
**Decoupling guarantee (binding, not just a copy note):** submitting a new source via `AddSourceInline`
here never itself appends a `StatusEvent`, and triggering "Regenerate with new evidence" never calls
`assignValidityState` — US-12 and US-13 remain two fully independent operations, with no shared
control anywhere in this flow (`02-ARCHITECTURE.md` §4.8, §6 Anti-Patterns).

### Flow: US-11 — Cross-slice demonstration (composition of the flows above)

Not a distinct screen flow; this is the release-gate composition of Flows US-2 → US-3/US-4 → US-9 →
US-10 (success path) plus Flow US-5 (Blocked/retry) and Flow US-6 (Generation-Failed) each
independently, all inside this one screen. No additional UI surface is defined for this flow beyond
what the flows above already specify.

---

## Screen: Investigation Workspace (`/departments/problem-department/investigations/:investigationId`
and `.../investigations/:investigationId/versions/:versionNumber`)

### Layout Structure — research-workbench, one persistent structure across all states

The same five-region structure renders for every `investigation.status` and for either route; only
the content of regions 2 and 3 (and whether 3/4/5 have content yet) varies by state, and region 3/5's
Brief/decision content varies by which version is displayed. There is no separate per-status or
per-version screen — this directly satisfies US-1 AC1's "same content regardless of entry path" and
the binding "one persistent workspace URL covering ALL states" direction, extended by Finding 3's
second, version-scoped URL.

```
┌──────────────┬──────────────────────────────────────────────────┐
│ PersistentNav │ 1. Investigation Header                             │
│  (unchanged,  │    Investigation — YYYY-MM-DD HH:mm  ·  Status: X    │
│  Checkpoint 1)│    Status reason: "..." (when present)                │
│               │    Sources: N   ·   shortened id (secondary, labeled) │
│               │    [once ≥1 BriefVersion] Version N of M              │
│               │    [ (current) | link back to current version ]       │
│               ├──────────────────────────────────────────────────┤
│               │ 2. Outcome / Status Panel  (content varies by status  │
│               │    — see Sections below: Open/Eligible, In-Progress,  │
│               │    Stale/Interrupted, Blocked, Generation-Failed,      │
│               │    Brief-Generated-Summary with evidence-driven        │
│               │    correction, US-13 — current-version panel only)    │
│               ├──────────────────────────────────────────────────┤
│               │ 3. Complete Brief Review  (present once ≥1 BriefVersion│
│               │    exists; renders the ROUTED version — current or a   │
│               │    specific prior version, Finding 3; absent — not     │
│               │    empty-styled, simply not rendered — before any      │
│               │    generation has succeeded)                          │
│               │    ┌────────────────────────────────────────────┐   │
│               │    │ 1. Problem Definition                          │   │
│               │    │ 2. Claims and Evidence (contradicting inline)  │   │
│               │    │ 3. Demand Evidence  |  Personal Pull (separate)│   │
│               │    │ 4. Existing-Solution Landscape                 │   │
│               │    │ 5. Gap Hypothesis                              │   │
│               │    │ 6. Uncertainty                                 │   │
│               │    │ 7. System Recommendation + rationale           │   │
│               │    └────────────────────────────────────────────┘   │
│               ├──────────────────────────────────────────────────┤
│               │ 4. Research / Provenance Rail  (present once ≥1        │
│               │    GenerationRun exists — any outcome; ALL runs,        │
│               │    version-independent)                                │
│               │    - Evidence excerpt/label/source/stance/relevance    │
│               │      (from the version currently on screen)           │
│               │    - SearchScopeNotice (queries, failed/blocked)       │
│               │    - CitationScopeNotice (fixed, always visible)       │
│               │    - Runtime / models / tools / steps / per-step        │
│               │      validationRecords/toolInvocations / per-run        │
│               │      webSearchQueries (Finding 2 — real field names)   │
│               │    - [Technical disclosure ▸] raw validation detail    │
│               ├──────────────────────────────────────────────────┤
│               │ 5. Decision Area and Decision History Banner            │
│               │    (present once ≥1 BriefVersion exists; controls act  │
│               │    on whichever version is displayed — Finding 11)     │
│               │    Approve | Reject | Watch  ·  "Your decision"        │
│               │    DecisionHistoryBanner:                              │
│               │      - priorDecisions (THIS version only, chronological)│
│               │      - decisionLineage (WHOLE Investigation, chrono-   │
│               │        logical, each entry labeled by its own version) │
│               │      - non-'valid' assignedState (only when present,    │
│               │        for the version on screen)                      │
│               │      - isSuperseded + versioned link to current version│
└──────────────┴──────────────────────────────────────────────────┘
```

### Sections

| Section | Content | Data Source |
|---|---|---|
| Investigation Header | Human-readable creation date/time, humanized `status`, `statusReason` (only when present), `sources.length`. A shortened id renders only as a clearly-labeled secondary detail (e.g. "ID: a1b2c3d8…"), never as the primary label. Once ≥1 `BriefVersion` exists, also renders "Version N of M" for whichever version is displayed, with "(current)" appended when `isCurrent === true`, and a link back to the current version when viewing a prior one (Finding 11 — makes it structurally impossible to mistake a prior-version view for the current Brief). | `WorkspaceInvestigationSummary`, `workspace.briefs`, the routed `GetBriefForReviewResult.version` |
| Outcome/Status Panel — Open/Eligible | "Ready to generate" state copy; a "Start generation" control, enabled iff `workspace.generationEligible === true` — the single server-computed flag, not re-derived from `status` | `investigation.status === 'open'`, `workspace.generationEligible` |
| Outcome/Status Panel — In-Progress | Run start time, runtime identifier, list of persisted `WorkspaceGenerationStepSummary` rows (component, started/completed times, outcome, model identifier, `validationRecords`, `toolInvocations` — Finding 2), the run's `webSearchQueries` (Finding 2), then the fixed honest-gap sentence (§ Interactions, Honest In-Progress Rendering). Generation trigger hidden/disabled while in-progress (reflected by `workspace.generationEligible === false` during this state). | `latestGenerationRun` where `outcome === 'in-progress'` and `livenessState === 'active'` |
| Outcome/Status Panel — Stale/Interrupted (Finding 8) | A distinct, non-in-progress-styled disclosure: "This run has not reported progress recently and may have been interrupted. No further automatic action is available here — this may require Forge or operations follow-up." No cancel/restart control (none exists server-side, Anti-Patterns). Everything else the In-Progress panel shows (persisted steps, honest-gap sentence context) remains visible below the disclosure — nothing hidden, only the "is this healthily running" claim is corrected. | `latestGenerationRun` where `outcome === 'in-progress'` and `livenessState === 'stale-or-interrupted'` |
| Outcome/Status Panel — Blocked | Every source with `resolutionStatus === 'unreachable'` and its `failureReason`, and every `'reachable-no-content'` source with its `noContentReason`; `AddSourceInline` control (Finding 4, H-1-corrected — its own component, calling the existing, extended `POST /api/investigations` route with `investigationId` in the body) | `workspace.investigation.sources` |
| Outcome/Status Panel — Generation-Failed | `investigation.statusReason`; the failed run's persisted steps (including the failing step's `error`, `validationRecords`, `toolInvocations` — Finding 2); "Retry generation" control, enabled iff `workspace.generationEligible === true` — the same server-computed flag used by the Open/Eligible panel's trigger control, with no separate client-side status check | `latestGenerationRun` where `outcome === 'failed'`, `investigation.statusReason`, `workspace.generationEligible` |
| Outcome/Status Panel — Brief-Generated summary (current version only) | Compact confirmation ("Brief v{versionNumber} generated {date}") linking down to the Complete Brief Review region on the same page (anchor scroll, not navigation); an `AddSourceInline` control (US-13, Finding 4, H-1-corrected — its own real component calling the existing, extended `POST /api/investigations` route with `investigationId` in the body; this request never transitions the Investigation's status — it remains `'brief-generated'` — it only appends sources, and only `workspace.newEvidenceSinceCurrentBriefVersion` changes as a result); and a "Regenerate with new evidence" control, enabled iff `workspace.generationEligible === true` (which for this status requires `workspace.newEvidenceSinceCurrentBriefVersion === true` per the revised Generation Eligibility Rule) and disabled with an explicit reason otherwise. This panel renders **no unconditional/bare "Generate correction" control** — the only generation-trigger here is evidence-gated (Out of Scope, US-13). This panel — and therefore the correction trigger — renders only when viewing the current version; a prior version's Outcome/Status Panel region does not show it (correction always targets `ProblemBrief.currentVersionId`). | `workspace.briefs` (`isCurrent: true` entry), `investigation.status === 'brief-generated'`, `workspace.newEvidenceSinceCurrentBriefVersion`, `workspace.generationEligible` |
| Complete Brief Review | All seven elements, uncollapsed by default (§ below), for whichever version the current URL addresses (current or a specific prior version, Finding 3); `NegativeFindingNotice` for the four negatable elements when a matching `NegativeFinding` exists; Personal Pull rendered as its own subsection, visually and structurally separate from Demand Evidence. No generation-trigger control appears anywhere in this panel — that control lives only in the Outcome/Status Panel above (Open/Eligible, Generation-Failed, or Brief-Generated summary variants, current version only). | `GetBriefForReviewResult` (fetched by `versionNumber`, §3.1a) |
| Research/Provenance Rail | Per-evidence: excerpt, label, source, stance (from `ClaimVersionEvidenceRef`, not `EvidenceItem`), relevance note; contradicting evidence shown inline with supporting evidence, never hidden or in a separate collapsed tab; `SearchScopeNotice` (queries performed + failed/blocked retrievals); fixed `CitationScopeNotice`; per-run runtime identifier/models/tools/steps for every run in `workspace.generationRuns` (not only the latest), each step's real `validationRecords`/`toolInvocations` fields, and each run's real `webSearchQueries` array (queries + per-result retrieved/blocked/failed status) — Finding 2, naming the actual `WorkspaceGenerationStepSummary`/`WorkspaceGenerationRunSummary` field shapes, not a paraphrase; a `[Technical disclosure ▸]` expandable control for raw validation output only | `GetBriefForReviewResult` (evidence/notices), `workspace.generationRuns` (runtime/steps/`validationRecords`/`toolInvocations`/`webSearchQueries`) |
| Decision Area and Decision History Banner | Approve / Reject / Watch controls using "Your decision" product language (no actor name); available for whichever version is on screen — current or prior (Finding 11, per §5.2's binding "prior or current alike"); Watch requires ≥1 named condition before its submit control enables; in-place confirmation banner after a successful submission; no Reopen control anywhere. Below the controls, `DecisionHistoryBanner` (US-12, Finding 6 — revised to render two requirements-distinct lists) renders, without burying or requiring scroll/interaction: (1) this version's own `priorDecisions` (`GetBriefForReviewResult.priorDecisions`, `decidedAt` ascending, scoped to exactly the `briefVersionId` on screen) with every Watch condition rendered as its resolved `description` text, never a raw id; (2) the whole-Investigation `workspace.decisionLineage` (`decidedAt` ascending across every `BriefVersion` in the lineage), each entry labeled with its own human-readable version reference — never merged with list (1); (3) the displayed version's `assignedState` as a plain-language statement, shown only when non-`'valid'` (`'challenged'`/`'invalidated'`) — never rendered when `'valid'`; and (4) `isSuperseded` with a link addressed by human-readable `versionNumber` (Finding 3, not a raw UUID) to the current version, shown only when `true`. `isSuperseded` is a distinct structural fact, never conflated with or merged into the `assignedState` line. No control anywhere in this section initiates `assignValidityState` (Out of Scope, US-12). | `workspace.decisionLineage`, `workspace.briefs` (`isCurrent`/version-number resolution for the supersession link), `GetBriefForReviewResult` (`assignedState`, `isSuperseded`, `priorDecisions` — all scoped to the displayed version) |

**No section is hidden by conditional collapse-by-default for its required content.** The uncertain/
negative-finding/contradicting-evidence "never collapsed by default" rule applies to every
Complete-Brief-Review and Research/Provenance-Rail subsection named above; only the raw
technical-disclosure panel (validation JSON) starts collapsed. The `DecisionHistoryBanner`'s two
decision lists and its non-`'valid'`/`isSuperseded` statements, when present, are likewise never
collapsed or tucked behind an interaction (US-12 AC6).

**Regions 3-5 render only when their preconditions hold** (≥1 `GenerationRun` for region 4, ≥1
`BriefVersion` for regions 3 and 5) — this is an honest "not yet applicable" absence, not an
empty-styled or error-styled section; a freshly-submitted, never-generated Investigation shows
regions 1-2 only.

---

## Interactions

### Honest In-Progress Rendering (US-4)

**Trigger:** `workspace.latestGenerationRun?.outcome === 'in-progress'`.
**Component:** `GenerationProgressPanel`, inside the Outcome/Status Panel.
**Behavior:**
1. On every render, the panel lists exactly the persisted `steps` array — one row per completed or
   failed `GenerationStep`, each showing its own `component`, `startedAt`, `completedAt`, `outcome`,
   `modelIdentifier` when present, and its real `validationRecords`/`toolInvocations` arrays when
   present (Finding 2 — these are already-persisted, already-computed fields; the panel renders them
   directly, it does not paraphrase or summarize them into different labels). No row is rendered for
   a step that has not yet been persisted.
2. The panel also renders the run's `webSearchQueries` array (Finding 2) — each query, its
   `performedAt`, `scopeNote`, `limitations`, and per-result `url`/`retrievedAt`/`status`/
   `failureReason` — feeding both this panel's own display and `SearchScopeNotice` in the Research/
   Provenance Rail (§ Sections), which reads the same field.
3. Below the list, the panel checks `latestGenerationRun.livenessState` (Finding 8):
   - `'active'`: shows one fixed sentence for the current gap: **"The run is still in progress. The
     current component is not reported until its step is persisted."** This sentence never changes
     based on elapsed time, step count, or any client-side guess.
   - `'stale-or-interrupted'`: replaces that sentence with the distinct disclosure copy in § Sections
     ("Outcome/Status Panel — Stale/Interrupted") — visually and structurally different from the
     `'active'` rendering (e.g. a different semantic-status hue per Checkpoint 1's inherited status
     hue system, never the same "in progress" treatment), never claiming the run is healthily
     executing when the server has disclosed otherwise.
4. The panel never renders a percent-complete figure, a "currently executing: X" claim beyond the
   last row in the `steps` list, token-level activity, or any "thinking" language — there is no
   field in `WorkspaceGenerationRunSummary` such a claim could be built from (§ 3.2's structural
   guarantee), and this component must not invent one from elapsed time.

**Loading state:** N/A — this is itself the loading-equivalent state for an in-progress run; no
separate spinner overlays it (a spinner would visually imply activity beyond what the persisted
steps + fixed sentence already honestly convey).
**Polling behavior:** the screen polls `GET .../workspace` at an interval governed by
`POLL_INTERVAL_MS` while `latestGenerationRun?.livenessState === 'active'` (Finding 8 — revised
from a bare `outcome === 'in-progress'` check). `POLL_INTERVAL_MS` is engineering-owned and derived
during Forge from real measured generation timing, expected concurrency, and endpoint cost
(`02-ARCHITECTURE.md` §4.9/§5.2) — this document does not assert a specific value; the binding
behavioral requirement is that polling is frequent enough for the panel to read as actively
progressing during a real generation run, without imposing meaningful load on
`getInvestigationWorkspace` at expected concurrency. Polling stops the
render after `livenessState` transitions to `'terminal'` (i.e. `outcome` becomes `'succeeded'` or
`'failed'`) OR to `'stale-or-interrupted'` — no further requests fire after either transition.
**Terminal state:** panel is replaced by the Blocked / Generation-Failed / Brief-Generated-summary
section corresponding to the new `investigation.status`.
**Stale/interrupted state:** panel switches to the distinct disclosure (§ above) and stops polling;
no phantom "cancel"/"restart" control is rendered — there is no route this checkpoint supports for
either action.

### Trigger Generation

**Trigger:** click on "Start generation" / "Retry generation" / "Regenerate with new evidence"
(same underlying `GenerateButton` component and same single enablement condition —
`workspace.generationEligible === true` — different label by context; § Sections). The
"Regenerate with new evidence" variant renders only inside the Brief-Generated summary panel (current
version only) and only becomes enabled once `workspace.newEvidenceSinceCurrentBriefVersion === true`
(US-13; see the "Add Evidence and Corrective Generation" interaction below for the full
evidence-driven path).
**Component:** Outcome/Status Panel's generation-trigger control, calling
`createGenerationRun(investigationId)`. This control is reused verbatim (`GenerateButton`
— § Component Hierarchy) by the Open/Eligible panel, the Generation-Failed panel, and the
Brief-Generated summary panel; no instance re-derives eligibility from `investigation.status` or
from `latestGenerationRun` — every instance reads only `workspace.generationEligible`, the single
server-computed flag defined by the Generation Eligibility Rule (`02-ARCHITECTURE.md` §3.2/§4.2),
which is `true` for `'open'`/`'generation-failed'` whenever no run is in-progress, and for
`'brief-generated'` only when `newEvidenceSinceCurrentBriefVersion` is also `true`. There is no
state in which more than one instance of this control renders simultaneously, because the
Outcome/Status Panel renders exactly one status-selected variant at a time (§ Component Hierarchy,
`OutcomeStatusPanel`) — the shared flag governs a single control instance's enabled/disabled state,
not a choice between multiple simultaneously visible controls.
**Behavior:**
1. Control shows a form-local pending treatment (not the page-load spinner) and disables itself
   for the duration of the request.
2. On `202` (revised — the connector responds as soon as the `GenerationRun` row exists, not after
   the pipeline finishes, `02-ARCHITECTURE.md` §4.2), the workspace immediately re-fetches
   `GET .../workspace` and begins polling (§ above).
3. On `404`/`409`/`422`, the control re-enables and an inline error message renders in the panel,
   naming the specific reason from the response body (never a generic failure message) — see Flow
   US-3/US-4's and Flow US-13's error paths for exact copy mapping. A terminal pipeline failure
   (`brief-generation-failed`, etc.) is NOT observable from this response anymore (Finding 1) — it
   surfaces on a later poll tick via `latestGenerationRun.outcome === 'failed'` (§ Honest In-Progress
   Rendering, "Terminal state").

**Loading state:** control-local pending state only; rest of the workspace stays as last fetched.
**Error state:** inline message in the Outcome/Status Panel; control re-enabled for retry.
**Success state:** transitions into the In-Progress state (§ above).

### Add Source Inline (Blocked recovery / retry / evidence-driven correction) — revised, Finding 4, H-1-corrected 2026-08-24

**Trigger:** submit on `AddSourceInline`, shown in the Blocked Outcome/Status Panel, optionally as a
secondary "Add another source" affordance in the Open/Eligible panel, and in the Brief-Generated
summary panel (US-13, current version only) as the sole mechanism by which a `'brief-generated'`
Investigation becomes generation-eligible again.
**Component:** `AddSourceInline` — its OWN small form component, calling
`addSourcesToInvestigation(investigationId, artifacts)` → the existing, extended
`POST /api/investigations` route, with `investigationId` set in the request body
(`02-ARCHITECTURE.md` §1.4/§3.1b — Danny's binding H-1 ruling, `05-REVIEW.md`'s Spec-Gate Disposition section (H-1): reuse and extend
the existing route rather than add a new `POST /api/investigations/:id/sources` route). **This is
NOT a reuse of `StartInvestigationForm`, but it IS the same underlying route
`StartInvestigationForm` calls for the create case** — `StartInvestigationForm` never supplies
`investigationId` (always creates a new Investigation); `AddSourceInline` always supplies an
existing one. `AddSourceInline` is a distinct, purpose-built component for adding source(s) to an
EXISTING Investigation, sharing the route but not the form component or its create-only behavior.
**Behavior:**
1. Collects one or more `{ type, raw }` artifact entries (same shape `StartInvestigationForm`
   collects, reused as a UI pattern only — not the component itself) and, on submit, calls
   `POST /api/investigations` with `{ artifacts, investigationId }`.
2. On `201`, the response body (`CreateInvestigationResponseBody: { investigationId, status,
   sourcesAdded }`) is the real, server-read-back state AFTER `submitSources` →
   `resolveInvestigationSources` → (conditionally) `transitionInvestigationStatus` have all
   completed — the workspace renders based on this real value, never an assumed optimistic
   "submission accepted, so it must now be open/eligible" state. Critically, when the
   Investigation's pre-mutation status was `'brief-generated'`, the handler skips
   `transitionInvestigationStatus` entirely for this request — `status` in the response is still
   `'brief-generated'`; this route never silently changes a `'brief-generated'` Investigation to
   `'open'`. `onSubmitted` here triggers a re-fetch of `GET .../workspace` for the current
   Investigation — no navigation occurs.
3. The workspace re-renders with updated `sources`, `status` (unchanged for the
   `'brief-generated'` context — only appended sources, never a status change), `generationEligible`,
   and — for the Brief-Generated summary panel's instance specifically —
   `newEvidenceSinceCurrentBriefVersion` (recomputed from the re-fetch, not derived from step 2's
   response body directly).
4. `AddSourceInline` never itself calls the generation-runs endpoint and never calls
   `assignValidityState` — adding a source is strictly a source-submission action; the separate
   "Regenerate with new evidence" control (§ Trigger Generation) is what a user clicks next, as its
   own distinct action. Separately, whether a `'brief-generated'` Investigation becomes
   generation-eligible again is answered exclusively by `newEvidenceSinceCurrentBriefVersion` (§4.8)
   read on the next workspace poll — never by this route flipping `status` itself.

**Loading/Error state:** control-local pending treatment; on `400` (`error:
'at-least-one-artifact-required'`), `404` (`error: 'investigation-not-found'`), or `409`
(`error: 'invalid-status-transition'` — reachable only on a genuine divergence between the
Investigation's pre-mutation status observed in step 2 (before this request attempted anything) and
its freshly re-read post-decline status: a real concurrent-conflict race in which some other request
changed the status in between. A guard decline where the freshly re-read status still equals step
2's pre-mutation observation is a benign no-op, not this error — it responds `201` with that
unchanged real status instead (H-2 correction, `02-ARCHITECTURE.md` §3.1b step 6); reports the real
current status, never the target the handler attempted), an inline error naming the real reason from
the response body — never a generic message, never an assumed success.
**Success state:** workspace body updates in place, from the real re-fetched
`InvestigationWorkspaceView` — if resolution moved `status` to `'open'` (the Blocked-recovery case),
the Outcome/Status Panel switches from Blocked to Open/Eligible on the same render pass (single
re-fetch, no intermediate flash of a third state). In the Brief-Generated context, `status` remains
`'brief-generated'` and only `newEvidenceSinceCurrentBriefVersion` (and therefore
`generationEligible`) changes, both read from the real re-fetch.

### Add Evidence and Corrective Generation (US-13)

**Trigger:** a `'brief-generated'` Investigation's Brief-Generated summary panel (current version
only).
**Components:** `AddSourceInline` (see above, Finding 4 — its own component, calling the existing,
extended `POST /api/investigations` route) followed, as a distinct user action, by `GenerateButton`
labeled "Regenerate with new evidence."
**Behavior:**
1. `AddSourceInline` submission (as above) is followed by a workspace re-fetch; that re-fetch's
   `newEvidenceSinceCurrentBriefVersion` value (`02-ARCHITECTURE.md` §4.8's real
   resolution-status/consumed-evidence check) is the only thing that can flip this field to `true`
   for this Investigation — never `AddSourceInline`'s own submit-response body directly, and never a
   side effect of a status transition (this route explicitly does not transition a
   `'brief-generated'` Investigation's status at all).
2. Once `true`, "Regenerate with new evidence" enables. Its disabled-state copy while `false` states
   plainly why: "Add a new source to enable a corrected Brief." — never a bare disabled button with
   no reason shown.
3. Clicking "Regenerate with new evidence" follows the same `POST .../generation-runs` path as any
   other generation trigger (§ Trigger Generation) — the connector resolves `supersedesVersionId`
   server-side; no client-supplied flag communicates "this is a correction."
4. On `202`, the workspace transitions to the honest in-progress state (Flow US-4), then — once the
   run reaches a terminal outcome observed via polling — to the new Brief (Flow US-9) or the failed
   state (Flow US-6). The prior `BriefVersion` and its `Decision`(s) are never removed from the
   workspace's data — they remain reachable via `workspace.briefs` (a non-current entry) and at
   their own versioned URL (Flow US-1 AC5), and via the `DecisionHistoryBanner`'s `isSuperseded` link
   on the new current version pointing back.

**Loading state:** `AddSourceInline`'s own pending state, then `GenerateButton`'s own pending state
(sequential user actions, not a combined one-click flow).
**Error state:** `AddSourceInline` errors are its own (§ above); `GenerateButton` errors follow §
Trigger Generation's error handling, including the specific "no new evidence" 422 reason if a stale
click bypasses the disabled state, or a later-observed `outcome === 'failed'` poll tick for a
pipeline failure.
**Success state:** new `BriefVersion` reviewable; prior version and its decisions intact and
independently retrievable at their own versioned URL — the workspace's own copy in the
Brief-Generated summary panel and the `DecisionHistoryBanner` both make this explicit, never
implying the prior Brief was overwritten.

### Navigate to a Prior Brief Version (US-1 AC5, Finding 3)

**Trigger:** clicking a version reference — the `DecisionHistoryBanner`'s `isSuperseded` link, or any
`decisionLineage` entry's version label.
**Component:** each is a real React Router `<Link>`/`navigate()` call to
`/departments/problem-department/investigations/:investigationId/versions/:versionNumber`, using
the human-readable `versionNumber` resolved server-side (never a raw `BriefVersion` UUID rendered or
navigated by).
**Behavior:**
1. Client-side route transition — `PersistentNav` is not torn down.
2. `InvestigationWorkspaceScreen` (the same component for both routes, §5.1) re-fetches
   `GET .../workspace` (identity/sources/runs/`decisionLineage` are version-independent, so this
   re-fetch is not strictly required to change content, but keeps the screen's data current) and
   fetches `GET .../brief-versions/by-version/:versionNumber` for the target version.
3. Every region updates to reflect the target version: header's "Version N of M" indicator, region 3
   (Brief content), the Decision Area's per-version `priorDecisions` list and Approve/Reject/Watch
   controls (bound to that version's `briefVersionId`), and the `DecisionHistoryBanner`'s
   `assignedState`/`isSuperseded` facts (re-evaluated for the target version). Region 4 (Provenance
   Rail, all runs) does not change, since it is version-independent.

**Loading state:** the destination version's own Page-Load Fetch pattern, scoped to regions 3/5 (the
version-dependent content) — regions 1/2/4 do not re-flash if their underlying data is unchanged.
**Error state:** target `versionNumber` does not exist → the explicit "Version N does not exist"
message (§ Flow US-1, Not-found path).
**Success state:** URL is the versioned route; every version-dependent region reflects the target
version.

### Decision History Banner (US-12, Finding 6 revision)

**Trigger:** `workspace.briefs` contains at least one entry — the banner renders alongside the
Decision controls in region 5, on every load, for whichever version is on screen, with no user
action required to reveal its content.
**Component:** `DecisionHistoryBanner`.
**Behavior:**
1. Renders TWO separate, labeled lists, never merged into one undifferentiated list (Finding 6,
   US-10 AC11):
   - the displayed version's own `priorDecisions` (`GetBriefForReviewResult.priorDecisions`,
     chronological) — scoped to exactly that `briefVersionId`;
   - `workspace.decisionLineage` (chronological, whole Investigation), each entry labeled with its
     own `versionNumber`.
   Every Watch decision's reconsideration condition(s) render their resolved `description` text in
   both lists — never a bare `ReconsiderationCondition` id.
2. Reads the displayed version's `assignedState` (from `GetBriefForReviewResult.assignedState`);
   renders a plain-language statement only when that value is `'challenged'` or `'invalidated'` —
   renders nothing extra when `'valid'` (the value every `BriefVersion` this checkpoint's own surface
   can produce resolves to, absent a `StatusEvent` appended outside the browser — § Flow US-12).
3. Reads the displayed version's `isSuperseded`; renders a plain-language statement with a link
   addressed by human-readable `versionNumber` (Finding 3) to the current version, only when `true`.
4. Renders **no control** of any kind that would write a `StatusEvent` — this component has no
   "mark invalid," "challenge," or "revalidate" affordance, and no click handler in its
   implementation may call `assignValidityState` directly or indirectly (Out of Scope, US-12;
   `02-ARCHITECTURE.md` §4.7 "No browser-reachable trigger").

**Loading state:** covered by the workspace's own Page-Load Fetch — no independent loading state for
this component alone.
**Error state:** covered by the workspace's own fetch-error handling — no independent error state.
**Success state:** N/A (read-only, always-rendered-when-applicable component, not an action-driven
one).

### Open Investigation Workspace (updated navigation target — Checkpoint-1 screens)

**Trigger:** clicking the per-row "Open current view" affordance on Mission Control's Active-work
groups / Recent Investigations list, or the Problem Department overview's Investigation portfolio
table (all three call sites unchanged in every other respect from
`product-surface-checkpoint-1/03-UI-SPEC.md`).
**Component:** the same per-row rendering already specified in Checkpoint 1 —
`InvestigationPortfolioTable`, `ActiveWorkGroup`, `RecentInvestigationsList`.
**Behavior (changed from Checkpoint 1):**
1. The link is now a React Router `<Link>`/`navigate()` call to
   `/departments/problem-department/investigations/{id}` (the current-version route — this per-row
   affordance always targets the current version, never a specific prior one) — **not** the plain
   `<a href="/investigations/{id}">` full-page navigation to the legacy Express route Checkpoint 1
   specified (that route is not modified or reused, per this sprint's binding constraint).
2. Every `InvestigationStatus` value now has a real working destination — `'brief-generated'` rows
   are no longer rendered as inert plain text ("Brief ready — review workspace not yet available.")
   since the workspace this sprint builds is exactly that missing destination; every row across all
   four statuses (`open`, `blocked`, `generation-failed`, `brief-generated`) now renders the same
   "Open current view" `<Link>` affordance, differing only in label text where useful (e.g. "Review
   brief" for `brief-generated` rows is an acceptable label variant; the underlying destination and
   click behavior are identical for all statuses).
3. Navigation is a client-side route transition — `PersistentNav` and the rest of the shell are not
   torn down, consistent with the rest of this SPA's route transitions.

**Loading state:** the destination screen's own Page-Load Fetch (§ Investigation Workspace,
Interactions inherited from Checkpoint 1's pattern) — a loading indicator shown until `GET
.../workspace` resolves.
**Error state:** destination screen's own not-found/error states (§ Flow US-1).
**Success state:** user is on the workspace for the clicked Investigation.

---

## Component Hierarchy

```
App (client-side router — Checkpoint 1's existing two routes UNCHANGED, plus two new routes:
     /, /departments/problem-department, and now
     /departments/problem-department/investigations/:investigationId AND
     /departments/problem-department/investigations/:investigationId/versions/:versionNumber
     (Finding 3 — both render the same InvestigationWorkspaceScreen, §5.1))
├── PersistentNav                                    (unchanged, Checkpoint 1)
├── MissionControlScreen                             (unchanged layout; per-row link target
│                                                       updated — § Interactions)
├── ProblemDepartmentScreen                          (unchanged layout; per-row link target
│                                                       updated; StartInvestigationForm's
│                                                       onSubmitted now navigates into the
│                                                       workspace instead of re-fetching this
│                                                       screen — § Interactions, Flow US-2)
└── InvestigationWorkspaceScreen                      (routes: /departments/problem-department/
    │                                                   investigations/:investigationId AND
    │                                                   .../versions/:versionNumber — NEW,
    │                                                   same component for both, §5.1)
    ├── InvestigationIdentityHeader                    (region 1 — REVISED, Finding 11: renders
    │                                                    "Version N of M" / "(current)" / link
    │                                                    back to current, once ≥1 BriefVersion
    │                                                    exists)
    ├── OutcomeStatusPanel                             (region 2 — one of the following renders,
    │   │                                                selected by investigation.status /
    │   │                                                latestGenerationRun.outcome /
    │   │                                                latestGenerationRun.livenessState —
    │   │                                                current-version-only content)
    │   ├── OpenEligiblePanel
    │   │   └── GenerateButton                          (label "Start generation"; enabled iff
    │   │                                                 workspace.generationEligible === true —
    │   │                                                 same component/flag as below)
    │   ├── GenerationProgressPanel                    (in-progress — honest steps + fixed
    │   │                                                gap sentence when livenessState ===
    │   │                                                'active'; REVISED, Finding 8: distinct
    │   │                                                stale/interrupted disclosure when
    │   │                                                livenessState === 'stale-or-interrupted',
    │   │                                                no percent/thinking claims either way;
    │   │                                                REVISED, Finding 2: renders per-step
    │   │                                                validationRecords/toolInvocations and
    │   │                                                per-run webSearchQueries, real field
    │   │                                                names, not a paraphrase)
    │   ├── BlockedSourcesPanel
    │   │   └── AddSourceInline                        (REVISED, Finding 4, H-1-corrected: its
    │   │                                                OWN component, calling
    │   │                                                addSourcesToInvestigation → the
    │   │                                                existing, extended POST
    │   │                                                /api/investigations route with
    │   │                                                investigationId in the body — NOT a new
    │   │                                                :id/sources route, and NOT a reuse of
    │   │                                                StartInvestigationForm)
    │   ├── GenerationFailedPanel
    │   │   └── GenerateButton                          (label "Retry generation"; enabled iff
    │   │                                                 workspace.generationEligible === true —
    │   │                                                 same component/flag as above, no separate
    │   │                                                 status-based gating logic)
    │   └── BriefGeneratedSummaryPanel                  (status === 'brief-generated' AND
    │       │                                            currently-displayed version isCurrent;
    │       │                                            compact confirmation + anchor-scroll link
    │       │                                            to BriefReviewPanel below — hosts the
    │       │                                            evidence-driven correction trigger; no
    │       │                                            unconditional generation control renders
    │       │                                            here)
    │       ├── AddSourceInline                          (US-13; REVISED, Finding 4,
    │       │                                              H-1-corrected: the same real
    │       │                                              component/route as BlockedSourcesPanel's
    │       │                                              instance — the only action that can
    │       │                                              flip newEvidenceSinceCurrentBriefVersion,
    │       │                                              via a real re-fetch, never an optimistic
    │       │                                              assumption; this request never changes
    │       │                                              investigation.status away from
    │       │                                              'brief-generated')
    │       └── GenerateButton                           (label "Regenerate with new evidence";
    │                                                      enabled iff workspace.generationEligible
    │                                                      === true, which for this panel requires
    │                                                      workspace.newEvidenceSinceCurrentBriefVersion
    │                                                      === true — same component as the two
    │                                                      instances above, third label variant,
    │                                                      never a distinct unconditional control)
    ├── BriefReviewPanel                                (region 3 — present iff workspace.briefs
    │   │                                                has an entry matching the routed/current
    │   │                                                version; no generation-trigger control
    │   │                                                anywhere in this panel)
    │   ├── ProblemDefinitionSection                    (never negatable)
    │   ├── ClaimsAndEvidenceSection                     (contradicting evidence inline;
    │   │                                                 NegativeFindingNotice when applicable)
    │   ├── DemandEvidenceSection                        (Insufficient/Emerging/Substantiated;
    │   │                                                 NegativeFindingNotice when applicable)
    │   ├── PersonalPullSection                          (structurally separate from Demand)
    │   ├── ExistingSolutionLandscapeSection             (NegativeFindingNotice when applicable)
    │   ├── GapHypothesisSection                         (NegativeFindingNotice when applicable)
    │   ├── UncertaintySection                           (never collapsed by default)
    │   └── SystemRecommendationSection                  (rationale included)
    ├── ProvenanceRail                                   (region 4 — present iff ≥1 GenerationRun;
    │   │                                                version-independent, all runs)
    │   ├── EvidenceProvenanceList                       (excerpt/label/source/stance/relevance,
    │   │                                                 per resolvedEvidence entry — scoped to
    │   │                                                 the displayed version)
    │   ├── SearchScopeNotice                            (REVISED, Finding 2: reads real
    │   │                                                 webSearchQueries[].scopeNote/limitations)
    │   ├── CitationScopeNotice                          (fixed, always visible)
    │   ├── RunHistoryList                                (every GenerationRun, all steps —
    │   │                                                 not only the latest run; REVISED,
    │   │                                                 Finding 2: renders each step's
    │   │                                                 validationRecords/toolInvocations and
    │   │                                                 each run's webSearchQueries, real field
    │   │                                                 names)
    │   └── TechnicalDisclosurePanel                      (collapsed by default — the ONE panel
    │                                                     in this hierarchy allowed to start
    │                                                     collapsed; raw validation/schema detail)
    └── DecisionSection                                  (region 5 — present iff ≥1 BriefVersion;
        │                                                controls act on the version displayed,
        │                                                current or prior — Finding 11)
        ├── DecisionForm                                  (Approve/Reject/Watch; "Your decision"
        │                                                 copy; Watch gated on ≥1 named condition;
        │                                                 posts to the displayed version's own
        │                                                 briefVersionId, current or prior alike)
        ├── DecisionConfirmationPanel                     (in-place, same URL)
        └── DecisionHistoryBanner                         (REVISED, Finding 6 — renders TWO
                                                            requirements-distinct lists: (1)
                                                            priorDecisions, scoped to the displayed
                                                            version only; (2) decisionLineage, the
                                                            whole-Investigation chronological view,
                                                            each entry labeled by its own
                                                            versionNumber — never merged; PLUS the
                                                            displayed version's non-'valid'
                                                            assignedState (only when present) and
                                                            isSuperseded + a link to the current
                                                            version addressed by human-readable
                                                            versionNumber (Finding 3, not a raw
                                                            UUID) — no control of any kind that
                                                            writes a StatusEvent)
```

`AddSourceInline` (Finding 4, H-1-corrected — `05-REVIEW.md`'s Spec-Gate Disposition section (H-1)) is a real, standalone component
calling `addSourcesToInvestigation(investigationId, artifacts)` → the existing, extended
`POST /api/investigations` route, with `investigationId` set in the request body
(`02-ARCHITECTURE.md` §1.4/§3.1b) — **not** a new `POST /api/investigations/:id/sources` route,
which was never built and is not part of this design. It does NOT wrap or reuse
`StartInvestigationForm` (`src/client/components/StartInvestigationForm.tsx`), which remains the
create-new-Investigation component `ProblemDepartmentScreen` uses, unchanged, with its own
unmodified `onSubmitted` contract (navigates to the new workspace, § Interactions "Open
Investigation Workspace") — the two components share the same route, not the same form. The three
`AddSourceInline` mount points (Blocked recovery, Generation-Failed retry context, Brief-Generated
summary panel) are three instances of this SAME new component, differing only in which panel hosts
them and what happens after their shared `onSubmitted` callback triggers a workspace re-fetch. In
every mount point, when the target Investigation's pre-mutation status is `'brief-generated'`, the
route skips its transition step entirely — none of these three instances can cause
`investigation.status` to change; only `newEvidenceSinceCurrentBriefVersion` changes, and only via
the next real `GET .../workspace` re-fetch.

No component in this hierarchy is a client-side re-derivation of `generationEligible`,
`isCurrent`, `assignedState`, `isSuperseded`, `livenessState`, or
`newEvidenceSinceCurrentBriefVersion` — every one of these is rendered exactly as the server
computed it (`02-ARCHITECTURE.md` §6, "Server-computed derived flags" pattern). In particular, the
three `GenerateButton` instances (`OpenEligiblePanel`, `GenerationFailedPanel`,
`BriefGeneratedSummaryPanel`) are the same component reading the same `workspace.generationEligible`
flag — no instance maintains its own status-based enablement check, so the Generation Eligibility
Rule (`02-ARCHITECTURE.md` §3.2/§4.2, including its US-13 branch) has exactly one rendering-side
consumer pattern across all three contexts. No component in this hierarchy calls or references
`assignValidityState` — the write path has zero UI callers this checkpoint (Out of Scope, US-12).

---

## State Visibility

| State | Visible In | Updated By |
|---|---|---|
| `InvestigationWorkspaceView` (identity, sources, all `generationRuns` including per-run `livenessState`/`webSearchQueries` and per-step `validationRecords`/`toolInvocations`, `briefs` including `assignedState`/`isSuperseded` per version, `decisionLineage`, `generationEligible`, `newEvidenceSinceCurrentBriefVersion`) | `InvestigationWorkspaceScreen` and every child region, including `DecisionHistoryBanner` and the Brief-Generated summary panel's `AddSourceInline`/`GenerateButton` pair | `GET .../workspace` on mount, then on each poll tick (at the engineering-derived `POLL_INTERVAL_MS` interval, `02-ARCHITECTURE.md` §4.9/§5.2 — not asserted here as a specific value) while `latestGenerationRun?.livenessState === 'active'`, then on any local action that changes server state (add source, trigger generation, record decision) |
| `GetBriefForReviewResult` (seven elements, evidence, negative findings, notices, `priorDecisions`, `assignedState`, `isSuperseded`, `version`) for the routed/current version | `BriefReviewPanel`, `ProvenanceRail`'s evidence list, `InvestigationIdentityHeader`'s "Version N of M" indicator, `DecisionHistoryBanner`'s per-version list | `GET .../brief-versions/by-version/:versionNumber`, fetched once per displayed version (current when no `:versionNumber` route param is present, the routed value otherwise) — not re-fetched on every poll tick, re-fetched on version navigation (Flow US-1 AC5) |
| routed `:versionNumber` (URL param, not component state) | `InvestigationWorkspaceScreen` (`useParams`) | the browser URL itself — reload-stable, never derived from in-memory navigation history (Finding 3, US-1 AC5) |
| `notFound` / `error` (investigation-level or version-level) | `InvestigationWorkspaceScreen` | the initial `GET .../workspace` fetch's outcome, or the version-specific `brief-version-not-found` outcome |
| polling interval liveness (`'active'` vs. `'stale-or-interrupted'` vs. `'terminal'`) | `GenerationProgressPanel` (rendering), `InvestigationWorkspaceScreen` (interval lifecycle) | `workspace.latestGenerationRun?.livenessState`, via a `useEffect` keyed on that value (Finding 8 — revised from a bare `outcome` check) — clears on transition to `'terminal'` OR `'stale-or-interrupted'` |
| `decisionSubmission` (pending/error/confirmedDecisionId) | `DecisionForm` / `DecisionConfirmationPanel` only | its own submit handler; cleared on next submission attempt |
| Watch condition rows (client-only, pre-submit) | `DecisionForm` only | user input; not persisted until a successful submit; discarded on navigation away without submitting |

No state from `InvestigationWorkspaceScreen` is shared with `MissionControlScreen` or
`ProblemDepartmentScreen` — each screen refetches its own data on its own mount, consistent with
Checkpoint 1's no-state-management-library, no-cross-screen-cache design
(`product-surface-checkpoint-1/03-UI-SPEC.md`, State Visibility).

---

## Output Verification

- Every user story (US-1 through US-13) has a mapped flow: yes — US-7 (SSRF fix) and US-8 (retry
  gap fix) are backend defect fixes with no independent UI surface of their own; their user-visible
  effect is fully covered by Flow US-2 (resolution succeeding) and Flow US-5 (Blocked → retry
  reaching a real new generation eligible state) respectively, so no separate flow is duplicated
  for them. US-1 AC5 is covered by its own dedicated flow (Finding 3). US-12 is covered by Flow
  US-12; US-13 is covered by Flow US-13.
- Every flow has a screen: yes — all flows resolve to the single Investigation Workspace screen (at
  either of its two routes) or the two unchanged Checkpoint-1 screens for the flows' starting points.
- Every screen has a layout: yes — one layout diagram covering all `investigation.status` values and
  both routes, per the binding "one persistent workspace URL" direction, extended by Finding 3's
  second, version-scoped URL rendering the same layout.
- Interactions cover success, loading, and error states: yes (Honest In-Progress Rendering
  including the stale/interrupted branch, Trigger Generation, Add Source Inline, Add Evidence and
  Corrective Generation, Navigate to a Prior Brief Version, Decision History Banner, Record
  Decision, Open Investigation Workspace).
- Component hierarchy matches architecture components: yes — every component `02-ARCHITECTURE.md`
  §2/§5.3 names (`InvestigationIdentityHeader`, `AddSourceInline`, `GenerationProgressPanel`,
  `BlockedSourcesPanel`, `BriefReviewPanel`, `DecisionForm`/`DecisionConfirmationPanel`,
  `DecisionHistoryBanner`, `GenerateButton`) appears in the hierarchy above, plus purely
  presentational subdivisions (the seven Brief-element sections, the outcome-panel variants) that
  are layout subdivisions of architecture-assigned components, not new data-owning services.
- Single generation-eligibility gate: yes — every generation-trigger control specified in this
  document (Open/Eligible's "Start generation", Generation-Failed's "Retry generation", and
  Brief-Generated summary's "Regenerate with new evidence") is the same `GenerateButton` component,
  gated solely on `workspace.generationEligible`, the one server-computed flag defined by
  `02-ARCHITECTURE.md` §3.2/§4.2's Generation Eligibility Rule (including its US-13 evidence-gated
  branch) — no section, flow, or component in this document re-derives eligibility from
  `investigation.status` or `newEvidenceSinceCurrentBriefVersion` independently.
- No unconditional "Generate correction" control: yes — the only generation-trigger control ever
  rendered for a `'brief-generated'` Investigation is `GenerateButton` gated on
  `workspace.generationEligible`, which for that status requires
  `newEvidenceSinceCurrentBriefVersion === true`; no separate, always-enabled control exists (§
  Sections, § Component Hierarchy, § Interactions "Add Evidence and Corrective Generation").
- No invalidation-trigger control: yes — `DecisionHistoryBanner` (§ Sections, § Component
  Hierarchy, § Interactions "Decision History Banner") is read-only; no control anywhere in this
  document calls or references `assignValidityState`.
- Invalidation/correction decoupling preserved: yes — § Flow US-13's "Decoupling guarantee" and §
  Interactions "Add Evidence and Corrective Generation" state explicitly that adding a source never
  appends a `StatusEvent` and that `GenerateButton`'s US-13 path never calls `assignValidityState`;
  no shared control, endpoint, or click handler is specified anywhere in this document.
- Prior version/decision preservation on correction communicated to the user: yes — Flow US-13 step
  10 and the Brief-Generated summary panel's copy explicitly state the prior `BriefVersion` and its
  decisions remain reachable at their own versioned URL, and `DecisionHistoryBanner`'s
  `isSuperseded` link is the named, navigable (Finding 3) mechanism by which the workspace surfaces
  that relationship (§ Flow US-12, § Flow US-1 AC5, § Sections).
- Required-uncollapsed guarantee: Problem Definition, Claims and Evidence (contradicting evidence
  inline), Demand Evidence, Existing-Solution Landscape, Gap Hypothesis, Uncertainty, System
  Recommendation, Personal Pull (separate), every Research/Provenance Rail subsection except
  `TechnicalDisclosurePanel`, and `DecisionHistoryBanner`'s two decision lists plus its
  non-`'valid'`/`isSuperseded` statements (when present) are uncollapsed by default everywhere they
  are specified above — no section in the Layout Structure or Sections tables carries a
  default-collapsed treatment other than that one named exception.
- Numeric-value guarantee: no field labeled "Demand" anywhere in this document renders a number —
  every Demand Evidence reference in Sections/Component Hierarchy specifies
  Insufficient/Emerging/Substantiated.
- Identity guarantee: every reference to Investigation/Brief/GenerationRun/StatusEvent identity in
  this document specifies a human-readable label as primary, with a shortened id (if shown at all)
  explicitly named as secondary/labeled — checked against every row in the Sections and Interactions
  tables, including the new `DecisionHistoryBanner` copy (plain-language `assignedState`/
  `isSuperseded` statements, never a raw enum literal or UUID as primary content) and the new
  version-navigation links (Finding 3 — always labeled by human-readable `versionNumber`, never a
  raw `BriefVersion` UUID).
- Engineering-owned constants guarantee: `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` are referenced
  throughout this document only via their engineering-derivation framing (`02-ARCHITECTURE.md`
  §4.9/§5.2 — measured pipeline timing, safety margin, concurrency, endpoint cost) — no location in
  this document asserts or implies a specific numeric value for either constant, and neither is
  framed as a Danny-owned PROVISIONAL value pending his sign-off.
- External review findings 2, 3, 4, 6, 8, 11 (Codex + Sol, 2026-08-23) are each resolved with a
  stated UI mechanism, not a prose assurance: Finding 2 — § Sections (Research/Provenance Rail, In-
  Progress panel), § Interactions (Honest In-Progress Rendering), § Component Hierarchy
  (`ProvenanceRail`) all now name `validationRecords`/`toolInvocations`/`webSearchQueries` as the
  real rendered field shapes; Finding 3 — new Flow "US-1 AC5", new Interaction "Navigate to a Prior
  Brief Version", the second route in § Screens/§ Component Hierarchy, and the `DecisionHistoryBanner`
  supersession link now addressed by human-readable `versionNumber`; Finding 4 (H-1-corrected
  2026-08-24) — § Interactions "Add Source Inline" and § Component Hierarchy state explicitly
  `AddSourceInline` is its own component calling the existing, extended `POST /api/investigations`
  route (`investigationId` in the request body, per Danny's binding H-1 ruling, `05-REVIEW.md`'s Spec-Gate Disposition section (H-1) —
  not a new `:id/sources` route) and rendering the real persisted `CreateInvestigationResponseBody`,
  never a `StartInvestigationForm` reuse or an assumed optimistic state, and never implying a
  `'brief-generated'` Investigation's status silently changes — only
  `newEvidenceSinceCurrentBriefVersion` does; Finding 6 — § Flow US-10, § Sections, § Interactions
  "Decision History Banner", and § Component Hierarchy all render `priorDecisions` (per-version) and
  `decisionLineage` (whole-Investigation) as two separate, labeled lists, with every reconsideration
  condition rendered as resolved text; Finding 8 — new "Stale/Interrupted" Outcome/Status Panel
  variant, § Interactions' revised polling behavior keyed on `livenessState`, honest
  informational-only copy with no phantom cancel/restart control; Finding 11 — the binding header
  note (top of this document) states the determined resolution (decision controls available on the
  displayed version, current or prior, per `02-ARCHITECTURE.md` §5.2's explicit "prior or current
  alike"), and every region now discloses which version is on screen via
  `InvestigationIdentityHeader`'s "Version N of M" indicator.
