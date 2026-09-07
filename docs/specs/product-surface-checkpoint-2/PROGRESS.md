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
- [ ] C2-S3: Generation Run Connector — PENDING
- [ ] C2-S4: Brief Review — PENDING
- [ ] C2-S5: Decision Recording and History — PENDING
- [ ] **Frank binding forge-gate** — PENDING. Runs once, only after every slice above is checked
      off. Do not set `Status: COMPLETE` before this line is checked and its verdict is
      transcribed into this file's `## Forge Gate` section.

## Current
Slice: C2-S3
Step: not yet started
Last updated: 2026-09-07

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
