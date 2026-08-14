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

// ---- Landscape & Gap: searchWeb adapter boundary (Architecture §1.6/§4, Slice 6) ----

/** Provider-level searchWeb-adapter-call failure — Architecture §1.6 item 1. Distinct from
 *  WebSearchResult: this means no result set was ever produced to iterate, not that an individual
 *  result URL's retrieval failed. */
export interface QueryLimitation {
  id: string;
  webSearchQueryId: string; // the WebSearchQuery this limitation is attached to — a
  // WebSearchQuery row is created even when the search call fails, so the attempt itself is
  // never dropped (Architecture §1.6 "Persistence — provably not dropped")
  reason: string; // e.g. "provider error: 429 rate limited", "search API request timed out",
  // "malformed query rejected by provider"
  occurredAt: string; // client-captured — never trusted from the provider
}

/** Return shape of the searchWeb adapter call, before any result-URL retrieval is attempted
 *  (Architecture §1.6 item 1). */
export interface SearchWebAdapterResult {
  outcome: 'succeeded' | 'query-limited';
  query: string;
  performedAt: string; // client-captured
  selectedResultUrls: string[]; // present when outcome === 'succeeded'; an empty array here is a
  // legitimate, non-limited "zero results found" outcome — categorically different from
  // 'query-limited'
  /** Set whenever ANY provider-level failure/limitation shape was observed. A single `web_search`
   *  tool call may issue up to 5 searches (`max_uses: 5`), each producing its own
   *  `web_search_tool_result` content block — some blocks may succeed while others error. This is
   *  set on `outcome: 'query-limited'` (no URLs were ever produced, `selectedResultUrls: []`) AND
   *  on `outcome: 'succeeded'` when a PARTIAL failure occurred — some blocks contributed URLs to
   *  `selectedResultUrls` while at least one other block errored. Partial success must never look
   *  like clean success (Q-6 AC5): callers MUST check this field regardless of `outcome`, not just
   *  branch on `outcome`. Absent entirely only on a fully clean success with no block-level
   *  failures. */
  queryLimitation?: QueryLimitation;
}

/** One retrieval attempt for one selected result URL from a successful WebSearchQuery — exactly
 *  one row per URL, success or failure alike (Architecture §1.6 "Persistence — provably not
 *  dropped"). Classification rule (blocked = deliberate, attributable refusal; failed = could not
 *  complete / no refusal signal obtained) is specified in full, with a worked classification
 *  table, in Architecture §1.6 item 3. */
export interface WebSearchResult {
  url: string;
  retrievedAt: string; // client-captured completion timestamp for this attempt — never a
  // provider-supplied value (e.g. not Anthropic's page_age, which is a freshness estimate, not a
  // retrieval timestamp — DDR-0001 Row 9 evidence)
  status: 'retrieved' | 'blocked' | 'failed';
  failureReason?: string; // populated when status !== 'retrieved'; see Architecture §1.6's
  // classification table for the exact value per cause
  sourceArtifactId?: string; // set only when status === 'retrieved'; the SourceArtifact
  // (origin: 'landscape-research') this result produced, which then flows through the existing
  // EvidenceItem/ClaimVersion/ExistingSolution/GapHypothesis citation model unchanged
}

/** One record per web search the Landscape Researcher performs (Q-6, binding). Preserves query,
 *  every retrieved-or-attempted URL, retrieval timestamps, and search scope/limitations —
 *  including failed or blocked retrievals, which are recorded, never silently dropped.
 *  `queryLimitation` (Architecture §1.6 addendum) is the searchWeb-adapter-boundary failure path:
 *  set iff the provider's search call itself failed to produce a result set, in which case
 *  `results` is `[]` by construction (there was nothing to retrieve) — categorically distinct
 *  from a successful call that legitimately returned zero results (queryLimitation absent,
 *  results: [] is then simply "nothing found," not "the search failed"). */
export interface WebSearchQuery {
  id: string;
  investigationId: string;
  generationRunId: string; // ties the search to the GenerationRun that performed it
  query: string;
  performedAt: string;
  results: WebSearchResult[];
  scopeNote?: string; // e.g. result-count cap, date range, or other scope actually applied
  limitations: string[]; // e.g. "rate-limited after 3 queries", "no results past page 1"
  queryLimitation?: QueryLimitation; // Architecture §1.6 — set iff the searchWeb adapter call
  // itself failed/errored (provider outage, rate limit, quota/auth failure, malformed-query
  // rejection); absent on every successful adapter call regardless of result count
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

// ---- Landscape & Gap candidate shapes (Architecture §1.7, Slice 6) ----

/** Candidate shape for `ExistingSolution` (Architecture §3), minus `id`/`briefVersionId`. `localId`
 *  mirrors `DemandSignalCandidate.localId` — a synthetic per-run handle so
 *  `GapHypothesisCandidate` (below) and Slice 9's persistence step can reference a specific
 *  landscape entry before it has a real `ExistingSolution.id`. */
export interface ExistingSolutionCandidate {
  localId: string;
  name: string;
  whatItAddresses: string;
  howPeopleCopeNow: string;
  whereItsInadequate: string;
  evidenceItemIds: NonEmptyArray<string>; // non-empty by contract — R-4 fail-closed, Section 4
}

export type GapCategory =
  | 'capability'
  | 'usability'
  | 'price'
  | 'workflow-fit'
  | 'trust'
  | 'integration'
  | 'accessibility'
  | 'distribution'
  | 'other';

/** Candidate shape for `GapHypothesis` (Architecture §3), minus `id`/`briefVersionId`. */
export interface GapHypothesisCandidate {
  category: GapCategory;
  otherCategoryLabel?: string; // required when category === 'other'
  statement: string; // specific, falsifiable claim about what's missing
  evidenceItemIds: NonEmptyArray<string>; // non-empty by contract — R-4 fail-closed, Section 4
}

// ---- Uncertainty & Recommendation candidate shapes (Architecture §1.8, Slice 7) ----

/** Closed three-value union — no "insufficient information" member; a run that cannot produce a
 *  trustworthy recommendation fails closed (`generationFailed: true`) rather than emitting a
 *  placeholder decision (Architecture §1.8). */
export type RecommendationDecision = 'Approve' | 'Reject' | 'Watch';

/** Candidate shape for `UncertaintyStatement` (Architecture §3/§1.8), minus `briefVersionId`. No
 *  `localId` — the Recommendation Engine and Slice 9 consume the three arrays wholesale, not by
 *  index. Non-negatable — `UncertaintyStatement` is not one of `BriefElement`'s four negatable
 *  elements, so it is always constructed on success. Never-empty-array policy: each of the three
 *  arrays always contains at least one string — a genuinely-clean category gets one explicit
 *  sentinel sentence, never `[]` (Architecture §1.8). */
export interface UncertaintyStatementCandidate {
  whatsUnknown: string[];
  whatWouldChangeConclusion: string[];
  whatsUndeterminable: string[];
}

/** Candidate shape for `Recommendation` (Architecture §3/§1.8), minus `briefVersionId`. Also
 *  non-negatable (see `RecommendationDecision`). */
export interface RecommendationCandidate {
  decision: RecommendationDecision;
  rationale: string; // must reference Brief evidence — never bare/scored (Q-1, US-7 AC1)
}

// ---- Provenance (Architecture §3 "Provenance", refined per §1.9 — Slice 8). These types are
// introduced by this slice for the first time (no prior base shape existed in this file), so the
// §1.9 "refinements" are folded directly into the shapes below rather than layered on afterward. ----

/** One record per Brief-generating run — covers every component in Section 2's pipeline for a
 *  given Investigation. US-11. `outcome: 'in-progress'` (§1.9 point 3) is set at
 *  `createGenerationRun` time, before any Slice 4 step begins; moved to 'succeeded'/'failed' only
 *  by `finalizeGenerationRun`. */
export interface GenerationRun {
  id: string;
  investigationId: string;
  briefVersionId: string | null; // set only when outcome === 'succeeded'
  outcome: 'in-progress' | 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string; // only meaningful once outcome !== 'in-progress'
  runtimeIdentifier: string; // e.g. candidate runtime name/version under evaluation
  modelIdentifiers: string[]; // computed by finalizeGenerationRun as the union of every step's
  // modelIdentifier + every attempt's modelIdentifier across stepLog
  toolsInvoked: string[]; // computed by finalizeGenerationRun as the union of every
  // SchemaValidationRecord.toolName + every ToolInvocationRecord.toolName across stepLog
  stepLog: GenerationStep[]; // ordered, one entry per component in Section 2 — appended to by
  // recordGenerationStep, in order, as each step completes or fails
}

/** One entry per component step in a GenerationRun's pipeline. `outcome` (§1.9 point 3) is
 *  required — 'failed' covers both "produced a terminal-failed SchemaValidationRecord" and "threw
 *  an unexpected error" (see `error`). */
export interface GenerationStep {
  component: string; // matches a Section 2 component name
  startedAt: string;
  completedAt: string;
  outcome: 'succeeded' | 'failed';
  error?: string; // populated iff outcome === 'failed' AND the failure was an unexpected thrown
  // error (not a schema-validation terminal-fail, already represented by
  // validationRecords[].finalOutcome === 'invalid')
  modelIdentifier?: string;
  inputRefs: string[]; // IDs of records this step read
  outputRefs: string[]; // IDs of records this step produced
  validationRecords?: SchemaValidationRecord[]; // one entry per schema-constrained structured
  // output this step produced, subject to R-4's validation/repair mechanism
  toolInvocations?: ToolInvocationRecord[]; // non-schema-validated tool telemetry (searchWeb's
  // web_search adapter call and per-URL url-fetch retrieval attempts); unset for steps with no
  // such calls
}

/** R-4 mitigation (Danny, binding) — one entry per schema-constrained structured output a step
 *  produced. `toolName` (§1.9 point 3) is the callForcedTool toolName that produced this record —
 *  disambiguates when a step invokes more than one forced-tool call. */
export interface SchemaValidationRecord {
  fieldPath: string; // Slice 8's actual implementation (provenanceRecorder.ts's
  // buildValidationRecords) has no per-field granularity available from callForcedTool's current
  // call sites, so this is populated with the same value as `toolName` below, not a dotted schema
  // field path like 'GapHypothesis.category' — honestly redocumented here rather than left
  // claiming semantics this implementation doesn't provide. A true per-field path would require a
  // call-site change to callForcedTool's params, out of scope for Slice 8.
  toolName: string; // the callForcedTool toolName that produced this record
  attempts: SchemaValidationAttempt[]; // length 1 (no repair needed) up to 1 + MAX_REPAIR_ATTEMPTS
  finalOutcome: 'valid' | 'invalid'; // 'invalid' iff every attempt, including repairs, failed
}

/** One captured generation attempt within a SchemaValidationRecord. `startedAt`/`completedAt`/
 *  `modelIdentifier`/`tokenUsage` (§1.9 point 3) are client-captured (DDR-0001 Row 4: the API
 *  provides no wall-clock timing). `modelIdentifier` is recorded per attempt, not once per step,
 *  so a future change that varies the model on repair remains representable without a further
 *  schema change. `tokenUsage` is optional per DDR-0001 Row 4's documented asymmetry — a
 *  provider-rejected request yields no usage data, never defaulted to {0,0}. */
export interface SchemaValidationAttempt {
  attemptNumber: number; // 1 = original generation; 2 = first repair; etc.
  rawOutput: string; // the model's output as produced, prior to validation — retained even when
  // invalid; never overwritten or discarded
  valid: boolean;
  validationError?: string; // present iff valid === false
  startedAt: string;
  completedAt: string;
  modelIdentifier: string;
  tokenUsage?: { inputTokens: number; outputTokens: number };
}

/** Persisted projection of provenanceContext.ts's CapturedToolInvocation for invocations that are
 *  NOT schema-validated structured output (searchWeb's two call kinds) — kept distinct from
 *  SchemaValidationAttempt because it has no attemptNumber/repair concept and a differently-shaped
 *  outcome (3-4-way status, not boolean valid/invalid). */
export interface ToolInvocationRecord {
  toolName: string; // 'web_search' | 'url-fetch'
  startedAt: string;
  completedAt: string;
  outcome: 'retrieved' | 'blocked' | 'failed' | 'query-limited';
  failureReason?: string; // present iff outcome !== 'retrieved'
  modelIdentifier?: string; // set for 'web_search' (the adapter's own LLM call), unset for
  // 'url-fetch' (plain HTTP, no model involved)
}
