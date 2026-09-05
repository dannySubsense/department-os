# UI Spec: Product Surface — Checkpoint 2

**Status**: Draft (pending Frank spec-gate + human approval).

This spec covers the two-route SPA design (§4.9 `livenessState`, §3.1a/§5.1 version-numbered Brief
route, §1.4/§3.1b/§5.3 real `AddSourceInline` calling the extended `POST /api/investigations`
route, §3.2/§4.5 `decisionLineage` split from per-version `priorDecisions`, §3.2
`validationRecords`/`toolInvocations`/`webSearchQueries`).

`AddSourceInline` calls the existing, extended `POST /api/investigations` route (branching on a
body-supplied `investigationId`, `02-ARCHITECTURE.md` §1.4/§3.1b) — no dedicated
`POST /api/investigations/:id/sources` route exists anywhere in this document.

`POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` are engineering-owned constants, derived at Forge
implementation time via the explicit methodology in `02-ARCHITECTURE.md` §4.9 (measure real
pipeline timing, derive `STALE_THRESHOLD_MS` from that measurement plus a safety margin, derive
`POLL_INTERVAL_MS` from the same measurement plus expected concurrency and endpoint cost), and
recorded as code comments next to the constants once derived — never asserted as a specific number
in this document.

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

**Checkpoint-1 surface capability boundary, restated for sequencing (binding).** The existing,
unmodified Checkpoint-1 browser surface (`src/types/readModels.ts`'s `InvestigationSummary`,
`ProblemDepartmentScreen.tsx`, `StartInvestigationForm.tsx`, `InvestigationPortfolioTable.tsx`)
exposes only an Investigation's aggregate `sourceCount`/`evidenceCount` and its overall
`InvestigationStatus` — it has no per-`SourceArtifact` view of any kind, and this document does not
add one to any Checkpoint-1 screen. Confirming that a specific submitted source's persisted
`resolutionStatus` reached `content-retrieved` therefore cannot be demonstrated "via the actual
rendered result" anywhere on the Checkpoint-1 surface alone — only that the Investigation as a
whole did or did not become `'open'`/`'blocked'`. That per-source `resolutionStatus` rendering is
new content this document adds to the Investigation Workspace screen's region 1
(`InvestigationIdentityHeader`'s Sources list, § Sections, § Component Hierarchy, below) — the real
source-detail surface capable of demonstrating an individual source's resolution outcome in the
browser. Work that lands the Node 22 URL-resolution fix alone, before the Workspace screen exists,
can only be demonstrated against the Checkpoint-1 surface's own aggregate signal (the Investigation
resolving to `'open'` rather than `'blocked'`, per `InvestigationSummary`/`InvestigationPortfolioTable`)
— not against a rendered per-source `resolutionStatus`, which requires the Workspace screen this
document specifies below.

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
prior — not restricted to the current version only.**
`02-ARCHITECTURE.md` §5.2 states explicitly that `submitDecision` "posts... always against the
internal `briefVersionId` the fetched `GetBriefForReviewResult` itself carries, so a decision is
only ever recorded against the exact version currently on screen, **prior or current alike**." The
header always unambiguously discloses which version
is on screen ("Version 2 of 3" / "Version 3 of 3 (current)") so a decision recorded against a
prior version is never mistaken by the operator for one recorded against the current Brief.

---

## Screens

| Screen | Route | Purpose | Entry Point |
|---|---|---|---|
| Investigation Workspace | `/departments/problem-department/investigations/:investigationId` (current version) and `/departments/problem-department/investigations/:investigationId/versions/:versionNumber` | Single durable surface, at two reload-stable URLs, covering an Investigation's identity, sources (including each source's own persisted `resolutionStatus`), generation history (honest in-progress/stale-or-interrupted/blocked/failed/succeeded), Brief review (current or a specific prior version), evidence/provenance, decision recording, non-valid/supersession surfacing, and evidence-driven correction | Submitting sources via Start Investigation (Problem Department overview); the per-row "Open current view" affordance on Mission Control or the Problem Department overview; `InvestigationIdentityHeader`'s forward/backward supersession links (navigates to the versioned route); direct URL / reload of either route |

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
 prior version) directly (browser URL bar, reload, bookmark).
2. User sees: a loading indicator (Checkpoint-1's plain, static treatment — no fake agent theater),
 then either the populated workspace or an explicit not-found state.
3. System response: `GET /api/investigations/:id/workspace` on mount, always. If the URL carries a
 `:versionNumber`, an additional `GET.../brief-versions/by-version/:versionNumber` fetch resolves
 that specific prior version's Brief content (§ Flow: US-1 AC5 — Navigate to and view a prior Brief Version, below);
 otherwise the Brief fetch targets `workspace.briefs`' `isCurrent` entry. The workspace renders
 identically regardless of entry path — same component, same fetches, no "entered via link" vs.
 "entered via URL" code path (`02-ARCHITECTURE.md` §5.1).
4. End state: user is on the workspace, in whichever section corresponds to
 `investigation.status` — open/eligible, blocked, generation-failed, or brief-generated — per §
 Screen: Investigation Workspace below, with the header always disclosing which `BriefVersion` is
 displayed.

**Success path:** `InvestigationWorkspaceView` renders with real data; header always shows
human-readable identity (creation date, status, status reason, source count, and — once ≥1
`BriefVersion` exists — "Version N of M" / "Version N of M (current)") — never a raw UUID as
primary content.
**Not-found path:** `GET.../workspace` returns 404 → the workspace renders an explicit
"Investigation not found" state (message + link back to the Problem Department overview) — never a
blank screen, crash, or silent redirect. If the `:versionNumber`-route brief fetch instead returns
404 (`error: 'brief-version-not-found'`, `02-ARCHITECTURE.md` §3.1a) while the Investigation itself
resolves, the workspace still renders region 1 (Investigation identity) normally; region 2
(Outcome/Status Panel) renders the dedicated **Version Not Found** state (§5.4 rule 0,
`02-ARCHITECTURE.md`, and the Sections table's Version Not Found row, below) — the SAME "Version N
does not exist for this Investigation" message, with no generation-trigger control and no other
variant's content, evaluated before and instead of rules 1-4.
Regions 3-5 render the same message in place of their normal content, rather than silently
substituting the current version's content.
**Error path:** any other fetch failure → single explicit error message in place of the workspace
body, matching Checkpoint 1's Page-Load Fetch error-state pattern.

### Flow: US-1 AC5 — Navigate to and view a prior Brief Version

1. User starts at: the workspace, viewing the current `BriefVersion` — whose own `isSuperseded`
 is always `false` (§3.2, §5.3's binding rule; only a non-current version's own facts can ever be
 `true`), so `InvestigationIdentityHeader` (region 1) offers no forward `isSuperseded` link from
 here. The entry affordance is instead a BACKWARD link (via the current version's own
 `supersedesVersionId`, when non-null, region 1's compact notice, §Sections) — OR the
 whole-Investigation `decisionLineage` list (§ Flow US-10, rendered by `DecisionHistoryBanner`),
 each entry labeled with its own human-readable version reference.
2. User sees: every reference to a specific `BriefVersion` other than the one currently on screen
 — the backward supersession link named in step 1 (when the current version's own
 `supersedesVersionId` is non-null), and each `decisionLineage` entry's version label — rendered as
 a real, clickable navigation target labeled by its version NUMBER (e.g. "Version 1", never
 `BriefVersion.id`). Step 1 above already
 establishes that the current version's own `isSuperseded` is always `false`, so there is no forward
 `isSuperseded` link to render from this starting state — the prior draft's mention of one here
 contradicted step 1 and is removed.
3. User action: clicks a version reference.
4. System response: client-side route transition (`navigate`, no full-page reload) to
 `/departments/problem-department/investigations/:investigationId/versions/:versionNumber`. The
 screen re-fetches `GET.../workspace` (unchanged — identity/sources/runs/decisionLineage are
 version-independent) and `GET.../brief-versions/by-version/:versionNumber` for the target
 version's Brief content.
5. User sees: the same five-region layout, now showing the target version's own persisted Brief
 content, its own per-version `priorDecisions` list, and a header/banner statement making clear
 this is "Version N of M" — not the current version. When this version's own `isSuperseded` is
 `true`, its own forward link to its own immediate successor renders (`forwardSupersededByVersionNumber`,
 never necessarily the current version in a lineage of 3+ — no separate "jump to current/latest
 version" affordance exists anywhere in this design; reaching the current version from a version 2+ hops back is a
 sequential forward walk, one link per hop, each version's own `forwardSupersededByVersionNumber`
 naming only its own immediate successor).
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
3. System response: `POST /api/investigations` (existing route, extended per §1.4/§3.1b —
 `sourcesAdded`, real read-back status) creates the Investigation and resolves sources.
 On
 success, `StartInvestigationForm` invokes its existing `onSubmitted` callback as it always has;
 `ProblemDepartmentScreen.tsx`'s OWN callback handler (the parent, edited this sprint — the only
 Checkpoint-1 edit here) is what now calls `navigate('/departments/problem-department/
 investigations/{investigationId}')`, replacing Checkpoint 1's prior same-page re-fetch behavior
 inside that same handler.
4. User sees: the workspace for the new Investigation, in whichever state resolution produced —
 `open` (at least one reachable source) or `blocked` (all sources unreachable), with each
 submitted source's own persisted `resolutionStatus` visible in region 1's Sources list
 (§ Sections, Investigation Header row) — the real per-source rendering that the Checkpoint-1
 submission form itself cannot show (§ Checkpoint-1 surface capability boundary, above).
5. End state: user is inside the durable workspace, continuous with the submission they just made.

**Success path (reachable source):** workspace renders `open`/eligible state; the submitted
source's Sources-list entry reads `resolutionStatus: 'content-retrieved'`; generation trigger
available (Flow US-3).
**Blocked path:** workspace renders the Blocked outcome (§ Screen, Outcome/Status Panel — Blocked)
in the same load, no separate screen.
**Error path:** submission itself fails (e.g. malformed input) → `StartInvestigationForm` shows its
existing inline error, no navigation occurs (unchanged from Checkpoint 1).

### Flow: US-3/US-4 — Trigger generation and watch honest progress

1. User starts at: the workspace, `workspace.generationEligible === true` — the single
 server-computed flag (`02-ARCHITECTURE.md` §3.2/§4.2's Generation Eligibility Rule), true when
 `investigation.problemBriefId === null` (no correction pending) AND `investigation.status` is
 `'open'` or `'generation-failed'` AND no `GenerationRun` for the Investigation currently has
 `outcome === 'in-progress'`; OR, whenever `investigation.problemBriefId !== null` (a correction —
 in live operation `status` here only ever reads `'brief-generated'`; the `'open'`/
 `'generation-failed'`-with-existing-`ProblemBrief` combination is structurally unreachable),
 true only when `workspace.newEvidenceSinceCurrentBriefVersion === true`
 AND no run is in-progress (US-13 — see Flow US-13 below for the full path); `'blocked'` is never
 eligible regardless of evidence state (canonical rule, `02-ARCHITECTURE.md` §4.2). A
 `'brief-generated'` Investigation with no newly added source remains ineligible.
2. User sees: a "Start generation" (initial) or "Retry generation" control in the Outcome/Status
 Panel, enabled.
3. User action: clicks the control.
4. System response: `POST /api/investigations/:id/generation-runs`. On `202` (revised —
 `02-ARCHITECTURE.md` §1.3/§4.2, the connector responds the instant the `GenerationRun` row
 exists, not after the pipeline finishes), the workspace re-fetches `GET.../workspace`
 immediately and begins polling — frequently enough that the panel reads as actively progressing
 without imposing unreasonable load, per `POLL_INTERVAL_MS`'s engineering-derived value
 (`02-ARCHITECTURE.md` §4.9/§5.2 — not asserted as a specific number here) — while
 `latestGenerationRun.livenessState === 'active'`.
5. User sees, on each poll tick: only persisted facts — run start time, runtime identifier,
 persisted completed/failed `GenerationStep`s (component name, times, outcome, model identifier,
 per-step `validationRecords`/`toolInvocations` when present, and the run's `webSearchQueries`) —
 between persisted steps: **"The run is still in progress. The current component is not reported until
 its step is persisted."** No percent figure, no "currently executing: X" claim beyond the latest
 persisted step, no "thinking" language.
5a. **Stale/interrupted disclosure.**
 If a poll tick returns `latestGenerationRun.livenessState === 'stale-or-interrupted'` (no further
 `GenerationStep` progress recorded for longer than `STALE_THRESHOLD_MS` — an engineering-derived
 duration with a safety margin over measured legitimate-processing time, `02-ARCHITECTURE.md`
 §4.9; not asserted as a specific number here — on a run that has not reached a terminal
 `outcome`), the panel switches from the ordinary in-progress rendering to a DISTINCT,
 visually-non-identical disclosure state: **"This run has not reported progress recently and may
 have been interrupted."** plus two real, distinct controls: a clickable **"Refresh status"**
 control, and a clickable **"Abandon and retry"** control (`02-ARCHITECTURE.md` §1.6) that
 calls `POST.../generation-runs/:runId/abandon` — an explicit,
 irreversible-outcome, human-initiated decision that the run is dead, never invoked automatically
 and never available while `livenessState === 'active'`. This is silence being disclosed
 honestly, not proof the process stopped — a long legitimate step is not evidence of a crash.
 "Refresh status" IS real and specified: it re-issues one `GET.../workspace` read on click.
 "Abandon and retry" IS real and specified: on success it triggers a workspace re-fetch, after
 which `GenerateButton` reflects the cleared concurrency guard and the real `'generation-failed'`
 status (non-correction case) or the correction-specific outcome (§1.6). **On `409`, two distinct
 cases exist, both server-distinguishable by `livenessState`/`currentOutcome` in the `409
 AbandonGenerationRunNotEligibleResponseBody` response body (`02-ARCHITECTURE.md` §3.1c, §1.6 steps
 2/3), each with its own explicit copy, matching every other
 error class's existing explicit-copy convention:**
 - `livenessState: 'active'` (the run resumed reporting progress between the stale classification
 and this click — the ordinary, ineligible-to-abandon case): control re-enables; inline message
 **"This run has started reporting progress again — it is no longer eligible to abandon."**
 - `livenessState: 'terminal'` (the run in fact already finished before the abandon request
 reached it — a genuine lost finalization race, `02-ARCHITECTURE.md` §1.6): inline message
 **"This run finished before the abandon request reached it — see its result below."**, naming
 `currentOutcome` (`'succeeded'` or `'failed'`) explicitly rather than leaving it implied; the
 workspace re-fetches immediately so the panel replaces itself with the run's real
 terminal-outcome rendering (Brief-Generated summary or Generation-Failed, per `outcome`) — this
 is the case the operator most needs told, since the run in fact finished, not the abandonment
 request itself.

 Automatic polling stops
 the instant `livenessState` transitions to `'stale-or-interrupted'`, to avoid imposing indefinite
 load against a run that may not progress further — this is NOT a claim that observation ends
 permanently or that no further progress can ever be recorded. If a "Refresh status" click's read
 shows fresh `GenerationStep` progress has in fact landed, `livenessState` honestly reverts to
 `'active'` and the panel returns to the ordinary in-progress rendering (automatic polling then
 resumes, since `livenessState` is recomputed fresh on every read, never cached from a prior
 classification).
6. System response: on the run reaching a terminal outcome (`succeeded` | `failed`), polling stops
 (no further requests) and the workspace re-renders into the corresponding outcome section
 without a route change.
7. End state: same URL throughout; user reviews either the new Brief (Flow US-9) or the
 Generation-Failed outcome (Flow US-6). If the run superseded a prior `BriefVersion` (US-13), the
 prior version and its decisions remain reachable via `InvestigationIdentityHeader`'s backward
 supersession link (Flow US-12) and the versioned route (Flow US-1 AC5).

**Success path:** as above.
**Ineligible-request path:** the control is disabled/hidden whenever the server-provided
`workspace.generationEligible` is `false` (this covers every disqualifying case — a run already
in-progress, `status === 'blocked'`, `status === 'brief-generated'` with no new evidence, or any
other condition the Generation Eligibility Rule excludes — the control never derives its own subset
of these cases); if a stale click still reaches the server, the workspace shows an inline error
naming the reason, since the Generation Eligibility Rule (`02-ARCHITECTURE.md`
§4.2 step 2) is evaluated before any `INSERT` is attempted, returning a `422`:
`error: 'investigation-not-eligible'`
with `reason` naming the cause — "a generation run is already in progress for this investigation" for
the in-progress case, "no new source evidence has been added since the current Brief version" for the
`'brief-generated'`-with-no-new-evidence case, or the `'blocked'` reason — each rendered as that exact
server-provided text, distinguishable by message alone. `409` is reserved for the genuinely narrow
race at the database's own partial unique index (two requests that both pass the eligibility read
before either `INSERT` commits — not reachable by a human clicking a visible button twice in a normal
session, only by two genuinely simultaneous automated requests): `error:
'generation-already-in-progress'` with `stillInProgress: true` → "A generation run is already in
progress for this investigation."; `stillInProgress: false` (the row that caused the conflict has
itself already finished between the server's own INSERT rejection and its conflict lookup) → "That
conflict has already resolved — try again." In every case the workspace re-fetches to resync client
state — never a silently swallowed failure.
**Error path (typed pipeline failure):** the run reaches `outcome === 'failed'` on a later poll (it
can no longer be observed synchronously from the `POST` response — the connector no longer awaits
the pipeline, `02-ARCHITECTURE.md` §4.2) — the workspace shows that specific persisted `error`
message (never a generic "something went wrong") and the run's persisted failed state is visible in
the provenance rail on the next `GET.../workspace`.
**Stale/interrupted path:** as step 5a above — a distinct, honest state, never rendered
indistinguishably from a healthily-progressing run, with a real "Refresh status" control keeping
continued observation available rather than ending it permanently.

### Flow: US-5 — Blocked outcome and in-workspace recovery

1. User starts at: the workspace, `investigation.status === 'blocked'`.
2. User sees: the Outcome/Status Panel renders each unreachable source with its real
 `failureReason` (or `noContentReason` for reachable-but-contentless sources) — never a generic
 "failed" label — and no fabricated `GenerationRun` is shown as if one ran (`workspace.
 generationRuns` for a genuinely all-sources-unreachable Investigation is `[]` or contains only
 runs from a prior, different state).
3. User action: uses the inline `AddSourceInline` control (its own real component
 § Interactions "Add Source (Blocked Recovery, Failed Retry, and Brief-Generated Resubmission)"
 below — pre-filled with `investigationId`) to submit another
 source, without leaving the URL.
4. System response: `AddSourceInline` calls the existing, extended `POST /api/investigations`
 route (`02-ARCHITECTURE.md` §1.4/§3.1b — the same route `StartInvestigationForm` uses for
 creation, with `investigationId` set in the body rather than a dedicated `:id/sources` path)
 with `{ artifacts, investigationId }`. The handler reads the Investigation's pre-mutation status,
 runs `submitSources` → `resolveInvestigationSources` (which itself skips already-terminally-
 resolved sources and reuses their persisted state for the `allUnreachable` aggregate —
 `02-ARCHITECTURE.md` §1.4; only the newly submitted source is actually resolved here), and —
 because this
 Investigation's status was `'blocked'`, not `'brief-generated'`
 — attempts `transitionInvestigationStatus`, checking its real returned boolean; on at least one
 reachable source it succeeds and `Investigation.status` returns to `'open'`. The `201` response
 body's `status` field reflects this real, freshly-read-back value (`CreateInvestigationResponseBody`,
 never the value the handler merely attempted to write). The workspace re-fetches
 `GET.../workspace`, at which point `generationEligible` becomes `true`.
5. End state: user is still on the workspace URL; the Outcome/Status Panel now shows the eligible/
 open state and the generation trigger (Flow US-3) is available.

**Success path:** as above.
**Still-blocked path:** the newly added source also resolves as unreachable → the panel re-renders
with the updated (still all-unreachable) source list and reasons, read from the same real
`status`/re-fetch — never an assumed optimistic "it probably worked" state; user can
add another source again, same in-place flow.
**Explicit single-source re-check path (US-5 AC4, `02-ARCHITECTURE.md` §1.4a):** independent of the
above, each rendered unreachable source in the Blocked panel also exposes its own "Re-check this
source" control. Clicking it calls `POST /api/source-artifacts/:id/recheck` for exactly that one
`source_artifact`, updates only that row's persisted resolution state, and re-fetches
`GET.../workspace` — this is the only path by which an already-resolved source may be intentionally
re-verified; it never runs automatically and is never triggered by submitting an unrelated new
source via `AddSourceInline`.

### Flow: US-6 — Generation-Failed outcome and retry

1. User starts at: the workspace, `investigation.status === 'generation-failed'`.
2. User sees: `investigation.statusReason`, the real failed `GenerationRun` and its persisted
 `GenerationStep`s (including the failed step's `error`, and any `validationRecords`/
 `toolInvocations` recorded before failure) — still visible in the provenance rail (§ Screen,
 Research/Provenance Rail) — nothing hidden or discarded; a "Retry generation" control, enabled
 iff `workspace.generationEligible === true`
 (the same server-provided flag read by every other generation-trigger control in this document,
 computed by the same Generation Eligibility Rule stated in Flow US-3/US-4 step 1: a
 `'generation-failed'` Investigation always has `investigation.problemBriefId === null` — a
 correction run that fails leaves the Investigation `'brief-generated'`, never
 `'generation-failed'` (`02-ARCHITECTURE.md` §1.6 step 6's explicit skip for a correction) — so
 this control follows the `problemBriefId === null` branch of that same rule directly: eligible
 whenever no run is currently in-progress, with no evidence-gating condition to satisfy, so this
 control is enabled in the ordinary case).
3. User action: clicks "Retry generation."
4. System response: `POST /api/investigations/:id/generation-runs` (same endpoint as Flow US-3) —
 creates a new `GenerationRun`; the failed run's own rows are never rewritten or mutated.
5. End state: workspace shows the new run progressing honestly (Flow US-4) on the same URL; the
 prior failed run remains in the provenance rail's run history.

### Flow: US-9 — Review the complete Brief

1. User starts at: the workspace, `investigation.status === 'brief-generated'` (or any state where
 `workspace.briefs` contains at least one entry) — with or without a `:versionNumber` route param
 (Flow US-1 AC5).
2. User sees: the workspace issues one additional fetch —
 `GET.../brief-versions/by-version/:versionNumber` targeting either the routed prior version or, when no `:versionNumber`
 is present, the `isCurrent: true` entry's own `versionNumber` (`02-ARCHITECTURE.md` §3.1a, §5.2)
 — and renders the Complete Brief Review panel with all seven required elements uncollapsed by
 default: Problem Definition, Claims and Evidence (with contradicting evidence inline and stance
 read per-`ClaimVersionEvidenceRef`), Demand Evidence (signal types + qualitative Insufficient/
 Emerging/Substantiated confidence), Existing-Solution Landscape, Gap Hypothesis, Uncertainty,
 System Recommendation with rationale — plus Personal Pull rendered separately, structurally apart
 from Demand. The panel header states which version is displayed — "Version N of M" /
 "Version N of M (current)". The Brief-Generated summary panel above this one may render an
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
 (current or prior) is on screen.
2. User sees: the Decision area — Approve / Reject / Watch controls (available for the version
 currently displayed, current or prior alike — § header note above), and below them the
 `DecisionHistoryBanner` (§ Flow US-12; extended by this checkpoint), which renders TWO
 requirements-distinct lists, never merged:
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
6. System response (refetch, binding mechanism): on a `201` response, `DecisionForm` does not
 construct either decision list from the `201` response body itself — it triggers exactly two
 refetches: `GET.../workspace` (which returns the updated `decisionLineage`) and
 `GET.../brief-versions/by-version/:versionNumber` for the version currently on screen (which
 returns the updated `priorDecisions`, correctly scoped to that `briefVersionId`). Both refetches
 happen automatically as part of the same in-place update — the operator performs no further
 action and no full page reload/navigation occurs.
7. User sees: an in-place confirmation on the same URL (no navigation) — once both refetches in
 step 6 resolve, the new `Decision` appears at the end of both the per-version `priorDecisions`
 list and the whole-Investigation `decisionLineage` list.
8. End state: reload re-fetches the workspace and Brief via the same two requests described in step
 6; the same Brief and the same two decision lists render identically, in the same order.

**Success path:** as above.
**Watch-rejected path (client-side):** submit control stays disabled until ≥1 non-whitespace
condition is entered — no request is sent for a zero-condition Watch attempt.
**Watch-rejected path (server-side, defense in depth):** if a request somehow reaches the server
with zero/whitespace-only conditions, the server rejects it (`error: 'watch-requires-condition'`);
the workspace shows an inline error and does not add a phantom entry to either decision list,
matching "no Decision persisted on rejection," and neither refetch in step 6 above is triggered.
**Reject path:** after a recorded Reject, no Reopen control, button, or route is rendered anywhere
in the workspace — the Investigation, Brief, evidence, and provenance remain visible and unchanged.
**Multiple-decisions path:** a Watch followed later by an Approve on the same `briefVersionId` both
appear, in order, in both decision lists — never only the latest.
**Every reconsideration condition renders its resolved content, never a raw ID:** each
entry in both the per-version `priorDecisions` list and the whole-Investigation `decisionLineage`
list shows a Watch decision's condition(s) as their actual `type`/`otherTypeLabel`/`description`
text (`02-ARCHITECTURE.md` §4.5's resolved shape) — no `ReconsiderationCondition.id` or other opaque
identifier ever stands in for the condition's content anywhere in this document.

### Flow: US-12 — Decision History Banner: non-valid state and supersession

1. User starts at: the workspace, Brief panel visible (Flow US-9 complete). The non-`'valid'`/
 `isSuperseded` compact notice renders in region 1's `InvestigationIdentityHeader` — not in
 region 5 — so it is physically impossible to miss
 without scrolling past the header itself; `DecisionHistoryBanner`'s two full decision lists remain
 in region 5, further down the page, regardless of whether any `StatusEvent` has ever been recorded
 against the current `BriefVersion` (US-12 has no browser-reachable write trigger this checkpoint;
 both the header notice and the banner are purely read-side surfaces over whatever
 `getAssignedState`/`isSuperseded` already resolve to for the DISPLAYED version, sourced
 from the routed `GetBriefForReviewResult`, never `workspace.briefs.find(isCurrent)`).
2. User sees, without scrolling or interacting to reveal it (region 1 renders immediately on load,
 above the fold, before any of regions 2-5):
 - the displayed `BriefVersion`'s `assignedState` (`GetBriefForReviewResult.assignedState` for
 whichever version is on screen) rendered as a plain-language statement in the header — **only
 when non-`'valid'`** (e.g. "This Brief version has been challenged." / "This Brief version has
 been invalidated."); when `assignedState === 'valid'`, the header renders no validity statement
 at all (US-12 AC6 — "never mistake a stale-but-displayed decision" is satisfied by silence on
 the common case, not by a redundant "This Brief version is valid" line);
 - `isSuperseded` — when `true`, a plain-language statement (e.g. "Version N of this Brief
 exists.", naming the successor's own number) with a **navigable link addressed by human-readable
 version number** — clicking it performs the client-side navigation described in Flow
 US-1 AC5; `isSuperseded` is never merged with or presented as if it were the `assignedState`
 line — they are two structurally distinct facts (§ Sections, Investigation Header);
 - further down, in region 5, the two full decision lists described in Flow US-10 (per-version
 `priorDecisions`, whole-lineage `decisionLineage`), never hidden behind other content — these
 remain in `DecisionHistoryBanner`, unaffected by the header's compact notice.
3. User action: none required to see any of the above — this is the binding "without burying"
 requirement (US-12 AC6). Optionally, the user follows the supersession link to the immediate
 successor's own workspace (Flow US-1 AC5) — in a lineage of 3+, reaching the current version from
 a version 2+ hops back means following this same forward link again from the successor, one hop
 at a time; no AC (US-1 AC5, US-12, US-13) requires a direct jump-to-current from an arbitrary
 prior version, so this sequential walk is the specified mechanism, not a workaround.
4. **No control on this banner, or anywhere else in the workspace, lets the user set or change
 `assignedState`** — no "mark invalid," "challenge," or "revalidate" button exists (Out of Scope,
 US-12).
5. End state: reload re-fetches the workspace and Brief; the same `assignedState`, both decision
 lists, and `isSuperseded` facts render identically (US-12 AC9).

**Common-case path (never invalidated):** `assignedState === 'valid'` for every `BriefVersion` this
checkpoint's own surface can ever produce (no in-scope write path appends a `StatusEvent` — §
Interactions, "Decision History Banner"); the banner shows only the two decision lists and, if
applicable, the supersession link — matching Checkpoint 1's own "no fake state" discipline (nothing
is fabricated to demonstrate a non-`'valid'` state that this checkpoint's own surface cannot
produce).
**Superseded path:** a `BriefVersion` superseded by a US-13 correction shows `isSuperseded: true`
with the version-numbered link forward to its immediate successor (`forwardSupersededByVersionNumber`
— the current version only in a two-version lineage; a middle version in between in a lineage of
3+), while its own per-version `priorDecisions` remain visible unchanged when that superseded
version is itself viewed (Flow US-1 AC5).

### Flow: US-13 — Add evidence to a completed Investigation and trigger corrective generation

1. User starts at: the workspace, `investigation.status === 'brief-generated'`, viewing the CURRENT
 version — the Brief-Generated summary panel (§ Sections) is showing. (`AddSourceInline`/
 "Regenerate with new evidence" render only in this panel, which itself renders only for the
 current version — a prior version's view has no correction-trigger surface, since correction
 always targets `ProblemBrief.currentVersionId`.)
2. User sees: an `AddSourceInline` control — its own small component — now also mounted in the Brief-Generated summary panel, plus a
 generation-trigger control labeled to communicate its evidence-driven nature (e.g. "Regenerate
 with new evidence") rather than a bare "Generate correction" — disabled, with an explicit reason
 ("Add a new source to enable a corrected Brief."), while `workspace.
 newEvidenceSinceCurrentBriefVersion === false`.
3. User action: submits a new source via `AddSourceInline`, without leaving the workspace URL.
4. System response: `AddSourceInline` calls the existing, extended `POST /api/investigations`
 route with `{ artifacts, investigationId }` (`02-ARCHITECTURE.md` §1.4/§3.1b — the SAME route
 `StartInvestigationForm` uses to create a new Investigation, not a separate `:id/sources` route
 and not `StartInvestigationForm`'s own `createInvestigation` call). Because this Investigation's
 pre-mutation status is `'brief-generated'`, the handler runs `submitSources` (unmodified) and
 `resolveInvestigationSources` (which itself skips already-resolved sources — `02-ARCHITECTURE.md`
 §1.4 — reusing their persisted resolution state rather than re-fetching them) but explicitly
 **skips**
 `transitionInvestigationStatus` entirely for this request — the Investigation's status remains
 `'brief-generated'` in the `201` response (`CreateInvestigationResponseBody: { investigationId,
 status, sourcesAdded }`, real read-back state, never an assumed one). This route never flips a
 `'brief-generated'` Investigation back to `'open'`, directly or via an unconditional transition
 call it happens to rely on a guard to decline. On completion the workspace re-fetches
 `GET.../workspace`. The new `source_artifact` row has no row in `generation_run_consumed_source`
 for the current `BriefVersion`'s producing `GenerationRun` (it did not exist when that run took its
 evidence snapshot, so it cannot have been recorded consumed), and its resolved content is not a
 trimmed-`raw` match of any source that run DID consume — the real, persisted-consumption mechanism
 `hasEligibleNewEvidenceSinceCurrentBriefVersion` checks (`02-ARCHITECTURE.md` §4.8; no timestamp
 boundary of any kind), so `workspace.newEvidenceSinceCurrentBriefVersion` flips to `true` — that
 flag, not `investigation.status`, is what changes as a result of this request. The new source's
 own `resolutionStatus` is also now visible in region 1's Sources list (§ Sections, Investigation
 Header row), alongside every other source already on the Investigation.
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
 remains intact, surfaced via `InvestigationIdentityHeader`'s backward supersession link (Flow
 US-12) — the workspace makes this explicit rather than implying the prior version was
 overwritten.

**Success path:** as above.
**No-new-evidence path:** the "Regenerate with new evidence" control stays disabled with its stated
reason; a stale/replayed request that reaches the server anyway is rejected `422` with
`error: 'investigation-not-eligible'` and a reason naming the missing new evidence — matching the
Ineligible-request path in Flow US-3/US-4, not a distinct error surface.
**Corrective run fails path:** the run reaches `outcome === 'failed'` on a later poll (§ Flow
US-3/4's revised error path) — the prior `BriefVersion` remains `ProblemBrief.currentVersionId` and
fully reviewable, unchanged from before the attempt; the workspace re-reads `investigation.status`
from the next `GET.../workspace` rather than assuming a status.
**Concurrent-generation path:** identical to Flow US-3/US-4's `422`/`409` handling above (`422`
for the ordinary visibly-in-progress case, `409` reserved for the narrow simultaneous-INSERT race) —
no duplicate
`GenerationRun`, no silent overwrite.
**Add-source-fails path:** `AddSourceInline`'s own `POST /api/investigations` request fails
(`400`/`404`/`409` — §3.1b's `CreateInvestigationInvalidRequestResponseBody`/
`CreateInvestigationNotFoundResponseBody`/`CreateInvestigationTransitionConflictResponseBody`) →
the form shows its own inline error (§ Interactions, "Add Source (Blocked Recovery, Failed Retry,
and Brief-Generated Resubmission)") and
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
the binding "one persistent workspace URL covering ALL states" direction, extended by this
checkpoint's second, version-scoped URL.

```
┌───────────────┬───────────────────────────────────────────────────┐
│ PersistentNav │ 1. Investigation Header                           │
│ (unchanged,   │    Investigation — YYYY-MM-DD HH:mm · Status: X   │
│ Checkpoint 1) │    Status reason: "..." (when present)            │
│               │    Sources: N · shortened id (secondary, labeled) │
│               │    Per-source list: type, resolved label, and     │
│               │    each source's own persisted resolutionStatus   │
│               │    (content-retrieved / reachable-no-content /    │
│               │    unreachable), with failureReason/               │
│               │    noContentReason shown when applicable — the    │
│               │    real per-source detail Checkpoint 1's own      │
│               │    surface cannot render                          │
│               │    [once ≥1 BriefVersion] Version N of M          │
│               │    [ (current) | link forward to immediate        │
│               │      successor ]                                  │
│               │    [ compact non-valid/supersession notice, when  │
│               │      present, rendered directly in this always-   │
│               │      visible header, so it is never buried below  │
│               │      the fold ]                                   │
│               ├───────────────────────────────────────────────────┤
│               │ 2. Outcome / Status Panel (content varies by      │
│               │    status — see Sections below: Open/Eligible,    │
│               │    In-Progress, Stale/Interrupted, Blocked,       │
│               │    Generation-Failed, Brief-Generated-Summary     │
│               │    with evidence-driven correction, US-13 —       │
│               │    current-version panel only)                    │
│               ├───────────────────────────────────────────────────┤
│               │ 3. Complete Brief Review (present once ≥1         │
│               │    BriefVersion exists; renders the ROUTED        │
│               │    version — current or a specific prior version; │
│               │    when absent — not empty-styled, simply not     │
│               │    rendered — before any generation has succeeded)│
│               │    ┌─────────────────────────────────────────┐    │
│               │    │ 1. Problem Definition                   │    │
│               │    │ 2. Claims and Evidence (contradicting   │    │
│               │    │    inline)                              │    │
│               │    │ 3. Demand Evidence | Personal Pull      │    │
│               │    │    (separate)                           │    │
│               │    │ 4. Existing-Solution Landscape          │    │
│               │    │ 5. Gap Hypothesis                       │    │
│               │    │ 6. Uncertainty                          │    │
│               │    │ 7. System Recommendation + rationale    │    │
│               │    └─────────────────────────────────────────┘    │
│               ├───────────────────────────────────────────────────┤
│               │ 4. Research / Provenance Rail (present once ≥1    │
│               │    GenerationRun exists — any outcome; contains   │
│               │    BOTH version-scoped and version-independent    │
│               │    content — see the two groups below)            │
│               │    - VERSION-SCOPED (refetched with the           │
│               │      displayed version's Brief payload, changes   │
│               │      on version navigation, Flow US-1 AC5):       │
│               │      Evidence excerpt/label/source/stance/        │
│               │      relevance                                    │
│               │    - VERSION-INDEPENDENT (whole-Investigation run │
│               │      history, unchanged across version            │
│               │      navigation):                                 │
│               │      SearchScopeNotice (queries, failed/blocked); │
│               │      CitationScopeNotice (fixed, always visible); │
│               │      Runtime / models / tools / steps / per-step  │
│               │      validationRecords/toolInvocations / per-run  │
│               │      webSearchQueries;                            │
│               │      [Technical disclosure ▸] raw validation      │
│               │      detail                                       │
│               ├───────────────────────────────────────────────────┤
│               │ 5. Decision Area and Decision History Banner      │
│               │    (present once ≥1 BriefVersion exists; controls │
│               │    act on whichever version is displayed)         │
│               │    Approve | Reject | Watch · "Your decision"     │
│               │    DecisionHistoryBanner:                         │
│               │    - priorDecisions (THIS version only,           │
│               │      chronological)                               │
│               │    - decisionLineage (WHOLE Investigation,        │
│               │      chronological, each entry labeled by its     │
│               │      own version)                                 │
│               │    (the compact non-valid/supersession notice     │
│               │    itself renders in region 1, header, above —    │
│               │    not duplicated here)                           │
└───────────────┴───────────────────────────────────────────────────┘
```

### Sections

`investigation.status`, `latestGenerationRun`'s outcome/liveness, and which `BriefVersion` is
displayed can all disagree about which row should win — e.g. a fresh `'open'` Investigation with
its first run already `'in-progress'`; a `'brief-generated'` Investigation mid-correction; or a
failed correction run (`generateBriefVersion.ts:263-267` skips the `'generation-failed'` status
transition for corrections, leaving status at `'brief-generated'`) viewed from a PRIOR version's
URL. Without a fixed precedence order, a mutating panel (`GenerationFailedPanel`, which mounts
`AddSourceInline` and `GenerateButton`) could render while a prior version is on screen, the exact
thing `ViewingPriorVersionPanel` exists to make impossible. Rows below are evaluated in this fixed
order — first match wins (binding, matches `02-ARCHITECTURE.md` §5.4 — both documents state the
same five-rule order, 0-4):

- **Rule 0** — ONLY when a routed `:versionNumber` URL parameter IS PRESENT and does NOT resolve to
 any `BriefVersion` under this Investigation's lineage — never merely because no `BriefVersion`
 exists yet on the non-versioned route (that ordinary pre-generation case always falls through to
 rule 4's status-based Open/Eligible row) → the **Version Not Found** row below.
- **Rule 1** — `latestGenerationRun?.outcome === 'in-progress'` AND (`workspace.briefs.length ===
 0` OR the displayed `BriefVersion.isCurrent === true`) → the **In-Progress**/**Stale/Interrupted**
 rows below, regardless of `investigation.status` — this resolves the ordinary "run started but
 status hasn't caught up yet" case for BOTH an initial run with no `BriefVersion` yet
 (`workspace.briefs.length === 0`) AND a correction against an existing current version
 (`workspace.briefs.length > 0`, displayed version `isCurrent === true`). The `briefs.length === 0`
 disjunct is required: a first-ever generation run has no `BriefVersion` at all until it succeeds,
 so an `isCurrent`-only condition can never match a first run and wrongly falls through to rule 4's
 Open/Eligible row instead — the gap this disjunct closes. "Abandon and retry" mounts only here; it
 is never reachable while a prior version is displayed, because viewing a prior version requires
 `workspace.briefs.length > 0`, which the `briefs.length === 0` disjunct can never itself satisfy.
- **Rule 2** — the displayed `BriefVersion.isCurrent === false` → the **Viewing Prior Version** row
 below — regardless of `investigation.status` and regardless of `latestGenerationRun?.outcome`,
 INCLUDING `'failed'` AND `'in-progress'`. Rule 1 and rule 2 never both match the same displayed
 version: rule 2 can only match when `workspace.briefs.length > 0` (there is no prior version to
 view when no `BriefVersion` exists), and within that case rule 1 requires `isCurrent === true`
 while rule 2 requires `isCurrent === false` — so this rule wins over every later,
 run-outcome-selected/mutating row (Generation-Failed, Brief-Generated summary) for any
 prior-version view.
- **Rule 3** — otherwise (the displayed version IS current), if `latestGenerationRun?.outcome ===
 'failed'` AND `investigation.status !== 'blocked'` → the **Generation-Failed** row below. Without
 this exception, a `'blocked'` Investigation whose latest run happens to read `outcome: 'failed'`
 would wrongly render Generation-Failed instead of the Blocked row's per-source `failureReason`
 disclosure; when the exception applies, evaluation falls through to rule 4, which already selects
 the Blocked row for `status === 'blocked'`. This rule covers both a classic initial-generation
 failure and a failed correction viewed on the current version (`status` stays `'brief-generated'`
 by construction, since a correction failure never transitions status away from it).
- **Rule 4** — otherwise, the row matching `investigation.status` exactly as each row's own
 condition states. Reachable here only for the current version (rule 2 already excluded every
 prior-version view), and only when no run outcome above already claimed the case.

| Section | Content | Data Source |
|---|---|---|
| Outcome/Status Panel — Version Not Found | Renders the explicit "Version N does not exist for this Investigation" message (§ Flow US-1 Not-found path / § Flow US-1 AC5 Non-existent version path) in region 2. No `AddSourceInline`, no `GenerateButton`, no other variant's controls of any kind — this is the ONLY case where region 2 itself carries no status-derived content, matching regions 3-5's existing treatment of the same case. Evaluated before every other Outcome/Status Panel rule (§5.4 rule 0), regardless of `investigation.status` or `latestGenerationRun?.outcome`. | `GET.../brief-versions/by-version/:versionNumber` returns `404` (`error: 'brief-version-not-found'`) while the Investigation itself resolves |
| Investigation Header | Human-readable creation date/time, humanized `status`, `statusReason` (only when present), `sources.length`. A shortened id renders only as a clearly-labeled secondary detail (e.g. "ID: a1b2c3d8…"), never as the primary label. **Also renders a per-source list — one row per `workspace.sources` entry — showing that source's `type`, a resolved human-readable label, and its own persisted `resolutionStatus` (`'content-retrieved'` / `'reachable-no-content'` / `'unreachable'`), with `failureReason` (unreachable) or `noContentReason` (reachable-no-content) shown inline when populated. This is the real, individual-source detail the Checkpoint-1 surface's aggregate `sourceCount` cannot render (§ Checkpoint-1 surface capability boundary, top of this document) — it is present as soon as region 1 itself renders, for every `investigation.status`, not only `'blocked'` (the Outcome/Status Panel — Blocked row, § below, additionally surfaces `failureReason` alongside its own recovery controls for unreachable sources specifically; this header list is the general, always-visible, all-sources view).** Once ≥1 `BriefVersion` exists, also renders "Version N of M" for whichever version is displayed, with "(current)" appended when `isCurrent === true`, and, when viewing a prior version, a navigable forward link to that version's own immediate successor via `forwardSupersededByVersionNumber` (not necessarily the current version in a lineage of 3+). Also renders a compact non-valid/supersession notice for the DISPLAYED version (sourced from the routed `GetBriefForReviewResult`, never `workspace.briefs.find(isCurrent)`) — rendered as a plain-language statement only when `assignedState !== 'valid'`, and/or a navigable `isSuperseded` link (human-readable `versionNumber`, never a raw UUID) when `true`; absent when both are the common case (`'valid'`, not superseded). **Also renders a BACKWARD link: whenever the displayed version's own `supersedesVersionId` is non-null, a navigable link to that prior version (human-readable `versionNumber`, resolved against `workspace.briefs`, never a raw UUID) — the two links point in opposite directions and may both render simultaneously (a middle version in a lineage of 3+ has both a successor and a predecessor).** This is the SAME underlying facts as region 5's banner, surfaced compactly right below the version indicator — not a duplicate control, not a second source of truth. | `WorkspaceInvestigationSummary`, `workspace.sources` (per-source `resolutionStatus`/`failureReason`/`noContentReason`), `workspace.briefs`, the routed `GetBriefForReviewResult.version`/`assignedState`/`isSuperseded` |
| Outcome/Status Panel — Open/Eligible | "Ready to generate" state copy; a "Start generation" control, enabled iff `workspace.generationEligible === true` — the single server-computed flag, not re-derived from `status` | `investigation.status === 'open'`, `workspace.generationEligible` |
| Outcome/Status Panel — In-Progress | Run start time, runtime identifier, list of persisted `WorkspaceGenerationStepSummary` rows (component, started/completed times, outcome, model identifier, `validationRecords`, `toolInvocations`). Generation trigger hidden/disabled while in-progress (reflected by `workspace.generationEligible === false` during this state). | `latestGenerationRun` where `outcome === 'in-progress'` and `livenessState === 'active'` |
| Outcome/Status Panel — Stale/Interrupted | A distinct, non-in-progress-styled disclosure: "This run has not reported progress recently and may have been interrupted." A real "Refresh status" control (re-issues one manual read) AND a real "Abandon and retry" control (`02-ARCHITECTURE.md` §1.6 — calls the abandon route, finalizing the run `'failed'` and clearing the concurrency guard so retry becomes possible) are both rendered here. Everything else the In-Progress panel shows (persisted steps, honest-gap sentence context) remains visible below the disclosure — nothing hidden, only the "is this healthily running" claim is corrected. Rendered only when `workspace.briefs.length === 0` (no `BriefVersion` exists yet) or the displayed `BriefVersion` is current (§5.4 rule 1) — while viewing a prior version, this state instead renders as the Viewing Prior Version row's read-only notice, below, with no "Abandon and retry" control; a prior version can only be viewed when `briefs.length > 0`, so this condition never exposes the control to a prior-version view. | `latestGenerationRun` where `outcome === 'in-progress'` and `livenessState === 'stale-or-interrupted'` |
| Outcome/Status Panel — Blocked | Renders each unreachable source with its real `failureReason` (or `noContentReason` for reachable-but-contentless sources) — never a generic "failed" label — plus its own "Re-check this source" control (US-5 AC4); a real `AddSourceInline` instance for submitting another source without leaving the URL; no fabricated `GenerationRun` shown as if one ran. Selected when `investigation.status === 'blocked'` — the rule-3 "not `'blocked'`" exception is what lets evaluation fall through here instead of rendering Generation-Failed when the latest run also happens to read `'failed'`. | `investigation.status === 'blocked'`, `workspace.investigation.sources` |
| Outcome/Status Panel — Generation-Failed | `investigation.statusReason` when present, otherwise the failed run's own persisted step/error text, per `02-ARCHITECTURE.md` §5.4 rule 3's content contract — this mount point is real and matches `02-ARCHITECTURE.md` §5.3's "Blocked-recovery, generation-failed-retry, AND 'brief-generated' resubmission paths" — its own real `AddSourceInline` component, calling the existing, extended `POST /api/investigations` route with `investigationId` in the body, for adding new source evidence before retrying (never itself triggers generation). **This row renders only when the displayed `BriefVersion` is current (§5.4 rule 2 precedes rule 3) — a failed correction viewed from a prior version instead renders the Viewing Prior Version row below, never this one.** | `latestGenerationRun` where `outcome === 'failed'`, `investigation.statusReason`, `workspace.generationEligible` |
| Outcome/Status Panel — Brief-Generated summary | Compact generation confirmation; its own real `AddSourceInline` component calling the existing, extended `POST /api/investigations` route with `investigationId` in the body (this request never transitions the Investigation's status — it remains `'brief-generated'` — it only appends sources, and only `workspace.newEvidenceSinceCurrentBriefVersion` changes as a result); and a "Regenerate with new evidence" control, enabled iff `workspace.generationEligible === true` (which for this status requires `workspace.newEvidenceSinceCurrentBriefVersion === true` per the revised Generation Eligibility Rule) and disabled with an explicit reason otherwise. This panel renders **no unconditional/bare "Generate correction" control** — the only generation-trigger here is evidence-gated (Out of Scope, US-13). This panel — and therefore the correction trigger — renders only when viewing the current version; a prior version's Outcome/Status Panel region instead renders the **Viewing Prior Version** row below. | `workspace.briefs` (`isCurrent: true` entry), `investigation.status === 'brief-generated'`, `workspace.newEvidenceSinceCurrentBriefVersion`, `workspace.generationEligible` |
| Outcome/Status Panel — Viewing Prior Version | A minimal, read-only statement: "You are viewing a prior version of this Brief. No correction can be triggered from this view." plus the same navigable forward link to this version's own immediate successor (`forwardSupersededByVersionNumber`, human-readable `versionNumber`, region 1) `InvestigationIdentityHeader` already renders. No `AddSourceInline`, no `GenerateButton`, no "Abandon and retry", no evidence-driven correction control or other current-run-mutating control of any kind — correction always targets `ProblemBrief.currentVersionId`, which by definition is not the version on screen here. **When `workspace.latestGenerationRun?.outcome === 'in-progress'` (against the current version, active or stale/interrupted), also renders a distinct, clearly labeled read-only notice — "A generation run is currently active/stalled on the current version — go to the current workspace to view or manage it" — with a real navigable link to the current version's workspace route, where `GenerationProgressPanel` and its controls (including "Abandon and retry") then correctly live.** This variant is reachable regardless of the CURRENT version's own live generation state, INCLUDING while that run is actively `'in-progress'` — it is also reached once a run against the current version is either absent or has reached a terminal outcome (`'failed'` or `'succeeded'`), while viewing a prior version — including immediately after that run has just failed — and still guarantees no current-run-mutating control of any kind. **Renders whenever the displayed version is not current (§5.4 rule 2), regardless of `latestGenerationRun?.outcome`, including `'in-progress'` (rendering the notice above), `'failed'` (a failed correction viewed from a prior version, so this row, not Generation-Failed, is what renders in that case), or terminal/absent (the plain read-only statement with no notice).** | displayed `BriefVersion.isCurrent === false`, `workspace.latestGenerationRun` |
| Complete Brief Review | All seven elements, uncollapsed by default (see the collapse-by-default rule stated below), for whichever version the current URL addresses (current or a specific prior version); `NegativeFindingNotice` for the four negatable elements when a matching `NegativeFinding` exists; Personal Pull rendered as its own subsection, visually and structurally separate from Demand Evidence. No generation-trigger control appears anywhere in this panel — that control lives only in the Outcome/Status Panel above (Open/Eligible, Generation-Failed, or Brief-Generated summary variants, current version only). | `GetBriefForReviewResult` (fetched by `versionNumber`, §3.1a) |
| Research/Provenance Rail | **Version-scoped** (refetched with the displayed version's `GetBriefForReviewResult` and changes when the operator navigates to a different Brief version, Flow US-1 AC5): per-evidence excerpt, label, source, stance (from `ClaimVersionEvidenceRef`, not `EvidenceItem`), relevance note; contradicting evidence shown inline with supporting evidence, never hidden or in a separate collapsed tab. **Version-independent** (whole-Investigation run history; sourced from `workspace.generationRuns`; does not change when navigating between Brief versions): `SearchScopeNotice` (queries performed + failed/blocked retrievals); fixed `CitationScopeNotice`; per-run runtime identifier/models/tools/steps for every run in `workspace.generationRuns` (not only the latest), each step's real `validationRecords`/`toolInvocations` fields, and each run's real `webSearchQueries` array (queries + per-result retrieved/blocked/failed status). | `GetBriefForReviewResult` (version-scoped evidence), `workspace.generationRuns` (version-independent runtime/steps/`validationRecords`/`toolInvocations`/`webSearchQueries`) |
| Decision Area and Decision History Banner | Approve / Reject / Watch controls using "Your decision" product language (no actor name); available for whichever version is on screen — current or prior; Watch requires ≥1 named condition before its submit control enables; in-place confirmation banner after a successful submission; no Reopen control anywhere. On a successful (`201`) submission, the form triggers exactly two refetches — `GET.../workspace` (for `decisionLineage`) and `GET.../brief-versions/by-version/:versionNumber` for the displayed version (for `priorDecisions`) — never constructing either list from the submission's own response body, and never requiring a full page reload/navigation (§ Flow US-10 step 6, § Interactions "Record Decision"). Below the controls, `DecisionHistoryBanner` (US-12, revised to render two requirements-distinct lists) renders, without burying or requiring scroll/interaction: (1) this version's own `priorDecisions` (`GetBriefForReviewResult.priorDecisions`, `decidedAt` ascending, scoped to exactly the `briefVersionId` on screen) with every Watch condition rendered as its resolved `description` text, never a raw id; (2) the whole-Investigation `workspace.decisionLineage` (`decidedAt` ascending across every `BriefVersion` in the lineage), each entry labeled with its own human-readable version reference — never merged with list (1). Full decision controls and both chronological lists remain in this region. No control anywhere in this section initiates `assignValidityState` (Out of Scope, US-12). | `workspace.decisionLineage`, `GetBriefForReviewResult` (`priorDecisions` — scoped to the displayed version) — the backward/forward supersession-link data (`workspace.briefs.isCurrent`/`forwardSupersededByVersionNumber`) is `InvestigationIdentityHeader`'s alone (region 1, above), not this region's. |

**No section is hidden by conditional collapse-by-default for its required content.** The uncertain/
negative-finding/contradicting-evidence "never collapsed by default" rule applies to every
Complete-Brief-Review and Research/Provenance-Rail subsection named above; only the raw
technical-disclosure panel (validation JSON) starts collapsed. The `DecisionHistoryBanner`'s two
decision lists are likewise never collapsed or tucked behind an interaction (US-12 AC6 — this is the
list-appropriate reading of AC6's no-scroll/no-burying clause: `priorDecisions` is a list of zero to
many entries and cannot be guaranteed entirely above the fold the way a single status word can, so
the clause is enforced here as "never collapsed, never behind a click," not as "always on screen
with no scroll" — `01-REQUIREMENTS.md` US-12 AC6 states this distinction explicitly; the
non-`'valid'`/`isSuperseded` statements — each a single compact fact, not a list, so AC6's clause
is read literally for them instead — live in `InvestigationIdentityHeader`, not in
`DecisionHistoryBanner`.

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
 present. No row is rendered for
 a step that has not yet been persisted.
2. The panel also renders the run's `webSearchQueries` array — each query, its
 `performedAt`, `scopeNote`, `limitations`, and per-result `url`/`retrievedAt`/`status`/
 `failureReason` — feeding both this panel's own display and `SearchScopeNotice` in the Research/
 Provenance Rail (§ Sections), which reads the same field.
3. Below the list, the panel checks `latestGenerationRun.livenessState`:
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
**Polling behavior:** the screen polls `GET.../workspace` at an interval governed by
`POLL_INTERVAL_MS` while `latestGenerationRun?.livenessState === 'active'`. `POLL_INTERVAL_MS` is engineering-owned and derived
during Forge from real measured generation timing, expected concurrency, and endpoint cost
(`02-ARCHITECTURE.md` §4.9/§5.2) — this document does not assert a specific value; the binding
behavioral requirement is that polling is frequent enough for the panel to read as actively
progressing during a real generation run, without imposing meaningful load on
`getInvestigationWorkspace` at expected concurrency. Automatic polling stops
after `livenessState` transitions to `'terminal'` (i.e. `outcome` becomes `'succeeded'` or
`'failed'`) OR to `'stale-or-interrupted'` — no further AUTOMATIC requests fire after either
transition.
**Terminal state:** panel is replaced by the Blocked / Generation-Failed / Brief-Generated-summary
section corresponding to the new `investigation.status`.
**Stale/interrupted state:** panel switches to the distinct disclosure (§ Sections, Outcome/Status Panel — Stale/Interrupted,
above) and automatic polling stops (avoiding indefinite load against a run that may not progress
further) — but observation does not end permanently: a real "Refresh status" control remains
rendered and, on click, issues one manual `GET.../workspace` read; if that read shows fresh
progress, `livenessState` honestly reverts to `'active'` and automatic polling resumes. A real
"Abandon and retry" control is also rendered alongside it (`02-ARCHITECTURE.md` §1.6) — a distinct,
explicit, human-initiated action that calls `POST.../generation-runs/:runId/abandon`, and on success
finalizes the run `'failed'`, clearing the concurrency guard and re-fetching the workspace. On `409`,
two distinct cases with distinct copy (§ Flow US-3/US-4's abandon-response handling above — this
"Honest In-Progress Rendering" section's own numbered steps 1-4 do not restate it):
`livenessState === 'active'` (resumed reporting progress — no longer eligible) or
`livenessState === 'terminal'` (the run in fact already finished — a genuine lost finalization
race, `02-ARCHITECTURE.md` §1.6).

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
Outcome/Status Panel renders exactly one variant at a time, selected by the fixed-precedence rule
above (§ Sections, run-outcome/liveness before status; `02-ARCHITECTURE.md` §5.4) — the shared flag
governs a single control instance's enabled/disabled state, not a choice between multiple
simultaneously visible controls.
**Behavior:**
1. Control shows a form-local pending treatment (not the page-load spinner) and disables itself
 for the duration of the request.
2. On `202` (revised — the connector responds as soon as the `GenerationRun` row exists, not after
 the pipeline finishes, `02-ARCHITECTURE.md` §4.2), the workspace immediately re-fetches
 `GET.../workspace` and begins polling (§ Honest In-Progress Rendering, above).
3. On `404`/`409`/`422`, the control re-enables and an inline error message renders in the panel,
 naming the specific reason from the response body (never a generic failure message) — see Flow
 US-3/US-4's and Flow US-13's error paths for exact copy mapping. A terminal pipeline failure
 (`brief-generation-failed`, etc.) is NOT observable from this response anymore — it
 surfaces on a later poll tick via `latestGenerationRun.outcome === 'failed'` (§ Honest In-Progress
 Rendering, "Terminal state").

**Loading state:** control-local pending state only; rest of the workspace stays as last fetched.
**Error state:** inline message in the Outcome/Status Panel; control re-enabled for retry.
**Success state:** the run reaches a terminal outcome and the workspace reflects it via the poll
loop (§ Honest In-Progress Rendering).

### Add Source (Blocked Recovery, Failed Retry, and Brief-Generated Resubmission)

**Trigger:** submit on `AddSourceInline`, mounted at exactly THREE real locations — the Blocked Outcome/Status Panel (US-5),
the Generation-Failed Outcome/Status Panel (US-8, for adding evidence before retry), and the
Brief-Generated summary panel (US-13, current version only) as the sole mechanism by which a
`'brief-generated'` Investigation becomes generation-eligible again.
**Component:** `AddSourceInline` — its OWN small form component, calling
`addSourcesToInvestigation(investigationId, artifacts)` → the existing, extended
`POST /api/investigations` route, with `investigationId` set in the request body
(`02-ARCHITECTURE.md` §1.4/§3.1b — reuses and extends the existing route rather than adding a new
`POST /api/investigations/:id/sources` route). **This is
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
 `'open'`. `onSubmitted` here triggers a re-fetch of `GET.../workspace` for the current
 Investigation — no navigation occurs.
3. The workspace re-renders with updated `sources` (including the new source's own persisted
 `resolutionStatus` in region 1's per-source list, § Sections, Investigation Header), `status`
 (unchanged for the
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
unchanged real status instead; reports the real
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
**Component:** `AddSourceInline` and `GenerateButton`, reused verbatim from the interactions above.
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
3. Clicking "Regenerate with new evidence" follows the same `POST.../generation-runs` path as any
 other generation trigger (§ Trigger Generation) — the connector resolves `supersedesVersionId`
 server-side; no client-supplied flag communicates "this is a correction."
4. On `202`, the workspace transitions to the honest in-progress state (Flow US-4), then — once the
 run reaches a terminal outcome observed via polling — to the new Brief (Flow US-9) or the failed
 state (Flow US-6). The prior `BriefVersion` and its `Decision`(s) are never removed from the
 workspace's data — they remain reachable via `workspace.briefs` (a non-current entry) and at
 their own versioned URL (Flow US-1 AC5), and via `InvestigationIdentityHeader`'s backward
 supersession link on the new current version, resolved from that version's own
 `supersedesVersionId` (§ Sections, Investigation Header row) — pointing back.

**Loading state:** `AddSourceInline`'s own pending state, then `GenerateButton`'s own pending state
(sequential user actions, not a combined one-click flow).
**Error state:** `AddSourceInline` errors are its own (§ Add Source (Blocked Recovery, Failed Retry,
and Brief-Generated Resubmission), above); `GenerateButton` errors follow §
Trigger Generation's error handling, including the specific "no new evidence" 422 reason if a stale
click bypasses the disabled state, or a later-observed `outcome === 'failed'` poll tick for a
pipeline failure.
**Success state:** the workspace shows the newly generated current `BriefVersion`, and the prior
version remains reachable via `workspace.briefs` and `InvestigationIdentityHeader`'s backward
supersession link (as described above).

### Navigate to a Specific Brief Version (US-1 AC5, US-12)

**Trigger:** clicking a version reference — `InvestigationIdentityHeader`'s forward `isSuperseded`
link or backward supersession link (§ Sections, Investigation Header row), or any
`decisionLineage` entry's version label in `DecisionHistoryBanner`.
**Component:** each is a real React Router `<Link>`/`navigate` call to
`/departments/problem-department/investigations/:investigationId/versions/:versionNumber`, using
the human-readable `versionNumber` resolved server-side (never a raw `BriefVersion` UUID rendered or
navigated by).
**Behavior:**
1. Client-side route transition — `PersistentNav` is not torn down.
2. `InvestigationWorkspaceScreen` (the same component for both routes, §5.1) re-fetches
 `GET.../workspace` (identity/sources/runs/`decisionLineage` are version-independent, so this
 re-fetch is not strictly required to change content, but keeps the screen's data current) and
 fetches `GET.../brief-versions/by-version/:versionNumber` for the target version.
3. Every region updates to reflect the target version: header's "Version N of M" indicator plus
 its compact `assignedState`/`isSuperseded`/backward-supersession-link facts (region 1,
 `InvestigationIdentityHeader` — § Decision History Banner above), region 3
 (Brief content), region 4's `EvidenceProvenanceList` (the displayed version's own evidence,
 refetched as part of `GetBriefForReviewResult` — version-SCOPED content), and the Decision
 Area's per-version `priorDecisions` list and Approve/Reject/Watch
 controls (bound to that version's `briefVersionId`). Region 4's remaining content — `RunHistoryList`
 (all `GenerationRun`s and their steps), `SearchScopeNotice`, and `CitationScopeNotice` — does NOT
 change on version navigation, since that content is Investigation-wide and version-INDEPENDENT
 (sourced from `workspace.generationRuns`, which this navigation does not require re-fetching to
 keep current).

**Loading state:** the destination version's own Page-Load Fetch pattern, scoped to regions 3/5 and
region 4's `EvidenceProvenanceList` (the version-dependent content) — regions 1/2 and region 4's
`RunHistoryList`/`SearchScopeNotice`/`CitationScopeNotice` do not re-flash, since that content is
version-independent and unchanged by this navigation.
**Error state:** target `versionNumber` does not exist → the explicit "Version N does not exist"
message (§ Flow US-1, Not-found path).
**Success state:** the target version's content — header facts, Brief content, its own version-scoped
evidence list, and its own `priorDecisions`/decision controls — is fully rendered at the versioned URL.

### Decision History Banner (US-10, US-12)

**Trigger:** `workspace.briefs` contains at least one entry — the banner renders alongside the
Decision controls in region 5, on every load, for whichever version is on screen, with no user
action required to reveal its content.
**Component:** `DecisionHistoryBanner`.
**Behavior:**
1. Renders TWO separate, labeled lists, never merged into one undifferentiated list:
 - the displayed version's own `priorDecisions` (`GetBriefForReviewResult.priorDecisions`,
 chronological) — scoped to exactly that `briefVersionId`;
 - `workspace.decisionLineage` (chronological, whole Investigation), each entry labeled with its
 own `versionNumber`.
 Every Watch decision's reconsideration condition(s) render their resolved `description` text in
 both lists — never a bare `ReconsiderationCondition` id.
2. **Does NOT itself read or render `assignedState`/`isSuperseded`** — that is
 `InvestigationIdentityHeader`'s job alone (§ Sections, Investigation Header row) — **and has no
 control** of any kind that would write a `StatusEvent` — this component has no
 "mark invalid," "challenge," or "revalidate" affordance, and no click handler in its
 implementation may call `assignValidityState` directly or indirectly (Out of Scope, US-12;
 `02-ARCHITECTURE.md` §4.7 "No browser-reachable trigger").

**Loading state:** covered by the workspace's own Page-Load Fetch — no independent loading state for
this component alone.
**Error state:** covered by the workspace's own fetch-error handling — no independent error state.
**Success state:** N/A (read-only, always-rendered-when-applicable component, not an action-driven
one).

### Record Decision (US-10)

**Trigger:** the operator clicks Approve, Reject, or Watch in the Decision Area (§ Sections, region
5) for whichever `BriefVersion` is currently displayed — current or a prior version reached via §
Flow US-1 AC5.
**Component:** `DecisionForm` / `DecisionConfirmationPanel`.
**Behavior:**
1. Approve/Reject: an optional rationale text field; submit is enabled immediately.
2. Watch: submit stays disabled until at least one non-whitespace reconsideration condition is
 entered (§ Flow US-10 step 4) — no request is sent for a zero-condition Watch attempt.
3. On submit, `DecisionForm` calls `POST /api/brief-versions/:briefVersionId/decisions`
 (`recordDecision`, `02-ARCHITECTURE.md` §5.2), supplying the exact `briefVersionId` on screen —
 never the Investigation's current version by default when a prior version is displayed.
4. On success (`201`), `DecisionForm` does NOT construct either decision list from the `201`
 response body itself. It triggers exactly two refetches, both automatic and both required for the
 confirmation in step 5 below to be accurate: (a) `GET.../workspace`, whose response carries the
 updated `decisionLineage`; and (b) `GET.../brief-versions/by-version/:versionNumber` for the
 version currently on screen, whose response carries that version's updated `priorDecisions`. No
 full page reload or navigation occurs — both refetches happen as part of the same in-place update.
5. Once both refetches in step 4 resolve, `DecisionConfirmationPanel` renders an in-place
 confirmation on the same URL, and the workspace's decision lists (`priorDecisions` and
 `decisionLineage`) reflect the new `Decision`.

**Loading state:** the clicked control (Approve/Reject/Watch submit) shows a form-local pending
treatment and disables itself for the duration of the request — no page-level spinner. The brief
window between the `201` response and the two refetches in step 4 resolving is covered by this same
pending treatment; the control does not re-enable until both refetches have completed.
**Error state:** on `422` (`error: 'watch-requires-condition'`, `SubmitDecisionWatchRequiresConditionResponseBody` — `02-ARCHITECTURE.md` §3.1a/§4.3 — the server-side defense-in-depth
check, reachable only if a request somehow bypasses the client-side Watch guard above), the control
re-enables and an inline error renders in the Decision Area; no phantom `Decision` is added to
either decision list (§ Flow US-10, "Watch-rejected path (server-side, defense in depth)"), and
neither of step 4's refetches is triggered. Two
other error responses are defined for this route (`02-ARCHITECTURE.md` §3.1a/§4.1) and receive the
same treatment — control re-enables, inline error in the Decision Area, no phantom `Decision` added,
no refetch triggered: on `400` (`error: 'invalid-request'`, `SubmitDecisionInvalidRequestResponseBody` — a malformed
request body, e.g. a missing/invalid `decision` value or an invalid `reconsiderationConditions[i]`
shape), an inline error states the request could not be submitted; on `404`
(`error: 'brief-version-not-found'`, `SubmitDecisionVersionNotFoundResponseBody` — the
`briefVersionId` on screen no longer resolves, e.g. a stale tab against a version that no longer
exists), an inline error states the version could not be found and directs the operator to reload
the workspace. `recordDecision` and its route define no other failure mode beyond these three.
**Success state:** the in-place confirmation banner described in Behavior step 5; both the
per-version `priorDecisions` list and the whole-Investigation `decisionLineage` list show the new
`Decision` at the end, in chronological order, without navigation away from the workspace URL —
populated by the two refetches in step 4, never by the submission's own request/response payload.

### Open Investigation Workspace (updated navigation target — Checkpoint-1 screens)

**Trigger:** clicking the per-row "Open current view" affordance on Mission Control's Recent
Investigations list, or the Problem Department overview's Investigation portfolio table (both
call sites unchanged in every other respect from `product-surface-checkpoint-1/03-UI-SPEC.md`).
Mission Control's Active-work groups (`ActiveWorkGroup`)
render no anchor at all today and are not retargeted this sprint (§0 above) — this trigger is real
only for `RecentInvestigationsList`'s rows.
**Component:** the per-row anchor in `InvestigationPortfolioTable.tsx` and `RecentInvestigationsList`.
**Behavior (changed from Checkpoint 1):**
1. The link is now a React Router `<Link>`/`navigate` call to
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
)
├── PersistentNav (unchanged, Checkpoint 1)
├── MissionControlScreen (unchanged layout; per-row link target
│ updated — § Interactions)
├── ProblemDepartmentScreen (unchanged layout; per-row link target
│ updated; StartInvestigationForm's
│ onSubmitted now navigates into the
│ workspace instead of re-fetching this
│ screen — § Interactions, Flow US-2)
└── InvestigationWorkspaceScreen (routes: /departments/problem-department/
 │ investigations/:investigationId AND
 │.../versions/:versionNumber —
 │ same component for both, §5.1)
 ├── InvestigationIdentityHeader (region 1
 │ "Version N of M" / "(current)" / (when
 │ viewing a prior version whose own
 │ isSuperseded is true) a forward link to
 │ THIS version's own immediate successor via
 │ forwardSupersededByVersionNumber, once ≥1
 │ BriefVersion exists — no separate
 │ "jump to current" affordance exists;
 │ also renders the compact non-valid/
 │ supersession notice — displayed version's
 │ assignedState (only when non-'valid') and
 │ isSuperseded link, positioned here rather
 │ than in DecisionHistoryBanner so it is
 │ never buried below the fold, binding;
 │ also renders the BACKWARD supersession
 │ link from this version's own
 │ supersedesVersionId, § Sections)
 │ └── SourcesList (real, always-rendered-when-
 │ sources.length > 0 subcomponent — one row
 │ per workspace.sources entry, rendering that
 │ source's type, resolved label, and its own
 │ persisted resolutionStatus
 │ ('content-retrieved' / 'reachable-no-content'
 │ / 'unreachable'), plus failureReason/
 │ noContentReason when populated; the concrete
 │ per-source-detail surface this checkpoint
 │ adds, distinct from the Checkpoint-1
 │ aggregate-count-only surface, § Checkpoint-1
 │ surface capability boundary, top of this
 │ document)
 ├── OutcomeStatusPanel (region 2 — exactly one variant renders,
 │ │ selected by the fixed-precedence rule
 │ │ (§5.4, § Sections): run-outcome/liveness
 │ │ before investigation.status —
 │ │ current-version-only content. §5.4 rule 0,
 │ │ evaluated FIRST before every other rule
 │ │ including rule 2's ViewingPriorVersionPanel:
 │ │ a routed `:versionNumber` that does not
 │ │ resolve to any `BriefVersion` under this
 │ │ Investigation's lineage renders a plain
 │ │ "Version N does not exist" message directly
 │ │ in `InvestigationWorkspaceScreen.tsx` — NOT a
 │ │ dedicated OutcomeStatusPanel variant/component;
 │ │ region 2 carries no other
 │ │ status-derived content, no AddSourceInline, no
 │ │ GenerateButton in this case, § Sections)
 │ ├── OpenEligiblePanel
 │ │ └── GenerateButton (label "Start generation"; enabled iff
 │ │ workspace.generationEligible === true —
 │ │ same component/flag as below)
 │ ├── GenerationProgressPanel (in-progress — honest steps + fixed
 │ │ gap sentence when livenessState ===
 │ │ 'active'; a distinct
 │ │ stale/interrupted disclosure when
 │ │ livenessState === 'stale-or-interrupted',
 │ │ no percent/thinking claims either way;
 │ │ renders per-step validationRecords/
 │ │ toolInvocations and per-run
 │ │ webSearchQueries, real field names, not a
 │ │ paraphrase; (§1.6): "Refresh status" AND
 │ │ "Abandon and retry" controls when
 │ │ livenessState === 'stale-or-interrupted')
 │ │ (current-version-display only, §5.4 rule 1
 │ │ — never rendered while viewing a prior
 │ │ version; see ViewingPriorVersionPanel's
 │ │ notice below for that case)
 │ ├── BlockedSourcesPanel
 │ │ └── AddSourceInline (its OWN component, calling
 │ │ addSourcesToInvestigation → the
 │ │ existing, extended POST
 │ │ /api/investigations route with
 │ │ investigationId in the body — NOT a new
 │ │ :id/sources route, and NOT a reuse of
 │ │ StartInvestigationForm)
 │ ├── GenerationFailedPanel
 │ │ ├── GenerateButton (label "Retry generation"; enabled iff
 │ │ │ workspace.generationEligible === true —
 │ │ │ same component/flag as above, no separate
 │ │ │ status-based gating logic)
 │ │ └── AddSourceInline
 │ ├── BriefGeneratedSummaryPanel (status === 'brief-generated' AND
 │ │ currently-displayed version isCurrent;
 │ │ compact confirmation + anchor-scroll link
 │ │ to BriefReviewPanel below — hosts the
 │ │ evidence-driven correction trigger; no
 │ │ unconditional generation control renders
 │ │ here)
 │ │ ├── AddSourceInline (US-13; the same real
 │ │ │ component/route as BlockedSourcesPanel's
 │ │ │ instance — the only action that can
 │ │ │ flip newEvidenceSinceCurrentBriefVersion,
 │ │ │ via a real re-fetch, never an optimistic
 │ │ │ assumption; this request never changes
 │ │ │ investigation.status away from
 │ │ │ 'brief-generated')
 │ │ └── GenerateButton (label "Regenerate with new evidence";
 │ │ enabled iff workspace.generationEligible
 │ │ === true, which for this panel requires
 │ │ workspace.newEvidenceSinceCurrentBriefVersion
 │ │ === true — same component as the two
 │ │ instances above, third label variant,
 │ │ never a distinct unconditional control)
 │ └── ViewingPriorVersionPanel (variant, §5.4 rule 2 — an
 │ OutcomeStatusPanel variant/child, matching
 │ the other four variants' nesting (not a
 │ sibling of OutcomeStatusPanel itself);
 │ renders whenever the displayed
 │ BriefVersion.isCurrent === false —
 │ regardless of investigation.status or
 │ latestGenerationRun?.outcome, including
 │ 'failed' AND 'in-progress' — an
 │ in-progress/stale current-version run
 │ resolves here, not to
 │ GenerationProgressPanel, while a prior
 │ version is displayed) — evaluated
 │ immediately after GenerationProgressPanel
 │ (§5.4 rule 1, mutually exclusive on
 │ isCurrent), so this rule wins over
 │ GenerationFailedPanel and the
 │ Brief-Generated summary panel (rules 3, 4);
 │ read-only statement +
 │ link forward to immediate successor; when the
 │ current version has an in-progress/stale run,
 │ also a read-only notice + link to the current
 │ version's workspace; no AddSourceInline, no
 │ GenerateButton, no Abandon and retry)
 ├── BriefReviewPanel (region 3 — present iff workspace.briefs
 │ │ has an entry matching the routed/current
 │ │ version; no generation-trigger control
 │ │ anywhere in this panel)
 │ ├── ProblemDefinitionSection (never negatable)
 │ ├── ClaimsAndEvidenceSection (contradicting evidence inline;
 │ │ NegativeFindingNotice when applicable)
 │ ├── DemandEvidenceSection (Insufficient/Emerging/Substantiated;
 │ │ NegativeFindingNotice when applicable)
 │ ├── PersonalPullSection (structurally separate from Demand)
 │ ├── ExistingSolutionLandscapeSection (NegativeFindingNotice when applicable)
 │ ├── GapHypothesisSection (NegativeFindingNotice when applicable)
 │ ├── UncertaintySection (never collapsed by default)
 │ └── SystemRecommendationSection (rationale included)
 ├── ProvenanceRail (region 4 — present iff ≥1 GenerationRun;
 │ │ contains both version-scoped and
 │ │ version-independent content, see children)
 │ ├── EvidenceProvenanceList (excerpt/label/source/stance/relevance,
 │ │ per resolvedEvidence entry — VERSION-SCOPED:
 │ │ refetched from GetBriefForReviewResult and
 │ │ changes when the operator navigates to a
 │ │ different Brief version, Flow US-1 AC5)
 │ ├── SearchScopeNotice (reads real
 │ │ webSearchQueries[].scopeNote/limitations —
 │ │ VERSION-INDEPENDENT, from
 │ │ workspace.generationRuns, unchanged across
 │ │ version navigation)
 │ ├── CitationScopeNotice (fixed, always visible —
 │ │ VERSION-INDEPENDENT)
 │ ├── RunHistoryList (every GenerationRun, all steps —
 │ │ not only the latest run; renders each
 │ │ step's validationRecords/toolInvocations
 │ │ and each run's webSearchQueries, real
 │ │ field names — VERSION-INDEPENDENT: whole-
 │ │ Investigation run history, unchanged across
 │ │ version navigation)
 │ └── TechnicalDisclosurePanel (collapsed by default — the ONE panel
 │ in this hierarchy allowed to start
 │ collapsed; raw validation/schema detail —
 │ VERSION-INDEPENDENT)
 └── DecisionSection (region 5 — present iff ≥1 BriefVersion;
 │ controls act on the version displayed,
 │ current or prior)
 ├── DecisionForm (Approve/Reject/Watch; "Your decision"
 │ copy; Watch gated on ≥1 named condition;
 │ posts to the displayed version's own
 │ briefVersionId, current or prior alike; on a
 │ successful 201, triggers exactly two
 │ refetches — GET.../workspace for
 │ decisionLineage and
 │ GET.../brief-versions/by-version/:versionNumber
 │ for the displayed version's priorDecisions —
 │ never constructing either list from the 201
 │ response body itself, § Interactions "Record
 │ Decision")
 ├── DecisionConfirmationPanel (in-place, same URL; renders once
 │ both of DecisionForm's post-submission
 │ refetches above resolve)
 └── DecisionHistoryBanner (renders TWO
 requirements-distinct lists: (1)
 priorDecisions, scoped to the displayed
 version only; (2) decisionLineage, the
 whole-Investigation chronological view,
 each entry labeled by its own
 versionNumber — never merged; no control
 of any kind that writes a StatusEvent.
 The compact non-'valid' assignedState
 statement and the isSuperseded link are
 positioned in InvestigationIdentityHeader
 (region 1, above) — NOT rendered a second
 time here.)
```

`AddSourceInline` is a real, standalone component
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
the next real `GET.../workspace` re-fetch. Every mount point's post-submission re-fetch also
refreshes `SourcesList`'s per-source `resolutionStatus` rendering in region 1, since `workspace.sources`
is part of the same `GET.../workspace` payload.

No component in this hierarchy is a client-side re-derivation of `generationEligible`,
`isCurrent`, `assignedState`, `isSuperseded`, `livenessState`, `resolutionStatus`, or
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
| `InvestigationWorkspaceView` (identity, sources including per-source `resolutionStatus`/`failureReason`/`noContentReason`, all `generationRuns` including per-run `livenessState`/`webSearchQueries` and per-step `validationRecords`/`toolInvocations`, `briefs` including `assignedState`/`isSuperseded` per version, `decisionLineage`, `generationEligible`, `newEvidenceSinceCurrentBriefVersion`) | `InvestigationWorkspaceScreen` and every child region, including `SourcesList`, `DecisionHistoryBanner`, and the Brief-Generated summary panel's `AddSourceInline`/`GenerateButton` pair | `GET.../workspace` on mount, then on each poll tick (at the engineering-derived `POLL_INTERVAL_MS` interval, `02-ARCHITECTURE.md` §4.9/§5.2 — not asserted here as a specific value) while `latestGenerationRun?.livenessState === 'active'`, then on any local action that changes server state (add source, trigger generation, record decision — record decision refetches this endpoint specifically for its updated `decisionLineage`, § Interactions "Record Decision") |
| `GetBriefForReviewResult` (seven elements, evidence — version-SCOPED — negative findings, notices, `priorDecisions`, `assignedState`, `isSuperseded`, `version`) for the routed/current version | `BriefReviewPanel`, `ProvenanceRail`'s `EvidenceProvenanceList` (version-scoped only — `SearchScopeNotice`/`CitationScopeNotice`/`RunHistoryList` are version-independent, sourced from `workspace.generationRuns` instead), `InvestigationIdentityHeader`'s "Version N of M" indicator, `DecisionHistoryBanner`'s per-version list | `GET.../brief-versions/by-version/:versionNumber`, fetched once per displayed version (current when no `:versionNumber` route param is present, the routed value otherwise) — not re-fetched on every poll tick, re-fetched on version navigation (Flow US-1 AC5) and after a successful Decision submission (§ Interactions "Record Decision") |
| routed `:versionNumber` (URL param, not component state) | `InvestigationWorkspaceScreen` (`useParams`) | the browser URL itself — reload-stable, never derived from in-memory navigation history |
| `notFound` / `error` (investigation-level or version-level) | `InvestigationWorkspaceScreen` | the initial `GET.../workspace` fetch's outcome, or the version-specific `brief-version-not-found` outcome |
| polling interval liveness (`'active'` vs. `'stale-or-interrupted'` vs. `'terminal'`) | `GenerationProgressPanel` (rendering), `InvestigationWorkspaceScreen` (interval lifecycle) | `workspace.latestGenerationRun?.livenessState`, via a `useEffect` keyed on that value — clears on transition to `'terminal'` OR `'stale-or-interrupted'` |
| `decisionSubmission` (pending/error/confirmedDecisionId) | `DecisionForm` / `DecisionConfirmationPanel` only | its own submit handler, including the pending state spanning both of its post-`201` refetches (§ Interactions "Record Decision"); cleared on next submission attempt |
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
 for them. US-1 AC5 is covered by its own dedicated flow. US-12 is covered by Flow
 US-12; US-13 is covered by Flow US-13.
- Every flow has a screen: yes — all flows resolve to the single Investigation Workspace screen (at
 either of its two routes) or the two unchanged Checkpoint-1 screens for the flows' starting points.
- Every screen has a layout: yes — one layout diagram covering all `investigation.status` values and
 both routes, per the binding "one persistent workspace URL" direction, extended by this
 checkpoint's second, version-scoped URL rendering the same layout.
- Interactions cover success, loading, and error states: yes (Honest In-Progress Rendering
 including the stale/interrupted branch, Trigger Generation, Add Source (Blocked Recovery, Failed
 Retry, and Brief-Generated Resubmission), Add Evidence and Corrective Generation, Navigate to a
 Specific Brief Version, Decision History Banner, Record Decision, Open Investigation Workspace).
- Component hierarchy matches architecture components: yes — every component `02-ARCHITECTURE.md`
 §2/§5.3 names (`InvestigationIdentityHeader`, `AddSourceInline`, `GenerationProgressPanel`,
 `BlockedSourcesPanel`, `BriefReviewPanel`, `DecisionForm`/`DecisionConfirmationPanel`,
 `DecisionHistoryBanner`, `GenerateButton`) appears in the hierarchy above, plus purely
 presentational subdivisions (the seven Brief-element sections, the outcome-panel variants,
 `SourcesList`) that
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
 decisions remain reachable at their own versioned URL, and `InvestigationIdentityHeader`'s
 backward supersession link is the named, navigable mechanism by
 which the workspace surfaces that relationship (§ Flow US-12, § Flow US-1 AC5, § Sections).
- Required-uncollapsed guarantee: Problem Definition, Claims and Evidence (contradicting evidence
 inline), Demand Evidence, Existing-Solution Landscape, Gap Hypothesis, Uncertainty, System
 Recommendation, Personal Pull (separate), every Research/Provenance Rail subsection except
 `TechnicalDisclosurePanel`, and `DecisionHistoryBanner`'s two decision lists plus
 `InvestigationIdentityHeader`'s non-`'valid'`/`isSuperseded`/backward-supersession statements
 (when present) are uncollapsed by default everywhere they
 are specified above — no section in the Layout Structure or Sections tables carries a
 default-collapsed treatment other than that one named exception.
- Numeric-value guarantee: no field labeled "Demand" anywhere in this document renders a number —
 every Demand Evidence reference in Sections/Component Hierarchy specifies
 Insufficient/Emerging/Substantiated.
- Identity guarantee: every reference to Investigation/Brief/GenerationRun/StatusEvent identity in
 this document specifies a human-readable label as primary, with a shortened id (if shown at all)
 explicitly named as secondary/labeled — checked against every row in the Sections and Interactions
 tables, including the new `InvestigationIdentityHeader` copy (plain-language `assignedState`/
 `isSuperseded` statements, never a raw enum literal or UUID as primary content), the per-source
 `SourcesList` (human-readable `resolutionStatus` copy, type, and label, never a raw enum literal as
 primary content), and the new
 version-navigation links.
- Engineering-owned constants guarantee: `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` are referenced
 throughout this document only via their engineering-derivation framing (`02-ARCHITECTURE.md`
 §4.9/§5.2 — measured pipeline timing, safety margin, concurrency, endpoint cost) — no location in
 this document asserts or implies a specific numeric value for either constant, and neither is
 framed as a Danny-owned PROVISIONAL value pending his sign-off.
- Each of the following has a stated UI mechanism in this document, not a prose assurance:
  - § Sections (Research/Provenance Rail, In-Progress panel), § Interactions (Honest In-Progress Rendering), § Component Hierarchy (`ProvenanceRail`) all now name `validationRecords`/`toolInvocations`/`webSearchQueries` as the real rendered field shapes, and now explicitly split which of `ProvenanceRail`'s children are version-scoped (`EvidenceProvenanceList`) versus version-independent (`SearchScopeNotice`, `CitationScopeNotice`, `RunHistoryList`).
  - new Flow "US-1 AC5", new Interaction "Navigate to a Specific Brief Version", the second route in § Screens/§ Component Hierarchy, and `InvestigationIdentityHeader`'s forward/backward supersession links now addressed by human-readable `versionNumber`.
  - § Interactions "Add Source (Blocked Recovery, Failed Retry, and Brief-Generated Resubmission)" and
 § Component Hierarchy state explicitly `AddSourceInline` is its own component calling the existing, extended `POST /api/investigations` route (`investigationId` in the request body — not a new `:id/sources` route) and rendering the real persisted `CreateInvestigationResponseBody`, never a `StartInvestigationForm` reuse or an assumed optimistic state, and never implying a `'brief-generated'` Investigation's status silently changes — only `newEvidenceSinceCurrentBriefVersion` does; its post-submission re-fetch also refreshes `SourcesList`'s per-source `resolutionStatus`.
  - § Flow US-10, § Sections, § Interactions "Decision History Banner" and "Record Decision", and § Component Hierarchy all render `priorDecisions` (per-version) and `decisionLineage` (whole-Investigation) as two separate, labeled lists, with every reconsideration condition rendered as resolved text, and all now state the explicit two-refetch mechanism (`GET.../workspace` for `decisionLineage`, `GET.../brief-versions/by-version/:versionNumber` for `priorDecisions`) a successful Decision submission triggers — never a client-side construction from the submission's own response, never a full page reload.
  - new "Stale/Interrupted" Outcome/Status Panel variant, § Interactions' revised polling behavior keyed on `livenessState`, honest informational-only copy plus the real "Refresh status" and "Abandon and retry" controls (`02-ARCHITECTURE.md` §1.6).
  - the binding header note (top of this document) states the determined resolution (decision controls available on the displayed version, current or prior, per `02-ARCHITECTURE.md` §5.2's explicit "prior or current alike"), and every region now discloses which version is on screen via `InvestigationIdentityHeader`'s "Version N of M" indicator.
  - the new "Checkpoint-1 surface capability boundary" note (top of this document) and `InvestigationIdentityHeader`'s `SourcesList` subcomponent (§ Sections, § Component Hierarchy) together state where a submitted source's per-source `resolutionStatus` is actually rendered in the browser — the Investigation Workspace screen, not the Checkpoint-1 surface — resolving the sequencing question of which slice's browser demonstration can show it.
