# Roadmap

This roadmap tracks what is documented, what is next, and what is deferred. Per [principles.md](principles.md), items stay listed here even while unimplemented — YAGNI governs timing, not whether a requirement is remembered.

## Status legend

- **Documented** — described in docs, not yet implemented.
- **Next** — targeted for the current or upcoming milestone.
- **Deferred** — explicitly out of scope for now, revisit later.

## Now

| Item | Status |
|---|---|
| Repository foundation and documentation | In progress (this milestone) |
| Problem Department vertical-slice MVP | Documented — see [milestones/problem-department-mvp.md](milestones/problem-department-mvp.md) |

## Department OS Core requirements (documented, sequencing TBD)

| Requirement | Status |
|---|---|
| Dashboard for projects, workflows, agents, decisions, outputs, costs, evaluations | Documented |
| Real-time agent and package/workflow observability | Documented |
| Evidence ledger with citations and provenance | Documented — first needed by Problem Department MVP |
| Knowledge graph (signals, problems, people, products, markets, concepts, experiments, outcomes) | Documented |
| Durable workflow state: checkpoints, retries, recovery, approvals, versioning | Documented — first needed by Problem Department MVP |
| Replaceable agent-runtime support | Documented — first tested by Problem Department MVP runtime evaluation |
| Evaluation and learning loops (models, prompts, tools, skills, costs, latency, quality) | Documented |
| Packaged workflows (individually or as a suite purchasable) | Documented |
| Multi-channel Seed Capture — ingest low-friction human-curiosity signals from heterogeneous personal channels (bookmarks, saves, browser history, notes, messages, email), preserve provenance, deduplicate/enrich, surface recurring themes, and promote selected items into seed ideas for Signal Foundry / Personal Pull / Problem Department. Capture must preserve first and evaluate second — a low-value-looking item today may only become meaningful once it cross-pollinates with unrelated items later. Not designed; explicitly out of scope for the Problem Department MVP. | Documented |

## Modules (documented, sequencing TBD)

| Module | Status |
|---|---|
| Problem Department | Next — first vertical slice targeted |
| Signal Foundry | Documented |
| Prototype Department | Documented |
| Creative Practice Engine | Documented |
| Mandate to Build (public lab) | Documented |
| Skool community | Documented |

## Deferred

| Item | Status | Notes |
|---|---|---|
| Patent Reinvention | Deferred | Bonus-bonus module, after the complete Department OS suite. Must not expand current scope. |
| Agent runtime selection (Pi, OpenJarvis, Hermes, Claude Agent SDK, other) | Deferred | Decided via practical vertical-slice evaluation, not upfront. |
| Storage/database technology | Deferred | Chosen when a vertical slice needs it. |
| CI/CD pipelines | Deferred | No application code exists yet to build or test. |

## Open architecture decisions

Recorded as they're made in [docs/decisions/](decisions/). None have been made yet.
