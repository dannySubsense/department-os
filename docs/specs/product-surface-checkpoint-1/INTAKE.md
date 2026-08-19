# Intake — Product Surface, Checkpoint 1 (Mission Control / Department Nav / Problem Department Portfolio)

**Status**: APPROVED (2026-08-19, Danny — approved in the same message that authorized this
Intake's creation; see Section 7)
**Sprint slug**: `product-surface-checkpoint-1`
**Opened**: 2026-08-19
**Opened by**: Ledger

---

## 1. What this Intake is

Formal Intake gate for the FIRST of three Product Surface implementation checkpoints designed in
`docs/specs/product-surface/DESIGN-PROPOSAL.md` (design gate PASSED at commit `cfb793c`, PR #7
merged to `feature/problem-department-mvp` at `596296c`). That design document is the binding
source of scope, IA, route map, and read-model shapes for this and the two later checkpoints — this
Intake does not re-derive or restate its content, it scopes ONE checkpoint out of it for spec +
forge.

Per Danny's explicit direction closing the design gate: **only Product Checkpoint 1 is in scope
for this Intake.** Checkpoints 2 and 3 (browser-triggered generation, live component activity,
full Brief rendering) are out of scope here and will each get their own Intake when their turn
comes — this sprint does not pre-approve them.

## 2. Why now

Design gate PASSED. Danny's direction on closing it (2026-08-19): merge PR #7, then build
Checkpoint 1 only, with the next gate beginning at a running browser surface — not another design
round. Danny is stepping away and has delegated judgment-call authority for this sprint: Intake,
Interview-stage open questions, and spec iteration are to proceed under my best judgment, gated by
an **unbriefed Frank** (no orchestrator framing beyond the raw spec docs) run in an unlimited-round
`/spec-start` loop, with no human check-in until Danny reviews the finished spec package. This
Intake operationalizes that direction into the standard Intake → Interview → Spec loop rather than
skipping the loop's structure.

## 3. Checkpoint 1 scope (verbatim from `DESIGN-PROPOSAL.md` §12, Checkpoint 1)

**PRODUCT CHANGE:** Danny can open the React app at `/`, see a real Mission Control screen listing
Problem Department as `installed` and the other three Departments as honestly `planned` (no fake
activity), and click into Problem Department to see the real Investigation portfolio pulled from
the live database — replacing the current situation where the only way to see any of this is
`GET /investigations/:id` for one Investigation ID at a time with no directory or Department
framing at all.

**Demonstration criteria (§13, Checkpoint 1):** Run the dev server, load `/` in a browser. Verify:
Problem Department tile shows `installed`; the other three show `planned` with no activity numbers.
Click Problem Department; verify the Investigation list matches
`SELECT id, status, created_at FROM investigation` for the local dev database exactly (row-for-row,
no extra or missing rows).

### In scope for this checkpoint (per `DESIGN-PROPOSAL.md`)

- **Screen A — Mission Control** (§2, revised §2a): Installed Departments strip (honest
  installed/planned), the three-group Active-work split (Active / Needs Attention /
  Recent-Completed — §2a), recent Investigations/Briefs/evidence list, planned-Department note.
  NOTE: the "Active orchestrations and agent/component activity" panel (§2 item 3) depends on the
  lifecycle table (§10, Checkpoint 3 scope) — for Checkpoint 1, this panel renders using only
  `GenerationRun`-level data that already exists (no live per-component detail yet); it must not
  fabricate per-component activity ahead of Checkpoint 3.
- **Screen B — Departments directory** (§3): full behavior as designed — Problem Department is the
  only Department with an entry link; the other three are inert directory rows.
- **Screen C — Problem Department overview** (§4, revised §4a): Department header, Investigation
  portfolio (all rows, all `InvestigationStatus` values), "last recorded activity" computation
  (§4a — real `GREATEST` over persisted timestamps, no invented `updatedAt`), Department-level
  Sources/Evidence counts, Department-level Runs/Activity (same GenerationRun-only caveat as
  Mission Control above — no live component detail this checkpoint), Start Investigation entry
  point (wraps the EXISTING `submitSources`/`POST /investigations` flow — no change to that
  service).
- **Read models / API routes needed this checkpoint** (§8, subset): `GET /api/mission-control`
  (minus the live-component slice of `activeActivity` — GenerationRun-level only),
  `GET /api/departments`, `GET /api/problem-department` (§4a's activity fields at GenerationRun
  granularity only).
- **React/Express integration boundary** (§11): SPA + JSON API served by the existing Express app;
  `src/web/views.ts`'s legacy HTML screens remain running, untouched, not retired this checkpoint.

### Explicitly OUT of scope for this checkpoint (deferred to Checkpoint 2/3 Intakes)

- `POST /api/investigations/:id/generation-runs` and any browser-triggered generation (§9,
  Checkpoint 2/3 per the merged design's checkpoint sequencing).
- `generation_component_event` table, `component_execution_id`, `recordComponentEvent`, and any
  live per-component activity display (§10/§10a/§10b) — no lifecycle migration is written this
  checkpoint.
- Investigation Workspace screen (Screen D), `BriefForReview` read model (§8), workflow-stage
  derivation (§5a) — none of Screen D is built this checkpoint; Checkpoint 1 stops at the
  Department overview / portfolio list, consistent with the design's own checkpoint boundary.
- `/evidence`, `/runs`, `/knowledge` Core routes (§8a) — reserved/designed, not built.
- Any change to Slices 1-9 backend services, schema, or business logic. This checkpoint is
  additive read models and a new UI shell only.
- Retirement of `src/web/views.ts`'s server-rendered screens (§15 item 4, still Danny's open call).

## 4. Runtime/tooling decisions this Intake must still surface to Interview

Per `docs/milestones/problem-department-mvp.md`'s original non-goals (permanent runtime choice
deferred) and this checkpoint's own design (§11's SPA direction stated but not pinned to a specific
toolchain): the Interview stage must resolve, or explicitly mark PROVISIONAL with an owner, at
minimum:
- React build tooling (e.g. Vite, per §11's SPA-behind-Express pattern — the design doc names Vite
  only as an example, not a locked choice).
- Where the new React app's source lives in the repo tree (`src/web/public/` vs. sibling
  `src/client/` — design doc leaves this open, §11).
- Whether `RUNTIME_IDENTIFIER`-style config conventions from the existing codebase extend to any
  new config this checkpoint needs (expected: none, since generation-trigger wiring is explicitly
  out of scope — Interview should confirm this checkpoint introduces no new runtime/env config).

No permanent agent-runtime decision is reopened by this Intake — Checkpoint 1 touches no
generation code path.

## 5. Explicit non-goals for this Intake

- No application code, schema migration, or service change — Intake is pre-spec.
- No re-litigation of the design gate — `DESIGN-PROPOSAL.md` at `cfb793c` is binding input, not
  open for revision here. Any genuine gap found during spec work escalates as a named open
  question in the spec docs, not a silent Intake-stage rewrite of the design.
- No Checkpoint 2/3 scope decisions — those get their own Intake when their turn comes.

## 6. Judgment-gate delegation for this sprint (binding for this Intake and the spec loop that follows)

Per Danny's direction closing the design gate (2026-08-19), and consistent with
`docs/development-workflow.md`'s Judgment Gate Protocol: for this sprint only, Interview-stage
open questions and spec-iteration judgment calls that would normally go to Danny are resolved by
Ledger's best judgment, subject to an **unbriefed Frank** (`subagent_type: frank`, given the spec
package only — no orchestrator narrative, no hint at what answer is expected) as the binding
spec-gate, run in an unlimited-round `/spec-start` loop (iterate on Frank FAIL until PASS, no
round cap). This does not waive Frank's binding PASS/FAIL/HALT authority or any other standing
protocol (Orchestration Discipline, no-manually-asserted-counts, mechanical-checks-not-prose) — it
only removes Danny as a live-in-the-loop checkpoint until the finished package is ready for his
review. Every judgment call made under this delegation must be recorded in the spec docs
themselves (not just this Intake) so Danny's post-hoc review can see exactly what was decided and
why, per `docs/development-workflow.md`'s existing discipline for recording decisions at the point
they're made.

## 7. Approval

**Status**: APPROVED — 2026-08-19, Danny, granted in the message closing the design gate: "PR #7
can merge... build Product Checkpoint 1 only... Create your Intake doc... use your best
judgement and an unbriefed Frank... Loop spec-start on an unbriefed Frank as the gate, unlimited
rounds on the loop. I will review the spec package after work." This constitutes Intake approval
for the scope in Section 3, delegated judgment authority per Section 6, and authorization to
proceed directly into Interview and `/spec-start` without a further live approval step before
Danny's post-hoc review of the finished package.
