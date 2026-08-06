# North Star — Department OS

**Status:** Active
**Established:** 2026-08-06
**Last reviewed:** 2026-08-06

---

## Thesis

Department OS is a local-first operating system for discovering real problems, validating demand, prototyping solutions, and turning uncertainty into tested business models, with evidence, workflow observability, knowledge graphs, and human-in-the-loop control.

It exists because ideas usually die in an ambiguous middle — noticed, discussed, never tested. Department OS closes that gap by making every module produce an artifact that can be acted on: a signal becomes a brief, a brief becomes a decision, a decision becomes a prototype, a prototype becomes evidence for the next decision. Department OS Core owns the durable substrate underneath this — domain records, evidence, workflow state, decisions, package versions, and knowledge relationships — so that record survives any individual module, workflow, or agent runtime.

## Non-Goals

- **Not a general-purpose agent framework.** Agent runtimes (Pi, OpenJarvis, Hermes, Claude Agent SDK, or otherwise) are replaceable execution components operating against Department OS Core, never forked or embedded as the product's identity.
- **Not a content calendar or idea board.** Every module is accountable to evidence and a recorded decision, not to output volume — a Problem Brief without citations, or a prototype without a decision record, is not a complete artifact.
- **Not built framework-first.** No speculative infrastructure, no scaffolding ahead of a concrete vertical-slice need. Full requirements stay documented on the roadmap even when deferred — YAGNI governs timing, not removal of scope.
- **Not expanding scope via the later modules.** Patent Reinvention is documented for completeness only and must not pull implementation attention before the core Department OS suite exists.

## Success Criteria

- Every module ships as a complete vertical slice — touching evidence, workflow state, and a recorded decision — never as output with no accountable record behind it.
- Every accepted opportunity in the system has a cited evidence trail traceable through the evidence ledger — not an assertion.
- Agent runtime and other reversible architecture decisions are made through practical vertical-slice evaluation against real milestones, never chosen upfront.
- Department OS Core demonstrably owns domain records, evidence, workflow state, and decisions independent of which runtime or module produced them.

## Drift Check — Tripwires

Re-read this document, and treat the following as signals that work has drifted from the thesis:

1. **Application code, an agent runtime, or infrastructure gets scaffolded before the Problem Department MVP has been explicitly greenlit for implementation.** Per `docs/development-workflow.md`, work stays in `docs/` until that milestone is approved.
2. **A module produces output with no citation, no workflow-state record, or no recorded decision.** That is not a complete vertical slice per `docs/principles.md` — it is activity without evidence.
3. **An agent runtime gets forked, embedded, or assumed** before the practical vertical-slice evaluation described in `docs/architecture.md` has actually run.
4. **Patent Reinvention, or any other later-module concept, starts absorbing implementation time** ahead of the core suite it depends on.
