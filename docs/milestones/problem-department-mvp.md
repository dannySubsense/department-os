# Milestone: Problem Department — Vertical Slice MVP

**Status:** Documented, not yet implemented. Do not build this until it is explicitly greenlit.

## Why this milestone first

The Problem Department answers Department OS's most foundational question — what do people genuinely need, and where is the unresolved demand — and its output (a cited Problem Brief) is the smallest artifact that exercises every layer of Department OS Core: evidence, workflow state, and a recorded decision. It is also the natural first target for the runtime evaluation described in [architecture.md](../architecture.md), since it requires real multi-step agent workflow behavior (research, clustering, classification) rather than a single call.

## Scope

The smallest complete Problem Department vertical slice:

1. Add or collect source links.
2. Extract specific problem statements.
3. Cluster supporting evidence.
4. Research existing solutions and competitors.
5. Identify unresolved gaps.
6. Classify demand confidence.
7. Generate one cited Problem Brief.
8. Present it for human approval, rejection, or watch status.
9. Record sources, artifacts, workflow state, runtime events, and the final decision.

## What "complete" means for this slice

Per [principles.md](../principles.md), a slice is not complete unless it exercises Department OS Core, not just produces output:

- The Problem Brief must cite real sources with provenance (evidence ledger), not just prose claims.
- Workflow execution (steps 2–7) must produce durable, inspectable state — not a single opaque call with no checkpoints.
- The human decision in step 8 (approve / reject / watch) must be recorded, not just made verbally.
- Runtime events and costs from whichever agent runtime executes this slice must be captured, since this slice is also the first practical test of runtime replaceability.

## What is explicitly out of scope for this milestone

- A polished dashboard UI — a minimal way to review and decide on a Problem Brief is sufficient; the full dashboard described in [architecture.md](../architecture.md) is not required.
- The knowledge graph, evaluation/learning loops, and packaged/purchasable workflows — these are Core requirements documented on the [roadmap](../roadmap.md) but not required to prove this slice.
- Any other module (Signal Foundry, Prototype Department, Creative Practice Engine, Mandate to Build, Skool, Patent Reinvention).
- Choosing a permanent agent runtime — this milestone is where the practical evaluation happens, not where the choice is assumed going in.

## Sequencing note

This document defines *what* the first executable milestone is. It does not authorize implementation. Implementation begins only after this milestone is reviewed and explicitly approved, and after the runtime evaluation referenced in [architecture.md](../architecture.md) has a plan.
