# Architecture: Problem Department — Vertical Slice MVP

**Status**: Draft — pending Frank spec-gate
**Date**: 2026-08-08
**Feeds**: `01-REQUIREMENTS.md` (13 stories / see Acceptance Criteria section for current count)

## Scope Discipline

Per `docs/roadmap.md`, `docs/milestones/problem-department-mvp.md`, and `docs/principles.md`, this
document does **not** select: an agent runtime, a database/storage technology, a web/application
framework, a backend language, or deployment infrastructure. Those are explicitly reserved for the
runtime-evaluation exercise this milestone exists to run. Everything below is expressed as
**domain model, service responsibilities, and contracts** — a shape any candidate runtime and
storage technology must be able to satisfy, and a shape the runtime evaluation can be scored
against.

This document also does not design the Opportunity schema (acknowledged future concept only).

**Q-8 (runtime adoption scope, binding)**: This milestone practically evaluates and adopts a
runtime for its own implementation. That adoption is not a permanent Department OS platform
commitment and may be revisited through a future DDR.

---

## 1. Two Explicit Architectural Decisions (flagged as open by Requirements)

### 1.1 Source-artifact types beyond URL/text

**Decision**: `SourceArtifact.type` is an **open, string-keyed discriminator**, not a closed
enum — this MVP implements exactly two variants, `url` and `text`, but the schema shape does not
assume these are the only two that will ever exist.

**Reasoning**: Requirements' "Assumes" section names URL/text as the only two types Intake/Interview
actually specified, and explicitly defers file uploads/screenshots as "an open question for
architecture." Given the sibling constraint that the *submission* input contract must not
hard-code a human-only origin (US-1 AC2) and the Interview's confirmed future need for
collector-fed and multi-channel sources (bookmarks, browser history, notes-app saves), the
artifact-type field carries the same shape risk as the origin field: closing it to exactly
`{url, text}` would require a breaking schema change the moment a third type (e.g. `file`,
`screenshot`) is needed. Following the same extensibility pattern the requirements already mandate
for demand-signal types (US-4 AC1 — named list, extensible to "other") avoids re-litigating this
later. This is not scope creep: no third type is built, validated, or retrieved in this MVP —
only the type discriminator is left open rather than closed.

**Typing correction (G-2, Review Section 3)**: `'url' | 'text' | string` collapses to plain
`string` in TypeScript — the literals are absorbed and provide zero type safety, autocomplete, or
exhaustiveness checking, which is not what "open but guided" means. The schemas in Section 3 below
use `'url' | 'text' | (string & {})`, which preserves literal-type hints in tooling while staying
structurally open to any future string value. Same fix applies to `SubmissionOrigin`.

### 1.2 Submission-to-Brief cardinality

**Decision**: One **Investigation** aggregates one-or-more **SourceArtifacts** from one-or-more
submission calls, and produces **exactly one Problem Brief identity** (a lineage of ordered,
immutable `BriefVersion`s). Splitting a single Investigation's evidence into multiple distinct
problems is out of scope for this MVP.

**Reasoning**: This matches Requirements' explicit "Assumes" statement, which cites milestone step 7
("Generate one cited Problem Brief") and flags splitting as a future architecture question, not
one to resolve now. Architecturally this is realized by keeping `Investigation` and
`ProblemBrief` as two distinct entities (rather than collapsing submission directly into Brief)
specifically so that a future split — one Investigation later found to contain N distinct
problems — is a additive schema change (Investigation gains a one-to-many relationship to
ProblemBrief) rather than a breaking one. No multi-brief logic is built now; the join table shape
already supports it without redesign.

Neither decision required a HALT: both have a single reasoned answer traceable to explicit
Requirements/Interview language, and both are structured so the deferred alternative remains a
additive (not breaking) future change — consistent with "YAGNI governs timing, not removal of
requirements" (`docs/principles.md`).

### 1.3 Claim validity and claim/evidence carriage across Brief versions (Danny's binding decisions, Q-3/Q-4)

**Q-3 decision (validity at time T)**: Claim and Brief-version validity is represented through an
**append-only, bitemporal status-event log** — never a mutable status field. Every status
assignment carries both `effectiveAt` (when the status became true in the represented world) and
`recordedAt` (when Department OS learned or recorded it). Historical status events are never
mutated. To answer "what validity state did Department OS assign to this item at time T," the
system retrieves the latest status event with `effectiveAt <= T`.

**Framing correction, binding**: the query this system answers is *"what validity state did
Department OS assign to this claim version at time T"* — never *"was the claim objectively valid
at time T."* `StatusEvent.assignedState`, every API name touching it (`getAssignedState`, not
`getValidityAt`/`isValid`), and any UI copy this feeds must preserve that framing. This is not
cosmetic: `StatusEvent` records Department OS's own epistemic state, not ground truth about the
world.

**Q-4 decision (claims/evidence across Brief versions)**: Claims and evidence are **shared,
independently versioned records**, not copied into every `BriefVersion` and not loosely referenced
by a mutable record. Concretely:
- `Claim` is a stable identity only (no text, no status).
- `ClaimVersion` is immutable and versioned; a correction creates a new `ClaimVersion`, it never
  edits an existing one.
- `EvidenceItem` is an immutable record, shared across whichever `ClaimVersion`s cite it.
- `BriefVersion` references the **exact** `ClaimVersion` ids (and, transitively, evidence ids) it
  used, through an explicit array field — not a copy of the claim text, and not a foreign key to
  the mutable `Claim` identity that could silently resolve to "whatever the claim currently says."
- Each `Decision` binds to one exact `BriefVersion` (unchanged from the existing design).
- If a claim changes, a new `ClaimVersion` is created and the earlier version is superseded or
  invalidated through a `StatusEvent`, per Q-3. Existing `BriefVersion`s and `Decision`s keep
  referencing the original `ClaimVersion` — their evidence state does not change retroactively.

This directly resolves the required traversal: **Invalidated `ClaimVersion` → `BriefVersion`s that
used it → `Decision`s bound to those `BriefVersion`s** is answerable by (1) reading the `StatusEvent`
that invalidated the `ClaimVersion`, (2) reverse-querying `BriefVersion.claimVersionIds` for that
id, (3) reading `Decision.briefVersionId` for each matching `BriefVersion`. No step requires
mutating a shared record.

This fixes **G-3** (invalidation's "valid at markedAt" query was unanswerable — no status history
existed) and **G-4** (claim/evidence carriage across versions was undefined — copy-vs-reference was
never stated). See Section 3 for the exact schemas and Section 4 for the resulting API contract
changes.

### 1.4 Reject is reconsiderable, not reopenable (Danny's binding decision, Q-5)

**Decision**: Rejection does not close or mutate the Investigation lineage. A `Decision` of
`Reject` on a given `BriefVersion` is immutable, and the Investigation and its full lineage remain
retained exactly as recorded. A human may add new source material via `submitSources` at any time;
that initiates a new generation run (`generateBriefVersion`) and produces a new, independent
`BriefVersion`, which receives its own independent `Decision`. This is **reconsiderable**, not
reopenable: nothing is unlocked, reversed, or set into an indefinite active runtime state — a
rejected `BriefVersion` stays exactly as decided, and reconsideration is a new, distinct version
with its own evidence and its own outcome.

**No new mechanism required**: this is fully satisfied by machinery already specified above —
`Investigation` is never deleted or archived on Reject (no such transition exists in
`InvestigationStatus`), `BriefVersion`s are append-only and never mutated (Section 1.3/Pattern
table), and `Decision` already supports more than one record accumulating against the same
`problemBriefId` lineage over time, one per `BriefVersion` (Decision Recorder, Section 2; G-11).
No dedicated Reopen mechanism, no mutable Investigation-lifecycle field, and no schema addition is
introduced for this decision.

### 1.5 Landscape Researcher performs independent web research (Danny's binding decision, Q-6)

**Decision**: "Human-seeded" defines how an Investigation begins; "no collectors" excludes
automated discovery/ingestion channels. Neither limits the Landscape Researcher's workflow to the
submitted artifacts. Independent web research is **required** for existing-solution and competitor
research (US-5) — human-submitted artifacts seed the Investigation; they do not bound its research
corpus.

**Capability contract** (vendor-agnostic — no search API/provider is selected by this document):
the Landscape Researcher must be able to (1) search the public web, (2) retrieve and inspect
selected results, (3) preserve the query, the URL, the retrieval timestamp, and the relevant
retrieved material for every search performed, (4) cite landscape conclusions (`ExistingSolution`,
`GapHypothesis`) through the same evidence/provenance model as every other Brief element — never a
separate, unverifiable citation path, and (5) record search scope and limitations, including
failed or blocked retrievals, rather than silently omitting them.

**Design call (stated, not silent)**: `SourceArtifact` as originally specified assumes
submission-origin only — every artifact reachable via `Investigation` arrived through a
`Submission`. Independent web research produces artifacts the Landscape Researcher retrieves
itself, mid-generation, outside any `Submission`. Rather than forcing web-retrieved material
through the human-submission path (which would misrepresent its provenance) or inventing a
parallel evidence entity (which would fragment the citation model Q-4 just unified), this
architecture adds one field — `SourceArtifact.origin` — distinguishing `'submitted'` from
`'landscape-research'`, and a `WebSearchQuery`/`WebSearchResult` pair that records the search act
itself and links each retrieved result to the `SourceArtifact` it produces. Once a web result
becomes a `SourceArtifact`, it flows through the **existing** `EvidenceItem` →
`ClaimVersion`/`ExistingSolution`/`GapHypothesis` provenance chain unchanged — no second citation
model is introduced. See Section 3 for exact schemas and Section 4 for the `searchWeb` contract.

---

## 2. Components

Each component is a **service responsibility boundary**, not a technology binding. In candidate
runtime evaluation, each maps to one or more agent steps, tool calls, or orchestration nodes —
the evaluation's job is to observe how cleanly a given runtime expresses these boundaries, not to
predetermine which runtime hosts them.

| Component | Responsibility | Satisfies |
|---|---|---|
| **Intake Service** | Accepts a submission (one or more source artifacts), validates non-empty, creates one `Investigation` + `SourceArtifact` records | US-1 |
| **Source Resolver** | Attempts to fetch/normalize each `SourceArtifact` (URL fetch or text passthrough); marks unreachable sources as `status: 'unreachable'` without dropping them; on successful fetch, marks `status: 'content-retrieved'` if usable content was extracted or `status: 'reachable-no-content'` if the fetch succeeded but yielded no extractable content (paywall/login-wall/JS-only) — G-9; blocks Brief generation only if zero sources are `content-retrieved` or `reachable-no-content` (i.e. all `unreachable`) | US-1, Edge Case (dead URL) |
| **Extraction & Clustering Engine** | Reads reachable sources, produces one-or-more `ProblemStatement`s, and either creates new `Claim`+`ClaimVersion` pairs or, when a source restates an existing claim, a new `ClaimVersion` under the existing `Claim` identity; clusters `EvidenceItem`s under the `ClaimVersion`(s) they support | US-2 |
| **Evidence Labeler** | Assigns exactly one certainty label (`fact\|observation\|interpretation\|assumption\|unknown`) to every `EvidenceItem`; records contradicting evidence explicitly rather than discarding it; defaults to the most conservative label when uncertain | US-3, Edge Case (unlabelable claim) |
| **Demand Analyzer** | Two-part, deliberately non-mergeable output: (a) tags observed `DemandSignal`s against the named/extensible type list; (b) produces a single `DemandConfidenceClassification` (`Insufficient\|Emerging\|Substantiated`) with a reasoned narrative citing signals and gaps | US-4 |
| **Personal Pull Extractor** | If Personal-Pull-style framing is present in source material, records it into `PersonalPullNote` — a field structurally outside `DemandSignal`/`DemandConfidenceClassification` — and never feeds it to the Demand Analyzer | US-12 |
| **Landscape Researcher** | Conducts independent web research (search, retrieve, inspect — not limited to submitted artifacts, Q-6 binding); records existing solutions/competitors, current coping behavior, and where coping is inadequate, as evidence-linked `ExistingSolution` entries; preserves every search's query/URL/retrieval-time/scope/limitations via `WebSearchQuery` | US-5, Q-6 |
| **Gap Hypothesis Generator** | Produces one-or-more `GapHypothesis` entries, each with a named category and citations into the evidence set (never asserted without a citation) | US-5 |
| **Uncertainty Compiler** | Produces one `UncertaintyStatement` naming what's unknown, what would change the conclusion, and what's undeterminable | US-6 |
| **Recommendation Engine** | Produces one `Recommendation` (`Approve\|Reject\|Watch`) with a written rationale citing Brief evidence — never a bare label or score | US-7 |
| **Brief Assembler** | Assembles the outputs of the above into one immutable `BriefVersion`, referencing the exact `ClaimVersion` and evidence ids used (Section 1.3/Q-4) — never copying claim text into the version; on correction, creates a new `BriefVersion` that supersedes rather than mutates; never allows in-place edits to a published version | US-10 |
| **Provenance Recorder** | Wraps every Brief-generating run (every component above, for a given Investigation) with a `GenerationRun` record capturing runtime/model/tool identity and outcome, sufficient to reconstruct how a specific claim was produced — including for runs that fail to produce a `BriefVersion` | US-11 |
| **Decision Recorder** | Persists a human `Decision` (`Approve\|Reject\|Watch`) bound to a specific `BriefVersion.id`; enforces the Watch reconsideration-condition constraint; never migrates a Decision to a newer version; permits more than one `Decision` to accumulate on the same `BriefVersion` over time (e.g. Watch later revisited as Approve/Reject) | US-8, US-9 |
| **Validity/Invalidation Service** | Appends a `StatusEvent` (Section 1.3/Q-3) marking a `ClaimVersion` or `BriefVersion`'s assigned validity state as `challenged`/`invalidated`; on invalidation, computes and surfaces every `Decision` bound to a `BriefVersion` that referenced the affected item while it was last assigned `valid` | US-10 |
| **Review Surface** | Minimal interface exposing all seven Brief elements for one `BriefVersion` and accepting a `Decision` submission (with reconsideration conditions for Watch); also exposes an Investigation's status/sources for the pre-Brief state | US-13, G-15 |

---

## 3. Data Schemas

Interfaces below are the **contract**, not an implementation language commitment — they specify
exact field shapes any storage/runtime choice must be able to represent (relationally,
document-style, or otherwise). Timestamps are ISO-8601 strings; IDs are opaque stable strings
(UUID or equivalent) — no format is prescribed.

```typescript
// ---- Intake ----

/** A submission is the human (or future collector) act of handing sources to the system.
 *  Origin is NOT hard-coded to human — US-1 AC2. */
interface Submission {
  id: string;
  investigationId: string;          // the Investigation this submission contributes to
  origin: SubmissionOrigin;         // extensible — 'human' today, collector-fed origins later
  submittedAt: string;
  sourceArtifactIds: string[];      // one-or-more; empty submissions are rejected pre-persistence
}

/** Open, not closed — see Decision 1.1. 'human' is the only value produced by this MVP.
 *  '(string & {})' preserves literal-type hints in tooling while staying structurally open —
 *  a bare '| string' collapses to plain string and loses all literal-type value (G-2). */
type SubmissionOrigin = 'human' | (string & {});

interface SourceArtifact {
  id: string;
  investigationId: string;
  type: SourceArtifactType;         // open discriminator — see Decision 1.1
  raw: string;                      // the URL string, or the pasted text body
  resolution: SourceResolution;
  addedAt: string;
  origin: SourceArtifactOrigin;     // NEW (Q-6) — distinguishes human-submitted material from
                                     // material the Landscape Researcher retrieved itself during
                                     // independent web research; see Decision 1.5
}

/** 'submitted' is every artifact reachable via a Submission (all artifacts before this revision).
 *  'landscape-research' is a web result the Landscape Researcher retrieved on its own initiative —
 *  Q-6. Open, not closed — same extensibility pattern as SourceArtifactType/SubmissionOrigin. */
type SourceArtifactOrigin = 'submitted' | 'landscape-research' | (string & {});

/** MVP implements exactly 'url' | 'text'. Third-party types (file, screenshot, ...) are a
 *  future additive change, not a breaking one — Decision 1.1. Same '(string & {})' fix as
 *  SubmissionOrigin (G-2). */
type SourceArtifactType = 'url' | 'text' | (string & {});

/** Four-way status (G-9 fix): 'reachable' success was previously a single value, collapsing
 *  "content extracted" and "reachable but zero usable content" (paywall/login-wall/JS-only) into
 *  one indistinguishable state — violating 01-REQUIREMENTS' binding Constraint that these be
 *  recorded as distinguishable. Values map directly onto 03-UI-SPEC's four-way display (no
 *  translation layer): unresolved->"pending", unreachable->"unreachable",
 *  content-retrieved->"content retrieved", reachable-no-content->"reachable, no usable content
 *  found". */
interface SourceResolution {
  status: 'unresolved' | 'unreachable' | 'content-retrieved' | 'reachable-no-content';
  resolvedAt?: string;
  failureReason?: string;           // populated only when status === 'unreachable'
  noContentReason?: string;         // populated only when status === 'reachable-no-content'
                                     // (e.g. paywall, login-wall, JS-only render)
}

/** One Investigation aggregates 1..N SourceArtifacts across 1..N Submissions and produces
 *  exactly one Problem Brief identity for this MVP — see Decision 1.2. */
interface Investigation {
  id: string;
  createdAt: string;
  status: InvestigationStatus;
  statusReason?: string;            // free-text detail, e.g. which sources failed
  problemBriefId: string | null;    // set once the first BriefVersion is generated
}

/** 'blocked' and 'generation-failed' are kept as distinct literal values rather than a single
 *  'blocked' + reason string (G-13). Reasoning: these are two different remedies exposed to the
 *  user (03-UI-SPEC's Blocked/Failed State needs to render "add another source" only for
 *  'blocked', never for 'generation-failed') — a type-level distinction lets the UI switch on the
 *  status itself rather than parsing free text, and prevents a Forge session from wiring the
 *  wrong remedy to the wrong failure by construction. */
type InvestigationStatus =
  | 'open'                          // accepting submissions, no Brief yet
  | 'blocked'                       // zero reachable sources — no Brief can be generated
  | 'generation-failed'             // sources reachable, but the pipeline failed to produce a
                                     // usable Brief (e.g. required elements could not be
                                     // populated, or a structured output failed schema
                                     // validation after bounded repair)
  | 'brief-generated';

// ---- Evidence & Claims (Q-4: stable identity + immutable versions, shared across Briefs) ----

type EvidenceLabel = 'fact' | 'observation' | 'interpretation' | 'assumption' | 'unknown';

/** Immutable once created. Shared — may be cited by any number of ClaimVersions across any
 *  number of BriefVersions. Never carries a mutable status; validity is assigned to the
 *  ClaimVersion(s) that cite it via StatusEvent, not to the evidence itself. */
interface EvidenceItem {
  id: string;
  sourceArtifactId: string;         // provenance — which source this evidence came from
  excerptOrSummary: string;
  label: EvidenceLabel;             // exactly one — US-3 AC1
  stance: 'supporting' | 'contradicting'; // relative to the claim/problem statement it's linked to
}

/** Stable identity only. No text, no status field — both live on ClaimVersion / StatusEvent.
 *  Never mutated after creation. */
interface Claim {
  id: string;
  createdAt: string;
}

/** Immutable once created — a correction creates a new ClaimVersion under the same Claim.id,
 *  it never edits this record (Q-4). */
interface ClaimVersion {
  id: string;
  claimId: string;                  // stable Claim identity this is a version of
  versionNumber: number;            // monotonic per claimId, starts at 1
  createdAt: string;
  text: string;
  evidenceItemIds: string[];        // every major claim traces to source evidence — US-10 AC1
  supersedesVersionId: string | null; // null for version 1 of this Claim
}

interface ProblemStatement {
  id: string;
  briefVersionId: string;
  whoExperiencesIt: string;
  contextOrWorkflow: string;
  consequenceOrFriction: string;
  supportingClaimVersionIds: string[]; // exact ClaimVersion ids — Q-4
}

// ---- Bitemporal validity (Q-3) ----

/** Answers "what validity state did Department OS assign to this item at time T" — never
 *  "was this item objectively valid at time T." Append-only; a correction is a new StatusEvent
 *  with a later recordedAt (and possibly an earlier effectiveAt, for a late-discovered
 *  correction), never an edit to an existing event. */
type AssignedValidityState = 'valid' | 'challenged' | 'invalidated';

interface StatusEvent {
  id: string;
  targetType: 'claim-version' | 'brief-version';
  targetId: string;                 // ClaimVersion.id or BriefVersion.id
  assignedState: AssignedValidityState;
  effectiveAt: string;              // when this state became true in the represented world
  recordedAt: string;               // when Department OS learned/recorded it
  recordedBy: string;
  reason: string;
}

// ---- Demand ----

/** Closed nine-member union; extensibility to 'other' is provided by the
 *  'other-observed-behavior' member plus otherTypeLabel, not by an open string. US-4 AC1. */
type DemandSignalType =
  | 'recurring-complaints'
  | 'workarounds'
  | 'existing-spend'
  | 'paid-labor'
  | 'switching-behavior'
  | 'willingness-to-pay'
  | 'rfps'
  | 'feature-requests'
  | 'other-observed-behavior';

interface DemandSignal {
  id: string;
  briefVersionId: string;
  type: DemandSignalType;
  otherTypeLabel?: string;          // required when type === 'other-observed-behavior'
  evidenceItemIds: string[];
}

/** Qualitative only — never a numeric score anywhere. US-4 AC2/AC3. */
type DemandConfidenceLevel = 'Insufficient' | 'Emerging' | 'Substantiated';

interface DemandConfidenceClassification {
  briefVersionId: string;           // one per BriefVersion
  level: DemandConfidenceLevel;
  narrative: string;                // must cite which signals/gaps drove the classification
  citedDemandSignalIds: string[];
}

/** Structurally separate from DemandSignal/DemandConfidenceClassification — never merged in,
 *  never counted toward either. US-12, US-4 AC4. */
interface PersonalPullNote {
  id: string;
  briefVersionId: string;
  sourceArtifactId: string;
  text: string;
  label: 'contextual-motivation';   // fixed — cannot be relabeled into a demand field
}

// ---- Landscape & Gap ----

/** One record per web search the Landscape Researcher performs (Q-6, binding). Preserves query,
 *  every retrieved-or-attempted URL, retrieval timestamps, and search scope/limitations —
 *  including failed or blocked retrievals, which are recorded, never silently dropped. */
interface WebSearchQuery {
  id: string;
  investigationId: string;
  generationRunId: string;          // ties the search to the GenerationRun that performed it
  query: string;
  performedAt: string;
  results: WebSearchResult[];
  scopeNote?: string;                // e.g. result-count cap, date range, or other scope actually applied
  limitations: string[];             // e.g. "rate-limited after 3 queries", "no results past page 1"
}

interface WebSearchResult {
  url: string;
  retrievedAt: string;
  status: 'retrieved' | 'blocked' | 'failed';
  failureReason?: string;            // populated when status !== 'retrieved'
  sourceArtifactId?: string;         // set only when status === 'retrieved'; the SourceArtifact
                                      // (origin: 'landscape-research') this result produced, which
                                      // then flows through the existing EvidenceItem/ClaimVersion/
                                      // ExistingSolution/GapHypothesis citation model unchanged
}

interface ExistingSolution {
  id: string;
  briefVersionId: string;
  name: string;
  whatItAddresses: string;
  howPeopleCopeNow: string;
  whereItsInadequate: string;
  evidenceItemIds: string[];
}

type GapCategory =
  | 'capability' | 'usability' | 'price' | 'workflow-fit' | 'trust'
  | 'integration' | 'accessibility' | 'distribution' | 'other';

interface GapHypothesis {
  id: string;
  briefVersionId: string;
  category: GapCategory;
  otherCategoryLabel?: string;      // required when category === 'other'
  statement: string;                // specific, falsifiable claim about what's missing
  evidenceItemIds: string[];        // must be evidence-supported, not asserted bare
}

// ---- Uncertainty & Recommendation ----

interface UncertaintyStatement {
  briefVersionId: string;           // one per BriefVersion
  whatsUnknown: string[];
  whatWouldChangeConclusion: string[];
  whatsUndeterminable: string[];
}

type RecommendationDecision = 'Approve' | 'Reject' | 'Watch';

interface Recommendation {
  briefVersionId: string;           // one per BriefVersion — the system's own suggestion
  decision: RecommendationDecision;
  rationale: string;                // must reference Brief evidence — never bare/scored
}

// ---- Problem Brief identity & versioning ----

/** Stable identity across corrections. Never mutated after first BriefVersion exists —
 *  US-10 AC2. */
interface ProblemBrief {
  id: string;
  investigationId: string;
  createdAt: string;
  currentVersionId: string;         // pointer to the latest BriefVersion — advisory only;
                                     // every historical version remains independently readable
}

/** No stored mutable 'status' field (Q-3). Assigned validity ('valid'/'challenged'/'invalidated')
 *  is read from the latest StatusEvent for this BriefVersion. "Superseded" is a structural fact,
 *  not an assigned state: a BriefVersion is superseded iff some other BriefVersion under the
 *  same problemBriefId names it via supersedesVersionId. Both are computed at read time — see
 *  getBriefForReview in Section 4 — never stored redundantly to avoid a second mutable field. */
interface BriefVersion {
  id: string;
  problemBriefId: string;
  versionNumber: number;            // monotonic, starts at 1
  createdAt: string;
  supersedesVersionId: string | null; // null for version 1
  generationRunId: string;          // provenance — the run that produced this version — US-11

  // The seven required elements (01's Required Brief Elements section) — each resolved via the sub-entities above,
  // referenced here for a single-fetch Brief read:
  problemStatementIds: string[];
  claimVersionIds: string[];        // exact ClaimVersion ids used by this version — Q-4. Never
                                     // a reference to Claim (the mutable-identity level) and
                                     // never a copy of claim text.
  demandSignalIds: string[];
  demandConfidenceClassification: DemandConfidenceClassification;
  existingSolutionIds: string[];
  gapHypothesisIds: string[];
  uncertaintyStatement: UncertaintyStatement;
  recommendation: Recommendation;
  personalPullNoteIds: string[];    // may be empty
}

// ---- Provenance ----

/** One record per Brief-generating run — covers every component in Section 2's pipeline for a
 *  given Investigation. 'investigationId' (required) replaces 'briefVersionId' as the mandatory
 *  anchor because a run can legitimately complete without producing a BriefVersion (fail-closed
 *  pipeline, Investigation -> 'blocked'/'generation-failed'); 'briefVersionId' is nullable and
 *  set only when the run succeeds, so failed-run provenance — the runs most worth investigating —
 *  remains recordable (G-12). Deliberately runtime-agnostic: 'runtimeIdentifier' names whichever
 *  candidate executed the run, without committing the schema to one runtime. US-11. */
interface GenerationRun {
  id: string;
  investigationId: string;
  briefVersionId: string | null;    // set only when outcome === 'succeeded'
  outcome: 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string;
  runtimeIdentifier: string;        // e.g. candidate runtime name/version under evaluation
  modelIdentifiers: string[];       // every model invoked during the run
  toolsInvoked: string[];           // named tools/capabilities used (e.g. 'url-fetch', 'search')
  stepLog: GenerationStep[];        // ordered, one entry per component in Section 2
}

interface GenerationStep {
  component: string;                // matches a Section 2 component name
  startedAt: string;
  completedAt: string;
  modelIdentifier?: string;
  inputRefs: string[];              // IDs of records this step read
  outputRefs: string[];             // IDs of records this step produced
  validationRecords?: SchemaValidationRecord[]; // one entry per schema-constrained structured
                                     // output this step produced (Section 3 literal-union field
                                     // or typed object) subject to R-4's validation/repair
                                     // mechanism — a step may produce more than one, e.g. one
                                     // EvidenceLabel per EvidenceItem
}

/** R-4 mitigation (Danny, binding). Every model-produced structured output — every field typed
 *  as a closed literal union or object schema in Section 3 (EvidenceLabel,
 *  DemandConfidenceLevel, GapCategory, RecommendationDecision, etc.) — is validated against its
 *  declared schema before persistence or downstream use. An out-of-schema value, including an
 *  invalid enum member, is never silently coerced, defaulted, or treated as valid (see
 *  Anti-Patterns). On validation failure the step may attempt a bounded repair: re-prompt the
 *  model with the original output and the validation error, and re-validate the result.
 *
 *  MAX_REPAIR_ATTEMPTS = 1 (one repair attempt, i.e. at most two total generation attempts per
 *  field: original + one repair). Source: Danny's binding decision text names "1-2 attempts" as
 *  reasonable; 1 is chosen as the smaller bound to keep the loop provably non-open-ended and
 *  because a single validation-error-guided re-prompt is the standard bounded-repair shape — a
 *  second failure after being shown the exact error is treated as a genuine generation failure,
 *  not a transient one worth more retries. This constant is configuration, not hardcoded per
 *  call site; a future PR changing it does not require a schema change.
 *
 *  If the repaired output still fails validation, the step is terminal-failed: it does not
 *  produce a usable outputRef for the failed field, and the owning GenerationRun.outcome is set
 *  to 'failed' (composing with the existing outcome field — no parallel failure-tracking
 *  mechanism). All attempts remain in provenance via SchemaValidationRecord.attempts, so the
 *  original invalid output, the validation error, and every repair attempt are reconstructable
 *  after the fact, on both failed and eventually-successful steps. */
interface SchemaValidationRecord {
  fieldPath: string;                 // e.g. 'GapHypothesis.category' — which schema field this validates
  attempts: SchemaValidationAttempt[]; // length 1 (no repair needed) up to 1 + MAX_REPAIR_ATTEMPTS
  finalOutcome: 'valid' | 'invalid';  // 'invalid' iff every attempt, including repairs, failed validation
}

interface SchemaValidationAttempt {
  attemptNumber: number;             // 1 = original generation; 2 = first repair; etc.
  rawOutput: string;                 // the model's output as produced, prior to validation —
                                      // retained even when invalid; never overwritten or discarded
  valid: boolean;
  validationError?: string;          // present iff valid === false; the exact error fed back
                                      // into the next repair attempt's re-prompt
}

// ---- Decision ----

type ReconsiderationConditionType =
  | 'new-evidence' | 'product-change' | 'stronger-demand-signal'
  | 'feasibility-shift' | 'price-change' | 'market-event' | 'other';

interface ReconsiderationCondition {
  id: string;
  decisionId: string;
  type: ReconsiderationConditionType;
  otherTypeLabel?: string;          // required when type === 'other'
  description: string;
}

/** More than one Decision may exist for the same briefVersionId over time (e.g. Watch later
 *  revisited as Approve/Reject) — see getBriefForReview's priorDecisions (G-11). Each Decision
 *  remains individually immutable once created; a revisit creates a new Decision, it never
 *  edits an existing one. */
interface Decision {
  id: string;
  briefVersionId: string;           // bound to the specific version evaluated — US-8 AC1
  decision: RecommendationDecision; // 'Approve' | 'Reject' | 'Watch'
  decidedBy: string;                // human identity
  decidedAt: string;
  rationale?: string;
  reconsiderationConditionIds: string[]; // required, length >= 1, iff decision === 'Watch' (US-9 AC2)
}
```

---

## 4. API Contracts (service-level, runtime-agnostic)

These are the operations each component in Section 2 exposes. They are stated as functions, not
HTTP/RPC endpoints — how they're transported (REST, direct tool-call, in-process) is a
runtime/framework decision this document does not make.

```typescript
// Intake Service
function submitSources(input: {
  investigationId?: string;         // omit to start a new Investigation
  origin: SubmissionOrigin;
  artifacts: Array<{ type: SourceArtifactType; raw: string }>;
}): Promise<Submission>;
// Rejects (throws / returns error) if artifacts.length === 0 — US-1 AC3.
// Every SourceArtifact created here is persisted with origin: 'submitted' (Q-6/Decision 1.5).

// Landscape Researcher — independent web research (Q-6, binding)
function searchWeb(input: {
  investigationId: string;
  generationRunId: string;
  query: string;
}): Promise<WebSearchQuery>;
// Not limited to submitted artifacts — "human-seeded" bounds how the Investigation begins, not
// its research corpus (Q-6). Each retrieved result that becomes usable evidence is persisted as a
// SourceArtifact with origin: 'landscape-research', then cited by ExistingSolution/GapHypothesis
// through the existing EvidenceItem chain — no separate citation path. Failed or blocked
// retrievals are recorded on WebSearchResult, never dropped.

// Source Resolver
function resolveSourceArtifact(sourceArtifactId: string): Promise<SourceResolution>;
function resolveInvestigationSources(investigationId: string): Promise<{
  allUnreachable: boolean;          // true only when every SourceResolution.status === 'unreachable';
                                     // if true, caller must mark Investigation 'blocked'
  resolutions: SourceResolution[];
}>;

// Investigation read model (G-15) — 03-UI-SPEC's Flow 2 / Blocked-Failed State and Flow 1's
// confirmation screen both assume this exists; it was previously undefined.
//
// Q-7 confirmation (binding, no gap): this is the single durable Investigation URL contract.
// Revisiting investigationId always resolves through this one read: status === 'open' renders as
// "generating"; status === 'blocked' | 'generation-failed' renders with statusReason as the
// blocking reason and, per InvestigationStatus's documented split (G-13), the correct next
// action; status === 'brief-generated' resolves problemBriefId -> ProblemBrief.currentVersionId
// -> getBriefForReview(briefVersionId) to present the finished Brief. The Brief is presented FROM
// the Investigation resource (a lookup chain), not a replacement of it — lineage (every prior
// BriefVersion, every Decision) remains reachable through the same investigationId. No
// notification, dashboard, list view, or polling client is required; manual revisit is
// sufficient.
function getInvestigation(investigationId: string): Promise<{
  investigation: Investigation;     // includes status, statusReason, problemBriefId
  sourceArtifacts: Array<SourceArtifact & { resolution: SourceResolution }>;
}>;

// Brief generation pipeline entrypoint — orchestrates Extraction through Recommendation,
// wrapped in one GenerationRun. Fails closed: does not produce a BriefVersion with fewer than
// all seven required elements populated. On failure, still persists a GenerationRun with
// outcome: 'failed' and briefVersionId: null (G-12), and moves the Investigation to
// 'generation-failed' (sources were reachable) or leaves/sets it 'blocked' (no reachable
// sources) as appropriate (G-13).
function generateBriefVersion(input: {
  investigationId: string;
  supersedesVersionId?: string;     // present only for corrections
  runtimeIdentifier: string;
}): Promise<BriefVersion>;

// Decision Recorder
function recordDecision(input: {
  briefVersionId: string;
  decision: RecommendationDecision;
  decidedBy: string;
  rationale?: string;
  reconsiderationConditions?: Array<{ type: ReconsiderationConditionType; otherTypeLabel?: string; description: string }>;
}): Promise<Decision>;
// Rejects if decision === 'Watch' and reconsiderationConditions is empty/absent — US-9 AC2.
// Never mutates or reassigns an existing Decision's briefVersionId. Does not reject a second
// Decision on the same briefVersionId — see Decision's doc comment and getBriefForReview's
// priorDecisions (G-11).

// Validity / Invalidation Service (Q-3)
function assignValidityState(input: {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  assignedState: AssignedValidityState;
  effectiveAt: string;              // when this became true in the represented world; may be
                                     // in the past, to record a late-discovered correction
  reason: string;
  recordedBy: string;
}): Promise<{
  statusEvent: StatusEvent;
  dependentDecisionIds: string[];   // computed at call time, not stored redundantly: every
                                     // Decision bound to a BriefVersion that referenced targetId
                                     // (directly if targetType is 'brief-version'; via
                                     // BriefVersion.claimVersionIds if 'claim-version') while
                                     // that BriefVersion/ClaimVersion's assigned state was last
                                     // 'valid' — US-10 AC3.
}>;

// Read the assigned validity state for a target at a point in time (defaults to now). Named
// 'getAssignedState', not 'getValidityAt'/'isValid', to keep the epistemic framing explicit at
// the API boundary per Q-3's binding wording correction.
function getAssignedState(input: {
  targetType: 'claim-version' | 'brief-version';
  targetId: string;
  asOf?: string;                    // defaults to now; the "at time T" query
}): Promise<AssignedValidityState>;
// Implementation: latest StatusEvent for (targetType, targetId) with effectiveAt <= asOf,
// ordered by effectiveAt then recordedAt as a tie-break; 'valid' if no StatusEvent exists yet.

// Review Surface (read model)
function getBriefForReview(briefVersionId: string): Promise<{
  version: BriefVersion;
  assignedState: AssignedValidityState;    // this version's own state, per Q-3
  isSuperseded: boolean;                   // structural fact, not an assigned state — see
                                            // BriefVersion's doc comment
  problemStatements: ProblemStatement[];
  claimVersions: Array<ClaimVersion & { evidence: EvidenceItem[]; assignedState: AssignedValidityState }>;
  demandSignals: DemandSignal[];
  demandConfidence: DemandConfidenceClassification;
  existingSolutions: ExistingSolution[];
  gapHypotheses: GapHypothesis[];
  uncertainty: UncertaintyStatement;
  recommendation: Recommendation;
  personalPullNotes: PersonalPullNote[];
  priorDecisions: Decision[];              // every Decision already bound to this exact version,
                                            // in decidedAt order — not singular; a Watch decided
                                            // earlier can be followed by a later Approve/Reject
                                            // on the same version (G-11).
}>;
```

**Accepted MVP limitation — citation presence, not citation correctness (R-1)**: every citation
field above (`evidenceItemIds`, `supportingClaimVersionIds`, `citedDemandSignalIds`, etc.) is
required and non-empty by construction, but nothing in this architecture validates that the cited
evidence actually *supports* the claim, gap, or classification it's attached to. A model could
populate a syntactically valid, non-empty citation array with irrelevant ids and pass every test
implied by this document. Solving claim-evidence relevance validation is a real, unsolved research
problem and is explicitly out of scope for this MVP. This architecture guarantees **citation
presence**, not **citation correctness** — stated plainly here so the limitation is named, not
discovered later. This must also be surfaced as explicit copy on the Investigation Screen's Completed state
(`03-UI-SPEC.md`) so a human reviewer is not misled into treating a populated citation list as
independent verification; that UI change is not made by this document and is flagged here for
`03-UI-SPEC.md` to pick up.

---

## 5. Patterns

| Pattern | Usage | Rationale |
|---|---|---|
| **Append-only versioning (event-sourced Brief lineage)** | `ProblemBrief` is a stable identity; every generation or correction produces a new immutable `BriefVersion` linked via `supersedesVersionId` | Directly satisfies US-10 AC2 and the Interview's named anti-goal ("must not build a system where the latest generated prose overwrites historical evidence") — the same failure class as the global Research Data Integrity postmortem |
| **Bitemporal, append-only status log (never a mutable status field)** | `StatusEvent` is the sole source of assigned validity for `ClaimVersion`/`BriefVersion`; `effectiveAt` and `recordedAt` are tracked separately and no event is ever edited | Q-3 (binding decision) — the previous single mutable `status` field could not answer "what state did we assign at time T" and directly violated the doc's own in-place-mutation anti-pattern; this closes G-3 |
| **Stable identity + immutable version (Claim/ClaimVersion split)** | `Claim` carries no mutable content; every correction is a new `ClaimVersion` under the same `Claim.id`; `BriefVersion` references exact `ClaimVersion` ids, never the mutable `Claim` identity | Q-4 (binding decision) — makes "which exact claim text did this Brief version rely on" a stored fact, not a moving target; closes G-4 |
| **Decision-to-version binding (foreign key, not "latest")** | `Decision.briefVersionId` always points at the exact version evaluated; there is no `Decision.problemBriefId` shortcut that could resolve to "whatever is current" | Satisfies US-8 AC2 — a correction must never silently migrate a prior decision's meaning |
| **Provenance wrapping per generation run, anchored to Investigation not BriefVersion** | Every Brief-generating pipeline execution is wrapped in one `GenerationRun`, keyed to `investigationId` (required) with `briefVersionId` set only on success | Satisfies US-11 without the circular-reference/unrecordable-failure problem of anchoring to `BriefVersion` (G-12) — this is the shape the runtime evaluation observes and scores |
| **Two-track demand model (signal type vs. confidence)** | `DemandSignal` (what evidence) and `DemandConfidenceClassification` (how strongly, qualitative) are separate entities with a one-directional citation link (confidence cites signals, never the reverse) | Structurally prevents the two from merging into one field/score — US-4's core constraint |
| **Fixed-value quarantine field for Personal Pull** | `PersonalPullNote.label` is a literal type (`'contextual-motivation'`), not an open string, and the type has no field compatible with `DemandSignalType`/`DemandConfidenceLevel` | Makes "Personal Pull counted toward demand" a type error, not just a convention — US-12, US-4 AC4 |
| **Fail-closed pipeline (no partial Brief)** | `generateBriefVersion` either returns a `BriefVersion` with all seven elements populated, or does not produce one at all (Investigation moves to `blocked` or `generation-failed`, per which failure occurred) | Satisfies US-1 AC3 and the "no Brief with no evidentiary basis" requirement; the `blocked`/`generation-failed` split closes G-13 |
| **Open discriminator over closed enum, where the domain evidence says so** | `SourceArtifactType`, `SubmissionOrigin` typed as `'known-literal' \| (string & {})` rather than a bare `\| string` | Decision 1.1, corrected per G-2 — matches the pattern Requirements already mandates for demand-signal "other" while actually retaining literal-type value in tooling |

### Anti-Patterns (Do Not Use)

- **In-place Brief mutation**: editing fields on an existing `BriefVersion` after creation — violates US-10 AC2 and the Interview's named anti-goal directly.
- **Mutable status fields for assigned validity**: no `status: ClaimStatus`/`BriefVersionStatus` field exists anywhere in Section 3 — assigned validity is always read from `StatusEvent` via `getAssignedState`. Any future PR adding a mutable status field back onto `Claim`, `ClaimVersion`, or `BriefVersion` reintroduces G-3 and is an architecture violation.
- **Copying claim/evidence content into a BriefVersion**: `BriefVersion` stores `claimVersionIds` (exact immutable version references), never a copy of claim text and never a reference to the mutable `Claim` identity. Any future PR that denormalizes claim text directly onto `BriefVersion` violates Q-4.
- **Numeric confidence anywhere**: no field in any schema above is numeric for demand confidence, recommendation strength, or market size — enforced by using literal string unions, not `number` types, for every judgment field. Any future PR introducing a `score: number` field on `DemandConfidenceClassification`, `Recommendation`, or any Brief element is an architecture violation, not a style choice.
- **Auto-scheduling Watch rechecks**: no `nextCheckAt`/cron-like field exists on `Decision` or `ReconsiderationCondition` — reconsideration is manual by design for this slice (US-9 AC3).
- **Runtime-specific types leaking into the domain model**: no schema above references a specific agent runtime's SDK types, message formats, or tool-call conventions — `GenerationRun.runtimeIdentifier` is a string precisely so the model stays valid across every candidate the runtime evaluation tests.
- **Treating citation presence as citation correctness**: no component or contract above verifies that cited evidence actually supports the claim it's attached to (R-1, explicitly accepted MVP limitation). Do not represent a populated `evidenceItemIds`/`supportingClaimVersionIds` array as verified in any UI copy, log message, or downstream consumer.
- **Silent coercion of out-of-schema values**: no component may map an invalid enum member or malformed structured output to a default, a "nearest valid" guess, or a placeholder, and continue as if the field were valid (R-4, Danny binding). The only paths for an out-of-schema value are: bounded repair via `SchemaValidationRecord` (Section 3), or the step — and its `GenerationRun` — failing explicitly with `outcome: 'failed'`. A future PR adding a fallback/default branch on validation failure reintroduces R-4 and is an architecture violation.

---

## 6. Dependencies

Per the milestone's explicit scope boundary, this document does not select libraries, a
database, or an agent-runtime SDK — those choices are the output of the runtime evaluation this
milestone runs, not an input to it. In their place, this section specifies the **capabilities**
any candidate runtime/storage combination must provide to satisfy the schemas and API contracts
above, since that is what the evaluation needs to observe and measure:

| Capability required | Why | Evaluation observes |
|---|---|---|
| Durable, queryable persistence of the Section 3 entities with foreign-key-style integrity (a `Decision` cannot reference a nonexistent `BriefVersion`) | US-8, US-10 | Whether the candidate's storage layer enforces or merely hopes for referential integrity |
| Append-only / immutable-record support (or enforced-at-application-layer immutability) for `BriefVersion`, `ClaimVersion`, `EvidenceItem`, and `StatusEvent` | US-10 AC2, Q-3, Q-4 | Whether versions and status history can be corrupted by accidental in-place writes |
| Efficient reverse lookup of `BriefVersion`s by a member `claimVersionId` (an array-contains or join-table query) | Q-4 traversal requirement | Whether the candidate's storage layer supports this without a full scan per invalidation |
| Multi-step orchestration with per-step provenance capture (model/tool/timing per `GenerationStep`), including on failed runs | US-11, G-12 | How much provenance instrumentation the runtime provides natively vs. requires hand-rolling, and whether failure paths are captured as readily as success paths |
| Fetch/resolve capability for URL-type `SourceArtifact`s, with graceful unreachable-source handling | US-1, Edge Case (dead URL) | Error-handling ergonomics of the runtime's tool-call layer |
| A structured-output or schema-constrained generation mode capable of producing the exact literal unions in Section 3 (`EvidenceLabel`, `DemandConfidenceLevel`, `GapCategory`, `RecommendationDecision`) without free-text drift | US-3, US-4, US-5, US-7 | Whether the candidate can reliably emit constrained enums, or requires post-hoc validation/repair |
| Schema/enum validation of structured model output with a bounded re-prompt-and-repair path (Section 3 `SchemaValidationRecord`, MAX_REPAIR_ATTEMPTS = 1), and explicit run-failure (not silent coercion) when repair also fails | R-4 (Danny binding) | Whether the candidate exposes validation errors in a form usable for re-prompting, and whether failed validation naturally surfaces as a recordable `GenerationRun` failure rather than requiring bespoke plumbing |
| A minimal read/write surface reachable by a human (no requirement on framework) for the Review Surface, including the pre-Brief Investigation state | US-13, G-15 | Effort to stand up even a minimal interactive surface atop the candidate |
| A tool or adapter through which the runtime can search the public web and retrieve/inspect selected results, preserving query/URL/retrieval-time and surfacing failed or blocked retrievals — no specific search API/provider selected here | US-5, Q-6 (binding) | Whether the candidate can plug in web search/retrieval via a tool call or adapter at all, and how cleanly it preserves the Q-6 provenance fields, without this document locking in a vendor |

---

## 7. Integration Points

- **Department OS Core** (`docs/architecture.md`): every entity in Section 3 is a Core domain
  record, evidence record, workflow-state record, or decision record — Problem Department does
  not own separate storage. This MVP is the first concrete exercise of "a module without Core
  underneath it is not a complete vertical slice" (`docs/principles.md`). The `StatusEvent` log in
  particular is a direct instance of Core's general "workflow state" concept and should be modeled
  as such rather than as a Problem-Department-specific table, since other modules will need the
  same bitemporal-validity pattern.
- **Future Opportunity concept**: `ProblemBrief`/`BriefVersion` deliberately do not reference an
  `Opportunity` entity — no such schema exists yet, per Interview Q5. The only forward-compatible
  seam left open is that `Decision.decision === 'Approve'` is a fact Core can query later to
  populate a future Opportunity-handoff process; this MVP does not build that handoff.
- **Future Personal Pull path**: `PersonalPullNote` stays a field on `BriefVersion`, not a
  first-class artifact — per Interview Q5's explicit rejection of a path-agnostic Brief schema.
  No convergence point is designed here.
- **Future multi-channel/collector-fed submissions**: `SubmissionOrigin` and
  `SourceArtifactType`'s open-discriminator shape (Decision 1.1, corrected per G-2) is the only
  accommodation made; no collector integration is built.
- **Runtime evaluation harness** (outside this document's scope to design): consumes the
  Section 6 capability table as its scoring rubric when comparing candidate runtimes against a
  real implementation of this pipeline.

---

## Output Verification

- [x] Every requirement (US-1 through US-13, and every AC in 01-REQUIREMENTS.md's Acceptance
      Criteria section) has explicit architecture coverage in Sections 2–5.
- [x] Schemas are complete, precise interfaces — no pseudocode, no `any`.
- [x] No implementation details (no chosen language, framework, database, or runtime).
- [x] Patterns are justified against specific ACs or the Research Data Integrity precedent.
- [x] Integration points identified (Core, and explicit non-integration with Opportunity/Personal
      Pull/collectors, stated as deliberate boundaries, not omissions).
- [x] Both flagged open items (source-artifact types, submission-to-Brief cardinality) resolved
      with explicit reasoning; neither required a HALT.
- [x] Danny's binding Q-3/Q-4 decisions implemented exactly, with the epistemic-framing wording
      correction propagated into schema naming, API naming, and UI-copy flag (R-1).
- [x] Review gaps G-2, G-3, G-4, G-11, G-12, G-13, G-15 closed; R-1 and R-4 (schema validation /
      bounded-repair mechanism, Section 3) both named as explicit, accepted-and-implemented items
      rather than silently dropped.
- [x] Danny's binding Q-5/Q-6/Q-7/Q-8 decisions implemented: Q-5 (Reject reconsiderable via new
      run/BriefVersion, no new mechanism) and Q-7 (getInvestigation already satisfies the single
      durable-URL contract) confirmed against existing design; Q-6 (independent web research
      capability contract, vendor-unselected) added as new schema/component/capability-table
      content; Q-8 (runtime-adoption wording) tightened in Scope Discipline.
