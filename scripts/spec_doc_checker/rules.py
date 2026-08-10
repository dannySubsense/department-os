"""Rule implementations for all six rules (Slice 2 + Slice 3).

Normative source: docs/tooling/spec-doc-checker.md Section 4.

Each rule implements the `Rule` protocol from models.py: `run(files,
target_dir, rule_config) -> List[Violation]`. Rules must not apply
suppression themselves -- that happens centrally in cli.py/suppression.py.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List

from .config import read_text_or_raise
from .models import RULE_NAMES, Violation

STRAY_ARTIFACT_BUILTIN_PATTERNS = [
    r"</content>",
    r"</invoke>",
    r"\[REPLACE_MARKER\]",
    r"^<<<<<<<.*$",
    r"^>>>>>>>.*$",
]


def _rel_path(p: Path, target_dir: Path) -> str:
    try:
        return str(p.resolve().relative_to(target_dir.resolve()))
    except ValueError:
        return str(p)


# --------------------------------------------------------------------------
# canonical-count (Section 4.1)
# --------------------------------------------------------------------------


def _enumerate_ids(canonical_path: Path, id_pattern: str):
    """Returns dict: unique_ids (set), duplicate_ids (dict id -> [lines]),
    malformed_lines (list of (line_no,)), count (int)."""
    pattern = re.compile(id_pattern, re.MULTILINE)
    text = read_text_or_raise(canonical_path, "canonical_source")
    lines = text.splitlines()

    seen: Dict[str, List[int]] = {}
    malformed_lines: List[int] = []

    for idx, line in enumerate(lines):
        line_no = idx + 1
        for m in pattern.finditer(line):
            captured = m.group(1)
            if captured == "":
                malformed_lines.append(line_no)
                continue
            seen.setdefault(captured, []).append(line_no)

    unique_ids = set(seen.keys())
    duplicate_ids = {k: v for k, v in seen.items() if len(v) > 1}
    return {
        "unique_ids": unique_ids,
        "duplicate_ids": duplicate_ids,
        "malformed_lines": malformed_lines,
        "count": len(unique_ids),
    }


def _canonical_count_run(
    files: List[Path], target_dir: Path, rule_config: dict
) -> List[Violation]:
    violations: List[Violation] = []
    checks = rule_config.get("checks", [])
    for check in checks:
        check_name = check["name"]
        canonical_source = check["canonical_source"]
        canonical_path = target_dir / canonical_source
        canonical_rel = _rel_path(canonical_path, target_dir)
        id_pattern = check["id_pattern"]
        mode = check["mode"]

        enum_result = _enumerate_ids(canonical_path, id_pattern)

        # Malformed IDs (empty capture) -- always a violation.
        for line_no in enum_result["malformed_lines"]:
            violations.append(
                Violation(
                    rule="canonical-count",
                    check_name=check_name,
                    path=canonical_rel,
                    start_line=line_no,
                    end_line=line_no,
                    message=(
                        f"malformed ID on line {line_no}: id_pattern matched "
                        "an empty capture group"
                    ),
                )
            )

        # Duplicate IDs -- always a violation, independent of mode.
        for dup_id, dup_lines in sorted(enum_result["duplicate_ids"].items()):
            lines_str = ", ".join(str(l) for l in dup_lines)
            violations.append(
                Violation(
                    rule="canonical-count",
                    check_name=check_name,
                    path=canonical_rel,
                    start_line=dup_lines[0],
                    end_line=dup_lines[-1],
                    message=(
                        f"duplicate ID {dup_id!r} in {canonical_rel} on "
                        f"lines {lines_str}"
                    ),
                )
            )

        if mode == "compare":
            for restated in check.get("restated_in", []):
                restated_file = restated["file"]
                restated_pattern = restated["restated_pattern"]
                restated_path = target_dir / restated_file
                restated_rel = _rel_path(restated_path, target_dir)
                text = read_text_or_raise(restated_path, f"restated_in file {restated_rel!r}")
                pattern = re.compile(restated_pattern, re.MULTILINE)
                matches = list(pattern.finditer(text))
                if not matches:
                    # No restated count found at all -- treat as a mismatch
                    # violation since restated_in was configured but produced
                    # nothing to compare. File-level finding (no anchor
                    # line), per Section 5's file-level convention.
                    violations.append(
                        Violation(
                            rule="canonical-count",
                            check_name=check_name,
                            path=restated_rel,
                            start_line=0,
                            end_line=0,
                            message=(
                                f"restated_pattern found no match in "
                                f"{restated_rel}; expected a restated count "
                                f"to compare against enumerated count "
                                f"{enum_result['count']} from {canonical_rel}"
                            ),
                        )
                    )
                    continue

                # Every match in the restating file is collected and checked
                # independently against the enumerated count (mirrors the
                # id_pattern per-line collection above). This ensures a
                # second, conflicting restatement later in the same file is
                # not silently ignored -- each match stands on its own as a
                # potential mismatch.
                dup_note = ""
                if enum_result["duplicate_ids"]:
                    dup_note = (
                        f" ({len(enum_result['duplicate_ids'])} duplicate "
                        "ID(s) found in canonical source)"
                    )
                malformed_note = ""
                if enum_result["malformed_lines"]:
                    malformed_note = (
                        f" ({len(enum_result['malformed_lines'])} malformed "
                        "ID(s) found in canonical source)"
                    )

                for m in matches:
                    restated_value = m.group(1)
                    line_no = text.count("\n", 0, m.start()) + 1

                    try:
                        restated_int = int(restated_value)
                    except ValueError:
                        restated_int = None

                    if restated_int != enum_result["count"]:
                        violations.append(
                            Violation(
                                rule="canonical-count",
                                check_name=check_name,
                                path=restated_rel,
                                start_line=line_no,
                                end_line=line_no,
                                message=(
                                    f"restated count '{restated_value}' does "
                                    f"not match mechanically enumerated "
                                    f"count '{enum_result['count']}' from "
                                    f"{canonical_rel}{dup_note}{malformed_note}"
                                ),
                            )
                        )

    return violations


class CanonicalCountRule:
    name = "canonical-count"

    def run(
        self, files: List[Path], target_dir: Path, rule_config: dict
    ) -> List[Violation]:
        return _canonical_count_run(files, target_dir, rule_config)


# --------------------------------------------------------------------------
# forbidden-literal (Section 4.2)
# --------------------------------------------------------------------------


class ForbiddenLiteralRule:
    name = "forbidden-literal"

    def run(
        self, files: List[Path], target_dir: Path, rule_config: dict
    ) -> List[Violation]:
        violations: List[Violation] = []
        literals = rule_config.get("literals", [])
        for entry in literals:
            literal = entry["literal"]
            forbidden_near = entry.get("forbidden_near", [])
            proximity_lines = entry.get("proximity_lines")

            for path in files:
                rel = _rel_path(path, target_dir)
                text = read_text_or_raise(path, f"discovered file {rel!r}")
                lines = text.splitlines()

                for idx, line in enumerate(lines):
                    line_no = idx + 1

                    # Per Section 4.2, "for each occurrence of `literal`":
                    # find every start index of `literal` as a substring
                    # within this line, not just whether it is present.
                    occurrence_starts: List[int] = []
                    start = 0
                    while True:
                        pos = line.find(literal, start)
                        if pos == -1:
                            break
                        occurrence_starts.append(pos)
                        start = pos + 1
                    if not occurrence_starts:
                        continue

                    if not forbidden_near:
                        for _ in occurrence_starts:
                            violations.append(
                                Violation(
                                    rule="forbidden-literal",
                                    check_name=None,
                                    path=rel,
                                    start_line=line_no,
                                    end_line=line_no,
                                    message=(
                                        f"forbidden literal {literal!r} found "
                                        "(global ban)"
                                    ),
                                )
                            )
                        continue

                    lo = max(0, idx - proximity_lines)
                    hi = min(len(lines), idx + proximity_lines + 1)
                    window = lines[lo:hi]
                    for _ in occurrence_starts:
                        for near in forbidden_near:
                            if any(near in wline for wline in window):
                                violations.append(
                                    Violation(
                                        rule="forbidden-literal",
                                        check_name=None,
                                        path=rel,
                                        start_line=line_no,
                                        end_line=line_no,
                                        message=(
                                            f"{literal!r} found within "
                                            f"{proximity_lines} lines of "
                                            f"{near!r} (forbidden proximity)"
                                        ),
                                    )
                                )
                                break
        return violations


# --------------------------------------------------------------------------
# stray-artifact (Section 4.3)
# --------------------------------------------------------------------------


class StrayArtifactRule:
    name = "stray-artifact"

    def run(
        self, files: List[Path], target_dir: Path, rule_config: dict
    ) -> List[Violation]:
        violations: List[Violation] = []
        builtin_patterns = rule_config.get("builtin_patterns", True)
        configured_patterns = rule_config.get("patterns", [])

        pattern_strs: List[str] = []
        if builtin_patterns:
            pattern_strs.extend(STRAY_ARTIFACT_BUILTIN_PATTERNS)
        pattern_strs.extend(configured_patterns)

        compiled = [(p, re.compile(p, re.MULTILINE)) for p in pattern_strs]

        for path in files:
            rel = _rel_path(path, target_dir)
            text = read_text_or_raise(path, f"discovered file {rel!r}")
            lines = text.splitlines()
            for idx, line in enumerate(lines):
                line_no = idx + 1
                for pat_str, pat in compiled:
                    for _ in pat.finditer(line):
                        violations.append(
                            Violation(
                                rule="stray-artifact",
                                check_name=None,
                                path=rel,
                                start_line=line_no,
                                end_line=line_no,
                                message=(
                                    f"stray artifact pattern {pat_str!r} "
                                    "matched"
                                ),
                            )
                        )
        return violations


# --------------------------------------------------------------------------
# required-files (Section 4.5)
# --------------------------------------------------------------------------

HEADING_RE_TEMPLATE = r"^#{{1,6}}\s+{text}\s*$"


class RequiredFilesRule:
    name = "required-files"

    def run(
        self, files: List[Path], target_dir: Path, rule_config: dict
    ) -> List[Violation]:
        violations: List[Violation] = []
        configured_files = rule_config.get("files", [])
        required_headings = rule_config.get("required_headings", {})

        for fname in configured_files:
            candidate = (target_dir / fname).resolve()
            if not candidate.exists():
                violations.append(
                    Violation(
                        rule="required-files",
                        check_name=None,
                        path=fname,
                        start_line=0,
                        end_line=0,
                        message=f"required file {fname!r} is missing",
                    )
                )
                continue

            headings = required_headings.get(fname)
            if not headings:
                continue

            text = read_text_or_raise(candidate, f"required file {fname!r}")
            lines = text.splitlines()
            # Trim trailing whitespace per line before matching.
            trimmed_lines = [l.rstrip() for l in lines]

            for heading in headings:
                found = False
                pattern = re.compile(
                    r"^#{1,6}\s+" + re.escape(heading) + r"\s*$", re.MULTILINE
                )
                for line in trimmed_lines:
                    if pattern.match(line):
                        found = True
                        break
                if not found:
                    violations.append(
                        Violation(
                            rule="required-files",
                            check_name=None,
                            path=fname,
                            start_line=0,
                            end_line=0,
                            message=(
                                f"required heading {heading!r} not found in "
                                f"{fname!r}"
                            ),
                        )
                    )
        return violations


# --------------------------------------------------------------------------
# required-status-reference (Section 4.4) -- disabled-by-default tier
# --------------------------------------------------------------------------


class RequiredStatusReferenceRule:
    name = "required-status-reference"

    def run(
        self, files: List[Path], target_dir: Path, rule_config: dict
    ) -> List[Violation]:
        violations: List[Violation] = []
        checks = rule_config.get("checks", [])
        for check in checks:
            check_name = check["name"]
            source = check["source"]
            target = check["target"]
            pattern_str = check["pattern"]

            source_path = target_dir / source
            source_rel = _rel_path(source_path, target_dir)
            text = read_text_or_raise(source_path, f"source file {source_rel!r}")
            # N1 discipline: re.MULTILINE always on, no other implicit flags.
            pattern = re.compile(pattern_str, re.MULTILINE)

            if pattern.search(text) is None:
                # target's existence is already validated at config-load
                # time (config.py's resolve_and_check_path, must_exist=True
                # for required-status-reference.target); this rule only
                # checks that `source` contains the configured assertion --
                # it never re-derives or checks `target`'s actual status.
                violations.append(
                    Violation(
                        rule="required-status-reference",
                        check_name=check_name,
                        path=source_rel,
                        start_line=0,
                        end_line=0,
                        message=(
                            f"{source_rel!r} does not contain a match for "
                            f"the configured assertion pattern {pattern_str!r} "
                            f"about {target!r} (presence check only -- this "
                            f"does not verify {target!r}'s actual status)"
                        ),
                    )
                )
        return violations


# --------------------------------------------------------------------------
# canonical-reference (Section 4.6) -- disabled-by-default tier
# --------------------------------------------------------------------------


class CanonicalReferenceRule:
    name = "canonical-reference"

    def run(
        self, files: List[Path], target_dir: Path, rule_config: dict
    ) -> List[Violation]:
        violations: List[Violation] = []
        checks = rule_config.get("checks", [])
        for check in checks:
            check_name = check["name"]
            claiming_file = check["claiming_file"]
            target_reference = check["target_reference"]
            forbidden_restatement_pattern = check.get(
                "forbidden_restatement_pattern"
            )

            claiming_path = target_dir / claiming_file
            claiming_rel = _rel_path(claiming_path, target_dir)
            text = read_text_or_raise(claiming_path, f"claiming_file {claiming_rel!r}")

            # 1. Presence: plain substring match, not regex.
            if target_reference not in text:
                violations.append(
                    Violation(
                        rule="canonical-reference",
                        check_name=check_name,
                        path=claiming_rel,
                        start_line=0,
                        end_line=0,
                        message=(
                            f"{claiming_rel!r} does not contain the required "
                            f"reference {target_reference!r}"
                        ),
                    )
                )

            # 2. Existence: filename-vs-anchor discriminator -- a
            # target_reference ending in .md is a filename (existence
            # checked here, rule-runtime, per Section 3/4.6); anything else
            # is an opaque anchor string, never path-resolved, no existence
            # check performed at all.
            if target_reference.endswith(".md"):
                target_path = (target_dir / target_reference).resolve()
                if not target_path.exists():
                    violations.append(
                        Violation(
                            rule="canonical-reference",
                            check_name=check_name,
                            path=claiming_rel,
                            start_line=0,
                            end_line=0,
                            message=(
                                f"{claiming_rel!r} references "
                                f"{target_reference!r}, which does not exist "
                                "in the doc set"
                            ),
                        )
                    )

            # 3. Optional forbidden-restatement check -- only run if the key
            # is present in the check config; never inferred or defaulted.
            if forbidden_restatement_pattern is not None:
                pattern = re.compile(
                    forbidden_restatement_pattern, re.MULTILINE
                )
                m = pattern.search(text)
                if m is not None:
                    line_no = text.count("\n", 0, m.start()) + 1
                    violations.append(
                        Violation(
                            rule="canonical-reference",
                            check_name=check_name,
                            path=claiming_rel,
                            start_line=line_no,
                            end_line=line_no,
                            message=(
                                f"{claiming_rel!r} both references "
                                f"{target_reference!r} and restates content "
                                "matching the forbidden restatement pattern "
                                f"{forbidden_restatement_pattern!r}"
                            ),
                        )
                    )
        return violations


RULES = {
    "canonical-count": CanonicalCountRule(),
    "forbidden-literal": ForbiddenLiteralRule(),
    "stray-artifact": StrayArtifactRule(),
    "required-files": RequiredFilesRule(),
    "required-status-reference": RequiredStatusReferenceRule(),
    "canonical-reference": CanonicalReferenceRule(),
}

# QC carry-forward (Slice 2 advisory): guard against a future key typo in
# this dict silently making a rule unreachable -- every registered key must
# be one of the six canonical rule names from models.py's RULE_NAMES.
assert set(RULES.keys()) <= set(RULE_NAMES), (
    f"rules.py RULES keys {sorted(RULES.keys())} must be a subset of "
    f"models.RULE_NAMES {sorted(RULE_NAMES)}"
)
