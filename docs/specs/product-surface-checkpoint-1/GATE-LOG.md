# Gate Log: product-surface-checkpoint-1

## Spec Gate
Counter: 3/3

| Attempt | Date | Verdict | Findings Summary | Snapshot |
|---|---|---|---|---|
| 1 | 2026-08-19 | FAIL | Layer 1 FAIL, Layer 2 PASS (Active, no PROVISIONAL). F-1 (blocking): persistent nav is load-bearing across `03`'s layouts/flows but has no AC/component/hierarchy-node/slice — a guaranteed forge-time HALT under `04`'s own Sequence Rule 3. F-2 (blocking): Screen D dead-link click produces exactly the blank-screen outcome the package's own honesty rule forbids. F-3 (blocking): `02` §5.3 q4's `recentCompleted` ordering silently deviates from `DESIGN-PROPOSAL.md` §2a's `GREATEST(...)` key — undeclared, unlike the package's other two (declared) deviations. F-4 (blocking): US-6 AC5's widened-Active rule has no test anywhere in `04`. F-5 (non-blocking, fix same pass): A-1 phantom query, A-3 empty-string thesis placeholders, A-5 unstated catch-all guard, RM-1 Slice 3 Files-list omission. | `.gate-snapshots/spec/attempt-1/` |
| 2 | 2026-08-19 | FAIL | Layer 1 FAIL (process grounds only — all attempt-1 substantive findings independently re-verified CLOSED by Frank), Layer 2 PASS (Active, no PROVISIONAL). F-6 (blocking): `05-REVIEW.md` on file was stale — its Status/checklist/Readiness Statement declared the package NOT ready, but the fix round that resolved that finding (C-5/A-12/A-13/U-3) landed after the review's timestamp, so the filed record contradicted current file state. F-7 (blocking, process): no scripted count-literal check existed despite this defect class recurring 4 times across the sprint (B-2/B-6 → C-1/C-2/C-3 → C-4 → C-5), each hand-sweep review capped by the previous reviewer's own coverage (the shared-well mechanism) — Frank refused to spend the final attempt (3/3) on a 5th hand sweep. Non-blocking carried forward: A-2a (`02`:385 wrong section self-reference), A-2b, A-4, A-6, RM-3. | `.gate-snapshots/spec/attempt-2/` |

| 3 | 2026-08-19 | **PASS** | Layer 1 PASS, Layer 2 PASS (Active, no PROVISIONAL, binding). Both attempt-2 blocking findings resolved: `05-REVIEW.md` regenerated fresh (mtime postdates every spec doc), and `scripts/check-spec-count-literals.sh` built as reusable repo tooling — run independently by 3 parties (script author, spec-reviewer, Frank himself) with agreeing results (36 real hits, 0 aggregate-count defects; the "44" in the initial brief was script-line-count noise, caught and corrected by the reviewer rather than accepted). 10 non-blocking dispositions remain (A-2a/A-2a(ii)/A-2b/A-4/A-5b/A-6/RQ-3/U-2/RM-3/RM-4), all cosmetic prose-precision items with no implementer-facing ambiguity, routed to Danny's post-hoc review rather than blocking. Q-1/Q-7/Q-10 are preference calls for Danny, answerable pre-forge without reopening the gate. | `.gate-snapshots/spec/attempt-2/` (pre-attempt-3 state; attempt-3 introduced no artifact edits, only the review regeneration and script addition) |

Convergence judgment (attempt 3 only): **SHRINKING** — attempt 1: 4 substantive blocking defects (F-1–F-4). Attempt 2: 0 substantive, 2 process defects (F-6 stale review record, F-7 no mechanical backstop for a 5-times-recurring defect class). Attempt 3: 0 blocking, both process defects closed with verifiable, reproducible artifacts. Each attempt's finding set is strictly smaller and lower-severity than the last.
Deep-diagnosis evidence: Not required — PASS was reached before a STATIC/THRASHING classification would ever trigger. Recorded per protocol only because this was attempt 3.
Orchestrator independent re-derivation: **AGREES** with Frank's PASS, verified via an independent method (not narrative trust): re-ran `scripts/check-spec-count-literals.sh` myself (36 hits, matches both Frank's and the reviewer's counts exactly); confirmed `01-REQUIREMENTS.md`'s real per-story AC tally sums to 29 (5+3+7+3+2+5+4), matching every pointer-style citation across `02`-`04`; confirmed exactly 4 `### Slice` headings in `04-ROADMAP.md`; grepped all four docs for every Checkpoint-2/3-scoped term (`generation_component_event`, `POST .../generation-runs`, `BriefForReview`, `deriveWorkflowStage`) and confirmed every occurrence sits inside an explicit exclusion clause ("NOT", "must not", "excludes", "does not exist this checkpoint") — zero scope leak; spot-checked `02-ARCHITECTURE.md`'s schema claims against `src/db/migrations/001_initial_schema.sql` directly (`investigation.id/created_at/status/status_reason` — all real, matching column names). This constitutes a genuine independent check, not a perfunctory artifact-read.

## Forge Gate
Counter: 0/3

| Attempt | Date | Verdict | Findings Summary | Snapshot |
|---|---|---|---|---|

Convergence judgment (attempt 3 only): —
Deep-diagnosis evidence: —
Orchestrator independent re-derivation: —
