# Interview: product-surface-checkpoint-1
**Status**: Passed (Danny opted out)
**Mechanism**: Inline (pass-option stand-in — no live channel this session; Danny explicitly
delegated judgment authority for this sprint, see `INTAKE.md` §6)
**Date**: 2026-08-19

## Seed Questions (gap-diff)

| # | Category | Question | Answer | Assumed? |
|---|---|---|---|---|
| 1 | non-functional | Which build tool for the new React SPA? | ASSUMED — Vite, based on `DESIGN-PROPOSAL.md` §11's own named example ("dev server e.g. Vite") and its status as the standard SPA-behind-Express dev-server pattern; no counter-indication anywhere in the repo. | yes |
| 2 | non-functional | Where does the new React source live in the repo tree? | ASSUMED — `src/client/`, sibling to the existing `src/services/`, `src/web/`, `src/db/` source directories, keeping SPA source separate from `src/web/public/` (build OUTPUT, per the existing `express.static` mount at `src/web/server.ts:22`) so source and built artifacts are never conflated. | yes |
| 3 | testing/rollback | What test coverage is required for the new read-model queries and React components this checkpoint? | ASSUMED — read models get the same discipline as existing services: each new query (`getMissionControlView`, `getDepartmentsView`, `getProblemDepartmentOverview`) gets a unit/integration test asserting its result matches real persisted rows, matching the pattern already established in `src/services/*.test.ts`. React components get render/basic-interaction tests only (e.g. React Testing Library) — no e2e framework is introduced this checkpoint; that decision is out of scope per `INTAKE.md` §5 and has no repo precedent to assume from. | yes |
| 4 | downstream impact | Does adding the new JSON API routes require any change to the existing Express app's error handling, CORS, or auth posture? | ASSUMED — no. No auth layer exists in Slices 1-9 (local-first, single-user, per `docs/vision.md`); the new routes inherit that same no-auth posture. No CORS configuration is needed because the SPA is served same-origin from the same Express app (`DESIGN-PROPOSAL.md` §11) — no cross-origin request is ever made by this checkpoint's design. | yes |
| 5 | edge cases | What renders when Problem Department has zero Investigations? | ASSUMED — an explicit empty state ("No investigations yet — Start Investigation"), never a blank or loading-styled screen, matching the compass's "no fake agent theater" discipline (`docs/product-architecture-and-direction.md` §6) applied symmetrically: honesty about absence is not exempt from the same discipline as honesty about presence. | yes |
| 6 | edge cases | What happens when a user targets a `planned` Department (Signal Foundry, Prototype Department, Creative Practice Engine)? | Already resolved, not assumed — `DESIGN-PROPOSAL.md` §3 states no click target is rendered at all for `planned` Departments (not a disabled-looking button). Folded back here per gap-diff's "already resolved in prior artifact" branch — no new decision made. | no |

## Adaptive Follow-ups

None triggered — each seed question above resolved in a single exchange (self-answered via stand-in) with no new thread opened; the interview_loop's 2-consecutive-non-generative-exchange stopping condition applies retroactively to this stand-in pass (no branch produced a follow-up-worthy new thread).

## Stopping Rationale

6 seed questions covering all four gap-diff categories (testing/rollback, non-functional, downstream impact, edge cases), 5 of which required a genuine stand-in decision and 1 of which was already resolved by the bound `DESIGN-PROPOSAL.md` and simply reconciled here. This sits within the 5-7 soft anchor with zero adaptive follow-ups needed — each answer was a closed, single-fact decision with no branching thread, so the loop reached its natural stop without needing the 2-non-generative-exchange counter to trigger. No `01-REQUIREMENTS.md`-relevant gap remains open.
