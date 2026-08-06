# Architectural Principles

These principles govern how Department OS is built and how implementation timing decisions get made. They apply to every module and every workflow.

## Full requirements remain documented on the roadmap

Not building something now does not mean removing it from the record. Every capability described in [modules.md](modules.md) and [architecture.md](architecture.md) stays documented on [roadmap.md](roadmap.md) even while unimplemented, so scope is never silently lost or rediscovered later as if it were new.

## YAGNI governs timing, not removal of requirements

"You aren't gonna need it yet" decides *when* something gets built. It does not decide whether a documented requirement still exists. A requirement can be deferred indefinitely; it should not be quietly dropped from the record because it wasn't in the first milestone.

## Build in complete vertical slices

A slice is complete when it touches every layer it needs to touch — evidence, workflow state, and a decision, not just a UI or just a backend endpoint. A module without Department OS Core underneath it is not a complete slice; a demo that produces output but records no evidence or decision is not a complete slice either.

## Prefer reversible architectural decisions

When a choice can be tested cheaply and undone, prefer it over a choice that is correct-by-assumption but expensive to reverse. This is why the agent runtime, storage technology, and application framework are not chosen yet — none of them have been tested against a real vertical slice.

## Avoid speculative infrastructure

Do not scaffold frameworks, services, CI pipelines, or abstractions ahead of a concrete need. Infrastructure earns its place by being required for the vertical slice currently being built, not by being generally good practice.

## Preserve runtime neutrality until an architecture decision is tested

No agent runtime (Pi, OpenJarvis, Hermes, Claude Agent SDK, or any other) is forked, embedded, or assumed until a practical vertical-slice evaluation has actually run against candidates. Until then, Department OS Core must not encode assumptions that only one runtime can satisfy.

## Department OS owns the substrate; runtimes are replaceable

Domain records, evidence, workflow state, decisions, package versions, and knowledge relationships belong to Department OS Core. Agent runtimes are execution components that operate against that substrate and can be swapped without losing the record of what happened.

## Data integrity is non-negotiable in research and evidence paths

Every Department OS module that produces evidence — most directly the Problem Department — is a research pipeline. The [Research Data Integrity rules](../CONTRIBUTING.md#research-data-integrity) apply: unsourced numbers do not pass, raw inputs get inspected before the pipeline that reads them, and independent review requires independent sources, not just independent reviewers reading the same corrupted well.
