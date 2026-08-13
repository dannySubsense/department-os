# Spec-Doc Checker — Runbook

Task-oriented "how do I actually use this" guide. For the normative contract, see
[`docs/tooling/spec-doc-checker.md`](spec-doc-checker.md) (LOCKED). For a fast reference, see
[`scripts/README.md`](../../scripts/README.md). This document restates nothing normative — every
claim here traces back to those two.

---

## 1. Check my current sprint's docs before Frank/human review

This is the tool's main use case: run it against `docs/specs/<sprint-slug>/` as a pre-check before
asking for review.

### Do I already have a config?

Check for `docs/specs/<sprint-slug>/spec-doc-checker.yml`. If it exists, skip to "Run it" below.

If it doesn't exist, you can still run the tool with zero config — it falls back to built-in
defaults (`stray-artifact` enabled with its shipped pattern list; every other rule disabled,
because they all need doc-set-specific input like file names or literal strings that can't be
inferred). That's a legitimate first pass, but it only catches stray editing artifacts.

### Authoring a minimal config

Use the real, committed config
[`docs/specs/problem-department-mvp/spec-doc-checker.yml`](../specs/problem-department-mvp/spec-doc-checker.yml)
as your reference shape — it's an actual config run against a real doc set, not the spec's
illustrative example. Notably:

- It leaves `canonical-count` unconfigured entirely. That doc set's Acceptance Criteria section is
  unlabeled checklist bullets grouped under story headers (`US-1`..`US-13`), not individually-IDed
  items — `canonical-count` requires a single-capture-group `id_pattern` that extracts a real
  per-item ID, and there's no such ID token to bind to here. Don't force an ID pattern onto a doc
  set that doesn't have one; it produces a false sense of coverage rather than real checking.
- It enables `stray-artifact`, `forbidden-literal`, and `required-files` (default-enabled tier —
  these are on by default in any config that declares them, and this config declares them
  explicitly for readability).
- It also turns on both disabled-by-default rules (`required-status-reference`,
  `canonical-reference`) deliberately, because this doc set has real, applicable checks for each:
  confirming `05-REVIEW.md` asserts Intake was approved, and confirming `04-ROADMAP.md` references
  `01-REQUIREMENTS.md`'s AC count rather than restating it.
- Its `canonical-reference` check guards `forbidden_restatement_pattern` with a negative lookbehind
  (`(?<!US-)\b\d+\s+acceptance criteria\b`) because the doc set's own text contains phrases like
  "US-3 acceptance criteria" that would otherwise false-positive against an unguarded version of
  the same pattern shown in the spec's own worked example. If you copy a pattern from the spec
  verbatim, check it against your actual doc set's prose first.

Copy that file, point its `files:`/`canonical_source:`/`claiming_file:` entries at your own
sprint's file names, and drop any rule block your doc set doesn't have a real check for.

### Run it

```bash
python3 scripts/check-spec-docs.py docs/specs/<sprint-slug>/
```

If your config isn't at the default location (`<path>/spec-doc-checker.yml`), pass it explicitly:

```bash
python3 scripts/check-spec-docs.py docs/specs/<sprint-slug>/ --config docs/specs/<sprint-slug>/spec-doc-checker.yml
```

### Reading text output

Each line is `[rule-name] path:line: description`. A real example, from running the checker
against `docs/specs/problem-department-mvp/`:

```
[forbidden-literal] docs/specs/foo/03-UI.md:142: 'problem-statement' found within 5 lines of 'negatable' (forbidden proximity)
```

That's `forbidden-literal` reporting one occurrence of `'problem-statement'` too close to
`'negatable'`, in `03-UI.md` at line 142. In the actual problem-department-mvp run, this rule
alone produced 23 such lines across five files (expected and explained below in Section 7) — read
each line as a discrete finding, not a summary.

If the run is clean, exit code is `0` and there's nothing further to do. If not, exit code is `1`
and you move to Section 2.

---

## 2. I got a violation — now what?

Default response: **fix the doc.** Suppression is for genuine false positives — cases where the
rule's mechanical pattern-match caught something that isn't actually the defect it's designed to
catch (see Section 7's stray-artifact example — prose *describing* an artifact, not containing
one). If the finding is real, the fix is editing the spec doc, not suppressing the finding.

### Suppress inline (single finding, one line)

```markdown
<!-- spec-doc-checker: ignore stray-artifact reason="this line quotes </content> as an example inside prose, not a leftover tool artifact" -->
```

Placed on its own line, this binds to the line immediately following it. It can also go at the end
of the same line it's suppressing, appended after content. `RULE-NAME` and a non-empty `reason=`
are both required — an unnamed or unreasoned marker becomes its own `suppression-malformed`
finding, not a working suppression.

### Suppress via config allowlist (broader, file/range-scoped)

```yaml
suppression_allowlist:
  - rule: "stray-artifact"
    file: "05-REVIEW.md"
    line_range: [105, 109]
    reason: "05-REVIEW.md's own artifact-sweep section quotes </content> while describing a past defect, not containing one"
```

`rule`, `file`, `line_range`, and `reason` are all required, `reason` non-empty, `file` a bare
top-level filename (no subdirectory path — discovery is non-recursive so a path-separator value
would never match anything and is rejected as a config error). Use this when you want one
suppression to cover a range of lines or don't want to touch the spec doc's own text with an
inline marker.

### The one thing you cannot suppress: `required-files`

`required-files` missing-file and missing-heading findings are file-level, reported at
`start_line: 0`/`end_line: 0` — there's no line to bind either suppression mechanism to. If you try
anyway, the suppression itself becomes an unmatched `suppression-unused` finding on top of the
original, still-unsuppressed violation. If a file or heading really is optional for your doc set,
remove it from the `required-files` config (`files:` or `required_headings:`) instead of trying to
suppress the resulting violation.

---

## 3. I want machine-readable output

```bash
python3 scripts/check-spec-docs.py docs/specs/<sprint-slug>/ --format json
```

Writes exactly one JSON object to stdout (`violations`, `suppressed`, `summary`) and nothing else —
any tool-diagnostic noise (e.g. "no config found, using defaults") goes to stderr, so stdout stays
parseable in all cases, including a tool error (exit 2). Use this when scripting the checker into
something else (a wrapper script, a future CI step) or piping results somewhere that needs
structure — `summary.violation_count`, `summary.rules_run`, per-violation `path`/`start_line` — 
rather than parsing the text format. Use `--format text` (the default) for a human reading the
output directly; it's the same information, formatted for eyes not code.

---

## 4. I want to run just one rule

```bash
python3 scripts/check-spec-docs.py docs/specs/<sprint-slug>/ --rule canonical-count
```

`--rule` is repeatable and overrides your config's `enabled` flags entirely for that invocation —
it runs only the named rule(s), regardless of whether they're on or off in the config. This is
useful when you're testing a new `canonical-count` (or any rule's) config in isolation, without
needing to also see every other rule's output, or want to exercise one of the disabled-by-default
rules (`required-status-reference`, `canonical-reference`) without flipping `enabled: true`
permanently in the config file.

---

## 5. The tool found nothing — is that good, or is my config wrong?

Both are possible, and the tool cannot tell you which. An empty result means either "genuinely
clean doc set" or "your config isn't actually checking what you think it's checking" — e.g. a rule
you meant to enable is still `enabled: false`, or you passed `--rule` with a typo'd name (which
is a config error, exit `2`, so at least that case surfaces loudly rather than silently).

One thing that does **not** silently produce an empty result: a bad `canonical_source` (or other
required-path) value. Per the spec's config-load rules, most path-bearing keys —
`canonical_source`, `required-status-reference`'s `source`/`target`, `canonical-reference`'s
`claiming_file` — are existence-checked at config-load time; a typo'd path there is a config error,
exit code `2`, not a silent no-op. (The deliberate exceptions are `required-files.files`, whose
missing-file check is that rule's own job at runtime, and `canonical-reference`'s
`target_reference` when it's an anchor string rather than a `.md` filename.) So a genuinely broken
path in most spots gets caught, loudly — but a rule left *disabled*, or a regex that's technically
valid but matches nothing real, will not.

**Sanity check:** run with `--format json` and inspect `summary.rules_run` against what you
expected to be enabled for that invocation. If a rule you meant to check isn't in that list, your
config (or your `--rule` flags) didn't turn it on.

---

## 6. What exit code means for my workflow

- **`0`** — clean run, zero non-suppressed violations. Safe to proceed to Frank/human review.
- **`1`** — the tool ran correctly and found real findings. Don't proceed until each is either
  fixed or explicitly suppressed with a stated reason (Section 2). This is not itself a PASS/FAIL —
  it's telling you there's something to look at before you ask for the binding review.
- **`2`** — the tool itself couldn't complete a run: malformed config, invalid regex, unrecognized
  rule/config key, a missing explicit `--config` file, a config path resolving outside the target
  directory, an unreadable target directory. This is not a verdict on your doc set at all — fix the
  tool invocation/config first, then re-run.

---

## 7. Known limitations to keep in mind

- **Non-recursive discovery.** The tool only looks at `*.md` files directly inside the target
  directory — files in subdirectories are invisible to it. If your sprint has doc files nested one
  level down, they will never be checked, and no error is raised about it.
- **`stray-artifact` is context-free.** It's a flat per-line pattern match with no semantic
  awareness — it cannot distinguish a genuine leftover artifact from prose *describing* one. This
  literally happened in the real AC24 run against `docs/specs/problem-department-mvp/`:
  `05-REVIEW.md:105` and `:109` were flagged for `</content>`, but both hits are inside that
  document's own "Editing-artifact sweep" section, which quotes `</content>` while *describing* a
  past defect it had already checked for — not an actual leftover tool fragment. This is documented
  as an expected, legitimate false positive in
  [`docs/tooling/spec-doc-checker-PROGRESS.md`](spec-doc-checker-PROGRESS.md)'s AC24 section, not a
  tool bug. When you hit this shape, suppress it (Section 2) with a reason explaining the context,
  rather than treating it as something to "fix" in the prose.
- **Mechanical pre-check only, no binding authority.** A clean run (exit `0`) means the mechanical
  rules found nothing — it does not constitute or imply a PASS from Frank or a human reviewer, and
  it never replaces that review. Run it before asking for review, not instead of it.

---

## See also

- [`docs/tooling/spec-doc-checker.md`](spec-doc-checker.md) — full normative contract (rule
  definitions, config schema, exit codes, suppression semantics).
- [`scripts/README.md`](../../scripts/README.md) — fast quickstart reference.
- [`docs/specs/problem-department-mvp/spec-doc-checker.yml`](../specs/problem-department-mvp/spec-doc-checker.yml) — real, committed reference config.
- [`docs/tooling/spec-doc-checker-PROGRESS.md`](spec-doc-checker-PROGRESS.md) — AC24 real-doc-set run record, including the stray-artifact false-positive example above.
