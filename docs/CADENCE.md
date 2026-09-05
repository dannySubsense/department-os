# Cadence

Full-weight features: Intake → Interview → Specification (01-05 docs) →
Frank binding spec-gate → human implementation greenlight → Forge
(slice-by-slice) → independent review (each PR records its own active
reviewer(s) from `development-workflow.md`'s Roles roster; the roster
changes over time, this sequence does not) → focused correction commits →
Frank binding forge-gate → human merge approval.
(development-workflow.md, "How work moves")

Bounded internal tooling ("lite mode"): a single spec document at
`docs/tooling/{tool-name}.md` stands in for the full Intake/Interview/
NORTH-STAR/Requirements/UI-Spec/Roadmap set — no sprint directory, no
`04-ROADMAP.md`. The sequence is: draft the single doc → Frank binding
spec-gate (Layer 1 fidelity checked against that doc directly, Layer 2
against the project North Star, unchanged) → human locks the doc's own
`Status:` line → implementation slices are derived directly from the
locked doc's own Acceptance Criteria section (one slice per major
rule/component, or a single slice if splitting would be artificial,
orchestrator's judgment stated before work starts) → Frank binding
forge-gate (same substitution: the locked doc stands in for
`NORTH-STAR.md`) → human merge approval. `PROGRESS.md` lives alongside the
tool doc (`docs/tooling/{tool-name}-PROGRESS.md`) rather than in a sprint
directory; gate history (attempts, dates, verdicts, findings, convergence
judgment) lives inside that same file's own `## Spec Gate` / `## Forge
Gate` sections — there is no separate `GATE-LOG.md` file. Same binding-gate discipline as the full sequence throughout, no manual
override at either Frank gate. This contract is authoritative here; the
local `/spec-start --lite` and `/forge-start --lite` commands are one
implementation of it, not its source. Live precedent:
`docs/tooling/spec-doc-checker.md` (locked via this sequence).

`PROGRESS.md` (or the lite-mode path above) is updated slice-by-slice, not
at the end — it is ground truth for build state, read first on session
resume and trusted over any session's own recollection of prior state.
