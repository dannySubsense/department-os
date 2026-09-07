# AGENTS.md — Department OS

Tracked, canonical instructions for Codex. Read alongside `CLAUDE.md` (Claude Code's canonical
instructions). Roles, product-completion standard, and prohibited practices in `CLAUDE.md` apply
to Codex too — this file adds Codex's specific review discipline.

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
