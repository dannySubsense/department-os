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
- **Generation run ownership: fencing, not timeout alone.** A silence-based `livenessState` is a
  display signal only — it never by itself authorizes the destructive "Abandon and retry" action.
  Ownership is enforced by a fencing token (`generation_run.fence_token`) plus an actively-renewed
  heartbeat (`lease_heartbeat_at`, renewed at every real `recordGenerationStep` call — including the
  seven made indirectly through `runStepWithProvenance`, which also carries the `fenceToken` field
  and threads it to its own two internal `recordGenerationStep` calls, so all eleven of
  `generateBriefVersion.ts`'s real `recordGenerationStep`-bearing progress-write call sites (three
  direct, one added to the `InvalidSupersedeTargetError` preflight catch, and seven via
  `runStepWithProvenance`) renew the heartbeat, not just its four direct callers). Abandon
  atomically increments the token only once the run is both non-`'active'` by the liveness check
  and still `'in-progress'`; every subsequent write by the original pipeline (`recordGenerationStep`
  and `finalizeGenerationRun`) checks the token it captured at run start and no-ops or is rejected
  once fenced out — the original process's writes become inert without needing to kill it. Full
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
  result with a compare-and-set `UPDATE ... WHERE id = $1 AND resolution_status = $read AND
  resolution_resolved_at = $read` (the actual, already-live columns — `source_artifact` has no
  `updated_at` column). Without this split, `resolveSourceArtifact`'s own internal unconditional
  write would land before the CAS guard evaluates, defeating it. Two concurrent recheck attempts
  against the same source can never race and have one silently overwrite the other's newly-resolved
  row. Full contract: `02-ARCHITECTURE.md` §1.4a.
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

## Genuinely Open

- **Human confirmation.** Danny has not yet confirmed, in this session, that the rulings restated
  above faithfully state his actual decisions. Due at human approval.
- **Fresh gate required.** This specification was materially revised (fencing-token generation
  ownership, exact-consumption US-13 eligibility, atomic single-source recheck, and a document-wide
  narrative cleanup) after its prior Frank spec-gate PASS, which was recorded against an earlier
  text and does not carry forward. A new Frank spec-gate pass against the current `01`-`04` is
  required before this checkpoint is considered approved.
- **Real-run measurement.** `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` remain undetermined until Forge
  executes `02-ARCHITECTURE.md` §4.9's measurement methodology during C2-S3 — expected, in-scope
  Forge work, not a spec defect.
