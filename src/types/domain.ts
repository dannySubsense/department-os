/**
 * Domain types — copied exactly from `docs/specs/problem-department-mvp/02-ARCHITECTURE.md`
 * Section 3 "Intake" schemas. This is the contract; do not narrow or close any of the
 * open-discriminator types below (Decision 1.1/G-2, Decision 1.5).
 *
 * Only the Intake-slice entities are implemented here (Slice 2 scope). Later slices add their
 * own schemas alongside these without modifying this file's existing shapes.
 */

/** A submission is the human (or future collector) act of handing sources to the system.
 *  Origin is NOT hard-coded to human — US-1 AC2. */
export interface Submission {
  id: string;
  investigationId: string; // the Investigation this submission contributes to
  origin: SubmissionOrigin; // extensible — 'human' today, collector-fed origins later
  submittedAt: string;
  sourceArtifactIds: string[]; // one-or-more; empty submissions are rejected pre-persistence
}

/** Open, not closed — see Decision 1.1. 'human' is the only value produced by this MVP.
 *  '(string & {})' preserves literal-type hints in tooling while staying structurally open —
 *  a bare '| string' collapses to plain string and loses all literal-type value (G-2). */
export type SubmissionOrigin = 'human' | (string & {});

export interface SourceArtifact {
  id: string;
  investigationId: string;
  type: SourceArtifactType; // open discriminator — see Decision 1.1
  raw: string; // the URL string, or the pasted text body
  resolution: SourceResolution;
  addedAt: string;
  origin: SourceArtifactOrigin; // distinguishes human-submitted material from material the
  // Landscape Researcher retrieved itself during independent web research (Decision 1.5)
  /** Durable content snapshot captured at resolution time (Slice 3 fix — content was previously
   *  fetched, classified, then discarded). Populated only when `resolution.status ===
   *  'content-retrieved'`: the fetched body text for `type: 'url'` artifacts, or the raw pasted
   *  text for `type: 'text'` artifacts. `undefined`/`NULL` otherwise. Consumed by Slice 4
   *  (Evidence/Claim extraction), not by this slice. */
  resolvedContent?: string;
}

/** 'submitted' is every artifact reachable via a Submission (all artifacts before this revision).
 *  'landscape-research' is a web result the Landscape Researcher retrieved on its own initiative —
 *  Q-6. Open, not closed — same extensibility pattern as SourceArtifactType/SubmissionOrigin. */
export type SourceArtifactOrigin = 'submitted' | 'landscape-research' | (string & {});

/** MVP implements exactly 'url' | 'text'. Third-party types (file, screenshot, ...) are a
 *  future additive change, not a breaking one — Decision 1.1. Same '(string & {})' fix as
 *  SubmissionOrigin (G-2). */
export type SourceArtifactType = 'url' | 'text' | (string & {});

/** Four-way status (G-9 fix). Maps directly onto 03-UI-SPEC's four-way display. */
export interface SourceResolution {
  status: 'unresolved' | 'unreachable' | 'content-retrieved' | 'reachable-no-content';
  resolvedAt?: string;
  failureReason?: string; // populated only when status === 'unreachable'
  noContentReason?: string; // populated only when status === 'reachable-no-content'
}

/** One Investigation aggregates 1..N SourceArtifacts across 1..N Submissions and produces
 *  exactly one Problem Brief identity for this MVP — see Decision 1.2. */
export interface Investigation {
  id: string;
  createdAt: string;
  status: InvestigationStatus;
  statusReason?: string; // free-text detail, e.g. which sources failed
  problemBriefId: string | null; // set once the first BriefVersion is generated
}

export type InvestigationStatus =
  | 'open' // accepting submissions, no Brief yet
  | 'blocked' // zero reachable sources — no Brief can be generated
  | 'generation-failed' // sources reachable, but the pipeline failed to produce a usable Brief
  | 'brief-generated';

// ---- Evidence & Claims (Slice 4) — copied exactly from 02-ARCHITECTURE.md Section 3
// "Evidence & Claims" (Q-4 stable-identity/immutable-version split; PR-review binding correction
// — stance lives on the claim-evidence relationship, not on EvidenceItem). ----

/** Citation collections are required-and-non-empty by contract, not just by convention — enforced
 *  at RUNTIME (Architecture §4 citation-enforcement note), because TypeScript's tuple-based
 *  NonEmptyArray cannot statically prove length at every construction site (e.g. a spread from an
 *  untrusted model output). */
export type NonEmptyArray<T> = [T, ...T[]];

export type EvidenceLabel = 'fact' | 'observation' | 'interpretation' | 'assumption' | 'unknown';

/** Immutable once created. Shared — may be cited by any number of ClaimVersions across any number
 *  of BriefVersions. Carries no `stance` field (PR-review binding correction): stance is not
 *  intrinsic to the evidence — the same item may support one ClaimVersion, contradict another,
 *  and be neutral/contextual to a third. Stance lives on ClaimVersionEvidence below. */
export interface EvidenceItem {
  id: string;
  sourceArtifactId: string; // provenance — which source this evidence came from
  excerptOrSummary: string;
  label: EvidenceLabel; // exactly one — US-3 AC1
  createdAt?: string; // provenance/debugging timestamp (F-4) — column exists in
  // evidence_item since migration 004; not named in Architecture §3's schema, so kept
  // optional here rather than widening the documented contract.
}

/** The claim-evidence relationship, not the evidence item, carries stance (PR-review binding
 *  correction). Immutable once created (part of the immutable ClaimVersion it belongs to). */
export interface ClaimVersionEvidence {
  claimVersionId: string;
  evidenceItemId: string;
  stance: 'supporting' | 'contradicting' | 'neutral-context';
  relevanceNote?: string; // optional relationship-specific rationale, distinct from the
  // EvidenceItem's own excerptOrSummary
}

/** Stable identity only. No text, no status field — both live on ClaimVersion / StatusEvent.
 *  Never mutated after creation. */
export interface Claim {
  id: string;
  createdAt: string;
}

/** Immutable once created — a correction creates a new ClaimVersion under the same Claim.id, it
 *  never edits this record (Q-4). */
export interface ClaimVersion {
  id: string;
  claimId: string; // stable Claim identity this is a version of
  versionNumber: number; // monotonic per claimId, starts at 1
  createdAt: string;
  text: string;
  evidence: NonEmptyArray<ClaimVersionEvidenceRef>; // every major claim traces to source
  // evidence, with an explicit stance for THIS claim — US-10 AC1; non-empty by contract
  supersedesVersionId: string | null; // null for version 1 of this Claim
}

/** A single ClaimVersionEvidence row, denormalized onto the ClaimVersion that owns it for
 *  single-fetch reads; evidenceItemId resolves to the shared, independently-retained
 *  EvidenceItem. Persisted identically to ClaimVersionEvidence above — this is a read-shape
 *  convenience, not a second source of truth. */
export interface ClaimVersionEvidenceRef {
  evidenceItemId: string;
  stance: 'supporting' | 'contradicting' | 'neutral-context';
  relevanceNote?: string;
}

/** Roadmap correction (Slice 4/5-7 — ProblemStatement/candidate persistence timing): this is the
 *  in-memory/return-value shape produced by the Extraction & Clustering Engine — the same fields
 *  as the eventual (Slice 9-persisted) `ProblemStatement`, minus `id` and `briefVersionId`. Never
 *  persisted by this slice. */
export interface ProblemStatementCandidate {
  whoExperiencesIt: string;
  contextOrWorkflow: string;
  consequenceOrFriction: string;
  supportingClaimVersionIds: NonEmptyArray<string>; // exact ClaimVersion ids — Q-4
}

// ---- Demand (Slice 5) — copied exactly from 02-ARCHITECTURE.md Section 3 "Demand", plus the
// same roadmap-corrected candidate-shape pattern applied above for ProblemStatementCandidate:
// DemandSignal/DemandConfidenceClassification/PersonalPullNote all require `briefVersionId`, which
// does not exist until Slice 9, so this slice returns candidate shapes (same fields minus `id` and
// `briefVersionId`) instead of persisting rows directly. ----

/** Closed nine-member union; extensibility to 'other' is provided by the
 *  'other-observed-behavior' member plus otherTypeLabel, not by an open string. US-4 AC1. */
export type DemandSignalType =
  | 'recurring-complaints'
  | 'workarounds'
  | 'existing-spend'
  | 'paid-labor'
  | 'switching-behavior'
  | 'willingness-to-pay'
  | 'rfps'
  | 'feature-requests'
  | 'other-observed-behavior';

/** Qualitative only — never a numeric score anywhere (Q-1). US-4 AC2/AC3. */
export type DemandConfidenceLevel = 'Insufficient' | 'Emerging' | 'Substantiated';

/** Candidate shape for `DemandSignal` (Architecture §3), minus `id`/`briefVersionId`. `localId` is
 *  a synthetic identifier assigned by the Demand Analyzer for THIS run only — it exists because,
 *  unlike `ClaimVersion` (already persisted with real ids by Slice 4 before Slice 5 ever runs),
 *  `DemandSignal` itself has no real id until Slice 9 persists it. Without some stable per-signal
 *  handle, `DemandConfidenceClassificationCandidate.citedDemandSignalIds` below would have nothing
 *  concrete to reference. Slice 9 is expected to persist these candidates in order, capture the
 *  real `DemandSignal.id` each one is assigned, and remap `citedDemandSignalIds` from `localId` to
 *  that real id when it persists `DemandConfidenceClassification`. */
export interface DemandSignalCandidate {
  localId: string;
  type: DemandSignalType;
  otherTypeLabel?: string; // required when type === 'other-observed-behavior'
  evidenceItemIds: NonEmptyArray<string>; // non-empty by contract — R-4 fail-closed, Section 4
}

/** Candidate shape for `DemandConfidenceClassification` (Architecture §3), minus `briefVersionId`.
 *  `citedDemandSignalIds` references `DemandSignalCandidate.localId` values from THIS run (see
 *  that type's doc comment) — Slice 9 remaps to real `DemandSignal.id`s at persistence time. */
export interface DemandConfidenceClassificationCandidate {
  level: DemandConfidenceLevel;
  narrative: string; // must cite which signals/gaps drove the classification
  citedDemandSignalIds: string[]; // sole named exception to non-empty-array enforcement —
  // 'Insufficient' may legitimately cite zero signals (Section 4)
  /** Populated if and only if zero `DemandSignalCandidate`s were found at all for this
   *  Investigation AND the run did not fail (`generationFailed === false`) — never derived from
   *  `level` or from `citedDemandSignalIds` being empty (Architecture §3 negativeFindingRef note,
   *  PR-review re-review correction). Unset on every `generationFailed: true` path, since a failed
   *  run has an unknown signal set, not a confirmed-empty one. Carries what Slice 9 (Brief Assembler) needs to construct a
   *  `NegativeFinding` row with `element: 'demand-signal-type'`; this slice does not persist that
   *  row itself. */
  negativeFindingSignal?: {
    statement: string;
  };
}

/** Candidate shape for `PersonalPullNote` (Architecture §3), minus `id`/`briefVersionId`. `label`
 *  is a literal type fixed to `'contextual-motivation'` — a type-level guarantee, not a
 *  convention: no other string value is assignable to this field, so Personal Pull content cannot
 *  be silently relabeled into a demand-signal-shaped field. Structurally separate from
 *  `DemandSignalCandidate`/`DemandConfidenceClassificationCandidate` — never merged in, never
 *  counted toward either (US-12, US-4 AC4). */
export interface PersonalPullNoteCandidate {
  sourceArtifactId: string;
  text: string;
  label: 'contextual-motivation';
}
