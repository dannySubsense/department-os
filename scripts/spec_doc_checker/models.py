"""Shared data model for spec-doc-checker.

Types here mirror the normative TypeScript interfaces in
docs/tooling/spec-doc-checker.md Section 5 (Violation, SuppressedViolation,
CheckerOutput), translated to Python dataclasses.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Protocol

# The six rule names normative in Section 4 of the spec, plus the two
# suppression-diagnostic pseudo-rule names emitted by Section 6.
RULE_NAMES = (
    "canonical-count",
    "forbidden-literal",
    "stray-artifact",
    "required-status-reference",
    "required-files",
    "canonical-reference",
)

SUPPRESSION_PSEUDO_RULE_NAMES = (
    "suppression-malformed",
    "suppression-unused",
)

# Section 2 scope tiers: default `enabled` value per rule when a rule's
# config block is present but omits `enabled`, and also the default when a
# rule is entirely absent from `rules:` (built-in defaults, Section 3 CLI
# Contract) except stray-artifact's own special-cased built-in default,
# handled in config.py.
DEFAULT_ENABLED = {
    "canonical-count": True,
    "forbidden-literal": True,
    "stray-artifact": True,
    "required-files": True,
    "required-status-reference": False,
    "canonical-reference": False,
}


@dataclass
class Violation:
    rule: str
    check_name: Optional[str]
    path: str
    start_line: int
    end_line: int
    message: str
    severity: str = "error"

    def sort_key(self):
        return (self.path, self.start_line, self.rule, self.check_name or "")


@dataclass
class SuppressedViolation(Violation):
    suppression_reason: str = ""
    suppression_source: str = "inline"  # "inline" | "allowlist"


@dataclass
class Summary:
    files_checked: int
    rules_run: List[str]
    violation_count: int
    suppressed_count: int


@dataclass
class CheckerOutput:
    violations: List[Violation] = field(default_factory=list)
    suppressed: List[SuppressedViolation] = field(default_factory=list)
    summary: Summary = None


class Rule(Protocol):
    """Interface every rule implementation (Slice 2/3) must satisfy.

    A rule takes the discovered file list, the target directory, and its own
    validated config subtree, and returns a flat list of Violations. Rules
    must not apply suppression themselves — that is done centrally in
    cli.py/suppression.py after all rules have run, per Section 6.
    """

    name: str

    def run(
        self, files: List[Path], target_dir: Path, rule_config: dict
    ) -> List[Violation]:
        ...


# Registry of implemented rules, keyed by rule name. Slice 2 adds the four
# default-enabled-tier rules (scripts/spec_doc_checker/rules.py); Slice 3
# adds the two disabled-by-default-tier rules. A rule name absent from this
# registry simply produces zero violations when run/enabled, which remains
# required end-to-end behavior for any not-yet-implemented rule (Section 7's
# "runs with zero rules producing zero violations" case).
#
# models.py is a lower-level module (data structures, shared types) and must
# not import rules.py (a higher-level module implementing rule logic) at
# module scope -- doing so previously created a circular import
# (rules.py imports Violation from models.py). Callers that need the
# registry should import rules.RULES directly (see cli.py) rather than
# reaching into models.py for it.
