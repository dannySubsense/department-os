# Intake: product-surface-checkpoint-2

**Status**: APPROVED

**Date**: 2026-08-22
**Author**: Ledger (orchestrator's mandate to the spec team, per Danny's direction)

---

## Problem Statement

Checkpoint 1 shipped the shell (Mission Control, navigation, Problem Department overview) but not
a working Problem Department MVP. Submission calls real source-resolution services and stops —
nothing calls `generateBriefVersion`, and there is no in-shell surface to watch a real run, read
the persisted Brief, inspect its evidence/provenance, or record a human decision. The standard
this checkpoint must meet: **Submit → real generation → observe progress → review Brief → inspect
evidence/provenance → make the human decision — entirely in the browser.** Backend completion,
green tests, or a Brief that only exists in Postgres do not satisfy it.

## Context

This is not a new sprint. It is the replan and completion of the one unfinished Problem
Department MVP implementation stream, which now spans two prior spec directories:

- `docs/specs/problem-department-mvp/` — Slices 1-9 built and complete. Slices 10-12
  (Investigation Screen Completed State; Decision Recorder; Validity/Decision-History Banner) were
  specced and Frank-gated but never forged — now marked SUPERSEDED in that roadmap's
  `PROGRESS.md`, not completed. Their requirements are this sprint's inheritance, not its
  scratch-built scope.
- `docs/specs/product-surface-checkpoint-1/` — its own, separately and locally numbered Slices 1-2
  (Mission Control Shell, Problem Department Overview). CLOSED, PASS, SHA `152a124`. Completed
  history, not touched or renumbered by this sprint.
- `generateBriefVersion` already persists a real `GenerationRun`/`GenerationStep`/Brief on success.
  `getBriefForReview`, `Decision` persistence, and `recordDecision` are specified but not built.
- A legacy `/investigations/:id` Express route sits outside the React shell; its
  `brief-generated` branch 501s. It is not the finished workspace and is not to be reused as one.
- This sprint's own Forge tasks are qualified `C2-S1`, `C2-S2`, ... so "Slice 1" is never ambiguous
  against `problem-department-mvp`'s or Checkpoint 1's own Slice 1. This is the sole active
  implementation plan for the stream once gated; no other roadmap remains live.
- Danny referenced "challenged/invalidated validity requirements" beyond Slice 12's
  validity/invalidation service. Not yet located under an obvious path — confirming whether these
  exist separately, or refer to Slice 12 itself, is architecture-reconciliation work for this
  sprint.

## What Is Missing

- Durable React workspace route (`/departments/problem-department/investigations/:investigationId`)
  inside the shell: identity, sources/resolution outcomes, persisted runs/steps, honest
  in-progress/blocked/failed states, completed Brief, evidence/provenance, Approve/Reject/Watch
  with history.
- A generation connector that actually invokes `generateBriefVersion` from the browser (duplicate-
  run prevention, honest initial-vs-correction determination, in-process for this MVP — not
  crash-durable).
- An honest progress read model reporting only persisted facts — no claimed current-step,
  percent-complete, or pre-persistence success.
- A real `getBriefForReview` read service and UI covering the seven Brief elements, evidence with
  stance/relevance, uncollapsed contradicting evidence/negative findings, qualitative demand
  levels, and the citation-presence-isn't-correctness caveat.
- Real append-only `Decision`/`ReconsiderationCondition` persistence wired to `recordDecision`,
  with full chronological history per BriefVersion.

## Constraints

- Do not modify Checkpoint 1 specs except to correct a demonstrably false cross-reference blocking
  this sprint — report any such need before editing, don't silently fix it.
- Existing challenged/invalidated validity requirements must not be silently retired or rewritten.
  If the canonical MVP contracts conflict with excluding them, that's a blocking spec question for
  Danny, not something buried in another slice.

## Open Questions

- What specifically are the "challenged/invalidated validity requirements" Danny referenced,
  beyond Slice 12's validity/invalidation service itself? Not yet located in the repo as a
  separate item.

---

## Approval

Danny's approval of this document (Status line above set to `APPROVED`) is what gates `spec-start`
Step 0. Anything else — missing file, `DRAFT`, `REJECTED`, or the Status line absent entirely — is
a HALT before any downstream doc generation.
