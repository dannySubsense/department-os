# Spec Review: Product Surface — Checkpoint 1

**Status**: COMPLETE — **no blocking findings. Package is ready for Frank's binding spec-gate.**
**Reviewer**: spec-reviewer (independent)
**Date**: 2026-08-19
**Pass**: 4th (full re-review after the B-6 fix; this document replaces the 3rd-pass review
entirely — a complete re-assessment, not a diff)
**Docs reviewed**: `01-REQUIREMENTS.md`, `02-ARCHITECTURE.md`, `03-UI-SPEC.md`, `04-ROADMAP.md`
**Context read**: `INTAKE.md`, `INTERVIEW.md`, `NORTH-STAR.md`,
`docs/specs/product-surface/DESIGN-PROPOSAL.md`
**Primary sources independently checked**: all four spec docs re-read in full this pass (not
diffed); a mechanical full-corpus regex sweep for count literals (`all \d+`, `\d+ AC`, `AC\d`,
`criteria`, case-insensitive) across the whole sprint directory rather than only the locations
named in the fix report; `src/db/migrations/001,004,006,007` (schema axis, carried from pass 3 —
unchanged, since the B-6 fix touched prose only and introduced no SQL)

---

## Verdict Summary

**B-6 is resolved, and resolved as a sweep rather than a patch — which is what the finding
required.** Verified by mechanical sweep, not by reading the fix description:

- A regex sweep of the entire sprint directory for `all \d+` / `\d+ AC` / `AC\d` returns **zero**
  aggregate AC-count literals in any of the four gated documents. The only surviving numeric AC
  references are single-AC-ID citations — `02`: US-5 AC1 (×2), US-2 AC1, US-2 AC2, US-3 AC3 (×2),
  US-4 AC3 (×2), US-5 AC2 (×2), US-6 AC1-3, US-6 AC4; `03`: US-5 AC2, US-2 AC2; `04`: US-5 AC1,
  US-2 AC2, US-3 AC3, US-4 AC2, US-4 AC3. These are stable pointers to specific criteria, not
  aggregates, and do not drift when an AC is appended.
- **The surviving ID citations were re-validated against the current `01`, not assumed still
  correct.** `02`:517 "US-6 AC1-3" still maps to the three group-membership criteria; `02`:421
  "US-6 AC4" still maps to the independent-query-logic criterion — the AC5 append did not shift
  either, since it was appended rather than renumbered. Every other cited ID resolves to the
  criterion it claims.
- `02` §11's Requirements Coverage Check now reads, for all six rows uniformly, "see
  01-REQUIREMENTS.md's US-N Acceptance Criteria for the full list" — the pointer form, applied to
  all six rows, not only the US-6 row that triggered the finding.
- `04`'s Slice 2 / 3 / 4 Goals now read "(US-2 — see 01-REQUIREMENTS.md's US-2 Acceptance
  Criteria)", "(US-3, US-4's portfolio-link half, US-5 — see 01-REQUIREMENTS.md's US-3/US-4/US-5
  Acceptance Criteria)" and "(US-1, US-4's recency-ordering half, US-6 — see 01-REQUIREMENTS.md's
  US-1/US-4/US-6 Acceptance Criteria)" respectively. `04`'s **Feeds** header carries the same
  pointer and states explicitly that it "does not restate the AC count."

The remaining numeric literals in the doc set are of a different class and were each verified
against the artifact they describe rather than left unchecked: "6 user stories" (`02`:4, `03`:4) —
US-1..US-6 present, correct; "3 screens, 6 flows" (`04`:5) — three Screen sections and six Flow
sections present in `03`, correct; "4 slices" (`04`:42) — four Slice Detail sections, correct;
"×4" department rows (`03`) — four registry entries, correct. These describe enumerations that are
themselves stable and structurally visible, and each is true today.

**No new blocking finding was introduced by the B-6 fix.** The edits are prose-only: no type, SQL
query, route, component, dependency, slice, file path, test, or Done-When item changed. The
scope-leak, schema-fidelity and INTERVIEW-fidelity axes are therefore unchanged from pass 3 and
remain clean.

**Twelve non-blocking gaps, eight risks and six open questions remain**, each re-located in the
current files this pass rather than carried forward on the prior review's authority. None is
blocking; all are recorded below for Danny's disposition.

---

## Blocking-Finding Resolution Audit (passes 1–3)

| # | Prior finding | Verified state now | Verdict |
|---|---|---|---|
| B-1 | `04` corrupted tail, true end-of-content ambiguous | File read end-to-end again: ends cleanly at the Deferred list's final bullet ("E2E test framework — … no Playwright/Cypress-equivalent is introduced."). No stray markup, no truncation. | **RESOLVED** (re-confirmed) |
| B-2 | `02` and `03` both asserted a false total AC count | Neither document contains any AC total; both headers point at `01`'s Acceptance Criteria section. Confirmed by the mechanical sweep, not by reading the headers alone. | **RESOLVED** (re-confirmed) |
| B-3 | `02` §11 falsely claimed Postgres storage order makes single-key `ORDER BY` deterministic | Claim gone; §11 states the correct opposite. Every `ORDER BY` in §5.3 re-enumerated this pass: q2/q3/q4 `…DESC, i.id ASC`; q5 `started_at DESC, id ASC`; q6 `…DESC, i.id ASC`; q7 `bv.created_at DESC, bv.id ASC`; q8 `e.created_at DESC NULLS LAST, e.id ASC`; portfolio `i.created_at ASC, i.id ASC`; `lastActiveInvestigationId` `…DESC, i.id ASC`; `recentRuns` `started_at DESC, id ASC`. None lacks a unique secondary key. | **RESOLVED** (re-confirmed by full sweep) |
| B-4 | `status='open'` zero-run Investigation fell into none of the three groups | `02` §5.3 q2 carries the `OR (i.status = 'open' AND NOT EXISTS (… generation_run gr2 …))` widening. Three-way exclusivity re-derived from the three `WHERE` clauses again this pass: q3 requires `status IN ('blocked','generation-failed')`; q4 requires `status='brief-generated'` OR a non-in-progress run to exist — neither can match q2's new disjunct. Holds. | **RESOLVED** (re-confirmed) |
| B-5 | Widened Active definition existed only in `02`; `03` and `01` were stale | `03` § Screen: Mission Control Sections table (`Active` row) states the two-part union concretely; Flow US-6 step 4 states "an Investigation with an in-progress `GenerationRun`, OR a brand-new `status='open'` Investigation with no `GenerationRun` rows at all yet"; `01` US-6 AC5 states it as a testable Given/Then with the "never omitted from all three groups" clause. All four docs agree on one membership rule. | **RESOLVED** (re-confirmed) |
| B-6 | Stale `all N AC` literals in `02` §11 (all six rows) and `04`'s Slice 2/3/4 Goals after AC5 was appended | Zero aggregate AC-count literals remain anywhere in the sprint directory (mechanical sweep). Fixed as a sweep across all six `02` §11 rows and all three `04` Goals, plus `04`'s Feeds header — not as a point patch of the one row named. Surviving single-AC-ID citations re-validated against current `01`. | **RESOLVED** |

**No blocking findings remain open.**

---

## Blocking Findings (this pass)

**None.** The package contains no defect that makes implementation impossible, no
document-to-document contradiction of behaviour, and no factually false asserted count.

---

## Requirements Completeness (01)

| Check | Result |
|---|---|
| Summary present and clear | Pass — states scope, what it replaces, and traces to INTAKE/DESIGN-PROPOSAL/INTERVIEW/NORTH-STAR |
| User stories in "As a / I want / so that" form | Pass (US-1..US-6) |
| Every user story has acceptance criteria | Pass — every AC is Given/When/Then and checks a real column, route, service or upstream section |
| Edge cases table populated | Pass — see the Edge Cases table itself for its rows (not restated here per the no-manually-asserted-counts discipline) |
| Out of scope non-empty | Pass — NOT-items plus explicit Deferred items, each traced to INTAKE §3, INTERVIEW, or DESIGN-PROPOSAL |
| Constraints concrete | Pass — every Must / Must-not / Assumes names a file, table, service, or upstream section |

### Requirements Gaps

| # | Gap | Impact |
|---|---|---|
| RQ-1 | No AC covers the persistent nav bar (Mission Control ⇄ Departments) that `03` renders in all three layout diagrams. It is the only route from `/` into `/departments`, so `03`'s Flow US-2 step 1 depends on it, yet no requirement specifies it, `02` §2 lists no component for it, and no slice builds it. Re-located and re-verified unchanged this pass in all four current files. | Medium — unrequired, unowned, load-bearing UI element |
| RQ-3 | The Edge Cases table has no row for API fetch failure, though `03` specifies a full error-state contract for it (§ Interactions, Page-Load Fetch). Re-verified unchanged. | Low — the UI spec is ahead of requirements, not behind; one Edge Case row closes it |

(RQ-2 was closed in pass 3 by US-6 AC5 and is not re-opened.)

---

## Requirements → Architecture Coverage

| Requirement | Architecture Coverage | Status |
|---|---|---|
| US-1 Mission Control | `getMissionControlView` §5.3 q1–q8, `MissionControlView`/`GenerationRunSummary` §3, `MissionControlScreen` §6, `DEPARTMENTS` §5.3 | ✅ |
| US-2 Departments directory | `getDepartmentsView` §5.2/§5.3, `DepartmentsView` §3, `DepartmentsScreen` §6 | ⚠️ substantively covered — A-1, A-3 |
| US-3 PD overview | `getProblemDepartmentOverview` §5.3 (portfolio / counts / runs / last-active queries), `ProblemDepartmentOverview` §3, `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState` | ✅ |
| US-4 Last recorded activity | `LAST_ACTIVITY_SUBQUERY` §4, single shared import §2, explicit secondary sort keys §5.3/§11 | ✅ |
| US-5 Start Investigation | `POST /api/investigations` §5.1 calling existing `submitSources` / `resolveInvestigationSources` / `transitionInvestigationStatus` with unchanged signatures | ✅ |
| US-6 Active-work grouping (incl. AC5) | §5.3 queries 2/3/4, independent query logic, widened Active covering `open`-with-zero-runs; `MissionControlView.activeWork` shape §3 | ✅ (B-6's false literal removed) — A-2 applies to q4's ordering key |
| Edge: zero Investigations | §5.1 empty-shape contract + §6 `InvestigationPortfolioEmptyState` | ✅ |
| Edge: no runs/steps/briefs | §4 `COALESCE` degradation to `i.created_at` | ✅ |
| Edge: tie on `last_activity_at` | unique secondary sort key on every `ORDER BY` §5.3; §11 states the correct rationale | ✅ |
| Edge: unset `statusReason` | optional `?` field on `InvestigationSummary`, never a placeholder | ✅ |
| Edge: empty DB, all three routes | §5.1's explicit 200-with-empty-shape contract | ✅ |
| Edge: planned Department requested directly | §6 — no route entry exists; no click target is ever rendered | ✅ |

Per-story AC counts are deliberately **not** restated above — that is the pattern B-2 and B-6 exist
to remove, and this review will not reintroduce it in its own tables.

### Architecture Gaps

| # | Gap | Impact |
|---|---|---|
| A-1 | §2's component table still describes `getDepartmentsView` as "a static department list joined with **one `investigation` existence/count check**", while §5.3's corresponding fenced block for `getDepartmentsView` is still **comment-only — no query at all** — and its own comment states the check "is not part of `DepartmentSummary`'s shape." A query is promised in §2, absent in §5.3, and has no consumer by §5.3's own text. Re-verified unchanged. | Medium — the implementer must guess: write a dead query, or drop it. Cleanest resolution is deleting the clause from §2, since the `installed` flag is a static literal per §7 and §8's pattern table |
| A-2 | §5.3 query 4 (`recentCompleted`) orders by `la.last_activity_at`, while `DESIGN-PROPOSAL.md` §2a specifies ordering by `GREATEST(generation_run.completed_at, investigation.created_at)`. The substitution is defensible and arguably better, but remains an **undeclared** deviation from a binding upstream doc — conspicuous because the package declares its other two deviations explicitly and in-line (the `GenerationRunSummary` narrowing in §3; the widened Active group in §5.3 q2, now carried into `01` and `03` as well). It is the only silent one. | Medium — silent divergence from the gated design |
| A-3 | §5.3's `DEPARTMENTS` literal still ships three thesis strings as literal empty strings `''` behind a `/* verbatim from compass §3 */` comment. The §5.3 note, §Open-Items item 1, and `04` Slice 1's Files entry all flag it — but the block as written is directly copy-pasteable and would render three blank theses, silently failing US-2 AC1. Re-verified unchanged. | Medium — a placeholder that type-checks and fails an AC at runtime, while every mocked-payload test still passes |
| A-4 | §5.3 query 8 orders `evidence_item` by `e.created_at DESC NULLS LAST`, but `evidence_item.created_at` is `TIMESTAMPTZ NOT NULL DEFAULT now()` (migration 004). `NULLS LAST` is dead code implying a nullability that does not exist. | Low — cosmetic, but exactly the unexamined-carry-over pattern this repo's discipline targets |
| A-5 | §7 places the `app.get('*')` catch-all under its **Production integration** bullet but states no guard condition, while `04` Slice 1 says "add **production-only** static catch-all." Intent reads compatibly; the enforcement mechanism is still unstated — in dev, Express serving a possibly-absent `src/web/public/index.html` would fail. Re-verified unchanged. | Low — state the guard in §7 (env check, or "mounted only when build output exists") |
| A-6 | `EvidenceSummary` (§3) carries no `createdAt` field, yet `03`'s Sections table specifies "Recent Evidence — `EvidenceSummary[]`, ordered by `createdAt` desc" and `04` Slice 4's test asserts render order. Ordering is done server-side (§5.3 q8) so the behaviour is correct, but `03` names a field the type does not expose. Re-verified unchanged in both files. | Low — reword `03` to "ordered server-side by evidence creation time"; do not add the field |
| A-7 | §5.3 q2's inline comment names its own provenance as "(B-4 fix, this document)" — a review-finding ID embedded in an architecture doc. Accurate and traceable, but references an artifact (this review series) the implementer has no reason to hold. Re-verified unchanged. | Very low — reword to describe the rule, not its review history |

### Schema Fidelity (carried from pass 3, axis unchanged)

The B-6 fix edited prose only — no SQL, no type, no identifier. Pass 3's independent verification
against `src/db/migrations/001,004,006,007` therefore still governs and is restated as **verified**,
not re-asserted: every column, table and enum cited in `02` §4/§5.3 resolves to a real migration
definition; `investigation.updated_at`, `investigation.department_id` and
`generation_component_event` are each confirmed **absent**, matching the docs' claims;
`brief_version`'s join through `problem_brief` and `evidence_item`'s join through `source_artifact`
are both necessary, since neither table carries `investigation_id`. **No fabricated column or table
name exists in the doc set.**

---

## Requirements → UI Coverage

| User Story | Screen / Flow | Status |
|---|---|---|
| US-1 | Mission Control (`/`) — Flow US-1, five-section layout, Sections table | ✅ |
| US-2 | Departments directory (`/departments`) — Flow US-2, no-click-target rule stated literally | ✅ |
| US-3 | PD overview — Flow US-3, layout sections 1–5, empty state | ✅ |
| US-4 | Flow US-4 (link target only) + Recent Investigations ordering + § Screen D Link Target | ⚠️ (U-1) |
| US-5 | Flow US-5 + § Start Investigation Submission interaction | ✅ |
| US-6 | Flow US-6 + three sibling sections with per-group empty states; Sections table and step 4 state the widened Active membership | ✅ |
| Loading / error / success states | § Interactions, Page-Load Fetch — all three specified and required to be mutually distinguishable | ✅ |

### UI Gaps

| # | Gap | Impact |
|---|---|---|
| U-1 | Screen D link target: `03` renders a real, correct link to `/departments/problem-department/investigations/:id` that no route resolves. The honesty is right (no fake "coming soon" interstitial), but the *user-visible* result is still unspecified: React Router with no matching route renders nothing, so clicking appears as a silent no-op or blank screen — the same "blank screen" outcome INTERVIEW #5 forbids elsewhere. Re-verified unchanged. | Medium — one sentence specifying the observed behaviour (e.g. a catch-all client route rendering "Not built yet — Checkpoint 2/3") is both honest and non-blank |
| U-2 | `03`'s Component Hierarchy introduces `InstalledDepartmentsStrip`, `DepartmentTile`, `ActiveWorkSection`, `ActiveActivityPanel`, `RecentSection`, `PlannedDepartmentsNote`, `DepartmentRow`, `DepartmentEntryLink`, `DepartmentHeader`, `SourcesEvidenceCounts`, `RunsActivityPanel`, `StatusFilterControl` — none in `02` §2's component table. `03`'s own Output Verification discloses this and argues they are presentational subdivisions. Argument accepted; flagged only because the two trees are not literally identical. | Low — self-disclosed, non-contradictory |
| U-3 | Persistent nav appears in all three layout diagrams ("Persistent nav (Mission Control \| Departments)") and is named in § Client-Side Route Navigation's trigger, but has no entry in any Sections table, no data source, no architecture component, no node in the Component Hierarchy, and no slice. Re-verified unchanged. See RQ-1. | Medium — undefined but load-bearing |

**Architecture ⇄ UI consistency:** `ProblemDepartmentScreenState`, `InvestigationPortfolioTableProps`
and `StartInvestigationFormProps` match verbatim between `02` §6 and `03`. **No substantive
contradiction between `02` and `03` was found this pass.**

---

## Architecture / UI → Roadmap Coverage

| Component | Slice | Status |
|---|---|---|
| `src/types/readModels.ts` | 1 | ✅ |
| `src/config/departments.ts` (`DEPARTMENTS`) | 1 | ✅ (A-3 applies to the source literal in `02`, not to the slice) |
| `src/services/lastActivity.ts` (`LAST_ACTIVITY_SUBQUERY`) | 1 | ✅ |
| `getMissionControlView` / `getDepartmentsView` / `getProblemDepartmentOverview` | 1 | ✅ |
| `src/web/apiRoutes.ts` (3 GET + POST) | 1 | ✅ |
| `server.ts` — `express.json()`, router mount, static catch-all | 1 | ⚠️ (A-5 guard condition) |
| Vite scaffold (`main.tsx`, `App.tsx`, `api.ts`, `vite.config.ts`), deps, scripts | 1 | ✅ |
| `DepartmentsScreen` (+ `DepartmentRow`, `DepartmentEntryLink`) | 2 | ✅ |
| `ProblemDepartmentScreen`, `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState`, `StartInvestigationForm` | 3 | ✅ |
| `SourcesEvidenceCounts`, `RunsActivityPanel` | 3 | ⚠️ RM-1 — in the Dependency Map and `03`'s hierarchy, absent from Slice 3's **Files** list |
| `MissionControlScreen` (+ strip, groups, activity panel, recent lists, planned note) | 4 | ✅ (Goal's stale count literal removed by the B-6 fix) |
| Persistent nav | — | ❌ in no slice (U-3 / RQ-1) |

No circular dependencies — re-verified against the Dependency Map and each slice's Depends-On
(1 → 2 → 3 → 4, strictly forward). Every slice has concrete file paths, a Tests block and a
Done-When checklist. No slice builds anything not required, and no required component is orphaned
except the persistent nav.

### Roadmap Gaps

| # | Gap | Impact |
|---|---|---|
| RM-1 | `SourcesEvidenceCounts` and `RunsActivityPanel` appear in the Dependency Map's Slice-3 row and in `03`'s Component Hierarchy, but Slice 3's **Files** list omits them. Slice 3's Done-When does require real counts and runs to render, so the work is implied — but the Files list is the roadmap's own concreteness contract and it is incomplete. Re-verified unchanged. | Low — one line, or an explicit note that they are inline subdivisions of `ProblemDepartmentScreen.tsx` (as Slice 2 does for `DepartmentRow`/`DepartmentEntryLink`) |
| RM-2 | **Still open.** No test anywhere asserts the widened-Active membership behaviour. Both candidate homes re-checked this pass: Slice 1's Tests block lists per-service integration tests, the `LAST_ACTIVITY_SUBQUERY` degradation test, POST route tests and GET shape tests — none names group membership; Slice 4's Tests block asserts the three groups render "from independent mocked arrays," which exercises rendering, not the SQL that decides membership. `01` US-6 AC5 now states the behaviour testably, which makes the absence more conspicuous. | Medium — a fix with no test can silently regress; add the assertion to Slice 1's `getMissionControlView` integration test (real row, `status='open'`, zero runs, asserted present in `activeWork.active` and absent from the other two groups) |

### Browser-Visibility Sequencing ("no long invisible tunnels", NORTH-STAR traceability)

| Slice | Browser-visible at completion? |
|---|---|
| 1 | Partially — SPA shell boots, all three routes resolve without 404, screens are placeholder stubs; the real value is curl-able JSON. Self-disclosed as "an unavoidable first foundation slice." **Accept** — it ends with a loadable browser page plus four live endpoints, not a dark month |
| 2 | Yes — `/departments` renders four real Departments, click navigates |
| 3 | Yes — full portfolio against the real DB, working submission |
| 4 | Yes — `/` fully populated, plus an end-to-end manual walkthrough in Done-When |

Sequencing verdict: **sound**. Slice 3's declared dependency on Slice 2 is flow-level only and is
correctly disclosed as carrying no code dependency.

---

## Scope-Leak Audit (against `INTAKE.md` §3 "Explicitly OUT of scope")

| Out-of-scope item | Found in 01/02/03/04? | Result |
|---|---|---|
| `POST /api/investigations/:id/generation-runs`, browser-triggered generation | Named only in Out-of-Scope / Anti-Pattern / Deferred lists | ✅ clean |
| `generation_component_event`, `component_execution_id`, `recordComponentEvent`, live per-component activity | Named only as exclusions; `GenerationRunSummary` explicitly omits `currentComponent`; the anti-pattern list forbids reusing `ActivityFeedEntry` | ✅ clean |
| Investigation Workspace (Screen D), `BriefForReview`, `deriveWorkflowStage`/`WorkflowStage`, §5a | Not designed; only a link *target string* is rendered (US-4 AC2 permits this explicitly) | ✅ clean (see U-1 for the UX consequence) |
| `/evidence`, `/runs`, `/knowledge` Core routes | Excluded in all four docs | ✅ clean |
| Any Slices 1-9 schema/service/logic change | §10 states zero changes; no migration file in any slice; `POST /api/investigations` calls existing exports unchanged | ✅ clean |
| Retirement of `src/web/views.ts` | Explicitly untouched; registration-order conflict addressed in §7/§10 | ✅ clean |
| New auth/CORS posture | §5.1 adds only `express.json()`; INTERVIEW #4 upheld | ✅ clean |
| New runtime/env config | None added; Vite's 5173 correctly classified as a tool default, not a Department OS convention needing an owner | ✅ clean |
| E2E framework | RTL only, restated in §9 and in every slice's Tests block and `04` Deferred | ✅ clean |

**No Checkpoint 2/3 scope leaked into any of the four documents.** Re-checked after the B-6 fix: the
edits replaced count literals with pointers and added no table, route, type, component, dependency,
file or test to any document.

## INTERVIEW.md ASSUMED-Decision Fidelity

| # | ASSUMED decision | Reflected in | Result |
|---|---|---|---|
| 1 | Vite | 02 §7, §9 deps, 04 Slice 1 files/scripts | ✅ consistent, never contradicted |
| 2 | Source in `src/client/`, `src/web/public/` = build OUTPUT only | 02 §7 (`build.outDir: ../web/public`), 04 Slice 1 note "no hand-authored file added there" | ✅ consistent |
| 3 | Integration tests for read models; RTL render/interaction only for React; no e2e | 02 §9 deps, 04 every slice's Tests block, 04 Deferred | ✅ consistent (see RM-2 for a coverage hole *within* this discipline, not a violation of it) |
| 4 | No new auth/CORS/error-posture change | 01 Out-of-Scope + Constraint, 02 §5.1 | ✅ consistent |
| 5 | Explicit empty state, exact copy, never blank/loading-styled | 01 Edge Case, 02 §6, 03 § Empty State + Page-Load Fetch, 04 Slice 3 test + Done-When | ✅ consistent — the copy string "No investigations yet — Start Investigation" is byte-identical in all four |

No ASSUMED decision was silently overridden or contradicted downstream.

---

## Identified Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | **Down-rated this pass.** The count-drift pattern that produced B-2 and B-6 has now been swept out of the doc set — no aggregate count literal remains. Residual risk is only that a future editor reintroduces one | L (was H) | M | Keep the pointer form; if a mechanical doc-set check is ever added, assert "no `all \d+ AC` literal in `02`/`04`" as an invariant rather than trusting a prose sweep claim |
| R-2 | Empty thesis strings (A-3) ship to the browser, silently failing US-2 AC1 while every automated test — all of which mock the payload — passes | M | H | Put the real strings in `02` §5.3, or make the constant fail loudly instead of resolving to `''`; add a Slice 2 test asserting a non-empty thesis for all four Departments |
| R-3 | The widened Active group is specified in three documents but asserted by no test (RM-2), and quietly regresses when someone later "simplifies" query 2 back toward `DESIGN-PROPOSAL.md` §2a's original definition | M | M | Add an explicit assertion in Slice 1's `getMissionControlView` integration test and Slice 4's render test |
| R-4 | `LAST_ACTIVITY_SUBQUERY` fans out `generation_run × generation_step` before aggregation — correct for `MAX`, but it is a full-table subquery joined by three call sites with no index and no `LIMIT` anywhere (§3 correctly refuses an unsourced page cap) | M | L now, H later | Accepted for local-dev scale; record explicitly that the first non-trivial dataset re-opens both the index and the page-size question, with a named owner |
| R-5 | Dead Screen D link (U-1) reads as a bug to any reviewer who did not read the scope boundary — including Danny on post-hoc review | H | L | Specify the not-built destination rendering; one honest catch-all client route |
| R-6 | `POST /api/investigations` duplicates the three-call sequence from `server.ts:32-106` rather than extracting it — two copies of a business sequence that must stay in step | M | M | Accepted this checkpoint (extraction would touch Slices 1-9 code, which is forbidden). Record as known debt with a Checkpoint-2 owner |
| R-7 | `getProblemDepartmentOverview`'s counts are unscoped `COUNT(*)` — correct only while exactly one Department exists. Correctly justified and disclosed, but it is a promoted default waiting to be inherited | L this checkpoint | H later | Already documented in §5.3; add a code comment binding it to the single-Department assumption so Checkpoint 2 cannot inherit it silently |
| R-8 | The undeclared `recentCompleted` ordering deviation (A-2) becomes precedent: "the architecture may silently re-key an upstream-specified ordering." It is now the *only* undeclared deviation in the package | M | M | Declare it in `02` §5.3 the same way the `GenerationRunSummary` narrowing and the widened Active group are — or revert to §2a's key |

---

## Assumptions

| Assumption | Where it lives | Impact if Wrong |
|---|---|---|
| Every `investigation` row belongs to Problem Department (justifies unscoped `COUNT(*)`) | 02 §5.3, INTAKE §3 | Sources/Evidence counts silently wrong the moment a second Department writes Investigations |
| Department `installed`/`planned` is a static proposal-time literal, not a domain fact | 01 Constraints, 02 §8, DESIGN §7 | Mission Control shows a stale `installed` badge for a Department whose service was removed |
| A `status='open'` Investigation with zero runs is best classified as "Active", not as a fourth group or as Needs Attention | 02 §5.3 q2, 01 US-6 AC5, 03 Sections table + Flow US-6 step 4 | Mission Control's Active list conflates "new and untouched" with "generating right now" — the exact confusion US-6 exists to prevent. The judgment is now visible in the requirements rather than buried in SQL, which is the right place for Danny to see it, but it still has no upstream source (Q-7) |
| Local-dev Investigation volume is small enough that unpaginated full-result reads are fine | 02 §3 PROVISIONAL note | Mission Control payload grows unbounded; no cap can be added without a named owner (correctly refused rather than fabricated) |
| Express registration order alone prevents the SPA catch-all from shadowing `/investigations/*` and `/api/*` | 02 §7, §10 | Legacy server-rendered screens break — the one integration this checkpoint promised not to disturb |
| Vitest's existing `jsdom` devDependency suffices for RTL with no new runner config | 02 §9 | Slice 1's client render test blocks on unplanned test-infra work |
| The `GREATEST`/`COALESCE` subquery is performant enough unindexed at current scale | 02 §10 | All three read models slow together (single shared fragment) |

---

## Open Questions

| # | Question | Status | Needs |
|---|---|---|---|
| Q-1 | Should the last-active-Investigation link render at all this checkpoint, given no destination exists — or render as non-interactive text until Screen D lands? | Open | Danny — the one place the package knowingly ships a dead end (U-1, R-5) |
| Q-2 | Does Mission Control need a "recent N" cap? Any number requires a named owner and citation | Open — deliberately deferred | Danny; correctly refused so far by 02 §3 and 04 Deferred |
| Q-3 | Where does the persistent nav belong — is it a requirement, and which slice builds it? | Open | A spec fix (RQ-1 / U-3) rather than a Danny call, but it must be assigned |
| Q-4 | `Department` config's long-term home (static array vs. persisted table) | Open — deliberately deferred | Danny, at Checkpoint 2/3; Slice 1's static registry is explicitly not a resolution |
| Q-5 | Should the `recentCompleted` ordering deviation from DESIGN §2a (A-2) be declared as a narrowing, or reverted to the upstream ordering key? | Open | Ledger's judgment under INTAKE §6 — but it must be recorded either way |
| Q-6 | Retirement of `src/web/views.ts`'s server-rendered screens | Open — out of scope, unchanged | Danny, post-checkpoint |
| Q-7 | Is "Active" the right home for a brand-new `open`, zero-run Investigation — or should there be a fourth group ("New / Not started")? Now stated in `01` as AC5 and in `03` as rendered semantics, so it is visible rather than inferred — but it remains a product-semantics call made under delegated authority with no upstream source, widening a group whose stated purpose is to isolate "actively generating right now" | Open — surfaced in the requirements, where Danny will see it | Danny — a yes/no, not a blocker |

---

## Approval Checklist

### Requirements (01)
- [x] **B-5 (requirements half) resolved** — US-6 AC5 appended, not renumbered (re-verified: downstream single-AC-ID citations still resolve correctly)
- [x] RQ-2 closed by that AC
- [ ] Reviewed by human
- [ ] Acceptance criteria are testable — reviewer note: every AC is Given/When/Then and checks a real column, route or upstream section
- [ ] Out of scope is acceptable
- [ ] RQ-1, RQ-3 dispositioned (persistent nav; fetch-failure edge case)

### Architecture (02)
- [x] **B-2 resolved** (AC total → pointer), **B-3 resolved** (unique secondary sort key on every `ORDER BY`, re-swept), **B-4 resolved** (Active query covers `open` with zero runs; exclusivity re-derived), **B-6 resolved** (all six §11 rows now use the pointer form; zero aggregate count literals remain, confirmed by mechanical sweep)
- [ ] Reviewed by human
- [ ] Patterns are appropriate — reviewer note: matches the existing `getInvestigation.ts` direct-`pg` pattern; no new data-access abstraction
- [ ] Schemas are correct — reviewer note: independently verified against migrations 001/004/006/007; no fabricated identifier found
- [ ] A-1 dispositioned (`getDepartmentsView`'s phantom existence/count check)
- [ ] A-2 dispositioned (declare or revert the `recentCompleted` ordering deviation)
- [ ] A-3 dispositioned (empty thesis placeholders)
- [ ] A-4, A-5, A-7 dispositioned (dead `NULLS LAST`; catch-all guard condition; review-ID in an inline comment)

### UI Spec (03)
- [x] **B-2 resolved** — AC count replaced with a pointer
- [x] **B-5 resolved** — Sections-table `Active` row and Flow US-6 step 4 both state the widened two-part membership concretely, matching `02` §5.3 q2 and `01` US-6 AC5
- [ ] Reviewed by human
- [ ] Flows are complete — reviewer note: one flow per user story, all six covered; loading/error/success all specified and required to be visually distinct
- [ ] Layouts are appropriate
- [ ] U-1 dispositioned (Screen D dead-link rendering)
- [ ] U-3 dispositioned (persistent nav specified and owned)
- [ ] A-6 dispositioned (`EvidenceSummary` has no `createdAt` — reword the ordering note)

### Roadmap (04)
- [x] **B-1 resolved** — file ends cleanly, content coherent on full read-through
- [x] **B-4 resolved** — Slice 4's Done-When active-work claim is achievable
- [x] **B-6 resolved** — Feeds header and Slice 2/3/4 Goals all use the pointer form; no aggregate count literal remains
- [ ] Reviewed by human
- [ ] Sequence is correct — reviewer note: verified; each slice after 1 is browser-visible, Slice 1's stub-screen tunnel is short and self-disclosed
- [ ] Slices are appropriately sized
- [ ] RM-1 dispositioned (`SourcesEvidenceCounts` / `RunsActivityPanel` in Slice 3's Files list)
- [ ] RM-2 dispositioned (test coverage for the widened Active group)

### Overall
- [x] **No blocking findings remain** — B-1 through B-6 all resolved and re-verified against the current files
- [ ] Non-blocking gaps dispositioned (fixed or explicitly accepted): A-1…A-7, U-1…U-3, RQ-1, RQ-3, RM-1, RM-2 — enumerated in the sections above, not counted here
- [ ] Open questions Q-1, Q-3, Q-5, Q-7 resolved (Q-2, Q-4, Q-6 may remain open — declared deferrals, not gaps)
- [ ] All risks have mitigations — reviewer note: each risk above carries one
- [ ] Ready for implementation — pending Frank's binding spec-gate and Danny's approval

---

## Reviewer's Note on Method

Per the independence-of-evidence discipline: all four documents were re-read in full this pass, not
diffed against the prior review. The B-6 fix was verified by a **mechanical regex sweep of the whole
sprint directory** rather than by checking only the locations the fix report named — that is the
point of the finding, since a point-patch would have left the pattern alive elsewhere. The sweep is
what allowed a positive claim ("zero aggregate AC-count literals remain") rather than the weaker
"the named locations were fixed."

Two hazards specific to this fix were checked deliberately rather than assumed away:

1. **Over-correction** — a sweep that replaced single-AC-ID citations (`US-6 AC4`) along with
   aggregates would have destroyed precise, useful traceability. It did not: every surviving ID
   citation was enumerated and re-resolved against the current `01`.
2. **Under-correction elsewhere** — non-AC count literals ("6 user stories", "3 screens, 6 flows",
   "4 slices", "×4 department rows") were each verified against the artifact they describe, rather
   than assumed out of scope for the sweep. All are currently true; they describe structurally
   visible enumerations rather than drifting per-story detail.

Every carried-forward gap (A-1 through A-7, U-1, U-2, U-3, RQ-1, RQ-3, RM-1, RM-2) was re-located in
the current file before being restated; none was carried on the prior review's authority. RM-2 was
re-checked against both candidate test homes (Slice 1 and Slice 4 Tests blocks) rather than assumed
still-missing.

Where this review says "verified," a primary source was opened; where it says "accepted," a stated
rationale was judged sound without independent proof. Those labels are used deliberately and are not
interchangeable.

Shared-well caveat, restated because it has not changed: the four spec documents share one upstream
source (`DESIGN-PROPOSAL.md`). This review constrains the four docs against that source and against
the live schema; it does **not** independently re-validate `DESIGN-PROPOSAL.md` itself, which passed
its own gate at `cfb793c`. Any error inside the design proposal would be inherited by all four docs
and by this review. It is named here rather than assumed away.

One further caveat on this review's own claims: the "zero literals remain" claim rests on a regex
sweep for `all \d+`, `\d+ AC`, `AC\d` and `criteria`. A count expressed in words ("all five
criteria") would evade that pattern. I read all four documents in full and saw none, but the
mechanical guarantee covers only the numeric forms.
