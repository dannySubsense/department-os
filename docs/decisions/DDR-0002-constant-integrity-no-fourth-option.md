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
should ultimately be sourced, provisionally owned, or deleted. The list was originally recorded as
eight constants uniformly "unsourced, unowned, unresolved" (as of commit `7cfb1bc`, after an
unbriefed Cold Frank FAIL found four more in the same condition plus a live violation of this DDR's
own branch (b) — findings F2 and F3).

**Updated 2026-09-05.** Danny (composer) ruled that the eight are not one category, and dispatched
real measurement on the subset that actually gates evidence quality. The list is now split into two
categories. **The split is a ruling about what each constant *claims*, not a relaxation of the
rule**: no constant in either category has acquired a named owner, and none may acquire one except
under branch (b) exactly as written.

### Category A — evidence-critical constants (3)

These govern evidence quality or output correctness. A real measurement can in principle produce a
citable value for each, so measurement was dispatched and run. The results below are real and
reproducible.

| # | Constant | Location | Disposition as of 2026-09-05 |
|---|---|---|---|
| A1 | `MIN_CONTENT_LENGTH` (was `= 200`) | `src/services/resolveSourceArtifact.ts` | **MEASURED — resolved via branch (c), redesign; constant deleted.** Real measurement run and persisted: `docs/specs/problem-department-mvp/min-content-length-measurement.md` (18 real URLs, script `scripts/measure-min-content-length.ts`, raw record `scripts/min-content-length-measurement.json`). The measurement did **not** source 200 — it showed **no raw-body-length threshold can do this job at any value**. Across the 11 sampled 2xx responses (the only ones that reach the comparison) every threshold in [1, 558] classifies all 11 identically, so 200 drew no distinction beyond "body was empty"; and raw length does not rank content — text/raw spanned 0.0070–0.9612, with vercel.com at 524,181 raw chars carrying 3,673 text chars against httpbin.org/html's 3,739 raw carrying 3,594. It also false-positived on example.com (558 raw chars of boilerplate → `content-retrieved`). Disposition: constant deleted, check reduced to `body.trim().length === 0` — which changes classification on **zero** of the 11 measured responses. **This measurement is the evidence for that deletion; the deletion was carried out in the working tree independently and concurrently, and should not be read as having been evidence-led until this artifact is merged alongside it.** |
| A2 | `MAX_REPAIR_ATTEMPTS` (`= 1`) | `src/services/llmClient.ts` | **MEASURED — still unsourced; cannot be sourced yet.** Real attempt recorded: `docs/specs/problem-department-mvp/llm-constants-measurement.md`, query `scripts/query-llm-attempt-history.sql`. The candidate precedent named in the code — this pipeline's own `SchemaValidationAttempt` history, persisted at `generation_step.step_data -> 'validationRecords' -> 'attempts'` — was queried directly against the live `deptos_core` DB and is **empty**: 0 generation runs, 0 steps, 0 attempts. The schema can answer the question; no data has ever been written to it. The older citation chain (02-ARCHITECTURE.md §3 quoting "1-2 attempts") remains unreproducible. Resolves when real runs produce attempt-1 failures and Q1/Q2 can measure P(valid \| attempt 2, attempt 1 invalid). **Must not carry a named owner until then.** |
| A3 | `MAX_OUTPUT_TOKENS` (`= 8192`) | `src/services/llmClient.ts` | **MEASURED — still unsourced; cannot be sourced yet.** Same artifact and query as A2. Zero attempts carry `tokenUsage`, so there is no observed output-token distribution to compare against 8192 and no observed truncation event. The query's Q4 returns `0` truncation failures — that zero is drawn from an empty corpus and is explicitly **not** evidence the cap suffices. Resolves when real extraction runs across realistic source-set sizes yield an upper-tail (p95/max) `outputTokens` distribution. **Must not carry a named owner until then.** |

A2 and A3 convert "nobody has looked" into "someone looked on 2026-09-05, with a tracked query, and
the required data does not yet exist." That is a real, re-checkable negative result. It is **not** a
source and does **not** upgrade either constant.

**Open follow-through on A1, not closed by this DDR:** the US-13 evidence-eligibility consequence in
product-surface-checkpoint-2 (what `reachable-no-content` means once it collapses to "empty body
only") is undecided, and `02-ARCHITECTURE.md` (§ around lines 216 and 315) still describes the old
threshold and quotes its old failure message.

### Category B — infrastructure / operational safety limits (5)

**Danny's structural ruling, 2026-09-05.** These five are connection timeouts, response size caps,
redirect hop limits and a search budget. They are **safety valves**, not correctness or
evidence-quality gates: they bound resource consumption and failure blast radius. No measurement can
produce a citable "correct" value for an HTTP timeout the way one can for a content-quality
threshold — there is no ground truth to reproduce, only a conservative engineering default traded
off against operational experience.

**This is a redesign of the claim — branch (c) applied to what the constant asserts rather than to
what it does.** It is explicitly **not** a resolution by citation (branch (a)) or by ownership
(branch (b)), and **no owner is invented and no precedent is fabricated for any of the five**. Each
is reclassified from "unsourced constant governing production behavior, pending genuine human
review" to "operational safety limit, not claiming to gate correctness." Under that reduced claim
they do not require branch (b)'s genuine-review-and-ownership, because they were never asserting the
kind of thing branch (b) exists to protect. The revisit trigger is **observed real operational
incidents** — timeouts firing on legitimate slow sources, size caps truncating legitimate long-form
sources, redirect caps breaking legitimate chains, search budget exhausted mid-investigation — not a
scheduled calibration and not a measurement dispatch.

| # | Constant | Location | Disposition as of 2026-09-05 |
|---|---|---|---|
| B1 | `MAX_SEARCH_OUTPUT_TOKENS` (named and extracted from a bare `max_tokens: 1024` literal, 2026-09-05) | `src/services/searchWebAdapter.ts` | Reclassified Category B — search-output budget. No source, no owner; none required under the reduced claim. Revisit on observed incident. |
| B2 | `MAX_SEARCHES_PER_TURN` (named and extracted from a bare `max_uses: 5` literal, 2026-09-05, Cold Frank FAIL finding F2 at commit `7cfb1bc`) | `src/services/searchWebAdapter.ts` | Reclassified Category B — per-turn search budget. No source, no owner; none required under the reduced claim. Revisit on observed incident. |
| B3 | `FETCH_TIMEOUT_MS` (`= 10_000`) | `src/services/ssrfGuardedFetch.ts` | Reclassified Category B — connection timeout. Previously carried `owner: Ledger` (an agent), disqualified under branch (b); stripped at Cold Frank FAIL finding F3 (`7cfb1bc`) and **not** reinstated. Revisit on observed incident. |
| B4 | `MAX_RESPONSE_BYTES` (`= 5 MiB`) | `src/services/ssrfGuardedFetch.ts` | Reclassified Category B — response size cap (SSRF / memory guard). Same F3 stripping as B3, not reinstated. Revisit on observed incident, specifically legitimate long-form sources seen truncating. |
| B5 | `MAX_REDIRECTS` (`= 5`) | `src/services/ssrfGuardedFetch.ts` | Reclassified Category B — redirect hop cap. Same F3 stripping as B3, not reinstated. Revisit on observed incident. |

**Scope limit on Category B, stated so a gate can check it.** The reclassification holds only while
these remain safety valves. If any is inherited into a path where it gates evidence or correctness —
the promoted-default failure mode — it returns to Category A and requires a real measurement.
`MAX_RESPONSE_BYTES` is the standing risk: a size cap that silently truncates a source body moves
directly from bounding memory to determining what evidence exists. It currently rejects oversize
responses outright rather than truncating them, which is why it stays in Category B; if that ever
becomes a truncation, it is Category A that day.

### Defect found while measuring (not one of the eight, recorded so it is not lost)

The `MIN_CONTENT_LENGTH` measurement surfaced a **production defect** in
`src/services/ssrfGuardedFetch.ts`: on Node 22 (this repo's runtime, v22.22.0), `safeLookup`
violates the `options.all` lookup contract — `http(s).request` passes `{ hints, all: true }` and
requires an array of `{address, family}`, while `safeLookup` always calls back with a scalar triple.
Every hostname-based fetch therefore throws `Invalid IP address: undefined` before any bytes are
read, meaning the Source Resolver's content classification is currently unreachable in production
for hostname URLs. Reproduce: `node scripts/repro-safelookup-all.mjs`. This is a code defect, not a
constant-integrity issue, and needs its own ticket.

This DDR closes the question of what the rule *is*, and now also records the 2026-09-05 category
split and the per-constant measurement results. It does **not** close A2 or A3 (awaiting real
pipeline data), nor A1's remaining spec/doc follow-through — that work proceeds separately and is
tracked in `docs/specs/problem-department-mvp/PROGRESS.md`.


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
  never-actually-reviewed named owner can no longer do so. Each of the eight constants listed above
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
