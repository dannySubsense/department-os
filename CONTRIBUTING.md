# Contributing to Department OS

## Roles

See [docs/development-workflow.md](docs/development-workflow.md) for the full breakdown of how the human, Claude Code, and Codex collaborate on this repository, and how work moves from a documented requirement to a merged, human-approved change.

## Principles

Before proposing any implementation, read [docs/principles.md](docs/principles.md). In short: build complete vertical slices, avoid speculative infrastructure, prefer reversible decisions, and keep the full requirement set documented on [docs/roadmap.md](docs/roadmap.md) even when it isn't being built yet.

## Research Data Integrity

Every Department OS module that produces evidence-backed output — most directly the Problem Department and any future research or data pipeline — is bound by the following rules. They were learned the hard way: a corrupted input silently promoted from an engineering default to a scientific parameter passed through 99 days of work, 795 green tests, and multiple review passes before anyone opened the raw source.

1. **An unsourced number does not pass.** Every constant, threshold, budget, cap, or cutoff in a data or research path needs one of: **(a)** a citable, reproducible source that has actually been reproduced; **(b)** an explicit `PROVISIONAL — unvalidated` marker with a named human owner; or **(c)** deletion. A comment asserting a rationale is not a source.

2. **Check the input before the instrument.** Open the raw source, print the head and the tail, check the size distribution, before reading the pipeline code that processes it. A dataset where more than 1% of records land on exactly the same round value is truncated, clipped, or capped — investigate immediately. Never silently discard data: assert lengths match, or carry a truncation flag as a first-class column downstream.

3. **Independence of evidence, not just of agents.** Doer and checker being different agents is void if they read the same corrupted source. N reviewers sharing one input is one review, not N. When briefing a reviewer, give the objective and architecture, not your method or checklist — a handed-over method caps their ceiling at yours.

Green tests, passing gates, and hash seals prove internal consistency, not that a finding is real. Never cite them as evidence a finding is true.

## Before implementing anything

Check [docs/roadmap.md](docs/roadmap.md) and the relevant file in [docs/milestones/](docs/milestones/). If what you're about to build isn't part of an approved, greenlit milestone, stop and raise it as a scope question rather than proceeding — see [docs/development-workflow.md](docs/development-workflow.md).

## Recording architecture or scope decisions

Any decision that changes architecture, chooses a runtime or technology, or expands scope belongs in [docs/decisions/](docs/decisions/), not just in a commit message or conversation. See [docs/decisions/README.md](docs/decisions/README.md) for the format.

## Issues and pull requests

Use the templates in [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/) and [.github/pull_request_template.md](.github/pull_request_template.md). All merges currently require human approval.
