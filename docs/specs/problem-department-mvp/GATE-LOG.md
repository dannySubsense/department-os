# Gate Log: problem-department-mvp

## Spec Gate
Counter: 3/3 (final — no further attempts available in this gate)

| Attempt | Date | Verdict | Findings Summary | Snapshot |
|---|---|---|---|---|
| 1 | 2026-08-08 | PASS (superseded) | Layer 1 PASS: every North Star success criterion traces to concrete spec content (canonical seven elements with fail-closed negative-finding semantics; numeric prohibition with exact carve-outs; Personal Pull quarantined at type level; Decision durably bound with reconsideration-not-reopening; append-only bitemporal StatusEvent invalidation traversal; GenerationRun provenance anchored to Investigation; Approve not a build trigger). Layer 2 PASS: `docs/NORTHSTAR.md` read directly by Frank, `Status: Active` (non-DRAFT, no PROVISIONAL stamp). Pre-checks all pass. **Superseded**: after this PASS, Danny's independent PR review found 4 blocking architectural defects (bitemporal query conflated effective/knowledge time; EvidenceItem.stance modeled wrong; ProblemBrief.currentVersionId contradicted immutability claim; citation arrays not actually enforced non-empty) not caught by this attempt. | .gate-snapshots/spec/attempt-1/ |
| 2 | 2026-08-08 | PASS (superseded) | Fully independent re-evaluation of the post-PR-review-fix doc set — attempt 1's PASS explicitly NOT trusted as evidence. All 4 of Danny's PR-review findings verified fixed in current bytes. Specifically stress-tested that the citation non-empty fix's own side-effect fix (the `NegativeFinding` mechanism) did not silently reopen the hole it closed. Layer 1 PASS, Layer 2 PASS. Post-gate cleanup fixed 3 minor residuals without reopening the gate. **Superseded**: Danny's PR re-review of this exact package found the `NegativeFinding` mechanism had incorrectly made `'problem-statement'` negatable, violating his original binding Q-2 decision (Problem definition has no absence path) — not caught by attempt 2 or the review chain that fed it. | .gate-snapshots/spec/attempt-2/ |
| 3 | 2026-08-08 | **PASS** | Fully independent re-evaluation, explicitly briefed on this gate's own history of two prior PASS verdicts each missing a defect a human caught afterward. Verified `'problem-statement'` is genuinely, structurally absent from the `BriefElement` union (not just narrated as fixed) across all ~15 negatability-context occurrences in 02/03/04 — enforcement is type-level (unconstructable), not conventional. Verified the `negativeFindingRef` traceability fix (id-based encoding, exact iff-trigger) consistent across 01/02/04 with positive and negative tests. Verified all 4 original PR-review findings still intact, no regression. **Convergence judgment: SHRINKING** — defect class narrowed monotonically across the 3 attempts: architecture-level (4 defects) → type-union-level (1 defect) → single prose sentence (non-blocking). Layer 1 PASS, Layer 2 PASS (`docs/NORTHSTAR.md` re-read directly, `Status: Active`, no PROVISIONAL). One non-blocking residual (01-REQUIREMENTS.md line 19, a leftover "six of seven" sentence self-contradicted two sentences later, wrong reading unconstructible against the schema) — fixed post-gate, does not reopen. | .gate-snapshots/spec/attempt-3/ |

Post-gate cleanup (attempt 2 PASS, non-blocking, completed same day): 01-REQUIREMENTS.md element 1 or-clause added; 02-ARCHITECTURE.md generateBriefVersion rule now states both-populated-invalid explicitly; 02-ARCHITECTURE.md status header updated; 04-ROADMAP.md Slice 4 gained the absence-surfacing note/test matching Slices 5/6.

Post-gate cleanup (attempt 3 PASS, non-blocking, completed same day): 01-REQUIREMENTS.md line 19's residual "six of seven" wording corrected to state the four-negatable-element rule directly, matching line 204 and the rest of its own paragraph.

Convergence judgment (attempt 3, final): **SHRINKING** — see attempt 3 row above. Deep-diagnosis evidence: attempt 1's post-PASS misses were 4 architectural defects; attempt 2's post-PASS miss was 1 type-union defect; attempt 3's residual was 1 non-blocking prose sentence with no schema impact. Each generation of fix verified intact in its own snapshot before the next attempt ran.
Orchestrator independent re-derivation: AGREES — orchestrator independently verified the `BriefElement` union and exclusionary language directly (not via Frank's account) before dispatching attempt 3, and independently fixed and re-verified the one post-gate residual before concurring with final PASS.

## Forge Gate

### Slice 9 — Brief Assembler
Counter: 1/3

| Attempt | Date | Verdict | Findings Summary | Snapshot |
|---|---|---|---|---|
| 1 | 2026-08-16 | **PASS** | Frank briefed COLD (map only: the artifact's own claims, where things live, his standing authority — no orchestrator narrative, no findings list, no test-result reassurance). Pre-checks all pass: no new unsourced constants (every 007 enum/CHECK traces to `02-ARCHITECTURE.md` §3; the one added beyond the design's minimum, `UNIQUE (brief_version.generation_run_id)`, carries reasoned justification); INPUT checked at source — Frank diffed `src/db/fixtures/quarantined-007-*.sql` against the git blob himself rather than trusting the file's own claim; evidence independence held — he re-ran `tsc` and the suite against live `deptos_core` (270 passed / 1 skipped, no deadlock). Verified as genuinely implemented, not narrated: preflight snapshot + current-version equality (zero LLM spend on caller-contract violations); the three-term evidence universe INCLUDING `ExtractionResult.evidenceItems`; zero-foreign (not at-least-one-local) ownership with mixed-ownership tests across all five citing entities; investigation-row lock; two-observation race classification; transition return value checked inside the transaction with full rollback; exactly-once finalization with `loadStepLog` on the transaction client; failed corrections never disturbing a healthy `brief-generated`. Judged migration 008 the strongest piece — 'a filename-tracked runner plus a rewritten 007 is exactly a shared-well trap… and it wasn't fudged': the legacy path is exercised with the REAL quarantined bytes through the production runner, with a full `pg_constraint` + `information_schema.columns` diff, not a names-only check. Judged the one skipped test correct polarity — an alarm wired to fire on the dangerous condition (fixture missing) rather than on the safe one. Treated the uncommitted `SLICE-09-DESIGN.md` step-1b edit with explicit suspicion as doer-adjacent spec amendment before accepting it as behaviour-preserving. Layer 1 PASS, Layer 2 PASS (`docs/NORTHSTAR.md` read directly, `Status: Active`). One item flagged and actioned: `PROGRESS.md` still read 'BLOCKED / NOT STARTED'. | working tree on d02d3ff |

Convergence judgment (attempt 1): N/A — passed on first forge-gate attempt. Note this is NOT evidence
the work was clean: the artifact reached Frank only after FOUR Composer design gates (design revisions
4→8, each returning real blocking defects) and TWO QC rounds (round 1 FAIL with 5 defects, including a
shared-well in which the dev database carried a quarantined attempt's schema and invalidated every
green result before the rebuild). The forge gate passed first time because the defects had already been
found upstream, not because there were none.

Orchestrator independent re-derivation: AGREES — Ledger independently verified before dispatching Frank:
the quarantined-007 fixture is the genuine stale shape (7 DEFERRABLE, 12 TEXT[], 0 UUID[], matching the
drift measured on the live DB before rebuild); the rebuilt schema matches the migration set (0 missing
constraints, `_uuid` x10, 92 constraints, only migration 005's legitimate deferrable pair remaining);
and the legacy-reconciliation test is mutation-verified — inverting a single guard in 008 so the
deferrable-FK fix never fires makes it FAIL, restoring makes it PASS.

Standing caveat recorded at close: one proof can no longer be completed. Whether the quarantined 007
file is byte-identical to what was ACTUALLY applied to `deptos_core` is now unfalsifiable — the database
was replayed without a prior `pg_dump -s`. Convergence is proven FROM THE QUARANTINED FILE; the two main
drift dimensions (column types, missing constraints) were captured before the drop, but not a full dump.

## Constant-Integrity Audit and Cold Frank Passes — branch `fix/llm-and-resolver-constant-integrity`

Benchmark-agent audit (2026-09-05) found `MIN_CONTENT_LENGTH`'s code comment in
`resolveSourceArtifact.ts` cited a spec passage that does not exist in any revision of this
repo's docs — fabricated at authoring time, not merely unsourced — and separately claimed a
paywall/JS-shell detection capability the code does not have (it compares raw HTTP body length
before any extraction). The disproven claim also reached users via `noContentReason`, duplicated
in `classifyRetrievalOutcome.ts`.

| Attempt | Date | Verdict | Findings Summary | Snapshot |
|---|---|---|---|---|
| 1 | 2026-09-05 | FAIL | Cold Frank pass (unbriefed, live working tree). Findings: `llmClient.ts`'s `max_tokens` cap (8192, previously unsourced and untagged) had a dangling citation to a `stop_reason === 'max_tokens'` check that did not actually exist in the code yet; no constant (`MIN_CONTENT_LENGTH`, `MAX_REPAIR_ATTEMPTS`, prospective `MAX_OUTPUT_TOKENS`) carried a named owner, and a prior draft had written "owner: Danny" onto values he had not reviewed; unpersisted measurement figures (byte/character counts for named real URLs) sat in a permanent code comment as an artifact-less hypothesis. Resolved in commit a6ac1df: `MAX_OUTPUT_TOKENS` named with a real `stop_reason` check added (not just claimed), false ownership retracted, unpersisted figures removed. | commit a6ac1df |
| 2 | 2026-09-05 | FAIL | Second Cold Frank pass (unbriefed, commit a6ac1df). Findings: (1) `resolveSourceArtifact.ts`'s corrected comment pointed to `product-surface-checkpoint-2/05-REVIEW.md` for "the fuller correction history" — that file contains no mention of `MIN_CONTENT_LENGTH` or this correction, a dangling pointer of the same defect class as the fabricated citation being fixed; (2) the same comment overstated that checkpoint-2 §4.8 "discloses this specific limitation explicitly" — checked directly, it does not; (3) `02-ARCHITECTURE.md` itself (lines 216, 309) still described `MIN_CONTENT_LENGTH` as "the paywall/JS-shell content-length heuristic" and specified the retracted failure string verbatim, directly contradicting the corrected code. Resolved in commit 12d251b: repointed to this file's own git history plus `02-ARCHITECTURE.md`'s corrected entry, overstated claim removed, doc set swept per this repo's "one unsourced number found, sweep the whole doc set" rule. | commit 12d251b |
| — | 2026-09-05 | HALT | Cold Frank HALTed the branch at commit ac63adf: the "no owner without genuine review, owner: unassigned is not acceptable, delete or redesign is the only remaining move" rule this branch was applying existed only in conversation and commit messages, invisible to an isolated-worktree gate with no access to that history. Resolved via `docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md`, recording the rule as a tracked, gate-checkable document rather than an unverifiable commit-message account of it. | commit ac63adf; resolved by DDR-0002 (commit b2d6ba6) |

Convergence judgment: SHRINKING — defect class narrowed from a fabricated citation plus false
capability claims (attempt 1) to two dangling/overstated pointers plus one doc-set contradiction
(attempt 2) to a governance-visibility gap resolved by a DDR, not a further code/doc defect (the
HALT). No PASS yet recorded for this constant-integrity work as of this entry; a Cold Frank pass
on the current tip (after DDR-0002 and this session's four further fixes) has not yet run.
