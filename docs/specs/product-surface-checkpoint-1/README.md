# Product Surface — Checkpoint 1

Canonical implementation sources for this checkpoint (Mission Control, Departments directory,
Problem Department investigation portfolio). Locked, Frank spec-gate PASSED.

## Reading order

1. `01-REQUIREMENTS.md` — owns requirements: user stories, acceptance criteria, edge cases, scope
   boundary, constraints.
2. `02-ARCHITECTURE.md` — owns architecture: read models, SQL, Express routes, React/Vite
   integration boundary, dependency choices.
3. `03-UI-SPEC.md` — owns UI: screens, layouts, flows, interaction and state behavior.
4. `04-ROADMAP.md` — owns implementation sequence: slices, files, tests, done-when criteria.

## Tooling

`scripts/check-spec-count-literals.sh` (repo root) mechanically checks this package for stale
manually-restated counts (AC totals, story counts, etc.). Re-run it after editing any of the four
files above.

No additional tracking, narrative, or process Markdown belongs in this directory. Git history and
commit messages are the record of how this package reached its current state.
