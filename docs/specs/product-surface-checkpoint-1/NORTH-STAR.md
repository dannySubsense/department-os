# Sprint North Star: product-surface-checkpoint-1
**Status**: Locked
**Date**: 2026-08-19

## Declared Intent

Make Department OS's existing Problem Department MVP backend visible and navigable for the first
time, through a real Mission Control home screen, an honest Department directory, and a live
Problem Department investigation portfolio — replacing the current situation where the only way to
see any of it is one Investigation at a time, with no directory or Department framing at all.

## In Scope / Out of Scope

See `01-REQUIREMENTS.md` Out of Scope for the enumerated boundary; this sprint does not restate it.

## Success Criteria (Layer 1 — fidelity)

- Loading `/` in a browser shows a real Mission Control screen: Problem Department marked
  `installed`, the other three Departments marked `planned` with no fabricated activity or counts.
- Clicking into Problem Department shows the real Investigation portfolio, row-for-row matching the
  live local database — no extra rows, no missing rows, no invented fields.
- No generation-trigger endpoint, no live per-component activity, no Investigation Workspace
  screen exist as a product of this sprint — their absence here is correct, not a gap.
- No change to any existing backend service, schema, or business logic — every displayed field
  traces to an existing persisted column or an additive read-only query over existing tables.

## Traceability (Layer 2 input — Frank verifies independently, does not trust this field)

Project North Star Success Criteria: Department OS Core demonstrably owns domain records,
evidence, workflow state, and decisions independent of which runtime or module produced them —
this sprint makes that ownership visible for the first time, in the browser.

Project North Star status at gate time: **Active** (non-DRAFT) → Layer 2 verdict is a normal
binding PASS/FAIL, no PROVISIONAL tag.
