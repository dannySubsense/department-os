# Sprint North Star: product-surface-checkpoint-1
**Status**: Revised — pending Danny's personal sign-off before re-lock (identity-tier document,
never self-approved by the agent)
**Date**: 2026-08-21 (revised; originally authored 2026-08-19)

## Declared Intent

Make Department OS's Problem Department backend visible and navigable in the browser, through a
real Mission Control home screen showing Problem Department as the one currently available
Department, and a live Problem Department investigation portfolio.

## In Scope / Out of Scope

See `01-REQUIREMENTS.md` Out of Scope for the enumerated boundary; this sprint does not restate it.

## Success Criteria (Layer 1 — fidelity)

- Loading `/` in a browser shows a real Mission Control screen: a single Problem Department card
  with real live counts (investigation/active/needs-attention/recent-completed), unmistakably
  actionable (whole card clickable, plus an explicit affordance) — no installed/planned label
  anywhere, no catalog of other Departments.
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
