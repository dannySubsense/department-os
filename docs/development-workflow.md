# Development Workflow

## Roles

- **The human (Danny)** — holds product, requirements, architecture, and final merge authority. All merges require human approval initially.
- **Claude Code** — the primary builder. Implements features and documentation per approved specs.
- **Codex** — the independent reviewer and quality-control engineer. Inspects diffs, compares implementation against specifications, identifies issues, adds or runs tests, and fixes confirmed problems through focused commits.

Doer and checker are deliberately different agents reading independently, not the same agent reviewing its own output. See the Research Data Integrity rules in [CONTRIBUTING.md](../CONTRIBUTING.md) for why this separation matters, especially in evidence-producing modules.

## How work moves

1. A requirement or milestone is documented (see [roadmap.md](roadmap.md) and [milestones/](milestones/)).
2. Claude Code implements a complete vertical slice against that requirement, per [principles.md](principles.md).
3. Codex independently reviews the diff against the spec, runs or adds tests, and raises confirmed issues.
4. Confirmed issues are fixed through focused commits, not folded silently into the original change.
5. The human approves and merges.

## Architecture and scope decisions

Decisions that change architecture, choose a runtime, or expand scope beyond a current milestone are recorded in [docs/decisions/](decisions/), not just discussed in passing. See [decisions/README.md](decisions/README.md) for the format.

## Working on this repository right now

The repository currently contains documentation and structure only. Until the first milestone (see [milestones/problem-department-mvp.md](milestones/problem-department-mvp.md)) is explicitly greenlit for implementation, work should stay in `docs/` — no application code, agent runtime, or scaffolding.
