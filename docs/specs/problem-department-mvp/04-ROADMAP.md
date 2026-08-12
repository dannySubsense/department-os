# Roadmap: Problem Department — Vertical Slice MVP

**Feeds**: `01-REQUIREMENTS.md` (US-1–US-13 — see its Acceptance Criteria section for the
authoritative per-story breakdown and total AC count; this document references that section by
pointer and does not restate the count, per this doc set's history of AC-count drift), and its
"Required Brief Elements (Canonical)" section, the single source of truth for the seven Brief
elements — this document references that section by pointer and does not restate the list or any
count), `02-ARCHITECTURE.md` (Sections 1–7), `03-UI-SPEC.md` (2 durable-URL screens, 4 Investigation
Screen states, 6 flows)

## Scope Discipline

This roadmap sequences implementation for a future Forge session. It selects **no** runtime,
database, framework, language, or search vendor — Slice 1 is the runtime/storage **evaluation**
the milestone exists to run, producing a decision record other slices then build on. Nothing below
begins implementation. Every slice after Slice 1 is defined as a real vertical slice per
`docs/principles.md` — each touches evidence and/or workflow state, and slices that produce a
human-facing outcome touch a recorded decision — not a horizontal layer (e.g. "all schemas,"
"all UI") with no accountable output.

---

## Dependency Map

| Unit | Depends On |
|---|---|
| Runtime/Storage Decision (DDR) | — |
| Core persistence (`Investigation`, `Submission`, `SourceArtifact`) | Runtime/Storage Decision |
| Intake Service + Submission Screen | Core persistence |
| Source Resolver + `getInvestigation` read path + Blocked/Generation-Failed states | Intake Service |
| Evidence/Claim schema (`Claim`/`ClaimVersion`/`EvidenceItem`/`ClaimVersionEvidence`) + Extraction & Clustering Engine + Evidence Labeler | Source Resolver (needs reachable sources) |
| Demand Analyzer + Personal Pull Extractor | Evidence/Claim schema |
| Landscape Researcher (incl. `searchWeb`/`WebSearchQuery`/`WebSearchResult`) + Gap Hypothesis Generator | Evidence/Claim schema |
| Uncertainty Compiler + Recommendation Engine | Demand Analyzer, Landscape/Gap (reads full evidence set) |
| Provenance Recorder (`GenerationRun`, anchored to `investigationId`) | wraps Extraction→Recommendation (all of the above pipeline steps) |
| Brief Assembler (`BriefVersion`, `claimVersionIds`, versioning) | all pipeline outputs + Provenance Recorder |
| Investigation Screen — Completed State (`getBriefForReview`) | Brief Assembler |
| Decision Recorder + Decision Form + Decision Confirmation Panel | Investigation Screen — Completed State |
| Validity/Invalidation Service (`StatusEvent`, `assignValidityState`, `getAssignedState`, `getAssignedStateAsRecorded`) + Decision-History Banner (Flow 5) | Brief Assembler, Decision Recorder |

---

## Slice Overview

| Slice | Goal | Depends On | Architecture Components / UI Covered |
|---|---|---|---|
| 1 | Runtime & storage evaluation, recorded decision | — | Section 6 capability table (incl. web-search/retrieval capability) |
| 2 | Core persistence + Intake Service + Submission Screen | 1 | Intake Service; Submission Screen, Investigation Screen — Generating State |
| 3 | Source Resolver + `getInvestigation` read path + Blocked/Generation-Failed States | 2 | Source Resolver; Review Surface (pre-Brief read); Investigation Screen — Blocked State, Investigation Screen — Generation Failed State (component only; live `generation-failed` path wired at Slice 9 — see Implementation Notes) |
| 4 | Evidence/Claim model + Extraction & Clustering + Evidence Labeler | 3 | Extraction & Clustering Engine, Evidence Labeler |
| 5 | Demand Analyzer + Personal Pull Extractor | 4 | Demand Analyzer, Personal Pull Extractor |
| 6 | Landscape Researcher (`searchWeb`, `WebSearchQuery`/`WebSearchResult`) + Gap Hypothesis Generator | 4 | Landscape Researcher, Gap Hypothesis Generator |
| 7 | Uncertainty Compiler + Recommendation Engine | 5, 6 | Uncertainty Compiler, Recommendation Engine |
| 8 | Provenance Recorder wrapping the full generation pipeline | 4, 5, 6, 7 | Provenance Recorder |
| 9 | Brief Assembler (assembly + versioning/supersede) | 8 | Brief Assembler; live wiring of Investigation Screen — Generation Failed State (see Slice 3) |
| 10 | Investigation Screen — Completed State (read-only Brief review) | 9 | Review Surface; Investigation Screen — Completed State |
| 11 | Decision Recorder + Decision Form + Decision Confirmation Panel | 10 | Decision Recorder; Decision Form, Decision Confirmation Panel (in-place, non-navigating) |
| 12 | Validity/Invalidation Service + Decision-History Banner (Flow 5) | 9, 11 | Validity/Invalidation Service; Decision-History Banner |

Still **12 slices** — Q-6's web-search work is absorbed into Slice 6 (its natural owner: the
Landscape Researcher component that requires it) rather than added as a new slice, and
`getInvestigation` is absorbed into Slice 3 (the slice that already owns Investigation-status
visibility). No resequencing: the dependency map's shape is unchanged, so the DAG still holds.
12 slices cover every architecture component listed in `02-ARCHITECTURE.md`'s Section 2 component
list and all UI surfaces in `03-UI-SPEC.md` (2 durable-URL screens, 4 Investigation Screen states,
6 flows).

---

## Slice Detail

### Slice 1: Runtime & Storage Evaluation

**Goal:** Run the runtime-evaluation exercise this milestone exists for — a **practical
evaluation and adoption of a runtime for this milestone's own implementation, not a permanent
Department OS platform commitment, revisable via a future DDR** (Q-8, Requirements Out-of-Scope,
Architecture Scope Discipline) — scored against `02-ARCHITECTURE.md` Section 6's capability
table, and record the outcome as a DDR.

**Depends On:** —

**Files:**
- `docs/decisions/DDR-00XX-problem-department-runtime.md` — create (candidate runtimes
  evaluated, storage technology evaluated, decision + reasoning, capability-table scoring)
- Evaluation scratch artifacts (spikes/prototypes used to score candidates) — location TBD by
  whoever runs the evaluation; not part of the shipped codebase

**Implementation Notes:**
- Score each candidate runtime/storage combination against every row of Architecture Section 6,
  including the web-search/retrieval capability row: "a tool or adapter through which the
  runtime can search the public web and retrieve/inspect selected results, preserving
  query/URL/retrieval-time and surfacing failed or blocked retrievals" (Q-6). This is a first-class
  scoring row, not an afterthought — Slice 6 cannot proceed on a candidate that fails it.
- No candidate may be assumed in advance; this slice's job is to produce the evidence for the
  decision, not confirm one already picked.
- Framing discipline: this is evaluation-and-adoption language throughout the DDR, spikes, and
  any surrounding commentary — never "we are selecting Department OS's permanent runtime."

**Stopping rule (G-22):** If, after scoring every reasonably-available candidate against the full
Section 6 table, **no candidate adequately satisfies the required capability set** (including
web-search/retrieval), this slice does **not** silently pick the least-bad option and proceed.
It **HALTs to Danny** with the scored findings — which candidates were tried, which capability
rows failed for each, and whether the gap is closeable (e.g. a missing adapter that could be
built) or structural. No later slice begins until Danny either accepts a documented tradeoff
(recorded in the DDR, not implied) or the evaluation is rerun against a new candidate.

**Tests:**
- N/A (evaluation slice, not code) — the DDR itself is the artifact under review.

**Done When:**
- [ ] DDR records a runtime and storage decision with reasoning traceable to every Section 6 row,
      including the web-search/retrieval capability row.
- [ ] DDR status is `ACCEPTED` before any later slice begins, OR the stopping rule above was
      invoked and Danny's resolution is recorded before any later slice begins.
- [ ] DDR framing matches Q-8 exactly: practical evaluation/adoption for this milestone, not a
      permanent platform commitment.
- [ ] Frank or equivalent gate has reviewed the DDR is not a bare assertion (cites what was
      actually tried, not just conclusions).

---

### Slice 2: Core Persistence + Intake Service + Submission Screen

**Goal:** A human can submit one or more source artifacts and receive a durable Investigation
reference (US-1, Flow 1).

**Depends On:** Slice 1

**Files:**
- Persistence layer implementing `Submission`, `SourceArtifact`, `Investigation` (Architecture
  §3 "Intake" schemas) on the Slice-1-selected storage — path TBD by chosen stack
- `submitSources` service function (Architecture §4)
- Submission Screen + Investigation Screen — Generating State (UI Spec) — component tree per
  `SubmissionScreen`/`InvestigationScreen > GeneratingState` in UI Spec Component Hierarchy

**Implementation Notes:**
- `SubmissionOrigin` and `SourceArtifactType` implemented as open discriminators
  (`'known-literal' | (string & {})`, per Decision 1.1/G-2 typing correction) — do not close to
  a plain `string` or a closed literal union.
- `SourceArtifact.origin` (`'submitted' | 'landscape-research' | (string & {})`) is part of this
  slice's schema even though only `'submitted'` is produced here — Slice 6 populates
  `'landscape-research'` later; do not close this field to a single literal now.
- Zero-artifact submissions rejected pre-persistence (US-1 AC3) — enforce both client-side and
  server-side, per UI Spec's Submit-sources interaction.
- On submit success, the user is redirected to the Investigation Screen's durable URL
  (`/investigations/{investigationId}`) in its Generating state — there is no separate
  confirmation screen; the redirect target *is* the Generating state (Q-7, UI Spec Flow 1 step 5).

**Tests:**
- [ ] Given ≥1 artifact, `submitSources` creates one `Investigation` + `SourceArtifact` records,
      each with `origin: 'submitted'`.
- [ ] Given 0 artifacts, `submitSources` rejects; no `Investigation` is created.
- [ ] `Submission.origin` accepts `'human'` and does not reject an arbitrary future string.
- [ ] Submission Screen: submit control disabled until ≥1 row has content; error path shows
      inline validation message and preserves entered content.
- [ ] On success, the browser is redirected to `/investigations/{investigationId}` and that URL
      renders the Investigation Screen's Generating state (Investigation reference + submitted
      sources list + durable-URL note).

**Done When:**
- [ ] All acceptance criteria for US-1 pass.
- [ ] Submission Screen and Investigation Screen — Generating State match UI Spec layout/sections.
- [ ] All tests pass.

---

### Slice 3: Source Resolver + `getInvestigation` Read Path + Blocked/Generation-Failed States

**Goal:** Submitted sources are resolved (fetched/normalized) with unreachable sources recorded,
not dropped; an Investigation with zero reachable sources is visibly blocked (US-1 edge case,
Flow 2); and the durable Investigation URL contract — the single read path every revisit of an
Investigation resolves through — is implemented and backing the Generating, Blocked, and
Generation Failed states of the Investigation Screen.

**Depends On:** Slice 2

**Files:**
- `resolveSourceArtifact`, `resolveInvestigationSources` service functions (Architecture §4)
- `getInvestigation` read-model function (Architecture §4, Q-7) — resolves
  `status === 'open'` → "generating," `status === 'blocked' | 'generation-failed'` → the
  statusReason and correct next action, `status === 'brief-generated'` → the chain through
  `ProblemBrief.currentVersionId` (this last branch is wired live once Slice 9/10 exist; this
  slice implements the read function and its `open`/`blocked`/`generation-failed` branches now)
- Investigation Screen — Blocked State component tree (`BlockedState`, UI Spec)
- Investigation Screen — Generation Failed State component tree (`GenerationFailedState`, UI Spec)
  — **component built here per its UI layout/copy, but its live data path
  (`Investigation.status === 'generation-failed'`) cannot be exercised end-to-end until Slice 9's
  `generateBriefVersion` exists to produce that status; Slice 9 wires the live transition and owns
  the tests that actually drive a real Investigation into this state (N-4).** This slice's own
  tests below cover the component rendering a given/fixture `statusReason`, not the pipeline that
  produces it.
- Update to Investigation Screen — Generating State to show per-source resolution status (already
  scaffolded in Slice 2; this slice wires live resolution status into it via `getInvestigation`)

**Implementation Notes:**
- Dead/unreachable URL does not block Brief generation if other sources are reachable.
- `allUnreachable: true` transitions `Investigation.status` to `'blocked'`.
- `getInvestigation` is the **single** durable-URL contract (Q-7) — no separate ad hoc status
  query should be built elsewhere in the codebase; every screen/state that needs Investigation
  status calls this function.
- This slice does not need to resolve the `brief-generated` branch's downstream `BriefVersion`
  fetch to pass its own tests (that data doesn't exist until Slice 9) — but the read function's
  shape must already accommodate it per Architecture §4, so Slice 10 does not need to modify
  `getInvestigation`'s contract later.

**Tests:**
- [ ] Given a dead URL among reachable sources, investigation is not blocked; dead source is
      recorded `unreachable` with `failureReason`.
- [ ] Given all sources unreachable, `Investigation.status === 'blocked'` and no `BriefVersion`
      is generated.
- [ ] Given a resolved-but-empty-content source (paywall/login-wall/JS-only), the source's
      resolution status distinguishes this from both `reachable`-with-content and `unreachable`
      (Edge Case row) — do not collapse into a single `reachable` status.
- [ ] `getInvestigation` returns the investigation + its `sourceArtifacts` with resolution status
      for a given `investigationId`, and returns the correct status branch for `open` and
      `blocked` states.
- [ ] Investigation Screen — Blocked State renders `failureReason` per source and links back to
      Submission Screen pre-associated with the existing `Investigation.id`.
- [ ] Investigation Screen — Generation Failed State, given a fixture `statusReason`, renders
      copy distinct from the Blocked state and never offers "add a source" as the fix (G-13).

**Done When:**
- [ ] Edge Case row "Submitted source URL is dead/unreachable" fully satisfied.
- [ ] Edge Case row "resolves successfully but yields no extractable content" fully satisfied.
- [ ] `getInvestigation` implemented per Architecture §4/Q-7, covering the `open` and
      `blocked`/`generation-failed` status branches (G-20, G-15).
- [ ] All tests pass.

---

> **Roadmap correction (this revision) — Slice 4/5–7: ProblemStatement/candidate persistence
> timing.** `ProblemStatement.briefVersionId` is required (Architecture §3), and `getBriefForReview`
> returns `problemStatements: ProblemStatement[]` scoped to one specific `BriefVersion`
> (Architecture §4) — so a `ProblemStatement` row can only legitimately exist once a `BriefVersion`
> exists to own it. An earlier draft of this roadmap listed `ProblemStatement` persistence as a
> Slice 4 deliverable, contradicting that constraint (Slice 4 runs long before any `BriefVersion`
> exists). Danny's binding resolution: Slice 4 (and, by the same pattern, Slices 5–7 for their own
> Brief-scoped entities — `DemandSignal`/`DemandConfidenceClassification`, `ExistingSolution`/
> `GapHypothesis`, `UncertaintyStatement`/`Recommendation`, wherever those entities carry a
> `briefVersionId`-required shape) produce a validated, in-memory/return-value **candidate** output
> instead of persisting the Brief-scoped row directly. For Slice 4 specifically, this is a
> `ProblemStatementCandidate` shape carrying `whoExperiencesIt`, `contextOrWorkflow`,
> `consequenceOrFriction`, and `supportingClaimVersionIds` (exact `ClaimVersion` ids) — the same
> fields as `ProblemStatement`, minus `id` and `briefVersionId`. Slice 4 continues to persist
> `Claim`, `ClaimVersion`, `EvidenceItem`, and `ClaimVersionEvidence` directly — those are
> explicitly Brief-independent, "shared across Briefs" (Architecture §3). Slice 9 (Brief Assembler)
> remains the sole slice that persists `ProblemStatement` rows, doing so atomically with the
> `BriefVersion` that owns them — preserving the existing "no `BriefVersion` on failure" guarantee
> (R-4 fail-closed) unchanged. Slices 5–7 work out their own specific candidate-shape details when
> each is reached; this note only establishes the general pattern so they aren't blocked by the
> same ambiguity.

---

### Slice 4: Evidence/Claim Model + Extraction & Clustering Engine + Evidence Labeler

**Goal:** From reachable sources, produce clustered problem statements and labeled evidence,
including contradicting evidence (US-2, US-3).

**Depends On:** Slice 3

**Files:**
- Persistence for `Claim`, `ClaimVersion`, `EvidenceItem`, `ClaimVersionEvidence` (Architecture
  §3 "Evidence & Claims" — Q-4 stable-identity/immutable-version split; PR-review binding
  correction — stance lives on the claim-evidence relationship, not on `EvidenceItem`). This slice
  does **not** persist `ProblemStatement` rows (see roadmap correction note above, "Slice 4/5-7 —
  ProblemStatement/candidate persistence timing") — it produces a validated, in-memory
  `ProblemStatementCandidate` return-value shape instead, consumed by Slice 9.
- Extraction & Clustering Engine implementation
- Evidence Labeler implementation

**Implementation Notes:**
- `Claim` carries no text or status (stable identity only); every extraction or correction
  creates a new `ClaimVersion` under the same `Claim.id` — never edits an existing
  `ClaimVersion` (Q-4). `ProblemStatement.supportingClaimVersionIds` references exact
  `ClaimVersion` ids.
- `EvidenceItem` carries no `stance` field. Stance is recorded per (claimVersionId,
  evidenceItemId) pair on the persisted `ClaimVersionEvidence` relationship — the same shared
  `EvidenceItem` may support one `ClaimVersion`, contradict another, and be neutral to a third.
  `ClaimVersion.evidence: NonEmptyArray<ClaimVersionEvidenceRef>` is the denormalized read-shape
  for this relationship, persisted identically to `ClaimVersionEvidence` — not a second source of
  truth. There is no `ClaimVersion.evidenceItemIds: string[]` field; do not build one.
- Every `EvidenceItem` carries exactly one label from the closed five-value `EvidenceLabel` set;
  default to `unknown`/`assumption` (most conservative) when a claim can't be confidently
  labeled (Edge Case row).
- Contradicting evidence recorded via `ClaimVersionEvidence.stance: 'contradicting'` on the
  relevant relationship row, not omitted and not stored on the `EvidenceItem` itself.
- `ClaimVersion.evidence` is non-empty by contract (Architecture §3/§4 citation-validation note,
  folded into Slice 8's R-4 fail-closed boundary) — this slice must never persist a `ClaimVersion`
  with zero evidence rows even transiently; if extraction cannot support a claim with ≥1 evidence
  item, the claim is not persisted as a `ClaimVersion` at all.
- As with Slices 5 and 6, this slice does not itself persist `BriefVersion.negativeFindings` —
  that array lives on `BriefVersion` and is assembled by Slice 9 (Brief Assembler) per
  Architecture §3's fail-closed rule (G-1). This slice is the upstream owner of the absence
  finding for **one** of the four negatable elements: `'evidence'` (when adequate supporting
  evidence cannot be found for a candidate problem statement). This slice's job is only to
  produce the correct absence signal — a real, non-placeholder statement explaining what was
  searched and why nothing qualified — surfaced from the Evidence Labeler's output for that
  Investigation; it does not construct the `NegativeFinding` record itself. Slice 9 is the sole
  slice that persists `NegativeFinding` rows.
- **Problem statement is non-negatable** (Architecture §3/§4, per Danny's binding Q-2 correction):
  there is no `NegativeFinding` path for `'problem-statement'` — that value does not exist in the
  `BriefElement` union. If the Extraction & Clustering Engine cannot establish any specific problem
  statement from the submitted/reachable sources, this slice surfaces that as a generation-failure
  signal (mapping to `Investigation.status = 'generation-failed'` via the existing R-4 fail-closed
  mechanism), not an absence finding. Slice 9 enforces the resulting hard stop: no `BriefVersion`
  is persisted at all in that case.
- **`ProblemStatementCandidate` output shape (roadmap correction, this revision):** the
  Extraction & Clustering Engine's clustering step returns `ProblemStatementCandidate[]` —
  `{ whoExperiencesIt, contextOrWorkflow, consequenceOrFriction, supportingClaimVersionIds }` — as
  an in-memory return value, not a persisted row. No `ProblemStatement` table/collection write
  happens in this slice. Slice 9 (Brief Assembler) is what turns an accepted candidate into a
  persisted `ProblemStatement` row, atomically with the `BriefVersion` it belongs to.
- This slice has no UI surface of its own yet — its output becomes visible in Slice 10's
  Investigation Screen — Completed State; do not build a standalone screen for it (avoids
  duplicating UI Spec's Out-of-Scope "no UI for browsing... beyond" boundary).

**Tests:**
- [ ] Given multiple sources with overlapping evidence, evidence items supporting the same claim
      are grouped under the same `ClaimVersion`, each with its own `ClaimVersionEvidence` row.
- [ ] Given contradicting evidence in source material, a `ClaimVersionEvidence` row is persisted
      with `stance: 'contradicting'` for that (claimVersionId, evidenceItemId) pair, present in
      the Brief's eventual evidence set, not dropped.
- [ ] Given a single `EvidenceItem` cited by two different `ClaimVersion`s with different stances
      (e.g. supporting one, contradicting another), both `ClaimVersionEvidence` rows persist
      independently and the shared `EvidenceItem` itself carries no stance field.
- [ ] Given an unlabelable claim, the system defaults to `unknown` or `assumption`, never omits
      the label field.
- [ ] Given a correction to an existing `Claim`, a new `ClaimVersion` is created under the same
      `Claim.id`; the prior `ClaimVersion` is not edited.
- [ ] Given reachable source material from which no specific problem statement can be established
      (e.g. sources are on-topic but too vague/general to cluster into a concrete problem), the
      Extraction & Clustering Engine produces zero `ProblemStatementCandidate` results and surfaces
      an explicit generation-failure signal (not a `NegativeFinding` — `'problem-statement'` is
      non-negatable) sufficient for Slice 9 to fail the run and set
      `Investigation.status = 'generation-failed'`, with no `ProblemStatement` or `BriefVersion`
      persisted.

**Done When:**
- [ ] US-2 and US-3 acceptance criteria pass.
- [ ] All tests pass.

---

### Slice 5: Demand Analyzer + Personal Pull Extractor

**Goal:** Demand signals and a qualitative, non-numeric demand-confidence classification are
recorded as two distinct fields; Personal Pull content is quarantined from both (US-4, US-12).

**Depends On:** Slice 4

**Files:**
- Persistence for `DemandSignal`, `DemandConfidenceClassification`, `PersonalPullNote`
  (Architecture §3 "Demand")
- Demand Analyzer implementation
- Personal Pull Extractor implementation

**Implementation Notes:**
- `DemandConfidenceLevel` is a literal string union (`Insufficient|Emerging|Substantiated`) —
  no system-generated numeric confidence/score field anywhere in this slice's output, per the
  Anti-Patterns table and the Numeric Scope Rule (Q-1) — this does not prohibit sourced/cited
  numeric claims appearing in narrative text, only a fabricated evaluative score authored by
  Department OS itself.
- `DemandSignal.evidenceItemIds` is non-empty by contract, folded into Slice 8's R-4 fail-closed
  boundary — an empty array is treated exactly like an invalid enum value, not silently accepted.
  `DemandConfidenceClassification.citedDemandSignalIds` is the **sole named exception** to the
  non-empty rule (Architecture §4) — `Insufficient` confidence may legitimately cite zero signals;
  do not apply the non-empty check to this field.
- `PersonalPullNote.label` is fixed to `'contextual-motivation'` and structurally has no field
  compatible with `DemandSignalType`/`DemandConfidenceLevel` — verify this is a type-level
  guarantee, not just a convention, in whatever stack Slice 1 selected.
- This slice does not itself persist `BriefVersion.negativeFindings` — that array lives on
  `BriefVersion` and is assembled by Slice 9 (Brief Assembler) per Architecture §3's fail-closed
  rule (G-1). This slice's job is only to produce the correct *inputs* to that rule for the
  `demand-signal-type` element: either a non-empty `DemandSignal` set, or (when none is found) the
  data the Brief Assembler needs to construct a `NegativeFinding` row with
  `element: 'demand-signal-type'` and a non-empty `statement` (e.g. surfaced via the Demand
  Analyzer's output for that Investigation) — it does not construct the `NegativeFinding` record
  itself.
- **`DemandConfidenceClassification.negativeFindingRef` (Architecture §3, PR-review re-review
  correction):** populated **if and only if** a `NegativeFinding` row with
  `element: 'demand-signal-type'` exists for this `BriefVersion` — i.e., `demandSignalIds` is
  empty (no demand signals found at all) — and holds that row's `NegativeFinding.id`. This is
  explicitly NOT derived from `level === 'Insufficient'` or from `citedDemandSignalIds` being
  empty: a run where `demandSignalIds` is non-empty but `citedDemandSignalIds` is empty (signals
  were found, none specifically drove the classification) has no `NegativeFinding` row for
  `'demand-signal-type'`, so `negativeFindingRef` must remain unset in that case. This slice
  supplies the value Slice 9 persists; it does not itself write the `NegativeFinding` row.

**Tests:**
- [ ] Given demand evidence, each `DemandSignal.type` is drawn from the named list or `'other-
      observed-behavior'` with `otherTypeLabel`.
- [ ] Given a full evidence set, `DemandConfidenceClassification.level` is exactly one of the
      three values with a narrative citing signals/gaps.
- [ ] Given Personal-Pull-only source material, the Demand Analyzer produces zero `DemandSignal`
      records and surfaces sufficient output for the Brief Assembler (Slice 9) to construct a
      `NegativeFinding` row with `element: 'demand-signal-type'` and a non-empty `statement`
      (never a structurally empty list left unexplained, per Q-2/G-18/G-1) — and
      `DemandConfidenceClassification.level` is `Insufficient` with a narrative explaining the
      absence, `citedDemandSignalIds` legitimately empty in this case (Edge Case row), and
      `negativeFindingRef` resolves to that `NegativeFinding` row's `id`.
- [ ] Given `demandSignalIds` non-empty but `citedDemandSignalIds` empty (signals were found, but
      none specifically drove the confidence classification), no `NegativeFinding` row exists for
      `'demand-signal-type'` and `DemandConfidenceClassification.negativeFindingRef` remains unset
      — confirms the field is not derived from `citedDemandSignalIds` or `level` alone.
- [ ] Given Personal Pull framing, it never appears in `DemandSignal`/`DemandConfidenceClassification` — recorded only in `PersonalPullNote`.
- [ ] No system-generated numeric confidence/evaluative score appears anywhere in the produced
      records (Q-1) — a sourced, attributed numeric claim quoted from source material is not
      itself a violation.

**Done When:**
- [ ] US-4 and US-12 acceptance criteria pass, including the Personal-Pull-only edge case.
- [ ] All tests pass.

---

### Slice 6: Landscape Researcher (incl. Independent Web Search) + Gap Hypothesis Generator

**Goal:** The Landscape Researcher performs its **own independent public web search and
retrieval** for existing solutions/competitors — not bounded to what submitted artifacts mention
(Q-6, US-5) — and records the existing-solution landscape and an evidence-supported, categorized
gap hypothesis.

**Depends On:** Slice 4

**Files:**
- Persistence for `ExistingSolution`, `GapHypothesis`, `WebSearchQuery`, `WebSearchResult`
  (Architecture §3 "Landscape & Gap" / Q-6 schemas)
- `SourceArtifact.origin: 'landscape-research'` write path — a web result the Landscape
  Researcher retrieves itself becomes a `SourceArtifact` exactly like a submitted one, then flows
  through the existing `EvidenceItem`/`ClaimVersion`/`ClaimVersionEvidence` pipeline (Slice 4)
  unchanged; no second citation model
- `searchWeb` service function (Architecture §4) — vendor-agnostic; the specific search
  API/provider is whatever Slice 1's DDR selected, not chosen here
- Landscape Researcher implementation (orchestrates one-or-more `searchWeb` calls per
  Investigation, evaluates/selects results to retrieve)
- Gap Hypothesis Generator implementation

**Implementation Notes:**
- Every `WebSearchQuery` preserves `query`, `performedAt`, every `WebSearchResult` (URL,
  retrieval timestamp, `status: 'retrieved'|'blocked'|'failed'`, `failureReason` when
  applicable), plus `scopeNote`/`limitations` — failed/blocked retrievals are recorded, never
  silently dropped (US-5 AC2/AC4, Edge Case "Landscape web search returns zero results").
- A submitted artifact naming zero (or a selective/outdated) competitor set never substitutes for
  this independent research — it may be recorded as a labeled, attributed claim, but the
  Landscape Researcher always runs its own search regardless of what was submitted (Edge Case
  row, US-5 AC1).
- Every `GapHypothesis` must cite `evidenceItemIds` — never asserted bare (US-5 AC2/AC6);
  non-empty by contract, folded into Slice 8's R-4 fail-closed boundary like every other
  required-citation field.
- Landscape/gap conclusions are cited through the same evidence/provenance/labeling model as
  every other Brief element (US-5 AC3) — no separate, unverifiable citation path for
  web-retrieved material.
- Can be built in parallel with Slice 5 (both depend only on Slice 4); sequenced after it here
  for a linear Forge session, not because of a hard dependency between them.
- As with Slice 5, this slice does not itself persist `BriefVersion.negativeFindings` — when a
  search returns zero usable results, this slice's job is to record that fully on
  `WebSearchQuery`/`WebSearchResult` (status, failureReason, limitations) and surface it to Slice
  9, which constructs the `NegativeFinding` row (`element: 'existing-solution'`, non-empty
  `statement`) on the assembled `BriefVersion` per Architecture §3's fail-closed rule (G-1). Same
  applies to `GapHypothesis`: an Investigation that yields no evidence-supported gap surfaces to
  Slice 9 for a `NegativeFinding` row with `element: 'gap-hypothesis'`.

**Tests:**
- [ ] Given a problem statement, the Landscape Researcher issues at least one `searchWeb` call
      and persists a `WebSearchQuery` with its `results`.
- [ ] Given a search result retrieved successfully, a `SourceArtifact` with
      `origin: 'landscape-research'` is created and becomes citable via the existing
      `EvidenceItem`/`ClaimVersionEvidence` pipeline.
- [ ] Given a search that returns zero results or whose retrievals fail/are blocked, the
      `WebSearchQuery`/`WebSearchResult` records this explicitly (`status`, `failureReason`,
      `limitations`), and the Landscape Researcher surfaces zero `ExistingSolution` records plus
      the search scope/limitations in a form sufficient for Slice 9 (Brief Assembler) to construct
      a `NegativeFinding` row with `element: 'existing-solution'` and a non-empty `statement` —
      not a workflow failure (Edge Case row).
- [ ] Given a researched problem, `ExistingSolution` entries record what addresses it, current
      coping, and where coping is inadequate.
- [ ] Given a gap, `GapHypothesis.category` is a named category (or `'other'` with
      `otherCategoryLabel`) and cites ≥1 evidence item.
- [ ] Given a submitted artifact naming zero competitors, the Landscape Researcher still performs
      independent web research rather than treating the submission as sufficient.
- [ ] Given an Investigation for which no evidence-supported gap can be produced, zero
      `GapHypothesis` records are persisted and the Landscape/Gap output surfaces enough context
      for Slice 9 to construct a `NegativeFinding` row with `element: 'gap-hypothesis'`.

**Done When:**
- [ ] US-5's acceptance criteria pass per `01-REQUIREMENTS.md`'s Acceptance Criteria section
      (including the two added by Q-6: independent search requirement and per-search provenance
      preservation) — see that section for the authoritative list; not restated here.
- [ ] All tests pass.

---

### Slice 7: Uncertainty Compiler + Recommendation Engine

**Goal:** Uncertainty is named explicitly and a reasoned, non-scored Approve/Reject/Watch
recommendation is produced from the full evidence set (US-6, US-7).

**Depends On:** Slices 5, 6 (reads demand + landscape/gap output as part of the full evidence
picture the recommendation must reference)

**Files:**
- Persistence for `UncertaintyStatement`, `Recommendation` (Architecture §3)
- Uncertainty Compiler implementation
- Recommendation Engine implementation

**Implementation Notes:**
- `Recommendation.decision` is exactly one of `Approve|Reject|Watch` with a `rationale` string —
  never a bare label, never a system-generated numeric score (US-7 AC1, Anti-Patterns table, Q-1).
- `UncertaintyStatement` must populate all three named lists, even if some are single-item.

**Tests:**
- [ ] Given assembled evidence, uncertainty names ≥1 item in each of the three categories (or
      explicitly states none apply, per whatever null-representation the implementation chooses
      — but never omits the field).
- [ ] Given a completed evidence set, recommendation is exactly one of the three values with a
      rationale referencing specific evidence.
- [ ] Given a source with an unverifiable numeric claim (e.g. "$50M market"), that number is not
      adopted into `Recommendation.rationale` or `DemandConfidenceClassification.narrative` as
      validated (Edge Case row).

**Done When:**
- [ ] US-6 and US-7 acceptance criteria pass.
- [ ] All tests pass.

---

### Slice 8: Provenance Recorder

**Goal:** Every run of the Extraction→Recommendation pipeline (Slices 4–7) is wrapped in one
`GenerationRun`, anchored to `investigationId` (required), with `briefVersionId` set only on
success and an ordered per-step log — including for runs that fail to produce a `BriefVersion`
(US-11, G-12). This slice also implements US-11's schema-validation/bounded-repair mechanism
(Architecture §3 `SchemaValidationRecord`/`SchemaValidationAttempt`, attached to
`GenerationStep.validationRecords`, R-4 Danny-binding): every model-produced structured output is
schema-validated before persistence, with a bounded repair attempt on failure, and explicit
generation-run failure — never silent coercion — if repair is exhausted. This slice also owns the
**non-empty required-citation enforcement**, folded into this same R-4 fail-closed boundary
(PR-review binding correction).

**Depends On:** Slices 4, 5, 6, 7 (wraps all of them)

**Files:**
- Persistence for `GenerationRun`, `GenerationStep`, `SchemaValidationRecord`,
  `SchemaValidationAttempt` (Architecture §3 "Provenance")
- Provenance Recorder implementation — orchestration wrapper around the Slice 4–7 pipeline steps
- Schema-validation/bounded-repair mechanism implementation — invoked by the Provenance Recorder
  around every schema-constrained structured output produced by Slices 4–7 (Architecture §3 R-4
  note), and around every required-citation field (see below); the specific validation library is
  an implementation choice within whatever Slice 1 selected, not specified here

**Implementation Notes:**
- `GenerationRun.investigationId` is the required anchor; `briefVersionId` is nullable and set
  only when `outcome === 'succeeded'` — a run that fails (e.g. pipeline cannot populate all
  seven elements) still persists a `GenerationRun` with `outcome: 'failed'` and
  `briefVersionId: null` (G-12) rather than going unrecorded.
- `GenerationStep.component` names must match Architecture §2 component names exactly, to keep
  provenance traceable back to this spec.
- `runtimeIdentifier` records whichever candidate Slice 1 selected — this slice must not
  hardcode assumptions beyond what Slice 1's DDR names.
- `toolsInvoked` includes web-search/retrieval tool usage from Slice 6's `searchWeb` calls, not
  just extraction-side tools.
- Every `GenerationStep` that produces one or more schema-constrained structured outputs (a
  closed literal union or typed object per Architecture §3 — e.g. `EvidenceLabel`,
  `DemandConfidenceLevel`, `GapCategory`, `RecommendationDecision`) populates
  `GenerationStep.validationRecords` with one `SchemaValidationRecord` entry per constrained
  output the step produces (e.g. one `EvidenceLabel` validation record per `EvidenceItem` a
  single Evidence Labeler step labels); steps that produce no schema-constrained output leave it
  unset.
- **Non-empty required-citation enforcement (PR-review binding correction, folded into R-4):** an
  empty citation array on any required-citation field — `ClaimVersion.evidence`,
  `ProblemStatement.supportingClaimVersionIds`, `DemandSignal.evidenceItemIds`,
  `ExistingSolution.evidenceItemIds`, `GapHypothesis.evidenceItemIds` — is treated **exactly**
  like an out-of-schema enum value under this same validation mechanism: bounded repair (one
  re-prompt attempt, `MAX_REPAIR_ATTEMPTS = 1`), then explicit `GenerationRun` failure if the
  repaired output is still empty — never silently accepted or persisted as a valid record with
  zero citations. `DemandConfidenceClassification.citedDemandSignalIds` is the **sole named
  exception** (Architecture §4) — `Insufficient` confidence may legitimately cite zero signals;
  this field is exempt from the non-empty check.
- On validation failure (schema-invalid or empty-required-citation), exactly one bounded repair
  attempt is made (`MAX_REPAIR_ATTEMPTS = 1`, configuration not hardcoded per call site) —
  re-prompt the model with the original output and the validation error, then re-validate. No
  open-ended retry loop.
- `SchemaValidationAttempt.rawOutput` is retained for every attempt, valid or invalid, and is
  never overwritten or discarded — this is what makes the original invalid output, the
  validation error, and every repair attempt reconstructable after the fact (US-11 AC2).
- If the repaired output still fails validation (including still-empty required citations), the
  step is terminal-failed (`SchemaValidationRecord.finalOutcome === 'invalid'`): it produces no
  usable `outputRef` for that field, and this composes into `GenerationRun.outcome: 'failed'` —
  never silently coerced, defaulted, or persisted as if valid (Anti-Patterns table, R-4).

**Tests:**
- [ ] Given a full pipeline run, `GenerationRun.stepLog` has one entry per Slice 4–7 component
      with timing, `inputRefs`, `outputRefs`.
- [ ] `modelIdentifiers`/`toolsInvoked` are populated from the actual run, not defaulted/blank.
- [ ] Given a pipeline run that fails to produce a `BriefVersion`, `GenerationRun` is still
      persisted with `outcome: 'failed'` and `briefVersionId: null` — provenance is recorded for
      failed runs, not only successful ones.
- [ ] Given a schema-constrained structured output that validates on the first attempt,
      `SchemaValidationRecord.attempts` has length 1 and `finalOutcome === 'valid'`.
- [ ] Given a schema-constrained structured output that fails validation on the first attempt
      (e.g. an invalid enum member) but passes after one repair, `SchemaValidationRecord.attempts`
      has length 2, `finalOutcome === 'valid'`, and both the original invalid `rawOutput` and the
      `validationError` fed into the repair are preserved.
- [ ] Given a schema-constrained structured output that still fails validation after the bounded
      repair attempt, the step is terminal-failed, no coerced/defaulted value is persisted or used
      downstream, `SchemaValidationRecord.finalOutcome === 'invalid'` with both attempts preserved,
      and `GenerationRun.outcome === 'failed'`.
- [ ] Given a claim/signal/solution/gap-hypothesis whose first-attempt citation array is empty
      (e.g. a `ClaimVersion.evidence` or `GapHypothesis.evidenceItemIds` produced with zero
      entries), the same validate-repair-fail path runs: one bounded repair attempt, and if the
      repaired output is still empty, the step is terminal-failed and `GenerationRun.outcome ===
      'failed'` — the record is never persisted with an empty citation array.
- [ ] Given `DemandConfidenceClassification.citedDemandSignalIds` empty (e.g. `level:
      'Insufficient'` with zero cited signals), no validation failure is triggered and no repair
      is attempted — the documented exception passes through normally.
- [ ] No code path repairs more than once per field (`SchemaValidationRecord.attempts.length` never
      exceeds `1 + MAX_REPAIR_ATTEMPTS`).
- [ ] Given a step that produces multiple schema-constrained outputs (e.g. an Evidence Labeler
      run labeling several `EvidenceItem`s), `GenerationStep.validationRecords` contains one
      `SchemaValidationRecord` per output, not a single collapsed record.

**Done When:**
- [ ] US-11 acceptance criteria pass, including the schema-validation/bounded-repair AC and the
      non-empty required-citation enforcement AC.
- [ ] All tests pass.

---

### Slice 9: Brief Assembler

**Goal:** Pipeline outputs are assembled into one immutable `BriefVersion`, referencing exact
`ClaimVersion`/evidence ids (never copied claim text); corrections create a new version that
supersedes rather than mutates (US-10 AC1, AC2). This slice also delivers the **live** transition
into `Investigation.status === 'generation-failed'`, completing the wiring for the Investigation
Screen — Generation Failed State component built in Slice 3 (N-4). This slice also owns
persisting `BriefVersion.negativeFindings` per Architecture §3's `NegativeFinding` mechanism
(G-1): the concrete, fail-closed representation of "no X was found" for the four Brief elements
that can legitimately record absence (Problem Definition is non-negatable — Q-2).

**Depends On:** Slice 8

**Files:**
- Persistence for `ProblemBrief`, `BriefVersion`, `ProblemStatement`, `NegativeFinding`
  (Architecture §3 "Problem Brief identity & versioning" / "Evidence & Claims" / "Negative
  findings") — this slice is the sole slice that persists `ProblemStatement` rows, writing each one
  atomically with the `BriefVersion` that owns it, from an accepted `ProblemStatementCandidate`
  produced by Slice 4 (roadmap correction, see note above Slice 4)
- Brief Assembler implementation
- `generateBriefVersion` service function (Architecture §4) — the single entrypoint orchestrating
  Slices 4–8 and producing the assembled version
- Live wiring for Investigation Screen — Generation Failed State: this slice is what actually
  drives `Investigation.status` to `'generation-failed'`; the component itself was built in
  Slice 3 against a fixture — this slice's tests are what exercise it end-to-end.

**Implementation Notes:**
- Fail-closed: `generateBriefVersion` either returns a `BriefVersion` with all seven elements
  populated, or produces none. On failure, `Investigation.status` moves to `'generation-failed'`
  (sources were reachable but the pipeline couldn't populate all elements) or is left/set
  `'blocked'` (no reachable sources) — these are two distinct, type-level statuses, not one
  `'blocked'` value with a free-text reason (G-13) — never a partial Brief either way.
- **Problem statement is non-negatable (PR-review binding correction, Q-2):** before any
  `negativeFindings` logic runs, this slice requires at least one valid `ProblemStatement` to
  exist for the Investigation. If none does, the run fails explicitly on the R-4 path — no
  `BriefVersion` is persisted, `Investigation.status` becomes `'generation-failed'`, and no
  `NegativeFinding` with `element: 'problem-statement'` is ever constructed, because
  `'problem-statement'` does not exist in the `BriefElement` union. This check is independent of,
  and precedes, the `negativeFindings` fail-closed rule below.
- **`negativeFindings` fail-closed rule (Architecture §3/§4, G-1):** for each of the four
  `BriefElement` values (`'evidence'`, `'demand-signal-type'`, `'existing-solution'`,
  `'gap-hypothesis'`), this slice's assembly logic requires EITHER that element's id array
  (evidence citations reachable via `claimVersionIds`/`ClaimVersion.evidence`, `demandSignalIds`,
  `existingSolutionIds`, `gapHypothesisIds` respectively) is non-empty, OR a `NegativeFinding` row
  exists on this `BriefVersion` with `element` set to the matching value and a non-empty
  `statement`. Both empty — no ids and no `NegativeFinding` row — fails validation on the same R-4
  fail-closed path Slice 8 already enforces for schema-constrained outputs and required-citation
  arrays; this slice does not build a second, parallel validation mechanism, it applies R-4's
  existing bounded-repair/terminal-fail contract to this rule.
- The `NegativeFinding.statement` this slice persists must be a real, non-placeholder absence
  statement surfaced by the owning upstream component (Slice 5 for `'demand-signal-type'`, Slice 6
  for `'existing-solution'`/`'gap-hypothesis'`, Slice 4 for `'evidence'`) — this slice assembles
  and persists the row; it does not author the absence statement's content itself from nothing.
- A `GenerationRun.outcome: 'failed'` produced by Slice 8's bounded-repair exhaustion (a
  schema-validation terminal failure, **including exhaustion caused by an empty required-citation
  array**, and now including exhaustion of the `negativeFindings` fail-closed rule above — see
  Slice 8) is one of the failure paths that must surface as
  `Investigation.status === 'generation-failed'` here — this slice does not need its own
  validation logic beyond applying the rule above, only to honor Slice 8's recorded `outcome`
  when deciding the Investigation's resulting status.
- `BriefVersion.claimVersionIds` references exact `ClaimVersion` ids from Slice 4's output — no
  copy of claim text, no reference to the mutable `Claim` identity (Q-4, Anti-Patterns table).
- No in-place mutation of a published `BriefVersion` — enforce at the persistence layer, not just
  by convention (Anti-Patterns table).
- `BriefVersion` carries no stored `status` field — assigned validity is read from `StatusEvent`
  at query time (Slice 12); this slice must not add a `status` column (Q-3, Anti-Patterns table).
- `ProblemBrief.currentVersionId` is the one derived-index field permitted to update on this
  record (PR-review binding correction, option (a)) — every other `ProblemBrief` field
  (`id`, `investigationId`, `createdAt`) is immutable. `currentVersionId` updates exactly once per
  successful `generateBriefVersion` run for that `problemBriefId`; every prior `BriefVersion`
  remains independently readable and immutable regardless of the pointer moving. This slice's own
  Done-When/tests must not assert stricter immutability against this field than the architecture
  permits.
- This is the slice where "one cited Problem Brief" (North Star) becomes real — first point at
  which all seven required Brief elements exist together against a recorded evidence trail.

**Tests:**
- [ ] Given a successful pipeline run, exactly one `BriefVersion` (version 1) is created with all
      seven elements populated and `generationRunId` set.
- [ ] Given a correction, a new `BriefVersion` is created with `supersedesVersionId` pointing at
      the prior version; the prior version's content remains readable unchanged; and
      `ProblemBrief.currentVersionId` is the only field on the `ProblemBrief` record that changes
      as a result — `id`, `investigationId`, `createdAt` are unchanged.
- [ ] Given a pipeline run that cannot populate all seven elements, no `BriefVersion` is created
      and `Investigation.status` becomes `'generation-failed'`, and revisiting the Investigation
      Screen renders the Generation Failed State built in Slice 3 with the real `statusReason`.
- [ ] Given a run with zero reachable sources, `Investigation.status` is `'blocked'`, distinct
      from `'generation-failed'`.
- [ ] Given a `GenerationRun.outcome: 'failed'` produced by exhausted schema-validation repair
      (Slice 8), including exhaustion caused by an empty required-citation array,
      `Investigation.status` becomes `'generation-failed'` and no `BriefVersion` is created.
- [ ] Given a run in which the Demand Analyzer (Slice 5) finds zero demand signals but supplies a
      non-empty absence statement, the assembled `BriefVersion.negativeFindings` contains exactly
      one row with `element: 'demand-signal-type'` and that non-empty `statement`, and
      `demandSignalIds` is empty on that `BriefVersion`.
- [ ] Given a run in which no valid `ProblemStatement` can be established, the run fails
      explicitly: no `BriefVersion` is persisted, `Investigation.status` becomes
      `'generation-failed'`, and no `NegativeFinding` row with `element: 'problem-statement'` is
      ever constructed (that value does not exist in `BriefElement`). This check is asserted
      independently of the four-element `negativeFindings` rule below.
- [ ] Given a run in which each of the four negatable elements
      (`evidence`/`demand-signal-type`/`existing-solution`/`gap-hypothesis`) independently has
      either a non-empty id array or a corresponding `NegativeFinding` row, the `BriefVersion` is
      created successfully with `negativeFindings.length` equal to the number of elements that
      were empty (0–4 rows), each with the matching `element` value and a non-empty `statement`.
- [ ] Given a run in which one of the four negatable elements has both an empty id array AND no
      corresponding `NegativeFinding` row (or a `NegativeFinding` row with an empty `statement`),
      the fail-closed rule rejects the run on the same R-4 path as an out-of-schema enum value: no
      `BriefVersion` is persisted, and the failure composes into `GenerationRun.outcome ===
      'failed'` / `Investigation.status === 'generation-failed'`.

**Done When:**
- [ ] US-10 AC1 and AC2 pass.
- [ ] All tests pass.
- [ ] `negativeFindings` fail-closed rule (G-1) is enforced and covered by tests above.
- [ ] This slice's vertical-slice check: touches evidence (all Section 3 sub-entities), workflow
      state (`Investigation.status → 'brief-generated'` or `'generation-failed'`), and is the
      direct input to the decision recorded in Slice 11 — satisfies `docs/principles.md`'s
      complete-vertical-slice requirement end to end for the generation half of the flow.

---

### Slice 10: Investigation Screen — Completed State (Read-Only)

**Goal:** A human can read all seven required Brief elements (per `01-REQUIREMENTS.md`'s
canonical list) for one `BriefVersion`, presented from the same durable Investigation URL
(US-13 read half, Flow 3 steps 1–2, Q-7).

**Depends On:** Slice 9

**Files:**
- `getBriefForReview` read-model function (Architecture §4) — wire the `brief-generated` branch
  of Slice 3's `getInvestigation` through to this function, completing the chain Architecture §4
  specifies (`getInvestigation` → `ProblemBrief.currentVersionId` → `getBriefForReview`)
- Investigation Screen — Completed State (UI Spec) — full component tree from `CompletedState`
  down through `RecommendationSection` (excluding `DecisionForm`, built in Slice 11)

**Implementation Notes:**
- All seven elements rendered without collapse-by-default, per UI Spec's explicit constraint
  (uncertainty and contradicting evidence not minimized).
- No system-generated numeric confidence/score rendered anywhere on this screen — level/label
  badges only; this does not prohibit sourced numeric text elsewhere in the content (e.g. the
  provenance line's `BriefVersion #N`) (Q-1).
- Personal Pull section visually/structurally separated from Demand sections.
- `getBriefForReview` returns `assignedState`/`isSuperseded` per-`ClaimVersion` and for the
  `BriefVersion` itself (Q-3) and `priorDecisions: Decision[]` (plural — G-11, see Slice 11) —
  this screen renders the current values now; Slice 12 wires the Decision-History Banner
  reflecting non-`'valid'` states.
- Architecture §4's R-1 limitation (citation presence, not citation correctness) must be
  surfaced as explicit copy on this screen per `02-ARCHITECTURE.md`'s note — a populated citation
  list is not independent verification. Implemented as `CitationScopeNotice`, fixed and always
  visible, below the provenance line and above section 1.
- Evidence rendering for each `ClaimVersion` iterates its `evidence: NonEmptyArray<ClaimVersionEvidenceRef>`
  (resolving each `evidenceItemId` to its shared `EvidenceItem` for excerpt/label), reading
  `stance` from the ref itself, not from the resolved `EvidenceItem` — the same `EvidenceItem` may
  legitimately render with a different stance under a different `ClaimVersion` elsewhere on the
  same or a different Brief.
- The Existing-Solution Landscape section (section 4) must render `SearchScopeNotice` — the
  queries performed (`WebSearchQuery.query`) and any failed/blocked retrievals
  (`WebSearchResult.status !== 'retrieved'`) — regardless of whether any `ExistingSolution` was
  found (Q-6).
- `NegativeFindingNotice` applies to exactly 4 of the 7 required Brief elements — Evidence, Demand
  Evidence (the signal-type field), Existing-Solution Landscape, and Gap Hypothesis — each of
  which must render this component's populated, explicit absence statement (structurally distinct
  from a loading/error empty state) when the corresponding field is a recorded negative finding,
  not just when populated (Q-2/G-18). This is driven directly by the concrete `NegativeFinding`
  rows Slice 9 persists on `BriefVersion.negativeFindings`: for a given section, render
  `NegativeFindingNotice` with the matching row's `statement` when a `NegativeFinding` exists with
  `element` equal to that section's `BriefElement` value, and render the normal populated view
  otherwise. **Problem Definition is non-negatable (Q-2 correction)** — this screen can only be
  reached via `Investigation.status === 'completed'`, which itself requires a `BriefVersion` to
  exist, which itself requires ≥1 valid `ProblemStatement` (Slice 9) — so the Problem Definition
  section always renders real content here, never `NegativeFindingNotice`. Demand Evidence's
  confidence field and Uncertainty are
  structurally always-populated and never render `NegativeFindingNotice` — see 03-UI-SPEC.md.

**Tests:**
- [ ] Given a `BriefVersion`, the Investigation Screen — Completed State renders all seven
      required Brief elements per `01-REQUIREMENTS.md`'s canonical enumeration and the UI Spec
      layout: (1) Problem Definition, (2) Evidence w/ contradicting inline, (3) Demand Evidence
      (signal types + confidence, rendered as one bundled element), (4) Existing-Solution
      Landscape, (5) Gap Hypothesis, (6) Uncertainty, (7) Decision Recommendation — plus Personal
      Pull (if present) as a non-canonical contextual field.
- [ ] Contradicting evidence renders inline with supporting evidence under the same claim group,
      not hidden/separate, with stance read from the `ClaimVersionEvidenceRef`, not from the
      `EvidenceItem`.
- [ ] R-1's citation-presence-not-correctness limitation (`CitationScopeNotice`) is visible as
      copy on the screen.
- [ ] `SearchScopeNotice` renders the queries performed and any failed/blocked retrievals in the
      Existing-Solution Landscape section, both when solutions were found and when none were
      found (Q-6).
- [ ] For each of the 4 sections that render `NegativeFindingNotice` (Evidence, Demand Evidence's
      signal-type field, Existing-Solution Landscape, Gap Hypothesis), given a `BriefVersion`
      whose `negativeFindings` array contains a `NegativeFinding` row with the corresponding
      `element` value, `NegativeFindingNotice` renders that row's `statement` as a completed,
      non-error, non-loading statement in the section's normal layout position — never sharing
      visual/structural treatment with a true loading/error empty state (G-18).
- [ ] The Problem Definition section never renders `NegativeFindingNotice` under any
      circumstance — `'problem-statement'` is not a member of `BriefElement`, so no matching
      `NegativeFinding` row can exist (Q-2 correction).

**Done When:**
- [ ] US-13's read requirement is satisfied (decision-recording half deferred to Slice 11).
- [ ] All tests pass.

---

### Slice 11: Decision Recorder + Decision Form + Decision Confirmation Panel

**Goal:** A human can record an Approve/Reject/Watch decision bound to the exact `BriefVersion`
reviewed, with Watch requiring ≥1 reconsideration condition (US-8, US-9, US-13 decision half,
Flows 3–4).

**Depends On:** Slice 10

**Files:**
- Persistence for `Decision`, `ReconsiderationCondition` (Architecture §3 "Decision")
- `recordDecision` service function (Architecture §4)
- Decision Recorder implementation
- `DecisionForm` component (UI Spec, added to Investigation Screen — Completed State) +
  `DecisionConfirmationPanel` — an **in-place, non-navigating panel on the same Investigation
  Screen URL**, per Q-7; this is not a separate screen or route.

**Implementation Notes:**
- `Decision.briefVersionId` is a fixed foreign key — never reassigned/migrated on a later
  correction (US-8 AC2, Pattern table "Decision-to-version binding").
- Watch with zero reconsideration conditions rejected server-side even if client check is
  bypassed (US-9 AC2).
- No `nextCheckAt`/scheduler field — reconsideration stays manual (US-9 AC3, Anti-Patterns).
- Approve does not trigger any Prototype Department call or build step (US-8 AC3) — verify no
  such call exists anywhere in this slice's code path.
- Reject is **reconsiderable, not reopenable** (Q-5): this slice does not build a Reopen
  mechanism of any kind. A rejected `BriefVersion`/`Investigation` remains exactly as decided;
  reconsideration happens by submitting new source material (Slice 2's `submitSources`), which
  starts a new `generateBriefVersion` run (Slice 9) and produces an independent `BriefVersion`
  with its own independent `Decision`. No dedicated reopen endpoint, button, or state transition
  should exist anywhere in this slice.
- More than one `Decision` may exist against the same `briefVersionId` over time (e.g. a Watch
  later revisited as Approve/Reject) — `recordDecision` does not reject a second decision on an
  already-decided version; `getBriefForReview`'s `priorDecisions: Decision[]` (plural, G-11)
  surfaces the full history, not a single `priorDecision`.

**Tests:**
- [ ] Given a Brief, Approve/Reject/Watch decisions each persist bound to the exact
      `briefVersionId` reviewed.
- [ ] Given Watch with 0 conditions, server rejects; no `Decision` persisted.
- [ ] Given Watch with ≥1 condition, `Decision` persists with `reconsiderationConditionIds`
      populated.
- [ ] Given Reject, the Brief and its evidence remain retrievable afterward (no deletion
      anywhere in the code path), and no reopen mechanism exists — US-9 AC1, Q-5.
- [ ] Given Approve, no Prototype Department call or build-triggering side effect occurs.
- [ ] Given the same `BriefVersion` is later superseded, the original `Decision` remains bound to
      the original version, not migrated.
- [ ] Given a second decision is recorded against a `briefVersionId` that already has one (e.g.
      Watch then later Approve), both persist and both appear in `priorDecisions`, in
      `decidedAt` order.
- [ ] Given a successful `recordDecision` call, the `DecisionConfirmationPanel` renders in place
      on the same Investigation Screen URL — no navigation occurs.

**Done When:**
- [ ] US-8, US-9, and the decision half of US-13 acceptance criteria pass.
- [ ] All tests pass.
- [ ] Vertical-slice check: this slice is the flow's decision-of-record — evidence (the Brief
      just reviewed), workflow state (`Decision` persisted), and the decision itself converge
      here, satisfying `docs/principles.md` end to end for the review half of the flow.

---

### Slice 12: Validity/Invalidation Service + Decision-History Banner (Flow 5)

**Goal:** A `ClaimVersion` or `BriefVersion` can be marked `challenged`/`invalidated` via an
append-only `StatusEvent` log, with visibility into which decisions depended on it while it was
last assigned `valid`; the Investigation Screen — Completed State surfaces prior decisions and
non-`valid` status plainly (US-10 AC3, Flow 5).

**Depends On:** Slices 9, 11 (needs both `BriefVersion`/`ClaimVersion` records and `Decision`
records to compute dependent decisions)

**Files:**
- Persistence for `StatusEvent` (Architecture §3 "Bitemporal validity," Q-3)
- `assignValidityState`, `getAssignedState`, `getAssignedStateAsRecorded` service functions
  (Architecture §4) — two distinct, non-conflatable queries (PR-review binding correction)
- Validity/Invalidation Service implementation
- `DecisionHistoryBanner` component (UI Spec, added to Investigation Screen — Completed State)

**Implementation Notes:**
- **No mutable status field anywhere** — `Claim`, `ClaimVersion`, and `BriefVersion` carry no
  `status` column. Assigned validity state is answered by two distinct queries, both named
  `getAssignedState*` (never `getValidityAt`/`isValid`) to keep the epistemic framing explicit at
  the API boundary (Q-3):
  - `getAssignedState({ targetType, targetId, asOf? })` — **current-knowledge**: the latest
    `StatusEvent` for `(targetType, targetId)` with `effectiveAt <= asOf`, evaluated against
    everything ever recorded (no `recordedAt` bound); defaults to `'valid'` when no `StatusEvent`
    exists. This answer can change over time if a later, backdated `StatusEvent` is recorded —
    expected behavior for this query.
  - `getAssignedStateAsRecorded({ targetType, targetId, asOf?, knownAsOf })` — **as-of-knowledge**:
    reconstructs what Department OS actually knew at knowledge-time `knownAsOf`, immune to later
    backdated corrections. Latest `StatusEvent` with `effectiveAt <= asOf` **and**
    `recordedAt <= knownAsOf`; `'valid'` if none exists. `knownAsOf` is required, no default.
  - Framing discipline (Q-3, binding): both answer *"what validity state did Department OS assign
    to this item at time T,"* never *"was this item objectively valid at time T."*
- `assignValidityState`'s `dependentDecisionIds` (US-10 AC3's "whole point") is computed by: (1)
  appending the new `StatusEvent`, (2) reverse-querying `BriefVersion.claimVersionIds` for the
  affected `ClaimVersion.id` (or, if `targetType === 'brief-version'`, matching that
  `BriefVersion.id` directly), (3) for each matching `BriefVersion`, reading every `Decision`
  bound to it via `Decision.briefVersionId`, filtered to decisions made while the target's
  assigned state was last `'valid'` **as reconstructed at that decision's own knowledge-time** —
  i.e. this filter step calls `getAssignedStateAsRecorded` with `knownAsOf =
  Decision.decidedAt` for each candidate `Decision`, not the current-knowledge `getAssignedState`
  (this is "what did the system believe when this decision was made," not "what do we believe
  now") — per the query split above. Computed at call time, never stored redundantly.
- `DecisionHistoryBanner` must surface, without burying: `priorDecisions` (plural, per
  `getBriefForReview` — G-11) and non-`'valid'` assigned state (`challenged`/`invalidated`), per
  Flow 5. "Superseded" is a separate, structural fact (some other `BriefVersion` under the same
  `problemBriefId` names this one via `supersedesVersionId`) computed via `isSuperseded`, not an
  assigned state — the banner surfaces both facts distinctly.
- No UI is built for a human to *initiate* `assignValidityState` in this MVP (UI Spec Out of
  Scope) — this slice implements the service + the read-side banner only.

**Tests:**
- [ ] Given a `ClaimVersion`/`BriefVersion` marked `invalidated`, `dependentDecisionIds` includes
      every `Decision` bound (directly or via `claimVersionIds`) to a `BriefVersion` while the
      target's assigned state, reconstructed via `getAssignedStateAsRecorded` at that Decision's
      own `decidedAt`, was last `'valid'`.
- [ ] Given `getAssignedState` called with an `asOf` before any `StatusEvent`'s `effectiveAt`, it
      returns `'valid'` (the default).
- [ ] Given a late-discovered correction (a `StatusEvent` with `effectiveAt` in the past but
      `recordedAt` now), `getAssignedState` for an `asOf` between the two timestamps reflects the
      new event, without mutating any prior event — while `getAssignedStateAsRecorded` called with
      `knownAsOf` before the correction's `recordedAt` still returns the pre-correction state,
      demonstrating the two queries diverge as designed.
- [ ] Given a `BriefVersion` with `priorDecisions` and/or a non-`'valid'` assigned state, the
      `DecisionHistoryBanner` renders both facts without requiring scrolling/interaction to
      reveal.
- [ ] Given a superseded version, the banner surfaces `isSuperseded` and links to the current
      version via `ProblemBrief.currentVersionId`.

**Done When:**
- [ ] US-10 AC3 passes via the `StatusEvent`-backed query above (no unresolved "not computable"
      caveat remains), and Flow 5 renders correctly for all three assigned-state values plus the
      prior-decisions and superseded cases.
- [ ] All tests pass.

---

## Sequence Rules

1. Complete each slice fully (implementation notes, tests, done-when) before starting the next.
2. No partial slice work — a slice is either shipped complete or not started.
3. If a slice is blocked (e.g. Slice 1's DDR is not `ACCEPTED`, or Slice 1's stopping rule was
   invoked and Danny's resolution is not yet recorded), HALT and do not skip ahead to a
   dependent slice.
4. Each slice must pass its own tests before the next slice that depends on it begins.
5. Slices 5 and 6 may be implemented in either order or in parallel (both depend only on Slice 4
   and neither depends on the other) — this is the only non-linear point in the sequence.
6. No new slices added without human approval; if a Forge session discovers a slice needs
   splitting, HALT and report rather than silently reordering.
7. Per this repo's Frank binding-gate discipline, the sprint's forge-gate runs once all 12 slices
   are complete — not per-slice — but every slice's own Done-When criteria must be independently
   verified against live files before the sprint-level gate is invoked.

---

## Deferred (Not This Roadmap)

- Automated/multi-channel source discovery (collectors, bookmarks, browser history) — the
  `SubmissionOrigin`/`SourceArtifactType` open discriminators (Slice 2) leave room for this, but
  no collector is built. This does not include the Landscape Researcher's own independent web
  search (Slice 6), which is required, not deferred.
- Selection of a specific web-search vendor/API/technology — Slice 6 implements `searchWeb`
  against whatever candidate Slice 1's DDR selected; no permanent search provider is chosen by
  this roadmap.
- A dedicated Reopen mechanism for Rejected investigations — confirmed not needed (Q-5);
  reconsideration happens via new source material → new `generateBriefVersion` run → new
  `BriefVersion` → independent new `Decision`, all already covered by Slices 2/9/11.
- A UI for a human to initiate `assignValidityState` or trigger a corrective `BriefVersion` —
  Slice 12 implements the service and read-side banner only.
- A UI for browsing full `BriefVersion` lineage/history beyond the single current-vs-superseded
  pointer.
- Investigation/Brief list, dashboard, search, or filter views.
- In-app notifications or polling UI for Brief-generation progress.
- Opportunity schema, data model, or workflow states — referenced only as a future concept per
  Architecture §7; no slice builds it.
- A generalized/path-agnostic Brief-equivalent schema for Personal Pull or other future entry
  paths.
- Scheduled/automated reconsideration of Watch items.
- Authentication/authorization UI.
- Any visual design system, responsive layout, or frontend framework selection — remains an
  implementation-time choice within whatever Slice 1 selects, not specified here.
- Permanent retirement of the runtime-evaluation harness/spike artifacts from Slice 1 — kept only
  as long as useful for future runtime re-evaluation; not part of the shipped product surface.
- Claim-evidence relevance validation (R-1) — this roadmap's slices guarantee citation presence,
  not citation correctness; solving relevance validation is out of scope for this MVP per
  Architecture §4.
- Selection of a specific schema-validation library/technology for Slice 8's
  validation/bounded-repair mechanism — implementation choice within whatever Slice 1 selects.

---

## Output Verification

- [x] Every architecture component listed in `02-ARCHITECTURE.md`'s Section 2 component list is
      covered in a slice.
- [x] Every UI screen/state in `03-UI-SPEC.md`'s current model (2 durable-URL screens, 4
      Investigation Screen states) is covered in a slice.
- [x] Every user story (US-1–US-13) is covered in at least one slice's Done-When criteria, with
      acceptance-criteria counts matching `01-REQUIREMENTS.md`'s Acceptance Criteria section
      exactly (see that section for the current per-story and total counts — not restated here
      per this doc set's history of AC-count drift).
- [x] No circular dependencies — Dependency Map and Slice Overview form a DAG (Slices 5/6 are the
      only parallelizable pair, both strictly downstream of Slice 4; Slice 6's addition of
      `searchWeb`/`WebSearchQuery`/`WebSearchResult` does not change this shape, since it is
      absorbed into Slice 6 rather than added as a new node).
- [x] Each slice has concrete file paths (or explicit "path TBD by Slice-1-selected stack" where
      the file path genuinely cannot be named before the runtime/storage decision exists).
- [x] Each slice has testable Done-When criteria traceable to specific acceptance criteria.
- [x] No code, runtime, database, framework, or search vendor selected in this document — Slice 1
      is scoped as an evaluation-and-decision slice, not an implementation slice.
- [x] `getInvestigation` (G-20/G-15), the `StatusEvent`-backed validity query pair (G-21),
      Q-6's independent web-search capability (Slice-6 scope), Slice 1's Q-8 framing and G-22
      stopping rule, the `GenerationRun`/`Investigation.status`/`priorDecisions` schema
      updates (G-12/G-13/G-11), and R-4's schema-validation/bounded-repair mechanism, now
      including non-empty required-citation enforcement (Slice 8), are all reflected in the
      slice detail above.
- [x] All UI vocabulary throughout this document matches `03-UI-SPEC.md`'s current model exactly:
      `SubmissionScreen`, `InvestigationScreen` with its four states (`GeneratingState`,
      `BlockedState`, `GenerationFailedState`, `CompletedState`), `DecisionConfirmationPanel` as
      an in-place panel (not a screen or route), and `DecisionHistoryBanner`. No reference to the
      superseded `SubmissionConfirmationState`, `BriefReviewScreen`, a single merged
      `BlockedFailedState`, or a "Decision Confirmation State screen" remains anywhere in this
      document (F-3).
- [x] `SearchScopeNotice` and `NegativeFindingNotice` (4 of the 7 required Brief elements, per
      `01-REQUIREMENTS.md`'s canonical enumeration — Problem Definition excluded, non-negatable
      per Q-2) have explicit test coverage in Slice 10's Tests, and Slice 10's Implementation
      Notes state both render regardless of whether the corresponding section found a populated
      result (F-5).
- [x] Investigation Screen — Generation Failed State's slice ownership is explicit and
      unambiguous: the component/copy is built in Slice 3 (against a fixture `statusReason`);
      Slice 9 delivers the live pipeline transition into `'generation-failed'` and owns the
      end-to-end test that actually exercises it (F-5/N-4).
- [x] The seven required Brief elements are referenced throughout this document per
      `01-REQUIREMENTS.md`'s canonical enumeration (D-15): (1) problem definition, (2) evidence,
      (3) demand evidence — signal type and confidence bundled as one element, (4)
      existing-solution landscape, (5) gap hypothesis, (6) uncertainty, (7) decision
      recommendation. No enumeration in this document splits demand into two elements or omits
      Decision Recommendation from the count of seven.
- [x] `EvidenceItem.stance` no longer appears anywhere in this document — Slice 4 builds
      `ClaimVersionEvidence`/`ClaimVersionEvidenceRef` instead, and Slice 10 reads stance from the
      relationship, not the evidence item (PR-review binding correction).
- [x] Non-empty required-citation enforcement is explicitly folded into Slice 8's R-4 fail-closed
      mechanism, with `DemandConfidenceClassification.citedDemandSignalIds` named as the sole
      exception wherever the non-empty rule is stated (PR-review binding correction).
- [x] Slice 12 references `getAssignedStateAsRecorded` (not `getAssignedState`) for
      `assignValidityState`'s decision-time reconstruction, per the two-query split (PR-review
      binding correction).
- [x] `ProblemBrief.currentVersionId` is named in Slice 9 as the one permitted single-writer
      index-field exception to Brief immutability, and Slice 9's Done-When/tests do not assert
      stricter immutability against it (PR-review binding correction).
- [x] `BriefVersion.negativeFindings`/`NegativeFinding` (Architecture §3 "Negative findings," G-1)
      is wired concretely across four negatable elements: Slice 4 is the upstream owner for
      `'evidence'`; Slice 5 for `'demand-signal-type'`; Slice 6 for
      `'existing-solution'`/`'gap-hypothesis'` — none construct `NegativeFinding` rows themselves,
      they surface absence data to Slice 9. `'problem-statement'` is non-negatable (Q-2 correction)
      — Slice 4 surfaces its absence as a generation-failure signal instead, and Slice 9 enforces
      the resulting hard stop (no `BriefVersion` persisted). Slice 9 (Brief Assembler) is the sole
      slice that persists `NegativeFinding` rows and enforces the fail-closed rule (non-empty id
      array OR a `NegativeFinding` row with a non-empty `statement`, per element) on the same R-4
      path as every other structured-output/citation validation; Slice 10 reads the concrete
      `negativeFindings` array to drive `NegativeFindingNotice` rendering per element.
- [x] `DemandConfidenceClassification.negativeFindingRef` (Architecture §3, PR-review re-review
      correction) is tested in Slice 5 against its precise trigger — populated iff a
      `NegativeFinding` row with `element: 'demand-signal-type'` exists (i.e. `demandSignalIds` is
      empty), holding that row's `NegativeFinding.id` — with an explicit negative test for the case
      where `demandSignalIds` is non-empty but `citedDemandSignalIds` is empty (signals found, none
      cited — not a negative-finding case, `negativeFindingRef` must stay unset).
