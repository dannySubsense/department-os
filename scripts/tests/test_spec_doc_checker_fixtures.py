"""Fixture-directory-based tests for the four default-enabled rules.

Normative source: docs/tooling/spec-doc-checker.md Section 7, "Fixture
strategy" — committed fixture doc sets under
scripts/tests/fixtures/spec-doc-checker/<rule-name>/{pass,fail}/, run
standalone via the real CLI, rather than tmp_path-generated equivalents.

This file complements (does not replace) test_spec_doc_checker_rules.py,
which covers the same rule behavior via tmp_path fixtures for fast unit-level
iteration. These tests exist specifically to satisfy Section 7's normative
fixture-directory requirement with real, committed, standalone-runnable
fixture directories.
"""

import json
import subprocess
import sys
from pathlib import Path

CHECKER = Path(__file__).resolve().parent.parent / "check-spec-docs.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "spec-doc-checker"


def run_cli(fixture_dir, extra_args=None):
    args = [str(fixture_dir), "--format", "json"] + (extra_args or [])
    return subprocess.run(
        [sys.executable, str(CHECKER)] + args,
        capture_output=True,
        text=True,
    )


# --- canonical-count (AC1, AC2, AC3(a), AC3(b), AC4) -------------------------


def test_canonical_count_pass_mismatch_fixture_zero_violations():
    # F7 pairing: canonical-count/pass/mismatch is the same doc set as
    # fail/mismatch with the mislabeled-duplicate AC-33 corrected to a
    # properly labeled AC-34 -- restated counts (34) now match the
    # mechanically enumerated count (34), and no duplicate remains.
    result = run_cli(FIXTURES / "canonical-count" / "pass" / "mismatch")
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_canonical_count_pass_duplicate_fixture_zero_violations():
    # F7 pairing: canonical-count/pass/duplicate is the same doc set as
    # fail/duplicate with the mislabeled duplicate AC-1 corrected to AC-3.
    result = run_cli(FIXTURES / "canonical-count" / "pass" / "duplicate")
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_canonical_count_pass_malformed_fixture_zero_violations():
    # F7 pairing: canonical-count/pass/malformed is the same doc set as
    # fail/malformed with the empty-capture line corrected to a well-formed
    # ID.
    result = run_cli(FIXTURES / "canonical-count" / "pass" / "malformed")
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_canonical_count_fail_mismatch_fixture_ac3a():
    # AC3(a), discriminating property: ROADMAP.md and REVIEW.md both restate
    # "34" -- a naive same-declared-count comparison between the two
    # restatements would find agreement and pass. The canonical source
    # (REQUIREMENTS.md) has one mislabeled duplicate (AC-33 appears twice),
    # so it mechanically enumerates to only 33 unique IDs. `mode: compare`
    # against the real `enumerate` baseline (33) must catch the mismatch
    # against BOTH restatements, not just cross-check them against each
    # other.
    result = run_cli(FIXTURES / "canonical-count" / "fail" / "mismatch")
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 3  # 1 duplicate-ID + 2 restated-mismatch

    # The genuine duplicate-ID violation's message starts with "duplicate ID
    # <id> in <path> on lines ..." (see rules.py's canonical-count duplicate
    # check). The two restated-mismatch violations' messages start with
    # "restated count '...' does not match ..." and merely *mention*
    # duplicates in an appended parenthetical note (e.g. "(1 duplicate ID(s)
    # found in canonical source)"), so a bare "duplicate" substring check
    # matches all three. Anchor on the message prefix instead.
    dup_violations = [
        v for v in out["violations"] if v["message"].startswith("duplicate ID ")
    ]
    assert len(dup_violations) == 1
    assert dup_violations[0]["path"] == "REQUIREMENTS.md"

    mismatch_violations = [
        v for v in out["violations"] if v["message"].startswith("restated count ")
    ]
    assert len(mismatch_violations) == 2
    assert set(v["path"] for v in mismatch_violations) == {"ROADMAP.md", "REVIEW.md"}
    for v in mismatch_violations:
        assert v["rule"] == "canonical-count"
        # The message must report the mismatch between the restated 34 and
        # the mechanically enumerated 33 -- not between the two
        # restatements (which agree with each other and would pass a naive
        # comparison).
        assert "restated count '34'" in v["message"]
        assert "enumerated" in v["message"] and "'33'" in v["message"]


def test_canonical_count_fail_duplicate_fixture_ac3b():
    # AC3(b): canonical source itself has duplicate IDs, independent of any
    # downstream comparison.
    result = run_cli(FIXTURES / "canonical-count" / "fail" / "duplicate")
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "duplicate" in out["violations"][0]["message"]


def test_canonical_count_fail_malformed_fixture_ac4():
    # AC4: malformed ID (empty capture) is distinguishable from duplicate.
    result = run_cli(FIXTURES / "canonical-count" / "fail" / "malformed")
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    assert "malformed" in v["message"]
    assert "duplicate" not in v["message"]


# --- forbidden-literal (AC1, AC2) --------------------------------------------


def test_forbidden_literal_fail_fixture():
    result = run_cli(FIXTURES / "forbidden-literal" / "fail")
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    assert v["rule"] == "forbidden-literal"
    assert v["path"] == "A.md"


def test_forbidden_literal_pass_fixture():
    result = run_cli(FIXTURES / "forbidden-literal" / "pass")
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


# --- stray-artifact (AC1, AC2, AC21, AC22) -----------------------------------


def test_stray_artifact_pass_setext_heading_no_false_positive_ac21():
    result = run_cli(FIXTURES / "stray-artifact" / "pass")
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_stray_artifact_fail_conflict_markers_still_flagged_ac21():
    result = run_cli(FIXTURES / "stray-artifact" / "fail" / "conflict-markers")
    assert result.returncode == 1
    out = json.loads(result.stdout)
    rules_hit = [v["rule"] for v in out["violations"]]
    assert rules_hit.count("stray-artifact") == 2  # <<<<<<< and >>>>>>> only


def test_stray_artifact_builtin_patterns_false_ac22():
    result = run_cli(FIXTURES / "stray-artifact" / "fail" / "builtin-disabled")
    assert result.returncode == 1
    out = json.loads(result.stdout)
    # Only the custom-pattern occurrence is reported; the built-in
    # </content> occurrence in the same file must NOT be reported.
    assert len(out["violations"]) == 1
    assert "CUSTOM_MARKER" in out["violations"][0]["message"]
    assert not any("</content>" in v["message"] for v in out["violations"])


def test_stray_artifact_pass_conflict_markers_paired_fixture():
    # F7: pass/conflict-markers is the same minimal doc set as
    # fail/conflict-markers with the one defect (conflict markers) removed.
    result = run_cli(FIXTURES / "stray-artifact" / "pass" / "conflict-markers")
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_stray_artifact_pass_builtin_disabled_paired_fixture():
    # F7: pass/builtin-disabled is the same minimal doc set as
    # fail/builtin-disabled with the CUSTOM_MARKER occurrence removed;
    # builtin_patterns is still false so the surviving </content> is not
    # flagged either.
    result = run_cli(FIXTURES / "stray-artifact" / "pass" / "builtin-disabled")
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_stray_artifact_fail_setext_heading_with_stray_paired_fixture():
    # F7: this fail variant is the same minimal doc set as the top-level
    # stray-artifact/pass/ fixture (Setext heading, no false positive) with
    # a genuine stray artifact added -- proving the Setext heading itself
    # still doesn't false-positive even alongside a real finding elsewhere
    # in the same doc set.
    result = run_cli(FIXTURES / "stray-artifact" / "fail" / "setext-heading-with-stray")
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "</content>" in out["violations"][0]["message"]


# --- required-files (AC1, AC2) -----------------------------------------------


def test_required_files_fail_missing_file_fixture():
    result = run_cli(FIXTURES / "required-files" / "fail" / "missing-file")
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    v = out["violations"][0]
    assert v["rule"] == "required-files"
    assert v["path"] == "02-ARCHITECTURE.md"


def test_required_files_pass_missing_file_fixture():
    result = run_cli(FIXTURES / "required-files" / "pass" / "missing-file")
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_required_files_fail_missing_heading_fixture():
    result = run_cli(FIXTURES / "required-files" / "fail" / "missing-heading")
    assert result.returncode == 1
    out = json.loads(result.stdout)
    assert len(out["violations"]) == 1
    assert "Out of Scope" in out["violations"][0]["message"]


def test_required_files_pass_missing_heading_fixture():
    result = run_cli(FIXTURES / "required-files" / "pass" / "missing-heading")
    assert result.returncode == 0
    out = json.loads(result.stdout)
    assert out["violations"] == []


def test_required_files_missing_file_finding_unsuppressible_by_allowlist_fixture():
    # Section 6, "Suppression and required-files file-level findings"
    # (Revision note 4): an allowlist entry attempting to suppress a
    # required-files file-level finding (guessed line_range [1, 1]) never
    # actually suppresses it -- the original violation still fires
    # (unsuppressed) AND a suppression-unused violation fires for the
    # ineffective allowlist entry.
    result = run_cli(FIXTURES / "required-files" / "fail" / "missing-file-unsuppressible")
    assert result.returncode == 1
    out = json.loads(result.stdout)

    required_files_violations = [v for v in out["violations"] if v["rule"] == "required-files"]
    assert len(required_files_violations) == 1
    assert required_files_violations[0]["path"] == "02-ARCHITECTURE.md"
    assert required_files_violations[0]["start_line"] == 0

    unused_violations = [v for v in out["violations"] if v["rule"] == "suppression-unused"]
    assert len(unused_violations) == 1

    assert out["suppressed"] == []
