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
Slice: 1 COMPLETE, stopped for product review (Danny's explicit instruction)
Step: awaiting Danny's browser-visible product review before Slice 2
Last updated: 2026-08-20

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
