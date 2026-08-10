# Progress: spec-doc-checker (lite forge)

## Status: SLICES_COMPLETE — awaiting Frank binding forge-gate

## Slices
- [x] Slice 1: Core scaffolding (CLI, config parsing, discovery, suppression engine, JSON output/exit codes) — COMPLETE (69/69 tests, QC PASS on re-verification)
- [x] Slice 2: Default-enabled rules (canonical-count, forbidden-literal, stray-artifact, required-files) — COMPLETE (131/131 tests, QC PASS on 5th re-verification)
- [x] Slice 3: Disabled-by-default rules (required-status-reference, canonical-reference) — COMPLETE (155/155 tests, QC PASS on 2nd re-verification)
- [x] Slice 4: Full acceptance pass (AC1-23 audit, AC24 real-doc-set run) — COMPLETE (158/158 tests, QC PASS on 3rd re-verification)

## Current
Slice: 4 COMPLETE, all slices done
Step: Frank binding forge-gate (LANE: forge-gate)
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
| QC pass 1, Slice 4 | 1 | AC24's own PROGRESS.md record asserted "24 violations" for forbidden-literal but its own line-list enumeration was 23 (the enumeration was right, the header count drifted) — the exact manually-asserted-count-vs-enumeration defect class this tool exists to catch, landing in the tool's own acceptance record. Also: stale regression count (155 vs actual 158), and the AC1-23 audit had no PROGRESS entry at all. All three documentation-only, fixed directly. |

## AC24: Real Doc-Set Run

**Date:** 2026-08-10

**Config authored:** `docs/specs/problem-department-mvp/spec-doc-checker.yml` — five of the six
rules configured (`stray-artifact`, `forbidden-literal`, `required-files` from the
default-enabled tier; `required-status-reference` and `canonical-reference` from the
disabled-by-default tier, deliberately turned on for this run since both have real, applicable
checks against this doc set's own structure). `canonical-count` deliberately left unconfigured —
`01-REQUIREMENTS.md`'s Acceptance Criteria section enumerates items as unlabeled checklist bullets
under per-story headers (US-1..US-13), not individually-IDed items matching an `AC-NN`-style
scheme, so the rule's required single-capture-group `id_pattern` has no real per-item ID token to
bind to in this doc set; see the config file's header comment for the full rationale.

**Command run (JSON):**
```
python3 scripts/check-spec-docs.py docs/specs/problem-department-mvp/ --format json
```
Exit code: `1`. `files_checked=9`, `rules_run=[forbidden-literal, stray-artifact,
required-status-reference, required-files, canonical-reference]`, `violation_count=26`,
`suppressed_count=0`. `required-files` and `canonical-reference` both ran clean (zero violations
each) — no findings under either.

**Command run (text):**
```
python3 scripts/check-spec-docs.py docs/specs/problem-department-mvp/ --format text
```
Same exit code and violation set, human-readable form. Full output of both invocations is
reproducible from the command above against the committed config; not re-pasted verbatim here in
full — summarized by rule below with representative examples and every file/line reference.

**Violation breakdown (26 total, by rule):**

- `forbidden-literal` (23 violations) — every occurrence of `'problem-statement'` within 5 lines
  of `'NegativeFinding'` or `'negatable'`, across `02-ARCHITECTURE.md` (lines 534, 787, 950, 967,
  1050), `03-UI-SPEC.md` (312, 458), `04-ROADMAP.md` (276, 302, 630, 631, 691, 792, 1056),
  `05-REVIEW.md` (42, 68, 87, 92, 93, 281, 284), and `GATE-LOG.md` (9, 10). This is a genuine,
  expected result, not a tool bug: this doc set's entire spec sequence is organized around
  exhaustively documenting and re-verifying the "problem-statement made negatable" defect
  (GATE-LOG.md's PASS-2/PASS-3 history) — the two terms co-occur densely and correctly throughout,
  precisely because this doc set is the one the literal/proximity rule was modeled on. A tighter
  `proximity_lines` or narrower `forbidden_near` would suppress the density but wasn't attempted,
  since AC24's requirement is recording the real result, not tuning the config toward a clean run.

- `stray-artifact` (2 violations) — `05-REVIEW.md:105` and `05-REVIEW.md:109`, both matching the
  built-in `</content>` pattern. Verified by inspection: both are inside `05-REVIEW.md`'s own
  prose (Section "2c. Editing-artifact sweep") *describing* the artifact-sweep check it performed
  ("Searched all four live documents for ... `</content>` ... The only textual mention of
  `</content>` in the sprint directory is inside prior `05-REVIEW.md` prose describing the earlier
  defect") — not a leftover artifact itself. This is a legitimate, expected false positive of the
  kind Section 6's suppression mechanism exists for (a rule with no cross-line/semantic context
  cannot distinguish "the string appears" from "the string is being discussed"). Not suppressed in
  this run's config — recording the raw result was preferred over tuning it clean for AC24's
  purpose. Not a tool bug.

- `required-status-reference` (1 violation) — `review-confirms-intake-approved`:
  `05-REVIEW.md` does not contain a match for `INTAKE\.md.*APPROVED`. Verified by inspection:
  `05-REVIEW.md`'s only reference to Intake is its Scope line ("`**Scope**: INTAKE, INTERVIEW,
  NORTH-STAR, ...`"), which names the document but never asserts its approval status. This is a
  genuine finding, not a tool bug — `05-REVIEW.md` does not, in fact, contain the configured
  assertion.

**Tool-bug assessment:** none found. All 26 findings trace to real, verifiable string/proximity
matches per each rule's documented contract; the two findings judged not to (semantically) apply
here (`stray-artifact`'s 2 hits) are exactly the class of false positive the spec itself
anticipates for a context-free pattern rule (Section 4.3), not a defect in the implementation.

**Regression check:** `python3 -m pytest scripts/tests/ -v` — 158/158 passed as of Slice 4 close
(no implementation files touched by this AC; count reflects the full suite after the AC1-23 audit
below, not this AC's own isolated run).

## AC1-23 Completeness Audit

Independent pass over Section 7's AC1-23 (AC24 above), read directly against test source, mapping
each criterion to its covering test. Two gaps found and closed:
- **AC12** — no prior test validated the JSON schema on a single run producing both a non-empty
  `violations` list AND a non-empty `suppressed` list together (only "violations alone" and
  "clean" were schema-tested). Added `test_json_schema_run_with_violations_and_suppressions`
  (`test_spec_doc_checker_acceptance.py`).
- **AC15** — the only same-line-marker test was a synthetic parser-level unit test with no real
  rule finding; unlike AC14, there was no end-to-end proof a same-line marker suppresses a real
  violation and promotes back under `--strict`. Added
  `test_suppression_inline_same_line_marker_moves_real_violation_to_suppressed` and
  `..._strict_mode_promotes_back_to_failing` (`test_spec_doc_checker_rules.py`).

No implementation bugs found; all 21 other criteria (AC1-11, 13-14, 16-23) were already genuinely
covered. Full suite: 158/158 (155 + 3 new: 1 for AC12, 2 for AC15).

## Notes
- Spec: docs/tooling/spec-doc-checker.md (Status: LOCKED)
- Slice breakdown proposed by orchestrator (Ledger) and stated before Slice 1 began, per
  /forge-start --lite's requirement — not derived from a 04-ROADMAP.md (none exists for lite mode).
- Branch: forge-spec-doc-checker (off origin/main, includes merged PR #3 + PR #4)
