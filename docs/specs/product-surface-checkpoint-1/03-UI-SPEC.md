# UI Spec: Product Surface — Checkpoint 1

**Status**: Draft — pending Frank spec-gate
**Traces to**: `01-REQUIREMENTS.md` (see its User Stories section for the full list, and its
Acceptance Criteria section for the AC count), `02-ARCHITECTURE.md`,
`DESIGN-PROPOSAL.md` §2/§2a/§3/§4/§4a/§11 (Checkpoint-1 subset only).

Scope boundary restated (binding): exactly three screens — Mission Control (`/`), Departments
directory (`/departments`), Problem Department overview (`/departments/problem-department`).
Investigation Workspace (Screen D), generation-trigger UI, and any live/per-component activity
display are out of scope this checkpoint (Checkpoint 2/3).

---

## Screens

| Screen | Route | Purpose | Entry Point |
|---|---|---|---|
| Mission Control | `/` | Whole-environment orientation: what's installed, what's active, what's recent | App load / nav root |
| Departments directory | `/departments` | Honest listing of all four Departments, installed vs planned | Nav link from Mission Control's Installed Departments strip, or direct URL |
| Problem Department overview | `/departments/problem-department` | Durable, directory-framed view of Problem Department's Investigation portfolio, counts, runs, and Start Investigation entry point | Click on Problem Department's entry in the Departments directory (only entry with a click target) |

---

## User Flows

### Flow: US-1 — Load Mission Control and orient

1. User starts at: any URL, navigates to `/`.
2. User sees: loading state (see Interactions § Page-Load Fetch), then `MissionControlScreen`
   populated from `GET /api/mission-control`.
3. User sees: Installed Departments strip (1 installed, 3 planned, no counts on planned tiles),
   three Active-work groups, Active orchestrations panel (GenerationRun-level only), Recent lists,
   Planned-Departments note.
4. User action: none required — this is a read-only orientation screen.
5. End state: user either stays on Mission Control or navigates onward (to `/departments` or
   directly to a linked Investigation-in-portfolio target — see Flow: US-4).

**Success path:** every `MissionControlView` section renders with real data or an honest empty
array — the departments strip, each of the three active-work groups (active, needs-attention,
recent-completed) independently, the active-orchestrations/activity panel, and each of the recent
lists (investigations, briefs, evidence) independently.
**Error path:** fetch fails → screen renders a single error message in place of the sections
(see Interactions § Page-Load Fetch, Error state). No partial/mixed render of stale + new data.

### Flow: US-2 — Navigate Departments directory to Problem Department

1. User starts at: Mission Control, clicks a `PersistentNav` link to `/departments` (or loads the
   URL directly).
2. User sees: `DepartmentsScreen` — four rows (Problem Department, Signal Foundry, Prototype
   Department, Creative Practice Engine), each with name, one-line thesis, status text.
3. User sees: only the Problem Department row renders as a clickable element (a real link/button);
   the other three rows render as static text — no button-shaped, disabled-looking, or
   otherwise-implying-interactivity element.
4. User action: clicks the Problem Department row.
5. System response: client-side route transition (no full page reload) to
   `/departments/problem-department`.
6. End state: `ProblemDepartmentScreen` is shown, URL is `/departments/problem-department`.

**Success path:** as above.
**Error path:** N/A — this screen has no async mutation; a fetch failure follows the same
Error state pattern as Mission Control (§ Interactions).

### Flow: US-3 — View Problem Department portfolio

1. User starts at: `/departments/problem-department` (via Flow US-2, or direct URL / refresh).
2. User sees: loading state, then Department header (name, thesis, `installed` badge),
   Investigation portfolio table (every row, all statuses), Sources/Evidence counts, Runs/Activity
   list, Start Investigation entry point.
3. User action (optional): selects a status filter above the portfolio table.
4. System response: table re-renders client-side to only the matching rows — no network request.
5. End state: user reviews portfolio state, or proceeds to Flow US-5 (Start Investigation).

**Success path:** portfolio row-for-row matches the live `investigation` table.
**Zero-investigations path:** portfolio section renders `InvestigationPortfolioEmptyState`
("No investigations yet — Start Investigation") instead of an empty table — see § Interactions,
Empty State.
**Error path:** fetch fails → single error message in place of the whole screen body below the
header (see § Interactions).

### Flow: US-4 — Follow last-active Investigation link (link target only)

1. User starts at: Mission Control or Problem Department overview, either of which surfaces a
   "last-active Investigation" as a link (Mission Control: within `recent.investigations`,
   top-ordered; Problem Department overview: `lastActiveInvestigationId`-derived link).
2. User sees: the link is rendered pointing at
   `/departments/problem-department/investigations/:id` (Screen D's route).
3. User action: clicks the link.
4. System response: this checkpoint does not build Screen D — the link target exists (route
   string is correct) and client-side routing resolves it to an honest, explicit placeholder
   screen rather than a blank page or silent no-op. This is an explicit, documented gap inherited
   from `02-ARCHITECTURE.md` §6 ("link target only — Screen D itself is not built this
   checkpoint") — see § Interactions, Screen D Link Target for the exact rendering contract.
5. End state: user is shown `InvestigationWorkspacePlaceholder`, not Screen D itself — out of this
   checkpoint's scope, but never a broken or blank result from the app's own routing perspective
   (Screen D not existing is documented scope, not a defect to disguise).

### Flow: US-5 — Start Investigation from the Problem Department overview

1. User starts at: `/departments/problem-department`, either the Investigation portfolio (non-
   empty) or the empty state (zero Investigations) — `StartInvestigationForm` is present in both
   cases.
2. User sees: `StartInvestigationForm` (source-artifact input fields, submit control).
3. User action: enters one or more source artifacts, submits.
4. System response: `POST /api/investigations` is called (existing `submitSources` flow,
   unchanged). On success, the form triggers a re-fetch of `GET /api/problem-department`.
5. User sees: the portfolio table (or, if this was the first Investigation, the empty state is
   replaced by the now-populated portfolio) refreshed with the new row included.
6. End state: user is still on `/departments/problem-department`, new Investigation visible.

**Success path:** as above (US-5 AC2 — "appears in the portfolio on next load/refresh").
**Error path:** submission fails (e.g. no reachable source) → form renders an inline error message
adjacent to the form; the portfolio is NOT re-fetched (no successful submission occurred), no
optimistic row is added.

### Flow: US-6 — Distinguish Active / Needs Attention / Recent-Completed on Mission Control

1. User starts at: `/`, viewing the Active-work section.
2. User sees: three separately labeled, separately rendered lists — "Active", "Needs Attention",
   "Recent / Completed" — each backed by its own independent query result
   (`activeWork.active` / `.needsAttention` / `.recentCompleted`).
3. User action: none required (read-only); user may follow an Investigation link within any group
   (see Flow US-4's link-target caveat if it targets Screen D).
4. End state: user has correctly distinguished "running or ready-to-run" (Active: an Investigation
   with an in-progress `GenerationRun`, OR a brand-new `status='open'` Investigation with no
   `GenerationRun` rows at all yet) from "stalled/blocked" (Needs Attention) from "done" (Recent/
   Completed), per US-6's intent — no group is rendered merged with a computed badge.

### Flow: US-7 — Persistent cross-screen navigation

1. User starts at: any of the three in-scope screens.
2. User sees: `PersistentNav`, mounted once at the `App` shell level (outside `<Routes>`, so it is
   never remounted on route change), rendered as a left-side navigation panel with links to
   Mission Control and the Departments directory.
3. User action: clicks a `PersistentNav` link.
4. System response: client-side route transition (no full page reload) to the target screen; the
   nav itself does not re-render or flicker, since it persists across the transition rather than
   being torn down and rebuilt.
5. End state: user is on the destination screen, with `PersistentNav` still visible and unchanged
   in the same left-side position.

**Success path:** as above — see also § Interactions, Client-Side Route Navigation, and the
layout diagrams for all three in-scope screens, each of which shows `PersistentNav` in the same
left-side position.
**Error path:** N/A — `PersistentNav` performs no fetch and no mutation; it only drives client-side
route changes.

---

## Screen: Mission Control (`/`)

### Layout Structure

```
┌──────────────┬────────────────────────────────────────────┐
│ PersistentNav │ 1. Installed Departments strip               │
│              │    [Problem Department: installed]            │
│  Mission     │    [Signal Foundry: planned]                   │
│  Control     │    [Prototype Department: planned]             │
│              │    [Creative Practice: planned]                │
│  Departments │                                                │
│              ├────────────────────────────────────────────┤
│              │ 2. Active work — three sibling sections,      │
│              │    always all three, each independently       │
│              │    labeled and independently empty-able:      │
│              │    ┌──────────┐ ┌───────────────┐ ┌────────┐ │
│              │    │ Active    │ │ Needs Attention│ │ Recent/│ │
│              │    │           │ │                │ │Complete│ │
│              │    └──────────┘ └───────────────┘ └────────┘ │
│              ├────────────────────────────────────────────┤
│              │ 3. Active orchestrations / agent activity      │
│              │    panel (GenerationRun-level rows only, no    │
│              │    per-component detail)                        │
│              ├────────────────────────────────────────────┤
│              │ 4. Recent Investigations / Briefs / Evidence    │
│              │    (three sub-lists, ordered by lastActivityAt  │
│              │     where applicable — Investigations only;     │
│              │     Briefs/Evidence by their own createdAt      │
│              │     per §5.3 SQL)                                │
│              ├────────────────────────────────────────────┤
│              │ 5. Planned Departments note (explicit text)     │
└──────────────┴────────────────────────────────────────────┘
```

### Sections

| Section | Content | Data Source |
|---|---|---|
| Installed Departments strip | 4 tiles: name, status (`installed`/`planned`); no counts/activity on `planned` tiles | `MissionControlView.departments` |
| Active | `InvestigationSummary[]` — two member kinds, unioned: (1) Investigations with an in-progress `GenerationRun`, and (2) brand-new `status='open'` Investigations with zero `GenerationRun` rows at all (not yet started, not blocked/failed, not completed — "ready/waiting to run," per `02-ARCHITECTURE.md` §5.3's `activeWork.active` query, which deliberately includes both kinds so a brand-new Investigation is never miscategorized as stalled just because no run has started yet) | `MissionControlView.activeWork.active` |
| Needs Attention | `InvestigationSummary[]` — `status` in (`blocked`, `generation-failed`), no in-progress run | `MissionControlView.activeWork.needsAttention` |
| Recent / Completed | `InvestigationSummary[]` — `brief-generated` or most-recent non-in-progress run, deduped, recency-ordered | `MissionControlView.activeWork.recentCompleted` |
| Active orchestrations panel | `GenerationRunSummary[]` rows: run id, investigation id (linked), runtime identifier, outcome, started/completed timestamps — no `currentComponent` field, ever | `MissionControlView.activeActivity` |
| Recent Investigations | `InvestigationSummary[]`, ordered by `lastActivityAt` desc; top row is the "last-active Investigation" link target (Flow US-4) | `MissionControlView.recent.investigations` |
| Recent Briefs | `BriefSummary[]`, ordered by `createdAt` desc | `MissionControlView.recent.briefs` |
| Recent Evidence | `EvidenceSummary[]`, ordered by `createdAt` desc | `MissionControlView.recent.evidence` |
| Planned Departments note | Static explanatory text naming Signal Foundry, Prototype Department, Creative Practice Engine as not yet built | Derived client-side from `departments` where `status === 'planned'` (no separate API field) |

Each of Active / Needs Attention / Recent-Completed independently renders its own empty state
("No investigations in this group" or equivalent honest per-group text) when its array is empty —
never omitted or collapsed, so the three-group structure stays visible even at zero.

---

## Screen: Departments Directory (`/departments`)

### Layout Structure

```
┌──────────────┬────────────────────────────────────────────┐
│ PersistentNav │ Department row: Problem Department            │
│              │   name · thesis · "installed and operational"│
│  Mission     │   · [entry link]                              │
│  Control     ├────────────────────────────────────────────┤
│              │ Department row: Signal Foundry                 │
│  Departments │   name · thesis · "planned — not installed"   │
│              │   (no link)                                    │
│              ├────────────────────────────────────────────┤
│              │ Department row: Prototype Department            │
│              │   name · thesis · "planned — not installed"   │
│              │   (no link)                                    │
│              ├────────────────────────────────────────────┤
│              │ Department row: Creative Practice Engine        │
│              │   name · thesis · "planned — not installed"   │
│              │   (no link)                                    │
└──────────────┴────────────────────────────────────────────┘
```

### Sections

| Section | Content | Data Source |
|---|---|---|
| Department row (×4) | name, one-line thesis, status text | `DepartmentsView` (`DepartmentSummary[]`) |
| Entry link (Problem Department row only) | real anchor/router-link element to `/departments/problem-department` | derived client-side: rendered iff `status === 'installed'` |

The other three rows render `status` as plain text with no wrapping interactive element at all —
not a `<button disabled>`, not a greyed-out link, not a tooltip-bearing span. This is the literal
reading of "no click target rendered at all" (US-2 AC2, DESIGN-PROPOSAL.md §3).

---

## Screen: Problem Department Overview (`/departments/problem-department`)

### Layout Structure

```
┌──────────────┬────────────────────────────────────────────┐
│ PersistentNav │ 1. Department header: name · thesis ·         │
│              │    [installed] badge                           │
│  Mission     ├────────────────────────────────────────────┤
│  Control     │ 2. Investigation portfolio                      │
│              │    [status filter: all | open | blocked |      │
│  Departments │                     generation-failed |         │
│              │                     brief-generated]             │
│              │    ┌────────────────────────────────────┐     │
│              │    │ id | status | createdAt | statusReason│    │
│              │    │      (if present)                     │    │
│              │    │ ... one row per Investigation ...     │    │
│              │    └────────────────────────────────────┘     │
│              │    (zero rows -> InvestigationPortfolioEmpty-  │
│              │     State, see below)                           │
│              ├────────────────────────────────────────────┤
│              │ 3. Department-level Sources / Evidence counts   │
│              │    Sources: N   Evidence: N                     │
│              ├────────────────────────────────────────────┤
│              │ 4. Department-level Runs / Activity             │
│              │    (GenerationRunSummary[] rows, recent-first)  │
│              ├────────────────────────────────────────────┤
│              │ 5. Start Investigation (StartInvestigationForm) │
└──────────────┴────────────────────────────────────────────┘
```

When zero Investigations exist, section 2's table is replaced entirely by:

```
┌───────────────────────────────────────────────────────────┐
│ "No investigations yet — Start Investigation"                │
│ [StartInvestigationForm, inline]                              │
└───────────────────────────────────────────────────────────┘
```

Sections 3 and 4 still render (with `0` counts / empty run lists respectively, per the API's
"never a different shape when empty" contract) — the empty state replaces only section 2's table
body, not the whole screen.

### Sections

| Section | Content | Data Source |
|---|---|---|
| Department header | name, thesis, `installed` badge | `ProblemDepartmentOverview.department` |
| Investigation portfolio table | every `InvestigationSummary` row: `id`, `status`, `createdAt`, `statusReason` (rendered only when present — no placeholder), `lastActivityAt` (used for the last-active link, not necessarily displayed as its own column) | `ProblemDepartmentOverview.investigations` |
| Status filter control | client-side filter over the already-fetched list; options = `all` + every `InvestigationStatus` value present in the AC's enum (`open`, `blocked`, `generation-failed`, `brief-generated`) | `InvestigationPortfolioTableProps.statusFilter` (client state only, no refetch) |
| Last-active Investigation link | the row (or explicit indicator) matching `lastActiveInvestigationId`, linking to Screen D's route (Flow US-4) | `ProblemDepartmentOverview.lastActiveInvestigationId` |
| Sources / Evidence counts | two integers | `ProblemDepartmentOverview.sourceCount`, `.evidenceCount` |
| Runs / Activity | `GenerationRunSummary[]` rows, same shape/columns as Mission Control's activity panel | `ProblemDepartmentOverview.recentRuns` |
| Start Investigation | form: one or more source-artifact inputs (type + raw), submit | `StartInvestigationForm`, posts to `POST /api/investigations` |
| Empty state | exact copy "No investigations yet — Start Investigation" plus the same `StartInvestigationForm` | rendered when `investigations.length === 0` |

---

## Screen: Investigation Workspace Placeholder (`/departments/problem-department/investigations/*`)

Not one of the three in-scope screens (§ Screens above) — documented here only because Flow US-4's
link target must resolve to *something* honest rather than a blank page or silent no-op. This is
the client-side fallback rendered for any path under
`/departments/problem-department/investigations/:id` that this checkpoint does not build a real
screen for.

### Layout Structure

```
┌──────────────┬────────────────────────────────────────────┐
│ PersistentNav │ "Investigation Workspace — not built yet       │
│              │  (Checkpoint 2/3)"                             │
│  Mission     │                                                │
│  Control     │                                                │
│              │                                                │
│  Departments │                                                │
└──────────────┴────────────────────────────────────────────┘
```

### Sections

| Section | Content | Data Source |
|---|---|---|
| Placeholder message | exact copy "Investigation Workspace — not built yet (Checkpoint 2/3)" — static text, no fetch, no loading indicator, no styling that mimics the loading or error states of the three real screens | none — purely static |

---

## Interactions

### Page-Load Fetch (all three screens)

**Trigger:** screen mount (route entered, including via client-side nav from another screen).
**Component:** each screen's own `useEffect` calling its `apiClient` function once.
**Behavior:**
1. On mount, state is `{ data: null, error: null }` and the screen shows a single loading
   indicator in place of its data sections — this is one uniform "loading" treatment per screen,
   not a per-section skeleton (no live-polling view exists this checkpoint, so no
   skeleton-vs-spinner distinction is needed beyond this).
2. On fetch success, `data` is set and the loading indicator is replaced by the fully-populated
   screen sections described above.
3. On fetch failure, `error` is set and a single explicit error message replaces the data sections
   (not a silent blank screen, and not styled identically to the loading state — the loading state
   and the error state must be visually distinguishable from each other and both distinguishable
   from a populated-but-empty screen, matching the same "never blank/loading-styled" discipline
   INTERVIEW.md #5 establishes for zero-Investigations specifically, applied to the general
   page-load case).

**Loading state:** one loading indicator per screen, shown until the single fetch resolves.
**Error state:** one error message per screen, no partial data shown.
**Success state:** full screen render as specified per screen above.

### Status Filter (Problem Department overview)

**Trigger:** user selects a different status filter value.
**Component:** `InvestigationPortfolioTable`, driven by `ProblemDepartmentScreen`'s
`statusFilter` state.
**Behavior:**
1. State updates immediately (no debounce needed — client-side array filter, no network).
2. Table re-renders to the filtered subset.
3. No loading/error state applies — this is synchronous client-side filtering over already-fetched
   data.

### Start Investigation Submission

**Trigger:** form submit on `StartInvestigationForm`.
**Component:** `StartInvestigationForm`, calling `apiClient.createInvestigation`.
**Behavior:**
1. Submit control shows a busy/pending treatment while the `POST /api/investigations` request is
   in flight (distinct from the page-load loading indicator — this is a form-local pending state).
2. On success (201), the form clears and calls `onSubmitted`, which triggers
   `ProblemDepartmentScreen` to re-fetch `GET /api/problem-department`.
3. On failure (400/500), an inline error message renders adjacent to the form; the form's entered
   values are preserved (not cleared) so the user can correct and resubmit.

**Loading state:** form-local pending indicator on the submit control only.
**Error state:** inline message near the form; rest of the screen (portfolio, counts, runs)
remains as last successfully fetched — not reset to loading/blank.
**Success state:** form resets; portfolio section (table or empty-state, per new investigation
count) reflects the refetch.

### Client-Side Route Navigation

**Trigger:** clicking the Problem Department entry link (Departments directory), or any
`PersistentNav` link between the three screens.
**Component:** `App` (React Router).
**Behavior:**
1. Route change is handled entirely client-side — no full-page reload, no browser network
   navigation event (`DESIGN-PROPOSAL.md` §11).
2. The destination screen mounts fresh and performs its own Page-Load Fetch (§ above) — no data is
   carried over between screens; each screen's `useEffect` fetch is the sole source of its data on
   every mount, including re-entering a screen already visited this session.
3. A hard reload/direct URL load of any of the three routes is served the same built `index.html`
   via the Express catch-all (`02-ARCHITECTURE.md` §7) and resolves identically to a client-side
   navigation — no route behaves differently between soft-nav and hard-load.

### Empty State (zero Investigations)

**Trigger:** `ProblemDepartmentOverview.investigations.length === 0` after a successful fetch.
**Component:** `InvestigationPortfolioEmptyState`, rendered by `ProblemDepartmentScreen` in place
of `InvestigationPortfolioTable`.
**Behavior:** renders the exact copy "No investigations yet — Start Investigation" plus the
`StartInvestigationForm`. This state is only reachable after a successful fetch resolves to an
empty array — it is never rendered during loading or on error (those have their own distinct
treatments per § Page-Load Fetch), satisfying "never a blank or loading-styled screen"
(INTERVIEW.md #5).

### Screen D Link Target (out-of-scope destination)

**Trigger:** navigating (via click or direct/hard-loaded URL) to any path matching
`/departments/problem-department/investigations/:id` — Screen D's durable route.
**Component:** `InvestigationWorkspacePlaceholder`, rendered by a client-side catch-all route
registered in `App`'s router (React Router `<Route path="/departments/problem-department/
investigations/*" element={<InvestigationWorkspacePlaceholder />} />`, matching any suffix under
that path so a real `:id` value, a malformed one, or a trailing sub-path all resolve the same way
this checkpoint).
**Behavior:** the last-active-Investigation link on Mission Control and the Problem Department
overview renders with `href`/route target `/departments/problem-department/investigations/:id`
(matching `DESIGN-PROPOSAL.md` §5's durable URL) — the link itself is real and correct, per
`02-ARCHITECTURE.md` §6 ("link target only — Screen D itself is not built this checkpoint"). What
changes from a prior draft of this document: rather than leaving that route unregistered client-
side (which produced either a blank screen or a silent no-op, forbidden by § Page-Load Fetch item
3 and INTERVIEW.md #5), `App`'s router registers the catch-all above so navigating there — by
click or by hard-loading the URL directly — always renders `InvestigationWorkspacePlaceholder`'s
static text, "Investigation Workspace — not built yet (Checkpoint 2/3)", immediately and
synchronously (no fetch, so no loading state to distinguish; no error state, because nothing is
attempted that could fail). This satisfies the same honesty discipline the rest of this document
applies elsewhere: never a blank page, never a silent no-op, never a state styled to look like
loading or a working feature. `InvestigationWorkspacePlaceholder` is not Screen D and does not
attempt any part of Screen D's real functionality (no data fetch, no workspace UI) — it exists
solely to make the checkpoint-1 scope boundary visible to the user instead of invisible.

**Loading state:** none — the placeholder is static and renders synchronously on route match.
**Error state:** none — no fetch occurs, so no failure mode exists to represent.
**Success state:** N/A in the usual sense; the "success" outcome is the placeholder text itself,
always rendered identically for any matching path.

---

## Component Hierarchy

```
App (client-side router: /, /departments, /departments/problem-department,
     /departments/problem-department/investigations/* [catch-all])
├── PersistentNav                              (mounted once, sibling to <Routes>, rendered as a
│                                                left-side navigation panel, persists across all
│                                                route changes — not remounted per-route)
├── MissionControlScreen                       (route: /)
│   ├── InstalledDepartmentsStrip
│   │   └── DepartmentTile (×4, installed | planned variant)
│   ├── ActiveWorkSection
│   │   ├── ActiveGroupList          (InvestigationSummary[])
│   │   ├── NeedsAttentionGroupList  (InvestigationSummary[])
│   │   └── RecentCompletedGroupList (InvestigationSummary[])
│   ├── ActiveActivityPanel                    (GenerationRunSummary[])
│   ├── RecentSection
│   │   ├── RecentInvestigationsList
│   │   ├── RecentBriefsList
│   │   └── RecentEvidenceList
│   └── PlannedDepartmentsNote
├── DepartmentsScreen                          (route: /departments)
│   └── DepartmentRow (×4)
│       └── DepartmentEntryLink                (installed only)
├── ProblemDepartmentScreen                    (route: /departments/problem-department)
│   ├── DepartmentHeader
│   ├── InvestigationPortfolioTable            (non-empty case)
│   │   └── StatusFilterControl
│   ├── InvestigationPortfolioEmptyState        (zero-investigation case)
│   │   └── StartInvestigationForm (inline)
│   ├── SourcesEvidenceCounts
│   ├── RunsActivityPanel                       (GenerationRunSummary[])
│   └── StartInvestigationForm                  (non-empty case, section 5)
└── InvestigationWorkspacePlaceholder           (route: /departments/problem-department/
                                                  investigations/* — catch-all fallback,
                                                  Flow US-4 / § Screen D Link Target)
```

`PersistentNav` is a top-level sibling of the four route destinations (`MissionControlScreen`,
`DepartmentsScreen`, `ProblemDepartmentScreen`, `InvestigationWorkspacePlaceholder`), not nested
inside any of them, matching `02-ARCHITECTURE.md` §2's description of it mounting once at the
`App` shell level outside the `<Routes>` switch and rendering as a left-side navigation panel
(matching `docs/product-architecture-and-direction.md` §13's compass table, "Persistent left
navigation").

`InvestigationPortfolioTable` and `InvestigationPortfolioEmptyState` are mutually exclusive
renders within `ProblemDepartmentScreen` (never both mounted at once), matching
`02-ARCHITECTURE.md` §6's component boundary.

---

## State Visibility

| State | Visible In | Updated By |
|---|---|---|
| `MissionControlView` (full payload) | `MissionControlScreen` only | `GET /api/mission-control` on mount |
| `DepartmentsView` | `DepartmentsScreen` only | `GET /api/departments` on mount |
| `ProblemDepartmentOverview` | `ProblemDepartmentScreen` only | `GET /api/problem-department` on mount, and re-fetch after successful `StartInvestigationForm` submission |
| `statusFilter` | `ProblemDepartmentScreen` / `InvestigationPortfolioTable` | user selection on the status filter control (client-only, no persistence across mount/unmount) |
| `loading` / `error` per screen | that screen only | screen's own `useEffect` fetch lifecycle |
| form-local pending/error state | `StartInvestigationForm` only | its own submit handler; cleared on successful submit |

No state is shared across screens or persisted client-side between navigations — every screen
refetches its full data set on every mount, consistent with `02-ARCHITECTURE.md` §6/§8's
no-state-management-library, no-polling design. `InvestigationWorkspacePlaceholder` holds no state
at all — it is static.

---

## Output Verification

- Every user story has a mapped flow: yes — see `01-REQUIREMENTS.md`'s User Stories section for
  the full list; each has a corresponding flow above, including the persistent cross-screen
  navigation story (Flow US-7).
- Every flow has a screen: yes.
- Every screen has a layout: yes (3 in-scope layouts, plus the out-of-scope
  `InvestigationWorkspacePlaceholder` fallback documented for Flow US-4's honesty requirement).
- Interactions cover success, loading, and error states: yes (Page-Load Fetch, Start Investigation
  Submission, Empty State, Screen D Link Target, Client-Side Route Navigation).
- Component hierarchy matches architecture components: yes — every component named in
  `02-ARCHITECTURE.md` §2's table appears in the hierarchy above (including `PersistentNav`), plus
  `InvestigationWorkspacePlaceholder`, this document's own name for the honest fallback required by
  Flow US-4 / § Screen D Link Target (per INTAKE.md §6 delegation to Ledger) — no component
  invented beyond that list except purely presentational sub-elements (`DepartmentTile`,
  `DepartmentRow`, `DepartmentEntryLink`, group-list/panel components) which are layout
  subdivisions of the screens/components architecture already assigns responsibility to, not new
  services or data-owning components.
