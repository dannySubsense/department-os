# Spec-Doc Mechanical Checker — Tooling Spec

Status: LOCKED — reviewed and locked by Danny. Implementation may proceed against this document.

Scope note: this is bounded internal tooling, not a Department OS product vertical slice. It does
not go through Intake → Interview → North Star → Requirements → Architecture → UI → Roadmap →
Review → Gate. This single document is the entire spec artifact for this tool.

Revision note: this revision resolves the "illustrative / configurable / deferred to
implementation time" gaps found in Danny's independent review after the prior Frank pass PASSed
an earlier draft. Every contract below is a decision, not an alternative. Where the prior draft
offered "A or B (config permitting)," this revision picks one and moves the other, if worth
keeping at all, to Section 9 as a named future extension.

Revision note 2: this revision fixes four deterministic contradictions Danny's direct review found
in the version that had already PASSed six Frank lock-readiness passes: (1) `required-files`'s
missing-file semantics contradicted between Section 3 and Section 4.5; (2) the built-in
`=======` stray-artifact pattern was mathematically guaranteed to false-positive on ordinary
Markdown Setext headings, contradicting its own acceptance criterion; (3) the rule named
`status-consistency` never actually checked consistency — only presence of an assertion string;
(4) the subdirectory-path suppression-allowlist exemption created a silent hole where a typo'd
path with a directory component could never be flagged by anything. All four are fixed below, not
softened or partially addressed.

Revision note 3: this revision fixes a contradiction Danny's review found in Section 2's framing
of `required-status-reference` and `canonical-reference`. Prior wording ("implemented only after
...", "deferred") was ambiguous between "implemented but off by default" and "not built in v1" —
but Section 7's acceptance criteria and the CLI's explicit `--rule` invocation contract both only
make sense if these two rules are actually implemented, fixture-tested, and runnable in v1. This
revision states unambiguously, everywhere the tier is described: all six rules are implemented and
tested in v1; four are enabled by default; `required-status-reference` and `canonical-reference`
are implemented but disabled by default because they are less battle-tested, and either is run via
explicit `--rule` invocation or by setting `enabled: true` in config. This is a naming/framing fix
only — the two rules' contracts (Section 4.4, 4.6) are unchanged.

---

## 1. Purpose and Non-Goals

### Purpose

During the Problem Department MVP spec sequence, the spec-reviewer/Frank review chain repeatedly
asserted "mechanical sweep complete" while defects of a specific, non-semantic character survived
3+ separate "swept, complete" claims: stray editing/tool artifacts left in files, derived counts
that drifted across sibling documents, and a forbidden literal reintroduced into a context it had
been explicitly excluded from. A human reviewer caught all of these by hand.

This tool exists to make that class of defect mechanically, repeatably, cheaply detectable —
independent of whether the reviewing agent (human or LLM) remembers to check, or asserts it
checked. It runs a fixed set of syntactic/structural rules over a directory of spec markdown
files and reports violations.

### Non-Goals

This tool is explicitly **not**:

- A semantic or correctness checker. It has no opinion on whether a requirement is well-formed,
  whether an architecture decision is sound, or whether acceptance criteria actually cover the
  user story they claim to.
- A replacement for `spec-reviewer` or Frank's judgment gates. Those remain the binding
  judgment authority; this tool is a pre-check that reduces the chance a mechanical defect reaches
  them undetected, not a substitute for their review.
- A general-purpose linter, spellchecker, or prose-quality tool.
- A gate with binding authority of its own. It has no PASS/FAIL/HALT verdict semantics — see
  Section 8.

---

## 2. Scope Tiers (Default-Enabled vs. Disabled-by-Default)

Six rule classes are specified in Section 4. **All six are implemented and tested in v1** (see
Section 7's acceptance criteria, which require fixtures and defined runtime behavior for every one
of them). They differ only in whether they run by default.

**Default-enabled tier** — deterministic, mechanically precise, no free-text inference;
`enabled: true` by default:
- `canonical-count`
- `forbidden-literal`
- `stray-artifact`
- `required-files`

**Disabled-by-default tier** — implemented, tested, and fully available in v1; `enabled: false` by
default because they are the newest and least battle-tested contracts in this document, not
because their design or implementation is incomplete or deferred to a later release:
- `required-status-reference`
- `canonical-reference`

Both disabled-by-default rules are fully specified below (Section 4.4, 4.6) with deterministic,
configuration-driven contracts — the prior draft's free-text/heuristic inference is removed
entirely, not softened. A doc-set author runs either rule in one of two ways, both available from
v1 day one and requiring no further implementation work: setting its config `enabled: true` flag
(Section 3), or invoking it explicitly via `--rule <name>` regardless of its config `enabled`
value (Section 3, CLI Contract).

---

## 3. Inputs, Configuration, and CLI Contract

### Input

A directory of markdown spec documents — e.g. `docs/specs/<sprint-slug>/`. The tool discovers all
`*.md` files directly inside that directory. Discovery is **non-recursive** in v1: files in
subdirectories are not visited. There is no `--recursive` flag in v1 — it is not part of the CLI
contract in Section 3. Recursive discovery is a named future extension (Section 9), not a v1
option under any name.

### Configuration schema (normative, v1, complete)

Configuration is a YAML file, not CLI-flags-only. Rationale: the rule inputs this tool needs
(canonical-source file paths, forbidden-literal lists, required-files lists, per-rule
enable/disable, suppression allowlists) are structured, doc-set-specific, and intended to be
checked into the repo alongside the spec they govern, so a future reviewer can see exactly what
was checked without reconstructing a CLI invocation from history.

Config file: `spec-doc-checker.yml`, expected by default at the root of the target spec directory
(e.g. `docs/specs/<sprint-slug>/spec-doc-checker.yml`), overridable via `--config`.

**Top-level keys (v1, exhaustive):**

| Key | Required | Type | Default if omitted |
|---|---|---|---|
| `version` | yes | integer | — (missing `version` is a config error, exit 2) |
| `rules` | yes | mapping | — (missing `rules` is a config error, exit 2) |
| `suppression_allowlist` | no | list of allowlist entries | `[]` |

- `version: 1` is the only value accepted in v1. Any other value (including absent) is a
  config error, exit code 2. This exists so a future v2 schema change can be detected and
  rejected cleanly rather than silently misparsed.
- **Unknown top-level keys are a config error**, exit code 2. v1 does not silently ignore
  unrecognized keys — an unrecognized key is far more likely to be a typo (e.g. `rule:` instead
  of `rules:`) than an intentional forward-compatible extension.
- **Unknown keys inside any rule's config subtree are likewise a config error**, exit code 2,
  for the same reason. There is no "additive/unknown keys are ignored" behavior anywhere in this
  schema.
- **Path resolution:** every file path in the config (`canonical_source`, `restated_in[].file`,
  `files`, `source`, `target`, allowlist `file`, etc.) is resolved relative to the target spec
  directory given on the CLI (`<path>` positional argument) — never relative to the config file's
  own location, and never as an absolute path. An absolute path, or a relative path that resolves
  (via `..` or symlink) outside the target spec directory, is a config error, exit code 2, at
  config-load time — it is caught and rejected the same way any other malformed path in this
  schema is (see the "path does not exist" case immediately below), not surfaced as a doc-set
  violation, since the config itself is what is malformed. A path that does not exist after
  resolution is likewise a config error, exit code 2, at config-load time for rules that require
  the file to exist up front (`canonical_source`, `required-status-reference` `source`/`target`,
  `canonical-reference` `claiming_file`); rules that merely scan "all files in the doc set" do not
  pre-declare paths and are unaffected. `required-files.files` is deliberately **excluded** from
  this load-time existence check, even though its entries are file paths: per Section 4.5, each
  configured path's existence is that rule's own job, checked at rule-runtime and reported as an
  ordinary doc-set violation (exit code 1) if missing — not a config error. This is necessary for
  the rule to be able to produce its intended diagnostic at all: if a missing required file were
  rejected at config-load time, the rule could never actually report the "file is missing" finding
  it exists to catch. The containment check above (no `..`, not absolute, must resolve inside the
  target spec directory) still applies to every entry in `required-files.files` at config-load
  time — only *existence* is deferred to rule-runtime. `canonical-reference`'s `target_reference`
  is deliberately excluded from this load-time list for a different reason: per Section 4.6's
  filename/anchor discriminator, `target_reference` may be either a `.md` filename (existence
  checked at rule-runtime — a missing file is a doc-set violation, exit code 1, not a config
  error) or an anchor string (never path-resolved, no existence check performed at all). Its
  existence semantics depend on that discriminator and are therefore rule-runtime, not
  config-load-time — see Section 4.6, check 2 ("Existence"), for the authoritative definition.
- **Regex syntax:** every `pattern` value in this schema is a Python 3 `re` module pattern,
  evaluated with `re.MULTILINE` always on and no other flags implied by default. A pattern may
  opt into case-insensitivity or `DOTALL` etc. only via inline flag syntax (`(?i)`, `(?s)`, ...)
  inside the pattern string itself — there is no separate `flags:` config key in v1. An invalid
  regex (fails `re.compile`) is a config error, exit code 2, reported with the offending rule
  name, check name, and the pattern string.
- **Duplicate rule/check names:** `rules` is a mapping keyed by the six rule names in Section 4
  (`canonical-count`, `forbidden-literal`, `stray-artifact`, `required-status-reference`,
  `required-files`, `canonical-reference`) — YAML mapping semantics make a literal duplicate key
  a YAML parse error already, which the tool surfaces as a config error, exit code 2, not a
  silent last-write-wins. Within a rule's own `checks:` list (`canonical-count`,
  `required-status-reference`, `canonical-reference`), each check entry must have a unique `name:`
  field; a duplicate `name:` within the same rule's `checks:` list is a config error, exit code 2.
- **Unrecognized rule name:** a key under `rules:` that is not one of the six names above is a
  config error, exit code 2 (this doubles as the "unknown rule name" acceptance case in Section
  7 — it is caught at config-load time, not silently ignored and not deferred to a runtime
  "unknown rule" diagnostic).
- **Default value of `enabled` when omitted:** every rule subtree accepts an `enabled: bool` key.
  If a rule's config block is present under `rules:` but omits the `enabled` key entirely, the
  default is `true` for the four v1-default-enabled-tier rules (`canonical-count`,
  `forbidden-literal`, `stray-artifact`, `required-files`) and `false` for the two
  disabled-by-default-tier rules (`required-status-reference`, `canonical-reference`) — matching
  each rule's Section 2 scope-tier default. The complete v1 example below sets `enabled` explicitly
  on every rule for clarity; doing so is not required, and omitting it is equivalent to writing the
  default shown here.
- **Built-in patterns (stray-artifact default pattern list, Section 4.3): can they be disabled,
  and how.** Yes. `rules.stray-artifact.builtin_patterns: false` (default `true`) disables the
  shipped default pattern list entirely for that doc set, leaving only whatever is listed under
  `rules.stray-artifact.patterns`. There is no per-builtin-pattern opt-out in v1 — it is
  all-or-nothing at the list level. This is the only "disable a built-in" mechanism in v1; no
  other rule ships with implicit built-in behavior beyond its documented default.
- **`suppression_allowlist[].file` must be a bare top-level filename.** Since v1 discovery is
  strictly non-recursive (see "Input" above), a `file` value containing a path-separator component
  (e.g. `sub/notes.md`) can never correspond to a discoverable file — no rule can ever produce a
  finding there, so no suppression targeting it could ever have an effect. This is a config error,
  exit code 2, at config-load time — not a valid-but-inert entry. See Section 6, "Config-file
  allowlist," for the full rule and how it differs from the (still-permitted) case of a bare
  top-level filename that simply doesn't match any discovered file.

**Complete v1 example (every key that exists in the schema, all six rules present so the shape
is unambiguous — `required-status-reference` and `canonical-reference` are shown with
`enabled: false` by default per the Section 2 scope tiers):**

```yaml
version: 1

rules:
  canonical-count:
    enabled: true
    checks:
      - name: "acceptance-criteria-count"
        mode: "compare"                 # "enumerate" | "compare" — see 4.1
        canonical_source: "01-REQUIREMENTS.md"
        id_pattern: '^AC-(\d+)\b'       # one capture group = the item ID; matched per-line
        restated_in:
          - file: "04-ROADMAP.md"
            restated_pattern: '(\d+)\s+acceptance criteria'   # one capture group = the restated count

  forbidden-literal:
    enabled: true
    literals:
      - literal: "problem-statement"
        forbidden_near: ["NegativeFinding", "negatable"]
        proximity_lines: 5
      - literal: "TODO-REMOVE-BEFORE-LOCK"
        forbidden_near: []              # empty list = global ban, forbidden everywhere in doc set

  stray-artifact:
    enabled: true
    builtin_patterns: true              # true = keep shipped defaults (see 4.3); false = only `patterns:` below
    patterns:
      - '</content>'
      - '</invoke>'
      - '\[REPLACE_MARKER\]'

  required-files:
    enabled: true
    files: ["01-REQUIREMENTS.md", "02-ARCHITECTURE.md", "04-ROADMAP.md", "05-REVIEW.md"]
    required_headings:
      "01-REQUIREMENTS.md": ["Acceptance Criteria", "Out of Scope"]
    heading_match: "exact"              # "exact" is the only value in v1 — see 4.5

  required-status-reference:
    enabled: false                      # disabled-by-default tier (Section 2) — implemented and schema-normative even while disabled
    checks:
      - name: "review-confirms-intake-approved"
        source: "05-REVIEW.md"
        target: "INTAKE.md"
        pattern: 'INTAKE\.md.*APPROVED'   # matched against source file's text; violation if no match found

  canonical-reference:
    enabled: false                      # disabled-by-default tier (Section 2) — implemented and schema-normative even while disabled
    checks:
      - name: "roadmap-points-at-requirements-ac-count"
        claiming_file: "04-ROADMAP.md"
        target_reference: "01-REQUIREMENTS.md"   # literal string that must appear in claiming_file
        forbidden_restatement_pattern: '\b\d+\s+acceptance criteria\b'   # optional; omit key to skip this check

suppression_allowlist:
  - rule: "stray-artifact"
    file: "EXAMPLE-ONLY.md"   # illustrative — not a real file; no such file exists in this repo. Shown only
                               # to illustrate the allowlist entry shape. Do not copy this entry verbatim into
                               # a real config: since "EXAMPLE-ONLY.md" would not exist in any real discovered
                               # doc set, it would itself produce a `suppression-unused` violation (Section 6).
    line_range: [88, 92]
    reason: "illustrative example only, showing the shape of a suppressed stray-artifact finding — not a real suppression"
```

Every key shown above is the complete v1 key set for its rule — there is no config key for any
rule beyond what is shown in this example and described in that rule's own definition in
Section 4.

Note: an allowlist `file` value must be a bare top-level filename with no path-separator
component (config error otherwise, exit code 2 — see above) and should name a file that actually
exists within the discovered (non-recursive, top-level) set. See Section 6, "Unused, malformed,
and unknown-rule suppressions," for what happens when a well-formed, in-bounds `file` value
doesn't match any discovered file.

### CLI Contract

```
python3 scripts/check-spec-docs.py <path> [--config <path>] [--rule <name>]... [--format text|json] [--strict]
```

- `<path>` (required, positional) — directory of spec docs to check.
- `--config <path>` (optional) — path to the config file. If omitted, the tool looks for
  `<path>/spec-doc-checker.yml`. If neither `--config` nor a default-location file exists, this
  is **not** an error: the tool runs with the shipped built-in defaults only (Section 7,
  acceptance criteria — "missing default config"). Built-in defaults are: `stray-artifact`
  enabled with `builtin_patterns: true` and no user `patterns:`; all five other rules disabled
  (they all require doc-set-specific config — `canonical_source`, `literals`, `files`, etc. —
  that cannot be inferred). If `--config <path>` is given explicitly and that path does not
  exist, this **is** an error — exit code 2 (Section 7, "missing explicit `--config` file").
- `--rule <name>` (optional, repeatable) — run only the named rule(s) instead of all enabled
  rules. An unrecognized rule name passed to `--rule` is a config error, exit code 2 (same
  unrecognized-rule-name behavior as Section 3's schema validation). `--rule` may name either of
  the two disabled-by-default-tier rules (`required-status-reference`, `canonical-reference`) or
  any rule that is otherwise `enabled: false` in the config — since both are fully implemented in
  v1, an explicit `--rule` invocation runs the named rule regardless of its config `enabled` flag,
  as the flag governs default-run membership, not availability.
- `--format text|json` (optional, default `text`) — output format, see Section 5.
- `--strict` (optional) — treat suppressed violations as failures too (see Section 6). Off by
  default so suppressions behave as intended (visible, non-blocking).

---

## 4. Rule Catalog (v1, Normative)

Six rule classes, each grounded in an actual defect class encountered in the
problem-department-mvp spec sequence. All six are implemented and tested in v1; scope tier
(default-enabled vs. disabled-by-default) is defined in Section 2.

### 4.1 Canonical enumeration/count consistency (`canonical-count`)

**Defect grounding:** the AC-count-drift history referenced in `05-REVIEW.md` — a total
acceptance-criteria count restated in one document was compared only against another asserted
count, not against the actual enumerated items, so "all documents say 34" could pass review even
if the canonical source actually enumerates 33 uniquely-identified items.

**Two distinct modes, both mechanical, no free-text count inference:**

- **`mode: enumerate`** — the tool scans `canonical_source` line by line, applying `id_pattern`
  (a regex with exactly one capture group identifying an item ID, e.g. `^AC-(\d+)\b`) to every
  line. Every match's captured ID is collected. The computed enumeration result is:
  `{unique_ids: set, duplicate_ids: [ids appearing >1x], malformed_ids: [captured strings that
  don't match a well-formed-ID shape — see below], count: len(unique_ids)}`.
  - A **well-formed ID** is any string matched by the capture group as-is; "malformed" applies
    only when `id_pattern` itself has an optional secondary validation clause — v1 keeps this
    simple: any string the capture group matches is well-formed by definition, EXCEPT an empty
    string capture, which is always malformed (violation).
  - **Duplicate IDs are a violation** in their own right (`canonical-count` reports one violation
    per duplicated ID, citing all line numbers it appears on), independent of any `compare`
    check — this exists to catch a canonical source that mislabels two different items with the
    same ID.
  - A doc-set config need not have any `restated_in` entries for an `enumerate`-mode check to be
    useful: `enumerate` alone (no `compare`) is valid and simply reports duplicates/malformed IDs
    in the canonical source with no downstream comparison.
- **`mode: compare`** — requires an `enumerate` result as its baseline (computed the same way,
  from the same `canonical_source`/`id_pattern` on the same check entry) and one or more
  `restated_in` entries. For each `restated_in` entry, the tool applies `restated_pattern` (a
  regex with exactly one capture group, matched against the whole text of that file) to extract
  the restated number as an integer. If the restated integer does not equal the `enumerate`
  baseline's `count`, that is a violation, reported with both values (restated vs. mechanically
  enumerated) and the canonical source's own duplicate/malformed findings if any — so a reviewer
  sees immediately whether the canonical source itself is inconsistent (33 unique + 1 duplicate
  labeled #34) rather than just "34 ≠ 33."
- A `checks:` entry must set `mode:` explicitly to either `"enumerate"` or `"compare"` — there is
  no default mode and no mode inferred from the presence/absence of `restated_in`.

**Extraction method:** regex against `canonical_source`'s raw lines (`id_pattern`) and regex
against a restating file's raw text (`restated_pattern`) — line-based for ID enumeration
(matching this repo's convention of one ID per line, e.g. an AC table row or a bulleted `AC-NN`
line), single-capture-group regex for restated totals. There is no line-range extraction mode in
v1 (the prior draft's "regex or line-range" alternative is resolved in favor of regex only) and
no general markdown-table parser — both are named future extensions (Section 9) if a doc set's
canonical source shape doesn't fit a per-line regex.

### 4.2 Forbidden or deprecated literals (`forbidden-literal`)

**Defect grounding:** the string `'problem-statement'` appeared in a context where it had been
explicitly excluded (near `NegativeFinding`/`negatable` semantics), and this reintroduction was
not caught by prose review.

**Rule definition:** for each configured `{literal, forbidden_near, proximity_lines}` entry, the
tool scans each file for occurrences of `literal` (plain substring match, not regex). For each
occurrence, it checks whether any string in `forbidden_near` appears within `proximity_lines`
lines (above or below, inclusive) of that occurrence's line. If so, that occurrence is a
violation. `proximity_lines` is required per-literal-entry when `forbidden_near` is non-empty —
there is no tool-wide default value in v1; an entry with non-empty `forbidden_near` and no
`proximity_lines` key is a config error, exit code 2. (This resolves the prior draft's
unspecified-default problem by removing the default rather than inventing an unsourced number.)
A literal with `forbidden_near: []` is a global ban — forbidden anywhere in the doc set,
`proximity_lines` not applicable/not required for that entry.

### 4.3 Stray editing/tool artifacts (`stray-artifact`)

**Defect grounding:** literal strings such as `</content>` and `</invoke>` — leftover fragments
from an agent's own tool-call syntax — were left in committed spec files.

**Rule definition:** flat, global (not proximity-scoped) match against a configured list of
artifact patterns, each an unanchored regex, checked against every line of every file in the doc
set. Any match anywhere is a violation.

**Built-in default pattern list (v1, exhaustive), each with its matching mode:**

| Pattern | Match mode |
|---|---|
| `</content>` | unanchored substring, anywhere on the line |
| `</invoke>` | unanchored substring, anywhere on the line |
| `\[REPLACE_MARKER\]` | unanchored substring, anywhere on the line |
| `^<<<<<<<.*$` | **anchored: full line**, line must start with `<<<<<<<` |
| `^>>>>>>>.*$` | **anchored: full line**, line must start with `>>>>>>>` |

This resolves the false-positive class identified in Danny's review of an earlier, already
"anchored," version of this table: a bare `^=======$` pattern — anchored to line-start and
full-line — still matches a valid Markdown Setext heading underline (`Heading\n=======`) or a
Markdown table separator row of the same width, because a per-line rule has no cross-line context
to distinguish a genuine conflict-marker separator from an ordinary heading underline of identical
text. A context-aware fix (checking for neighboring `<<<<<<<`/`>>>>>>>` markers before treating a
bare `=======` line as a conflict marker) is out of scope for v1: this rule is specified as a flat,
per-line pattern match with no cross-line context model, and adding one is a larger design change,
not a fix. The bare `=======` middle-marker pattern is therefore **removed from the built-in list
entirely**, not merely re-anchored.

The two remaining conflict-marker patterns, `^<<<<<<<.*$` and `^>>>>>>>.*$`, are kept. `<<<<<<<`
has no colliding Markdown construct. `>>>>>>>` is not equally clean: in CommonMark, `>` is the
blockquote marker and consecutive `>` characters nest, so a line beginning with seven `>`
characters is valid syntax for a seven-level-nested blockquote, and `^>>>>>>>.*$` will match it.
This is accepted for v1 as a negligible, pathological-but-real collision — deeply nested
blockquotes of exactly that depth are not a construct any doc set in this repo's spec sequence
uses — and it is suppressible inline (Section 6) on the rare line where it does false-positive,
the same as any other built-in pattern. Note the resulting coverage honestly: v1's built-in
patterns catch the two *outer* lines of an unresolved git conflict marker block, but not the
un-decorated `=======` separator line between them — this rule does not provide full
three-marker conflict-block detection in v1.

Config additions under `patterns:` are **additive** to this built-in list by default
(`builtin_patterns: true`); setting `builtin_patterns: false` (Section 3) replaces the built-in
list entirely with only the configured `patterns:` entries. There is no per-builtin-pattern
opt-out — only the all-or-nothing switch.

### 4.4 Required status assertion presence (`required-status-reference`) — disabled-by-default tier

**Defect grounding:** a document's own header `Status` line (e.g. `**Status**: APPROVED`) can
drift out of sync with what a sibling document claims about it. This rule does **not** detect
that drift directly. It only checks that a sibling document contains a configured, required
assertion string — see "Rule definition" below for the exact, narrower thing it actually checks,
and what it does not.

**Rule definition (v1, fully deterministic — no free-text inference):** each `checks:` entry is
an explicit, configured assertion:

```yaml
checks:
  - name: "review-confirms-intake-approved"
    source: "05-REVIEW.md"
    target: "INTAKE.md"
    pattern: 'INTAKE\.md.*APPROVED'
```

The tool searches the full text of `source` for a match against `pattern` (a regex, `re.MULTILINE`,
no other implicit flags — same regex contract as Section 3). If no match is found anywhere in
`source`, that check is a violation: `source` was configured to assert something about `target`'s
status and does not contain the asserted text. `target` must exist (path-existence checked at
config-load time per Section 3); the rule does **not** independently re-derive `target`'s actual
status line and compare it to the pattern's asserted value — that would require the free-text
status-extraction inference the prior draft relied on. v1's contract is narrower and fully
mechanical: does `source` contain the configured assertion string/pattern, yes or no. This rule
does **not** verify that `target`'s actual status is what `pattern` asserts, and it does **not**
detect drift between what `source` claims and what `target` actually says — that is a distinct,
larger design problem, explicitly out of scope for v1 (Section 9). It only catches the case where
a sibling document was supposed to carry a status assertion and doesn't (e.g. a stale/removed
assertion), never the case where the assertion is present but false. This rule must not be
described anywhere in this document as checking "consistency" between what a source document
claims and what a target document's actual status is — it checks presence of an assertion only.

There is no discovery of status references from unrestricted prose anywhere in this rule. Every
check is authored by a human/agent editing the config file, naming exactly which file asserts
what about which other file.

### 4.5 Required files and headings (`required-files`)

**Defect grounding:** a sprint doc set silently missing an expected file (e.g. no
`05-REVIEW.md`) or a file missing an expected section (e.g. `01-REQUIREMENTS.md` with no "Out of
Scope" heading) is a structural gap that prose review can also silently pass over.

**Rule definition:** for each file in a configured `files` list, verify it exists in the target
directory (violation if missing) — this existence check happens at rule-runtime, not at
config-load time (see Section 3, "Path resolution," for why `required-files.files` is
deliberately excluded from the config-load-time existence check: checking existence up front
would make it impossible for this rule to ever report the missing-file finding it exists to
catch). A missing required file is reported as an ordinary document-set violation, exit code 1 —
never a config error. For each file with a configured `required_headings` list, verify each
heading string appears as a markdown heading line: a line matching
`^#{1,6}\s+<heading text, exact string, case-sensitive>\s*$` after trimming trailing whitespace.
`heading_match: "exact"` is the only value accepted in v1 (the key exists in the schema so a
future `"case-insensitive"` or `"fuzzy"` value can be added later without a schema-shape change,
but setting it to anything other than `"exact"` in v1 is a config error, exit code 2). This
resolves the prior draft's "exact or configurable fuzzy/case-insensitive" alternative in favor of
exact match only.

### 4.6 Cross-document references to canonical definitions (`canonical-reference`) — disabled-by-default tier

**Defect grounding:** the pattern this repo's workflow now prefers (per `04-ROADMAP.md`'s
Output Verification correctly pointing at `01-REQUIREMENTS.md` instead of restating the AC count)
is that downstream docs *reference* a canonical count/list rather than restate it.

**Rule definition (v1, narrowed to deterministic checks only — no nearby-number/list
inference):** each `checks:` entry is:

```yaml
checks:
  - name: "roadmap-points-at-requirements-ac-count"
    claiming_file: "04-ROADMAP.md"
    target_reference: "01-REQUIREMENTS.md"
    forbidden_restatement_pattern: '\b\d+\s+acceptance criteria\b'   # optional
```

The tool performs exactly two (optionally three) checks per entry, all deterministic:

1. **Presence:** `claiming_file`'s full text contains the literal substring `target_reference`
   (plain substring match, not regex).
2. **Existence:** `target_reference` is resolved as either a filename or an explicit anchor
   string, per the discriminator below; if it names a filename, that file (resolved per Section 3
   path rules) must exist in the doc set. If not, violation: the reference points at something
   that isn't there. This existence check is a rule-runtime check, not a config-load-time check —
   a missing target file is reported as an ordinary doc-set violation (exit code 1), not a config
   error (Section 3's load-time path-existence list deliberately excludes `target_reference` for
   this reason). If `target_reference` is an anchor string (not a filename, per the discriminator
   below), this existence check does not apply — there is no file to check for existence, and
   only the presence check (1) and optional restatement check (3) run.
   - **Filename-vs-anchor-string discriminator (normative, v1):** `target_reference` is treated
     as a filename if and only if it ends in `.md` — the only file extension used anywhere else
     in this document's own path conventions (every `file`, `canonical_source`, `source`,
     `target`, `claiming_file`, and allowlist `file` value elsewhere in this schema is a `.md`
     path). Any `target_reference` value not ending in `.md` is treated as an explicit anchor
     string: an opaque literal the tool checks for presence (1) only, with no existence check
     and no path resolution attempted against it.
3. **Optional forbidden-restatement check:** if `forbidden_restatement_pattern` is present in the
   config, the tool checks whether it matches anywhere in `claiming_file`. If it matches,
   violation: the claiming file both references the canonical target and also restates the
   literal value the reference exists to avoid restating. If `forbidden_restatement_pattern` is
   omitted from the check entry, this third check is skipped entirely — it is not inferred or
   defaulted from `target_reference`.

There is no proximity-window inference, no "nearby number or list looks like a restatement"
heuristic, and no attempt to distinguish a "decorative" pointer from a "real" one by any means
other than checks 1–3 above. A doc set that wants to catch restatement must configure
`forbidden_restatement_pattern` explicitly.

---

## 5. Expected Diagnostics and Exit Codes

### Output format

Human-readable text is the default (`--format text`). Each violation reports: rule name, file,
line number(s), and a one-line description of what was expected vs. found.

Example:
```
[forbidden-literal] docs/specs/foo/03-UI.md:142: 'problem-statement' found within 5 lines of 'negatable' (forbidden proximity)
[canonical-count] docs/specs/foo/04-ROADMAP.md:88: restated AC count '34' does not match mechanically enumerated count '33' from 01-REQUIREMENTS.md (1 duplicate ID found: AC-12 on lines 40, 47)
```

### JSON diagnostic schema (normative, v1, complete)

`--format json` writes exactly one JSON object to stdout and nothing else to stdout (diagnostics
about the tool's own execution — e.g. "config not found, using built-in defaults" — go to
stderr, never to stdout, so stdout stays machine-parseable in all cases including exit code 2).

```typescript
interface CheckerOutput {
  violations: Violation[];
  suppressed: SuppressedViolation[];
  summary: {
    files_checked: number;
    rules_run: string[];       // rule names actually run this invocation
    violation_count: number;   // == violations.length
    suppressed_count: number;  // == suppressed.length
  };
}

interface Violation {
  rule: string;             // one of the six rule names in Section 4, OR one of the two
                             // suppression-diagnostic pseudo-rule names emitted by Section 6:
                             // "suppression-malformed" | "suppression-unused"
  check_name: string | null; // the `name:` of the specific check entry, if the rule has sub-checks (canonical-count, required-status-reference, canonical-reference); null for stray-artifact/forbidden-literal/required-files, and always null for suppression-malformed/suppression-unused (they are not sub-checks of a rule)
  severity: "error";         // v1 has exactly one severity level; field exists for forward compatibility
  path: string;              // file path, relative to the target spec directory (the <path> CLI argument)
  start_line: number;        // 1-indexed; for file-level violations (e.g. required-files missing-file) this is 0
  end_line: number;          // 1-indexed; equals start_line for single-line violations
  message: string;           // one-line human-readable description, same content as the text-format line
}

interface SuppressedViolation extends Violation {
  suppression_reason: string;   // non-empty; from the inline marker or allowlist entry that suppressed it
  suppression_source: "inline" | "allowlist";
}
```

**Config-originated violations (`path`/`start_line`/`end_line` semantics):** when a violation
originates from the config file itself — specifically, a `suppression-unused` violation (Section
6) whose offending entry is an allowlist entry under `suppression_allowlist`, rather than an
inline marker in a spec doc — `path` is the config file's own path: absolute, if `--config` was
given explicitly and resolves outside the target spec directory; otherwise relative to the target
spec directory, per the normal rule above. `start_line` and `end_line` are both the line number of
the offending allowlist entry within the config file (its `- rule:` line). This applies only to
allowlist-entry-originated violations; a `suppression-malformed` or `suppression-unused` violation
originating from an inline marker within a spec doc uses that spec doc's own path and marker line,
per the normal rule, unchanged.

**Deterministic result ordering:** `violations` and `suppressed` are each sorted by
`(path, start_line, rule, check_name ?? "")` ascending, `path` compared as a plain string. This
ordering is stable across runs on an unchanged doc set/config and is required so that
`--format json` output is diffable and CI-safe once/if this tool is later wired into anything
that compares runs (Section 9) — not because that wiring exists in v1.

### Exit codes

- `0` — clean run, zero non-suppressed violations.
- `1` — one or more violations found (the tool ran correctly and found real problems).
- `2` — tool error: bad/malformed config, invalid regex, unrecognized rule/config key, missing
  explicit `--config` file, a config path resolving outside the target spec directory (Section 3,
  "Path resolution"), an unreadable target directory, or any other condition that means the tool
  could not complete a run — distinguished from `1` so a caller can tell "the doc set has
  problems" apart from "the tool itself couldn't run." An **empty target directory** (exists,
  readable, contains zero `.md` files) is not a tool error — it is exit code `0` with
  `files_checked: 0`, since an empty doc set trivially has zero violations.

---

## 6. False-Positive / Suppression Behavior

A rule must be locally suppressible for a legitimate exception without disabling it doc-set-wide.

### Inline marker (v1, exact contract)

```
<!-- spec-doc-checker: ignore RULE-NAME reason="non-empty justification text" -->
```

- **`RULE-NAME` is required.** There is no bare `ignore` form in v1 — the prior draft's
  ambiguity between "names a specific rule" and "allows a bare ignore" is resolved by removing
  the bare form entirely, since it makes broad accidental suppression too easy. A marker with no
  rule name is a malformed-suppression diagnostic (see "Unused, malformed, and unknown-rule
  suppressions" below), not a valid suppression of
  anything.
- **`reason="..."` is required and must be non-empty** after trimming whitespace. A marker
  missing `reason=` or with an empty string is a malformed-suppression diagnostic.
- **Binding: preceding-line only.** A marker placed on its own line binds to the **immediately
  following line only** (line N binds to line N+1; if line N+1 itself has findings, all of them
  for the named `RULE-NAME` on that line are suppressed; findings on line N+2 or later are not).
  This resolves the prior draft's unspecified multi-finding/nearby-line ambiguity.
- **Same-line marker is also allowed, as a fixed v1 behavior, not a config option.** A marker
  appended after content on the same line binds to that same line only. There is no config key
  that turns this on or off — both forms (preceding-line and same-line) are always available, and
  which one an author uses is a per-marker authoring choice, not a doc-set configuration choice.
- A marker naming a rule that produces no finding on its bound line is **not** an error by
  itself at the marker level — see "unused suppression" handling below, which is where this is
  actually diagnosed.
- **Suppressions can target built-in patterns.** A `stray-artifact` built-in pattern match is
  suppressible by the same inline-marker mechanism as any config-defined pattern — there is no
  distinction between built-in and configured rule content for suppression purposes.

### Config-file allowlist (coarser, file/range-scoped)

```yaml
suppression_allowlist:
  - rule: "stray-artifact"
    file: "EXAMPLE-ONLY.md"   # illustrative — not a real file; no such file exists in this repo. Shown only
                               # to illustrate the allowlist entry shape. Do not copy this entry verbatim into
                               # a real config: since "EXAMPLE-ONLY.md" would not exist in any real discovered
                               # doc set, it would itself produce a `suppression-unused` violation (see below).
    line_range: [88, 92]
    reason: "illustrative example only, showing the shape of a suppressed stray-artifact finding — not a real suppression"
```

- `rule`, `file`, `line_range` (`[start, end]`, both 1-indexed inclusive), and `reason` are all
  required keys on every allowlist entry. `reason` must be non-empty (same rule as inline
  markers). Any entry missing a required key, or with an empty `reason`, is a config error, exit
  code 2, at load time — not a silently-accepted no-op.
- `rule` must name one of the six rule names in Section 4 (an unrecognized rule name here is the
  same "unrecognized rule name" config error as elsewhere).
- **`file` must be a bare top-level filename — no directory-separator component is permitted.**
  Since discovery is strictly non-recursive (Section 3), a `file` value containing a path
  separator (e.g. `sub/notes.md`) can never correspond to any file the tool ever visits, so it can
  never suppress a real finding. Such a value is rejected as a **config error, exit code 2, at
  config-load time** (Section 3) — it is malformed input, not a valid-but-inert entry. There is no
  exemption for subdirectory-shaped `file` values in v1; a typo'd or malformed path is surfaced
  immediately as a tool error rather than becoming a silent, permanently-inert allowlist entry.
- A `file` value that **is** a bare top-level filename (no path separator, and therefore
  config-valid) but that does not match any discovered top-level `.md` file (e.g. a typo'd
  `05-REVEIW.md`) is **not** a config error — it passes config-load-time validation, since it is
  well-formed, and is instead treated as `suppression-unused` (see "Unused, malformed, and
  unknown-rule suppressions" below) at rule-run time, since it can never match a real finding and
  is very likely a typo worth surfacing every run, the same as any other unused suppression. An
  allowlist entry's `file` should name a real, discovered top-level file whenever the intent is to
  actually suppress a finding.

### Unused, malformed, and unknown-rule suppressions

- **Malformed inline marker** (missing rule name, missing/empty reason, or unparseable
  attribute syntax): reported as its own diagnostic category — `stray-artifact`-style content
  violation is not raised in its place, but a `[suppression-malformed]` violation is, at the
  marker's own line, with `rule: "suppression-malformed"` in JSON output. This makes a broken
  marker visible in the same violations list rather than silently doing nothing.
- **Unknown-rule marker** (names a `RULE-NAME` that is not one of the six rule names in Section
  4): same treatment — a `[suppression-malformed]` violation, since a marker naming a
  nonexistent rule can never suppress anything and is very likely a typo.
- **Unused suppression** — reported as a `[suppression-unused]` violation at the marker's/entry's
  own location. This category covers two distinct shapes, both real violations in v1's default
  (non-strict) mode:
  - (a) a well-formed marker or allowlist entry naming a real rule, bound to a real line/range
    within the discovered file set, but that rule produces no finding there to suppress; or
  - (b) a config-valid allowlist entry (a bare top-level `file` value, per "Config-file allowlist"
    above) that does not match any file in the discovered (non-recursive, top-level) set.

  In either shape, an unused suppression is either stale configuration (the defect it once
  covered was fixed, or the target file was renamed/removed, and the marker wasn't removed) or a
  typo in the target rule/file/line, and both are worth surfacing every run, not just under
  `--strict`. There is no exemption from `suppression-unused` in v1 beyond the config-load-time
  rejection of directory-separator-containing `file` values described above.

### Non-negotiable suppression semantics

A suppression is never silent. In text output, suppressed violations are listed in a separate
"Suppressed" section with their reason, not simply omitted from output. In JSON output, they
appear under `suppressed`, structurally distinct from `violations` (Section 5). Exit code 0
requires zero non-suppressed violations (note: `suppression-malformed` and `suppression-unused`
findings are themselves ordinary, non-suppressed violations under `violations` — they count
toward exit code `1` in default mode, since a broken suppression is a real problem, not a
suppressed one). `--strict` makes entries under `suppressed` count toward a non-zero exit too.

---

## 7. Test Fixtures and Acceptance Criteria

### Fixture strategy

One minimal fixture spec-doc-set per rule class, under
`scripts/tests/fixtures/spec-doc-checker/<rule-name>/`, each containing:

- A `fail/` variant: a minimal doc set (2-4 short markdown files, not full spec docs) that
  intentionally contains exactly the one defect the rule targets, and nothing else that would
  trip other rules.
- A `pass/` variant: the same minimal doc set with that defect corrected, and otherwise identical,
  proving the rule doesn't false-positive on the clean version.

Six rule classes → minimum twelve fixture doc sets (six `fail/` + six `pass/`), each
self-contained and small enough to read in full in one sitting — deliberately not reusing the
real problem-department-mvp docs as fixtures, so fixture behavior stays decoupled from that doc
set's own evolution. This applies equally to all six rules, including the two disabled-by-default
rules (`required-status-reference`, `canonical-reference`) — being off by default does not exempt
them from fixture coverage; their fixtures are exercised directly via `--rule` (Section 3).

### Acceptance criteria (v1, complete)

"The checker works" means, at minimum, all of the following pass:

**Core rule behavior:**
1. Each of the six rules — including the two disabled-by-default rules, exercised via explicit
   `--rule` invocation — has at least one `fail/` fixture that produces exactly the expected
   violation (rule name, check_name where applicable, file, and line match expectation) and exit
   code `1`.
2. Each of the six rules — including the two disabled-by-default rules, exercised via explicit
   `--rule` invocation — has at least one `pass/` fixture that produces zero violations for that
   rule and exit code `0`.
3. `canonical-count` `fail/` fixtures cover both failure shapes distinctly: (a) canonical declared
   count agrees with a downstream restatement but disagrees with the mechanically enumerated
   count (e.g. all documents say "34" but only 33 unique IDs are enumerable) — this must be
   caught by `mode: compare` against the `enumerate` baseline, not by any restated-vs-restated
   comparison; and (b) the canonical source itself contains duplicate IDs, reported as violations
   independent of any downstream comparison.
4. A `canonical-count` fixture with a malformed ID (empty capture) produces a violation
   distinguishable from a duplicate-ID violation.

**Config/CLI edge cases:**
5. Running with no `--config` flag and no `spec-doc-checker.yml` present in `<path>` runs with
   built-in defaults (stray-artifact only) and does not error.
6. Running with an explicit `--config <path>` where `<path>` does not exist produces exit code
   `2`.
7. A config with an unrecognized top-level key, an unrecognized rule name, or an unrecognized
   key inside a rule's subtree each independently produce exit code `2`.
8. A config with an invalid regex in any pattern-bearing field produces exit code `2`, citing the
   offending rule/check/pattern.
9. A config path (`canonical_source`, `files` entry, etc.) that resolves outside the target spec
   directory (via `..` or absolute path) produces a config error, exit code 2, identifying the
   offending path and rule/check — not a silent follow, and not a crash.
10. Running against a target directory that does not exist, or exists but is unreadable
    (permissions), produces exit code `2`.
11. Running against a target directory that exists, is readable, and contains zero `.md` files
    produces exit code `0` with `files_checked: 0`.

**Output contract:**
12. `--format json` writes a single JSON object to stdout matching the schema in Section 5, and
    nothing else to stdout, for both a clean run and a run with violations, suppressions, and a
    tool error (exit code 2) — stderr may carry additional detail in all three cases.
13. Given the same doc set and config, two consecutive runs produce byte-identical `violations`
    and `suppressed` ordering in JSON output (deterministic ordering, Section 5).

**Suppression:**
14. A well-formed inline marker naming a real rule with a non-empty reason, bound to a line with
    a real finding for that rule, moves that finding from `violations` to `suppressed` in default
    mode, and back into the failing set under `--strict`.
15. A same-line marker variant of (14) behaves identically.
16. A marker with no rule name, or an empty `reason=`, produces a `suppression-malformed`
    violation (not a silently-ignored marker, and not a suppression of the content it was meant
    to suppress).
17. A marker naming a rule not in the six-rule set produces a `suppression-malformed` violation.
18. A well-formed marker bound to a line/rule pair with no actual finding produces a
    `suppression-unused` violation.
19. A `suppression_allowlist` entry missing any required key, or with an empty `reason`, produces
    exit code `2` at config-load time.
20. A `suppression_allowlist` entry whose `file` value contains a path-separator component (e.g.
    `sub/notes.md`) produces exit code `2` at config-load time — not a silently-accepted,
    permanently-inert entry, and not a `suppression-unused` violation (Section 3, Section 6,
    "Config-file allowlist").
21. `stray-artifact`'s built-in pattern list does not include a bare `=======` pattern (removed
    per Section 4.3): a dedicated `pass/` fixture containing a genuine markdown Setext-heading
    underline (`Heading\n=======`) produces zero `stray-artifact` violations, while a separate
    `fail/` fixture containing actual `<<<<<<<`/`>>>>>>>` conflict-marker lines still produces
    `stray-artifact` violations for those two built-in patterns.
22. A `stray-artifact` fixture where a built-in pattern (e.g. `</content>`) is present in a file
    and `rules.stray-artifact.builtin_patterns: false` is configured, with a separately configured
    custom pattern (under `patterns:`) also present somewhere in the same file: the run must NOT
    report the built-in-pattern occurrence, while the custom-pattern occurrence still IS reported
    as a violation — proving `builtin_patterns: false` is all-or-nothing at the built-in-list
    level (Section 3, Section 4.3) and does not affect user-configured `patterns:` entries.
23. A `suppression_allowlist` entry whose `file` is a bare top-level filename (no path separator,
    so config-valid) that does not match any file in the discovered (non-recursive, top-level) set
    (e.g. a typo'd `05-REVEIW.md` when only `05-REVIEW.md` exists) produces a `suppression-unused`
    violation, exit code `1`, per Section 6, "Config-file allowlist" and "Unused, malformed, and
    unknown-rule suppressions."

**Real-doc-set run:**
24. Running the tool against the real `docs/specs/problem-department-mvp/` doc set, once a
    config is authored for it, produces a specific, stated result recorded in this repo (e.g. in
    `PROGRESS.md` for the sprint that implements this tool) at implementation time — the exact
    expected result is not knowable until the tool and that doc set's config exist, but
    producing and recording *some* deterministic result against that real doc set is part of
    acceptance, precisely because that doc set is the one known to have contained the defects
    this tool exists to catch.

---

## 8. Integration Boundary

This tool is **local/manual use only** for v1. Intended usage: a spec-sequence contributor (human
or agent) runs it against a sprint's `docs/specs/<sprint-slug>/` directory before invoking Frank's
spec-gate, as a pre-check — not as part of the gate itself.

It is explicitly **not**:
- Wired into any git hook (pre-commit, pre-push, or otherwise).
- Wired into CI.
- Given any binding authority over Frank's or spec-reviewer's verdicts. A clean run does not
  constitute or imply a PASS from either.

This is a **deliberate boundary**, not an oversight or a placeholder for "someday soon." The
tool's own reliability (false-positive rate, coverage, config-authoring ergonomics) has not yet
been proven across doc sets other than the fixtures and problem-department-mvp. Wiring it into
anything blocking before that reliability is demonstrated over real use would recreate exactly
the failure mode this whole effort exists to avoid — a mechanical-sounding check being trusted
before it has earned that trust.

---

## 9. Future Extension Model

**New rules:** the six rules in Section 4 are implemented as independent, individually
enable/disable-able units sharing a common interface (a "rule" takes the doc-set path plus its
own config subtree, and returns a list of violations in the schema from Section 5). This
registry-like structure is chosen so a seventh, eighth, etc. rule can be added later as a new
self-contained unit without touching existing rule implementations — but no specific mechanism
(plugin discovery, external rule packages, etc.) is committed to now; a simple in-repo module
list is sufficient for the rule count this tool starts with.

**Named future extensions (not committed, not scheduled, not designed beyond this one-line
statement of intent):**
- Recursive doc-set discovery (`--recursive` or equivalent) for spec directories with
  subdirectories.
- Line-range-based (rather than per-line-regex) canonical extraction for `canonical-count`, for
  canonical sources whose ID list doesn't fit a one-match-per-line regex.
- A general markdown-table-aware extraction mode for `canonical-count`.
- Fuzzy/case-insensitive heading matching for `required-files` (the `heading_match` config key
  exists specifically to accept this later without a schema-shape change).
- `required-status-reference` truth-checking (verifying the asserted status is actually correct,
  not just present, and detecting drift between what a source document claims and what a target
  document's actual status is) — out of scope in v1 per Section 4.4. This is a materially larger
  design problem (deterministic status extraction from free-form document headers) and is
  deliberately not attempted in this revision.
- Context-aware conflict-marker detection for `stray-artifact` (recognizing a bare `=======` line
  as a conflict marker only when it sits between `<<<<<<<` and `>>>>>>>` lines, rather than
  treating every occurrence identically) — out of scope in v1 per Section 4.3; the current rule is
  a flat, per-line pattern match with no cross-line context model.
- Per-builtin-pattern opt-out for `stray-artifact` (v1 has only the all-or-nothing
  `builtin_patterns` switch).
- Anchor-string support for `canonical-reference` `target_reference` beyond the `.md`-extension
  discriminator's plain presence/restatement checks (e.g. resolving an anchor string to a
  specific heading or line within a file, rather than treating it as an opaque literal) — out of
  scope in v1 per Section 4.6.

**Graduation path (not committed now):** if, after a period of real use, the tool demonstrates
low false-positive rate and stable behavior across multiple spec sequences, it could graduate to:
- A required (but still non-blocking, warn-only) step surfaced automatically at spec-gate time.
- Eventually, a blocking pre-gate check that Frank's gate refuses to run without.
- A CI step on doc-set changes.

None of these are decided or scheduled by this document. They are named here only so the JSON
output format (Section 5) and rule-registry structure (above) are not accidentally designed in a
way that would block that future path if Danny later chooses it.
