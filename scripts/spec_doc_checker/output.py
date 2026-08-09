"""Output formatting for spec-doc-checker (Section 5)."""

from __future__ import annotations

import json
from typing import List

from .models import CheckerOutput, Violation, SuppressedViolation

SORT_KEY = lambda v: (v.path, v.start_line, v.rule, v.check_name or "")  # noqa: E731


def sort_violations(violations: List[Violation]) -> List[Violation]:
    return sorted(violations, key=SORT_KEY)


def _line_display(v: Violation) -> str:
    if v.start_line == v.end_line:
        return str(v.start_line)
    return f"{v.start_line}-{v.end_line}"


def format_text(output: CheckerOutput) -> str:
    lines = []
    for v in output.violations:
        lines.append(f"[{v.rule}] {v.path}:{_line_display(v)}: {v.message}")
    if output.suppressed:
        lines.append("")
        lines.append("Suppressed:")
        for v in output.suppressed:
            lines.append(
                f"  [{v.rule}] {v.path}:{_line_display(v)}: {v.message} "
                f"(reason: {v.suppression_reason})"
            )
    lines.append("")
    s = output.summary
    lines.append(
        f"files_checked={s.files_checked} rules_run={','.join(s.rules_run)} "
        f"violation_count={s.violation_count} suppressed_count={s.suppressed_count}"
    )
    return "\n".join(lines) + "\n"


def _violation_to_dict(v: Violation) -> dict:
    d = {
        "rule": v.rule,
        "check_name": v.check_name,
        "severity": v.severity,
        "path": v.path,
        "start_line": v.start_line,
        "end_line": v.end_line,
        "message": v.message,
    }
    if isinstance(v, SuppressedViolation):
        d["suppression_reason"] = v.suppression_reason
        d["suppression_source"] = v.suppression_source
    return d


def format_json(output: CheckerOutput) -> str:
    obj = {
        "violations": [_violation_to_dict(v) for v in output.violations],
        "suppressed": [_violation_to_dict(v) for v in output.suppressed],
        "summary": {
            "files_checked": output.summary.files_checked,
            "rules_run": output.summary.rules_run,
            "violation_count": output.summary.violation_count,
            "suppressed_count": output.summary.suppressed_count,
        },
    }
    return json.dumps(obj)
