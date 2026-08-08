# Requirements: Problem Department — Vertical Slice MVP

## Summary

Enable a human to submit one or more source artifacts and receive one cited, auditable Problem Brief — containing the seven canonical Brief elements defined below — that supports a real, durably recorded Approve/Reject/Watch decision, without fabricating system-generated numeric certainty the evidence doesn't support.

## Required Brief Elements (Canonical)

This is the authoritative enumeration. Every other document in this sprint (02-ARCHITECTURE.md, 04-ROADMAP.md, 05-REVIEW.md) must reference this list by pointer, not restate it or a count.

1. **Problem definition** — must contain a specific problem. No absence path: a Brief cannot complete with "no specific problem could be established" recorded as this element's content (see US-1 and the Constraints section for the completion-boundary rule this implies).
2. **Evidence** (labeled + contradicting) — must contain evidence, or explicitly state that adequate evidence was not found.
3. **Demand evidence** (signal type + confidence — two fields, one element) — must record observed signal types or "none found," plus the resulting confidence classification.
4. **Existing-solution landscape** — must report identified solutions, or explicitly record that none were found within the documented search scope.
5. **Gap hypothesis** — must state the hypothesized gap, or that no defensible gap was established.
6. **Uncertainty** — must identify unresolved uncertainty.
7. **Decision recommendation** — must contain Approve, Reject, or Watch with reasoning.

**All seven are required and must be non-empty.** For six of the seven elements (2 through 7), "non-empty" permits an explicitly recorded negative/absent finding — that is itself a meaningful, auditable result. Element 1 (Problem definition) has no such path: a Brief cannot be produced at all unless a specific problem is established. Of the remaining six, four are **negatable** — Evidence, Demand-Signal-Type, Existing-Solution, and Gap Hypothesis — meaning they may carry an explicit negative finding as their recorded content (this is Danny's original binding Q-2 decision; a prior revision incorrectly generalized negatability to Problem Statement as well, which has been reverted). Uncertainty and Decision Recommendation are always populated with a substantive statement, not a negative finding, by their nature. Empty means the workflow may have skipped the work; explicitly absent (for the four negatable elements) means the work occurred and produced a negative or inconclusive result. The fail-closed validation gate (defined at the architecture layer) must check for a populated, explicit statement — even one that says "none found" or "no defensible gap established" — not merely "field is non-null." Which specific field/schema shape carries the explicit-absence statement is an architecture decision, not specified here.

This rule holds regardless of what kind of source material was submitted, including submissions dominated by Personal Pull framing — Personal Pull's possible lack of market evidence does not relax any of the seven elements; for the four negatable elements it is handled by recording the negative finding (e.g., demand-signal types = "none found," confidence = Insufficient), not by waiving the element. It never substitutes for or waives the Problem definition element, which still requires a specific, established problem regardless of how Personal-Pull-dominant the source material is.

## Numeric Scope Rule

The prohibition on fabricated numbers applies to **unsupported or fabricated system-generated evaluative scores and estimates** — e.g., a Department-OS-generated confidence percentage, market-size figure, or probability that no recorded evidence supports. It does **not** apply to:

- Sourced numeric claims — a number a source asserts (e.g., a blog post's "$50M market") may be retained, but only if it remains attributed and labeled as *that source's claim*, never silently converted into Department OS's own conclusion.
- Structural identifiers — version numbers, IDs, counts of sources, timestamps, etc.
- Transparent calculations derived from recorded evidence — e.g., "3 of 4 sources report X," where the number is a direct, inspectable tally of recorded items, not a judgment call dressed as a number.

## User Stories

**US-1**
As a human researcher (Danny),
I want to submit one or more source artifacts (URLs/text) as the seed for an investigation and receive a durable Investigation URL I can revisit,
so that Department OS begins a Problem Department workflow grounded in real evidence rather than an unattributed idea, and I can check on it without a notification system or dashboard.

**US-2**
As a human researcher,
I want the system to extract specific problem statements and cluster supporting evidence from the submitted sources,
so that the resulting Brief reflects a coherent problem, not a scattershot of unrelated claims.

**US-3**
As a human researcher,
I want each evidence item labeled as fact, observation, interpretation, assumption, or unknown, and both supporting and contradicting evidence recorded,
so that I can judge evidence quality myself rather than trust an unlabeled assertion.

**US-4**
As a human researcher,
I want the Brief to record the demand-signal types found (e.g. recurring complaints, workarounds, existing spend, paid labor, switching behavior, willingness to pay, RFPs, feature requests, other observed behavior) separately from a qualitative demand-confidence classification (Insufficient / Emerging / Substantiated) with a short reasoned narrative,
so that "what evidence exists" and "how strongly it supports real demand" are not conflated, and no fabricated system-generated numeric score stands in for judgment.

**US-5**
As a human researcher,
I want the Landscape Researcher to perform its own independent web research into existing solutions and competitors — not research bounded to whatever the submitted artifacts happen to mention — and record the existing-solution landscape (what already addresses the problem, how people cope now, where it's inadequate) and an explicit gap hypothesis (categorized, e.g. capability/usability/price/workflow fit/trust/integration/accessibility/distribution/other),
so that the Brief states a specific, falsifiable claim about what's missing, grounded in a real search of the market rather than a selective, outdated, or self-serving landscape a source artifact happened to present.

**US-6**
As a human researcher,
I want the Brief to state what's unknown, what would change the conclusion, and what's undeterminable from available sources,
so that the Brief doesn't imply more certainty than the evidence supports.

**US-7**
As a human researcher,
I want a reasoned Approve/Reject/Watch recommendation attached to the Brief,
so that I have a starting judgment to accept, override, or investigate further — not a bare score.

**US-8**
As a human researcher,
I want to record my own Approve/Reject/Watch decision against a specific Brief version,
so that the decision is durable workflow state bound to the evidence that existed when I made it, not a verbal or ephemeral call.

**US-9**
As a human researcher,
I want Reject to retain the record (reconsiderable via new evidence and a new run, not reopened in place) and Watch to require explicit, named reconsideration conditions,
so that neither decision destroys information or leaves "watch" meaning nothing operationally.

**US-10**
As a human researcher,
I want every major claim in a Brief to trace to its source evidence, Brief versions to be identifiable, corrections to supersede rather than silently overwrite, and claims/Briefs to be markable as challenged or invalidated with visibility into which decisions depended on them,
so that if a Brief later proves wrong, the error is traceable and the decision history stays honest.

**US-11**
As a human researcher,
I want enough runtime/model/tool provenance captured per Brief-generating run,
so that I can investigate or reproduce how a specific claim was generated.

**US-12**
As a human researcher,
I want Personal Pull content, if present in source material, recorded only as separate contextual motivation,
so that it never inflates or substitutes for demand-signal type or demand-confidence classification.

**US-13**
As a human researcher,
I want a minimal surface, reached via the Investigation's durable URL, to review a completed Brief presented from that Investigation and record my decision,
so that I can complete the workflow without a polished dashboard, notification system, or list view being built first.

## Acceptance Criteria

**US-1**
- [ ] Given one or more URLs/source-text artifacts, when submitted, then the system creates one investigation record referencing all submitted sources and returns an Investigation ID and durable URL.
- [ ] Given a submission, when accepted, then the input contract does not assume human submission is the only present or future source (i.e., the submission record does not hard-code a "human-pasted" origin field that would prevent a future collector-fed submission from using the same intake shape).
- [ ] Given zero sources submitted, when the human attempts to start an investigation, then the system rejects the attempt rather than producing a Brief with no evidentiary basis.
- [ ] Given a durable Investigation URL, when revisited at any time, then it shows exactly one of: generating (still in progress); blocked, with the reason and the permissible next action; generation-failed, with the reason; or completed, with the resulting BriefVersion presented from the Investigation — no notification, dashboard, list view, or background client polling is required; a manual revisit/refresh is sufficient for this MVP.
- [ ] Given sources that are reachable and yield extractable content, when no specific problem meeting the Problem definition element's requirements (who/context/consequence, evidence-cited) can be established from that material, then generation fails explicitly: no BriefVersion is produced, no negative finding is recorded for the Problem definition element, and the Investigation is marked generation-failed with the reason — completing with a negative finding in place of a problem statement is never a valid outcome.

**US-2**
- [ ] Given submitted sources, when processed, then each resulting problem statement populates all three of who (who experiences it), context (workflow/situation), and consequence (friction/impact), and cites at least one evidence item — a structural, checkable requirement, not a subjective judgment of "genericness."
- [ ] Given multiple sources with overlapping evidence, when clustered, then evidence items supporting the same claim are grouped under that claim rather than listed as unrelated items.

**US-3**
- [ ] Given any evidence item in a Brief, when displayed, then it carries exactly one of the labels: fact, observation, interpretation, assumption, or unknown.
- [ ] Given evidence that contradicts another evidence item or the emerging problem statement, when present in sources, then it is recorded in the Brief as contradicting evidence, not omitted.

**US-4**
- [ ] Given demand-related evidence, when recorded, then each demand-signal-type entry is drawn from a named-type list of observed market-behavior evidence — recurring complaints, workarounds, existing spend, paid labor, switching behavior, willingness to pay, RFPs, feature requests, other observed behavior — and the list is extensible to "other" rather than closed to an exact fixed set.
- [ ] Given a Brief's full evidence set, when demand confidence is classified, then it is exactly one of Insufficient / Emerging / Substantiated, each with a short reasoned narrative citing which signals and gaps drove the classification.
- [ ] Given a demand-confidence classification of Insufficient driven by an absence of demand signals, when recorded, then the classification references the specific negative finding it relied on for the demand-signal-type element, so the "Insufficient" judgment is traceable to the recorded absence result rather than merely co-occurring with it; this reference is absent when signals were found.
- [ ] Given any Brief, when inspected, then no system-generated numeric confidence score or estimate (e.g. "78/100") appears anywhere in the demand-confidence field or elsewhere in the Brief as a Department-OS-authored judgment (per the Numeric Scope Rule, an attributed sourced number remains permitted as a labeled source claim).
- [ ] Given Personal Pull content present in source material, when the Brief is generated, then it does not appear in the demand-signal-type list and is not cited as a driver of the demand-confidence narrative.

**US-5**
- [ ] Given the problem statement, when the Landscape Researcher runs, then it performs independent public web search and retrieval for existing solutions/competitors — it is not limited to solutions named or implied by the submitted source artifacts, and a submission naming zero competitors does not exempt the workflow from researching the landscape.
- [ ] Given each search performed, when it completes, then the query, retrieved URL(s), retrieval timestamp, and the relevant retrieved material are preserved as part of the investigation record, sufficient to audit what was searched and found.
- [ ] Given a landscape or gap-hypothesis conclusion in the Brief, when inspected, then it is cited through the same evidence/provenance/labeling model (fact/observation/interpretation/assumption/unknown, source-linked) used elsewhere in the Brief — not asserted as an unsourced system judgment.
- [ ] Given the completed landscape research, when recorded, then the Brief states the search scope and limitations, including any failed or blocked retrievals, as part of the Brief's honesty discipline — this is not optional metadata.
- [ ] Given the existing-solution landscape, when researched, then the Brief records what existing solutions/competitors address the problem, how people currently cope, and where the coping is inadequate — or explicitly records that no existing solutions were found within the documented search scope.
- [ ] Given the existing-solution landscape, when a gap is identified, then the gap hypothesis names a category (capability/usability/price/workflow fit/trust/integration/accessibility/distribution/other) and is evidence-supported, not asserted without citation — or explicitly states that no defensible gap was established.

**US-6**
- [ ] Given the assembled evidence, when uncertainty is stated, then the Brief names at least: what's unknown, what would change the conclusion, and what's undeterminable from available sources.

**US-7**
- [ ] Given a completed Brief, when the recommendation is generated, then it is exactly one of Approve/Reject/Watch, accompanied by a written rationale referencing the Brief's evidence — never a bare label or numeric score.

**US-8**
- [ ] Given a Brief, when a human records Approve/Reject/Watch, then the decision is persisted as workflow state bound to the specific Brief version the human evaluated.
- [ ] Given a decision is recorded, when the same Brief is later superseded by a new version, then the original decision remains bound to the original version's evidence state, not silently migrated to the new version.
- [ ] Given an Approve decision, when recorded, then the system does not trigger Prototype Department work or any build step — Approve only qualifies the investigation for a later, separate Opportunity/handoff decision.

**US-9**
- [ ] Given a Reject decision, when recorded, then the Brief and its evidence remain retrievable (not deleted), the Investigation is not closed or mutated, and the decision is reconsiderable: materially new source material initiates a new generation run and a new BriefVersion, against which an independent new decision is recorded — no dedicated "reopen" operation is required or implied.
- [ ] Given a Watch decision, when recorded, then at least one explicit, named reconsideration condition (new evidence, product change, stronger demand signal, feasibility shift, price change, market event, or other named condition) is captured; a Watch decision with zero reconsideration conditions is rejected as incomplete.
- [ ] Given a Watch decision, when recorded, then no automatic recheck interval or scheduler is invented — reconsideration remains manual for this slice.

**US-10**
- [ ] Given any major claim in a Brief, when inspected, then it links to the specific source evidence it derives from.
- [ ] Given a Brief is corrected after generation, when the correction is applied, then a new version is created that supersedes the prior one; the prior version's content remains readable, not overwritten in place.
- [ ] Given a claim or Brief is later found wrong, when marked challenged/invalidated, then the system shows which decisions (Approve/Reject/Watch) were made while that claim/Brief was considered valid.

**US-11**
- [ ] Given a Brief-generating run, when it completes, then the record includes which model/tool/runtime executed it, sufficient to investigate how a specific claim was produced.
- [ ] Given any model-produced structured field in a Brief-generating run, when the output is validated against its declared schema, then an out-of-schema value (including an invalid enum member) is never silently coerced, defaulted, or treated as valid; the system may attempt a bounded repair using the validation error, and if the repaired output still fails validation the generation run fails explicitly and records the failure; the original invalid output, the validation error, and the repair attempt(s) are preserved in the run's provenance record per this story's provenance requirement.

**US-12**
- [ ] Given source material containing Personal Pull framing ("I want this, but not badly enough to buy it"), when a Brief is generated, then that framing is captured, if at all, in a field explicitly separate from evidence/demand fields, labeled as contextual motivation, not market evidence.

**US-13**
- [ ] Given a generated Brief awaiting decision, when a human accesses it via the Investigation's durable URL, then they can read all seven required Brief elements (see Required Brief Elements section above), presented from the Investigation resource (the completed Brief does not replace or hide the Investigation — lineage stays navigable), and submit an Approve/Reject/Watch decision (with reconsideration conditions for Watch) through some interface — no requirement that this interface be more than functionally minimal, and no notification, dashboard, or list view is required.

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| Submitted source URL is dead/unreachable | Investigation proceeds with remaining sources if any exist; the dead source is recorded as an unreachable/failed source, not silently dropped, and does not block Brief generation if other evidence exists. If no source is reachable, no Brief is generated and the investigation is marked blocked, not silently empty. |
| Submitted source URL resolves successfully but yields no extractable content (paywall, login wall, JS-only rendering) | This is distinguishable from a source with real, extracted content — it must not be recorded merely as `reachable` with empty evidence, which would be indistinguishable from a source that legitimately contained nothing relevant. The source's resolution status must record that content extraction failed/was blocked, separately from network reachability, so the gap is auditable rather than silently absorbed into "no evidence found." |
| Sources are reachable and yield extractable content, but no specific problem (who/context/consequence, evidence-cited) can be established from that content | No BriefVersion is produced. The Investigation is marked generation-failed with the reason recorded — this is not a negative finding recorded against the Problem definition element (that element has no absence path); it is a completion-boundary failure of the generation run itself. |
| Landscape web search returns zero results, or all attempted retrievals fail/are blocked | The Brief still records the search scope and states explicitly that no existing solutions were found within that scope, including which retrievals failed/were blocked and why — this is a valid, auditable negative finding, not a workflow failure, and does not exempt the Brief from the existing-solution-landscape element. |
| Submitted source artifact names zero competitors, or presents a selective/outdated/self-serving landscape | Does not bound or substitute for the Landscape Researcher's independent web research; the submitted artifact's framing may be recorded as a labeled, attributed claim but is never treated as the completed landscape research on its own. |
| Sources contain only Personal Pull-style content, no market evidence, but a specific problem can still be established | All seven Brief elements are still required and non-empty; of these, the four negatable elements (evidence, demand-signal-type, existing-solution, gap hypothesis) may carry the negative-finding rule — this is not a relaxed contract for Personal-Pull-dominant submissions. The demand-signal-type list explicitly records "none found"; demand confidence is classified Insufficient with a narrative explaining the absence of market evidence; Personal Pull content is recorded separately as contextual motivation, never substituted into demand fields or treated as satisfying the demand-evidence element. If a specific problem cannot also be established from Personal-Pull-only material, this instead falls under the generation-failed case above, not this one. |
| Evidence is contradictory (some sources support demand, others contradict it) | Both supporting and contradicting evidence are recorded; the demand-confidence narrative explicitly addresses the contradiction rather than silently averaging or picking a side. |
| A claim cannot be labeled with confidence as fact/observation/interpretation/assumption/unknown | Default to the most conservative applicable label (unknown or assumption) rather than omitting the label. |
| Human wants to change a Watch decision to Approve/Reject later | A new decision is recorded against the current Brief version at that time; the prior Watch decision and its reconsideration conditions remain in history, not overwritten. |
| A later Brief version corrects an earlier claim that a decision was based on | The earlier decision stays bound to the earlier version's evidence state; the correction is visible as a new version, and the system surfaces that a decision exists on a now-superseded version. |
| Human submits zero reconsideration conditions with a Watch decision | Rejected as incomplete per US-9; the human must supply at least one named condition. |
| Runtime/model used to generate a Brief becomes unavailable or is later replaced | The provenance record for existing Briefs remains as originally captured; no requirement to backfill or re-run with a new runtime. |
| A source itself contains a numeric claim (e.g. a blog post citing "$50M market") | Per the Numeric Scope Rule, such a number may be recorded as a cited, attributed claim from that source (labeled interpretation/assumption/unknown as appropriate) but must remain visibly attributed to the source and must not be adopted into the Brief's own demand-confidence or recommendation fields as if it were Department OS's own validated conclusion. |
| A model-produced structured field fails schema validation and the bounded repair attempt(s) also fail | The generation run fails explicitly rather than persisting the invalid output or silently coercing/defaulting it; the failure, the original invalid output, the validation error, and the repair attempt(s) are recorded in runtime provenance per US-11. |

## Out of Scope

- NOT: Automated or multi-channel source discovery (bookmarks, browser history, saved posts, notes app, WhatsApp/Major Tom/OpenClaw collectors) — this slice is human-submitted-artifact only for the investigation *seed*; the input contract must not preclude future collectors, but none are built here. This does not limit the Landscape Researcher's own independent web search, which is required (US-5) and is not a "collector" in this sense.
- NOT: Selection of a specific search vendor/API/technology for landscape web research — this document specifies the research capability required (search, retrieve, preserve, cite, record scope/limitations); no permanent search provider is chosen here.
- NOT: A polished dashboard UI, notification system, list view, or background polling client — only a minimal review/decide surface reached via the durable Investigation URL is required (US-1, US-13).
- NOT: The knowledge graph.
- NOT: Evaluation/learning loops.
- NOT: Packaged/purchasable workflows.
- NOT: Any module other than Problem Department (Signal Foundry, Prototype Department, Creative Practice Engine, Mandate to Build, Skool, Patent Reinvention).
- NOT: Choosing or committing to a permanent agent runtime. This milestone practically evaluates and adopts a runtime for its own implementation. That adoption is not a permanent Department OS platform commitment and may be revisited through a future DDR.
- NOT: Opportunity schema, data model, enums, or workflow states — Opportunity is referenced only as an acknowledged future concept.
- NOT: A Personal Pull artifact/workflow of its own — Personal Pull content, if present, is captured only as a contextual field within a Problem Brief, never as a separate first-class artifact in this MVP. Personal Pull's separate future entry path/artifact is not designed here, and its possible lack of market evidence does not weaken this MVP's Brief contract (all seven elements remain required per the Required Brief Elements section, and the Problem definition element's no-absence-path rule applies regardless of Personal Pull framing).
- NOT: TAM/SAM/SOM or any market-size estimate authored by Department OS as its own conclusion.
- NOT: Any system-generated numeric confidence score, anywhere, for any purpose (sourced/attributed numeric claims are permitted per the Numeric Scope Rule).
- NOT: An automatic Watch-recheck scheduler or recheck interval.
- NOT: A dedicated Reopen mechanism for Rejected investigations — reconsideration happens via new source material, a new generation run, and a new BriefVersion, per US-9.
- NOT: Application code, runtime, database, or infrastructure technology decisions — this document specifies behavior and data requirements only.
- NOT: Selection of a specific schema-validation library/technology — this document requires that model-produced structured output be validated against its declared schema and that invalid output be bounded-repaired-or-failed explicitly; the validation mechanism itself is an architecture-stage decision.
- Deferred: A generalized/path-agnostic Brief-equivalent schema reusable by Personal Pull or other future entry paths — YAGNI for this slice; only the future need for a convergence point (Opportunity) is preserved, not designed.
- Deferred: Scheduled/automated reconsideration of Watch items based on the recorded conditions.
- Deferred: Market validation of the 4 existing seed candidates — they remain `SEED — not yet evaluated`; this MVP defines the mechanism, not a retroactive evaluation run.

## Constraints

- Must: Every Problem Brief contain all seven canonical Brief elements defined in the Required Brief Elements section above. Element 1 (Problem definition) must be populated with a specific, established problem — it has no absence path, and no BriefVersion may be produced without it (a run that cannot establish a problem statement fails generation explicitly instead — see US-1). The remaining six elements must each be either populated or, for the four negatable elements (Evidence, Demand-Signal-Type, Existing-Solution, Gap Hypothesis), contain an explicit statement of absence/inconclusiveness, enforced by a fail-closed validation gate that treats a null/empty field as failure but accepts a recorded negative finding as valid for those four.
- Must: Demand-signal type and demand-confidence classification remain two distinct fields within the single "demand evidence" element — never merged into one score or label.
- Must: The Landscape Researcher perform independent public web search/retrieval for existing-solution and competitor research — human-submitted artifacts seed the Investigation but do not bound the landscape-research corpus; each search's query, retrieved URL(s), retrieval timestamp, and relevant material must be preserved; search scope and limitations (including failed/blocked retrievals) must be recorded in the Brief.
- Must not: Any system-generated numeric confidence, probability, or market-size figure — authored by Department OS as its own conclusion — appear anywhere in a Problem Brief. Sourced numeric claims may appear only if attributed and labeled as that source's claim, per the Numeric Scope Rule.
- Must not: Personal Pull content be counted toward, or listed within, demand-signal type or demand-confidence.
- Must: Approve/Reject/Watch decisions be recorded as durable workflow state bound to a specific Brief version — not verbal, not ephemeral, not bound to "the Brief" as a mutable whole.
- Must: Reject retain the record without closing or mutating the Investigation lineage, remaining reconsiderable via new source material → new generation run → new BriefVersion → independent new decision (no dedicated Reopen mechanism); Watch require at least one explicit, named reconsideration condition; no invented recheck interval.
- Must: Every major claim trace to source evidence; corrections supersede via new versions rather than overwriting; claims/Briefs be markable as challenged/invalidated with visibility into dependent decisions; runtime/model provenance be captured per generation run.
- Must not: Approve trigger Prototype Department work or any build step — it only qualifies for a future, separate Opportunity/handoff decision.
- Must: The input contract accept one or more human-submitted source artifacts (URLs/text) without hard-coding assumptions that preclude a future non-human (collector-fed) source, and return a durable Investigation ID/URL on submission.
- Must: A source that resolves (network-reachable) but yields no extractable content be recorded as distinguishable from a source that resolved and yielded real content — not collapsed into a single `reachable` status.
- Must: A completed Brief be presented from its Investigation resource, not as a replacement of it, so lineage from submission through decision remains navigable at the same durable URL; no notification, dashboard, list view, or background polling is required for this MVP.
- Must: If no specific problem can be established from reachable, content-yielding sources, the generation run fail explicitly and no BriefVersion be produced — this is a completion-boundary requirement, not merely an implementation detail; the Investigation reflects this via a generation-failed status distinct from blocked (source-unreachability) and from a completed Brief carrying a negative finding, which the Problem definition element may never carry.
- Must: Every model-produced structured output be validated against its declared schema before persistence or downstream use; an out-of-schema value, including an invalid enum member, must never be silently coerced, defaulted, or treated as valid. The system may attempt a bounded repair using the validation error; if the repaired output still fails validation, the generation run fails explicitly and records the failure. Repair attempts must be bounded (no open-ended retry loop). The original invalid output, the validation error, and the repair attempt(s) must be preserved in runtime provenance per US-11.
- Must not: This document specify runtime, database, infrastructure technology, or a specific search vendor/API — those are architecture-stage decisions.
- Must not: This document design the Opportunity schema, data model, or workflow states — Opportunity is referenced as an acknowledged future concept only.
- Assumes: A "source artifact" for this slice is a URL or pasted text block; if other artifact types (e.g. file uploads, screenshots) are needed, that is an open question for architecture, not resolved here — Intake/Interview did not specify artifact types beyond "URLs/source artifacts."
- Assumes: One investigation submission may reference multiple source artifacts and produces exactly one Problem Brief (with subsequent corrective versions) per investigation, per the milestone's step 7 ("Generate one cited Problem Brief"); if a single submission is later found to require splitting into multiple problems, that is an architecture-stage question, not resolved here.
