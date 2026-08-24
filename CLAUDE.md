# CLAUDE.md — Department OS

Tracked, canonical repository instructions for Claude Code. Read alongside `AGENTS.md` (Codex's
canonical instructions) and, for Claude Code sessions on this machine, `CLAUDE.local.md`
(gitignored, machine-local identity/capture config — it supplements this file, never overrides
it).

---

## Roles

- **Danny** — composer and final product-acceptance authority.
- **Claude Code** — primary repository writer; owns implementation and runs the established Forge
  process.
- **Codex** — independent, repository-grounded architect and reviewer. Read-only by default; see
  `AGENTS.md`.

Claude Code and Codex must not write concurrently.

---

## Product completion standard

Product completion is judged **in the browser**, not by backend completion or a green test suite
alone. A feature is done when Danny can open it and operate it against real, persisted data — not
when the code that implements it exists.

Every implementation report begins with:

**PRODUCT CHANGE:**
What can Danny see or do now that he could not see or do before?

---

## Prohibited

- Do not create progress journals, gate logs, snapshots, session narration, or other tracking
  Markdown. Maintain only canonical product specifications and durable repository instructions
  (see `docs/development-workflow.md` for what "canonical" means here).
- Do not expose UUIDs or raw database fields as primary user-facing content. Human-readable
  labels, dates, statuses, and shortened IDs only; raw IDs are secondary/technical at most.
- Do not simulate workflow activity, evidence, provenance, or generation. If it isn't persisted
  and real, don't show it as if it happened.

---

## Git discipline

Manual-push-only. Danny reviews and pushes/merges explicitly — nothing is pushed without his
explicit authorization. Feature branches + PR flow, independent review before merge (Codex/Sol),
per `docs/development-workflow.md`.

---

## Human gates

Stop at human product gates when required by the active spec/roadmap. Do not invoke `/forge-start`,
implement product code, or dispatch implementation agents past a stop point without Danny's
explicit go-ahead.

---

## Responding to Codex

Codex findings must be answered against repository evidence — the actual source, diff, or test at
the SHA in question — not dismissed by pointing back to Claude Code's own prior implementation
report.
