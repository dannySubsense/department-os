# Intake — Problem Department Vertical Slice MVP

**Status**: APPROVED (2026-08-08, Danny)
**Sprint slug**: `problem-department-mvp`
**Opened**: 2026-08-08
**Opened by**: Ledger

---

## 1. What this Intake is

This is the formal Intake gate for Department OS's first executable milestone, per `docs/development-workflow.md`'s Intake → Interview → Spec → Forge loop. It reconciles with the existing authoritative milestone document, `docs/milestones/problem-department-mvp.md` (documented, not yet implemented, per that file's own status line) — this Intake does not replace it, but is the mandatory pre-spec gate that must be approved before `01-REQUIREMENTS.md` can be written.

This Intake also incorporates a newly landed input: the seed-corpus handoff (`docs/source-material/initial-candidates/`, 4 candidates, captured to LORE this session). That corpus is empirical evidence about how ideas actually arrive and evolve — used here to sharpen Intake questions, not as validated requirements.

## 2. Why now

Danny has formally handed the seed corpus into Department OS and directed that Department OS now begin its first real product-delivery cycle. Per his direction, this session performs the seed migration (complete — see LORE capture `3c7f2d10-47ca-446d-a96b-1cf369502d90`) followed immediately by Problem Department Intake + Interview. Specification does not begin until Danny explicitly approves this Intake.

## 3. Milestone recap (from `docs/milestones/problem-department-mvp.md`)

The smallest complete Problem Department vertical slice, as already documented:

1. Add or collect source links.
2. Extract specific problem statements.
3. Cluster supporting evidence.
4. Research existing solutions and competitors.
5. Identify unresolved gaps.
6. Classify demand confidence.
7. Generate one cited Problem Brief.
8. Present it for human approval, rejection, or watch status.
9. Record sources, artifacts, workflow state, runtime events, and the final decision.

Explicitly out of scope per that document: polished dashboard UI, knowledge graph, evaluation/learning loops, packaged workflows, any other module, and choosing a permanent agent runtime (this milestone is where runtime *evaluation* happens, not where a runtime is assumed).

This Intake does not alter that scope. It exists to surface the open questions that must be resolved (via Interview) before that scope can be turned into `01-REQUIREMENTS.md`.

## 4. What the seed corpus adds to this Intake

Reviewing the 4 handed-off candidates against the milestone doc surfaced a gap the milestone doc does not yet address: **Problem Department is not the only way something enters Department OS.** At least one more discovery path is evidenced in the corpus — *Personal Pull* ("I want that, but not badly enough to buy it — can I build the useful part myself?"), most clearly shown in the AI Execution System and Military Calisthenics candidates, and associated with Mandate to Build.

This does not change the Problem Department MVP's scope (which is explicitly about Problem Department, not Personal Pull). It does mean the Interview should ask what information is common to *any* entry path versus specific to Problem Department, so the Problem Brief schema this MVP produces doesn't accidentally foreclose a second path Department OS already has evidence it needs. No schema decision is made here — this is a question to carry into Interview and, if still open, into `01-REQUIREMENTS.md` / `02-ARCHITECTURE.md`.

Similarly, the corpus surfaced a candidate shared concept — tentatively named **Opportunity** — that Problem Department and a future Personal Pull path might both hand to Prototype Department. Per Danny's explicit instruction this session, no Opportunity schema, data model, or workflow state is designed here. It is recorded as an open requirement for Intake/Interview to investigate, not to resolve unilaterally.

## 5. Interview outcome

The Interview stage is complete — see `docs/specs/problem-department-mvp/INTERVIEW.md` for the full record (6 seed questions + 1 adaptive follow-up, all resolved directly by Danny, zero `ASSUMED` stand-ins). Summary of what was resolved:

- **Entry mechanism (MVP)**: human-seeded — one or more URLs/source artifacts submitted directly by a human. Automated/multi-channel discovery (bookmarks, browser history, saved posts, notes app, WhatsApp via Major Tom/OpenClaw) is real and roadmap-relevant but explicitly out of scope for this slice; the input contract must not assume human entry is the only future source, without building collectors now.
- **Problem Brief minimum bar**: problem definition, evidence (with fact/observation/interpretation/assumption/unknown labeling and contradicting evidence), demand evidence, existing-solution landscape, an explicit gap hypothesis, stated uncertainty, and a reasoned Approve/Reject/Watch recommendation. No TAM/SAM/SOM, no fabricated numeric scores of any kind.
- **Demand evidence has two distinct parts** (reconciled post-Interview against the frozen milestone's "classify demand confidence" requirement — see `INTERVIEW.md`'s reconciliation note under Q2): (a) **demand-signal type** — what kind of *market* evidence was found (search/interest behavior, audience engagement, unmet-need evidence, purchase/willingness-to-pay behavior, etc.); and (b) **demand confidence** — a separate, qualitative judgment of how strongly the total evidence (amount, quality, independence, consistency, contradictions) supports real demand, classified as **Insufficient / Emerging / Substantiated** with a short reasoned narrative. **Personal Pull may be recorded separately as contextual motivation but does not increase demand confidence** — it explains why an idea matters to Danny, not that a market wants it, and must not be collapsed into the demand-signal-type list. No numeric confidence score.
- **Approve/Reject/Watch semantics**: Approve qualifies something for a later, separate Opportunity/handoff decision — it does not trigger a build. Reject retains the record and can be reopened on new evidence. Watch is manual for the MVP but must record explicit, named reconsideration conditions.
- **Opportunity handoff**: something can become an Opportunity with unresolved questions still attached — advancement does not erase uncertainty. Opportunity's schema is explicitly not designed in this Intake.
- **Problem Brief vs. Personal Pull**: kept deliberately separate artifacts (different opening questions), converging only at the future Department OS Core "Opportunity" concept — not flattened into one schema now.
- **Auditability**: explicitly in scope for the MVP, not deferred — claim/source provenance, Brief version identity, decision-to-evidence-state binding, non-destructive correction/supersession, and invalidation tracking are all required.

Architectural implications surfaced by the Interview that were not part of the original milestone doc's explicit language are recorded in `INTERVIEW.md`'s "Architectural implications surfaced" section, and carry forward into `01-REQUIREMENTS.md` / `02-ARCHITECTURE.md` rather than being silently encoded here.

## 6. Explicit non-goals for this Intake and the MVP it feeds

Per Danny's direction and `docs/milestones/problem-department-mvp.md`:

- No application code, runtime, database, or infrastructure decisions.
- No Opportunity schema, data model, enums, or workflow states.
- No market validation performed on the 4 seed candidates — they remain `SEED — not yet evaluated`.
- No specification work — this Intake stops at the approval boundary; `01-REQUIREMENTS.md` begins only after Danny approves.

## 7. Approval

**Status**: APPROVED — 2026-08-08, Danny. Approved after one reconciliation round (demand-signal-type vs. demand-confidence wording, and removal of Personal Pull from the demand-signal-type examples — see Section 5 and `INTERVIEW.md`'s Q2 reconciliation note). `01-REQUIREMENTS.md` may now begin.
