# Interview: product-surface-checkpoint-2
**Status**: Complete
**Mechanism**: Inline
**Date**: 2026-08-22

## Seed Questions (gap-diff)

| # | Category | Question | Answer | Assumed? |
|---|---|---|---|---|
| 1 | downstream impact | Slice 9's close recorded two live DISCOVERED-BROKEN defects Checkpoint 2's browser flow depends on: (a) url-type sources fail to resolve on Node 22 (`ssrfGuardedFetch` DNS lookup bug); (b) the browser retry loop is inert — resubmitting after Blocked never returns status to `open` or re-triggers generation. In scope, deferred, or partial? | Both in scope, fixed within Checkpoint 2 — not adjacent cleanup, prerequisites for the required browser path. Assign both to the earliest relevant C2-S slice. No separate repair slices outside the Checkpoint 2 roadmap. Require regression coverage + browser-visible demonstrations: (1) real URL submission resolving successfully into the real generation pipeline; (2) reaching genuine Blocked, correcting/resubmitting, retrying from the same workspace, and showing a new persisted run progressing honestly. | no |
| 2 | non-functional | Is there any authentication/authorization concept in scope (who is "Danny" as a recorded decision-maker), or is this still a single-operator tool with no access control? | Still single-operator, no auth system. Do not hard-code "Danny" as a decision-maker or add a synthetic actor field. Preserve decision/timestamp/rationale/reconsideration conditions/resulting state/history per existing contracts. Use product language like "Your decision" in the UI. Keep architecture open to authenticated actors later without adding an identity abstraction prematurely. | no |
| 3 | testing/rollback | What's the testing/verification bar for C2-S slices — same standard as prior slices, or additional given this is the browser-completion checkpoint? | Retain the existing per-slice standard (tests/QC rounds, Frank forge-gate PASS, specified browser-visible demonstration with real persisted data) AND add a final cross-slice end-to-end browser demonstration gate before the checkpoint itself can close: Mission Control → submit real Investigation → real generation → persisted run/step progress → same workspace through success/Blocked/Generation-Failed → recover from Blocked via genuine retry and new persisted run → review persisted Brief/sources/evidence/claims/uncertainty/recommendation/provenance → record Approve/Reject/Watch → reload and confirm persisted state and decision history. Success path AND separate Blocked/retry and Generation-Failed paths must all be demonstrated; passing tests or isolated screens do not close the checkpoint. After Frank returns green on completed implementation + demonstration evidence: stop for Danny and Sol review. | no |

## Adaptive Follow-ups

None required — each answer was a direct, unambiguous ruling with no unresolved thread to probe further.

## Stopping Rationale

All four gap-diff categories (testing/rollback, non-functional constraints, downstream impact,
edge cases) reached resolution after 3 generative exchanges. Edge-case coverage was already
resolved by Intake/prior conversation (Blocked/Generation-Failed/Success behavior, Approve/Reject/
Watch semantics, multiple-decisions-per-BriefVersion history) — no seed question was needed for
that category. Stopped on category coverage, not on reaching a 2-non-generative-exchange streak
(every exchange in this Interview was generative).
