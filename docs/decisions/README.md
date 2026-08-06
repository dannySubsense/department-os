# Architecture Decision Records

This directory records architecture and scope decisions for Department OS: agent runtime selection, storage technology, framework choices, and any decision that changes scope described in [../roadmap.md](../roadmap.md).

Per [../principles.md](../principles.md), Department OS prefers reversible decisions tested against a real vertical slice over upfront selection. A decision record here should reflect that a real evaluation happened, not just a preference.

## When to add a decision record

- Choosing or changing the agent runtime.
- Choosing storage/database/knowledge-graph technology.
- Choosing an application framework or language for Department OS Core.
- Any decision that expands or narrows the scope of a documented module or milestone.

## Format

Each decision is a numbered markdown file: `DDR-NNNN-short-title.md`, using whatever lightweight structure captures:

- **Context** — what prompted the decision, what was being evaluated.
- **Decision** — what was chosen.
- **Evidence** — what the vertical-slice evaluation actually showed, with citations/reproducible results where applicable (see the Research Data Integrity rules in [../../CONTRIBUTING.md](../../CONTRIBUTING.md)).
- **Consequences** — what this makes easier, harder, or forecloses.
- **Reversibility** — how costly this is to undo if it turns out wrong.

## Current decisions

None yet. The first anticipated decision is the agent runtime selection, to be made through the practical vertical-slice evaluation described in [../architecture.md](../architecture.md) and [../milestones/problem-department-mvp.md](../milestones/problem-department-mvp.md).
