# Contributing to Department OS

## Roles

See [docs/development-workflow.md](docs/development-workflow.md) for the full breakdown of how Danny, Claude Code, Codex, and Frank collaborate on this repository, and how work moves from a documented requirement to a merged, human-approved change.

## Principles

Before proposing any implementation, read [docs/principles.md](docs/principles.md). In short: build complete vertical slices, avoid speculative infrastructure, prefer reversible decisions, and keep the full requirement set documented on [docs/roadmap.md](docs/roadmap.md) even when it isn't being built yet.

## Research Data Integrity

Every Department OS module that produces evidence-backed output — most directly the Problem Department and any future research or data pipeline — is bound by the following rules. They exist because of a real incident, elsewhere in this agent's operating history, where a corrupted input was silently promoted from an engineering default to a scientific parameter and passed a long chain of review before anyone opened the raw source. The specific timeline and test counts of that incident are not part of this repository's record and are not cited here as evidence — the discipline below is binding on its own merits, not because of how big that prior failure was.

**Governing principle:** No numerical threshold, cutoff, target, budget, score, confidence level, or metric is treated as established merely because it appears reasonable. It must be cited, benchmarked, measured, or explicitly labeled as a provisional human judgment that requires monitoring and evaluation.

1. **An unsourced number does not pass.** Every constant, threshold, budget, cap, or cutoff in a data or research path needs one of: **(a)** a citable, reproducible source that has actually been reproduced; **(b)** a documented benchmark or measurement run against this system; **(c)** an explicit `PROVISIONAL — unvalidated` marker; or **(d)** deletion. A comment asserting a rationale is not a source.

   A provisional number must record:
   - The label `PROVISIONAL — unvalidated`.
   - The named human owner.
   - Why it's being used temporarily.
   - What evidence or benchmark will validate, revise, or remove it.
   - When it will be reviewed, if a review point is known.

2. **Check the input before the instrument.** Open the raw source, print the head and the tail, check the size distribution, before reading the pipeline code that processes it. Unexpected concentrations, repeated values, rounded-value spikes, truncation patterns, suspicious caps, or mismatched record counts must trigger direct inspection of the raw source before the pipeline or resulting analysis is trusted. Never silently discard data: assert lengths match, or carry a truncation flag as a first-class column downstream.

3. **Independence of evidence, not just of agents.** Doer and checker being different agents is void if they read the same corrupted source. N reviewers sharing one input is one review, not N. See [Independent Review Discipline](docs/development-workflow.md#independent-review-discipline) for how a reviewer should be briefed.

Green tests, passing gates, and hash seals prove internal consistency, not that a finding is real. Never cite them as evidence a finding is true. A promoted default (a value chosen for one context) can silently become a shared assumption in another, and eventually get certified as if it were validated — it never was.

## Before implementing anything

Check [docs/roadmap.md](docs/roadmap.md) and the relevant file in [docs/milestones/](docs/milestones/). If what you're about to build isn't part of an approved, greenlit milestone, stop and raise it as a scope question rather than proceeding — see [docs/development-workflow.md](docs/development-workflow.md).

## Recording architecture or scope decisions

Any decision that changes architecture, chooses a runtime or technology, or expands scope belongs in [docs/decisions/](docs/decisions/), not just in a commit message or conversation. See [docs/decisions/README.md](docs/decisions/README.md) for the format.

## Issues and pull requests

Use the templates in [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/) and [.github/pull_request_template.md](.github/pull_request_template.md). All merges currently require human approval. See [docs/development-workflow.md#git-and-review-workflow](docs/development-workflow.md#git-and-review-workflow) for branch, PR, and merge policy.
