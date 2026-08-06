# Architecture

This document describes Department OS Core at a conceptual level — the shared operating environment every module and workflow runs on. It intentionally does not commit to a technology stack or agent runtime. See [principles.md](principles.md) for why.

## Department OS Core

Core is the durable substrate underneath all modules. It is responsible for owning:

- **Domain records** — projects, problems, opportunities, prototypes, and the entities the modules operate on.
- **Evidence** — sources, citations, and provenance backing every claim a module makes.
- **Workflow state** — durable execution state, checkpoints, retries, recovery, approvals, and versioning for multi-step agent workflows.
- **Decisions** — the record of what was accepted, rejected, or put on watch, and why.
- **Package versions** — versioned, purchasable workflows and the modules that compose them.
- **Knowledge relationships** — a knowledge graph connecting signals, problems, people, products, markets, concepts, experiments, and outcomes.

Core requirements that remain on the roadmap, whether or not they are implemented in the current milestone:

- A dashboard for projects, workflows, agents, decisions, outputs, costs, and evaluations.
- Real-time agent and package/workflow observability.
- An evidence ledger with citations and provenance.
- A knowledge graph connecting signals, problems, people, products, markets, concepts, experiments, and outcomes.
- Durable workflow state, checkpoints, retries, recovery, approvals, and versioning.
- Replaceable agent-runtime support.
- Evaluation and learning loops for models, prompts, tools, skills, costs, latency, and quality.
- Packaged workflows that can be purchased individually or as a suite.

Requirements being on this list does not mean they are being built now. See [roadmap.md](roadmap.md) for sequencing.

## Modules as consumers of Core

Signal Foundry, Problem Department, Prototype Department, and Creative Practice Engine are producers and consumers of Core's records, evidence, and workflow state. They are not separate systems with their own storage — a module without Core underneath it is not a complete vertical slice. See [modules.md](modules.md) for what each module does.

## Agent runtimes are replaceable

Department OS treats the agent runtime — whatever executes multi-step agentic workflows — as a replaceable execution component, not part of the product's identity. Concretely:

- Department OS Core owns domain records, evidence, workflow state, and decisions regardless of which runtime executed the workflow that produced them.
- No runtime (Pi, OpenJarvis, Hermes, Claude Agent SDK, or otherwise) will be forked or embedded before an architecture decision has been tested.
- The first runtime decision will be made through a practical vertical-slice evaluation — building a real piece of the Problem Department milestone against candidate runtimes — not through upfront framework selection.

## What is deliberately not decided yet

- Storage technology (database, evidence store, knowledge graph engine).
- Application framework and language for Core and the dashboard.
- Agent runtime.
- Deployment and infrastructure topology.

These will be decided when a vertical slice needs them, and recorded as decisions in [docs/decisions/](decisions/) when they are.
