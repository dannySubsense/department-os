# Roadmap: Product Surface — Checkpoint 1

**Status**: CLOSED OUT — this checkpoint's Forge work (both slices) is complete and shipped. This
document is now a historical record of what was built and approved, not a spec for upcoming work.
It was originally REVISED to correct the human product-gate FAIL on Slice 1's browser demonstration
(Danny, 2026-08-20); the corrected Slice 1 and the subsequent Slice 2 both shipped, then went
through several further rounds of UI correction (human-readable labels replacing raw ids/timestamps/
statuses, and the per-row status-driven "Open current view" affordance replacing an early
last-row-only framing) before final approval. See `02-ARCHITECTURE.md` §0a for the verbatim ruling
this revision implements, and `03-UI-SPEC.md` for the revised screens/flows. The prior version of
this document (built against the pre-correction 3-slice sequence) is superseded by this revision,
not retroactively valid.

**Feeds**: `01-REQUIREMENTS.md` (see its User Stories section for the full list; this document
references that section by pointer and does not restate the story range or AC count),
`02-ARCHITECTURE.md` (Sections 1–11, §0a especially for the binding correction), `03-UI-SPEC.md`
(see its Screens table and User Flows section for the full screen/flow list — not restated here per
repo-wide no-manually-asserted-counts discipline).

## Scope Discipline

Checkpoint 1 has no runtime/schema/generation-pipeline decision to make — `02-ARCHITECTURE.md` §1
already fixes the scope boundary, POST-CORRECTION (§0a), against the existing, unchanged Slices
1-9 backend. No slice invents a file `02-ARCHITECTURE.md`/`03-UI-SPEC.md` did not already name.

**Sequencing principle (Danny's ruling, binding on this roadmap):** the sequence must not repeat
the backend-first pattern. Slice 1 produces a recognizable Mission Control shell in the browser —
`03-UI-SPEC.md`'s binding Visual Direction section (typography, palette, spacing/border treatment,
`PersistentNav`, the Mission Control layout structure) is real and on-screen from Slice 1 onward,
even where a panel's underlying data is sparse because the local dev database has little seeded
activity yet. Every slice from Slice 1 onward begins its Goal with the literal text
"PRODUCT CHANGE:" — naming what Danny can see or do now that he couldn't before — matching the
convention used in `docs/specs/product-surface/DESIGN-PROPOSAL.md` §12's checkpoint descriptions,
and ends with an explicit browser-demonstration criterion.

**This checkpoint is now sequenced as 2 slices, not 3 — a correction, not a re-derivation.** The
prior version of this document sequenced 3 slices (Mission Control, Departments Directory, Problem
Department Overview) along what were then three independently-reachable screens. Danny's product
gate ran Slice 1's browser demonstration and FAILED it on information-architecture grounds: the
Departments-directory screen (the old Slice 2) was a catalog of installed/planned modules — exactly
the configuration information that does not belong on the live operating surface — and Danny's
ruling item 5 is explicit: **"Do not build the planned-module catalog as Slice 2."** Per
`02-ARCHITECTURE.md` §0a/§1, that screen, its service (`getDepartmentsView`), its route (`GET
/api/departments`), and its route path (`/departments`) are removed from this checkpoint's scope
entirely — not redirected, not stubbed, not deferred to a later slice within this checkpoint. With
that screen gone, the checkpoint has exactly two independently-reachable screens left (Mission
Control, Problem Department overview), so it now has exactly two slices:

- **Slice 1** is a CORRECTION to already-implemented work (commit `92cd2a3`, since merged) —
  Mission Control was built once against the pre-correction design and failed Danny's browser
  demonstration; this slice edited that existing implementation to match §0a rather than building it
  fresh. It is still Slice 1, not a "Slice 0," because it remained the checkpoint's first
  browser-visible result and the hard prerequisite for Slice 2, matching the original sequencing
  principle above.
- **Slice 2** (was Slice 3) is unchanged in its own content — the full Problem Department overview
  screen — but is reached via a direct, one-hop link from Mission Control's
  `ProblemDepartmentCard` instead of the old two-hop Mission-Control-through-Departments-directory
  path, satisfying Danny's ruling item 5's "next browser-visible result is a real Problem Department
  overview reachable from Mission Control."

Splitting Slice 1's correction from Slice 2's screen would have meant re-deriving
`getMissionControlView` under two different slice headings for no independent-testability gain — the
same reasoning the prior version of this document gave for keeping Mission Control's full query
shape in one slice still applied post-correction: `getMissionControlView`'s full query shape (§5.3 —
9 queries total, one new `investigationCount` COUNT replacing the removed no-query catalog read, the
other three `problemDepartment` counts computed as `.length` of arrays the view already assembles)
was corrected once, complete, in Slice 1.

**Note on this document's historical Tests/Done-When language:** both slices below were built,
shipped, and then went through several further rounds of UI correction beyond what this roadmap
originally specified — before the final human product-gate approval, human-readable labels
(`formatInvestigationLabel`, `shortenId`, `formatDateTime`, `humanizeStatus` — see
`src/client/lib/investigationDisplay.ts`) replaced raw id/ISO-timestamp/raw-status rendering, and the
"Open current view" affordance was corrected from an originally last-row-only framing to a per-row,
status-driven behavior present on every row of both `InvestigationPortfolioTable` and Mission
Control's `RecentInvestigationsList`. The Tests/Done-When sections below have been updated in place
to describe the actual, final, approved behavior as shipped — not the intermediate behavior first
implemented.

---

## Dependency Map

| Unit | Depends On |
|---|---|
| `src/types/readModels.ts`, `src/config/departments.ts`, `src/services/lastActivity.ts` | — |
| `getMissionControlView` (service, corrected) | types + `departmentRegistry` + `lastActivity` |
| `getProblemDepartmentOverview` (service) | types + `departmentRegistry` + `lastActivity` |
| `src/web/apiRoutes.ts` (`GET /api/mission-control` corrected in Slice 1, `GET
  /api/problem-department` + `POST /api/investigations` added in Slice 2; `GET /api/departments`
  removed, never existed post-correction), `express.json()` in `server.ts` | the corresponding
  service(s) |
| `src/client/` Vite scaffold (`App.tsx`, `main.tsx`, `api.ts`, router, `vite.config.ts`), dev/build
  integration (`server.ts` static catch-all) | `GET /api/mission-control` (Slice 1's minimum
  callable route) — already exists from the prior implementation pass, edited in place this slice |
| `PersistentNav` (corrected to two links) | client scaffold (`App.tsx` router, `react-router-dom`'s
  `NavLink`) — no read-model dependency |
| `MissionControlScreen` (+ `ProblemDepartmentCard`, `ActiveWorkSection`, `ActiveActivityPanel`,
  `RecentSection`) | client scaffold, `getMissionControlView` (corrected) |
| `ProblemDepartmentScreen` (+ `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState`,
  `StartInvestigationForm`, `SourcesEvidenceCounts`, `RunsActivityPanel`) | client scaffold,
  `getProblemDepartmentOverview`, `POST /api/investigations`, Slice 1's `App.tsx` route
  declarations and `PersistentNav` |
| `src/client/lib/investigationDisplay.ts` (`formatInvestigationLabel`, `shortenId`,
  `formatDateTime`, `humanizeStatus`) | no service dependency — pure display-layer helpers shared by
  `InvestigationPortfolioTable` and Mission Control's `RecentInvestigationsList` |

`getDepartmentsView`, `DepartmentsScreen`, `DepartmentsView`, `fetchDepartments`, `GET
/api/departments`, `InstalledDepartmentsStrip`, `DepartmentTile`, `PlannedDepartmentsNote`,
`DepartmentRow`, `DepartmentEntryLink` do not appear in this map — none of them exist in this
checkpoint's scope (`02-ARCHITECTURE.md` §0a/§2, `03-UI-SPEC.md` Component Hierarchy).

---

## Slice Overview

| Slice | Goal (PRODUCT CHANGE) | Depends On | Architecture / UI Covered |
|---|---|---|---|
| 1 | Danny reloads `/` and sees Mission Control corrected per his ruling: `PersistentNav` with exactly two links ("Mission Control", "Problem Department"), and a single `ProblemDepartmentCard` — showing Problem Department's name, thesis, and four live counts (investigation/active/needs-attention/recent-completed), no installed/planned label or badge anywhere on this screen — that is unmistakably actionable: the whole card is a click target to `/departments/problem-department`, plus an explicit "Open Problem Department →" affordance, both leading directly into a real screen (not a stub). The four Active-work groups, activity panel, and recent lists remain wired to the real, corrected `GET /api/mission-control` endpoint. | — | §0a (the ruling itself), §2 corrected components/routes/`PersistentNav`/`MissionControlScreen`/`ProblemDepartmentCard`, §3 corrected `MissionControlView`/`MissionControlProblemDepartmentSummary`, §4 `lastActivityAt` (unchanged), §5.1/§5.2/§5.3 (Mission Control, corrected query set), §6 router+`App` (two routes, not three), §7 dev/build tooling (unchanged), `03-UI-SPEC.md` Visual Direction + Screen: Mission Control + Flows US-1, US-4 (recent-list half), US-6, US-7 |
| 2 | Danny clicks the whole `ProblemDepartmentCard` — or its explicit "Open Problem Department →" affordance — on Mission Control and lands directly on `/departments/problem-department`, where he sees the full live Investigation portfolio (rendered with human-readable labels, not raw ids/timestamps/statuses), Sources/Evidence counts, recent runs, and can start a new Investigation from the screen — with a per-row, status-driven affordance (a plain `Open current view` link to the existing legacy view on every row whose status is not `brief-generated`) present in both this screen's table and Mission Control's recent list | 1 | §2/§5.1/§5.3/§6 `getProblemDepartmentOverview`/`ProblemDepartmentScreen`/`POST /api/investigations`, `03-UI-SPEC.md` Screen: Problem Department Overview + Flows US-3, US-4 (legacy-link half), US-5 |

Order runs Mission Control-corrected (the whole-environment orientation screen, corrected to be the
one every other screen is directly, one-hop reachable from, per Danny's ruling item 5) → Problem
Department overview (the deepest, AC-densest screen, now reachable in a single click from Mission
Control instead of via the removed Departments-directory intermediate). Slice 2 is additive to the
router (Slice 1's `App` already declares both route paths this checkpoint has — `/` and
`/departments/problem-department` — so `PersistentNav` and direct/hard-loaded URLs never 404 at any
point in the sequence; see Slice 1 Implementation Notes for what the not-yet-built second route
renders in the interim) and to `src/web/apiRoutes.ts` (Slice 2 adds only the routes Problem
Department's screen needs).

---

## Slice Detail

### Slice 1: Mission Control Shell — Correction (Danny's Product-Gate Ruling)

**Goal:** PRODUCT CHANGE: Danny reloads `/` in a browser and, in place of the FAILED design (a
Departments strip dominated by three planned-but-not-installed tiles, a planned-Departments
footer note, and installed/planned labeling), sees Problem Department presented as the one
Department currently available to him: a single `ProblemDepartmentCard` carrying its name, thesis,
and four real live counts (`investigationCount`, `activeCount`, `needsAttentionCount`,
`recentCompletedCount`) — never an installed/planned label or badge anywhere on this screen — and
unmistakably actionable, with the entire card clickable AND an explicit "Open Problem Department →"
affordance, both leading directly to a real Problem Department surface (Slice 2), not an inline
stub. `PersistentNav` shows exactly two links: "Mission Control", "Problem Department" — never
"Departments". The four Active-work groups, activity panel, and recent lists remain wired to the
real `GET /api/mission-control` endpoint end to end, honestly empty where the local dev database has
no matching rows.

**This was a correction to already-committed work (commit `92cd2a3`), not a fresh build.** The Files
list below distinguishes edited-in-place files (already existed from the prior implementation pass
and were changed to match `02-ARCHITECTURE.md` §0a) from newly created files (did not exist before
this correction) and deleted files (existed for the now-removed Departments-directory screen and
were removed, not left as dead code).

**Depends On:** —

**Files — edited in place (already existed from the prior, failed-gate implementation pass, commit
`92cd2a3`):**
- `src/services/getMissionControlView.ts` — edit: drop the old no-query `departments` catalog
  assembly; add query 1 (`SELECT COUNT(*)::int AS count FROM investigation`, §5.3) for
  `problemDepartment.investigationCount`; compute `problemDepartment.activeCount`/
  `.needsAttentionCount`/`.recentCompletedCount` as `.length` of the existing `activeWork.active`/
  `.needsAttention`/`.recentCompleted` arrays (no new queries for these three); assemble
  `problemDepartment.name`/`.thesis`/`.id` from `departmentRegistry`'s Problem Department entry
  (unchanged source, new destination field)
- `src/types/readModels.ts` — edit: remove `MissionControlView.departments: DepartmentSummary[]`;
  add `MissionControlProblemDepartmentSummary` interface and
  `MissionControlView.problemDepartment: MissionControlProblemDepartmentSummary` (§3, verbatim)
- `src/web/apiRoutes.ts` — edit: `GET /api/mission-control` handler itself is unchanged (still
  calls `getMissionControlView()` and returns 200 JSON) — only the shape of what it returns changes,
  via the service edit above; remove the `GET /api/departments` route entirely (§5.1)
- `src/client/screens/MissionControlScreen.tsx` — edit: remove the Installed Departments strip and
  planned-Departments footer note render logic; mount the new `ProblemDepartmentCard` in their
  place, above the four Active-work groups (§ UI Spec Screen: Mission Control layout)
- `src/client/components/PersistentNav.tsx` — edit: change the second `NavLink` from "Departments"
  (`/departments`) to "Problem Department" (`/departments/problem-department`) — still exactly two
  links total
- `src/client/App.tsx` — edit: remove the `/departments` route declaration and its inline stub
  entirely; `/departments/problem-department`'s inline "not built yet this slice" stub remains
  unchanged this slice (Slice 2 replaces it, per the Dependency Map)
- `src/client/api.ts` — edit: remove `fetchDepartments`; `fetchMissionControl`'s signature is
  unchanged (only the shape it resolves to changes, per the service/type edits above)

**Files — newly created this slice:**
- `src/client/components/ProblemDepartmentCard.tsx` — create (§2, §0a): renders
  `MissionControlView.problemDepartment` — name, thesis, four live counts in the monospace data
  register per `03-UI-SPEC.md` § Visual Direction — as a single clickable unit (`<Link
  to="/departments/problem-department">` wrapping the whole card) plus a separately-visible explicit
  "Open Problem Department →" affordance inside it; renders no `installed`/`planned` label or badge

**Files — deleted this slice (existed only for the now-removed Departments-directory screen):**
- `src/services/getDepartmentsView.ts` — delete
- `src/client/screens/DepartmentsScreen.tsx` — delete
- any corresponding test files for the two files above (e.g.
  `src/services/getDepartmentsView.test.ts`, `src/client/screens/DepartmentsScreen.test.tsx`, exact
  names per whatever the prior implementation pass used) — delete
- `DepartmentsView` type and `fetchDepartments` client function — deletion is covered by the edits
  to `src/types/readModels.ts` and `src/client/api.ts` above, not a separate file

**Implementation Notes:**
- This slice was a correction against a then-unpushed commit (`92cd2a3`) — before editing, the
  implementer confirmed the actual current file contents on disk matched what this Files list
  assumed; where the prior implementation pass diverged from what `02-ARCHITECTURE.md`/
  `03-UI-SPEC.md` (pre-correction version) described, that was treated as a signal to re-read those
  files' current diff against this revision before editing, not to assume this list was exhaustive.
- Every service continues to query `src/db/pool.ts`'s existing exported `pool` — no new connection
  setup (§10). No migration, no schema change.
- `ProblemDepartmentCard`'s whole-card click target and its explicit "Open Problem Department →"
  affordance are BOTH required simultaneously (Danny's ruling item 2, `03-UI-SPEC.md` § Sections) —
  implemented as a real, separately-visible link element inside the card, not merely styled text
  that happens to sit inside the outer `<Link>`.
- `problemDepartment` renders unconditionally — there is no empty state for the card itself; its
  four counts individually degrade to `0` (never a placeholder), matching
  `02-ARCHITECTURE.md` §5.1's "never a different shape when empty" contract.
- `PersistentNav` remains mounted once at the `App` shell level, outside `<Routes>` — this slice
  only changed its second link's label/target, not its mount position (US-7 AC1).
- `src/web/public/` remains build-output only — no hand-authored file added there (§7).

**Tests:**
- [x] `getMissionControlView`: integration test — `problemDepartment.investigationCount` matches a
      real `COUNT(*) FROM investigation` against persisted rows.
- [x] `getMissionControlView`: integration test — `problemDepartment.activeCount`/
      `.needsAttentionCount`/`.recentCompletedCount` equal the `.length` of `activeWork.active`/
      `.needsAttention`/`.recentCompleted` respectively, for a persisted mix of Investigation states.
- [x] `getMissionControlView`: integration test — `problemDepartment.name`/`.thesis`/`.id` match
      `departmentRegistry`'s Problem Department entry verbatim.
- [x] `getMissionControlView`: integration test asserting the response no longer contains a
      `departments` field at all.
- [x] `getMissionControlView`: the four Active-work-grouping tests from the prior implementation
      pass (Active/Ready-Not-Started/Needs-Attention/Recent-Completed mutual exclusivity,
      `generation-failed` bucket) continue to pass unmodified — this slice does not touch that query
      logic.
- [x] `LAST_ACTIVITY_SUBQUERY`: unchanged, prior test continues to pass.
- [x] `GET /api/mission-control`: integration test asserting 200 + response shape matches the
      corrected `MissionControlView` (with `problemDepartment`, without `departments`), never 500 on
      an empty database.
- [x] `GET /api/departments`: integration test asserting the route no longer exists (404).
- [x] Client scaffold: render test confirming `App` mounts and both route paths (`/`,
      `/departments/problem-department`) resolve without a routing error; confirms `/departments`
      is NOT a declared route.
- [x] `PersistentNav`: render test confirming exactly two links render — "Mission Control" (→ `/`)
      and "Problem Department" (→ `/departments/problem-department`) — and no link to
      `/departments`, `/activity`, `/knowledge`, or any other route exists (US-7 AC2, AC4).
- [x] `PersistentNav`: interaction test confirming a click on either link updates the URL via
      client-side routing with no full page reload, and that `PersistentNav` itself is not
      remounted across the navigation (US-7 AC1, AC3).
- [x] `ProblemDepartmentCard`: render test — renders name, thesis, and all four live counts from a
      mocked `MissionControlProblemDepartmentSummary`, in the monospace data register.
- [x] `ProblemDepartmentCard`: render test — no `installed`/`planned` label or badge text/element is
      present anywhere in the rendered output.
- [x] `ProblemDepartmentCard`: interaction test — clicking anywhere on the card body navigates to
      `/departments/problem-department` (client-side, no full reload).
- [x] `ProblemDepartmentCard`: render test — an explicit, separately-visible "Open Problem
      Department →" element exists inside the card, distinct from the card's outer click-target
      wrapper (both required, not either/or).
- [x] `MissionControlScreen`: render test — no Installed-Departments-strip element and no
      planned-Departments footer note element renders anywhere on the page, and no
      installed/planned badge or label renders anywhere on the page (confirmed removed in later
      correction rounds, matching the Problem Department overview screen's own badge removal).
- [x] `MissionControlScreen`: render test — the four Active-work groups continue to render as
      separate labeled sections from independent mocked arrays, including each group's own empty
      state when its array is empty (unchanged from the prior pass).
- [x] `MissionControlScreen`: render test — activity panel rows render only `GenerationRunSummary`
      fields, never a `currentComponent` field (unchanged from the prior pass).
- [x] `MissionControlScreen`: render test — recent Investigations/Briefs/Evidence lists render in
      the order provided by the mocked payload (unchanged from the prior pass).
- [x] `MissionControlScreen`: render test — `RecentInvestigationsList` renders every row with a
      human-readable label (`formatInvestigationLabel`) and formatted date/time
      (`formatDateTime`), a shortened id (`shortenId`) as secondary metadata, and a humanized status
      (`humanizeStatus`) — never a raw id, raw ISO timestamp, or raw status string as the primary
      rendered text (final, post-correction behavior; supersedes the plain-`<a>`-only description
      this bullet originally carried).
- [x] `MissionControlScreen`: render test — each row of `RecentInvestigationsList` branches on its
      own `status`: rows with status `brief-generated` render plain text ("Brief ready — review
      workspace not yet available."), all other statuses (`open`, `blocked`,
      `generation-failed`) render a plain `<a href="/investigations/{id}">Open current view</a>`
      element — this affordance is per-row and status-driven, not limited to a single "last-active"
      or "top" row (US-4 AC2, final post-correction behavior).
- [x] `MissionControlScreen`: Page-Load Fetch loading/error states render distinctly from each other
      and from the populated state (unchanged from the prior pass).

**Done When:**
- [x] `curl localhost:<port>/api/mission-control` returns 200 and real/empty JSON matching the
      corrected `MissionControlView` (with `problemDepartment`, no `departments` field) against the
      live local dev database.
- [x] `curl localhost:<port>/api/departments` returns 404 — the route no longer exists.
- [x] `npm run dev:client` + `npm run dev` running together, `/` loaded in a browser, shows the
      persistent nav (exactly "Mission Control" / "Problem Department"), a single
      `ProblemDepartmentCard` with real live counts and no installed/planned label or badge
      anywhere on the screen, all four Active-work groups, activity panel, and recent lists —
      styled per `03-UI-SPEC.md`'s Visual Direction — with no fabricated data anywhere on the
      screen.
- [x] Clicking anywhere on `ProblemDepartmentCard`, and separately clicking its "Open Problem
      Department →" affordance, both navigate to `/departments/problem-department` in the browser
      (inline stub content acceptable this slice — Slice 2 replaces it).
- [x] Loading `/departments/problem-department` directly in the browser resolves without a 404 or
      blank crash, with `PersistentNav` visible.
- [x] Loading `/departments` directly in the browser does NOT resolve to a real screen (no route
      declared for it) — confirms the removal is real, not a dangling redirect.
- [x] `src/services/getDepartmentsView.ts` and `src/client/screens/DepartmentsScreen.tsx` (and their
      test files) no longer exist in the repo.
- [x] All tests above pass.
- [x] No Slice 1-9 service file, schema, or migration was modified.

---

### Slice 2: Problem Department Overview Screen

**Goal:** PRODUCT CHANGE: Danny clicks the whole `ProblemDepartmentCard` — or its explicit "Open
Problem Department →" affordance — on Mission Control and, in one hop, lands on
`/departments/problem-department`, where he sees the Department header (no installed/planned label
or badge anywhere on this screen either), the full Investigation portfolio (row-for-row matching
`investigation`, rendered with human-readable labels/dates/statuses, not raw ids/ISO
timestamps/status strings), Sources/Evidence counts, recent Runs/Activity, and a working "Start
Investigation" form that creates a real Investigation and refreshes the portfolio in the browser —
plus, on every row whose status is not `brief-generated`, a working per-row "Open current view" link
to the existing legacy `/investigations/:id` view, present on both this screen's table and Mission
Control's recent list (US-3, US-4, US-5 — see `01-REQUIREMENTS.md`'s US-3/US-4/US-5 Acceptance
Criteria).

**Depends On:** Slice 1 (navigates from Mission Control's `ProblemDepartmentCard`; screen itself
has no runtime dependency on Slice 1's corrected Mission Control data, only on being reachable from
it for the full flow, and on Slice 1's `App.tsx` route declarations/`PersistentNav` already
existing to edit in place)

**Files:**
- `src/services/getProblemDepartmentOverview.ts` — create (§5.3)
- `src/web/apiRoutes.ts` — edit: add `GET /api/problem-department`, `POST /api/investigations`
  (§5.1)
- `src/client/api.ts` — edit: add `fetchProblemDepartmentOverview`, `createInvestigation`
- `src/client/screens/ProblemDepartmentScreen.tsx` — create
- `src/client/components/InvestigationPortfolioTable.tsx` — create
- `src/client/components/InvestigationPortfolioEmptyState.tsx` — create
- `src/client/components/StartInvestigationForm.tsx` — create
- `src/client/components/SourcesEvidenceCounts.tsx` — create
- `src/client/components/RunsActivityPanel.tsx` — create
- `src/client/lib/investigationDisplay.ts` — create (later correction round; not in the slice's
  original file list): shared display-layer helpers (`formatInvestigationLabel`, `shortenId`,
  `formatDateTime`, `humanizeStatus`) used by both `InvestigationPortfolioTable` and Mission
  Control's `RecentInvestigationsList`
- `src/client/App.tsx` — edit: wire `/departments/problem-department` route to the real screen
  (replacing Slice 1's inline stub) — no other route declarations change

**Implementation Notes:**
- `POST /api/investigations` calls the existing `submitSources`/`resolveInvestigationSources`/
  `transitionInvestigationStatus` exports verbatim, unchanged signatures (§5.1, US-5 AC1) — do not
  refactor those services to accommodate this route.
- `statusFilter` is client-side only state over the already-fetched full portfolio — no refetch per
  filter change (§6, US-3 AC3).
- `statusReason` renders only when present on a row — never a placeholder string (Edge Cases table
  row 4).
- Zero-Investigation case renders `InvestigationPortfolioEmptyState` in place of the table only;
  Sources/Evidence counts and Runs/Activity sections still render with `0`/empty (UI Spec § Screen:
  Problem Department Overview, "Sections 3 and 4 still render").
- `StartInvestigationForm` is present in both the empty-state and non-empty layouts (UI Spec Flow
  US-5 step 1) — implemented once, mounted in both places, not as two components.
- On successful submission (`onSubmitted`), `ProblemDepartmentScreen` re-fetches
  `GET /api/problem-department` — a one-shot refetch triggered by the submit event, never a
  polling/interval loop (Architecture §8 Anti-Patterns).
- On submission failure, the inline error renders next to the form and the portfolio is NOT
  re-fetched (UI Spec Flow US-5 Error path) — form values are preserved, not cleared.
- Each row in `InvestigationPortfolioTable` renders `formatInvestigationLabel(inv.createdAt)` as its
  primary human-readable label, `shortenId(inv.id)` as secondary muted-text metadata beneath it, and
  `humanizeStatus(inv.status)` for its status cell — never the raw id, raw ISO timestamp, or raw
  status string. Each row then branches on its own `status`: `brief-generated` rows render plain
  text ("Brief ready — review workspace not yet available."); every other status renders a plain
  `<a href="/investigations/{id}">Open current view</a>` element — a real, full-page navigation to
  the EXISTING legacy Express route `GET /investigations/:id` (`src/web/server.ts:115-158`), not a
  client-side route, not a placeholder component (US-4 AC2, `02-ARCHITECTURE.md` §2/§6,
  `03-UI-SPEC.md` § Interactions). This affordance is per-row and status-driven across the whole
  table, not gated to a single "last-active" row — Mission Control's `RecentInvestigationsList`
  applies the identical per-row logic via the same `src/client/lib/investigationDisplay.ts` helpers.
  This is the final, post-correction behavior; the screen's original implementation gated this
  affordance to only the last-active row, and that gating was removed in a later correction round.
- `SourcesEvidenceCounts` and `RunsActivityPanel` are presentational-only, rendering the counts and
  `GenerationRunSummary[]` slices already present on the fetched `ProblemDepartmentOverview` — no
  independent fetch of their own (§2, §8 Anti-Patterns).
- No installed/planned label or badge renders anywhere on this screen, matching Mission Control's
  `ProblemDepartmentCard` — the department-status-badge element that briefly existed on this
  screen's header in an intermediate build was deleted entirely in a later correction round, not
  merely hidden or relabeled.
- Styling reuses Slice 1's established visual tokens (typography scale, palette, spacing,
  section-delineation treatment per `03-UI-SPEC.md`'s Visual Direction) — no new styling pattern is
  introduced for this screen.
- The end-to-end walkthrough for this checkpoint is a direct, one-hop path — `/` → click
  `ProblemDepartmentCard` (or its explicit affordance) → `/departments/problem-department` — not
  the prior two-hop path through a Departments directory. The full walkthrough (below, Done-When)
  reflects this.

**Tests:**
- [x] `getProblemDepartmentOverview`: integration test asserting the returned shape matches real
      persisted rows (portfolio, `lastActiveInvestigationId`, counts, `recentRuns`), including the
      zero-Investigation empty-shape behavior (Edge Cases table row 6).
- [x] `GET /api/problem-department`: integration test asserting 200 + response shape matches
      `ProblemDepartmentOverview`, never 500 on an empty database.
- [x] `POST /api/investigations`: integration test — valid submission returns 201 with
      `investigationId`/`status`; zero-artifact body returns 400; unreachable-source submission
      resolves `status: 'blocked'`.
- [x] Render test: portfolio table renders every row from a mocked
      `ProblemDepartmentOverview.investigations`, matching id/status/createdAt/statusReason
      (present-only) fields, with `formatInvestigationLabel`/`shortenId`/`formatDateTime`/
      `humanizeStatus` applied — not the raw underlying values.
- [x] Render test: zero-Investigation payload renders `InvestigationPortfolioEmptyState` with the
      exact copy "No investigations yet — Start Investigation", and Sources/Evidence/Runs sections
      still render with zero values.
- [x] Render test: no installed/planned label or badge element renders anywhere on the screen.
- [x] Interaction test: changing the status filter re-renders the table to the filtered subset with
      no network call.
- [x] Interaction test: submitting `StartInvestigationForm` with a valid artifact calls
      `POST /api/investigations` and, on success, triggers a portfolio refetch; on failure, renders
      an inline error and does not refetch.
- [x] Render test: for every row with status other than `brief-generated`, a plain
      `<a href="/investigations/{id}">Open current view</a>` element renders (not a router `<Link>`)
      with the correct `href`; for rows with status `brief-generated`, plain text renders instead
      and no interactive element (link or button) is present for that row. This is asserted per-row
      across a mixed-status mocked portfolio, not just for a single last-active row.

**Done When:**
- [x] `curl localhost:<port>/api/problem-department` returns 200 and real JSON matching
      `ProblemDepartmentOverview`.
- [x] `curl -X POST localhost:<port>/api/investigations` with a valid body returns 201 and the new
      Investigation is visible via a direct `SELECT` against `investigation`.
- [x] `/departments/problem-department` loaded in a browser (with existing local dev Investigations
      present) shows every row from `SELECT id, status, created_at FROM investigation`, row-for-row,
      rendered with human-readable labels/dates/statuses, real Sources/Evidence counts, and real
      recent runs, with no installed/planned label or badge anywhere on the screen.
- [x] Submitting a new source via the on-screen form creates a real Investigation (verifiable via
      direct `SELECT`) and it appears in the portfolio without a manual page reload.
- [x] Loading zero-Investigation dev state (or a scratch/empty DB) renders the exact empty-state
      copy, never a blank/loading-styled screen.
- [x] Full end-to-end manual walkthrough works in a browser, ONE HOP not two: `/` → click
      `ProblemDepartmentCard` (verify both the whole-card click target and its explicit "Open
      Problem Department →" affordance independently work) → `/departments/problem-department` →
      submit a new Investigation → click `PersistentNav`'s "Mission Control" link → `/` and see the
      new Investigation reflected in the appropriate Active-work group and recent list, with
      `PersistentNav` visibly unchanged/not remounted across every navigation in this walkthrough
      (US-7).
- [x] All tests above pass.

---

## Sequence Rules

1. Complete each slice fully (including its tests and Done-When checklist) before starting the
   next — no partial slice work carried forward.
2. Slice 1 is a hard prerequisite for Slice 2 — Slice 2 does not begin against a stub/mocked
   `GET /api/mission-control` shape; Slice 1's corrected route must be live first.
3. If a slice's implementer finds it needs a file, route, or table not named in
   `02-ARCHITECTURE.md`/`03-UI-SPEC.md`, that is a signal to HALT and return to spec, not to
   improvise it in-slice.
4. If blocked, HALT and report — do not skip ahead to a later slice to "make progress" while a
   blocking slice is incomplete.
5. No new slices without human approval; no slice is silently split or merged mid-implementation.

(Both slices above completed; these rules governed their execution and remain the record of how
they were sequenced. This checkpoint's Forge work is closed.)

---

## Deferred (Not This Roadmap)

- **Departments directory / catalog screen** (`/departments`, `GET /api/departments`,
  `getDepartmentsView`, `DepartmentsScreen`, `DepartmentRow`, `DepartmentEntryLink`,
  `InstalledDepartmentsStrip`, `DepartmentTile`, `PlannedDepartmentsNote`) — REMOVED from this
  checkpoint per Danny's ruling item 5 ("Do not build the planned-module catalog as Slice 2") and
  `02-ARCHITECTURE.md` §0a/§2. This is not silently dropped: per Danny's ruling item 4, the
  capability moves to (a) "a future Departments view" that switches among *enabled* Departments,
  and (b) a "Settings / Add Department" surface for installing/unlocking modules — both explicitly
  out of this checkpoint's scope, neither designed here, and neither redirected/stubbed in Slice 1
  or Slice 2 above.
- Investigation Workspace (Screen D) itself and its real content — no client-side route or
  component was built for it this checkpoint at all (`02-ARCHITECTURE.md` §1/§6). The per-row
  "Open current view" link (Slices 1 and 2) reuses the already-working, already-shipped legacy
  `GET /investigations/:id` Express route instead — that is reused existing product behavior, not
  new scope, and is not a placeholder. The actual Investigation Workspace is Checkpoint 2/3 per
  `01-REQUIREMENTS.md` Out of Scope.
- `generation_component_event` table, `recordComponentEvent`, live per-component activity display,
  any polling/live-update mechanism — Checkpoint 3 scope, not designed or stubbed here.
- `POST /api/investigations/:id/generation-runs` or any browser-triggered generation — Checkpoint
  2/3 scope.
- `/evidence`, `/runs`, `/knowledge` Core-wide routes, and any corresponding `PersistentNav` links
  to them — reserved/designed in `DESIGN-PROPOSAL.md` §8a, not built this checkpoint;
  `PersistentNav` ships with exactly its two named links (US-7 AC2, AC4).
- Pagination or a "recent N" cap on Mission Control's recent lists — no owner/citation exists yet
  for such a number (Architecture §3 PROVISIONAL note); not introduced speculatively in any slice
  above.
- `Department` config's long-term home (static list vs. persisted table) — remains the open
  question noted in `DESIGN-PROPOSAL.md` §7/§15; `departmentRegistry` remains a static array not a
  resolution of it. `departmentRegistry` still lists Signal Foundry, Prototype Department, and
  Creative Practice Engine as `planned` literals even though nothing this checkpoint reads them
  (`02-ARCHITECTURE.md` Open Items #2) — left in place as the natural seed for the deferred future
  Departments/Settings surfaces above, not deleted and re-authored later.
- Exact hex values, font-family stacks, and other PROVISIONAL specifics left open by
  `03-UI-SPEC.md`'s Visual Direction section — the direction and constraints are binding this
  checkpoint; the exact tokens remained the implementer's judgment call within those constraints,
  not re-litigated slice by slice.
- E2E test framework — both slices above used React Testing Library render/interaction tests only;
  no Playwright/Cypress-equivalent was introduced.
</content>
