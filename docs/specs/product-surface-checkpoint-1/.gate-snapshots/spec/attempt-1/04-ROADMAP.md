# Roadmap: Product Surface — Checkpoint 1

**Feeds**: `01-REQUIREMENTS.md` (US-1–US-6 — see its Acceptance Criteria section for the
authoritative per-story breakdown; this document references that section by pointer and does not
restate the AC count), `02-ARCHITECTURE.md` (Sections 1–11), `03-UI-SPEC.md` (3 screens, 6 flows).

## Scope Discipline

Checkpoint 1 has no runtime/schema/generation-pipeline decision to make — `02-ARCHITECTURE.md` §1
already fixes the scope boundary (three read models, three GET routes, one POST wrapper, a React
SPA, Vite tooling) against the existing, unchanged Slices 1-9 backend. This roadmap sequences that
fixed scope into slices that each produce something loadable in a browser (per this project's
Build Principles, "no long invisible tunnels" — `docs/product-architecture-and-direction.md` §10),
after an unavoidable first foundation slice that both backend and every screen depend on. No slice
invents a file `02-ARCHITECTURE.md`/`03-UI-SPEC.md` did not already name.

---

## Dependency Map

| Unit | Depends On |
|---|---|
| `src/types/readModels.ts`, `src/config/departments.ts`, `src/services/lastActivity.ts` | — |
| `getDepartmentsView`, `getMissionControlView`, `getProblemDepartmentOverview` (services) | types + `departmentRegistry` + `lastActivity` |
| `src/web/apiRoutes.ts` (3 GET + POST), `express.json()` in `server.ts` | the three services |
| `src/client/` Vite scaffold (`App.tsx`, `main.tsx`, `api.ts`, router, `vite.config.ts`), dev/build integration (`server.ts` static catch-all) | API routes exist and are callable |
| `DepartmentsScreen` (+ `DepartmentRow`, `DepartmentEntryLink`) | client scaffold, `getDepartmentsView` |
| `ProblemDepartmentScreen` (+ `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState`, `StartInvestigationForm`, `SourcesEvidenceCounts`, `RunsActivityPanel`) | client scaffold, `getProblemDepartmentOverview`, `POST /api/investigations` |
| `MissionControlScreen` (+ `InstalledDepartmentsStrip`, `ActiveWorkSection`, `ActiveActivityPanel`, `RecentSection`, `PlannedDepartmentsNote`) | client scaffold, `getMissionControlView` |

---

## Slice Overview

| Slice | Goal | Depends On | Architecture / UI Covered |
|---|---|---|---|
| 1 | Read-model + API foundation, client scaffold booted and callable against real endpoints | — | §2 services/routes, §3 types, §4 `lastActivityAt`, §5 API contracts, §7 dev/build tooling |
| 2 | Departments directory screen | 1 | Screen: Departments Directory; US-2 |
| 3 | Problem Department overview screen (portfolio, counts, runs, Start Investigation) | 1, 2 | Screen: Problem Department Overview; US-3, US-4 (portfolio/link-target half), US-5 |
| 4 | Mission Control screen (strip, active-work groups, activity panel, recent lists) | 1, 2, 3 | Screen: Mission Control; US-1, US-4 (recent-ordering half), US-6 |

4 slices cover every component in `02-ARCHITECTURE.md` §2's table and every screen/component in
`03-UI-SPEC.md`'s Component Hierarchy. Order runs foundation → simplest screen (no last-activity
computation, no mutation) → the screen most of the ACs concentrate in (portfolio, Start
Investigation) → the screen that depends conceptually on both prior screens' data shapes being
proven (Mission Control reuses `getDepartmentsView`'s registry and mirrors
`getProblemDepartmentOverview`'s portfolio/activity patterns, plus is the most AC-dense of the
three for the "three independent groups" requirement, US-6).

---

## Slice Detail

### Slice 1: Read-Model + API Foundation, Client Scaffold

**Goal:** All three read-model services and their routes are live and independently curl-able
against the real dev database, and the Vite-built React app boots at `/` behind Express with
working client-side routing shells (empty/placeholder screens acceptable) — a human can load the
dev server in a browser and see the SPA shell resolve all three routes without a 404, and can curl
all three GET endpoints and the POST endpoint and get real JSON back.

**Depends On:** —

**Files:**
- `src/types/readModels.ts` — create (verbatim types per `02-ARCHITECTURE.md` §3)
- `src/config/departments.ts` — create (`DEPARTMENTS` registry; planned-Department thesis strings
  copied verbatim from `docs/product-architecture-and-direction.md` §3 per Architecture §5.3's open
  item)
- `src/services/lastActivity.ts` — create (`LAST_ACTIVITY_SUBQUERY`, §4)
- `src/services/getMissionControlView.ts` — create (§5.3 queries 1-8; §2)
- `src/services/getDepartmentsView.ts` — create (§5.3)
- `src/services/getProblemDepartmentOverview.ts` — create (§5.3)
- `src/web/apiRoutes.ts` — create (`GET /api/mission-control`, `GET /api/departments`,
  `GET /api/problem-department`, `POST /api/investigations`, §5.1)
- `src/web/server.ts` — edit: add `express.json()`, mount `apiRoutes`, add production-only static
  catch-all serving `src/web/public/index.html`, registered after existing `/investigations/*` and
  new `/api/*` routes (§7, §10)
- `src/client/main.tsx`, `src/client/App.tsx`, `src/client/api.ts`, `src/client/vite.config.ts` —
  create (Vite scaffold, React Router with the 3 routes mounted to placeholder/loading-only screen
  stubs — real screen content is Slices 2-4's job, not this one's)
- `package.json` — edit: add dependencies (`react`, `react-dom`, `react-router-dom`, `vite`,
  `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@testing-library/react`,
  `@testing-library/jest-dom`, §9), add `dev:client` and `build` scripts per §7

**Implementation Notes:**
- Every service queries `src/db/pool.ts`'s existing exported `pool` — no new connection setup
  (§10).
- `POST /api/investigations` calls the existing `submitSources`/`resolveInvestigationSources`/
  `transitionInvestigationStatus` exports verbatim, unchanged signatures (§5.1, US-5 AC1) — do not
  refactor those services to accommodate this route.
- The three route stubs in `App.tsx` this slice may render nothing but a loading indicator or a
  literal placeholder string per route — the AC this slice must satisfy is "route resolves, no
  404, correct component mounts," not "screen is fully specified." Slices 2-4 replace the stub
  bodies; they do not touch routing itself again.
- `src/web/public/` remains build-output only — no hand-authored file added there (§7).
- No migration, no schema change (§10) — if a query in this slice appears to need one, stop and
  re-read `02-ARCHITECTURE.md` §1's scope boundary before writing it.

**Tests:**
- [ ] `getMissionControlView`, `getDepartmentsView`, `getProblemDepartmentOverview`: integration
      test per query asserting results match real persisted rows (per Requirements Constraint —
      same test discipline as existing services), including each function's zero-Investigation
      empty-shape behavior (Edge Cases table row 6).
- [ ] `LAST_ACTIVITY_SUBQUERY`: test that an Investigation with no `GenerationRun`/`GenerationStep`/
      `BriefVersion` rows resolves `last_activity_at` to `investigation.created_at` (Edge Cases
      table row 3).
- [ ] `POST /api/investigations`: integration test — valid submission returns 201 with
      `investigationId`/`status`; zero-artifact body returns 400; unreachable-source submission
      resolves `status: 'blocked'`.
- [ ] Each GET route: integration test asserting 200 + response shape matches its interface, never
      500 on an empty database.
- [ ] Client scaffold: render test confirming `App` mounts and each of the 3 routes resolves to its
      (stub) screen component without a routing error.

**Done When:**
- [ ] `curl localhost:<port>/api/mission-control`, `/api/departments`, `/api/problem-department`
      each return 200 and real/empty JSON matching their interface against the live local dev
      database.
- [ ] `curl -X POST localhost:<port>/api/investigations` with a valid body returns 201 and the new
      Investigation is visible via a direct `SELECT` against `investigation`.
- [ ] `npm run dev:client` + `npm run dev` running together, loading `/`, `/departments`, and
      `/departments/problem-department` in a browser each resolves without a 404 or blank crash.
- [ ] All tests above pass.
- [ ] No Slice 1-9 service file, schema, or migration was modified.

---

### Slice 2: Departments Directory Screen

**Goal:** Loading `/departments` in a browser shows all four Departments with name, thesis, and
status, and only Problem Department's row is clickable and navigates to
`/departments/problem-department` (US-2 — see 01-REQUIREMENTS.md's US-2 Acceptance Criteria).

**Depends On:** Slice 1

**Files:**
- `src/client/screens/DepartmentsScreen.tsx` — create
- `src/client/App.tsx` — edit: wire `/departments` route to the real `DepartmentsScreen` (replacing
  Slice 1's stub)

**Implementation Notes:**
- Entry-link rendering is derived client-side (`status === 'installed'`) per Architecture §5.3 —
  no new API field for "is clickable."
- The other three rows render `status` as plain text with no wrapping interactive element at all —
  not `<button disabled>`, not a greyed-out link (US-2 AC2, UI Spec's literal reading).
- Loading/error states follow UI Spec § Interactions "Page-Load Fetch" — one loading indicator, one
  error message, visually distinct from each other.
- No component beyond `DepartmentsScreen` + inline `DepartmentRow`/`DepartmentEntryLink`
  presentational elements is needed — these are layout subdivisions per UI Spec's hierarchy, not
  separate files unless the implementer finds the single-file version unwieldy.

**Tests:**
- [ ] Render test: 4 rows render with correct name/thesis/status text from a mocked
      `DepartmentsView` payload.
- [ ] Render test: only the Problem Department row renders an anchor/link element; the other three
      render no interactive element.
- [ ] Interaction test: clicking the Problem Department row navigates to
      `/departments/problem-department` (client-side, no full reload).
- [ ] Loading and error states render distinctly (per UI Spec § Interactions).

**Done When:**
- [ ] `/departments` loaded in a browser shows all 4 Departments; clicking Problem Department's row
      lands on `/departments/problem-department` (even if that screen is still Slice 1's stub at
      this point).
- [ ] All tests above pass.

---

### Slice 3: Problem Department Overview Screen

**Goal:** Loading `/departments/problem-department` in a browser shows the Department header, full
Investigation portfolio (row-for-row matching `investigation`), Sources/Evidence counts, recent
Runs/Activity, and a working Start Investigation form that creates a real Investigation and
refreshes the portfolio (US-3, US-4's portfolio-link half, US-5 — see 01-REQUIREMENTS.md's
US-3/US-4/US-5 Acceptance Criteria).

**Depends On:** Slice 1, Slice 2 (navigates from the Departments directory; screen itself has no
runtime dependency on Slice 2's code, only on being reachable from it for the full flow)

**Files:**
- `src/client/screens/ProblemDepartmentScreen.tsx` — create
- `src/client/components/InvestigationPortfolioTable.tsx` — create
- `src/client/components/InvestigationPortfolioEmptyState.tsx` — create
- `src/client/components/StartInvestigationForm.tsx` — create
- `src/client/App.tsx` — edit: wire `/departments/problem-department` route to the real screen

**Implementation Notes:**
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
- The last-active-Investigation link renders pointing at
  `/departments/problem-department/investigations/:id` even though no route resolves it this
  checkpoint (US-4 AC2, UI Spec § Screen D Link Target) — render the correct `href`/route string,
  do not invent a placeholder destination or disable the link.

**Tests:**
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
- [ ] Render test: last-active-Investigation link renders the correct `href` string.

**Done When:**
- [ ] `/departments/problem-department` loaded in a browser (with existing local dev Investigations
      present) shows every row from `SELECT id, status, created_at FROM investigation`, row-for-row,
      real Sources/Evidence counts, and real recent runs.
- [ ] Submitting a new source via the on-screen form creates a real Investigation (verifiable via
      direct `SELECT`) and it appears in the portfolio without a manual page reload.
- [ ] Loading zero-Investigation dev state (or a scratch/empty DB) renders the exact empty-state
      copy, never a blank/loading-styled screen.
- [ ] All tests above pass.

---

### Slice 4: Mission Control Screen

**Goal:** Loading `/` in a browser shows the Installed Departments strip, three independently-
sourced Active-work groups, the GenerationRun-level activity panel, recency-ordered recent lists,
and the planned-Departments note (US-1, US-4's recency-ordering half, US-6 — see
01-REQUIREMENTS.md's US-1/US-4/US-6 Acceptance Criteria).

**Depends On:** Slice 1, Slice 2, Slice 3 (Mission Control links toward both other screens' routes
and mirrors their loading/error/list-rendering patterns; building it last means those patterns are
already proven working end-to-end against real data before Mission Control's higher AC density is
tackled)

**Files:**
- `src/client/screens/MissionControlScreen.tsx` — create
- `src/client/App.tsx` — edit: wire `/` route to the real screen (replacing Slice 1's stub)

**Implementation Notes:**
- `activeWork.active` / `.needsAttention` / `.recentCompleted` render as three separately labeled,
  separately rendered sibling sections — never merged into one list with a computed badge (US-6
  AC-derived rendering rule, UI Spec Flow US-6 step 2/4). Each independently renders its own empty
  state when its array is empty; the three-section structure stays visible at zero (UI Spec §
  Screen: Mission Control, "Sections" table note).
- `activeActivity` renders `GenerationRunSummary[]` rows only — never a `currentComponent` field,
  since the type itself carries none (Architecture §3, Anti-Patterns).
- `PlannedDepartmentsNote` is derived client-side from `departments` where `status === 'planned'` —
  no separate API field (UI Spec § Screen: Mission Control Sections table).
- Recent Investigations list is ordered by `lastActivityAt` desc, sourced directly from
  `MissionControlView.recent.investigations` — no client-side re-sort or re-derivation of recency
  (US-4 AC3).
- No polling/interval refetch anywhere on this screen (Architecture §8 Anti-Patterns) — one fetch
  on mount, same as the other two screens.

**Tests:**
- [ ] Render test: Installed Departments strip shows exactly 1 `installed` tile and 3 `planned`
      tiles, with no activity numbers on the `planned` tiles.
- [ ] Render test: three Active-work groups render as separate labeled sections from independent
      mocked arrays, including each group's own empty state when its array is empty.
- [ ] Render test: activity panel rows render only `GenerationRunSummary` fields, never
      `currentComponent`.
- [ ] Render test: recent Investigations/Briefs/Evidence lists render in the order provided by the
      mocked payload (no client re-sort).
- [ ] Render test: planned-Departments note renders and names all three planned Departments.

**Done When:**
- [ ] `/` loaded in a browser against the live local dev database shows real strip status, real
      Active/Needs-Attention/Recent-Completed membership, real activity rows, and real recent lists
      — no fabricated or hardcoded activity data anywhere on the screen.
- [ ] All tests above pass.
- [ ] Full end-to-end manual walkthrough works: `/` → click Problem Department tile/nav →
      `/departments` → click Problem Department row → `/departments/problem-department` → submit a
      new Investigation → return to `/` and see it reflected in the appropriate Active-work group
      and recent list.

---

## Sequence Rules

1. Complete each slice fully (including its tests and Done-When checklist) before starting the
   next — no partial slice work carried forward.
2. Slice 1 is a hard prerequisite for all others — no screen slice begins against stub/mocked API
   routes only; the real routes and services must be live first.
3. If a slice's implementer finds it needs a file, route, or table not named in
   `02-ARCHITECTURE.md`/`03-UI-SPEC.md`, that is a signal to HALT and return to spec, not to
   improvise it in-slice.
4. If blocked, HALT and report — do not skip ahead to a later slice to "make progress" while a
   blocking slice is incomplete.
5. No new slices without human approval; no slice is silently split or merged mid-implementation.

---

## Deferred (Not This Roadmap)

- Investigation Workspace (Screen D) and its route (`/departments/problem-department/
  investigations/:id`) — link targets are rendered this checkpoint (Slice 3, Slice 4) but the
  destination is not built (Checkpoint 2/3 per `01-REQUIREMENTS.md` Out of Scope).
- `generation_component_event` table, `recordComponentEvent`, live per-component activity display,
  any polling/live-update mechanism — Checkpoint 3 scope, not designed or stubbed here.
- `POST /api/investigations/:id/generation-runs` or any browser-triggered generation — Checkpoint
  2/3 scope.
- `/evidence`, `/runs`, `/knowledge` Core-wide routes — reserved/designed in `DESIGN-PROPOSAL.md`
  §8a, not built this checkpoint.
- Pagination or a "recent N" cap on Mission Control's recent lists — no owner/citation exists yet
  for such a number (Architecture §3 PROVISIONAL note); not introduced speculatively in any slice
  above.
- `Department` config's long-term home (static list vs. persisted table) — remains the open
  question noted in `DESIGN-PROPOSAL.md` §7/§15; Slice 1's static `departmentRegistry` is not a
  resolution of it.
- E2E test framework — all four slices above use React Testing Library render/interaction tests
  only, per `INTERVIEW.md` #3; no Playwright/Cypress-equivalent is introduced.
