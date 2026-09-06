# Spec Review: Product Surface — Checkpoint 2

This file states the current, binding decisions and any genuinely open items. It is a snapshot of
the current specification, not a history of how it got here.

---

## Resolved Decisions (binding, on record)

- **Add-Source route.** No new `POST /api/investigations/:id/sources` route exists. The existing
  `POST /api/investigations` route branches on whether `investigationId` is present and, if
  present, on the Investigation's pre-mutation status (`'brief-generated'` vs. other), and always
  responds with real, read-back-after-write state. Full contract: `02-ARCHITECTURE.md` §1.4/§3.1b.
- **Benign no-op vs. genuine conflict.** A declined `transitionInvestigationStatus` call is a `409`
  conflict only when the Investigation's real current status has diverged from the status observed
  before this request attempted anything; otherwise it is a benign no-op and the request succeeds.
  Full contract: `02-ARCHITECTURE.md` §3.1b step 6.
- **US-5 AC3 joint completion.** AC3 may be satisfied jointly by C2-S2 and C2-S3 only when the
  dependency is stated explicitly in both slices, neither slice's own Done-When claims independent
  completion, and an integrated test plus browser demonstration prove the complete behavior end to
  end. `04-ROADMAP.md` C2-S2/C2-S3.
- **Scope.** US-12 (validity/invalidation, read-side banner) and US-13 (evidence-driven correction)
  are in scope for this checkpoint, per Danny's ruling — see `01-REQUIREMENTS.md`'s "Resolved Scope
  Corrections."
- **Timing-constant ownership.** `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` are engineering
  parameters, derived during Forge from real-run measurement (`02-ARCHITECTURE.md` §4.9's
  methodology) and recorded as code comments next to the constants. Neither is a product decision
  for Danny to ratify, and no document asserts a specific numeric value for either.
- **Non-blocking generation start.** `POST .../generation-runs` returns `202` the instant the
  `GenerationRun` row is durably created, never after pipeline completion. The browser observes
  progress and terminal outcomes exclusively through the persisted workspace read model.
- **Safety-net design.** The fire-and-forget rejection handler reads the `GenerationRun`'s actual
  persisted outcome before acting — never infers state from the rejection's error class. Terminal →
  log only. Still in-progress → one guarded, best-effort terminal write. The handler's own
  read/write failures are consumed and logged, never left unhandled, never applied twice.
- **Stale/interrupted observation.** Crossing the stale threshold stops automatic polling but never
  permanently ends observation — a real "Refresh status" action remains available and honestly
  reflects continued progress if any is later recorded. The disclosure itself never mutates
  persisted state.
- **Generation run ownership: fencing, not timeout alone — every write path fenced, no disclosed
  exception (SOL-HIGH-1/SOL-HIGH-2 corrections).** A silence-based `livenessState` is a
  display signal only — it never by itself authorizes the destructive "Abandon and retry" action.
  Ownership is enforced by a fencing token (`generation_run.fence_token`) plus an actively-renewed
  heartbeat (`lease_heartbeat_at`, renewed at every real `recordGenerationStep` call — including the
  seven made indirectly through `runStepWithProvenance`, which also carries the `fenceToken` field
  and threads it to its own two internal `recordGenerationStep` calls, so all eleven of
  `generateBriefVersion.ts`'s real `recordGenerationStep`-bearing progress-write call sites (three
  direct, one added to the `InvalidSupersedeTargetError` preflight catch, and seven via
  `runStepWithProvenance`) renew the heartbeat, not just its four direct callers).
  `assertFenceOwnership` checks BOTH `fence_token` AND `outcome = 'in-progress'` (SOL-HIGH-2 fix — a run
  finalized without its token changing must still fail this guard), and every pre-Phase-4 write path
  is now fenced by it: the consumed-source ledger insert, `searchWeb`'s four writes, and
  `attemptGenerationFailedTransition`'s Investigation-status write each get the guard as the first
  statement of their own new, short-lived transaction; evidence/claim writes via
  `extractClaimsAndEvidence`/`extractClaimsAndEvidenceForSourceArtifacts` (the primary path and
  Landscape Research's own second extraction pass) get the guard inside their EXISTING transaction,
  called after the LLM call returns and immediately before the first `INSERT`, never as that
  transaction's first statement and never in a second, separately-opened transaction (SELF-3) —
  there is no disclosed exception: an "accretive, so harmless" carve-out for
  the status write is not valid, since `getProblemDepartmentOverview`/
  `InvestigationPortfolioTable` read `investigation.status` directly and could observe a stale
  fenced-out `'generation-failed'` write over a currently-healthy Investigation.
  `GenerationRunFencedOutError` is explicitly threaded into `generateBriefVersion`'s own catch
  structure (its `:700-707` outer catch), given the same graceful-no-op disposition as
  `GenerationRunAlreadyFinalizedError`, never left as an assertion that "no error surfaces" without a
  named catch site. Abandonment authorizes via a monotonic `heartbeat_revision` integer counter
  (SOL-HIGH-1 fix — NOT `lease_heartbeat_at` timestamp equality, which can both false-positive and
  false-negative under ordinary Postgres/Node `TIMESTAMPTZ` round-tripping), incremented in the same
  guarded `UPDATE` that renews the heartbeat; abandonment's fence-increment, `GenerationStep` write,
  `finalizeGenerationRun` call, and Investigation status transition all execute inside ONE
  transaction (SOL-HIGH-2 fix — closing the interleaving window in which a replacement run could start
  and finish between separate finalize-then-transition calls). Every subsequent
  write by the original pipeline (`recordGenerationStep` and `finalizeGenerationRun`) checks the
  token and outcome it captured at run start and no-ops or is rejected once fenced out — the
  original process's writes become inert without needing to kill it. Full contract:
  `02-ARCHITECTURE.md` §1.6.
- **Migration `009` ships in C2-S2, not C2-S3.** `generation_run.lease_heartbeat_at` (read by
  `computeLivenessState`, §4.9) must exist before C2-S2's own Workspace Read Model can compute a
  real `livenessState` for pre-existing runs; migration `009` (§1.1's index plus §1.6's
  `fence_token`/`lease_heartbeat_at`/`heartbeat_revision` columns) is schema-only in C2-S2, with the fencing WRITE-GUARD
  logic that reads/writes `fence_token` remaining C2-S3's own scope. Full contract:
  `04-ROADMAP.md` C2-S2/C2-S3 Dependency Map.
- **`finalizeGenerationRun` is atomic.** The prior unguarded `SELECT`-then-`UPDATE` is replaced by
  one guarded `UPDATE ... WHERE outcome = 'in-progress' AND fence_token = $token`, checked row
  count, throwing `GenerationRunAlreadyFinalizedError` on loss. Seven of `generateBriefVersion`'s
  eight call sites treat this as a graceful no-op; the Phase-4 success call (immediately before
  `COMMIT`) rolls back its own transaction and rethrows instead, so a run that lost the race can
  never have its `BriefVersion` committed anyway. Migration `009` backfills any pre-existing
  stranded `'in-progress'` rows before creating its unique index.
- **US-13 eligibility is an exact persisted fact, ledgered from BOTH extraction passes' own real
  read sets, not an inferred timestamp bound or window (SELF-4).** A
  new join table, `generation_run_consumed_source`, records exactly which `source_artifact` rows
  each `GenerationRun` had the opportunity to consume — written at `generateBriefVersion.ts:479`
  (the same point the run's full evidence universe is known) from the UNION of
  `extractClaimsAndEvidence`'s own additive `usableSourceIds` return field (primary Extraction,
  captured at `:333`) AND `extractClaimsAndEvidenceForSourceArtifacts`'s identical additive field
  (Landscape Research's own second extraction pass, captured at `:393`) — NOT the primary set alone,
  since primary Extraction runs before Landscape Research even executes and so cannot see any
  landscape-research-origin source. A source incorporated only through landscape research would
  otherwise have no ledger row and could be resubmitted as new. Neither set is derived from the `EvidenceItem`-derived
  `universeSourceArtifactIds` — that omits any `'content-retrieved'` source that produced zero
  extracted evidence, which would otherwise stay "not yet consumed" forever — nor from an independent
  resolution-status read bounded by a `resolvedAt <= startedAt` timestamp comparison (a still-earlier
  draft's approach), which leaves a narrower gap open in the other direction. Using each extraction
  pass's own real `usableSourceIds`, unioned, closes all of these gaps at once, with no timestamp
  comparison at all: a source neither pass saw is never in the union, and a source either pass did
  see is always in it, regardless of when the ledger write itself executes. Existing, pre-migration
  rows with `NULL` canonical identity are backfilled in two separate steps: migration `013` itself is pure SQL and backfills only
  `resolved_content_hash` (fully — every `'content-retrieved'` row already has non-`NULL`
  `resolved_content`, so its hash is computable with no network call); `canonical_url`'s backfill is
  NOT part of migration `013` — it cannot be, since deriving it requires calling the real
  `canonicalizeUrl(raw)` helper, which a plain-SQL migration runner cannot execute. It is instead a
  separate, named, manually-run script (`src/db/scripts/backfill-013-canonical-url.ts`), run once,
  immediately after migration `013` applies, calling the real `canonicalizeUrl` helper directly
  against each pre-migration row's `raw` value. The disclosed degraded-case limitation is unchanged:
  a pre-migration row whose original `raw` was itself a redirect gets a `canonical_url` derived from
  that original, not final, post-redirect URL, since the true post-redirect value cannot be
  recovered without a live re-fetch this script does not perform.
  Eligibility itself is a plain anti-join against the current `BriefVersion`'s producing run's
  ledger rows — no boundary/window logic at read time, and no timestamp comparison anywhere in this
  mechanism. Full contract: `02-ARCHITECTURE.md` §4.8.
- **Canonical source identity/fingerprint is computed and persisted on EVERY write path that can
  create or resolve a `source_artifact` row, not just one (SOL-MEDIUM-1 correction).**
  `computeSourceResolution`'s own return type carries `canonicalUrl`/`resolvedContentHash` — the
  typed signature itself is the source of truth. `canonicalUrl` is derived from
  `ssrfGuardedFetch.ts`'s `FetchResult.finalUrl` — a new field this checkpoint adds, since the live
  type carries no URL field of any kind otherwise. `searchWeb.ts`'s own direct `source_artifact`
  insert (the landscape-research write path, independent of `resolveSourceArtifact`) now computes
  and persists both fields too, via the same shared `canonicalizeUrl` helper
  (`src/services/sourceCanonicalization.ts`) `computeSourceResolution` uses — closing the third of
  three write paths that would otherwise leave permanently `NULL` canonical identity for every
  landscape-research-origin row. Migration `013`'s own SQL matches its prose in full: all three
  additive columns (`canonical_url`, `resolved_content_hash`, `resolution_revision`) land in one
  `ALTER TABLE`, not two. Full contract: `02-ARCHITECTURE.md` §4.6a/§4.8.
- **Single-source recheck is atomic — and computation is separated from persistence (SOL-MEDIUM-2
  correction).** `resolveSourceArtifact.ts` is split into a non-persisting `computeSourceResolution` and the
  existing, unconditionally-persisting `resolveSourceArtifact` (unchanged for every existing
  caller); `recheckSourceArtifact` calls ONLY `computeSourceResolution`, then persists its own
  result with a compare-and-set `UPDATE ... WHERE id = $1 AND resolution_status = $read AND
  resolution_resolved_at = $read AND resolution_revision = $read` — but `resolution_revision` (a
  new, additive `resolution_revision INTEGER NOT NULL DEFAULT 0` column, migration `013`,
  incremented by every resolution write) is the actual, reliable guard, not the
  `resolution_status`/`resolution_resolved_at` equality checks retained alongside it: those two
  alone cannot reliably distinguish which of two racing writers actually won (two concurrent
  writers can converge on the identical `resolution_status`/`resolution_resolved_at` pair, or a
  `TIMESTAMPTZ` round-trip can leave `resolution_resolved_at` ambiguous between them), whereas
  `resolution_revision`'s per-write monotonic increment cannot collide between two genuinely
  concurrent writers. Without the compute/persist split, `resolveSourceArtifact`'s own internal unconditional write would land
  before the CAS guard evaluates, defeating it. Two concurrent recheck attempts against the same
  source can never race and have one silently overwrite the other's newly-resolved row. Full
  contract: `02-ARCHITECTURE.md` §1.4a.
- **Blank/whitespace-only submitted text OR fetched content is not evidence — and
  `MIN_CONTENT_LENGTH` is deleted, not re-sourced (HALT-1 correction, re-applying PR #11's
  already-settled fix after it was lost in this branch's reset).** `computeSourceResolution`'s
  `type === 'text'` branch resolves blank/whitespace-only `raw` content to `'reachable-no-content'`;
  the `type === 'url'` branch's own classification, previously gated on the self-certified,
  unsourced `PROVISIONAL` constant `MIN_CONTENT_LENGTH`, now uses the IDENTICAL
  `resolvedContent.trim().length === 0` check — no threshold, no number to source or own. Closes
  the gap where such a source could resolve `'content-retrieved'` and wrongly unlock US-13
  eligibility. This constant has two real live consumers, both fixed together:
  `resolveSourceArtifact.ts`'s own `computeSourceResolution`/`resolveUrl` logic, AND
  `classifyRetrievalOutcome.ts` (the Landscape Researcher's `searchWeb.ts` retrieval path), whose
  own `bodyLength < MIN_CONTENT_LENGTH` check becomes `bodyLength === 0`, with the removed
  paywall/login-wall/JS-render wording replaced by the corrected, disclaiming wording (measured and
  retracted per PR #11's historical record, `archive/pr-11-190f469-2026-09-05` branch — see
  §1.4b's "Measured, not asserted" note). Full contract: `02-ARCHITECTURE.md` §1.4b.
- **Region-4 (Provenance Rail) split — `SearchScopeNotice` is scoped to the displayed version's own
  producing run, not version-independent (SOL-MEDIUM-3 correction).** The Region-4 container
  (`CitationScopeNotice`/`RunHistoryList`/`TechnicalDisclosurePanel`) remains version-independent —
  all runs, regardless of which version is on screen — but `SearchScopeNotice`, like
  `EvidenceProvenanceList`, is scoped to whichever `BriefVersion` is currently displayed and updates
  on version navigation: a reader viewing an old Brief version sees the search scope that actually
  produced THAT version's evidence, never a later run's searches conflated with it. This closes
  Sol's real MEDIUM finding and must not regress a previously-gated Frank spec-gate finding on the
  same provenance-honesty question. `RunHistoryList` alone remains genuinely version-independent by
  design (every run across the Investigation, not just the producing one). Full contract:
  `03-UI-SPEC.md` Region-4 Component Hierarchy and Flow US-1 AC5 step 3.
- **DecisionHistoryBanner / compact notice binding.** The compact non-valid/supersession notice is
  bound to the currently DISPLAYED `BriefVersion` (never `workspace.briefs.find(isCurrent)`), and is
  rendered in `InvestigationIdentityHeader` (region 1), not in `DecisionHistoryBanner` (region 5) —
  so it is physically satisfiable as "never buried or require scrolling." `DecisionHistoryBanner`
  itself renders only the two chronological decision lists.
- **Concurrency-conflict lookup.** On a 23505 unique-violation, the connector's conflict lookup does
  not assume the conflicting run is still in-progress — it reads that run's real current outcome and
  reports `stillInProgress: boolean` accordingly, never dereferencing an empty `rows[0]`.
- **No synchronous 422 pipeline-outcome body.** `GenerationRunFailedResponseBody` does not exist as
  a synchronous response type — an endpoint that never awaits the pipeline cannot synchronously
  return the pipeline's outcome. `generateBriefVersion`'s `onRunCreated` parameter is optional and
  additive.
- **Create-path guard-decline branch.** A brand-new Investigation's `transitionInvestigationStatus`
  call returning `false` is always benign on the create path — `02-ARCHITECTURE.md` §3.1b steps 5-6.
- **`InvalidSupersedeTargetError` writes a real `GenerationStep`.** `generateBriefVersion.ts`'s
  preflight catch for this error class gains a `recordGenerationStep` call, matching its sibling
  `StaleCorrectionConflictError` catch's existing pattern — every typed error class now writes real,
  distinct reason text before finalizing (US-3 AC6).
- **Outcome/Status Panel precedence.** A five-rule (0-4), first-match-wins order
  (`02-ARCHITECTURE.md` §5.4): (0) a routed `:versionNumber` that fails to resolve renders Version
  Not Found, before any other rule; (1) an in-progress run on the CURRENT version renders
  `GenerationProgressPanel`, regardless of status; (2) viewing a prior version renders
  `ViewingPriorVersionPanel`, regardless of status and regardless of run outcome (including
  `'failed'` and `'in-progress'`) — no reachable variant while viewing a prior version ever mounts a
  control that mutates the current version's run; (3) otherwise, a failed run on the current version
  renders `GenerationFailedPanel`, except when `investigation.status === 'blocked'` (which renders
  Blocked instead, since the failure is a consequence of the blocked state, not a distinct
  generation failure); (4) otherwise, `investigation.status` selects the variant as the Sections
  table states. `03-UI-SPEC.md` and this document state the same order.
- **`priorDecisions` interim value.** `getBriefForReview` returns `priorDecisions: []`
  unconditionally in C2-S4 (before migration `010`/`getDecisionsForBriefVersion` exist) — a real,
  correct answer, not a placeholder; C2-S5 wires the real query in.
- **`recordDecision` transaction ordering — one order, stated once (SELF-2
  correction).** The transaction opens first; inside it, the `briefVersionId` existence check runs
  BEFORE Watch-condition validation (a request with both a nonexistent `briefVersionId` and a
  zero-condition Watch reports `404`, never `422`); Watch validation itself runs inside that same
  open transaction, never before it opens. Route-level malformed-body shape checks (400) remain
  entirely outside and before the transaction, as a distinct case. Every passage in both
  `02-ARCHITECTURE.md` and `04-ROADMAP.md` states this one order. Full contract:
  `02-ARCHITECTURE.md` §4.3.
- **Decision-submission refetch is a named, tested file responsibility, not an implicit consequence
  (SOL-MEDIUM-4 correction).** `InvestigationWorkspaceScreen.tsx`'s `onSubmitted`
  handler is the one place both refetches (`GET.../workspace` for `decisionLineage`,
  `GET.../brief-versions/by-version/:versionNumber` for `priorDecisions`) are issued, synchronously,
  on the `201` response — named explicitly in `04-ROADMAP.md` C2-S5's own Files list, with a
  required test proving both GETs happen and both lists update immediately after submission,
  WITHOUT navigation or reload (a test that only proves correctness after a reload would also be
  satisfied by a client-side optimistic append, which is not what this mechanism does). Full contract:
  `03-UI-SPEC.md` §"SOL-MEDIUM-4 fix — exact refetch mechanism", `04-ROADMAP.md` C2-S5.
- **Pipeline-modification boundary covers the fencing/canonical-identity correction (SELF-1
  correction).** `01-REQUIREMENTS.md`'s enumerated permitted-edit categories for
  `generateBriefVersion` and its internal call graph include a seventh category, scoped exactly
  to the guard-checked transactional wrapper (`assertFenceOwnership`) around
  `extractClaimsAndEvidence`, `landscapeResearcher`'s own extraction call, `searchWeb`, the
  consumed-source ledger insert, and `attemptGenerationFailedTransition`'s status write, plus the
  two additive return/persistence fields (`usableSourceIds` on the landscape extraction call,
  `canonicalUrl`/`resolvedContentHash` on `searchWeb`'s insert) those corrections require, keeping
  the roadmap and requirements documents in alignment. Full contract:
  `01-REQUIREMENTS.md` Out of Scope, exception category (7).

## Genuinely Open

- **Gate-record location for the cherry-picked truncation fixes.** The `llmClient.ts`/
  `searchWebAdapter.ts`/`ssrfGuardedFetch.ts` silent-truncation fixes (commits `9f3e150`,
  `2a5d847`, `c0c615e` from `fix/llm-and-resolver-constant-integrity`) are described in this
  document and in `docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md`'s § Interim
  disposition, but their own forge-gate history has not yet been recorded anywhere durable on this
  branch. Per this repo's own convention (`docs/development-workflow.md`, "gate record names the
  exact commit gated"), that history belongs in this branch's own eventual gating commit message or
  PR description when this recovery effort is committed — not left implicit in DDR-0002's prose
  alone.
- **Human confirmation.** Danny has not yet confirmed, in this session, that the rulings restated
  above faithfully state his actual decisions. Due at human approval.
- **Fresh gate required.** An independent reviewer (Sol, PR #8 comment 5553009192) reviewed this
  specification and BLOCKED on exactly eight findings — **three HIGH, five MEDIUM**:
  - SOL-HIGH-1 — the heartbeat/abandon race (a non-collision-free heartbeat CAS token could both
    false-positive and false-negative the abandon flow's authorization check).
  - SOL-HIGH-2 — unfenced writes (every pre-Phase-4 write path — evidence/claim writes, Landscape
    Research's own writes, the consumed-source ledger, `searchWeb`'s writes, and the
    Investigation-status write — could persist after the owning run was fenced out or terminal,
    including a retry-consumption race in which a subsequent retry could read a fenced-out or
    already-terminal run's stray writes).
  - SOL-HIGH-3 — an impossible C2-S1 demonstration (no component in that slice could render a
    `'content-retrieved'` source's own resolved status, so C2-S1's own Done-When could not close).
  - SOL-MEDIUM-1 — raw-input dedup (canonical source identity/fingerprint was specified only in
    prose against a typed signature that didn't carry it, and computed on only one of three write
    paths).
  - SOL-MEDIUM-2 — recheck-CAS collision (single-source recheck's existing compare-and-set guard
    was ambiguous, not absent — a `resolution_status`/`resolution_resolved_at`-only `UPDATE`'s
    `rowCount === 1` could not reliably identify the single winning writer in the identical-
    millisecond, identical-resolved-status case, letting two concurrent recheck attempts silently
    overwrite one another).
  - SOL-MEDIUM-3 — a Region-4 (Provenance Rail) version-scoping contradiction (`SearchScopeNotice`
    was grouped as version-independent, which would show a reader of an old Brief version a later
    run's search scope instead of the version's own producing run's).
  - SOL-MEDIUM-4 — an unwired two-list decision refetch mechanism (the exact refetch this checkpoint
    requires after a decision submission was not named as any file's own tested responsibility).
  - SOL-MEDIUM-5 — a Decision-404 mapping gap (`BriefVersionNotFoundError` was not disclosed as
    mapped 1:1 to the route's existing `404` response).

  All eight of Sol's real findings are corrected in the current `01`-`05` text (see the
  resolved-decision entries above, each naming its own SOL-finding number).

  This document also carries defects of its own, none of which are Sol's findings and none
  attributed to him:
  - SELF-1 — an untraceable pipeline-modification-boundary gap (`01-REQUIREMENTS.md`'s permitted-edit
    categories did not name the fencing/canonical-identity correction the roadmap required).
  - SELF-2 — mutually exclusive `recordDecision` transaction orderings stated in different passages
    of `02-ARCHITECTURE.md`, repeated in `04-ROADMAP.md`.
  - SELF-3 — an undisclosed transaction-scoping conflict in
    `extractClaimsAndEvidenceForSourceArtifacts`, where a naive application of the general
    `assertFenceOwnership`-first-statement rule would have held the `generation_run` row lock across
    an in-flight LLM call, blocking a concurrent abandon attempt for that call's duration. See
    `02-ARCHITECTURE.md` §1.6's SELF-3 correction and `04-ROADMAP.md`'s corresponding Files/Tests
    entries.
  - SELF-4 — US-13 eligibility's consumption ledger recorded only primary Extraction's
    `usableSourceIds`, omitting Landscape Research's own second extraction pass; a
    landscape-research-incorporated source had no ledger row and could be resubmitted as new. See
    the US-13 eligibility entry above and `02-ARCHITECTURE.md` §4.8's SELF-4 correction.

  A new Frank spec-gate pass against the current `01`-`05` text is required before this checkpoint
  is considered approved.
- **Real-run measurement.** `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` remain undetermined until Forge
  executes `02-ARCHITECTURE.md` §4.9's measurement methodology during C2-S3 — expected, in-scope
  Forge work, not a spec defect.
- **DDR-0002 restoration — RESOLVED.** `docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md`
  has been restored to this branch's `docs/decisions/`. The self-certification/`PROVISIONAL`-tag
  rule this checkpoint's §1.4b `MIN_CONTENT_LENGTH` fix relies on is now trackable from that file
  directly, not only from Danny's untracked personal global config.
- **`ssrfGuardedFetch.ts`'s three constants — RESOLVED, already applied on this branch, verified
  against live source (2026-09-06).** `FETCH_TIMEOUT_MS`, `MAX_RESPONSE_BYTES`, and `MAX_REDIRECTS`
  previously carried `owner: Ledger` — self-certification, the same disqualified pattern
  `MIN_CONTENT_LENGTH` had. C2-S1's edit pass removed the `owner: Ledger` text; no comment on this
  branch carries `PROVISIONAL` marker text of any kind any longer — each was rewritten to a
  different comment style entirely ("Unsourced — no mathematical, scientific, or programmatic
  precedent has been shown for [value] ... a label is not a citation (DDR-0002, ...)"), with no
  owner (and no replacement, not even "unassigned"). DDR-0002's Category B table (rows B3, B4, B5)
  already classifies all three as infrastructure/operational safety limits — connection timeout,
  response size cap, redirect hop cap — which bound resource consumption rather than gate evidence
  or correctness quality, so they require no citation and no owner. Revisit trigger is an observed
  operational incident, not a scheduled calibration. `MAX_RESPONSE_BYTES` remains Category B
  specifically because it still hard-rejects oversize responses
  (`src/services/ssrfGuardedFetch.ts:270-278`) rather than silently truncating them — confirmed live
  in this branch; if that ever changes to a truncation, DDR-0002 itself states it returns to
  Category A and requires a real measurement.
