"""Slice 2 tests for the four default-enabled rules: canonical-count,
forbidden-literal, stray-artifact, required-files.

Maps to docs/tooling/spec-doc-checker.md Section 7 acceptance criteria 1-4,
21, 22, plus suppression end-to-end (inline + allowlist) against real rule
output, deferred by Slice 1 pending real violations.

Every fixture is a real temp directory with real .md files and a real
spec-doc-checker.yml, invoked via subprocess against the real CLI entry
point, following test_spec_doc_checker_acceptance.py's style.
"""

import json
import subprocess
import sys
from pathlib import Path

CHECKER = Path(__file__).resolve().parent.parent / "check-spec-docs.py"


def run_cli(args):
    return subprocess.run(
        [sys.executable, str(CHECKER)] + args,
        capture_output=True,
        text=True,
    )


# --- canonical-count (AC1-4) -----------------------------------------------


def test_canonical_count_enumerate_pass(tmp_path):
    (tmp_path / "REQ.md").write_text("AC-1 foo\nAC-2 bar\nAC-3 baz\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: true\n"
        "    checks:\n"
        "      - name: c1\n        mode: enumerate\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_canonical_count_duplicate_id_fail(tmp_path):
    # AC3(b) + AC4 distinguishability: canonical source itself has a
    # duplicate ID, independent of any compare.
    (tmp_path / "REQ.md").write_text("AC-1 foo\nAC-1 dup\nAC-2 bar\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: true\n"
        "    checks:\n"
        "      - name: c1\n        mode: enumerate\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    assert v["rule"] == "canonical-count"
    assert v["check_name"] == "c1"
    assert "duplicate" in v["message"]


def test_canonical_count_malformed_id_distinguishable_from_duplicate(tmp_path):
    # AC4: malformed ID (empty capture) produces a violation distinguishable
    # from a duplicate-ID violation.
    (tmp_path / "REQ.md").write_text("AC-1 foo\nAC- empty-capture\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: true\n"
        "    checks:\n"
        "      - name: c1\n        mode: enumerate\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d*)'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    assert "malformed" in v["message"]
    assert "duplicate" not in v["message"]


def test_canonical_count_compare_mismatch_when_restated_agrees_but_enum_disagrees(
    tmp_path,
):
    # AC3(a), discriminating property: ROADMAP.md and REVIEW.md both restate
    # "34" -- a naive same-declared-count comparison between the two
    # restatements would find agreement and pass. The canonical source has
    # one mislabeled duplicate ID (AC-33 appears twice: 34 ID-lines, 33
    # unique), so `mode: compare` against the real `enumerate` baseline (33)
    # must catch the mismatch against BOTH restatements independently.
    ac_lines = "\n".join(f"AC-{i}" for i in range(1, 34)) + "\nAC-33\n"  # 34 lines, 33 unique
    (tmp_path / "REQ.md").write_text(ac_lines)
    (tmp_path / "ROADMAP.md").write_text("This roadmap covers 34 acceptance criteria.\n")
    (tmp_path / "REVIEW.md").write_text("Sign-off confirms 34 acceptance criteria.\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: true\n"
        "    checks:\n"
        "      - name: c1\n        mode: compare\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
        "        restated_in:\n"
        "          - file: ROADMAP.md\n"
        "            restated_pattern: '(\\d+)\\s+acceptance criteria'\n"
        "          - file: REVIEW.md\n"
        "            restated_pattern: '(\\d+)\\s+acceptance criteria'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    # 1 duplicate-ID violation (AC-33 twice) + 2 restated-mismatch violations.
    assert len(out["violations"]) == 3

    # The genuine duplicate-ID violation's message starts with "duplicate ID
    # <id> in <path> on lines ..."; the two restated-mismatch violations'
    # messages start with "restated count '...' does not match ..." and only
    # *mention* duplicates in an appended parenthetical note, so a bare
    # "duplicate" substring check matches all three. Anchor on prefix.
    dup_violations = [
        v for v in out["violations"] if v["message"].startswith("duplicate ID ")
    ]
    assert len(dup_violations) == 1

    mismatch_violations = [
        v for v in out["violations"] if v["message"].startswith("restated count ")
    ]
    assert len(mismatch_violations) == 2
    assert set(v["path"] for v in mismatch_violations) == {"ROADMAP.md", "REVIEW.md"}
    for v in mismatch_violations:
        assert "restated count '34'" in v["message"]
        assert "enumerated" in v["message"] and "'33'" in v["message"]


def test_canonical_count_compare_pass(tmp_path):
    ac_lines = "\n".join(f"AC-{i}" for i in range(1, 4)) + "\n"  # 3 unique
    (tmp_path / "REQ.md").write_text(ac_lines)
    (tmp_path / "ROADMAP.md").write_text("This roadmap covers 3 acceptance criteria.\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: true\n"
        "    checks:\n"
        "      - name: c1\n        mode: compare\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
        "        restated_in:\n"
        "          - file: ROADMAP.md\n"
        "            restated_pattern: '(\\d+)\\s+acceptance criteria'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_canonical_count_enumerate_mode_ignores_restated_in_if_present(tmp_path):
    # F4 / Section 4.1: "there is no default mode and no mode inferred from
    # the presence/absence of restated_in." A `mode: enumerate` check with a
    # `restated_in` list present must NOT perform any comparison -- only
    # enumeration-level findings (duplicates/malformed) are reported. Here
    # the canonical source enumerates cleanly (3 unique, no dupes/malformed)
    # but the (ignored) restated_in points at a file restating a wrong
    # count. If restated_in's mere presence silently triggered comparison,
    # this would fail with a mismatch violation; because mode is enumerate,
    # it must pass with zero violations.
    (tmp_path / "REQ.md").write_text("AC-1 foo\nAC-2 bar\nAC-3 baz\n")
    (tmp_path / "ROADMAP.md").write_text("This roadmap covers 999 acceptance criteria.\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: true\n"
        "    checks:\n"
        "      - name: c1\n        mode: enumerate\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
        "        restated_in:\n"
        "          - file: ROADMAP.md\n"
        "            restated_pattern: '(\\d+)\\s+acceptance criteria'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_canonical_count_restated_pattern_matches_on_non_first_line_pass(tmp_path):
    # Regression (N1): restated_pattern is compiled against the restating
    # file's WHOLE TEXT. Without re.MULTILINE, a line-anchored pattern
    # ('^...') only matches at absolute position 0 of the string, so a
    # correct restated count sitting on a later line was invisible --
    # matches=[] triggered the "no match found" violation branch even
    # though the restatement was present and correct. With MULTILINE, '^'
    # also anchors after each newline, so the line-3 match is found and the
    # (agreeing) count passes cleanly.
    ac_lines = "\n".join(f"AC-{i}" for i in range(1, 4)) + "\n"  # 3 unique
    (tmp_path / "REQ.md").write_text(ac_lines)
    (tmp_path / "ROADMAP.md").write_text(
        "Roadmap overview\nSome preceding prose line\n3 acceptance criteria\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: true\n"
        "    checks:\n"
        "      - name: c1\n        mode: compare\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
        "        restated_in:\n"
        "          - file: ROADMAP.md\n"
        "            restated_pattern: '^(\\d+)\\s+acceptance criteria'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_canonical_count_restated_pattern_multiline_detects_mismatch_on_non_first_line(
    tmp_path,
):
    # Regression (N1), mismatch case: restated line is NOT the first line of
    # the restating file, and it genuinely disagrees with the enumerated
    # count. Pre-fix, the line-anchored '^' pattern (no re.MULTILINE) would
    # never match a non-first line at all, so this would have been
    # misreported as "restated_pattern found no match" -- a different,
    # weaker finding that masks the real mismatch. Post-fix, MULTILINE lets
    # '^' match at the start of line 3, the match is found, and the actual
    # count disagreement (5 vs enumerated 3) is correctly detected.
    ac_lines = "\n".join(f"AC-{i}" for i in range(1, 4)) + "\n"  # 3 unique
    (tmp_path / "REQ.md").write_text(ac_lines)
    (tmp_path / "ROADMAP.md").write_text(
        "Roadmap overview\nSome preceding prose line\n5 acceptance criteria\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: true\n"
        "    checks:\n"
        "      - name: c1\n        mode: compare\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
        "        restated_in:\n"
        "          - file: ROADMAP.md\n"
        "            restated_pattern: '^(\\d+)\\s+acceptance criteria'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    # Must be the real mismatch finding, not the "no match found" fallback
    # that pre-fix code would have produced for a non-first-line match.
    assert v["message"].startswith("restated count '5'")
    assert "enumerated" in v["message"] and "'3'" in v["message"]


# --- forbidden-literal -------------------------------------------------------


def test_forbidden_literal_proximity_fail(tmp_path):
    (tmp_path / "A.md").write_text(
        "line1\nproblem-statement here\nline3\nnegatable nearby\nline5\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'problem-statement'\n"
        "        forbidden_near: ['negatable']\n"
        "        proximity_lines: 5\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    assert v["rule"] == "forbidden-literal"
    assert v["check_name"] is None
    assert v["start_line"] == 2


def test_forbidden_literal_out_of_proximity_pass(tmp_path):
    lines = ["problem-statement here"] + [f"filler {i}" for i in range(10)] + ["negatable nearby"]
    (tmp_path / "A.md").write_text("\n".join(lines) + "\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'problem-statement'\n"
        "        forbidden_near: ['negatable']\n"
        "        proximity_lines: 2\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_forbidden_literal_proximity_boundary_exact_lines_above_fail(tmp_path):
    # F6(a): forbidden_near exactly proximity_lines ABOVE the literal is
    # still within the inclusive window -- must be a violation.
    proximity_lines = 2
    lines = ["negatable marker", "filler 1", "problem-statement here"]
    (tmp_path / "A.md").write_text("\n".join(lines) + "\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'problem-statement'\n"
        "        forbidden_near: ['negatable']\n"
        f"        proximity_lines: {proximity_lines}\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1


def test_forbidden_literal_proximity_boundary_exact_lines_below_fail(tmp_path):
    # F6(b): forbidden_near exactly proximity_lines BELOW the literal is
    # still within the inclusive window -- must be a violation.
    proximity_lines = 2
    lines = ["problem-statement here", "filler 1", "negatable marker"]
    (tmp_path / "A.md").write_text("\n".join(lines) + "\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'problem-statement'\n"
        "        forbidden_near: ['negatable']\n"
        f"        proximity_lines: {proximity_lines}\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1


def test_forbidden_literal_proximity_boundary_one_line_beyond_pass(tmp_path):
    # F6(c): forbidden_near exactly proximity_lines + 1 away (either
    # direction) confirms the boundary is real, not accidentally wider.
    # Above direction: 3 lines away when proximity_lines is 2.
    proximity_lines = 2
    lines = ["negatable marker", "filler 1", "filler 2", "problem-statement here"]
    (tmp_path / "A.md").write_text("\n".join(lines) + "\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'problem-statement'\n"
        "        forbidden_near: ['negatable']\n"
        f"        proximity_lines: {proximity_lines}\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_forbidden_literal_proximity_boundary_one_line_beyond_below_pass(tmp_path):
    # F6(c), below direction: 3 lines away when proximity_lines is 2.
    proximity_lines = 2
    lines = ["problem-statement here", "filler 1", "filler 2", "negatable marker"]
    (tmp_path / "A.md").write_text("\n".join(lines) + "\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'problem-statement'\n"
        "        forbidden_near: ['negatable']\n"
        f"        proximity_lines: {proximity_lines}\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_forbidden_literal_global_ban_fail(tmp_path):
    (tmp_path / "A.md").write_text("has TODO-REMOVE-BEFORE-LOCK in it\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'TODO-REMOVE-BEFORE-LOCK'\n"
        "        forbidden_near: []\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "global ban" in out["violations"][0]["message"]


def test_forbidden_literal_global_ban_pass(tmp_path):
    (tmp_path / "A.md").write_text("clean content, no forbidden text\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'TODO-REMOVE-BEFORE-LOCK'\n"
        "        forbidden_near: []\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0


def test_forbidden_literal_same_line_repeated_literal_global_ban_counts_each_occurrence(
    tmp_path,
):
    # Regression (N4): a single line containing the same forbidden literal
    # twice (global ban, forbidden_near: []) must yield TWO violations, not
    # one. Pre-fix, only a single `literal not in line` presence check was
    # done per line.
    (tmp_path / "A.md").write_text(
        "TODO-REMOVE-BEFORE-LOCK and also TODO-REMOVE-BEFORE-LOCK again\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'TODO-REMOVE-BEFORE-LOCK'\n"
        "        forbidden_near: []\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 2
    for v in out["violations"]:
        assert v["rule"] == "forbidden-literal"
        assert v["start_line"] == 1
        assert v["end_line"] == 1


def test_forbidden_literal_same_line_repeated_literal_proximity_counts_each_occurrence(
    tmp_path,
):
    # Same regression (N4), proximity-scoped variant: two occurrences of
    # `literal` on one line, each within proximity of `forbidden_near`, must
    # yield TWO violations.
    (tmp_path / "A.md").write_text(
        "problem-statement here and problem-statement again near negatable\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'problem-statement'\n"
        "        forbidden_near: ['negatable']\n"
        "        proximity_lines: 2\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 2
    for v in out["violations"]:
        assert v["rule"] == "forbidden-literal"
        assert v["start_line"] == 1
        assert v["end_line"] == 1


def test_forbidden_literal_missing_proximity_lines_config_error(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n"
        "      - literal: 'x'\n        forbidden_near: ['y']\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2


# --- stray-artifact (AC21, AC22) ---------------------------------------------


def test_stray_artifact_builtin_content_marker_fail(tmp_path):
    (tmp_path / "A.md").write_text("some text\n</content>\nmore\n")
    result = run_cli([str(tmp_path), "--format", "json"])  # built-in defaults
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    assert v["rule"] == "stray-artifact"
    assert v["start_line"] == 2


def test_stray_artifact_clean_pass(tmp_path):
    (tmp_path / "A.md").write_text("ordinary content, nothing stray\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0


def test_stray_artifact_no_bare_equals_pattern_ac21(tmp_path):
    # Setext heading underline must NOT be flagged.
    (tmp_path / "A.md").write_text("Heading\n=======\nbody text\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_stray_artifact_conflict_markers_still_flagged_ac21(tmp_path):
    (tmp_path / "A.md").write_text(
        "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    rules_hit = [v["rule"] for v in out["violations"]]
    assert rules_hit.count("stray-artifact") == 2  # <<<<<<< and >>>>>>> lines only


def test_stray_artifact_builtin_patterns_false_ac22(tmp_path):
    (tmp_path / "A.md").write_text("has </content> and CUSTOM_MARKER too\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  stray-artifact:\n    enabled: true\n"
        "    builtin_patterns: false\n"
        "    patterns:\n      - 'CUSTOM_MARKER'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "CUSTOM_MARKER" in out["violations"][0]["message"]


def test_stray_artifact_same_line_repeated_pattern_counts_each_occurrence(tmp_path):
    # Regression (N3): a single line containing the same stray-artifact
    # pattern twice must yield TWO violations, not one. Pre-fix, only the
    # first occurrence per line was counted (a single match/search per
    # line); post-fix, every occurrence is collected via finditer and
    # reported independently.
    (tmp_path / "A.md").write_text(
        "some text\n</content> middle stuff </content>\nmore\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])  # built-in defaults
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 2
    for v in out["violations"]:
        assert v["rule"] == "stray-artifact"
        assert v["start_line"] == 2
        assert v["end_line"] == 2


# --- required-files -----------------------------------------------------------


def test_required_files_missing_file_fail(tmp_path):
    (tmp_path / "01-REQUIREMENTS.md").write_text("# Requirements\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['01-REQUIREMENTS.md', '02-ARCHITECTURE.md']\n"
        "    heading_match: exact\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    assert v["rule"] == "required-files"
    assert v["path"] == "02-ARCHITECTURE.md"
    assert v["start_line"] == 0
    assert v["end_line"] == 0


def test_required_files_present_pass(tmp_path):
    (tmp_path / "01-REQUIREMENTS.md").write_text("# Requirements\n")
    (tmp_path / "02-ARCHITECTURE.md").write_text("# Architecture\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['01-REQUIREMENTS.md', '02-ARCHITECTURE.md']\n"
        "    heading_match: exact\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0


def test_required_files_missing_heading_fail(tmp_path):
    (tmp_path / "01-REQUIREMENTS.md").write_text(
        "# Requirements\n\n## Acceptance Criteria\n\nsome text\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['01-REQUIREMENTS.md']\n"
        "    required_headings:\n"
        "      '01-REQUIREMENTS.md': ['Acceptance Criteria', 'Out of Scope']\n"
        "    heading_match: exact\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "Out of Scope" in out["violations"][0]["message"]


def test_required_files_all_headings_present_pass(tmp_path):
    (tmp_path / "01-REQUIREMENTS.md").write_text(
        "# Requirements\n\n## Acceptance Criteria\n\ntext\n\n## Out of Scope\n\ntext\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['01-REQUIREMENTS.md']\n"
        "    required_headings:\n"
        "      '01-REQUIREMENTS.md': ['Acceptance Criteria', 'Out of Scope']\n"
        "    heading_match: exact\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0


def test_required_files_heading_match_case_sensitive_fail(tmp_path):
    # F5(a): heading_match "exact" is case-sensitive. A heading differing
    # only in case from the required text must still be a violation.
    (tmp_path / "01-REQUIREMENTS.md").write_text(
        "# Requirements\n\n## out of scope\n\nsome text\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['01-REQUIREMENTS.md']\n"
        "    required_headings:\n"
        "      '01-REQUIREMENTS.md': ['Out of Scope']\n"
        "    heading_match: exact\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "Out of Scope" in out["violations"][0]["message"]


def test_required_files_heading_match_exact_not_substring_fail(tmp_path):
    # F5(b): "exact" means exact string match, not substring/fuzzy. A
    # heading that is a superset/different from the required text must
    # still be a violation.
    (tmp_path / "01-REQUIREMENTS.md").write_text(
        "# Requirements\n\n## Out of Scope and Assumptions\n\nsome text\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['01-REQUIREMENTS.md']\n"
        "    required_headings:\n"
        "      '01-REQUIREMENTS.md': ['Scope']\n"
        "    heading_match: exact\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "Scope" in out["violations"][0]["message"]


def test_required_files_orphan_required_headings_key_config_error(tmp_path):
    # N5: a required_headings key naming a file NOT in `files` is a
    # config-load-time error (exit code 2), identifying the offending
    # orphan key -- not silently unreachable at rule-runtime.
    (tmp_path / "01-REQUIREMENTS.md").write_text("# Requirements\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['01-REQUIREMENTS.md']\n"
        "    required_headings:\n"
        "      '02-ARCHITECTURE.md': ['Overview']\n"
        "    heading_match: exact\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    # F5-style contract: JSON mode still emits the valid empty CheckerOutput
    # object to stdout even on a config-load-time error.
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert out["suppressed"] == []
    assert "02-ARCHITECTURE.md" in result.stderr


def test_required_files_multiple_orphan_required_headings_keys_config_error(tmp_path):
    # Confirms behavior when multiple orphan keys exist: the config error
    # reports all offending keys, not just the first.
    (tmp_path / "01-REQUIREMENTS.md").write_text("# Requirements\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['01-REQUIREMENTS.md']\n"
        "    required_headings:\n"
        "      '02-ARCHITECTURE.md': ['Overview']\n"
        "      '04-ROADMAP.md': ['Slices']\n"
        "    heading_match: exact\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert "02-ARCHITECTURE.md" in result.stderr
    assert "04-ROADMAP.md" in result.stderr


# --- required-files + suppression-limitation (Section 6 revision note 4) ----


def test_required_files_missing_file_finding_unsuppressible_by_allowlist(tmp_path):
    # Section 6, "Suppression and required-files file-level findings": a
    # required-files file-level finding (start_line: 0, end_line: 0) cannot
    # be suppressed by the config-file allowlist because line_range must be
    # a real, 1-indexed range with start >= 1. An allowlist entry attempting
    # to suppress it (using a guessed line_range like [1, 1]) never actually
    # suppresses the finding: the original violation still fires
    # (unsuppressed) AND a suppression-unused violation also fires for the
    # ineffective allowlist entry.
    (tmp_path / "01-REQUIREMENTS.md").write_text("# Requirements\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['01-REQUIREMENTS.md', '02-ARCHITECTURE.md']\n"
        "    heading_match: exact\n"
        "suppression_allowlist:\n"
        "  - rule: 'required-files'\n    file: '02-ARCHITECTURE.md'\n"
        "    line_range: [1, 1]\n    reason: 'attempt to suppress missing-file finding'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)

    required_files_violations = [
        v for v in out["violations"] if v["rule"] == "required-files"
    ]
    assert len(required_files_violations) == 1
    assert required_files_violations[0]["path"] == "02-ARCHITECTURE.md"
    assert required_files_violations[0]["start_line"] == 0

    unused_violations = [
        v for v in out["violations"] if v["rule"] == "suppression-unused"
    ]
    assert len(unused_violations) == 1

    assert out["suppressed"] == []


# --- End-to-end suppression against real rule violations --------------------


def test_suppression_inline_default_mode_moves_real_violation_to_suppressed(tmp_path):
    (tmp_path / "A.md").write_text(
        'text\n<!-- spec-doc-checker: ignore stray-artifact reason="known false positive" -->\n</content>\n'
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0  # suppressed, non-blocking in default mode
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert len(out["suppressed"]) == 1
    s = out["suppressed"][0]
    assert s["rule"] == "stray-artifact"
    assert s["suppression_source"] == "inline"
    assert s["suppression_reason"] == "known false positive"


def test_suppression_inline_strict_mode_promotes_back_to_failing(tmp_path):
    (tmp_path / "A.md").write_text(
        'text\n<!-- spec-doc-checker: ignore stray-artifact reason="known false positive" -->\n</content>\n'
    )
    result = run_cli([str(tmp_path), "--format", "json", "--strict"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert len(out["suppressed"]) == 1


def test_suppression_allowlist_suppresses_real_violation(tmp_path):
    (tmp_path / "A.md").write_text("text\n</content>\nmore\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  stray-artifact:\n    enabled: true\n"
        "    builtin_patterns: true\n    patterns: []\n"
        "suppression_allowlist:\n"
        "  - rule: 'stray-artifact'\n    file: 'A.md'\n"
        "    line_range: [2, 2]\n    reason: 'known tool-output leftover'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert len(out["suppressed"]) == 1
    s = out["suppressed"][0]
    assert s["suppression_source"] == "allowlist"
    assert s["suppression_reason"] == "known tool-output leftover"


def test_suppression_allowlist_strict_mode_promotes_back_to_failing(tmp_path):
    (tmp_path / "A.md").write_text("text\n</content>\nmore\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  stray-artifact:\n    enabled: true\n"
        "    builtin_patterns: true\n    patterns: []\n"
        "suppression_allowlist:\n"
        "  - rule: 'stray-artifact'\n    file: 'A.md'\n"
        "    line_range: [2, 2]\n    reason: 'known tool-output leftover'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json", "--strict"])
    assert result.returncode == 1


# --- required-status-reference (Slice 3, Section 4.4) -----------------------


def test_required_status_reference_pass_pattern_found(tmp_path):
    (tmp_path / "INTAKE.md").write_text("**Status**: APPROVED\n")
    (tmp_path / "05-REVIEW.md").write_text(
        "Review confirms INTAKE.md is APPROVED.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-status-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        source: 05-REVIEW.md\n"
        "        target: INTAKE.md\n"
        "        pattern: 'INTAKE\\.md.*APPROVED'\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "required-status-reference", "--format", "json"]
    )
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_required_status_reference_fail_pattern_missing(tmp_path):
    (tmp_path / "INTAKE.md").write_text("**Status**: APPROVED\n")
    (tmp_path / "05-REVIEW.md").write_text("Review is complete.\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-status-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        source: 05-REVIEW.md\n"
        "        target: INTAKE.md\n"
        "        pattern: 'INTAKE\\.md.*APPROVED'\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "required-status-reference", "--format", "json"]
    )
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    assert v["rule"] == "required-status-reference"
    assert v["check_name"] == "c1"
    assert v["path"] == "05-REVIEW.md"
    # The message must only assert that `source` lacks the configured
    # pattern -- never that `target`'s actual status is wrong/drifted. This
    # rule performs presence-of-assertion checking only, per Section 4.4.
    assert "does not contain a match" in v["message"]
    assert "actual status" not in v["message"] or "does not verify" in v["message"]
    assert "consistency" not in v["message"].lower()


def test_required_status_reference_silent_on_target_content_drift(tmp_path):
    # Section 4.4's core behavioral boundary: this rule does NOT verify
    # target's actual status -- it only checks that `source` contains the
    # configured assertion pattern. Here `pattern` matches in `source` (so
    # no violation), but `target`'s real content directly CONTRADICTS what
    # `source` asserts (target says REJECTED, source asserts APPROVED). The
    # rule must stay completely silent on this contradiction -- zero
    # violations -- because detecting source/target drift is explicitly out
    # of scope for v1 (Section 4.4, Section 9).
    (tmp_path / "INTAKE.md").write_text("**Status**: REJECTED\n")
    (tmp_path / "05-REVIEW.md").write_text(
        "Review confirms INTAKE.md is APPROVED.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-status-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        source: 05-REVIEW.md\n"
        "        target: INTAKE.md\n"
        "        pattern: 'INTAKE\\.md.*APPROVED'\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "required-status-reference", "--format", "json"]
    )
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_required_status_reference_not_run_by_default_without_rule_flag(tmp_path):
    # Section 2/3: disabled-by-default means truly unreachable in a normal
    # (no --rule, no enabled: true) invocation. Config below has no
    # top-level `enabled` key for required-status-reference (defaults to
    # false per Section 3) and its one check WOULD be a violation if run
    # (source lacks the asserted pattern) -- proving the rule is silently
    # skipped, not merely defaulting to a pass.
    (tmp_path / "INTAKE.md").write_text("**Status**: APPROVED\n")
    (tmp_path / "05-REVIEW.md").write_text("Review is complete.\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-status-reference:\n"
        "    checks:\n"
        "      - name: c1\n        source: 05-REVIEW.md\n"
        "        target: INTAKE.md\n"
        "        pattern: 'INTAKE\\.md.*APPROVED'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert "required-status-reference" not in out["summary"]["rules_run"]


def test_required_status_reference_runnable_via_explicit_rule_despite_disabled_default(
    tmp_path,
):
    # Section 2/3: required-status-reference is disabled by default; no
    # top-level `enabled: true` is set here, only `--rule` is used.
    (tmp_path / "INTAKE.md").write_text("**Status**: APPROVED\n")
    (tmp_path / "05-REVIEW.md").write_text("Review is complete.\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-status-reference:\n"
        "    checks:\n"
        "      - name: c1\n        source: 05-REVIEW.md\n"
        "        target: INTAKE.md\n"
        "        pattern: 'INTAKE\\.md.*APPROVED'\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "required-status-reference", "--format", "json"]
    )
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert out["summary"]["rules_run"] == ["required-status-reference"]


# --- canonical-reference (Slice 3, Section 4.6) ------------------------------


def test_canonical_reference_pass_presence_and_existence(tmp_path):
    (tmp_path / "01-REQUIREMENTS.md").write_text("AC-1 foo\n")
    (tmp_path / "04-ROADMAP.md").write_text(
        "Output verification points at 01-REQUIREMENTS.md.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 01-REQUIREMENTS.md\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-reference", "--format", "json"]
    )
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_canonical_reference_fail_presence_missing(tmp_path):
    (tmp_path / "01-REQUIREMENTS.md").write_text("AC-1 foo\n")
    (tmp_path / "04-ROADMAP.md").write_text(
        "Output verification points at the requirements doc.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 01-REQUIREMENTS.md\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-reference", "--format", "json"]
    )
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "does not contain the required reference" in out["violations"][0]["message"]


def test_canonical_reference_filename_target_missing_is_existence_violation(tmp_path):
    (tmp_path / "04-ROADMAP.md").write_text(
        "Output verification points at 01-REQUIREMENTS.md.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 01-REQUIREMENTS.md\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-reference", "--format", "json"]
    )
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "does not exist" in out["violations"][0]["message"]


def test_canonical_reference_anchor_string_skips_existence_check(tmp_path):
    # target_reference does not end in .md -> treated as an anchor string;
    # present in claiming_file but never path-resolved -- proving no
    # existence check is attempted even though no file of that name exists.
    (tmp_path / "04-ROADMAP.md").write_text(
        "Output verification points at Section 4.6 for details.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 'Section 4.6'\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-reference", "--format", "json"]
    )
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_canonical_reference_forbidden_restatement_matches_is_violation(tmp_path):
    (tmp_path / "01-REQUIREMENTS.md").write_text("AC-1 foo\nAC-2 bar\n")
    (tmp_path / "04-ROADMAP.md").write_text(
        "Output verification points at 01-REQUIREMENTS.md, which enumerates "
        "2 acceptance criteria.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 01-REQUIREMENTS.md\n"
        "        forbidden_restatement_pattern: '\\b\\d+\\s+acceptance criteria\\b'\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-reference", "--format", "json"]
    )
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "forbidden restatement pattern" in out["violations"][0]["message"]


def test_canonical_reference_forbidden_restatement_omitted_key_not_inferred(tmp_path):
    # Same content that WOULD match a restatement pattern if configured, but
    # forbidden_restatement_pattern is omitted from the check entry entirely
    # -- proving the third check is skipped, not inferred/defaulted.
    (tmp_path / "01-REQUIREMENTS.md").write_text("AC-1 foo\nAC-2 bar\n")
    (tmp_path / "04-ROADMAP.md").write_text(
        "Output verification points at 01-REQUIREMENTS.md, which enumerates "
        "2 acceptance criteria.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 01-REQUIREMENTS.md\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-reference", "--format", "json"]
    )
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_canonical_reference_not_run_by_default_without_rule_flag(tmp_path):
    # Section 2/3: disabled-by-default means truly unreachable in a normal
    # (no --rule, no enabled: true) invocation. Config below has no
    # top-level `enabled` key for canonical-reference (defaults to false per
    # Section 3) and its one check WOULD be a violation if run (claiming_file
    # lacks the required reference) -- proving the rule is silently skipped,
    # not merely defaulting to a pass.
    (tmp_path / "01-REQUIREMENTS.md").write_text("AC-1 foo\n")
    (tmp_path / "04-ROADMAP.md").write_text("no reference here\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 01-REQUIREMENTS.md\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert "canonical-reference" not in out["summary"]["rules_run"]


def test_canonical_reference_forbidden_restatement_reports_real_line_number(
    tmp_path,
):
    # Regression: check 3 (forbidden_restatement_pattern) must report the
    # actual matched line, not the file-level line-0 convention. Section 6's
    # line-0 unsuppressibility carve-out is scoped to required-files only --
    # a forbidden-restatement match is the presence of a specific line of
    # real content, same as forbidden-literal/stray-artifact. Placing the
    # match on line 4 (not line 1) makes a line-0 regression visibly wrong.
    (tmp_path / "01-REQUIREMENTS.md").write_text("AC-1 foo\nAC-2 bar\n")
    (tmp_path / "04-ROADMAP.md").write_text(
        "line one\n"
        "line two\n"
        "line three\n"
        "Output verification points at 01-REQUIREMENTS.md, which enumerates "
        "2 acceptance criteria.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 01-REQUIREMENTS.md\n"
        "        forbidden_restatement_pattern: '\\b\\d+\\s+acceptance criteria\\b'\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-reference", "--format", "json"]
    )
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    assert v["start_line"] == 4
    assert v["end_line"] == 4


def test_canonical_reference_forbidden_restatement_suppressible_by_inline_marker(
    tmp_path,
):
    # End-to-end consequence of the line-number bug: with the violation
    # correctly pinned at its real line, an inline marker bound to that line
    # must actually suppress it (rather than producing suppression-unused
    # noise because the marker can never match a line-0 finding).
    (tmp_path / "01-REQUIREMENTS.md").write_text("AC-1 foo\nAC-2 bar\n")
    (tmp_path / "04-ROADMAP.md").write_text(
        "line one\n"
        "line two\n"
        '<!-- spec-doc-checker: ignore canonical-reference reason="intentional restatement" -->\n'
        "Output verification points at 01-REQUIREMENTS.md, which enumerates "
        "2 acceptance criteria.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 01-REQUIREMENTS.md\n"
        "        forbidden_restatement_pattern: '\\b\\d+\\s+acceptance criteria\\b'\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-reference", "--format", "json"]
    )
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert len(out["suppressed"]) == 1
    s = out["suppressed"][0]
    assert s["rule"] == "canonical-reference"
    assert s["suppression_source"] == "inline"


def test_canonical_reference_forbidden_restatement_suppressible_by_allowlist(
    tmp_path,
):
    # Same end-to-end consequence via the config-file allowlist path:
    # line_range must be a real, matchable line, which requires the
    # violation itself to report a real (non-zero) line.
    (tmp_path / "01-REQUIREMENTS.md").write_text("AC-1 foo\nAC-2 bar\n")
    (tmp_path / "04-ROADMAP.md").write_text(
        "line one\n"
        "line two\n"
        "line three\n"
        "Output verification points at 01-REQUIREMENTS.md, which enumerates "
        "2 acceptance criteria.\n"
    )
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    enabled: true\n    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 01-REQUIREMENTS.md\n"
        "        forbidden_restatement_pattern: '\\b\\d+\\s+acceptance criteria\\b'\n"
        "suppression_allowlist:\n"
        "  - rule: 'canonical-reference'\n    file: '04-ROADMAP.md'\n"
        "    line_range: [4, 4]\n    reason: 'intentional restatement'\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-reference", "--format", "json"]
    )
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert len(out["suppressed"]) == 1
    s = out["suppressed"][0]
    assert s["rule"] == "canonical-reference"
    assert s["suppression_source"] == "allowlist"


def test_canonical_reference_runnable_via_explicit_rule_despite_disabled_default(
    tmp_path,
):
    (tmp_path / "01-REQUIREMENTS.md").write_text("AC-1 foo\n")
    (tmp_path / "04-ROADMAP.md").write_text("no reference here\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-reference:\n"
        "    checks:\n"
        "      - name: c1\n        claiming_file: 04-ROADMAP.md\n"
        "        target_reference: 01-REQUIREMENTS.md\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-reference", "--format", "json"]
    )
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert out["summary"]["rules_run"] == ["canonical-reference"]
