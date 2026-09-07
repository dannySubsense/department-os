# Sprint North Star: product-surface-checkpoint-2
**Status**: Locked
**Date**: 2026-08-22

## Declared Intent

Complete the Problem Department MVP's remaining browser-to-decision path — the one unfinished
implementation stream that Checkpoint 1 began. A human must be able to, entirely in the browser:
submit a source, watch a real generation run, review the persisted Problem Brief with its
evidence and provenance, and record Approve, Reject, or Watch. Backend completion, passing tests,
or a Brief that only exists in Postgres do not satisfy this.

## In Scope / Out of Scope

See `01-REQUIREMENTS.md` Scope / Out of Scope.

## Success Criteria (Layer 1 — fidelity)

- The full path is demonstrated live in the browser against real persisted data: Mission Control
  → submit → real generation → honest progress → Brief review with evidence/provenance → human
  decision → reload confirms the same Brief and decision history.
- Separate genuine Blocked and Generation-Failed workspaces are demonstrated inside the shell, not
  simulated.
- The two known defects blocking this path (Node 22 URL-resolution failure; inert Blocked-state
  retry) are fixed and regression-covered, not deferred.
- No UUIDs or raw DB fields as primary user-facing content; no simulated workflow activity,
  evidence, provenance, or generation anywhere in the shipped surface.
- Old Slice 10-12 requirements are traced — retained, revised, moved, or removed — into this
  sprint's requirements, not silently dropped.

## Traceability (Layer 2 input — Frank verifies independently, does not trust this field)

Project North Star bullet(s) this sprint serves: `docs/NORTHSTAR.md` Thesis, ¶2 ("a signal becomes
a brief, a brief becomes a decision") and Success Criteria bullet 1 ("Every module ships as a
complete vertical slice — touching evidence, workflow state, and a recorded decision — never as
output with no accountable record behind it.")
Project North Star status at gate time: Active (non-DRAFT) → normal binding Layer 2 PASS/FAIL, no
PROVISIONAL tag.
