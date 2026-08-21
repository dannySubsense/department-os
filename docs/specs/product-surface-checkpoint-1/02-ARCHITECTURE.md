# Architecture: Product Surface — Checkpoint 1

**Status**: REVISED — human product-gate FAIL on Slice 1's browser demonstration (Danny,
2026-08-20), correcting the design that had passed the binding spec-gate at `4757c37`. See §0a for
the verbatim ruling and the resulting architectural changes. `01-REQUIREMENTS.md`, `03-UI-SPEC.md`,
and `04-ROADMAP.md` are revised to match this document's decisions, not the reverse.
**Traces to**: `01-REQUIREMENTS.md` (see its User Stories section for the full list — not
restated here per repo-wide no-manually-asserted-counts discipline), `docs/specs/product-surface/DESIGN-PROPOSAL.md` §1/§2/§2a/§3/§4/§4a/§7/§8/§11
(Checkpoint-1 subset only — §5/§6/§8's `ActivityFeedEntry`/`InvestigationWorkspaceView`/§9/§10/
§10a/§10b are explicitly out of scope and not designed here).

Grounded against the real, currently-checked-out repo state (branch
`feature/problem-department-mvp`, commit `37d91d4`): `src/types/domain.ts`, `src/web/server.ts`,
`src/web/views.ts`, `src/services/getInvestigation.ts`, `src/services/submitSources.ts`,
`src/db/migrate.ts`, `src/db/migrations/001`–`008`, `package.json`.

---

## 0a. Product-Gate Correction (Danny, 2026-08-20) — binding, supersedes the prior design

Danny ran the browser demonstration for Slice 1 (Mission Control Shell) and FAILED it on product
grounds. Verbatim ruling:

> "The Problem Department is displayed as 'installed' but is not clearly actionable. Planned/
> uninstalled Departments dominate the page even though they are configuration/catalog information,
> not current operating information.
>
> Required correction:
> 1. Mission Control shows only Departments currently available to the user. Show Problem
>    Department. Remove the three planned Department tiles. Remove the planned-Departments footer
>    note. Do not expose installed/planned labels here.
> 2. Make Problem Department unmistakably actionable. The entire Department card may be clickable.
>    Include an explicit 'Open Problem Department →' affordance. It must lead to a real Problem
>    Department surface, not an inline 'not built' stub.
> 3. Replace installation status with useful live state already available: investigation count,
>    active count, needs-attention count, recent completed count. Do not fabricate values.
> 4. Revise the left navigation for the current product: Mission Control, Problem Department. Do
>    not use 'Departments' as an installation-management destination. A future Departments view may
>    switch among enabled Departments. Installing or unlocking modules belongs under Settings / Add
>    Department, outside this checkpoint.
> 5. Re-sequence the remaining checkpoint so the next browser-visible result is a real Problem
>    Department overview reachable from Mission Control. Do not build the planned-module catalog as
>    Slice 2."

**Net architectural effect, decided here (binding on `01-REQUIREMENTS.md`/`03-UI-SPEC.md`/
`04-ROADMAP.md`'s revision):**

- The "Departments directory" screen (previously Screen B — `DepartmentsScreen`,
  `getDepartmentsView`, `GET /api/departments`, the `/departments` route) is **removed from this
  checkpoint's scope entirely.** It was a catalog of all four Departments with installed/planned
  labels — exactly the configuration information Danny ruled does not belong on the live operating
  surface. It is not redirected or stubbed; the route, service, and screen simply do not exist this
  checkpoint. Deferred capability: "a future Departments view may switch among enabled Departments,"
  and "installing or unlocking modules belongs under Settings / Add Department" — both explicitly
  out of this checkpoint, per Danny's own framing above.
- Mission Control now links **directly** to a real Problem Department overview — a one-hop link
  (`ProblemDepartmentCard` → `/departments/problem-department`), not the previous two-hop
  Mission-Control → Departments-directory → Problem-Department path. This pulls the Problem
  Department overview destination forward to be this checkpoint's second (and now only other)
  real browser-visible screen.
- `MissionControlView` drops the `departments: DepartmentSummary[]` catalog field and the
  planned-Departments note entirely, replacing installation status with four real, already-derivable
  live counts. See §3 for the exact shape.
- `PersistentNav` drops to exactly two links: "Mission Control" and "Problem Department" — not
  "Departments."

Full detail of every affected section is inlined at point of change below (§1, §2, §3, §5, §6, §7,
§11); this section is the single pointer for "why," not a duplicate of the mechanics.

---

## 1. Scope Boundary (binding, re-stated for implementers)

In scope, POST-CORRECTION (§0a): three new Express JSON routes (two GET, one POST — `GET
/api/mission-control`, `GET /api/problem-department`, `POST /api/investigations`; `GET
/api/departments` is removed, §0a), two new read-model query functions (`getMissionControlView`,
`getProblemDepartmentOverview`; `getDepartmentsView` is removed, §0a), a React SPA with two screens
(Mission Control, Problem Department overview — no "Departments directory" screen, §0a) — no third
SPA route beyond `/` and `/departments/problem-department`, and no client-side placeholder for
Screen D (§2/§6: per-row, status-driven affordances instead do a full-page navigation to the
existing legacy Express route, `GET /investigations/:id`, per Danny's correction below — every row
whose `status` is `open`, `blocked`, or `generation-failed` gets a real "Open current view" link;
rows with `status === 'brief-generated'` render plain non-interactive text instead, since no
Screen-D workspace exists yet to open) — Vite
build tooling, and the static-serving / dev-proxy integration boundary with the existing Express
app.

No `/departments` catalog screen is built this checkpoint (§0a) — that capability moves to "a
future Departments view" (switching among enabled Departments) and "Settings / Add Department"
(installing/unlocking modules), both explicitly out of this checkpoint per Danny's ruling.
Mission Control links directly into the real Problem Department overview, which is this
checkpoint's second (and only other) real browser-visible destination.

Out of scope, not designed here even partially: Investigation Workspace (Screen D), any
`/api/investigations/:id/workspace` or `/api/investigations/:id/activity` route,
`generation_component_event` table or any migration, `BriefForReview`, `deriveWorkflowStage`/
`WorkflowStage`, `POST /api/investigations/:id/generation-runs`, live polling of any kind, `/evidence`,
`/runs`, `/knowledge`, `/activity` Core-wide routes, a "Departments directory"/catalog screen or
route (`/departments`, `GET /api/departments`, `getDepartmentsView`, `DepartmentsScreen` —
§0a), and any Settings / Add Department / module-installation surface. If a later step in this
document seems to need one of these, that is a signal to stop and re-read the boundary, not to
design around it.

---

## 2. Components

| Component | Responsibility | Location |
|---|---|---|
| `getMissionControlView` | Assemble `MissionControlView` from `investigation`/`generation_run`/`brief_version`/`evidence_item`/`source_artifact` via the following independent queries (§5.3) — POST-CORRECTION (§0a): no longer queries/returns a Departments catalog; instead assembles the single `problemDepartment` live-counts summary | `src/services/getMissionControlView.ts` (new) |
| `getProblemDepartmentOverview` | Assemble `ProblemDepartmentOverview` — full portfolio, counts, last-active id, recent runs | `src/services/getProblemDepartmentOverview.ts` (new) |
| `departmentRegistry` | Static, in-process list of the four `Department` config literals (id, name, thesis, installed flag) — single source of Problem Department's name/thesis, consumed by `getMissionControlView` and `getProblemDepartmentOverview` (§0a: no longer also consumed by a `getDepartmentsView`, which is removed) so Problem Department's identity fields are never independently retyped. The other three (planned) entries remain in this registry for a future Departments/Settings view but are not read by anything this checkpoint. | `src/config/departments.ts` (new) |
| `lastActivitySql` | Shared SQL fragment implementing `DESIGN-PROPOSAL.md` §4a's `GREATEST` computation, restricted to tables that exist this checkpoint (excludes `generation_component_event`, `generation_step`'s `gs` alias stays since `generation_step` DOES exist — see §4 below for the exact restriction) | inlined as a named SQL constant in `src/services/lastActivity.ts` (new), imported by both `getMissionControlView.ts` and `getProblemDepartmentOverview.ts` — one query text, not two divergent copies (US-4 AC3 / Constraint) |
| Express routes: `GET /api/mission-control`, `GET /api/problem-department`, `POST /api/investigations` (JSON) | Thin HTTP adapters — parse request, call the corresponding service, serialize JSON, map thrown errors to status codes. POST-CORRECTION (§0a): `GET /api/departments` is removed — no catalog route exists this checkpoint. | `src/web/apiRoutes.ts` (new), mounted from `src/web/server.ts` |
| `App` (React root) | Client-side router (exactly two screen routes — `/`, `/departments/problem-department` — no `/departments` catalog route, no catch-all `<Route>`, §6) and top-level layout shell; mounts `PersistentNav` once at the shell level (sibling to `<Routes>`, not inside any route's element), so it renders on every screen and does not remount on navigation | `src/client/App.tsx` (new) |
| `PersistentNav` | Persistent left-nav rendered once in `App`'s layout shell, outside the `<Routes>` switch, so it survives client-side route changes. Renders exactly two nav links this checkpoint, POST-CORRECTION (§0a): "Mission Control" (`/`) and "Problem Department" (`/departments/problem-department`) — NOT "Departments"; `/departments` is not a destination this checkpoint. No `/activity` or `/knowledge` link is rendered either (those routes are not built this checkpoint, §1 Scope Boundary). Highlights the active link via `react-router-dom`'s `NavLink` (no bespoke active-state logic). Presentational only — no data fetching, no props beyond the current location supplied by the router. | `src/client/components/PersistentNav.tsx` (new) |
| `MissionControlScreen` | Renders `MissionControlView`, POST-CORRECTION (§0a): a single `ProblemDepartmentCard` (replacing the removed Installed-Departments strip and planned-Departments note), four Active-work groups (Active / Ready-Not-Started / Needs Attention / Recent-Completed), `activeActivity` panel (GenerationRun-level only), recent lists | `src/client/screens/MissionControlScreen.tsx` (new) |
| `ProblemDepartmentCard` | NEW (§0a, replacing the old Installed-Departments strip). Renders `MissionControlView.problemDepartment` (§3) as a single card. The entire card is a clickable navigation target (`react-router-dom` `<Link to="/departments/problem-department">` wrapping the whole card, not just a sub-element) AND contains an explicit, separately-visible "Open Problem Department →" affordance inside it (both satisfy Danny's "entire card may be clickable" + "include an explicit ... affordance" — the explicit affordance is not optional-in-practice just because the card is also clickable). Shows name, thesis, and the four live counts (`investigationCount`/`activeCount`/`needsAttentionCount`/`recentCompletedCount`) — renders no `installed`/`planned` label or badge (Danny's ruling item 1). | `src/client/components/ProblemDepartmentCard.tsx` (new) |
| `ProblemDepartmentScreen` | Renders `ProblemDepartmentOverview`: header, portfolio (status filter/sort), counts, recent runs, Start Investigation, empty state | `src/client/screens/ProblemDepartmentScreen.tsx` (new) |
| `StartInvestigationForm` | Presentational form wrapping `POST /api/investigations`; on success, triggers portfolio refetch | `src/client/components/StartInvestigationForm.tsx` (new) |
| `InvestigationPortfolioTable` | Presentational: renders `InvestigationSummary[]`, client-side status filter/sort only (no server round trip needed — full portfolio is already fetched) | `src/client/components/InvestigationPortfolioTable.tsx` (new) |
| `apiClient` | Thin `fetch` wrappers for the two GET routes + the POST route, typed against the shared response interfaces (§5) | `src/client/api.ts` (new) |

Every component above has exactly one responsibility; no component both fetches and derives
business logic beyond what's stated (derivation — Active/Needs-Attention/Recent-Completed
grouping, last-activity computation — lives entirely in the two `get*View` services, never
duplicated client-side).

**Removed this checkpoint (§0a):** `getDepartmentsView` (`src/services/getDepartmentsView.ts`),
`DepartmentsScreen` (`src/client/screens/DepartmentsScreen.tsx`), `DepartmentsView`/
`fetchDepartments`, and the `GET /api/departments` route — the whole "Departments directory"
component set. This capability is not silently deleted: it moves to (a) a future Departments view
that switches among *enabled* Departments, and (b) a Settings / Add Department surface for
installing/unlocking modules — both explicitly out of this checkpoint's scope per Danny's ruling
(§0a), neither designed here.

---

## 3. Data Schemas

These interfaces are copied **verbatim** from `DESIGN-PROPOSAL.md` §8 for the Checkpoint-1 subset
(`InvestigationSummary`, `BriefSummary`, `EvidenceSummary`, `ProblemDepartmentOverview`), with two
explicit narrowings/departures, both binding on `01-REQUIREMENTS.md`/`03-UI-SPEC.md`:

1. `MissionControlView.activeActivity` is typed as `GenerationRunSummary[]` this checkpoint, not
   `ActivityFeedEntry[]` — `ActivityFeedEntry` (§8) carries a `currentComponent` field sourced from
   `generation_component_event`, a table that does not exist this checkpoint (Checkpoint 3 scope,
   per `01-REQUIREMENTS.md`'s AC "no live-component-level field"). Reusing `ActivityFeedEntry`'s
   name while silently never populating `currentComponent` would be a type lying about a capability
   that doesn't exist yet; `GenerationRunSummary` is the honest, checkpoint-scoped type.
2. **POST-CORRECTION (§0a):** `MissionControlView` no longer carries a `departments:
   DepartmentSummary[]` catalog field or `DepartmentsView` at all — Danny's ruling eliminated the
   Departments-catalog concept from this checkpoint's live operating surface entirely. In its place,
   `MissionControlView.problemDepartment: MissionControlProblemDepartmentSummary` (new type, defined
   below) carries Problem Department's identity plus four live counts — `investigationCount`,
   `activeCount`, `needsAttentionCount`, `recentCompletedCount` — replacing the removed
   `installed`/`planned` status label per Danny's explicit "do not expose installed/planned labels
   here." This type deliberately does NOT reuse `DepartmentSummary` (which still carries a `status:
   'installed' | 'planned'` field) — extending `DepartmentSummary` for Mission Control's card would
   silently smuggle the very label field Danny ruled out back into the type. `DepartmentSummary`
   itself is unchanged and still exists as a type (§0a does not remove the type or
   `ProblemDepartmentOverview.department`'s use of it as an identity source); however, its `status`
   field is NOT rendered anywhere in the UI — Danny's final round-4 correction removed the
   "installed" badge from the Problem Department overview screen's header as well
   (`ProblemDepartmentScreen.tsx`'s `department-status-badge` span was deleted entirely):
   installation state is settings/catalog data, ruled out of the operating interface on both screens,
   not just Mission Control. `ProblemDepartmentOverview.department.status` is retained in the type
   only because `DepartmentSummary` is shared with the registry; no component reads or displays it.

Every other field matches §8 exactly, structural narrowing only, not scope creep.

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

/** POST-CORRECTION (§0a) — Mission Control's Problem-Department card summary. Deliberately
 *  separate from `DepartmentSummary` (see explanatory note above): carries no `status` field, so
 *  it structurally cannot leak an installed/planned label onto Mission Control (Danny's ruling
 *  item 1). Every count below is either a direct COUNT(*) (`investigationCount`) or the `.length`
 *  of an array `getMissionControlView` already assembles for `activeWork` (§5.3 query 1/2/4/5) —
 *  no new query logic beyond one trivial COUNT, no fabricated field (Danny's ruling item 3). */
export interface MissionControlProblemDepartmentSummary {
  id: string;                  // 'problem-department', from departmentRegistry
  name: string;                // from departmentRegistry
  thesis: string;               // from departmentRegistry
  investigationCount: number;  // COUNT(*) of all Investigation rows (§5.3 query 1)
  activeCount: number;         // activeWork.active.length (§5.3 query 2)
  needsAttentionCount: number; // activeWork.needsAttention.length (§5.3 query 4)
  recentCompletedCount: number; // activeWork.recentCompleted.length (§5.3 query 5)
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

export interface MissionControlView {
  problemDepartment: MissionControlProblemDepartmentSummary; // POST-CORRECTION (§0a) — replaces
                                                               // the removed `departments` catalog
                                                               // array and planned-Departments note
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
cache TTL, or page-size limit — every list returned by these two read models is the full,
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

// GET /api/departments — REMOVED (§0a, Danny's product-gate ruling). No Departments-catalog
// route exists this checkpoint; Problem Department's live counts are served as part of
// GET /api/mission-control (MissionControlView.problemDepartment, §3) instead.

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

// src/services/getProblemDepartmentOverview.ts
export async function getProblemDepartmentOverview(): Promise<ProblemDepartmentOverview>;
```

`getDepartmentsView` is REMOVED (§0a) — not part of this checkpoint's service layer.

No parameters on either of the two remaining services — Checkpoint 1 has exactly one installed
Department and no per-Department parameterization is needed yet (`getProblemDepartmentOverview` is
hard-scoped to Problem Department internally, matching this checkpoint’s "exactly one Department has
a working service layer" assumption). Adding a `departmentId` parameter ahead of a second Department
existing would be speculative generality with no current caller — not introduced here.

### 5.3 Backing SQL — exact shape per read model

**`getDepartmentsView`** — REMOVED (§0a). This checkpoint no longer serves a Departments
catalog in any form; `departmentRegistry` below is retained only as the source of Problem
Department's `id`/`name`/`thesis` for `MissionControlView.problemDepartment` and
`ProblemDepartmentOverview.department`.

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
bucketing across groups is used — see the mutual-exclusivity proof below the query list). Query 1
below is new relative to the pre-correction design (§0a) — it replaces the old, no-query
`departmentRegistry` catalog read with the one real COUNT this checkpoint now needs for
`problemDepartment.investigationCount`. `problemDepartment.activeCount`,
`.needsAttentionCount`, and `.recentCompletedCount` are NOT separate queries — they are the
`.length` of the result arrays queries 2, 4, and 5 already produce for `activeWork`, computed in
`getMissionControlView`'s TypeScript after those queries run, per Danny's "these are NOT new
queries, they're `.length` of arrays this view already assembles" instruction:

```sql
-- 1. problemDepartment.investigationCount — number. POST-CORRECTION (§0a): real COUNT(*), replacing
-- the old no-query departmentRegistry catalog read. Scoped "to this Department's Investigations"
-- (same single-Department-today equivalence already used for getProblemDepartmentOverview's
-- sourceCount/evidenceCount below, §5.3 — no department_id column exists on investigation to scope
-- by, §7).
SELECT COUNT(*)::int AS count FROM investigation;

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
-- CORRECTED (Frank narrow re-gate, correction 1): the prior "unchanged by this correction" version
-- of this query overlapped with query 4 (Needs Attention) for every 'generation-failed'
-- Investigation whose failed pipeline run left a `generation_run` row with `outcome = 'failed'` —
-- which is not a hypothetical edge case but the NORMAL state of every real failed investigation in
-- this system. `src/types/domain.ts:370` defines
-- `GenerationRun.outcome: 'in-progress' | 'succeeded' | 'failed'`, and
-- `src/services/generateBriefVersion.test.ts`'s failure-path tests (e.g. the "given no valid
-- ProblemStatement can be established" case, and the "falsification test H: retry from
-- generation-failed" case) show the standard path is: a `generation_run` row is created with
-- `outcome: 'in-progress'`, then updated to `outcome: 'failed'` on failure, with
-- `Investigation.status` set to `'generation-failed'` in the same transaction. So a
-- `generation-failed` Investigation with a `failed` (non-in-progress) `generation_run` row is the
-- ordinary case, not an inherited unresolved edge case — this query now excludes it explicitly so
-- Needs Attention (query 4) has undisputed precedence for `blocked`/`generation-failed` statuses,
-- and Recent/Completed only claims investigations query 4 does not already claim.
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
 WHERE i.status NOT IN ('blocked', 'generation-failed')
   AND NOT EXISTS (
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
- **Recent/Completed (query 5, CORRECTED)** := `status NOT IN ('blocked', 'generation-failed') AND
  NOT P AND (status = 'brief-generated' OR R)`. The added `status NOT IN ('blocked',
  'generation-failed')` term is the fix for the overlap identified below; it gives Needs Attention
  undisputed precedence over Recent/Completed for those two statuses regardless of what
  `generation_run` rows exist.

**Why the added exclusion is necessary, not defensive-only** (this replaces the prior version's
deferred "a future correction should confirm..." hand-wave with direct evidence from this repo):
`src/types/domain.ts:370` defines `GenerationRun.outcome: 'in-progress' | 'succeeded' | 'failed'`.
`src/services/generateBriefVersion.test.ts`'s failure-path tests — e.g. "given no valid
ProblemStatement can be established, the run fails explicitly... Investigation.status becomes
generation-failed" (asserting `investigation.rows[0].status === 'generation-failed'`), and
"falsification test H: an Investigation in generation-failed that succeeds on retry" (asserting
`runs.rows[0].outcome === 'failed'` after a failed run, at the point the Investigation sits in
`generation-failed`) — show that the standard, non-exceptional failure path is: a `generation_run`
row is created with `outcome: 'in-progress'`, then updated to `outcome: 'failed'` in the same
transaction that sets `Investigation.status = 'generation-failed'`. So `generation-failed AND R`
(in fact `generation-failed AND EXISTS run WHERE outcome = 'failed'`, a strictly stronger condition
than `R`) is not an edge case to "confirm in practice" — it is the state of every real failed
investigation in this system, by construction of `generateBriefVersion.ts`'s failure path. Without
the added exclusion, every `generation-failed` Investigation would appear in BOTH Needs Attention
(query 4, `status IN (...) AND NOT P` — true, since a `failed` run means `P` is false) and
Recent/Completed (query 5 unmodified, `NOT P AND (... OR R)` — true, since `R` is true). The added
`status NOT IN ('blocked', 'generation-failed')` term on query 5 closes this by construction: no
`generation-failed` or `blocked` Investigation can ever satisfy query 5's predicate, full stop,
independent of what `generation_run` rows it has.

Case split on `P`:
- **`P` = true**: matches Active only. It cannot match Ready/Not Started (`R` is implied true by
  `P`, so `NOT R` is false), Needs Attention (`NOT P` is false), or Recent/Completed (`NOT P` is
  false). Disjoint from the other three by construction.
- **`P` = false**: Active does not match (requires `P`). The remaining three groups partition on
  `status` and `R`:
  - Ready/Not Started requires `status = 'open' AND NOT R`.
  - Needs Attention requires `status IN ('blocked', 'generation-failed')`.
  - Recent/Completed (corrected) requires `status NOT IN ('blocked', 'generation-failed') AND
    (status = 'brief-generated' OR R)`.
  - The four `InvestigationStatus` enum values are mutually exclusive, so every Investigation's
    `status` falls into exactly one of three disjoint buckets: `{open}`, `{blocked,
    generation-failed}`, `{brief-generated}`.
    - `status = 'open'`: fails Needs Attention's `status IN (...)` test and fails Recent/Completed's
      `status NOT IN (...) AND (status = 'brief-generated' OR R)` unless `R` is true (since
      `status NOT IN ('blocked', 'generation-failed')` is true for `open`, and `status =
      'brief-generated'` is false, so Recent/Completed reduces to `R` for this bucket). So an
      `open`, `P`-false Investigation matches Ready/Not Started iff `NOT R`, and Recent/Completed
      iff `R` — and `NOT R`/`R` are mutually exclusive, so never both, and always exactly one
      (`R` is a two-valued boolean with no third state).
    - `status IN ('blocked', 'generation-failed')`: matches Needs Attention's status test
      unconditionally (combined with `NOT P`, which holds in this branch). It CANNOT match
      Recent/Completed, by construction: Recent/Completed's `status NOT IN ('blocked',
      'generation-failed')` term is false for every member of this bucket, regardless of `R` or any
      other `generation_run` state. It cannot match Ready/Not Started either (`status ≠ 'open'`).
      So every `blocked`/`generation-failed`, `P`-false Investigation matches Needs Attention only —
      no overlap, and no case where it matches zero groups (Needs Attention's only remaining
      requirement, `NOT P`, is guaranteed by this branch's case split).
    - `status = 'brief-generated'`: fails Ready/Not Started (`status ≠ 'open'`) and fails Needs
      Attention (`status` not in `('blocked', 'generation-failed')`). Recent/Completed's
      `status NOT IN ('blocked', 'generation-failed')` term is true, and its `status =
      'brief-generated'` disjunct is true, so it matches Recent/Completed unconditionally
      (independent of `R`). Matches Recent/Completed only.

Every Investigation therefore falls into exactly one of the four groups in every case, with no
inherited or deferred exception: the `generation-failed`/Recent-Completed overlap previously
flagged as an open item is closed by the added `status NOT IN ('blocked', 'generation-failed')`
term on query 5, justified above directly from `src/types/domain.ts:370` and
`src/services/generateBriefVersion.test.ts`'s failure-path tests rather than deferred to a future
correction.

**Second boundary checked — does the same precedence issue affect Active vs. Needs Attention, or
Ready/Not-Started vs. any other boundary?** No; both are already closed by construction, for a
different reason than query 5's fix:
- **Active vs. Needs Attention**: could a `blocked` Investigation ever have an in-progress
  `generation_run` row (making it match both Active's `P` and Needs Attention's `status IN (...)`)?
  YES — CORRECTED (Frank narrow re-gate 2). The prior version of this passage claimed `R` is false
  for every `blocked` Investigation and that `blocked` can never appear in Active; that claim is
  false and is withdrawn. Direct evidence from this repo:
  `src/services/generateBriefVersion.test.ts`'s "blocked distinct from generation-failed (G-13)"
  test (~lines 461-496) calls `generateBriefVersion` for real against an Investigation already left
  `blocked` (zero reachable sources) — the test's own comment (~lines 452-459) states that
  "generateBriefVersion's phase-1 GenerationRun creation and pipeline execution proceed against an
  Investigation a prior Slice-3 pass already left 'blocked' (nothing in this slice checks that
  before running)." So a real `generation_run` row IS created — transiently `outcome:
  'in-progress'`, then finalized to `outcome: 'failed'` on the run's failure (the guarded UPDATE to
  `Investigation.status = 'generation-failed'` affects zero rows because the Investigation was
  already `blocked`, per `ALLOWED_PRIOR_STATUSES` excluding `blocked` from that transition's
  allowed-prior set — `src/services/transitionInvestigationStatus.ts` line 28,
  `src/services/generateBriefVersion.ts` lines 34-35, 205, 242-243). `Investigation.status` stays
  `blocked` throughout. So `R` is NOT always false for `blocked` Investigations — `blocked`
  Investigations CAN carry `generation_run` rows, including transiently in-progress ones during the
  window between phase-1 GenerationRun creation and phase-4 failure finalization.

  Mutual exclusivity STILL HOLDS despite this — no query change is needed, only this proof's claim
  about WHY was wrong. Active's predicate is `P` alone (query 2's `EXISTS ... outcome =
  'in-progress'`), independent of `status`; Needs Attention's predicate (query 4) already requires
  `NOT P` as a conjunct alongside `status IN ('blocked', 'generation-failed')`. So for a `blocked`
  Investigation, exactly one of two cases holds and each lands in exactly one group:
  - `blocked ∧ P` (an in-progress `generation_run` row exists, i.e. the race window above): matches
    Active only — Needs Attention's `NOT P` conjunct is false, so it cannot also match there.
  - `blocked ∧ ¬P` (no in-progress row — either none was ever created, or one was created and has
    already finalized to `outcome: 'failed'`, the G-13 test's end state): matches Needs Attention
    only — Active's `P` requirement fails.

  Every combination still lands in exactly one group; the case-split argument two paragraphs below
  ("Case split on `P`") already covers this correctly and did not depend on the withdrawn claim —
  only the prose asserting `blocked` can never satisfy `P` was wrong, and is corrected here.

  Real-world consequence (ACCEPTED, not a defect): a `blocked` Investigation with a concurrent
  in-progress race run — i.e. the pipeline is actively re-running against it, as G-13's test
  scenario begins before the run finalizes — will display under "Active," not "Needs Attention,"
  for the duration of that race window (typically brief, ending when the run finalizes to
  `succeeded` or `failed`). This is a faithful implementation of Danny's ruling that Active is
  defined purely by run-state (`P`), not by `status` — the group definitions as specified produce
  this outcome by design, not by omission. Flagged here as an accepted consequence rather than
  silently absorbed; if Danny judges this transient display placement undesirable, that is a
  scope/requirements question for a future checkpoint, not a defect in this architecture's query
  logic.

  **Danny's (Composer's) ruling on this race window — accepted, folded in at closeout (this
  package already PASSED the full binding gate at commit `4757c37`; this is a closeout
  refinement, not a re-open):**

  > "Ruling on blocked + in-progress: accept Active precedence while the run is genuinely
  > executing. The row must retain its blocked status/status reason and alarm treatment. Once the
  > run finalizes, it moves to Needs Attention. It must not appear in both groups."

  The "must not appear in both groups" half is already satisfied by the mutual-exclusivity proof
  above — no query change follows from it. What the ruling adds is a **data-contract** requirement
  on the row itself while it sits in Active under the `blocked ∧ P` case:

  - **The Active group is not visually/structurally uniform.** A row's real `status` (`'open'` or
    `'blocked'`) and `statusReason` (when present) are always populated on the returned
    `InvestigationSummary`, regardless of which of the four `activeWork` groups it is bucketed
    into. This is already true by construction — query 2 (`activeWork.active`, above) selects
    `i.status, i.status_reason` alongside every other query — but is stated explicitly here as a
    binding contract, not an incidental consequence: no future revision to query 2 or its mapping
    into `InvestigationSummary` may drop, overwrite, hardcode, or default away `status`/
    `statusReason` for Active-group rows on the theory that "it's in Active, so it must be open."
  - **A `blocked ∧ P` row in Active must be distinguishable from a normal `open ∧ P` Active row.**
    Concretely, it must receive alarm/attention-level visual treatment, not the calmer treatment a
    `status='open'` Active row gets. This is a UI-rendering concern that `03-UI-SPEC.md` owns
    concretely (mapping `status`/`statusReason` to a visual treatment); the data contract this
    architecture guarantees is that the row's real `status` field is present and unaltered on every
    Active-group `InvestigationSummary`, which is what that downstream treatment keys off. No
    schema change to `InvestigationSummary` (`src/types/domain.ts` usage in this doc, lines
    103-106) is required — `status` and `statusReason` are already unconditional fields on that
    interface, not group-specific.
  - **Movement out of Active happens on next fetch, not live.** Once the race-window run finalizes
    (`outcome` transitions out of `'in-progress'` to `'succeeded'` or `'failed'`), `P` becomes false
    for that Investigation and it naturally satisfies Needs Attention's predicate (`blocked ∧ ¬P`)
    on the next evaluation of these queries — this requires no additional logic, since it falls
    directly out of the existing predicates proven mutually exclusive above. This checkpoint has no
    polling or live-update mechanism (out of scope per `01-REQUIREMENTS.md`), so this transition is
    only observed on the next page load/refetch, never live within an open session — stated
    explicitly here so it is not mistaken for a live-update guarantee this architecture does not
    provide.

- **Ready/Not-Started vs. any other boundary**: Ready/Not Started requires `status = 'open' AND NOT
  R`; every other group either requires `status ≠ 'open'` (Needs Attention, and Recent/Completed's
  `brief-generated` disjunct) or requires `R`/`P` (Active, and Recent/Completed's `R` disjunct for
  the `open` bucket) — so by the case analysis above, `open AND NOT R` cannot satisfy any other
  group's predicate. No fix needed here either.

The single defect requiring a fix was the query 4/5 (Needs Attention/Recent-Completed) overlap;
Active/Needs-Attention and Ready-Not-Started's boundaries were already sound and did not need
correction.


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

The two screen routes below reflect Danny's product-gate correction (§0a) — the pre-correction
design had three routes including `/departments`; that intermediate catalog route is removed
entirely, not redirected or stubbed. No third route and no client-side placeholder for the
out-of-scope Screen D. **Routing decision (§0a, option (a) selected):** Mission Control links
directly to `/departments/problem-department` — the URL itself is UNCHANGED from the pre-correction
design; only the intermediate `/departments` directory screen is removed as a real, linked-to
destination. This is the smallest correct change given Danny's ruling is about information
architecture/labeling/navigation (which screens exist and what the nav links to), not about the URL
scheme for Problem Department, which was already correct. Option (b) — restructuring the URL itself
(e.g. `/problem-department`) — was considered and rejected: it would touch every existing reference
to `/departments/problem-department` (§7 catch-all guard, §10 integration, the UI spec, the legacy
`/investigations/:id` cross-link context) for no requirement gain, since nothing in Danny's ruling
objects to the URL shape. The `/departments` route itself is not kept as a redirect either — Danny's
ruling item 4 ("do not use 'Departments' as an installation-management destination") is most
directly satisfied by that destination not existing at all this checkpoint, rather than existing
as a redirect stub that itself needs a description and a "why does this still exist" answer later.

Per Danny's separate correction (US-4), any link that would previously have pointed at a Screen-D
placeholder instead does a real, full-page navigation — a plain `<a href="/investigations/{id}">`,
not a React Router `<Link>` — to the EXISTING legacy Express route `GET /investigations/:id`
(`src/web/server.ts:115-158`), labeled "Open current view." That leaves the SPA entirely and hits
the already-working server-rendered screen (`src/web/views.ts`'s
`renderInvestigationGeneratingScreen`/`renderInvestigationBlockedScreen`/
`renderInvestigationGenerationFailedScreen`) rather than a purpose-built placeholder announcing its
own future replacement.

This affordance is **per-row and status-driven, not tied to a single "last-active" Investigation.**
Every row in both `InvestigationPortfolioTable` (`ProblemDepartmentScreen`) and Mission Control's
`RecentInvestigationsList` branches independently on that row's own `status`:

- `status` is `'open'`, `'blocked'`, or `'generation-failed'` → a real "Open current view" button/
  link, the full-page `<a>` described above, to `/investigations/:id`.
- `status === 'brief-generated'` → plain, non-interactive text — "Brief ready — review workspace not
  yet available." — no anchor, no button, since no Screen-D workspace exists yet to open.

Any qualifying row gets this affordance, independent of whether it is the single most-recently-active
Investigation; the earlier design gated this by "is this the last-active Investigation," and that
gating was explicitly removed from both components:

| Route | Component | Data source |
|---|---|---|
| `/` | `MissionControlScreen` | `GET /api/mission-control` on mount, one fetch, no polling (no live-update requirement this checkpoint) |
| `/departments/problem-department` | `ProblemDepartmentScreen` | `GET /api/problem-department` on mount; re-fetches after a successful `StartInvestigationForm` submission (US-5 AC2 — "next load/refresh") |

`/departments` (bare, no sub-path) is REMOVED (§0a) — not a route in the SPA's router at all, and
`GET /api/departments` does not exist server-side either (§5.1). No route exists for
`/departments/:otherDepartmentSlug` either — no Department other than Problem Department has a
working overview this checkpoint, and no navigation path anywhere in the app (nav, or the removed
catalog screen) ever produces a link to one; this matches the Edge Cases table's "no route is
defined for one" resolution, now with no intermediate catalog screen to have omitted a click target
from in the first place.

No client-side route exists for `/departments/problem-department/investigations/*` either — there
is no React-side destination for that URL shape. Each per-row "Open current view" affordance is a
plain anchor tag, not a `Route`/`Link`, so none of them are part of the router's route table at all
(§App's router description above lists exactly two `<Route>` elements, no catch-all).

Client-side data fetching uses plain `fetch` via `apiClient` (`src/client/api.ts`) and React's
built-in `useEffect`/`useState` — no state-management library is added (none exists in the repo
today; introducing one for two single-fetch screens with no cross-screen shared state would be
an unjustified dependency, see §8).

```typescript
// src/client/api.ts
export async function fetchMissionControl(): Promise<MissionControlView>;
export async function fetchProblemDepartmentOverview(): Promise<ProblemDepartmentOverview>;
export async function createInvestigation(
  body: CreateInvestigationRequestBody,
): Promise<CreateInvestigationResponseBody>;
```

`fetchDepartments` is REMOVED (§0a) along with `getDepartmentsView`/`GET /api/departments`.

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

`MissionControlScreen` renders a single `ProblemDepartmentCard` (§2, §0a) above
`activeWork.active`/`readyNotStarted`/`needsAttention`/`recentCompleted`, which remain rendered as
four visually distinct, independently-labeled lists (US-6 AC1-3, plus the new Ready/Not-Started
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
  for any of the client-side routes (the two screen routes, §6, post-correction §0a) on a hard
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
| Read model = one query function returning one typed interface, no ORM | Both `get*View` services (§0a: two, not three) | Matches existing `getInvestigation.ts`'s direct-`pg`-query pattern exactly — no new data-access abstraction introduced for 2 more read paths |
| Shared SQL fragment via exported string constant, not a view/materialized view | `LAST_ACTIVITY_SUBQUERY` | No new database object — Constraint "no new database table, migration, or schema change," and a plain parameterizable SQL fragment is joinable inline without a migration |
| Static config array for `Department`, not a table | `departmentRegistry` | `DESIGN-PROPOSAL.md` §7/§15: Department's persisted-vs-static home is an explicitly deferred open question; a static array satisfies this checkpoint without preempting that later decision |
| Plain `fetch` + `useEffect`/`useState`, no state-management library | Both screens (§0a: two, not three) | Each screen does exactly one fetch on mount with no cross-screen shared state; a store (Redux/Zustand/etc.) would be unjustified generality for 2 read-only page loads |
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
| `react-router-dom` | ^6.26.0 | Client-side route matching for the two screen routes (§6, post-correction §0a) |
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
- **`src/db/pool.ts`**: the two new `get*View` services (§0a) import and query the existing `pool`
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
| US-1 (Mission Control) — see 01-REQUIREMENTS.md's US-1 Acceptance Criteria for the full list, POST-CORRECTION per §0a (superseded ACs to be revised by @requirements-analyst) | `getMissionControlView`, `MissionControlView`/`MissionControlProblemDepartmentSummary`/`GenerationRunSummary` (§3), `MissionControlScreen`, `ProblemDepartmentCard` (§2/§6), `DEPARTMENTS` registry (§5.3) |
| US-2 (Departments directory) — RETIRED this checkpoint (§0a). The Departments-directory screen, its service, route, and click-target-omission pattern no longer exist; `01-REQUIREMENTS.md` is revised to remove or fully re-scope US-2 to match. No architecture element below implements it. | n/a — removed |
| US-3 (Problem Department overview) — see 01-REQUIREMENTS.md's US-3 Acceptance Criteria for the full list | `getProblemDepartmentOverview`, `ProblemDepartmentOverview`, `ProblemDepartmentScreen`, `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState`, source/evidence COUNT queries (§5.3), now reached via a one-hop link from `ProblemDepartmentCard` on Mission Control (§0a) instead of the removed two-hop Departments-directory path |
| US-4 (last recorded activity) — see 01-REQUIREMENTS.md's US-4 Acceptance Criteria for the full list | `LAST_ACTIVITY_SUBQUERY` (§4), shared import across both services (§2) |
| US-5 (Start Investigation) — see 01-REQUIREMENTS.md's US-5 Acceptance Criteria for the full list | `POST /api/investigations` (§5.1), `StartInvestigationForm`, post-submit refetch (§6) |
| US-6 (active-work grouping) — see 01-REQUIREMENTS.md's US-6 Acceptance Criteria for the full list | Queries 2/3/4/5 in `getMissionControlView` (§5.3), four independent result sets, `MissionControlView.activeWork` shape (§3) |
| US-7 (persistent cross-screen navigation) — see 01-REQUIREMENTS.md's US-7 Acceptance Criteria for the full list | `PersistentNav` component (§2) |

Every Edge Case in `01-REQUIREMENTS.md` not retired by §0a is addressed: zero-Investigation
empty state (§6), `GREATEST`-degrades-to-`created_at` (§4), unset `statusReason` (optional field,
`?` on `InvestigationSummary.statusReason`, never a placeholder), deterministic tie-break (every
`ORDER BY` in §5.3 that sorts on a non-unique column — recency timestamp or `created_at` — now
carries an explicit secondary key on that table's primary key column, e.g. `ORDER BY
la.last_activity_at DESC, i.id ASC`; Postgres provides no ordering guarantee for ties on the primary
sort key alone, so this secondary key is required, not optional, to satisfy the AC's determinism
requirement), and empty-data degrades to zero counts/empty arrays for both remaining read models
(§5.1's 200-with-empty-shape contract). RETIRED by §0a, no longer applicable: "no-click-target for
planned Departments" and "no-route-for-other-Departments" — both were properties of the removed
Departments-directory screen; `01-REQUIREMENTS.md`'s Edge Cases table is revised to drop them.

---

## Open Items for Human Review (not HALTs — flagged for Danny’s post-hoc review)

1. No pagination/page-size limit exists anywhere in this design (§3's PROVISIONAL note) — flagged
   in case Danny wants one for a larger dataset than local dev currently has; not added without a
   named owner and citation.
2. `departmentRegistry`/`DEPARTMENTS` (§5.3) still lists Signal Foundry, Prototype Department, and
   Creative Practice Engine as `planned` literals, even though nothing this checkpoint reads them
   (§0a). They are left in place as the natural seed for the deferred "future Departments view" and
   "Settings / Add Department" surfaces Danny's ruling named, rather than deleted and re-authored
   later — flagged in case Danny would rather this file only contain Problem Department until a
   Departments/Settings checkpoint is actually scoped.
