# Progress: product-surface-checkpoint-2

## Status: IN_PROGRESS

## Slices
- [x] C2-S1: Fix Node 22 URL Resolution Defect — COMPLETE (2026-09-07). safeLookup widened to
      honor `options.all` on both IP-literal and DNS-resolution branches (fail-closed block check
      unchanged); `FetchResult.finalUrl` added (SOL-MEDIUM-1 fix, §4.6a). Node 22 instrumentation
      confirmed the custom `lookup` is NOT invoked for IP-literal hosts on this runtime — consistent
      with spec §4.6 G2, no conflict. 6 new tests (18 total, corrected from an initial miscounted
      claim of 26 — independently recounted and verified by @qc-agent). `npx tsc --noEmit` clean.
      QC PASS, all 7 review points independently verified against live diff/test run, not prior
      reports. Advisory: Test 1 needs live network egress to example.com; will fail in an
      egress-isolated CI runner — flag if that's ever the case.
- [x] C2-S2: Investigation Workspace Scaffold — COMPLETE (2026-09-07). Migrations 009/013,
      getInvestigationWorkspace/recheckSourceArtifact/sourceCanonicalization services,
      InvestigationWorkspaceScreen + SourceListPanel/BlockedSourcesPanel/AddSourceInline
      components. 2 real defects found and fixed during QC cycle: BlockedSourcesPanel wasn't
      rendering `reachable-no-content` sources (spec required it, minus the re-check control);
      recheckSourceArtifact ran status-recovery on the CAS loser path (Frank's binding verdict:
      gated to winner-only per §1.4a). CAS-race test rewritten with a genuine synchronization
      barrier (was an unsynchronized Promise.all). 386/391 tests passing (4 confirmed
      pre-existing failures in extractClaimsAndEvidence.test.ts/generateBriefVersion.test.ts,
      unrelated to this slice, independently reproduced in an isolated worktree at baseline).
      QC PASS, all 7 review points independently verified. Non-blocking note: CAS guard uses
      `IS NOT DISTINCT FROM` vs spec's literal `=` — safer, NULL-safe deviation.
      Backend verified end-to-end via real HTTP against real Postgres: content-retrieved and
      unreachable/blocked paths both confirmed with real persisted data; client bundle builds
      clean and the workspace route serves the correct SPA shell. **No headless-browser tool
      available in this environment — could not capture an actual rendered screenshot/click
      demonstration.** Backend+build verification is real end-to-end evidence but is not the
      full "real clicks, rendered screen" claim the roadmap's Browser Demonstration technically
      asks for; flagging honestly rather than overclaiming.
- [x] C2-S3: Generation Run Connector — COMPLETE (2026-09-07). Migration 012, fencing write-guards
      threaded through evidence/claim/landscape/searchWeb writes and the consumed-source ledger,
      non-blocking two-catch Generation Run Connector, abandonGenerationRun (full lock-ordering +
      heartbeat-revision race coverage), correction-scoped extraction, redesigned relative liveness
      detection (STALE_THRESHOLD_MS deleted entirely, no fixed threshold anywhere).
      Real, substantive defects found and fixed via the loop, not deferred:
      - Frank verdict: correction-attempt extraction ran whole-Investigation instead of
        candidate-scoped, producing the wrong disposition when old sources would yield evidence a
        candidate itself didn't — fixed to call the already-existing
        `extractClaimsAndEvidenceForSourceArtifacts`, typed `ExtractionOutcome` discriminator added.
      - benchmark audit: `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` were unsourced (wrong-instrument
        DB-latency proxy; a self-disclosed engineering guess). `POLL_INTERVAL_MS` re-measured
        against the real endpoint (2000ms). `STALE_THRESHOLD_MS` — orchestrator declined to spend
        real LLM API cost to measure it (a cost decision, not a technical judgment call) and chose
        branch (c) redesign instead: `computeLivenessState` now derives staleness relative to each
        run's own observed step cadence (`maxObservedGapMs × STALENESS_MULTIPLIER=4`, dimensionless
        ratio), cold-start always 'active'.
      - Frank verdict: migration 009 (C2-S2) made F-2's old two-concurrent-runs fixture impossible;
        rewritten to same-run/same-fence concurrency (the lock's real remaining job); new
        abandon-then-retry test proves the fence (not the lock) rejects stale writes — both
        destructively verified.
      - 3 rounds of QC FAIL → fix on test coverage completeness (11 initially-missing roadmap Tests
        items closed, including the entire previously-untested abandonGenerationRun flow) and one
        vacuous test (heartbeat-vs-abandon race test passed under the wrong code branch on its first
        two attempts; a real production test seam — `__setAbandonHeartbeatRaceDelayForTests`,
        no-op by default — was added and the test destructively re-verified).
      437/442 tests passing; 4 confirmed pre-existing failures (extractClaimsAndEvidence.test.ts
      real-LLM suite, generateBriefVersion.test.ts real-concurrency block) — QC's final review
      noted these sit in the same generation_run uniqueness/error-mapping area this slice touches
      and should be tracked as a real defect, not dismissed as unrelated noise. Not fixed this
      slice (predates it, out of C2-S3's own scope) — flagging for a future slice/ticket.
      QC PASS (3rd pass), all points independently re-verified against live diff/test execution.
- [x] C2-S4: Brief Review — COMPLETE (2026-09-08). Migration 011 (status_event, sequence tiebreak),
      getBriefForReview read service, BriefReviewPanel (7 sections + NegativeFindingNotice),
      ProvenanceRail (evidence provenance, SearchScopeNotice/CitationScopeNotice, RunHistoryList,
      TechnicalDisclosurePanel), version-numbered Brief navigation (route resolves versionNumber
      before calling the service, per roadmap's own discipline), ViewingPriorVersionPanel
      (structurally no mutating controls — imports neither AddSourceInline nor GenerateButton),
      correction-attempt UI wired to real eligibility. Sol's original SearchScopeNotice
      version-scoping finding closed at the data source (producingRun resolved from the displayed
      version's own generationRunId, not latestGenerationRun).
      One real bug found and fixed during the review loop: 3 new C2-S4 tests found 0 briefs/404
      where they expected real data — root cause was the tests only seeding
      `problem_brief.investigation_id`, never `investigation.problem_brief_id` (two independent
      link columns). QC specifically double-checked this against production code
      (generateBriefVersion.ts's real Phase 4 commit) and confirmed both are correctly set together
      in one transaction there — test-fixture gap only, no production exposure.
      477/482 tests passing, stable across 2 runs; 4 confirmed pre-existing failures (same as
      C2-S3, unrelated, tracked separately). QC PASS on first full pass, all 9 review points
      verified against live diff/test execution.
      Outstanding (not code-verifiable): the roadmap's browser demonstration bullets.
- [ ] C2-S5: Decision Recording and History — CODE/TESTS/QC COMPLETE, BROWSER DEMONSTRATION
      PENDING (2026-09-08). Migration 010
      (decision/reconsideration_condition, reject_update_or_delete immutability triggers),
      recordDecision (BriefVersionNotFoundError before Watch-condition validation, all inside one
      transaction), getDecisionsForBriefVersion (resolved-condition content, one-query aggregation),
      decisionLineage wired into getInvestigationWorkspace (distinct from getBriefForReview's
      per-version priorDecisions, never conflated), assignValidityState writer with in-transaction
      Step-0 target-existence/type validation (InvalidValidityTargetError, zero writes on miss),
      DecisionForm/DecisionConfirmationPanel/DecisionHistoryBanner (two never-merged lists),
      SOL-MEDIUM-4 dual-refetch mechanism (both GETs synchronous from the 201 handler, no
      optimistic append). One additional edit beyond the roadmap's own Files enumeration:
      getBriefForReview.ts wired to the real query (that file's own pre-existing code comment
      already named this as C2-S5's job; orchestrator verified the diff directly before accepting
      it, not a scope guess).
      Two orchestrator-diagnosed test-fixture defects fixed (not implementation bugs): a test
      violated the migration 010 immutability trigger via UPDATE instead of seeding a backdated
      INSERT; the US-13 five-item regression test's mocked extraction result lacked the real
      claim_version_evidence rows the ownership-verification check correctly requires — fixed per
      this repo's own established generateBriefVersion.test.ts seeding convention.
      QC FAIL (1st pass) on one gap: 04-ROADMAP.md:1983-1986's binding isolation requirement (no
      status_event write during a US-13 correction path; no eligibility check inside
      assignValidityState) had no test — code was already correct, the test was missing. Fixed,
      re-verified with file:line evidence, QC PASS (2nd pass).
      522/527 tests passing (1 skipped); 4 confirmed pre-existing baseline failures (same as
      C2-S3/C2-S4, unrelated, tracked separately).
      Browser demonstration: NOT YET PERFORMED this session — pending before Done-When can be
      checked complete; tracked separately, see Notes.
- [ ] **Frank binding forge-gate** — PENDING. Runs once, only after every slice above is checked
      off. Do not set `Status: COMPLETE` before this line is checked and its verdict is
      transcribed into this file's `## Forge Gate` section.

## Current
Slice: C2-S5
Step: Code/tests/QC APPROVED, committed (8932e41, unpushed). Browser demonstration BLOCKED —
attempted 2026-09-08: real Investigation c05a0e58… submitted (2 sources: 1 content-retrieved URL,
1 unreachable), real generation triggered, failed with `invalid_request_error: "Your credit
balance is too low to access the Anthropic API."` — an Anthropic account billing blocker, not a
code defect. Confirmed the Generation-Failed disclosure path itself worked correctly (honest
error, retry control, real technical-disclosure JSON, no fabricated progress) — this incidentally
satisfies part of the Checkpoint-level closing gate's Generation-Failed demonstration (§5 step 5),
but does not produce the real Brief C2-S5's own decision-recording demo needs. Danny chose to hold
off rather than top up credits or swap keys this session. Resume by clicking "Retry generation" on
Investigation c05a0e58… once credits are available, or submit fresh once ready.
Last updated: 2026-09-08

## Fix Attempts
| Test/File | Attempts | Last Error |
|-----------|----------|------------|

## Forge Gate
Counter: 0/3

| Attempt | Date | Verdict | Findings Summary | Snapshot |
|---|---|---|---|---|

Convergence judgment (attempt 3 only): —
Deep-diagnosis evidence: —
Orchestrator independent re-derivation: —

## Notes
- Branch: `feature/product-surface-checkpoint-2`, PR #13 (draft).
- Spec status: Approved (01-05, 2026-09-06/07, PR #12/#9 merged into main at 578da5c/c96f912).
- No GATE-LOG.md for this sprint — standing protocol, see `docs/CADENCE.md`. Gate history lives in
  this file's `## Forge Gate` section and in commit messages/PR description, not a separate file.
