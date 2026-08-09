"""Slice 1 scaffolding tests for spec-doc-checker.

Covers: config parsing edge cases, CLI arg parsing / exit codes, suppression
marker parsing, JSON schema shape. Rule-detection logic is NOT under test
here (Slices 2/3) — every scenario below runs with zero rules producing
zero findings, or exercises config/suppression scaffolding directly.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from spec_doc_checker import config as config_mod  # noqa: E402
from spec_doc_checker.config import ConfigError  # noqa: E402
from spec_doc_checker.suppression import parse_inline_markers  # noqa: E402
from spec_doc_checker.models import Violation  # noqa: E402
from spec_doc_checker.suppression import (  # noqa: E402
    AllowlistEntry,
    apply_suppressions,
)

CHECKER = Path(__file__).resolve().parent.parent / "check-spec-docs.py"


def run_cli(args):
    return subprocess.run(
        [sys.executable, str(CHECKER)] + args,
        capture_output=True,
        text=True,
    )


# --- CLI / end-to-end exit codes -------------------------------------------------


def test_empty_directory_exit_0(tmp_path):
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["summary"]["files_checked"] == 0
    assert out["violations"] == []
    assert out["suppressed"] == []


def test_nonexistent_directory_exit_2(tmp_path):
    result = run_cli([str(tmp_path / "does-not-exist"), "--format", "json"])
    assert result.returncode == 2
    out = json.loads(result.stdout)
    assert out == {
        "violations": [],
        "suppressed": [],
        "summary": {
            "files_checked": 0,
            "rules_run": [],
            "violation_count": 0,
            "suppressed_count": 0,
        },
    }


def test_missing_default_config_uses_builtin_defaults(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["summary"]["rules_run"] == ["stray-artifact"]


def test_missing_explicit_config_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    result = run_cli(
        [str(tmp_path), "--config", str(tmp_path / "nope.yml"), "--format", "json"]
    )
    assert result.returncode == 2
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert out["suppressed"] == []
    assert out["summary"]["files_checked"] == 0
    assert out["summary"]["rules_run"] == []


def test_json_stdout_is_single_object_on_success(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    # must parse cleanly as exactly one JSON value
    json.loads(result.stdout)


def test_json_stdout_is_single_object_on_config_error(tmp_path):
    # AC12 / F5: on a tool error (exit 2) with --format json, stdout must
    # still contain exactly one valid, empty CheckerOutput object -- the
    # actionable error message goes to stderr, not stdout.
    (tmp_path / "A.md").write_text("hello\n")
    (tmp_path / "spec-doc-checker.yml").write_text("version: 2\nrules: {}\n")
    result = run_cli([str(tmp_path), "--format", "json"])
    assert result.returncode == 2
    out = json.loads(result.stdout)
    assert out["violations"] == []
    assert out["suppressed"] == []
    assert out["summary"] == {
        "files_checked": 0,
        "rules_run": [],
        "violation_count": 0,
        "suppressed_count": 0,
    }
    assert "config error" in result.stderr


def test_json_stdout_empty_output_on_unreadable_target_dir(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    (target / "A.md").write_text("hello\n")
    target.chmod(0o000)
    try:
        result = run_cli([str(target), "--format", "json"])
        assert result.returncode == 2
        out = json.loads(result.stdout)
        assert out["violations"] == []
        assert out["suppressed"] == []
        assert out["summary"]["files_checked"] == 0
    finally:
        target.chmod(0o755)


def test_unrecognized_rule_flag_exit_2(tmp_path):
    (tmp_path / "A.md").write_text("hello\n")
    result = run_cli([str(tmp_path), "--rule", "not-a-real-rule"])
    assert result.returncode == 2


def test_deterministic_ordering_across_runs(tmp_path):
    (tmp_path / "A.md").write_text(
        '<!-- spec-doc-checker: ignore reason="bad" -->\nx\n'
    )
    (tmp_path / "B.md").write_text(
        '<!-- spec-doc-checker: ignore reason="bad" -->\nx\n'
    )
    r1 = run_cli([str(tmp_path), "--format", "json"])
    r2 = run_cli([str(tmp_path), "--format", "json"])
    assert r1.stdout == r2.stdout


def test_determine_exit_code_strict_promotes_suppressed_to_failure():
    from spec_doc_checker.cli import determine_exit_code

    assert determine_exit_code([], [], strict=False) == 0
    assert determine_exit_code([], ["dummy"], strict=False) == 0
    assert determine_exit_code([], ["dummy"], strict=True) == 1
    assert determine_exit_code(["dummy"], [], strict=False) == 1


# --- Config loading / validation --------------------------------------------------


def test_load_config_missing_default_location_returns_builtin(tmp_path):
    cfg, used_default, path = config_mod.load_config(None, tmp_path)
    assert used_default is True
    assert path is None
    assert cfg["rules"]["stray-artifact"]["enabled"] is True
    assert cfg["rules"]["canonical-count"]["enabled"] is False


def test_load_config_explicit_missing_raises(tmp_path):
    with pytest.raises(ConfigError):
        config_mod.load_config(str(tmp_path / "nope.yml"), tmp_path)


def test_load_config_unknown_top_level_key(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text("version: 1\nrules: {}\nfoo: 1\n")
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_load_config_bad_version(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text("version: 2\nrules: {}\n")
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_load_config_unrecognized_rule_name(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text("version: 1\nrules:\n  not-a-rule:\n    enabled: true\n")
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_load_config_unknown_key_in_rule_subtree(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules:\n  stray-artifact:\n    enabled: true\n    bogus: 1\n"
    )
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_load_config_invalid_regex(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules:\n  stray-artifact:\n    enabled: true\n"
        "    patterns:\n      - '('\n"
    )
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_load_config_path_outside_target_dir(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['../outside.md']\n"
    )
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_load_config_absolute_path_rejected(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['/etc/passwd']\n"
    )
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_required_files_missing_file_not_checked_at_load_time(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['does-not-exist.md']\n"
    )
    # must NOT raise -- existence is rule-runtime, not config-load-time
    cfg, used_default, _ = config_mod.load_config(str(cfg_path), tmp_path)
    assert used_default is False


def test_duplicate_check_name_is_config_error(tmp_path):
    (tmp_path / "REQ.md").write_text("AC-1\n")
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules:\n  canonical-count:\n    enabled: true\n"
        "    checks:\n"
        "      - name: dup\n"
        "        mode: enumerate\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
        "      - name: dup\n"
        "        mode: enumerate\n"
        "        canonical_source: REQ.md\n"
        "        id_pattern: '^AC-(\\d+)'\n"
    )
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_duplicate_rule_key_under_rules_is_config_error(tmp_path):
    # F1: PyYAML's safe_load silently last-write-wins on duplicate mapping
    # keys; a literal duplicate `rules:` key must be a config error instead.
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\n"
        "rules:\n"
        "  stray-artifact:\n"
        "    enabled: true\n"
        "  stray-artifact:\n"
        "    enabled: false\n"
    )
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_duplicate_top_level_key_is_config_error(tmp_path):
    # F1: duplicate top-level keys (e.g. `version` twice) must also be
    # rejected, not silently collapsed to the last value.
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text("version: 1\nrules: {}\nversion: 1\n")
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_version_bool_true_is_config_error(tmp_path):
    # F3: `True == 1` in Python; version: true must still be rejected.
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text("version: true\nrules: {}\n")
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_version_float_one_point_zero_is_config_error(tmp_path):
    # F3: `1.0 == 1` in Python; version: 1.0 must still be rejected.
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text("version: 1.0\nrules: {}\n")
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_required_headings_key_escaping_target_dir_is_config_error(tmp_path):
    # F4: required_headings mapping KEYS are file paths and must go through
    # the same containment check as required-files.files entries.
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules:\n  required-files:\n    enabled: true\n"
        "    files: ['A.md']\n"
        "    required_headings:\n"
        "      '../../etc/passwd':\n"
        "        - 'Some Heading'\n"
    )
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_forbidden_literal_global_ban_no_proximity_required(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules:\n  forbidden-literal:\n    enabled: true\n"
        "    literals:\n      - literal: 'TODO-REMOVE'\n        forbidden_near: []\n"
    )
    cfg, used_default, _ = config_mod.load_config(str(cfg_path), tmp_path)
    assert used_default is False


def test_stray_artifact_default_enabled_true_when_omitted(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text("version: 1\nrules:\n  stray-artifact: {}\n")
    cfg, _, _ = config_mod.load_config(str(cfg_path), tmp_path)
    assert cfg["rules"]["stray-artifact"]["enabled"] is True


def test_required_status_reference_default_enabled_false_when_omitted(tmp_path):
    (tmp_path / "SRC.md").write_text("x\n")
    (tmp_path / "TGT.md").write_text("y\n")
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules:\n  required-status-reference:\n"
        "    checks:\n      - name: c1\n        source: SRC.md\n"
        "        target: TGT.md\n        pattern: 'x'\n"
    )
    cfg, _, _ = config_mod.load_config(str(cfg_path), tmp_path)
    assert cfg["rules"]["required-status-reference"]["enabled"] is False


def test_allowlist_missing_key_is_config_error(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules: {}\nsuppression_allowlist:\n"
        "  - rule: stray-artifact\n    file: A.md\n"
        "    line_range: [1, 2]\n"
    )
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_allowlist_empty_reason_is_config_error(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules: {}\nsuppression_allowlist:\n"
        "  - rule: stray-artifact\n    file: A.md\n"
        "    line_range: [1, 2]\n    reason: ''\n"
    )
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_allowlist_file_with_path_separator_is_config_error(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules: {}\nsuppression_allowlist:\n"
        "  - rule: stray-artifact\n    file: sub/A.md\n"
        "    line_range: [1, 2]\n    reason: 'x'\n"
    )
    with pytest.raises(ConfigError):
        config_mod.load_config(str(cfg_path), tmp_path)


def test_allowlist_valid_file_not_discovered_is_not_a_config_error(tmp_path):
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\nrules: {}\nsuppression_allowlist:\n"
        "  - rule: stray-artifact\n    file: TYPO.md\n"
        "    line_range: [1, 2]\n    reason: 'x'\n"
    )
    cfg, _, _ = config_mod.load_config(str(cfg_path), tmp_path)
    assert cfg["suppression_allowlist"][0]["file"] == "TYPO.md"


# --- Suppression marker parsing ----------------------------------------------------


def test_parse_marker_preceding_line_binds_to_next_line():
    text = 'line1\n<!-- spec-doc-checker: ignore stray-artifact reason="x" -->\nline3\n'
    markers = parse_inline_markers("A.md", text)
    assert len(markers) == 1
    m = markers[0]
    assert m.rule == "stray-artifact"
    assert m.reason == "x"
    assert not m.malformed
    assert m.marker_line == 2
    assert m.bound_line == 3


def test_parse_marker_same_line_binds_to_same_line():
    text = 'content <!-- spec-doc-checker: ignore stray-artifact reason="x" -->\n'
    markers = parse_inline_markers("A.md", text)
    m = markers[0]
    assert m.bound_line == 1
    assert m.marker_line == 1


def test_parse_marker_missing_rule_name_is_malformed():
    text = '<!-- spec-doc-checker: ignore reason="x" -->\nline\n'
    markers = parse_inline_markers("A.md", text)
    assert markers[0].malformed
    assert markers[0].rule is None


def test_parse_marker_missing_reason_is_malformed():
    text = "<!-- spec-doc-checker: ignore stray-artifact -->\nline\n"
    markers = parse_inline_markers("A.md", text)
    assert markers[0].malformed


def test_parse_marker_empty_reason_is_malformed():
    text = '<!-- spec-doc-checker: ignore stray-artifact reason="" -->\nline\n'
    markers = parse_inline_markers("A.md", text)
    assert markers[0].malformed


def test_parse_marker_unknown_rule_name_is_malformed():
    text = '<!-- spec-doc-checker: ignore not-a-rule reason="x" -->\nline\n'
    markers = parse_inline_markers("A.md", text)
    assert markers[0].malformed


# --- Suppression engine (apply_suppressions) direct unit tests --------------------


def test_apply_suppressions_moves_matching_finding_to_suppressed():
    violations = [
        Violation(
            rule="stray-artifact",
            check_name=None,
            path="A.md",
            start_line=3,
            end_line=3,
            message="found </content>",
        )
    ]
    text = 'line1\n<!-- spec-doc-checker: ignore stray-artifact reason="fp" -->\nline3\n'
    markers = parse_inline_markers("A.md", text)
    kept, suppressed = apply_suppressions(violations, markers, [], ["A.md"], None)
    assert len(suppressed) == 1
    assert suppressed[0].suppression_reason == "fp"
    assert suppressed[0].suppression_source == "inline"
    assert not any(v.rule == "stray-artifact" for v in kept)


def test_apply_suppressions_unused_allowlist_entry_reports_config_line():
    entry = AllowlistEntry(
        rule="stray-artifact",
        file="MISSING.md",
        start_line=1,
        end_line=2,
        reason="stale",
        config_line=42,
    )
    kept, suppressed = apply_suppressions([], [], [entry], ["A.md"], "cfg.yml")
    unused = [v for v in kept if v.rule == "suppression-unused"]
    assert len(unused) == 1
    assert unused[0].path == "cfg.yml"
    assert unused[0].start_line == 42


def test_load_config_attaches_real_allowlist_line_numbers_block_style(tmp_path):
    # F2: config_line must come from the real parser position, not a
    # spec-doc line_range fallback or a text-scan heuristic.
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\n"
        "rules: {}\n"
        "suppression_allowlist:\n"
        "  - rule: stray-artifact\n"
        "    file: A.md\n"
        "    line_range: [1, 2]\n"
        "    reason: 'first'\n"
        "  - rule: stray-artifact\n"
        "    file: B.md\n"
        "    line_range: [5, 9]\n"
        "    reason: 'second'\n"
    )
    cfg, _, _ = config_mod.load_config(str(cfg_path), tmp_path)
    entries = cfg["suppression_allowlist"]
    assert entries[0]["_line"] == 4
    assert entries[1]["_line"] == 8


def test_load_config_attaches_real_allowlist_line_numbers_flow_style(tmp_path):
    # F2: flow-style YAML lists have no `- rule:` line for a text scan to
    # find; only a real parser (yaml.compose) recovers the correct line.
    cfg_path = tmp_path / "c.yml"
    cfg_path.write_text(
        "version: 1\n"
        "rules: {}\n"
        "suppression_allowlist:\n"
        "  - {rule: stray-artifact, file: A.md, line_range: [1, 2], reason: 'x'}\n"
        "  - {rule: stray-artifact, file: B.md, line_range: [88, 92], reason: 'y'}\n"
    )
    cfg, _, _ = config_mod.load_config(str(cfg_path), tmp_path)
    entries = cfg["suppression_allowlist"]
    assert entries[0]["_line"] == 4
    assert entries[1]["_line"] == 5


def test_apply_suppressions_no_findings_no_markers_is_clean():
    kept, suppressed = apply_suppressions([], [], [], ["A.md"], None)
    assert kept == []
    assert suppressed == []
