"""Slice 1 acceptance-criteria tests for spec-doc-checker.

Maps directly to docs/tooling/spec-doc-checker.md Section 7's acceptance
criteria, restricted to the subset exercisable against Slice 1's scope
(config loading, CLI wiring, discovery, suppression-marker mechanics, output
shape) — i.e. everything that does NOT require a rule's detection logic to
be implemented (RULE_REGISTRY is empty in this slice; see cli.py/models.py).

These are full end-to-end tests: every fixture is a real temp directory with
real `.md` files and a real `spec-doc-checker.yml`, invoked via subprocess
against the actual CLI entry point — not in-memory config/model objects.
`scripts/tests/test_spec_doc_checker.py` already covers config-parsing unit
edge cases (calling `config.load_config` directly) and CLI arg/marker/JSON
unit-level scenarios; this file avoids re-testing the same scenario at the
same (unit) level and instead adds the full-process, fixture-driven
acceptance layer plus a handful of scenarios not covered there at all
(unreadable directory, JSON-with-suppression-diagnostics schema shape,
stdout-purity around the "using built-in defaults" stderr diagnostic,
`--rule` against a valid-but-unimplemented rule name).
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

CHECKER = Path(__file__).resolve().parent.parent / "check-spec-docs.py"


def run_cli(args):
    return subprocess.run(
        [sys.executable, str(CHECKER)] + args,
        capture_output=True,
        text=True,
    )


def _assert_empty_checker_output_json(stdout: str) -> None:
    """F5: on a tool error (exit 2) with --format json, stdout must contain
    exactly one valid, empty CheckerOutput object -- not nothing, and not
    the tool error encoded as a violation."""
    out = json.loads(stdout)
    assert out["violations"] == []
    assert out["suppressed"] == []
    assert out["summary"] == {
        "files_checked": 0,
        "rules_run": [],
        "violation_count": 0,
        "suppressed_count": 0,
    }


# --- AC10: unreadable target directory -------------------------------------


@pytest.mark.skipif(os.geteuid() == 0, reason="root bypasses directory permissions")
def test_unreadable_target_directory_exit_2(tmp_path):
    target = tmp_path / "locked"
    target.mkdir()
    (target / "A.md").write_text("hello\n")
    target.chmod(0o000)
    try:
        result = run_cli([str(target), "--format", "json"])
        assert result.returncode == 2
        _assert_empty_checker_output_json(result.stdout)
    finally:
        target.chmod(0o755)


# --- AC7: unrecognized/unknown keys, end-to-end through the real CLI -------


def test_cli_unknown_top_level_key_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules: {}\nunexpected_key: 1\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)
    assert "unexpected_key" in result.stderr


def test_cli_unrecognized_rule_name_in_rules_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  totally-made-up-rule:\n    enabled: true\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)


def test_cli_unknown_key_in_rule_subtree_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  stray-artifact:\n    enabled: true\n"
        "    not_a_real_key: 1\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)


def test_cli_invalid_version_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text("version: 3\nrules: {}\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)


def test_cli_missing_version_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text("rules: {}\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)


# --- AC8: invalid regex, end-to-end ----------------------------------------


def test_cli_invalid_regex_in_pattern_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  stray-artifact:\n    enabled: true\n"
        "    patterns:\n      - '(unclosed'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)
    assert "invalid regex" in result.stderr


# --- AC9: config path escaping the target spec directory, end-to-end ------


def test_cli_config_path_with_dotdot_exit_2(tmp_path):
    outside = tmp_path.parent / "outside-escape.md"
    outside.write_text("x\n")
    target = tmp_path / "specs"
    target.mkdir()
    (target / "A.md").write_text("hello\n")
    (target / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['../outside-escape.md']\n"
    )
    try:
        result = run_cli([str(target), "--format", "json"])
        assert result.returncode == 2
        _assert_empty_checker_output_json(result.stdout)
    finally:
        outside.unlink()


def test_cli_config_absolute_path_exit_2(tmp_path):
    target = tmp_path / "specs"
    target.mkdir()
    (target / "A.md").write_text("hello\n")
    (target / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['/etc/hosts']\n"
    )
    result = run_cli([str(target), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)


# --- Duplicate check name, end-to-end ---------------------------------------


def test_cli_duplicate_check_name_exit_2(tmp_path):
    (tmp_path / "REQ.md").write_text("AC-1\nAC-2\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: true\n"
        "    checks:\n"
        "      - name: dup-check\n"
        "        mode: enumerate\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
        "      - name: dup-check\n"
        "        mode: enumerate\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)


# --- Allowlist config errors, end-to-end ------------------------------------


def test_cli_allowlist_missing_required_key_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules: {}\nsuppression_allowlist:\n"
        "  - rule: stray-artifact\n    file: A.md\n    line_range: [1, 2]\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)


def test_cli_allowlist_empty_reason_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules: {}\nsuppression_allowlist:\n"
        "  - rule: stray-artifact\n    file: A.md\n"
        "    line_range: [1, 2]\n    reason: ''\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)


def test_cli_allowlist_file_with_path_separator_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules: {}\nsuppression_allowlist:\n"
        "  - rule: stray-artifact\n    file: sub/A.md\n"
        "    line_range: [1, 2]\n    reason: 'x'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)


# --- AC23: config-valid-but-undiscovered allowlist file -> suppression-unused,
#     end-to-end, exit code 1 ------------------------------------------------


def test_cli_allowlist_undiscovered_file_produces_suppression_unused(tmp_path):
    (tmp_path / "05-REVIEW.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules: {}\nsuppression_allowlist:\n"
        "  - rule: stray-artifact\n    file: 05-REVEIW.md\n"  # typo'd filename
        "    line_range: [1, 2]\n    reason: 'stale, real file has no typo'\n"
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    unused = [v for v in out["violations"] if v["rule"] == "suppression-unused"]
    assert len(unused) == 1
    assert unused[0]["check_name"] is None
    assert unused[0]["severity"] == "error"


# --- AC18: inline marker bound to a real rule/line with no finding --------
#     produces suppression-unused, end-to-end (no rule detection needed:
#     RULE_REGISTRY is empty in Slice 1, so *any* well-formed marker is
#     necessarily unused).


def test_cli_wellformed_marker_with_no_finding_is_suppression_unused(tmp_path):
    (tmp_path / "A.md").write_text(
        'text\n<!-- spec-doc-checker: ignore stray-artifact reason="nothing here" -->\nmore text\n'
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1  # suppression-unused is itself a violation
    out = json.loads(result.stdout)
    unused = [v for v in out["violations"] if v["rule"] == "suppression-unused"]
    assert len(unused) == 1
    assert unused[0]["path"] == "A.md"


# --- AC16/AC17: malformed inline markers, end-to-end, JSON shape ----------


def test_cli_malformed_marker_missing_rule_name_json_shape(tmp_path):
    (tmp_path / "A.md").write_text(
        '<!-- spec-doc-checker: ignore reason="oops" -->\nline\n'
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    malformed = [v for v in out["violations"] if v["rule"] == "suppression-malformed"]
    assert len(malformed) == 1
    v = malformed[0]
    assert v["check_name"] is None
    assert v["severity"] == "error"
    assert v["path"] == "A.md"
    assert v["start_line"] == v["end_line"] == 1
    assert "suppression_reason" not in v  # not a SuppressedViolation
    assert "suppression_source" not in v


def test_cli_malformed_marker_unknown_rule_name_json_shape(tmp_path):
    (tmp_path / "A.md").write_text(
        '<!-- spec-doc-checker: ignore not-a-real-rule reason="oops" -->\nline\n'
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    malformed = [v for v in out["violations"] if v["rule"] == "suppression-malformed"]
    assert len(malformed) == 1


# --- AC12: --format json is the ONLY thing on stdout, and matches the
#     normative schema -- clean run, run with (suppression-diagnostic)
#     violations, and tool-error run. -----------------------------------


def _assert_matches_checker_output_schema(out: dict):
    assert set(out.keys()) == {"violations", "suppressed", "summary"}
    assert set(out["summary"].keys()) == {
        "files_checked",
        "rules_run",
        "violation_count",
        "suppressed_count",
    }
    assert out["summary"]["violation_count"] == len(out["violations"])
    assert out["summary"]["suppressed_count"] == len(out["suppressed"])
    for v in out["violations"]:
        assert set(v.keys()) == {
            "rule",
            "check_name",
            "severity",
            "path",
            "start_line",
            "end_line",
            "message",
        }
    for v in out["suppressed"]:
        assert set(v.keys()) == {
            "rule",
            "check_name",
            "severity",
            "path",
            "start_line",
            "end_line",
            "message",
            "suppression_reason",
            "suppression_source",
        }


def test_json_schema_clean_run(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    _assert_matches_checker_output_schema(out)


def test_json_schema_run_with_violations(tmp_path):
    (tmp_path / "A.md").write_text(
        '<!-- spec-doc-checker: ignore reason="oops" -->\nline\n'
    )
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 1
    out = json.loads(result.stdout)
    _assert_matches_checker_output_schema(out)
    assert len(out["violations"]) >= 1


def test_json_schema_tool_error_run_emits_valid_empty_checker_output(tmp_path):
    # F5: a tool error is a distinct condition from a document-set
    # violation -- it is not encoded as a violation. The error message goes
    # to stderr; stdout still carries one valid, empty CheckerOutput object.
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text("version: 99\nrules: {}\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    _assert_empty_checker_output_json(result.stdout)
    _assert_matches_checker_output_schema(json.loads(result.stdout))
    assert result.stderr.strip() != ""


# --- Stdout purity around the "using built-in defaults" diagnostic --------
#     (Section 5: "diagnostics about the tool's own execution ... go to
#     stderr, never to stdout")


def test_missing_default_config_diagnostic_goes_to_stderr_not_stdout(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    # stdout must be exactly one parseable JSON object with nothing else
    out = json.loads(result.stdout)
    _assert_matches_checker_output_schema(out)
    assert "built-in defaults" in result.stderr


# --- AC13: deterministic ordering across repeated runs, with real content -


def test_deterministic_ordering_across_runs_with_multiple_violations(tmp_path):
    (tmp_path / "B.md").write_text(
        '<!-- spec-doc-checker: ignore reason="x" -->\nline\n'
        '<!-- spec-doc-checker: ignore unknown-rule reason="y" -->\nline2\n'
    )
    (tmp_path / "A.md").write_text(
        '<!-- spec-doc-checker: ignore reason="z" -->\nline\n'
    )
    r1 = run_cli([str(tmp_path), "--format", "json"])
    r2 = run_cli([str(tmp_path), "--format", "json"])
    assert r1.returncode == r2.returncode == 1
    assert r1.stdout == r2.stdout
    out = json.loads(r1.stdout)
    paths = [v["path"] for v in out["violations"]]
    assert paths == sorted(paths)


# --- AC11: empty target directory, end-to-end (real dir, no files) --------


def test_cli_empty_target_directory_exit_0_files_checked_zero(tmp_path):
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["summary"]["files_checked"] == 0
    assert out["violations"] == []
    assert out["suppressed"] == []


# --- AC5: missing default config -> built-in defaults, zero rules'-worth
#     of violations, end-to-end -------------------------------------------


def test_cli_missing_default_config_runs_clean(tmp_path):
    (tmp_path / "A.md").write_text("ordinary content, no artifacts\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["summary"]["rules_run"] == ["stray-artifact"]
    assert out["violations"] == []


# --- --rule against a schema-recognized but not-yet-implemented rule ------
#     (Slice 1: RULE_REGISTRY is empty; --rule must still validate the name
#     and run without error, producing zero violations for that rule, since
#     detection logic doesn't exist until Slice 2/3.)


def test_rule_flag_against_valid_unimplemented_rule_name_runs_clean(tmp_path):
    (tmp_path / "REQ.md").write_text("AC-1\nAC-2\n")
    (tmp_path / "spec-doc-checker.yml").write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: false\n"
        "    checks:\n"
        "      - name: c1\n        mode: enumerate\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
    )
    result = run_cli(
        [str(tmp_path), "--rule", "canonical-count", "--format", "json"]
    )
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["summary"]["rules_run"] == ["canonical-count"]
    assert out["violations"] == []
