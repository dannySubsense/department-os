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

- **[DDR-0001-problem-department-runtime.md](DDR-0001-problem-department-runtime.md)** — Problem
  Department MVP: Runtime & Storage Evaluation and Adoption. **Status: ACCEPTED.** Scoped to this
  milestone's own implementation (Slice 1), not a permanent Department OS runtime/storage
  selection — explicitly revisable by a future DDR as other modules bring their own requirements.
- **[DDR-0002-constant-integrity-no-fourth-option.md](DDR-0002-constant-integrity-no-fourth-option.md)**
  — Constant Integrity: No Fourth Option for Unsourced Numeric Constants. **Status: ACCEPTED.**
  Danny confirmed both the rule and its Category B split directly, in this session
  (2026-09-06, PR #12 recovery on `recovery/checkpoint-2-from-bfe41c4`), in response to being asked
  explicitly whether he accepted DDR-0002's rule and the Category B classification of the five
  infrastructure/operational-safety constants — his words: "I already said yes, bring it back."
  The code-side dispositions the DDR describes (§ Interim disposition) are now APPLIED to live
  `src/` on this branch, verified live: B3-B5 (`FETCH_TIMEOUT_MS`, `MAX_RESPONSE_BYTES`,
  `MAX_REDIRECTS`) and A1 (`MIN_CONTENT_LENGTH`, deleted) — see that section's own disclosure note
  for the exact verification detail. A2/A3 remain measured-but-unresolved, no owner, per the same
  section.
