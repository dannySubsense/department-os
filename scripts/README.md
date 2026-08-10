# scripts/

## spec-doc-checker

A mechanical, non-semantic checker for spec-doc consistency defects — stray editing/tool
artifacts, count drift between a canonical source and a downstream restatement, forbidden literals
reintroduced near excluded contexts, and missing required files/headings. It has no opinion on
whether a requirement is well-formed or an architecture decision is sound. It is a pre-check that
reduces the chance a mechanical defect reaches human/Frank review undetected — **not** a
replacement for that review, and it carries no PASS/FAIL/HALT authority of its own.

Full normative spec: [`docs/tooling/spec-doc-checker.md`](../docs/tooling/spec-doc-checker.md)
(Status: LOCKED). This README is a quickstart, not a restatement — read the spec for the complete
contract before authoring config beyond what's shown here.

### Quickstart

Run with no config — the tool falls back to built-in defaults (`stray-artifact` enabled with its
shipped pattern list; all other rules disabled since they need doc-set-specific config):

```bash
python3 scripts/check-spec-docs.py docs/specs/<sprint-slug>/
```

Run with a config file (default location `<path>/spec-doc-checker.yml`, or pass `--config`
explicitly):

```bash
python3 scripts/check-spec-docs.py docs/specs/<sprint-slug>/ --config docs/specs/<sprint-slug>/spec-doc-checker.yml
```

Other flags: `--rule <name>` (repeatable — run only named rule(s), regardless of its config
`enabled` value), `--format text|json` (default `text`), `--strict` (suppressed violations also
count as failures).

### The six rules

Full contracts: spec Section 4.

| Rule | Catches | Default |
|---|---|---|
| `canonical-count` | A restated count (in one doc) drifting from the mechanically enumerated count (in a canonical source), plus duplicate/malformed IDs in the canonical source itself | enabled |
| `forbidden-literal` | A banned string reintroduced globally or within N lines of another banned string | enabled |
| `stray-artifact` | Leftover tool/editing fragments (`</content>`, `</invoke>`, conflict markers, etc.) | enabled |
| `required-files` | A missing expected file, or a file missing an expected heading | enabled |
| `required-status-reference` | A sibling doc missing a configured required status-assertion string (presence only — not truth-checking) | disabled |
| `canonical-reference` | A claiming file not referencing (or restating instead of referencing) a canonical target | disabled |

The two disabled-by-default rules are fully implemented and fixture-tested — run them via
`enabled: true` in config or `--rule <name>` on the CLI.

### Worked config example

[`docs/specs/problem-department-mvp/spec-doc-checker.yml`](../docs/specs/problem-department-mvp/spec-doc-checker.yml)
is a real, authored config run against that sprint's actual doc set, with rationale comments
explaining each choice (including why `canonical-count` was deliberately left unconfigured for
that doc set). Use it as the reference shape for authoring a new config rather than starting from
the spec's illustrative schema example.

### Exit codes

- `0` — clean run, zero non-suppressed violations (an empty `.md`-file doc set also exits `0`).
- `1` — the tool ran correctly and found one or more real violations.
- `2` — tool error: malformed config, invalid regex, unrecognized rule/key, missing explicit
  `--config` file, a config path resolving outside the target directory, or an unreadable target
  directory.

### Suppression

Inline marker, binds to the following line (or same-line if appended after content):

```
<!-- spec-doc-checker: ignore RULE-NAME reason="non-empty justification text" -->
```

Coarser file/range-scoped suppression via `suppression_allowlist` in the config file (`rule`,
`file`, `line_range`, `reason` all required — see spec Section 6 for the schema). A suppression is
never silent — it's still reported, just moved to a separate suppressed list (or counted as a
failure under `--strict`).

**Caveat that matters most in practice:** `required-files` missing-file/missing-heading findings
are file-level (`start_line: 0`), so neither suppression mechanism can bind to them — any attempt
to suppress one produces its own `suppression-unused` violation on top of the original,
unsuppressed finding. If a file or heading is genuinely optional for a doc set, remove it from
`required-files` config instead of trying to suppress it.

### Running the tests

```bash
python3 -m pytest scripts/tests/ -v
```

158 tests, covering all six rules' fixtures under `scripts/tests/fixtures/spec-doc-checker/`, plus
config/CLI edge cases, output-contract, and suppression behavior.
