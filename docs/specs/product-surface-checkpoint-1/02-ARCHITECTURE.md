# Architecture: Product Surface — Checkpoint 1

**Status**: Draft — pending Frank spec-gate
**Traces to**: `01-REQUIREMENTS.md` (see its User Stories section for the full list — not
restated here per repo-wide no-manually-asserted-counts discipline), `docs/specs/product-surface/DESIGN-PROPOSAL.md` §1/§2/§2a/§3/§4/§4a/§7/§8/§11
(Checkpoint-1 subset only — §5/§6/§8's `ActivityFeedEntry`/`InvestigationWorkspaceView`/§9/§10/
§10a/§10b are explicitly out of scope and not designed here).

Grounded against the real, currently-checked-out repo state (branch
`feature/problem-department-mvp`, commit `37d91d4`): `src/types/domain.ts`, `src/web/server.ts`,
`src/web/views.ts`, `src/services/getInvestigation.ts`, `src/services/submitSources.ts`,
`src/db/migrate.ts`, `src/db/migrations/001`–`008`, `package.json`.

---

## 1. Scope Boundary (binding, re-stated for implementers)

In scope: four new Express JSON routes (three GET, one POST), three new read-model query functions, a React SPA with
three screens (Mission Control, Departments directory, Problem Department overview) — no fourth
SPA route and no client-side placeholder for Screen D (§2/§6: the last-active-Investigation link
instead does a full-page navigation to the existing legacy Express route,
`GET /investigations/:id`, per Danny's correction below) — Vite build tooling, and the
static-serving / dev-proxy integration boundary with the existing Express app.

Out of scope, not designed here even partially: Investigation Workspace (Screen D), any
`/api/investigations/:id/workspace` or `/api/investigations/:id/activity` route,
`generation_component_event` table or any migration, `BriefForReview`, `deriveWorkflowStage`/
`WorkflowStage`, `POST /api/investigations/:id/generation-runs`, live polling of any kind, `/evidence`,
`/runs`, `/knowledge`, `/activity` Core-wide routes. If a later step in this document seems to need
one of these, that is a signal to stop and re-read the boundary, not to design around it.

---

## 2. Components

| Component | Responsibility | Location |
|---|---|---|
| `getMissionControlView` | Assemble `MissionControlView` from `investigation`/`generation_run`/`brief_version`/`evidence_item`/`source_artifact` via the following independent queries (§5.3) | `src/services/getMissionControlView.ts` (new) |
| `getDepartmentsView` | Assemble `DepartmentsView` (`DepartmentSummary[]`) directly from the static `departmentRegistry` — no database query. `DepartmentSummary` carries no counts (US-2 AC1: name/thesis/status only), so no `investigation`-table check is needed to produce this view | `src/services/getDepartmentsView.ts` (new) |
| `getProblemDepartmentOverview` | Assemble `ProblemDepartmentOverview` — full portfolio, counts, last-active id, recent runs | `src/services/getProblemDepartmentOverview.ts` (new) |
| `departmentRegistry` | Static, in-process list of the four `Department` config literals (id, name, thesis, installed flag) — single source for both `getDepartmentsView` and `getMissionControlView`/`getProblemDepartmentOverview` so the four entries are never independently retyped | `src/config/departments.ts` (new) |
| `lastActivitySql` | Shared SQL fragment implementing `DESIGN-PROPOSAL.md` §4a's `GREATEST` computation, restricted to tables that exist this checkpoint (excludes `generation_component_event`, `generation_step`'s `gs` alias stays since `generation_step` DOES exist — see §4 below for the exact restriction) | inlined as a named SQL constant in `src/services/lastActivity.ts` (new), imported by both `getMissionControlView.ts` and `getProblemDepartmentOverview.ts` — one query text, not two divergent copies (US-4 AC3 / Constraint) |
| Express routes: `GET /api/mission-control`, `GET /api/departments`, `GET /api/problem-department`, `POST /api/investigations` (JSON) | Thin HTTP adapters — parse request, call the corresponding service, serialize JSON, map thrown errors to status codes | `src/web/apiRoutes.ts` (new), mounted from `src/web/server.ts` |
| `App` (React root) | Client-side router (exactly three screen routes — `/`, `/departments`, `/departments/problem-department` — no catch-all, §6) and top-level layout shell; mounts `PersistentNav` once at the shell level (sibling to `<Routes>`, not inside any route's element), so it renders on every screen and does not remount on navigation | `src/client/App.tsx` (new) |
| `PersistentNav` | Persistent left-nav rendered once in `App`'s layout shell, outside the `<Routes>` switch, so it survives client-side route changes. Renders exactly two nav links this checkpoint: "Mission Control" (`/`) and "Departments" (`/departments`) — per `DESIGN-PROPOSAL.md` §1's Checkpoint-1-relevant subset, no `/activity` or `/knowledge` link is rendered (those routes are not built this checkpoint, §1 Scope Boundary). Highlights the active link via `react-router-dom`'s `NavLink` (no bespoke active-state logic). Presentational only — no data fetching, no props beyond the current location supplied by the router. | `src/client/components/PersistentNav.tsx` (new) |
| `MissionControlScreen` | Renders `MissionControlView`: Installed Departments strip, four Active-work groups (Active / Ready-Not-Started / Needs Attention / Recent-Completed), `activeActivity` panel (GenerationRun-level only), recent lists, planned-Departments note | `src/client/screens/MissionControlScreen.tsx` (new) |
| `DepartmentsScreen` | Renders `DepartmentsView`: four rows, click target only on `installed` entries | `src/client/screens/DepartmentsScreen.tsx` (new) |
| `ProblemDepartmentScreen` | Renders `ProblemDepartmentOverview`: header, portfolio (status filter/sort), counts, recent runs, Start Investigation, empty state | `src/client/screens/ProblemDepartmentScreen.tsx` (new) |
| `StartInvestigationForm` | Presentational form wrapping `POST /api/investigations`; on success, triggers portfolio refetch | `src/client/components/StartInvestigationForm.tsx` (new) |
| `InvestigationPortfolioTable` | Presentational: renders `InvestigationSummary[]`, client-side status filter/sort only (no server round trip needed — full portfolio is already fetched) | `src/client/components/InvestigationPortfolioTable.tsx` (new) |
| `apiClient` | Thin `fetch` wrappers for the three GET routes + the POST route, typed against the shared response interfaces (§5) | `src/client/api.ts` (new) |

Every component above has exactly one responsibility; no component both fetches and derives
business logic beyond what's stated (derivation — Active/Needs-Attention/Recent-Completed
grouping, last-activity computation — lives entirely in the three `get*View` services, never
duplicated client-side).

---

## 3. Data Schemas

These interfaces are copied **verbatim** from `DESIGN-PROPOSAL.md` §8 for the Checkpoint-1 subset
(`MissionControlView`, `DepartmentSummary`, `InvestigationSummary`, `BriefSummary`,
`EvidenceSummary`, `DepartmentsView`, `ProblemDepartmentOverview`), with one explicit narrowing:
`MissionControlView.activeActivity` is typed as `GenerationRunSummary[]` this checkpoint, not
`ActivityFeedEntry[]` — `ActivityFeedEntry` (§8) carries a `currentComponent` field sourced from
`generation_component_event`, a table that does not exist this checkpoint (Checkpoint 3 scope, per
`01-REQUIREMENTS.md`’s AC "no live-component-level field"). Reusing
`ActivityFeedEntry`'s name while silently never populating `currentComponent` would be a type lying
about a capability that doesn't exist yet; `GenerationRunSummary` is the honest, checkpoint-scoped
type. This is a structural narrowing, not a scope creep — every other field matches §8 exactly.

```typescript
// src/types/readModels.ts (new file — checkpoint-1-scoped read-model types)

import type {
  InvestigationStatus,
  RecommendationDecision,
  EvidenceLabel,
} from './domain.js';

/** Checkpoint-1-scoped replacement for DESIGN-PROPOSAL.md §8's `ActivityFeedEntry` — omits
 *  `currentComponent` (sourced from `generation_component_event`, a Checkpoint-3 table that does
 *  not exist yet) and `completedSteps` (would require joining `generation_step`, deferred — this
 *  checkpoint's AC requires GenerationRun-level data only, not per-step detail). Every field here
 *  traces to a real `generation_run` column. */
export interface GenerationRunSummary {
  generationRunId: string;
  investigationId: string;
  runtimeIdentifier: string;
  outcome: 'in-progress' | 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string | null;
}

export interface DepartmentSummary {
  id: string;               // stable slug, e.g. 'problem-department' — not a DB row
  name: string;
  thesis: string;
  status: 'installed' | 'planned';
}

export interface InvestigationSummary {
  id: string;
  status: InvestigationStatus;
  statusReason?: string;
  createdAt: string;
  lastActivityAt: string;   // §4a GREATEST computation, ISO timestamp, checkpoint-1-restricted set
}

export interface BriefSummary {
  briefVersionId: string;
  investigationId: string;
  versionNumber: number;
  createdAt: string;
  recommendationDecision: RecommendationDecision;
}

export interface EvidenceSummary {
  evidenceItemId: string;
  investigationId: string;
  label: EvidenceLabel;
  excerptOrSummary: string;
}

export type DepartmentsView = DepartmentSummary[];

export interface MissionControlView {
  departments: DepartmentSummary[];
  activeWork: {
    active: InvestigationSummary[];         // has an in-progress GenerationRun — a real run IS
                                             // running right now (Danny's correction, §5.3)
    readyNotStarted: InvestigationSummary[]; // status='open', zero GenerationRun rows at all —
                                             // was previously folded into `active`; split out per
                                             // Danny's correction so "Active" only ever means a
                                             // real run in progress
    needsAttention: InvestigationSummary[];
    recentCompleted: InvestigationSummary[];
  };
  activeActivity: GenerationRunSummary[];   // in-progress GenerationRuns, Core-wide (today: PD only)
  recent: {
    investigations: InvestigationSummary[]; // ordered by lastActivityAt, see §4
    briefs: BriefSummary[];
    evidence: EvidenceSummary[];
  };
}

export interface ProblemDepartmentOverview {
  department: DepartmentSummary;
  investigations: InvestigationSummary[];
  lastActiveInvestigationId: string | null;
  sourceCount: number;
  evidenceCount: number;
  recentRuns: GenerationRunSummary[];
}
```

**PROVISIONAL constants** (per repo-wide no-fabricated-constants discipline): none needed this
checkpoint. `01-REQUIREMENTS.md` establishes this checkpoint has no polling interval,
cache TTL, or page-size limit — every list returned by these three read models is the full,
unpaginated result set (Investigation count is small enough in this MVP's local-dev scope that no
LIMIT is introduced; adding one un-sourced would itself violate the no-fabricated-constants rule).
If Danny wants a page size or "recent N" cap for Mission Control's `recent` section, that number
needs a named owner before it is added — until then, `recent.investigations`/`recent.briefs`/
`recent.evidence` return every row and the UI scrolls.

---

## 4. `lastActivityAt` — Checkpoint-1-Restricted `GREATEST` Query

`DESIGN-PROPOSAL.md` §4a's formula includes `generation_component_event.occurred_at`, a table
that is Checkpoint-3 scope and does not exist in the database this checkpoint targets. Per
`01-REQUIREMENTS.md` AC (US-4), the checkpoint-1 formula is the same `GREATEST` shape with that one
term dropped — everything else (`generation_run.started_at`/`completed_at`,
`generation_step.completed_at`, `brief_version.created_at`, `investigation.created_at`) is real and
present today (migrations 001, 006, 007). This is the ONE shared query text, imported by both
`getMissionControlView.ts` and `getProblemDepartmentOverview.ts` — never re-derived independently
(US-4 AC3, Constraint "one shared query, not two divergent recency definitions").

```typescript
// src/services/lastActivity.ts
export const LAST_ACTIVITY_SUBQUERY = `
  SELECT i.id AS investigation_id,
         GREATEST(
           i.created_at,
           COALESCE(MAX(gr.started_at), i.created_at),
           COALESCE(MAX(gr.completed_at), i.created_at),
           COALESCE(MAX(gs.completed_at), i.created_at),
           COALESCE(MAX(bv.created_at), i.created_at)
         ) AS last_activity_at
    FROM investigation i
    LEFT JOIN generation_run gr ON gr.investigation_id = i.id
    LEFT JOIN generation_step gs ON gs.generation_run_id = gr.id
    LEFT JOIN problem_brief pb ON pb.investigation_id = i.id
    LEFT JOIN brief_version bv ON bv.problem_brief_id = pb.id
   GROUP BY i.id, i.created_at
`;
```

Every service that needs `lastActivityAt` per Investigation joins its own `investigation` query
against `(${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id` and orders/limits on
`la.last_activity_at`. The edge case "no `GenerationRun`/`GenerationStep`/`BriefVersion` rows exist"
falls out structurally: every `COALESCE` degrades to `i.created_at`, and `GREATEST` of five equal
values is that value (Edge Cases table, row 3).

---

## 5. API Contracts

### 5.1 Express routes (`src/web/apiRoutes.ts`, mounted in `src/web/server.ts`)

```typescript
// GET /api/mission-control
// 200 -> MissionControlView (§3). Never 500 on empty data — every array degrades to [], every
// count to 0 (Edge Cases table, row 6).
router.get('/api/mission-control', async (req: Request, res: Response): Promise<void> => {
  const view = await getMissionControlView();
  res.status(200).json(view);
});

// GET /api/departments
// 200 -> DepartmentsView (§3).
router.get('/api/departments', async (req: Request, res: Response): Promise<void> => {
  const view = await getDepartmentsView();
  res.status(200).json(view);
});

// GET /api/problem-department
// 200 -> ProblemDepartmentOverview (§3). Zero-Investigation case: investigations: [],
// lastActiveInvestigationId: null, sourceCount: 0, evidenceCount: 0, recentRuns: [] — the React
// screen renders the explicit empty state client-side (US-3 edge case), the API itself never
// special-cases "empty" into a different shape.
router.get('/api/problem-department', async (req: Request, res: Response): Promise<void> => {
  const view = await getProblemDepartmentOverview();
  res.status(200).json(view);
});

// POST /api/investigations — JSON-equivalent wrapper around the EXISTING submitSources +
// resolveInvestigationSources + transitionInvestigationStatus sequence already implemented at
// src/web/server.ts:32-106 for the HTML form path. This handler duplicates that sequence's calls
// (not its logic — it calls the same three service functions, unchanged signatures) with a JSON
// request/response instead of a redirect. US-5 AC1: "no change to submitSources's signature or
// logic" — satisfied because this route calls the identical exported functions.
interface CreateInvestigationRequestBody {
  artifacts: Array<{ type: string; raw: string }>;
  investigationId?: string; // omit to start a new Investigation, matching submitSources
}
interface CreateInvestigationResponseBody {
  investigationId: string;
  status: InvestigationStatus; // post-resolution status, 'open' | 'blocked'
}
router.post('/api/investigations', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as CreateInvestigationRequestBody;
  if (!Array.isArray(body.artifacts) || body.artifacts.length === 0) {
    res.status(400).json({ error: 'at-least-one-artifact-required' });
    return;
  }
  try {
    const submission = await submitSources({
      investigationId: body.investigationId,
      origin: 'human',
      artifacts: body.artifacts.map((a) => ({ type: a.type, raw: a.raw.trim() })),
    });
    const { allUnreachable } = await resolveInvestigationSources(submission.investigationId);
    const status = allUnreachable ? 'blocked' : 'open';
    await transitionInvestigationStatus(
      submission.investigationId,
      status,
      allUnreachable ? 'No submitted source was reachable.' : null,
    );
    res.status(201).json({ investigationId: submission.investigationId, status });
  } catch (err) {
    res.status(500).json({ error: 'submission-failed', message: (err as Error).message });
  }
});
```

`express.json()` middleware is added to `src/web/server.ts` alongside the existing
`express.urlencoded` (both are needed — the legacy HTML form still posts urlencoded; the new SPA
posts JSON). This is the only change to `server.ts`'s existing middleware stack; no auth/CORS
change (Constraint, Interview #4).

### 5.2 Service function signatures

```typescript
// src/services/getMissionControlView.ts
export async function getMissionControlView(): Promise<MissionControlView>;

// src/services/getDepartmentsView.ts
export async function getDepartmentsView(): Promise<DepartmentsView>;

// src/services/getProblemDepartmentOverview.ts
export async function getProblemDepartmentOverview(): Promise<ProblemDepartmentOverview>;
```

No parameters on any of the three — Checkpoint 1 has exactly one installed Department and no
per-Department parameterization is needed yet (`getProblemDepartmentOverview` is hard-scoped to
Problem Department internally, matching this checkpoint’s "exactly one Department has a working
service layer" assumption). Adding a `departmentId` parameter ahead of a second Department existing
would be speculative generality with no current caller — not introduced here.

### 5.3 Backing SQL — exact shape per read model

**`getDepartmentsView`** — no query at all. It returns `departmentRegistry`'s static list
(`DEPARTMENTS`, below) as-is, mapped 1:1 into `DepartmentSummary[]`. Only Problem Department's
`status` is `installed`; the other three are always `planned` literals (§7 "Department tile
installed/planned status ... NOT a persisted domain fact"). `DepartmentSummary` carries no counts
(US-2 AC1: name/thesis/status only), so there is nothing here for a database check to compute —
the `getDepartmentsView` row in §2 previously implied an `investigation`-level existence/count
check; that implication is removed as unnecessary (no AC requires it).

`departmentRegistry`:

```typescript
// src/config/departments.ts
import type { DepartmentSummary } from '../types/readModels.js';

export const DEPARTMENTS: ReadonlyArray<DepartmentSummary> = [
  { id: 'problem-department', name: 'Problem Department',
    thesis: 'What do people genuinely need, and where is the unresolved demand?',
    status: 'installed' },
  { id: 'signal-foundry', name: 'Signal Foundry',
    thesis: 'What is emerging that deserves attention?',
    status: 'planned' },
  { id: 'prototype-department', name: 'Prototype Department',
    thesis: 'What is the smallest credible thing we can build to test this opportunity?',
    status: 'planned' },
  { id: 'creative-practice-engine', name: 'Creative Practice Engine',
    thesis: 'How does this collection of projects become a coherent creative practice?',
    status: 'planned' },
] as const;
```

All four thesis strings above are quoted verbatim from `docs/product-architecture-and-direction.md`
§3 (Problem Department's is additionally cross-checked against `DESIGN-PROPOSAL.md` §3's quoted
text, which matches). No further copy step is needed at implementation time — this was previously
left as a placeholder (empty strings with a "copy at implementation" comment); that placeholder is
resolved here rather than deferred, since an empty thesis string would silently fail US-2 AC1 at
runtime while still type-checking and passing any mocked test.

**`getMissionControlView`** — the following independent queries (queries 2/3/4/5 are each an
independent DB-level filter over `activeWork`'s four groups; no post-hoc dedup or client-side
bucketing across groups is used — see the mutual-exclusivity proof below the query list):

```sql
-- 1. departments — from departmentRegistry, no query.

-- 2. activeWork.active — InvestigationSummary[]. Danny's correction, overruling a prior fix round
-- that had widened this query to also include a brand-new status='open' Investigation with ZERO
-- GenerationRun rows ("recreates the exact confusion US-6 was intended to eliminate" — a real
-- GenerationRun must be in progress for an Investigation to count as Active). That widened case is
-- now its own group, query 3 below (readyNotStarted), not folded into Active.
SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
  FROM investigation i
  JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
 WHERE EXISTS (
     SELECT 1 FROM generation_run gr
      WHERE gr.investigation_id = i.id AND gr.outcome = 'in-progress'
   )
 ORDER BY la.last_activity_at DESC, i.id ASC;

-- 3. activeWork.readyNotStarted — InvestigationSummary[]. NEW group (Danny's correction): a
-- status='open' Investigation with zero GenerationRun rows at all — genuinely never started, not
-- "active" in the sense of a run actually running, and not stalled/blocked either. This is exactly
-- the case the prior fix round had (incorrectly) folded into query 2's Active group above.
SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
  FROM investigation i
  JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
 WHERE i.status = 'open'
   AND NOT EXISTS (SELECT 1 FROM generation_run gr WHERE gr.investigation_id = i.id)
 ORDER BY la.last_activity_at DESC, i.id ASC;

-- 4. activeWork.needsAttention — InvestigationSummary[]. Unchanged by this correction.
SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
  FROM investigation i
  JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
 WHERE i.status IN ('blocked', 'generation-failed')
   AND NOT EXISTS (
     SELECT 1 FROM generation_run gr
      WHERE gr.investigation_id = i.id AND gr.outcome = 'in-progress'
   )
 ORDER BY la.last_activity_at DESC, i.id ASC;

-- 5. activeWork.recentCompleted — InvestigationSummary[], deduplicated to one row per investigation.
-- Unchanged by this correction (query logic identical to the prior round's query 4).
--
-- DECLARED DEVIATION from DESIGN-PROPOSAL.md §2a: §2a's Recent/Completed row specifies ordering
-- by `GREATEST(generation_run.completed_at, investigation.created_at)` computed inline for this
-- query alone. This document instead orders by `la.last_activity_at` — the shared
-- `LAST_ACTIVITY_SUBQUERY` this document's own §4 already establishes as the single source of
-- truth for "how recently did this investigation do something" (used identically by queries
-- 2, 3, 4, 7, and getProblemDepartmentOverview's `investigations`/`lastActiveInvestigationId`).
-- Recomputing a narrower two-term GREATEST inline here, alongside the five-term GREATEST already
-- shared everywhere else, would give this one query a different recency definition than the rest
-- of the document for no behavioral gain (`la.last_activity_at` is >= the §2a formula's value in
-- every case, since it's a superset of the same terms) — that inconsistency, not consistency, is
-- the actual risk. Kept as `la.last_activity_at`; flagged here as a declared, not silent, deviation (named open
-- question, not a silent rewrite).
SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
  FROM investigation i
  JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
 WHERE NOT EXISTS (
     SELECT 1 FROM generation_run gr
      WHERE gr.investigation_id = i.id AND gr.outcome = 'in-progress'
   )
   AND (
     i.status = 'brief-generated'
     OR EXISTS (
       SELECT 1 FROM generation_run gr2
        WHERE gr2.investigation_id = i.id AND gr2.outcome <> 'in-progress'
     )
   )
 ORDER BY la.last_activity_at DESC, i.id ASC;

-- 6. activeActivity — GenerationRunSummary[], Core-wide (today: Problem Department only)
SELECT id, investigation_id, runtime_identifier, outcome, started_at, completed_at
  FROM generation_run
 WHERE outcome = 'in-progress'
 ORDER BY started_at DESC, id ASC;

-- 7. recent.investigations — InvestigationSummary[], ordered by shared last_activity_at
SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
  FROM investigation i
  JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
 ORDER BY la.last_activity_at DESC, i.id ASC;

-- 8. recent.briefs — BriefSummary[]
SELECT bv.id, pb.investigation_id, bv.version_number, bv.created_at, bv.recommendation
  FROM brief_version bv
  JOIN problem_brief pb ON pb.id = bv.problem_brief_id
 ORDER BY bv.created_at DESC, bv.id ASC;
-- bv.recommendation is JSONB {decision, rationale} (migration 007) — recommendationDecision reads
-- recommendation->>'decision', cast to RecommendationDecision.

-- 9. recent.evidence — EvidenceSummary[]
SELECT e.id, sa.investigation_id, e.label, e.excerpt_or_summary
  FROM evidence_item e
  JOIN source_artifact sa ON sa.id = e.source_artifact_id
 ORDER BY e.created_at DESC NULLS LAST, e.id ASC;
```

**Mutual-exclusivity proof — four `activeWork` groups.** Let `P` = "this Investigation has at
least one `generation_run` row with `outcome = 'in-progress'`" and `R` = "this Investigation has at
least one `generation_run` row at all" (note `P` implies `R`). Every Investigation's `status` is
exactly one of the four `InvestigationStatus` values: `open`, `blocked`, `generation-failed`,
`brief-generated` (`src/types/domain.ts`).

- **Active (query 2)** := `P`.
- **Ready/Not Started (query 3)** := `status = 'open' AND NOT R`.
- **Needs Attention (query 4)** := `status IN ('blocked', 'generation-failed') AND NOT P`.
- **Recent/Completed (query 5)** := `NOT P AND (status = 'brief-generated' OR (R AND NOT P))` —
  i.e. `NOT P AND (status = 'brief-generated' OR R)`, since the inner clause's `NOT P` is already
  implied by the outer `NOT P`.

Case split on `P`:
- **`P` = true**: matches Active only. It cannot match Ready/Not Started (`R` is implied true by
  `P`, so `NOT R` is false), Needs Attention (`NOT P` is false), or Recent/Completed (`NOT P` is
  false). Disjoint from the other three by construction.
- **`P` = false**: Active does not match (requires `P`). The remaining three groups partition on
  `status` and `R`:
  - Ready/Not Started requires `status = 'open' AND NOT R`.
  - Needs Attention requires `status IN ('blocked', 'generation-failed')`.
  - Recent/Completed requires `status = 'brief-generated' OR R`.
  - `status = 'open'` is disjoint from `status IN ('blocked', 'generation-failed')` and from
    `status = 'brief-generated'` (the four enum values are mutually exclusive) — so an `open`,
    `P`-false Investigation can only match Ready/Not Started (if `NOT R`) or Recent/Completed
    (if `R`, since `R` alone satisfies Recent/Completed's `OR` when `status ≠ 'brief-generated'`),
    and `NOT R`/`R` are themselves mutually exclusive, so never both.
  - A `blocked`/`generation-failed` Investigation can only match Needs Attention among the
    status-gated groups above; it also satisfies Recent/Completed's clause whenever `R` is true
    (i.e. a `generation-failed` Investigation with a completed/failed run row already exists — a
    `blocked` Investigation, by definition "zero reachable sources — no Brief can be generated",
    never reaches a state where a `generation_run` row could exist, so `R` is false for every
    `blocked` row and no overlap arises there). **`generation-failed AND R` overlapping Needs
    Attention and Recent/Completed is a pre-existing condition of the unmodified query 4/5 pair,
    not introduced or resolved by this correction** — flagged here as an inherited open item
    (Needs Attention and Recent/Completed were explicitly out of scope for this correction, per
    Danny's ruling) rather than silently asserted as proven; a future correction should confirm
    whether `generation-failed` investigations can, in practice, ever have a non-in-progress
    `generation_run` row, and resolve the overlap if so.
  - A `brief-generated` Investigation can only match Recent/Completed among the status-gated
    groups (its status excludes Ready/Not Started and Needs Attention outright).

Every Investigation therefore falls into exactly one of the four groups, with the single named
exception above (inherited from the unmodified Needs-Attention/Recent-Completed pair, not created
by this correction) flagged for separate follow-up rather than silently claimed as resolved.


Queries 2/3/4/5 are run independently against the database (four separate round trips or four CTEs
in one statement — implementer's choice; the AC's binding requirement is independence of the
*query logic*, i.e. no single combined result set filtered client-side into three buckets, per
US-6 AC4), not independence of transport.

**`getProblemDepartmentOverview`**:

```sql
-- investigations — every row, all statuses, row-for-row matching the Demonstration criteria's
-- `SELECT id, status, created_at FROM investigation` (01-REQUIREMENTS.md AC)
SELECT i.id, i.status, i.status_reason, i.created_at, la.last_activity_at
  FROM investigation i
  JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
 ORDER BY i.created_at ASC, i.id ASC;
-- (default order ASC by created_at for the portfolio table itself — distinct from the
-- last-active-investigation pick below, which uses last_activity_at DESC LIMIT 1; the portfolio's
-- own default ordering is not specified by any AC beyond "every row," so creation order is chosen
-- as the least surprising default, filterable/sortable by status client-side per US-3 AC3.)

-- lastActiveInvestigationId
SELECT i.id
  FROM investigation i
  JOIN (${LAST_ACTIVITY_SUBQUERY}) la ON la.investigation_id = i.id
 ORDER BY la.last_activity_at DESC, i.id ASC
 LIMIT 1;
-- NULL (no rows) when zero Investigations exist — ProblemDepartmentOverview.lastActiveInvestigationId: null.

-- sourceCount
SELECT COUNT(*)::int AS count FROM source_artifact;
-- Scoped "to this Department's Investigations" (US-3 AC) — today every investigation row belongs
-- to Problem Department (this checkpoint’s only installed Department), so an unscoped COUNT(*) is currently equivalent
-- to a department-scoped one. No department_id column exists on investigation to scope by (§7).

-- evidenceCount
SELECT COUNT(*)::int AS count FROM evidence_item;
-- Same single-Department-today equivalence as sourceCount.

-- recentRuns — GenerationRunSummary[]
SELECT id, investigation_id, runtime_identifier, outcome, started_at, completed_at
  FROM generation_run
 ORDER BY started_at DESC, id ASC;
```

`department` field of `ProblemDepartmentOverview` is `DEPARTMENTS.find(d => d.id ===
'problem-department')` — no query, reuses `departmentRegistry`.

---

## 6. React SPA — Route Structure and Component Boundaries

The three screen routes below match `DESIGN-PROPOSAL.md` §1's Checkpoint-1 subset exactly — no
fourth route and no client-side placeholder for the out-of-scope Screen D. Per Danny's correction,
any link that would previously have pointed at a Screen-D placeholder (e.g. the "last-active
Investigation" link on `ProblemDepartmentScreen`, §UI Spec Screen C) instead does a real, full-page
navigation — a plain `<a href="/investigations/{id}">`, not a React Router `<Link>` — to the
EXISTING legacy Express route `GET /investigations/:id` (`src/web/server.ts:115-158`), labeled as
the current view. That leaves the SPA entirely and hits the already-working server-rendered screen
(`src/web/views.ts`'s `renderInvestigationGeneratingScreen`/`renderInvestigationBlockedScreen`/
`renderInvestigationGenerationFailedScreen`, or the `brief-generated` 501 stub) rather than a
purpose-built placeholder announcing its own future replacement:

| Route | Component | Data source |
|---|---|---|
| `/` | `MissionControlScreen` | `GET /api/mission-control` on mount, one fetch, no polling (no live-update requirement this checkpoint) |
| `/departments` | `DepartmentsScreen` | `GET /api/departments` on mount |
| `/departments/problem-department` | `ProblemDepartmentScreen` | `GET /api/problem-department` on mount; re-fetches after a successful `StartInvestigationForm` submission (US-5 AC2 — "next load/refresh") |
No route exists for `/departments/:otherDepartmentSlug` — `DepartmentsScreen` renders no click
target for `planned` Departments (US-2 AC2), so no navigation path ever reaches an undefined route;
this matches the Edge Cases table's explicit "no route is defined for one" resolution.

No client-side route exists for `/departments/problem-department/investigations/*` either — there
is no React-side destination for that URL shape. The "last-active Investigation" link is a plain
anchor tag, not a `Route`/`Link`, so it is not part of the router's route table at all (§App's
router description above lists exactly three `<Route>` elements, no catch-all).

Client-side data fetching uses plain `fetch` via `apiClient` (`src/client/api.ts`) and React's
built-in `useEffect`/`useState` — no state-management library is added (none exists in the repo
today; introducing one for three single-fetch screens with no cross-screen shared state would be
an unjustified dependency, see §8).

```typescript
// src/client/api.ts
export async function fetchMissionControl(): Promise<MissionControlView>;
export async function fetchDepartments(): Promise<DepartmentsView>;
export async function fetchProblemDepartmentOverview(): Promise<ProblemDepartmentOverview>;
export async function createInvestigation(
  body: CreateInvestigationRequestBody,
): Promise<CreateInvestigationResponseBody>;
```

```typescript
// src/client/screens/ProblemDepartmentScreen.tsx — component props/state shape
interface ProblemDepartmentScreenState {
  overview: ProblemDepartmentOverview | null; // null while loading
  error: string | null;
  statusFilter: InvestigationStatus | 'all';  // client-side only, US-3 AC3
}

// src/client/components/InvestigationPortfolioTable.tsx
interface InvestigationPortfolioTableProps {
  investigations: InvestigationSummary[];
  statusFilter: InvestigationStatus | 'all';
  onStatusFilterChange: (next: InvestigationStatus | 'all') => void;
}

// src/client/components/StartInvestigationForm.tsx
interface StartInvestigationFormProps {
  onSubmitted: (investigationId: string) => void; // triggers parent's re-fetch (US-5 AC2)
}
```

`MissionControlScreen` renders `activeWork.active`/`readyNotStarted`/`needsAttention`/`recentCompleted`
as four visually distinct, independently-labeled lists (US-6 AC1-3, plus the new Ready/Not-Started
group per Danny's correction) — never merged into one list with a computed tag, since the
requirement is that the groups are "never confused," which a shared render path with a badge would
risk; four sibling sections is the more literal satisfaction of the AC.

Empty-state rendering (`ProblemDepartmentScreen`, zero Investigations): a dedicated
`InvestigationPortfolioEmptyState` presentational component rendering the exact copy
"No investigations yet — Start Investigation" plus the `StartInvestigationForm` entry point —
not a shared "empty list" generic component, since the exact copy is an AC (US-3 edge case),
not a generic placeholder.

---

## 7. Dev/Build Tooling and Integration Boundary (DESIGN-PROPOSAL.md §11)

- **Build tool**: Vite (design decision, this checkpoint — the design doc's own named example,
  no counter-indication in the repo).
- **Source location**: `src/client/`, sibling to `src/services/`, `src/web/`, `src/db/`
  (design decision, this checkpoint). Contains `App.tsx`, `main.tsx` (entry), `screens/`, `components/`, `api.ts`,
  and its own `vite.config.ts` at the client root (`src/client/vite.config.ts`) — kept local to the
  client subtree rather than a project-root `vite.config.ts`, so the client build's config is
  discoverable alongside the code it configures, matching the existing pattern of `src/db/`,
  `src/services/` each owning their own concerns without a shared root config file.
- **Build output** (Danny's correction — `root` must be explicit): Vite's default `root` is
  `process.cwd()`, the directory the `vite`/`vite build` process is invoked from — NOT the
  directory the config file itself lives in. Because `src/client/vite.config.ts` is run via
  `--config src/client/vite.config.ts` from the repo root (`dev:client`/`build` scripts, below),
  an implicit/default `root` would resolve to the repo root, not `src/client/`, and
  `outDir: '../web/public'` would then resolve relative to the WRONG base — one level above the
  repo root, not one level above `src/client/`. The fix: `root` is set explicitly, computed the
  same way `src/db/migrate.ts` computes `MIGRATIONS_DIR` — `path.dirname(fileURLToPath(import.meta.url))`
  — so it resolves to the config file's own directory (`src/client/`) regardless of invocation cwd.
  Once `root` is explicit, `outDir: '../web/public'` correctly resolves to `src/web/public/`, the
  EXISTING `express.static` mount point (`src/web/server.ts:22`, unchanged). This directory remains
  build OUTPUT ONLY — no hand-authored file is ever added there (explicit distinction from
  `src/client/` as SOURCE).

  ```typescript
  // src/client/vite.config.ts — full sketch, copy verbatim for implementation
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';

  // Mirrors src/db/migrate.ts's MIGRATIONS_DIR pattern — resolves to this config file's own
  // directory regardless of the cwd the `vite`/`vite build` process is invoked from.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  export default defineConfig({
    root: __dirname, // explicit: Vite's default root is process.cwd(), not this file's directory —
                      // without this, outDir below resolves relative to the wrong base (Danny's
                      // correction).
    plugins: [react()],
    build: {
      outDir: path.resolve(__dirname, '../web/public'), // now correct, because root above is
                                                          // no longer implicit
      emptyOutDir: true,
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000', // existing Express PORT default, server.ts:167
          changeOrigin: true,
        },
      },
    },
  });
  ```
- **Production integration**: unchanged Express app serves `src/web/public/`'s built
  `index.html`/JS/CSS bundle via the existing `express.static` middleware — already mounted, no new
  middleware needed for static serving. A catch-all route (`app.get('*', ...)`) serves `index.html`
  for any of the client-side routes (the three screen routes, §6) on a hard
  page load/refresh, enabling client-side routing to
  resolve `/departments/problem-department` directly. Its guard condition, explicit and binding:
  registered LAST, strictly AFTER the existing `/investigations/*` routes, `express.static`, and
  the new `/api/*` router (§10) — Express matches routes in registration order, so any request
  matching an earlier route (including every real `/api/*` path) is handled there and never reaches
  the catch-all. `app.get('*', ...)` alone would still match an unrecognized `/api/*` path (a typo'd
  or removed API route) and silently return a 200 HTML page instead of a 404 — to prevent that, the
  catch-all handler first checks `req.path.startsWith('/api/')` and, if true, responds
  `res.status(404).json({ error: 'not-found' })` instead of serving `index.html`. Every other GET
  request (any path not starting with `/api/`, with no `Accept: application/json` requirement —
  the SPA's client-side routes are plain page loads/refreshes) falls through to `index.html`.
- **Dev integration**: `npm run dev` continues to run the existing Express server
  (`tsx watch src/web/server.ts`) unchanged. A new `npm run dev:client` script runs
  `vite --config src/client/vite.config.ts` as a second process. The `--config` flag only tells
  Vite WHERE the config file is — it does NOT imply `root`; that is why `root` must be (and now is,
  above) set explicitly inside `vite.config.ts` itself, not left to be inferred from the config
  file's location or the invoking shell's cwd. With `root` explicit, the dev server correctly
  serves `src/client/` regardless of whether `dev:client` is run from the repo root or elsewhere.
  Vite's dev server proxies `/api/*` requests to the Express server's port (`server.proxy` in
  `vite.config.ts`, targeting `http://localhost:3000` — the existing `PORT` default in
  `server.ts:167`). The `build` script similarly runs `vite build --config src/client/vite.config.ts`
  from the repo root — same reasoning, `root` inside the config (not the invocation cwd) is what
  makes `outDir` resolve correctly. This is the standard Vite-behind-Express dev pattern named in
  `DESIGN-PROPOSAL.md` §11; both processes run side-by-side in development, only the built bundle
  ships in production. No new `PORT`-style env var is introduced (Constraint "Deferred:
  RUNTIME_IDENTIFIER-style config... this checkpoint introduces no new runtime/env config") —
  Vite's own default dev port (5173) is its own tool default, not a Department OS config
  convention, so it needs no owner/citation here.
- **`src/web/views.ts`'s legacy screens**: untouched, continue being served by the existing
  `/investigations/*` routes, unaffected by the new `/api/*` routes or the catch-all (which only
  matches routes not already handled — Express matches routes in registration order, and the
  legacy routes are registered first in `server.ts`, so no conflict).

---

## 8. Patterns

| Pattern | Usage | Rationale |
|---|---|---|
| Read model = one query function returning one typed interface, no ORM | All three `get*View` services | Matches existing `getInvestigation.ts`'s direct-`pg`-query pattern exactly — no new data-access abstraction introduced for 3 more read paths |
| Shared SQL fragment via exported string constant, not a view/materialized view | `LAST_ACTIVITY_SUBQUERY` | No new database object — Constraint "no new database table, migration, or schema change," and a plain parameterizable SQL fragment is joinable inline without a migration |
| Static config array for `Department`, not a table | `departmentRegistry` | `DESIGN-PROPOSAL.md` §7/§15: Department's persisted-vs-static home is an explicitly deferred open question; a static array satisfies this checkpoint without preempting that later decision |
| Plain `fetch` + `useEffect`/`useState`, no state-management library | All 3 screens | Each screen does exactly one fetch on mount with no cross-screen shared state; a store (Redux/Zustand/etc.) would be unjustified generality for 3 read-only page loads |
| Client-side filter/sort over a fully-fetched list, no server round trip per filter change | `InvestigationPortfolioTable` | Portfolio is already fetched whole (no pagination this checkpoint, §3); filtering server-side would add a round trip with no data-volume justification at this checkpoint's scale |

### Anti-Patterns (Do Not Use)

- Polling/interval-based refetch anywhere this checkpoint: no live-update AC exists (Constraint —
  "Mission Control/Departments/Problem-Department-overview are plain page-load reads, not
  live-updating views; live activity is explicitly Checkpoint 3 scope"). Do not add
  `setInterval`/`setTimeout` refetch loops "for later convenience."
  `StartInvestigationForm`'s post-submit refetch is a one-shot, explicitly triggered by the
  submission event, not a timer.
- Reusing `ActivityFeedEntry` (§8, full design) as this checkpoint's activity-panel type: it
  structurally implies `currentComponent`/`completedSteps` fields this checkpoint cannot populate
  honestly. Use `GenerationRunSummary` (§3 of this document) instead.
- Building `deriveWorkflowStage`/`WorkflowStage` or any Screen-D-shaped type "since it's designed
  already" — not this checkpoint's scope; do not import or reference it.

---

## 9. Dependencies

| Dependency | Version | Purpose |
|---|---|---|
| `react` | ^18.3.1 | SPA UI library — not currently in `package.json` |
| `react-dom` | ^18.3.1 | React DOM renderer |
| `react-router-dom` | ^6.26.0 | Client-side route matching for the three screen routes (§6) |
| `vite` | ^5.4.0 | Dev server + production bundler, per this checkpoint’s design decision |
| `@vitejs/plugin-react` | ^4.3.0 | JSX/Fast-Refresh support for Vite |
| `@types/react` | ^18.3.0 | TypeScript types |
| `@types/react-dom` | ^18.3.0 | TypeScript types |
| `@testing-library/react` | ^16.0.0 | Render/basic-interaction tests for React components (this checkpoint’s design decision — no e2e framework) |
| `@testing-library/jest-dom` | ^6.4.0 | DOM assertion matchers for the above, works with Vitest's existing `jsdom` devDependency already in `package.json` |

All version numbers above are the current stable major/minor release lines as of this checkpoint's
design (2026-08-19) — cited as ordinary dependency-selection judgment (standard current releases of
widely-used libraries), not as a data/research-path constant requiring the stricter sourcing
discipline that applies to thresholds/caps/business logic. `jsdom` is already a devDependency
(`package.json`), reused as-is for React Testing Library's DOM environment — no new test-runner
dependency needed since `vitest` already supports a `jsdom` environment per-file.

`express` (already a dependency, `^4.19.2`) needs no version bump — `express.json()` is built in.

---

## 10. Integration Points

- **`src/web/server.ts`**: gains `app.use(express.json())`, mounts `src/web/apiRoutes.ts`'s router
  under no prefix (routes are already fully qualified, e.g. `/api/mission-control`), and gains the
  production-only static catch-all for client-side routes (§7). Existing routes/middleware
  (`express.static`, `express.urlencoded`, `/investigations/*`) are registered first and unchanged.
- **`src/services/submitSources.ts`, `resolveInvestigationSources.ts`,
  `transitionInvestigationStatus.ts`**: called by the new `POST /api/investigations` handler with
  identical signatures to their existing call sites in `server.ts:64-91` — zero changes to these
  files (US-5 AC1, Constraint "no change to any Slices 1-9 service").
- **`src/db/pool.ts`**: the three new `get*View` services import and query the existing `pool`
  export, same as `getInvestigation.ts` does — no new connection/pool setup.
- **`src/db/migrate.ts` / `src/db/migrations/`**: NOT touched. No new migration file is added this
  checkpoint (Constraint — additive read-only queries over existing tables only). If a future
  checkpoint needs an index to make `LAST_ACTIVITY_SUBQUERY` performant at scale, that is
  Checkpoint 2/3+ scope, not this one — no index is speculatively added here either, since no
  performance AC exists this checkpoint and an unjustified index is itself an unrequested schema
  change.
- **`src/types/domain.ts`**: read-only import source for `InvestigationStatus`,
  `RecommendationDecision`, `EvidenceLabel` in the new `src/types/readModels.ts` — not modified.
- **`src/web/views.ts`**: no import relationship in either direction; continues serving the legacy
  HTML screens, unaffected (Out of Scope — "retirement... not touched").

---

## 11. Requirements Coverage Check

| Requirement | Architecture element |
|---|---|
| US-1 (Mission Control) — see 01-REQUIREMENTS.md's US-1 Acceptance Criteria for the full list | `getMissionControlView`, `MissionControlView`/`GenerationRunSummary` (§3), `MissionControlScreen` (§6), `DEPARTMENTS` registry (§5.3) |
| US-2 (Departments directory) — see 01-REQUIREMENTS.md's US-2 Acceptance Criteria for the full list | `getDepartmentsView`, `DepartmentsView`, `DepartmentsScreen`, click-target-omission pattern (§6) |
| US-3 (Problem Department overview) — see 01-REQUIREMENTS.md's US-3 Acceptance Criteria for the full list | `getProblemDepartmentOverview`, `ProblemDepartmentOverview`, `ProblemDepartmentScreen`, `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState`, source/evidence COUNT queries (§5.3) |
| US-4 (last recorded activity) — see 01-REQUIREMENTS.md's US-4 Acceptance Criteria for the full list | `LAST_ACTIVITY_SUBQUERY` (§4), shared import across both services (§2) |
| US-5 (Start Investigation) — see 01-REQUIREMENTS.md's US-5 Acceptance Criteria for the full list | `POST /api/investigations` (§5.1), `StartInvestigationForm`, post-submit refetch (§6) |
| US-6 (active-work grouping) — see 01-REQUIREMENTS.md's US-6 Acceptance Criteria for the full list | Queries 2/3/4/5 in `getMissionControlView` (§5.3), four independent result sets, `MissionControlView.activeWork` shape (§3) |
| US-7 (persistent cross-screen navigation) — see 01-REQUIREMENTS.md's US-7 Acceptance Criteria for the full list | `PersistentNav` component (§2) |

Every Edge Case in `01-REQUIREMENTS.md` is addressed: zero-Investigation empty state (§6),
no-click-target for planned Departments (§6), `GREATEST`-degrades-to-`created_at` (§4), unset
`statusReason` (optional field, `?` on `InvestigationSummary.statusReason`, never a placeholder),
deterministic tie-break (every `ORDER BY` in §5.3 that sorts on a non-unique column — recency
timestamp or `created_at` — now carries an explicit secondary key on that table's primary key
column, e.g. `ORDER BY la.last_activity_at DESC, i.id ASC`; Postgres provides no ordering guarantee
for ties on the primary sort key alone, so this secondary key is required, not optional, to satisfy
the AC's determinism requirement), empty
Departments-view degrades to zero counts/empty arrays (§5.1's 200-with-empty-shape contract), and
the no-route-for-other-Departments case (§6, no route table entry exists).

---

## Open Items for Human Review (not HALTs — flagged for Danny’s post-hoc review)

1. No pagination/page-size limit exists anywhere in this design (§3's PROVISIONAL note) — flagged
   in case Danny wants one for a larger dataset than local dev currently has; not added without a
   named owner and citation.
