"""Config loading and validation for spec-doc-checker.

Normative source: docs/tooling/spec-doc-checker.md Section 3 ("Configuration
schema"). Every validation rule below cites the spec clause it implements.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any, List, Optional, Tuple

import yaml

from .models import RULE_NAMES, DEFAULT_ENABLED

DEFAULT_CONFIG_FILENAME = "spec-doc-checker.yml"

# Allowed top-level keys (Section 3, "Top-level keys").
TOP_LEVEL_KEYS = {"version", "rules", "suppression_allowlist"}

# Allowed keys within each rule's config subtree (Section 3's complete v1
# example is the normative key set for each rule).
RULE_SUBTREE_KEYS = {
    "canonical-count": {"enabled", "checks"},
    "forbidden-literal": {"enabled", "literals"},
    "stray-artifact": {"enabled", "builtin_patterns", "patterns"},
    "required-files": {"enabled", "files", "required_headings", "heading_match"},
    "required-status-reference": {"enabled", "checks"},
    "canonical-reference": {"enabled", "checks"},
}

CANONICAL_COUNT_CHECK_KEYS = {
    "name",
    "mode",
    "canonical_source",
    "id_pattern",
    "restated_in",
}
CANONICAL_COUNT_RESTATED_IN_KEYS = {"file", "restated_pattern"}
FORBIDDEN_LITERAL_ENTRY_KEYS = {"literal", "forbidden_near", "proximity_lines"}
REQUIRED_STATUS_REFERENCE_CHECK_KEYS = {"name", "source", "target", "pattern"}
CANONICAL_REFERENCE_CHECK_KEYS = {
    "name",
    "claiming_file",
    "target_reference",
    "forbidden_restatement_pattern",
}
ALLOWLIST_ENTRY_KEYS = {"rule", "file", "line_range", "reason"}


class _UniqueKeyLoader(yaml.SafeLoader):
    """SafeLoader variant that rejects duplicate mapping keys instead of
    silently keeping the last value (F1: PyYAML's safe_load does not error
    on duplicate keys by default, which is the forbidden last-write-wins
    behavior per Section 3, "Duplicate rule/check names"). Applies uniformly
    to every mapping in the document (top-level keys, rules:, and any
    nested mapping), not just rules:."""


def _construct_mapping_no_duplicates(loader: yaml.SafeLoader, node: "yaml.Node", deep: bool = False) -> dict:
    mapping: dict = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                f"found duplicate key {key!r}",
                key_node.start_mark,
            )
        value = loader.construct_object(value_node, deep=deep)
        mapping[key] = value
    return mapping


_UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping_no_duplicates
)


class ConfigError(Exception):
    """Raised for any config/CLI condition that maps to exit code 2."""


def _err(msg: str) -> None:
    raise ConfigError(msg)


def _require_mapping(value: Any, where: str) -> dict:
    if not isinstance(value, dict):
        _err(f"{where} must be a mapping")
    return value


def _require_str(value: Any, where: str) -> str:
    if not isinstance(value, str):
        _err(f"{where} must be a string")
    return value


def _require_nonempty_str(value: Any, where: str) -> str:
    s = _require_str(value, where)
    if s.strip() == "":
        _err(f"{where} must be a non-empty string")
    return s


def _compile_regex(pattern: str, where: str) -> "re.Pattern":
    try:
        return re.compile(pattern, re.MULTILINE)
    except re.error as exc:
        _err(f"{where}: invalid regex {pattern!r}: {exc}")


def _is_bare_top_level_filename(value: str) -> bool:
    """True if `value` has no path-separator component (Section 3 /
    Section 6 'bare top-level filename' rule)."""
    return "/" not in value and os.sep not in value and (
        os.altsep is None or os.altsep not in value
    )


def resolve_and_check_path(
    raw: str, target_dir: Path, where: str, must_exist: bool
) -> Path:
    """Resolve `raw` relative to `target_dir` per Section 3 'Path
    resolution'. Always performs the containment check (never absolute,
    never resolves outside target_dir) at config-load time. Existence is
    checked only when `must_exist` is True (callers pass False for the
    rule-runtime-deferred cases: required-files.files, canonical-reference's
    target_reference filename case)."""
    if not isinstance(raw, str) or raw == "":
        _err(f"{where}: path must be a non-empty string")
    if os.path.isabs(raw):
        _err(f"{where}: absolute paths are not permitted ({raw!r})")
    target_resolved = target_dir.resolve()
    candidate = (target_dir / raw).resolve()
    try:
        candidate.relative_to(target_resolved)
    except ValueError:
        _err(f"{where}: path {raw!r} resolves outside the target spec directory")
    if must_exist and not candidate.exists():
        _err(f"{where}: path {raw!r} does not exist")
    return candidate


def _validate_canonical_count(rule_cfg: dict, target_dir: Path) -> dict:
    checks = rule_cfg.get("checks")
    if not isinstance(checks, list) or len(checks) == 0:
        _err("rules.canonical-count.checks must be a non-empty list")
    seen_names = set()
    for i, check in enumerate(checks):
        where = f"rules.canonical-count.checks[{i}]"
        check = _require_mapping(check, where)
        unknown = set(check.keys()) - CANONICAL_COUNT_CHECK_KEYS
        if unknown:
            _err(f"{where}: unknown key(s) {sorted(unknown)}")
        name = _require_nonempty_str(check.get("name"), f"{where}.name")
        if name in seen_names:
            _err(f"rules.canonical-count.checks: duplicate name {name!r}")
        seen_names.add(name)
        mode = check.get("mode")
        if mode not in ("enumerate", "compare"):
            _err(f"{where}.mode must be 'enumerate' or 'compare'")
        canonical_source = _require_nonempty_str(
            check.get("canonical_source"), f"{where}.canonical_source"
        )
        resolve_and_check_path(
            canonical_source, target_dir, f"{where}.canonical_source", must_exist=True
        )
        id_pattern = _require_nonempty_str(check.get("id_pattern"), f"{where}.id_pattern")
        _compile_regex(id_pattern, f"{where}.id_pattern")
        restated_in = check.get("restated_in", [])
        if mode == "compare" and not restated_in:
            _err(f"{where}: mode 'compare' requires a non-empty restated_in list")
        if restated_in is not None:
            if not isinstance(restated_in, list):
                _err(f"{where}.restated_in must be a list")
            for j, entry in enumerate(restated_in):
                ewhere = f"{where}.restated_in[{j}]"
                entry = _require_mapping(entry, ewhere)
                unknown = set(entry.keys()) - CANONICAL_COUNT_RESTATED_IN_KEYS
                if unknown:
                    _err(f"{ewhere}: unknown key(s) {sorted(unknown)}")
                file_ = _require_nonempty_str(entry.get("file"), f"{ewhere}.file")
                resolve_and_check_path(
                    file_, target_dir, f"{ewhere}.file", must_exist=True
                )
                pat = _require_nonempty_str(
                    entry.get("restated_pattern"), f"{ewhere}.restated_pattern"
                )
                _compile_regex(pat, f"{ewhere}.restated_pattern")
    return rule_cfg


def _validate_forbidden_literal(rule_cfg: dict, target_dir: Path) -> dict:
    literals = rule_cfg.get("literals")
    if not isinstance(literals, list) or len(literals) == 0:
        _err("rules.forbidden-literal.literals must be a non-empty list")
    for i, entry in enumerate(literals):
        where = f"rules.forbidden-literal.literals[{i}]"
        entry = _require_mapping(entry, where)
        unknown = set(entry.keys()) - FORBIDDEN_LITERAL_ENTRY_KEYS
        if unknown:
            _err(f"{where}: unknown key(s) {sorted(unknown)}")
        _require_nonempty_str(entry.get("literal"), f"{where}.literal")
        forbidden_near = entry.get("forbidden_near", [])
        if not isinstance(forbidden_near, list):
            _err(f"{where}.forbidden_near must be a list")
        if forbidden_near:
            if "proximity_lines" not in entry:
                _err(
                    f"{where}: proximity_lines is required when forbidden_near "
                    "is non-empty"
                )
            prox = entry["proximity_lines"]
            if not isinstance(prox, int) or isinstance(prox, bool) or prox < 0:
                _err(f"{where}.proximity_lines must be a non-negative integer")
    return rule_cfg


def _validate_stray_artifact(rule_cfg: dict, target_dir: Path) -> dict:
    builtin = rule_cfg.get("builtin_patterns", True)
    if not isinstance(builtin, bool):
        _err("rules.stray-artifact.builtin_patterns must be a bool")
    patterns = rule_cfg.get("patterns", [])
    if not isinstance(patterns, list):
        _err("rules.stray-artifact.patterns must be a list")
    for i, pat in enumerate(patterns):
        where = f"rules.stray-artifact.patterns[{i}]"
        pat = _require_nonempty_str(pat, where)
        _compile_regex(pat, where)
    rule_cfg["builtin_patterns"] = builtin
    rule_cfg["patterns"] = patterns
    return rule_cfg


def _validate_required_files(rule_cfg: dict, target_dir: Path) -> dict:
    files = rule_cfg.get("files")
    if not isinstance(files, list) or len(files) == 0:
        _err("rules.required-files.files must be a non-empty list")
    for i, f in enumerate(files):
        where = f"rules.required-files.files[{i}]"
        f = _require_nonempty_str(f, where)
        # Existence deferred to rule-runtime (Section 3); containment is
        # still checked now.
        resolve_and_check_path(f, target_dir, where, must_exist=False)
    required_headings = rule_cfg.get("required_headings", {})
    if not isinstance(required_headings, dict):
        _err("rules.required-files.required_headings must be a mapping")
    for fname, headings in required_headings.items():
        where = f"rules.required-files.required_headings[{fname!r}]"
        # F4: the mapping's keys are file paths and must pass the same
        # containment check applied to required-files.files entries.
        resolve_and_check_path(fname, target_dir, where, must_exist=False)
        if not isinstance(headings, list) or any(
            not isinstance(h, str) or h.strip() == "" for h in headings
        ):
            _err(f"{where} must be a list of non-empty strings")
    # N5: a `required_headings` key that does not exactly match an entry in
    # `files` is silently unreachable at rule-runtime (RequiredFilesRule only
    # iterates required_headings for files it is also iterating from `files`)
    # -- this must be a config-load-time error instead, identifying the
    # offending orphan key.
    orphan_keys = sorted(set(required_headings.keys()) - set(files))
    if orphan_keys:
        _err(
            "rules.required-files.required_headings: key(s) "
            f"{orphan_keys!r} do not match any entry in "
            f"rules.required-files.files {list(files)!r}"
        )
    heading_match = rule_cfg.get("heading_match", "exact")
    if heading_match != "exact":
        _err("rules.required-files.heading_match must be 'exact' in v1")
    rule_cfg["heading_match"] = heading_match
    rule_cfg["required_headings"] = required_headings
    return rule_cfg


def _validate_required_status_reference(rule_cfg: dict, target_dir: Path) -> dict:
    checks = rule_cfg.get("checks")
    if not isinstance(checks, list) or len(checks) == 0:
        _err(
            "rules.required-status-reference.checks must be a non-empty list"
        )
    seen_names = set()
    for i, check in enumerate(checks):
        where = f"rules.required-status-reference.checks[{i}]"
        check = _require_mapping(check, where)
        unknown = set(check.keys()) - REQUIRED_STATUS_REFERENCE_CHECK_KEYS
        if unknown:
            _err(f"{where}: unknown key(s) {sorted(unknown)}")
        name = _require_nonempty_str(check.get("name"), f"{where}.name")
        if name in seen_names:
            _err(f"rules.required-status-reference.checks: duplicate name {name!r}")
        seen_names.add(name)
        source = _require_nonempty_str(check.get("source"), f"{where}.source")
        resolve_and_check_path(source, target_dir, f"{where}.source", must_exist=True)
        target = _require_nonempty_str(check.get("target"), f"{where}.target")
        resolve_and_check_path(target, target_dir, f"{where}.target", must_exist=True)
        pattern = _require_nonempty_str(check.get("pattern"), f"{where}.pattern")
        _compile_regex(pattern, f"{where}.pattern")
    return rule_cfg


def _validate_canonical_reference(rule_cfg: dict, target_dir: Path) -> dict:
    checks = rule_cfg.get("checks")
    if not isinstance(checks, list) or len(checks) == 0:
        _err("rules.canonical-reference.checks must be a non-empty list")
    seen_names = set()
    for i, check in enumerate(checks):
        where = f"rules.canonical-reference.checks[{i}]"
        check = _require_mapping(check, where)
        unknown = set(check.keys()) - CANONICAL_REFERENCE_CHECK_KEYS
        if unknown:
            _err(f"{where}: unknown key(s) {sorted(unknown)}")
        name = _require_nonempty_str(check.get("name"), f"{where}.name")
        if name in seen_names:
            _err(f"rules.canonical-reference.checks: duplicate name {name!r}")
        seen_names.add(name)
        claiming_file = _require_nonempty_str(
            check.get("claiming_file"), f"{where}.claiming_file"
        )
        resolve_and_check_path(
            claiming_file, target_dir, f"{where}.claiming_file", must_exist=True
        )
        target_reference = _require_nonempty_str(
            check.get("target_reference"), f"{where}.target_reference"
        )
        # target_reference existence is rule-runtime (Section 3/4.6). Judgment
        # call: apply the containment check now only when it is filename-
        # shaped (ends in .md), per the same .md discriminator used for
        # existence — an anchor string is never path-resolved at all.
        if target_reference.endswith(".md"):
            resolve_and_check_path(
                target_reference,
                target_dir,
                f"{where}.target_reference",
                must_exist=False,
            )
        if "forbidden_restatement_pattern" in check:
            pat = _require_nonempty_str(
                check["forbidden_restatement_pattern"],
                f"{where}.forbidden_restatement_pattern",
            )
            _compile_regex(pat, f"{where}.forbidden_restatement_pattern")
    return rule_cfg


_RULE_VALIDATORS = {
    "canonical-count": _validate_canonical_count,
    "forbidden-literal": _validate_forbidden_literal,
    "stray-artifact": _validate_stray_artifact,
    "required-files": _validate_required_files,
    "required-status-reference": _validate_required_status_reference,
    "canonical-reference": _validate_canonical_reference,
}


def _validate_allowlist(raw_allowlist: Any, target_dir: Path) -> List[dict]:
    if raw_allowlist is None:
        return []
    if not isinstance(raw_allowlist, list):
        _err("suppression_allowlist must be a list")
    entries = []
    for i, entry in enumerate(raw_allowlist):
        where = f"suppression_allowlist[{i}]"
        entry = _require_mapping(entry, where)
        missing = ALLOWLIST_ENTRY_KEYS - set(entry.keys())
        if missing:
            _err(f"{where}: missing required key(s) {sorted(missing)}")
        unknown = set(entry.keys()) - ALLOWLIST_ENTRY_KEYS
        if unknown:
            _err(f"{where}: unknown key(s) {sorted(unknown)}")
        rule = entry["rule"]
        if rule not in RULE_NAMES:
            _err(f"{where}.rule: unrecognized rule name {rule!r}")
        file_ = _require_nonempty_str(entry["file"], f"{where}.file")
        if not _is_bare_top_level_filename(file_):
            _err(
                f"{where}.file must be a bare top-level filename with no "
                f"path-separator component ({file_!r})"
            )
        line_range = entry["line_range"]
        if (
            not isinstance(line_range, list)
            or len(line_range) != 2
            or not all(isinstance(x, int) and not isinstance(x, bool) for x in line_range)
            or line_range[0] < 1
            or line_range[1] < line_range[0]
        ):
            _err(f"{where}.line_range must be [start, end], 1-indexed, start<=end")
        reason = _require_nonempty_str(entry["reason"], f"{where}.reason")
        entries.append(
            {
                "rule": rule,
                "file": file_,
                "line_range": (line_range[0], line_range[1]),
                "reason": reason,
                "_index": i,
            }
        )
    return entries


def default_config() -> dict:
    """Built-in defaults used when no config file is found and --config was
    not given explicitly (Section 3, CLI Contract): stray-artifact enabled
    with builtin_patterns True and no user patterns; all five other rules
    disabled."""
    rules = {}
    for name in RULE_NAMES:
        rules[name] = {"enabled": False}
    rules["stray-artifact"] = {
        "enabled": True,
        "builtin_patterns": True,
        "patterns": [],
    }
    return {
        "version": 1,
        "rules": rules,
        "suppression_allowlist": [],
    }


def load_config(
    config_arg: Optional[str], target_dir: Path
) -> Tuple[dict, bool, Optional[Path]]:
    """Load and validate config per Section 3. Returns
    (config, used_default, config_path).

    config_path is None when built-in defaults were used (no config file was
    consulted at all); otherwise the path of the config file that was
    loaded, for use as the location of config-originated violations
    (Section 5).

    Raises ConfigError (caller maps to exit code 2) for any malformed
    config. Missing config at the default location (no --config given) is
    NOT an error — falls back to default_config(). Missing file when
    --config WAS given explicitly IS an error.
    """
    if config_arg is not None:
        config_path = Path(config_arg)
        try:
            config_exists = config_path.exists()
        except OSError as exc:
            _err(f"could not access --config path: {config_arg}: {exc}")
        if not config_exists:
            _err(f"--config path does not exist: {config_arg}")
    else:
        config_path = target_dir / DEFAULT_CONFIG_FILENAME
        try:
            config_exists = config_path.exists()
        except OSError as exc:
            _err(f"target directory is not readable: {target_dir}: {exc}")
        if not config_exists:
            print(
                "spec-doc-checker: no config file found at "
                f"{config_path}; using built-in defaults "
                "(stray-artifact only)",
                file=sys.stderr,
            )
            return default_config(), True, None

    try:
        raw_text = config_path.read_text()
    except OSError as exc:
        _err(f"could not read config file {config_path}: {exc}")

    try:
        raw = yaml.load(raw_text, Loader=_UniqueKeyLoader)
    except yaml.YAMLError as exc:
        _err(f"config file {config_path} is not valid YAML: {exc}")

    if not isinstance(raw, dict):
        _err(f"config file {config_path} must be a YAML mapping at the top level")

    unknown_top = set(raw.keys()) - TOP_LEVEL_KEYS
    if unknown_top:
        _err(f"config: unknown top-level key(s) {sorted(unknown_top)}")

    if "version" not in raw:
        _err("config: missing required top-level key 'version'")
    if type(raw["version"]) is not int or raw["version"] != 1:
        _err(f"config: unsupported version {raw['version']!r}; only 1 is accepted in v1")

    if "rules" not in raw:
        _err("config: missing required top-level key 'rules'")
    raw_rules = _require_mapping(raw["rules"], "rules")

    unknown_rules = set(raw_rules.keys()) - set(RULE_NAMES)
    if unknown_rules:
        _err(f"config.rules: unrecognized rule name(s) {sorted(unknown_rules)}")

    resolved_rules = {}
    for name in RULE_NAMES:
        rule_cfg = raw_rules.get(name)
        if rule_cfg is None:
            resolved_rules[name] = {"enabled": False}
            continue
        rule_cfg = _require_mapping(rule_cfg, f"rules.{name}")
        unknown = set(rule_cfg.keys()) - RULE_SUBTREE_KEYS[name]
        if unknown:
            _err(f"rules.{name}: unknown key(s) {sorted(unknown)}")
        enabled = rule_cfg.get("enabled", DEFAULT_ENABLED[name])
        if not isinstance(enabled, bool):
            _err(f"rules.{name}.enabled must be a bool")
        rule_cfg = dict(rule_cfg)
        rule_cfg["enabled"] = enabled
        rule_cfg = _RULE_VALIDATORS[name](rule_cfg, target_dir)
        resolved_rules[name] = rule_cfg

    allowlist = _validate_allowlist(raw.get("suppression_allowlist"), target_dir)
    _attach_allowlist_line_numbers(allowlist, raw_text)

    return (
        {
            "version": 1,
            "rules": resolved_rules,
            "suppression_allowlist": allowlist,
        },
        False,
        config_path,
    )


def _compose_allowlist_entry_lines(raw_text: str) -> List[int]:
    """Return the real 1-indexed source line number of each
    `suppression_allowlist` sequence entry, in document order, using
    `yaml.compose()` for actual parser position info (F2). Works for both
    block-style (`- rule: ...`) and flow-style (`- {rule: ..., ...}`) YAML
    lists, since the line numbers come from the parser's node marks, not
    from text pattern-matching."""
    try:
        root = yaml.compose(raw_text, Loader=yaml.SafeLoader)
    except yaml.YAMLError:
        return []
    if root is None or not isinstance(root, yaml.MappingNode):
        return []
    for key_node, value_node in root.value:
        if key_node.value == "suppression_allowlist" and isinstance(
            value_node, yaml.SequenceNode
        ):
            return [entry_node.start_mark.line + 1 for entry_node in value_node.value]
    return []


def _attach_allowlist_line_numbers(allowlist: List[dict], raw_text: str) -> None:
    """Attach the real 1-indexed line number of each allowlist entry within
    the raw config text, in document order, for use as Section 5's
    config-originated violation location (F2: previously fell back to the
    spec-doc's line_range start when a text-scan heuristic failed to match,
    fabricating a config-file line number)."""
    entry_lines = _compose_allowlist_entry_lines(raw_text)
    for entry, line_no in zip(allowlist, entry_lines):
        entry["_line"] = line_no
