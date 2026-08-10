# Progress: spec-doc-checker (lite forge)

## Status: IN_PROGRESS

## Slices
- [x] Slice 1: Core scaffolding (CLI, config parsing, discovery, suppression engine, JSON output/exit codes) — COMPLETE (69/69 tests, QC PASS on re-verification)
- [x] Slice 2: Default-enabled rules (canonical-count, forbidden-literal, stray-artifact, required-files) — COMPLETE (131/131 tests, QC PASS on 5th re-verification)
- [x] Slice 3: Disabled-by-default rules (required-status-reference, canonical-reference) — COMPLETE (155/155 tests, QC PASS on 2nd re-verification)
- [ ] Slice 4: Full acceptance pass (remaining ACs, real-doc-set run) — PENDING

## Current
Slice: 3 COMPLETE, starting Slice 4
Step: Forge Advisor Final Check
Last updated: 2026-08-10

## Slice 1 Caveat — RESOLVED in Slice 2
Suppression-vs-real-rule-output was untested at Slice 1 close (RULE_REGISTRY empty by design).
Slice 2 populated the registry and exercised suppression against real violations (inline +
allowlist, default + --strict) — resolved, no longer an open caveat.

## Slice 2 Carry-Forward Note — RESOLVED in Slice 3
`set(RULES) ⊆ RULE_NAMES` assertion added and QC-verified load-bearing (probed with a typo'd
key, confirmed it actually raises).

## Slice 4 Carry-Forward Notes
- All six rules now registered — Slice 4's real-doc-set run (AC24) needs a config authored
  against `docs/specs/problem-department-mvp/` covering all six rules (four default-enabled +
  two explicitly invoked or enabled).
- Two non-blocking advisories from Slice 3 QC, confirmed consistent with existing precedent,
  no action required: `canonical-reference`'s `.md`-suffixed `target_reference` existence check
  uses `.exists()` without accounting for non-recursive discovery (same shape as `required-files`,
  already QC-approved in Slice 2); `cli.py`'s dead `continue` branch on a registry miss has a
  stale comment referencing the now-resolved Slice 1 empty-registry state (cosmetic only).

## Fix Attempts
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| test_unreadable_target_directory_exit_2 | 1 | Uncaught PermissionError in config.py:406 propagates to exit 1 instead of intended exit 2 (fixed) |
| QC pass 1 (F1-F5) | 1 | Duplicate rule key silent last-write-wins; fabricated config line number on suppression-unused; version type unchecked; required_headings keys uncontained; exit-2 JSON stdout empty instead of valid empty-CheckerOutput object |
| test_canonical_count_fail_malformed_fixture_ac4 | 1 | Fixture bug (not implementation): id_pattern `^AC-(\d*)\b` never matches "AC- empty..." line since \b fails between "-" and a following space (both non-word chars) |
| QC pass 1, Slice 2 (F1-F7) | 1 | F1: canonical-count only sees first regex match per line (needs finditer); F2: no-restated-match violation uses fabricated start_line=1 instead of 0; F3: AC3(a) fixture doesn't actually test restated-vs-restated-agreement-but-enumeration-disagreement; F4-F6: under-tested (enumerate-mode-ignores-restated_in, heading case-sensitivity, proximity boundary); F7: fixture-strategy non-compliance (file count, pass/fail pairing). Plus Danny-directed Section 6 spec clarification: required-files findings (line 0) are never allowlist-suppressible by design. |
| QC pass 2, Slice 2 (N1-N3) | 1 | N1 (blocking): restated_pattern compiled without re.MULTILINE, contradicting Section 3's normative regex contract; N2: F7 fixture pairing incomplete for canonical-count/pass and required-files/pass/missing-file; N3: stray-artifact still uses first-match-per-line (search), same class as F1 but unfixed there. |
| QC pass 3, Slice 2 (N4-N5) | 1 | N4: forbidden-literal under-counts same-line repeated occurrences, same class as N3 but unfixed in the sibling rule (occurrence-counting axis not swept across all four rules); N5: required_headings key not in files silently never checked, no diagnostic. Danny-directed Section 3/4.5 spec amendment: orphan required_headings key is now a config error, exit 2. |
| QC pass 4, Slice 2 (N6) | 1 | N6: circular import — models.py builds RULE_REGISTRY at module scope by importing rules.py, which imports models.py; `import spec_doc_checker.rules` directly fails with AttributeError. Invisible to all 126 tests since every test drives the CLI via subprocess, never imports the package directly. QC convergence judgment: rule-semantics axis (F1-N5) is closed, 7-3-2-1 findings per pass; N6 is a different, structural class. |
| QC pass 1, Slice 3 | 1 | canonical-reference's forbidden_restatement_pattern violation reports start_line/end_line=0 (file-level convention) but it's a real line-anchored finding, not a file-level fact — makes it unsuppressible via either mechanism, contradicting Section 6's line-0 carve-out which is exclusive to required-files. |

## Notes
- Spec: docs/tooling/spec-doc-checker.md (Status: LOCKED)
- Slice breakdown proposed by orchestrator (Ledger) and stated before Slice 1 began, per
  /forge-start --lite's requirement — not derived from a 04-ROADMAP.md (none exists for lite mode).
- Branch: forge-spec-doc-checker (off origin/main, includes merged PR #3 + PR #4)
