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
  for Danny to ratify, and no document asserts a specific numeric value for either. **Corrected
  2026-09-05 (Frank spec-gate finding F1):** if C2-S3's measured run sample is too thin to support
  a confident derivation, the value is recorded `PROVISIONAL — unvalidated`, owner Ledger, per
  `01-REQUIREMENTS.md`'s general rule — this document and `04-ROADMAP.md` previously forbade that
  fallback outright for these two constants specifically, contradicting `01`. The derivation
  methodology's own free parameters (minimum sample size, the percentile, the margin form, the
  poll-to-threshold relationship) must each be named explicitly at Forge time and be citable or
  `PROVISIONAL — unvalidated, owner Ledger` — not left as an unstated judgment call.
- **`MIN_CONTENT_LENGTH` is a disclosed, not newly-introduced, PROVISIONAL dependency of US-13.**
  US-13's eligibility gate for `type: 'url'` sources inherits the existing `resolveSourceArtifact.ts`
  constant `MIN_CONTENT_LENGTH = 200` (already `PROVISIONAL — unvalidated`, owner Ledger, hired as a
  paywall/JS-shell heuristic, never validated against real samples) as the deciding factor for
  whether a resubmitted URL counts as new evidence at all. Added 2026-09-05 (Frank spec-gate
  finding F2). **Danny's acceptance of continuing to rely on this existing PROVISIONAL value for
  this checkpoint (rather than blocking on a `benchmark`-agent validation pass first) is required
  at human approval**, alongside confirmation of the rest of this Resolved Decisions list. Full
  contract: `02-ARCHITECTURE.md` §4.8.
- **A producing run with zero consumed-source-ledger rows is not eligible.** `generation_run_consumed_source`
  (migration `012`) has no special-case rule for a `GenerationRun` whose ledger is empty at read
  time — added 2026-09-05 (Frank spec-gate finding F3) to close the gap where an unknown/empty
  ledger would otherwise make every `'content-retrieved'` submitted source look "new," incorrectly
  unlocking correction with zero new evidence. An empty ledger for the current `BriefVersion`'s
  producing run is treated as NOT eligible (the ledger's absence is not evidence of "no consumed
  sources," it is evidence the run predates or otherwise lacks ledger data) — not a hypothetical
  edge case skipped because the live count is 0 today. Full contract: `02-ARCHITECTURE.md` §3.5/§4.8.
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
- **Generation run ownership: fencing, not timeout alone.** A silence-based `livenessState` is a
  display signal only — it never by itself authorizes the destructive "Abandon and retry" action.
  Ownership is enforced by a fencing token (`generation_run.fence_token`) plus an actively-renewed
  heartbeat (`lease_heartbeat_at`, renewed at every real `recordGenerationStep` call — including the
  seven made indirectly through `runStepWithProvenance`, which also carries the `fenceToken` field
  and threads it to its own two internal `recordGenerationStep` calls, so all eleven of
  `generateBriefVersion.ts`'s real `recordGenerationStep`-bearing progress-write call sites (three
  direct, one added to the `InvalidSupersedeTargetError` preflight catch, and seven via
  `runStepWithProvenance`) renew the heartbeat, not just its four direct callers). Abandon
  eligibility and fence-increment are one atomic conditional `UPDATE`, gated on the exact
  `lease_heartbeat_at` value read at the stale-check — a heartbeat renewal racing the abandonment
  attempt causes `rowCount === 0` and a `409`, closing the read-then-act gap between staleness
  classification and fencing. Every pre-Phase-4 persistence path a running pipeline can reach
  (extraction, landscape/search persistence, the consumed-source ledger, `recordGenerationStep`,
  `finalizeGenerationRun`) is itself threaded with `generationRunId`/`fenceToken` via
  `beginFencedWrite`, checking the token immediately before commit and rejecting with
  `GenerationRunFencedOutError` once fenced out — so the original process's writes become genuinely
  inert once abandoned, not merely its two finalize/step-recording call sites. (An earlier revision
  of this document treated non-finalize writes as harmless because "accretive"; that was false
  against the live implementation — those writers have no run filter downstream and a retry would
  silently consume an abandoned run's output. Corrected 2026-09-05 per independent review.) Full
  contract: `02-ARCHITECTURE.md` §1.6.
- **Migration `009` ships in C2-S2, not C2-S3.** `generation_run.lease_heartbeat_at` (read by
  `computeLivenessState`, §4.9) must exist before C2-S2's own Workspace Read Model can compute a
  real `livenessState` for pre-existing runs; migration `009` (§1.1's index plus §1.6's
  `fence_token`/`lease_heartbeat_at` columns) is schema-only in C2-S2, with the fencing WRITE-GUARD
  logic that reads/writes `fence_token` remaining C2-S3's own scope. Full contract:
  `04-ROADMAP.md` C2-S2/C2-S3 Dependency Map.
- **`finalizeGenerationRun` is atomic.** The prior unguarded `SELECT`-then-`UPDATE` is replaced by
  one guarded `UPDATE ... WHERE outcome = 'in-progress' AND fence_token = $token`, checked row
  count, throwing `GenerationRunAlreadyFinalizedError` on loss. Seven of `generateBriefVersion`'s
  eight call sites treat this as a graceful no-op; the Phase-4 success call (immediately before
  `COMMIT`) rolls back its own transaction and rethrows instead, so a run that lost the race can
  never have its `BriefVersion` committed anyway. Migration `009` backfills any pre-existing
  stranded `'in-progress'` rows before creating its unique index.
- **US-13 eligibility is an exact persisted fact, ledgered from Extraction's own real read set, not
  an inferred timestamp bound or window.** A new join table, `generation_run_consumed_source`,
  records exactly which `source_artifact` rows each `GenerationRun` had the opportunity to
  consume — written at `generateBriefVersion.ts:479` (the same point the run's full evidence
  universe is known) from `extractClaimsAndEvidence`'s own additive `usableSourceIds` return field
  (`consideredSourceArtifactIds`, captured directly from Extraction's own actual read at `:333`, no
  new `getInvestigation` call), NOT from the `EvidenceItem`-derived `universeSourceArtifactIds` —
  the latter omits any `'content-retrieved'` source that produced zero extracted evidence, which
  would otherwise stay "not yet consumed" forever and unlock eligibility with zero new evidence
  added, including right after the very first successful generation. Writing at the earlier
  initial-snapshot point (`getEvidenceForInvestigation` at `:330`) is separately wrong: it is always
  empty on a first-ever run. An independent resolution-status read at `:479`, bounded by a
  `resolvedAt <= startedAt` timestamp comparison (a prior draft's approach), is also insufficient:
  it avoids recording a source resolved after the run started as falsely consumed, but leaves open a
  narrower gap in the other direction — a source that resolves in the window between the run's start
  and Extraction's own read at `:333` IS actually read and reflected in the current `BriefVersion`,
  yet a `startedAt`-only filter would exclude it from the ledger, leaving it falsely eligible for a
  redundant correction. Using Extraction's own real `usableSourceIds` closes both gaps at once,
  with no timestamp comparison at all: a source Extraction never saw is never in that set, and a
  source Extraction did see is always in it, regardless of when the ledger write itself executes.
  Eligibility itself is a plain anti-join against the current `BriefVersion`'s producing run's
  ledger rows — no boundary/window logic at read time, and no timestamp comparison anywhere in this
  mechanism. Full contract: `02-ARCHITECTURE.md` §4.8.
- **Single-source recheck is atomic — and computation is separated from persistence.**
  `resolveSourceArtifact.ts` is split into a non-persisting `computeSourceResolution` and the
  existing, unconditionally-persisting `resolveSourceArtifact` (unchanged for every existing
  caller); `recheckSourceArtifact` calls ONLY `computeSourceResolution`, then persists its own
  result with a compare-and-set `UPDATE ... WHERE id = $1 AND resolution_revision = $read`
  (migration `013`'s new monotonic column, incremented atomically by the same statement — corrected
  2026-09-05 per independent review: the `resolution_status`/`resolution_resolved_at` pair this
  bullet previously named as the CAS condition is NOT collision-free, since two identical
  concurrent writes can both report success under that pair; `resolution_revision` is the sole
  guard now). Without the compute/persist split, `resolveSourceArtifact`'s own internal
  unconditional write would land before the CAS guard evaluates, defeating it. Two concurrent
  recheck attempts against the same source can never race and have one silently overwrite the
  other's newly-resolved row. Full contract: `02-ARCHITECTURE.md` §1.4a.
- **Dedup ("new evidence") eligibility uses canonical identity and content fingerprint, never raw
  string equality.** `01-REQUIREMENTS.md`'s US-13 AC2 duplicate-source disqualifier is evaluated
  against `source_artifact.canonical_identity` (URL normalization, `type: 'url'` only) and
  `resolved_content_fingerprint` (`sha256(trim(resolvedContent))`, both types) — migration `014` —
  never against raw submitted string/URL text equality, which misses equivalent URLs, redirects, or
  matching resolved content under different raw text. Both columns are populated by
  `computeSourceResolution` (C2-S3's edit to `resolveSourceArtifact.ts`/`recheckSourceArtifact.ts`).
  Pre-migration rows are not backfilled and rely on the `id`-based anti-join alone (explicit,
  documented exemption, not an oversight — `02-ARCHITECTURE.md` §4.8). Corrected 2026-09-05 per
  independent review. Full contract: `02-ARCHITECTURE.md` §4.8.
- **Region 4 provenance is version-scoped for evidence, version-independent for run/search
  history — never uniformly either.** `EvidenceProvenanceList` re-fetches and renders the
  currently-displayed `BriefVersion`'s own evidence/provenance content, changing on version
  navigation; `SearchScopeNotice`, `CitationScopeNotice`, and `RunHistoryList` render the same
  whole-Investigation run/search history regardless of which version is displayed. Corrected
  2026-09-05 per independent review (a prior revision of this document's UI spec described Region 4
  as uniformly unchanged on navigation, which contradicted `EvidenceProvenanceList`'s own
  version-scoped binding elsewhere in the same document). Full contract: `03-UI-SPEC.md` Region 4.
- **A Decision against a nonexistent `BriefVersion` returns a typed 404, never a generic 500.**
  `recordDecision` performs a same-transaction existence check (`SELECT ... FOR UPDATE`) as its
  first statement after `BEGIN` and throws `BriefVersionNotFoundError` before any insert if the
  target `BriefVersion` does not exist; a foreign-key-violation backstop maps to the same error.
  The route returns `404 brief-version-not-found`. Corrected 2026-09-05 per independent review
  (this endpoint's declared 404 previously had no service-level mapping). Full contract:
  `02-ARCHITECTURE.md` §4.3.
- **A successful Decision submission triggers exactly two refetches — `priorDecisions` and
  `decisionLineage` are never constructed from the submission's own response.** After a real `201`
  `recordDecision` response, the UI refetches the workspace payload (populating
  `decisionLineage`) and the displayed version's Brief payload (populating `priorDecisions`) — the
  success response itself carries only `Decision` plus condition IDs, not resolved condition
  content, so neither list can be correctly built from it directly. Corrected 2026-09-05 per
  independent review. Full contract: `02-ARCHITECTURE.md` §5.2/§5.3, `03-UI-SPEC.md` Flow US-10.
- **Blank/whitespace-only submitted text is not evidence.** `computeSourceResolution`'s
  `type === 'text'` branch resolves blank/whitespace-only `raw` content to `'reachable-no-content'`,
  matching the `type === 'url'` branch's existing content-length guard — closing the gap where such
  a source could resolve `'content-retrieved'` and wrongly unlock US-13 eligibility. Full contract:
  `02-ARCHITECTURE.md` §1.4b.
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
- **C2-S1's browser demonstration is aggregate-only; per-source `resolutionStatus` is C2-S2's
  scope.** The Checkpoint-1 surface C2-S1 demonstrates against has no per-source view — only
  aggregate `sourceCount`/`evidenceCount`. C2-S1's Done-When claims only that aggregate resolution
  state, not an individual source's rendered `resolutionStatus`; that demonstration is C2-S2's own
  Done-When, via the new `SourcesList` subcomponent of `InvestigationIdentityHeader`. Corrected
  2026-09-05 per independent review (a prior revision of C2-S1's Done-When required a per-source
  browser result the Checkpoint-1 surface cannot produce). Full contract: `03-UI-SPEC.md`
  Checkpoint-1 surface capability boundary; `04-ROADMAP.md` C2-S1/C2-S2.

## Genuinely Open

- **Human confirmation.** Danny has not yet confirmed, in this session, that the rulings restated
  above faithfully state his actual decisions. Due at human approval.
- **Fresh gate required.** This specification was materially revised (fencing-token generation
  ownership, exact-consumption US-13 eligibility, atomic single-source recheck, canonical-identity/
  fingerprint dedup, the Region 4 version-scoping split, the Decision 404 mapping, the Decision
  dual-list refetch, and the C2-S1/C2-S2 browser-demonstration boundary, plus a document-wide
  narrative cleanup) after its prior Frank spec-gate PASS, which was recorded against an earlier
  text and does not carry forward. A new Frank spec-gate pass against the current `01`-`04`,
  inclusive of `03-UI-SPEC.md` (which received several of the above corrections directly), is
  required before this checkpoint is considered approved.
- **Real-run measurement.** `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` remain undetermined until Forge
  executes `02-ARCHITECTURE.md` §4.9's measurement methodology during C2-S3 — expected, in-scope
  Forge work, not a spec defect.
- **Pre-migration-`014` rows exempt from identity/fingerprint dedup.** `source_artifact` rows
  resolved before migration `014` runs carry `NULL` `canonical_identity`/
  `resolved_content_fingerprint` and are not backfilled (explicit decision, not oversight — see
  `02-ARCHITECTURE.md` §4.8) — they rely on the `id`-based anti-join alone. Acceptable because this
  narrows, rather than removes, an existing guarantee, and only for data that predates this
  correction; not something Forge needs to additionally address.
- **`SearchScopeNotice`'s version-independence and US-9 AC6 need one more look.**
  `SearchScopeNotice` (`03-UI-SPEC.md`) sources from `workspace.generationRuns` (whole-Investigation,
  version-independent) but US-9 AC6 requires it to render the queries actually performed for the
  Brief under review — when viewing a prior version after a later correction run, the notice would
  include that later run's queries. This is the same class of gap `02-ARCHITECTURE.md` §1.6 already
  discloses (deliberately, as a deferred, cosmetic provenance-attribution issue) for a related
  component; this document does not yet make the same disclosure for `SearchScopeNotice` against
  US-9 AC6 specifically. Needs an explicit ruling (accept as the same deferred class, or
  version-scope the component) before or at the fresh Frank gate — flagged here, not yet resolved.
