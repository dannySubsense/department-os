# Spec Review: Problem Department — Vertical Slice MVP

**Status**: Review complete — **0 blocking gaps**, READY for Frank spec-gate attempt 2
**Date**: 2026-08-08
**Reviewer**: spec-reviewer (independent re-review, post-G-1/G-2/G-3 fixes)
**Scope**: Targeted verification that G-1, G-2, G-3 are genuinely closed; that Danny's four
original blocking PR-review findings have not regressed; that no new drift was introduced by this
fix round; plus a full completeness/consistency pass over `01`–`04`.

This document supersedes the prior review pass (preserved in git history). Every verdict below was
reached by reading the CURRENT text of `INTAKE.md`, `INTERVIEW.md`, `NORTH-STAR.md`,
`01-REQUIREMENTS.md`, `02-ARCHITECTURE.md`, `03-UI-SPEC.md`, `04-ROADMAP.md`. No fix report and no
prior-pass snapshot was accepted as evidence.

---

## 1. Closure Verification — Prior Pass's Gaps (G-1, G-2, G-3)

| # | Gap | Verdict | Evidence inspected (current text) |
|---|---|---|---|
| G-1 | No schema representation existed for a recorded negative finding | **CLOSED** | `02` §3 adds a `// ---- Negative findings (G-1 fix) ----` block: `type BriefElement = 'problem-statement' \| 'evidence' \| 'demand-signal-type' \| 'existing-solution' \| 'gap-hypothesis'` and `interface NegativeFinding { briefVersionId; element: BriefElement; statement: string }`, with a doc comment explaining why absence is recorded one level above the closed unions rather than by adding a `'none-found'` member (which would have reopened the empty-citation loophole finding #4 closed). `BriefVersion.negativeFindings: NegativeFinding[]` (0–5 rows) added. `02` §4 `generateBriefVersion`'s fail-closed contract now defines "populated" per element as "EITHER its id array is non-empty OR a `NegativeFinding` row for that element exists on this `BriefVersion` with a non-empty `statement` — both empty/absent is a validation failure on the same R-4 fail-closed path." `getBriefForReview` returns `negativeFindings` at top level. `02` §5 gains the matching Pattern ("Element-level negative-finding carrier, not a type-level escape hatch"). |
| G-2 | `getBriefForReview().assignedState` did not name its query | **CLOSED** | `02` §4: `assignedState: AssignedValidityState; // this version's own current-knowledge state, via getAssignedState (not getAssignedStateAsRecorded — Review is a live surface, not a decision-time reconstruction; G-2)`. Consistent with `03` Flow 5. |
| G-3 | `04` Slice 10 typed `ClaimVersion.evidence` as `ClaimVersionEvidenceRef[]` | **CLOSED** | `04` Slice 10 now reads `evidence: NonEmptyArray<ClaimVersionEvidenceRef>`. A repo-wide grep for `ClaimVersionEvidenceRef[]` returns zero hits in `01`–`04` (only in `.gate-snapshots/` and this review's own prior-pass quotation). |

### G-1 mechanism — coherence audit (the specific checks requested)

- **All five applicable elements covered?** Yes. `BriefElement`'s five members match exactly the
  five elements `01` line 19 / the Edge Cases table treat as legitimately negatable, and exactly
  the five sections `03` renders `NegativeFindingNotice` for. `03`'s "5 of the seven" accounting
  explicitly states Uncertainty and Decision Recommendation are structurally always-populated, are
  **not** `BriefElement` members, and carry no negative-finding case. `04`'s F-5 verification line
  restates the same 5-of-7. Three documents agree on the same enumeration with no drift.
- **Does the fail-closed rule prevent both-empty?** Yes, and it is tested. `02` §4 states both-empty
  is a validation failure on R-4's path; `04` Slice 9 Implementation Notes restate it per element
  with the concrete id arrays named (`problemStatementIds`, evidence via
  `claimVersionIds`/`ClaimVersion.evidence`, `demandSignalIds`, `existingSolutionIds`,
  `gapHypothesisIds`); and `04` Slice 9 has an explicit boundary test: *"Given a run in which one of
  the five negatable elements has both an empty id array AND no corresponding `NegativeFinding` row
  (or a `NegativeFinding` row with an empty `statement`), the fail-closed rule rejects the run … no
  `BriefVersion` is persisted."* The empty-`statement` case is covered too — this is the exact
  "populated, explicit statement, not merely non-null" check `01` line 19 demands.
- **Does it prevent both-populated (id array non-empty AND a row present)?** Yes, though by test
  rather than by contract prose. `02` §3's `BriefVersion.negativeFindings` comment states "an
  element with a non-empty id array carries no row here," and `04` Slice 9's test asserts
  `negativeFindings.length` equals the number of elements that were empty — which fails if a
  spurious row is emitted. `02` §4's rule text itself only forbids both-empty. Cosmetic asymmetry,
  recorded as G-5 below; not blocking, since the invariant is stated in §3 and tested in Slice 9.
- **Does the UI render it correctly?** Yes. `03`'s five section layouts each name the
  `negativeFindings` entry for their own `element` and display its `.statement`; the data-source
  table cites `negativeFindings[]` for all five; the component hierarchy keys each
  `NegativeFindingNotice` off `element ===` its section's value; and `03` explicitly states "There
  is no separate 'explicit absence statement' field per Brief element —
  `negativeFindings`/`NegativeFinding.statement` is the one mechanism." The
  recorded-negative-finding vs. loading/error-empty-state distinction (G-18) survives intact and is
  now keyed to a concrete field. `04` Slice 10 has a matching per-section render test.
- **Ownership chain.** Slice 9 (Brief Assembler) is named as the sole persister of
  `NegativeFinding` rows and sole enforcer of the rule; Slices 5 and 6 explicitly state they do
  **not** construct rows and instead surface absence data upstream, each with a matching test. The
  previously-unimplementable Slice 5 test is rewritten and is now implementable against the current
  schema. This is the correct shape — one writer, one validation path, no parallel mechanism.

---

## 2. Regression Check — Danny's Four Original Blocking Findings

Re-verified against current text this pass; none regressed.

| # | Finding | Verdict | Evidence |
|---|---|---|---|
| 1 | Bitemporal query conflated effective-time and knowledge-time | **STILL CLOSED** | `02` §1.3 keeps the explicit two-query split with the failure mode it prevents. §4 defines `getAssignedState` (effectiveAt ≤ asOf, no recordedAt bound) and `getAssignedStateAsRecorded` (effectiveAt ≤ asOf AND recordedAt ≤ knownAsOf; `knownAsOf` required, no default). `04` Slice 12 binds `knownAsOf = Decision.decidedAt` and retains the divergence test. `getAssignedState*` naming preserved per Q-3; no `getValidityAt`/`isValid` survives in `01`–`04`. |
| 2 | `EvidenceItem.stance` was wrong | **STILL CLOSED** | `EvidenceItem` carries no `stance` and says why. `ClaimVersionEvidence` + `ClaimVersionEvidenceRef` carry it per-relationship. `ClaimVersion.evidence: NonEmptyArray<ClaimVersionEvidenceRef>`. No `ClaimVersion.evidenceItemIds` field survives (only prohibitions naming it). `04` Slice 4 keeps the shared-item/two-stances test; Slice 10 reads stance from the ref. `03`'s Evidence data-source row reads stance per-relationship. |
| 3 | `ProblemBrief.currentVersionId` contradicted "never mutated" | **STILL CLOSED** | `02` §3's option-(a) carve-out is intact (derived index state, sole permitted single-writer field, updated exactly once per successful `generateBriefVersion`, with stated reasoning over derive-from-lineage), mirrored in §5 Patterns and `04` Slice 9. Slice 9's new `negativeFindings` responsibilities did not disturb it. |
| 4 | Citation arrays could be empty despite "non-empty by construction" | **STILL CLOSED, and not weakened by the G-1 fix** | `NonEmptyArray<T>` still applied to `ClaimVersion.evidence`, `ProblemStatement.supportingClaimVersionIds`, `DemandSignal.evidenceItemIds`, `ExistingSolution.evidenceItemIds`, `GapHypothesis.evidenceItemIds`. Critically, the G-1 fix deliberately did **not** relax any of these, and deliberately did **not** add a `'none-found'` member to `DemandSignalType`/`EvidenceLabel` — `02` §5's new Pattern states this rationale explicitly. `citedDemandSignalIds` remains the sole named `string[]` exception, stated identically in `02` §3/§4/§5 and `04` Slices 5/8. |

---

## 3. New Drift Check (this fix round)

Checked specifically for drift introduced by the `NegativeFinding` addition:

- Slice count still 12; DAG unchanged; the fix landed in existing Slices 5, 6, 9, 10 in place.
- No new entity was introduced beyond `NegativeFinding`/`BriefElement`; no second validation
  mechanism (Slice 9 explicitly applies R-4's existing path rather than building a parallel one).
- `03`'s 5-of-7 accounting, `04`'s F-5 line, and `02`'s `BriefElement` union all enumerate the same
  five elements — no count or membership drift.
- `02`'s Section 7 / Output Verification checklist and `04`'s verification block were both updated
  to mention the G-1 wiring; neither overclaims (`02`'s status line still reads "attempt-1 PASS …
  re-verification pending," matching `GATE-LOG.md`).
- Personal Pull optional-framing alignment (`NORTH-STAR`, `01` US-12, `02` §2/§3, `03`) unchanged
  and still consistent.

Two minor, non-blocking items surfaced (see §4).

---

## 4. Gaps Found This Pass

### G-4 (Minor, non-blocking) — Slice 4 is named as an upstream absence-statement owner but has no note or test for it

`04` Slice 9 states the `NegativeFinding.statement` "must be a real, non-placeholder absence
statement surfaced by the owning upstream component (e.g. Slice 5 for `'demand-signal-type'`,
Slice 6 for `'existing-solution'`/`'gap-hypothesis'`, **Slice 4** for
`'problem-statement'`/`'evidence'`)." Slices 5 and 6 each received an explicit Implementation Note
and a matching test for that surfacing obligation; **Slice 4 received neither**. Slice 4's notes
cover the citation/stance rules only.

Not blocking: Slice 9 owns and tests the fail-closed boundary for all five elements including these
two, so no element can slip through unvalidated. The consequence is only that a Forge session
reaching Slice 4 has no local instruction to produce absence context for the two elements Slice 9
will later demand it for — a sequencing inconvenience, not a correctness hole. One Implementation
Note plus one test in Slice 4, mirroring Slice 6's wording, closes it.

### G-5 (Cosmetic) — `02` §4's rule text forbids both-empty but not both-populated

`generateBriefVersion`'s contract states the EITHER/OR and that "both empty/absent is a validation
failure." The complementary invariant — an element with a non-empty id array carries **no**
`NegativeFinding` row — appears only in `BriefVersion.negativeFindings`'s doc comment and is
enforced only via Slice 9's length-equality test. Stating it as an exclusive-or in §4 would make
the contract self-contained. No behavioural consequence.

### Observation (not a gap) — evidence/problem-statement absence co-occurrence

Because `ProblemStatement.supportingClaimVersionIds` is `NonEmptyArray<string>` and
`ClaimVersion.evidence` is `NonEmptyArray<ClaimVersionEvidenceRef>`, an empty `claimVersionIds`
necessarily implies an empty `problemStatementIds`. The schema handles this correctly (two
independent `NegativeFinding` rows, one per element); no contradiction, noted only so a Forge
session does not read the co-occurrence as a bug.

### Independent check: did `01-REQUIREMENTS.md` need changing for G-1?

Verified independently: **no**. `01` line 19 explicitly delegates "which specific field/schema shape
carries the explicit-absence statement" to architecture, and the Edge Cases rows ("demand-signal-type
list explicitly records 'none found'", "no existing solutions were found within that scope") are
satisfied verbatim by a `NegativeFinding.statement`. `01` is untouched and correct.

---

## 5. Requirements → Architecture Coverage

| Requirement | Architecture Coverage | Status |
|---|---|---|
| US-1 (submit, durable URL) | Intake Service, `submitSources`, `Investigation`/`Submission`/`SourceArtifact`, `getInvestigation` (Q-7) | ✅ |
| US-2 (extract + cluster) | Extraction & Clustering Engine, `ProblemStatement`, `Claim`/`ClaimVersion` | ✅ |
| US-3 (evidence labels, contradicting) | Evidence Labeler, `EvidenceLabel`, `ClaimVersionEvidence.stance` | ✅ |
| US-4 (signal type ⊥ confidence, no score) | Demand Analyzer, `DemandSignal` + `DemandConfidenceClassification`, `NegativeFinding('demand-signal-type')`, numeric anti-pattern | ✅ |
| US-5 (independent landscape research, gap) | Landscape Researcher, `searchWeb`, `WebSearchQuery`/`Result`, `ExistingSolution`, `GapHypothesis`, `NegativeFinding('existing-solution'\|'gap-hypothesis')` | ✅ |
| US-6 (uncertainty) | Uncertainty Compiler, `UncertaintyStatement` (3 lists) | ✅ |
| US-7 (recommendation) | Recommendation Engine, `Recommendation` | ✅ |
| US-8 (decision bound to version) | Decision Recorder, `Decision.briefVersionId` FK | ✅ |
| US-9 (Reject retained, Watch conditions) | §1.4 Q-5, `ReconsiderationCondition`, `recordDecision` rejection rule | ✅ |
| US-10 (traceability, supersede, invalidation) | `BriefVersion` lineage, `StatusEvent`, `assignValidityState` + `dependentDecisionIds` via `getAssignedStateAsRecorded` | ✅ |
| US-11 (provenance, schema validation) | `GenerationRun`/`GenerationStep`/`SchemaValidationRecord`, R-4, MAX_REPAIR_ATTEMPTS = 1 (sourced to Danny's binding decision text) | ✅ |
| US-12 (Personal Pull quarantined) | `PersonalPullNote` fixed-label quarantine, Personal Pull Extractor | ✅ |
| US-13 (minimal review/decide surface) | Review Surface, `getBriefForReview` (incl. top-level `negativeFindings`), `recordDecision` | ✅ |
| `01` line 19 (non-empty permits explicit absence) | `BriefElement`/`NegativeFinding`, `generateBriefVersion` fail-closed EITHER/OR rule | ✅ |

## 6. Requirements → UI Coverage

| User Story | Screen/Flow | Status |
|---|---|---|
| US-1 | Submission Screen, Flow 1; Investigation Screen Generating | ✅ |
| US-2, US-3 | Completed State §1–2, ClaimGroup/ClaimEvidenceRow, per-relationship stance, `NegativeFindingNotice` for `problem-statement`/`evidence` | ✅ |
| US-4 | Completed State §3a/3b, level badge text-only, `NegativeFindingNotice` for `demand-signal-type` | ✅ |
| US-5 | Completed State §4–5, `SearchScopeNotice`, `NegativeFindingNotice` for `existing-solution`/`gap-hypothesis` | ✅ |
| US-6, US-7 | Completed State §6–7, always expanded, no negative-finding case (correctly justified) | ✅ |
| US-8, US-9 | Flow 3, DecisionForm, Watch condition sub-form | ✅ |
| US-9 (Reject) | Flow 4, no Reopen control anywhere | ✅ |
| US-10 | Flow 5, DecisionHistoryBanner (`priorDecisions` lineage, `assignedState`, `isSuperseded`) | ✅ |
| US-11 | ProvenanceLine; GenerationFailedState reason | ✅ |
| US-12 | PersonalPullSection, conditional + segregated | ✅ |
| US-13 | Investigation Screen Completed State, single durable URL | ✅ |

## 7. Architecture → Roadmap Coverage

| Component | Slice | Status |
|---|---|---|
| Runtime/storage evaluation (Section 6 capability table) | 1 | ✅ |
| Intake Service | 2 | ✅ |
| Source Resolver + `getInvestigation` | 3 | ✅ |
| Extraction & Clustering, Evidence Labeler, `ClaimVersionEvidence` | 4 | ✅ (see G-4, minor) |
| Demand Analyzer, Personal Pull Extractor, `demand-signal-type` absence input | 5 | ✅ |
| Landscape Researcher, `searchWeb`, Gap Hypothesis Generator, absence inputs | 6 | ✅ |
| Uncertainty Compiler, Recommendation Engine | 7 | ✅ |
| Provenance Recorder + R-4 + non-empty-citation enforcement | 8 | ✅ |
| Brief Assembler, `currentVersionId` single-writer rule, `NegativeFinding` persistence + fail-closed rule | 9 | ✅ |
| Review Surface / Completed State, `NegativeFindingNotice` rendering | 10 | ✅ |
| Decision Recorder + Form + Confirmation Panel | 11 | ✅ |
| Validity/Invalidation, `getAssignedState` + `getAssignedStateAsRecorded` | 12 | ✅ |

DAG re-verified: no circular dependencies; Slices 5/6 remain the only parallelizable pair; every
slice has concrete file paths (or an explicit "TBD by Slice-1-selected stack") and testable
Done-When criteria.

---

## 8. Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| R-1 Citation presence ≠ citation correctness | H | M | Named and accepted in `02` §4 and §5 Anti-Patterns; surfaced as fixed `CitationScopeNotice` copy in `03`; test in `04` Slice 10. Adequate. |
| R-4 Model emits out-of-schema structured output | H | H | Bounded repair (MAX_REPAIR_ATTEMPTS = 1, sourced) then explicit run failure; all attempts retained in provenance. Adequate. |
| Negative findings silently degrade to empty arrays in implementation | M | H | **Now mitigated** — `NegativeFinding` carrier + `generateBriefVersion` EITHER/OR rule + Slice 9 both-empty rejection test. Adequate. |
| Forge session emits a placeholder absence statement ("n/a") that passes the non-empty check | M | M | `02` §3 ("never a placeholder or restatement of the label") and `04` Slice 9 ("real, non-placeholder … surfaced by the owning upstream component") both prohibit it; not machine-checkable. Residual, accepted — same class as R-1. |
| Slice 1 finds no adequate runtime | M | H | Slice 1 stopping rule (G-22) HALTs to Danny with scored findings. Adequate. |
| Bitemporal query misuse at call sites | M | H | Two distinct names, `knownAsOf` required with no default, divergence test in Slice 12, read model now names its query (G-2 fix). Adequate. |
| Web-search vendor unavailable/rate-limited at implementation time | M | M | Vendor-agnostic capability contract; failed/blocked retrievals are first-class recorded state. Adequate. |

## 9. Assumptions

| Assumption | Impact if Wrong |
|---|---|
| `NonEmptyArray<T>` is a hint requiring runtime validation, not a static guarantee | Stated explicitly in `02`; if a Forge session treats it as proof, empty arrays reach persistence via spreads from model output. |
| A non-empty `NegativeFinding.statement` will be a genuine absence statement, not a placeholder | Prohibited in prose in `02` and `04` but not machine-enforceable; a placeholder would satisfy the letter of the gate. Accepted residual, same class as R-1. |
| One Investigation → exactly one ProblemBrief identity (§1.2) | Splitting a multi-problem Investigation becomes an additive change, per stated design. |
| `decidedBy`/`recordedBy` are known identity strings; no auth in scope | If auth is required earlier than expected, a new slice is needed. |
| MAX_REPAIR_ATTEMPTS = 1 is adequate | Sourced to Danny's binding decision text; configuration, not hardcoded — revisable without schema change. |
| Manual revisit of the durable URL is acceptable UX for this MVP | Explicitly accepted in `01` US-1 AC4 and the milestone. |

## 10. Open Questions

| Question | Status | Resolution |
|---|---|---|
| Which field/schema shape carries a recorded negative finding? | **Resolved** | `NegativeFinding` keyed by (`briefVersionId`, `element`), `02` §3/§4. |
| Which query backs `getBriefForReview().assignedState`? | **Resolved** | `getAssignedState` (current-knowledge), stated inline in `02` §4. |
| Should Slice 4 carry an explicit absence-surfacing note/test for `problem-statement`/`evidence`? | Open — G-4, minor | Mechanical; mirror Slice 6's wording. Does not require Danny. |
| — | — | **No question requiring human judgment was found this pass.** |

---

## 11. Approval Checklist

### Requirements (01)
- [ ] Reviewed by human
- [x] Acceptance criteria are testable
- [x] Out of scope is non-empty and concrete
- [x] Verified independently to need no change from either fix round

### Architecture (02)
- [ ] Reviewed by human
- [x] Schemas are valid TypeScript interfaces, no pseudocode, no `any`
- [x] Danny's blocking findings 1–4 implemented and re-verified by inspection (no regression)
- [x] G-1: `NegativeFinding` carrier defined, covering all five negatable elements
- [x] G-2: `getBriefForReview().assignedState` names its query
- [ ] G-5 (cosmetic): state the both-populated half of the EITHER/OR in §4's rule text

### UI Spec (03)
- [ ] Reviewed by human
- [x] Every UI-facing story has a flow; every screen/state a layout
- [x] Per-relationship stance rendering specified correctly
- [x] `NegativeFindingNotice` re-pointed to the concrete `negativeFindings`/`.element`/`.statement` mechanism throughout; 5-of-7 accounting matches `BriefElement`

### Roadmap (04)
- [ ] Reviewed by human
- [x] DAG holds; every component and UI surface covered; Done-When criteria testable
- [x] All four PR-review fixes reflected in slice notes and tests
- [x] G-1 wired: Slices 5/6 surface, Slice 9 persists + enforces (with both-empty rejection test), Slice 10 renders
- [x] G-3: Slice 10 type shorthand corrected to `NonEmptyArray<ClaimVersionEvidenceRef>`
- [ ] G-4 (minor): Slice 4 absence-surfacing note + test

### Overall
- [x] Danny's 4 blocking findings: all CLOSED, no regression
- [x] G-1, G-2, G-3: all CLOSED, verified by direct inspection of schema/contract text
- [x] No new drift introduced by this fix round
- [x] All open questions requiring human judgment: none
- [x] **Ready for Frank's binding spec-gate attempt 2 — YES**

---

## Verdict

**Ready for Frank spec-gate attempt 2 (of 3).**

G-1 is genuinely closed, not papered over: the `NegativeFinding` carrier was added as a small
entity keyed by (`briefVersionId`, `element`) that generalizes uniformly across all five negatable
elements, deliberately without weakening any `NonEmptyArray` citation typing and without adding a
`'none-found'` member to any closed union — i.e. it closes `01` line 19's requirement without
reopening the loophole Danny's finding #4 closed. The fail-closed rule is stated in the
`generateBriefVersion` contract, restated per element with concrete id arrays in Slice 9, and — the
part that matters — tested at its boundary: a run where any of the five has both an empty id array
and no valid `NegativeFinding` row (including a row with an empty `statement`) is rejected with no
`BriefVersion` persisted. G-2 and G-3 are one-line/one-word fixes, both verified applied. Danny's
four original findings are all intact.

Two items remain, both explicitly non-blocking and neither requiring Danny: **G-4** (Slice 4 lacks
the absence-surfacing note/test its siblings Slices 5 and 6 received, though Slice 9's gate covers
the correctness boundary regardless) and **G-5** (cosmetic — `02` §4's rule text states the
both-empty half of the invariant but not the both-populated half, which is stated in §3 and tested
in Slice 9). Neither is worth spending a gate attempt to fix first; they can be folded into the
post-gate cleanup or picked up by Frank if he judges otherwise.

Send it.
