# DDR-0002: Constant Integrity — No Fourth Option for Unsourced Numeric Constants

**Status:** ACCEPTED

**Provenance note (binding, read before anything else in this DDR):** This decision did not go
through Frank's spec-gate or forge-gate ceremony. It was ruled directly and verbally by Danny
(composer) in conversation with the producing agent on this session, on branch
`fix/llm-and-resolver-constant-integrity` (commit `ac63adf`), in response to a live Cold Frank
spec-gate HALT. That is an adequate provenance for a process/governance rule of this kind — it is
not a product or architecture decision requiring the full spec-gate ceremony — but this DDR itself
is not self-certifying merely because it is now written down. **This DDR should be spot-checked at
the next available Frank gate as a real repository artifact**, the same as any other tracked file
that governs binding behavior, rather than presented as settled simply because it exists.

---

## Context

A Cold Frank spec-gate HALTed on branch `fix/llm-and-resolver-constant-integrity` (commit
`ac63adf`) because the producing agent was applying a binding-sounding rule — "a numeric constant
with no citable precedent may not carry a named owner, not even the composer, and `owner:
unassigned` is not an acceptable resting state either; the only remaining move when nothing is
cited and nobody has genuinely reviewed the value is (c): delete it or redesign around a mechanism
that needs no such number" — that exists **nowhere in this repository's tracked documents**. That
rule was stated directly by Danny in conversation and encoded into Claude Code's global,
repo-external `~/.claude/CLAUDE.md` configuration. That file is outside this git repository and
invisible to an isolated-worktree gate review.

Frank's exact objection: a doer citing an unwritten ruling to justify a departure from the
currently tracked rule — which allows PROVISIONAL + any named human owner, per this repo's own
`docs/specs/problem-department-mvp/05-REVIEW.md:289` ("must arrive with a citation or a
PROVISIONAL marker and a named owner") — is indistinguishable from a doer simply overruling the
rule. Whether the departure is correct or not, a future gate cannot be asked to trust a commit
message as evidence that a real, binding ruling occurred. It needs a tracked decision record
inside the repository itself.

**The incident that motivated the tightening, factually, from this session:**

- `MIN_CONTENT_LENGTH` (`src/services/resolveSourceArtifact.ts`) carried a spec citation that was
  fabricated — it did not actually source the value — and that fabricated-citation-bearing
  PROVISIONAL tag survived **four rounds** of an independent Frank spec-gate. The PROVISIONAL
  marker itself was mistaken for evidence that the value had been sourced or reviewed, when it had
  not been.
- In the course of correcting this, a subsequent draft **almost** wrote `owner: Danny` onto
  numeric values Danny had never actually reviewed. This was caught and retracted by Danny himself,
  before commit, in his own words: *"That is just a magic number with my name attached."* No such
  attribution was committed.

This shows the previously tracked rule's second branch — "PROVISIONAL marker and a named owner" —
has a live failure mode: a PROVISIONAL tag can be treated as satisfying the rule's intent (a human
has looked at this and accepted it) when no human actually has, and an owner name can be attached
to a value the named person never reviewed. Both are forms of the same defect: the paperwork of
sourcing without the fact of sourcing.

---

## Decision

Effective immediately, for this repository, every numeric constant governing production behavior
must satisfy exactly one of the following. There is no fourth option.

1. **(a) Citable, reproduced source.** A citable, reproducible source for the value exists, and it
   has actually been reproduced by someone on this project — not merely asserted or cited by
   reference to a document that itself never ran the calibration.

2. **(b) PROVISIONAL — unvalidated, with a named human owner who has genuinely reviewed and
   accepted that specific value.** The marker text must read `PROVISIONAL — unvalidated`. The
   named owner must be a specific human being who was actually asked about and actually reviewed
   **that value** — not a role, not an agent, not a human whose name was attached without their
   review having occurred. `owner: unassigned` is explicitly **not** an acceptable resting state
   under this branch: it still leaves an unsourced number live in production behavior with no
   accountable exit, which is the defect this rule exists to close, not a lesser form of
   compliance with it.

3. **(c) Deletion, or redesign around a mechanism that needs no such number.** If neither (a) nor a
   genuine (b) is available, the constant is removed, or the surrounding logic is redesigned so
   that no such numeric threshold is required at all.

A PROVISIONAL tag is not itself evidence of sourcing. An owner's name attached to a value is not
itself evidence that the named owner reviewed that value. Both must be facts about what actually
happened, not artifacts that resemble compliance.

---

## Relationship to existing tracked documents

This DDR **tightens and supersedes**, for this repository going forward, the language at
`docs/specs/problem-department-mvp/05-REVIEW.md:289`, which currently reads that a constant "must
arrive with a citation or a PROVISIONAL marker and a named owner" without the constraints stated
in this DDR's branch (b) — namely, that the marker text must be the specific `PROVISIONAL —
unvalidated` form, that the named owner must have genuinely reviewed that specific value, and that
`owner: unassigned` does not satisfy the branch.

`05-REVIEW.md:289` should be read as amended by this DDR from this point forward. This DDR does
not itself edit that file — propagating this ruling into live spec docs is tracked as separate
work in `docs/specs/problem-department-mvp/PROGRESS.md`, to be handled by a different dispatch.

---

## Interim disposition — constants this rule newly applies to

This DDR governs the **rule**, not a case-by-case ruling on whether any individual constant below
should ultimately be sourced, provisionally owned, or deleted. That per-constant assessment has not
yet been done and is tracked separately in `docs/specs/problem-department-mvp/PROGRESS.md`. What
this DDR states plainly, so a gate can check the list against reality, is the following interim
fact: as of this DDR, **none of the four constants below may currently carry a named owner**,
because none currently has a real, reproduced precedent and none currently has a human who has
genuinely reviewed that specific value. None is being deleted at this time — deletion or
redesign-around has not yet been assessed per-constant.

| # | Constant | Location | Current state |
|---|---|---|---|
| 1 | `MIN_CONTENT_LENGTH` | `src/services/resolveSourceArtifact.ts` | Fabricated citation identified this session; no real source, no genuinely-reviewed owner. Must not carry a named owner under this rule until one is obtained. |
| 2 | `MAX_REPAIR_ATTEMPTS` | `src/services/llmClient.ts` | No real source, no genuinely-reviewed owner. Must not carry a named owner under this rule until one is obtained. |
| 3 | `MAX_OUTPUT_TOKENS` | `src/services/llmClient.ts` | No real source, no genuinely-reviewed owner. Must not carry a named owner under this rule until one is obtained. |
| 4 | `MAX_SEARCH_OUTPUT_TOKENS` (named and extracted from a bare `max_tokens: 1024` literal, 2026-09-05) | `src/services/searchWebAdapter.ts` | No real source, no genuinely-reviewed owner. Must not carry a named owner under this rule until one is obtained. |

None of the four is resolved by this DDR. This DDR closes the question of what the rule *is*; it
does not close the question of what happens to each of these four constants — that work proceeds
separately and is tracked in `docs/specs/problem-department-mvp/PROGRESS.md`.

---

## Consequences

**This makes easier:**
- A future Frank gate reviewing an isolated worktree no longer has to trust a commit message or an
  agent's verbal citation of an unwritten ruling — the rule is now a tracked repository artifact
  it can read directly.
- Distinguishes, going forward, between "a PROVISIONAL tag exists" and "sourcing actually
  happened" — closing the exact failure mode that let a fabricated citation survive four rounds of
  independent gate review.

**This makes harder / open risk:**
- Constants that previously could rest indefinitely at `owner: unassigned` or with a
  never-actually-reviewed named owner can no longer do so. Each of the four constants listed above
  now requires active resolution (real sourcing, genuine owner review, or deletion/redesign) rather
  than a passive marker.
- Attaching a human owner to a PROVISIONAL constant now requires that human's actual review of
  that specific value, which is a real cost (Danny's time, or another named reviewer's) rather than
  a paperwork step.

**This forecloses:**
- `owner: unassigned` as a resting state for any numeric constant governing production behavior in
  this repository.
- Treating a PROVISIONAL marker's mere presence as evidence of sourcing.
- Naming an owner on a value that owner has not actually reviewed.

---

## Reversibility

Low cost to reverse as a *rule* — this is a governance/process decision, not a code or schema
change, and can be superseded by a future DDR if it proves unworkable. The cost is not symmetric,
however: reversing it would mean re-permitting `owner: unassigned` and unverified-owner attribution
for production constants, which is the exact condition that let the `MIN_CONTENT_LENGTH` fabricated
citation stand through four gate rounds. Any future DDR proposing to loosen this rule should cite
that history explicitly rather than silently reintroducing the same gap.

---

## Stopping Rule (G-22) Status

Not applicable — this is a governance rule adopted directly by the composer in response to a live
gate HALT, not a scored evaluation of multiple candidates.

---

## Gate Status

**Status: ACCEPTED**, ruled directly by Danny (composer), verbally, in this session, in response
to the Cold Frank spec-gate HALT on `fix/llm-and-resolver-constant-integrity` (commit `ac63adf`).
This did not go through the full spec-gate ceremony and does not need to for a process/governance
rule of this kind. **This DDR should be spot-checked at the next available Frank gate** as a real
tracked repository artifact, same as any other, rather than treated as self-certifying because it
is now written down.
