# Progress: product-surface-checkpoint-1

## Status: IN_PROGRESS

## Slices
- [x] Slice 1: Mission Control Shell (Full Data) — COMPLETE (2026-08-20). Automated gates PASS,
      294/294 tests, QC PASS (7/7 axes, 1 defect fixed), browser demonstration completed against
      real persisted local dev data (production build, port 8877, one seeded Investigation).
      Stopped here for Danny's product review per his explicit instruction — Slices 2/3 and the
      binding Frank forge-gate NOT yet run.
- [ ] Slice 2: Departments Directory Screen — PENDING (not started)
- [ ] Slice 3: Problem Department Overview Screen — PENDING (not started)
- [ ] **Frank binding forge-gate** — PENDING. Runs once, only after every slice above is checked
      off. Do not set `Status: COMPLETE` before this line is checked and its verdict is
      transcribed into `GATE-LOG.md`'s `## Forge Gate` section.

Per Danny's explicit instruction (2026-08-20): stop after Slice 1's Forge checks and browser
demonstration for his product review. Do not proceed to Slice 2 without his go-ahead.

## Current
Slice: 2 committed (b98a664). Browser demonstration surfaced one more real defect (missing CSS)
not caught by code-level QC — fixed, rebuilt, re-verified live. Awaiting Danny's re-review.
Step: none — stopped for Danny's product review per his instruction
Last updated: 2026-08-20

## Browser demonstration found a real defect QC's code review missed
ProblemDepartmentCard.tsx (Slice 1's original implementation) used classNames
(problem-department-card*) that had ZERO matching rules in styles.css — the whole card rendered
as unstyled default-blue underlined link text in the actual browser, even though QC's code-level
review (checking CSS token reuse claims) passed it. Only caught because the browser demonstration
requirement forces an actual rendered screenshot, not code inspection. Fixed with a scoped CSS-only
addition reusing existing tokens/patterns (`.work-group` card treatment, `.screen__title` heading
weight, `.active-work-groups` grid layout, `--color-active` for the affordance). Rebuilt, restarted,
re-screenshotted — genuinely styled now. This fix is UNCOMMITTED as of this note — needs its own
commit before session close.

## Slices
- [x] Slice 1: Mission Control Shell — COMPLETE (corrected, human product-gate PASS pending re-demo)
- [x] Slice 2: Problem Department Overview Screen — COMPLETE (QC PASS 9/9, 315/315 non-flaky tests)

## Slice 1 correction committed
0916081 on feature/problem-department-mvp, not pushed.

## Slice 2 — implementation + fix rounds
One pre-QC defect caught and fixed before test-writer even ran: InvestigationPortfolioTable's
last-active link reused the exact same "bare UUID as label" defect QC caught once on Mission
Control — fixed to match the established "View current status" pattern before it could recur
through the cycle. Test round found 3 failures: (1) App.test.tsx's api.js mock stale (missing
fetchProblemDepartmentOverview) — fixed; (2) getProblemDepartmentOverview.test.ts fixture bug (a
hardcoded past-dated GenerationRun timestamp couldn't actually be "most recent" against a
real-`now()` second investigation) — fixed, implementation was correct, only the test fixture was
wrong; (3) generateBriefVersion.test.ts's G(i)/G(ii) concurrency test — confirmed pre-existing
flakiness under system load (passes 3/3 in isolation, fails intermittently only in the full
45-file suite), unrelated to Slice 1/2 changes, not touched. Final full-suite state: 315/315
(non-flaky) tests passing.

## Slice 1 — Human product gate: FAIL then corrected
Danny FAILED Slice 1's IA on product grounds (planned-Department tiles dominated the page, PD not
actionable, installed/planned labels exposed, wrong nav). All 4 canonical docs revised (02 §0a
records his ruling verbatim), then Slice 1 corrected: ProblemDepartmentCard (live counts, dual
click-target+affordance, no install labels) replaces the Departments strip; nav is now Mission
Control / Problem Department; /departments route removed entirely. QC PASS (all 5 ruling items +
2 cross-checks verified against actual source, not reports). 302/302 tests. QC flagged the build
bundle is stale pre-correction — must rebuild before any browser demo. Roadmap resequenced to 2
slices; Slice 2 (Problem Department Overview) is now the direct target of the corrected card/link.
Danny's follow-up explicitly requires seeing the REAL destination screen, not the stub — so Slice
2 proceeds now, in the same session, before the next demo.

## Slice 1 — browser demonstration COMPLETE
Real dev-server run (production build, since port 3000/3001 were held by unrelated host processes;
ran on port 8877) against real local Postgres (deptos_core). One genuinely seeded Investigation
present — small dev-data footprint, honestly reported, not fabricated. Verified: Mission Control
renders styled per Visual Direction with real API data; installed/planned Departments honest;
4 groups correctly populated (1 investigation in Ready/Not Started, others honestly empty); no
fabricated activity; PersistentNav click-navigation confirmed via `performance.getEntriesByType
('navigation').length` staying at 1 across two client-side route changes (proves no full reload);
both not-yet-built routes render honest inline stubs, no 404/crash; loading state captured via
API-scoped network delay (isolated from asset load) showing "Loading Mission Control..." distinct
from the populated view; zero browser console errors. Operator intervention required: killed my
own stray dev-server processes, worked around two pre-existing unrelated processes already
holding ports 3000/3001 on this host (not killed — not mine to kill), installed Playwright
temporarily to drive/screenshot the browser (not added to package.json, temp-dir only).

## Slice 1 — @qc-agent re-verification PASS (7/7 axes)
Link-label defect fixed and confirmed. .gitignore scoped correctly. Other 6 axes undisturbed,
294/294 tests. Non-blocking observation carried forward for Frank's awareness: ActiveActivityPanel
renders a separate /investigations/{id} anchor with a bare-UUID label — not covered by any
requirement (different interaction than the spec'd "Last-Active Investigation Link"), not a defect.

## Slice 1 — @qc-agent: FAIL, 1 defect
6/7 compliance axes PASS (schema/query fidelity, data contract, Visual Direction incl. blocked-
while-Active alarm treatment, scope boundary, emptyOutDir judgment call, PersistentNav mount
discipline, inline stubs). 1 real defect: MissionControlScreen.tsx's last-active-Investigation
link renders the bare investigation id as its visible label, not honest wording naming the legacy/
current-view destination per 03-UI-SPEC.md § Interactions "Last-Active Investigation Link." Fix
attempt 1 of 3. Non-blocking observations: untracked build output not gitignored (worth adding
before commit); no dedicated test for blocked-while-Active (not required by roadmap, behavior
already correct).

## Slice 1 — @test-runner PASS (after fix)
294/294 tests passed, 1 skipped, 41/41 suites, 0 regressions. Fix confirmed: 3-file jest-dom
import defect resolved in 1 fix-attempt round (@code-executor). No coverage threshold configured
in this repo.

## Slice 1 — @test-runner: FAIL, 1 diagnosed defect
tsc --noEmit: PASS. Suite: 3/41 files crashed at setup (38 files / 282 tests pass, 0 individual
assertion failures, 0 regressions in existing Slice 1-9 tests). Root cause diagnosed directly:
src/client/{App,PersistentNav,MissionControlScreen}.test.tsx each `import '@testing-library/jest-dom'`
(plain entry, extends a global `expect` that doesn't exist since vitest.config.ts has no
`globals: true`) instead of `'@testing-library/jest-dom/vitest'` (the Vitest-specific entry that
uses the already-imported `expect` from 'vitest'). Fix attempt 1 of 3.

## Slice 1 — @test-writer complete
22 tests written across 6 files, all 15 roadmap-spec'd test cases mapped 1:1. test-writer had no
shell access this session and could not run the compile/smoke gate itself — @test-runner must run
`npm run lint` first and report any compile failures (test-writer's own flagged risk area:
`vi.mocked()` typings against the `vi.mock('./api.js', ...)` factory pattern).

## Slice 1 — @code-executor complete
All Files-list items created/edited. Automated QC (lint=tsc --noEmit, build=vite build) PASS.
Live smoke test: GET /api/mission-control returns 200 real JSON from local dev DB.
Judgment call worth carrying forward: vite.config.ts's emptyOutDir was set false (not the spec's
literal true) after it was found to delete pre-existing hand-authored files in src/web/public/ on
build — files restored, deviation commented inline in the file itself.

## Fix Attempts
| Test/File | Attempts | Last Error |
|-----------|----------|------------|

## Notes
- Git flow: PR/feature-branch repo. Per Danny's explicit consent (2026-08-20): commits land on
  the existing `feature/problem-department-mvp` branch (no new branch), no PR opened yet,
  manual-push-only maintained — ask before each push.
- Additional binding product-gate requirement (2026-08-20, beyond standard Forge controls): the
  slice cannot close on tests/typecheck/QC/static-scaffolding screenshots alone. Must run the app
  in a browser against real persisted data and provide captured browser evidence. Any operator
  intervention, mocked data, missing connection, or visual defect must be reported explicitly.
