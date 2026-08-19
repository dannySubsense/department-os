# Spec Review: Product Surface — Checkpoint 1

**Status**: COMPLETE — **0 blocking findings. The package is free of all blocking findings and is
ready for Frank's attempt 3/3 spec-gate.**
**Reviewer**: spec-reviewer (independent)
**Date**: 2026-08-19
**Pass**: 8th — full re-review after the C-5/A-12/A-13/U-3 fix round, and after the mechanical
count-literal check demanded by Frank's F-7 was built. This document **replaces the 7th-pass review
entirely**; it is a complete re-assessment as of right now, not a diff. The 7th-pass review's
Status/checklist/Readiness Statement are superseded and must not be read as current.
**Docs reviewed**: `01-REQUIREMENTS.md`, `02-ARCHITECTURE.md`, `03-UI-SPEC.md`, `04-ROADMAP.md`
**Context read**: `INTAKE.md`, `INTERVIEW.md`, `NORTH-STAR.md`, `GATE-LOG.md` (both verdicts),
`docs/specs/product-surface/DESIGN-PROPOSAL.md`, `scripts/check-spec-count-literals.sh`
**Primary sources opened this pass**: all four spec docs; `02` §1/§2/§3/§4/§5.3/§6/§11/Open Items
and `03`/`04` heading structures re-derived line-by-line rather than carried from the prior review.

---

## Staleness Declaration (Frank's F-6, addressed directly)

F-6 failed attempt 2 because the filed `05-REVIEW.md` asserted a package state that the files no
longer had — the C-5 fix landed after that review's timestamp, so a gated artifact carried a false
status claim. **This document was written after re-opening every line it makes a claim about.**
Every "RESOLVED" below was verified by reading the current file content quoted alongside it, not by
trusting a fix description or the prior review. Every "still open" below was verified the same way.
If this document is read at a time when the four spec docs have changed again, its Status line is
void — re-run the check and re-review; do not carry this verdict forward across an edit.

---

## Mechanical Count-Literal Check (Frank's F-7, the core of this pass)

**The check exists and was run.** `scripts/check-spec-count-literals.sh` was read in full to
establish its exact search, and that search was then executed over
`docs/specs/product-surface-checkpoint-1/0[1-4]-*.md`.

**Reproducibility note, stated because it matters:** this reviewer role has no shell. The script's
regex — `[0-9]+ (independent )?(user stor(y|ies)|AC|acceptance criteri[ao]n?|screens?|flows?|
routes?|quer(y|ies)|slices?|sections?|components?)` — was executed verbatim via ripgrep over the
identical file set. The search is byte-identical to the script's; only the runner differs. Anyone
with a shell can re-run `bash scripts/check-spec-count-literals.sh
docs/specs/product-surface-checkpoint-1` and get the same hit set.

**Hit count reconciliation:** the task brief cited 44. **The check returns 36 hits** across the four
live documents (`01`: 2, `02`: 16, `03`: 2, `04`: 16). 44 is the *line count* of the script's
document sections — 36 hit lines + 4 `## <file>` headers + 4 separator blanks. The discrepancy is
formatting, not coverage: all 36 substantive hits are classified below, none omitted.

### All 36 hits, classified

| # | Site | Matched text | Full context | Verdict |
|---|---|---|---|---|
| 1 | `01`:60 | `1 screens` | "…visible on all three Checkpoint-**1** screens" | ✅ **regex false positive** — the digit belongs to "Checkpoint-1", not to a count. The real count word is "three", enumerated inline at :60-61 |
| 2 | `01`:150 | `1 screens` | "Given any of the three Checkpoint-**1** screens (`/`, `/departments`, …)" | ✅ **regex false positive**, same construct; the three routes are named inline |
| 3 | `02`:38 | `2 AC` | "US-**2** AC1: name/thesis/status only" | ✅ specific citation — `01` US-2 AC1 exists and says exactly that |
| 4 | `02`:41 | `4 AC` | "(US-**4** AC3 / Constraint)" | ✅ specific citation — `01` US-4 AC3 exists |
| 5 | `02`:173 | `4 AC` | "(US-**4** AC3, Constraint …)" | ✅ specific citation |
| 6 | `02`:237 | `5 AC` | "US-**5** AC1: 'no change to submitSources's signature…'" | ✅ specific citation, quoted verbatim from `01` |
| 7 | `02`:303 | `2 AC` | "(US-**2** AC1: name/thesis/status only)" | ✅ specific citation |
| 8 | `02`:333 | `2 AC` | "…would silently fail US-**2** AC1" | ✅ specific citation |
| 9 | `02`:440 | `6 AC` | "US-**6** AC4), not independence of transport" | ✅ specific citation |
| 10 | `02`:454 | `3 AC` | "…per US-**3** AC3" | ✅ specific citation |
| 11 | `02`:466 | `3 AC` | "(US-**3** AC)" | ✅ specific citation (story-level, no AC number claimed) |
| 12 | `02`:496 | `5 AC` | "(US-**5** AC2 — 'next load/refresh')" | ✅ specific citation |
| 13 | `02`:500 | `2 AC` | "(US-**2** AC2)" | ✅ specific citation |
| 14 | `02`:523 | `3 AC` | "client-side only, US-**3** AC3" | ✅ specific citation |
| 15 | `02`:535 | `5 AC` | "triggers parent's re-fetch (US-**5** AC2)" | ✅ specific citation |
| 16 | `02`:540 | `6 AC` | "(US-**6** AC1-3)" | ✅ specific citation, range over `01`'s own AC ids |
| 17 | `02`:607 | `3 screens` | "All **3** screens" / "unjustified generality for 3 read-only page loads" | ✅ **self-describing and accurate** — `02`'s own fetch-pattern rationale. Re-derived: §6's table has four rows, of which exactly three fetch; `InvestigationWorkspacePlaceholder` is specified "no fetch" at §2:48. "3" is the correct number for the claim being made |
| 18 | `02`:660 | `5 AC` | "(US-**5** AC1, Constraint …)" | ✅ specific citation |
| 19 | `03`:111 | `5 AC` | "(US-**5** AC2 — 'appears in the portfolio on next load/refresh')" | ✅ specific citation, quoted verbatim |
| 20 | `03`:238 | `2 AC` | "(US-**2** AC2, DESIGN-PROPOSAL.md §3)" | ✅ specific citation |
| 21 | `04`:5 | `3 screens` | "`03-UI-SPEC.md` (**3** screens + 1 catch-all fallback; see 03-UI-SPEC.md's User Flows section for the full flow list…)" | ✅ **aggregate, and re-derived accurate**: `03`'s `## Screen:` headings are Mission Control (:150), Departments Directory (:205), Problem Department Overview (:242) = three, plus Investigation Workspace Placeholder (:301) = the one catch-all fallback. The volatile half (flow count) is a pointer, not a literal |
| 22 | `04`:46 | `4 slices` | "**4** slices cover every component in `02` §2's table…" | ✅ **self-describing and accurate** — `04`'s `### Slice N` headings: Slice 1 (:62), 2 (:166), 3 (:207), 4 (:277) = four |
| 23 | `04`:55 | `7 AC` | "(US-**7** AC3)" | ✅ specific citation |
| 24 | `04`:80 | `3 queries` | "(§**5.3** queries 1-8; §2)" | ✅ **specific citation, re-derived accurate** — `02` §5.3 contains numbered blocks `-- 1.` (:341) through `-- 8.` (:430); exactly eight, no gap |
| 25 | `04`:89 | `3 routes` | "React Router with the **3** routes plus the catch-all" | ✅ aggregate, re-derived against `02` §6's four-row table (:494-497): three screen routes + one catch-all |
| 26 | `04`:106 | `5 AC` | "(§5.1, US-**5** AC1)" | ✅ specific citation |
| 27 | `04`:113 | `7 AC` | "(§2, US-**7** AC1)" | ✅ specific citation |
| 28 | `04`:129 | `6 AC` | "(US-**6** AC5)" | ✅ specific citation |
| 29 | `04`:138 | `3 routes` | "each of the **3** routes plus the [catch-all]" | ✅ aggregate, same source as #25, re-derived |
| 30 | `04`:143 | `7 AC` | "(US-**7** AC2, AC4)" | ✅ specific citation |
| 31 | `04`:146 | `7 AC` | "(US-**7** AC1, AC3)" | ✅ specific citation |
| 32 | `04`:183 | `2 AC` | "(US-**2** AC2, UI Spec's literal reading)" | ✅ specific citation |
| 33 | `04`:229 | `3 AC` | "(§6, US-**3** AC3)" | ✅ specific citation |
| 34 | `04`:244 | `4 AC` | "(US-**4** AC2, UI Spec § Screen D Link Target)" | ✅ specific citation |
| 35 | `04`:306 | `4 AC` | "(US-**4** AC3)" | ✅ specific citation |
| 36 | `04`:362 | `7 AC` | "(US-**7** AC2, AC4)" | ✅ specific citation |

**Result: 36 hits classified — 36 safe, 0 defects.** Breakdown: 30 specific `US-N ACm` / `§5.3
queries 1-8` citations (all confirmed to name real ids in `01` / real blocks in `02`), 2 regex false
positives on "Checkpoint-1", 4 aggregates (`04`:5, `04`:46, `04`:89, `04`:138) **each re-derived
from its cited source's current structure this pass, not carried from the prior review**.
`02`:37 — the C-5 site — no longer matches the check at all, because the literal was deleted.

### Known coverage limit of the check — stated, not glossed

The script's regex requires an ASCII **digit** immediately preceding the noun. It therefore does
**not** see spelled-out counts ("three GET routes", "four new Express JSON routes", "seven flows"),
which are the more common form in `02`. I closed that gap by hand this pass, re-deriving the
spelled-out aggregates directly: `02`:19-21's scope sentence ("four new Express JSON routes (three
GET, one POST), three new read-model query functions, … three screens … plus one catch-all") was
checked against §5.1, §2:42 and §6 — **all four route counts now agree** (this is A-12, now closed).
`02`:43's "three screen routes … plus one catch-all" and `02`:51's "three GET routes + the POST
route" likewise agree with §6 and §5.1. **Recommendation R-1a (process, non-blocking): extend the
script's regex with the spelled-out number words** (`one|two|…|twelve`) before the next sprint uses
it. The check as it stands is a genuine mechanical backstop, but it is a partial one, and saying so
is the point — a check whose limits are undeclared is the shared well again.

---

## Fix Verification — This Round's Four Items

Each verified by opening the current file. No fix description was trusted.

| # | Claimed fix | Verified state now | Verdict |
|---|---|---|---|
| **C-5** | `02`:37's "via 5 independent queries (§4)" | `02`:37 now reads "…via **the following independent queries (§5.3)**". Both defects gone: the count is deleted (not replaced with "8"), and the pointer now correctly targets §5.3, where the eight query blocks live. Wording matches §5.3's own phrasing, so the two sites move together | **RESOLVED — the blocking finding is closed** |
| **A-12** | §1's scope sentence undercounted routes | `02`:19 now reads "In scope: **four new Express JSON routes (three GET, one POST)**…". Re-derived against §2:42 (four routes named), §5.1 and `04`:12 ("three GET routes, one POST wrapper") — all agree | **RESOLVED** |
| **A-13** | `04`:3's "US-1–US-7" range literal | `04`:3-4 now reads "see its User Stories section for the full list; this document **references that section by pointer and does not restate the story range or AC count**". The range literal is gone; `03` and `04` now treat the construct identically | **RESOLVED**, and in the durable shape |
| **U-3** | `03`:39's "all five `MissionControlView` sections" | `03`:39 now reads "**every `MissionControlView` section** renders with real data or an honest empty array", then enumerates them descriptively. No count attached to another document's type | **RESOLVED** |

**Four of four genuinely resolved. No regression introduced by any of them** — each edit was
re-read in its surrounding context, and the count-literal check above independently confirms no new
literal was created.

---

## Requirements Completeness (01)

| Check | Result |
|---|---|
| Summary present and clear | Pass |
| User stories in "As a / I want / so that" form | Pass — US-1…US-7, all three clauses each |
| Every user story has acceptance criteria | Pass — every story has a Given/Then block |
| Edge cases table populated | Pass |
| Out of scope non-empty | Pass |
| Constraints concrete | Pass |

`01` was unchanged this round. It remains clean of the count-drift class: its only two check hits
are regex false positives on "Checkpoint-1", and every real numeric claim in it enumerates its
members inline.

### Requirements Gaps

| # | Gap | Impact |
|---|---|---|
| RQ-1, RQ-4 | **CLOSED** in earlier rounds | — |
| RQ-3 | **Still open, non-blocking.** `01`'s Edge Cases table has no row for API fetch failure, though `03` § Page-Load Fetch specifies a full error-state contract. The UI spec is ahead of requirements, not behind — nothing gets built wrong | Low — one Edge Case row closes it |

---

## Requirements → Architecture Coverage

| Requirement | Architecture coverage | Status |
|---|---|---|
| US-1 Mission Control | `getMissionControlView` §5.3 q1–q8, `MissionControlView`/`GenerationRunSummary` §3, `MissionControlScreen` §6, `departmentRegistry` §2 | ✅ |
| US-2 Departments directory | `getDepartmentsView` §5.2/§5.3 (query-free, self-consistent), `DepartmentsView` §3, `DepartmentsScreen` §6, verbatim thesis literals | ✅ |
| US-3 PD overview | `getProblemDepartmentOverview` §5.3, `ProblemDepartmentOverview` §3, `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState`, source/evidence `COUNT` queries | ✅ |
| US-4 Last recorded activity | `LAST_ACTIVITY_SUBQUERY` §4, single shared import §2:41, explicit secondary sort keys throughout §5.3 | ✅ |
| US-5 Start Investigation | `POST /api/investigations` §5.1 calling existing `submitSources`/`resolveInvestigationSources`/`transitionInvestigationStatus`, signatures unchanged; now correctly counted in §1's binding scope sentence | ✅ |
| US-6 Active-work grouping (incl. AC5) | §5.3 q2/q3/q4, independent query logic, widened Active with declared ordering deviation on q4 | ✅ |
| US-7 Persistent nav | `PersistentNav` §2:44 (path, mount point, exact two-link set, `NavLink` active state, presentational-only) + §11 coverage row | ✅ |
| Screen D fallback | `InvestigationWorkspacePlaceholder` §2:48 + §6:497 route row + §1:20-21 scope line | ✅ |
| Edge: zero Investigations | §5.1 empty-shape contract + §6 `InvestigationPortfolioEmptyState` | ✅ |
| Edge: no runs/steps/briefs | §4 `COALESCE` degradation to `i.created_at` | ✅ |
| Edge: tie on `last_activity_at` | unique secondary sort key on every `ORDER BY` in §5.3 | ✅ |
| Edge: unset `statusReason` | optional `?` field, never a placeholder | ✅ |
| Edge: empty DB, all three routes | §5.1's 200-with-empty-shape contract | ✅ |
| Edge: planned Department requested directly | §6 — no route entry, no click target ever rendered | ✅ |

**Every requirement has architecture coverage.** §11's self-certification is complete and
count-free.

### Architecture Gaps

| # | Gap | Impact |
|---|---|---|
| A-1, A-3, A-5(`/api/`), A-7, A-8, A-9, A-10, A-11, A-12, **C-5** | **CLOSED**; C-5 and A-12 re-verified against the current file this pass | — |
| A-2a | **Still open, non-blocking.** `02`:385 reads "the shared `LAST_ACTIVITY_SUBQUERY` **this document's own §4a**…". `02` has no §4a — its section headings run §1…§11 (re-derived this pass); the shared subquery is **§4** (:164). `§4a` is `DESIGN-PROPOSAL.md`'s number. Intent unambiguous; the self-reference is wrong. **Not fixed by me — I am the reviewer and have no authoring role on `02`**; it needs one character removed by whoever next touches the file | Very low — cosmetic, does not change behaviour |
| A-2a(ii) | **New this pass, very low, same family.** `02`:41 says "Shared SQL fragment implementing **§4a's** `GREATEST` computation … see §4 below". Here `§4a` most naturally reads as `DESIGN-PROPOSAL.md` §4a (declared among traced sources at `02`:6, and :166 uses it that way explicitly), so it is defensible as written — but sitting one clause away from an unqualified "§4 below" it is ambiguous. Recommend qualifying it to "`DESIGN-PROPOSAL.md` §4a's" in the same touch as A-2a | Very low — ambiguity, not error |
| A-2b | **Still open, non-blocking.** `02`:392 ends "flagged here per `INTAKE.md` §5 (named open question…)", but the Open Items list (:701-705) contains **only** the pagination item — re-read in full this pass | Low — add it as Open Item 2, or drop the clause |
| A-4 | **Still open, non-blocking.** §5.3 q8 orders `evidence_item` by `e.created_at DESC NULLS LAST` (:434), but that column is `NOT NULL DEFAULT now()` (migration 004). `NULLS LAST` implies a nullability that does not exist. Harmless at runtime | Low |
| A-5b | **Still open, non-blocking.** `04` Slice 1 Files says "add production-only static catch-all"; `02` §7 places it under "Production integration" but states no *mechanism* making it production-only | Low — one clause in §7 |
| A-6 | **Still open, non-blocking.** `03`:196 says Recent Evidence is "ordered by `createdAt` desc", but `EvidenceSummary` (`02` §3:119-124) exposes only `evidenceItemId`, `investigationId`, `label`, `excerptOrSummary` — **no `createdAt`** (re-read this pass). Ordering is correctly server-side (§5.3 q8 orders by `e.created_at`), so behaviour is right; `03` names a field the type does not carry. **Reword `03`; do not add the field** | Low |

### Schema Fidelity

Carried forward from the 7th pass, where every column, table and enum cited in `02` §4/§5.3 was
re-walked against migrations 001/004/006/007 and `src/types/domain.ts`. **Labelled honestly: this
pass did not re-walk the migrations** — no schema-touching edit occurred in this fix round (the
four edits were prose-only, confirmed by reading each). The two schema-adjacent claims I did
re-open this pass are `EvidenceSummary`/`BriefSummary`'s field sets (§3:111-124, quoted above under
A-6) and §5.3's q8 SQL. No fabricated identifier was found in either.

---

## Requirements → UI Coverage

| User story | Screen / flow | Status |
|---|---|---|
| US-1 | Mission Control (`/`) — Flow US-1 (:27), layout (:152), Sections (:185) | ✅ |
| US-2 | Departments directory — Flow US-2 (:46), layout (:207), no-click-target rule stated literally | ✅ |
| US-3 | PD overview — Flow US-3 (:64), layout (:244), Sections (:286), empty state | ✅ |
| US-4 | Flow US-4 (:81) + Recent Investigations ordering + § Screen D Link Target (:409) | ✅ |
| US-5 | Flow US-5 (:98) + § Start Investigation Submission (:365) | ✅ |
| US-6 | Flow US-6 (:116) + three sibling sections with per-group empty states | ✅ |
| US-7 | Flow US-7 (:129) + left-nav panel in all four layout diagrams + Component Hierarchy node + § Client-Side Route Navigation (:383) | ✅ |
| Screen D fallback | Dedicated screen block (:301) + layout (:309) + Sections (:322) + link-target contract | ✅ |
| Loading / error / success | § Page-Load Fetch (:332) — all three specified, required mutually distinguishable | ✅ |

**Seven flows, one per user story — re-derived this pass from `03`'s `### Flow:` headings (:27,
:46, :64, :81, :98, :116, :129), not carried.** Every screen has a layout. `03`'s Output
Verification carries no range literal.

### UI Gaps

| # | Gap | Impact |
|---|---|---|
| U-1, U-3, U-4 | **CLOSED**; U-3 re-verified at `03`:39 this pass | — |
| U-2 | **Still open, accepted.** `03`'s hierarchy contains presentational nodes absent from `02` §2 (`InstalledDepartmentsStrip`, `DepartmentTile`, `ActiveWorkSection`, `ActiveActivityPanel`, `RecentSection`, `PlannedDepartmentsNote`, `DepartmentRow`, `DepartmentEntryLink`, `DepartmentHeader`, `SourcesEvidenceCounts`, `RunsActivityPanel`, `StatusFilterControl`, the three group lists). `03`:518-525 self-discloses this and argues they are layout subdivisions of components `02` already owns. **Argument accepted** — `04`'s Dependency Map and Slices 2-4 assign every one to a slice, so none is orphaned | Low — self-disclosed, non-contradictory |

**Architecture ⇄ UI consistency:** `ProblemDepartmentScreenState`, `InvestigationPortfolioTableProps`
and `StartInvestigationFormProps` match verbatim between `02` §6 and `03`. `PersistentNav`'s mount
semantics ("sibling to `<Routes>`, mounted once, not remounted") are stated identically in `02`
§2:44, `03` Flow US-7, `03`'s hierarchy annotation, and `04` Slice 1's Implementation Notes. The
route pattern `/departments/problem-department/investigations/*` is identical at `02`:43, `02`:497,
`03`:301, `03`:443, `04`:29 and `04`:90. **No `02`⇄`03` contradiction found this pass.**

---

## Architecture / UI → Roadmap Coverage

| Component | Slice | Status |
|---|---|---|
| `src/types/readModels.ts` | 1 | ✅ |
| `src/config/departments.ts` (`DEPARTMENTS`) | 1 | ✅ (see RM-3 for a stale note) |
| `src/services/lastActivity.ts` | 1 | ✅ |
| `getMissionControlView` / `getDepartmentsView` / `getProblemDepartmentOverview` | 1 | ✅ |
| `src/web/apiRoutes.ts` (3 GET + 1 POST) | 1 | ✅ |
| `server.ts` — `express.json()`, router mount, static catch-all | 1 | ⚠️ A-5b (production-only mechanism unstated in `02`) |
| Vite scaffold (`main.tsx`, `App.tsx`, `api.ts`, `vite.config.ts`), deps, scripts | 1 | ✅ |
| `PersistentNav` | 1 | ✅ Files + tests + Done-When; proven end-to-end in Slice 4 |
| `InvestigationWorkspacePlaceholder` | 1 | ✅ Files + render test + Done-When + Dependency Map + Deferred; both owners cited |
| `apiClient` (`src/client/api.ts`) | 1 | ✅ |
| `DepartmentsScreen` (+ `DepartmentRow`, `DepartmentEntryLink`) | 2 | ✅ |
| `ProblemDepartmentScreen`, `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState`, `StartInvestigationForm` | 3 | ✅ |
| `SourcesEvidenceCounts`, `RunsActivityPanel` | 3 | ✅ |
| `MissionControlScreen` (+ strip, groups, activity panel, recent lists, planned note) | 4 | ✅ |

**Every component in `02` §2's table and every node in `03`'s Component Hierarchy maps to a slice.**
No circular dependencies — Slice headings re-derived this pass (:62, :166, :207, :277) and each
slice's Depends-On runs strictly forward 1 → 2 → 3 → 4. Every slice has concrete file paths, a Tests
block and a Done-When checklist. **No component is orphaned.**

### Roadmap Gaps

| # | Gap | Impact |
|---|---|---|
| RM-1, RM-2, RM-5, A-13 | **CLOSED**; A-13 re-verified at `04`:3-4 this pass | — |
| RM-3 | **Still open, non-blocking.** `04`:76-78 still reads "thesis strings copied verbatim from `docs/product-architecture-and-direction.md` §3 **per Architecture §5.3's open item**". That open item no longer exists — `02` §5.3 ships the real strings and `02`'s Open Items list (:703-705) contains only the pagination item. Same source, so no wrong string is built; it directs the implementer to resolve something already resolved | Very low |
| RM-4 | **Still open, informational.** Slice 1 remains the largest slice by a margin (three services, four routes, the full Vite scaffold, nav, placeholder, nine tests). `04`:13-16 self-discloses it as the "unavoidable first foundation slice". Flagged so the sizing judgment is made deliberately by a human rather than by default | Informational |

### Browser-Visibility Sequencing ("no long invisible tunnels")

| Slice | Browser-visible at completion? |
|---|---|
| 1 | Partially — the shell boots with a real, visible left-hand `PersistentNav` on every route and an honest placeholder at the Screen D route, not empty stubs. Self-disclosed as an unavoidable foundation slice. **Accept** |
| 2 | Yes — `/departments` renders four real Departments with real theses; click navigates |
| 3 | Yes — full portfolio against the real DB, working submission |
| 4 | Yes — `/` fully populated, plus an end-to-end manual walkthrough that also proves US-7 |

Sequencing verdict: **sound.** Slice 3's dependency on Slice 2 is flow-level only and correctly
disclosed as carrying no code dependency.

---

## Scope-Leak Audit (against `INTAKE.md` §3 "Explicitly OUT of scope")

This round edited four prose fragments and added no component, route, type, query or dependency.
The scope surface was re-checked rather than carried:

| Out-of-scope item | Found in 01/02/03/04? | Result |
|---|---|---|
| `POST /api/investigations/:id/generation-runs`, browser-triggered generation | Named only in Out-of-Scope / Anti-Pattern / Deferred lists | ✅ clean |
| `generation_component_event`, `component_execution_id`, live per-component activity | Named only as exclusions (`02`:26-27, :166); `GenerationRunSummary` omits `currentComponent`; `03`:193 forbids it "ever" | ✅ clean |
| Investigation Workspace (Screen D), `BriefForReview`, `deriveWorkflowStage`/`WorkflowStage` | Only a link-target string and a static placeholder; `02`:48 specifies "no fetch, no loading state, no error state, no props" | ✅ clean |
| `/evidence`, `/runs`, `/knowledge`, `/activity` Core routes | Excluded in all four docs; `02`:44 forbids the nav links; `04`:143 tests their absence | ✅ clean |
| Any Slices 1-9 schema/service/logic change | §10 states zero changes; no migration in any slice; `POST /api/investigations` calls existing exports unchanged (`02`:660, `04`:106) | ✅ clean |
| Retirement of `src/web/views.ts` | Explicitly untouched; registration-order conflict addressed in §7/§10 | ✅ clean |
| New auth/CORS posture | §5.1 adds only `express.json()`; the `/api/` 404-JSON branch is error routing, not a posture change | ✅ clean |
| New runtime/env config | None added; Vite's 5173 correctly classified as a tool default | ✅ clean |
| E2E framework | RTL only throughout | ✅ clean |

**No Checkpoint 2/3 scope leaked in this fix round.**

## INTERVIEW.md ASSUMED-Decision Fidelity

| # | ASSUMED decision | Reflected in | Result |
|---|---|---|---|
| 1 | Vite | `02` §7, §9 deps, `04` Slice 1 | ✅ |
| 2 | Source in `src/client/`, `src/web/public/` = build OUTPUT only | `02` §7 (`build.outDir: ../web/public`), `04` Slice 1; every new file lands under `src/client/` | ✅ |
| 3 | Integration tests for read models; RTL render/interaction only for React; no e2e | `02` §9, `04` every slice's Tests block | ✅ |
| 4 | No new auth/CORS/error-posture change | `01` Out-of-Scope + Constraint, `02` §5.1/§7 | ✅ |
| 5 | Explicit empty state, exact copy, never blank/loading-styled | Copy strings verified byte-identical across docs in the 7th pass; this round touched none of the four lines carrying them (verified by re-reading each edited site) | ✅ |

No ASSUMED decision was silently overridden.

---

## Identified Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-1** | **Count-drift recurrence. Downgraded H → M, and this is the first pass entitled to downgrade it.** The class recurred five times (B-2/B-6 → C-1/C-2/C-3 → C-4 → C-5) because each fix round inherited the previous reviewer's coverage. **A mechanical check now exists and was run: 36/36 hits classified, 0 defects.** The downgrade rests on that artifact, not on a reviewer's assurance | **M** (was H) | M | Run `scripts/check-spec-count-literals.sh` before every future gate invocation. **Residual, and why this is M not L: the regex misses spelled-out numbers** (R-1a) — closed by hand this pass, which is exactly the fragile procedure the script exists to replace. Extend the regex before the next sprint |
| **R-1a** | **New.** The check's declared blind spot (digit-only) could be mistaken for full coverage by a future reader who runs it and sees a clean result | M | M | This document states the limit explicitly; add the number-words alternation to the script's `NOUNS` prefix |
| R-4 | `LAST_ACTIVITY_SUBQUERY` fans out `generation_run × generation_step` before aggregation — correct for `MAX`, but a full-table subquery joined by several call sites, unindexed, with no `LIMIT` (§3 correctly refuses an unsourced cap) | M | L now, H later | Accepted for local-dev scale; the first non-trivial dataset re-opens both the index and the page-size question, with a named owner |
| R-6 | `POST /api/investigations` duplicates the three-call sequence from `server.ts` — two copies of a business sequence that must stay in step | M | M | Accepted this checkpoint (extraction would touch Slices 1-9 code, forbidden). Record as known debt with a Checkpoint-2 owner |
| R-7 | `getProblemDepartmentOverview`'s counts are unscoped `COUNT(*)` — correct only while exactly one Department exists. Disclosed and justified, but it is a promoted default waiting to be inherited | L this checkpoint | H later | Documented in §5.3; bind it to the single-Department assumption in a **code comment** so Checkpoint 2 cannot inherit it silently |
| R-9 | Residual staleness of cross-references generally (A-2a, A-2b, RM-3 are all live instances: a pointer that outlived its target) | M | L | Standing rule: **any change to an enumeration or a section number requires re-reading every cross-reference to it in all four docs, including within the same document.** Note the count check does not cover §-pointers — that is a different, still-manual class |
| R-10 | **CLOSED.** No review-finding ID remains in any gated doc | — | — | — |
| **R-11** | **Reviewer-as-shared-well. Downgraded H → M.** Each round's edit list used to derive from the previous review's finding list, inheriting its coverage. The script breaks that specific loop for the count class: its coverage is auditable and reproducible, mine is not | **M** (was H) | M | Derive fix-round edit lists from a fresh mechanical search for the *construct*, never from a finding's line list. Note the loop is broken **only for the count class** — the §-pointer class (A-2a) is still hand-swept, which is why R-11 is M and not L |

---

## Assumptions

| Assumption | Where it lives | Impact if wrong |
|---|---|---|
| Every `investigation` row belongs to Problem Department (justifies unscoped `COUNT(*)`) | `02` §5.3, INTAKE §3 | Sources/Evidence counts silently wrong the moment a second Department writes Investigations |
| Department `installed`/`planned` is a static proposal-time literal, not a domain fact | `01` Constraints, `02` §8, DESIGN §7 | Mission Control shows a stale `installed` badge for a Department whose service was removed |
| A `status='open'` Investigation with zero runs is best classified as "Active" | `02` §5.3 q2, `01` US-6 AC5, `03`:190, `04` Slice 1 test | Mission Control's Active list conflates "new and untouched" with "generating right now" — the exact confusion US-6 exists to prevent. Deliberate, defended, asserted by a test, but with no upstream source (Q-7) |
| A static placeholder at Screen D's route is more honest than an unregistered route | `02` §2/§6, `03` § Screen D Link Target, `04` Slice 1 | If Danny would rather ship no link until Screen D exists, the placeholder is wasted work and a surface to delete later (Q-1) |
| Persistent **left** navigation is the wanted chrome | `02` §2, `03` all four diagrams, cited to `docs/product-architecture-and-direction.md` §13 | Rework of four diagrams and one component. De-risked: grounded in the compass, §13 opened and confirmed in an earlier pass |
| The four thesis strings in `docs/product-architecture-and-direction.md` §3 are current | `02` §5.3 | Departments directory shows a stale thesis. Verified against the source in an earlier pass; the source itself was not re-validated |
| Local-dev Investigation volume is small enough that unpaginated reads are fine | `02` §3 PROVISIONAL note | Mission Control payload grows unbounded; no cap addable without a named owner (correctly refused rather than fabricated) |
| Express registration order alone prevents the SPA catch-all shadowing `/investigations/*` and `/api/*` | `02` §7, §10 | Legacy server-rendered screens break — the one integration this checkpoint promised not to disturb. Partially de-risked by the explicit `/api/` 404 branch |
| Vitest's existing `jsdom` devDependency suffices for RTL with no new runner config | `02` §9 | Slice 1's client test set blocks on unplanned test-infra work |

---

## Open Questions

| # | Question | Status | Needs |
|---|---|---|---|
| Q-1 | Now that the Screen D link resolves to an honest placeholder, is that the wanted behaviour — or would Danny rather the last-active Investigation render as non-interactive text until Screen D exists? | Open, de-risked — the package ships no blank screen either way | Danny — a preference call, not a defect |
| Q-2 | Does Mission Control need a "recent N" cap? Any number requires a named owner and citation | Open — deliberately deferred, correctly refused so far | Danny |
| Q-3, Q-5, Q-8 | **CLOSED** — nav is US-7 owned and sliced; the `recentCompleted` deviation is declared; `03` carries a dedicated Flow US-7 | — | — |
| Q-4 | `Department` config's long-term home (static array vs. persisted table) | Open — deliberately deferred | Danny, at Checkpoint 2/3 |
| Q-6 | Retirement of `src/web/views.ts`'s server-rendered screens | Open — out of scope, unchanged | Danny, post-checkpoint |
| Q-7 | Is "Active" the right home for a brand-new `open`, zero-run Investigation — or should there be a fourth group ("New / Not started")? Stated in `01` AC5, rendered per `03`:190, asserted by a `04` test — which raises the cost of changing it later | Open — fully surfaced in three documents and a test | Danny — a yes/no, worth resolving *before* forge |
| Q-9 | **CLOSED.** "Should the count-literal check be scripted before the final attempt is spent?" — **yes, and it now is.** `scripts/check-spec-count-literals.sh` exists and was run this pass | Closed | — |
| **Q-10** | **New, process, non-blocking.** Should the script's regex be extended to spelled-out number words (R-1a) before it is used as a gate on a future sprint? | Open — does not block this gate; the gap was closed by hand this pass and the hand-closure is documented above | Danny / whoever owns `scripts/` |

---

## Approval Checklist

### Requirements (01)
- [x] US-1…US-7 present, each with Given/Then ACs naming real routes, components, columns or forbidden literals
- [x] Clean of the count-drift class — both check hits are regex false positives on "Checkpoint-1"
- [ ] Reviewed by human
- [ ] Acceptance criteria are testable — reviewer note: every AC is Given/Then and mechanically checkable
- [ ] Out of scope is acceptable
- [ ] RQ-3 dispositioned (fetch-failure edge case)

### Architecture (02)
- [x] **C-5 resolved** — `02`:37 now "the following independent queries (§5.3)"; count deleted, pointer corrected
- [x] **A-12 resolved** — §1's binding scope sentence now reads "four new Express JSON routes (three GET, one POST)"
- [x] A-1, A-3, A-7, A-8, A-9, A-10 resolved in earlier rounds
- [x] §5.3's eight query blocks re-derived this pass; §6's four-route table re-derived; §1/§2/§5.1/§6/`04`:12 route counts all agree
- [x] No fabricated identifier in the two type blocks re-opened this pass (§3:111-124)
- [ ] Reviewed by human
- [ ] Patterns are appropriate — reviewer note: matches the existing direct-`pg` pattern; no new data-access abstraction
- [ ] A-2a, A-2a(ii), A-2b, A-4, A-5b dispositioned (wrong §-self-reference; ambiguous §4a; unlisted open item; dead `NULLS LAST`; production-only mechanism)

### UI Spec (03)
- [x] **U-3 resolved** — `03`:39 no longer attaches a section count to `MissionControlView`
- [x] A-11, U-1, U-4 resolved in earlier rounds
- [x] Seven `### Flow:` headings re-derived this pass, one per user story; four `## Screen:` blocks (three in-scope + declared fallback)
- [ ] Reviewed by human
- [ ] Flows are complete — reviewer note: each has a success and an error (or explicit N/A) path
- [ ] Layouts are appropriate
- [ ] A-6, U-2 dispositioned (`createdAt` named on a type that lacks it; presentational nodes absent from `02` §2)

### Roadmap (04)
- [x] **A-13 resolved** — story range replaced by a pointer; `03` and `04` now treat the construct identically
- [x] C-4, RM-5 resolved in earlier rounds; `04`:5's "3 screens + 1 catch-all" and `04`:46's "4 slices" re-derived accurate this pass
- [x] Every `02` §2 component and every `03` hierarchy node maps to a slice; no orphans, no cycles
- [ ] Reviewed by human
- [ ] Sequence is correct — reviewer note: verified; strictly forward, no cycles, each slice after 1 browser-visible
- [ ] Slices are appropriately sized — reviewer note: Slice 1 remains the largest (RM-4); a deliberate human sizing call is worth making
- [ ] RM-3, RM-4 dispositioned (stale "per Architecture §5.3's open item"; Slice 1 size)

### Overall
- [x] **Zero blocking findings.** C-5 closed; A-12, A-13, U-3 closed; all of Frank's attempt-1 findings (F-1…F-5) closed and confirmed by Frank himself at attempt 2
- [x] **F-6 addressed** — this document was authored after re-reading current file state; its Status line is true as of now, and it declares its own expiry condition
- [x] **F-7 addressed** — a scripted check exists, was run, and all 36 hits are classified in-document with their contexts; 0 defects
- [ ] Non-blocking gaps dispositioned: RQ-3, A-2a, A-2a(ii), A-2b, A-4, A-5b, A-6, U-2, RM-3, RM-4
- [ ] Open questions Q-1, Q-7, Q-10 resolved (Q-2, Q-4, Q-6 may remain open — declared deferrals, not gaps)
- [x] All risks have mitigations
- [ ] Ready for implementation — pending Frank's binding spec-gate (attempt 3/3) and Danny's approval

---

## Readiness Statement for the Final Gate (attempt 3/3)

**Plainly and unambiguously: yes. The package is free of all blocking findings, and I recommend
invoking Frank's attempt 3/3.** I am stating this as a definite verdict, not a hedge, and I will be
exact about what it rests on.

**The one blocking finding from last pass is closed, and closed in the durable shape.** `02`:37 now
reads "via the following independent queries (§5.3)". Both halves of C-5 are gone: the count was
**deleted rather than corrected to "8"**, so it cannot drift again, and the pointer now targets
§5.3, where the eight numbered query blocks actually live. That wording matches the sibling site at
§5.3 exactly, so the two move together. The three non-blocking items taken in the same touch —
A-12, A-13, U-3 — are each verified fixed by reading the current line, and each was fixed by
pointer or deletion rather than by a new number.

**Frank's F-6 (stale review record) is addressed structurally, not by promise.** Every claim in this
document was made after opening the line it describes. Nothing was carried from the 7th-pass review
without re-derivation, including the things that had not changed. This document also states its own
expiry condition: if the spec docs change after this timestamp, this verdict is void.

**Frank's F-7 (no mechanical backstop) is addressed with an artifact, and I want to be precise about
its strength and its limits, because overstating it would be the same failure in a new costume.**
The check was run over all four documents and returned **36 hits, every one of which is classified
in the table above with its full surrounding context: 30 specific `US-N ACm`-style citations, 2
regex false positives on the string "Checkpoint-1", and 4 genuine aggregates.** All four aggregates
— `04`:5's "3 screens + 1 catch-all", `04`:46's "4 slices", and `04`:89/:138's "3 routes plus the
catch-all" — were re-derived this pass from the current structure of their cited sources by counting
headings and table rows, not by trusting the previous review's table. **Zero defects.** The task
brief cited 44 hits; the true figure is 36, and 44 is the section's line count including headers —
I checked rather than adopting the number, and I am flagging the difference rather than quietly
matching it.

**The check's limit, stated up front:** its regex requires a digit adjacent to the noun, so it does
not see spelled-out counts, which are the more common form in `02`. I closed that gap by hand this
pass — `02`:19-21's four/three/one route-and-screen sentence, `02`:43 and `02`:51 were each
re-derived against §5.1 and §6, and all agree. But hand-closing is precisely the fragile procedure
the script exists to replace, so **R-1 is downgraded to Medium, not Low, and Q-10/R-1a ask for the
number-words extension before the next sprint relies on it.** A check whose blind spot is undeclared
is the shared well again; this one's is declared.

**What remains is nine single-clause non-blocking items, and none of them makes any document state
something false about another's substance.** A-2a is one stray character (`02`:385's "this
document's own §4a" should read "§4" — `02` has no §4a; its headings run §1…§11, re-derived this
pass). **I did not fix it: I am the reviewer, not an author of `02`, and silently editing a gated
artifact I am reviewing would collapse doer and checker into one role.** It needs one touch by
whoever next owns the file. A-2a(ii) is a related ambiguity at `02`:41. A-2b, A-4, A-5b, A-6, RM-3
are stale or over-precise prose with correct behaviour underneath. U-2 and RM-4 are self-disclosed
and argued, and I accept both arguments. RQ-3 is a missing edge-case row whose contract already
exists in `03`.

**The rest of the package is in good shape and that belongs on the record too:** requirements
coverage is complete, architecture covers every story and every edge case, the UI spec has a flow
per story and a layout per screen, the roadmap orphans nothing and cycles nowhere, the sequencing
keeps every slice after the first browser-visible, and the scope-leak audit is clean on every
INTAKE §3 exclusion.

**Recommendation: invoke Frank's attempt 3/3 now.** The open items are dispositions for Danny, not
defects for a fix round, and holding the package for them would spend calendar time without changing
what Frank reads.

---

## Reviewer's Note on Method

**What "verified" means here.** Where this document says verified or re-derived, a primary source
was opened this pass and a property was recomputed from it: `02`'s section headings (to establish
that no §4a exists), §5.3's numbered blocks 1–8, §6's four-row route table, §3's `BriefSummary`/
`EvidenceSummary` field lists, `02`'s Open Items list, `03`'s `### Flow:` and `## Screen:` headings,
and `04`'s `### Slice N` headings. Where it says accepted — U-2's presentational-node argument,
RM-4's slice sizing — a stated rationale was judged sound without independent proof. Where it says
carried forward — the migration walk under Schema Fidelity — the prior pass's verification is being
relied on, and that is labelled rather than blended in. Those three labels are not interchangeable.

**On the mechanical check and my role in it.** The script's value is that its coverage is auditable
and mine is not. I ran its exact regex over its exact file set and listed all 36 hits with their
contexts so that the next reader classifies the same set I did rather than re-deriving the search.
That is what makes this pass different from the five hand sweeps before it. It is not, however, a
guarantee of a clean document set: the check covers one defect class in one syntactic form, and the
§-pointer class it does not cover produced A-2a, which is still open.

**Shared-well caveat, unchanged and still binding.** The four spec documents share one upstream
source, `DESIGN-PROPOSAL.md`. This review constrains the four docs against that source and against
the live type definitions; it does **not** independently re-validate `DESIGN-PROPOSAL.md` itself.
Any error inside the design proposal is inherited by all four documents and by this review, and no
amount of cross-checking among the four would reveal it. Frank's Layer 2 read is the only remaining
check on that axis.

**Do not cite this document as proof that no count defect exists anywhere.** Cite it as: the
digit-adjacent count-literal check was run over all four documents, all 36 hits were individually
classified against their current sources, and none was a stale aggregate.
