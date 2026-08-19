# Sprint North Star: product-surface-checkpoint-1
**Status**: Locked
**Date**: 2026-08-19

## Declared Intent

Make Department OS's existing Problem Department MVP backend (Slices 1-9, unchanged) visible and
navigable for the first time, through a real Mission Control home screen, an honest Department
directory, and a live Problem Department investigation portfolio — replacing the current situation
where the only way to see any of it is `GET /investigations/:id` for one Investigation ID at a
time, with no directory or Department framing at all. This traces directly to `INTAKE.md` §3's
Checkpoint 1 scope, which itself traces to `docs/specs/product-surface/DESIGN-PROPOSAL.md`'s design
gate (PASSED, `cfb793c`, merged PR #7).

## In Scope / Out of Scope

See `01-REQUIREMENTS.md` Out of Scope (once written) for the enumerated boundary; the governing
scope statement is `INTAKE.md` §3 ("In scope for this checkpoint" / "Explicitly OUT of scope for
this checkpoint") — this sprint does not restate it, it points to it.

## Success Criteria (Layer 1 — fidelity)

- Loading `/` in a browser shows a real Mission Control screen: Problem Department tile marked
  `installed`, the other three Departments marked `planned` with no fabricated activity or counts.
- Clicking into Problem Department shows the real Investigation portfolio, matching
  `SELECT id, status, created_at FROM investigation` row-for-row against the live local database —
  no extra rows, no missing rows, no invented fields.
- No generation-trigger endpoint, no `generation_component_event` table, no Investigation Workspace
  screen, and no `BriefForReview` read model exist as a product of this sprint — those are
  Checkpoint 2/3 scope and their absence here is correct, not a gap.
- No change to any Slices 1-9 service, schema, or business logic — every displayed field traces to
  an existing persisted column or an additive read-only query over existing tables.

## Traceability (Layer 2 input — Frank verifies independently, does not trust this field)

Project North Star bullet(s) this sprint serves: `docs/NORTHSTAR.md` Success Criteria — "Department
OS Core demonstrably owns domain records, evidence, workflow state, and decisions independent of
which runtime or module produced them" (this sprint makes that ownership visible for the first
time, in the browser, rather than only provable via direct DB query) — and the Thesis's framing of
Department OS Core as the durable substrate "so that record survives any individual module,
workflow, or agent runtime" (Mission Control and the Department directory are the first UI
expression of that substrate, per `docs/product-architecture-and-direction.md` §6).

Project North Star status at gate time: **Active** (non-DRAFT) → Layer 2 verdict is a normal
binding PASS/FAIL, no PROVISIONAL tag.
