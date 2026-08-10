# Gate Log: spec-doc-checker

## Spec Gate

The formal Spec Gate loop (this file, `.gate-snapshots/spec/attempt-N/`, the 3-attempt counter)
was not yet standardized when `docs/tooling/spec-doc-checker.md` went through its Frank spec-gate
review — that formalization happened as part of `/forge-start --lite`'s own authoring. The spec's
actual review history (six Frank passes plus three rounds of Danny's own direct review, converging
to `Status: LOCKED`) is preserved in this session's conversation record and in the document's own
revision notes (see `docs/tooling/spec-doc-checker.md` lines 10+). Not backfilled into the table
below in the formal per-attempt shape, since no live snapshots exist for those passes — recorded
here as a pointer instead, so a future reader knows why this section starts empty rather than
assuming the gate never ran.

Counter: N/A (spec-gate already resolved prior to this file's creation; see note above)

## Forge Gate
Counter: 1/3 — PASS, no retry needed

| Attempt | Date | Verdict | Findings Summary | Snapshot |
|---|---|---|---|---|
| 1 | 2026-08-10 | PASS | Layer 1 (locked-spec fidelity) pass, Layer 2 (project North Star relevance) pass, no PROVISIONAL tag (docs/NORTHSTAR.md Status: Active). Independently re-derived every count in the AC24 record via live execution (26 violations: 23/2/1 breakdown, 9 files, 158/158 tests) — all matched the record byte-for-byte, closing out this artifact's own history of count-drift landing in its acceptance record. Probed multiple spec edge contracts directly (empty dir, missing config, Setext-vs-conflict-marker split, path containment, unknown --rule, direct import of previously-circular module) — all conforming. | n/a (PASS, no snapshot) |

Convergence judgment: n/a — PASS on attempt 1.

Frank's full verdict (verbatim):
> Findings: Pre-checks — Premise pass (proximity_lines: 5 sourced to spec's normative example);
> Input pass (independent tool execution against raw doc set and synthetic inputs, not a re-read of
> QC's summary); Evidence independence pass. Count re-derivation clean: live run exit 1,
> files_checked=9, violation_count=26 (23/2/1), all 23 forbidden-literal file:line pairs matched
> PROGRESS.md exactly; 158/158 tests re-derived live. Spec-fidelity edge probes all conforming:
> empty dir → exit 0/files_checked:0; no config → built-in defaults only; Setext heading zero
> stray-artifact hits, conflict markers flagged (AC21); `../escape.md` → exit 2 (AC9); `--rule bogus`
> → exit 2; `import spec_doc_checker.rules` succeeds directly (N6 circular-import fix genuine, not
> subprocess-test-masked). AC24 config honesty good: canonical-count left unconfigured with a
> written, structurally-grounded rationale rather than a fabricated pattern; density and false
> positives recorded raw, not tuned clean. Layer 1 pass. Layer 2 pass (NORTHSTAR.md Status: Active,
> no PROVISIONAL; bounded internal tooling in scripts/, non-blocking per spec Section 8, in service
> of the North Star's evidence-trail success criterion).
>
> Why: 158 green tests prove internal consistency only; the gate question was whether the AC24
> record and spec contracts survive independent re-derivation from primary sources, given this
> artifact's documented history of count-drift landing in its own acceptance record twice. Every
> re-derived number matched byte-for-byte; the specific Slice-4-pass-1 failure shape is gone, not
> re-asserted fixed. Edge-contract probes confirm the spec's hard-won revision decisions are
> actually implemented, not just documented.
>
> Verdict: PASS

Orchestrator independent re-derivation: **AGREES.** Ran `python3 -m pytest scripts/tests/ -q`
(158 passed) and `python3 scripts/check-spec-docs.py docs/specs/problem-department-mvp/ --format
json` (files_checked=9, violation_count=26, suppressed_count=0, rules_run matches the five
configured rules) myself before logging this entry — both match Frank's report exactly. Having
orchestrated all four slices and their combined 12 QC re-verification rounds, my own working
model of what shipped (the circular-import fix, the Setext/conflict-marker split, the two
count-drift catches inside the AC24 record itself, the disabled-by-default `--rule` mechanics)
concurs with Frank's findings on every axis reviewed. No disagreement to escalate.
