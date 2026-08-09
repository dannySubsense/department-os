# Cadence

Full-weight features: Intake → Interview → Specification (01-05 docs) →
Frank binding spec-gate → human implementation greenlight → Forge
(slice-by-slice) → independent review (Sol; Codex once onboarded) →
focused correction commits → Frank binding forge-gate → human merge
approval. (development-workflow.md, "How work moves")

Bounded internal tooling: /spec-start --lite (single doc) → Frank
spec-gate → human lock → /forge-start --lite (slices from the doc's own
acceptance criteria) → Frank forge-gate → human merge approval. Same
binding-gate discipline, collapsed artifact set. (~/.claude/commands/
spec-start.md and forge-start.md, "Lite Mode" sections; live precedent:
docs/tooling/spec-doc-checker.md)

PROGRESS.md (or docs/tooling/{name}-PROGRESS.md for lite) is updated
slice-by-slice, not at the end — it is ground truth for build state.
(CLAUDE.md Decision Discipline)
