# UI Spec: Product Surface — Checkpoint 1

**Status**: Draft — pending Frank spec-gate
**Traces to**: `01-REQUIREMENTS.md` (see its User Stories section for the full list, and its
Acceptance Criteria section for the AC count), `02-ARCHITECTURE.md`,
`DESIGN-PROPOSAL.md` §2/§2a/§3/§4/§4a/§11 (Checkpoint-1 subset only),
`docs/product-architecture-and-direction.md` §6 (Mission Control character, quoted below).

Scope boundary restated (binding): exactly three screens — Mission Control (`/`), Departments
directory (`/departments`), Problem Department overview (`/departments/problem-department`).
Investigation Workspace (Screen D), generation-trigger UI, and any live/per-component activity
display are out of scope this checkpoint (Checkpoint 2/3).

---

## Visual Direction (Binding)

This section is binding on every screen below — it is foundational styling, not final polish.
Implementers building the four canonical files' React components must be able to derive concrete
CSS/styling decisions from it. Exact hex values are intentionally left PROVISIONAL where noted;
the direction and constraints are not.

### Grounding

`docs/product-architecture-and-direction.md` §6 ("Mission Control: What the Product Should Feel
Like"): "The visible operating environment is part of the product, not end-stage decoration.
Department OS should feel like a serious research and build command center: navigable, stateful,
evidence-rich, and operational." §6 further states: "No fake agent theater. If the backend cannot
supply a state, event, agent, metric, or relationship honestly, the interface should not invent
it." This document's visual treatment applies that same discipline to styling, not only to data
honesty (see Explicit Rejections below).

### Department OS identity and persistent institutional shell

The product has one consistent, recognizable visual identity across all screens — not a
collection of independently-styled pages loosely sharing a nav bar. `PersistentNav` (mounted once
at the `App` shell level, §6 of `02-ARCHITECTURE.md`) is part of this shell, not a bolt-on
sidebar: it shares the same typographic scale, spacing unit, border treatment, and palette as the
screens it sits beside, and it is visually continuous with the header/chrome of whichever screen
is active. A user should be able to tell from a screenshot alone that a screen belongs to
Department OS, independent of which of the three screens it is.

### Mission-control/workbench character

Dense information display, operational tone — like a real command center or engineering
dashboard, not a marketing site or a consumer app. Concretely: no large decorative hero regions,
no illustration/photography, no marketing-style copy ("Welcome!", "Let's get started!"). Screens
open directly on real data (or an honest empty/loading/error state per § Interactions) — the
content IS the interface, not a wrapper around it.

### Dense but readable hierarchy

Information density is a feature here — this is "a serious research and build command center,"
not a sparse landing page — but density must not come at the cost of scannability. Concrete rules:

- A clear typographic scale separates three tiers: **section headers** (e.g. "Active Work",
  "Investigation Portfolio"), **field/column labels** (e.g. "status", "createdAt"), and **data
  values** (e.g. an actual `InvestigationStatus` string, a timestamp, a count). Each tier is
  visually distinct (weight and/or size), so a user scanning the page can distinguish structure
  from content without reading every word.
- Distinct data groups (e.g. Mission Control's four Active-work groups, or a screen's major
  sections such as "Investigation portfolio" vs. "Sources / Evidence counts" vs. "Runs /
  Activity") get generous-enough spacing between them that they read as separate groups even
  though the overall layout is dense — spacing is the primary tool for grouping, not boxes/shadows
  (see Spacing/Borders below).
- Section boundaries are delineated with a thin hairline border or a subtle background-shade
  change, not heavy card-shadow chrome — enough to separate sections at a glance, not so much that
  the page reads as a stack of separate "cards" competing for attention (rejecting generic-SaaS
  card styling, see Explicit Rejections).

### Typography

Two-family split, chosen to fit "evidence-rich, operational":

- **Data/status values** (`InvestigationStatus` strings, IDs, timestamps, counts, run outcomes,
  filter values) render in a monospace or semi-monospace typeface. This is a deliberate choice,
  not a decorative one: monospace reads as instrumentation/console output — the honest visual
  register for values sourced directly from the database and rendered without embellishment
  (matching this checkpoint's "never a placeholder, never invented" discipline, § Interactions).
  It also gives tabular data (the Investigation portfolio table, run lists) natural column
  alignment.
- **Prose, labels, and navigation** (section headers, field labels, form copy, `PersistentNav`
  link text, the Planned-Departments note) render in a clean, plain sans-serif — legible at small
  sizes, no display/decorative typeface.
- Exact font families are PROVISIONAL (e.g. a system monospace stack such as
  `ui-monospace, "SF Mono", "Cascadia Code", monospace` paired with a system sans-serif stack such
  as `ui-sans-serif, system-ui`) — implementer's choice among standard system-font stacks; no
  custom webfont is required or implied by this section, and none should be added without a
  reason beyond aesthetics, since a webfont load is unjustified weight for a desktop-only internal
  tool at this checkpoint's scale.

### Palette

A restrained, mostly-neutral base with a small, deliberate set of semantic accent colors — not a
rainbow of decorative color. This checkpoint's content needs the following semantic roles, each
visually distinct from the others but calibrated so that "attention needed" reads as the only
alarming treatment — the rest read as informational, not urgent:

- **Neutral base** — the dominant surface, text, and border colors used everywhere that isn't a
  semantic status. Direction: a restrained near-black-on-near-white (or the inverse, dark mode —
  implementer's call, either fits "command center," but pick one and apply it consistently; do
  not mix). Exact values PROVISIONAL.
- **`installed` vs `planned` Department status** — `installed` reads as the neutral/normal
  "operational" treatment (this is the expected, healthy state for Problem Department); `planned`
  reads as visually muted/deprioritized (e.g. lower-contrast text, no accent color at all) — it is
  not an error or a warning, just "not yet built," so it must not share any hue with the
  Needs-Attention treatment below.
- **Active-work groups (4)**, each its own distinguishable-but-non-alarming treatment:
  - **Active** (a `GenerationRun` is actually in progress right now) — the one group that may
    carry a "live/running" visual cue (e.g. a small accent dot or label in an "in-progress" hue,
    distinct from any alarm color) since this is the only group where something is happening in
    real time.
  - **Ready / Not Started** (`readyNotStarted` — `status='open'`, zero `GenerationRun` rows) —
    reads as "waiting/ready," not alarming and not identical to Active: per Danny's correction
    (`02-ARCHITECTURE.md` §5.3/§3), Active means a real run IS running; Ready/Not-Started means
    nothing has started yet. Direction: a neutral or cool "standby" treatment (e.g. the neutral
    base with a quiet label, no pulsing/live cue at all, since nothing is actually in motion) —
    visually calmer than Active, and never sharing Active's "live" cue.
  - **Needs Attention** (`blocked`, `generation-failed`) — the one group that should read as
    "attention needed": a warm/alarm-adjacent hue (e.g. amber or red-orange family), used
    nowhere else in the palette, so it is unambiguous at a glance.
  - **Recent / Completed** — a calm "done" treatment (e.g. a muted green or simply the neutral
    base with a checkmark/label), read as healthy/normal, not urgent.
- **`InvestigationStatus` values** (`open`, `blocked`, `generation-failed`, `brief-generated`,
  used in the portfolio table and status filter) reuse the SAME semantic hues as the Active-work
  groups above wherever the two overlap conceptually, so a user does not have to learn two color
  systems: `open` reads as neutral/standby, `blocked`/`generation-failed` read in the
  attention/alarm hue, `brief-generated` reads in the "done" hue.
- Exact hex values are PROVISIONAL — the direction (restrained neutral base, 3-4 named semantic
  accents, no decorative rainbow, alarm color reserved exclusively for Needs-Attention/
  blocked/generation-failed) is binding.

### Spacing and borders

- A consistent base spacing unit (e.g. an 8px scale — implementer's call on the exact base, but
  ONE base unit used consistently, not ad hoc pixel values scattered per component) drives all
  padding/margin/gap decisions, so density stays readable rather than cramped.
- Section delineation uses thin hairline borders (1px, low-contrast neutral) or a subtle
  background-shade step between adjacent sections — not heavy drop-shadows or card-elevation
  effects. This is consistent with "dense but readable" (§ above) and explicitly rejects
  default admin-template card styling (§ Explicit Rejections).

### Desktop layout behavior

This checkpoint is desktop-only in practice — no responsive/mobile requirement exists anywhere in
`01-REQUIREMENTS.md` or `02-ARCHITECTURE.md`. Binding assumption: a minimum viewport width of
1280px (a conservative, common desktop/laptop minimum; no narrower layout is designed or tested
this checkpoint). Layout behavior at typical desktop widths:

- `PersistentNav` is a fixed-width left column (narrow enough to read as navigation chrome, not a
  content column — implementer's call on exact width, e.g. in the 200-240px range).
- The main content area is fluid, filling the remaining width, with a max-width cap on
  text-heavy/table content (e.g. the Investigation portfolio table) so rows don't stretch
  illegibly wide on very large monitors — the cap applies to content readability, not to the
  overall page, which remains fluid.
- No hamburger menu, no responsive breakpoint collapsing `PersistentNav` into an off-canvas
  drawer — that pattern belongs to a mobile/responsive requirement this checkpoint does not have.

### Explicit rejections (binding negative constraints)

Quoting Danny's ruling directly — these are binding, not stylistic suggestions:

- **NOT generic Bootstrap/admin-template styling** — the default look of an off-the-shelf admin
  dashboard template (default Bootstrap component styling, generic card grids with drop shadows,
  default form-control chrome). Every screen must read as purpose-built for Department OS's
  identity (§ above), not as an unstyled scaffold.
- **NOT fake sci-fi styling** — no glowing borders, no terminal/hacker aesthetic (green-on-black
  CRT styling, scanline effects, etc.) that isn't earned by real functionality. The monospace
  typography direction above is chosen for instrumentation honesty, not for a sci-fi look — it
  should read as a real data tool, not a prop from a movie about hackers.
- **NOT fake agent theater** — no animated "agent thinking" indicators, spinners implying live
  agent activity, or decorative motion that isn't backed by real state. This directly echoes and
  extends `docs/product-architecture-and-direction.md` §6's "No fake agent theater. If the backend
  cannot supply a state, event, agent, metric, or relationship honestly, the interface should not
  invent it" — applied here to visual treatment specifically, not only to data honesty. Concretely:
  the Page-Load Fetch loading indicator (§ Interactions) is a plain, static loading treatment (e.g.
  a simple spinner or skeleton, not an "agent is thinking" animation with simulated steps), and no
  screen implies live agent activity beyond what `activeActivity`/`activeWork.active`'s real,
  fetched `GenerationRun` data actually supports.

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
   four Active-work groups, Active orchestrations panel (GenerationRun-level only), Recent lists,
   Planned-Departments note.
4. User action: none required — this is a read-only orientation screen.
5. End state: user either stays on Mission Control or navigates onward (to `/departments` or
   directly to a linked Investigation-in-portfolio target — see Flow: US-4).

**Success path:** every `MissionControlView` section renders with real data or an honest empty
array — the departments strip, each of the four active-work groups (active, readyNotStarted,
needsAttention, recentCompleted) independently, the active-orchestrations/activity panel, and each
of the recent lists (investigations, briefs, evidence) independently.
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

### Flow: US-4 — Follow last-active Investigation link (legacy destination)

1. User starts at: Mission Control or Problem Department overview, either of which surfaces a
   "last-active Investigation" as a link (Mission Control: within `recent.investigations`,
   top-ordered; Problem Department overview: `lastActiveInvestigationId`-derived link).
2. User sees: the link is rendered as a real, plain `<a href="/investigations/{id}">` — a full
   HTML anchor, not a React Router `<Link>` — labeled honestly (e.g. "View current status" or
   equivalent copy naming that this is the current, legacy view, not a new workspace) so the user
   is not misled into expecting a client-side transition.
3. User action: clicks the link.
4. System response: this is a real, full-page navigation — the user LEAVES the SPA entirely (a
   genuine UX discontinuity, named here rather than hidden) and the browser performs a normal
   network request to the EXISTING legacy Express route `GET /investigations/:id`
   (`src/web/server.ts:115-158`, per `02-ARCHITECTURE.md` §2/§6). This is a genuinely working
   existing page (`src/web/views.ts`'s `renderInvestigationGeneratingScreen` /
   `renderInvestigationBlockedScreen` / `renderInvestigationGenerationFailedScreen`, or the
   `brief-generated` 501 stub), not a stub or placeholder.
5. End state: user is shown the legacy server-rendered Investigation screen at
   `/investigations/{id}` — outside the SPA, with no `PersistentNav` (the legacy screen predates
   and is unaffected by this checkpoint's shell). This is documented, intentional scope (Screen D
   itself is not built this checkpoint, `02-ARCHITECTURE.md` §1/§6), not a defect to disguise.

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

### Flow: US-6 — Distinguish Active / Ready-Not-Started / Needs Attention / Recent-Completed on Mission Control

1. User starts at: `/`, viewing the Active-work section.
2. User sees: four separately labeled, separately rendered lists — "Active", "Ready / Not
   Started", "Needs Attention", "Recent / Completed" — each backed by its own independent query
   result (`activeWork.active` / `.readyNotStarted` / `.needsAttention` / `.recentCompleted`).
3. User action: none required (read-only); user may follow an Investigation link within any group
   (see Flow US-4's legacy-destination behavior for where the link goes).
4. End state: user has correctly distinguished "a real run is running right now" (Active: an
   Investigation with an in-progress `GenerationRun`) from "ready to run, nothing started yet"
   (Ready/Not Started: a brand-new `status='open'` Investigation with zero `GenerationRun` rows at
   all) from "stalled/blocked" (Needs Attention) from "done" (Recent/Completed), per US-6's intent
   and `02-ARCHITECTURE.md` §3/§5.3's four-way split — no group is rendered merged with a computed
   badge, and Active is never visually indistinguishable from Ready/Not Started (§ Visual
   Direction, Palette).

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
│              │ 2. Active work — four sibling sections,       │
│              │    always all four, each independently        │
│              │    labeled and independently empty-able:       │
│              │  ┌────────┐┌──────────────┐┌───────────┐┌────┐ │
│              │  │ Active  ││ Ready / Not  ││Needs      ││Rec-│ │
│              │  │         ││  Started     ││Attention  ││ent/│ │
│              │  │         ││              ││           ││Comp│ │
│              │  └────────┘└──────────────┘└───────────┘└────┘ │
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
| Active | `InvestigationSummary[]` — an Investigation with an in-progress `GenerationRun`: a real run IS running right now. Per Danny's correction (`02-ARCHITECTURE.md` §3/§5.3), this group no longer also includes brand-new `status='open'` Investigations with zero `GenerationRun` rows — that case is its own group, Ready/Not Started, below. | `MissionControlView.activeWork.active` |
| Ready / Not Started | `InvestigationSummary[]` — `status='open'`, zero `GenerationRun` rows at all: genuinely never started, not stalled/blocked, not currently running. Reads visually as "waiting/ready," not alarming and not identical to Active (§ Visual Direction, Palette) | `MissionControlView.activeWork.readyNotStarted` |
| Needs Attention | `InvestigationSummary[]` — `status` in (`blocked`, `generation-failed`), no in-progress run | `MissionControlView.activeWork.needsAttention` |
| Recent / Completed | `InvestigationSummary[]` — `brief-generated` or most-recent non-in-progress run, deduped, recency-ordered | `MissionControlView.activeWork.recentCompleted` |
| Active orchestrations panel | `GenerationRunSummary[]` rows: run id, investigation id (linked), runtime identifier, outcome, started/completed timestamps — no `currentComponent` field, ever | `MissionControlView.activeActivity` |
| Recent Investigations | `InvestigationSummary[]`, ordered by `lastActivityAt` desc; top row is the "last-active Investigation" link target (Flow US-4) | `MissionControlView.recent.investigations` |
| Recent Briefs | `BriefSummary[]`, ordered by `createdAt` desc | `MissionControlView.recent.briefs` |
| Recent Evidence | `EvidenceSummary[]`, ordered by `createdAt` desc | `MissionControlView.recent.evidence` |
| Planned Departments note | Static explanatory text naming Signal Foundry, Prototype Department, Creative Practice Engine as not yet built | Derived client-side from `departments` where `status === 'planned'` (no separate API field) |

Each of Active / Ready-Not-Started / Needs Attention / Recent-Completed independently renders its
own empty state ("No investigations in this group" or equivalent honest per-group text) when its
array is empty — never omitted or collapsed, so the four-group structure stays visible even at
zero.

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
| Last-active Investigation link | the row (or explicit indicator) matching `lastActiveInvestigationId`, linking via full-page navigation to the legacy `GET /investigations/:id` route (Flow US-4) | `ProblemDepartmentOverview.lastActiveInvestigationId` |
| Sources / Evidence counts | two integers | `ProblemDepartmentOverview.sourceCount`, `.evidenceCount` |
| Runs / Activity | `GenerationRunSummary[]` rows, same shape/columns as Mission Control's activity panel | `ProblemDepartmentOverview.recentRuns` |
| Start Investigation | form: one or more source-artifact inputs (type + raw), submit | `StartInvestigationForm`, posts to `POST /api/investigations` |
| Empty state | exact copy "No investigations yet — Start Investigation" plus the same `StartInvestigationForm` | rendered when `investigations.length === 0` |

---

## Interactions

### Page-Load Fetch (all three screens)

**Trigger:** screen mount (route entered, including via client-side nav from another screen).
**Component:** each screen's own `useEffect` calling its `apiClient` function once.
**Behavior:**
1. On mount, state is `{ data: null, error: null }` and the screen shows a single loading
   indicator in place of its data sections — this is one uniform "loading" treatment per screen,
   not a per-section skeleton (no live-polling view exists this checkpoint, so no
   skeleton-vs-spinner distinction is needed beyond this). Per § Visual Direction's explicit
   rejection of fake agent theater, this loading indicator is a plain, static treatment (e.g. a
   simple spinner) — never an animated "agent is thinking/working" simulation.
2. On fetch success, `data` is set and the loading indicator is replaced by the fully-populated
   screen sections described above.
3. On fetch failure, `error` is set and a single explicit error message replaces the data sections
   (not a silent blank screen, and not styled identically to the loading state — the loading state
   and the error state must be visually distinguishable from each other and both distinguishable
   from a populated-but-empty screen, matching the same "never blank/loading-styled" discipline established for the
   zero-Investigations empty state (§ Empty State), applied to the general page-load case).

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
treatments per § Page-Load Fetch), satisfying "never a blank or loading-styled screen".

### Last-Active Investigation Link (legacy destination)

**Trigger:** clicking (or hard-loading the URL of) the "last-active Investigation" link rendered
on Mission Control (`recent.investigations`, top-ordered) or the Problem Department overview
(`lastActiveInvestigationId`-derived).
**Component:** a plain `<a href="/investigations/{id}">` element — NOT a React Router `<Link>`,
and not part of the client-side route table at all (`02-ARCHITECTURE.md` §6: no client-side route
exists for `/departments/problem-department/investigations/*`, and there is no fourth SPA screen).
**Behavior:** the link's `href` points directly at the EXISTING legacy Express route,
`GET /investigations/:id` (`src/web/server.ts:115-158`). Clicking it performs an ordinary browser
navigation — the user leaves the SPA entirely, the router is torn down, and the browser loads the
legacy server-rendered page fresh. This is a genuine UX discontinuity and is named honestly here
rather than hidden: the link's visible label makes clear it goes to the current, legacy view (not
a new workspace and not a stub), per `02-ARCHITECTURE.md` §2/§6's "labeled as the current view."
The destination is a genuinely working existing page (`src/web/views.ts`'s
`renderInvestigationGeneratingScreen` / `renderInvestigationBlockedScreen` /
`renderInvestigationGenerationFailedScreen`, or the `brief-generated` 501 stub) — never a stub or
placeholder built for this checkpoint. This satisfies the same honesty discipline the rest of this
document applies elsewhere: never a blank page, never a silent no-op — but here the honest
resolution is a real full-page link to a real existing screen, not a client-side placeholder
component.

**Loading state:** none owned by the SPA — this is a normal browser navigation; the legacy page's
own loading behavior (if any) is unchanged and out of this document's scope.
**Error state:** none owned by the SPA — a failure at the legacy route (e.g. an unmatched
`:id`) is the legacy route's own existing behavior, unchanged by this checkpoint.
**Success state:** the browser is now showing the legacy server-rendered Investigation screen,
outside the SPA and outside `PersistentNav`'s scope.

---

## Component Hierarchy

```
App (client-side router: /, /departments, /departments/problem-department — exactly three
     routes, no catch-all, no fourth route)
├── PersistentNav                              (mounted once, sibling to <Routes>, rendered as a
│                                                left-side navigation panel, persists across all
│                                                route changes — not remounted per-route)
├── MissionControlScreen                       (route: /)
│   ├── InstalledDepartmentsStrip
│   │   └── DepartmentTile (×4, installed | planned variant)
│   ├── ActiveWorkSection
│   │   ├── ActiveGroupList             (InvestigationSummary[])
│   │   ├── ReadyNotStartedGroupList    (InvestigationSummary[])
│   │   ├── NeedsAttentionGroupList     (InvestigationSummary[])
│   │   └── RecentCompletedGroupList    (InvestigationSummary[])
│   ├── ActiveActivityPanel                    (GenerationRunSummary[])
│   ├── RecentSection
│   │   ├── RecentInvestigationsList
│   │   ├── RecentBriefsList
│   │   └── RecentEvidenceList
│   └── PlannedDepartmentsNote
├── DepartmentsScreen                          (route: /departments)
│   └── DepartmentRow (×4)
│       └── DepartmentEntryLink                (installed only)
└── ProblemDepartmentScreen                    (route: /departments/problem-department)
    ├── DepartmentHeader
    ├── InvestigationPortfolioTable            (non-empty case)
    │   └── StatusFilterControl
    ├── InvestigationPortfolioEmptyState        (zero-investigation case)
    │   └── StartInvestigationForm (inline)
    ├── SourcesEvidenceCounts
    ├── RunsActivityPanel                       (GenerationRunSummary[])
    └── StartInvestigationForm                  (non-empty case, section 5)
```

The last-active-Investigation link (Mission Control's `RecentInvestigationsList` and
`ProblemDepartmentScreen`'s portfolio) is a plain `<a>` element pointing at the legacy
`GET /investigations/:id` route (§ Interactions, Last-Active Investigation Link) — it is not a
component in the router's route table and has no corresponding node in this hierarchy, since a
plain anchor tag is markup, not a component `02-ARCHITECTURE.md` §6 defines.

`PersistentNav` is a top-level sibling of the three route destinations (`MissionControlScreen`,
`DepartmentsScreen`, `ProblemDepartmentScreen`), not nested inside any of them, matching
`02-ARCHITECTURE.md` §2's description of it mounting once at the `App` shell level outside the
`<Routes>` switch and rendering as a left-side navigation panel (matching
`docs/product-architecture-and-direction.md` §13's compass table, "Persistent left navigation").

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
no-state-management-library, no-polling design. The last-active-Investigation link carries no
client-side state at all — it is a plain anchor whose `href` is derived directly from fetched data
on each render.

---

## Output Verification

- Every user story has a mapped flow: yes — see `01-REQUIREMENTS.md`'s User Stories section for
  the full list; each has a corresponding flow above, including the persistent cross-screen
  navigation story (Flow US-7).
- Every flow has a screen: yes.
- Every screen has a layout: yes — the three in-scope screens (Mission Control, Departments
  directory, Problem Department overview) each have a layout diagram; there is no fourth screen
  and no placeholder screen this checkpoint (`02-ARCHITECTURE.md` §1/§2/§6 — the last-active-
  Investigation link is a full-page navigation to an existing legacy route, not a built screen).
- Interactions cover success, loading, and error states: yes (Page-Load Fetch, Start Investigation
  Submission, Empty State, Last-Active Investigation Link, Client-Side Route Navigation).
- Component hierarchy matches architecture components: yes — every component named in
  `02-ARCHITECTURE.md` §2's table appears in the hierarchy above (including `PersistentNav`), plus
  purely presentational sub-elements (`DepartmentTile`, `DepartmentRow`, `DepartmentEntryLink`,
  group-list/panel components) which are layout subdivisions of the screens/components
  architecture already assigns responsibility to, not new services or data-owning components. No
  placeholder component is defined for the legacy-link destination — it is a plain anchor tag, per
  `02-ARCHITECTURE.md` §2/§6's removal of `InvestigationWorkspacePlaceholder` and the fourth
  client-side route.
</content>
