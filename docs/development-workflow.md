# Development Workflow

## Roles

- **Danny** — product, requirements, architecture, scope, and final merge authority. All merges require his explicit approval.
- **Claude Code** — the primary builder. Implements features and documentation per approved specs.
- **Codex** — an independent engineering auditor and QC reviewer. Inspects the complete diff against the approved specification, adds or runs tests, and identifies confirmed issues for focused correction commits — independently of Claude Code, not as a rubber stamp. Not yet wired into the GitHub PR workflow as of this revision; onboarding pending.
- **Sol** (ChatGPT) — an independent reviewer, active in the GitHub PR workflow. Same independent-review discipline as Codex (see [Independent Review Discipline](#independent-review-discipline)) — different tooling, same standard: verified against live files and primary sources, not handed the author's method.
- **Frank** — the binding judgment gate. Evaluates specifications before implementation greenlight, and evaluates completed (and reviewer-corrected) implementation before merge. Frank's verdict is PASS/FAIL/HALT — binding, no manual override.

Codex/Sol and Frank are complementary, not interchangeable: Codex and Sol are diff-level engineering audits; Frank is a binding go/no-go judgment gate applied to the specification and to the final implementation state. Multiple independent reviewers are additive, not redundant, as long as each reads from primary sources rather than a prior reviewer's summary — see [Independent Review Discipline](#independent-review-discipline). Doer and checker are deliberately different agents reading independently, not the same agent reviewing its own output — see the Research Data Integrity rules in [CONTRIBUTING.md](../CONTRIBUTING.md).

## How work moves

1. **Intake** — the requirement or milestone is documented and approved (see [roadmap.md](roadmap.md) and [milestones/](milestones/)).
2. **Interview** — a standalone stage, run inline in-session by default. It always produces `INTERVIEW.md` before specification begins, even when it finds zero gaps — the record of "no gaps found" is itself the deliverable, not an optional skip.
3. **Specification** — requirements, architecture, and roadmap are written for the slice.
4. **Frank's binding specification gate** — the spec must pass before implementation begins.
5. **Human implementation greenlight** — Danny explicitly authorizes implementation to start.
6. **Forge / slice-by-slice implementation** — Claude Code implements a complete vertical slice against the spec, per [principles.md](principles.md).
7. **Independent review** — each PR records its own active independent reviewer(s) from the Roles roster above; they review the complete diff against the approved specification, independently of Claude Code's reasoning path (see below).
8. **Focused correction commits** — confirmed findings are fixed through focused, traceable commits, not folded silently into the original change. This must happen *before* step 9, so the final gate evaluates the code that will actually be merged.
9. **Frank's binding final forge gate** — evaluates the corrected, final branch state.
10. **Human merge approval** — Danny merges.

Live repository process documentation (e.g. a project's own `docs/decisions/` record) may establish a more specific order for a given case; absent that, the sequence above is authoritative.

## Independent Review Discipline

**Give the unbiased auditor the map, not the path.**

An independent reviewer (Codex, Sol, Frank, or any future auditor role) should receive:

- The objective.
- The approved requirements.
- The architecture boundaries.
- The acceptance criteria.
- The relevant diff and live repository state.

The reviewer should **not** be handed the author's full reasoning path, debugging method, preferred diagnosis, or a checklist designed to reproduce the author's own assumptions — a method handed over is a lens handed over, and it caps the reviewer's ceiling at the author's.

Independence means more than different agent identities. Reviewers using the same corrupted source or inherited assumptions as the author are not independent — N reviewers sharing one input is one review, not N. The author may provide factual orientation and repository context, but must not constrain the auditor to the author's method. Findings must be verified against live files, current git state, primary sources, raw data, and reproducible tests — not trusted because a prior pass reported them.

## Git and Review Workflow

- Bootstrap commits may already exist directly on `main` — that's expected for initial repository setup.
- New implementation work uses focused branches and pull requests.
- Direct implementation pushes to `main` are not allowed after bootstrap, unless Danny explicitly authorizes an exception.
- Every pull request is tied to an approved intake, specification, milestone, or recorded decision — not opened speculatively.
- Claude Code authors the implementation on its branch.
- Each PR records its own active independent reviewer(s) from the Roles roster above; they review the complete diff independently against the approved specification (see Independent Review Discipline above).
- Confirmed findings are fixed through focused, traceable commits on the same branch.
- Frank's final binding forge gate evaluates the corrected final branch state — not the pre-correction diff.
- Required checks and tests must pass before merge.
- Danny provides final merge approval.
- No force-pushing shared or reviewed branches, unless Danny explicitly directs it.
- Merge strategy (squash / merge commit / rebase) remains human-controlled until separately decided and recorded in [docs/decisions/](decisions/).

## Judgment Gate Protocol (binding, every gate)

Frank's gate is dispatched this way **every time**, without being requested. It is a mechanism, not
a favour. Established 2026-08-16 after a briefed gate returned PASS on an artifact the Composer
then failed on three reachable defects.

**1. The gate reviews a frozen commit in an ISOLATED CHECKOUT — never the live working tree.**
Create a detached worktree at the exact SHA under review and point the gate at that path. The live
tree is disqualifying: on 2026-08-16 a cold gate pointed at the repo root found the defects by
reading uncommitted fix comments annotated `"Composer FAIL round 2, defect 1"` — an answer key,
not a review. The same class of leak as a stale database schema: the environment carried
information the artifact did not. If the gate can see the fixes, the gate is not testing anything.

**2. The brief is generated, not authored.** Only these fields, no free prose from the orchestrator:
repository path (the isolated checkout), the SHA under review and its parent, the verdict required,
and an explicit statement that nothing else is supplied deliberately. No artifact list, no summary
of what the change does, no statement of what it claims, no list of binding documents, no prior
review results, no test outcomes, no scope boundaries. Every one of those is a lens shaped by the
people who produced the work. **If the Producer is typing sentences into a gate brief, the Producer
is setting the gate's ceiling at their own.**

**3. The whole package is in scope by default.** Implementation, migrations and the database they
produce, tests and what they actually assert, the specifications said to govern them, the merged
code depended on, status and gate records, and the review process that produced it — including
prior briefs and the Producer's own conduct. The gate chooses its own targets, needs no permission
for any line of inquiry, and may ignore the diff entirely to interrogate something upstream.

**4. Operational facts are allowlisted; conclusions are never supplied.** A fact may be given only
if withholding it would waste the gate's time or manufacture a false finding — e.g. "this suite
deadlocks on TRUNCATE under concurrent database access." Anything that shapes what the gate expects
to find is a conclusion, not a fact, and is withheld.

**5. Exhaustiveness is obligatory.** Where an invariant must hold, the gate enumerates every site it
must hold at and checks each — it does not confirm the invariant holds somewhere. A verdict carries
its own coverage claim: how many sites, and how many checked. The 2026-08-16 miss was exactly this:
the gate verified a return value was checked at the one call site the design foregrounds, and three
other call sites went unexamined.

**6. The gate record names the exact commit gated.** A verdict against a SHA does not transfer to a
later SHA containing fixes. Re-gate the commit that actually contains them.

**7. Prefer a different model from the one that produced the work.** Frank runs on a different model
by frontmatter. This buys independence on the code axis only — a gate that reads the same specs,
repo and database as the producer shares their source-axis blind spots, and no model difference
repairs that.

**8. The independent test suite is QC-only and must be STRUCTURALLY out of the implementer's
reach.** Implementers work from the gated specification and may write and run their own
spec-derived tests; they must not read, edit, or run the independent suite. This applies during
corrections as much as during first implementation — a fix conformed to the tests that are meant
to catch it recreates the shared well at the worst moment. Telling an implementer not to look is
not sufficient: on 2026-08-16 an implementer found the independent suite in the tree, read it, and
changed the implementation to match. Keep it in a QC-only branch or worktree so the separation is
mechanical. When a test and the code disagree, that disagreement is escalated — neither side
silently conforms to the other.

**9. Ordering constraint on provenance records (Sol, 2026-08-16).** Any `GenerationStep` recorded
on a failure path — including a declined-transition record — must be written BEFORE
`finalizeGenerationRun`. Finalization computes `modelIdentifiers`/`toolsInvoked` from the step log,
so a step appended afterwards is invisible to those aggregates and the finalized run misrepresents
its own contents. The safe order is: attempt the transition → if declined, record the step →
finalize once → read the actual status back → throw.

---

## Architecture and scope decisions

Decisions that change architecture, choose a runtime, or expand scope beyond a current milestone are recorded in [docs/decisions/](decisions/), not just discussed in passing. See [decisions/README.md](decisions/README.md) for the format.

## Working on this repository right now

**Read the `## Current` section at the top of the active sprint's `PROGRESS.md` first.** For the
sprint in flight that is
[specs/problem-department-mvp/PROGRESS.md](specs/problem-department-mvp/PROGRESS.md). That section
is the **single live status record**: what slice is active, what gate state it is in, and what is
blocking. Detailed slice-by-slice history lives below it in the same file.

Do not maintain a second copy of current state anywhere else — not in a root status card, not in a
separate tracking file, not in prose at the top of another doc. A manually-maintained status cache
duplicates `PROGRESS.md` and drifts from it; a root `NOW.md` did exactly that and was removed on
2026-08-14, having gone stale by claiming a slice "fully complete" after a QC round that a later
defect disproved, while `PROGRESS.md` recorded the correction. One record, updated in place.

If an agent instruction file (including an untracked local one such as `CLAUDE.md`) tells you to
maintain a status file that no tracked document describes, treat that as a defect in the
instruction and raise it — an artifact committed to the repository whose governing rule is not in
the repository cannot be verified, reviewed, or inherited by a fresh clone.

Note on scope: this section previously stated the repository contained "documentation and
structure only" with "no application code." That has been false since Slice 2 shipped; it was
corrected on 2026-08-14. Milestone status is tracked in `PROGRESS.md`, not restated here, so this
section cannot go stale the same way again.
