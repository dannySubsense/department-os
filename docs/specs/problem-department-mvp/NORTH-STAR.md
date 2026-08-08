# Sprint North Star: problem-department-mvp
**Status**: Locked
**Date**: 2026-08-08

## Declared Intent

Prove that Department OS can turn an Investigation seeded by one or more human-submitted source artifacts, supplemented by cited independent web research, into an auditable Problem Brief — evidence, demand-signal type, a qualitative demand-confidence classification, an explicit gap hypothesis, and named uncertainty — that supports a real, recorded Approve/Reject/Watch decision, without fabricating certainty the evidence doesn't support. This traces directly to Intake's framing (Section 3, milestone recap) of the smallest complete Problem Department vertical slice, and to the Interview's resolution that the Brief is a Problem-Department-specific evidence artifact, not a generic idea-intake form.

## In Scope / Out of Scope

See `01-REQUIREMENTS.md` Out of Scope. At Intake/Interview time, explicitly out of scope: automated/multi-channel source discovery, any UI polish beyond a minimal review/decide surface, the knowledge graph, evaluation/learning loops, packaged workflows, any module other than Problem Department, permanent agent-runtime selection, and Opportunity schema design.

## Success Criteria (Layer 1 — fidelity)

- A human can submit one or more source artifacts (URLs/text) and receive one Problem Brief containing all seven required elements per `01-REQUIREMENTS.md`'s canonical "Required Brief Elements" section — referenced there, not restated here, per that section's own cross-doc rule.
- No unsupported or fabricated system-generated evaluative score or estimate appears anywhere in a Problem Brief (demand confidence, market size, or otherwise) — per Intake §5/§6 and the global Research Data Integrity rule. This does not prohibit a sourced numeric claim (e.g. a source's own "$50M market" assertion), a structural identifier (e.g. a version number), or a transparent calculation derived from recorded evidence — provided each remains attributed and labeled as such, never presented as Department OS's own conclusion.
- Personal Pull, if encountered, may be retained as source context outside the seven required Problem Brief elements, but is never treated as market-demand evidence or used to increase demand confidence (per Danny's Intake-review correction).
- The human decision (Approve/Reject/Watch) is preserved in a durable Decision record bound to the exact Problem Brief version evaluated — not a verbal or ephemeral decision — with Reject retaining the record and remaining reconsiderable (new source material may initiate a new generation run and a new, independently decided Problem Brief version, without mutating or closing the original decision or lineage — no dedicated reopen mechanism), and Watch recording explicit, named reconsideration conditions (no invented recheck interval).
- Every major claim in a Problem Brief traces to its source evidence; a later Brief can correct/supersede an earlier one without silently overwriting history; a ClaimVersion or BriefVersion can receive an append-only challenged or invalidated status event, with visibility into which decisions depended on it; enough runtime/model provenance is preserved to investigate how a claim was generated.
- Approve does not itself trigger Prototype Department or any build step — it qualifies the investigation for a later, separate Opportunity/handoff decision, per Interview Q3/Q4.

## Traceability (Layer 2 input — Frank verifies independently, does not trust this field)

Project North Star bullet(s) this sprint serves: `docs/NORTHSTAR.md` Success Criteria — "Every module ships as a complete vertical slice — touching evidence, workflow state, and a recorded decision — never as output with no accountable record behind it" and "Every accepted opportunity in the system has a cited evidence trail traceable through the evidence ledger — not an assertion." Establishes the upstream cited evidence trail required for the future accepted-opportunity criterion, without creating or accepting an Opportunity in this sprint. Also serves Drift-Check tripwire #2 (no output without citation/workflow-state/decision) directly, and Non-Goal "Not a content calendar or idea board."

Project North Star status at gate time: non-DRAFT (`Status: Active`, established 2026-08-06) → normal binding PASS/FAIL, no PROVISIONAL tag.
