# Requirements: Product Surface — Checkpoint 1

## Summary

Give Department OS's existing Problem Department backend (Slices 1-9, unchanged) a real browser
surface: a Mission Control home screen, an honest Departments directory, and a live Problem
Department Investigation portfolio — replacing the current situation where the only access path is
`GET /investigations/:id` for one Investigation ID at a time. This checkpoint is additive read
models plus a new React/Express UI shell only; no schema, service, or business-logic change.
Traces to `INTAKE.md` §3, `DESIGN-PROPOSAL.md` §1-§4a/§7/§8 (subset), `INTERVIEW.md`, and
`NORTH-STAR.md`.

## User Stories

**US-1 — Mission Control home screen**
As Danny (the operator),
I want to load `/` and see a real Mission Control screen listing every Department with an honest
`installed`/`planned` status,
so that I know at a glance what actually exists versus what is only planned, without inventing
activity for modules that aren't built.

**US-2 — Departments directory navigation**
As Danny,
I want to visit `/departments` and see all four Departments listed, with an entry link only for
the one that is actually installed,
so that I can navigate into a real Department and am never misled into thinking a planned one is
clickable.

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
I want Mission Control's "Active work" section split into three explicit, independently-sourced
groups — Active, Needs Attention, Recent/Completed,
so that "actively generating right now" is never confused with "merely open or blocked with no run
happening."

## Acceptance Criteria

**US-1 (Mission Control)**
- [ ] Given the dev server is running, when `/` is loaded, then the Installed Departments strip
  shows exactly one tile marked `installed` (Problem Department) and three tiles marked `planned`
  (Signal Foundry, Prototype Department, Creative Practice Engine), with no activity numbers or
  counts on the `planned` tiles.
- [ ] Given `/` is loaded, then a "planned Departments" note is rendered explicitly stating which
  Departments are not yet built (never a silently omitted tile).
- [ ] Given `/` is loaded, then the "Active orchestrations / agent activity" panel renders using
  only `GenerationRun`-level data (no per-component detail) — no live per-component activity is
  fabricated or displayed this checkpoint.
- [ ] Given `/` is loaded, then a recency-ordered list of recent Investigations/Briefs/evidence is
  shown, drawn only from existing `Investigation`/`BriefVersion`/`SourceArtifact`/`EvidenceItem`
  rows (no new persistence).
- [ ] Given the response payload for `GET /api/mission-control`, then every field maps to
  `MissionControlView` per `DESIGN-PROPOSAL.md` §8, with `activeActivity` containing no
  live-component-level field.

**US-2 (Departments directory)**
- [ ] Given `/departments` is loaded, then all four Departments render with name, one-line thesis
  (verbatim from the compass), and status (`installed and operational` or `planned — not
  installed`).
- [ ] Given `/departments` is loaded, then Problem Department is the only entry with a rendered
  click target into its overview screen; the other three render no click target at all (not a
  disabled-looking button).
- [ ] Given a click on the Problem Department entry, when navigation completes, then the URL is
  `/departments/problem-department` and Screen C is shown.

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
  `ProblemDepartmentOverview` per `DESIGN-PROPOSAL.md` §8.

**US-4 (Last recorded activity)**
- [ ] Given an Investigation with persisted `GenerationRun`/`GenerationStep`/`BriefVersion` rows,
  when "last recorded activity" is computed, then it equals the `GREATEST` of
  `investigation.created_at`, `MAX(generation_run.started_at)`, `MAX(generation_run.completed_at)`,
  `MAX(generation_step.completed_at)`, and `MAX(brief_version.created_at)` per `DESIGN-PROPOSAL.md`
  §4a — excluding `generation_component_event.occurred_at`, which is Checkpoint 3 scope and does
  not exist as a table this checkpoint.
- [ ] Given multiple Investigations, when the portfolio's "last-active Investigation" is computed,
  then it is the single row with the maximum `last_activity_at` from the above computation, linked
  toward Screen D's route (link target only — Screen D itself is not built this checkpoint).
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
  group and is excluded from "Needs Attention" and "Recent/Completed."
- [ ] Given an Investigation with `status` in (`blocked`, `generation-failed`) and no in-progress
  run, then it appears in "Needs Attention."
- [ ] Given an Investigation with `status = 'brief-generated'` or a `GenerationRun` whose `outcome`
  is not `in-progress`, then it appears in "Recent/Completed," ordered by recency, deduplicated to
  one row per Investigation.
- [ ] Given the three groups' backing queries, then each is `InvestigationSummary[]`-shaped per
  `DESIGN-PROPOSAL.md` §8, run independently (not filtered from one combined result set).
- [ ] Given a newly-submitted Investigation with `status = 'open'` and zero `GenerationRun` rows,
  then it appears in the "Active" group and is excluded from "Needs Attention" and
  "Recent/Completed" — never omitted from all three groups.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Problem Department has zero Investigations | Explicit empty state ("No investigations yet — Start Investigation"), never blank/loading-styled (INTERVIEW.md #5). |
| User targets a `planned` Department (Signal Foundry, Prototype Department, Creative Practice Engine) | No click target rendered at all — not a disabled-looking button (`DESIGN-PROPOSAL.md` §3; INTERVIEW.md #6). |
| Investigation has no `GenerationRun`, `GenerationStep`, or `BriefVersion` rows at all | `last_activity_at` equals `investigation.created_at` (every `COALESCE` falls back to it). |
| Investigation has `statusReason` unset | Portfolio row renders without a `statusReason` field/value — never a placeholder string. |
| Two Investigations tie exactly on `last_activity_at` | Any stable, deterministic ordering between them is acceptable — no requirement on tie-break order beyond determinism (not specified further upstream; not a scope gap since neither DESIGN-PROPOSAL.md nor INTERVIEW.md specifies a tie-break rule). |
| `GET /api/mission-control`, `/api/departments`, or `/api/problem-department` is called when the dev database has no `investigation` rows anywhere | Each read model still returns its full documented shape with empty arrays/zero counts — never a 500 or omitted field. |
| A Department other than Problem Department is requested directly via its (nonexistent) overview route | Out of scope this checkpoint — no Screen C exists for planned Departments; no route is defined for one (per Screen B behavior, no entry link is ever offered). |

## Out of Scope

- NOT: `POST /api/investigations/:id/generation-runs` or any browser-triggered generation
  (Checkpoint 2/3).
- NOT: `generation_component_event` table, `component_execution_id`, `recordComponentEvent`, or any
  live per-component activity display (Checkpoint 3) — no lifecycle migration is written this
  checkpoint.
- NOT: Investigation Workspace (Screen D), `BriefForReview` read model, or workflow-stage derivation
  (§5a) — Checkpoint 1 stops at the Department overview / portfolio list.
- NOT: `/evidence`, `/runs`, `/knowledge` Core-wide routes (§8a) — reserved/designed, not built.
- NOT: any change to Slices 1-9 backend services, schema, or business logic — this checkpoint is
  additive read models and a new UI shell only.
- NOT: retirement of `src/web/views.ts`'s server-rendered screens — they remain running, untouched.
- NOT: any new auth, CORS, or error-handling posture change to the existing Express app — the new
  routes inherit the existing no-auth, same-origin posture (INTERVIEW.md #4).
- NOT: an e2e test framework — React components get render/basic-interaction tests only this
  checkpoint (INTERVIEW.md #3).
- Deferred: `RUNTIME_IDENTIFIER`-style config conventions extending to new config — this checkpoint
  introduces no new runtime/env config (INTAKE.md §4, confirmed by INTERVIEW.md).
- Deferred: `Department` config's long-term home (static list vs. persisted) — remains an open
  question noted in `DESIGN-PROPOSAL.md` §7/§15, not resolved by this checkpoint.

## Constraints

- Must: every displayed field trace to an existing persisted column or an additive read-only query
  over existing tables (`DESIGN-PROPOSAL.md` §7, North Star Success Criteria).
- Must: Investigation portfolio row-for-row matches `SELECT id, status, created_at FROM
  investigation` against the live local dev database exactly — no extra or missing rows
  (`INTAKE.md` §3 Demonstration criteria).
- Must: the three read models this checkpoint needs (`GET /api/mission-control`,
  `GET /api/departments`, `GET /api/problem-department`) conform to `MissionControlView`,
  `DepartmentsView`, and `ProblemDepartmentOverview` respectively per `DESIGN-PROPOSAL.md` §8,
  minus the live-component slice of `activeActivity`/Runs-Activity (GenerationRun-level only).
- Must: "last recorded activity" computed via the exact `GREATEST` formula in `DESIGN-PROPOSAL.md`
  §4a, restricted to the tables that exist this checkpoint (excludes
  `generation_component_event`, which is not created until Checkpoint 3).
- Must: Start Investigation wraps the existing `submitSources`/`POST /investigations` flow verbatim
  — no change to that service's signature or logic.
- Must: React SPA built with Vite, source living in `src/client/` (sibling to `src/services/`,
  `src/web/`, `src/db/`), served same-origin behind the existing Express app, with
  `src/web/public/` remaining the build OUTPUT directory only (INTERVIEW.md #1, #2).
- Must not: introduce `POST /api/investigations/:id/generation-runs`, the
  `generation_component_event` table, `recordComponentEvent`, Screen D, `BriefForReview`, or any
  Checkpoint 2/3 scope item listed in `INTAKE.md` §3.
- Must not: change any Slices 1-9 persisted schema, service signature, or business logic.
- Must not: introduce any new auth, CORS, or cross-origin request handling.
- Assumes: exactly one Department (Problem Department) has a working service layer at this
  checkpoint; the other three Departments' `installed`/`planned` status is a static, proposal-time
  literal, not a persisted domain fact (`DESIGN-PROPOSAL.md` §7).
- Assumes: no `Investigation.updatedAt` column exists or will be added this checkpoint — all
  recency ordering derives from the `GREATEST` computation over real timestamps only.
- Assumes: new read-model queries get the same test discipline as existing services (unit/
  integration test per query asserting results match real persisted rows), and new React
  components get render/basic-interaction tests only (INTERVIEW.md #3).
