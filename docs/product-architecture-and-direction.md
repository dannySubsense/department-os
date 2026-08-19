# Department OS

> **Role of this document:** Durable product compass for Department OS. It does not replace `docs/NORTHSTAR.md`, module specifications, architecture decisions, or roadmaps. It exists to hold the stable product vision, module boundaries, commercial structure, and Mission Control direction steady while implementation evolves.

Product Architecture, Commercial Structure, and Build Direction

Working reference. The purpose of this document is to hold the product vision steady while implementation evolves.

## 1. The Core Thesis

Department OS exists to move ideas from paper to practice. It is not an idea generator and it is not merely an agent dashboard. It is a system for capturing what is worth attention, investigating what is actually true, deciding what deserves further investment, and carrying the surviving ideas into experiments and builds.

The central operating sequence is:

Not every path begins at Signal or Problem, and not every idea needs to become a commercial product.

## 2. The Product Topology

Department OS Core is the shared operating environment. Departments are separately useful modules that run inside that environment.

## 3. The Departments

### Signal Foundry

What is emerging that deserves attention?

Finds products, technologies, research, market shifts, conversations, and other signals worth investigating.

### Problem Department

What do people genuinely need, and where is the unresolved demand?

Investigates real problems, demand evidence, existing solutions, gaps, uncertainty, and whether a problem deserves further attention.

### Prototype Department

What is the smallest credible thing we can build to test this opportunity?

Turns qualified opportunities into hypotheses, requirements, prototypes, experiments, benchmarks, and release decisions.

### Creative Practice Engine

How does this collection of projects become a coherent creative practice?

Connects projects, research, writing, images, unfinished work, proposals, and themes into a usable creative body of work.

### Later specialized module: Patent Reinvention

A later bonus module for discovering expired or abandoned patents, decomposing mechanisms, identifying contemporary recombination opportunities, and handing qualified concepts into Prototype Department.

## 4. Parallel Discovery Paths

Problem Department is not the only way work enters Department OS. The system must preserve at least two distinct entry paths.

Important boundary: Problem Department is not the authorization gate for Mandate to Build. A personally compelling build can be worthwhile even when broad commercial demand is uncertain.

## 5. Opportunity as the Convergence Point

The working architectural idea is that different discovery paths can eventually converge on a shared concept such as Opportunity. Opportunity should not mean proven business opportunity. It means something sufficiently supported or compelling to deserve intentional next-stage consideration.

- A Problem Department investigation may produce an Opportunity.

- A Mandate to Build / Personal Pull experiment may produce an Opportunity.

- Signal Foundry may promote a signal into an Opportunity.

- Future modules such as Patent Reinvention may also produce Opportunities.

- Prototype Department operates on qualified Opportunities regardless of origin.

The Opportunity schema is intentionally not frozen yet. The architecture should preserve the convergence without prematurely encoding it.

## 6. Mission Control: What the Product Should Feel Like

The visible operating environment is part of the product, not end-stage decoration. Department OS should feel like a serious research and build command center: navigable, stateful, evidence-rich, and operational.

When a user enters Problem Department, the interface changes from system-level Mission Control to a Department-specific workspace.

- Investigations list and status.

- Current Investigation workspace.

- Sources and source resolution.

- Workflow stages and real run activity.

- Problem Brief.

- Evidence and provenance inspection.

- Human decisions and later decision history.

No fake agent theater. If the backend cannot supply a state, event, agent, metric, or relationship honestly, the interface should not invent it.

## 7. Module Packaging and Commercial Structure

The modular architecture is also the commercial architecture.

Each Department must be valuable alone. The suite becomes more valuable because Departments can hand work to one another through shared Core concepts and provenance.

## 8. Mandate to Build

Mandate to Build is the public laboratory surrounding Department OS. It is not another Department tile.

Its thesis is to find something overpriced, inaccessible, overcomplicated, poorly served, or simply fascinating; understand the useful mechanism; build an ethical original alternative; test it; and publish the process.

- YouTube and Shorts.

- Articles or build journals.

- Community / build-with-us participation.

- Public experiments and benchmarks.

- Product launches that emerge from successful experiments.

### Experiment 001: AI Video Playbook / AI YouTube Clone

The first intended Mandate to Build experiment is the AI avatar/video system. The idea is to build the system and potentially use the resulting avatar as the public face and narrator of Mandate to Build itself.

Relationship to Problem Department: Problem Department may investigate creator pain, existing products, demand, gaps, trust, cost, and commercial potential around the AI Video experiment. Its recommendation informs the experiment but does not grant or deny permission to pursue it.

## 9. Product and Evidence Discipline

- Evidence must be traceable to source material.

- Contradicting evidence is preserved, not hidden.

- Facts, observations, interpretations, assumptions, and unknowns remain distinguishable.

- Decisions bind to the specific evidence/Brief version that existed when the decision was made.

- Corrections supersede prior records rather than silently rewriting history.

- No unsupported score, threshold, cutoff, target, or confidence metric becomes truth because it sounds reasonable.

- Numbers must be cited, benchmarked, measured, or explicitly marked PROVISIONAL - unvalidated with an owner and evaluation plan.

- Independent auditors receive the map, not the author's reasoning path.

## 10. Build Principles

- Preserve the full roadmap. YAGNI controls implementation timing, not removal of requirements.

- Build in visible vertical increments.

- Prefer reversible architecture decisions.

- Do not build speculative infrastructure.

- Agent runtimes are replaceable execution components, not the owner of Department OS domain state.

- Department OS owns evidence, workflow state, decisions, package versions, and knowledge relationships.

- Tests and QC are engineering evidence, not substitutes for product demonstration.

- No long invisible tunnels. Meaningful slices should produce something a human can see, operate, inspect, or understand whenever the capability allows it.

## 11. Current Implementation Checkpoint

Current checkpoint: Problem Department MVP, after Slice 9.

Current strategic correction: Preserve Slices 1 through 9, but stop allowing backend completion to stand in for product progress. The next work must make Department OS visible and navigable around the real machinery already built.

## 12. What Is Frozen vs. What Is Still Open

## 13. The Compass

From paper to practice.



| Department OS is an operating environment for turning curiosity, signals, and real-world problems into evidence-backed decisions, experiments, prototypes, and products. |

| --- |



| Signal | Problem | Evidence | Opportunity | Prototype | Test | Decision |

| --- | --- | --- | --- | --- | --- | --- |



| Department OS Core | Shared capability |

| --- | --- |

| Mission Control | Home surface for Departments, active work, status, and navigation. |

| Workflow state | Durable investigations, runs, stages, checkpoints, approvals, and recovery. |

| Evidence and provenance | Sources, claims, citations, contradictions, lineage, and version history. |

| Knowledge graph | Relationships among signals, problems, evidence, people, products, experiments, and outcomes. |

| Run and activity observability | What executed, what succeeded or failed, which model/tool/runtime was involved. |

| Human control | Review, approve, reject, watch, override, and inspect decisions. |

| Evaluation and learning | Future loops for quality, cost, latency, model choice, prompts, tools, and package performance. |



| Path | Opening question | Primary destination |

| --- | --- | --- |

| Discovered Demand | What problems are people actively trying to solve? | Problem Department |

| Personal Pull | I want that, but not badly enough to buy it. Can I build the useful part myself? | Mandate to Build / creative exploration |



| Persistent left navigation | Mission Control workspace |

| --- | --- |

| Mission Control<br>Departments<br>Activity<br>Evidence<br>Knowledge<br>Runs | Department tiles<br>Active work<br>Recent investigations<br>Current run status<br>Recent artifacts<br>Cross-system activity |

| Department selector | Enter Problem Department, Prototype Department, Signal Foundry, or Creative Practice Engine |



| Customer buys | They receive | Why it works |

| --- | --- | --- |

| Problem Department | Department OS Core + Problem Department | Standalone research and demand-investigation product. |

| Creative Practice Engine | Department OS Core + Creative Practice Engine | Standalone creative-practice operating environment. |

| Prototype Department | Department OS Core + Prototype Department | Standalone experimentation and prototype workflow. |

| Full Suite | Department OS Core + all Departments | Cross-Department handoffs and compounding shared evidence, memory, and workflow state. |



| Completed | Not yet complete |

| --- | --- |

| Runtime/storage decision | Recognizable Department OS shell |

| Persistence and source intake | Mission Control experience |

| Source resolution | Browser-to-generation execution connector |

| Evidence/claim extraction | Completed Investigation Workspace |

| Demand analysis and Personal Pull extraction | Human Approve / Reject / Watch interaction |

| Landscape research and gap hypothesis | Decision history / validity / supersession UI |

| Uncertainty and recommendation | Full end-to-end visible Problem Department experience |

| Generation provenance |  |

| Brief assembly and persistence |  |



| Frozen product direction | Still open / to be learned |

| --- | --- |

| Department OS Core + modular Departments | Exact Opportunity schema and qualification states |

| Signal Foundry, Problem Department, Prototype Department, Creative Practice Engine | Final visual language and component system |

| Mandate to Build as public lab, not a Department | Final runtime architecture across the full suite |

| Personal Pull and Discovered Demand as distinct paths | Knowledge graph implementation technology |

| AI Video as Mandate to Build Experiment 001 | Long-term packaging and pricing |

| Mission Control / Agent OS character as part of the product | Exact automation/monitoring behavior |

| Evidence-first, auditable, uncertainty-preserving discipline | How much of Mission Control becomes real-time vs. persisted-state views |

| Departments useful separately and stronger together |  |



| Department OS should make it easier to notice something worth attention, understand what is actually true, decide what deserves to survive, and carry the surviving idea into a real experiment or build. |

| --- |
