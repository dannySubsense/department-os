# Progress: spec-doc-checker (lite forge)

## Status: IN_PROGRESS

## Slices
- [x] Slice 1: Core scaffolding (CLI, config parsing, discovery, suppression engine, JSON output/exit codes) — COMPLETE (69/69 tests, QC PASS on re-verification)
- [ ] Slice 2: Default-enabled rules (canonical-count, forbidden-literal, stray-artifact, required-files) — PENDING
- [ ] Slice 3: Disabled-by-default rules (required-status-reference, canonical-reference) — PENDING
- [ ] Slice 4: Full acceptance pass (remaining ACs, real-doc-set run) — PENDING

## Current
Slice: 1 COMPLETE, starting Slice 2
Step: Forge Advisor Final Check
Last updated: 2026-08-09

## Slice 1 Caveat (carries into Slice 2)
QC's re-verification PASS is scoped to scaffolding only: `RULE_REGISTRY` is empty by design,
so all suppression-engine tests used synthetic markers/allowlist entries, not real rule
findings. Suppression's interaction with actual rule output (spec ACs 14, 15, 18, 23 in their
full form) is unverified until Slice 2 populates the registry — re-test suppression behavior
against real violations once rules exist, don't assume Slice 1's PASS covers it.

## Fix Attempts
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| test_unreadable_target_directory_exit_2 | 1 | Uncaught PermissionError in config.py:406 propagates to exit 1 instead of intended exit 2 (fixed) |
| QC pass 1 (F1-F5) | 1 | Duplicate rule key silent last-write-wins; fabricated config line number on suppression-unused; version type unchecked; required_headings keys uncontained; exit-2 JSON stdout empty instead of valid empty-CheckerOutput object |

## Notes
- Spec: docs/tooling/spec-doc-checker.md (Status: LOCKED)
- Slice breakdown proposed by orchestrator (Ledger) and stated before Slice 1 began, per
  /forge-start --lite's requirement — not derived from a 04-ROADMAP.md (none exists for lite mode).
- Branch: forge-spec-doc-checker (off origin/main, includes merged PR #3 + PR #4)
