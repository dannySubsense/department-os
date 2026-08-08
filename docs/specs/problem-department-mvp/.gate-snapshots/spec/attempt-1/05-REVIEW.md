# Spec Review: Problem Department — Vertical Slice MVP

**Review pass**: 5 (canonical — passes 1–4 preserved in git history)
**Date**: 2026-08-08
**Reviewer**: @spec-reviewer (independent)
**Docs reviewed**: `INTAKE.md`, `INTERVIEW.md`, `NORTH-STAR.md`, `01-REQUIREMENTS.md`,
`02-ARCHITECTURE.md`, `03-UI-SPEC.md`, `04-ROADMAP.md`
**Verdict**: **NOT YET READY** for Frank's binding LANE: spec-gate — 2 purely mechanical defects
remain (**D-14**, **D-15**). Zero open items require Danny. See "Readiness" for the
diminishing-returns recommendation.

---

## 1. Pass-4 Item Closure (verified by direct inspection, not by trusting fix reports)

| Item | Status | Evidence (current file state) |
|---|---|---|
| **D-9** — stale "all 32 ACs" in 02 | ✅ **CLOSED** | `02:5` Feeds line reads "13 stories / see Acceptance Criteria section for current count"; `02:816-817` Output Verification now reads "US-1 through US-13, and every AC in 01-REQUIREMENTS.md's Acceptance Criteria section". No numeric AC count survives anywhere in 02. |
| **D-11** — stray `</content>` in 04 | ✅ **CLOSED** | `04` final line is `836`, a normal checklist item. Grepped all 7 docs for `</content>`, `<content>`, `TODO`, `FIXME`, `TK`, `XXX` — zero hits in the spec docs (only this review file's own historical text matched). |
| **D-13** — `GenerationStep.validation` singular | ⚠️ **CLOSED IN 02, NOT PROPAGATED TO 04** | `02:519` now reads `validationRecords?: SchemaValidationRecord[]` with the correct doc comment ("a step may produce more than one, e.g. one EvidenceLabel per EvidenceItem"), and `SchemaValidationRecord.fieldPath` (`02:549`) supplies per-output disambiguation. **But `04:420` and `04:448` still name the old singular field `GenerationStep.validation`.** → **D-14**. |
| **A-2** — restated "US-5 … all six" ACs | ✅ **CLOSED** | `04:372-374` now reads "US-5's acceptance criteria pass per `01-REQUIREMENTS.md`'s Acceptance Criteria section … see that section for the authoritative list; not restated here." |
| **A-3** — restated "all 15 architecture components" (×2) | ✅ **CLOSED** | `04:64-65` → "cover every architecture component listed in `02-ARCHITECTURE.md`'s Section 2 component list"; `04:800-801` → "Every architecture component listed in `02-ARCHITECTURE.md`'s Section 2 component list is covered in a slice." No count survives. |
| **A-4** — `'generation-failed'` single-cause text | ✅ **CLOSED** | `02:273-275` now names both causes: "required elements could not be populated, **or** a structured output failed schema validation after bounded repair". |
| **A-5** — bad "Architecture §3 'Decision & Invalidation'" citation | ✅ **CLOSED** | `04:626` reads "Architecture §3 \"Decision\"". Verified against `02:563` whose section comment is `// ---- Decision ----`. |
| **A-6** — Output Verification omitted R-4 | ✅ **CLOSED** | `02:827-829` now reads "G-2, G-3, G-4, G-11, G-12, G-13, G-15 closed; **R-1 and R-4** … both named as explicit, accepted-and-implemented items". |

**8 of 8 pass-4 items closed at their named location.** One (D-13) produced a downstream
propagation miss in a *different* document, which is a new defect, not a reopened one.

---

## 2. Targeted Sweep (as requested, given four consecutive drift rounds)

### (a) Remaining restated derived counts

Every numeric/word count in all 7 docs was located and checked against its source.

| Location | Restated count | Verdict |
|---|---|---|
| `02:5` | "13 stories" | ✅ Accurate (US-1…US-13, counted); AC count correctly pointered. |
| `04:3-9` (Feeds) | AC count pointered; Brief-element list pointered; "2 durable-URL screens, 4 Investigation Screen states, 6 flows" | ⚠️ Restated, but **verified accurate**: 03 defines 2 screens (`03:29-32`), 4 Investigation states (`03:37-41`), 6 flows (1, 2, 2a, 3, 4, 5). Advisory **A-10**. |
| `04:60`, `04:64-66`, `04:756` | "12 slices" | ✅ Self-derived from this same document's own Slice Overview (Slices 1–12 present and contiguous). Not cross-doc drift. |
| `03:595`, `03:677`, `04:585`, `04:604`, `04:829` | "5 of the 7 required Brief elements" | ❌ **D-15** — see below. The *5* is internally consistent; the *7* it is measured against is a different seven than 01's canonical seven. |
| ~15 occurrences of "all seven elements" in 02/03/04 | "seven" | ⚠️ **A-9** — `01:9` literally forbids other docs restating "the list **or a count**". These uses are correct and harmless, but they violate 01's own stated rule as written. Recommend softening 01:9's wording, not purging 15 call sites. |
| `01:98-157` | (no total stated) | ✅ Independently counted: US-1:4, US-2:2, US-3:2, US-4:4, US-5:6, US-6:1, US-7:1, US-8:3, US-9:3, US-10:3, US-11:2, US-12:1, US-13:1 = **33 ACs**. No document now asserts this number, so it cannot go stale. |

**Result: the systemic pointer conversion is now complete for AC counts and component counts.**
The one surviving cross-doc count problem (D-15) is not a stale number — it is a *mis-scoped
denominator*, which is the same failure class one level up.

### (b) Stray editing artifacts

Swept all 7 docs for unclosed/stray tags, leftover markers, truncated lines, orphan code fences.
Fence parity verified in 02 (2 fences), 03 (5 fences), 04 (0 fences). **Zero artifacts found.**

### (c) Cross-doc terminology / naming mismatches

| Symbol | 02 (canonical) | 03 | 04 | Verdict |
|---|---|---|---|---|
| `GenerationStep.validationRecords` | `02:519` (array) | n/a | `04:420`, `04:448` — **`GenerationStep.validation`** | ❌ **D-14** |
| `SourceResolution.status` 4 values | `02:246` | `03:255-261` identical strings | `04:211-213` describes behaviour, no enum restated | ✅ |
| `InvestigationStatus` 4 values | `02:269-276` | `03:38-41` identical | `04` identical | ✅ |
| `getInvestigation` / `getBriefForReview` / `getAssignedState` / `assignValidityState` / `recordDecision` / `submitSources` / `searchWeb` / `generateBriefVersion` | `02:§4` | used identically | used identically | ✅ |
| UI component names (`SubmissionScreen`, `InvestigationScreen`, `GeneratingState`, `BlockedState`, `GenerationFailedState`, `CompletedState`, `DecisionForm`, `DecisionConfirmationPanel`, `DecisionHistoryBanner`, `CitationScopeNotice`, `SearchScopeNotice`, `NegativeFindingNotice`) | n/a | `03:530-593` | matched exactly | ✅ No superseded name (`BriefReviewScreen`, `SubmissionConfirmationState`, `BlockedFailedState`) survives anywhere. |
| Section-2 component names ↔ `GenerationStep.component` | `02:171-187` | `03:605-610` maps all | `04` slice column names all 15 | ✅ All 15 mapped; no orphan, no invented component. |
| `Claim` vs `ClaimVersion` text carriage | `Claim` has no `text` (`02:295-298`) | `03:457` says "`Claim.text` (via `ClaimVersion`)" | correct | ⚠️ **A-7** — misleading wording; `ClaimVersion.text` is the field. |
| `priorDecisions` ownership | field of `getBriefForReview`'s return (`02:718`) | `03:180` calls it "`Decision.priorDecisions`"; `03:693` attributes it to Q-5 rather than G-11 | correct | ⚠️ **A-8** |

---

## 3. Requirements → Architecture Coverage

| Requirement | Architecture coverage | Status |
|---|---|---|
| US-1 (submit, durable URL, reject empty, 3-state revisit) | Intake Service; `Submission`/`SourceArtifact`/`Investigation`; `submitSources` (rejects 0 artifacts); `getInvestigation` + Q-7 note (`02:630-646`) | ✅ |
| US-2 (problem statements, clustering) | Extraction & Clustering Engine; `ProblemStatement` (who/context/consequence + `supportingClaimVersionIds`) | ✅ |
| US-3 (labels, contradicting evidence) | Evidence Labeler; `EvidenceLabel` closed union; `EvidenceItem.stance` | ✅ |
| US-4 (signal type ⊥ confidence, no numeric) | Demand Analyzer; `DemandSignal` / `DemandConfidenceClassification` split; Anti-Pattern "Numeric confidence anywhere" | ✅ |
| US-5 (independent web research, scope, citation) | Decision 1.5; Landscape Researcher; `WebSearchQuery`/`WebSearchResult`; `searchWeb`; `SourceArtifact.origin` | ✅ |
| US-6 (uncertainty) | Uncertainty Compiler; `UncertaintyStatement` (3 named lists) | ✅ |
| US-7 (reasoned recommendation) | Recommendation Engine; `Recommendation.rationale` | ✅ |
| US-8 (decision bound to version) | Decision Recorder; `Decision.briefVersionId`; Pattern "Decision-to-version binding" | ✅ |
| US-9 (Reject retained, Watch conditions) | Decision 1.4; `ReconsiderationCondition`; `recordDecision` Watch guard; no `nextCheckAt` | ✅ |
| US-10 (traceability, supersede, invalidate) | Decisions 1.3 Q-3/Q-4; `StatusEvent`, `ClaimVersion`, `BriefVersion.claimVersionIds`; `assignValidityState.dependentDecisionIds` | ✅ |
| US-11 (provenance + schema validation) | `GenerationRun` (investigation-anchored), `GenerationStep`, `SchemaValidationRecord`/`Attempt`, MAX_REPAIR_ATTEMPTS = 1 | ✅ |
| US-12 (Personal Pull quarantine) | Personal Pull Extractor; `PersonalPullNote.label` fixed literal; Pattern "Fixed-value quarantine field" | ✅ |
| US-13 (minimal review/decide surface) | Review Surface; `getBriefForReview`; Brief presented *from* Investigation | ✅ |
| All 12 Edge Case rows | Source Resolver 4-way status; `blocked`/`generation-failed` split; `WebSearchResult.status`; conservative-label default; Numeric Scope Rule; R-4 terminal failure | ✅ |
| Constraints (13 Must/Must-not) | All traceable to a Section 3 schema, Section 4 contract, or Section 5 Anti-Pattern | ✅ |

**No requirement is uncovered.** MAX_REPAIR_ATTEMPTS = 1 is the only predetermined constant in the
set and it carries an explicit sourced rationale (`02:536-540`, Danny's binding decision text) —
compliant with the repo's no-unsourced-number rule.

## 4. Requirements → UI Coverage

| Story | Screen / Flow | Status |
|---|---|---|
| US-1 | Submission Screen; Flow 1; Investigation Screen Generating state | ✅ |
| US-2/US-3 | Completed state §1–2 (claim grouping, label badge, stance, contradicting inline) | ✅ |
| US-4 | Completed state §3–4 (badge text-only, narrative in full) | ✅ |
| US-5 | Completed state §5 + `SearchScopeNotice` (always shown) | ✅ |
| US-6 | Completed state §7, always expanded | ✅ |
| US-7 | Completed state §8 (badge + rationale) | ✅ |
| US-8/US-9 | Flow 3; `DecisionForm`; Watch condition sub-form; Flow 4 (no Reopen control) | ✅ |
| US-10 | Flow 5; `DecisionHistoryBanner` (`priorDecisions` lineage, `assignedState`, `isSuperseded`) | ✅ |
| US-11 | `ProvenanceLine`; GenerationFailed state's run reference | ✅ (read-only surfacing; `SchemaValidationRecord` detail deliberately not surfaced — acceptable, US-11 requires capture, not display) |
| US-12 | Personal Pull section, visually/structurally segregated, fixed label | ✅ |
| US-13 | Investigation Screen Completed state, single durable URL | ✅ |
| Edge cases | Blocked vs Generation-Failed distinct copy + distinct remedy; 4-way source status; negative-finding vs loading-empty-state distinction (G-18) | ✅ |

**Non-UI stories** (none) — every story has UI reach or is explicitly backend-only by design.

## 5. Architecture → Roadmap Coverage

All 15 Section-2 components assigned: Intake Service→S2; Source Resolver→S3; Extraction &
Clustering→S4; Evidence Labeler→S4; Demand Analyzer→S5; Personal Pull Extractor→S5; Landscape
Researcher→S6; Gap Hypothesis Generator→S6; Uncertainty Compiler→S7; Recommendation Engine→S7;
Provenance Recorder→S8; Brief Assembler→S9; Review Surface→S3 (pre-Brief) + S10 (Brief);
Decision Recorder→S11; Validity/Invalidation Service→S12. ✅

All Section-4 contracts assigned: `submitSources`→S2; `resolveSourceArtifact`/
`resolveInvestigationSources`/`getInvestigation`→S3; `searchWeb`→S6; `generateBriefVersion`→S9;
`getBriefForReview`→S10; `recordDecision`→S11; `assignValidityState`/`getAssignedState`→S12. ✅

All UI surfaces assigned: SubmissionScreen→S2; Generating→S2/S3; Blocked→S3; GenerationFailed→S3
(component) + S9 (live wiring, ownership explicitly split at `04:49`/`04:503-505`); Completed→S10;
DecisionForm/ConfirmationPanel→S11; DecisionHistoryBanner→S12. ✅

**DAG verified acyclic by hand**: 1→2→3→4→{5,6}→7→8→9→10→11→12, with 12 also depending on 9.
No back-edge. Slices 5/6 parallelizable, correctly flagged as the only non-linear point.

---

## 6. Gaps Found This Pass

| ID | Location | Gap | Class | Needs Danny? |
|---|---|---|---|---|
| **D-14** | `04:420`, `04:448` | Names the field `GenerationStep.validation`; 02's canonical schema (`02:519`) is `GenerationStep.validationRecords?: SchemaValidationRecord[]` (array). Direct un-propagated fallout of D-13's fix. A Forge session implementing Slice 8 from 04 would build the singular field D-13 was raised to eliminate. | Mechanical — two-word edit ×2, plus `04:448`'s "populates … with a `SchemaValidationRecord`" → "appends a `SchemaValidationRecord` per schema-constrained output". | **No** |
| **D-15** | `03:595-603`, `03:676-681`, `04:585-590`, `04:829` | These passages enumerate "the seven required Brief elements" as {Problem Statement, Evidence, Demand Signals, **Demand Confidence**, Existing-Solution Landscape, Gap Hypothesis, Uncertainty} — 5 taking `NegativeFindingNotice` + 2 structurally-populated. But `01:11-17`'s canonical seven are {problem definition, evidence, **demand evidence (signal type + confidence = one element)**, landscape, gap, uncertainty, **decision recommendation**}. The two sets differ: 03/04 split demand into two elements and omit Decision Recommendation. The totals coincidentally both equal 7, which is why four passes missed it. | Mechanical, but *substantive in effect*: as written, 03/04 imply System Recommendation is not a required Brief element (it is, `01:17`) and therefore never state its absence/negative-finding handling. Rendering coverage is in fact complete (`03:396-397` renders it), so this is a mislabeled denominator, not a missing feature. Fix: reword the four passages to "5 of the 8 rendered Brief sections, which map onto `01-REQUIREMENTS.md`'s seven canonical elements (demand signal type + demand confidence are one canonical element; System Recommendation is the seventh)". | **No** |

Both are exactly the class `01:9`'s pointer rule exists to prevent — D-15 in particular is the
strongest available argument *for* that rule, since it is the one place a count was restated
against a locally-invented denominator rather than the canonical one.

## 7. Advisories (non-blocking)

| ID | Location | Note |
|---|---|---|
| **A-7** | `03:457` | "`Claim.text` (via `ClaimVersion`)" — `Claim` has no `text` field (`02:295-298`); the field is `ClaimVersion.text`. Parenthetical already gestures at the right place; wording is merely loose. |
| **A-8** | `03:180`, `03:693` | Calls the list "`Decision.priorDecisions`"; it is a field on `getBriefForReview`'s return type (`02:718`), not on `Decision`. `03:693` also credits Q-5 where G-11 is the actual source. |
| **A-9** | `01:9` vs ~15 sites in 02/03/04 | `01:9` forbids restating the element list "**or a count**", yet "all seven elements" appears ~15 times and is correct and useful every time. Recommend softening `01:9` to forbid restating *the list* and *derived counts of ACs/components*, explicitly permitting the stable word "seven". Purging 15 correct call sites would be worse than the rule. |
| **A-10** | `04:8-9`, `04:66` | Restates 03's "2 screens / 4 states / 6 flows". Verified accurate against 03. Low drift risk (03's screen model is now locked by G-17), but it is a restated cross-doc count. |
| **A-11** | `04:400` | Slice 7 test says uncertainty may "explicitly state none apply, per whatever null-representation the implementation chooses". `01:129` and `02:435-440` require all three lists named; `03:577-580` says never an empty-list state. The roadmap's latitude is slightly looser than the other three docs. Not a contradiction (an explicit "none apply" string is a populated list entry), but it is the loosest phrasing in the set. |

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R-1** Citation presence ≠ citation correctness — a model can populate valid, irrelevant citation arrays and pass every specified test | H | H | Named and accepted at `02:725-736`; surfaced as always-visible `CitationScopeNotice` (`03:431-437`), tested at `04:599-600`, deferred explicitly at `04:790-792`. Mitigated by disclosure, not by solution — correct call for an MVP. |
| **R-2** Slice 1 finds no adequate runtime | M | H | G-22 stopping rule (`04:99-105`) — HALT to Danny with scored findings, no least-bad silent pick. |
| **R-3** Web-search vendor deliberately unselected; a candidate may lack the capability | M | M | First-class Section 6 capability row, scored in Slice 1, gating Slice 6 (`04:91-93`). |
| **R-4** Model emits out-of-schema structured output | H | H | Bounded repair (MAX_REPAIR_ATTEMPTS = 1, sourced) → terminal failure; no silent coercion. Anti-Pattern at `02:763`. Fully specified end-to-end. |
| **R-5** "All seven elements populated" is a fail-closed gate whose *quality* bar is unspecified — an explicit "none found" in all seven passes the gate | M | M | Deliberate per `01:19` (negative findings are valid results). Accepted; the honesty discipline is the point. No action. |
| **R-6** Provenance volume: `SchemaValidationAttempt.rawOutput` retained for every attempt on every schema-constrained field | M | L | No retention/size policy specified anywhere. Acceptable at MVP scale; flag for Forge if storage cost surfaces. |

## 9. Assumptions

| Assumption | Impact if wrong |
|---|---|
| Source artifacts are URL or pasted text only for this slice | Open discriminator (`Decision 1.1`) makes a third type additive, not breaking |
| One Investigation → exactly one ProblemBrief identity | `Decision 1.2` keeps Investigation/Brief separate so a future 1:N split is additive |
| Manual revisit of the durable URL is an adequate result-delivery mechanism | If generation is slow enough to be frustrating, a polling/notification need reappears — explicitly deferred, not precluded |
| `decidedBy`/`recordedBy` are known identity strings with no auth layer | Auth is out of scope in all four docs consistently; adding it later is additive |
| Slice 1 will produce a runtime capable of every Section 6 row | Covered by G-22 stopping rule |

## 10. Open Questions

| Question | Status | Resolution |
|---|---|---|
| — | — | **None.** All Interview questions Q-1…Q-8 are resolved and traceable into 02 (Q-8 §Scope Discipline; Q-3/Q-4 §1.3; Q-5 §1.4; Q-6 §1.5; Q-7 §4 `getInvestigation`; Q-1/Q-2 via Numeric Scope Rule and G-18 handling). All prior gaps G-2, G-3, G-4, G-9, G-11, G-12, G-13, G-15, G-17, G-18, G-20, G-21, G-22, F-3, F-5, N-4, R-1, R-4 verified closed at their cited locations. **Zero items require Danny's input.** |

## 11. Set-Level Consistency (NORTH-STAR + 01–04)

- NORTH-STAR's six Layer-1 success criteria each map to at least one US and one architecture
  component; the Brief-elements criterion (`NORTH-STAR:15`) correctly points at 01 rather than
  restating. ✅
- NORTH-STAR's Reject-reconsiderable-not-reopenable framing (`NORTH-STAR:18`) matches `01` US-9,
  `02` §1.4, `03` Flow 4, `04` Slice 11 verbatim in substance. ✅
- NORTH-STAR's Approve-does-not-trigger-build (`NORTH-STAR:20`) matches `01` US-8 AC3, `02` §7,
  `04:660`. ✅
- Out-of-Scope lists in 01, 03, and 04 are mutually consistent — no item deferred in one and
  built in another. ✅
- Numeric Scope Rule (`01:23-29`) is honoured consistently: 02's Anti-Pattern, 03's "text label
  only — never a number", 04's Q-1 notes in Slices 5/7/10 all carry the same sourced-number
  carve-out. ✅
- **No fundamental inconsistency found. No HALT condition met.**

---

## 12. Approval Checklist

### Requirements (01)
- [ ] Reviewed by Danny in raw form
- [x] All 33 ACs are structurally testable (each states Given/When/Then with a checkable outcome)
- [x] Edge case table populated (12 rows), Out of Scope non-empty (16 NOT + 3 Deferred), Constraints concrete
- [x] Required Brief Elements section is the single canonical source
- [ ] **A-9 addressed** (soften `01:9`'s "or a count" wording) — optional, non-blocking

### Architecture (02)
- [x] Every requirement has explicit coverage (Section 3 above)
- [x] Schemas are valid TypeScript, no `any`, no pseudocode
- [x] Patterns justified against specific ACs; Anti-Patterns are enforceable statements
- [x] No runtime/DB/framework selected — scope discipline held throughout
- [x] Only predetermined constant (MAX_REPAIR_ATTEMPTS = 1) carries a cited rationale
- [ ] Reviewed by Danny

### UI Spec (03)
- [x] Every UI-facing story has a flow; every flow has a screen; every screen/state has a layout
- [x] Interactions cover loading/error/success
- [x] Component hierarchy maps to Section 2 components
- [ ] **D-15 fixed** (seven-elements denominator)
- [ ] A-7, A-8 addressed — optional
- [ ] Reviewed by Danny

### Roadmap (04)
- [x] All 15 components and all UI surfaces slice-assigned
- [x] DAG acyclic; each slice has Done-When + tests; file paths concrete or explicitly TBD-by-Slice-1
- [x] G-22 stopping rule present
- [ ] **D-14 fixed** (`GenerationStep.validation` → `validationRecords`)
- [ ] **D-15 fixed** (seven-elements denominator, `04:585-590`, `04:829`)
- [ ] A-10, A-11 addressed — optional
- [ ] Reviewed by Danny

### Overall
- [x] All open questions resolved — zero require Danny
- [x] All risks have stated mitigations or explicit acceptance
- [x] Documents are mutually consistent as a set
- [ ] **D-14 and D-15 closed** → then ready for Frank's binding LANE: spec-gate

---

## 13. Readiness — explicit answer

**Is this doc set ready for Frank's binding LANE: spec-gate right now? — No.**

Two mechanical defects remain. **Neither requires Danny.** Both are text edits in known locations
with the correct replacement text already specified in Section 6 above.

**On diminishing returns (as asked):** this is the fifth pass and the fourth to find residual
drift, so the question of whether to just proceed is fair. My recommendation is **one final fix
round, then Frank — do not proceed with these two outstanding**, for a reason that distinguishes
them from pure cosmetics:

- **D-14 is not cosmetic.** It is a live schema-name mismatch between the roadmap a Forge session
  will implement from and the architecture that defines the contract. Implementing `04` as written
  reintroduces exactly the singular-field defect D-13 was raised to remove. Cost to fix: two lines.
- **D-15 is not cosmetic.** As written, `03`/`04` enumerate a set of "seven required elements" that
  omits Decision Recommendation and therefore never assigns it negative-finding handling. The
  rendering coverage happens to be complete anyway, so the risk is a Forge session reasoning from
  the wrong denominator, not a missing feature — but it is a correctness statement about the spec's
  own central contract, and Frank's gate reads exactly these enumerations.

**A-7 through A-11 should NOT trigger another round.** They are genuine text-drift residue of the
kind this hunt has hit diminishing returns on. Fix them opportunistically or not at all; they do
not affect what gets built. If a sixth pass finds only advisory-class items of that kind, the
correct call is to proceed to Frank regardless.

**Recommended sequence:** fix D-14 (two lines in `04`) and D-15 (four passages across `03`/`04`) →
spot-verify those six locations only, no sixth full pass → invoke Frank's binding spec-gate.
