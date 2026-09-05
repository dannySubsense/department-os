# AGENTS.md — Department OS

Tracked, canonical instructions for Codex, including Codex's specific review discipline.

---

## Authority and coordination

- Danny is the final product-acceptance authority.
- Claude Code owns implementation and Forge execution.
- Codex and Claude Code must never write concurrently.
- Codex must not invoke Forge, dispatch implementation agents, push, or merge.

---

## Default posture

Read-only review unless Danny explicitly requests a fix. Do not edit product code or create
tracking Markdown during a review.

---

## What to inspect

- The actual target SHA and diff — not a summary of it, not a prior implementation report.
- Whether browser behavior uses real persisted data and real services, not mocks, seeded status
  labels, fabricated activity, or database-only verification.
- Whether simulated workflow activity, evidence, provenance, or status appears anywhere.
- Whether failure, blocked, success, and decision states stay inside the Department OS shell
  (not a legacy route, not a bare API response standing in for UI).
- Whether UUIDs or raw database fields are used as primary user-facing content.
- Run or inspect the repository's relevant lint, tests, and build evidence — but do not accept
  passing tests as proof of product completion on their own.

---

## Priorities

Review product fidelity before implementation elegance.

---

## Reporting

Report findings by severity, with exact file references and concrete remediation. Do not create
tracking Markdown or edit product code as part of a review.

---

## Memory and review independence

- Formal reviews begin cold: use repository source, target SHA, diff, tests, and browser evidence without LORE retrieval.
- Do not retrieve Claude Code, Planner, Forge, Frank, or other agents’ memories before recording the initial findings.
- LORE may be used only in a separate post-review reconciliation session.
- During reconciliation, read only Danny-approved canonical decisions and Codex’s own `sol` records.
- Repository evidence overrides stored memory when they conflict.
- Write Codex memories only under `project_id=department-os` and `agent_name=sol`.

---

## LORE Gateway connection

`lore-gateway` is registered as a **global** MCP server in Codex CLI (`~/.codex/config.toml`,
`[mcp_servers.lore-gateway]`) — the same server binary and personal Postgres+pgvector backend
Claude Code uses on VM 101 (`~/runtime/agent-lore/src/mcp/index.ts`, run via `tsx`, no build step).
No separate credential, no separate database — this is the one shared personal LORE instance,
reachable from every Codex session on this host regardless of which repo it's running in.
Registered and verified live 2026-09-05 (`codex exec` calling `search_knowledge` against
`lore-personal`, real result returned).

**This does not relax the cold-review rule above.** The tools (`mcp__lore-gateway__search_knowledge`,
`capture_memory`, etc.) are available in every Codex session the moment it starts — availability is
not permission. Do not call any of them during a formal review pass, before initial findings are
recorded. They exist for the separate reconciliation session only:

- `search_knowledge({ projectId: "department-os", query: ... })` — read Danny-approved canonical
  decisions and Sol's own prior records (per the epistemic-scope rule above), not other agents'
  memories.
- `capture_memory({ projectId: "department-os", author: "sol", documentType: ..., epistemicType: ... })`
  — record reconciliation findings, deviations, or HALTs. Never capture during the cold review
  itself.

Registered in the platform Agent Registry as **Sol** (`author: sol`, relay handle `sol`) —
first multi-project entry in that registry, spanning `department-os` and `signal-current`.

---

## Switchboard relay

`switchboard` is also registered as a global Codex MCP server (`~/.codex/config.toml`,
`[mcp_servers.switchboard]`), the same relay Claude Code agents use
(`~/.claude/switchboard/relay-mcp.js`, no Claude-specific dependency — a generic Node MCP server
reading/writing a shared JSON file). Verified live 2026-09-05 (`codex exec` calling
`read_messages` with `agent_id: "sol"`, real response returned).

- `read_messages({ agent_id: "sol" })` — check your inbox. Coordination messages have no
  live-push delivery; this is a manual poll.
- `send_message({ from: "sol", to: "<recipient>", message: "..." })` — reply or initiate contact.
- This is a coordination channel, not a LORE substitute — the cold-review rule above still governs
  when you read/write LORE. Relay messages are fine to read at any time; they are not "prior
  session memory" in the sense that rule restricts.
