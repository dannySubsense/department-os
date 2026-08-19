# Department OS Product Surface — Design Proposal

**Status:** DESIGN ONLY — no application code. Written for Danny's review; NOT dispatched for
implementation. Replaces the presumed mechanical "Slice 10" entry point per Danny's explicit
redirection.

**Base:** branch `feature/problem-department-mvp`, commit `37d91d4` (Slice 9 Brief Assembler
closed). Grounded against `docs/product-architecture-and-direction.md` (commit `fe2ee62`,
binding), `src/types/domain.ts`, `src/web/server.ts`, `src/services/submitSources.ts`,
`src/services/generateBriefVersion.ts`, `src/services/provenanceRecorder.ts`,
`src/services/provenanceContext.ts`, `src/db/migrations/006_generation_run_provenance.sql`, and
`docs/specs/problem-department-mvp/04-ROADMAP.md` lines 867–950.

Existing Slices 1–9 backend is preserved as-is. Nothing in this document proposes changing any
persisted schema, service signature, or business logic from Slices 1–9 — only additive read
models, one additive append-only lifecycle table, and a new UI shell in front of the existing
Express app.

---

## 1. Exact Route Map

React shell routes (client-side, served by a dev server / static bundle) and Express API routes
(JSON, additive — existing server-rendered HTML routes are addressed in §11, not deleted here).

### React shell routes

| Route | Screen |
|---|---|
| `/` | Mission Control (A) |
| `/departments` | Departments directory (B) |
| `/departments/problem-department` | Problem Department overview (C) |
| `/departments/problem-department/investigations/:investigationId` | Investigation Workspace (D) |
| `/activity` | Global Activity surface (Mission Control's Activity nav item, per compass §13 persistent
nav table: Mission Control / Departments / Activity / Evidence / Knowledge / Runs) |
| `/knowledge` | Core-wide Knowledge surface — **reserved route only in this design**, not built (see §2, §8) |

No other top-level React route is proposed. `Evidence` and `Runs` (compass §13 nav table) are
NOT separately routed in this proposal — at 37d91d4 there is no cross-Investigation evidence or
run index service to back them honestly (§9's "no fabricated surface" constraint), so they are
left as a named-but-undesigned gap, called out explicitly in §15, rather than stubbed with fake
content.

### Express API routes (additive, JSON, alongside the existing server-rendered routes)

| Method | Route | Backs |
|---|---|---|
| `GET` | `/api/mission-control` | Mission Control read model (§8 `MissionControlView`) |
| `GET` | `/api/departments` | Departments directory read model (§8 `DepartmentSummary[]`) |
| `GET` | `/api/problem-department` | Problem Department overview read model (§8 `ProblemDepartmentOverview`) |
| `GET` | `/api/investigations/:id/workspace` | Investigation Workspace read model (§8 `InvestigationWorkspaceView`) — supersedes the presumed Slice 10 `getBriefForReview` wiring point, see §14 |
| `GET` | `/api/investigations/:id/activity` | Investigation-scoped agent activity feed (§8 `ActivityFeedView`) |
| `GET` | `/api/activity` | Global (Core-wide) agent activity feed (§8 `ActivityFeedView`, unscoped) |
| `POST` | `/api/investigations` | JSON equivalent of existing `POST /investigations` — wraps `submitSources` (unchanged), see §9 |
| `POST` | `/api/investigations/:id/sources` | JSON equivalent of adding sources to an existing Investigation — same `submitSources` call, `investigationId` supplied |

Every API route above is a **read model or a thin wrapper around an existing service** — none
introduces new business logic. §8 specifies exactly which existing tables/services back each one.

---

## 2. Mission Control Information Architecture (Screen A)

Per compass §6 ("Mission Control: What the Product Should Feel Like") and §13's persistent-nav
table. Mission Control is the whole-environment home screen — not a Department, not the Problem
Department overview.

Sections, top to bottom:

1. **Installed Departments strip** — tiles for every Department, each tile honestly labeled
   `installed` / `planned`. At 37d91d4 exactly one tile (`Problem Department`) is `installed`;
   Signal Foundry, Prototype Department, Creative Practice Engine render as `planned` tiles with
   no activity, no counts, no fabricated status text (compass §6 "No fake agent theater"; binding
   input 8). Mandate to Build is excluded from this strip entirely (binding input 5).
2. **Active work** — Investigations across all installed Departments whose
   `Investigation.status` is `'open'` or `'blocked'` (i.e. not yet at a terminal
   generation outcome) — sourced from the Problem Department's own investigation list (today the
   only Department that can supply this).
3. **Active orchestrations and agent/component activity** — the global Activity feed (§6),
   backed by the lifecycle addition in §10. Shows currently-executing `GenerationRun`s and their
   in-flight component, not just completed steps.
4. **Recent Investigations / Briefs / evidence / artifacts** — a recency-ordered list drawn from
   existing Investigation / BriefVersion / SourceArtifact rows (no new persistence).
5. **Planned Departments note** — explicit, honest text stating what is not yet built, not a
   silently-omitted tile (binding input 8).

Mission Control does NOT show department-specific detail (Investigation portfolio, Sources,
Runs) — that is Screen C's job. Mission Control's job is orientation across the whole
environment.

---

## 3. Department Navigation Behavior (Screen B)

`/departments` is a directory, not a workspace. Each Department entry shows:

- Name, one-line thesis (verbatim from compass §3 per Department, e.g. Problem Department: "What
  do people genuinely need, and where is the unresolved demand?").
- Status: `installed and operational` (Problem Department only, at 37d91d4) or
  `planned — not installed`.
- For `installed` Departments only: an entry link into that Department's overview screen
  (Screen C's route). Planned Departments have no entry link — clicking does nothing meaningful,
  so no click target is rendered at all, not a disabled-looking button that implies "coming soon
  with a date" (compass §6 discipline again).

Selecting Problem Department navigates to `/departments/problem-department` (Screen C). This is
the only Department-selector behavior implemented in this proposal — the other three tiles are
inert directory entries, consistent with binding input 3 ("Departments are separately useful
modules installed inside Core") without pretending three more modules exist yet.

---

## 4. Problem Department Overview Structure (Screen C)

Per the approved screen hierarchy item C and compass §6's bullet list (Investigations list and
status; Current Investigation workspace; Sources and source resolution; Workflow stages and real
run activity; Problem Brief; Evidence and provenance inspection; Human decisions).

Sections:

1. **Department header** — name, one-line thesis, `installed` badge.
2. **Investigation portfolio** — every `Investigation` row for this Department, each showing
   `status` (`InvestigationStatus` enum: `open` | `blocked` | `generation-failed` |
   `brief-generated`), `createdAt`, and `statusReason` when present. Portfolio is sortable/
   filterable by status only (no invented metrics).
3. **Current / most recent Investigation** — the most recently created or most recently updated
   Investigation, linked directly into Screen D.
4. **Department-level Sources / Evidence** — aggregate counts of `SourceArtifact` rows and
   `EvidenceItem` rows across this Department's Investigations (real counts from existing tables,
   not derived/estimated).
5. **Department-level Runs / Activity** — recent `GenerationRun`s across this Department's
   Investigations, plus the live-activity feed scoped to this Department (§6, §10).
6. **Start Investigation** — entry point that opens the existing submission flow
   (`POST /investigations` today; `POST /api/investigations` in the React shell, §1, §9) — this is
   the existing Slice 1 capability, exposed from the new IA, not reimplemented.

---

## 5. Investigation Workspace Structure and State Behavior (Screen D)

One workspace per Investigation, at the durable URL
`/departments/problem-department/investigations/:investigationId` (preserves the "one durable
Investigation URL" discipline from `04-ROADMAP.md` Slice 10's Q-7 reference and Slice 3's
existing `GET /investigations/:id`).

Structure, driven directly by `InvestigationStatus` (`src/types/domain.ts` line 70-74):

- **Header** — `Investigation.id`, `status`, `statusReason` (when present), `createdAt`.
- **Sources panel** — every `SourceArtifact` for this Investigation:
  `type`, `raw`, `resolution.status` (four-way: `unresolved` | `unreachable` |
  `content-retrieved` | `reachable-no-content`), `resolution.failureReason` /
  `noContentReason` when present. Mirrors the existing `InvestigationSourceForDisplay` mapping in
  `src/web/server.ts` lines 121-127 — no new source-resolution logic, just presented inside the
  new shell.
- **Workflow stage indicator** — derived purely from `status`:
  - `open` — "accepting sources / awaiting generation" (matches current
    `renderInvestigationGeneratingScreen` state).
  - `blocked` — "blocked: no reachable sources" — renders `statusReason` verbatim (matches
    current `renderInvestigationBlockedScreen`).
  - `generation-failed` — "generation failed" — renders `statusReason` verbatim (matches current
    `renderInvestigationGenerationFailedScreen`).
  - `brief-generated` — full Brief content, per Slice 10's original scope (§14).
- **Agent/component activity panel** — this Investigation's `GenerationRun`s, including any
  currently in-progress run's live component step, backed by §10's lifecycle addition. This is
  new — no equivalent exists in the current server-rendered screens.
- **Problem Brief panel** (only when `status === 'brief-generated'`) — all seven required
  elements, per the existing Slice 9-produced `BriefVersion` shape (§14 disposition).
- **Evidence and citations** — `EvidenceItem`/`ClaimVersion` detail behind the Brief content,
  same source data Slice 10 was scoped to render.
- **Provenance and run log** — the full `GenerationRun`/`GenerationStep` list for this
  Investigation (`provenanceRecorder.ts`'s existing persisted shape), presented as an inspectable
  log, not summarized away.
- **Blocked / generation-failed states** — rendered in place, inside this same workspace (not a
  separate screen), matching the current three-way branch in `src/web/server.ts` lines 129-150 —
  this proposal keeps that branching but re-hosts it inside the persistent Workspace shell instead
  of full-page server-rendered HTML.
- **Human decisions and validity/history** (later slice, Investigation Workspace item D's tail
  clause) — this proposal reserves the panel location in the Workspace layout but does not design
  `Decision`/`ReconsiderationCondition` persistence or the Decision Form — that is unchanged
  Slice 11/12 scope, untouched here.

---

## 6. Agent Activity Surface (Core, Department, Investigation levels)

Grounded in the lifecycle addition designed in §10. Three concentric views over the SAME
underlying event stream, differing only in scope filter:

| Level | Screen | Scope | Backing endpoint |
|---|---|---|---|
| Core | Mission Control (§2 item 3) + `/activity` | All `GenerationRun`s across all Departments | `GET /api/activity` |
| Department | Problem Department overview (§4 item 5) | `GenerationRun`s whose `investigationId` belongs to this Department | `GET /api/activity?department=problem-department` (query-filtered form of the same endpoint) |
| Investigation | Investigation Workspace (§5) | `GenerationRun`s for exactly this `investigationId` | `GET /api/investigations/:id/activity` |

Each view renders, per active or recent `GenerationRun`:

- `runtimeIdentifier`, `startedAt`, current `outcome` (`in-progress` / `succeeded` / `failed`).
- **Currently-executing component** — NEW capability, sourced from §10's lifecycle events, not
  from `GenerationStep` (which, per the task's grounding note, is only persisted after a
  component completes — nothing at 37d91d4 identifies what is running RIGHT NOW).
- Completed/failed steps so far, from the existing `GenerationStep` rows (`component`, `outcome`,
  `error`, `startedAt`/`completedAt`) — unchanged data, newly surfaced in a live-activity list
  rather than only inside a finished Brief's provenance section.

No presence animation, no swarm visualization, no simulated concurrency — a plain list of
real, persisted-or-derivable rows (binding constraint: agent activity requirement, "smallest
honest thing only").

---

## 7. Current Persisted Field / Service Mapping

Every displayed element above, traced to its actual source. No invented fields.

| Displayed element | Source interface / field | Source file |
|---|---|---|
| Investigation status, statusReason, createdAt | `Investigation.status`, `.statusReason`, `.createdAt` | `src/types/domain.ts:62-74` |
| Source list, resolution status | `SourceArtifact.type/raw/resolution` | `src/types/domain.ts:25-58`; read via `getInvestigation.ts` (existing service, called at `src/web/server.ts:119`) |
| GenerationRun list, outcome, timestamps | `GenerationRun` | `src/types/domain.ts:366-380`; persisted by `createGenerationRun`/`finalizeGenerationRun`, `src/services/provenanceRecorder.ts:62-89, 139-209` |
| Completed/failed step log | `GenerationStep` | `src/types/domain.ts:385-406`; persisted by `recordGenerationStep`, `provenanceRecorder.ts:95-126` |
| Problem Brief seven elements | `BriefVersion` and its referenced sub-entities (`ProblemStatement`, `ClaimVersion`, `DemandSignal`, `DemandConfidenceClassification`, `ExistingSolution`, `GapHypothesis`, `UncertaintyStatement`, `Recommendation`, `NegativeFinding`, `PersonalPullNote`) | `src/types/domain.ts:462-588`; assembled by `generateBriefVersion.ts` (Slice 9) |
| Evidence/citations | `EvidenceItem`, `ClaimVersionEvidenceRef` | `src/types/domain.ts:92-140` |
| Department portfolio counts | `COUNT(*)` over `investigation`/`source_artifact`/`evidence_item` scoped by existing FK columns | existing tables, no schema change |
| Currently-executing component (NEW) | `generation_component_event` (§10, new table) | new — additive only |
| Department tile installed/planned status | Static config (which Departments have a working service layer today) — NOT a persisted domain fact; see §15 open question on where this config should live long-term | N/A — proposal-time static list |

---

## 8. Required New Read Models and API Endpoints

All are read-only projections over existing tables (plus §10's one new table). None duplicates
data — each is a query, not a new source of truth.

```typescript
// Mission Control (GET /api/mission-control)
interface MissionControlView {
  departments: DepartmentSummary[];
  activeWork: InvestigationSummary[];       // status in ('open','blocked')
  activeActivity: ActivityFeedEntry[];      // in-progress GenerationRuns, Core-wide
  recent: {
    investigations: InvestigationSummary[];
    briefs: BriefSummary[];
    evidence: EvidenceSummary[];
  };
}

interface DepartmentSummary {
  id: string;               // e.g. 'problem-department' — stable slug, not a DB row (no
                             // Department table exists at 37d91d4)
  name: string;
  thesis: string;
  status: 'installed' | 'planned';
}

interface InvestigationSummary {
  id: string;
  status: InvestigationStatus;    // reuses existing domain.ts enum
  statusReason?: string;
  createdAt: string;
}

interface BriefSummary {
  briefVersionId: string;
  investigationId: string;
  versionNumber: number;
  createdAt: string;
  recommendationDecision: RecommendationDecision;  // reuses existing domain.ts type
}

interface EvidenceSummary {
  evidenceItemId: string;
  investigationId: string;
  label: EvidenceLabel;           // reuses existing domain.ts type
  excerptOrSummary: string;
}

// Departments directory (GET /api/departments)
type DepartmentsView = DepartmentSummary[];

// Problem Department overview (GET /api/problem-department)
interface ProblemDepartmentOverview {
  department: DepartmentSummary;
  investigations: InvestigationSummary[];
  currentInvestigationId: string | null;
  sourceCount: number;
  evidenceCount: number;
  recentRuns: ActivityFeedEntry[];
}

// Investigation Workspace (GET /api/investigations/:id/workspace)
interface InvestigationWorkspaceView {
  investigation: Investigation;              // existing domain.ts type, unmodified
  sources: SourceArtifact[];                 // existing domain.ts type, unmodified
  activity: ActivityFeedEntry[];             // this Investigation's runs, incl. in-progress
  brief: BriefVersion | null;                // existing domain.ts type, unmodified;
                                              // null unless status === 'brief-generated'
}

// Activity feed (GET /api/activity, GET /api/investigations/:id/activity)
interface ActivityFeedEntry {
  generationRunId: string;
  investigationId: string;
  runtimeIdentifier: string;
  outcome: 'in-progress' | 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string | null;
  currentComponent: {                        // NEW — sourced from §10's lifecycle table;
    component: string;                       // absent when no component-started event exists
    startedAt: string;                       // without a matching completed/failed event yet
  } | null;
  completedSteps: Array<{                    // existing GenerationStep rows, unchanged
    component: string;
    outcome: 'succeeded' | 'failed';
    error?: string;
  }>;
}
```

Each read model is backed exactly as follows (no new writes except §10):

- `DepartmentSummary[]` — static list (see §7 open item) joined with a `COUNT`/`EXISTS` query
  against `investigation` for `status`.
- `InvestigationSummary[]`, `BriefSummary[]`, `EvidenceSummary[]` — direct `SELECT`s against
  `investigation`, `brief_version` (+ `recommendation`), `evidence_item` — all existing tables.
- `InvestigationWorkspaceView` — composes the existing `getInvestigation` service (source of
  `investigation`/`sources`) with a Brief lookup (existing `ProblemBrief.currentVersionId` →
  `BriefVersion`, the same chain Slice 10 was scoped to wire, see §14) and the new
  `ActivityFeedEntry` query.
- `ActivityFeedEntry[]` — `LEFT JOIN` of `generation_run`, `generation_step` (existing), and
  `generation_component_event` (§10, new) — `currentComponent` is derived by finding the latest
  `component-started` event for a run with no matching `component-completed`/`component-failed`
  event yet.

---

## 9. Smallest Browser Submission → generateBriefVersion Connection

**Current state, traced exactly:**

- `submitSources.ts` (`src/services/submitSources.ts`) creates/extends an `Investigation` and its
  `SourceArtifact`s, transactionally. It does not call generation.
- `src/web/server.ts`'s `POST /investigations` handler calls `submitSources`, then
  `resolveInvestigationSources`, then transitions status to `blocked` or `open` — and stops
  there. `generateBriefVersion` (`src/services/generateBriefVersion.ts`) is never invoked from
  the browser submission path at 37d91d4. It is presumably invoked today only from tests / a
  manual call site.

**Smallest wiring, no scope creep:**

After the existing `resolveInvestigationSources` call in the `POST /investigations` (and its
`/api/investigations` JSON twin, §1) handler, when `allUnreachable` is `false` (i.e. the
Investigation is `open`, at least one source resolved), invoke
`generateBriefVersion({ investigationId, runtimeIdentifier })` — fire it exactly once, with no
new orchestration layer:

```typescript
// smallest change, inside the existing POST /investigations handler, after the existing
// resolveInvestigationSources + transitionInvestigationStatus(... 'open' ...) branch:
if (!allUnreachable) {
  await transitionInvestigationStatus(submission.investigationId, 'open', null);
  // NEW — the only new call site:
  await generateBriefVersion({
    investigationId: submission.investigationId,
    runtimeIdentifier: RUNTIME_IDENTIFIER,   // existing constant/config, not newly designed here
  }).catch(() => {
    // generateBriefVersion already transitions the Investigation to 'generation-failed' and
    // finalizes its own GenerationRun on failure (existing Slice 9 behavior) — this handler does
    // not need to do anything further; it must not let a rejected promise crash the response.
  });
}
```

This is the ENTIRE connection — no new service, no new queue, no new retry logic. Two open
questions this raises for Danny (kept out of the code sketch, listed honestly in §15): (a)
whether generation should run synchronously in the request/response cycle (matching the existing
Slice 3 judgment call to run `resolveInvestigationSources` synchronously) or be fired
asynchronously so the redirect to the Workspace happens immediately and the activity feed (§6)
shows it running; (b) what `RUNTIME_IDENTIFIER` should resolve to — this proposal does not invent
a value.

---

## 10. Smallest Component Lifecycle Instrumentation (sketch only)

**Constraint honored:** additive to `generation_run`/`generation_step` (migration 006), does not
restructure Slice 8's append-only design. `generation_step` remains exactly as-is — this proposal
does not touch it.

**New table** (design sketch, not a full migration):

```sql
-- generation_component_event — append-only, additive to migration 006. Records the START of a
-- component (something generation_step cannot do, since a GenerationStep row is only inserted
-- AFTER a component completes or fails). completed/failed events are the SAME lifecycle as
-- recordGenerationStep already observes — this table does not replace generation_step, it adds
-- the missing "in-flight" signal generation_step structurally cannot carry.
CREATE TABLE generation_component_event (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_run_id  UUID NOT NULL REFERENCES generation_run(id),
  investigation_id   UUID NOT NULL REFERENCES investigation(id),   -- denormalized for direct
                                                                    -- Investigation-scoped queries
                                                                    -- without a join, matching the
                                                                    -- existing denormalization
                                                                    -- pattern already used elsewhere
                                                                    -- in this schema
  component          TEXT NOT NULL,        -- same component-name vocabulary as generation_step.component
  event_type         TEXT NOT NULL CHECK (event_type IN ('component-started', 'component-completed', 'component-failed')),
  occurred_at        TIMESTAMPTZ NOT NULL,
  error              TEXT,                 -- present iff event_type = 'component-failed'
  CONSTRAINT generation_component_event_error_matches_type CHECK (
    (event_type = 'component-failed') OR (error IS NULL)
  )
);
-- append-only, same trigger pattern as generation_step (reject_update_or_delete)
CREATE INDEX idx_generation_component_event_run ON generation_component_event (generation_run_id, occurred_at);
CREATE INDEX idx_generation_component_event_investigation ON generation_component_event (investigation_id, occurred_at);
```

**Interface sketch** (mirrors `provenanceRecorder.ts`'s existing `recordGenerationStep` pattern,
does not replace it):

```typescript
interface GenerationComponentEvent {
  generationRunId: string;
  investigationId: string;
  component: string;
  eventType: 'component-started' | 'component-completed' | 'component-failed';
  occurredAt: string;
  error?: string;
}

// New, small addition alongside recordGenerationStep — called at the START of
// runStepWithProvenance (provenanceRecorder.ts:328-390), before `input.fn()` runs, with event_type
// 'component-started'; and again immediately after `recordGenerationStep` is called in both the
// try and catch branches, with 'component-completed' or 'component-failed' — reusing the SAME
// component name, run id, and timing runStepWithProvenance already computes, not new data.
async function recordComponentEvent(input: GenerationComponentEvent): Promise<void>;
```

This is intentionally NOT a general event bus — one function, one table, three fixed event
types, wired into exactly the one existing chokepoint (`runStepWithProvenance`) every Slice 4-9
component call already passes through. No swarm concept, no presence, no polling design decided
here (SSE vs. client polling is left to implementation, since both read the same table).

---

## 11. React / Express Integration Boundary

**Decision: SPA + JSON API, not SSR.** Rationale:

- Mission Control / Department / Investigation Workspace are persistent-shell, multi-panel,
  live-updating screens (agent activity feed, §6) — a page-reload-per-navigation SSR model fits
  poorly with "live activity" as a first-class surface (binding input 7).
- `src/web/views.ts`'s existing server-rendered screens are narrow, single-purpose, form-centric
  (submission screen, three Investigation-state screens) — they do not need to become a SPA
  themselves; they become the DATA the new SPA's API layer serves (§1's API routes wrap the exact
  same underlying services those views already call: `getInvestigation`, `submitSources`,
  `resolveInvestigationSources`, `transitionInvestigationStatus`).

**Concrete boundary:**

- Express (`src/web/server.ts`) keeps its existing HTML routes UNCHANGED for now (no deletion in
  this proposal — see §15 for the open question of when/whether to retire them) and gains the
  JSON API routes from §1 alongside them.
- A new `src/web/public/` (or sibling `src/client/`) React app is built and served as static
  assets by the same Express app (`express.static`, already present at
  `src/web/server.ts:22`) for production; a separate dev server (e.g. Vite) proxies API calls to
  Express during development — standard SPA-behind-Express pattern, no new runtime process
  required in production.
- The React app owns client-side routing for the routes in §1; Express owns exactly the JSON API
  plus (until retired) the legacy HTML routes.
- `src/web/views.ts`'s HTML rendering functions (`renderSubmissionScreen`,
  `renderInvestigationGeneratingScreen`, `renderInvestigationBlockedScreen`,
  `renderInvestigationGenerationFailedScreen`) are NOT deleted by this proposal — they remain the
  fallback / non-JS entry point (or are retired later, Danny's call, §15) while the React shell
  becomes the primary, JS-required product surface.

---

## 12. Browser-Visible Implementation Checkpoints

**PRODUCT CHECKPOINT 1:** PRODUCT CHANGE: Danny can open the React app at `/`, see a real Mission
Control screen listing Problem Department as `installed` and the other three Departments as
honestly `planned` (no fake activity), and click into Problem Department to see the real
Investigation portfolio pulled from the live database — replacing the current situation where the
only way to see any of this is `GET /investigations/:id` for one Investigation ID at a time with
no directory or Department framing at all.

**PRODUCT CHECKPOINT 2:** PRODUCT CHANGE: Danny can submit sources from inside the new
Investigation Workspace screen (not the old bare HTML form) and watch the Investigation's status
and source-resolution states update in the same persistent shell — no full-page reload, no
separate "confirmation" screen — while the Sources panel reflects the real
`SourceArtifact.resolution` four-way state.

**PRODUCT CHECKPOINT 3:** PRODUCT CHANGE: Danny can watch a `GenerationRun` execute live from the
Investigation Workspace's activity panel — seeing which component is currently running (via §10's
new lifecycle events), not just a static "generating…" spinner — something no current screen can
show, since nothing today identifies an in-flight component.

**PRODUCT CHECKPOINT 4:** PRODUCT CHANGE: Danny can submit sources and, without any manual
trigger, watch the full pipeline run end-to-end from submission through a rendered Problem Brief
inside the Investigation Workspace (§9's wiring), landing on the same durable URL throughout —
closing the gap the product compass names explicitly in §12's "Not yet complete" column:
"Browser-to-generation execution connector."

---

## 13. Demonstration Criteria per Checkpoint

**Checkpoint 1:** Run the dev server, load `/` in a browser. Verify: Problem Department tile
shows `installed`; the other three show `planned` with no activity numbers. Click Problem
Department; verify the Investigation list matches `SELECT id, status, created_at FROM
investigation` for the local dev database exactly (row-for-row, no extra or missing rows).

**Checkpoint 2:** From the Problem Department overview, click "Start Investigation," submit a
text source. Verify: no full page navigation event fires (SPA route stays mounted); the Sources
panel shows the new artifact with `resolution.status` transitioning from `unresolved` to its
resolved value, matching what a direct `SELECT resolution FROM source_artifact WHERE id = ...`
shows in the DB at the same moment.

**Checkpoint 3:** Trigger a generation run (manually, for this checkpoint, ahead of Checkpoint
4's automatic wiring). While it is running, verify the activity panel shows a `currentComponent`
value that changes over the run's lifetime, and that each shown component name matches a row
inserted into `generation_component_event` at that moment (`SELECT component, event_type,
occurred_at FROM generation_component_event WHERE generation_run_id = ... ORDER BY occurred_at`).

**Checkpoint 4:** Submit sources for a brand-new Investigation with at least one reachable
source, with no manual generation trigger. Verify: the Workspace transitions from `open` →
(activity panel shows the run) → `brief-generated` (or `generation-failed`, if the pipeline
genuinely fails) without any additional user action, and the rendered Brief content matches
`SELECT * FROM brief_version WHERE id = (SELECT current_version_id FROM problem_brief WHERE
investigation_id = ...)`.

---

## 14. Exact Existing Slice 10 Requirements — Retained / Moved / Expanded

Verbatim source: `docs/specs/problem-department-mvp/04-ROADMAP.md` lines 867–950, "Slice 10:
Investigation Screen — Completed State (Read-Only)."

**Goal (verbatim):** "A human can read all seven required Brief elements (per
`01-REQUIREMENTS.md`'s canonical list) for one `BriefVersion`, presented from the same durable
Investigation URL (US-13 read half, Flow 3 steps 1–2, Q-7)."

- **RETAINED, unchanged in substance:** The `getInvestigation` → `ProblemBrief.currentVersionId`
  → `getBriefForReview` chain (roadmap's "Files" bullet 1) is retained exactly — this proposal's
  `InvestigationWorkspaceView` (§8) composes it, it does not replace or redesign it. All seven
  required Brief elements, rendered without collapse-by-default; no system-generated numeric
  confidence anywhere; Personal Pull visually separated from Demand; `CitationScopeNotice`;
  `SearchScopeNotice`; `NegativeFindingNotice` for exactly the four negatable elements (Evidence,
  Demand Signal Type, Existing-Solution, Gap Hypothesis); Problem Definition never rendering
  `NegativeFindingNotice` — every one of these Implementation Notes and Tests entries (lines
  882-945) is retained as-is, unmodified, as the Brief-rendering requirement for the "Problem
  Brief panel" in §5's Investigation Workspace.
- **MOVED:** The presentation location. Slice 10 specified "Investigation Screen — Completed
  State," a dedicated full-page screen reached only when `status === 'brief-generated'`
  (note: the roadmap text itself says `'completed'` in its Tests section, line 915 —
  `Investigation.status === 'completed'` — which does NOT match the actual `InvestigationStatus`
  enum in `domain.ts` (`'brief-generated'`, not `'completed'`); this is a pre-existing
  terminology mismatch in the roadmap text, called out here verbatim rather than silently
  corrected, per this task's instruction not to rewrite Slices 1-9 material). This proposal moves
  that same rendering into a PANEL inside the persistent Investigation Workspace (§5) rather than
  a screen reached by a status-gated route branch — the Workspace shows the Brief panel
  conditionally on `status === 'brief-generated'`, in place, rather than as a separate route.
- **EXPANDED:** Slice 10's original scope assumed the read-only Brief was the entirety of what a
  human sees for a completed Investigation. This proposal adds, alongside it in the same
  Workspace: the live/historical agent-activity panel (§6, backed by §10's new lifecycle table)
  and the provenance/run-log panel (§5) — neither existed in Slice 10's scope, and neither
  requires any change to the Brief-rendering requirements retained above.
- **NOT retained by this proposal, deliberately unaddressed:** Slice 10 explicitly excludes
  `DecisionForm` (built in Slice 11) — this proposal reserves the Decision panel's LOCATION in
  the Workspace layout (§5) but does not design Decision persistence or the form itself, matching
  Slice 10's own original boundary.

---

## 15. Decisions Requiring Danny's Judgment

Real, unresolved ambiguity — not manufactured precision:

1. **Synchronous vs. asynchronous generation trigger (§9).** Should
   `generateBriefVersion` fire in the same request/response cycle as source submission (matching
   the existing Slice 3 precedent of running `resolveInvestigationSources` synchronously), or
   should the redirect happen immediately and generation run in the background, with the
   Workspace's activity panel (§6) picking it up via polling/SSE? This materially affects
   Checkpoint 4's UX (does the browser hang during generation, or does it show a live view of it
   running?) and this proposal does not pick one.
2. **`RUNTIME_IDENTIFIER` value for the new `generateBriefVersion` call site (§9).** Not invented
   here — needs a real, sourced value (or an existing config this proposal didn't locate).
3. **Live-update transport for the activity panel (§6, §10).** Polling `GET
   /api/investigations/:id/activity` on an interval, versus Server-Sent Events, versus WebSocket.
   All three read the same `generation_component_event` table; this is a pure implementation
   choice with cost/complexity tradeoffs Danny may want to weigh (SSE avoids polling overhead but
   is a new transport in this codebase; polling is the smallest addition).
4. **Retirement of `src/web/views.ts`'s server-rendered HTML screens (§11).** This proposal keeps
   them running alongside the new API/React shell rather than deleting them, since deleting live
   code is out of this design's scope — but leaving both surfaces live indefinitely is not a
   permanent answer either. Danny's call on timing.
5. **Where `DepartmentSummary`'s installed/planned config lives (§7, §8).** This proposal treats
   it as a static list, since no `Department` table exists at 37d91d4. Is a real `department`
   table (even a tiny static-seed one) worth adding now so this stops being an
   implementation-hardcoded list, or is that premature given only one Department is real?
   PROVISIONAL — no owner assigned, flagged rather than decided.
6. **`Evidence` and `Runs` top-level nav items (§1).** Compass §13's persistent-nav table lists
   `Evidence` and `Runs` as their own nav entries at the Core level, distinct from `Activity`.
   This proposal did not design separate cross-Department Evidence/Runs index screens because no
   existing service at 37d91d4 aggregates evidence or runs across Departments in a form that
   would be honest to show today (only one Department exists, so today it would be identical to
   Problem Department's own view) — is that acceptable to defer, or does Danny want the nav items
   present now, pointing at Problem-Department-scoped data until a second Department exists?
7. **Knowledge surface build order.** `/knowledge` and the Investigation-scoped lineage view are
   reserved as routes/read-model shape only (per binding input 9) — no read model, no query, no
   UI is designed for them here beyond the entity path (Investigation → SourceArtifact →
   EvidenceItem → Claim/ClaimVersion → ProblemBrief/BriefVersion → Recommendation → later
   Decision/validity). Should this be the very next design pass after this one is approved, or
   should it wait until Prototype Department or a second Department exists to give it real
   cross-Department content?

---

## Carried Defect Dispositions (recorded verbatim, not re-investigated)

- **`callId` in `provenanceContext.ts`:** remains a CONFIRMED latent provenance defect —
  `buildValidationRecords` in `provenanceRecorder.ts` falls back to `inv.callId ?? inv.toolName`,
  which would silently merge two same-tool calls if `callId` is ever unset.
- **Landscape extraction failure-absorption** (`src/services/landscapeResearcher.ts` ~lines
  276-292): RECLASSIFIED as an unresolved partial-evidence behavior requiring focused
  characterization — NOT currently proven broken, NOT closed. Verified this session: it now gates
  on `extractionResult.evidenceItems.length === 0` before reporting `generationFailed`, which is
  more defensible than a prior memory's "always absorbs failure" characterization, but has not
  been fully characterized as correct either.
