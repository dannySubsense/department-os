# Spec-Doc Mechanical Checker — Tooling Spec (PROPOSAL, awaiting Danny's review/lock)

Status: DRAFT — not yet reviewed or locked. Do not begin implementation against this document
until Danny has reviewed and locked it.

Scope note: this is bounded internal tooling, not a Department OS product vertical slice. It does
not go through Intake → Interview → North Star → Requirements → Architecture → UI → Roadmap →
Review → Gate. This single document is the entire spec artifact for this tool.

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
  Section 7.

---

## 2. Inputs, Configuration, and CLI Contract

### Input

A directory of markdown spec documents — e.g. `docs/specs/<sprint-slug>/`. The tool discovers all
`*.md` files in that directory (non-recursive by default; a `--recursive` flag may extend this,
see Section 8) and treats them as one doc set to be checked against each other and against rule
definitions.

### Configuration

**Judgment call:** configuration is a YAML file, not CLI-flags-only. Rationale: the rule
inputs this tool needs (canonical-source file paths, forbidden-literal lists, required-files
lists, per-rule enable/disable, suppression allowlists) are structured, doc-set-specific, and
intended to be checked into the repo alongside the spec they govern (so a future reviewer can see
exactly what was checked, without reconstructing a CLI invocation from history). CLI flags remain
available for one-off overrides (e.g. running a single rule ad hoc) but are not the primary
configuration surface.

Config file: `spec-doc-checker.yml`, expected by default at the root of the target spec directory
(e.g. `docs/specs/<sprint-slug>/spec-doc-checker.yml`), overridable via `--config`.

Config shape (illustrative, not exhaustive — exact schema finalized at implementation time):

```yaml
rules:
  canonical-count:
    enabled: true
    checks:
      - name: "acceptance-criteria-count"
        canonical_source: "01-REQUIREMENTS.md"
        canonical_pattern: "..."      # how to extract the true count from the canonical doc
        restated_in:
          - file: "04-ROADMAP.md"
            pattern: "..."            # how to extract the restated count
  forbidden-literal:
    enabled: true
    literals:
      - literal: "problem-statement"
        forbidden_near: ["NegativeFinding", "negatable"]
        proximity_lines: 5
  stray-artifact:
    enabled: true
    patterns:
      - "</content>"
      - "</invoke>"
      - "[REPLACE_MARKER]"
      - "<<<<<<<"
      - "======="
      - ">>>>>>>"
  status-consistency:
    enabled: true
  required-files:
    enabled: true
    files: ["01-REQUIREMENTS.md", "02-ARCHITECTURE.md", "04-ROADMAP.md", "05-REVIEW.md"]
    required_headings:
      "01-REQUIREMENTS.md": ["Acceptance Criteria", "Out of Scope"]
  canonical-reference:
    enabled: true
```

### CLI Contract

```
python3 scripts/check-spec-docs.py <path> [--config <path>] [--rule <name>]... [--format text|json] [--strict]
```

- `<path>` (required, positional) — directory of spec docs to check.
- `--config <path>` (optional) — override default config file location.
- `--rule <name>` (optional, repeatable) — run only the named rule(s) instead of all
  enabled rules. Rule names correspond to the top-level keys in Section 3.
- `--format text|json` (optional, default `text`) — output format, see Section 4.
- `--strict` (optional) — treat suppressed violations as failures too (see Section 5). Off by
  default so suppressions behave as intended (visible, non-blocking).

---

## 3. Initial Rule Catalog

Six rule classes, each grounded in an actual defect class encountered in the
problem-department-mvp spec sequence.

### 3.1 Canonical enumeration/count consistency (`canonical-count`)

**Defect grounding:** the AC-count-drift history referenced in `05-REVIEW.md` — a total
acceptance-criteria count (e.g. "35") restated in one document had to match a recount performed
against the canonical source document, and prior passes had let these drift.

**Rule definition:** for each configured check, the tool extracts a count (or enumerated list) from
a designated *canonical source* file using a configured extraction pattern, then extracts the
*restated* value from one or more *other* files using their own configured patterns, and compares.
A mismatch is a violation. The preferred remediation the tool encourages (see 3.6) is for
downstream docs to *point at* the canonical doc rather than restate the number — but this rule
class exists for the interim/legacy case where restatement is still present and must at least be
correct.

**Judgment call:** extraction is pattern-based (regex or line-range with a labeled anchor), not a
general markdown-table parser, to keep the tool dependency-light and its behavior auditable from
the config file alone.

### 3.2 Forbidden or deprecated literals (`forbidden-literal`)

**Defect grounding:** the string `'problem-statement'` appeared in a context where it had been
explicitly excluded (near `NegativeFinding`/`negatable` semantics), and this reintroduction was
not caught by prose review.

**Rule definition:** for each configured `{literal, forbidden_near, proximity_lines}` entry, the
tool scans each file for occurrences of `literal`. For each occurrence, it checks whether any
string in `forbidden_near` appears within `proximity_lines` lines (above or below) of that
occurrence. If so, that occurrence is a violation.

**Judgment call:** proximity-based (line-window) matching, not same-sentence or same-paragraph
matching, because spec docs are structured with headers/tables where "context" is better expressed
in line distance than prose-sentence boundaries. `proximity_lines` is configurable per-literal and
its default (if omitted) is a tool default — that default itself needs to be marked PROVISIONAL
with a named owner in the tool's own config schema documentation once implemented, per this repo's
no-unsourced-numbers discipline. A literal with no `forbidden_near` entries is simply forbidden
everywhere in the doc set (global ban), covering the simpler case (e.g. a literal known to be fully
deprecated).

### 3.3 Stray editing/tool artifacts (`stray-artifact`)

**Defect grounding:** literal strings such as `</content>` and `</invoke>` — leftover fragments
from an agent's own tool-call syntax — were left in committed spec files.

**Rule definition:** flat, global (not proximity-scoped) string/regex match against a configured
list of known artifact patterns. Any match anywhere in any file in the doc set is a violation. This
is the simplest rule class — no canonical source, no context window — because these strings should
never legitimately appear in a spec document's prose. Default pattern list ships with the tool
(covering common tool-call fragments and unresolved git conflict markers) and is extensible via
config, not replaced by it (config additions are additive to the built-in list unless a doc set
opts out per-pattern).

### 3.4 Stale or contradictory document statuses (`status-consistency`)

**Defect grounding:** a document's own header `Status` line (e.g. `**Status**: APPROVED`) can
drift out of sync with what a sibling document claims about it, or a stated PASS/FAIL claim can
fail to match a referenced gate log.

**Rule definition:** two sub-checks:
1. **Self-status extraction** — each file's own status line (matched via a configured pattern,
   e.g. `**Status**: (.*)`) is extracted and indexed by filename.
2. **Cross-reference check** — any other file that references another file's status by name (e.g.
   "INTAKE.md — Status: APPROVED") is checked against the indexed value from (1); mismatches are
   violations. Where a gate-log file is configured (e.g. `GATE-LOG.md`), a PASS/FAIL claim in a
   review doc is checked against the corresponding entry in that log the same way.

**Judgment call:** this rule requires the most doc-set-specific configuration (patterns for where
status lines live and how cross-references are phrased) because status-line conventions are not
yet standardized across this repo's doc templates. Ships with sensible defaults matching this
repo's current `**Status**:` convention; doc sets using a different convention must configure it.

### 3.5 Required files and headings (`required-files`)

**Defect grounding:** distinct from the historical defects above but named by Danny as part of the
same mechanical-check category — a sprint doc set silently missing an expected file (e.g. no
`05-REVIEW.md`) or a file missing an expected section (e.g. `01-REQUIREMENTS.md` with no "Out of
Scope" heading) is a structural gap that prose review can also silently pass over.

**Rule definition:** for each file in a configured `files` list, verify it exists in the target
directory (violation if missing). For each file with a configured `required_headings` list, verify
each heading string appears as a markdown heading (line starting with one or more `#` followed by
that exact text, or a configurable fuzzy/case-insensitive match — exact match is the default) in
that file.

### 3.6 Cross-document references to canonical definitions (`canonical-reference`)

**Defect grounding:** the pattern this repo's workflow now prefers (per `04-ROADMAP.md`'s
Output Verification correctly pointing at `01-REQUIREMENTS.md` instead of restating the AC count)
is that downstream docs *reference* a canonical count/list rather than restate it. This rule class
checks that such a reference, where claimed, is real and resolvable — not merely a restatement
dressed up as a pointer.

**Rule definition:** for each configured `{claiming_file, claim_pattern, target_file}` triple, the
tool scans `claiming_file` for text matching `claim_pattern` (e.g. a phrase like "see 01 for the
canonical count" or "recomputed from source"), and verifies that (a) `target_file` exists and is
the file actually named/linked in that claim, and (b) the claim is not immediately followed
(within a configured line window) by a restated literal number/list that duplicates the same
information the pointer claims to defer to — since a restatement adjacent to a "see canonical
source" claim indicates the pointer is decorative, not real. A claim with no resolvable target, or
a claim contradicted by an adjacent restatement, is a violation.

**Judgment call:** this rule is the least mechanically precise of the six (it is inferring intent
from phrasing), so it ships as best-effort pattern matching, is expected to need the most tuning,
and is called out in Section 8 as the rule most likely to need registry-pattern iteration.

---

## 4. Expected Diagnostics and Exit Codes

### Output format

Human-readable text is the default and the only format required for v1 (`--format text`). Each
violation reports: rule name, file, line number(s), and a one-line description of what was
expected vs. found.

Example (illustrative):
```
[forbidden-literal] docs/specs/foo/03-UI.md:142: 'problem-statement' found within 5 lines of 'negatable' (forbidden proximity)
[canonical-count] docs/specs/foo/04-ROADMAP.md:88: restated AC count '34' does not match canonical count '35' in 01-REQUIREMENTS.md
```

**Judgment call:** JSON output (`--format json`) is specced now, not deferred, because this tool is
explicitly a candidate for future CI/pre-gate wiring (Section 8) and retrofitting structured output
onto a text-only tool later is needless rework. JSON output is not, however, wired into anything
blocking in v1 (Section 7) — it exists so that future integration doesn't require a rewrite of the
diagnostic layer, not because CI wiring is happening now.

JSON shape (illustrative):
```json
{
  "violations": [
    {"rule": "forbidden-literal", "file": "...", "line": 142, "message": "..."}
  ],
  "suppressed": [
    {"rule": "...", "file": "...", "line": 0, "message": "...", "suppression_reason": "..."}
  ],
  "summary": {"files_checked": 5, "rules_run": 6, "violations": 1, "suppressed": 1}
}
```

### Exit codes

- `0` — clean run, zero non-suppressed violations.
- `1` — one or more violations found (the tool ran correctly and found real problems).
- `2` — tool error (bad config, unreadable path, malformed pattern, etc.) — distinguished from `1`
  so that a caller (human or future CI step) can tell "the doc set has problems" apart from "the
  tool itself couldn't run."

---

## 5. False-Positive / Suppression Behavior

A rule must be locally suppressible for a legitimate exception without disabling it doc-set-wide.

**Mechanism:** an inline suppression marker comment in the markdown source, e.g.:

```
<!-- spec-doc-checker: ignore forbidden-literal reason="intentional historical reference, see DDR-0007" -->
```

placed on the line immediately preceding (or, alternatively, on the same line as, config
permitting) the flagged content. The marker names the specific rule being suppressed at that
location — a bare `ignore` with no rule name suppresses only rules that would otherwise fire on
that exact line, not the whole file.

A secondary, coarser mechanism — a config-file allowlist entry (`{rule, file, line_range, reason}`)
— is also supported for cases where inline markers are impractical (e.g. suppressing a rule across
a whole frozen/archival file such as a `.gate-snapshots/` directory, matching this sprint's own
precedent that frozen snapshots are not live specs). Every allowlist entry requires a `reason`
field; entries without one are a tool config error (exit code 2), not silently accepted.

**Non-negotiable:** a suppression is never silent. In text output, suppressed violations are
listed in a separate "Suppressed" section with their reason, not simply omitted from output. In
JSON output, they appear under `suppressed`, structurally distinct from `violations`. Exit code 0
requires zero *non-suppressed* violations; `--strict` (Section 2) makes suppressed violations count
toward a non-zero exit too, for use in a mode where "yes, but justify it to a human" isn't good
enough (e.g. a hypothetical future stricter CI gate — not used in v1's default invocation).

---

## 6. Test Fixtures and Acceptance Criteria

### Fixture strategy

One minimal fixture spec-doc-set per rule class, under (e.g.) `scripts/tests/fixtures/spec-doc-checker/<rule-name>/`, each containing:

- A `fail/` variant: a minimal doc set (2-4 short markdown files, not full spec docs) that
  intentionally contains exactly the one defect the rule targets, and nothing else that would
  trip other rules.
- A `pass/` variant: the same minimal doc set with that defect corrected, and otherwise identical,
  proving the rule doesn't false-positive on the clean version.

Six rule classes → minimum twelve fixture doc sets (six `fail/` + six `pass/`), each self-contained
and small enough to read in full in one sitting — deliberately not reusing the real
problem-department-mvp docs as fixtures, so fixture behavior stays decoupled from that doc set's
own evolution.

### Acceptance criteria

"The checker works" means, at minimum:

1. Each of the six rules has at least one `fail/` fixture that produces exactly the expected
   violation (rule name, file, and line match expectation) and exit code `1`.
2. Each of the six rules has at least one `pass/` fixture that produces zero violations for that
   rule and exit code `0`.
3. The suppression mechanism (Section 5) has its own fixture pair: a suppressed violation must
   appear in the "Suppressed" output section (not absent, not counted toward exit code `1` in
   default mode) and must count toward exit code `1` when run with `--strict`.
4. A malformed-config fixture produces exit code `2`, not `1` or `0`.
5. Running the tool against the real `docs/specs/problem-department-mvp/` doc set (once
   configured for it) produces a specific, stated result that is recorded at implementation
   time — the exact expected result is not knowable until the tool and that doc set's config
   exist, but producing and recording *some* deterministic result against that real doc set is
   part of acceptance, precisely because that doc set is the one known to have contained the
   defects this tool exists to catch.

---

## 7. Integration Boundary

This tool is **local/manual use only** for v1. Intended usage: a spec-sequence contributor (human
or agent) runs it against a sprint's `docs/specs/<sprint-slug>/` directory before invoking Frank's
spec-gate, as a pre-check — not as part of the gate itself.

It is explicitly **not**:
- Wired into any git hook (pre-commit, pre-push, or otherwise).
- Wired into CI.
- Given any binding authority over Frank's or spec-reviewer's verdicts. A clean run does not
  constitute or imply a PASS from either.

This is a **deliberate boundary**, not an oversight or a placeholder for "someday soon." The tool's
own reliability (false-positive rate, coverage, config-authoring ergonomics) has not yet been
proven across doc sets other than the fixtures and problem-department-mvp. Wiring it into anything
blocking before that reliability is demonstrated over real use would recreate exactly the failure
mode this whole effort exists to avoid — a mechanical-sounding check being trusted before it has
earned that trust.

---

## 8. Future Extension Model

**New rules:** the six rules in Section 3 are implemented as independent, individually
enable/disable-able units sharing a common interface (a "rule" takes the doc-set path plus its own
config subtree, and returns a list of violations in the common schema from Section 4). This
registry-like structure is chosen so a seventh, eighth, etc. rule can be added later as a new
self-contained unit without touching existing rule implementations — but no specific mechanism
(plugin discovery, external rule packages, etc.) is committed to now; a simple in-repo module list
is sufficient for the rule count this tool starts with.

**Graduation path (not committed now):** if, after a period of real use, the tool demonstrates low
false-positive rate and stable behavior across multiple spec sequences, it could graduate to:
- A required (but still non-blocking, warn-only) step surfaced automatically at spec-gate time.
- Eventually, a blocking pre-gate check that Frank's gate refuses to run without.
- A CI step on doc-set changes.

None of these are decided or scheduled by this document. They are named here only so the JSON
output format (Section 4) and rule-registry structure (above) are not accidentally designed in a
way that would block that future path if Danny later chooses it.
