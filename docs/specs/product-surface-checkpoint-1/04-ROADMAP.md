# Roadmap: Product Surface — Checkpoint 1

**Feeds**: `01-REQUIREMENTS.md` (see its User Stories section for the full list; this document
references that section by pointer and does not restate the story range or AC count),
`02-ARCHITECTURE.md` (Sections 1–11), `03-UI-SPEC.md` (see its Screens table and User Flows
section for the full screen/flow list — not restated here per repo-wide
no-manually-asserted-counts discipline).

## Scope Discipline

Checkpoint 1 has no runtime/schema/generation-pipeline decision to make — `02-ARCHITECTURE.md` §1
already fixes the scope boundary (three read models, three GET routes, one POST wrapper, a React
SPA, Vite tooling) against the existing, unchanged Slices 1-9 backend. No slice invents a file
`02-ARCHITECTURE.md`/`03-UI-SPEC.md` did not already name.

**Sequencing principle (Danny's ruling, binding on this roadmap):** the sequence must not repeat
the backend-first pattern. Slice 1 produces a recognizable Mission Control shell in the browser —
`03-UI-SPEC.md`'s binding Visual Direction section (typography, palette, spacing/border treatment,
`PersistentNav`, the Mission Control layout structure) is real and on-screen from Slice 1 onward,
even where a panel's underlying data is sparse because the local dev database has little seeded
activity yet. Every slice from Slice 1 onward begins its Goal with the literal text
"PRODUCT CHANGE:" — naming what Danny can see or do now that he couldn't before — matching the
convention used in `docs/specs/product-surface/DESIGN-PROPOSAL.md` §12's checkpoint descriptions,
and ends with an explicit browser-demonstration criterion.

This checkpoint is sequenced as **3 slices**, not 4: Mission Control's three GET routes/services
divide cleanly along screen boundaries (Mission Control, Departments, Problem Department), and
`getMissionControlView`'s full 9-query shape (§5.3) is built once, complete, in Slice 1 —
splitting the Mission Control service itself into a "sparse first pass" slice and a "fill in real
data" slice would mean writing the same 9 queries under two different slice headings for no
independent-testability gain (the "sparseness" Danny's ruling anticipates is a property of the
local dev database's seed data at demo time, not of the service's completeness — `01-REQUIREMENTS.md`
requires the API to return its full documented shape unconditionally, empty arrays included, so a
partially-built `getMissionControlView` is not a real option under this checkpoint's own AC set).
Departments directory and Problem Department overview remain their own slices because they are
independently reachable screens with their own routes, components, and ACs.

---

## Dependency Map

| Unit | Depends On |
|---|---|
| `src/types/readModels.ts`, `src/config/departments.ts`, `src/services/lastActivity.ts` | — |
| `getMissionControlView` (service) | types + `departmentRegistry` + `lastActivity` |
| `getDepartmentsView` (service) | types + `departmentRegistry` |
| `getProblemDepartmentOverview` (service) | types + `departmentRegistry` + `lastActivity` |
| `src/web/apiRoutes.ts` (GET routes added incrementally, POST added in Slice 3), `express.json()` in `server.ts` | the corresponding service(s) |
| `src/client/` Vite scaffold (`App.tsx`, `main.tsx`, `api.ts`, router, `vite.config.ts`), dev/build integration (`server.ts` static catch-all) | `GET /api/mission-control` (Slice 1's minimum callable route) |
| `PersistentNav` | client scaffold (`App.tsx` router, `react-router-dom`'s `NavLink`) — no read-model dependency |
| `MissionControlScreen` (+ `InstalledDepartmentsStrip`, `ActiveWorkSection`, `ActiveActivityPanel`, `RecentSection`, `PlannedDepartmentsNote`) | client scaffold, `getMissionControlView` |
| `DepartmentsScreen` (+ `DepartmentRow`, `DepartmentEntryLink`) | client scaffold, `getDepartmentsView` |
| `ProblemDepartmentScreen` (+ `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState`, `StartInvestigationForm`, `SourcesEvidenceCounts`, `RunsActivityPanel`) | client scaffold, `getProblemDepartmentOverview`, `POST /api/investigations` |

---

## Slice Overview

| Slice | Goal (PRODUCT CHANGE) | Depends On | Architecture / UI Covered |
|---|---|---|---|
| 1 | Danny loads `/` and sees a real, on-brand Mission Control screen — persistent nav, Departments strip, four Active-work groups, activity panel, recent lists, planned-Departments note — all wired to the real `GET /api/mission-control` endpoint | — | §2 services/routes/`PersistentNav`/`MissionControlScreen`, §3 types, §4 `lastActivityAt`, §5.1/§5.2/§5.3 (Mission Control), §6 router+`App`, §7 dev/build tooling, `03-UI-SPEC.md` Visual Direction + Screen: Mission Control + Flows US-1, US-4 (recent-list half), US-6, US-7 (nav mounted, proven on this one real screen) |
| 2 | Danny clicks "Departments" in the nav and sees all four Departments with an honest installed/planned status, and can click into Problem Department | 1 | §2/§5.3/§6 `getDepartmentsView`/`DepartmentsScreen`, `03-UI-SPEC.md` Screen: Departments Directory + Flow US-2 |
| 3 | Danny clicks into Problem Department and sees the full live Investigation portfolio, Sources/Evidence counts, recent runs, and can start a new Investigation from the screen — with the last-active Investigation reachable from both Mission Control and this screen via a real link to the existing legacy view | 1, 2 | §2/§5.1/§5.3/§6 `getProblemDepartmentOverview`/`ProblemDepartmentScreen`/`POST /api/investigations`, `03-UI-SPEC.md` Screen: Problem Department Overview + Flows US-3, US-4 (legacy-link half), US-5 |

Order runs Mission Control (the whole-environment orientation screen and the one every other
screen is reachable from) → Departments directory (the second click any real session makes) →
Problem Department overview (the deepest, AC-densest screen, reachable only via the Departments
directory built in Slice 2). Every slice after Slice 1 is additive to the router (Slice 1's `App`
already declares all three route paths so `PersistentNav` and direct/hard-loaded URLs never 404 at
any point in the sequence — see Slice 1 Implementation Notes for what the two not-yet-built routes
render in the interim) and to `src/web/apiRoutes.ts` (each slice adds only the route(s) its own
screen needs).

---

## Slice Detail

### Slice 1: Mission Control Shell (Full Data)

**Goal:** PRODUCT CHANGE — Danny runs the dev server, loads `/` in a browser, and sees a real
Mission Control screen carrying Department OS's actual visual identity (per `03-UI-SPEC.md`'s
binding Visual Direction section: two-family typography, the restrained neutral-plus-semantic-
accent palette, hairline section delineation, the persistent left-nav shell) — not a bare unstyled
scaffold and not a placeholder string. The Installed Departments strip, all four Active-work
groups, the activity panel, the three recent lists, and the planned-Departments note are wired to
the real `GET /api/mission-control` endpoint end to end; any group/list is honestly empty if the
local dev database has no matching rows, never fabricated.

**Depends On:** —

**Files:**
- `src/types/readModels.ts` — create (verbatim types per `02-ARCHITECTURE.md` §3)
- `src/config/departments.ts` — create (`DEPARTMENTS` registry, verbatim thesis strings per
  `02-ARCHITECTURE.md` §5.3)
- `src/services/lastActivity.ts` — create (`LAST_ACTIVITY_SUBQUERY`, §4)
- `src/services/getMissionControlView.ts` — create (all 9 queries per §5.3: departments,
  `activeWork.active`, `.readyNotStarted`, `.needsAttention`, `.recentCompleted`, `activeActivity`,
  `recent.investigations`, `.briefs`, `.evidence`)
- `src/web/apiRoutes.ts` — create (`GET /api/mission-control` only this slice, §5.1)
- `src/web/server.ts` — edit: add `express.json()`, mount `apiRoutes`, add production-only static
  catch-all serving `src/web/public/index.html`, registered after existing `/investigations/*` and
  new `/api/*` routes, with the `req.path.startsWith('/api/')` → 404 guard (§7, §10)
- `src/client/main.tsx`, `src/client/App.tsx`, `src/client/api.ts` — create (Vite scaffold, React
  Router with the three named routes per §6 — `/`, `/departments`,
  `/departments/problem-department` — `PersistentNav` mounted once as a sibling to `<Routes>`;
  `fetchMissionControl` is the only `apiClient` function implemented this slice, the other three
  `api.ts` functions are added in Slices 2 and 3)
- `src/client/vite.config.ts` — create, copied verbatim from `02-ARCHITECTURE.md` §7's corrected
  sketch (explicit `root` via `path.dirname(fileURLToPath(import.meta.url))`, matching the existing
  `src/db/migrate.ts` pattern; `outDir` resolves to `../web/public`)
- `src/client/components/PersistentNav.tsx` — create (two `NavLink`s — "Mission Control" → `/`,
  "Departments" → `/departments" — per `02-ARCHITECTURE.md` §2, US-7; styled per `03-UI-SPEC.md`
  Visual Direction as a fixed-width left column sharing the shell's typography/spacing/palette)
- `src/client/screens/MissionControlScreen.tsx` — create (Installed Departments strip, four
  Active-work group sections, activity panel, three recent lists, planned-Departments note, per
  `03-UI-SPEC.md` Screen: Mission Control layout and Visual Direction)
- `package.json` — edit: add dependencies (`react`, `react-dom`, `react-router-dom`, `vite`,
  `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@testing-library/react`,
  `@testing-library/jest-dom`, §9), add `dev:client` and `build` scripts per §7

**Implementation Notes:**
- Every service queries `src/db/pool.ts`'s existing exported `pool` — no new connection setup
  (§10). No migration, no schema change — if a query in this slice appears to need one, stop and
  re-read `02-ARCHITECTURE.md` §1's scope boundary before writing it.
- `App.tsx` declares all three route paths this slice, matching §6's exactly-three-routes,
  no-catch-all router shape from the start — but only `/` renders its real screen
  (`MissionControlScreen`) this slice. `/departments` and `/departments/problem-department` render
  a minimal, honest "not built yet this slice" loading-style placeholder INLINE in `App.tsx` (not
  a separate named component and not the removed `InvestigationWorkspacePlaceholder` pattern —
  that component does not exist in this checkpoint at all, per `02-ARCHITECTURE.md` §1/§6's
  removal of it and the fourth route). Slices 2 and 3 replace these two inline stub bodies with
  their real screens; they do not touch the route declarations themselves again.
- `PersistentNav` is mounted once at the `App` shell level, outside the `<Routes>` switch, so it is
  never remounted on navigation (§2, US-7 AC1) — Slices 2-3 must not re-declare or re-mount it.
- `MissionControlScreen`'s styling is the first implementation of `03-UI-SPEC.md`'s Visual
  Direction section (typography scale, palette, spacing unit, section delineation) — Slices 2 and 3
  reuse these same tokens/patterns for their own screens rather than inventing new ones; this slice
  is where the shared visual language is established.
- `src/web/public/` remains build-output only — no hand-authored file added there (§7).

**Tests:**
- [ ] `getMissionControlView`: integration test per query (all 9, §5.3) asserting results match
      real persisted rows, including the zero-Investigation empty-shape behavior (Edge Cases table
      row 6).
- [ ] `getMissionControlView`: integration test — given a real, persisted Investigation row with
      `status = 'open'` and zero `GenerationRun` rows, then it appears in `activeWork.readyNotStarted`
      and is absent from `active`, `needsAttention`, and `recentCompleted` (US-6, Edge Cases table
      row 5 — this replaces any prior, now-superseded assumption that such a row belongs in
      `active`).
- [ ] `getMissionControlView`: integration test — given a real, persisted Investigation row with an
      in-progress `GenerationRun`, then it appears in `activeWork.active` only (US-6 AC1).
- [ ] `LAST_ACTIVITY_SUBQUERY`: test that an Investigation with no `GenerationRun`/`GenerationStep`/
      `BriefVersion` rows resolves `last_activity_at` to `investigation.created_at` (Edge Cases
      table row 3).
- [ ] `GET /api/mission-control`: integration test asserting 200 + response shape matches
      `MissionControlView`, never 500 on an empty database.
- [ ] Client scaffold: render test confirming `App` mounts and all three route paths resolve
      without a routing error (the two not-yet-built routes rendering their inline stub, `/`
      rendering `MissionControlScreen`).
- [ ] `PersistentNav`: render test confirming exactly two links render — "Mission Control" (→ `/`)
      and "Departments" (→ `/departments`) — and no link to `/activity`, `/knowledge`, or any other
      Core-wide route exists (US-7 AC2, AC4).
- [ ] `PersistentNav`: interaction test confirming a click on either link updates the URL via
      client-side routing with no full page reload, and that `PersistentNav` itself is not
      remounted across the navigation (US-7 AC1, AC3).
- [ ] `MissionControlScreen`: render test — Installed Departments strip shows exactly 1 `installed`
      tile and 3 `planned` tiles, with no activity numbers on the `planned` tiles.
- [ ] `MissionControlScreen`: render test — the four Active-work groups render as separate labeled
      sections from independent mocked arrays, including each group's own empty state when its
      array is empty.
- [ ] `MissionControlScreen`: render test — activity panel rows render only `GenerationRunSummary`
      fields, never a `currentComponent` field.
- [ ] `MissionControlScreen`: render test — recent Investigations/Briefs/Evidence lists render in
      the order provided by the mocked payload (no client re-sort).
- [ ] `MissionControlScreen`: render test — the recent-Investigations top row's last-active link
      renders as a plain `<a href="/investigations/{id}">` element (not a router `<Link>`) (US-4
      AC2, Flow US-4).
- [ ] `MissionControlScreen`: Page-Load Fetch loading/error states render distinctly from each
      other and from the populated state (§ Interactions).

**Done When:**
- [ ] `curl localhost:<port>/api/mission-control` returns 200 and real/empty JSON matching
      `MissionControlView` against the live local dev database.
- [ ] `npm run dev:client` + `npm run dev` running together, `/` loaded in a browser, shows the
      persistent nav, Departments strip, all four Active-work groups (each honestly empty or
      populated per real dev data), activity panel, recent lists, and planned-Departments note —
      styled per `03-UI-SPEC.md`'s Visual Direction (not a default/unstyled page) — with no
      fabricated data anywhere on the screen.
- [ ] Loading `/departments` and `/departments/problem-department` directly in the same browser
      session resolves without a 404 or blank crash (inline stub content acceptable this slice),
      with `PersistentNav` visible on both.
- [ ] All tests above pass.
- [ ] No Slice 1-9 service file, schema, or migration was modified.

---

### Slice 2: Departments Directory Screen

**Goal:** PRODUCT CHANGE — Danny clicks "Departments" in the persistent nav (or loads
`/departments` directly) and sees all four Departments listed with name, thesis, and an honest
installed/planned status, with only Problem Department's row clickable, taking him into
`/departments/problem-department` (US-2 — see `01-REQUIREMENTS.md`'s US-2 Acceptance Criteria).

**Depends On:** Slice 1

**Files:**
- `src/services/getDepartmentsView.ts` — create (§5.3 — no query, maps `departmentRegistry` 1:1)
- `src/web/apiRoutes.ts` — edit: add `GET /api/departments` (§5.1)
- `src/client/api.ts` — edit: add `fetchDepartments`
- `src/client/screens/DepartmentsScreen.tsx` — create
- `src/client/App.tsx` — edit: wire `/departments` route to the real `DepartmentsScreen`
  (replacing Slice 1's inline stub)

**Implementation Notes:**
- Entry-link rendering is derived client-side (`status === 'installed'`) per Architecture §5.3 —
  no new API field for "is clickable."
- The other three rows render `status` as plain text with no wrapping interactive element at all —
  not `<button disabled>`, not a greyed-out link (US-2 AC2, UI Spec's literal reading).
- Loading/error states follow UI Spec § Interactions "Page-Load Fetch" — one loading indicator, one
  error message, visually distinct from each other, reusing Slice 1's established visual tokens
  (typography scale, palette, spacing) rather than introducing new styling patterns.
- No component beyond `DepartmentsScreen` + inline `DepartmentRow`/`DepartmentEntryLink`
  presentational elements is needed — these are layout subdivisions per UI Spec's hierarchy, not
  separate files unless the implementer finds the single-file version unwieldy.

**Tests:**
- [ ] `getDepartmentsView`: unit/integration test asserting the returned `DepartmentsView` matches
      `departmentRegistry` exactly (name/thesis/status per entry, no counts).
- [ ] `GET /api/departments`: integration test asserting 200 + response shape matches
      `DepartmentsView`.
- [ ] Render test: 4 rows render with correct name/thesis/status text from a mocked
      `DepartmentsView` payload.
- [ ] Render test: only the Problem Department row renders an anchor/link element; the other three
      render no interactive element.
- [ ] Interaction test: clicking the Problem Department row navigates to
      `/departments/problem-department` (client-side, no full reload).
- [ ] Loading and error states render distinctly (per UI Spec § Interactions).

**Done When:**
- [ ] `curl localhost:<port>/api/departments` returns 200 and real JSON matching `DepartmentsView`.
- [ ] `/departments` loaded in a browser shows all 4 Departments; clicking Problem Department's row
      lands on `/departments/problem-department` (even if that screen is still Slice 1's inline
      stub at this point).
- [ ] All tests above pass.

---

### Slice 3: Problem Department Overview Screen

**Goal:** PRODUCT CHANGE — Danny clicks into Problem Department from the Departments directory and
sees the Department header, the full Investigation portfolio (row-for-row matching
`investigation`), Sources/Evidence counts, recent Runs/Activity, and a working "Start Investigation"
form that creates a real Investigation and refreshes the portfolio in the browser — plus a working
link to the last-active Investigation, from both this screen and Mission Control's recent list,
that takes him to the existing legacy `/investigations/:id` view (US-3, US-4, US-5 — see
`01-REQUIREMENTS.md`'s US-3/US-4/US-5 Acceptance Criteria).

**Depends On:** Slice 1, Slice 2 (navigates from the Departments directory; screen itself has no
runtime dependency on Slice 2's code, only on being reachable from it for the full flow)

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
- `src/client/App.tsx` — edit: wire `/departments/problem-department` route to the real screen
  (replacing Slice 1's inline stub)

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
  US-5 step 1) — implement it once, mount it in both places, not two components.
- On successful submission (`onSubmitted`), `ProblemDepartmentScreen` re-fetches
  `GET /api/problem-department` — a one-shot refetch triggered by the submit event, never a
  polling/interval loop (Architecture §8 Anti-Patterns).
- On submission failure, the inline error renders next to the form and the portfolio is NOT
  re-fetched (UI Spec Flow US-5 Error path) — form values are preserved, not cleared.
- The last-active-Investigation link is a plain `<a href="/investigations/{id}">` — a real,
  full-page navigation to the EXISTING legacy Express route `GET /investigations/:id`
  (`src/web/server.ts:115-158`), labeled honestly as the current/legacy view — not a client-side
  route, not a placeholder component (US-4 AC2, `02-ARCHITECTURE.md` §2/§6, `03-UI-SPEC.md` §
  Interactions "Last-Active Investigation Link"). This is the same link pattern Slice 1 already
  implemented on Mission Control's recent-Investigations list; this slice implements the
  Problem-Department-overview instance of it, sourced from `lastActiveInvestigationId`.
- `SourcesEvidenceCounts` and `RunsActivityPanel` are presentational-only, rendering the counts and
  `GenerationRunSummary[]` slices already present on the fetched `ProblemDepartmentOverview` — no
  independent fetch of their own (§2, §8 Anti-Patterns).
- Styling reuses Slice 1/2's established visual tokens (typography scale, palette, spacing,
  section-delineation treatment per `03-UI-SPEC.md`'s Visual Direction) — no new styling pattern is
  introduced for this screen.

**Tests:**
- [ ] `getProblemDepartmentOverview`: integration test asserting the returned shape matches real
      persisted rows (portfolio, `lastActiveInvestigationId`, counts, `recentRuns`), including the
      zero-Investigation empty-shape behavior (Edge Cases table row 6).
- [ ] `GET /api/problem-department`: integration test asserting 200 + response shape matches
      `ProblemDepartmentOverview`, never 500 on an empty database.
- [ ] `POST /api/investigations`: integration test — valid submission returns 201 with
      `investigationId`/`status`; zero-artifact body returns 400; unreachable-source submission
      resolves `status: 'blocked'`.
- [ ] Render test: portfolio table renders every row from a mocked
      `ProblemDepartmentOverview.investigations`, matching id/status/createdAt/statusReason
      (present-only) fields.
- [ ] Render test: zero-Investigation payload renders `InvestigationPortfolioEmptyState` with the
      exact copy "No investigations yet — Start Investigation", and Sources/Evidence/Runs sections
      still render with zero values.
- [ ] Interaction test: changing the status filter re-renders the table to the filtered subset with
      no network call.
- [ ] Interaction test: submitting `StartInvestigationForm` with a valid artifact calls
      `POST /api/investigations` and, on success, triggers a portfolio refetch; on failure, renders
      an inline error and does not refetch.
- [ ] Render test: last-active-Investigation link renders as a plain `<a href="/investigations/{id}">`
      element (not a router `<Link>`) with the correct `href`.

**Done When:**
- [ ] `curl localhost:<port>/api/problem-department` returns 200 and real JSON matching
      `ProblemDepartmentOverview`.
- [ ] `curl -X POST localhost:<port>/api/investigations` with a valid body returns 201 and the new
      Investigation is visible via a direct `SELECT` against `investigation`.
- [ ] `/departments/problem-department` loaded in a browser (with existing local dev Investigations
      present) shows every row from `SELECT id, status, created_at FROM investigation`, row-for-row,
      real Sources/Evidence counts, and real recent runs.
- [ ] Submitting a new source via the on-screen form creates a real Investigation (verifiable via
      direct `SELECT`) and it appears in the portfolio without a manual page reload.
- [ ] Loading zero-Investigation dev state (or a scratch/empty DB) renders the exact empty-state
      copy, never a blank/loading-styled screen.
- [ ] Full end-to-end manual walkthrough works in a browser: `/` → click `PersistentNav`'s
      "Departments" link → `/departments` → click Problem Department row →
      `/departments/problem-department` → submit a new Investigation → click `PersistentNav`'s
      "Mission Control" link → `/` and see the new Investigation reflected in the appropriate
      Active-work group and recent list, with `PersistentNav` visibly unchanged/not remounted
      across every navigation in this walkthrough (US-7).
- [ ] All tests above pass.

---

## Sequence Rules

1. Complete each slice fully (including its tests and Done-When checklist) before starting the
   next — no partial slice work carried forward.
2. Slice 1 is a hard prerequisite for Slices 2 and 3 — no screen slice begins against stub/mocked
   API routes only; the real route(s) its own screen needs must be live first.
3. If a slice's implementer finds it needs a file, route, or table not named in
   `02-ARCHITECTURE.md`/`03-UI-SPEC.md`, that is a signal to HALT and return to spec, not to
   improvise it in-slice.
4. If blocked, HALT and report — do not skip ahead to a later slice to "make progress" while a
   blocking slice is incomplete.
5. No new slices without human approval; no slice is silently split or merged mid-implementation.

---

## Deferred (Not This Roadmap)

- Investigation Workspace (Screen D) itself and its real content — no client-side route or
  component is built for it this checkpoint at all (`02-ARCHITECTURE.md` §1/§6). The interim
  "last-active Investigation" link (Slices 1 and 3) reuses the already-working, already-shipped
  legacy `GET /investigations/:id` Express route instead — that is reused existing product
  behavior, not new scope, and is not a placeholder. The actual Investigation Workspace is
  Checkpoint 2/3 per `01-REQUIREMENTS.md` Out of Scope.
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
  question noted in `DESIGN-PROPOSAL.md` §7/§15; Slice 1's static `departmentRegistry` is not a
  resolution of it.
- Exact hex values, font-family stacks, and other PROVISIONAL specifics left open by
  `03-UI-SPEC.md`'s Visual Direction section — the direction and constraints are binding this
  checkpoint; the exact tokens remain the implementer's judgment call within those constraints, not
  re-litigated slice by slice.
- E2E test framework — all three slices above use React Testing Library render/interaction tests
  only; no Playwright/Cypress-equivalent is introduced.
</content>
