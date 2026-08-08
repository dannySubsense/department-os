# 05 — Spec Review: Problem Department — Vertical Slice MVP

**Review pass**: 7 (canonical — passes 1–6 preserved in git history)
**Reviewer**: @spec-reviewer (independent)
**Scope**: INTAKE, INTERVIEW, NORTH-STAR, 01-REQUIREMENTS, 02-ARCHITECTURE, 03-UI-SPEC, 04-ROADMAP
**Purpose**: Final verification before Frank's binding LANE: spec-gate, **attempt 3 of 3 (last available)**
**Verdict**: **READY — unqualified yes.** Zero open blocking defects. Zero open non-blocking defects.

---

## 1. Prior-Pass Blocking Defects — Closure Verification

The immediately-prior pass left exactly two open defects (B-3, B-4), both stale-count survivors of the
sub-agent-crash / `git checkout HEAD` recovery cycle. Both were re-verified by reading the current
file bytes, not by accepting the orchestrator's fix report.

### B-3 — CLOSED ✅

`04-ROADMAP.md` Slice 9 Goal, lines 604–606, current text:

> "...This slice also owns persisting `BriefVersion.negativeFindings` per Architecture §3's
> `NegativeFinding` mechanism (G-1): the concrete, fail-closed representation of "no X was found"
> for the **four** Brief elements that can legitimately record absence (Problem Definition is
> non-negatable — Q-2)."

`five` → `four` applied. The parenthetical naming Problem Definition as non-negatable was added,
which is stronger than the minimum fix — it makes the sentence self-checking rather than relying on
a reader cross-referencing Q-2. Consistent with 01 §Required Brief Elements, 02's `BriefElement`
union (L542–546), and 03 L446–460.

### B-4 — CLOSED ✅

`04-ROADMAP.md` Slice 10 Tests, lines 785–793, current text:

> - [ ] For each of the **4** sections that render `NegativeFindingNotice` (Evidence, Demand
>   Evidence's signal-type field, Existing-Solution Landscape, Gap Hypothesis), given a
>   `BriefVersion` whose `negativeFindings` array contains a `NegativeFinding` row with the
>   corresponding `element` value, `NegativeFindingNotice` renders that row's `statement` as a
>   completed, non-error, non-loading statement in the section's normal layout position — never
>   sharing visual/structural treatment with a true loading/error empty state (G-18).
> - [ ] The Problem Definition section never renders `NegativeFindingNotice` under any
>   circumstance — `'problem-statement'` is not a member of `BriefElement`, so no matching
>   `NegativeFinding` row can exist (Q-2 correction).

Count corrected to 4; Problem Definition removed from the enumeration; and a **new positive
negative-test** was added asserting the non-negatability structurally (via `BriefElement`
membership, not via UI convention). The four named sections match `BriefElement`'s four members
exactly and match 03-UI-SPEC L662–666's "4 of the seven" accounting.

**Both B-3 and B-4 are genuinely closed at current file state.**

---

## 2. Independent Sweep — All Four Live Documents

Deliberately run wider than the prior passes, because this doc set has a history of a stale artifact
surviving a too-narrow check. `.gate-snapshots/` is excluded by design: those are frozen historical
records, and stale `five`/`0–5` text there is correct-by-definition, not a live defect.

### 2a. Every live-doc occurrence of `five` / `5` / `0–5` in a count-bearing context

| Location | Text | Verdict |
|---|---|---|
| `01:19, 21, 170, 204` | "four are **negatable**", "four negatable elements" | ✅ Correct |
| `02:528` | "the four elements Danny's original Q-2 decision named as negatable" | ✅ Correct |
| `02:531` | "a prior revision incorrectly generalized this carrier to all **five** elements" | ✅ Correct — this is *historical narration of the defect that was fixed*, not a live claim. Immediately followed by the corrective statement. Intentional and accurate. |
| `02:535–536` | "rather than four nullable fields ... across the four negatable elements" | ✅ Correct |
| `02:542–546` | `BriefElement` = exactly 4 members | ✅ Correct — no `'problem-statement'` |
| `02:1051` | "names only the four elements Q-2 (Danny, binding) declared negatable" | ✅ Correct |
| `03:25` | "this replaces the prior **five** screen/state entries framing" | ✅ Correct — unrelated axis (screen count, G-17), historical narration of a different fix. Not a Brief-element count. |
| `03:447, 450, 456` | "the **four** Brief elements", "`NegativeFinding[]`, **0–4** rows", "each of these four elements" | ✅ Correct |
| `03:662, 665, 673, 681` | "**4 of the seven**", "These four map exactly onto ... `BriefElement`", "The remaining **2 of the seven**", "the 4-of-7 group" | ✅ Correct, and the 4+1+2=7 accounting closes exactly (4 negatable + Problem Definition + Uncertainty + Decision Recommendation) |
| `03:700` | `problemStatements[]` "(always ≥1 for a Completed Brief; not negatable, no absence path)" | ✅ Correct |
| `03:793–794` | "`negativeFindings[]` is documented as 0–4 rows (not 0–5)" | ✅ Correct |
| `04:257` | "the closed **five-value** `EvidenceLabel` set" | ✅ Correct and unrelated — `EvidenceLabel` genuinely has 5 members (fact/observation/interpretation/assumption/unknown) per 01 US-3 AC1. Not a Brief-element count. |
| `04:51, 421, 947` | Slice **5** references | ✅ Slice ordinal, not a count |
| `04:269, 694, 699, 1053` | "four negatable elements" | ✅ Correct |
| `04:698` | "`negativeFindings.length` ... (**0–4** rows)" | ✅ Correct |
| `04:606, 785` | B-3 / B-4 sites | ✅ **Now correct** |
| `04:1025` | "**4 of the 7** required Brief elements ... Problem Definition excluded, non-negatable per Q-2" | ✅ Correct |
| `04:933` | "Flow **5** renders correctly" | ✅ Flow ordinal |

**No stale "five" in a negatable-elements context survives in any live document.**

### 2b. Problem-statement-negatable assumption hunt (beyond prose counts)

Checked every live-doc occurrence of `problem-statement` / `ProblemStatement` (45 across 01–04),
including sample data, code comments, TypeScript unions, tables and ASCII layouts — not just prose:

| Surface | Finding |
|---|---|
| `02` `BriefElement` union (L542–546) | 4 members; `'problem-statement'` structurally absent. This is the load-bearing guarantee — the non-negatability is enforced by the type, not by convention. ✅ |
| `02` `NegativeFinding` (L548–556) | `element: BriefElement` — cannot hold `'problem-statement'`. ✅ |
| `02:613, 789, 791, 1051–1053` | Doc comments consistently state Problem Statement is non-negatable and handled by the R-4 fail-closed path. ✅ |
| `03:94–96, 312, 359, 457–463, 668–672, 700, 793` | UI spec: no `NegativeFindingNotice` render path for Problem Statement; Generation-Failed-State table row (L312) explicitly names it as the dominant reason for that state. ✅ |
| `03` ASCII layouts + Data-Source table | Checked row by row: `negativeFindings[]` cited only for the four sections; `problemStatements[]` row carries the "not negatable, no absence path" annotation. ✅ |
| `04:275, 303, 626–632, 689–693, 763–768, 1056` | Roadmap: Slice 4 surfaces absence as a *generation-failure signal*, Slice 9 enforces the hard stop, Slice 10 never renders the notice. ✅ |
| `01:11, 19, 21, 105, 167, 170, 191, 204, 216` | Requirements: no-absence-path stated in the canonical element list, the Summary rule, Constraints, US-1 AC5, and two Edge Case rows. ✅ |

No sample JSON, example payload, table row, or ASCII mockup anywhere in the live set constructs or
implies a `NegativeFinding` for the problem statement.

### 2c. Editing-artifact sweep (whole-file, not tail-only)

Searched all four live documents for `<invoke>`, `<parameter>`, `<function_calls>`, `</content>`,
`<thinking>`, `antml:` prefixes, merge-conflict markers (`<<<<<<<`/`>>>>>>>`), `TODO`, `TKTK`, and
unbalanced/orphan code fences. **Zero hits in live documents.** All ``` occurrences in 02 and 03 are
balanced open/close pairs delimiting TypeScript blocks and ASCII layouts. The only textual mention
of `</content>` in the sprint directory is inside prior `05-REVIEW.md` prose describing the earlier
defect — now superseded by this file.

---

## 3. File Structure Integrity — 04-ROADMAP.md

| Check | Result |
|---|---|
| Line count | 1069 lines, ending at the `negativeFindingRef` Output-Verification bullet (L1063–1068) + trailing newline. Matches the expected ~1068. ✅ |
| Slice count | Exactly 12 (`### Slice 1`…`### Slice 12`), strictly ascending, no gap, no duplicate. ✅ |
| Section skeleton | Scope Discipline → Dependency Map → Slice Overview → Slice Detail → Sequence Rules → Deferred → Output Verification. Single occurrence each. ✅ |
| Tail | Clean — ends mid-checklist-complete, no truncation, no repeated block, no orphan fence. ✅ |
| Duplication | No slice body appears twice; no section header repeats. ✅ |

---

## 4. Regression Check — Previously-Verified Items Still Correct

| # | Item | Status |
|---|---|---|
| 1 | **Danny's blocking finding 1** — stance lives on the `ClaimVersionEvidence` *relationship*, not `EvidenceItem` | ✅ `02` §3; `04` L250–261 (Slice 4 builds it); `04` L746–750 (Slice 10 reads stance from the ref). `EvidenceItem.stance` appears nowhere in the live set. |
| 2 | **Danny's blocking finding 2** — `ProblemBrief.currentVersionId` single-writer carve-out | ✅ `02` L560–576 (full reasoning for option (a) over (b)); `04` L660–666 + Slice 9 test L673–676 asserts `id`/`investigationId`/`createdAt` unchanged and does not over-assert against `currentVersionId`. |
| 3 | **Danny's blocking finding 3** — non-empty required-citation enforcement folded into R-4, with `citedDemandSignalIds` as the sole named exception | ✅ `04` L576–583 (both the rule and the exception, adjacent); Slice 9 L682–684 composes it into `generation-failed`; Output Verification L1043–1045. |
| 4 | **Danny's blocking finding 4** — `getAssignedStateAsRecorded` two-query split | ✅ `04` Slice 12 L876–901 + tests L917–921; Output Verification L1046–1048. No residual bare `getAssignedState` for the decision-time reconstruction path. |
| 5 | **Four negatable elements' treatment unchanged** | ✅ Ownership is a clean partition: Slice 4 → `'evidence'`, Slice 5 → `'demand-signal-type'`, Slice 6 → `'existing-solution'` + `'gap-hypothesis'`. None construct `NegativeFinding` rows; all three surface absence *inputs*. Slice 9 is the sole persister and sole enforcer. Slice 10 is the sole renderer. No second parallel validation mechanism. |
| 6 | **`negativeFindingRef` id-based encoding + precise iff-trigger** | ✅ `02` L430–440: optional `string` holding `NegativeFinding.id`; trigger stated as "populated **if and only if** such a `NegativeFinding` row exists (i.e. `demandSignalIds` is empty)"; explicitly *not* derived from `level` or `citedDemandSignalIds`; the signals-found-none-cited case is named as excluded. `02` L549–551 gives `NegativeFinding` the `id` that makes the ref resolvable. `04` Slice 5 L347–355 restates identically in substance, with a **positive** test (L362–368) and a **negative** test (L369–372) covering exactly the excluded case. `01` US-4 AC3 (L118) states the requirement and its "absent when signals were found" clause. Zero drift across three documents. |
| 7 | **AC count = 35** | ✅ Recounted from `01` §Acceptance Criteria: US-1 5, US-2 2, US-3 2, US-4 5, US-5 6, US-6 1, US-7 1, US-8 3, US-9 3, US-10 3, US-11 2, US-12 1, US-13 1 = **35**. `04`'s Output Verification (L1000–1002) correctly declines to restate the number, pointing at `01` instead — the right fix for this doc set's AC-count-drift history. |
| 8 | **Canonical seven-element list referenced by pointer, not restated as a count** | ✅ `01` L9 declares the rule; `02`, `03` L655–660, `04` L1034–1039 all comply. No document splits demand into two elements or drops Decision Recommendation. |

**No regressions introduced by the B-3/B-4 edits.** Both were single-line-scope textual corrections
inside Slice 9's Goal and Slice 10's Tests; neither touched a schema, contract, dependency edge, or
adjacent slice. The B-4 edit is net-additive (one new test).

---

## 5. Cross-Document Coverage

### Requirements → Architecture

| Requirement | Architecture Coverage | Status |
|---|---|---|
| US-1 (submit, durable URL, 4 statuses) | `Investigation` + `status` union, `submitSources`, `getInvestigation` | ✅ |
| US-2 (problem statements, clustering) | `ProblemStatement` (who/context/consequence + citations), `Claim`/`ClaimVersion` | ✅ |
| US-3 (labels, contradicting evidence) | `EvidenceLabel` (5), `ClaimVersionEvidenceRef.stance` | ✅ |
| US-4 / US-12 (signal type vs confidence, Personal Pull separated) | `DemandSignal`, `DemandConfidenceClassification` (+`negativeFindingRef`), `PersonalPullNote` | ✅ |
| US-5 (independent web search, scope/limits) | `WebSearchQuery`, `WebSearchResult`, `ExistingSolution`, `GapHypothesis` | ✅ |
| US-6 (uncertainty) | `Uncertainty` three named lists | ✅ |
| US-7 (recommendation) | `Recommendation` + rationale | ✅ |
| US-8 / US-9 (decision binding, Watch conditions, no reopen) | `Decision.briefVersionId` FK, `ReconsiderationCondition`, `recordDecision` | ✅ |
| US-10 (traceability, versioning, invalidation) | `BriefVersion` + `supersedesVersionId`, `StatusEvent`, validity query pair | ✅ |
| US-11 (provenance, schema validation) | `GenerationRun`, `GenerationStep`, `SchemaValidationRecord`, R-4 | ✅ |
| US-13 (minimal review/decide surface) | `getBriefForReview`, Q-7 same-URL rule | ✅ |
| Negative-finding contract (four elements) | `BriefElement` (4), `NegativeFinding`, fail-closed gate | ✅ |

### Requirements → UI

| User Story | Screen / Flow | Status |
|---|---|---|
| US-1 | Submission Screen; Investigation Screen — Generating / Blocked / Generation-Failed; Flows 1–2 | ✅ |
| US-2…US-7, US-12 | Investigation Screen — Completed State, sections 1–7 + Personal Pull | ✅ |
| US-8, US-9, US-13 | `DecisionForm` + `DecisionConfirmationPanel` (in-place, same URL, Q-7); Flows 3–4 | ✅ |
| US-10 | `DecisionHistoryBanner`, superseded/assigned-state surfacing; Flow 5 | ✅ |
| US-11 | Provenance line; `CitationScopeNotice` (R-1 limitation as visible copy) | ✅ |

### Architecture + UI → Roadmap

| Component | Slice | Status |
|---|---|---|
| Runtime/storage decision (Q-8, G-22 stopping rule) | 1 | ✅ |
| Core persistence, Intake Service, Submission Screen | 2 | ✅ |
| Source Resolver, `getInvestigation`, Blocked / Generation-Failed states | 3 | ✅ |
| Evidence/Claim model, Extraction & Clustering, Evidence Labeler | 4 | ✅ |
| Demand Analyzer, Personal Pull Extractor, `negativeFindingRef` | 5 | ✅ |
| Landscape Researcher (+`searchWeb`), Gap Hypothesis Generator | 6 | ✅ |
| Uncertainty Compiler, Recommendation Engine | 7 | ✅ |
| Provenance Recorder, R-4 schema validation + citation non-emptiness | 8 | ✅ |
| Brief Assembler, `NegativeFinding` persistence + fail-closed gate, live generation-failed transition | 9 | ✅ |
| Completed State read path, `getBriefForReview`, `CitationScopeNotice`, `SearchScopeNotice`, `NegativeFindingNotice` | 10 | ✅ |
| Decision Recorder, `DecisionForm`, `DecisionConfirmationPanel` | 11 | ✅ |
| Validity/Invalidation Service, `getAssignedStateAsRecorded`, `DecisionHistoryBanner` | 12 | ✅ |

No orphan component. No slice without a Done-When. Dependency graph is a DAG (5/6 the only
parallelizable pair, both strictly downstream of 4).

---

## 6. Gaps

**None open.** All gaps identified across passes 1–6 (D-15, G-1, G-11, G-12, G-13, G-17, G-18,
G-20, G-21, G-22, F-3, F-5, N-4, R-1, R-4, Q-1…Q-8, B-1, B-2, B-3, B-4) are closed in the live
documents and each is traceable to a specific line in 01–04.

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Slice 1 (runtime/storage evaluation) is a decision slice, not an implementation slice — every downstream file path is "TBD by Slice-1-selected stack" | H | M | Explicitly acknowledged in the roadmap; G-22 stopping rule bounds the evaluation. Accepted by design — this MVP is scoped to adopt-not-commit (01 Out-of-Scope). |
| Independent web search has no chosen vendor (01 Out-of-Scope) | H | M | Slice 6 specifies the *capability* contract (`searchWeb`, `WebSearchQuery`/`WebSearchResult` preservation), so vendor swap is an implementation detail behind a named boundary. |
| R-1: citations are checked for *presence*, not *correctness* | H | M | Explicitly surfaced to the human as `CitationScopeNotice` copy on the Completed screen — the limitation is disclosed in-product, not buried in a doc. Correct handling for an MVP. |
| Bounded-repair budget (`MAX_REPAIR_ATTEMPTS`) is a tunable with no empirical basis | M | L | Currently expressed as a bound, not a magic number in a data path — the spec asserts "bounded, no open-ended loop" rather than fabricating a calibrated value. Should carry a `PROVISIONAL` marker with a named owner when the concrete integer is chosen at implementation. Flagged for forge, not blocking for spec. |
| Twelve slices is a large surface for one milestone | M | M | Slices are vertically sliced and independently testable; PROGRESS.md is ground truth per repo workflow. |

---

## 8. Assumptions

| Assumption | Impact if Wrong |
|---|---|
| `.gate-snapshots/` are frozen historical artifacts, not live specs | Stale `five`/`0–5` text in those directories would count as live defects. (Verified: every such hit is confined to `.gate-snapshots/`.) |
| A "source artifact" is a URL or pasted text block only (01 L220) | File uploads/screenshots would need an architecture amendment. |
| One submission → exactly one Problem Brief (01 L221) | A submission needing to split into multiple problems is an architecture-stage question, explicitly not resolved here. |
| "Four negatable elements" is Danny's original binding Q-2 decision, and the five-element generalization was the deviation | If the generalization were in fact intended, the current doc set is wrong in the opposite direction. 01 L19 states the provenance explicitly ("this is Danny's original binding Q-2 decision; a prior revision incorrectly generalized negatability to Problem Statement as well, which has been reverted"), and Danny's PR review is cited as binding. |

---

## 9. Open Questions

**None.** Q-1 through Q-8 are all resolved and reflected consistently across 01–04. No question in
any live document is left in an `Open` or `TBD` state that would block implementation.

---

## 10. Approval Checklist

### Requirements (01)
- [x] Internally consistent — 35 ACs, canonical seven-element list, four negatable elements
- [x] Problem definition's no-absence-path stated in Summary, Constraints, US-1 AC5, and Edge Cases
- [x] Acceptance criteria are testable
- [x] Out of scope populated and concrete
- [ ] Reviewed by human (Danny)

### Architecture (02)
- [x] Every requirement has coverage
- [x] Schemas are valid TypeScript, not pseudocode
- [x] `BriefElement` structurally enforces non-negatability of the problem statement
- [x] `negativeFindingRef` is id-based with an exact iff-trigger
- [ ] Reviewed by human (Danny)

### UI Spec (03)
- [x] Every user story has a flow; every screen/state has a layout
- [x] Loading / error / negative-finding states are structurally distinguished (G-18)
- [x] 4-of-7 `NegativeFindingNotice` accounting closes exactly against the canonical seven
- [ ] Reviewed by human (Danny)

### Roadmap (04)
- [x] Every architecture and UI component is in a slice
- [x] No circular dependencies; DAG confirmed
- [x] Each slice has concrete Done-When criteria
- [x] 1069 lines, 12 slices, clean tail, no truncation or duplication
- [ ] Reviewed by human (Danny)

### Overall
- [x] All open questions resolved
- [x] All risks have mitigations
- [x] B-3 and B-4 closed and independently verified at current file state
- [x] No regressions against Danny's four original blocking findings
- [x] **Ready for Frank's binding LANE: spec-gate (attempt 3 of 3)**

---

## 11. Verdict

**YES — unqualified. Submit to Frank's binding spec-gate, attempt 3.**

There is no reasonable doubt remaining. Every defect raised across six prior review passes is closed
and verified against current file bytes rather than a summary. The two survivors of the crash-recovery
cycle (B-3, B-4) are fixed, and the B-4 fix is net-additive — it added a structural non-negatability
test that did not previously exist. The independent whole-file sweep found **zero** stale
five-element references, **zero** editing artifacts, and **zero** places where a
problem-statement-negatable assumption still lurks in prose, schema, sample data, table, or layout.

The strongest evidence that this class of defect cannot recur silently is structural rather than
textual: `'problem-statement'` is not a member of `BriefElement` (02 L542–546), so a
`NegativeFinding` for it is unconstructible by type — the prose counts across 01–04 now merely
*describe* a guarantee the schema already enforces.

One item is forwarded to forge rather than held against the spec gate: the concrete value of
`MAX_REPAIR_ATTEMPTS` must arrive with a citation or a `PROVISIONAL — unvalidated` marker and a
named owner. The spec correctly asserts only "bounded," inventing no number — which is why this is
a forge-stage obligation, not a spec-stage defect.
