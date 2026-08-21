# Requirements: Product Surface — Checkpoint 1

**Status**: REVISED — human product-gate FAIL on Slice 1's browser demonstration (Danny,
2026-08-20). This document is corrected to match `02-ARCHITECTURE.md` §0a's binding ruling and
net architectural effect. See that section for Danny's verbatim ruling. US-2 (Departments
directory navigation) is RETIRED for this checkpoint — see its entry below.

## Summary

Give Department OS's existing Problem Department backend (Slices 1-9, unchanged) a real browser
surface: a Mission Control home screen showing Problem Department's live state, and a live Problem
Department Investigation portfolio — replacing the current situation where the only access path is
`GET /investigations/:id` for one Investigation ID at a time. This checkpoint is additive read
models plus a new React/Express UI shell only; no schema, service, or business-logic change.
Traces to `DESIGN-PROPOSAL.md` §1-§4a/§7/§8 (subset), as narrowed by `02-ARCHITECTURE.md` §0a's
product-gate correction.

## User Stories

**US-1 — Mission Control home screen**
As Danny (the operator),
I want to load `/` and see a real Mission Control screen showing Problem Department's live,
current state — not an installed/planned catalog of all four Departments,
so that the home screen reflects what I can actually do right now, and Problem Department is
unmistakably the actionable thing on the page rather than being crowded out by configuration
information about modules that don't exist yet.

**US-2 — Departments directory navigation — RETIRED this checkpoint**
Retired by Danny's product-gate ruling (`02-ARCHITECTURE.md` §0a): the `/departments` catalog
screen — listing all four Departments with installed/planned status — was found to be
configuration/catalog information dominating a page that should show current operating
information. It is removed from this checkpoint's scope entirely, not redirected or stubbed.
Deferred capability: "a future Departments view may switch among enabled Departments," and
"installing or unlocking modules belongs under Settings / Add Department" — both explicitly out
of this checkpoint per Danny's ruling. No route, service, or screen for this story exists this
checkpoint; every AC and edge case that depended on it has been removed or rewritten below (see
US-1, US-7, Edge Cases, Out of Scope).

**US-3 — Problem Department overview / Investigation portfolio**
As Danny,
I want to click into Problem Department and see every Investigation row (all `InvestigationStatus`
values) pulled live from the database, along with Department-level Sources/Evidence counts and
Runs/Activity,
so that I have one durable, directory-framed place to see the state of Problem Department's work,
instead of guessing Investigation IDs one at a time.

**US-4 — Last-recorded-activity ordering**
As Danny,
I want the Investigation portfolio and Mission Control's "recent" lists ordered by real last
recorded activity (not a nonexistent `updatedAt` field),
so that the most relevant Investigation surfaces first, computed only from timestamps that actually
exist in the database.

**US-5 — Start Investigation from the new surface**
As Danny,
I want a "Start Investigation" entry point on the Problem Department overview that uses the
existing source-submission flow,
so that I can begin a new Investigation from the new UI without any change to how submission
actually works.

**US-6 — Active-work grouping on Mission Control**
As Danny,
I want Mission Control's "Active work" section split into four explicit, independently-sourced
groups — Active, Ready/Not Started, Needs Attention, Recent/Completed,
so that "actively generating right now" is never confused with "merely open with no run ever
started" or "blocked with no run happening." (Danny's correction: a zero-run, `status='open'`
Investigation is genuinely never-started, not "Active" — folding it into Active recreates the exact
confusion this story was intended to eliminate. It gets its own group instead.)

**US-7 — Persistent cross-screen navigation**
As Danny,
I want a persistent nav mounted once and visible on both Checkpoint-1 screens, linking to Mission
Control and Problem Department directly,
so that I can move between Mission Control and the Problem Department overview without a full page
reload, without the app fabricating links to a Departments-management surface that doesn't belong
on the live product yet.

## Acceptance Criteria

**US-1 (Mission Control)**
- [ ] Given the dev server is running, when `/` is loaded, then the page renders exactly one
  Department presence — a `ProblemDepartmentCard` for Problem Department — and no tiles, rows, or
  cards for Signal Foundry, Prototype Department, or Creative Practice Engine anywhere on the page.
- [ ] Given `/` is loaded, then no "planned Departments" note, footer, or any other reference to
  planned/uninstalled Departments is rendered anywhere on the screen.
- [ ] Given `/` is loaded, then the `ProblemDepartmentCard` renders no `installed`/`planned` label
  or badge of any kind — installation status is not exposed on Mission Control (Danny's ruling item
  1).
- [ ] Given `/` is loaded, then the `ProblemDepartmentCard` shows four live counts —
  `investigationCount`, `activeCount`, `needsAttentionCount`, `recentCompletedCount` — each sourced
  from a real query or the `.length` of an already-assembled `activeWork` array; none is a
  fabricated or hardcoded value (Danny's ruling item 3).
- [ ] Given the `ProblemDepartmentCard` is rendered, then the entire card is a clickable navigation
  target to `/departments/problem-department`, AND the card additionally contains a separately
  visible, explicit "Open Problem Department →" affordance — both must be present; the explicit
  affordance is not satisfied merely by the whole card being clickable (Danny's ruling item 2).
- [ ] Given a click on the `ProblemDepartmentCard` (anywhere on the card) or on its "Open Problem
  Department →" affordance, when navigation completes, then the URL is
  `/departments/problem-department` and a real, fully-built Problem Department overview screen
  (US-3) renders — never an inline "not built" stub (Danny's ruling item 2).
- [ ] Given `/` is loaded, then the "Active orchestrations / agent activity" panel renders using
  only `GenerationRun`-level data (no per-component detail) — no live per-component activity is
  fabricated or displayed this checkpoint.
- [ ] Given `/` is loaded, then a recency-ordered list of recent Investigations/Briefs/evidence is
  shown, drawn only from existing `Investigation`/`BriefVersion`/`SourceArtifact`/`EvidenceItem`
  rows (no new persistence).
- [ ] Given the response payload for `GET /api/mission-control`, then every field maps to
  `MissionControlView` per `02-ARCHITECTURE.md` §3, with `problemDepartment` carrying the four live
  counts above and no `departments` catalog array or installed/planned field anywhere in the
  payload, `activeActivity` containing no live-component-level field, and `activeWork` containing
  the four groups defined in US-6 (`active`, `readyNotStarted`, `needsAttention`,
  `recentCompleted`).

**US-2 (Departments directory) — RETIRED, no ACs this checkpoint**
This story and every acceptance criterion it previously carried are retired per
`02-ARCHITECTURE.md` §0a (see US-2's entry above). No `/departments` route, screen, or API exists
this checkpoint to test against.

**US-3 (Problem Department overview)**
- [ ] Given `/departments/problem-department` is loaded, then the Department header shows name,
  one-line thesis, and `installed` badge.
- [ ] Given the Investigation portfolio is rendered, then it contains every `Investigation` row for
  the Department, each showing `status`, `createdAt`, and `statusReason` when present — row-for-row
  matching `SELECT id, status, created_at FROM investigation` for the live local dev database
  exactly (no extra or missing rows).
- [ ] Given the portfolio, then it is filterable/sortable by `status` only — no invented metric is
  introduced.
- [ ] Given the overview screen, then Department-level Sources and Evidence counts are real
  `COUNT(*)` results over `source_artifact`/`evidence_item` scoped to this Department's
  Investigations.
- [ ] Given the overview screen, then Department-level Runs/Activity shows recent `GenerationRun`s
  and a live-activity feed scoped to this Department, using only `GenerationRun`-level data (same
  no-per-component-detail caveat as Mission Control).
- [ ] Given zero Investigations exist for the Department, then an explicit empty state renders
  ("No investigations yet — Start Investigation"), never a blank or loading-styled screen.
- [ ] Given the response payload for `GET /api/problem-department`, then every field maps to
  `ProblemDepartmentOverview` per `02-ARCHITECTURE.md` §3.
- [ ] Given `/departments/problem-department` is reached via a direct URL entry (not only via the
  Mission Control link), then it renders identically to reaching it via the
  `ProblemDepartmentCard` — it is a real, standalone, directly-addressable screen, not a view that
  only functions as a Mission Control sub-state.

**US-4 (Last recorded activity)**
- [ ] Given an Investigation with persisted `GenerationRun`/`GenerationStep`/`BriefVersion` rows,
  when "last recorded activity" is computed, then it equals the `GREATEST` of
  `investigation.created_at`, `MAX(generation_run.started_at)`, `MAX(generation_run.completed_at)`,
  `MAX(generation_step.completed_at)`, and `MAX(brief_version.created_at)` per `DESIGN-PROPOSAL.md`
  §4a — excluding `generation_component_event.occurred_at`, which is Checkpoint 3 scope and does
  not exist as a table this checkpoint.
- [ ] Given multiple Investigations, when the portfolio's "last-active Investigation" is computed,
  then it is the single row with the maximum `last_activity_at` from the above computation, and the
  UI links it via a real, full-page navigation to the EXISTING legacy Express route
  `GET /investigations/:id`, labeled explicitly as "the current view" (or equivalent honest
  wording) — not a purpose-built placeholder screen. The real Investigation Workspace (Screen D) is
  still not built this checkpoint; this link reuses already-working, already-shipped legacy product
  behavior in the interim, per Danny's correction.
- [ ] Given Mission Control's "recent Investigations" list, then it is ordered by the same
  `last_activity_at` computation, not a separate/divergent recency definition.

**US-5 (Start Investigation)**
- [ ] Given the "Start Investigation" entry point is used, when sources are submitted, then the
  existing `submitSources` service is invoked with no change to its signature or logic (via
  `POST /investigations` or its JSON-equivalent wrapper, unchanged business logic).
- [ ] Given a successful submission, then the newly created Investigation appears in the portfolio
  on next load/refresh, sourced from the same live query as every other row.

**US-6 (Active-work grouping)**
- [ ] Given an Investigation with an in-progress `GenerationRun`, then it appears in the "Active"
  group and is excluded from "Ready/Not Started," "Needs Attention," and "Recent/Completed."
- [ ] Given a newly-submitted Investigation with `status = 'open'` and zero `GenerationRun` rows at
  all, then it appears in the "Ready/Not Started" group and is excluded from "Active," "Needs
  Attention," and "Recent/Completed" — never omitted from all four groups. (Danny's correction: this
  case previously, incorrectly, appeared in "Active" — it does not have a real `GenerationRun` in
  progress, so it must not count as Active. Recreating that confusion is exactly what this story
  exists to prevent.)
- [ ] Given an Investigation with `status` in (`blocked`, `generation-failed`) and no in-progress
  run, then it appears in "Needs Attention."
- [ ] Given an Investigation with `status = 'brief-generated'` or a `GenerationRun` whose `outcome`
  is not `in-progress`, then it appears in "Recent/Completed," ordered by recency, deduplicated to
  one row per Investigation.
- [ ] Given the "Active" group specifically, then membership requires a real, currently in-progress
  `GenerationRun` row for that Investigation — `status = 'open'` alone, with no `GenerationRun` row
  at all, is never sufficient to appear in "Active" (it belongs in "Ready/Not Started" instead).
- [ ] Given the four groups' backing queries, then each is `InvestigationSummary[]`-shaped per
  `DESIGN-PROPOSAL.md` §8 (Checkpoint-1 narrowing per `02-ARCHITECTURE.md` §3), run independently
  (not filtered from one combined result set).
- [ ] Given every Investigation in the database at any point in time, then it appears in exactly one
  of the four `activeWork` groups (Active, Ready/Not Started, Needs Attention, Recent/Completed) —
  the four groups are mutually exclusive and, together, exhaustive over every `InvestigationStatus`
  value and every `GenerationRun` state.
- [ ] Given a `generation-failed` Investigation whose `generation_run` row has `outcome = 'failed'`
  (the normal, non-exceptional state of every real failed investigation, per
  `src/types/domain.ts:370`'s `GenerationRun.outcome` enum and
  `src/services/generateBriefVersion.test.ts`'s failure-path tests, which show a `generation_run`
  row is created with `outcome: 'in-progress'` then updated to `outcome: 'failed'` in the same
  transaction that sets `Investigation.status = 'generation-failed'`), then it appears in "Needs
  Attention" ONLY, never in "Recent/Completed" — the presence of a non-in-progress (i.e. `failed`)
  `GenerationRun` row does not pull it into "Recent/Completed," even though "Recent/Completed"
  would otherwise match on "has a `GenerationRun` whose `outcome` is not `in-progress`." "Needs
  Attention" has undisputed precedence for both `blocked` and `generation-failed` statuses,
  independent of what `GenerationRun` rows exist for that Investigation.

**US-7 (Persistent cross-screen navigation)**
- [ ] Given either of the two Checkpoint-1 screens (`/`, `/departments/problem-department`) is
  loaded, then the persistent nav (`PersistentNav`) is visible and rendered from a single mount
  point that persists across route changes (not re-mounted per screen).
- [ ] Given the persistent nav is rendered, then it shows exactly two links this checkpoint —
  "Mission Control" (→ `/`) and "Problem Department" (→ `/departments/problem-department`) — and no
  others; it never shows a "Departments" link, and it is never usable as an
  installation-management or module-catalog destination (Danny's ruling item 4).
- [ ] Given a click on either nav link, when navigation completes, then the URL changes to the
  link's target and the screen updates via client-side routing, with no full page reload.
- [ ] Given the persistent nav is rendered, then it contains no link to `/departments` (the
  catalog route, retired per US-2), `/activity`, `/knowledge`, or any other route not built this
  checkpoint.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Problem Department has zero Investigations | Explicit empty state ("No investigations yet — Start Investigation"), never blank/loading-styled. |
| Investigation has no `GenerationRun`, `GenerationStep`, or `BriefVersion` rows at all | `last_activity_at` equals `investigation.created_at` (every `COALESCE` falls back to it). |
| Investigation has `statusReason` unset | Portfolio row renders without a `statusReason` field/value — never a placeholder string. |
| Investigation has `status = 'open'` and zero `GenerationRun` rows at all | Appears in the "Ready/Not Started" group, never "Active" — "Active" requires a real in-progress `GenerationRun` (Danny's correction, US-6). |
| Investigation has `status = 'generation-failed'` and a `GenerationRun` row with `outcome = 'failed'` (the normal state of every real failed investigation, not a hypothetical) | Appears in "Needs Attention" ONLY, never "Recent/Completed" — "Needs Attention" takes precedence over "Recent/Completed" for `blocked`/`generation-failed` statuses regardless of `GenerationRun` state (US-6, mutual-exclusivity AC). |
| Two Investigations tie exactly on `last_activity_at` | Any stable, deterministic ordering between them is acceptable — no requirement on tie-break order beyond determinism (not specified further upstream; not a scope gap, since no tie-break rule is specified anywhere in this checkpoint's design). |
| `GET /api/mission-control` or `GET /api/problem-department` is called when the dev database has no `investigation` rows anywhere | Each read model still returns its full documented shape with empty arrays/zero counts (`ProblemDepartmentCard`'s four counts all render `0`) — never a 500 or omitted field. |
| A URL for a Department other than Problem Department, or for `/departments`, is requested directly | Out of scope this checkpoint — no route is defined for either; `/departments` is retired (US-2) and no other Department has any overview route this checkpoint (`02-ARCHITECTURE.md` §0a/§1). |
| The "last-active Investigation" link on the Problem Department overview is clicked | Full-page navigation to the existing, already-implemented legacy Express route `GET /investigations/:id`, labeled as "the current view" — not a client-side route, not a placeholder screen (Danny's correction, US-4). |
| The `ProblemDepartmentCard`'s whole-card click target and its "Open Problem Department →" affordance overlap in the DOM (e.g. the affordance sits inside the card's link wrapper) | Both must independently satisfy "navigates to `/departments/problem-department`" — nested/overlapping interactive elements are an implementation detail for `03-UI-SPEC.md`, not a reason to drop the explicit affordance (Danny's ruling item 2, US-1). |

## Out of Scope

- NOT: `POST /api/investigations/:id/generation-runs` or any browser-triggered generation
  (Checkpoint 2/3).
- NOT: `generation_component_event` table, `component_execution_id`, `recordComponentEvent`, or any
  live per-component activity display (Checkpoint 3) — no lifecycle migration is written this
  checkpoint.
- NOT: the real Investigation Workspace (Screen D), a client-side placeholder component for it, any
  `/departments/problem-department/investigations/*` client-side route, `BriefForReview` read model,
  or workflow-stage derivation (§5a) — Checkpoint 1 stops at the Department overview / portfolio
  list. In the interim, the "last-active Investigation" link goes to the real, already-shipped
  legacy `GET /investigations/:id` Express route (US-4) — that is reused existing product behavior,
  not new scope, and is explicitly IN scope as a link target even though the Workspace itself is
  not built.
- NOT: a "Departments directory" screen, route, or API in any form — `/departments`,
  `GET /api/departments`, `getDepartmentsView`, `DepartmentsScreen`, `DepartmentsView`, all
  Departments-catalog display of installed/planned status anywhere in this checkpoint's UI
  (retired per Danny's product-gate ruling, `02-ARCHITECTURE.md` §0a — see US-2). Deferred: "a
  future Departments view may switch among enabled Departments" is a different, not-yet-designed
  capability, not this retired story.
- NOT: any Settings / Add Department / module-installation or module-unlocking surface — Danny's
  ruling places this outside this checkpoint explicitly (ruling item 4).
- NOT: `/evidence`, `/runs`, `/knowledge` Core-wide routes (§8a) — reserved/designed, not built.
- NOT: any change to Slices 1-9 backend services, schema, or business logic — this checkpoint is
  additive read models and a new UI shell only.
- NOT: retirement of `src/web/views.ts`'s server-rendered screens — they remain running, untouched,
  and are the same routes the "last-active Investigation" link now targets (US-4).
- NOT: any new auth, CORS, or error-handling posture change to the existing Express app — the new
  routes inherit the existing no-auth, same-origin posture.
- NOT: an e2e test framework — React components get render/basic-interaction tests only this
  checkpoint.
- NOT: nav links to `/departments`, `/activity`, or `/knowledge`, or any Core-wide route beyond `/`
  and `/departments/problem-department` — the persistent nav ships with exactly two links this
  checkpoint: "Mission Control" and "Problem Department."
- NOT: building the planned-module catalog, or any equivalent of it, as this checkpoint's next
  browser-visible slice — the next real browser-visible result after Mission Control's correction
  is the Problem Department overview itself, reachable directly from Mission Control (Danny's
  ruling item 5; sequencing itself is `04-ROADMAP.md`'s concern, restated here only as a scope
  boundary).
- Deferred: `RUNTIME_IDENTIFIER`-style config conventions extending to new config — this checkpoint
  introduces no new runtime/env config.
- Deferred: `Department` config's long-term home (static list vs. persisted) — remains an open
  question noted in `DESIGN-PROPOSAL.md` §7/§15, not resolved by this checkpoint.

## Constraints

- Must: every displayed field trace to an existing persisted column or an additive read-only query
  over existing tables (`DESIGN-PROPOSAL.md` §7, North Star Success Criteria).
- Must: Investigation portfolio row-for-row matches `SELECT id, status, created_at FROM
  investigation` against the live local dev database exactly — no extra or missing rows
  (row-for-row fidelity is this checkpoint's core demonstration criterion).
- Must: the two read models this checkpoint needs (`GET /api/mission-control`,
  `GET /api/problem-department`) conform to `MissionControlView` and `ProblemDepartmentOverview`
  respectively per `02-ARCHITECTURE.md` §3, minus the live-component slice of
  `activeActivity`/Runs-Activity (GenerationRun-level only), with `MissionControlView.problemDepartment`
  carrying the four live counts defined in US-1 (no `departments` catalog array, no
  installed/planned field), and with `MissionControlView.activeWork` carrying the four
  Checkpoint-1 groups defined in US-6 (`active`, `readyNotStarted`, `needsAttention`,
  `recentCompleted`).
- Must not: fabricate any of `MissionControlView.problemDepartment`'s four live counts
  (`investigationCount`, `activeCount`, `needsAttentionCount`, `recentCompletedCount`) — each must
  be a real `COUNT(*)` or the `.length` of an array already assembled for `activeWork`, never a
  hardcoded or placeholder number (Danny's ruling item 3, US-1).
- Must not: expose an `installed`/`planned` label, badge, or equivalent status field anywhere on
  Mission Control (Danny's ruling item 1, US-1).
- Must: "Active" membership in `activeWork` requires a real, currently in-progress `GenerationRun`
  row — a `status='open'` Investigation with zero `GenerationRun` rows belongs in the separate
  "Ready/Not Started" group, never in "Active" (Danny's correction, US-6).
- Must: "last recorded activity" computed via the exact `GREATEST` formula in `DESIGN-PROPOSAL.md`
  §4a, restricted to the tables that exist this checkpoint (excludes
  `generation_component_event`, which is not created until Checkpoint 3).
- Must: Start Investigation wraps the existing `submitSources`/`POST /investigations` flow verbatim
  — no change to that service's signature or logic.
- Must: React SPA built with Vite, source living in `src/client/` (sibling to `src/services/`,
  `src/web/`, `src/db/`), served same-origin behind the existing Express app, with
  `src/web/public/` remaining the build OUTPUT directory only.
- Must: the persistent nav (`PersistentNav`, `src/client/components/PersistentNav.tsx`) is the only
  in-app mechanism for navigating to/from Mission Control and Problem Department — the two links
  defined by US-7's ACs — mounted once so it persists across route changes; this does not preclude
  other in-content navigation paths defined elsewhere in this document (e.g. the
  `ProblemDepartmentCard`'s whole-card click target and explicit "Open Problem Department →"
  affordance on Mission Control per US-1, or the last-active-Investigation link to the existing
  legacy `/investigations/:id` route per US-4).
- Must: the `ProblemDepartmentCard` on Mission Control is both a whole-card clickable navigation
  target AND contains a separately visible, explicit "Open Problem Department →" affordance — both
  required, neither substitutes for the other (Danny's ruling item 2, US-1).
- Must: the "last-active Investigation" link is a real, full-page navigation to the existing legacy
  `GET /investigations/:id` Express route, labeled as the current view — not a client-side route,
  and not a placeholder component (Danny's correction, US-4).
- Must not: introduce `POST /api/investigations/:id/generation-runs`, the
  `generation_component_event` table, `recordComponentEvent`, the real Investigation Workspace
  (Screen D) or a client-side placeholder for it, `BriefForReview`, or any Checkpoint 2/3 scope item
  listed above under Out of Scope.
- Must not: build, redirect to, or stub a "Departments directory" screen, route, or API
  (`/departments`, `GET /api/departments`, `getDepartmentsView`, `DepartmentsScreen`) this
  checkpoint — retired per US-2/Danny's ruling.
- Must not: change any Slices 1-9 persisted schema, service signature, or business logic.
- Must not: introduce any new auth, CORS, or cross-origin request handling.
- Must not: the persistent nav link to `/departments`, `/activity`, `/knowledge`, or any other
  surface not built this checkpoint.
- Assumes: exactly one Department (Problem Department) has a working service layer at this
  checkpoint; the other three Departments' identity/thesis strings remain in `departmentRegistry`
  as static, proposal-time literals for a future Departments/Settings surface, but are not read,
  displayed, or queried by anything this checkpoint (`02-ARCHITECTURE.md` §0a/§2).
- Assumes: no `Investigation.updatedAt` column exists or will be added this checkpoint — all
  recency ordering derives from the `GREATEST` computation over real timestamps only.
- Assumes: new read-model queries get the same test discipline as existing services (unit/
  integration test per query asserting results match real persisted rows), and new React
  components get render/basic-interaction tests only.
</content>
