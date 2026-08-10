"""CLI entry point for spec-doc-checker.

CLI Contract (Section 3):

  python3 scripts/check-spec-docs.py <path> [--config <path>] \
      [--rule <name>]... [--format text|json] [--strict]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List, Optional

from . import config as config_mod
from .config import ConfigError
from .discovery import discover_files
from .models import CheckerOutput, RULE_NAMES, Summary, Violation
from .output import format_json, format_text, sort_violations
from .rules import RULES as RULE_REGISTRY
from .suppression import (
    allowlist_entries_from_config,
    apply_suppressions,
    parse_inline_markers,
)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="check-spec-docs.py",
        description="Mechanical checker for spec doc sets.",
    )
    parser.add_argument("path", help="directory of spec docs to check")
    parser.add_argument("--config", default=None, help="path to config file")
    parser.add_argument(
        "--rule",
        action="append",
        default=None,
        dest="rules",
        help="run only the named rule(s); repeatable",
    )
    parser.add_argument(
        "--format", choices=["text", "json"], default="text", dest="fmt"
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="treat suppressed violations as failures too",
    )
    return parser


def _display_path(path: Path, target_dir: Path) -> str:
    try:
        return str(path.resolve().relative_to(target_dir.resolve()))
    except ValueError:
        return str(path)


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    target_dir = Path(args.path)

    try:
        config, used_default, config_path = config_mod.load_config(
            args.config, target_dir
        )
        files = discover_files(target_dir)

        if args.rules is not None:
            unknown = [r for r in args.rules if r not in RULE_NAMES]
            if unknown:
                raise ConfigError(f"--rule: unrecognized rule name(s) {unknown}")
            rules_to_run = list(dict.fromkeys(args.rules))  # dedupe, keep order
        else:
            rules_to_run = [
                name
                for name in RULE_NAMES
                if config["rules"].get(name, {}).get("enabled", False)
            ]
    except ConfigError as exc:
        print(f"spec-doc-checker: config error: {exc}", file=sys.stderr)
        if args.fmt == "json":
            # F5: a tool error is a distinct condition from a document-set
            # violation. On --format json, stdout must still contain exactly
            # one valid CheckerOutput object (empty, reflecting only work
            # actually completed) — the actionable error goes to stderr.
            empty_output = CheckerOutput(
                violations=[],
                suppressed=[],
                summary=Summary(
                    files_checked=0, rules_run=[], violation_count=0, suppressed_count=0
                ),
            )
            print(format_json(empty_output))
        return 2

    discovered_rel_paths = [_display_path(p, target_dir) for p in files]

    raw_violations: List[Violation] = []
    for rule_name in rules_to_run:
        rule = RULE_REGISTRY.get(rule_name)
        if rule is None:
            # Not implemented yet (Slice 1: registry is empty). Produces no
            # violations — this is required end-to-end behavior for this
            # slice (zero rules -> zero violations, exit 0).
            continue
        rule_config = config["rules"].get(rule_name, {})
        raw_violations.extend(rule.run(files, target_dir, rule_config))

    markers = []
    for path, rel in zip(files, discovered_rel_paths):
        try:
            text = path.read_text()
        except OSError:
            continue
        markers.extend(parse_inline_markers(rel, text))

    allowlist_entries = allowlist_entries_from_config(config)

    config_path_display = None
    if config_path is not None:
        config_path_display = _config_display_path(config_path, args.config, target_dir)

    kept_violations, suppressed = apply_suppressions(
        raw_violations,
        markers,
        allowlist_entries,
        discovered_rel_paths,
        config_path_display,
    )

    kept_violations = sort_violations(kept_violations)
    suppressed = sort_violations(suppressed)

    summary = Summary(
        files_checked=len(files),
        rules_run=rules_to_run,
        violation_count=len(kept_violations),
        suppressed_count=len(suppressed),
    )
    output = CheckerOutput(
        violations=kept_violations, suppressed=suppressed, summary=summary
    )

    if args.fmt == "json":
        print(format_json(output))
    else:
        print(format_text(output), end="")

    return determine_exit_code(kept_violations, suppressed, args.strict)


def determine_exit_code(violations: List, suppressed: List, strict: bool) -> int:
    """Section 5 exit codes: 1 if any non-suppressed violation; with
    --strict, suppressed entries also count toward non-zero exit."""
    if violations:
        return 1
    if strict and suppressed:
        return 1
    return 0


def _config_display_path(
    config_path: Path, config_arg: Optional[str], target_dir: Path
) -> str:
    """Section 5, 'Config-originated violations': absolute if --config was
    given explicitly and resolves outside the target dir; otherwise
    relative to the target dir."""
    target_resolved = target_dir.resolve()
    resolved = config_path.resolve()
    try:
        rel = resolved.relative_to(target_resolved)
        return str(rel)
    except ValueError:
        if config_arg is not None:
            return str(resolved)
        return str(config_path)


if __name__ == "__main__":
    sys.exit(main())
