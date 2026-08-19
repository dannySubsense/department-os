# Spec Review: Product Surface — Checkpoint 1

**Status**: COMPLETE — **1 blocking finding (C-5). The package is NOT completely free of blocking
findings and is NOT ready for Frank's attempt 2/3 re-gate as it stands.** C-5 is a single stale
literal on one line of `02-ARCHITECTURE.md` — the *other half* of a fix this round reported as
applied.
**Reviewer**: spec-reviewer (independent)
**Date**: 2026-08-19
**Pass**: 7th — full re-review after the C-4/A-9/A-10/A-11/RM-5 fix round. This document replaces
the 6th-pass review entirely; it is a complete re-assessment, not a diff.
**Docs reviewed**: `01-REQUIREMENTS.md`, `02-ARCHITECTURE.md`, `03-UI-SPEC.md`, `04-ROADMAP.md`
**Context read**: `INTAKE.md`, `INTERVIEW.md`, `NORTH-STAR.md`, `GATE-LOG.md`,
`docs/specs/product-surface/DESIGN-PROPOSAL.md`
**Primary sources independently opened this pass**: all four spec docs in full; `src/types/domain.ts`
(to re-derive `InvestigationStatus`'s member set against `03`:290's enumerated filter options);
`GATE-LOG.md` attempt-1 record.

---

## Method Note (read this before the findings)

The task named the objective precisely: the count-drift class has recurred three times, so this pass
was run as an **exhaustive mechanical sweep, not a re-read of the flagged sites**. Two procedures
were used, and the second is the one that found C-5:

1. **Full-text read** of all four documents, front to back.
2. **A regex sweep, run separately per document**, over the pattern
   `(one|two|…|eight|[0-9]+) … (user stor|AC|screen|flow|route|component|quer|slice|section|link|
   tile|row|group|list|Department|step|test|read model|endpoint|term|kind)`, with **every** hit
   classified against one rule: does this literal describe *this document's own authored structure*
   (legitimate) or *another document's / another section's enumeration* (the defect class)?

**Procedure 2 caught what procedure 1 and the previous pass both missed.** The previous pass's sweep
table listed `02`:336 as the sole site of the "5 independent queries" literal. It is not — the same
literal also sits at `02`:37, in §2's component table, and the previous sweep table has no row for
`02`:37 at all. The fix round then fixed the site that was named and left the twin standing.

**That is the fourth consecutive occurrence of the identical meta-failure**: the fix is applied to
the cited line rather than to the invariant, and no one re-derives the invariant across the set
afterward. It is now the single most reliable predictor of what this package will fail on.

---

## Blocking Findings (this pass)

| # | Finding | Where | Why blocking |
|---|---|---|---|
| **C-5** | **A-9 is fixed at one of its two sites. `02-ARCHITECTURE.md`:37 still reads "via 5 independent queries (§4)".** §5.3's `getMissionControlView` block enumerates **eight** numbered queries (1–8), and `04-ROADMAP.md`:80 independently reads that block as "§5.3 queries 1-8". The literal "5" is not re-derivable from any enumeration in the package. **Two defects on one line, not one:** (a) the stale count, and (b) the pointer `(§4)` is wrong — §4 is the `lastActivityAt` subquery; the queries this cell describes are in **§5.3**. The A-9 fix at :336 rephrased that line to "the following independent queries", which is the correct durable shape — it simply was not applied here. | `02-ARCHITECTURE.md`:37 | **Intrinsically cosmetic; as gate risk it is not.** Frank's attempt-1 FAIL and the two rounds since have all turned on this class, and the previous pass explicitly warned that "a strict Layer 1 fidelity read could call A-9 an unsourced count contradicted by the enumeration directly beneath it." Attempt 2 of 3 is the second-to-last attempt. Spending it on a literal that the *last* round already agreed should be deleted, and deleted at only one of its two occurrences, is precisely the outcome Frank's "not worth spending on" remark was about. **Fix by deletion, matching :336's wording exactly** — e.g. "…via independent queries (§5.3)". Do not write "8". |

There are no other blocking findings. Every other item in this document is non-blocking.

---

## Fix Verification — This Round's Five Items

Each verified by opening the current file and re-deriving the property. No fix description was
trusted.

| # | Claimed fix | Verified state now | Verdict |
|---|---|---|---|
| **C-4** | `04`'s header restated "6 flows" against `03`'s seven | `04`:5-7 now reads "`03-UI-SPEC.md` (3 screens + 1 catch-all fallback; **see 03-UI-SPEC.md's User Flows section for the full flow list — not restated here per repo-wide no-manually-asserted-counts discipline**)". **No flow literal remains.** Re-derived rather than accepted: `03` carries Flow US-1 (:27), US-2 (:44), US-3 (:62), US-4 (:79), US-5 (:96), US-6 (:114), US-7 (:127) — seven, and the pointer now absorbs an eighth without breaking. The screen literal "3 screens + 1 catch-all fallback" was correctly left alone: `03`'s Screens table has exactly three rows and self-discloses the placeholder at :299-305 | **RESOLVED**, and in the durable shape (pointer, not "7") |
| **RM-5** | Slice 1's coverage column attributed the placeholder to `03` only | `04`:41 now reads "…§2 `PersistentNav`; **`02-ARCHITECTURE.md` §2/§6 + UI Spec Component Hierarchy** `PersistentNav` + `InvestigationWorkspacePlaceholder`; US-7". Both owners cited. Cross-checked that the cited sections exist and own the component: `02` §2:48 carries the full `InvestigationWorkspacePlaceholder` row, `02` §6:497 carries its route-table row, `03`:472-474 carries its hierarchy node | **RESOLVED** |
| **A-9** | `02`:336's "5 independent queries" | `02`:336 now reads "**the following independent queries**" — the literal is gone at that site. **But the identical literal survives at `02`:37**, which the fix description did not mention and the previous sweep table did not list | **PARTIAL → C-5** |
| **A-10** | `02`:632's "3 screens" in the `react-router-dom` justification | `02`:632 now reads "Client-side route matching for the **three screen routes plus one catch-all fallback route** (§6)". Re-derived against §6's route table: four rows — `/`, `/departments`, `/departments/problem-department`, `/departments/problem-department/investigations/*`. Phrasing is character-consistent with §1:19-21, §6:487-490 and §7:571 | **RESOLVED** |
| **A-11** | `03`:510-512's "US-1 through US-7" range | `03`:510-512 now reads "Every user story has a mapped flow: yes — **see `01-REQUIREMENTS.md`'s User Stories section for the full list**; each has a corresponding flow above, including the persistent cross-screen navigation story (Flow US-7)". The range literal is gone; US-7 is named by title rather than by position, so an eighth story cannot falsify the sentence | **RESOLVED** |

**Four of five genuinely resolved; A-9 half-resolved.** C-5 is not a regression in any of the four —
it is the untouched half of A-9.

---

## Count-Literal Sweep (full doc set, this pass)

Every hit from the per-document regex sweep, classified. Rule: does the literal describe *this
document's own authored structure* (legitimate) or *another document's / another section's
enumeration* (defect class)? Sites the previous pass's table omitted are marked **[new site]**.

| Site | Literal | Describes | Verdict |
|---|---|---|---|
| `01`:24, :86 | "all four Departments" | `01`'s own AC; the four are named at :70-72 | ✅ legitimate |
| `01`:60, :150 | "all three Checkpoint-1 screens" | `01`'s own scope, routes enumerated inline at :150-151 | ✅ legitimate |
| `01`:70 | "exactly one … three tiles marked `planned`" | `01`'s own AC, all four named inline | ✅ legitimate |
| `01`:143, :147, :53 | "the three groups" | `01`'s own US-6, all three named | ✅ legitimate |
| `01`:154, :191 | "exactly two links", both named inline | `01`'s own AC | ✅ legitimate |
| `01`:230-231 | "exactly one Department … the other three" | `01`'s own Assumes clause | ✅ legitimate |
| `02`:4-6 | *(no literal — pointer to `01`'s User Stories section)* | — | ✅ |
| `02`:19-21 | "three new Express JSON routes, three new read-model query functions … three screens … plus one catch-all" | `02`'s own §2/§5.1/§6 | ⚠️ **A-12, non-blocking** — the route count omits `POST /api/investigations`; see below |
| **`02`:37 [new site]** | **"via 5 independent queries (§4)"** | **§5.3's `getMissionControlView` block, which enumerates eight** | ❌ **C-5 — BLOCKING** |
| `02`:40 | "the four `Department` config literals" | §5.3's `DEPARTMENTS` array — four entries, verified | ✅ accurate |
| `02`:43 | "three screen routes … plus one catch-all fallback route", all four paths named inline | §6's four-row table | ✅ accurate |
| `02`:44 | "exactly two nav links", both named | `02`'s own component contract | ✅ legitimate |
| `02`:45, :46 | "three Active-work groups", "four rows" | `02`'s own screen descriptions; match §3's `activeWork` shape and `DEPARTMENTS` | ✅ accurate |
| `02`:51 | "the three GET routes + the POST route" | §5.1 — three GETs + one POST, verified | ✅ accurate (and note it contradicts §1:19's "three … routes" → A-12) |
| `02`:198 | "GREATEST of five equal values" | §4's own SQL — `i.created_at` + four `COALESCE`s = five terms | ✅ accurate, re-derived |
| `02`:291 | "No parameters on any of the three" | §5.2's three signatures | ✅ accurate |
| `02`:336 | *(no literal — "the following independent queries")* | — | ✅ fixed (A-9, this site) |
| `02`:337-355 | "the other two queries", "all three groups", "the other two groups" | §5.3's own q2/q3/q4 | ✅ accurate |
| `02`:387 | "queries 2, 3, 6, and getProblemDepartmentOverview's…" | §5.3's own numbering — verified q2, q3, q6 each join `LAST_ACTIVITY_SUBQUERY`; q4 is the block itself | ✅ accurate, re-derived |
| `02`:388-390 | "five-term GREATEST" / "narrower two-term GREATEST" | §4's formula vs `DESIGN-PROPOSAL.md` §2a's `GREATEST(gr.completed_at, i.created_at)` | ✅ accurate, both re-derived |
| `02`:436-440 | "Queries 2/3/4 … three separate round trips or three CTEs" | §5.3's own numbering | ✅ accurate |
| `02`:487-497 | "three screen routes … plus one catch-all", four-row table | `02`'s own §6 | ✅ accurate |
| `02`:505, :604, :607 | "three single-fetch screens", "3 more read paths", "All 3 screens" / "3 read-only page loads" | `02`'s own fetch-pattern rationale — the placeholder performs no fetch, so "3" is exactly right here | ✅ legitimate |
| `02`:540-542, :571 | "three groups"/"three sibling sections"; "the three screen routes plus the catch-all" | `02`'s own §6/§7 | ✅ accurate |
| `02`:632 | "three screen routes plus one catch-all fallback route (§6)" | §6's four-row table | ✅ fixed (A-10) |
| `02`:680-686 | US-1 … US-7 rows, each with an AC **pointer**, no AC count | `01`'s stories, one row each, no count literal | ✅ legitimate — and re-derived: seven rows, no gap, matching `01`'s seven stories |
| `02`:688-697 | Edge-case coverage prose, **no count stated**, seven cases addressed in sequence | `01`'s Edge Cases table — seven rows, re-counted from `01`:165-171 | ✅ accurate and countless |
| `03`:4-6 | *(no literal — pointers to `01`'s User Stories and AC sections)* | — | ✅ |
| `03`:8-9 | "exactly three screens", enumerated inline | `03`'s own Screens table (three rows); placeholder self-disclosed at :299-305 as not one of them | ✅ legitimate, non-contradictory |
| `03`:20, :48, :187, :231 | "all four Departments" / "four rows" / "4 tiles" / "(×4)" | `DEPARTMENTS`' four entries | ✅ accurate |
| `03`:32 | "1 installed, 3 planned" | `DEPARTMENTS`' status split | ✅ accurate |
| `03`:39 | "all **five** `MissionControlView` sections" | `MissionControlView` (`02` §3) has **four** top-level fields; `03`'s own layout diagram numbers **five** sections | ⚠️ **U-3, non-blocking** — see below |
| `03`:51, :234 | "the other three rows" | `03`'s own Departments layout | ✅ accurate |
| `03`:290 | filter options "= `all` + every `InvestigationStatus` value (`open`, `blocked`, `generation-failed`, `brief-generated`)" | `src/types/domain.ts`:70-74 | ✅ **verified against the type itself** — exactly those four members, no fifth |
| `03`:330, :384, :392 | "all three screens" / "the three screens" / "any of the three routes" | `03`'s own in-scope screen set; the placeholder is correctly excluded (it does no fetch) | ✅ legitimate |
| `03`:442-443, :477 | router route list (four); "the four route destinations", all named | `02` §6's four-row table | ✅ accurate |
| `03`:510-512 | *(no literal — pointer)* | — | ✅ fixed (A-11) |
| `03`:514 | "3 in-scope layouts, plus the out-of-scope … fallback" | `03`'s own four layout blocks, three in-scope | ✅ accurate |
| `04`:3 | "US-1–US-7" range + explicit "does not restate the AC count" | `01`'s story range | ⚠️ **A-13, non-blocking** — surviving twin of A-11; see below |
| `04`:5 | "`02-ARCHITECTURE.md` (Sections 1–11)" | `02`'s own headings — §1…§11 all present, plus an unnumbered Open Items section | ✅ legitimate (range over headings, all verified present) |
| `04`:5-7 | "3 screens + 1 catch-all fallback" + **flow pointer** | `03`'s Screens table + self-disclosed fallback | ✅ fixed (C-4) |
| `04`:46 | "4 slices cover every component" | `04`'s own slice count | ✅ legitimate |
| `04`:69, :89, :108, :138, :142 | "all three routes plus the catch-all" / "the 3 routes plus the …" / "the three route stubs" | `02` §6's four-row table | ✅ accurate |
| `04`:80 | "§5.3 queries 1-8" | `02` §5.3's own numbering — **eight blocks, verified** | ✅ accurate (**and this is the independent evidence that `02`:37's "5" is false**) |
| `04`:141, :362 | "exactly two links", both named | `01` US-7 AC2 | ✅ accurate |
| `04`:168, :191, :200 | "all four Departments" / "4 rows" | `DEPARTMENTS` | ✅ accurate |
| `04`:182, :236, :296, :308, :315 | "the other three rows", "not two components", "three … sibling sections", "the other two screens" | `04`'s own slice prose | ✅ legitimate |
| `04`:313 | "exactly 1 `installed` tile and 3 `planned` tiles" | `DEPARTMENTS` | ✅ accurate |
| `04`:369 | "all four slices above" | `04`'s own count | ✅ legitimate |

**One defect found: C-5.** The classification is reproducible — the rule and every site are listed,
so the next pass (or the script R-1 asks for) can re-run it rather than re-read the prose.

---

## Requirements Completeness (01)

| Check | Result |
|---|---|
| Summary present and clear | Pass |
| User stories in "As a / I want / so that" form | Pass — US-1…US-7, all three clauses in each |
| Every user story has acceptance criteria | Pass — every story has a Given/Then block |
| Edge cases table populated | Pass |
| Out of scope non-empty | Pass |
| Constraints concrete | Pass |

`01-REQUIREMENTS.md` was unchanged this round and is **clean of the count-drift class entirely** —
every numeric literal in it describes its own authored structure and enumerates its members inline.

### Requirements Gaps

| # | Gap | Impact |
|---|---|---|
| RQ-1, RQ-4 | **CLOSED** in earlier rounds; both re-verified against the current file this pass | — |
| RQ-3 | **Still open, unchanged.** `01`'s Edge Cases table has no row for API fetch failure, though `03` § Page-Load Fetch specifies a full error-state contract (error visually distinct from both loading and populated-but-empty). The UI spec is ahead of requirements, not behind — nothing builds the wrong thing | Low — one Edge Case row closes it |

---

## Requirements → Architecture Coverage

| Requirement | Architecture coverage | Status |
|---|---|---|
| US-1 Mission Control | `getMissionControlView` §5.3 q1–q8, `MissionControlView`/`GenerationRunSummary` §3, `MissionControlScreen` §6, `DEPARTMENTS` §5.3 | ✅ |
| US-2 Departments directory | `getDepartmentsView` §5.2/§5.3 (query-free, self-consistent), `DepartmentsView` §3, `DepartmentsScreen` §6, verbatim thesis literals §5.3 | ✅ |
| US-3 PD overview | `getProblemDepartmentOverview` §5.3, `ProblemDepartmentOverview` §3, `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState`, source/evidence `COUNT` queries | ✅ |
| US-4 Last recorded activity | `LAST_ACTIVITY_SUBQUERY` §4, single shared import §2, explicit secondary sort keys throughout §5.3 | ✅ |
| US-5 Start Investigation | `POST /api/investigations` §5.1 calling existing `submitSources`/`resolveInvestigationSources`/`transitionInvestigationStatus`, signatures unchanged | ✅ (see A-12 — the route is missing from §1's scope sentence only) |
| US-6 Active-work grouping (incl. AC5) | §5.3 q2/q3/q4, independent query logic, widened Active with declared ordering deviation on q4 | ✅ |
| US-7 Persistent nav | `PersistentNav` §2 (path, mount point, link set, `NavLink` active state, presentational-only) + §11 coverage row | ✅ |
| Screen D fallback | `InvestigationWorkspacePlaceholder` §2 row + §6 route-table row + §1 scope line | ✅ |
| Edge: zero Investigations | §5.1 empty-shape contract + §6 `InvestigationPortfolioEmptyState` | ✅ |
| Edge: no runs/steps/briefs | §4 `COALESCE` degradation to `i.created_at` | ✅ |
| Edge: tie on `last_activity_at` | unique secondary sort key on every `ORDER BY` in §5.3 — re-swept this pass (q2, q3, q4, q5, q6, q7, q8, portfolio, `lastActiveInvestigationId`, `recentRuns`): none lacks one | ✅ |
| Edge: unset `statusReason` | optional `?` field, never a placeholder | ✅ |
| Edge: empty DB, all three routes | §5.1's 200-with-empty-shape contract | ✅ |
| Edge: planned Department requested directly | §6 — no route entry, no click target ever rendered | ✅ |

**Every requirement has architecture coverage, and §11's self-certification is complete and
count-free.**

### Architecture Gaps

| # | Gap | Impact |
|---|---|---|
| A-1, A-3, A-5 (`/api/` half), A-7, A-8, A-10, A-11 | **CLOSED**; each re-verified against the current file this pass | — |
| **A-9** | **PARTIAL → escalated to C-5.** Fixed at :336, still present at :37 | Blocking as C-5 |
| A-2a | **Still open.** §5.3 q4's DECLARED DEVIATION block cites "this document's own §4a" (:386). `02` has no §4a — its shared subquery is **§4**; `§4a` is `DESIGN-PROPOSAL.md`'s section number. Intent unambiguous; the cross-reference is wrong | Very low — cosmetic |
| A-2b | **Still open.** The same block ends "flagged here per `INTAKE.md` §5 (named open question…)", but §'s Open Items list (:701-705) still contains **only** the pagination item | Low — add it as Open Item 2, or drop the "flagged here" clause |
| A-4 | **Still open.** §5.3 q8 orders `evidence_item` by `e.created_at DESC NULLS LAST` (:434), but that column is `NOT NULL DEFAULT now()` (migration 004). `NULLS LAST` implies a nullability that does not exist | Low |
| A-5b | **Still open.** `04` Slice 1 Files says "add **production-only** static catch-all"; `02` §7 places it under "Production integration" but states no *mechanism* by which it is production-only (no env check, no build-output guard) | Low — one clause in §7 |
| A-6 | **Still open.** `EvidenceSummary` (§3) has no `createdAt`, yet `03`:194 says "Recent Evidence — `EvidenceSummary[]`, ordered by `createdAt` desc". Ordering is server-side (§5.3 q8), so behaviour is correct; `03` names a field the type does not expose | Low — reword `03`; do **not** add the field |
| **A-12** | **New, non-blocking.** §1's Scope Boundary — labelled "binding, re-stated for implementers" — lists "three new Express JSON routes", omitting `POST /api/investigations` entirely. §2:42, §2:51, §5.1, §10 and `04`:12 all carry four routes (three GET + one POST), and `04`:12 states it correctly as "three GET routes, one POST wrapper". The POST route is fully specified everywhere it matters, so nothing is unbuildable — but the one section that declares itself binding undercounts the surface it binds | Low — "three new GET routes plus one JSON POST wrapper" |

### Schema Fidelity (re-verified this pass, not carried)

Every column, table and enum cited in `02` §4/§5.3 was re-walked and resolves to a real migration
definition (001/004/006/007). `InvestigationStatus` was re-derived from `src/types/domain.ts`:70-74
and has exactly four members — confirming `03`:290's filter enumeration is complete, not a subset.
`investigation.updated_at`, `investigation.department_id` and `generation_component_event` remain
confirmed **absent**, matching the docs' claims. `brief_version`'s join through `problem_brief` and
`evidence_item`'s join through `source_artifact` are both necessary, since neither carries
`investigation_id`. **No fabricated column, table or enum member exists in the doc set.**

---

## Requirements → UI Coverage

| User story | Screen / flow | Status |
|---|---|---|
| US-1 | Mission Control (`/`) — Flow US-1, five-section layout, Sections table | ✅ (see U-3 on the word "five") |
| US-2 | Departments directory — Flow US-2, no-click-target rule stated literally | ✅ |
| US-3 | PD overview — Flow US-3, layout sections 1–5, empty state | ✅ |
| US-4 | Flow US-4 + Recent Investigations ordering + § Screen D Link Target → `InvestigationWorkspacePlaceholder` | ✅ |
| US-5 | Flow US-5 + § Start Investigation Submission | ✅ |
| US-6 | Flow US-6 + three sibling sections with per-group empty states | ✅ |
| US-7 | Flow US-7 + all four layout diagrams' left-nav panel + Component Hierarchy node + § Client-Side Route Navigation | ✅ |
| Screen D fallback | Dedicated layout block + Sections table + § Screen D Link Target contract | ✅ |
| Loading / error / success | § Page-Load Fetch — all three specified and required to be mutually distinguishable | ✅ |

**Every user story has a flow. Every screen has a layout. `03`'s Output Verification is true and no
longer carries a range literal.**

### UI Gaps

| # | Gap | Impact |
|---|---|---|
| U-1, U-4 | **CLOSED** — Screen D link resolves honestly; nav chrome is left-side in both `02` and `03`, grounded in compass §13 | — |
| U-2 | **Still open, unchanged, and accepted.** `03`'s hierarchy contains presentational nodes absent from `02` §2 (`InstalledDepartmentsStrip`, `DepartmentTile`, `ActiveWorkSection`, `ActiveActivityPanel`, `RecentSection`, `PlannedDepartmentsNote`, `DepartmentRow`, `DepartmentEntryLink`, `DepartmentHeader`, `SourcesEvidenceCounts`, `RunsActivityPanel`, `StatusFilterControl`, the three group lists). `03`:518-525 self-discloses this and argues they are layout subdivisions of components `02` already owns. **Argument accepted** — `04`'s Dependency Map and Slices 2-4 assign every one of them to a slice, so none is orphaned | Low — self-disclosed, non-contradictory |
| **U-3** | **New, non-blocking.** `03`:39's Flow US-1 success path reads "all **five** `MissionControlView` sections render". `MissionControlView` (`02` §3) has **four** top-level fields (`departments`, `activeWork`, `activeActivity`, `recent`); the fifth section in `03`'s own layout diagram — the Planned-Departments note — is explicitly **derived client-side** with "no separate API field" (`03`:195). The count is right for `03`'s layout and wrong for the type it names. Not the C-5 class (the correct reading is available from `03`'s own diagram immediately below), but it attaches another document's type name to this document's section count | Very low — "all five layout sections" |

**Architecture ⇄ UI consistency:** `ProblemDepartmentScreenState`, `InvestigationPortfolioTableProps`
and `StartInvestigationFormProps` match verbatim between `02` §6 and `03`. `PersistentNav`'s mount
semantics ("sibling to `<Routes>`, mounted once, not remounted") are stated identically in `02` §2,
`03` Flow US-7 step 2, `03`'s hierarchy annotation, and `04` Slice 1's Implementation Notes — four
statements, checked against each other, all agreeing. The route pattern
`/departments/problem-department/investigations/*` was compared **character-by-character** across
`02` §2:43, `02` §6:497, `03`:412-413, `03`:443, `04`:29, `04`:90 — identical at all six sites. **No
`02`⇄`03` contradiction was found this pass.**

---

## Architecture / UI → Roadmap Coverage

| Component | Slice | Status |
|---|---|---|
| `src/types/readModels.ts` | 1 | ✅ |
| `src/config/departments.ts` (`DEPARTMENTS`) | 1 | ✅ (see RM-3 for a stale note) |
| `src/services/lastActivity.ts` | 1 | ✅ |
| `getMissionControlView` / `getDepartmentsView` / `getProblemDepartmentOverview` | 1 | ✅ |
| `src/web/apiRoutes.ts` (3 GET + POST) | 1 | ✅ |
| `server.ts` — `express.json()`, router mount, static catch-all | 1 | ⚠️ A-5b (production-only mechanism unstated in `02`) |
| Vite scaffold (`main.tsx`, `App.tsx`, `api.ts`, `vite.config.ts`), deps, scripts | 1 | ✅ |
| `PersistentNav` | 1 | ✅ Files + 2 tests + Done-When; proven end-to-end in Slice 4 |
| `InvestigationWorkspacePlaceholder` | 1 | ✅ Files + render test + Done-When + Dependency Map + Deferred; **both owners now cited (RM-5 closed)** |
| `apiClient` (`src/client/api.ts`) | 1 | ✅ |
| `DepartmentsScreen` (+ `DepartmentRow`, `DepartmentEntryLink`) | 2 | ✅ |
| `ProblemDepartmentScreen`, `InvestigationPortfolioTable`, `InvestigationPortfolioEmptyState`, `StartInvestigationForm` | 3 | ✅ |
| `SourcesEvidenceCounts`, `RunsActivityPanel` | 3 | ✅ |
| `MissionControlScreen` (+ strip, groups, activity panel, recent lists, planned note) | 4 | ✅ |

**Every component in `02` §2's table and every node in `03`'s Component Hierarchy maps to a slice.**
No circular dependencies — re-derived from the Dependency Map and each slice's Depends-On
(1 → 2 → 3 → 4, strictly forward; the two router-shell units hang off the client scaffold only, with
an explicit "no read-model dependency" note, which is correct). Every slice has concrete file paths,
a Tests block and a Done-When checklist. **No component is orphaned.**

### Roadmap Gaps

| # | Gap | Impact |
|---|---|---|
| RM-1, RM-2, RM-5 | **CLOSED**; each re-verified against the current `04` this pass | — |
| RM-3 | **Still open, minor.** `04`:76-78's `src/config/departments.ts` entry still reads "thesis strings copied verbatim from `docs/product-architecture-and-direction.md` §3 **per Architecture §5.3's open item**". That open item no longer exists — `02` §5.3 ships the real strings and `02`'s Open Items list contains only the pagination item. Harmless (same source) but it directs the implementer to resolve something already resolved | Very low |
| RM-4 | **Still open, informational, unchanged.** Slice 1 remains the largest slice by a margin (three services, four routes, the full Vite scaffold, nav, placeholder, nine tests). It remains one coherent foundation and `04`:13-15 self-discloses the "unavoidable first foundation slice"; not calling it a split. Flagged so a human sizing judgment is made deliberately rather than by default | Informational |
| **A-13** | **New, very low.** `04`:3's header restates `01`'s story range as the literal "US-1–US-7". This is the exact construct just removed from `03`:510 as A-11. It is currently true, it sits beside an explicit refusal to restate the AC count, and the previous pass classified it ✅ — but after A-11 the two sibling documents now treat the identical construct differently. Flagged for **consistency of treatment**, not as a false statement | Very low — drop the parenthetical, keep the pointer |

### Browser-Visibility Sequencing ("no long invisible tunnels")

| Slice | Browser-visible at completion? |
|---|---|
| 1 | Partially — the shell boots with a real, visible left-hand `PersistentNav` on every route and an honest placeholder at the Screen D route, not just empty stubs. Self-disclosed as an unavoidable foundation slice. **Accept** |
| 2 | Yes — `/departments` renders four real Departments with real theses; click navigates |
| 3 | Yes — full portfolio against the real DB, working submission |
| 4 | Yes — `/` fully populated, plus an end-to-end manual walkthrough that also proves US-7 |

Sequencing verdict: **sound.** Slice 3's dependency on Slice 2 remains flow-level only and is
correctly disclosed as carrying no code dependency.

---

## Scope-Leak Audit (against `INTAKE.md` §3 "Explicitly OUT of scope")

This round edited five prose fragments and added no component, route, type, query or dependency. The
scope surface was nonetheless re-checked rather than carried:

| Out-of-scope item | Found in 01/02/03/04? | Result |
|---|---|---|
| `POST /api/investigations/:id/generation-runs`, browser-triggered generation | Named only in Out-of-Scope / Anti-Pattern / Deferred lists | ✅ clean |
| `generation_component_event`, `component_execution_id`, `recordComponentEvent`, live per-component activity | Named only as exclusions; `GenerationRunSummary` omits `currentComponent`; the anti-pattern list forbids reusing `ActivityFeedEntry` | ✅ clean |
| Investigation Workspace (Screen D), `BriefForReview`, `deriveWorkflowStage`/`WorkflowStage`, §5a | Only a link-target string and a static placeholder. `02` §2:48 specifies "no fetch, no loading state, no error state, no props"; `03` § Screen D Link Target repeats it; `04` Deferred records that no later slice extends it | ✅ clean |
| `/evidence`, `/runs`, `/knowledge` Core routes | Excluded in all four docs; `04` Deferred also excludes the corresponding nav links; `02` §2's `PersistentNav` row forbids them; `04` Slice 1 tests their absence | ✅ clean |
| Any Slices 1-9 schema/service/logic change | §10 states zero changes; no migration in any slice; `POST /api/investigations` calls existing exports unchanged; Slice 1 Done-When asserts it | ✅ clean |
| Retirement of `src/web/views.ts` | Explicitly untouched; registration-order conflict addressed in §7/§10 | ✅ clean |
| New auth/CORS posture | §5.1 adds only `express.json()`; the `/api/` 404-JSON branch is error *routing*, not a posture change | ✅ clean |
| New runtime/env config | None added; Vite's 5173 correctly classified as a tool default | ✅ clean |
| E2E framework | RTL only throughout | ✅ clean |

**No Checkpoint 2/3 scope leaked in this fix round.**

## INTERVIEW.md ASSUMED-Decision Fidelity

| # | ASSUMED decision | Reflected in | Result |
|---|---|---|---|
| 1 | Vite | `02` §7, §9 deps, `04` Slice 1 | ✅ |
| 2 | Source in `src/client/`, `src/web/public/` = build OUTPUT only | `02` §7 (`build.outDir: ../web/public`), `04` Slice 1 note; every new file lands under `src/client/` | ✅ |
| 3 | Integration tests for read models; RTL render/interaction only for React; no e2e | `02` §9, `04` every slice's Tests block | ✅ |
| 4 | No new auth/CORS/error-posture change | `01` Out-of-Scope + Constraint, `02` §5.1/§7 | ✅ |
| 5 | Explicit empty state, exact copy, never blank/loading-styled | **Copy strings re-compared byte-for-byte this pass**: "No investigations yet — Start Investigation" identical in `01`:111/:165, `02`:547-548, `03`:75/:295/:401, `04`:256; "Investigation Workspace — not built yet (Checkpoint 2/3)" identical in `02`:48, `03`:311/:324/:424, `04`:95-96 | ✅ |

No ASSUMED decision was silently overridden.

---

## Identified Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-1** | **Stays HIGH, and is now empirically stronger, not weaker.** The count-drift pattern has recurred **four** times (B-2/B-6 → C-1/C-2 → C-4 → C-5). The mechanism is identical every round: the fix is applied to the *cited line*, and no one re-derives the *invariant* across the set. C-5 is the sharpest instance yet — the fix round agreed the literal should be deleted and deleted one of its two occurrences, because the previous review's own sweep table listed only one site | **H** (four occurrences, most recent this round) | M | Fix C-5 **by deletion**, matching :336's wording. Then build the scripted doc-set check: "no literal count of another document's or another section's enumeration appears in `01`–`04`." The Count-Literal Sweep table in this document is a hand-run instance of that check and should be the script's spec. **Rating this risk down before the script exists would repeat, for the fourth time, the exact error that produced C-5** |
| R-4 | `LAST_ACTIVITY_SUBQUERY` fans out `generation_run × generation_step` before aggregation — correct for `MAX`, but it is a full-table subquery joined by several call sites, unindexed, with no `LIMIT` anywhere (§3 correctly refuses an unsourced cap) | M | L now, H later | Accepted for local-dev scale; record that the first non-trivial dataset re-opens both the index and the page-size question, with a named owner |
| R-6 | `POST /api/investigations` duplicates the three-call sequence from `server.ts:32-106` — two copies of a business sequence that must stay in step | M | M | Accepted this checkpoint (extraction would touch Slices 1-9 code, forbidden). Record as known debt with a Checkpoint-2 owner |
| R-7 | `getProblemDepartmentOverview`'s counts are unscoped `COUNT(*)` — correct only while exactly one Department exists. Disclosed and justified, but it is a promoted default waiting to be inherited | L this checkpoint | H later | Documented in §5.3; bind it to the single-Department assumption in a **code comment** so Checkpoint 2 cannot inherit it silently |
| **R-9** | **Re-pointed again.** Last pass moved the staleness from `02` to `04`; C-4's fix cleared `04`, and the residue is back in **`02`** — the document with the most enumerable internal structure (eleven sections, an eight-query block, a twelve-row component table) and therefore the most places for a count to hide | M | M | Fix C-5. Standing rule, restated because it has now failed twice: **any change to an enumeration requires re-reading every cross-reference to it in all four docs, including within the same document** — C-5 proves same-document twins are as dangerous as cross-document ones |
| R-10 | **CLOSED.** No review-finding ID remains in any gated doc | — | — | — |
| **R-11** | **Stays HIGH, and one cause is now identified precisely.** Each round's edit list is derived from the *previous review's finding list*, which inherits that review's coverage. The previous sweep table had no row for `02`:37, so `02`:37 could not be fixed. **The review is itself a shared well: a fix round that trusts the reviewer's enumeration cannot exceed the reviewer's enumeration** | **H** if unchanged | M | Before attempt 3 is ever reached, replace the prose sweep with the script. A script's coverage is auditable; a reviewer's is not. Also: derive a fix round's edit list from a fresh `grep` for the *construct*, not from the finding's line list |

---

## Assumptions

| Assumption | Where it lives | Impact if wrong |
|---|---|---|
| Every `investigation` row belongs to Problem Department (justifies unscoped `COUNT(*)`) | `02` §5.3, INTAKE §3 | Sources/Evidence counts silently wrong the moment a second Department writes Investigations |
| Department `installed`/`planned` is a static proposal-time literal, not a domain fact | `01` Constraints, `02` §8, DESIGN §7 | Mission Control shows a stale `installed` badge for a Department whose service was removed |
| A `status='open'` Investigation with zero runs is best classified as "Active" | `02` §5.3 q2, `01` US-6 AC5, `03` Sections table + Flow US-6, `04` Slice 1 test | Mission Control's Active list conflates "new and untouched" with "generating right now" — the exact confusion US-6 exists to prevent. Deliberate and defended, asserted by a test, but still has no upstream source (Q-7) |
| A static placeholder at Screen D's route is more honest than an unregistered route | `02` §2/§6, `03` § Screen D Link Target, `04` Slice 1 | If Danny would rather ship no link at all until Screen D exists, the placeholder is wasted work and a surface to delete later (Q-1) |
| Persistent **left** navigation is the wanted chrome | `02` §2, `03` all four diagrams, cited to `docs/product-architecture-and-direction.md` §13 | Rework of four diagrams and one component. De-risked: grounded in the compass, and §13 was opened and confirmed in the prior pass |
| The four thesis strings in `docs/product-architecture-and-direction.md` §3 are current | `02` §5.3 | Departments directory shows a stale thesis. Verified against the source in a prior pass; the source itself was not re-validated |
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
| Q-7 | Is "Active" the right home for a brand-new `open`, zero-run Investigation — or should there be a fourth group ("New / Not started")? Stated in `01` AC5, rendered per `03`, asserted by a test — which raises the cost of changing it later | Open — fully surfaced in three documents and a test | Danny — a yes/no, worth resolving *before* forge |
| **Q-9** | **Escalated, process.** Should the doc-set count-literal check be built and run **before** attempt 2 is spent? Asked last pass on three occurrences; it is now four, and the fourth was invisible to the review that the fix round depended on | Open — **my recommendation has hardened to yes**, see Readiness Statement | Danny — a sequencing call |

---

## Approval Checklist

### Requirements (01)
- [x] US-1…US-7 present, each with Given/Then ACs naming real routes, components, columns or forbidden literals
- [x] Clean of the count-drift class — every numeric literal self-describes and enumerates inline
- [ ] Reviewed by human
- [ ] Acceptance criteria are testable — reviewer note: every AC is Given/Then and mechanically checkable
- [ ] Out of scope is acceptable
- [ ] RQ-3 dispositioned (fetch-failure edge case)

### Architecture (02)
- [x] **A-10 resolved** — router dependency row matches §6's four routes
- [x] C-1, C-3, A-7, A-8 resolved in earlier rounds; all re-verified this pass
- [x] Schemas re-verified against migrations 001/004/006/007 and `src/types/domain.ts`; no fabricated identifier
- [ ] **C-5 fixed** — `02`:37's "5 independent queries (§4)"; delete the count and correct the pointer to §5.3
- [ ] Reviewed by human
- [ ] Patterns are appropriate — reviewer note: matches the existing `getInvestigation.ts` direct-`pg` pattern; no new data-access abstraction
- [ ] A-2a, A-2b, A-4, A-5b, A-12 dispositioned (wrong §-ref; unlisted open item; dead `NULLS LAST`; production-only mechanism; §1's route count omits the POST wrapper)

### UI Spec (03)
- [x] **A-11 resolved** — Output Verification uses a pointer and names US-7 by title, not by position
- [x] C-1, C-2, U-4, A-7 resolved in earlier rounds; all re-verified this pass
- [x] Filter enumeration at :290 verified complete against `InvestigationStatus`'s four members
- [ ] Reviewed by human
- [ ] Flows are complete — reviewer note: seven flows, one per user story, each with success and error (or explicit N/A) paths
- [ ] Layouts are appropriate
- [ ] A-6, U-2, U-3 dispositioned (`createdAt` named on a type that lacks it; presentational nodes absent from `02` §2; "five `MissionControlView` sections")

### Roadmap (04)
- [x] **C-4 resolved** — flow literal replaced by a pointer; screen literal verified accurate
- [x] **RM-5 resolved** — Slice 1's coverage column cites both `02` §2/§6 and the UI Spec hierarchy
- [x] Every `02` §2 component and every `03` hierarchy node maps to a slice; no orphans, no cycles
- [ ] Reviewed by human
- [ ] Sequence is correct — reviewer note: verified; strictly forward, no cycles, each slice after 1 browser-visible
- [ ] Slices are appropriately sized — reviewer note: Slice 1 remains the largest (RM-4); a deliberate human sizing call is worth making
- [ ] RM-3, A-13 dispositioned (stale "per Architecture §5.3's open item"; "US-1–US-7" range literal, now inconsistent with `03`'s treatment)

### Overall
- [ ] **C-5 fixed** — the single remaining blocking finding
- [x] All of Frank's attempt-1 findings (F-1…F-5) resolved and re-verified against the current files
- [x] C-4, A-10, A-11, RM-5 verified resolved by re-derivation from the fixed files
- [ ] Non-blocking gaps dispositioned: RQ-3, A-2a, A-2b, A-4, A-5b, A-6, A-12, A-13, U-2, U-3, RM-3, RM-4
- [ ] Open questions Q-1, Q-7, Q-9 resolved (Q-2, Q-4, Q-6 may remain open — declared deferrals, not gaps)
- [ ] All risks have mitigations — reviewer note: each carries one; R-1 and R-11 require a process change, not more text
- [ ] Ready for implementation — pending C-5, Frank's binding spec-gate, and Danny's approval

---

## Readiness Statement for the Re-Gate

**Plainly and unambiguously: no. The package is not completely free of blocking findings, and I do
not recommend invoking Frank's attempt 2/3 in its current state.**

I want to be exact about what I am and am not saying, because the finding is small and the
recommendation is not.

Four of this round's five fixes are genuinely and well done. C-4 and A-11 were both fixed **by
pointer rather than by an updated number**, which removes the trap instead of resetting it — that is
the better fix, not the minimum one. A-10 adopted the phrasing already used in three other places in
the same document, so the four statements now move together. RM-5 cites both owners. I verified each
by opening the file and re-deriving the property; none was accepted from its description.

**The fifth was applied to one of its two sites.** `02`:336's "5 independent queries" is gone.
`02`:37's "5 independent queries (§4)" is still there, above an enumeration of eight, in a document
whose own roadmap reads that enumeration correctly as "queries 1-8."

On intrinsic severity, C-5 is trivial — nobody would build the wrong thing because of it. I am
calling it blocking on three grounds, and I would rather state them than let the word do the work:

1. **It is the fourth consecutive occurrence of the class Frank failed this package on**, and Frank's
   attempt-1 verdict named this class as the reason the attempt was not worth spending on. Attempt 2
   of 3 is the second-to-last.
2. **The last round already decided this literal should go.** Shipping a package where the agreed fix
   was applied to one of two identical sites is a weaker position than shipping one where the fix was
   never attempted — it invites the question of what else was half-applied.
3. **The line carries a second, independent error** — the `(§4)` pointer, which sends an implementer
   to the `lastActivityAt` subquery when the queries described are in §5.3.

**The finding behind the finding, and it is worse than last pass's version.** C-4 survived because
`04` was not on the fix round's edit list. C-5 survived because **the previous review's sweep table
had no row for `02`:37** — it listed :336 as the sole site of that literal. The fix round did exactly
what it was told, completely, and still left the defect standing, because its instructions inherited
a reviewer's coverage gap. That makes the review itself a shared well: a fix round that derives its
edit list from a reviewer's enumeration cannot exceed that reviewer's enumeration. This pass caught
it only because it ran a per-document regex rather than re-reading the flagged sites — and I would
not bet that a regex I wrote by hand has no blind spot of its own.

**So my recommendation, which has hardened since last pass:**

1. Fix C-5 — one line, delete the count, correct the pointer to §5.3.
2. Take A-12, A-13 and U-3 in the same touch. All three are single-clause, all three are the same
   family, and A-13 in particular now makes `03` and `04` treat an identical construct differently.
3. **Then run a scripted doc-set check before invoking Frank** — not a fifth prose sweep. Q-9 asked
   whether this was worth doing before attempt 2 was spent when the count was three. It is four now,
   and the fourth one specifically defeated a careful, targeted fix round. The script's spec is the
   Count-Literal Sweep table in this document; the check it must assert is "no literal count of
   another document's or another section's enumeration appears in `01`–`04`." That is a short script,
   and it is auditable in a way that neither my reading nor the next reviewer's is.

Everything else in the package is in good shape and I want that on the record too: requirements
coverage is complete, architecture covers every story and every edge case, the UI spec has a flow per
story and a layout per screen, the roadmap orphans nothing and cycles nowhere, the schema references
all resolve to real migrations, and the scope-leak audit is clean on every INTAKE §3 exclusion. The
non-blocking list is long but every item on it is a single clause, and none of them makes any
document state something false about another.

---

## Reviewer's Note on Method

**The sweep was run as a per-document regex classification, not as a re-read.** That distinction is
load-bearing: procedure 1 (reading all four documents front to back) did not surface `02`:37, and
neither did the previous pass, which also read all four documents. Procedure 2 did, on the first
pass over `02`. Where this review's coverage is stronger than the last one's, that is the reason —
and it is an argument for the script, not for this reviewer.

Where this review says "verified," a primary source was opened. `src/types/domain.ts` was opened to
re-derive `InvestigationStatus`'s member set rather than accept `03`:290's parenthetical enumeration
as complete. `02` §5.3's eight query blocks were counted directly, and cross-checked against `04`:80's
independent reading of the same block. Route-pattern strings and both exact-copy strings were
compared literally across all four documents rather than trusted to match. Where this review says
"accepted" — U-2's presentational-node argument, RM-4's slice sizing — a stated rationale was judged
sound without independent proof. Those labels are not interchangeable.

**Shared-well caveat, restated because it has not changed:** the four spec documents share one
upstream source (`DESIGN-PROPOSAL.md`). This review constrains the four docs against that source and
against the live schema; it does **not** independently re-validate `DESIGN-PROPOSAL.md` itself. Any
error inside the design proposal is inherited by all four docs and by this review, and no amount of
cross-checking among the four would reveal it.

**A caveat on this review's own claims, and it now has direct evidence behind it.** The previous pass
wrote that its enumerate-and-classify sweep "is still a human-equivalent procedure run once by one
reviewer over one document set" and "should not be cited as evidence that no fourth occurrence
exists." **That caveat was correct, and C-5 is the fourth occurrence it warned about** — sitting in
`02`, a document that pass certified as carrying the count family at exactly one site. This pass used
a stricter procedure and found it. I have no basis for claiming my procedure has no blind spot of its
own; I have only the observation that each successive pass has found one more instance, which is not
the shape of a converging search. **Do not cite this document as evidence that no fifth occurrence
exists. The script is the fix; this table is its specification.**
