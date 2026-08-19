# Department OS Product Surface — Design Proposal

**Status:** DESIGN ONLY — no application code. Written for Danny's review; NOT dispatched for
implementation. Replaces the presumed mechanical "Slice 10" entry point per Danny's explicit
redirection. **Revision 2** — responds to PR #7's FAIL verdict (9 binding revision items). See
final section "Revision 2 — PR #7 Disposition" for the traceability table.

**Base:** branch `feature/problem-department-mvp`, commit `37d91d4` (Slice 9 Brief Assembler
closed). Grounded against `docs/product-architecture-and-direction.md` (commit `fe2ee62`,
binding), `src/types/domain.ts`, `src/web/server.ts`, `src/services/submitSources.ts`,
`src/services/generateBriefVersion.ts`, `src/services/provenanceRecorder.ts`,
`src/services/provenanceContext.ts`, `src/db/migrations/006_generation_run_provenance.sql`, and
`docs/specs/problem-department-mvp/04-ROADMAP.md` lines 867–950. Revision 2 additionally
re-reads `src/db/migrations/006_generation_run_provenance.sql` and
`src/services/provenanceRecorder.ts` in full (item 3) and `src/types/domain.ts` lines 62–589 in
full (item 4), per Danny's explicit instruction.

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
| `/evidence` | Core-wide Evidence surface (Revision 2, item 6 — see §8a) |
| `/runs` | Core-wide Runs surface (Revision 2, item 6 — see §8a) |
| `/knowledge` | Core-wide Knowledge surface — **reserved route only in this design**, not built (see §2, §8) |

`Evidence` and `Runs` are now designed (§8a), resolving old §15 item 6 rather than deferring it
again (Revision 2 item 6). `/knowledge` remains reserved-only, unchanged — Danny's instruction was
to resolve evidence/runs only, not to design Knowledge further in this pass.

### Express API routes (additive, JSON, alongside the existing server-rendered routes)

| Method | Route | Backs |
|---|---|---|
| `GET` | `/api/mission-control` | Mission Control read model (§8 `MissionControlView`) |
| `GET` | `/api/departments` | Departments directory read model (§8 `DepartmentSummary[]`) |
| `GET` | `/api/problem-department` | Problem Department overview read model (§8 `ProblemDepartmentOverview`) |
| `GET` | `/api/investigations/:id/workspace` | Investigation Workspace read model (§8 `InvestigationWorkspaceView`) — supersedes the presumed Slice 10 `getBriefForReview` wiring point, see §14 |
| `GET` | `/api/investigations/:id/activity` | Investigation-scoped agent activity feed (§8 `ActivityFeedView`) |
| `GET` | `/api/activity` | Global (Core-wide) agent activity feed (§8 `ActivityFeedView`, unscoped) |
| `GET` | `/api/evidence` | Core-wide Evidence read model, Department-tagged (§8a `EvidenceIndexView`) — Revision 2 item 6 |
| `GET` | `/api/runs` | Core-wide Runs read model, Department-tagged (§8a `RunsIndexView`) — Revision 2 item 6 |
| `POST` | `/api/investigations` | JSON equivalent of existing `POST /investigations` — wraps `submitSources` (unchanged), see §9 |
| `POST` | `/api/investigations/:id/sources` | JSON equivalent of adding sources to an existing Investigation — same `submitSources` call, `investigationId` supplied |
| `POST` | `/api/investigations/:id/generation-runs` | Browser-triggered generation (§9, Revision 2 item 2 — replaces the old §9 open question) |

Every API route above is a **read model or a thin wrapper around an existing service** — none
introduces new business logic except §9's `generation-runs` endpoint, which is a thin
request/response wrapper around the existing `generateBriefVersion` service (no new business
logic inside `generateBriefVersion` itself). §8/§8a specify exactly which existing tables/services
back each read model.

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
2. **Active work** — restructured into three explicit groups (Revision 2 item 7, replaces the old
   flat "status in ('open','blocked')" list). See §2a for the full specification.
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

### 2a. Active Work — Three Explicit Groups (Revision 2 item 7)

The old proposal's "Active work" section conflated real in-progress generation with merely
`open`/`blocked` Investigations that may have no run happening at all. Replaced with three
explicitly sourced groups, each independently queryable and never ambiguous about its backing
data:

| Group | Definition | Backing query |
|---|---|---|
| **Active** | Investigations with a real in-progress `GenerationRun` | `SELECT DISTINCT investigation_id FROM generation_run WHERE outcome = 'in-progress'` — joined back to `investigation` for display fields |
| **Needs Attention** | Investigations stalled or failed, no run currently reviving them | `SELECT * FROM investigation WHERE status IN ('blocked', 'generation-failed')` |
| **Recent / Completed** | Investigations that reached a Brief, or whose most recent `GenerationRun` finished (succeeded or failed), ordered by recency | `investigation.status = 'brief-generated'` UNION any `generation_run` row with `outcome <> 'in-progress'`, ordered by `GREATEST(generation_run.completed_at, investigation.createdAt)` descending, deduplicated by `investigation_id` (keep the most recent row per investigation) |

These three groups are mutually exclusive by construction: an Investigation with an in-progress
`generation_run` row is Active regardless of its `status` column; `Needs Attention` only ever
considers Investigations with NO in-progress run (an Active investigation whose `status` happens
to be `blocked` mid-retry — not a state that exists today, but the precedence rule is stated for
future-proofing: Active is evaluated first, and an investigation already placed in Active is
excluded from the other two groups' queries); `Recent/Completed` only considers non-in-progress
terminal state. Each group's read model type is `InvestigationSummary[]` (§8, unchanged shape).

`MissionControlView.activeWork` (§8) is updated accordingly — see §8's revised interface.

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
3. **Last-active Investigation** — the Investigation with the most recent LAST RECORDED ACTIVITY
   (Revision 2 item 8 — replaces "most recently updated," which relied on a non-existent
   `Investigation.updatedAt` field). See §4a for the exact computation. Linked directly into
   Screen D.
4. **Department-level Sources / Evidence** — aggregate counts of `SourceArtifact` rows and
   `EvidenceItem` rows across this Department's Investigations (real counts from existing tables,
   not derived/estimated).
5. **Department-level Runs / Activity** — recent `GenerationRun`s across this Department's
   Investigations, plus the live-activity feed scoped to this Department (§6, §10).
6. **Start Investigation** — entry point that opens the existing submission flow
   (`POST /investigations` today; `POST /api/investigations` in the React shell, §1, §9) — this is
   the existing Slice 1 capability, exposed from the new IA, not reimplemented.

### 4a. Last Recorded Activity — Exact Computation (Revision 2 item 8)

`domain.ts`'s `Investigation` interface has only `createdAt` — no `updatedAt` column exists
anywhere in the schema, and this proposal does not invent one. "Last recorded activity" per
Investigation is instead the `GREATEST` of every real, persisted timestamp that touches that
Investigation, across real tables:

```sql
SELECT i.id,
       GREATEST(
         i.created_at,
         COALESCE(MAX(gr.started_at), i.created_at),
         COALESCE(MAX(gr.completed_at), i.created_at),
         COALESCE(MAX(gce.occurred_at), i.created_at),   -- generation_component_event (§10)
         COALESCE(MAX(gs.completed_at), i.created_at),   -- generation_step, joined via generation_run
         COALESCE(MAX(bv.created_at), i.created_at)       -- brief_version, joined via problem_brief
       ) AS last_activity_at
  FROM investigation i
  LEFT JOIN generation_run gr ON gr.investigation_id = i.id
  LEFT JOIN generation_component_event gce ON gce.investigation_id = i.id
  LEFT JOIN generation_step gs ON gs.generation_run_id = gr.id
  LEFT JOIN problem_brief pb ON pb.investigation_id = i.id
  LEFT JOIN brief_version bv ON bv.problem_brief_id = pb.id
 GROUP BY i.id, i.created_at
 ORDER BY last_activity_at DESC;
```

"Last-active Investigation" for §4 item 3 is `LIMIT 1` of this query, scoped to Problem
Department (today, every Investigation). The same `last_activity_at` computation backs Mission
Control's §2 item 4 "Recent Investigations" ordering — one shared query, not two divergent
recency definitions. Every source column referenced (`generation_run.started_at/completed_at`,
`generation_component_event.occurred_at`, `generation_step.completed_at`,
`brief_version.created_at`, `investigation.created_at`) is a real, already-persisted column —
`generation_component_event` is the one new table from §10, unchanged in this respect.

---

## 5. Investigation Workspace Structure and State Behavior (Screen D)

One workspace per Investigation, at the durable URL
`/departments/problem-department/investigations/:investigationId` (preserves the "one durable
Investigation URL" discipline from `04-ROADMAP.md` Slice 10's Q-7 reference and Slice 3's
existing `GET /investigations/:id`).

Structure:

- **Header** — `Investigation.id`, `status`, `statusReason` (when present), `createdAt`.
- **Sources panel** — every `SourceArtifact` for this Investigation:
  `type`, `raw`, `resolution.status` (four-way: `unresolved` | `unreachable` |
  `content-retrieved` | `reachable-no-content`), `resolution.failureReason` /
  `noContentReason` when present. Mirrors the existing `InvestigationSourceForDisplay` mapping in
  `src/web/server.ts` lines 121-127 — no new source-resolution logic, just presented inside the
  new shell.
- **Workflow stage indicator** — derived from MULTIPLE signals, not `status` alone (Revision 2
  item 5 — replaces the old flat switch-on-`status`). See §5a for the full derivation table.
- **Agent/component activity panel** — this Investigation's `GenerationRun`s, including any
  currently in-progress run's live component step, backed by §10's lifecycle addition. This is
  new — no equivalent exists in the current server-rendered screens.
- **Problem Brief panel** (only when a `BriefVersion` exists for this Investigation) — fully
  specified via `BriefForReview` (Revision 2 item 4). See §8's `BriefForReview` interface, which
  supersedes the old flat `brief: BriefVersion | null` field entirely.
- **Provenance and run log** — the full `GenerationRun`/`GenerationStep` list for this
  Investigation (`provenanceRecorder.ts`'s existing persisted shape), presented as an inspectable
  log, not summarized away. `BriefForReview.provenance` (§8) additionally identifies exactly which
  `GenerationRun`/step produced the currently-displayed `BriefVersion`.
- **Blocked / generation-failed states** — rendered in place, inside this same workspace (not a
  separate screen), matching the current three-way branch in `src/web/server.ts` lines 129-150 —
  this proposal keeps that branching but re-hosts it inside the persistent Workspace shell instead
  of full-page server-rendered HTML.
- **Human decisions and validity/history** (later slice, Investigation Workspace item D's tail
  clause) — this proposal reserves the panel location in the Workspace layout but does not design
  `Decision`/`ReconsiderationCondition` persistence or the Decision Form — that is unchanged
  Slice 11/12 scope, untouched here.

### 5a. Workflow Stage Derivation — Multiple Signals (Revision 2 item 5)

The old proposal derived the "Workflow stage indicator" purely from `Investigation.status`, which
cannot express "generating: evidence extraction running" — a real state combining `status ===
'open'`, an in-progress `GenerationRun`, and the current in-flight component from
`generation_component_event`. The old design's four-way switch on `status` alone structurally
could not carry that granularity. Derivation now consults five signals in the stated precedence
order (first match wins):

| Precedence | Signal condition | Displayed stage |
|---|---|---|
| 1 | `SourceArtifact.resolution.status === 'unresolved'` for at least one source, no `GenerationRun` yet exists for this investigation | "accepting sources — awaiting resolution" |
| 2 | `Investigation.status === 'blocked'` | "blocked: no reachable sources" — render `statusReason` verbatim |
| 3 | A `generation_run` row exists with `outcome = 'in-progress'` for this investigation | "generating: `<currentComponent>` running" — `<currentComponent>` read from the latest `generation_component_event` row with `event_type = 'component-started'` and no matching terminal event yet (§10a); if no `component-started` event has landed yet (race between run creation and first event), render "generating: starting" |
| 4 | `Investigation.status === 'generation-failed'` | "generation failed" — render `statusReason` verbatim |
| 5 | A `BriefVersion` exists for this investigation (`ProblemBrief.currentVersionId` resolves) | "brief generated — version `<versionNumber>`" |
| 6 (fallback) | None of the above (e.g. freshly created, sources not yet all resolved, no run yet) | "accepting sources / awaiting generation" |

Pseudocode (evaluated top to bottom, first match returned):

```typescript
function deriveWorkflowStage(input: {
  investigation: Investigation;
  sources: SourceArtifact[];
  latestRun: GenerationRun | null;            // most recent generation_run row for this investigation, or null
  currentComponentEvent: { component: string } | null;  // §10a's derivation — null if none in-progress
  briefVersion: BriefVersion | null;
}): WorkflowStage {
  if (input.sources.some(s => s.resolution.status === 'unresolved') && input.latestRun === null) {
    return { kind: 'awaiting-resolution' };
  }
  if (input.investigation.status === 'blocked') {
    return { kind: 'blocked', reason: input.investigation.statusReason };
  }
  if (input.latestRun?.outcome === 'in-progress') {
    return input.currentComponentEvent
      ? { kind: 'generating', component: input.currentComponentEvent.component }
      : { kind: 'generating-starting' };
  }
  if (input.investigation.status === 'generation-failed') {
    return { kind: 'generation-failed', reason: input.investigation.statusReason };
  }
  if (input.briefVersion !== null) {
    return { kind: 'brief-generated', versionNumber: input.briefVersion.versionNumber };
  }
  return { kind: 'awaiting-generation' };
}
```

This is the same signal set named in Revision 2 item 5 (source resolution state, lifecycle
events, GenerationSteps, GenerationRun, Brief persistence) made concrete rather than
hand-waved — `GenerationStep` itself is not directly branched on here (it is surfaced in the
activity panel, §6), but its absence/presence is implied by `latestRun.outcome`.

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
- **Currently-executing component** — sourced from §10's lifecycle events via §10a's
  `componentExecutionId`-correlated query, not from `GenerationStep` (which, per the task's
  grounding note, is only persisted after a component completes — nothing at 37d91d4 identifies
  what is running RIGHT NOW).
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
| Currently-executing component | `generation_component_event` (§10, new table, `component_execution_id`-correlated per §10a) | new — additive only |
| Last recorded activity (Revision 2 item 8) | `GREATEST` across `investigation.created_at`, `generation_run.started_at/completed_at`, `generation_component_event.occurred_at`, `generation_step.completed_at`, `brief_version.created_at` | §4a — no new column |
| Evidence/Runs Core-wide index (Revision 2 item 6) | Same `evidence_item`/`generation_run` tables, tagged `departmentId` | §8a — no schema change, `departmentId` is a derived/joined literal, not a new column (see §8a) |
| Department tile installed/planned status | Static config (which Departments have a working service layer today) — NOT a persisted domain fact; see §15 open question on where this config should live long-term | N/A — proposal-time static list |

---

## 8. Required New Read Models and API Endpoints

All are read-only projections over existing tables (plus §10's one new table). None duplicates
data — each is a query, not a new source of truth.

```typescript
// Mission Control (GET /api/mission-control)
interface MissionControlView {
  departments: DepartmentSummary[];
  activeWork: {                             // Revision 2 item 7 — replaces the old flat array
    active: InvestigationSummary[];         // real in-progress GenerationRuns (§2a)
    needsAttention: InvestigationSummary[]; // status in ('blocked','generation-failed')
    recentCompleted: InvestigationSummary[];// brief-generated OR any finished GenerationRun,
                                             // ordered by recency
  };
  activeActivity: ActivityFeedEntry[];      // in-progress GenerationRuns, Core-wide
  recent: {
    investigations: InvestigationSummary[]; // ordered by §4a's last_activity_at
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
  lastActivityAt: string;         // §4a's GREATEST computation, ISO timestamp
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
  lastActiveInvestigationId: string | null;   // §4a, renamed from currentInvestigationId —
                                                // "last recorded activity," not "most recently
                                                // updated" (Revision 2 item 8)
  sourceCount: number;
  evidenceCount: number;
  recentRuns: ActivityFeedEntry[];
}

// Investigation Workspace (GET /api/investigations/:id/workspace)
interface InvestigationWorkspaceView {
  investigation: Investigation;              // existing domain.ts type, unmodified
  sources: SourceArtifact[];                 // existing domain.ts type, unmodified
  activity: ActivityFeedEntry[];             // this Investigation's runs, incl. in-progress
  workflowStage: WorkflowStage;              // §5a's derived value, computed server-side and
                                              // returned pre-derived (client does not re-derive)
  briefForReview: BriefForReview | null;     // Revision 2 item 4 — replaces the old flat
                                              // `brief: BriefVersion | null`. See below.
}

type WorkflowStage =
  | { kind: 'awaiting-resolution' }
  | { kind: 'blocked'; reason?: string }
  | { kind: 'generating'; component: string }
  | { kind: 'generating-starting' }
  | { kind: 'generation-failed'; reason?: string }
  | { kind: 'brief-generated'; versionNumber: number }
  | { kind: 'awaiting-generation' };

// ---- BriefForReview (Revision 2 item 4) — the fully resolved read model backing the Problem
// Brief panel (§5) and the retained Slice 10 rendering requirements (§14). Replaces the old
// proposal's flat `brief: BriefVersion | null`, which left every claim/evidence/citation/source/
// negative-finding/search-limitation relationship unresolved (a UI would have had to issue N
// further fetches or re-derive joins client-side, exactly the underspecification PR #7 flagged).
// Every field below traces to a real domain.ts interface, resolved server-side into one nested
// payload for a single-fetch Brief read.

interface BriefForReview {
  briefVersion: {
    id: string;
    problemBriefId: string;
    versionNumber: number;
    createdAt: string;
    supersedesVersionId: string | null;
  };

  // Problem Statement — non-negatable (BriefElement excludes 'problem-statement'; §14's
  // "Problem Definition never renders NegativeFindingNotice" rule depends on this element having
  // no negativeFinding field at all, not an empty one).
  problemStatements: Array<{
    id: string;
    whoExperiencesIt: string;
    contextOrWorkflow: string;
    consequenceOrFriction: string;
    supportingClaims: ResolvedClaimVersion[];   // resolved via supportingClaimVersionIds
  }>;

  // Evidence & Claims — every ClaimVersion this BriefVersion cites, each with its evidence refs
  // fully resolved (stance read from the ref, not the EvidenceItem — domain.ts's explicit
  // PR-review binding correction, preserved here).
  claimVersions: ResolvedClaimVersion[];

  // Demand
  demandSignals: Array<{
    id: string;
    type: DemandSignalType;
    otherTypeLabel?: string;
    evidenceItems: ResolvedEvidenceItem[];      // resolved via evidenceItemIds
  }>;
  demandConfidenceClassification: {
    level: DemandConfidenceLevel;
    narrative: string;
    citedDemandSignals: Array<{ id: string; type: DemandSignalType }>; // resolved via citedDemandSignalIds
    negativeFinding: ResolvedNegativeFinding | null; // resolved via negativeFindingRef
  };

  // Personal Pull — structurally separate from Demand, never merged (US-12 discipline retained)
  personalPullNotes: Array<{
    id: string;
    sourceArtifact: ResolvedSourceArtifact;
    text: string;
    label: 'contextual-motivation';
  }>;

  // Existing-Solution Landscape
  existingSolutions: Array<{
    id: string;
    name: string;
    whatItAddresses: string;
    howPeopleCopeNow: string;
    whereItsInadequate: string;
    evidenceItems: ResolvedEvidenceItem[];
  }>;
  existingSolutionNegativeFinding: ResolvedNegativeFinding | null; // element: 'existing-solution'

  // Gap Hypothesis
  gapHypotheses: Array<{
    id: string;
    category: GapCategory;
    otherCategoryLabel?: string;
    statement: string;
    evidenceItems: ResolvedEvidenceItem[];
  }>;
  gapHypothesisNegativeFinding: ResolvedNegativeFinding | null; // element: 'gap-hypothesis'

  // Evidence-element negative finding — structurally unreachable in this MVP (§14 note preserved:
  // Evidence's negative path cannot occur), included as `null` for type-shape completeness rather
  // than omitted, so the panel's negative-finding rendering logic is uniform across all 4
  // negatable elements without a special case.
  evidenceNegativeFinding: ResolvedNegativeFinding | null; // element: 'evidence' — always null today

  // Uncertainty & Recommendation — both non-negatable
  uncertaintyStatement: {
    whatsUnknown: string[];
    whatWouldChangeConclusion: string[];
    whatsUndeterminable: string[];
  };
  recommendation: {
    decision: RecommendationDecision;
    rationale: string;
  };

  // CitationScopeNotice (§14) — fixed, always-rendered notice text; not derived from data, but the
  // presence of at least one ClaimVersionEvidenceRef across `claimVersions` is what makes the
  // notice meaningful, so `hasCitations: boolean` is included for the panel to decide whether to
  // render it at all vs. render alongside a negative finding.
  citationScopeNotice: { hasCitations: boolean };

  // SearchScopeNotice (§14) — every WebSearchQuery this GenerationRun performed, with per-result
  // status, so the panel can render "queries performed and any failed/blocked retrievals."
  searchScopeNotice: {
    queries: Array<{
      id: string;
      query: string;
      performedAt: string;
      scopeNote?: string;
      limitations: string[];
      queryLimitation: { reason: string; occurredAt: string } | null; // resolved QueryLimitation
      results: Array<{
        url: string;
        status: 'retrieved' | 'blocked' | 'failed';
        failureReason?: string;
        retrievedAt: string;
      }>;
    }>;
  };

  // Provenance — which GenerationRun/step produced this BriefVersion (Revision 2 item 4's
  // "provenance element" requirement).
  provenance: {
    generationRunId: string;
    runtimeIdentifier: string;
    startedAt: string;
    completedAt: string;
    modelIdentifiers: string[];
    toolsInvoked: string[];
    producingStep: {                 // the specific GenerationStep that assembled this
                                      // BriefVersion, if the Brief Assembler is itself recorded
                                      // as a step (component name, per Slice 9's pipeline)
      component: string;
      completedAt: string;
    } | null;
  };
}

// ---- Shared resolved-entity shapes, reused across BriefForReview's sections above ----

interface ResolvedClaimVersion {
  id: string;
  claimId: string;
  versionNumber: number;
  text: string;
  evidence: NonEmptyArray<{                  // resolved from ClaimVersionEvidenceRef — stance
    stance: 'supporting' | 'contradicting' | 'neutral-context';  // read from the REF, not the
    relevanceNote?: string;                                       // EvidenceItem (binding rule
    evidenceItem: ResolvedEvidenceItem;                           // preserved from domain.ts)
  }>;
}

interface ResolvedEvidenceItem {
  id: string;
  excerptOrSummary: string;
  label: EvidenceLabel;
  sourceArtifact: ResolvedSourceArtifact;     // resolved via sourceArtifactId — "source backing
                                                // each EvidenceItem," Revision 2 item 4
}

interface ResolvedSourceArtifact {
  id: string;
  type: SourceArtifactType;
  raw: string;
  origin: SourceArtifactOrigin;
}

interface ResolvedNegativeFinding {
  id: string;
  element: BriefElement;
  statement: string;
}

// Activity feed (GET /api/activity, GET /api/investigations/:id/activity)
interface ActivityFeedEntry {
  generationRunId: string;
  investigationId: string;
  runtimeIdentifier: string;
  outcome: 'in-progress' | 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string | null;
  currentComponent: {                        // sourced from §10a's lifecycle table, correlated
                                              // via component_execution_id
    component: string;
    componentExecutionId: string;
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
  `InvestigationSummary.lastActivityAt` uses §4a's `GREATEST` query.
- `MissionControlView.activeWork` — §2a's three queries, run independently (not filtered from one
  combined result set, since their precedence rule requires evaluating Active first).
- `InvestigationWorkspaceView` — composes the existing `getInvestigation` service (source of
  `investigation`/`sources`) with §5a's `deriveWorkflowStage` (server-computed) and a `BriefForReview`
  assembly query (below) and the new `ActivityFeedEntry` query.
- `BriefForReview` — one `getBriefForReview`-equivalent service (the chain named in §14) that,
  given a `BriefVersion.id`, resolves EVERY id-array field on `BriefVersion` and its sub-entities
  into the nested shape above via a fixed sequence of `SELECT ... WHERE id = ANY($ids)` /
  `WHERE briefVersionId = $id` queries against `problem_statement`, `claim_version` (+
  `claim_version_evidence`), `evidence_item`, `source_artifact`, `demand_signal`,
  `demand_confidence_classification`, `personal_pull_note`, `existing_solution`,
  `gap_hypothesis`, `negative_finding`, `uncertainty_statement`, `recommendation`, plus
  `web_search_query`/`web_search_result`/`query_limitation` scoped by
  `BriefVersion.generationRunId` for `searchScopeNotice`, and `generation_run`/`generation_step`
  for `provenance`. No new table — this is a resolution layer over Slice 9's existing persisted
  shapes.
- `ActivityFeedEntry[]` — `LEFT JOIN` of `generation_run`, `generation_step` (existing), and
  `generation_component_event` (§10, new) — `currentComponent` is derived per §10a: the latest
  `component-started` event for a run with no matching terminal event (by
  `component_execution_id`, not merely by `component` name, since a component name is shared
  across every execution of that component).

---

## 8a. Core Routes: `/evidence` and `/runs` (Revision 2 item 6)

Resolves old §15 item 6, previously deferred. Both are Core-wide (not Department-scoped) read
models, analogous in shape to the existing `EvidenceSummary`/`ActivityFeedEntry` shapes. At
37d91d4 they surface only Problem Department records, but every row is EXPLICITLY TAGGED with a
`departmentId` field so the shape does not need a reshape when a second Department exists — the
tag is honest about today's scope (single-Department) without baking that assumption structurally
into the type.

```typescript
// GET /api/evidence
interface EvidenceIndexView {
  items: Array<{
    evidenceItemId: string;
    departmentId: string;          // e.g. 'problem-department' — literal today, joined from the
                                    // owning Investigation's Department; not a persisted column
                                    // on evidence_item (no schema change — see note below)
    investigationId: string;
    label: EvidenceLabel;
    excerptOrSummary: string;
    sourceArtifactId: string;
    createdAt?: string;
  }>;
}

// GET /api/runs
interface RunsIndexView {
  runs: Array<{
    generationRunId: string;
    departmentId: string;          // same tagging convention as above
    investigationId: string;
    outcome: 'in-progress' | 'succeeded' | 'failed';
    startedAt: string;
    completedAt: string | null;
    runtimeIdentifier: string;
  }>;
}
```

**Backing:** direct `SELECT`s against `evidence_item` (joined through `source_artifact` →
`investigation` for scope) and `generation_run` (joined through `investigation`) — no new tables,
no new columns. `departmentId` is NOT a new persisted column: because exactly one Department
exists today and every `Investigation` row belongs to it, `departmentId` is populated as a
constant literal `'problem-department'` in the query's `SELECT` list (`SELECT ..., 'problem-department'
AS department_id FROM ...`). This is honest about being a single-Department system today (per the
"no fabricated surface" constraint, §9) while making the *read model's shape* — not its current
data — already multi-Department-ready: when a second Department is installed, the literal becomes
a real join column (e.g. via an `investigation.department_id` column added at that time, or a
lookup keyed by whichever mechanism the second Department's persistence uses), and no consumer of
`EvidenceIndexView`/`RunsIndexView` needs to change, since the field was always present in the
type.

`/evidence` and `/runs` are unfiltered by default; both accept an optional `?department=` query
parameter for forward-compatibility with the same filtering pattern already used for
`/api/activity` (§6), though at 37d91d4 it has exactly one valid value.

`/knowledge` remains reserved-only per Danny's explicit instruction to resolve evidence/runs only
in this pass — unchanged from the prior revision, not further designed here.

---

## 9. Smallest Browser Submission → generateBriefVersion Connection

**Current state, traced exactly:**

- `submitSources.ts` (`src/services/submitSources.ts`) creates/extends an `Investigation` and its
  `SourceArtifact`s, transactionally. It does not call generation.
- `src/web/server.ts`'s `POST /investigations` handler calls `submitSources`, then
  `resolveInvestigationSources`, then transitions status to `blocked` or `open` — and stops
  there. `generateBriefVersion` (`src/services/generateBriefVersion.ts`) is never invoked from
  the browser submission path at 37d91d4.

**Concrete decision (Revision 2 item 2 — replaces the old unresolved sync/async question):**

Generation is initiated by the browser via a dedicated endpoint, not folded into source
submission:

```
POST /api/investigations/:id/generation-runs
```

- **The SERVER AWAITS `generateBriefVersion` synchronously.** The handler calls
  `await generateBriefVersion({ investigationId, runtimeIdentifier })` and does not respond until
  it resolves or rejects — no fire-and-forget, no detached background job. This matches the
  existing Slice 3 precedent of running `resolveInvestigationSources` synchronously in the request
  cycle, applied consistently rather than left as an open question.
- **The BROWSER POLLS persisted state concurrently.** The client does not sit idle waiting only on
  this one long-held POST. While the POST is in flight, the Workspace's activity panel (§6) polls
  `GET /api/investigations/:id/activity` (or the composite `GET /api/investigations/:id/workspace`)
  on its normal interval, independent of the POST's lifecycle — so the activity panel updates live
  (showing `currentComponent` transitions via §10a) even though the triggering POST itself is a
  single long-held synchronous call that only resolves at the very end. This is why item 2 phrases
  it as "server awaits, browser polls concurrently" rather than "browser waits on the POST" — the
  POST and the polling are two independent request streams from the same page, not sequential.
- **Active-run duplicate protection.** Before calling `generateBriefVersion`, the handler checks
  for an existing in-progress run:

```sql
SELECT id FROM generation_run
 WHERE investigation_id = $1 AND outcome = 'in-progress';
```

  If a row is found, the handler returns `409 Conflict` immediately (no new `generateBriefVersion`
  call, no new `GenerationRun` created) with a body referencing the existing run:

```typescript
// 409 response body
interface GenerationRunConflict {
  error: 'generation-already-in-progress';
  existingGenerationRunId: string;   // GenerationRun.id of the in-progress row found above
}
```

  This reuses `generation_run.outcome = 'in-progress'` — a real, existing column per migration
  006 (§ header: "`generation_run` is NOT append-only ... `outcome = 'in-progress'`") — as the
  lock check. No new lock table is introduced; the existing `generation_run` row already carries
  exactly the state needed to detect an active run, so a separate lock table would duplicate
  information the schema already has. This check-then-act is not perfectly race-free under
  concurrent requests without a `SELECT ... FOR UPDATE`/unique-constraint backstop; that
  concurrency-control detail (row lock vs. a partial unique index on `(investigation_id) WHERE
  outcome = 'in-progress'`) is an implementation choice deferred to Forge, not a design gap — a
  partial unique index of that shape is the natural DB-level backstop and is called out here so
  Forge does not have to rediscover it.

```typescript
// Handler sketch — the ENTIRE new wiring, no new orchestration layer beyond the duplicate check:
async function handleGenerationRunPost(investigationId: string, req, res) {
  const inProgress = await pool.query(
    `SELECT id FROM generation_run WHERE investigation_id = $1 AND outcome = 'in-progress'`,
    [investigationId],
  );
  if (inProgress.rows.length > 0) {
    return res.status(409).json({
      error: 'generation-already-in-progress',
      existingGenerationRunId: inProgress.rows[0].id,
    });
  }

  try {
    const result = await generateBriefVersion({
      investigationId,
      runtimeIdentifier: RUNTIME_IDENTIFIER,   // existing constant/config, not newly designed here
    });
    return res.status(200).json({ generationRunId: result.generationRunId, outcome: result.outcome });
  } catch (err) {
    // generateBriefVersion already transitions the Investigation to 'generation-failed' and
    // finalizes its own GenerationRun on failure (existing Slice 9 behavior) — the handler
    // reports the failure, it does not need to do anything further to Investigation state.
    return res.status(500).json({ error: 'generation-failed', message: String(err) });
  }
}
```

This is the entire connection — no new queue, no new retry logic beyond the duplicate-protection
check above. `RUNTIME_IDENTIFIER`'s exact value remains an open item (§15 item 2, unchanged by
this revision — Danny has not supplied a sourced value).

---

## 10. Smallest Component Lifecycle Instrumentation

**Constraint honored:** additive to `generation_run`/`generation_step` (migration 006), does not
restructure Slice 8's append-only design. `generation_step` remains exactly as-is — this proposal
does not touch it.

### 10a. `generation_component_event` — Repaired Design (Revision 2 item 3)

Re-read against `src/db/migrations/006_generation_run_provenance.sql` and
`src/services/provenanceRecorder.ts` in full. Five defects from the prior revision are fixed
below.

**Defect 1 fixed — missing correlation id.** The prior sketch had no way to match a component's
`component-started` event to its own terminal event: `generation_run_id` is shared across every
component in a run, and `component` (the name, e.g. `'demand-analysis'`) is shared across every
execution of that component name — including a hypothetical future run where the same component
executes more than once. Fixed by adding `component_execution_id`:

- **What generates it, and when:** a `UUID` minted via `randomUUID()` at the very start of
  `runStepWithProvenance` (`provenanceRecorder.ts:328`), BEFORE the `'component-started'` event is
  written — i.e. before `withProvenanceCollector(collector, input.fn)` is called. The same
  `component_execution_id` value is then reused for the terminal event, written in whichever of
  the `try`/`catch` branches actually executes (`provenanceRecorder.ts:339-390`). This mirrors the
  existing `randomUUID()`-per-call pattern already used for `generation_step.id` and
  `generation_run.id` in the same file — no new ID-generation mechanism, same library call.

**Defect 2 fixed — no at-most-one-terminal-event enforcement.** Enforced as a DB constraint, not
an application-level promise alone (a promise-only invariant is exactly the kind of unsourced,
unenforced assumption the codebase already rejects elsewhere — e.g. migration 006's `generation_
step_immutable` trigger, enforced at the DB, not just documented):

```sql
CREATE UNIQUE INDEX idx_generation_component_event_one_terminal
  ON generation_component_event (component_execution_id)
  WHERE event_type IN ('component-completed', 'component-failed');
```

A partial unique index on `component_execution_id` filtered to the two terminal event types. A
second terminal-event INSERT for the same `component_execution_id` (a programming-error-level
defect, matching the severity language `finalizeGenerationRun` already uses for its own
exactly-once invariant) fails at the DB with a unique-violation, not silently. The
`component-started` event itself is not covered by this index (multiple non-terminal events per
execution are not expected but the index intentionally targets only the "at most one terminal
event" requirement item 3 asks for, not a broader "exactly one row per event_type" constraint that
was never asked for).

**Defect 3 fixed — `investigation_id` cross-table consistency.** Chosen: **remove
`investigation_id` from the table**, deriving Investigation scope via
`generation_run_id → generation_run.investigation_id` (the FK `generation_run` already carries).
Justification: a same-table `CHECK` constraint structurally cannot reference another table in
Postgres, so keeping a denormalized `investigation_id` column would require either (a) an
application-level invariant enforced only in the one `recordComponentEvent` call site (fragile —
exactly the kind of promise this revision is fixing elsewhere) or (b) a trigger function
(`BEFORE INSERT`, comparing `NEW.investigation_id` against a `SELECT investigation_id FROM
generation_run WHERE id = NEW.generation_run_id`) — both of which exist only to keep a
denormalized copy in sync with data one join away. Since every consumer in this proposal already
joins `generation_component_event` to `generation_run` for other columns (`outcome`,
`runtime_identifier`) anyway (§8's `ActivityFeedEntry[]` backing note, §4a's last-activity query),
the denormalization buys no query-shape savings here and only adds a consistency-enforcement
burden. Removed:

```sql
CREATE TABLE generation_component_event (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_run_id     UUID NOT NULL REFERENCES generation_run(id),
  component_execution_id UUID NOT NULL,   -- Defect 1 fix: correlates one component's started/
                                           -- terminal events; NOT unique alone (started + terminal
                                           -- share this value) — uniqueness is enforced only on
                                           -- the terminal-event subset, see the partial index above
  component             TEXT NOT NULL,     -- same component-name vocabulary as generation_step.component
  event_type             TEXT NOT NULL CHECK (event_type IN ('component-started', 'component-completed', 'component-failed')),
  occurred_at             TIMESTAMPTZ NOT NULL,
  error                   TEXT,
  CONSTRAINT generation_component_event_error_matches_type CHECK (
    (event_type = 'component-failed' AND error IS NOT NULL AND error <> '') OR
    (event_type <> 'component-failed' AND error IS NULL)
  )
);
-- append-only, same trigger pattern as generation_step (reject_update_or_delete)
CREATE INDEX idx_generation_component_event_run ON generation_component_event (generation_run_id, occurred_at);
CREATE INDEX idx_generation_component_event_execution ON generation_component_event (component_execution_id);
CREATE UNIQUE INDEX idx_generation_component_event_one_terminal
  ON generation_component_event (component_execution_id)
  WHERE event_type IN ('component-completed', 'component-failed');
```

Investigation-scoped queries (e.g. §4a's last-activity computation, the Investigation-level
activity feed in §6) now join through `generation_run_id → generation_run.investigation_id`
explicitly — reflected in §4a's SQL above (`LEFT JOIN generation_component_event gce ON
gce.investigation_id = i.id` in the earlier draft is corrected here to join via `generation_run`;
see the corrected §4a query, which already joins `gce` directly to `generation_run` scope through
`gr` — restated precisely: `gce.generation_run_id = gr.id` is the actual join key, not a direct
`investigation_id` column on `gce`).

**Defect 4 fixed — one-directional `error` CHECK.** The prior CHECK only enforced `error IS NULL`
for non-failed events; it did not enforce `error IS NOT NULL` for failed ones, and did not reject
the empty-string case (empty string is not NULL — Postgres CHECK on `IS NULL` alone would let
`error = ''` through as "populated"). Fixed by the two-directional constraint above:
`(event_type = 'component-failed' AND error IS NOT NULL AND error <> '')` OR the inverse. Decision
on the empty-string case: **reject it** — `error = ''` on a `component-failed` event is treated as
equivalent to no error message, which is not an acceptable state for a failure record (matching
`generation_step`'s own implicit expectation that `error` on a failed step carries an actual
message, per `runStepWithProvenance`'s `error: modeled Failure ? result.generationFailureReason :
undefined` / `error: err instanceof Error ? err.message : String(err)` — both always produce a
non-empty string in practice, so rejecting empty-string failures at the DB catches a
never-intended caller bug rather than a legitimate use case).

**Defect 5 fixed — lifecycle-persistence-failure isolation.** `recordComponentEvent`'s own INSERT
can throw (DB connectivity, constraint violation) — a NEW failure mode this table introduces that
did not exist before it, since nothing previously wrote per-component-start records. Specified
behavior: **the lifecycle-event write is isolated in its own `try`/`catch` at each of
`recordComponentEvent`'s two call sites inside `runStepWithProvenance`, and a failure there is
logged and swallowed, never allowed to abort or corrupt the component's actual work or its
`recordGenerationStep` call.** Concretely:

```typescript
async function recordComponentEvent(input: GenerationComponentEvent): Promise<void> {
  // ... INSERT ...
}

// call sites inside runStepWithProvenance — both wrapped so a lifecycle-write failure cannot
// affect the pipeline's real correctness:
async function safeRecordComponentEvent(input: GenerationComponentEvent): Promise<void> {
  try {
    await recordComponentEvent(input);
  } catch (err) {
    // Activity-tracking degrades (this component's live status may not show up in the activity
    // panel), but the generation pipeline itself — recordGenerationStep, the component's actual
    // result, GenerationRun finalization — is completely unaffected. Logged via the existing
    // logging path (not swallowed silently to a black hole), but never rethrown here.
    console.error('generation_component_event write failed (non-fatal, activity tracking only)', err);
  }
}
```

This is the explicit answer item 3's fifth bullet requires: lifecycle-event persistence failure is
**isolated and swallowed** (logged, not silent-black-hole; never propagated), because this table's
entire purpose is an activity-visibility improvement, not a correctness dependency — the
generation pipeline's actual correctness (Slice 4-9 behavior, `GenerationRun`/`GenerationStep`
persistence) must not be made to depend on a table whose only job is showing a live spinner.

### 10b. Interface and Call-Site Wiring (unchanged from prior revision except as noted above)

```typescript
interface GenerationComponentEvent {
  generationRunId: string;
  componentExecutionId: string;   // Defect 1 fix — minted once per runStepWithProvenance call
  component: string;
  eventType: 'component-started' | 'component-completed' | 'component-failed';
  occurredAt: string;
  error?: string;
}
```

Called at the START of `runStepWithProvenance` (`provenanceRecorder.ts:328-390`), before
`input.fn()` runs, with `event_type: 'component-started'` and a freshly minted
`componentExecutionId`; and again immediately after `recordGenerationStep` is called in both the
`try` and `catch` branches, with `'component-completed'` or `'component-failed'`, reusing the SAME
`componentExecutionId` minted at the start of this call — not a new one per event.

This remains intentionally NOT a general event bus — one function, one table, three fixed event
types, wired into exactly the one existing chokepoint (`runStepWithProvenance`) every Slice 4-9
component call already passes through. No swarm concept, no presence, no polling design decided
here (SSE vs. client polling is left to implementation, §15 item 3, since both read the same
table).

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

## 12. Browser-Visible Implementation Checkpoints (Revision 2 item 9)

Merged and reordered so that no checkpoint claiming "generation is visible" ever depends on a
manual generation trigger staged ahead of the browser-triggered wiring. The prior revision's
Checkpoint 3 (manual trigger, live activity) and Checkpoint 4 (automatic wiring, arrives later)
are combined: the FIRST checkpoint that shows live generation already uses
`POST /api/investigations/:id/generation-runs` (§9), not a manually-invoked call staged ahead of
it. Three checkpoints total.

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

**PRODUCT CHECKPOINT 3:** PRODUCT CHANGE: Danny can, from inside the Investigation Workspace,
trigger generation via the real browser-facing `POST /api/investigations/:id/generation-runs`
endpoint (§9) — no server-console call, no test harness — and watch it run live: the activity
panel shows the currently-executing component changing over the run's lifetime (via §10a's
lifecycle events, polled concurrently with the in-flight POST per §9), the Workspace's workflow
stage indicator (§5a) reflects "generating: `<component>` running," and on completion the
Workspace transitions to show the assembled Brief (§8's `BriefForReview`) — or the
`generation-failed` state if the pipeline genuinely fails — without any additional user action or
page reload. This single checkpoint closes what the prior revision split across two checkpoints
(manual trigger with live activity, then later automatic wiring) — the browser-triggered path and
the live activity view arrive together, per Revision 2 item 9's binding requirement.

Demonstration criteria for all three checkpoints are in §13.

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

**Checkpoint 3:** From the Investigation Workspace, with at least one reachable source already
present, click the (real, browser-facing) "Generate Brief" action, which issues
`POST /api/investigations/:id/generation-runs`. Verify, all from the SAME real request:

- A `409` is returned (verified separately, by firing a second `POST` while the first is still
  in-progress) referencing the correct `existingGenerationRunId` — confirming duplicate protection
  actually works, not just that it is designed.
- While the first request is in flight, the activity panel's `currentComponent` value changes
  over the run's lifetime, matching `SELECT component, event_type, occurred_at,
  component_execution_id FROM generation_component_event WHERE generation_run_id = ... ORDER BY
  occurred_at` — each transition backed by a real row, correlated by `component_execution_id`
  (verify no two terminal events ever share one `component_execution_id`, i.e. the partial unique
  index from §10a is never violated).
- The Workspace's workflow-stage indicator (§5a) shows "generating: `<component>` running" while
  in progress.
- On completion, the Workspace shows either the assembled Brief (matching `SELECT * FROM
  brief_version WHERE id = (SELECT current_version_id FROM problem_brief WHERE investigation_id =
  ...)`, resolved through `BriefForReview`, §8) or the `generation-failed` state, with no
  additional user action taken between the POST and the final rendered state.

---

## 14. Exact Existing Slice 10 Requirements — Retained / Moved / Expanded

Verbatim source: `docs/specs/problem-department-mvp/04-ROADMAP.md` lines 867–950, "Slice 10:
Investigation Screen — Completed State (Read-Only)."

**Goal (verbatim):** "A human can read all seven required Brief elements (per
`01-REQUIREMENTS.md`'s canonical list) for one `BriefVersion`, presented from the same durable
Investigation URL (US-13 read half, Flow 3 steps 1–2, Q-7)."

- **RETAINED, unchanged in substance:** The `getInvestigation` → `ProblemBrief.currentVersionId`
  → `getBriefForReview` chain (roadmap's "Files" bullet 1) is retained exactly — this proposal's
  `BriefForReview` (§8, Revision 2 item 4) composes it, it does not replace or redesign it; it is
  the fully-resolved read model version of exactly that chain's output. All seven required Brief
  elements, rendered without collapse-by-default; no system-generated numeric confidence anywhere;
  Personal Pull visually separated from Demand; `CitationScopeNotice`; `SearchScopeNotice`;
  `NegativeFindingNotice` for exactly the four negatable elements (Evidence, Demand Signal Type,
  Existing-Solution, Gap Hypothesis); Problem Definition never rendering `NegativeFindingNotice` —
  every one of these Implementation Notes and Tests entries (lines 882-945) is retained as-is,
  unmodified, as the Brief-rendering requirement for the "Problem Brief panel" in §5's Investigation
  Workspace, now backed field-for-field by `BriefForReview`'s nested shape (§8): `citationScope
  Notice`, `searchScopeNotice`, and the four `*NegativeFinding` fields (including the always-`null`
  `evidenceNegativeFinding`, since Evidence's negative path is structurally unreachable) map
  directly onto these retained rules, and `problemStatements` deliberately carries no negative-
  finding field at all (not even a `null` one) — encoding "Problem Definition never renders
  NegativeFindingNotice" as a type-level absence, not a runtime check that could be bypassed.
- **MOVED:** The presentation location. Slice 10 specified "Investigation Screen — Completed
  State," a dedicated full-page screen reached only when `status === 'brief-generated'`
  (note: the roadmap text itself says `'completed'` in its Tests section, line 915 —
  `Investigation.status === 'completed'` — which does NOT match the actual `InvestigationStatus`
  enum in `domain.ts` (`'brief-generated'`, not `'completed'`); this is a pre-existing
  terminology mismatch in the roadmap text, called out here verbatim rather than silently
  corrected, per this task's instruction not to rewrite Slices 1-9 material). This proposal moves
  that same rendering into a PANEL inside the persistent Investigation Workspace (§5) rather than
  a screen reached by a status-gated route branch — the Workspace shows the Brief panel
  conditionally on a `BriefVersion` existing (per §5a's stage 5, which is now reachable even
  while `status` has since moved on, since `briefForReview` is derived from `ProblemBrief.
  currentVersionId` directly, not from `status` alone) rather than as a separate route.
- **EXPANDED:** Slice 10's original scope assumed the read-only Brief was the entirety of what a
  human sees for a completed Investigation. This proposal adds, alongside it in the same
  Workspace: the live/historical agent-activity panel (§6, backed by §10's new lifecycle table)
  and the provenance/run-log panel (§5, now also summarized inside `BriefForReview.provenance`,
  §8) — neither existed in Slice 10's scope, and neither requires any change to the
  Brief-rendering requirements retained above.
- **NOT retained by this proposal, deliberately unaddressed:** Slice 10 explicitly excludes
  `DecisionForm` (built in Slice 11) — this proposal reserves the Decision panel's LOCATION in
  the Workspace layout (§5) but does not design Decision persistence or the form itself, matching
  Slice 10's own original boundary.

---

## 15. Decisions Requiring Danny's Judgment

Real, unresolved ambiguity — not manufactured precision. Items resolved by Revision 2 have been
removed from this list (see the disposition table below); what remains is genuinely still open:

1. ~~Synchronous vs. asynchronous generation trigger~~ — **RESOLVED**, Revision 2 item 2 (§9).
2. **`RUNTIME_IDENTIFIER` value for the `generateBriefVersion` call site (§9).** Not invented
   here — needs a real, sourced value (or an existing config this proposal didn't locate).
   Unchanged by this revision.
3. **Live-update transport for the activity panel (§6, §10).** Polling `GET
   /api/investigations/:id/activity` on an interval, versus Server-Sent Events, versus WebSocket.
   All three read the same `generation_component_event` table; this is a pure implementation
   choice with cost/complexity tradeoffs Danny may want to weigh (SSE avoids polling overhead but
   is a new transport in this codebase; polling is the smallest addition). §9 specifies that the
   browser polls SOMETHING while the POST is in flight (Revision 2 item 2), but not which
   transport — that remains this item's open question.
4. **Retirement of `src/web/views.ts`'s server-rendered HTML screens (§11).** This proposal keeps
   them running alongside the new API/React shell rather than deleting them, since deleting live
   code is out of this design's scope — but leaving both surfaces live indefinitely is not a
   permanent answer either. Danny's call on timing.
5. **Where `DepartmentSummary`'s installed/planned config lives (§7, §8).** This proposal treats
   it as a static list, since no `Department` table exists at 37d91d4. Is a real `department`
   table (even a tiny static-seed one) worth adding now so this stops being an
   implementation-hardcoded list, or is that premature given only one Department is real?
   PROVISIONAL — no owner assigned, flagged rather than decided.
6. ~~`Evidence` and `Runs` top-level nav items~~ — **RESOLVED**, Revision 2 item 6 (§1, §8a).
7. **Knowledge surface build order.** `/knowledge` and the Investigation-scoped lineage view are
   reserved as routes/read-model shape only (per binding input 9) — no read model, no query, no
   UI is designed for them here beyond the entity path (Investigation → SourceArtifact →
   EvidenceItem → Claim/ClaimVersion → ProblemBrief/BriefVersion → Recommendation → later
   Decision/validity). Should this be the very next design pass after this one is approved, or
   should it wait until Prototype Department or a second Department exists to give it real
   cross-Department content? Unchanged by this revision, per Danny's explicit instruction to
   resolve evidence/runs only, not Knowledge, in this pass.
8. **Concurrency backstop for §9's duplicate-run check.** The check-then-act
   `SELECT ... WHERE outcome = 'in-progress'` followed by a conditional `generateBriefVersion` call
   is not perfectly race-free under truly concurrent requests without an additional DB-level
   backstop (e.g. a partial unique index on `generation_run(investigation_id) WHERE outcome =
   'in-progress'`). Named explicitly in §9 as a Forge-level implementation choice rather than a
   design gap, but flagged here too since it is a genuine judgment call about how much
   defense-in-depth this MVP needs before a second concurrent submission from the same browser
   tab (double-click) becomes a real risk versus a theoretical one.

---

## Revision 2 — PR #7 Disposition

PR #7 returned FAIL with 9 binding revision items. Item 1 (branch retarget) was administrative and
already actioned outside this document. The remaining 8 substantive items are disposed of below;
each links to the section that resolves it.

| # | Item | Resolution | Section |
|---|---|---|---|
| 1 | Branch retarget (administrative) | Already done outside this task — not acted on here | n/a |
| 2 | Sync/async generation choice | Concrete decision: `POST /api/investigations/:id/generation-runs`, server awaits `generateBriefVersion` synchronously, browser polls activity concurrently, 409 duplicate-protection via existing `outcome = 'in-progress'` column | §9 |
| 3 | `generation_component_event` repair | Added `component_execution_id`; partial unique index enforcing at-most-one terminal event; removed denormalized `investigation_id` (derive via join); two-directional `error` CHECK rejecting empty string; lifecycle-write failures isolated/swallowed, non-fatal to the pipeline | §10a, §10b |
| 4 | `BriefForReview` read model | Replaced flat `brief: BriefVersion \| null` with a fully resolved nested `BriefForReview` interface covering every section, claim/evidence relationship, citation, source, negative finding, search limitation, and provenance element | §8 |
| 5 | Workflow-stage derivation | Five-signal precedence-ordered derivation (source resolution, lifecycle events, GenerationSteps, GenerationRun, Brief persistence), concrete pseudocode, replacing the flat status switch | §5a |
| 6 | `/evidence` and `/runs` Core routes | Designed `EvidenceIndexView`/`RunsIndexView`, Department-tagged via a `departmentId` field (literal today, join-ready for a second Department); `/knowledge` left reserved-only per instruction | §8a |
| 7 | Mission Control "Active work" restructure | Three explicit groups (Active / Needs Attention / Recent-Completed), each with its own named backing query and stated precedence | §2a |
| 8 | "Last recorded activity" instead of `updatedAt` | `GREATEST` across real persisted timestamps (`investigation.created_at`, `generation_run` start/complete, `generation_component_event.occurred_at`, `generation_step.completed_at`, `brief_version.created_at`) — no invented column | §4a |
| 9 | Checkpoint merge (no manual-trigger checkpoint ahead of browser wiring) | Checkpoints reduced from 4 to 3; the checkpoint that first shows live generation already uses the browser-triggered `POST .../generation-runs` endpoint | §12, §13 |

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
