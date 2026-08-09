"""Suppression engine for spec-doc-checker.

Normative source: docs/tooling/spec-doc-checker.md Section 6.

This module owns:
  - Parsing inline `<!-- spec-doc-checker: ignore ... -->` markers out of
    spec doc files.
  - A `SuppressionTracker` that Slice 2/3 rule implementations are not
    required to touch directly — the suppression pass runs centrally, after
    all rules have produced their raw violations, in cli.py. Rules just
    return ordinary Violations; they need not know about suppression at all.
  - `apply_suppressions`, which splits a raw violation list into
    (kept_violations, suppressed_violations) and adds
    `suppression-malformed` / `suppression-unused` violations.

Interface note for Slice 2/3: nothing here needs to change when real rules
are added. `apply_suppressions` takes the full raw violation list (from
every rule that ran) plus the parsed markers/allowlist and does the
matching; a rule implementation never needs to call into this module.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional, Tuple

from .models import RULE_NAMES, Violation, SuppressedViolation

MARKER_RE = re.compile(
    r"<!--\s*spec-doc-checker:\s*ignore(?P<rest>.*?)-->", re.DOTALL
)
RULE_TOKEN_RE = re.compile(r"^\s*(?P<rule>[^\s\"]+)")
REASON_RE = re.compile(r'reason\s*=\s*"(?P<reason>[^"]*)"')


@dataclass
class InlineMarker:
    path: str  # relative path of the file the marker was found in
    marker_line: int  # 1-indexed line the marker text itself sits on
    bound_line: int  # 1-indexed line this marker suppresses findings on
    rule: Optional[str]  # None if unparseable / missing
    reason: Optional[str]  # None if missing/empty
    malformed: bool
    malformed_reason: str = ""


def parse_inline_markers(path_str: str, text: str) -> List[InlineMarker]:
    """Parse every `spec-doc-checker: ignore ...` marker in `text`.

    Binding (Section 6): a marker that is the only content on its line binds
    to the immediately following line (preceding-line form). A marker with
    other content on the same line binds to that same line (same-line form).
    """
    lines = text.splitlines()
    markers: List[InlineMarker] = []
    for idx, line in enumerate(lines):
        line_no = idx + 1
        for m in MARKER_RE.finditer(line):
            rest = m.group("rest")
            before = line[: m.start()]
            after = line[m.end():]
            same_line = bool(before.strip()) or bool(after.strip())
            bound_line = line_no if same_line else line_no + 1

            rule_match = RULE_TOKEN_RE.match(rest)
            rule_token = rule_match.group("rule") if rule_match else None
            if rule_token == "":
                rule_token = None
            # A token that is actually the start of `reason=` means no rule
            # name was supplied at all.
            if rule_token is not None and rule_token.startswith("reason="):
                rule_token = None

            reason_match = REASON_RE.search(rest)
            reason = reason_match.group("reason") if reason_match else None

            malformed = False
            malformed_reason = ""
            if rule_token is None:
                malformed = True
                malformed_reason = "missing RULE-NAME"
            elif rule_token not in RULE_NAMES:
                malformed = True
                malformed_reason = f"unrecognized rule name {rule_token!r}"
            if reason is None or reason.strip() == "":
                malformed = True
                malformed_reason = (
                    malformed_reason + "; missing or empty reason"
                    if malformed_reason
                    else "missing or empty reason"
                )

            markers.append(
                InlineMarker(
                    path=path_str,
                    marker_line=line_no,
                    bound_line=bound_line,
                    rule=None if malformed else rule_token,
                    reason=None if (reason is None or reason.strip() == "") else reason,
                    malformed=malformed,
                    malformed_reason=malformed_reason,
                )
            )
    return markers


@dataclass
class AllowlistEntry:
    rule: str
    file: str
    start_line: int
    end_line: int
    reason: str
    config_line: Optional[int]


def allowlist_entries_from_config(config: dict) -> List[AllowlistEntry]:
    entries = []
    for e in config.get("suppression_allowlist", []):
        start, end = e["line_range"]
        entries.append(
            AllowlistEntry(
                rule=e["rule"],
                file=e["file"],
                start_line=start,
                end_line=end,
                reason=e["reason"],
                config_line=e.get("_line"),
            )
        )
    return entries


class SuppressionTracker:
    """Tracks which markers/allowlist entries matched a real violation, so
    unmatched ones can be reported as `suppression-unused` once all rules
    have run. Slice 2/3 rule implementations do not need to touch this
    class directly — `apply_suppressions` below drives it."""

    def __init__(
        self,
        markers: List[InlineMarker],
        allowlist: List[AllowlistEntry],
        discovered_paths: List[str],
    ):
        self.markers = markers
        self.allowlist = allowlist
        self.discovered_paths = set(discovered_paths)
        self._marker_used = [False] * len(markers)
        self._allowlist_used = [False] * len(allowlist)

    def find_suppressor(
        self, violation: Violation
    ) -> Optional[Tuple[str, str, int]]:
        """Return (reason, source, index) for the first marker/allowlist
        entry that covers this violation, marking it used, or None."""
        # Inline markers: match on path + rule + the marker's bound line
        # falling within [start_line, end_line] of the violation.
        for i, m in enumerate(self.markers):
            if m.malformed:
                continue
            if (
                m.path == violation.path
                and m.rule == violation.rule
                and violation.start_line <= m.bound_line <= violation.end_line
            ):
                self._marker_used[i] = True
                return (m.reason, "inline", i)
        # Config allowlist: match on file + rule + line_range overlap.
        for i, a in enumerate(self.allowlist):
            if a.file not in self.discovered_paths:
                continue
            if (
                a.file == violation.path
                and a.rule == violation.rule
                and not (
                    violation.end_line < a.start_line
                    or violation.start_line > a.end_line
                )
            ):
                self._allowlist_used[i] = True
                return (a.reason, "allowlist", i)
        return None

    def unused_markers(self) -> List[InlineMarker]:
        return [
            m
            for i, m in enumerate(self.markers)
            if not m.malformed and not self._marker_used[i]
        ]

    def unused_allowlist_entries(self) -> List[AllowlistEntry]:
        return [
            a
            for i, a in enumerate(self.allowlist)
            if not self._allowlist_used[i]
        ]

    def missing_file_allowlist_entries(self) -> List[AllowlistEntry]:
        """Allowlist entries whose `file` (already config-load-time valid as
        a bare filename) does not match any discovered file — Section 6
        shape (b) of `suppression-unused`."""
        return [a for a in self.allowlist if a.file not in self.discovered_paths]


def apply_suppressions(
    raw_violations: List[Violation],
    markers: List[InlineMarker],
    allowlist: List[AllowlistEntry],
    discovered_paths: List[str],
    config_path_display: Optional[str],
) -> Tuple[List[Violation], List[SuppressedViolation]]:
    """Split raw_violations into (kept, suppressed) and append
    suppression-malformed / suppression-unused diagnostics to `kept`.

    `config_path_display` is the path string to use for allowlist-entry-
    originated suppression-unused violations (Section 5, "Config-originated
    violations"). May be None if no config file was consulted.
    """
    tracker = SuppressionTracker(markers, allowlist, discovered_paths)

    kept: List[Violation] = []
    suppressed: List[SuppressedViolation] = []

    for v in raw_violations:
        match = tracker.find_suppressor(v)
        if match is None:
            kept.append(v)
        else:
            reason, source, _idx = match
            suppressed.append(
                SuppressedViolation(
                    rule=v.rule,
                    check_name=v.check_name,
                    path=v.path,
                    start_line=v.start_line,
                    end_line=v.end_line,
                    message=v.message,
                    severity=v.severity,
                    suppression_reason=reason,
                    suppression_source=source,
                )
            )

    for m in markers:
        if m.malformed:
            kept.append(
                Violation(
                    rule="suppression-malformed",
                    check_name=None,
                    path=m.path,
                    start_line=m.marker_line,
                    end_line=m.marker_line,
                    message=f"malformed suppression marker: {m.malformed_reason}",
                )
            )

    for m in tracker.unused_markers():
        kept.append(
            Violation(
                rule="suppression-unused",
                check_name=None,
                path=m.path,
                start_line=m.marker_line,
                end_line=m.marker_line,
                message=(
                    f"suppression marker for rule '{m.rule}' bound to line "
                    f"{m.bound_line} produced no finding to suppress"
                ),
            )
        )

    for a in tracker.unused_allowlist_entries():
        path_display = config_path_display or "<config>"
        # F2: config_line is the allowlist entry's real source line within
        # the config file (attached via yaml.compose in config.py). It must
        # never fall back to a.start_line, which is a spec-doc line number
        # unrelated to the config file and would fabricate a location.
        line = a.config_line if a.config_line is not None else 1
        kept.append(
            Violation(
                rule="suppression-unused",
                check_name=None,
                path=path_display,
                start_line=line,
                end_line=line,
                message=(
                    f"suppression_allowlist entry for rule '{a.rule}' file "
                    f"'{a.file}' lines {a.start_line}-{a.end_line} produced "
                    "no finding to suppress, or its file was not found in "
                    "the discovered doc set"
                ),
            )
        )

    return kept, suppressed
