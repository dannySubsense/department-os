# Architecture: Product Surface — Checkpoint 2

**Status**: Draft (pending Frank spec-gate + human approval)
**Date**: 2026-08-22, revised 2026-08-23 to resolve external-review (Codex + Sol) findings 1-8 and
11 against `01-REQUIREMENTS.md`'s 2026-08-23 tightened US-1 AC5, US-4/US-6 stale-run AC, and US-13
AC2 — see §1.3-§1.5 for the newly-reconciled assumptions this revision corrects, and §3-§5 for the
resulting schema/contract changes. Every prior binding correction (§1.1, §1.2, the SSRF fix, the
US-12 validity design, existing route contracts) is unchanged except where a finding required it.
Revised again 2026-08-24: §1.3's re-verification pass, §1.4's Add-Source-route correction (reuse `POST /api/investigations`, no new `:id/sources` route), §3.1b's benign-no-op-vs-genuine-conflict correction, §4.2 steps 5/5b's two-catch correction, and §4.9/§5.2's timing-constant engineering-ownership reframing (`POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` derived from real-run measurement, not asserted at spec time).
**Feeds**: `01-REQUIREMENTS.md` (13 user stories, including US-12/US-13 restored to scope per
Danny's 2026-08-22 material-scope-correction ruling; see that document for the canonical
acceptance-criteria enumeration — count not restated here per this repo's no-manually-asserted-counts discipline)

## 0. Scope Discipline

This document does not modify `docs/specs/product-surface-checkpoint-1/*` or
`docs/specs/problem-department-mvp/*` — both are read-only inputs. It designs exactly the scope
`01-REQUIREMENTS.md` sets: one Express write connector, one Express read connector, a real
`getBriefForReview` read service, real `Decision`/`ReconsiderationCondition` persistence, one React
workspace route, two live-defect fixes (`ssrfGuardedFetch` DNS lookup, the inert Blocked-retry
generation gap), and the wiring that makes all of the above reachable end-to-end from the browser.

This revision (2026-08-22 material scope correction) additionally designs the Slice 12
validity/invalidation service and browser-visible decision history (US-12) and the scoped,
evidence-driven resubmission correction path (US-13) — both restored to this checkpoint's scope by
Danny's ruling on the two Open Questions US-12/US-13 raised. Both are additive to the design
below, not a rewrite of it: §1.1/§1.2's reconciliation, §3.1-3.5's schemas, §4.2-4.6's contracts,
and §5's SPA design are unchanged except where a new §-suffix subsection below explicitly extends
them (§3.6, §4.2's revised Generation Eligibility Rule, §4.7, §4.8, and §5.3's added component
rows). §3.6 (`StatusEvent`) is the only new top-level §3 schema subsection this revision adds; no
"§5.3.7" subsection exists in this document.

It does not select a new runtime, storage technology, or web framework — this sprint extends the
already-adopted stack (`problem-department-mvp/02-ARCHITECTURE.md` §Scope Discipline; Express +
Postgres + React/Vite, confirmed live).

**Checkpoint-1 edit boundary — explicit and bounded.** This sprint edits exactly one category of already-shipped
Checkpoint-1 surface: the per-row "Open"/"Open current view" affordance, changing ONLY its
navigation target — from the legacy `<a href="/investigations/{id}">` full-page link (or, for
`'brief-generated'` rows, inert plain text) to a React Router `<Link>`/`navigate` call targeting
this sprint's new workspace route (§5.3), rendered for ALL FOUR `InvestigationStatus` values
including `'brief-generated'`. The real files touched are: `src/client/components/
InvestigationPortfolioTable.tsx` (the actual per-row anchor for the Problem Department overview —
not `ProblemDepartmentScreen.tsx` directly, which only hosts the table and wires
`StartInvestigationForm`'s existing `onSubmitted` callback to navigate); and
`src/client/screens/MissionControlScreen.tsx`'s own inline `RecentInvestigationsList`
row-rendering function (defined locally inside that screen file, not a separate component file) —
`RecentInvestigationsList` is the only per-row anchor that
exists in `MissionControlScreen.tsx` today; that file's other inline row-rendering function,
`ActiveWorkGroup` (`:120-167`), renders label/shortened-id/status/statusReason only — no `<a>`, no
`<Link>`, no interactive control of any kind. Retargeting a link that does not exist is unexecutable,
so this sprint does **not** touch `ActiveWorkGroup` — its Investigation rows remain non-navigable
this checkpoint, a real, disclosed limitation (not a boundary violation, since nothing is added to a
Checkpoint-1 surface; not a silent gap, since it is named here). `StartInvestigationForm.tsx`
itself is NOT edited — its existing `onSubmitted` prop contract is unchanged; only what
`ProblemDepartmentScreen.tsx`'s own callback handler does with it changes (§5.3). The two live
Checkpoint-1 test files whose assertions this necessarily invalidates —
`src/client/screens/ProblemDepartmentScreen.test.tsx` and
`src/client/screens/MissionControlScreen.test.tsx` — are edited in the same slice to match the
corrected behavior (04-ROADMAP.md C2-S2).

This checkpoint touches exactly these Checkpoint-1 files — all already established and
justified elsewhere in this document; this enumeration introduces nothing new:

1. `src/client/components/InvestigationPortfolioTable.tsx` — per-row navigation retarget (above).
2. `src/client/screens/MissionControlScreen.tsx`'s inline `RecentInvestigationsList` — per-row
 navigation retarget (above).
3. `src/web/apiRoutes.ts`'s existing `POST /api/investigations` route — extended in place (not
 duplicated) to serve the Add-Source Connector, per §1.4/§3.1b's Add-Source-route ruling (Danny's
 binding ruling: reuse and extend, do not add a new `:id/sources` route) — a real behavior change
 to a shipped Checkpoint-1 route, established and justified in full at §1.4/§3.1b, not restated
 here.
4. `src/client/api.ts`'s `createInvestigation` function and its `CreateInvestigationResponseBody`
 type — extended (not duplicated) per §3.1b's new `sourcesAdded` field and new `404`/`409`
 response shapes, and per round-3's fix giving the client real error-code handling for those new
 responses — established at §3.1b, not restated here.
5. The two Checkpoint-1 test files named above (`ProblemDepartmentScreen.test.tsx`,
 `MissionControlScreen.test.tsx`) — edited to match items 1-2's corrected behavior.
6. `src/services/resolveInvestigationSources.ts` — edited to skip
 already-resolved `source_artifact` rows instead of unconditionally re-fetching every source on
 every call, established and justified in full at §1.4, not restated here.

This is a documentation-accuracy correction only: items 3, 4, and 6 are not new design decisions
introduced here — all are real, necessary edits this document already specifies in full (§1.4,
§3.1b), and 04-ROADMAP.md's C2-S2/C2-S3 already implement them. The prior "no other Checkpoint-1
file... is touched" sentence was a genuine misstatement, corrected by naming all six items above
rather than by narrowing the design. Checkpoint-1's own `02-ARCHITECTURE.md`/`03-UI-SPEC.md` remain
the locked spec of record for every Checkpoint-1 concern not named in this enumeration; extending
`POST /api/investigations` and `src/client/api.ts` in place is not a reopening of Checkpoint 1's
closed scope, and is not a precedent for touching anything else under
`docs/specs/product-surface-checkpoint-1/`.

---

## 1. Reconciliation Notes (binding corrections to what Requirements assumed already existed)

Two places where `01-REQUIREMENTS.md`'s binding product-direction text describes a mechanism as
"the same X already established" or "already wired" that, on inspection of live code, does not
yet exist in the form described. Per this repo's "no silent overwrite" discipline these are
recorded here, not silently patched over — each has a single reasoned resolution, not a HALT.

### 1.1 Concurrent-generation uniqueness

`generation_run` today has no DB-enforced uniqueness preventing two rows with the same
`investigation_id` and `outcome = 'in-progress'`. Migration `009` adds a partial unique index:
`UNIQUE (investigation_id) WHERE outcome = 'in-progress'`. The Generation Run Connector's insert
(via `createGenerationRun`, unchanged signature) becomes the single atomic check: a second
concurrent `POST.../generation-runs` for the same Investigation fails at `INSERT` with Postgres
`23505`, which the connector catches and maps to `409` (§4.2).

Because the index is created over a live table, migration `009` first reconciles any
pre-existing duplicate `'in-progress'` rows (only possible from a pre-migration crash): for each
Investigation with more than one such row, it keeps the most-recently-started as `'in-progress'`
and finalizes every older one `'failed'`, recording one honest `GenerationStep` stating this was a
migration-time reconciliation, not fabricated pipeline activity. On a fresh database this affects
zero rows.

```sql
WITH ranked AS (
 SELECT id, investigation_id,
 ROW_NUMBER() OVER (PARTITION BY investigation_id ORDER BY started_at DESC) AS rn
 FROM generation_run
 WHERE outcome = 'in-progress'
), stranded AS (
 SELECT id FROM ranked WHERE rn > 1
), logged_steps AS (
 INSERT INTO generation_step
 (id, generation_run_id, step_index, component, started_at, completed_at, outcome, error,
 model_identifier, input_refs, output_refs, step_data)
 SELECT gen_random_uuid(), gr.id,
 COALESCE((SELECT MAX(step_index) FROM generation_step WHERE generation_run_id = gr.id), -1) + 1,
 'Migration 009 backfill: stranded run reconciliation',
 gr.started_at, now(), 'failed',
 'Left in-progress by a process interruption predating this migration''s uniqueness ' ||
 'constraint; reconciled to permit it. No pipeline activity beyond what was already ' ||
 'recorded is claimed.',
 NULL, '{}', '{}', '{}'::jsonb
 FROM generation_run gr JOIN stranded s ON s.id = gr.id
 RETURNING generation_run_id
)
UPDATE generation_run
 SET outcome = 'failed', completed_at = now()
 FROM logged_steps
 WHERE generation_run.id = logged_steps.generation_run_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_run_investigation_in_progress_unique
 ON generation_run (investigation_id)
 WHERE outcome = 'in-progress';
```

This index prevents two runs from ever starting concurrently for one Investigation. It does not by
itself resolve a run that starts, then goes silent because its process crashed — that is §1.6's
concern.

### 1.2 `Decision` carries no actor/identity field

`Decision` and `recordDecision` (§3.4, §4.3) omit any `decidedBy`/actor field, per this sprint's
binding product direction (no authentication/identity concept anywhere in this surface). UI copy
uses product language ("Your decision"), never a hardcoded name.

### 1.3 `generateBriefVersion` gains one additive progress hook

`generateBriefVersion`'s exported signature gains one new, optional, additive parameter:
`onRunCreated?: (generationRun: GenerationRun) => void`, invoked synchronously immediately after
Phase 1's `createGenerationRun` call succeeds, before preflight validation begins. This changes no
phase's own logic, order, or output, and has zero effect on any caller that omits it. §4.2 uses this
hook so the connector can respond to the browser the instant the concurrency-guarding
`GenerationRun` row exists, without waiting for the rest of the run.

Every business-logic and DB-query failure after Phase 1 already finalizes the run exactly once
(via `attemptGenerationFailedTransition` then `finalizeGenerationRun`, or `finalizeGenerationRun`
alone for the two caller-contract error types) before rethrowing — including the
`InvalidSupersedeTargetError` preflight catch, which gains one `recordGenerationStep` call using a
new, distinctly-named `component: 'Preflight: supersede-target validation'` (`outcome: 'failed'`,
`error: err.message`), so this typed error class now writes real, distinct reason text before
finalizing, never a silent `steps: []`. This is a genuinely new component string introduced for a
genuinely new preflight check — it does not reuse or match the `StaleCorrectionConflictError`
step's `component: 'Brief Assembler'` (`generateBriefVersion.ts:573-584`), which is not a preflight
catch at all but Phase 4's lock-time divergence check (`:561-592`); the new name instead follows the
same convention §1.6's `'Operator abandonment'` and §1.1's `'Migration 009 backfill: ...'` component
strings already establish for introducing a distinct component name alongside a distinct new check.
The one class of post-Phase-1 failure this cannot itself catch is a failure of the finalization
write path — §4.2's fire-and-forget safety net exists for exactly that case.

### 1.4 Add-Source Connector — extends the existing route, no silent overwrite

`POST /api/investigations` (existing, Checkpoint 1) already accepts an optional `investigationId`
in its body to add sources to an existing Investigation. This checkpoint extends its handler in
place — no new route, no duplication:

- No `investigationId`: unchanged create path.
- Existing `investigationId`, current status is not `'brief-generated'`: append sources, attempt
 `transitionInvestigationStatus`, and check its returned boolean. `false` is a genuine `409`
 conflict only when the Investigation's real current status has diverged from the status observed
 before this request began; otherwise it is a benign no-op and the request succeeds `201`.
- Existing `investigationId`, current status is `'brief-generated'`: append sources, but never call
 `transitionInvestigationStatus` for this request — not even as a no-op the guard is relied on to
 decline. Whether the Investigation becomes generation-eligible again is answered exclusively by
 §4.8's exact-consumption eligibility check on the next workspace read.
- Every response reports the real, freshly-read `investigation.status` — never an assumed one.

**`resolveInvestigationSources` no longer re-resolves already-resolved sources.** Because this same
function runs on every add-source request, calling it unconditionally today would re-fetch and
silently overwrite the persisted `resolution_status`/content of every already-resolved source on
each add — including sources already consumed by the current `BriefVersion`. `resolveInvestigationSources`
is changed to select each row's persisted `resolution_status` alongside its id: rows still
`'unresolved'` (a freshly-inserted row's default) are resolved as before; rows already in a terminal
state (`'unreachable'`, `'content-retrieved'`, `'reachable-no-content'`) are reused as-is, not
re-fetched or rewritten. `allUnreachable` is computed over the full set (freshly resolved + reused),
preserving its existing meaning. This is a no-op for the original single-call submission flow (every
row is freshly `'unresolved'` at first submission) and only changes behavior on a second call
against an Investigation that already has terminally-resolved rows.

### 1.4a Single-source recheck — atomic, no silent overwrite under concurrent requests

A source that resolved `'unreachable'` can be intentionally retried without triggering the bulk
add-source path (which never re-resolves already-resolved sources, §1.4). This is a narrow,
structurally separate mechanism:

- **Route**: `POST /api/source-artifacts/:id/recheck`.
- **Service**: `recheckSourceArtifact(sourceArtifactId: string): Promise<SourceResolution>`
 (`src/services/recheckSourceArtifact.ts`, new file).
- **Server-side eligibility guard**: before doing anything else, read the row's persisted
 `resolution_status`/`resolution_resolved_at`. If `resolution_status` is not `'unreachable'`, reject with `409
 RecheckNotEligibleResponseBody` and write nothing — the client declining to render the control is
 not sufficient protection on its own.
- **`resolveSourceArtifact.ts` must be refactored to separate computation from persistence** (a
 required Forge-slice edit to this live file, not a description of already-shipped behavior).
 Live `resolveSourceArtifact` (`resolveSourceArtifact.ts:40-71`) computes a `SourceResolution` AND
 unconditionally persists it itself, inside the same call, via `persistResolution`
 (`resolveSourceArtifact.ts:71`, `:148-168`) — an unconditional `UPDATE` with no `WHERE` clause
 beyond `id`. If `recheckSourceArtifact` called this function as originally drafted, that inner,
 unconditional write would land BEFORE any CAS guard ever runs, clobbering the guard columns it
 is about to read/gate on — by the time the outer conditional `UPDATE` below executes, its own
 call's inner write has already happened, so the outer guarded `UPDATE` matches zero rows for its
 OWN call every time, defeating the CAS guard entirely (it would always report itself as "lost the
 race," even when it was the only writer). The fix is to split resolution computation from
 persistence, so a caller can obtain a `SourceResolution` WITHOUT it being written anywhere:
 ```typescript
 // resolveSourceArtifact.ts — computation only, never persists. Extracted from the body of
 // resolveSourceArtifact (today's lines ~40-69, before its persistResolution call) — same
 // type-branch logic (text / url / unsupported), zero behavior change.
 // SOL-MEDIUM-1 fix — the return type below now carries the two canonical-identity fields §4.8's
 // SOL-MEDIUM-1 mechanism requires (`canonicalUrl`, `resolvedContentHash`), computed inline in the
 // same function body immediately after the type-branch resolution logic that already runs here
 // (§4.8 below states exactly where and how each is derived, from the same guarded fetch this
 // function already performs — no second network call, no new call site). This function's typed
 // signature below is the single source of truth §4.8's mechanism is implemented against; §4.8
 // states exactly where and how each field is derived.
 export async function computeSourceResolution(
   artifact: { id: string; type: string; raw: string },
 ): Promise<{
   resolution: SourceResolution;
   resolvedContent: string | null;
   canonicalUrl: string | null; // §4.8 SOL-MEDIUM-1 — url-type, content-retrieved only; null otherwise
   resolvedContentHash: string | null; // §4.8 SOL-MEDIUM-1 — any type, content-retrieved only; null otherwise
 }>;

 // resolveSourceArtifact.ts — UNCHANGED external signature/behavior for every existing caller
 // (submitSources/resolveInvestigationSources, and every existing test). Now implemented as:
 // fetch the row, call computeSourceResolution, persist unconditionally via the existing
 // persistResolution, return the resolution. This is the ONLY caller that persists
 // unconditionally — every other caller of computeSourceResolution controls its own persist.
 export async function resolveSourceArtifact(sourceArtifactId: string): Promise<SourceResolution>;
 ```
 `recheckSourceArtifact` calls `computeSourceResolution` directly — NEVER `resolveSourceArtifact` —
 so no write happens as a side effect of computing the new resolution; the only write this call
 performs is its own single, guarded `UPDATE` below.
- **Atomic write (compare-and-set)**: two concurrent recheck requests against the same source must
 never race and have one silently overwrite the other's newly-resolved row, AND `rowCount === 1`
 must reliably identify the single winning writer — not merely avoid lost updates. The real,
 already-live `source_artifact` schema (`001_initial_schema.sql`, `003_source_artifact_resolved_
 content.sql`) has no `updated_at` column and no `resolution_detail`/`resolution_content` columns —
 the persisted resolution columns are `resolution_status`, `resolution_resolved_at`,
 `resolution_failure_reason`, `resolution_no_content_reason`, and `resolved_content`
 (`resolveSourceArtifact.ts`'s own `persistResolution`, confirmed against live code). Of these,
 `resolution_resolved_at` is written on every resolution — success, `unreachable`, and
 `reachable-no-content` alike (`resolveSourceArtifact.ts:154-168`) — and changes on every resolution
 write, but it is `new Date().toISOString()` (millisecond resolution) — not a monotonic or
 collision-free token: two concurrent rechecks that resolve to the same `resolution_status` inside
 the same millisecond produce an identical guard tuple, so both `UPDATE`s below could match, and
 `rowCount === 1` alone cannot then say which call's write is "the" winner.

 **SOL-MEDIUM-2 fix — a real monotonic revision column closes this.** A new additive column,
 `source_artifact.resolution_revision INTEGER NOT NULL DEFAULT 0` (added in the same migration `013`
 SOL-MEDIUM-1's `canonical_url`/`resolved_content_hash` columns land in, C2-S2's own scope — one
 `ALTER TABLE source_artifact` statement covering all three additive columns), incremented by
 exactly 1 on every write to this row's resolution columns, by BOTH `recheckSourceArtifact`'s own
 guarded `UPDATE` below and `resolveSourceArtifact.ts`'s existing unconditional `persistResolution`
 write (so the counter is a true count of every resolution write this row has ever received,
 regardless of which of the two write paths made it — a recheck reading the row's current
 `resolution_revision` always sees the real total, never a count scoped to one write path). Unlike
 `resolution_resolved_at`, this counter cannot collide: Postgres serializes concurrent `UPDATE`s
 against the same row, so two concurrent writers reading `resolution_revision = N` and both
 attempting `SET resolution_revision = N + 1 WHERE ... AND resolution_revision = N` can never both
 succeed — the first to commit advances the row to `N + 1`, and the second's `WHERE` clause no
 longer matches, `rowCount === 0`, unambiguously.

 `recheckSourceArtifact`: (1) reads the row (`id, type, raw, resolution_status,
 resolution_resolved_at, resolution_revision`) once — this single read serves the eligibility guard
 above and the CAS gate below, not two separate reads; (2) calls `computeSourceResolution` against
 that row's `{ id, type, raw }` — a pure computation, nothing persisted by this call; (3) persists
 the computed result itself with a conditional `UPDATE` gated on the `resolution_revision` value
 read at step 1 (the `resolution_status`/`resolution_resolved_at` equality checks are retained
 alongside it, unchanged, as an additional guard against any writer that does not itself go through
 this revision counter — belt-and-suspenders, not a replacement):
 ```sql
 UPDATE source_artifact
 SET resolution_status = $2,
 resolution_resolved_at = $3,
 resolution_failure_reason = $4,
 resolution_no_content_reason = $5,
 resolved_content = $6,
 canonical_url = $7, -- SOL-MEDIUM-1 fix: computeSourceResolution's own returned field (§4.8 SOL-MEDIUM-1)
 resolved_content_hash = $8, -- SOL-MEDIUM-1 fix: same (§4.8 SOL-MEDIUM-1) — this is the recheck path's
 -- own persistence of the two canonical-identity fields; it is
 -- not a second write path, since this UPDATE was already the
 -- only write recheckSourceArtifact performs
 resolution_revision = resolution_revision + 1
 WHERE id = $1 AND resolution_status = $9 AND resolution_resolved_at = $10
 AND resolution_revision = $11
 RETURNING resolution_status, resolution_resolved_at, resolution_revision;
 ```
 (`$9`/`$10`/`$11` are the `resolution_status`/`resolution_resolved_at`/`resolution_revision` values
 read at step 1 — the same fields the eligibility guard above already read, reused, not re-read a
 second time.) Because `computeSourceResolution` never writes, this is now genuinely the ONLY write
 `recheckSourceArtifact` performs against this row, so the guard evaluates against the real pre-call
 state, not a state this same call already overwrote. **What this guard now guarantees, in full**:
 `rowCount === 1` reliably and unambiguously identifies the single winning writer — even in the
 identical-millisecond, identical-resolved-status case that defeated the `resolution_resolved_at`-
 only guard, because `resolution_revision` cannot collide between two genuinely concurrent writers
 (Postgres's own row-level `UPDATE` serialization is what makes this true, not application-level
 logic). `rowCount === 0` means another writer of this row (a concurrent recheck, or a resolution
 write via any other path) already advanced `resolution_revision` past the value this call read;
 the loser performs no further write and returns the row's real current (freshly re-read) state
 rather than overwriting it — the winner's newly-resolved row is never silently clobbered, and the
 loser can now say, correctly and unconditionally, "the other call won."
- **Status recovery**: after a winning write, if the Investigation's current status is `'blocked'`,
 re-read its full source set and recompute `allUnreachable` (true only when every source is
 `'unreachable'`); if now false, call `transitionInvestigationStatus(investigationId, 'open',...)`,
 checking its returned boolean. If status is not `'blocked'`, this call is skipped entirely — an
 explicit skip, not a value the guard is relied on to decline.
- **Response**: `200 { sourceArtifactId, resolutionStatus, investigationStatus }` — real, freshly
 read-back values. `404` if the artifact does not exist. `409 RecheckNotEligibleResponseBody` for
 the ineligibility guard above.
- **Client**: a "Re-check this source" control per `'unreachable'` source in `BlockedSourcesPanel`,
 re-fetching `GET.../workspace` on completion.

```typescript
interface RecheckNotEligibleResponseBody {
 error: 'recheck-not-eligible';
 sourceArtifactId: string;
 currentResolutionStatus: SourceResolution['status'];
 message: string;
}
```

No new table. `source_artifact.resolution_status`/`resolution_resolved_at`/
`resolution_failure_reason`/`resolution_no_content_reason`/`resolved_content` are the existing,
already-live persisted columns this action writes through, scoped to one row, joined by the one new
additive column this checkpoint adds, `resolution_revision` (SOL-MEDIUM-2 fix, migration `013`, same
migration §4.8's SOL-MEDIUM-1 fix uses for its own two additive columns).

### 1.4b Source Resolver — blank/whitespace-only text AND URL content must not resolve `'content-retrieved'`

**Disclosure — re-applying a previously-made fix.** This exact correction (delete
`MIN_CONTENT_LENGTH`, make both branches use an identical zero-length trim check) was already
ruled on and applied once before, in PR #11, following a cold Frank spec-gate HALT on this same
constant in PR #8. PR #11 was later closed unmerged during an unrelated trust-integrity incident,
and this recovery branch was rebuilt from a tree that predates that fix — so the constant, and its
self-certified `PROVISIONAL — owner: Ledger` tag, came back with no disclosure that it was
unsourced. This is not a newly-discovered issue; it is Danny's already-settled ruling, re-applied.
The rule that an agent naming itself as a `PROVISIONAL` tag's owner is self-certification and never
valid is Danny's direct ruling on this exact constant (the `MIN_CONTENT_LENGTH` PROVISIONAL-tag
issue and its resolution, 2026-09-05). This rule is now tracked from a file in this branch:
`docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md` has been restored to this branch's
`docs/decisions/`, and its Category A table, row A1, records this exact deletion as the DDR's own
independent disposition for `MIN_CONTENT_LENGTH` — "MEASURED — resolved via branch (c), redesign;
constant deleted," with the same finding this document reaches below (no raw-body-length threshold
separates content-bearing from content-empty responses; check reduced to a zero-length trim test).
This document's fix and DDR-0002's row A1 are matching records, drawing on the same underlying
measurement evidence, of the same resolution — see
`docs/specs/problem-department-mvp/min-content-length-measurement.md`. `PROVISIONAL` is not a
fourth option when no real citation or human acceptance exists —
the only correct move is deletion, replacing the mechanism with a check that needs no magic number
at all.

**Already applied on this branch, verified against live source (2026-09-06).** Live
`resolveSourceArtifact.ts` no longer contains `MIN_CONTENT_LENGTH` at any line — it was deleted.
The `type === 'text'` branch (`resolveSourceArtifact.ts:55-57` in the pre-fix tree this section
originally described) and the `type === 'url'` branch both now apply the identical
`body.trim().length === 0` check (`resolveSourceArtifact.ts:116`); the constant's second real live
consumer, `classifyRetrievalOutcome.ts`, no longer imports or references `MIN_CONTENT_LENGTH`
either — its `'http-response'` 2xx branch applies `bodyLength === 0` directly
(`classifyRetrievalOutcome.ts:65`). The only existing server-side validation of submitted text is
`src/web/apiRoutes.ts:55` (`raw: a.raw.trim()`, a normalization, not a rejection) and
`src/web/apiRoutes.ts:45` (rejects only a wholly EMPTY `artifacts` array, not a whitespace-only
individual `raw` string) — so a source submitted with `raw: '   '` (or any string that trims to
zero length) is still accepted at the API layer, but the fix below closes the gap at resolution
time.

**Fix already applied** — `MIN_CONTENT_LENGTH` is deleted from `resolveSourceArtifact.ts` entirely
(not narrowed, not re-tagged `PROVISIONAL` under a different owner), and both the `type === 'text'`
AND `type === 'url'` branches of `resolveSourceArtifact.ts`'s resolution logic (§1.4a's
`computeSourceResolution` split is itself still Forge work — see below) carry the SAME
zero-measurement check, matching this shape:

```typescript
if (artifact.type === 'text') {
  if (artifact.raw.trim().length === 0) {
    resolution = {
      status: 'reachable-no-content',
      resolvedAt: new Date().toISOString(),
      noContentReason: 'Submitted text content was blank or whitespace-only.',
    };
    resolvedContent = null;
  } else {
    resolution = { status: 'content-retrieved', resolvedAt: new Date().toISOString() };
    resolvedContent = artifact.raw;
  }
} else if (artifact.type === 'url') {
  // ...existing fetch/guard logic unchanged up to and including a successful 2xx response...
  if (body.trim().length === 0) {
    resolution = {
      status: 'reachable-no-content',
      resolvedAt: new Date().toISOString(),
      noContentReason:
        'Response returned successfully but the raw response body was empty or whitespace-only. ' +
        'This check does not detect paywalls, login walls, or JS-rendered pages — measured ' +
        'JS-rendered pages typically return substantial raw HTML regardless of visible content, ' +
        'but paywall/login-wall behavior was not measured — that judgment belongs to downstream ' +
        'content extraction, not this fetch-layer check.',
    };
    resolvedContent = null;
  } else {
    resolution = { status: 'content-retrieved', resolvedAt: new Date().toISOString() };
    resolvedContent = body;
  }
}
```

**Measured, not asserted — and the paywall half of the wording is a disclaimer, not a measured
claim.** This wording is not a rewording of the deleted constant's rationale — it is the corrected
replacement for a claim that was itself measured and found false, but the measurement's coverage is
uneven across what the reason text mentions and this document does not overstate it. PR #11's
`min-content-length-measurement.md` (historical record, `archive/pr-11-190f469-2026-09-05` branch)
measured `MIN_CONTENT_LENGTH = 200` against an 18-URL labelled sample and found no raw-body-length
threshold — including 200 — separates content-bearing from content-empty 2xx pages. The sample
contained a real, reproducible 2xx JS-shell response (vercel.com) supporting the JS-render half of
the claim, but zero real 2xx paywall responses — the one paywall-adjacent site tested (e.g.
Crunchbase) returned 403, not 2xx, so it never reached this check at all. The "likely a paywall,
login wall, or JS-only render" claim this replaces was retracted because the raw-length heuristic
itself was shown unable to do the job on the evidence available (11 sampled 2xx responses, every
threshold in [1, 558] classifying them identically) — not because paywall behavior specifically was
measured and found to typically return substantial raw HTML. The reason text this check now
produces should read, and is intended to read, as **"this check does not detect paywalls"** — a
disclaimer about this check's own limits — not as an established, measured claim about how paywalls
behave; this document does not assert the latter. `classifyRetrievalOutcome.ts`'s own
`'http-response'` 2xx branch gets the identical replacement: `bodyLength === 0` → `'blocked'`, with
`failureReason` restated using the same corrected, disclaiming wording above (substituting
"blocked" for "reachable-no-content" as the status name, per that file's own status vocabulary) —
never the removed paywall/login-wall/JS-render claim.

Both branches now use the identical `trim().length === 0` check — a literal zero-length test, not
an arbitrary threshold, so there is no number here to source or own. This deliberately narrows what
the `url` branch's `reachable-no-content` classification catches (a response with SOME short but
non-empty text — e.g. a 40-character JS-shell stub — now resolves `'content-retrieved'` where the
deleted 200-character heuristic would have called it empty); that narrowing is the correct
trade-off, since the alternative was an unsourced, self-certified number masquerading as a
validated heuristic. If false positives/negatives from genuinely-empty-but-non-zero-length pages
are observed in real use, that becomes a new, separately-sourced or separately-owned decision at
that time — not a reason to keep the old number now. `reachable-no-content` (not `unreachable`)
remains the correct terminal state for both branches: the artifact was clearly present (submitted
or reachable) but carried no extractable content. **The constant deletion and its zero-length
check are already applied on this branch, in both real consumers** — `src/services/resolveSourceArtifact.ts`
(`MIN_CONTENT_LENGTH` deleted, its own inline `resolveUrl` check now `body.trim().length === 0`)
AND `src/services/classifyRetrievalOutcome.ts` (its own `bodyLength === 0` check, no
`MIN_CONTENT_LENGTH` import) — verified against live source. **Still Forge work assigned to
`04-ROADMAP.md` C2-S2**: §1.4a's `computeSourceResolution`/`resolveSourceArtifact` split, which
this fix's own logic will move into once built — C2-S2 is where `recheckSourceArtifact.ts` (the
split's own first caller) is built, so the split cannot be deferred past that slice. §4.8's
eligibility query (built later, C2-S3) then depends on a resolver that has already carried this fix
since before C2-S2 began.

### 1.5 US-13 eligibility

`hasEligibleNewEvidenceSinceCurrentBriefVersion` determines whether a `'brief-generated'`
Investigation is eligible for a corrective generation run. It is specified in full, including its
exact persisted mechanism, in §4.8 — a real persisted consumption record, ledgered directly from
Extraction's own actual read set (`usableSourceIds`, §4.8), not a `generation_run.started_at`
timestamp bound, closes both the mid-run race a naive full-resolved-source snapshot would leave open
AND the narrower Extraction-read-boundary gap a `started_at` comparison alone cannot close.

### 1.6 Generation run ownership: fencing, heartbeat, and abandonment

A `GenerationRun` whose process crashes or hangs must not permanently block its Investigation
(§1.1's unique index would otherwise make every future `INSERT` fail `23505` forever), and an
operator recovering from an apparently-dead run must not be able to create two live writers against
the same run's `generation_run`/`generation_step` rows. Silence alone is not proof a process is
dead — it may be a slow LLM call. The mechanism below separates the two concerns: a **liveness
signal** (display-only, never authorizes a destructive action by itself) and a **fencing token**
(the actual authorization/ownership mechanism, enforced at every `generation_run`/`generation_step`
write). What this actually protects, precisely: `generation_run` and `generation_step` writes are
fenced directly, via the guarded `UPDATE ... WHERE fence_token = $n` below.

**Full write-path enumeration.** `generateBriefVersion`'s pipeline writes to many tables across its
run (the exact count is not asserted here as load-bearing — see the enumeration below for what is
actually enumerated). These fall into three categories: fenced directly via the guarded
`generation_run`/`generation_step` `UPDATE`s; fenced via a new guard-checked transaction wrapping
every other pre-Phase-4 write path (below); and protected indirectly via Phase 4's own transaction
rollback. **SOL-HIGH-2 (write-path fencing completeness).** `attemptGenerationFailedTransition`'s
`Investigation.status` write is NOT exempted on "idempotency" grounds: `getProblemDepartmentOverview.ts:60-95`
reads `investigation.status` directly for the portfolio view, and
`InvestigationPortfolioTable.tsx:33-36,87-89` filters/renders it — a stale, fenced-out writer's
late `'generation-failed'` transition is directly observable there even though the Investigation's
real, current `GenerationRun` has since succeeded. There is no exception in this enumeration: EVERY
write path below — including this one — is fenced, either directly by a `fence_token`/`outcome`
check or by running inside the same guard-checked transaction as one. `§1.6`'s "writes become inert
once fenced" claim holds without exception.

**Why the prior "accretive, so harmless" reasoning was wrong.** `generateBriefVersion` (Phase 1,
before any per-run write happens) reads Investigation-wide evidence and ALL `claim_version` rows —
not scoped to the calling run — to assemble its working set. A write that lands in `evidence_item`/
`claim`/`claim_version` after a run has been fenced out is not inert merely because the row itself
is additive and self-consistent: it is still readable, and read, by the very next run that retries
generation for this Investigation. The same is true of `source_artifact`/`web_search_result` rows
(read via the source list) and the `generation_run_consumed_source` ledger (read by §4.8's
eligibility query). A fenced-out run's stray writes to any of these tables can therefore be
incorporated into a subsequent retry's `BriefVersion` even though the run that produced them was
never allowed to persist its own `BriefVersion` — a real data-integrity race, not a display nuance.
The fix below closes it by making every one of these writes check fence ownership, atomically,
immediately before it commits.

**New guard mechanism — `assertFenceOwnership`.** A single new helper, alongside
`recordGenerationStep`/`finalizeGenerationRun` in `src/services/provenanceRecorder.ts`:

```typescript
async function assertFenceOwnership(
  client: PoolClient,
  generationRunId: string,
  fenceToken: number,
): Promise<void> {
  const { rows } = await client.query(
    `SELECT fence_token, outcome FROM generation_run WHERE id = $1 FOR UPDATE`,
    [generationRunId],
  );
  if (rows.length === 0 || rows[0].fence_token !== fenceToken || rows[0].outcome !== 'in-progress') {
    throw new GenerationRunFencedOutError(generationRunId);
  }
}
```

**SOL-HIGH-2 — outcome, not id/token alone.** Checking `fence_token` alone is sufficient to detect a
*superseding* writer (an abandon that incremented the token) but not a run that reached a
*terminal* outcome (`'succeeded'`/`'failed'`) through
`finalizeGenerationRun` without its own `fence_token` ever changing — `finalizeGenerationRun`'s
guarded `UPDATE` (below) does not touch `fence_token`, only `outcome`. Without the `outcome =
'in-progress'` check, a write that raced past `finalizeGenerationRun`'s own finalization (e.g. a
slow, already-fenced-in but stale caller reaching this guard after its own run was legitimately
finalized `'failed'` by the abandon flow, but before its own next write attempt) could still pass
this check purely on token equality and mutate state after its run is already terminal. Checking
`outcome = 'in-progress'` here — the SAME row, same `FOR UPDATE` lock, same query — closes this
without a second query or a second lock acquisition.

Most pre-Phase-4 write paths below (the `generation_run_consumed_source` ledger `INSERT`, Landscape
Research's four `searchWeb` writes, and `attemptGenerationFailedTransition`'s status-transition
write — none of which span an LLM call) open their own new short-lived transaction, call
`assertFenceOwnership` as its FIRST statement (taking a row lock on `generation_run.id`), perform
their writes, then commit. **The exception is `extractClaimsAndEvidence`/
`extractClaimsAndEvidenceForSourceArtifacts`**, whose LLM call requires `assertFenceOwnership` to be
placed inside their EXISTING single transaction, after the LLM call returns, immediately before the
first `INSERT` — not as that transaction's first statement, and not in a new, separately-opened
transaction (see the SELF-3 bullet below for why). The `FOR UPDATE` row lock is what removes the
check-then-act race in every case: if an
`abandonGenerationRun` call (§1.6 above, step 4's `UPDATE ... WHERE ... fence_token = $2 AND
heartbeat_revision = $3`) is concurrently trying to increment this same row's `fence_token`, one of
the two transactions blocks until the other commits — there is no window in which
`assertFenceOwnership` can read a since-superseded token or a since-terminalized outcome and still
have its subsequent writes commit. If the guard throws, the caller's transaction rolls back (nothing
it wrote persists) and the caller treats this identically to the existing "fenced out, no-op"
disposition — no error surfaces to the operator, since it just means a fenced-out or already-
terminal run's late write was correctly discarded.

- **Fenced directly** — `generation_run` and `generation_step` writes
  (`recordGenerationStep`/`finalizeGenerationRun`, guarded `UPDATE ... WHERE fence_token = $n`,
  below). A fenced-out pipeline's calls to either no-op or throw; these writes genuinely become inert
  once fenced.
- **Fenced via `assertFenceOwnership`, called INSIDE the existing single transaction, positioned
  immediately BEFORE the final `INSERT`s — NOT as that transaction's first statement, and NOT in a
  second, separately-opened transaction (SELF-3).** Live
  `extractClaimsAndEvidenceForSourceArtifacts` (`extractClaimsAndEvidence.ts:436-...`, and its
  `extractClaimsAndEvidence` wrapper, called at `generateBriefVersion.ts:338`) opens ONE transaction
  and takes an advisory lock (`pg_advisory_xact_lock`, F-2 fix) as close to the top of the function
  as `BEGIN` itself, THEN calls the LLM (`callForcedTool`) while that same transaction — and the
  advisory lock it holds — is still open, before any `INSERT`. Naively adding `assertFenceOwnership`
  as this same transaction's first statement, as the general rule above states, would hold the
  `generation_run` row's `FOR UPDATE` lock for the entire duration of the LLM call — directly
  conflicting with the abandon route's own step-4 fence-increment `UPDATE`, which needs that same
  row lock: a concurrent abandon attempt would then BLOCK (hang) for the full LLM call's duration
  instead of promptly succeeding or returning `409`. This transaction is not short-lived in the way
  most pre-Phase-4 write paths above are — its duration spans the LLM call.

  Splitting the function into TWO
  transactions — the advisory lock plus LLM call in one, `assertFenceOwnership` plus the final
  `INSERT`s in a second, opened only after the LLM call returns. **That split is wrong and is not
  what this document specifies:** F-2's advisory lock is released the instant the FIRST transaction
  commits — before the second transaction's `claim_version` inserts ever run — so it would no
  longer cover the read-of-`latestVersionNumber`-through-insert-of-`N+1` window it exists to
  serialize. Two concurrent runs could once again both read the same existing claim's
  `latestVersionNumber = N` (one in each transaction's own first phase) and both attempt to insert
  `version_number = N + 1` in their own separate second transactions, racing on the
  `UNIQUE(claim_id, version_number)` constraint — reopening the exact race F-2 already closed.

  **The correct fix — keep the single existing transaction; call the guard late inside it, not
  early and not in a second transaction.** `BEGIN` → advisory lock
  (`pg_advisory_xact_lock`) → existing-claims read (`getExistingClaimsForInvestigation`) → the LLM
  call (`callForcedTool`) → `assertFenceOwnership(client, generationRunId, fenceToken)` →
  every `EvidenceItem`/`Claim`/`ClaimVersion`/`ClaimVersionEvidence` `INSERT` this function
  performs → `COMMIT` — exactly the transaction boundaries live code has today, with
  `assertFenceOwnership` inserted as one new statement, positioned immediately after the LLM call
  returns and immediately before the first `INSERT`, not at `BEGIN`. This closes the original
  abandon-blocking problem: the `generation_run` row's `FOR UPDATE` lock is now acquired only in the
  brief window between the LLM call returning and `COMMIT` (the time it takes to run the guard
  query plus the batch of inserts — milliseconds, not the LLM call's own duration), so a concurrent
  abandon attempt is never blocked by a still-in-flight LLM call. And because the advisory lock's
  own coverage is completely unchanged from live code today — it still spans the entire
  existing-claims-read-through-final-insert window, inside one uninterrupted transaction — F-2's
  invariant is preserved with zero regression: it is genuinely true, under this design, that "the
  advisory lock continues to serialize concurrent extraction attempts against the same
  Investigation, exactly as it does today; no new contention is introduced by this fix," since
  nothing about the advisory lock's acquisition, scope, or release point changes at all —
  `assertFenceOwnership`'s `generation_run` row lock is a second, independent lock added inside the
  same transaction, not a replacement for or restructuring of the advisory lock. Under this design,
  `extractClaimsAndEvidence.mocked.test.ts`'s existing F-2 regression test (`:406-...`, using the
  `__setF2RaceDelayForTests` hook to force two concurrent calls to race on the same existing claim's
  version read) must continue to pass UNMODIFIED: the test's own assertions (no
  `generationFailed`/thrown error from either concurrent call, both calls' `claimVersions` resolve
  under the same pre-existing `claimId`, and every persisted `claim_version.version_number` for that
  claim is distinct — `{1, 2, 3}`, never a collision) depend only on the advisory lock continuing to
  cover the read-through-insert window across two genuinely concurrent transactions, which this
  design preserves unchanged; inserting `assertFenceOwnership` as one additional statement between
  the LLM call and the first `INSERT` does not touch the lock's acquisition point, the existing-
  claims read, the version-number computation, or the insert ordering the test depends on. Applies
  identically to both real call sites: the primary `extractClaimsAndEvidence` path
  (`generateBriefVersion.ts:338`) and Landscape Research's own second extraction pass
  (`extractClaimsAndEvidenceForSourceArtifacts`, called at `landscapeResearcher.ts:272`, itself
  reached from `generateBriefVersion.ts:393`) — both share the same function body today and must be
  restructured together, not one fixed and the other left inconsistent.
- **Fenced via `assertFenceOwnership`, in its own guard-checked transaction** — the
  `generation_run_consumed_source` ledger `INSERT` (§4.8, `generateBriefVersion.ts:479`): the same
  guard, immediately before the `INSERT`, in the same short-lived transaction. A fenced-out run's
  ledger row is no longer written at all, rather than being written-but-provably-unread; this is a
  strictly stronger guarantee than the prior "unread by construction" argument, and removes the
  dependency on §4.8's eligibility query continuing to scope by `generation_run_id` correctly
  forever.
- **Fenced via `assertFenceOwnership`, in one shared guard-checked transaction** — Landscape
  Research's four writes, via `searchWeb.ts` (called from `generateBriefVersion.ts:393-399` via
  `landscapeResearcher.ts:260`) — `web_search_query` (`searchWeb.ts:160,217`), `query_limitation`
  (`searchWeb.ts:167,234`), `source_artifact` (`searchWeb.ts:247`), and `web_search_result`
  (`searchWeb.ts:266`). `searchWeb` already receives `generationRunId` from
  `landscapeResearcher.ts:260` in live code today; it is extended to also accept `fenceToken` — the
  only genuinely new parameter — threaded through from the same call site, and opens one transaction covering all four
  writes for a given search call, calling `assertFenceOwnership` once at the top of that
  transaction before any of the four `INSERT`s. `web_search_query` rows are surfaced directly in
  the UI provenance rail (`03-UI-SPEC.md`, Sections table, Source column citing
  `workspace.generationRuns[].webSearchQueries`); a fenced-out run's searches are now never
  written at all, so there is nothing stray left to either display or be consumed by a retry. Rows
  that DID commit before fencing occurred remain exactly as honest as before (the searches genuinely
  happened, under that run's real id, before it was fenced out).
- **Fenced via `assertFenceOwnership`, in the SAME transaction as the `generation_step`/
  `generation_run` writes it accompanies (SOL-HIGH-2 correction)** —
  `attemptGenerationFailedTransition`'s `transitionInvestigationStatus` write
  (`generateBriefVersion.ts:263-267`). This write is NOT acceptably left unfenced on "idempotency"
  grounds: it is independently observable, and in the WRONG direction (stale-published-as-failed,
  not merely redundant): `getProblemDepartmentOverview.ts:60-95` reads `investigation.status`
  directly for the portfolio view, and `InvestigationPortfolioTable.tsx:33-36,87-89` filters and
  renders it. A
  fenced-out run's `attemptGenerationFailedTransition` call — reached, for example, after a
  concurrent abandon has already incremented the row's `fence_token` and a healthy replacement run
  has since started and even succeeded — must not be allowed to publish `'generation-failed'` over a
  currently-healthy Investigation. The fix: `attemptGenerationFailedTransition` now opens its own
  short-lived transaction that FIRST issues `SELECT id FROM investigation WHERE id = $1 FOR UPDATE`
  (lock-order fix, for consistency with §1.6's abandon-flow fix and Phase 4's own order —
  `generateBriefVersion.ts:552` — even though this call touches only one Investigation and one
  GenerationRun and Frank's specific finding was about the abandon flow, the same
  investigation-then-generation_run order is applied here so no two transactions in this file ever
  lock these two tables in opposite orders), THEN calls `assertFenceOwnership(client,
  generationRunId, fenceToken)` (the same helper and `FOR UPDATE` row-lock discipline as every other
  pre-Phase-4 write path above — no second implementation), and only then performs the
  `generation_step` write (recording the failure reason) and the `transitionInvestigationStatus`
  call, both inside that same transaction, committing together. If the guard throws, the whole
  transaction rolls back — neither
  the `GenerationStep` nor the status transition is written, and the caller treats this identically
  to every other fenced-out write's disposition: a silent, correctly-discarded no-op. `outcome`-
  discrimination is by construction here too, since `assertFenceOwnership` itself now checks
  `outcome = 'in-progress'` (above) as well as `fence_token` — a run that has already reached a
  terminal outcome by any path cannot reach this write either. This closes the one path in this
  enumeration that remained capable of mutating Investigation-visible state after being fenced out.
- **Protected indirectly, via transaction rollback, not a fence check of its own** — Phase 4's four
  remaining writes: `INSERT INTO problem_brief` (`generateBriefVersion.ts:606`),
  `persistBriefVersion` (`:612` — writes `brief_version` plus, per candidate, the
  `problem_statement`/`demand_signal`/`existing_solution`/`gap_hypothesis`/`personal_pull_note`/
  `negative_finding` rows; uncertainty and recommendation are columns on `brief_version` itself, not
  separate tables), `UPDATE
  problem_brief SET current_version_id` (`:637`), and `transitionInvestigationStatus(...,
  'brief-generated', ...)` (`:642`). All four run inside the same transaction as the guarded
  `finalizeGenerationRun` call at `:677` — `persistBriefVersion` is called with `client` (`:612-613`),
  so it is transaction-protected like the other three; if that call loses the fence race, the whole
  transaction is
  rolled back (§1.6 above), so none of these four commits either. They are correctly protected, just
  not by a fence-token check of their own — the transaction boundary is the protection mechanism.

**Schema** (`generation_run`, migration `009`, added alongside §1.1's index):

```sql
ALTER TABLE generation_run
 ADD COLUMN IF NOT EXISTS fence_token INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS lease_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS heartbeat_revision INTEGER NOT NULL DEFAULT 0;
```

`heartbeat_revision` (SOL-HIGH-1 fix, below) is the abandon flow's collision-free CAS token — a
monotonic counter, distinct from `fence_token` (which authorizes ownership) and from
`lease_heartbeat_at` (which remains the display-facing liveness signal `computeLivenessState`,
§4.9, reads). `fence_token` starts at `1` for every new run. `createGenerationRun`'s `INSERT` (existing call
site, `src/services/provenanceRecorder.ts:62-74`, unchanged input parameters) is extended with
`RETURNING fence_token`, and the `GenerationRun` domain type (`src/types/domain.ts`) gains a
`fenceToken: number` field, populated from that returned value — this is the only way the pipeline
invocation that creates the run can capture, once, in-memory, the token it must pass to every
subsequent write against this run. `lease_heartbeat_at` is renewed at every real progress point the
pipeline itself performs — every `recordGenerationStep` call, including the seven made indirectly
through `runStepWithProvenance` (see the write-site check below) — not inferred from silence.

**Write-site check, both mutating functions on `generation_run`:**

`recordGenerationStep` and `finalizeGenerationRun` both gain a required `fenceToken: number` field
on their existing single object parameter — matching this codebase's established convention
(`src/services/provenanceRecorder.ts:95-98,139-144` already take one object parameter each, never
positional arguments):

```typescript
function recordGenerationStep(input: {
  generationRunId: string;
  step: GenerationStep;
  fenceToken: number;
  client?: PoolClient;
}): Promise<void>;

function finalizeGenerationRun(input: {
  generationRunId: string;
  outcome: 'succeeded' | 'failed';
  briefVersionId: string | null;
  fenceToken: number;
  client?: PoolClient;
}): Promise<GenerationRun>;
```

**Signature fix: `recordGenerationStep` gains the same
optional `client?: PoolClient` parameter `finalizeGenerationRun` already carries above, with the
identical convention and semantics — runs on the given client, inside the caller's own transaction,
when supplied; opens its own connection via `pool` otherwise.** §1.6's abandon flow (step 5) and the
SOL-HIGH-2 `attemptGenerationFailedTransition` wrapper both call `recordGenerationStep({ ...,
fenceToken, client })` from inside a caller-owned transaction, exactly as they already call
`finalizeGenerationRun({ ..., client })`. Live code
(`src/services/provenanceRecorder.ts:95-98`) does not carry a `client` field on
`recordGenerationStep`'s typed signature; this document specifies adding one, so those calls pass a
parameter the function's own typed signature accepts. This is a mechanical signature addition
matching an established convention already used one function below, not a new mechanism.

`recordGenerationStep` has only THREE direct call sites in `generateBriefVersion.ts` (`:272`,
`:573`, `:649`). The other SEVEN progress-writes that file makes — one per Slice 4-7 component
(Extraction & Clustering Engine, Demand Analyzer, Personal Pull Extractor, Landscape Researcher, Gap
Hypothesis Generator, Uncertainty Compiler, Recommendation Engine —
`generateBriefVersion.ts:333,372,384,393,411,431,452`) — go through `runStepWithProvenance`
(`src/services/provenanceRecorder.ts:328-390`), a wrapper that calls `recordGenerationStep`
internally itself, once on its success path (`:348-362`) and once on its catch path (`:370-386`).
`runStepWithProvenance`'s own input type therefore also gains a required `fenceToken: number` field,
threaded straight through to BOTH of its internal `recordGenerationStep` calls — the fencing design
is invisible to this wrapper otherwise, and every one of the seven component steps that use it would
silently never renew the heartbeat or honor the fence:

```typescript
function runStepWithProvenance<T>(input: {
  generationRunId: string;
  component: string;
  inputRefs: string[];
  fn: () => Promise<T>;
  getOutputRefs: (result: T) => string[];
  fenceToken: number;
}): Promise<T>;
```

Every real `recordGenerationStep`-bearing call site in `generateBriefVersion.ts` — all ELEVEN of
them: the three direct `recordGenerationStep` calls above, the fourth direct call §1.3 adds to the
`InvalidSupersedeTargetError` preflight catch, plus the seven `runStepWithProvenance` calls
(`:333,372,384,393,411,431,452`) — passes the `fenceToken` it captured from `createGenerationRun`'s
return value at run creation. This is a mechanical signature addition, not a change to any call
site's own decision logic. Because `recordGenerationStep`'s own guarded `UPDATE` (below) is what
actually renews `lease_heartbeat_at`, and all eleven real progress-write call sites now reach it with
a valid `fenceToken` — seven of them only by way of `runStepWithProvenance`'s two internal calls —
the heartbeat is genuinely renewed at every one of the pipeline's seven Slice 4-7 component steps,
not just the four structural-failure/preflight steps that call `recordGenerationStep` directly. This
call-site threading is necessary for `computeLivenessState` (§4.9) to avoid misclassifying a
normally-running, merely long, healthy pipeline as `'stale-or-interrupted'` — without it the
heartbeat would freeze at run start and every long pipeline would eventually read as stale — but it
is not sufficient by itself: threading only renews the heartbeat at step BOUNDARIES, so a single
unusually long step could still exceed a badly-chosen threshold. The actual guarantee against that
false positive (`01-REQUIREMENTS.md` ~line 386, and the Edge Case at ~line 857) comes from §4.9's
threshold-derivation methodology, which sets `STALE_THRESHOLD_MS` from real observed per-step and
per-run latency with margin. The two mechanisms are complementary: call-site threading supplies the
renewal events; §4.9's derived threshold supplies the margin that keeps a healthy long run inside
them.

Each performs its write as a single guarded statement:

```sql
-- recordGenerationStep: renews the heartbeat (and, SOL-HIGH-1 fix, the monotonic heartbeat_revision
-- CAS counter the abandon flow gates on) and inserts the step in one transaction, only if the
-- caller's token still matches.
UPDATE generation_run SET lease_heartbeat_at = now(), heartbeat_revision = heartbeat_revision + 1
 WHERE id = $1 AND fence_token = $2
RETURNING id;
-- rowCount === 0: this pipeline has been fenced out (§1.6 below). No GenerationStep is inserted;
-- the call returns silently (no-op, no throw) — the original process's writes become inert once
-- fenced, without needing to kill the process.
-- rowCount === 1: proceed to INSERT the GenerationStep as today.
```

```sql
-- finalizeGenerationRun: the existing atomic guard (outcome = 'in-progress') now also checks the
-- fence token in the same WHERE clause, so a fenced-out pipeline cannot finalize either.
UPDATE generation_run
 SET outcome = $2, completed_at = $3, brief_version_id = $4,
 model_identifiers = $5, tools_invoked = $6
 WHERE id = $1 AND outcome = 'in-progress' AND fence_token = $7
RETURNING investigation_id, started_at, runtime_identifier;
-- rowCount === 0: either another finalizer already won (outcome no longer 'in-progress'), or this
-- call was fenced out (fence_token no longer matches) — both are "I do not own this write anymore."
-- Throws GenerationRunAlreadyFinalizedError (extends Error, carries generationRunId) in either
-- case; callers do not need to distinguish which, since the disposition is identical (see below).
```

This replaces `finalizeGenerationRun`'s current unguarded `SELECT`-then-`UPDATE` (a real
check-then-act race in live code today) with one atomic statement. `completedAt` continues to be
computed by the function itself before the query and passed as a literal parameter, not `now()`,
so the caller-facing return value is real. The function must continue to accept the same optional
`client`/runner parameter it does today, so its one in-transaction caller
(`generateBriefVersion`'s Phase-4 success path) keeps running inside its own commit, not on a
separate connection.

This document names two distinct disposition mechanisms for a lost `finalizeGenerationRun` race,
used at different call sites below — **mechanism (a)**, the rethrow-without-refinalizing list edit,
and **mechanism (b)**, the graceful-no-op catch block:

- **Mechanism (b) — graceful no-op catch.** Seven of `generateBriefVersion`'s eight
  `finalizeGenerationRun` call sites treat `GenerationRunAlreadyFinalizedError` as a graceful, logged
  no-op (none of them is about to persist a `BriefVersion` or advance
  `ProblemBrief.currentVersionId` at the point they call it, so losing the race here is
  inconsequential).
- **Mechanism (a) — rethrow-without-refinalizing list edit.** The one exception is the Phase-4
  success call, immediately before `COMMIT`: if it loses the race, this call must not let `COMMIT`
  proceed (that would persist a `BriefVersion` whose own `GenerationRun` is recorded `'failed'`). It
  rolls back its own transaction and rethrows a distinct `GenerationRunLostFinalizationRaceError`,
  added to the file's existing `:681-684` inner catch's and `:700-707` outer catch's
  rethrow-without-refinalizing lists — the same lists the file's other fully-handled error classes
  are already on, extended by this one new error class rather than given a new catch block of its
  own.

**`GenerationRunFencedOutError`'s own disposition (SOL-HIGH-2).** This error is threaded through
this file's actual catch/finalization structure, given the same explicit treatment as the two
mechanisms above, not merely asserted in prose as "no error surfaces to the operator." Every one of
`assertFenceOwnership`'s call sites (evidence/claim writes, Landscape
Research's second evidence/claim path, the consumed-source ledger insert, `searchWeb`'s four writes,
and `attemptGenerationFailedTransition`'s now-fenced status write, all above) is reached from inside
`generateBriefVersion`'s own `try` blocks, so a thrown `GenerationRunFencedOutError` unwinds into
that file's existing catch structure exactly like any other typed error it already handles — it is
added to the SAME mechanism-(b) graceful-no-op disposition as `GenerationRunAlreadyFinalizedError`
above, at every one of these call sites: caught, logged, and treated as "this run has been
superseded, stop attempting further writes on its behalf" — never rethrown as an unhandled failure,
and never triggering a second `finalizeGenerationRun` call for this run (that call would itself now
fail `assertFenceOwnership`'s own guard, so attempting it would be redundant, not merely harmless).
Concretely: the pipeline's outer catch (`generateBriefVersion.ts`'s `:700-707` outer catch,
referenced above) gains `GenerationRunFencedOutError` alongside its existing handled classes, mapped
to the same silent-stop disposition — the pipeline function returns/exits without attempting
`attemptGenerationFailedTransition` a second time (which would itself no-op per the fix above) and
without rethrowing to whatever invoked `generateBriefVersion` (the fire-and-forget caller's own
safety net, `05-REVIEW.md`, already expects a terminal outcome to be read from the persisted row,
never inferred from this call's promise resolution). This is a required Forge-slice edit to the
file's real catch structure, not a description of already-shipped behavior.

**Abandon flow** (`abandonGenerationRun(investigationId, generationRunId)`, new route `POST
/api/investigations/:id/generation-runs/:runId/abandon`):

1. `getInvestigation` / read the `GenerationRun` row — not found, or does not belong to this
 Investigation → `404 AbandonGenerationRunNotFoundResponseBody` (§3.1c).
2. `outcome !== 'in-progress'` → `409 AbandonGenerationRunNotEligibleResponseBody` (§3.1c), with
 `currentOutcome` set to the run's real, just-read outcome and `livenessState: 'terminal'`.
3. Compute `{ livenessState, lastProgressAt }` from `lease_heartbeat_at`, read in the SAME query as
 step 2 — i.e. the single row read that classifies liveness also captures the exact
 `fence_token` and `heartbeat_revision` values this abandon request will gate on at step 4
 (`fenceTokenAtRead`, `heartbeatRevisionAtRead`). Uses the same `computeLivenessState` function
 §4.9 defines for display (that function itself still reads `lease_heartbeat_at`'s elapsed time for
 the display-facing staleness arithmetic — `heartbeat_revision` is an authorization token, not a
 replacement liveness signal; see below). If `'active'` → `409
 AbandonGenerationRunNotEligibleResponseBody`, `currentOutcome: 'in-progress'`,
 `livenessState: 'active'` — this is the guard that prevents abandoning a run that is merely
 slow.

 **SOL-HIGH-1 fix — a monotonic `heartbeat_revision` column replaces `lease_heartbeat_at` equality as
 the abandon CAS token.** Gating step 4's `UPDATE` on
 `lease_heartbeat_at = $3`, an exact `TIMESTAMPTZ` equality check, is not a reliable
 collision-free token, for the same reason this document already disqualifies
 `resolution_resolved_at`-only equality for `recheckSourceArtifact`'s CAS guard (§1.4a SOL-MEDIUM-2):
 Postgres's `TIMESTAMPTZ` can carry microsecond precision that a normal Node
 `Date`/node-postgres parameter round-trip does not preserve bit-for-bit, so a value this call
 reads back from the database and later binds as a query parameter can fail to compare equal to
 itself with NO concurrent writer at all — a false-negative that would make abandonment reject
 forever. The inverse failure is also real: two distinct heartbeat renewals landing in the same
 timestamp resolution would compare equal, a false-positive that would let this guard miss a
 genuine renewal. Both failure directions defeat the very race this mechanism exists to close.

 The fix: a new additive column, `generation_run.heartbeat_revision INTEGER NOT NULL DEFAULT 0`
 (same migration `009` as `fence_token`/`lease_heartbeat_at`, §1.6 schema below), incremented by
 exactly 1, in the SAME guarded `UPDATE` that renews `lease_heartbeat_at`, on every real
 `recordGenerationStep` call (i.e. every one of the file's eleven real progress-write call sites,
 the same set `lease_heartbeat_at` renewal already covers — no new call site, no new threading;
 `recordGenerationStep`'s existing guarded `UPDATE`, below, gains `heartbeat_revision =
 heartbeat_revision + 1` alongside its existing `lease_heartbeat_at = now()`). Integer equality has
 no precision-mismatch problem: Postgres serializes concurrent `UPDATE`s against the same row, so
 two values of `heartbeat_revision` read at different times can never spuriously compare equal
 unless no write happened between the reads, and a genuine renewal always changes the integer by
 exactly 1. `lease_heartbeat_at` itself is retained, unchanged, as the display-facing elapsed-time
 signal `computeLivenessState` (§4.9) reads — it is a liveness signal, not an authorization token,
 and this fix does not conflate the two; `heartbeat_revision` exists solely so the abandon flow has
 a collision-free integer to gate on, never presented to an operator and never read by
 `computeLivenessState`.

4. **Authorization — increment the fence token, atomically, gated on BOTH the fence token AND the
 exact `heartbeat_revision` value read at step 3.**

 **Lock-order fix: this step's transaction acquires
 `investigation FOR UPDATE` FIRST, before the fence-increment `UPDATE` below, matching Phase 4's
 own lock order exactly** (`generateBriefVersion.ts:552` locks `investigation FOR UPDATE` before
 later locking `generation_run` via `finalizeGenerationRun`, `:677`, on the same client). Opening
 this step's transaction with the fence-increment `UPDATE` below instead — locking
 `generation_run` first, and only locking `investigation` afterward at step 5's
 `transitionInvestigationStatus(..., client)` call — would take the same two row locks Phase 4 takes
 in the opposite order: a textbook Postgres deadlock (`40P01`) under real concurrent contention —
 exactly the abandon-vs-live-pipeline race this fencing design exists to make safe. The fix:
 ```sql
 -- First statement of this transaction, unconditionally, before the fence-increment UPDATE below —
 -- matches Phase 4's investigation-before-generation_run lock order.
 SELECT id FROM investigation WHERE id = $1 FOR UPDATE;
 ```
 THEN, on the same client, in the same transaction:
 ```sql
 UPDATE generation_run SET fence_token = fence_token + 1
 WHERE id = $1 AND outcome = 'in-progress' AND fence_token = $2 AND heartbeat_revision = $3
 RETURNING fence_token;
 ```
 (`$2` = `fenceTokenAtRead`, `$3` = `heartbeatRevisionAtRead`, both captured at step 3.)
 `rowCount === 0` means the row changed since step 3's read — either the fence token moved (a
 concurrent abandon, or the pipeline's own legitimate finalization) OR the heartbeat revision moved
 (a legitimate `recordGenerationStep` call renewed it between the classification read and this
 UPDATE, meaning the run resumed after being classified stale). Both causes are handled
 identically: this is never distinguished by cause, only by effect — re-read the run's real current
 `outcome`/`livenessState` and report `409 AbandonGenerationRunNotEligibleResponseBody` (never the
 values read at step 2/3, which are now stale). A heartbeat-revision mismatch here is exactly the
 race this fix closes: without the `heartbeat_revision` guard, a legitimate renewal between steps 3
 and 4 would not be caught by the `fence_token`-only check, and abandonment would fence out a run
 that had just resumed — this is what makes `rowCount === 1` a real "still classified stale at the
 instant of authorization" guarantee rather than a stale read carried forward, one that cannot
 false-positive or false-negative on ordinary Postgres/Node round-tripping (unlike a
 timestamp-equality check). `rowCount === 1` is the moment abandonment takes effect: the
 original pipeline's captured token is now stale, so every subsequent `recordGenerationStep`/
 `finalizeGenerationRun` call it makes will fail its own guarded `UPDATE` (above) and no-op or be
 rejected — its writes become inert without the process needing to be killed.
5. **SOL-HIGH-2 — steps 5-7 below execute inside the SAME transaction opened by step 4's
 fence-increment `UPDATE`, committing together, not as separate calls after that `UPDATE`
 commits.** Finalizing the run (step 5) and transitioning Investigation status (step
 6) as two calls with an open commit boundary between them would let a replacement run start in that
 gap (once step 5's `finalizeGenerationRun` clears §1.1's concurrency guard by moving `outcome` off
 `'in-progress'`) and even complete before step 6's `transitionInvestigationStatus` call executes,
 which would then incorrectly mark a currently-healthy, `'brief-generated'` Investigation
 `'generation-failed'`. Making steps 4-6 one transaction closes this: the concurrency guard is not
 actually cleared for any other writer to observe until this transaction commits, so a replacement
 run cannot be created, and cannot finish, in a window that no longer exists. Within this one
 transaction, using the client already holding step 4's row lock:
 - With the new token, call `recordGenerationStep({ generationRunId, step: { component: 'Operator
 abandonment', outcome: 'failed', error: <states no progress was recorded since `lastProgressAt`>,
 ... }, fenceToken: <new token>, client })` to write one honest `GenerationStep`, then
 `finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null, fenceToken:
 <new token>, client })`. Both calls pass the newly-incremented token, not the token read at step
 3 — the token this abandon call itself just wrote is the only one still valid against this row.
 - If not a correction (`investigation.problemBriefId === null` at read time — the same
 discriminant `generateBriefVersion` itself uses for this decision, provably equal for every run
 this system creates), attempt `transitionInvestigationStatus(investigationId,
 'generation-failed', ..., client)`, checking its returned boolean; a benign no-op is not an
 error. If it is a correction, skip this call — the Investigation stays `'brief-generated'`,
 eligible again only through §4.8.
 - Commit.
6. Respond `200 AbandonGenerationRunResponseBody` (`{ generationRunId, outcome: 'failed' }`, §3.1c).
 This describes the run's terminal state only; the next `GET.../workspace` poll is the source of
 truth for `investigation.status`.

Abandonment does not itself start a new run — it clears the concurrency guard (§1.1), atomically and
only at the moment its own transaction commits (SOL-HIGH-2 correction above), and, for a non-correction
run, transitions the Investigation to `'generation-failed'` in that same commit; the operator
explicitly triggers retry via `GenerateButton`/`POST.../generation-runs`.

`GenerationProgressPanel` (the only component that mounts "Abandon and retry") renders exclusively
when `workspace.briefs.length === 0` (no `BriefVersion` exists yet) or the displayed
`BriefVersion.isCurrent === true` (§5.4 rule 1) — an operator viewing a prior version sees
`ViewingPriorVersionPanel`'s read-only notice and a link to the current version's workspace
instead; a prior version can only be viewed when `workspace.briefs.length > 0`, so this condition
never exposes "Abandon and retry" to a prior-version view.

**Tests:**
1. Abandon rejected `409` when `livenessState === 'active'`.
2. Abandon rejected `409` when `outcome !== 'in-progress'`.
3. Abandon on a genuinely stale non-correction run: writes exactly one `GenerationStep`, finalizes
 `'failed'`, transitions the Investigation to `'generation-failed'`, and a subsequent `POST
.../generation-runs` succeeds.
4. Abandon on a genuinely stale correction run: same, but Investigation status is unchanged.
5. Two near-simultaneous `finalizeGenerationRun` calls for the same `generationRunId` with different
 outcomes: exactly one resolves, the other rejects `GenerationRunAlreadyFinalizedError`.
6. A `recordGenerationStep`/`finalizeGenerationRun` call made with a stale `fenceToken` (simulating
 a pipeline that continues running after being abandoned) is a silent no-op / rejected write —
 asserts the resulting `GenerationStep`/`GenerationRun` rows reflect only the abandonment's own
 write, never the stale caller's.
7. Abandon attempted on a run that, at the moment step 4's guarded `UPDATE` fires, has already
 reached its real terminal outcome via the legitimate pipeline: asserts `409` with the run's real
 outcome, and asserts no `GenerationStep` with `component: 'Operator abandonment'` exists for that
 run.
8. Heartbeat-versus-abandonment race: seed a run classified `'stale-or-interrupted'` at step 3,
 then — between that classification read and step 4's guarded `UPDATE` — commit a real
 `recordGenerationStep` call that renews `lease_heartbeat_at`/increments `heartbeat_revision` for
 the same `generationRunId` (simulating a run that resumes after being read as stale but before
 abandonment is authorized). Asserts the abandon request is rejected `409
 AbandonGenerationRunNotEligibleResponseBody` and that no `GenerationStep` with `component:
 'Operator abandonment'` is ever written for that run — the fence-token-only guard alone would
 miss this case; this test specifically exercises the `heartbeat_revision` clause added to step 4's
 `UPDATE`. **New, required (SOL-HIGH-1 fix regression)**: a forced same-timestamp/precision test proving
 the chosen mechanism does not false-positive or false-negative under realistic Postgres/Node
 `TIMESTAMPTZ` round-tripping — seed a run, read its row twice in immediate succession with no
 write between the reads, and assert the two reads' `heartbeat_revision` values compare equal
 (ordinary no-write case, proving no false-negative); separately, perform two real, distinct
 `recordGenerationStep` renewals in immediate succession (fast enough that a naive
 millisecond-resolution timestamp comparison could plausibly collide) and assert
 `heartbeat_revision` strictly increased by exactly 2, never comparing falsely equal to its
 pre-renewal value (proving no false-positive) — both assertions against a real Postgres
 connection, not a mocked clock.
9. Fenced-out `extractClaimsAndEvidence`/`extractClaimsAndEvidenceForSourceArtifacts` writes never
 persist: seed an in-progress run, abandon it (incrementing its `fence_token`), then call
 `extractClaimsAndEvidence`/`extractClaimsAndEvidenceForSourceArtifacts` directly with the run's
 original (now-stale) `fenceToken`; assert the call throws/no-ops per `assertFenceOwnership`'s
 contract and that no `evidence_item`/`claim`/`claim_version` row exists for this run afterward.
10. Fenced-out `searchWeb` writes never persist: same abandon-then-call pattern against `searchWeb`
 with the run's stale `fenceToken`; assert none of `web_search_query`/`query_limitation`/
 `source_artifact`/`web_search_result` gains a row for this run.
11. Fenced-out `generation_run_consumed_source` ledger insert never persists: same pattern against
 the ledger-insert call site; assert no ledger row exists for this run afterward.
12. Retry-consumption race, end to end: seed a run, abandon it, then — using the run's stale
 `fenceToken` — attempt each of the three write paths above (evidence/claims, `searchWeb`, ledger
 insert); then run a real retry generation for the same Investigation and assert its resulting
 `BriefVersion` incorporates none of the stray writes (none of the fenced-out run's evidence,
 claims, sources, or ledger rows are read or reflected) — the exact race SOL-HIGH-2 identified, proven
 closed rather than merely argued closed.
13. **New, required (SOL-HIGH-2 fix regression) — fenced-out `attemptGenerationFailedTransition` never
 publishes stale status, in EITHER read model.** Seed an in-progress run, abandon it (incrementing
 its `fence_token`), then invoke `attemptGenerationFailedTransition` directly with the run's
 original (now-stale) `fenceToken` and `generationRunId`; assert it throws/no-ops per
 `assertFenceOwnership`'s contract, that `investigation.status` is unchanged by this call, and —
 separately — start and let succeed a real replacement `GenerationRun` for the same Investigation
 (reaching `'brief-generated'`) before the stale call is attempted. Assert BOTH: (a)
 `getInvestigationWorkspace`'s own read never reports `'generation-failed'` for this Investigation
 at any point after the replacement run's success, and (b) `getProblemDepartmentOverview`'s
 `investigations[]` row for this Investigation independently reports the real, current
 `'brief-generated'` status, never `'generation-failed'` — a stale run must never appear as
 `generation-failed` in either read model, proven against both, not asserted for one and inferred
 for the other.
14. **New, required (SOL-HIGH-2 fix regression) — abandon-flow atomicity closes the replacement-run
 interleaving gap.** Seed a genuinely stale, non-correction, in-progress run; drive
 `abandonGenerationRun` up to (but not past) the commit of its steps 4-6 transaction (via a test
 hook/transaction-boundary instrumentation, not a real network race), and from a second, concurrent
 connection attempt to create a new `GenerationRun` for the same Investigation. Assert the second
 attempt cannot succeed until the abandon transaction commits (§1.1's concurrency guard is not
 observable as cleared mid-transaction), and that once the abandon transaction does commit, the
 Investigation's status transition to `'generation-failed'` and the run's finalization to `'failed'`
 are both visible atomically — there is no read, at any isolation point, that observes one without
 the other, and no interleaved replacement run can be created and completed inside that gap.
15. **Required — the corrected lock order does not
 deadlock under real concurrent contention.** Using two real, separate database connections (not
 mocks, not hooks): from connection A, `BEGIN` and lock `investigation FOR UPDATE` for a seeded
 Investigation/GenerationRun pair, then — while still holding that lock, before committing — from
 connection B, drive the abandon flow's transaction against the same pair up to and including its
 own `investigation FOR UPDATE` acquisition (which blocks on connection A's lock, as expected,
 rather than deadlocking); then have connection A proceed to acquire `generation_run FOR UPDATE`
 (matching Phase 4's own within-transaction order) and commit; assert connection B's transaction
 then proceeds and commits with no `40P01` (`deadlock_detected`) error at any point. Run the
 mirror case — connection A holding `investigation` while `attemptGenerationFailedTransition`
 (SOL-HIGH-2 wrapper) is driven from connection B — with the same assertion. Both directions
 acquire `investigation` before `generation_run`, so no ordering inversion exists for Postgres to
 deadlock on; this test proves that against a real database rather than arguing it from the text
 above.

---

## 2. Components

| Component | Responsibility | Location | Satisfies |
|---|---|---|---|
| **Generation Run Connector** | `POST /api/investigations/:id/generation-runs` — validates Investigation eligibility, prevents concurrent runs via §1.1's DB constraint, determines initial-vs-correction server-side, supplies a real runtime identifier, kicks off `generateBriefVersion` in-process and responds `202` the instant its `GenerationRun` row exists rather than awaiting full completion, maps its typed outcomes to distinct terminal states observable via the Workspace Read Model | `src/web/apiRoutes.ts` (new route) | US-3, US-6, US-8 |
| **Add-Source Connector** | Existing `POST /api/investigations` route, extended in place (not duplicated) — adds source(s) to an existing Investigation via the real `submitSources` (unmodified) and `resolveInvestigationSources` (modified — skips already-resolved sources, §1.4 C1) services, branches on pre-mutation status to skip `transitionInvestigationStatus` entirely for a `'brief-generated'` Investigation (never transitions it back to `'open'`), and returns real, read-back-after-write status as JSON (§1.4, §3.1b, §4.1) | `src/web/apiRoutes.ts` (existing route, edited) | US-2, US-5, US-8, US-13 |
| **Single-Source Re-check** (§1.4a, new; added to this table) | `POST /api/source-artifacts/:id/recheck` — calls the newly-exported, non-persisting `computeSourceResolution` (§1.4a, extracted from `resolveSourceArtifact`) against exactly one `source_artifact` row, persists its own result via a single compare-and-set `UPDATE`, and conditionally re-derives Investigation status (`'blocked'` → `'open'` only, §1.4a's re-check status-branch rule) — structurally separate from the bulk Add-Source Connector so it can never fire as a side effect of an unrelated add-source request | `src/web/apiRoutes.ts` (new route), `src/services/recheckSourceArtifact.ts` (new), `src/services/resolveSourceArtifact.ts` (edited — §1.4a compute/persist split, §1.4b blank-text fix) | US-2, US-5 AC4 |
| **Workspace Read Model** | `GET /api/investigations/:id/workspace` — assembles investigation identity, sources, latest `GenerationRun`/`GenerationStep`s, and (once available) Brief + decision summary from persisted rows only; structurally incapable of expressing an unpersisted claim (§3.2) | `src/services/getInvestigationWorkspace.ts` (new) | US-1, US-4, US-5, US-6 |
| **Brief Review Read Service** | `getBriefForReview(briefVersionId)` — takes an already-resolved `briefVersionId` directly; investigation/version resolution is the CALLING route's job (§3.1a's versioned route, §4.1) — this service loads fully-resolved Brief content for the given `briefVersionId` from existing persisted tables; same read chain and return shape `problem-department-mvp/02-ARCHITECTURE.md` §4 already specifies (unimplemented until now) | `src/services/getBriefForReview.ts` (new) | US-9 |
| **Decision Recorder** | `recordDecision(input)` — persists an append-only `Decision`, enforces the Watch ≥1-condition rule server-side, never mutates or reassigns `briefVersionId` | `src/services/recordDecision.ts` (new) | US-10 |
| **Decision History Read Helper** | `getDecisionsForBriefVersion(briefVersionId)` — chronological (`decidedAt` ASC) `Decision[]` for one version, used by both `getBriefForReview.priorDecisions` and the workspace's decision-history panel | `src/services/getDecisionsForBriefVersion.ts` (new) | US-10 |
| **SSRF-Guarded Fetch (fixed)** | Existing shared module; `safeLookup`'s DNS-branch callback contract corrected to satisfy Node 22's `{ all: true }` custom-lookup shape | `src/services/ssrfGuardedFetch.ts` (fix, not new) | US-7 |
| **Investigation Workspace Screen** | React route `/departments/problem-department/investigations/:investigationId` — single durable URL covering open/blocked/generation-failed/brief-generated states; polls the Workspace Read Model while a run is in-progress; hosts the Brief review panel and Decision form once available | `src/client/screens/InvestigationWorkspaceScreen.tsx` (new) | US-1 through US-6, US-9, US-10 |
| **Start Investigation Form (updated)** | Existing component; its `onSubmitted` prop/contract is UNCHANGED — only the parent's call-site handler changes, to navigate into the workspace route instead of triggering a same-page re-fetch | `src/client/screens/ProblemDepartmentScreen.tsx` (edit — call-site handler only) | US-2 |
| **Validity/Invalidation Service** | `assignValidityState`/`getAssignedState`/`getAssignedStateAsRecorded` (§4.7) — append-only `StatusEvent` writer and the two bitemporal read queries; no browser-reachable route this checkpoint (Out of Scope) | `src/services/validityState.ts` (new) | US-12 |
| **Dependent-Decision Reconstruction** | Computed inside `assignValidityState` (§4.7) — every `Decision` bound to a `BriefVersion` that referenced the invalidated target while its assigned state was last `'valid'`, reconstructed via `getAssignedStateAsRecorded` | `src/services/validityState.ts` (same module, not a separate file) | US-12 |
| **Decision History / Validity Read Model** | Extends `getInvestigationWorkspace` and `getBriefForReview` (§3.2, §3.3) with `assignedState`/`isSuperseded` per `BriefVersion`, sourced from `getAssignedState` — feeds `DecisionHistoryBanner` (§5.3) | `src/services/getInvestigationWorkspace.ts`, `src/services/getBriefForReview.ts` (both edited, not new files) | US-12 |
| **Resubmission Eligibility Check** | `hasEligibleNewEvidenceSinceCurrentBriefVersion(investigationId)` (§4.8, revised) — the single server-side gate that makes a `'brief-generated'` Investigation generation-eligible again, evaluated against `source_artifact.resolution_status` and the evidence actually consumed by the current `BriefVersion`, never by status or timestamp alone | `src/services/getInvestigationWorkspace.ts` (helper used by both the Generation Eligibility Rule and `InvestigationWorkspaceView.generationEligible`) | US-13 |
| **Prior-Version Navigation Resolver** | Resolves a human-readable `versionNumber` (never a raw `BriefVersion` UUID) to its `BriefVersion` row for a given Investigation, reload-stably | `src/web/apiRoutes.ts` (route), `src/services/getBriefForReview.ts` (unchanged callee) | US-1 AC5, US-12, US-13 |
| **Stale/Interrupted Run Detector** | Computes a run's `livenessState` at read time from persisted facts only — never a stored field | `src/services/getInvestigationWorkspace.ts` (helper) | US-4, US-6 |
| **Stale Run Abandonment** | `abandonGenerationRun(investigationId, generationRunId)` (§1.6, new) — the human-initiated recovery path for a run `computeLivenessState` classifies `'stale-or-interrupted'`; finalizes it `'failed'` via the existing exactly-once `finalizeGenerationRun`, clearing §1.1's concurrency guard so retry becomes possible; never invoked automatically | `src/web/apiRoutes.ts` (new route), small orchestration function beside the Generation Run Connector | US-4, US-6, US-8 |
| **Decision Lineage / Condition Resolver** | Extends `getDecisionsForBriefVersion` to join `reconsideration_condition` and return resolved condition content (never a bare ID), and to carry each `Decision`'s owning `BriefVersion`'s human-readable version reference for the whole-Investigation lineage view, distinct from the per-version list | `src/services/getDecisionsForBriefVersion.ts` (edited) | US-10, US-12 |
| **`ViewingPriorVersionPanel`** (new, C2; precedence corrected round-6; scope corrected Danny's ruling, this checkpoint) | Outcome/Status Panel variant rendered whenever the displayed `BriefVersion.isCurrent === false` (§5.4 rule 2, evaluated immediately after rule 1 — since rule 2 can only ever match when `briefs.length > 0` (there is no prior version to view when no `BriefVersion` exists), and within that case rule 1 requires `isCurrent === true` while this rule requires `isCurrent === false`, the two rules' conditions are mutually exclusive, so rule 2 wins over every later, run-outcome-selected/mutating rule (3, 4) regardless of `investigation.status` or `latestGenerationRun?.outcome`, including `'failed'` AND `'in-progress'`) — the version reached via the forward link is not necessarily the current version in a lineage of 3+; reaching the current version means following this same link again from the successor, one hop at a time, which no AC requires to be a single direct jump; **when `workspace.latestGenerationRun?.outcome === 'in-progress'` (against the current version, whether `livenessState` is `'active'` or `'stale-or-interrupted'`), also renders a distinct, clearly labeled read-only notice — "A generation run is currently active/stalled on the current version — go to the current workspace to view or manage it" — with a real navigable link to the current version's workspace route**; imports neither `AddSourceInline` nor `GenerateButton` nor the abandon control, making "no run-mutating control while viewing a prior version" structural, not a suppressed-conditional inside `BriefGeneratedSummaryPanel` or `GenerationProgressPanel` | `src/client/components/OutcomeStatusPanel/ViewingPriorVersionPanel.tsx` (new) | US-1 AC5, US-12, US-13 |
| **`GenerationFailedPanel`** (§5.4 rule 3; component enumeration added) | Outcome/Status Panel variant rendered when `latestGenerationRun?.outcome === 'failed'` and the displayed `BriefVersion` is current (§5.4 rule 3) — renders `investigation.statusReason` when present, or otherwise the failed run's own persisted step/error text (the failed-correction case, where `statusReason` was never written); hosts the shared `GenerateButton` ("Retry generation") and a real `AddSourceInline` instance | `src/client/components/OutcomeStatusPanel/GenerationFailedPanel.tsx` (new) | US-3, US-6, US-13 |
| **`BriefGeneratedSummaryPanel`** (§5.4 rule 4; component enumeration added) | Outcome/Status Panel variant rendered when `investigation.status === 'brief-generated'`, no run is in-progress or failed, and the displayed `BriefVersion` is current (§5.4 rule 4) — compact generation confirmation, an `AddSourceInline` instance, and the evidence-gated "Regenerate with new evidence" `GenerateButton`, disabled with an honest reason when `workspace.newEvidenceSinceCurrentBriefVersion === false` | `src/client/components/OutcomeStatusPanel/BriefGeneratedSummaryPanel.tsx` (new) | US-13 |

No component list entry is added for "job queue" or "worker" — direct in-process execution only
(Out of Scope, `01-REQUIREMENTS.md`). No component list entry is added for a "mark invalid" route
or control — `assignValidityState` (above) has no browser-reachable trigger this checkpoint (Out of
Scope, US-12). No component list entry is added for a generic "Generate correction" button —
US-13's trigger is evidence-submission-gated only (Out of Scope).

---

## 3. Data Schemas

All types below extend `src/types/domain.ts` (existing types referenced, not restated in full) and
`src/types/readModels.ts` (existing pattern: `MissionControlView`/`ProblemDepartmentOverview`
already live there as plain read-model interfaces alongside the domain types).

### 3.1 `POST.../generation-runs` request/response (Generation Run Connector, Finding 11b: corrected heading — this route is POST, not GET)

```typescript
// src/web/apiRoutes.ts — request body
interface CreateGenerationRunRequestBody {
 // Empty on the wire today — no client-supplied flag determines initial-vs-correction (US-3 AC3);
 // this interface exists so the contract is explicit and additive if a future field is needed.
}

// 202 on success — sent the instant the concurrency-guarding GenerationRun row
// exists, NOT after generateBriefVersion finishes (§4.2). The client never learns
// briefVersionId/versionNumber from this response; it learns them from the next
// GET.../workspace poll's latestGenerationRun/briefs once the run reaches a terminal outcome
// (§3.2) — no fact is claimed here before it is real (US-4).
interface CreateGenerationRunResponseBody {
 generationRunId: string;
}

// 409 — a GenerationRun is already in-progress for this Investigation (§1.1)
interface GenerationRunConflictResponseBody {
 error: 'generation-already-in-progress';
 existingGenerationRunId: string;
 stillInProgress: boolean; // false when the conflicting run has already reached a
 // terminal outcome between the INSERT rejection and the
 // connector's conflict lookup (a real race, §4.2 step 5a) — true
 // for the ordinary still-in-progress case. The client never
 // assumes true.
}

// 422 — Investigation exists but is not in an eligible status (e.g. 'blocked')
interface GenerationRunIneligibleResponseBody {
 error: 'investigation-not-eligible';
 currentStatus: InvestigationStatus;
 reason: string;
}

// 404 — Investigation does not exist
interface GenerationRunNotFoundResponseBody {
 error: 'investigation-not-found';
}

// NOTE: a synchronous 422 response body carrying
// generateBriefVersion's own typed failure outcomes (BriefGenerationFailedError /
// InvalidSupersedeTargetError / StaleCorrectionConflictError) does NOT exist for this route and
// is deliberately not defined here. The route always returns 202 the instant the GenerationRun
// row is durably created (above) — it never awaits pipeline completion, so it can never
// synchronously observe one of these three outcomes. They are surfaced exclusively via the next
// GET.../workspace poll's latestGenerationRun.outcome === 'failed' plus that run's real recorded
// GenerationStep.error text (§4.2 step 7) — the same honest-progress mechanism as every other
// terminal outcome. No GenerationRunFailedResponseBody type exists here — such a type would
// contradict the non-blocking design (US-3, §4.2).
```

### 3.1a `GET.../brief-versions/by-version/:versionNumber` and `POST.../decisions` request/response

Full contract for the two routes named in prose in §5.2. The GET route
is addressed by a human-readable `versionNumber` (a positive integer, "Version 2 of 3"), never a
raw `BriefVersion` UUID — this is what makes US-1 AC5's prior-version navigation, and US-12's
supersession banner link, both reload-stable and demonstrable in the browser per the Anti-Patterns
"no UUIDs as navigable content" rule.

```typescript
// GET /api/investigations/:investigationId/brief-versions/by-version/:versionNumber
// No request body (GET). Path params only. versionNumber is parsed as a positive integer; a
// non-numeric or non-positive value is a 400 before any DB lookup.

// 200 — success
// Response body IS GetBriefForReviewResult verbatim (§3.3's pointer) — no wrapper object. The
// result's own `version` field carries this BriefVersion's versionNumber back to the client, so
// the screen can render "Version 2 of 3" without a second round trip.

// 400 — versionNumber is not a positive integer
interface BriefVersionRouteInvalidVersionResponseBody {
 error: 'invalid-version-number';
}

// 404 — the Investigation itself does not exist
interface BriefVersionRouteInvestigationNotFoundResponseBody {
 error: 'investigation-not-found';
}

// 404 — the Investigation exists (and may or may not have a ProblemBrief at all), but no
// BriefVersion with this versionNumber exists under this Investigation's ProblemBrief lineage —
// resolved via getInvestigation(investigationId).problemBriefId, then
// SELECT id FROM brief_version WHERE problem_brief_id = $1 AND version_number = $2, reusing the
// same lookup getInvestigationWorkspace already performs (§4.4 step 1/3), not a second
// independent existence check invented for this route. The resolved BriefVersion's own raw id is
// used only as an internal service-call parameter to getBriefForReview below — it is never placed
// in a URL or rendered as the navigable reference (Anti-Patterns).
interface BriefVersionRouteVersionNotFoundResponseBody {
 error: 'brief-version-not-found';
}

// POST /api/brief-versions/:briefVersionId/decisions
// briefVersionId here is the internal id the client obtained from the GET response above
// (GetBriefForReviewResult.version.id) — an API parameter, not a user-facing navigable reference,
// so this does not conflict with the Anti-Patterns "no raw UUIDs as primary content" rule (that
// rule governs what a human reads/navigates by, not internal service-call plumbing).
// Deliberately NOT nested under /investigations/:id — a Decision is scoped to one BriefVersion,
// matching submitDecision's client signature (§5.2: submitDecision(briefVersionId, body)), which
// carries no investigationId parameter.

interface SubmitDecisionRequestBody {
 decision: RecommendationDecision; // 'Approve' | 'Reject' | 'Watch'
 rationale?: string;
 reconsiderationConditions?: Array<{
 type: ReconsiderationConditionType;
 otherTypeLabel?: string;
 description: string;
 }>; // same shape as recordDecision's own
 // input (§4.3) — not redefined, reused
}

// 201 — success. Response body IS the persisted Decision (§3.4) verbatim, including its
// server-generated id and decidedAt — no wrapper object, no ReconsiderationCondition sub-objects
// beyond what Decision.reconsiderationConditionIds already carries.

// 400 — malformed body: decision field missing or not one of the three literal values; a supplied
// reconsiderationConditions[i].type not one of ReconsiderationConditionType's values; or
// type === 'other' with otherTypeLabel missing/blank — a request-shape defect, checked before any
// service call
interface SubmitDecisionInvalidRequestResponseBody {
 error: 'invalid-request';
 message: string;
}

// 404 — briefVersionId does not resolve to an existing BriefVersion row
interface SubmitDecisionVersionNotFoundResponseBody {
 error: 'brief-version-not-found';
}

// 422 — decision === 'Watch' and zero valid (non-whitespace-only) conditions were supplied —
// maps 1:1 from recordDecision's WatchRequiresConditionError (§4.3)
interface SubmitDecisionWatchRequiresConditionResponseBody {
 error: 'watch-requires-condition';
 message: string;
}
```

No residual is left undetermined for either route — both are fully pinned: exact path, method,
request shape, every distinct response shape, and every status code.

### 3.1b `POST /api/investigations` extended request/response (Add-Source Connector, §1.4, per the Add-Source-route ruling)

**This is the existing, live route (`src/web/apiRoutes.ts:41-74`), edited in place — not a new
route.** Its request/response shapes already exist in `src/client/api.ts` today
(`CreateInvestigationRequestBody`/`CreateInvestigationResponseBody`); this section pins the extended
handler behavior and the one additive response field, rather than defining a second endpoint.

```typescript
// POST /api/investigations — unchanged wire shape (src/client/api.ts, existing)
interface CreateInvestigationRequestBody {
 artifacts: Array<{ type: string; raw: string }>;
 investigationId?: string; // present -> add to an existing Investigation (this
 // section); absent -> create a new one (unchanged)
}

// 201 — success. investigationId + status are populated from a fresh getInvestigation read taken
// AFTER submitSources + resolveInvestigationSources + (conditionally) transitionInvestigationStatus
// have all completed — never the value the handler intended or attempted to write (§1.4).
// sourcesAdded is additive (new field; existing callers that ignore it are unaffected).
interface CreateInvestigationResponseBody {
 investigationId: string;
 status: InvestigationStatus;
 sourcesAdded: number; // NEW field — count of artifacts accepted this request
}

// 400 — empty artifacts array supplied (existing behavior, unchanged
// integrator trace, minor item: live `apiRoutes.ts:45` checks `!Array.isArray(body.artifacts) ||
// body.artifacts.length === 0`, an array-emptiness check, not a blank-string check; an array
// containing only blank/whitespace `raw` strings passes this check today and is not rejected here.
// This document does not add or change blank-filtering behavior at this route this checkpoint.)
interface CreateInvestigationInvalidRequestResponseBody {
 error: 'at-least-one-artifact-required';
}

// 404 — investigationId supplied but does not exist (NEW response — the unmodified handler had no
// existing-investigation lookup to fail; getInvestigation's not-found error is now caught here)
interface CreateInvestigationNotFoundResponseBody {
 error: 'investigation-not-found';
}

// 409 — NEW response, narrowed by the benign-no-op-vs-genuine-conflict ruling. Only reachable when investigationId is
// supplied, its current status is NOT 'brief-generated', transitionInvestigationStatus.ts's own
// ALLOWED_PRIOR_STATUSES guard declined the attempted transition, AND the Investigation's real
// current status (re-read after the decline) has DIVERGED from the status observed in step 2
// (before this request attempted anything) — i.e. a genuine concurrent conflict, not the row
// sitting where this request itself found it. A guard decline whose re-read status matches step
// 2's is a benign no-op (sources already persisted, nothing needed to change) and responds 201
// via step 7, not 409 — see step 6. Reports the real, read-back current status — never the target
// the handler attempted.
interface CreateInvestigationTransitionConflictResponseBody {
 error: 'invalid-status-transition';
 investigationId: string;
 status: InvestigationStatus; // the REAL current status, read back after the decline
 message: string;
}
```

**Handler branch (extends the existing `apiRoutes.post('/api/investigations',...)` body; every
step below after the artifacts-presence check is either identical to today's live code or an
explicit addition — neither `submitSources` nor `transitionInvestigationStatus` is modified;
`resolveInvestigationSources` IS modified, §1.4's C1 fix, a no-op for this route's create-path call
and the change of substance for its existing-Investigation call):**

1. `artifacts` empty/non-array → `400` (unchanged).
2. If `investigationId` is present, read its current status via `getInvestigation(investigationId)`
 BEFORE any mutation. Not found → `404` (NEW — the unmodified handler had no such check; it relied
 on `submitSources` to fail some other way). If `investigationId` is absent, there is no prior
 status to branch on — proceed as today (unchanged create path).
3. `submitSources({ investigationId, origin: 'human', artifacts })`, then
 `resolveInvestigationSources(submission.investigationId)` — its call site is identical to
 today; the function itself now skips already-resolved artifacts (§1.4's C1 fix), which is a
 no-op for this create-flow call site (every row is freshly `'unresolved'` here).
4. **Branch on the status read in step 2** (this step does not run at all for a brand-new
 Investigation — proceed straight to step 5's unconditional transition. "Exactly as today"
 below describes only the fact that `transitionInvestigationStatus` is still called
 unconditionally with the same target-selection logic as today's live code — it does NOT mean
 the response is also constructed as today's code does; step 7's real-status read-back applies to
 the create path exactly as it does to every other path, per step 5's own text):
 - Status was `'brief-generated'`: **do not call `transitionInvestigationStatus` at all.** Skip
 directly to step 6. This is the one behavior change §1.4 requires — it must be an explicit
 skip, not a reliance on the transition guard to silently decline an unconditional call, because
 Forge building the unconditional version first (the naive extension) and only later noticing the
 guard happens to save it is exactly the failure mode the Add-Source-route ruling flagged.
 - Status was anything else (`'open'`, `'blocked'`, `'generation-failed'`): call
 `transitionInvestigationStatus(submission.investigationId, allUnreachable ? 'blocked': 'open',
 allUnreachable ? 'No submitted source was reachable.': null)` — identical call to today's live
 code — but this time **check its returned `boolean`.**
5. (New-Investigation path only, `investigationId` absent at step 2): call
 `transitionInvestigationStatus` unconditionally exactly as today's live code does, and check its
 returned `boolean`. **This path has its own rule, distinct from step 6 below (correction,
 2026-08-24 whole-package convergence — the create path's guard-decline branch was previously
 undefined; this closes it):** a `false` return on the create path is ALWAYS benign, never a
 conflict, and is never compared against "the status observed in step 2" — because on the create
 path there is no step 2 (no `investigationId` existed before this request; step 2 explicitly
 does not run, per step 2's own text above). The only two reachable target/current pairs on this
 path are: `allUnreachable === false`, target `'open'`, and `submitSources` (step 3, unmodified,
 `submitSources.ts:28`) already initialized the brand-new row's status to `'open'` in this SAME
 request — so the guarded `UPDATE` correctly finds nothing to change (`ALLOWED_PRIOR_STATUSES.open
 = ['blocked']` declines `'open'` → `'open'`) and `false` here means exactly "already at the
 correct status," not a conflict; or `allUnreachable === true`, target `'blocked'`, current
 `'open'` — always permitted (`ALLOWED_PRIOR_STATUSES.blocked = ['open']`), so this arm always
 returns `true` and never reaches this branch. No other party can have touched this Investigation
 between its creation earlier in this same request and this transition attempt — its id is
 generated inside this request and has not yet been returned to any client, so there is no window
 for a genuine external conflict to occur on the create path, unlike the existing-Investigation
 path step 6 governs. Proceed straight to step 7 in both cases, using the freshly-read status —
 never respond `409` on the create path.
6. If step 4's `transitionInvestigationStatus` call (existing-Investigation path only) returned
 `false` (the guard declined it — `ALLOWED_PRIOR_STATUSES` did not permit the target from whatever
 the row's real current status was), do **not** assume this is an error. Re-read the
 Investigation's real current status via `getInvestigation` and compare it to the status observed
 in step 2 (before this request attempted anything):
 - **Unchanged** (freshly-read status equals step 2's status) — **per the benign-no-op-vs-genuine-conflict ruling**: this is a
 benign no-op, not a conflict. The sources submitted in step 3 were already persisted
 successfully; the guard simply declined because there was nothing to transition (the row was
 already sitting where the attempted target would have put it, or in a status this target can
 never move it from — e.g. `'open'`→`'open'`, `'blocked'`→`'blocked'`, or either
 `'generation-failed'` sub-case, per the real `ALLOWED_PRIOR_STATUSES` map). Do **not** respond
 `409`. Proceed to step 7 exactly as the `true` branch does, using this freshly-read (unchanged)
 status.
 - **Diverged** (freshly-read status differs from step 2's status) — a genuine conflict: something
 else moved the row between step 2's read and this transition attempt, to a state neither branch
 anticipated. Respond `409` with `CreateInvestigationTransitionConflictResponseBody`, reporting
 that freshly-read real status. (This branch is unreachable on the create path, per step 5.)

 (Why compare against step 2's status rather than against the attempted target: for the
 `'generation-failed'` sub-cases the guard declines the transition even though the row's real
 status never equalled the target — `ALLOWED_PRIOR_STATUSES.open` only permits `'blocked'` as a
 prior, so a `'generation-failed'` row is declined when the target is `'open'` even though
 `'generation-failed'` ≠ `'open'`. Comparing to the target would misclassify that case as a
 conflict; comparing to step 2's own pre-attempt read correctly identifies it as benign, because
 the row is exactly where this request itself found it — nothing external moved it.)
7. If step 6 found the transition succeeded (`true`), or found a benign no-op, or the
 `'brief-generated'` case was skipped in step 4: re-read the Investigation's real current status
 via `getInvestigation` one final time and respond `201` with `CreateInvestigationResponseBody`,
 using that freshly-read `status` — never the value the handler attempted or assumed.

This is a real change to the live route's branching logic, not a find-and-replace of a route string:
the existing route gains a pre-mutation status read, a `'brief-generated'`-skip branch, and a
post-mutation status read-back before responding. `submitSources` gains no new call, no new
parameter, no new behavior; `resolveInvestigationSources` gains no new call and no new parameter,
but DOES gain new behavior at the function level (§1.4's C1 fix — skips already-resolved sources), a
no-op for this route's own create-path call; `transitionInvestigationStatus.ts` is not modified — its
existing `ALLOWED_PRIOR_STATUSES` guard is what step 6 now actually checks instead of ignoring.

### 3.1c `POST.../generation-runs/:runId/abandon` request/response (§1.6)

```typescript
// POST /api/investigations/:id/generation-runs/:runId/abandon — no request body.

// 200 — success (§1.6 step 7). Describes the run's terminal state only; the next
// GET.../workspace poll is the source of truth for investigation.status.
interface AbandonGenerationRunResponseBody {
 generationRunId: string;
 outcome: 'failed';
}

// 409 — not eligible to abandon. Covers both real disposition branches §1.6 defines (step 2: the
// run has already reached a terminal outcome; step 3: the run is still 'active' and merely slow;
// step 4: another writer — a concurrent abandon or the pipeline's own legitimate finalization —
// won the race since this request's own step-3 read). One shape for all three, distinguished by
// the real, freshly-read fields below — never a bare boolean or an unqualified 409.
interface AbandonGenerationRunNotEligibleResponseBody {
 error: 'abandon-not-eligible';
 generationRunId: string;
 currentOutcome: 'in-progress' | 'succeeded' | 'failed'; // the run's real, freshly-read outcome
 livenessState: 'active' | 'stale-or-interrupted' | 'terminal'; // computeLivenessState (§4.9)
 // over that same freshly-read state — 'terminal' whenever currentOutcome !== 'in-progress'
 message: string;
}

// 404 — Investigation or GenerationRun not found, or the run does not belong to this Investigation
interface AbandonGenerationRunNotFoundResponseBody {
 error: 'generation-run-not-found';
}
```

**Deadlock disposition.** No new error response is added for
a Postgres deadlock (`40P01`). §1.6 step 4's lock-order fix makes the abandon flow acquire
`investigation FOR UPDATE` before `generation_run FOR UPDATE`, in that order, on every path that
touches both rows — matching Phase 4 (`generateBriefVersion.ts:552`, then `:677`) and the
SOL-HIGH-2 `attemptGenerationFailedTransition` wrapper exactly. With every transaction in this file
that locks both rows taking them in the same order, Postgres's deadlock detector has no cycle to
find: a second transaction contending for `investigation` simply blocks until the first commits,
then proceeds — it does not deadlock, because it never holds `generation_run` while waiting on
`investigation`. This is proved, not merely argued, by §1.6 Tests item 15 (two real, separate
connections, correct order, asserts no `40P01`). If a future edit ever introduces a THIRD lock
ordering path that could deadlock against these two, it must be caught by re-running that test
against the new path before merge — this disposition holds only as long as every code path
touching both rows preserves this order.

### 3.2 `GET.../workspace` response (Workspace Read Model)

The defining constraint (US-4, Anti-Patterns): every field is a projection of a persisted row or a
persisted-row's absence. There is no field this shape *could* be extended with to claim
"currently executing" beyond the latest persisted step, a percent figure, or a pre-persistence
success — that guarantee is structural, enforced by the shape below never carrying an
in-memory/derived-during-the-run value, only rows already committed at query time.

```typescript
// src/types/readModels.ts

interface WorkspaceInvestigationSummary {
 id: string;
 createdAt: string;
 status: InvestigationStatus; // 'open' | 'blocked' | 'generation-failed' | 'brief-generated'
 statusReason: string | null;
 sourceCount: number;
 sources: Array<{
 id: string;
 type: SourceArtifactType;
 raw: string;
 resolutionStatus: SourceResolution['status'];
 failureReason?: string; // populated only when resolutionStatus === 'unreachable'
 noContentReason?: string; // populated only when resolutionStatus === 'reachable-no-content'
 }>;
}

/** Exactly the persisted GenerationStep facts (US-4 AC1) — no field here is ever computed from
 * "what the pipeline is doing right now"; every value is read from a `generation_step` row that
 * already exists at query time. Revised: `validationRecords`/`toolInvocations` are
 * already computed and persisted server-side by `provenanceRecorder.ts`'s `rowToGenerationStep`
 * (`step_data` JSONB column, `generation_step`) — this shape was simply not exposing them; no new
 * persistence, only closing the read-model gap to what 03-UI-SPEC.md's provenance rail already
 * claims to render ("validation attempts... tool outcomes... per run, all runs"). */
interface WorkspaceGenerationStepSummary {
 component: string;
 startedAt: string;
 completedAt: string;
 outcome: 'succeeded' | 'failed';
 error?: string;
 modelIdentifier?: string;
 validationRecords?: SchemaValidationRecord[]; // existing domain type (provenanceRecorder.ts) —
 // per-attempt tool-call validation, verbatim
 toolInvocations?: ToolInvocationRecord[]; // existing domain type — searchWeb-shaped calls
}

/** One WebSearchQuery + its results, scoped to one GenerationRun (03-UI-SPEC.md's
 * SearchScopeNotice and provenance rail claim to render "queries actually performed and any
 * failed/blocked retrievals" per run; this closes that gap against the already-persisted
 * `web_search_query`/`web_search_result`/`query_limitation` tables (migration 005), no new
 * persistence). */
interface WorkspaceWebSearchQuerySummary {
 id: string;
 query: string;
 performedAt: string;
 scopeNote: string | null;
 limitations: string[]; // MUST
 // be populated by joining `query_limitation.reason`
 // rows for this `web_search_query.id`, never by
 // reading `web_search_query.limitations` directly —
 // live `searchWeb.ts:162,219` always inserts that
 // column as `[]`;
 // the real limitation text this field must surface
 // lives exclusively in `query_limitation.reason`
 // (above).
 results: Array<{
 url: string;
 retrievedAt: string;
 status: 'retrieved' | 'blocked' | 'failed';
 failureReason?: string;
 }>;
}

/** One GenerationRun as reported to the workspace. `outcome: 'in-progress'` combined with
 * `steps: []` is the ONLY honest way to represent "a run started but no step has completed yet" —
 * there is no separate "currently executing" field to populate instead (US-4 AC3/AC4).
 * `livenessState` is computed at READ time from
 * persisted facts only (§4.9) — it is never itself a stored column, since a crashed process
 * cannot write to its own row. */
interface WorkspaceGenerationRunSummary {
 id: string;
 outcome: 'in-progress' | 'succeeded' | 'failed';
 livenessState: 'active' | 'stale-or-interrupted' | 'terminal'; // §4.9 — 'terminal' whenever
 // outcome !== 'in-progress'; for outcome ===
 // 'in-progress', 'active' or 'stale-or-interrupted'
 // per the read-time detection in §4.9. This is the
 // ONLY field the UI may use to distinguish a healthy
 // in-progress run from one that crashed or was
 // interrupted (Anti-Patterns — never
 // indistinguishable, US-4).
 startedAt: string;
 completedAt: string | null; // null iff outcome === 'in-progress'
 runtimeIdentifier: string;
 steps: WorkspaceGenerationStepSummary[]; // persisted steps only, in step_index order —
 // absence of the "next" component is not represented
 // by a placeholder row; it is simply not in this array
 webSearchQueries: WorkspaceWebSearchQuerySummary[]; // every WebSearchQuery for this run
 // (`web_search_query.generation_run_id = this run's
 // id`); [] for a run with no web research
 // step yet, never a different shape
}

interface WorkspaceBriefSummary {
 briefVersionId: string;
 versionNumber: number;
 createdAt: string;
 isCurrent: boolean; // true iff this is ProblemBrief.currentVersionId
 assignedState: AssignedValidityState; // this version's current-knowledge state (US-12) —
 // getAssignedState({ targetType: 'brief-version',
 // targetId: briefVersionId }), 'valid' by construction
 // when no StatusEvent exists yet (§3.6, §4.7)
 isSuperseded: boolean; // structural fact (US-12) — true iff some other
 // BriefVersion under the same problemBriefId names
 // this one via supersedesVersionId; never conflated
 // with assignedState
 forwardSupersededByVersionNumber: number | null; //
 // the human-readable versionNumber of the ONE
 // OTHER BriefVersion under the same problemBriefId
 // whose own supersedesVersionId === this briefVersionId
 // (the immediate successor that actually names this
 // version — never ProblemBrief.currentVersionId, which
 // skips intermediate versions in a lineage of 3+); null
 // when isSuperseded is false, non-null and unique when
 // true (supersedesVersionId is 1:1 by construction —
 // each version is named by at most one successor).
 // Computed server-side by getInvestigationWorkspace
 // (§4.4 step 3 —
 // was mis-cited "§4.7", which is the
 // Validity/Invalidation Service section, not this
 // read model) alongside isSuperseded/assignedState —
 // same structural scan, not a second query.
}

/** Revised: `versionNumber` is the human-readable version reference (US-1 AC5) this
 * Decision's owning BriefVersion carries — required so the whole-Investigation lineage view can
 * label each Decision with which version it belongs to, without exposing `briefVersionId` (a raw
 * UUID) as the label a human reads. `reconsiderationConditions` already carries resolved content
 * (type/otherTypeLabel/description), never a bare `ReconsiderationCondition` id — this shape was
 * already correct; the gap identified was in `getDecisionsForBriefVersion`'s own return
 * type (§4.5), which populated only ids before this revision. */
interface WorkspaceDecisionSummary {
 id: string;
 briefVersionId: string; // internal id — not rendered as primary content
 versionNumber: number; // human-readable version reference (US-1 AC5) for
 // this Decision's owning BriefVersion
 decision: RecommendationDecision; // 'Approve' | 'Reject' | 'Watch'
 decidedAt: string;
 rationale?: string;
 reconsiderationConditions: Array<{
 type: ReconsiderationConditionType;
 otherTypeLabel?: string;
 description: string;
 }>;
}

/** US-12: AssignedValidityState is imported unchanged from
 * problem-department-mvp/02-ARCHITECTURE.md §3 ("Bitemporal validity (Q-3)") — restated as a
 * pointer, not redefined, per §3.6 below. */

/** GET /api/investigations/:id/workspace response. */
interface InvestigationWorkspaceView {
 investigation: WorkspaceInvestigationSummary;
 generationRuns: WorkspaceGenerationRunSummary[]; // ALL runs for this Investigation, newest first —
 // US-6 AC2 "all prior successful and failed steps/runs
 // remain visible... nothing is hidden on failure"
 latestGenerationRun: WorkspaceGenerationRunSummary | null; // = generationRuns[0], denormalized for
 // the client's poll-target convenience (US-4 AC2/AC5)
 briefs: WorkspaceBriefSummary[]; // every BriefVersion for this Investigation's
 // ProblemBrief lineage, if any, newest first
 decisionLineage: WorkspaceDecisionSummary[]; // Revised: every
 // Decision across every BriefVersion in this
 // Investigation's ProblemBrief lineage, decidedAt ASC
 // (US-10 AC8/AC12) — chronological across the WHOLE
 // Investigation, each entry labeled with its own
 // `versionNumber` (US-1 AC5). This is a distinct,
 // requirements-distinct surface from the per-version
 // decision list: the per-version list is
 // `getBriefForReview(briefVersionId).priorDecisions`
 // (§3.3), scoped to exactly the BriefVersion being
 // viewed — neither is a substitute presentation of
 // the other (US-10 AC12), and this field is never
 // filtered down to "current version only" for any
 // caller — that filtering, when wanted, is the
 // per-version list's job, not this one's.
 generationEligible: boolean; // See "Generation Eligibility Rule" below §4.2 —
 // this field is that rule's single server-computed
 // output; restated nowhere else, never re-derived by
 // the client (single source of truth for the "can I
 // submit a generation request" affordance)
}
```

`sourceCount` and every array above degrade to `0`/`[]` for a freshly-submitted, pre-generation
Investigation — never a different response shape (matches Checkpoint 1's own "never a different
shape on empty" pattern, §5.1 note in `product-surface-checkpoint-1/02-ARCHITECTURE.md`).

`InvestigationWorkspaceView` gains one more field for US-13's resubmission gate:

```typescript
interface InvestigationWorkspaceView {
 //...(all fields above, unchanged)...
 newEvidenceSinceCurrentBriefVersion: boolean; // Revised: §4.8's
 // hasEligibleNewEvidenceSinceCurrentBriefVersion
 // result, computed server-side against real
 // resolution-status and already-consumed-evidence
 // facts (§4.8), not a bare timestamp comparison;
 // false for an Investigation with no BriefVersion yet
 // (there is nothing to be "new since"). This is the
 // field generationEligible's 'brief-generated' branch
 // reads (§4.2's revised rule) — the client never
 // re-derives it itself.
}
```

### 3.3 `getBriefForReview` return shape

Unchanged from `problem-department-mvp/02-ARCHITECTURE.md` §4's forward-referenced contract in
field list — no field added, no field removed — `priorDecisions` is no longer the original MVP
architecture's `Decision[]` (each entry carrying `reconsiderationConditionIds: string[]`, bare ids);
per §4.5's revised `getDecisionsForBriefVersion`, it is now
`DecisionWithResolvedConditions[]`, each entry carrying resolved `reconsiderationConditions` content
(`type`/`otherTypeLabel`/`description`) instead of bare ids. This is the sole, deliberate exception
to "unchanged" in this section — every other field (`version`, `assignedState`, `isSuperseded`,
`problemStatements`, `claimVersions`, `demandSignals`, `demandConfidence`, `existingSolutions`,
`gapHypotheses`, `negativeFindings`, `uncertainty`, `recommendation`, `personalPullNotes`) keeps its
original MVP-documented shape verbatim. Restated here only as a pointer, not copied, per this
project's "no manually-asserted counts / no duplicated canonical shapes" discipline:

```typescript
function getBriefForReview(briefVersionId: string): Promise<GetBriefForReviewResult>;
// GetBriefForReviewResult = the exact return type documented in
// problem-department-mvp/02-ARCHITECTURE.md §4 "Review Surface (read model)" — version,
// assignedState, isSuperseded, problemStatements, claimVersions (with resolvedEvidence + per-claim
// assignedState), demandSignals, demandConfidence, existingSolutions, gapHypotheses,
// negativeFindings, uncertainty, recommendation, personalPullNotes, priorDecisions.
```

**No narrowing (2026-08-22 material scope correction)**: `assignedState`/`isSuperseded` are not
deferred to a documented fallback on the grounds that `StatusEvent`/`assignValidityState` are out of
scope. Per Danny's 2026-08-22 ruling, US-12 restores
Slice 12's full contract to this checkpoint, so `getBriefForReview`'s `assignedState` fields (both
the top-level `BriefVersion` one and each `claimVersions[i].assignedState`) resolve through the real
`getAssignedState` query (§4.7) against actual `StatusEvent` rows (§3.6) — not a hardcoded
`'valid'` literal. Because no browser control ever calls `assignValidityState` this checkpoint (Out
of Scope), every `StatusEvent` row this sprint's own surface can produce is `[]` until Forge's own
test harness or a future sprint appends one directly — so `getAssignedState`'s documented
`'valid'`-when-no-`StatusEvent`-exists fallback (`problem-department-mvp/02-ARCHITECTURE.md` §4,
Query 1) is still the value every field resolves to in practice today. This is the query's own
honest fallback behavior against an empty table, not a
short-circuit that skips the query — `getBriefForReview` calls `getAssignedState` unconditionally
for every `BriefVersion`/`ClaimVersion` it resolves, so the moment any `StatusEvent` row exists
(from a future in-scope invalidation trigger, or from `assignValidityState` invoked directly in a
later sprint), the surface reflects it with no code change. `isSuperseded` is unaffected either way
(`BriefVersion.supersedesVersionId` already exists and is populated on every correction, including
US-13's). `priorDecisions` resolves through §4.5's revised `getDecisionsForBriefVersion`
— resolved reconsideration-condition content, never bare ids — the same function
`getInvestigationWorkspace`'s `decisionLineage` calls; `getBriefForReview`'s own call is scoped to
exactly `briefVersionId`, which is what makes `priorDecisions` the correctly per-version-scoped list
US-10 AC12 requires, distinct from `decisionLineage`'s whole-Investigation view.

### 3.4 `Decision` / `ReconsiderationCondition` (new persisted types — §1.2 resolution applied)

```typescript
// src/types/domain.ts — additions

/** NEW union, first defined by this checkpoint (M-2 correction) — problem-department-mvp §3 uses
 * the same name in an unbuilt spec document, but no `ReconsiderationConditionType` exists
 * anywhere in `src/` today; this is this checkpoint's own first implementation of it, not a
 * reference to a live type. Values mirror migration 010's `reconsideration_condition.type` CHECK
 * constraint exactly (§3.5) — the two are the same enumeration, declared once here and enforced
 * once there. */
type ReconsiderationConditionType =
 | 'new-evidence'
 | 'product-change'
 | 'stronger-demand-signal'
 | 'feasibility-shift'
 | 'price-change'
 | 'market-event'
 | 'other';

interface ReconsiderationCondition {
 id: string;
 decisionId: string;
 type: ReconsiderationConditionType; // NEW union, first defined here — see comment above
 otherTypeLabel?: string; // required when type === 'other'
 description: string;
}

/** No actor/identity field (§1.2). Immutable once created — a revisit creates a new Decision, it
 * never edits an existing one (matches problem-department-mvp §3's existing doc comment, minus
 * decidedBy). */
interface Decision {
 id: string;
 briefVersionId: string; // bound to the specific version reviewed — never
 // reassigned on a later correction (US-10 AC1)
 decision: RecommendationDecision; // 'Approve' | 'Reject' | 'Watch'
 decidedAt: string;
 rationale?: string;
 reconsiderationConditionIds: string[]; // length >= 1 iff decision === 'Watch' (US-10 AC4)
}
```

### 3.5 Migrations (new)

```sql
-- 009_generation_run_investigation_in_progress_unique.sql (§1.1) — full statement, including the
-- mandatory stranded-row backfill, is given in §1.1 and is NOT repeated here to avoid two
-- divergible copies of the same SQL; §1.1's backfill (the WITH ranked/stranded/logged_steps CTE
-- chain) MUST run before the CREATE UNIQUE INDEX below, in the same migration file, or the index
-- creation itself fails against any pre-existing duplicate 'in-progress' rows (§1.1). This same
-- migration file ALSO carries §1.6's fencing/heartbeat columns (schema block below), added AFTER
-- the CREATE UNIQUE INDEX — the trailing statement of migration 009 is that ALTER TABLE, not the
-- index creation:
CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_run_investigation_in_progress_unique
 ON generation_run (investigation_id)
 WHERE outcome = 'in-progress';
-- (followed by the fence_token/lease_heartbeat_at ALTER TABLE given in the "Schema (generation_run,
-- migration 009...)" block below — that ALTER TABLE is this file's actual trailing statement.)

-- 010_decision_and_reconsideration_condition.sql (§1.2, §3.4)
-- Append-only, same reject_update_or_delete trigger pattern as brief_version/problem_statement
-- (007_problem_brief_and_versioning.sql).
CREATE TABLE IF NOT EXISTS decision (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 brief_version_id UUID NOT NULL REFERENCES brief_version(id),
 decision TEXT NOT NULL CHECK (decision IN ('Approve', 'Reject', 'Watch')),
 decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 rationale TEXT
 -- No decided_by / actor column — §1.2, Interview Q2 binding ruling.
);

CREATE TABLE IF NOT EXISTS reconsideration_condition (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 decision_id UUID NOT NULL REFERENCES decision(id),
 type TEXT NOT NULL CHECK (type IN
 ('new-evidence', 'product-change', 'stronger-demand-signal',
 'feasibility-shift', 'price-change', 'market-event', 'other')),
 other_type_label TEXT,
 description TEXT NOT NULL CHECK (length(trim(description)) > 0),
 CONSTRAINT reconsideration_condition_other_type_label_required
 CHECK (type <> 'other' OR (other_type_label IS NOT NULL AND length(trim(other_type_label)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_decision_brief_version_id ON decision (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_reconsideration_condition_decision_id
 ON reconsideration_condition (decision_id);

-- Server-side, transaction-scoped enforcement of "Watch requires >=1 condition" happens in
-- recordDecision.ts (insert Decision + its ReconsiderationConditions in one transaction; if
-- decision = 'Watch' and zero conditions were supplied, roll back and reject before either table
-- is written — US-10 AC4's "no Decision persisted on rejection"). A CHECK constraint cannot
-- express a cross-table cardinality rule directly; the transaction boundary is the enforcement
-- mechanism, matching this doc set's existing pattern of combining DB CHECKs for intra-row rules
-- with app-layer transaction discipline for cross-row/cross-table rules (e.g.
-- brief_version_problem_statement_ids_non_empty is a backstop, not the sole enforcement, per
-- 007's own header note).

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'decision_immutable' AND tgrelid = 'decision'::regclass) THEN
 CREATE TRIGGER decision_immutable BEFORE UPDATE OR DELETE ON decision
 FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reconsideration_condition_immutable' AND tgrelid = 'reconsideration_condition'::regclass) THEN
 CREATE TRIGGER reconsideration_condition_immutable BEFORE UPDATE OR DELETE ON reconsideration_condition
 FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
 END IF;
END $$;
```

Migration numbering: `008_reconcile_brief_versioning_constraints.sql` is the highest existing
migration (confirmed via `ls src/db/migrations/`); `009`-`013` are the five numbers this revision
assigns, named here rather than left to Forge to guess, matching this doc set's existing practice
of naming exact migration files in architecture (§1.6 of the MVP architecture did the same for
`005`). Per `04-ROADMAP.md`, the five files are CREATED in this order across slices: `009` and
`013` (`013_source_artifact_canonical_identity.sql`, §1.4a/§1.4b/§4.8's canonical-identity/dedup
columns) both in C2-S2, `012` (§4.8's `generation_run_consumed_source` table) in C2-S3, `011`
(§3.6) in C2-S4, and `010` in C2-S5 — i.e. the migration FILES are not created in ascending numeric
order (`013`, `012`, and `011` exist on disk before `010` does). This is safe: `src/db/migrate.ts`
(read directly) sorts `readdirSync(MIGRATIONS_DIR)` lexically (`.sort()`) and runs whichever
filenames are not yet recorded in the `schema_migrations` table (`filename TEXT PRIMARY KEY`) — it
is not a numeric high-water-mark that assumes contiguous, in-order file creation, and it applies
files strictly in lexical filename order regardless of the order in which they were authored. A
database that has only `009` and `013` on disk applies exactly those two in `009`, `013` order;
when `012`, `011`, and `010` are added later by their own slices, the next run applies them in
`010`, `011`, `012` lexical order and each is recorded independently. No migration's SQL depends on
a lower-numbered file already existing (each is a self-contained `CREATE`/`ALTER` against tables
already present as of `008`), so out-of-numeric-order creation introduces no ordering hazard given
this runner's real, verified sort-and-apply-unrecorded-by-filename mechanism.

### 3.6 `StatusEvent` (new persisted type — US-12)

Schema and semantics reused verbatim from `problem-department-mvp/02-ARCHITECTURE.md` §3
("Bitemporal validity (Q-3)") and §4's `assignValidityState`/`getAssignedState`/
`getAssignedStateAsRecorded` — not redesigned. Restated here (not merely pointed to) because this
checkpoint is the first to actually build it:

```typescript
// src/types/domain.ts — additions

/** Answers "what validity state did Department OS assign to this item at time T" — never "was
 * this item objectively valid at time T." Append-only; a correction is a new StatusEvent with a
 * later recordedAt (and possibly an earlier effectiveAt, for a late-discovered correction), never
 * an edit to an existing event. */
type AssignedValidityState = 'valid' | 'challenged' | 'invalidated';

interface StatusEvent {
 id: string;
 sequence: number; // DB-assigned monotonic insertion order (BIGSERIAL),
 // the deterministic tiebreak when two events share the same
 // (effectiveAt, recordedAt); never caller-supplied, never reused
 targetType: 'claim-version' | 'brief-version';
 targetId: string; // ClaimVersion.id or BriefVersion.id — validated to exist as a
 // row of this targetType BEFORE this row is ever inserted
 assignedState: AssignedValidityState;
 effectiveAt: string; // when this state became true in the represented world
 recordedAt: string; // when Department OS learned/recorded it
 recordedBy: string; // which service/process recorded it (e.g. 'forge-verification',
 // 'test-harness') — not a human-actor identity field; this
 // sprint has no browser-reachable caller (Out of Scope, US-12),
 // so no UI ever populates this from a person. Carried forward
 // unchanged from the already-committed MVP contract, distinct
 // from the actor-identity prohibition on Decision (§1.2), which
 // concerns a *human reviewer* field on a *decision* record, not
 // a system-provenance field on an internal service call.
 reason: string;
}
```

```sql
-- 011_status_event.sql (US-12) — append-only, same reject_update_or_delete trigger pattern.
CREATE TABLE IF NOT EXISTS status_event (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sequence BIGSERIAL NOT NULL, -- deterministic ordering tiebreak, DB-assigned,
 -- always distinct and monotonic by insertion order
 target_type TEXT NOT NULL CHECK (target_type IN ('claim-version', 'brief-version')),
 target_id UUID NOT NULL,
 assigned_state TEXT NOT NULL CHECK (assigned_state IN ('valid', 'challenged', 'invalidated')),
 effective_at TIMESTAMPTZ NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 recorded_by TEXT NOT NULL,
 reason TEXT NOT NULL CHECK (length(trim(reason)) > 0)
 -- target_id intentionally has no FK: it references claim_version.id OR brief_version.id
 -- depending on target_type, and Postgres has no polymorphic FK — matches this doc set's existing
 -- practice of enforcing polymorphic-target integrity in application code, not the schema, when a
 -- CHECK/FK cannot express it (see 010's decision/reconsideration_condition note, same pattern).
);

CREATE INDEX IF NOT EXISTS idx_status_event_target
 ON status_event (target_type, target_id, effective_at DESC, recorded_at DESC, sequence DESC);
-- index order matches the exact ORDER BY getAssignedState/getAssignedStateAsRecorded
-- use (§4.7) — effective_at, then recorded_at, then sequence, all DESC — so "latest" resolves via
-- one index scan, not a sort.

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'status_event_immutable' AND tgrelid = 'status_event'::regclass) THEN
 CREATE TRIGGER status_event_immutable BEFORE UPDATE OR DELETE ON status_event
 FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
 END IF;
END $$;
```

No mutable `status`/`validity` column is added to `claim`, `claim_version`, or `brief_version` —
assigned validity state is always answered by querying `status_event` (Non-Functional Requirements,
binding).

---

## 4. API Contracts

### 4.1 Express routes (`src/web/apiRoutes.ts`, mounted exactly as existing routes are)

```typescript
// POST /api/investigations/:id/generation-runs
// 202 CreateGenerationRunResponseBody |
// 404 GenerationRunNotFoundResponseBody | 409 GenerationRunConflictResponseBody |
// 422 GenerationRunIneligibleResponseBody
apiRoutes.post('/api/investigations/:id/generation-runs', async (req, res) => { /* §4.2 */ });

// GET /api/investigations/:id/workspace
// 200 InvestigationWorkspaceView | 404 { error: 'investigation-not-found' }
apiRoutes.get('/api/investigations/:id/workspace', async (req, res) => { /* calls
 getInvestigationWorkspace(req.params.id) */ });

// POST /api/investigations/:id/generation-runs/:runId/abandon (§1.6 — new, whole-package
// convergence: stale/interrupted run recovery)
// 200 AbandonGenerationRunResponseBody | 404 AbandonGenerationRunNotFoundResponseBody | 409 AbandonGenerationRunNotEligibleResponseBody
apiRoutes.post(
 '/api/investigations/:id/generation-runs/:runId/abandon',
 async (req, res) => { /* §1.6's abandonGenerationRun(investigationId, generationRunId) */ });

// POST /api/source-artifacts/:id/recheck (§1.4a — new, single-artifact re-verification path,
// added to this canonical route enumeration)
// 200 { sourceArtifactId: string; resolutionStatus: SourceResolutionStatus; investigationStatus: InvestigationStatus }
// | 404 { error: 'source-artifact-not-found' } | 409 RecheckNotEligibleResponseBody
apiRoutes.post(
 '/api/source-artifacts/:id/recheck',
 async (req, res) => { /* §1.4a's recheckSourceArtifact(req.params.id) */ });

// POST /api/investigations (existing route, EXTENDED IN PLACE — §1.4, §3.1b,
// per the Add-Source-route ruling; no new route/path segment is added for the add-source case)
// 201 CreateInvestigationResponseBody | 400 CreateInvestigationInvalidRequestResponseBody |
// 404 CreateInvestigationNotFoundResponseBody (NEW, existing-investigationId-not-found) |
// 409 CreateInvestigationTransitionConflictResponseBody (NEW, genuine guard-declined conflict
// only — per the benign-no-op-vs-genuine-conflict ruling; a benign same-status guard decline responds 201, not 409, §3.1b step 6)
apiRoutes.post('/api/investigations', async (req, res) => { /* §3.1b's exact 7-step branch —
 unchanged for the no-investigationId create case; for an existing investigationId, reads status
 via getInvestigation BEFORE mutating, skips transitionInvestigationStatus entirely when that
 status is 'brief-generated', otherwise calls it and checks its returned boolean, then always
 re-reads real status via getInvestigation before responding */ });

// GET /api/investigations/:investigationId/brief-versions/by-version/:versionNumber
// (§3.1a, revised — addressed by a human-readable version number, not a raw UUID)
// 200 GetBriefForReviewResult |
// 400 BriefVersionRouteInvalidVersionResponseBody |
// 404 BriefVersionRouteInvestigationNotFoundResponseBody |
// 404 BriefVersionRouteVersionNotFoundResponseBody
apiRoutes.get(
 '/api/investigations/:investigationId/brief-versions/by-version/:versionNumber',
 async (req, res) => { /* getInvestigation(investigationId) not-found check, then
 SELECT id FROM brief_version WHERE problem_brief_id = investigation.problemBriefId AND
 version_number = :versionNumber (404 if none), then getBriefForReview(resolved briefVersionId) */ });

// POST /api/brief-versions/:briefVersionId/decisions (§3.1a)
// 201 Decision |
// 400 SubmitDecisionInvalidRequestResponseBody |
// 404 SubmitDecisionVersionNotFoundResponseBody |
// 422 SubmitDecisionWatchRequiresConditionResponseBody
apiRoutes.post(
 '/api/brief-versions/:briefVersionId/decisions',
 async (req, res) => { /* body-shape validation (400) before any service call, then
 recordDecision({ briefVersionId: req.params.briefVersionId,...req.body }) (§4.3) —
 catches BriefVersionNotFoundError (SOL-MEDIUM-5 fix, §4.3) and maps it 1:1 to
 404 SubmitDecisionVersionNotFoundResponseBody; catches WatchRequiresConditionError
 and maps it 1:1 to 422 SubmitDecisionWatchRequiresConditionResponseBody */ });
```

### 4.2 Generation Run Connector — orchestration

The connector's route handler does not synchronously await `generateBriefVersion`'s full result. It
returns the instant the concurrency-guarding `GenerationRun` row exists (§1.3's `onRunCreated`
hook), using a promise-race so a genuine 409 conflict (thrown before `onRunCreated` ever fires) is
still detected and reported synchronously, while the pipeline itself keeps running un-awaited after
the response is sent.

```typescript
// src/web/apiRoutes.ts handler body, delegating to a small orchestration function so it is
// independently unit-testable without an HTTP layer:
async function createGenerationRunForInvestigation(investigationId: string): Promise<
 | { outcome: 'started'; generationRunId: string }
 | { outcome: 'not-found' }
 | { outcome: 'conflict'; existingGenerationRunId: string; stillInProgress: boolean } // §4.2 step 5a — declared with its real final shape here directly, not restated later
 | { outcome: 'ineligible'; currentStatus: InvestigationStatus; reason: string }
>;
// Note: 'generation-failed'/'created' full-pipeline-result outcomes are REMOVED from this
// function's return type — the route no longer waits for generateBriefVersion's
// resolution, so it can no longer report the pipeline's own typed outcomes synchronously. The
// client observes BriefGenerationFailedError / InvalidSupersedeTargetError /
// StaleCorrectionConflictError outcomes via the next GET.../workspace poll's
// latestGenerationRun.outcome === 'failed' + its steps' recorded error text (§3.2, §4.4) — the
// same honest-progress mechanism US-4 already specifies for every other terminal outcome. This is
// not a loss of information: every one of those three error classes already causes
// generateBriefVersion to finalize a real, terminal, failed GenerationRun/GenerationStep before
// rethrowing (confirmed, §1.3) — the workspace read model is the correct place to observe
// a terminal outcome that happens after the response is sent.
```

Steps (each numbered step maps directly to one US-3 acceptance criterion):

1. `getInvestigation(investigationId)` (existing, unchanged). Not found → `{ outcome: 'not-found' }`
 (404). Confirms the Investigation row before any write is attempted (US-3 AC1).
2. Eligibility check, applying the **Generation Eligibility Rule** (the single definition; every
 other reference in this document, and `generationEligible` in §3.2, points here rather than
 restating it) — **revised, 2026-08-22 material scope correction (US-13 restored)**:

 > A new generation run may be triggered from:
 > - `'open'` (initial generation, US-3) — always eligible **when no `ProblemBrief` yet exists for
 > this Investigation** (`investigation.problemBriefId === null`, the true initial-generation
 > case);
 > - `'generation-failed'` (retry, US-6 AC3) — always eligible **when no `ProblemBrief` yet exists
 > for this Investigation**, the ordinary "first generation attempt failed" retry case;
 > - any status (`'open'`, `'generation-failed'`, or `'brief-generated'`) **where a `ProblemBrief`
 > already exists for this Investigation** (`investigation.problemBriefId !== null` — i.e. step 3
 > below would set `supersedesVersionId`, a correction run regardless of which status the
 > Investigation happens to carry) — eligible **if and only if**
 > `hasEligibleNewEvidenceSinceCurrentBriefVersion(investigationId)` is `true`. The real
 > discriminator for whether the evidence gate applies is "does this run supersede an existing
 > `BriefVersion`," not "what is the Investigation's current status" — a `ProblemBrief`'s
 > existence, not `status`, is what makes a run a correction (§4.2 step 3 already uses exactly
 > this same `problemBriefId !== null` test to decide `supersedesVersionId`; this bullet applies
 > the identical test to eligibility, not a new one) —
 > **and only when no `GenerationRun` for this Investigation currently has
 > `outcome === 'in-progress'` in every case above.** `'blocked'` is never eligible (US-3 AC1, US-5
 > AC1) regardless of evidence state. `generationEligible` in §3.2 is this rule evaluated
 > server-side; the client never re-derives it. **This in-progress check is a direct inline SQL
 > read performed by this step itself** (`SELECT 1 FROM generation_run WHERE investigation_id =
 > $1 AND outcome = 'in-progress' LIMIT 1`, same table §4.4 step 2's read model queries, but
 > scoped to this one narrow predicate rather than §4.4 step 2's full row/join read) — not a
 > separate named helper function, and not the same call as §4.4 step 2. The entire 422-vs-409
 > disposition below depends on this read executing strictly before step 5's `INSERT` within this
 > same request's handling, which the step ordering above already guarantees.
 >
 > **Note on the `'open'`/`'generation-failed'` correction branch's reachability.** The third
 > bullet's `'open'`/`'generation-failed'` cases (a `ProblemBrief` already existing while status is
 > `'open'` or `'generation-failed'`) are, in fact, structurally UNREACHABLE in live code (§5.4's
 > totality proof: once any `BriefVersion` exists, `investigation.status` is always either
 > `'brief-generated'` or transiently in-progress — never `'open'`/`'generation-failed'` with a
 > `ProblemBrief` on record). A correction attempt cannot itself fail
 > and leave status `'generation-failed'` while `problemBriefId` is still set:
 > `attemptGenerationFailedTransition` (`generateBriefVersion.ts:263-267`) never even attempts the
 > `'generation-failed'` transition for a correction, so a failed correction always leaves status
 > at `'brief-generated'`, never `'generation-failed'`. This bullet's `'open'`/`'generation-failed'`
 > clause is therefore retained as defensive totality over the type (the same posture §5.4 rule 4
 > takes for its own unreachable `Generation-Failed` case), not because live code exercises it —
 > only the `'brief-generated'` case is live.

 The Generation Eligibility Rule above does NOT treat `'brief-generated'` as blanket-ineligible —
 US-13 restores the evidence-gated correction branch. The `'open'`/`'generation-failed'` branches,
 and the concurrent-run guard, apply exactly as stated above regardless of that branch.

 **422 vs. 409 — which status the ordinary concurrent-click case actually returns.** Because
 the concurrent-run guard ("no `GenerationRun` currently `in-progress`") is evaluated HERE, at step
 2, strictly BEFORE step 5's `INSERT` is ever attempted, the ordinary case — a second tab clicking
 "Start generation" while a run is visibly in-progress — fails step 2 and returns `422
 { outcome: 'ineligible', currentStatus, reason }`, not `409`. This is the correct, simpler, more
 honest behavior for that case: `workspace.generationEligible` (computed by this same rule,
 server-side) already reads `false` while a run is in-progress, so the client already knows
 generation isn't eligible before the click is even attempted — a `422` naming the real reason
 ("a generation run is already in progress for this investigation") matches what the client's own
 prior read told it, where a `409` would imply a write conflict the client had no way to anticipate.
 `reason` for this specific ineligibility cause states it explicitly, distinguishable by message
 from the `'blocked'` 422 and the "no new evidence" 422 (§4.2's ineligible-outcome paragraph,
 below). **`409` is reserved for the genuinely narrow race** at step 5a: two requests that BOTH pass
 step 2's read before either request's `INSERT` commits — the only window in which two concurrent
 `POST`s can still collide at the database's own partial unique index despite both having read
 "eligible" moments earlier. That race is not observable by a human clicking a visible button twice
 in a normal workspace session (step 2's read and step 5's `INSERT` are separated by only step
 3-4's synchronous, non-blocking work, not by any user-observable delay) — it is reachable only via
 two genuinely simultaneous automated requests, which is exactly why this document's own test list
 (04-ROADMAP.md C2-S3) exercises it as a direct concurrent-request test, not a browser click-twice
 scenario. `03-UI-SPEC.md`'s copy mapping and `04-ROADMAP.md`'s browser demonstration bullet are
 corrected to expect `422` for the ordinary two-tab case, reserving `409`/`stillInProgress` for the
 race this section describes.

 Ineligible → `{ outcome: 'ineligible', currentStatus, reason }` (422); when the ineligible cause
 is specifically a `'brief-generated'` Investigation with no new evidence, `reason` states that
 explicitly (e.g. `"no new source evidence has been added since the current Brief version"`) so
 the connector's 422 is distinguishable from a `'blocked'` 422 by message, not only by
 `currentStatus`. This mirrors, at the connector boundary, the same `ALLOWED_PRIOR_STATUSES`
 reasoning `transitionInvestigationStatus.ts` already encodes for status transitions — it does not
 duplicate that module's logic, it gates entry to `generateBriefVersion` before that module's own
 internal checks would run. Per `01-REQUIREMENTS.md`'s Constraints, this checkpoint continues to
 assume `transitionInvestigationStatus.ts`'s existing `ALLOWED_PRIOR_STATUSES['brief-generated'] =
 ['open', 'generation-failed', 'brief-generated']` self-transition entry is sufficient for US-13
 and requires no change — the eligibility gate above is additive, in the connector, not a change
 to that module.
3. Determine `supersedesVersionId` server-side (US-3 AC3, US-13 AC3): read `ProblemBrief` for
 this Investigation via the existing `getInvestigation` result's `problemBriefId`; if a
 `ProblemBrief` exists, pass its `currentVersionId` as `supersedesVersionId` (a correction); if
 none exists, omit it (an initial generation). The client never supplies this flag — there is no
 field for it in `CreateGenerationRunRequestBody` (§3.1). This branch is reachable through this
 connector: a `'brief-generated'` Investigation with new
 evidence (step 2's revised rule) reaches this step with a `ProblemBrief` already existing, so
 `supersedesVersionId` is set to its `currentVersionId` and this is now the live US-13 correction
 path, not dead code. It is also still reachable, defensively, for the `'open'`/`'generation-failed'`
 case discussed in step 2's note above — even though that Investigation-status/`ProblemBrief`
 combination is structurally unreachable in live code (see step 2's note and §5.4's totality
 proof), this step 3 branch is retained only for defensive totality over the type, matching step
 2's posture. The live, reachable path this step exists for is the `'brief-generated'` correction
 case.
4. Resolve `runtimeIdentifier` from server configuration (an environment variable or equivalent
 configured value — not a route parameter, not a hardcoded literal string presented as
 provenance). **Numeric/string constant note**: no specific runtime-identifier value is
 prescribed by this document; whichever value Forge wires must be a real, meaningful identifier
 of the actual execution environment (e.g. a package version or deployment tag), never a
 placeholder string — this is a qualitative requirement (US-3 AC4), not a number requiring a
 PROVISIONAL tag.
5. **Kick off `generateBriefVersion` without awaiting its resolution**, racing a
 `runCreated` promise against its rejection so a genuine concurrency conflict is still caught
 synchronously:
 ```typescript
 let resolveRunCreated: (run: GenerationRun) => void;
 let rejectRunCreated: (err: unknown) => void;
 const runCreated = new Promise<GenerationRun>((resolve, reject) => {
 resolveRunCreated = resolve;
 rejectRunCreated = reject;
 });

 const pipeline = generateBriefVersion({
 investigationId,
 supersedesVersionId,
 runtimeIdentifier,
 onRunCreated: (run) => resolveRunCreated(run), // §1.3 — fires the instant Phase 1's INSERT
 // (createGenerationRun) succeeds
 });
 // Synchronization catch — NOT step 5b's safety net (that is attached separately,
 // below, only once `generationRun` is genuinely assigned). This handler's sole job is to relay a
 // pre-Phase-1 rejection into `runCreated` so the try/catch immediately below can respond to the
 // client synchronously. The ONLY way `generateBriefVersion` can reject BEFORE `onRunCreated` ever
 // fires is a failure inside or before `createGenerationRun` itself (Phase 1) — most concretely,
 // §1.1's partial unique index rejecting a concurrent INSERT with a 23505 error. For every OTHER
 // rejection (anything after Phase 1), this handler is a no-op: `runCreated` has already resolved
 // by the time such a rejection reaches here (standard promise semantics — a second resolve/reject
 // on an already-settled promise is silently ignored). This handler MUST NOT write a terminal
 // record and MUST NOT reference `generationRun` — it can run at a point where that binding does
 // not yet exist.
 pipeline.catch((err) => {
 rejectRunCreated(err);
 });

 let generationRun: GenerationRun;
 try {
 generationRun = await runCreated;
 } catch (err) {
 // isUniqueViolation is a NEW helper this checkpoint must create (no equivalent exists in
 // src/ today) — signature `isUniqueViolation(err: unknown, constraintName: string): boolean`,
 // checking that `err` is a Postgres error whose `code` property is `'23505'` AND whose
 // `constraint` property equals `constraintName`. It has no other caller in this document; it
 // exists purely to discriminate this one concurrency-guard rejection from a genuinely
 // unexpected pre-Phase-1 failure.
 if (isUniqueViolation(err, 'idx_generation_run_investigation_in_progress_unique')) {
 // correction: the row that caused the 23505 conflict may have already gone
 // terminal between the INSERT rejection and this lookup (a real race — its own
 // GenerationRun could have finished in the gap). The lookup below therefore does NOT
 // filter on outcome = 'in-progress' (that filter is exactly what could return zero rows
 // for a run that raced to terminal in that gap) — it looks up the most recent
 // GenerationRun for this Investigation, full stop, and reports its REAL current outcome.
 const existing = await pool.query<{ id: string; outcome: 'in-progress' | 'succeeded' | 'failed' }>(
 `SELECT id, outcome FROM generation_run WHERE investigation_id = $1
 ORDER BY started_at DESC LIMIT 1`,
 [investigationId]);
 if (existing.rows.length === 0) {
 // Structurally should not happen (the 23505 itself proves a conflicting row existed at
 // INSERT time), but never dereference an empty rows[0] — treat as a genuinely unexpected
 // failure rather than crash on undefined.
 throw new Error(
 `Unique violation on ${investigationId} but no GenerationRun row found on lookup`);
 }
 const conflictingRun = existing.rows[0];
 if (conflictingRun.outcome !== 'in-progress') {
 // The race: the conflicting run went terminal between the INSERT's rejection and this
 // read. There is no longer a genuine in-progress conflict to report — the client's own
 // request would in fact now be eligible. Report this honestly as a benign race, not a
 // fabricated claim of an in-progress run: the connector returns the SAME 'conflict'
 // outcome shape as the ordinary case, only with stillInProgress: false, so the route maps
 // it to the SAME 409 GenerationRunConflictResponseBody (§3.1) with that field set false —
 // never claiming existingGenerationRunId is still in-progress. There is no separate
 // 'race-resolved' outcome and no server-supplied `message` field; the client derives its
 // own copy from `stillInProgress` (§3.1's field comment; 03-UI-SPEC.md § Interactions
 // "Trigger Generation" Ineligible-request path).
 return { outcome: 'conflict', existingGenerationRunId: conflictingRun.id, stillInProgress: false };
 }
 return { outcome: 'conflict', existingGenerationRunId: conflictingRun.id, stillInProgress: true };
 }
 throw err; // genuinely unexpected pre-Phase-1 failure — 500, not swallowed
 }
 ```
 The orchestration function's `'conflict'` outcome (declared with this exact shape already, above)
 carries this distinction directly: `{ outcome: 'conflict'; existingGenerationRunId: string;
 stillInProgress: boolean }` — the signature at the top of §4.2 and this call site agree
 verbatim.
 `GenerationRunConflictResponseBody` (§3.1) gains a matching `stillInProgress: boolean` field —
 `true` for the ordinary case (a genuinely still-in-progress conflicting run), `false` for the
 race case (the conflicting run has already finished by the time of the lookup); the response
 `message`/client copy for the `false` case states the conflict has already resolved and the
 operator can simply retry, rather than implying an in-progress run the client would then poll
 against forever (that run is already terminal — a poll against it via the normal workspace read
 model will show its real, already-terminal outcome immediately).
 The concurrent-generation guard is `createGenerationRun`'s own `INSERT`, backed by §1.1's
 partial unique index. The route learns the
 outcome as soon as `onRunCreated` fires (i.e. the instant the INSERT commits), not after the
 full pipeline resolves.
5b. **After `runCreated` resolves, the route returns to the client — it does not `await pipeline`.**
 `pipeline` (the full `generateBriefVersion` call) keeps running in the same Node process,
 observed by nothing else in this request/response cycle. A SECOND `.catch` — the safety net —
 is attached to `pipeline` at this point, i.e. only after the `try`/`catch` above has completed
 successfully and `generationRun` is genuinely assigned. Because it is attached here rather than
 at step 5, it can never observe a pre-Phase-1 rejection (those are already fully handled by the
 synchronization catch and the `try`/`catch` at step 5 above, which already returned a `409`
 response or rethrew a `500` before this line is even reached) and it can never dereference an
 unassigned `generationRun`:
 A typed error class
 (`BriefGenerationFailedError`/`InvalidSupersedeTargetError`/`StaleCorrectionConflictError`) is
 strong evidence `generateBriefVersion` already finalized the run, but it is not proof the
 finalizing DB write actually committed — §1.3's own gap (the meta-failure class) can in
 principle occur downstream of any rejection, typed or not. The handler instead READS the
 `GenerationRun`'s real persisted `outcome` before doing anything else, and only attempts a
 recovery write when that read shows the run is genuinely still non-terminal:
 ```typescript
 pipeline.catch(async (err) => {
 let current: { outcome: 'in-progress' | 'succeeded' | 'failed' };
 try {
 // Read the ACTUAL persisted state — never inferred from err's class.
 current = await getGenerationRunOutcome(generationRun.id); // new, small read helper this
 // checkpoint adds to
 // provenanceRecorder.ts —
 // SELECT outcome FROM
 // generation_run WHERE id = $1
 } catch (readErr) {
 // The safety net's OWN read rejected. Consumed and logged here — never rethrown, never
 // left as a second unhandled rejection. No write is attempted when the read itself failed:
 // this handler cannot honestly decide terminal-vs-in-progress without it.
 console.error('safety-net: failed to read persisted GenerationRun state', {
 generationRunId: generationRun.id,
 readErr,
 originalErr: err,
 });
 return;
 }

 if (current.outcome !== 'in-progress') {
 // The row is ALREADY terminal — generateBriefVersion's own finalization (or an earlier
 // pass through this same handler, see below) already wrote it. Log only. No further write
 // is attempted, regardless of err's class — this is what makes the handler exactly-once:
 // it never calls finalizeGenerationRun a second time for a run this read shows is already
 // terminal, and it can never append a false 'failed' step to a run this read shows already
 // succeeded.
 console.error('generateBriefVersion rejected; run already terminal, no action taken', {
 generationRunId: generationRun.id,
 persistedOutcome: current.outcome,
 err,
 });
 return;
 }

 // The read shows the run is still 'in-progress': attempt a guarded, best-effort terminal
 // write. This is a BEST-EFFORT attempt only — the handler does not assume the write below
 // succeeds; if it throws, that rejection is itself consumed and logged, never rethrown.
 // Binding ordering contract (generateBriefVersion.ts:258-262,:306-309,:690-692, restated
 // here because this safety net is a second, out-of-band writer subject to the same rule):
 // recordGenerationStep MUST be called BEFORE finalizeGenerationRun, because finalize computes
 // modelIdentifiers/toolsInvoked from the step log at call time.
 try {
 await recordGenerationStep({
 generationRunId: generationRun.id,
 step: { outcome: 'failed', /*... remaining GenerationStep fields */ },
 fenceToken: generationRun.fenceToken, // captured from createGenerationRun's return value
 // (§1.6) at step 5's `runCreated` resolution, above
 });
 await finalizeGenerationRun({
 generationRunId: generationRun.id,
 outcome: 'failed',
 briefVersionId: null, // no BriefVersion was produced — this meta-failure path never reaches one
 fenceToken: generationRun.fenceToken,
 });
 console.error('generateBriefVersion meta-failure — wrote terminal record (best-effort)', {
 generationRunId: generationRun.id,
 err,
 });
 } catch (writeErr) {
 // The safety net's own write rejected — consumed and logged here, never rethrown, never a
 // second unhandled rejection. The run's real persisted state after this point is genuinely
 // unknown to this handler (it cannot re-verify without risking the same failure); that is
 // an accepted, disclosed limit of a best-effort last-resort write, not silently swallowed.
 console.error('safety-net: best-effort terminal write itself failed', {
 generationRunId: generationRun.id,
 writeErr,
 originalErr: err,
 });
 }
 });
 ```
 `getGenerationRunOutcome(generationRunId: string): Promise<{ outcome: 'in-progress' | 'succeeded'
 | 'failed' }>` is a NEW, small read helper this checkpoint adds to
 `src/services/provenanceRecorder.ts` — a single-column `SELECT outcome FROM generation_run WHERE
 id = $1` — used only by this safety net; no other caller in this document.
 `recordGenerationStep` and `finalizeGenerationRun` (`src/services/provenanceRecorder.ts:95-98`,
 `:139-144`) each take a single object parameter, not positional arguments; `briefVersionId:
 string | null` is a required field on `finalizeGenerationRun`'s input, `null` here because this
 meta-failure path never produces a `BriefVersion`. The route handler this step lives in needs a
 `pool` import (used at step 5a's conflict lookup above) that is not otherwise implied by this
 sample. `runCreated`/`onRunCreated`'s `resolveRunCreated`/`rejectRunCreated` are assigned inside a
 `Promise` executor, so their declarations need definite-assignment handling (TypeScript `!`, or
 an equivalent non-null assertion at the call sites) — otherwise the compiler cannot see they are
 always assigned before use.
 This is still "no queue/worker/background-job abstraction" (Out of Scope, unchanged): the SAME
 Node process, the SAME function call, just not blocking the HTTP response on its full resolution.
6. On success (`runCreated` resolved without the connector ever seeing a conflict): `{ outcome:
 'started', generationRunId: generationRun.id }` (`202` — §3.1). The client learns the run's
 eventual `briefVersionId`/`versionNumber`/terminal outcome exclusively from the next
 `GET.../workspace` poll (§3.2, §4.4) — never from this response.
7. This function no longer catches `BriefGenerationFailedError` / `InvalidSupersedeTargetError` /
 `StaleCorrectionConflictError` itself. US-3 AC6's "never
 collapses them into one generic error" requirement is satisfied instead by `generateBriefVersion`
 itself, which writes each error class's own real reason string into the failed run's
 `GenerationStep.error` (§1.3, `generateBriefVersion.ts:290-714`) — (`BriefGenerationFailedError` via its normal phase-catch step recording, and
 `StaleCorrectionConflictError` via its own dedicated step at `:573-584`); the third,
 `InvalidSupersedeTargetError`, did not record a step until §1.3's 2026-08-24 correction added
 the missing `recordGenerationStep` call to its preflight catch. With that fix applied, all
 three classes now write real, distinct reason text before finalizing — the workspace read model
 surfaces that text per run/step (§3.2), never a generic collapsed message, for any of the three.

This function does not itself call `transitionInvestigationStatus` — `generateBriefVersion`
already owns every status transition it needs to make (per
`problem-department-mvp/02-ARCHITECTURE.md` §4's documented behavior), and this connector does not
duplicate that responsibility.

### 4.3 `recordDecision`

```typescript
// src/services/recordDecision.ts
function recordDecision(input: {
 briefVersionId: string;
 decision: RecommendationDecision;
 rationale?: string;
 reconsiderationConditions?: Array<{
 type: ReconsiderationConditionType;
 otherTypeLabel?: string;
 description: string;
 }>;
}): Promise<Decision>;
// SELF-2 fix — ONE order, stated once, consistently, everywhere this document
// and 04-ROADMAP.md describe this function: (1) route-level body-shape validation (malformed JSON,
// wrong field types) happens BEFORE this function is ever called, as a distinct 400 case, entirely
// outside any transaction — this is unchanged and never conflated with the two steps below. (2)
// `recordDecision` OPENS its transaction first. (3) Inside that open transaction, it performs a
// same-transaction existence check on `briefVersionId` (`SELECT 1 FROM brief_version WHERE id = $1
// FOR UPDATE`, or the equivalent SELECT-for-existence the transaction's own client issues) BEFORE
// evaluating decision/reconsiderationConditions at all. A miss throws the new, typed
// `BriefVersionNotFoundError` (below), the transaction is rolled back, and ZERO writes occur. (4)
// Only once existence passes does it evaluate the Watch ≥1-condition rule (still inside the SAME
// open transaction, not before opening it) — a decision === 'Watch' with reconsiderationConditions
// empty/absent, or every supplied condition's `description` whitespace-only after trim
// (01-REQUIREMENTS.md Edge Cases — "Watch submitted with a condition field present but
// whitespace-only"), rolls back this same transaction and throws `WatchRequiresConditionError`,
// again with ZERO writes. (5) Only once both checks pass does it perform the Decision/
// ReconsiderationCondition inserts and commit. This ordering matters for exactly one reason: a
// request carrying BOTH a nonexistent briefVersionId AND a zero-condition Watch must report 404,
// not 422 — the resource not existing is the more fundamental defect, and reporting it first avoids
// a misleading "fix your Watch conditions" message for a request that could never have succeeded
// regardless. There is exactly one stated order (existence check, then the Watch ≥1-condition
// rule, both inside the same open transaction) — Watch validation never happens before opening the
// insert transaction — and it matches §3.5's schema comment and every reference to this function
// in `04-ROADMAP.md`.
// No Decision or ReconsiderationCondition row is persisted on either rejection — enforced by both
// checks running inside the one transaction covering both tables (§3.5), never by validating
// before that transaction opens.
// No decidedBy parameter (§1.2). Never mutates or reassigns an existing Decision's briefVersionId.
// Does not reject a second Decision on the same briefVersionId (matches problem-department-mvp §4's
// documented multi-Decision-per-version behavior, unchanged).

export class WatchRequiresConditionError extends Error {}
export class BriefVersionNotFoundError extends Error {} // SOL-MEDIUM-5 fix — carries briefVersionId;
 // the route (§3.1a) maps this 1:1 to the
 // existing `404
 // SubmitDecisionVersionNotFoundResponseBody`
 // (§3.1a), the same response shape already
 // pinned there — no new response type needed,
 // only the mechanism that actually throws it.
```

### 4.4 `getInvestigationWorkspace`

```typescript
// src/services/getInvestigationWorkspace.ts
function getInvestigationWorkspace(investigationId: string): Promise<InvestigationWorkspaceView | null>;
// Returns null iff no Investigation row exists for investigationId — the Express handler maps
// null to 404 (§4.1), never a 200 with an empty/placeholder body (US-1 AC4).
```

Assembly, read-only, no writes:

1. `getInvestigation(investigationId)` (existing, live behavior — this function throws, it does not return `null`, on a nonexistent id; live
 `src/services/getInvestigation.ts:44-46` confirms this, and §3.1b's own text — "`getInvestigation`'s
 not-found error is now caught here" — already relies on the throw, not a `null` return). This
 step therefore wraps the call in a `try`/`catch`: on catch, `getInvestigationWorkspace` itself
 returns `null` (its own documented not-found contract, above) so every OTHER caller in this
 document keeps working against a `null`-returning read-model function — `getInvestigation`'s own
 throw-based contract is not changed by this sprint, only wrapped once, here, at this one call
 site. On success → `investigation`, `sourceArtifacts`.
2. New SQL read: all `generation_run` rows for `investigationId`, each joined to its
 `generation_step` rows ordered by `step_index` (with `step_data`'s `validationRecords`/
 `toolInvocations` mapped through) and its `web_search_query`/`web_search_result`/
 `query_limitation` rows, ordered
 `started_at DESC` — populates `generationRuns`/`latestGenerationRun`. `livenessState` (Finding
 8) is computed per run per §4.9, inline in this same read, not a second query.
3. If `investigation.problemBriefId` is set: all `brief_version` rows for that `problemBriefId`,
 ordered `version_number DESC` — call this raw row set `rawBriefVersionRows` (the live `brief_version`
 table rows, each still carrying its own `supersedes_version_id` column) to distinguish it from the
 shaped `briefs: WorkspaceBriefSummary[]` this step ultimately populates. For each row,
 `isCurrent` is computed against `ProblemBrief.currentVersionId`, and (US-12, §4.7) `assignedState`
 via `getAssignedState({ targetType: 'brief-version', targetId: briefVersion.id })` and
 `isSuperseded` via the same structural check as `getBriefForReview`, both computed inline in
 this same loop, before each row is shaped into its final `WorkspaceBriefSummary`. In this same
 loop, also compute `forwardSupersededByVersionNumber`: for each row being assembled, scan the
 already-fetched `rawBriefVersionRows` (no second query) for the (at most one) other row whose own
 `supersedes_version_id` equals this row's `id` — i.e.
 `rawBriefVersionRows.find(other => other.supersedesVersionId === briefVersion.id)` (camelCase here
 denotes the mapped-from-`snake_case` in-memory row shape this service already uses elsewhere in
 this same assembly, not the `WorkspaceBriefSummary` output type). If found,
 `forwardSupersededByVersionNumber` = that other row's `versionNumber`; if not found (i.e.
 `isSuperseded` is `false`), `forwardSupersededByVersionNumber` = `null` (full derivation and
 rationale: §4.7). The final `briefs` array populating `InvestigationWorkspaceView.briefs`
 (`WorkspaceBriefSummary[]`, §3.2) is produced only after this computation, one shaped summary per
 `rawBriefVersionRows` entry — `forwardSupersededByVersionNumber` is a field ON that shaped
 summary, not a fact derived from it.
4. If `briefs` is non-empty: `getDecisionsForBriefVersion` (§4.5, revised) for every
 `briefVersionId` in `briefs`, unioned and sorted `decidedAt ASC`, each entry labeled with its
 owning BriefVersion's `versionNumber` (from the `briefs` array already assembled in step 3) —
 populates `decisionLineage` (was `decisions`; renamed to make explicit this is the
 whole-Investigation lineage view, distinct from `getBriefForReview.priorDecisions`'s
 per-version list — US-10 AC12).
5. (US-13, §4.8, revised) `hasEligibleNewEvidenceSinceCurrentBriefVersion(investigationId)`
 — populates `newEvidenceSinceCurrentBriefVersion`.
6. `generationEligible` computed per §4.2's revised Generation Eligibility Rule, reading
 `investigation.status`, whether any `generationRuns` entry has `outcome === 'in-progress'`, and —
 per §4.2's `problemBriefId`-keyed correction, for `investigation.problemBriefId !== null` (i.e. a
 `ProblemBrief` already exists, so this would be a correction run regardless of
 which status the Investigation happens to carry, matching 03-UI-SPEC.md's Flow US-3/US-4 step 1)
 — step 5's `newEvidenceSinceCurrentBriefVersion` result.

### 4.5 `getDecisionsForBriefVersion`

```typescript
// src/services/getDecisionsForBriefVersion.ts

/** Revised — returns resolved reconsideration-condition CONTENT, never a bare
 * ReconsiderationCondition id — the persisted Decision domain type (§3.4) stores
 * `reconsiderationConditionIds: string[]` (correctly normalized), but every READ surface this
 * sprint exposes (this function, and therefore both getInvestigationWorkspace's
 * `decisionLineage` and getBriefForReview's `priorDecisions`) must resolve those ids to their
 * actual `type`/`otherTypeLabel`/`description` before returning — the UI never receives an id it
 * would have to render opaquely or resolve itself. */
export interface DecisionWithResolvedConditions {
 id: string;
 briefVersionId: string;
 decision: RecommendationDecision;
 decidedAt: string;
 rationale?: string;
 reconsiderationConditions: Array<{
 type: ReconsiderationConditionType;
 otherTypeLabel?: string;
 description: string;
 }>;
}

function getDecisionsForBriefVersion(briefVersionId: string): Promise<DecisionWithResolvedConditions[]>;
// Ordered decidedAt ASC. LEFT JOINs reconsideration_condition (aggregated per decision_id via
// json_agg, one query, not N+1) and maps each row's type/other_type_label/description straight
// through — no id-only intermediate shape is constructed or returned by this function.
```

### 4.6 `ssrfGuardedFetch.ts` fix (US-7)

`src/services/ssrfGuardedFetch.ts` in full (not only the DNS branch): `safeLookup`
has **three** call sites for its `callback` parameter, all inside the same function:

1. `allowedTestHosts` bypass (`:135-138`) — forwards `(hostname, options, callback)` unchanged to
 the real `dns.lookup`.
2. IP-literal branch (`:140-153`) — hostname is already a literal IP; no DNS resolution needed.
3. DNS-resolution branch (`:155-181`) — the branch containing the defect, detailed in the Fix below.

**Declared signature today** (`:130-134`): `(err, address: string, family: number) => void` — a
fixed 3-arg shape. This is the defect's root cause at the type level: Node's custom-`lookup`
contract is not one fixed shape, it is selected by the caller's `options.all` — `{ all: true }`
(the shape Node's `autoSelectFamily` Happy-Eyeballs path uses) expects `callback(err, addresses)`
where `addresses` is an **array**; `{ all: false }`/omitted expects `callback(err, address,
family)`, the single-value shape. A callback typed and implemented for only the second shape
cannot correctly serve a caller using the first.

**Fix — widen the declared signature to the union, and make every call site branch on
`options.all`:**

```typescript
export function safeLookup(
 hostname: string,
 options: dns.LookupOneOptions | dns.LookupAllOptions,
 callback: (
 err: NodeJS.ErrnoException | null,
 address: string | dns.LookupAddress[],
 family?: number) => void): void
```

**Call-site cast (`:216` in `fetchWithGuards`) — unchanged, still required.** The single call site passing `safeLookup` to Node's `fetch`/`http` options (`lookup: safeLookup as unknown as net.LookupFunction`) keeps this cast unchanged by the widened callback signature. Node's own `net.LookupFunction` type still declares only the fixed `(err, address, family)` shape it has always declared — Node's public type does not model the `options.all`-conditional union this fix introduces — so the mismatch the cast was added to satisfy is not narrowed by this fix and the cast cannot be removed. Forge keeps it as-is; no edit is needed at `:216`.

Call-site-by-call-site disposition — every one is addressed, none left ambiguous:

1. **`allowedTestHosts` bypass — no change.** It forwards the caller's own `options` object
 unchanged to the real `dns.lookup`, which already natively implements the `options.all`
 contract correctly (this is Node's own, already-correct implementation — the bug exists only in
 this file's hand-rolled branches below). No edit needed here; call out explicitly so Forge does
 not "fix" a branch that already works.
2. **IP-literal branch — must branch on `options.all`.** Currently unconditionally
 `callback(null, hostname, net.isIPv6(hostname) ? 6: 4)` (the single-value shape). Fix:
 ```typescript
 if (options.all) {
 callback(null, [{ address: hostname, family: net.isIPv6(hostname) ? 6: 4 }]);
 } else {
 callback(null, hostname, net.isIPv6(hostname) ? 6: 4);
 }
 ```
 This branch was not previously suspected of the defect (see G2 disposition below), but the
 signature widening applies to it too, so it must be updated in the same edit or it stops
 typechecking against the new callback type while still being called with the old 3-arg shape.
3. **DNS-resolution branch — the primary fix.** After the existing all-or-nothing block check
 passes (`blocked` is falsy — no resolved address was disallowed, this check itself is unchanged,
 see below), branch on `options.all`:
 ```typescript
 if (options.all) {
 callback(null, addresses);
 } else {
 const chosen = addresses[0];
 callback(null, chosen.address, chosen.family);
 }
 ```
 The err-path callbacks (`:157`, `:161`) keep their existing 3-arg `(err, '', 0)` shape — an
 error path has no address data to shape either way, and Node accepts the 3-arg error form
 regardless of `options.all`.

**The blocking check is fail-closed and correct as-is and must not change**: if *any* resolved
address is disallowed, the entire hostname is rejected with `EBLOCKEDHOST` — no address proceeds,
in either the `options.all` or non-`options.all` branch. There is no "filter out only the blocked
addresses and proceed with the rest" behavior in the live code, and implementing one would convert
this guard from fail-closed to fail-open; it must not be built. No change to `isDisallowedIp`,
`decodeMappedIpv4Hex`, `inIpv4Cidr`, `ipv4ToInt`, or any constant.

**IP-literal exemption claim — not asserted (G2).** This document does not claim "Node 22 skips the
custom `lookup` for literal-IP hosts" — this file's own comment (`ssrfGuardedFetch.ts:199-202`) is
this codebase's own reasoning about itself, not an external confirmation, and is not treated as
verification of Node's actual documented or observed behavior. What **is** verified, and is kept:
`url`-type sources with **hostnames** (not IP literals) fail to resolve correctly under Node 22's
`autoSelectFamily` + `{ all: true }` custom-`lookup` contract, because the DNS-resolution branch's
callback shape does not match what that contract requires (confirmed by direct inspection of the
branch's callback invocation vs. Node's documented `{ all: true }` custom-`lookup` shape).

Whether IP-literal hosts are *also* affected — i.e., whether Node's `http`/`https`/`net` layer
actually invokes the custom `lookup` option at all for a URL whose hostname is already a literal
IP, under this repo's live Node version — is **not** asserted either way in this document.
**Diagnosing the exact failure boundary, including whether IP-literal hosts are affected, is
Forge implementation work for C2-S1**, not a design-time claim. Forge must observe actual behavior
(e.g., by instrumenting `safeLookup`'s entry and confirming whether it is invoked at all for an
IP-literal `startUrl`) before writing any test that depends on a skip/no-skip assumption.

**Regression coverage (US-7 AC2) — executable today, not dependent on the unresolved boundary:**

1. A behavioral test asserting that a real, actually-reachable **hostname-based** source
 (resolving via real DNS on the production code path — not the `allowedTestHosts` bypass branch
 that previously masked this bug in the suite) is fetched successfully end-to-end under the
 Node version this repo runs (`package.json`'s declared engine / the CI runner's actual Node
 version — Forge confirms which at implementation time; this document does not assert a specific
 patch version).
2. A direct unit test on `safeLookup` (not routed through `fetchWithGuards`, and not using the
 `allowedTestHosts` fixture, which bypasses this exact branch) asserting the IP-literal branch's
 new `options.all === true` arm: call `safeLookup('8.8.8.8', { all: true }, callback)` and
 assert `callback` is invoked with `(null, [{ address: '8.8.8.8', family: 4 }])` — the
 array-shaped result call-site disposition 2 adds. `8.8.8.8` (Google Public DNS) is used instead
 of a loopback/private literal because it must actually reach the edited success arm at
 `ssrfGuardedFetch.ts:151`: `127.0.0.1` is rejected by the fail-closed block check at
 `ssrfGuardedFetch.ts:142-148` before that arm is ever reached (`isDisallowedIp` →
 `inIpv4Cidr(ip, '127.0.0.0', 8)` matches it directly). `8.8.8.8` is verified against every
 range `isDisallowedIp` blocks (`ssrfGuardedFetch.ts:94-106`): not in `10.0.0.0/8`,
 `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `0.0.0.0/8`,
 `100.64.0.0/10` (CGNAT), `224.0.0.0/4` (multicast), `240.0.0.0/4` (reserved), or
 `192.0.0.0/24` (IETF protocol assignments) — so `isDisallowedIp('8.8.8.8')` returns `false` and
 the test reaches the IP-literal `{ all: true }` success arm this test exists to cover, not the
 block-check branch. This is the one edited code path with no asserting test before this fix; it
 must exercise call-site disposition 2 directly, not the bypass branch (disposition 1), which is
 unchanged and does not contain the new arm.
3. A regression case asserting that a hostname resolving to a
 mixed allowed/disallowed address set is still rejected in full with `EBLOCKEDHOST` under
 `{ all: true }` — proves the block semantics were not weakened by the shape fix.
4. A regression case asserting `safeLookup` invoked with `options.all` falsy (a direct unit call,
 not routed through `fetchWithGuards`) returns the single-value `(err, address, family)` shape
 for both the IP-literal and DNS-resolution branches — proves the non-`{ all: true }` invocation
 path (call-site disposition 2 and 3 above) was not broken by widening the signature.

None of these four require the skip/no-skip claim to be true or false — all four assert observed,
reproducible behavior under the real code path.

**Disposition — the three constants in this file — already applied on this branch, verified
against live source (2026-09-06).** `ssrfGuardedFetch.ts:12-40` carries `FETCH_TIMEOUT_MS`
(`10_000`), `MAX_RESPONSE_BYTES` (`5 * 1024 * 1024`), and `MAX_REDIRECTS` (`5`). These no longer
carry `PROVISIONAL — unvalidated; owner: Ledger` text, or any `PROVISIONAL` marker text at all —
each was rewritten to a different comment style entirely: "Unsourced — no mathematical, scientific,
or programmatic precedent has been shown for [value] ... This value must not be treated as
accepted: it has no named owner because nobody has reviewed real evidence for it, and 'PROVISIONAL,
owner: [name]' is not a substitute for that evidence — a label is not a citation (DDR-0002, ...)."
Per the global research-data-integrity rule, an agent naming itself as owner is self-certification,
not a named human owner, and is disqualified regardless of the tag's formatting — the same defect
class `MIN_CONTENT_LENGTH` had, and `owner: unassigned` is not a valid substitute either (it still
leaves an unsourced number live with no accountable exit).

**RESOLVED — 2026-09-06.** `docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md` has
been restored to this branch's `docs/decisions/`, and its Category B table (rows B3, B4, B5)
already classifies these exact three constants as "infrastructure / operational safety limits":
`FETCH_TIMEOUT_MS` (connection timeout), `MAX_RESPONSE_BYTES` (response size cap), `MAX_REDIRECTS`
(redirect hop cap). Per that disposition, all three bound resource consumption and failure blast
radius rather than gate evidence or correctness quality, so — unlike `MIN_CONTENT_LENGTH` — they do
**not** require a citable source or a genuinely-reviewed named owner under DDR-0002's branch (a)/(b).

**Edit already applied (C2-S1, this file):** the literal text `owner: Ledger` is deleted from all
three constants' comments, and no owner has been added in its place — not a human name, not
"unassigned." No comment on this branch carries `PROVISIONAL` marker text of any kind any longer —
each comment cites `docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md` directly
(Category B, rows B3/B4/B5) as the settled disposition, via the "Unsourced — ..." wording quoted
above. The numeric values (`10_000`, `5 * 1024 * 1024`, `5`) are unchanged by this edit.

**Revisit trigger, per DDR-0002:** observed real operational incidents (timeouts firing on
legitimate slow sources, the size cap truncating legitimate long-form sources, the redirect cap
breaking legitimate chains) — not a scheduled calibration or measurement dispatch. DDR-0002 also
flags a scope limit specific to `MAX_RESPONSE_BYTES`: it stays Category B only while it remains a
hard reject rather than a silent truncation. Confirmed live in this branch:
`src/services/ssrfGuardedFetch.ts:270-278` throws `Response exceeded maximum size of
${MAX_RESPONSE_BYTES} bytes` and aborts the fetch — it does not truncate and return partial content
— so the Category B classification holds. If that behavior is ever changed to a silent truncation,
`MAX_RESPONSE_BYTES` returns to Category A and requires a real measurement, per DDR-0002's own
stated scope limit.

### 4.6a `FetchResult` gains `finalUrl` (SOL-MEDIUM-1 fix — required for §4.8's canonical identity)

§4.8's `canonical_url` mechanism requires the FINAL, post-redirect URL — the URL a source's content
was actually retrieved from, after every redirect hop `fetchWithGuards` follows, not the URL
originally submitted. Live `src/services/ssrfGuardedFetch.ts:183-187`'s `FetchResult` interface
today is `{ statusCode: number; statusMessage: string; body: string }` — no URL field of any kind.
`computeSourceResolution` derives `canonical_url` from the same fetch call — no second network
call — which requires `FetchResult` to carry a URL; this section specifies that field.

**Fix — `FetchResult` gains a required `finalUrl: string` field, populated at the one point
`fetchWithGuards` actually knows it: the terminal, non-redirect branch of its own recursive
resolution.**

```typescript
export interface FetchResult {
  statusCode: number;
  statusMessage: string;
  body: string;
  finalUrl: string; // SOL-MEDIUM-1 fix — the post-redirect URL this response was actually retrieved
                     // from; `startUrl.toString()` at the exact call frame that resolves (not
                     // recurses), since `fetchWithGuards` already re-invokes itself with the
                     // redirect target as `startUrl` at every hop (`fetchWithGuards.ts`'s existing
                     // `fetchWithGuards(nextUrl, redirectsLeft - 1).then(resolve, reject)` call) —
                     // the terminal frame's own `startUrl` IS the final URL by construction, no
                     // new state, no new parameter threading across hops.
}
```

The one edit this requires: the existing `resolve(...)` call inside the terminal (non-redirect,
`res.on('end', ...)`) branch of `fetchWithGuards` (today constructing `{ statusCode, statusMessage,
body }`) now also includes `finalUrl: startUrl.toString()` — `startUrl` at that exact point in the
function is already the final, fully-resolved URL, since every redirect hop re-invokes
`fetchWithGuards` with the redirect target as ITS `startUrl` rather than mutating a shared variable.
No new parameter, no new call site, no change to the redirect-following logic itself.

Both existing callers of `fetchWithGuards` — `resolveSourceArtifact.ts`/`computeSourceResolution`
(§1.4a) and `searchWeb.ts`'s `retrieveAndClassify` (§4.8's searchWeb write-path fix, below) — gain
access to `finalUrl` for free from this one additive field; neither needs its own redirect-following
logic or a second fetch. `computeSourceResolution`'s `canonical_url` derivation (§4.8) now reads
`fetchResult.finalUrl` (not the originally-submitted `raw` URL) before applying `URL` normalization
and tracking-parameter stripping — this is the "final, post-redirect URL" §4.8 already specified in
prose, now backed by an actual field to read it from.

**Regression coverage (required, this fix):** a test asserting that fetching a URL which redirects
(via the SSRF-guarded module's own existing redirect-following, mocked or against a real
test-controlled redirect chain) returns a `FetchResult.finalUrl` equal to the terminal URL, not the
originally-requested one — proving the field is populated from the actual terminal frame, not
echoed back from the caller's original input.

### 4.7 Validity/Invalidation Service (US-12)

Contract reused verbatim from `problem-department-mvp/02-ARCHITECTURE.md` §4 ("Validity /
Invalidation Service (Q-3)" and the two `getAssignedState*` queries) — not redesigned, per
`01-REQUIREMENTS.md`'s binding instruction to reuse the exact already-committed bitemporal contract.

```typescript
// src/services/validityState.ts (new)

function assignValidityState(input: {
 targetType: 'claim-version' | 'brief-version';
 targetId: string;
 assignedState: AssignedValidityState;
 effectiveAt: string; // when this became true in the represented world; may be in
 // the past, to record a late-discovered correction
 reason: string;
 recordedBy: string; // system/process identifier, not a human actor (§3.6)
}): Promise<{
 statusEvent: StatusEvent;
 dependentDecisionIds: string[]; // computed at call time, not stored redundantly — see steps
 // below (US-12 AC2)
}>;

/** Revised: thrown by assignValidityState BEFORE the append-only INSERT when
 * targetId does not exist as a row of the claimed targetType — since the row can never be
 * corrected once written, existence/type is validated at write time, not left as a possible
 * dangling reference. */
class InvalidValidityTargetError extends Error {}

// Query 1 — current-knowledge: "what state is currently assigned as effective at time T?"
// Latest StatusEvent for (targetType, targetId) with effectiveAt <= asOf, evaluated against
// everything ever recorded (no recordedAt bound); 'valid' if no StatusEvent exists. This answer
// CAN change over time if a later, backdated StatusEvent is recorded — expected (US-12 AC5).
// Ordering: "latest" is ORDER BY effective_at DESC, recorded_at DESC, sequence DESC
// LIMIT 1 — `sequence` (§3.6, a monotonic BIGSERIAL) is the deterministic tiebreak for two events
// on the same target with equal effective_at AND equal recorded_at (both are caller-supplied /
// clock-derived and not guaranteed distinct); `sequence` is DB-assigned insertion order and is
// always distinct, so ordering is fully deterministic in every case, never ambiguous.
function getAssignedState(input: {
 targetType: 'claim-version' | 'brief-version';
 targetId: string;
 asOf?: string; // defaults to now
}): Promise<AssignedValidityState>;

// Query 2 — as-of-knowledge: "what state had Department OS recorded as effective at time T, as of
// knowledge-time K?" Latest StatusEvent with effectiveAt <= asOf AND recordedAt <= knownAsOf;
// 'valid' if none exists. knownAsOf is required — no default (US-12 AC4).
function getAssignedStateAsRecorded(input: {
 targetType: 'claim-version' | 'brief-version';
 targetId: string;
 asOf?: string; // defaults to knownAsOf
 knownAsOf: string; // required, no default
}): Promise<AssignedValidityState>;
```

**`assignValidityState` orchestration** (US-12 AC2, dependent-decision reconstruction):

0. **Target existence/type validation, BEFORE the INSERT.** Within the same
 transaction as step 1's insert: `SELECT 1 FROM claim_version WHERE id = $1` (when
 `targetType === 'claim-version'`) or `SELECT 1 FROM brief_version WHERE id = $1` (when
 `targetType === 'brief-version'`). Zero rows → roll back, throw `InvalidValidityTargetError` —
 no `StatusEvent` is ever written for a dangling or wrong-type target. This closes the gap a
 polymorphic (non-FK) `target_id` column (§3.6) would otherwise leave open, since Postgres cannot
 enforce it declaratively.
1. Append a new `StatusEvent` row (`status_event`, §3.6) — never an update to an existing row.
 Same transaction as step 0, so validation and insert are atomic (no window where a status_event
 references a target that was concurrently deleted — not that any table in this schema is
 deletable today, but the transaction boundary makes this true structurally rather than by
 accident of "nothing deletes yet").
2. Resolve every `BriefVersion` that references `targetId`: when `targetType === 'brief-version'`,
 the single matching `BriefVersion` itself; when `targetType === 'claim-version'`, every
 `BriefVersion` whose `claimVersionIds` includes `targetId` (reverse lookup via
 `WHERE $1 = ANY(brief_version.claim_version_ids)` against the `brief_version.claim_version_ids
 UUID[]` column, migration 007, unchanged schema).
3. For each matching `BriefVersion`, read every `Decision` bound via `Decision.briefVersionId`
 (`getDecisionsForBriefVersion`, §4.5, reused unmodified).
4. Filter to `Decision`s where `getAssignedStateAsRecorded({ targetType, targetId, asOf:
 decision.decidedAt, knownAsOf: decision.decidedAt })` returns `'valid'` — i.e. the target's
 assigned state, reconstructed exactly as Department OS knew it at the moment the decision was
 made, was last `'valid'`. `knownAsOf = Decision.decidedAt` is the exact contract
 `problem-department-mvp/02-ARCHITECTURE.md` (~line 2222) and `01-REQUIREMENTS.md`'s task description bind — reused, not
 redesigned.
5. `dependentDecisionIds` = the filtered `Decision.id[]`. An Investigation/`BriefVersion` with zero
 `Decision`s recorded yet returns `[]` — a real, correct answer, not an error (Edge Cases table).

**No browser-reachable trigger.** `assignValidityState` is called only from service code, a test
harness, or Forge verification this checkpoint (Out of Scope) — no Express route, no client `api.ts`
export, no UI control anywhere in §5 invokes it.

**Read-side wiring**: `getBriefForReview` (§3.3) and `getInvestigationWorkspace` (§4.4, revised
below) both call `getAssignedState` per `BriefVersion`/`ClaimVersion` they resolve — this is the
only change to either function's *behavior* this revision makes; neither function's *return shape*
changes (`assignedState` was already a documented field in both, previously resolving through the
fallback described in §3.3's revised note).

`getInvestigationWorkspace` (§4.4) step 3 is revised to additionally compute, per `BriefVersion` in
`briefs`: `assignedState` via `getAssignedState({ targetType: 'brief-version', targetId:
briefVersion.id })`, and `isSuperseded` via the same structural check `getBriefForReview` already
uses (`BriefVersion.supersedesVersionId` — some other row in this `problemBriefId`'s lineage names
this one). No new query round-trip beyond what this step already requires — `getAssignedState` is
called once per `BriefVersion` in the existing loop, not added as a separate pass.

**`forwardSupersededByVersionNumber`.** In the same §4.4 step 3 loop, for each row in `rawBriefVersionRows`, find the
(at most one) OTHER row under the same `problemBriefId` whose own `supersedesVersionId` equals this
row's `id` — i.e. `rawBriefVersionRows.find(other => other.supersedesVersionId ===
briefVersion.id)` against the same already-fetched `rawBriefVersionRows` array `isSuperseded` is
computed from (no second query; this is a lookup over the array already in memory, not a new
round-trip — never a lookup against the shaped `briefs`/`WorkspaceBriefSummary[]` output array,
which declares no `supersedesVersionId` field, §3.2). If found,
`forwardSupersededByVersionNumber` = that other row's `versionNumber`; if not found (i.e.
`isSuperseded` is `false`), `forwardSupersededByVersionNumber` = `null`. This is the exact fact
`isSuperseded` already asserts exists — `forwardSupersededByVersionNumber` merely resolves it to a
human-readable version number rather than leaving it as a boolean.

### 4.8 Resubmission Eligibility Check (US-13)

```typescript
// src/services/getInvestigationWorkspace.ts (helper)
function hasEligibleNewEvidenceSinceCurrentBriefVersion(investigationId: string): Promise<boolean>;
```

**Mechanism — exact persisted consumption facts, not a timestamp window at the eligibility-query
layer.** A new join table records precisely which `source_artifact` rows each `GenerationRun`
actually had the opportunity to consume:

```sql
-- 012_generation_run_consumed_source.sql
CREATE TABLE IF NOT EXISTS generation_run_consumed_source (
 generation_run_id UUID NOT NULL REFERENCES generation_run(id),
 source_artifact_id UUID NOT NULL REFERENCES source_artifact(id),
 PRIMARY KEY (generation_run_id, source_artifact_id)
);
```

**Ledger content — the full resolved-source set this run had the opportunity to use, not the
subset that produced surviving `EvidenceItem` rows.** `universeSourceArtifactIds`
(`generateBriefVersion.ts:479`, `new Set(universe.map(e => e.sourceArtifactId))`) is derived from
`EvidenceItem` rows only (`startSnapshot` ∪ `extraction.evidenceItems` ∪
`landscape.landscapeEvidenceItems`), and `extractClaimsAndEvidence` inserts an `EvidenceItem` only
for what the extraction model actually returned per source (`extractClaimsAndEvidence.ts:485-503`).
A `'content-retrieved'` source the model extracted nothing from yields ZERO `EvidenceItem` rows and
so never appears in `universeSourceArtifactIds`, even though it was fully available to and considered
by this run's own Extraction step (Extraction always runs over the Investigation's ENTIRE
content-retrieved source set — `extractClaimsAndEvidence.ts:390-398` — never a pre-filtered subset).
A ledger keyed off `universeSourceArtifactIds` would therefore never record such a source as
consumed, leaving it "not yet consumed" forever — including immediately after the very first
successful generation with no new source ever added, since a first run's own content-retrieved
sources producing zero evidence would satisfy every clause of the eligibility anti-join below.
Writing the ledger from the earlier `startSnapshot` (`:330`, before Extraction runs) is separately
wrong: `getEvidenceForInvestigation`
reads from `evidence_item` (`getEvidenceForInvestigation.ts:22-27`), which is EMPTY for a first-ever
run, so `startSnapshot` alone is always empty on that run regardless of the fix below.

**The fix: derive the ledger from `source_artifact.resolution_status` directly, not from
`EvidenceItem` presence — and from Extraction's own real read set, not an independently re-derived
snapshot.** The exact mechanism, and why it closes both the zero-evidence gap above and the
timing gaps a naive resolution-status read would leave open, is specified in full immediately
below.

**The mid-run over-recording gap, and the exact fix.** Reading the resolved-source set independently
at `:479` — after Extraction (`:333`) and Landscape (`:393`) have already run — risks recording a
source as consumed by a run that never actually had the opportunity to read it: a source added via
the Add-Source connector and resolved to `'content-retrieved'` WHILE this run is still in-progress
(after `:333`/`:393` but before `:479`) would, under a plain resolution-status filter at `:479` alone,
be recorded as consumed even though Extraction's own read at `:333` never saw it — permanently
disqualifying that genuinely-new source from ever unlocking US-13 eligibility. Bounding the `:479`
read by the run's own `started_at` timestamp avoids that
false-disqualification, but at the cost of a narrower, opposite gap: a source that resolves to
`'content-retrieved'` in the window `(started_at, :333]` — after the run starts but before
Extraction's own internal read executes — IS actually read and reflected in the current
`BriefVersion` (Extraction re-reads the live resolved-source set at its own call time, independent of
`started_at`), yet a `startedAt`-only filter would exclude it from the ledger, leaving it falsely
eligible for a redundant correction that adds no evidence beyond what the current Brief already
reflects.

**The precise fix: ledger the exact source set Extraction itself actually read, not an inferred
timestamp bound.** `extractClaimsAndEvidence` already computes the real answer to "which
`content-retrieved` sources did this run's Extraction step actually consider" as `usableSourceIds`
(`extractClaimsAndEvidence.ts:392-397`) before delegating to
`extractClaimsAndEvidenceForSourceArtifacts` — this is not an approximation, it is the literal set
Extraction reads. `extractClaimsAndEvidence`'s return type gains one additive field,
`usableSourceIds: string[]` (the same array already computed internally, now surfaced rather than
discarded), and `generateBriefVersion.ts` captures that returned set directly instead of making a
second, independent `getInvestigation` call bounded by `started_at`:

```typescript
// generateBriefVersion.ts, immediately after Extraction (`:333`) resolves — captures the exact set
// Extraction itself already read (not an independent getInvestigation + startedAt-bound re-read),
// eliminating both the false-disqualification risk (a source
// resolved mid-run, before Extraction's own read, is correctly included) and the false-eligibility
// gap (a source resolved after Extraction's own read, even if before `:479`, is correctly excluded,
// since Extraction never saw it).
const primaryUsableSourceIds = extraction.usableSourceIds;
```

**SELF-4 fix — landscape research's own read set is unioned in, not silently dropped.**
`consideredSourceArtifactIds` is not written from `extraction.usableSourceIds` alone: primary
Extraction runs at
`:333`, BEFORE Landscape Research's own `extractClaimsAndEvidenceForSourceArtifacts` call
(`landscapeResearcher.ts:272`, reached from `generateBriefVersion.ts:393`) has even executed, so
`extraction.usableSourceIds` at that point cannot possibly contain any landscape-research-origin id.
A source incorporated only through landscape research would therefore have no ledger row if the
primary set alone were used, and could later be resubmitted (verbatim, by an operator who happened
to already know its URL) and falsely register as new evidence — the fix below closes this.

**Fix.** `extractClaimsAndEvidenceForSourceArtifacts` (`extractClaimsAndEvidence.ts:410-...`) gains
the identical additive return field `extractClaimsAndEvidence` already has —
`usableSourceIds: string[]`, populated from its own already-computed `knownSourceIds`
(`extractClaimsAndEvidence.ts`'s internal `usableSources.map((s) => s.id)`, the literal set of
`source_artifact` ids THIS call actually extracted from, scoped to the ids
`landscapeResearcher.ts:272` passed in as its own `sourceArtifactIds` parameter — no new
computation, the array already exists internally, only surfaced rather than discarded, same pattern
as the primary function's own fix above). `generateBriefVersion.ts` captures this second set
immediately after Landscape Research's own call resolves (`:393`, alongside its existing handling of
that call's result) and unions it with the primary set captured above, immediately before the ledger
write at `:479` — the write is unmoved (still the same standalone `INSERT`, still at `:479`, still
after every extraction pass the run performs has completed), only its input is now the union:

```typescript
// generateBriefVersion.ts, immediately before the ledger INSERT at :479 — union of both
// extraction passes' own real read sets, computed after both have executed (Landscape Research's
// own call at :393 has already resolved by this point in every code path, whether or not it
// actually performed any research this run).
const consideredSourceArtifactIds = Array.from(
  new Set([...primaryUsableSourceIds, ...(landscapeResult?.usableSourceIds ?? [])]),
);
```

(`landscapeResult?.usableSourceIds` is `undefined`/absent whenever Landscape Research does not run
or produces no extractable sources this run — the union then degrades to exactly the primary set,
unchanged from before this fix, so this is purely additive.)

The ledger write remains a standalone `INSERT` at `:479` (Phase 3 check 1(c), independent of any
`GenerationStep` write), one row per id in this UNIONED `consideredSourceArtifactIds`, NOT
`universeSourceArtifactIds`. Because this now reflects the union of BOTH extraction passes' own real
read sets rather than an inferred boundary or a primary-only set, a `'content-retrieved'` source that
yields zero extracted evidence is still recorded consumed (both extraction functions read over their
respective ENTIRE scoped content-retrieved source sets, `extractClaimsAndEvidence.ts:390-398`/
`:410-419`, so `usableSourceIds` includes a source regardless of whether it produced any
`EvidenceItem`) — closing the zero-evidence gap identified above without reopening the mid-run gap,
and without leaving the narrower Extraction-read-boundary gap a `startedAt` comparison alone could
not close, AND without leaving landscape-research-consumed sources permanently outside the ledger.
The ledger records BOTH `origin: 'submitted'` and `origin: 'landscape-research'` rows alike (no
origin filter at write time, and now genuinely both are actually present in the unioned set, not
just theoretically eligible to be); the eligibility query below already restricts to `sa.origin =
'submitted'` at READ time, so recording `'landscape-research'` rows here too is harmless (they can
never satisfy the query's own `origin` filter) and keeps the ledger a simple, complete,
origin-agnostic fact about what this run's two extraction steps actually read, rather than
duplicating origin-filtering logic in two places. This is a real fact about what this run's own code
paths actually read — not an inference from timing, from `started_at`, or from evidence survival —
and it requires no timestamp comparison at all, since both `usableSourceIds` sets are each
extraction function's own real read set at the moment it read it.


**SOL-MEDIUM-1 fix — canonical source identity and resolved-content fingerprint, not exact-string
equality alone.** The `trim(raw)` anti-join below catches only a byte-for-byte-identical
resubmission of the same raw input. It does not catch: (a) the same URL submitted with a different
scheme/trailing-slash/query-tracking-parameter/case-of-host, (b) a URL that redirects to a location
already consumed under a different original URL, or (c) the same underlying document reached
through two textually different URLs (e.g. a canonical link and a redirect-shortener link to it).
US-13 AC2's "duplicate of an already-consumed source... even though it is a distinct Source row"
disqualifier is not scoped to exact-string duplicates only — the fix below closes the full
requirement, not a narrowed exact-match subset of it.

**Where this is computed, and what it requires.** Three additive columns on `source_artifact`
(SOL-MEDIUM-1 fix — the SQL block below carries all three columns this section
and §1.4a both describe as living in migration `013`; the SQL block is the single
source of truth and matches every prose reference to it), added in a new migration
`013_source_artifact_canonical_identity.sql` (`013`, the next unused migration number after `012`;
C2-S2's own scope, alongside `009` and §1.4a/§1.4b, since this is where
`computeSourceResolution`/`resolveSourceArtifact` already live and all three new columns are
populated exactly once, at resolution time, inside that same function):

```sql
-- 013_source_artifact_canonical_identity.sql
ALTER TABLE source_artifact
 ADD COLUMN IF NOT EXISTS canonical_url TEXT,
 ADD COLUMN IF NOT EXISTS resolved_content_hash TEXT,
 ADD COLUMN IF NOT EXISTS resolution_revision INTEGER NOT NULL DEFAULT 0; -- §1.4a SOL-MEDIUM-2's CAS
                                                                          -- counter — same migration,
                                                                          -- one ALTER TABLE, all
                                                                          -- three additive columns

-- SOL-MEDIUM-1 fix — one-time backfill for EXISTING, already-resolved rows. Adding these columns
-- nullable-only (above) leaves every pre-migration `'content-retrieved'` row with NULL
-- canonical_url/resolved_content_hash; the eligibility query's own anti-joins already exclude NULL
-- identity values from the "already consumed" comparison set (`WHERE consumed_sa.canonical_url IS
-- NOT NULL`/`consumed_sa.resolved_content_hash IS NOT NULL`), so an equivalent NEW submission could
-- otherwise bypass an existing consumed row purely because that row predates this migration.
--
-- (1) resolved_content_hash — fully backfillable, no network call: every 'content-retrieved' row
-- already has a non-NULL resolved_content (§1.4b/§4.8's own documented invariant), so its hash is
-- a pure function of already-persisted data. This is plain SQL with no TypeScript dependency, so
-- it runs here, inside migration 013 itself, in the same transaction as the ALTER TABLE above.
UPDATE source_artifact
   SET resolved_content_hash = encode(sha256(convert_to(resolved_content, 'UTF8')), 'hex')
 WHERE resolution_status = 'content-retrieved'
   AND resolved_content IS NOT NULL
   AND resolved_content_hash IS NULL;
```

**`canonical_url`'s backfill cannot live inside migration `013` itself, and is specified as a
separate, named, manually-run script instead.** `src/db/migrate.ts`
executes every file under `src/db/migrations/` as a raw SQL string passed
directly to `client.query(sql)`, one file per transaction — the migration runner has no hook of any
kind for invoking TypeScript application code mid-migration, so a `.sql` file cannot call the real
`canonicalizeUrl(raw)` helper directly. The column-add and the backfill are specified as two
honestly-described steps:

- **Migration `013` itself** — transactional and automatic, exactly like every other migration: the
  `ALTER TABLE` above (all three columns) plus the plain-SQL `resolved_content_hash` backfill above
  (no TypeScript dependency, so no reason to defer it). `canonical_url` is left `NULL` for every
  pre-migration row by migration `013` alone — the `ALTER TABLE` adds the column nullable, nothing
  in this migration file populates it.
- **`src/db/scripts/backfill-013-canonical-url.ts` (new, named, manually-run, NOT part of any
  migration file or transaction)** — a small one-off script that selects every `type = 'url'`,
  `resolution_status = 'content-retrieved'` row with `canonical_url IS NULL`, calls the REAL
  `canonicalizeUrl(raw)` helper (§4.8, `src/services/sourceCanonicalization.ts`) directly on each
  row's stored `raw` value — no duplicated normalization logic, one implementation only — and
  writes the result back with its own `UPDATE ... WHERE id = $1`. Forge runs this script manually,
  once, immediately after migration `013` applies and before any other checkpoint work resumes;
  this is part of C2-S2's own Done-When (§4.8/roadmap C2-S2), not an optional cleanup step. Because
  this runs as a genuinely separate step from the `ALTER TABLE`, it is explicitly NOT transactional
  with the column-add — a crash between the two leaves `canonical_url` `NULL` for pre-migration
  rows exactly as it already is immediately after migration `013` alone, which is a safe, no-worse-
  than-todo intermediate state (the eligibility query's `NULL`-tolerant anti-join fallback below
  already handles it), not a corrupted one.
- This backfill remains an explicitly disclosed DEGRADED fallback, not the real mechanism, for the
  same reason as before: it is NOT fully backfillable without a live re-fetch (this script performs
  no network I/O), since the true canonical value requires the FINAL post-redirect URL (§4.6a),
  which is not recoverable from a stored `raw` value alone for a row that redirected. Calling the
  real `canonicalizeUrl` helper against `raw` (instead of a resolved `finalUrl`) closes the majority
  of the pre-migration gap (case/scheme/trailing-slash/tracking-parameter variants of the SAME
  already-consumed URL) but does NOT close the redirect-normalization case (gap (b), §4.8) for rows
  resolved before this migration — a pre-migration row that was reached via a redirect will
  backfill to its ORIGINAL, not final, URL. This limitation is accepted and disclosed here, not
  silently narrowed: every row resolved AFTER migration `013` ships computes the real, final-URL-
  derived `canonical_url` per §4.8's live mechanism (inside `computeSourceResolution`, at resolution
  time), so the degraded case is bounded to the existing-data population at migration time and does
  not grow. A new test (`src/db/scripts/backfill-013-canonical-url.test.ts`) asserts the script
  calls the real, imported `canonicalizeUrl` helper (not a hand-duplicated copy of its logic) and
  correctly skips rows that are not `type = 'url'`/`'content-retrieved'` or whose `canonical_url` is
  already non-`NULL`.

**Eligibility-query fallback rule for any row this backfill still cannot resolve** (a `'url'` row
whose `raw` itself fails `URL` parsing, or a `'text'` row, for which `canonical_url` is `NULL` by
design and stays `NULL` even after backfill): the eligibility query's existing `canonical_url IS
NULL OR canonical_url NOT IN (...)` structure already treats a `NULL` candidate `canonical_url` as
"no canonical-identity anti-join contribution for this row" — this is unchanged and correct; it
falls through to the `trim(raw)`/`resolved_content_hash` anti-joins, which the backfill above does
make fully effective for every pre-migration row (`resolved_content_hash` has no degraded case,
unlike `canonical_url`). No pre-migration row is left with a weaker guarantee than "duplicate
content is caught by hash, duplicate raw text is caught by trim, duplicate canonical URL is caught
prospectively from this migration forward and retroactively wherever the disclosed degraded backfill
could compute one."

- `canonical_url` — populated only for `type === 'url'` sources, inside `computeSourceResolution`
  (§1.4a), immediately after the guarded fetch resolves any redirect chain, reading `§4.6a`'s
  `FetchResult.finalUrl` (SOL-MEDIUM-1 fix — the same fetch call `ssrfGuardedFetch`/`resolveSourceArtifact`
  already makes; no second network call, and now a real field to read the final URL from, rather
  than an assertion that one was available). Computed from the FINAL, post-redirect URL (closing gap
  (b) above) via Node's built-in `URL` normalization (lower-cased scheme and host, default port
  stripped, trailing slash on a bare path normalized, fragment stripped) plus stripping of
  well-known query-tracking parameters (`utm_*`, `gclid`, `fbclid` — among the most commonly
  documented URL tracking parameters in general web practice; an allowlist-of-strip-targets, not a
  numeric threshold, so no PROVISIONAL tag is owed here, but the honest framing is that this is a
  reasonable-but-inherently-incomplete static list, not an exhaustive one — a tracking parameter
  this list misses does not cause a valid duplicate to be missed silently: `resolved_content_hash`
  below is the real backstop, catching byte-identical content regardless of which URL parameters
  differ). `null` for any non-`'content-retrieved'` outcome or any non-`'url'` source (nothing to
  canonicalize).
- `resolved_content_hash` — populated for every `type` whenever `resolution_status ===
  'content-retrieved'`, inside the same function, immediately after `resolved_content` is computed:
  a SHA-256 hex digest of `resolved_content` (Node's built-in `crypto.createHash('sha256')`, no new
  dependency). This is what closes gap (c): two textually different URLs (or a `url` and a `text`
  source) that resolve to byte-identical content hash identically, independent of how they were
  addressed. `null` for any non-`'content-retrieved'` outcome.

Both columns are written by the SAME `UPDATE`/`INSERT` `resolveSourceArtifact`'s `persistResolution`
(or, for the single-source re-check path, `recheckSourceArtifact`'s own compare-and-set `UPDATE`,
§1.4a) already performs — no new write path, no new transaction, additive columns on an existing
row write.

**SOL-MEDIUM-1 fix — `searchWeb.ts`'s own direct `source_artifact` insert is a THIRD write path and must
compute and persist both fields too.** Live `searchWeb.ts:247-253` inserts a `source_artifact` row
directly for every landscape-research result classified `'retrieved'`, entirely independent of
`resolveSourceArtifact`/`computeSourceResolution`. Computing canonical-identity fields only inside
`computeSourceResolution` would leave every
landscape-research-origin `source_artifact` row with permanently `NULL` `canonical_url`/
`resolved_content_hash`, letting an equivalent duplicate bypass the eligibility query's
anti-join entirely for this entire origin. Fix: `searchWeb.ts`'s `retrieveAndClassify` (§4.6a)
already has access to `fetchWithGuards`'s `finalUrl` field for every result it retrieves; before its
`INSERT INTO source_artifact` at `:247`, it now computes `canonicalUrl` (via the SAME `URL`-
normalization-plus-tracking-parameter-stripping logic `computeSourceResolution` uses — extracted
once, this checkpoint, into a small shared helper, `canonicalizeUrl(finalUrl: string): string`, in
`src/services/sourceCanonicalization.ts` (new, tiny, pure function, no dependency of its own on
`resolveSourceArtifact.ts` or `searchWeb.ts` so both can import it without a circular dependency) so
this is genuinely one implementation, not two independently-maintained copies) and
`resolvedContentHash` (the same SHA-256-of-`resolvedContent` computation, inlined or via the same
shared helper module) and includes both in that `INSERT`:

```sql
-- searchWeb.ts:247, extended (SOL-MEDIUM-1 fix — was: investigation_id, submission_id, type, raw, origin,
-- resolution_status, resolution_resolved_at, resolved_content only)
INSERT INTO source_artifact
   (investigation_id, submission_id, type, raw, origin,
    resolution_status, resolution_resolved_at, resolved_content,
    canonical_url, resolved_content_hash)
 VALUES ($1, NULL, 'url', $2, 'landscape-research', 'content-retrieved', now(), $3, $4, $5)
 RETURNING id;
```

This closes the third of the three write paths SOL-MEDIUM-1 identified (`resolveSourceArtifact`'s own
`persistResolution`, `recheckSourceArtifact`'s compare-and-set `UPDATE`, and now `searchWeb.ts`'s
direct insert) — every `source_artifact` row this system can ever create now has its canonical
identity populated at the moment of its own creation/resolution, regardless of which of the three
code paths created it.

**Eligibility query** — an anti-join against the current `BriefVersion`'s producing run, by `id` (an
already-consumed row, resubmitted unchanged), by exact trimmed `raw` content (a NEW
`source_artifact` row — its own distinct id, never itself in the consumed table — whose content is
byte-for-byte the same evidence already consumed under a different row), AND by the two canonical-
identity columns above (`canonical_url`, `resolved_content_hash`) — closing the redirect/
normalization/cross-URL-same-content gaps the `trim(raw)` check alone cannot catch. Content-identity,
not row identity or raw-string identity, is what US-13 AC2's "duplicate of an already-consumed
source... even though it is a distinct Source row" disqualifier requires in full; excluding only by
`id`, or only by `trim(raw)`, would both leave real disqualified cases reachable, since a resubmission always gets a
fresh `source_artifact.id` and need not be byte-identical raw text to be the same underlying source:

```sql
SELECT EXISTS (
 SELECT 1
 FROM source_artifact sa
 WHERE sa.investigation_id = $1
 AND sa.origin = 'submitted' -- operator-submitted only; a pipeline-inserted
 -- landscape-research source can never itself
 -- unlock eligibility
 AND sa.resolution_status = 'content-retrieved' -- excludes unreachable/unresolved and empty
 AND sa.id NOT IN (
 SELECT source_artifact_id
 FROM generation_run_consumed_source
 WHERE generation_run_id = $2 -- the current BriefVersion's producing GenerationRun
 )
 AND trim(sa.raw) NOT IN (
 SELECT trim(consumed_sa.raw)
 FROM generation_run_consumed_source grcs
 JOIN source_artifact consumed_sa ON consumed_sa.id = grcs.source_artifact_id
 WHERE grcs.generation_run_id = $2 -- same producing run — a verbatim-content
 -- resubmission under a new source_artifact.id is
 -- still excluded, closing the id-only gap above
 )
 AND (
 sa.canonical_url IS NULL
 OR sa.canonical_url NOT IN (
 SELECT consumed_sa.canonical_url
 FROM generation_run_consumed_source grcs
 JOIN source_artifact consumed_sa ON consumed_sa.id = grcs.source_artifact_id
 WHERE grcs.generation_run_id = $2 AND consumed_sa.canonical_url IS NOT NULL
 )
 ) -- SOL-MEDIUM-1 fix: a redirect, tracking-parameter, or case/scheme variant of an already-
 -- consumed URL is excluded even though its raw text differs
 AND (
 sa.resolved_content_hash IS NULL
 OR sa.resolved_content_hash NOT IN (
 SELECT consumed_sa.resolved_content_hash
 FROM generation_run_consumed_source grcs
 JOIN source_artifact consumed_sa ON consumed_sa.id = grcs.source_artifact_id
 WHERE grcs.generation_run_id = $2 AND consumed_sa.resolved_content_hash IS NOT NULL
 )
 ) -- SOL-MEDIUM-1 fix: the same underlying document reached through two textually different
 -- URLs (or a url/text source pair) resolving to byte-identical content is excluded
) AS eligible;
```

1. Read `ProblemBrief.currentVersionId` for `investigationId`; if no `ProblemBrief` exists yet,
 return `false` (an initial generation is gated by the `'open'` branch of §4.2's eligibility rule,
 not this one).
2. Read that `BriefVersion.generationRunId` — the producing run whose
 `generation_run_consumed_source` rows are the exact resolved-source snapshot (§4.8 above,
 `consideredSourceArtifactIds`, the UNION of the primary Extraction's and Landscape Research's own
 real `usableSourceIds` read sets at write time, SELF-4 fix) that run actually had the opportunity
 to use.
3. Run the query above. Eligible iff at least one `'submitted'`, resolved, non-consumed,
 non-duplicate-of-consumed source exists for this Investigation.

This satisfies every one of US-13 AC2's four disqualifiers: **unreachable
or unresolved** (`resolution_status = 'content-retrieved'` excludes both, along with every
non-terminal/failed state); **empty** (`resolution_status = 'content-retrieved'` excludes it PROVIDED
`resolveSourceArtifact`/`computeSourceResolution` never classifies blank/whitespace-only text as
`'content-retrieved'` — this is NOT true of today's live `type: 'text'` code path and is fixed by
§1.4b, a required Forge-slice edit assigned to C2-S2, not an existing guarantee); **a duplicate of an
already-consumed source, even under a distinct row** (the `trim(raw)` anti-join, now joined by the
`canonical_url`/`resolved_content_hash` anti-joins, SOL-MEDIUM-1 fix, closing the redirect/
normalization/cross-URL-same-content cases exact-string equality alone cannot catch); and **already
reflected in the current `BriefVersion`** (the `id`-based anti-join — the exact row Extraction
actually read). A source added during the run but never reached because the run failed before
Extraction's own read (`:333`) has no `generation_run_consumed_source` row under either anti-join and
correctly counts as eligible; the same is true, by construction, for a source that only becomes
`'content-retrieved'` AFTER Extraction's own read executes, even if that happens before the ledger
write at `:479` — `usableSourceIds` is Extraction's own real, already-executed read, so a source it
never saw is never in that set regardless of when in the pipeline the ledger write itself runs. A
`'content-retrieved'` source that resolved before Extraction's own read — whether or not extraction
produced any surviving `EvidenceItem` from it, and whether or not any resulting evidence fed a
claim-linked recommendation — is still recorded consumed (the join table records "was available to
and actually read by this run's Extraction step," not "produced evidence" or "produced a claim"), so
it cannot be resubmitted, verbatim or under a new row, to falsely register as new. Because
`consideredSourceArtifactIds` is derived directly from the union of both extraction passes' own
real read sets (SELF-4 fix) rather than inferred from a `started_at` timestamp comparison or a
primary-only set, there is no window or boundary logic at all in this mechanism, and no residual
timing edge case, and no origin left permanently outside the ledger: the ledger records exactly
what this run's own code paths actually read, not an approximation of it.

No coupling to `submitSources` (unmodified) or `assignValidityState` (US-12) — this function only
reads.

**Latent (not live) edge case, disclosed for completeness**: `extractClaimsAndEvidence.ts:394-395`'s
own read of `usableSourceIds` additionally requires `typeof resolvedContent === 'string'`, while the
eligibility query above filters only on `sa.resolution_status = 'content-retrieved'`. A hypothetical
`'content-retrieved'` row with a NULL `resolved_content` would never be ledgered into
`generation_run_consumed_source` yet would still satisfy the eligibility query, leaving it
perpetually eligible. This is currently unreachable, not a live bug: both live resolver code paths
(`computeSourceResolution`/`resolveSourceArtifact`) guarantee non-null `resolved_content` on that
status today, and §1.4b's required fix tightens this further by closing the blank/whitespace-only
gap noted above. No mechanism change is made for this; it is documented here so a future change to
either resolver's contract is checked against it.

**Required tests, SOL-MEDIUM-1 fix (in addition to every other test this section and §4.9 already
specify):**

1. A pre-existing, pre-migration-shaped `source_artifact` row (`canonical_url`/
   `resolved_content_hash` both `NULL` before migration `013`'s backfill runs) is, after the
   backfill: (a) correctly EXCLUDED from eligibility once consumed, when a byte-identical or
   hash-identical resubmission is attempted (`resolved_content_hash` backfill closes this fully);
   (b) correctly EXCLUDED for a same-canonical-URL-different-tracking-parameter resubmission
   (`canonical_url` backfill's non-degraded case); and (c) for a row whose original `raw` was itself
   a redirect (the backfill's disclosed degraded case), the test asserts and documents the KNOWN
   limitation directly, rather than silently passing on a narrower case than the live mechanism
   provides for post-migration rows — a resubmission of the SAME final destination under its
   canonical form is NOT guaranteed excluded for this specific pre-migration-redirect case, and the
   test proves this is exactly the disclosed boundary, not a wider unintended gap.
2. A landscape-research-consumed source (retrieved via `searchWeb`/`extractClaimsAndEvidenceForSourceArtifacts`
   during a real run) correctly appears in that run's `generation_run_consumed_source` ledger rows
   (`origin = 'landscape-research'`) — asserted by a direct DB read after a real end-to-end run — and
   a subsequent operator submission of that exact same URL (by `raw`, by `canonical_url`, or by
   `resolved_content_hash`) is correctly excluded from US-13 eligibility by the union fix above,
   proving a landscape-incorporated source cannot be "resubmitted as new."

### 4.9 Stale/Interrupted Run Detection (US-4)

**Mechanism**: computed at `getInvestigationWorkspace` read time (§4.4 step 2), never a stored
column — no process can write to a crashed run's own row, so "stale" and "interrupted" are, for
this MVP's direct-in-process-no-crash-recovery design (Out of Scope, unchanged), the SAME
detectable signal: no further `GenerationStep` progress recorded for longer than a threshold, on a
run that has not reached a terminal `outcome`. This is honest about what a single Node process can
actually observe — there is no separate process-liveness signal available (Out of Scope: no
queue/worker/process registry), so this checkpoint does not claim to distinguish "the process is
technically still running but stuck" from "the process crashed"; both present identically to a
client with no other process to query, and both are disclosed the same way.

```typescript
// Computed inline in getInvestigationWorkspace's existing generationRuns read (§4.4 step 2), not a
// separate query per run. Also called directly by §1.6's abandonGenerationRun orchestration
// (same function, not a second implementation).
//
// Revised, 2026-08-24 whole-package convergence (C2-S2/C2-S3 sequencing fix): staleThresholdMs is
// a PARAMETER, not a closed-over module constant. This is what lets C2-S2 build and unit-test this
// function's pure branching logic (in-progress/terminal, elapsed-vs-threshold arithmetic) against
// an arbitrary injected value BEFORE C2-S3 exists to derive the real STALE_THRESHOLD_MS — the
// function itself never asserts what the real constant's value is or should be; only its ONE call
// site (getInvestigationWorkspace, wired in C2-S3 once the real derived constant exists) supplies
// that value. C2-S2's own tests pass a small, explicitly-labeled test-only value (e.g. a comment
// `// test-only threshold, not STALE_THRESHOLD_MS — see 02-ARCHITECTURE.md §4.9`) — never presented
// as, or reused as, the real engineering-derived constant.
function computeLivenessState(
 run: {
 outcome: 'in-progress' | 'succeeded' | 'failed';
 leaseHeartbeatAt: string; // generation_run.lease_heartbeat_at (§1.6) — renewed by the
 // pipeline on every recordGenerationStep call, defaulted to
 // startedAt at row creation; this, not step-completion time, is
 // the real liveness signal §1.6's fencing/heartbeat design exists
 // to provide, and it is the ONLY field this function reads to
 // determine elapsed silence
 },
 staleThresholdMs: number): { livenessState: 'active' | 'stale-or-interrupted' | 'terminal'; lastProgressAt: string | null } {
 // Returns lastProgressAt alongside livenessState — §1.6 step 5's abandon-and-retry path
 // consumes lastProgressAt in its recorded GenerationStep error text, and §1.6 explicitly forbids
 // a second, independent implementation of this arithmetic ("using the SAME computeLivenessState
 // function"). This is the one real implementation §1.6 step 3 calls directly, unmodified.
 if (run.outcome !== 'in-progress') return { livenessState: 'terminal', lastProgressAt: null };
 const lastProgressAt = run.leaseHeartbeatAt;
 const elapsedMs = Date.now() - new Date(lastProgressAt).getTime();
 return {
 livenessState: elapsedMs > staleThresholdMs ? 'stale-or-interrupted': 'active',
 lastProgressAt,
 };
}
```

**`STALE_THRESHOLD_MS` — engineering-owned, derived at Forge implementation time from real
measurement, not asserted here as a specific number.** `STALE_THRESHOLD_MS` and `POLL_INTERVAL_MS`
(§5.2) are both engineering parameters — how often to poll and how long silence must persist before
a run is disclosed as stale are questions about observed system behavior (actual generation
latency, actual concurrent load, actual endpoint cost), not product decisions Danny is positioned
to ratify by inspection at spec time. No existing timeout in this codebase's LLM/API client
configuration is directly reusable here: `src/services/llmClient.ts` (the LLM client
`generateBriefVersion` calls into) configures no timeout at all; the only existing timeout constant
in this codebase is `FETCH_TIMEOUT_MS = 10_000` (`src/services/ssrfGuardedFetch.ts`), which bounds
a single outbound source-URL fetch, not an LLM generation call or a polling cadence — cited here
for completeness, not reused as a source for this value.

**Derivation methodology (to be executed during Forge, before implementation is considered
complete)**:
1. Run real generation end-to-end and record actual elapsed time per `GenerationStep` and per full
 run — this is the same real-pipeline measurement `01-REQUIREMENTS.md`'s acceptance criteria now
 require Forge to report; do not estimate or guess at this figure.
2. From that measured distribution, set `STALE_THRESHOLD_MS` to the measured legitimate-processing
 time (a conservative percentile of observed step/run latency, not the minimum or the average)
 plus an explicit safety margin stated as a ratio or fixed addition — sized so that normal
 latency variance never trips a false stale warning, and documented as such next to the constant.
3. Set `POLL_INTERVAL_MS` from the same measurement plus expected concurrency (how many simultaneous
 investigation workspaces/polls this single-process design realistically serves, §4.2/Out of
 Scope) and endpoint cost (poll frequency vs. the actual DB read load `getInvestigationWorkspace`
 performs per poll) — frequent enough that the UI feels active during a real generation run,
 infrequent enough not to impose meaningful load at expected concurrency.
4. Record the derived values, the measured inputs they were computed from, and the safety-margin
 arithmetic as code comments directly next to `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` in
 their implementation file — not in a separate tracking artifact — per Danny's explicit
 instruction on where derived-constant evidence belongs.

This document does not assert a specific numeric default for either constant. Nothing in §4.9
depends on `STALE_THRESHOLD_MS`'s specific magnitude — only on the behavioral contract that it is
some measured-and-margined duration of no `GenerationStep` progress on a non-terminal run.

**Sequencing note (2026-08-24, whole-package convergence — resolves a C2-S2/C2-S3 build-order
contradiction).** `computeLivenessState` above takes `staleThresholdMs` as a parameter specifically
so that building and unit-testing the function's pure logic (C2-S2, alongside `WorkspaceGenerationRunSummary.livenessState` and the rest of the Workspace Read Model) does not require
`STALE_THRESHOLD_MS`'s real derived value to exist yet. Only the function's one call site — the
`getInvestigationWorkspace` read (§4.4 step 2) and §1.6's `abandonGenerationRun` — needs the real
constant, and both are wired to it in C2-S3, after §4.9's derivation methodology has actually run.
C2-S2 is complete once `computeLivenessState` is built, tested against an explicitly-labeled
test-only threshold value, and its ONE call site exists but is not yet wired to a real constant
(a `TODO`/explicit placeholder referencing this note is acceptable at that point, not a defect);
C2-S3 completes the wiring, so no sequencing conflict exists between the two slices.

**Surfaced to the workspace** as `WorkspaceGenerationRunSummary.livenessState` (§3.2) — the ONLY
field the UI may use to distinguish a healthy in-progress run from a stale/interrupted one; the
underlying `outcome` column is never overloaded to carry this distinction (`outcome` stays exactly
`'in-progress' | 'succeeded' | 'failed'`, matching the persisted `generation_run.outcome` CHECK
constraint unchanged).

A long but legitimate processing step is not
evidence of a crash — `livenessState === 'stale-or-interrupted'` is an honest disclosure that the
system cannot currently distinguish "slow but healthy" from "crashed/interrupted," not a claim that
the run is dead. Automatic polling (§5.2) stops once `livenessState === 'stale-or-interrupted'`, to
avoid imposing indefinite load on a run that may in fact never produce further progress — but this
is an automatic-polling optimization, not a claim that no further progress can ever be recorded, and
it does not end observation permanently. The workspace provides a real, honest continued-observation
mechanism past the threshold: an explicit **"Refresh status"** user action (§5.2, §5.3's
`GenerationProgressPanel`) that re-issues one `GET.../workspace` read on demand, at any time,
including repeatedly, for as long as the run remains non-terminal. If that real GenerationStep
progress has in fact continued (the underlying process was never actually interrupted — it was
simply slower than `STALE_THRESHOLD_MS`), the next `Refresh status` click observes it honestly, via
the same read model every other fact in this document comes from — no separate mechanism, no
different truth source. `livenessState` itself may revert from `'stale-or-interrupted'` back to
`'active'` on a subsequent read if fresh `GenerationStep` progress has landed since the last read
(§4.9's `computeLivenessState` is a pure function of the CURRENT read's persisted facts, recomputed
every time it runs — it has no memory of a prior read's classification, so there is no special-case
logic needed for this to work correctly). This mechanism, like every other read in this document,
never mutates persisted state — `Refresh status` is a read-only `GET`, structurally incapable of
writing anything (the same guarantee §4.9's opening paragraph already establishes for the
stale/interrupted disclosure itself, unchanged and re-verified here: a manual refresh action cannot
violate it, since it calls the same read-only `getInvestigationWorkspace` every automatic poll tick
already calls).

---

## 5. React SPA — Route and Component Boundaries

### 5.1 Router change

```typescript
// src/client/App.tsx — two new <Route>s, added inside the existing <Routes> (Checkpoint 1's shell,
// PersistentNav, and the two existing routes are unchanged):
<Route
 path="/departments/problem-department/investigations/:investigationId"
 element={<InvestigationWorkspaceScreen />}
/>
<Route
 path="/departments/problem-department/investigations/:investigationId/versions/:versionNumber"
 element={<InvestigationWorkspaceScreen />}
/>
```

Both routes render the SAME `InvestigationWorkspaceScreen` component — the second is
not a distinct screen or a "lineage browser" (Out of Scope, unchanged), it is the same workspace
told which version to display via `versionNumber` (`useParams`), reload-stable because the version
is in the URL path itself, not component state. When `versionNumber` is absent, the screen shows
`ProblemBrief.currentVersionId`'s content (current behavior, unchanged); when present, it fetches
that specific prior version via `GET.../brief-versions/by-version/:versionNumber` (§3.1a, §4.1)
instead.

Direct URL access and in-app navigation resolve to the same component and the same data fetch
(`GET.../workspace` on mount) — no separate "entered via link" vs. "entered via URL bar" code
path (US-1 AC1).

### 5.2 `InvestigationWorkspaceScreen` — state and polling

```typescript
// src/client/screens/InvestigationWorkspaceScreen.tsx
interface InvestigationWorkspaceScreenState {
 workspace: InvestigationWorkspaceView | null; // null while loading or on not-found
 notFound: boolean;
 error: string | null;
 brief: GetBriefForReviewResult | null; // fetched separately once a target version is
 // known (either workspace.briefs' isCurrent
 // entry, or the `:versionNumber` route param —
 // §5.1)
 decisionSubmission: { pending: boolean; error: string | null; confirmedDecisionId: string | null };
}
```

Polling (US-4 AC2): while `workspace.latestGenerationRun?.livenessState === 'active'` (§3.2, §4.9
— not the bare `outcome === 'in-progress'` check, so a stale/interrupted run does not poll forever), the screen re-fetches
`GET.../workspace` at an interval governed by `POLL_INTERVAL_MS` — **engineering-owned,
derived during Forge from real measured generation timing, expected concurrency, and endpoint cost,
per §4.9's derivation methodology; not a specific value fixed at spec time.** The behavioral
requirement this document commits to is: polling frequent enough that the UI reads as actively
progressing during a real generation run, without imposing meaningful load on
`getInvestigationWorkspace` at expected concurrency (§4.9). `STALE_THRESHOLD_MS` is likewise
derived, not asserted here as a multiple of a fixed `POLL_INTERVAL_MS` value — see §4.9 for the
full methodology and where the derived values and their measured evidence get recorded. Automatic polling
stops (clears the interval) once `livenessState` transitions to `'terminal'`
or `'stale-or-interrupted'` (US-4 AC6, revised) — implemented as a `useEffect` keyed on
`workspace.latestGenerationRun?.livenessState`, not a fixed-count poll budget (no additional
numeric constant is introduced for "max polls"). When `livenessState === 'stale-or-interrupted'`,
the screen renders an explicit disclosure (§5.3's `GenerationProgressPanel`) instead of continuing
to imply the run is healthily in progress — **and also renders a real
"Refresh status" control** that re-issues one `GET.../workspace` read on demand, independent of
the (now-cleared) automatic polling interval. Stopping automatic polling is an optimization against
imposing indefinite load on a run that may never progress further; it is not a claim that the run
is permanently unobservable — `Refresh status` remains available and honestly reflects whatever the
next read finds, including a reversion to `'active'` if fresh progress has in fact landed.

Brief content (§3.3's `getBriefForReview` result) is fetched once per displayed version: the
current version when no `:versionNumber` route param is present (via `workspace.briefs`' `isCurrent`
entry's `versionNumber`), or the routed `:versionNumber` directly when present (US-1 AC5, Finding
3) — via `GET /api/investigations/:investigationId/brief-versions/by-version/:versionNumber` (full
contract §3.1a, §4.1) thin-wrapping `getBriefForReview` — not embedded inside
`InvestigationWorkspaceView` itself, keeping the frequently-polled workspace payload small and the
seven-element Brief payload fetched exactly once per version, not re-fetched on every poll tick.
`submitDecision` below posts to `POST /api/brief-versions/:briefVersionId/decisions` (full contract
§3.1a, §4.1) — always against the internal `briefVersionId` the fetched `GetBriefForReviewResult`
itself carries, so a decision is only ever recorded against the exact version currently on screen,
prior or current alike (US-10 AC1).

```typescript
// src/client/api.ts — additions
export async function fetchInvestigationWorkspace(investigationId: string): Promise<InvestigationWorkspaceView>;
export async function createGenerationRun(investigationId: string): Promise<CreateGenerationRunResponseBody>;
export async function addSourcesToInvestigation(
 investigationId: string,
 artifacts: Array<{ type: SourceArtifactType; raw: string }>): Promise<CreateInvestigationResponseBody>; // §1.4, §3.1b, per the Add-Source-route ruling — thin wrapper around the
 // EXISTING createInvestigation/POST /api/investigations
 // (src/client/api.ts, unmodified), always supplying
 // investigationId; not a call to a separate route
export async function recheckSourceArtifact(
 sourceArtifactId: string): Promise<{ sourceArtifactId: string; resolutionStatus: SourceResolutionStatus; investigationStatus: InvestigationStatus }>; // §1.4a — added to this canonical additions list
export async function fetchBriefForReviewByVersionNumber(
 investigationId: string,
 versionNumber: number): Promise<GetBriefForReviewResult>; // §3.1a, revised to resolve by versionNumber
export async function submitDecision(
 briefVersionId: string,
 body: { decision: RecommendationDecision; rationale?: string; reconsiderationConditions?: ReconsiderationConditionInput[] }): Promise<Decision>;
```

### 5.3 Component boundaries inside the screen

| Component | Responsibility |
|---|---|
| `InvestigationIdentityHeader` | Renders creation date, status, status reason, source count as the primary human-readable identity (US-1 AC3) — a shortened id may appear only as a secondary, explicitly-labeled detail, never the primary label. Also renders a compact non-valid/supersession notice for the DISPLAYED `BriefVersion` — its `assignedState` as a plain-language statement only when non-`'valid'`, and its `isSuperseded` as a navigable link (human-readable `versionNumber`) when `true` — the SAME displayed-version binding `DecisionHistoryBanner` uses, not a separate fact source. **Link target: the forward `isSuperseded` link targets the IMMEDIATE successor that actually named the displayed version via `supersedesVersionId` — the real "what superseded this" fact — resolved via `displayedVersion.forwardSupersededByVersionNumber` (`WorkspaceBriefSummary`, §3.2, already fetched, already server-resolved to a human-readable `versionNumber`), never `ProblemBrief.currentVersionId` and never the raw `supersedesVersionId`/`currentVersionId` UUID. For the common two-version lineage (v1 superseded by v2) the immediate successor and the current version are the same version, so this is observably identical to the round-15 behavior; they diverge only in a lineage of 3+ (v1 named by v2, not by the current v3), where this is the correct behavior and the round-15 rationale was not. A separate "jump to current/latest version" affordance is out of scope here — this link's job is only "what superseded this," not "what is newest."** |
| `InvestigationIdentityHeader` (backward link, US-12 AC8 / US-13 AC4/AC5, 2026-08-24 whole-package convergence) | The forward `isSuperseded` link above tells the operator "a newer version exists"; it never helps someone ON the current version reach the version IT superseded — no document previously specified this, and no component owned it (a real gap independently found by end-to-end tracing). Resolution: `InvestigationIdentityHeader` ALSO renders a second, backward-facing link whenever the DISPLAYED `BriefVersion`'s own `supersedesVersionId` (already returned by `GetBriefForReviewResult.version`, §3.3 — the same domain field `BriefVersion` has always carried) is non-null: resolve it to a human-readable `versionNumber` via `workspace.briefs.find(b => b.briefVersionId === displayedVersion.supersedesVersionId)?.versionNumber` (`workspace.briefs`, §3.2, already fetched — no new backend field, no second round trip), and render it as a real, clickable link to that version's own versioned route (§5.1) labeled with its human-readable version number (e.g. "View prior Version 1") — never the raw `supersedesVersionId` UUID (Anti-Patterns). This is the ONE component that owns BOTH directions of version navigation (forward via `isSuperseded`, backward via `supersedesVersionId`). |
| `AddSourceInline` | Revised: its OWN small form (not a reuse of `StartInvestigationForm`, which has no `investigationId` prop and always calls `createInvestigation` with `investigationId` omitted — a new-Investigation-only call site, not a route difference), calling `addSourcesToInvestigation(investigationId, artifacts)` (§5.2) — a thin wrapper that always supplies `investigationId` to the EXISTING, extended `POST /api/investigations` (§3.1b). No `:id/sources` sub-route exists or is added. Mounted directly in the workspace for the Blocked-recovery, generation-failed-retry, AND `'brief-generated'` resubmission paths (US-2 AC3/AC4, US-5 AC3, US-8 AC1, US-13 AC1) — no navigation away from the workspace URL on submit; on success, triggers a workspace re-fetch (never a redirect). This is the ONLY control that can make a `'brief-generated'` Investigation generation-eligible again — there is no separate "regenerate"/"Generate correction" button anywhere in this component tree (Out of Scope, US-13), and submitting against a `'brief-generated'` Investigation never itself flips its status (§1.4/§3.1b's explicit skip branch) — only §4.8's eligibility check, read on the next poll, can make `GenerateButton` eligible. After a successful submission, the workspace re-fetch (`workspace.newEvidenceSinceCurrentBriefVersion`, §3.2, computed per §4.8's revised mechanism) is what flips `GenerateButton`'s (below) enabled state — `AddSourceInline` itself never directly triggers a generation request. |
| `GenerationProgressPanel` | Renders `latestGenerationRun`'s persisted steps only (US-4), including per-step `modelIdentifier`/`validationRecords`/`toolInvocations` and the run's `webSearchQueries` (§3.2) — no percent bar, no "currently executing" claim beyond the latest persisted step's `component` name. Revised: when `latestGenerationRun.livenessState === 'stale-or-interrupted'`, renders an explicit, honest disclosure (e.g. "This run has not reported progress recently and may have been interrupted") distinct from, and never visually identical to, the `'active'` in-progress rendering. **Revised further (§1.6, 2026-08-24): when `livenessState === 'stale-or-interrupted'`, also renders both the existing "Refresh status" control and a new "Abandon and retry" control that calls `POST.../generation-runs/:runId/abandon` (§1.6) — a real, explicit, distinct action from Refresh; on success, triggers a workspace re-fetch, after which `GenerateButton` reflects the cleared concurrency guard and (non-correction case) the real `'generation-failed'` status.** **Rendered only when `workspace.briefs.length === 0` (no `BriefVersion` exists yet — the first-ever-run case) or the displayed `BriefVersion` is current (§5.4 rule 1, scope corrected Danny's ruling, this checkpoint; `briefs.length === 0` disjunct added this checkpoint to close the first-run reachability gap) — never reachable while viewing a prior version, since a prior version can only be viewed when `briefs.length > 0`; that case instead renders `ViewingPriorVersionPanel`'s read-only notice (above).** |
| `GenerateButton` | Issues `POST.../generation-runs` (§4.1) when `workspace.generationEligible` is `true`; disabled with an honest, specific reason string otherwise (e.g. "add a new source to enable correction" for an ineligible `'brief-generated'` Investigation, sourced from the connector's 422 `reason` on a stale attempt, or computed client-side from `generationEligible === false` + `status === 'brief-generated'` + `!newEvidenceSinceCurrentBriefVersion` for the pre-emptive disabled state) — never a bare unconditional "Generate correction" affordance (Out of Scope, US-13) |
| `BlockedSourcesPanel` | Renders each `unreachable` source with its real `failureReason` (US-5 AC2); renders a "Re-check this source" control per unreachable source (§1.4a — added to this row), calling `recheckSourceArtifact(sourceArtifactId)` (§5.2) and re-fetching `GET.../workspace` on completion |
| `BriefReviewPanel` | Renders all seven Brief elements uncollapsed by default from `getBriefForReview`'s result — unchanged rendering contract from `problem-department-mvp`'s Slice 10 forward reference, now actually wired |
| `DecisionForm` / `DecisionConfirmationPanel` | Approve/Reject/Watch controls; in-place confirmation on the same URL (US-10 AC10); no Reopen affordance anywhere |
| `GenerationFailedPanel` (component enumeration added) | Outcome/Status Panel variant selected by §5.4 rule 3 (`latestGenerationRun?.outcome === 'failed'` AND displayed version is current) — `investigation.statusReason` when present, else the failed run's own persisted step/error text (failed-correction fallback); hosts `GenerateButton` ("Retry generation") and a real `AddSourceInline` instance |
| `BriefGeneratedSummaryPanel` (component enumeration added) | Outcome/Status Panel variant selected by §5.4 rule 4 (`status === 'brief-generated'`, no in-progress/failed run, displayed version is current) — compact confirmation, `AddSourceInline`, and the evidence-gated "Regenerate with new evidence" `GenerateButton` |
| `ViewingPriorVersionPanel` (new; precedence corrected round-6, integrator report item 1; link description corrected; scope corrected Danny's ruling, this checkpoint) | Outcome/Status Panel variant selected by §5.4 rule 2 (displayed version `isCurrent === false`) — evaluated immediately after rule 1 (§5.4 rule 1, `GenerationProgressPanel`, which requires `briefs.length === 0` OR `isCurrent === true`); since rule 2 can only ever match when `briefs.length > 0` (there is no prior version to view when no `BriefVersion` exists), the two rules' conditions are mutually exclusive, and rule 2 wins over every later, run-outcome-selected/mutating rule (3, 4) regardless of `investigation.status` or `latestGenerationRun?.outcome`, including `'failed'` AND `'in-progress'` — read-only statement, navigable link forward to this version's own immediate successor via `forwardSupersededByVersionNumber` (NOT necessarily the current version in a lineage of 3+ — no direct jump-to-current affordance exists or is required by any AC; reaching the current version from a version 2+ hops back is a sequential walk, one forward link per hop); when the current version has an in-progress or stale/interrupted run, also a read-only notice plus a navigable link to the current version's workspace; no `AddSourceInline`, no `GenerateButton`, no "Abandon and retry", no other current-run-mutating control |
| `DecisionHistoryBanner` | Revised (US-12; was `DecisionHistoryList`, a plain chronological log; Trace row 23 restored to full scope). Renders TWO requirements-distinct lists, never merged (US-10 AC12): (1) `priorDecisions` from the currently-displayed version's own `GetBriefForReviewResult` (§3.3) — scoped to exactly that `briefVersionId`, with resolved reconsideration-condition content (§4.5); (2) `workspace.decisionLineage` (§3.2, was `decisions`) — every Decision across the WHOLE Investigation's ProblemBrief lineage, each entry explicitly labeled with its own `versionNumber` (e.g. "Decision recorded against Version 1"), rendered as a clearly separate section, never interleaved into list (1) without that per-entry label, AND rendered as a real, clickable React Router `<Link>`/`navigate` call to that version's own versioned route (§5.1), matching this screen's other version-reference navigation affordances (`InvestigationIdentityHeader`'s forward/backward supersession links, above) — the label is the human-readable `versionNumber`, never a raw `briefVersionId` UUID rendered or navigated by it. `DecisionHistoryBanner` itself renders only the two chronological decision lists ((1) and (2)). No raw `StatusEvent` row, `targetId`, `briefVersionId`, or `ReconsiderationCondition` id is rendered as primary content anywhere in this component (Anti-Patterns, binding) — `assignedState` renders as a plain-language statement ("This Brief version has been challenged" / "invalidated"), not the enum literal verbatim, and every reconsideration condition renders its actual `description` text. |

`StartInvestigationForm.onSubmitted` (existing, `src/client/components/StartInvestigationForm.tsx`)
changes its one call site in `ProblemDepartmentScreen` from "trigger a same-page re-fetch" to "call
`navigate(`/departments/problem-department/investigations/${investigationId}`)`" — the component's
own props/contract (`onSubmitted: (investigationId: string) => void`) does not change; only what
the parent does with the callback changes (US-2 AC1). `AddSourceInline` (§5.3, revised)
is a SEPARATE, new component — not this one reused — because `StartInvestigationForm` has no
`investigationId` prop and always calls `createInvestigation` (a new-Investigation-only route);
`AddSourceInline` calls `addSourcesToInvestigation` (§5.2) instead, and its own `onSubmitted`
equivalent triggers a workspace re-fetch, never a navigation, since the operator is already at the
destination.

The legacy Express route `GET /investigations/:id` (`src/web/server.ts:117-160`) is **not**
modified, fixed, or extended by this sprint — it remains exactly as `01-REQUIREMENTS.md` found it,
its `brief-generated` branch still 501ing. Every new browser-facing link this sprint adds (from
`InvestigationPortfolioTable`'s per-row "Open" affordance, from `StartInvestigationForm`'s submit
handler, from Mission Control) points at the new React route instead. This is a call-site change in
`InvestigationPortfolioTable.tsx` (Problem Department's real per-row anchor, rendered inside
`ProblemDepartmentScreen.tsx`) and `MissionControlScreen.tsx`'s own inline
`RecentInvestigationsList` row-rendering function (existing, Checkpoint 1) from the plain
`<a href="/investigations/{id}">` full-page navigation Checkpoint 1 documented
(`product-surface-checkpoint-1/02-ARCHITECTURE.md` §6) — including replacing the inert
`'brief-generated'` plain-text branch with the same working `<Link>` every other status renders —
to a React Router `<Link>`/`navigate` call targeting the new workspace route — the one call-site
edit Checkpoint 1's own architecture already flagged as pending this future workspace's existence
("no client-side route exists... yet").

---

### 5.4 Outcome/Status Panel Variant Precedence Rule

`investigation.status` and `latestGenerationRun.outcome`/`livenessState` can both match a
Sections-table row simultaneously (e.g. a fresh `'open'` Investigation whose first run is
`'in-progress'`; a `'brief-generated'` Investigation mid-correction), and a prior `BriefVersion`
being viewed must never expose a control that mutates the current version's run. The Outcome/Status
Panel resolves its variant with a single, binding, first-match-wins order — five rules, evaluated
0 through 4:

0. **Version not found.** A routed `:versionNumber` is present and does not resolve to any
 `BriefVersion` under this Investigation (`GET.../brief-versions/by-version/:versionNumber`
 returns 404) while the Investigation itself resolves. Renders a plain "Version N does not exist"
 message, no generation-trigger control, no other variant's controls. Never fires on the
 non-versioned route, and never fires merely because no `BriefVersion` exists yet for a
 freshly-submitted `'open'` Investigation (that case has no routed `:versionNumber` to fail to
 resolve, and falls through to rule 4's Open/Eligible panel).
1. **In-progress, current version (or no version yet).** `latestGenerationRun?.outcome ===
 'in-progress'` AND (`workspace.briefs.length === 0` OR the displayed `BriefVersion.isCurrent ===
 true`) → `GenerationProgressPanel` (§4.9/§5.3), regardless of `investigation.status`. The
 `briefs.length === 0` disjunct is required, not optional: a first-ever generation run has no
 `BriefVersion` at all until Phase 4 of `generateBriefVersion` persists one — for the entire
 duration up to that point there is nothing to evaluate `isCurrent` against, so a version-only
 condition would never match a first run and would wrongly fall through to rule 4's Open/Eligible
 panel (the gap this rule now closes). This resolves the ordinary "run started but status hasn't
 caught up yet" case for BOTH an initial run with no `BriefVersion` yet (status `'open'`,
 `workspace.briefs.length === 0`) AND a correction against an existing current version (status
 `'brief-generated'`, `workspace.briefs.length > 0`, displayed version `isCurrent === true`).
 `GenerationProgressPanel` — the only component that renders "Refresh status" and "Abandon and
 retry" — mounts only here; it is never reachable while a prior version is displayed, because both
 controls mutate the CURRENT version's run (and viewing a prior version is only possible when
 `workspace.briefs.length > 0`, so the `briefs.length === 0` disjunct can never itself expose those
 controls to a prior-version view — there is no prior version to view when no `BriefVersion` yet
 exists).
2. **Viewing a prior version.** The displayed `BriefVersion.isCurrent === false` →
 `ViewingPriorVersionPanel` (§2/§5.3), regardless of `investigation.status` and regardless of
 `latestGenerationRun?.outcome` (including `'failed'` and `'in-progress'`). When the current
 version's latest run is itself `'in-progress'` (active or stale/interrupted), this panel adds a
 distinct, read-only notice ("A generation run is currently active/stalled on the current
 version — go to the current workspace to view or manage it") with a navigable link to the current
 version's workspace, where `GenerationProgressPanel` then lives. This panel imports neither
 `AddSourceInline`, `GenerateButton`, nor the abandon control — no reachable variant while viewing
 a prior version ever mounts a control that mutates the current version's run.
3. **Failed, current version.** Otherwise (the displayed version is current), if
 `latestGenerationRun?.outcome === 'failed'` AND `investigation.status !== 'blocked'` →
 `GenerationFailedPanel` (§5.3). The `status !== 'blocked'` exception matters because a `'blocked'`
 Investigation whose latest run also reads `'failed'` must render `BlockedSourcesPanel`'s
 per-source failure disclosure, not a generic generation-failure panel with nothing to add. This
 rule covers both a classic initial-generation failure (`status` independently reads
 `'generation-failed'`) and a failed correction viewed on the current version (`status` stays
 `'brief-generated'` by construction, since a correction failure never transitions status) — the
 panel falls back to the failed run's own step/error text when `statusReason` was never written.
4. **Status-selected (default).** Otherwise, the variant is selected by `investigation.status`
 exactly as the Sections table documents (`Open/Eligible`, `Blocked`, `Brief-Generated summary`,
 `Generation-Failed`). Reachable here only for the current version (rule 2 already excluded every
 prior-version view), and only when no run outcome above already claimed the case.

**Totality.** `investigation.status ∈ {'open', 'generation-failed'}` with an existing `ProblemBrief`
is unreachable in live code: `'open'` is only reached from a prior `'blocked'`, and once an initial
run succeeds status moves to `'brief-generated'` and never returns to `'open'`; a failed correction
never transitions status away from `'brief-generated'` at all. So once any `BriefVersion` exists,
`investigation.status` is always either `'brief-generated'` or transiently reflects an in-progress
run — never `'open'`/`'generation-failed'` with a `ProblemBrief` already on record. The
`(status === 'blocked', latestGenerationRun?.outcome === 'failed')` pair is similarly unreachable
post-§1.4's no-silent-overwrite fix (an Investigation that reached `'open'` has at least one
persisted-reachable source, which stays reachable across future add-source calls) but rule 3's
exception is retained anyway, for defensive totality over the type.

**"Current" is vacuously true when `workspace.briefs.length === 0`.** Rules 1, 3, and 4 all resolve
their variant for "the displayed version" on the non-versioned route even when no `BriefVersion`
exists yet — there is nothing to be non-current, so the non-versioned, no-`BriefVersion`-yet case is
treated as current by convention across all three rules (rule 0 already states this for the
fall-through-to-rule-4 case; rule 1's `workspace.briefs.length === 0` disjunct, added this
checkpoint, states it explicitly for rule 1 rather than relying on an implicit reading). Rule 2 is
unaffected by this convention and cannot be affected by it: `isCurrent === false` requires an actual
displayed `BriefVersion` to be false on, which requires `workspace.briefs.length > 0` and a resolved
routed version — so rule 2 and the `briefs.length === 0` case are mutually exclusive by construction,
never by evaluation order alone.

| Combination | Rule | Variant |
|---|---|---|
| Routed `:versionNumber` present, does not resolve | 0 | Version Not Found |
| First run `'in-progress'`, no `BriefVersion` exists yet (`workspace.briefs.length === 0`) | 1 | In-Progress |
| Correction run `'in-progress'`, viewing current (`workspace.briefs.length > 0`) | 1 | In-Progress |
| Correction run `'in-progress'`, viewing a prior version | 2 | Viewing Prior Version + active-run notice |
| Initial run `'failed'`, status `'generation-failed'`, no `BriefVersion` exists yet | 3 | Generation-Failed |
| Correction run `'failed'`, viewing current | 3 | Generation-Failed |
| Correction run `'failed'`, viewing a prior version | 2 | Viewing Prior Version |
| Status `'open'`, no run yet, no `BriefVersion` exists yet | 4 | Open/Eligible |
| Status `'blocked'`, no active/failed run | 4 | Blocked |
| Status `'brief-generated'`, no active/failed run, viewing current | 4 | Brief-Generated summary |
| Status `'brief-generated'`, no active/failed run, viewing a prior version | 2 | Viewing Prior Version |

This is a single, total order — every reachable `(status, latestGenerationRun, displayed-version)`
combination maps to exactly one variant.

## 6. Patterns

| Pattern | Usage | Rationale |
|---|---|---|
| Server-computed derived flags (`generationEligible`, `isCurrent`) | Workspace/Brief read models | Single source of truth for client-facing affordance gating — the client never re-derives "can I submit a generation request" from raw status + run-list itself, avoiding drift between server and client eligibility logic |
| DB-enforced uniqueness over check-then-act | Concurrent-generation guard (§1.1) | Matches this doc set's existing pattern (`brief_version_generation_run_id_unique`, `problem_brief.investigation_id UNIQUE`) — a partial unique index is atomic at the database layer; an app-layer "check then insert" would race under concurrent requests |
| Typed error classes mapped 1:1 to a real, persisted, distinct outcome | `generateBriefVersion`'s own finalization (§1.3) surfaced via the Workspace Read Model (§3.2, §4.4), not via the connector's HTTP response (revised — the connector no longer awaits the pipeline, so it can no longer map these synchronously) | `generateBriefVersion`'s three exported error classes already write their own real reason text into a terminal, failed `GenerationRun`/`GenerationStep` before rethrowing; the workspace read model surfaces that distinct text per run, never collapsing it into one generic message |
| Read model as a separate, purpose-built assembly function (not a shared "get everything" call) | `getInvestigationWorkspace` vs. `getBriefForReview` | The workspace payload is polled at `POLL_INTERVAL_MS` (§4.9, §5.2 — engineering-derived, not fixed here) and must stay small (no seven-element Brief content); the Brief payload is fetched once per version and can be large — matching Checkpoint 1's own `getMissionControlView`/`getProblemDepartmentOverview` split by call frequency and payload shape |
| Append-only persistence with `reject_update_or_delete` trigger | `decision`, `reconsideration_condition`, `status_event` | Matches every other Brief-lineage table in this codebase (`brief_version`, `problem_statement`, `negative_finding`, etc.) — one established immutability mechanism, not a second one invented for this sprint |
| Assigned state answered exclusively by query, never a stored field | `getAssignedState`/`getAssignedStateAsRecorded` over `status_event` (§4.7) | Reused unchanged from the already-committed MVP contract (Q-3) — a mutable `status` column could not answer "what did we assign at time T," and this checkpoint does not reopen that decision |
| Eligibility gated by real, already-persisted signals (resolution status + consumed-evidence chain), not a mutable flag | `hasEligibleNewEvidenceSinceCurrentBriefVersion` (§4.8, revised) | No new write path, no risk of a "pending correction" flag drifting out of sync with reality, and now expresses all four of US-13 AC2's disqualifiers (unreachable/unresolved, empty, duplicate-of-consumed, already-reflected) — keeps `submitSources` fully unmodified and `resolveInvestigationSources` unmodified for this call site's observable behavior (§1.4's C1 fix only changes behavior on a second call against already-resolved rows, which this generation-eligibility path never triggers) (Constraints) |
| Two independent service calls, no shared trigger | `assignValidityState` (US-12) vs. `generateBriefVersion` with `supersedesVersionId` (US-13) | Danny's explicit 2026-08-22 ruling — neither operation invokes, depends on, or is gated by the other; enforced structurally by §4.8's mechanism containing no call into §4.7's module |

### Anti-Patterns (Do Not Use)

- Client-side polling-interval jitter/backoff logic not specified here — no additional numeric
 constant (backoff multiplier, max-interval cap) is introduced; a single fixed `POLL_INTERVAL_MS`
 (§5.2, §4.9 — engineering-derived at Forge time from real measurement, not a value fixed here) is
 the only interval this design uses.
- A shared "get everything about an Investigation" mega-read-model merging workspace polling data
 and full Brief content into one payload — rejected per the Patterns row above.
- Deriving `generationEligible` independently on the client from `status`/`generationRuns` — the
 server-computed field is the only source of truth (Patterns table).
- A queue/worker abstraction for `generateBriefVersion` invocation — explicitly out of scope; the
 connector calls it directly, in-process, with no separate worker/queue layer (§1.3, §4.2). This is
 NOT the same as awaiting it to completion: per §1.3, the connector returns `202` the instant
 `onRunCreated` fires (§1.3), and `generateBriefVersion` continues un-awaited after that point
 (§4.2 steps 5/5b's promise-race). **Blocking the response on the full pipeline — awaiting
 `generateBriefVersion` in the same request/response cycle — is the anti-pattern this bullet
 prohibits, not the design used here.** The lack of a queue/worker means a process crash mid-run is
 not recoverable (honestly documented as not process-crash durable, §4.2 step 5b's comment; this
 must also appear as disclosed, non-alarming copy in the UI spec this document feeds, not silently
 omitted) — that limitation is about crash-durability, not about whether the HTTP response waits for
 completion, which it does not.
- Re-deriving `assignedState`/superseded coloring in the client from raw `BriefVersion` fields —
 `getBriefForReview` already computes and returns both; the client renders what it is given.
- A browser-reachable route, control, or `api.ts` export for `assignValidityState` — none exists in
 §4/§5 and none may be added this checkpoint (Out of Scope, US-12).
- A generic "Generate correction" control, or any control that fires a generation request against a
 `'brief-generated'` Investigation without a preceding evidence submission in the same session's
 server-side state — `GenerateButton` (§5.3) has no such unconditional code path.
- `assignValidityState` invoked from `hasEligibleNewEvidenceSinceCurrentBriefVersion`, `AddSourceInline`,
 or any part of the US-13 path, and vice versa — the two services share no call graph edge
 (Patterns table).

---

## 7. Dependencies

No new third-party dependency is introduced. This sprint extends the existing stack:

| Dependency | Version | Purpose |
|---|---|---|
| `express` | (existing, unchanged) | New routes mounted on the existing `apiRoutes` router |
| `pg` | (existing, unchanged) | New migrations/queries follow the existing `pool`/`PoolClient` pattern |
| `react-router-dom` | (existing, unchanged) | One new `<Route>`; `useNavigate`/`useParams` already used elsewhere in the SPA (Checkpoint 1) |
| `vite` / `vitest` | (existing, unchanged) | New client/server test files follow existing conventions |

---

## 8. Integration Points

- **`generateBriefVersion`** (`src/services/generateBriefVersion.ts`) — called directly by the new
 Generation Run Connector. Its signature DOES change: it gains one new, optional, additive
 `onRunCreated?: ...` parameter (§1.3), plus the other real, disclosed edits to this file this
 checkpoint enumerated in this section's last bullet below (§4.2/§1.6/§4.8) — but no change to its
 internal pipeline order, prompts, or extraction/analysis/recommendation behavior (Out of Scope,
 binding).
- **`transitionInvestigationStatus`** (`src/services/transitionInvestigationStatus.ts`) —
 function itself is NOT modified; `generateBriefVersion` continues to own every status transition
 its own run needs. `POST /api/investigations`'s existing call site (`src/web/apiRoutes.ts:60-64`)
 is extended, not duplicated: the handler now reads pre-mutation status via `getInvestigation`
 first, skips this call entirely when that status is `'brief-generated'` (§1.4, §3.1b), and checks
 this function's returned `boolean` in every other case rather than ignoring it.
 The legacy `POST /investigations` form route's own call site (`src/web/server.ts:93`) is
 untouched.
- **`getInvestigation`** (`src/services/getInvestigation.ts`) — read by
 `getInvestigationWorkspace`, the Generation Run Connector's eligibility check, and (NEW this
 revision, per the Add-Source-route ruling) `POST /api/investigations`'s extended handler — once before mutation, to
 branch on an existing Investigation's real current status, and once after, to respond with real,
 read-back status rather than an assumed one (§1.4, §3.1b); unmodified signature.
- **`submitSources`** (existing) — reused unmodified, no new call, no new parameter, no new
 behavior. **`resolveInvestigationSources`** (existing, modified per §1.4's C1 fix — skips
 already-resolved artifacts, reusing their persisted status for the `allUnreachable` aggregate
 instead of re-fetching them; a real, disclosed behavior change, but a no-op for every call site
 in this checkpoint except the Add-Source Connector's second-and-later calls against an
 Investigation with prior resolved sources — no new parameter). `AddSourceInline` (§5.3) calls
 them via the EXISTING
 `POST /api/investigations` route, extended in place (§1.4, §3.1b, per the Add-Source-route ruling) — no new HTTP
 entry point is added onto them; no `POST /api/investigations/:id/sources` route exists in this
 design.
- **Checkpoint 1 shell** (`src/client/App.tsx`, `PersistentNav`) — the new route is added inside
 the existing `<Routes>` sibling to `PersistentNav`, per Checkpoint 1's own documented mount
 structure (`product-surface-checkpoint-1/02-ARCHITECTURE.md` §6) — `PersistentNav` is never
 remounted on navigation into or within the workspace.
- **`ssrfGuardedFetch.ts`** — fixed in place (§4.6); both its existing call sites
 (`resolveSourceArtifact.ts`, `searchWeb`'s controlled retrieval path,
 `problem-department-mvp/02-ARCHITECTURE.md` §1.6) receive the fix automatically, with no
 independent re-application required — the shared-module design that section already established
 is exactly what makes this a one-file fix.
- **`generateBriefVersion`'s `supersedesVersionId` contract** (`generateBriefVersion.ts:108-160`,
 confirmed directly against source per `01-REQUIREMENTS.md`) — US-13's correction path calls the
 exact same connector (§4.2) and the exact same `generateBriefVersion` signature US-3 already
 uses; no new pipeline entrypoint, parameter, or overload is added for US-13 (Out of Scope,
 binding: "no re-implementation or modification of `generateBriefVersion`'s internal pipeline").
- **`source_artifact.added_at` / `resolution_status`** (`001_initial_schema.sql`, existing
 columns) and **`evidence_item` / `claim_version_evidence` / `brief_version.claim_version_ids`**
 (existing columns/tables) — read, unmodified, by §4.8's eligibility query and consumption ledger;
 no schema change to any of them this checkpoint.
- **`generateBriefVersion`'s Phase-1 `createGenerationRun` call** (`generateBriefVersion.ts:231`) —
 gains one additive, optional `onRunCreated` hook parameter (§1.3). This is not the only edit to
 this file this checkpoint: §1.3 also adds the `InvalidSupersedeTargetError` preflight catch's new
 `recordGenerationStep` call; §4.2/§1.6 thread a required `fenceToken: number` field through all
 eleven real `recordGenerationStep`-bearing call sites (the three direct calls, the new preflight
 catch, and the seven `runStepWithProvenance` calls); §4.2/§1.6 add `GenerationRunAlreadyFinalizedError`
 catches at the eight call sites that finalize a run; §1.6 adds the `ROLLBACK`/
 `GenerationRunLostFinalizationRaceError` block at the fenced-out finalization path; §1.6 (SOL-HIGH-2
 fix) wraps `attemptGenerationFailedTransition`'s status write in its own `assertFenceOwnership`-
 guarded transaction and adds `GenerationRunFencedOutError` to the file's `:700-707` outer catch;
 and §4.8 (SELF-4 fix) adds the UNIONED `consideredSourceArtifactIds` computation (both extraction
 passes' own `usableSourceIds`) and its `generation_run_consumed_source` ledger `INSERT`, itself
 wrapped in its own `assertFenceOwnership`-guarded transaction (SELF-4 fix). Every other line of
 `generateBriefVersion.ts` — its phase order, pipeline logic, prompts, and
 extraction/analysis/recommendation behavior — is unchanged.

---

## Output Verification

- [x] Every `01-REQUIREMENTS.md` user story (US-1 through US-13, including US-12/US-13 restored by
 the 2026-08-22 material scope correction) has explicit architecture coverage (Components
 table `Satisfies` column, or the relevant §4/§5 subsection).
- [x] Schemas are complete TypeScript, not pseudocode (§3).
- [x] No implementation code bodies — only exact signatures/shapes and step-by-step orchestration
 contracts (§4.2, §4.4).
- [x] Every pattern is justified against an existing precedent in this codebase (§6).
- [x] Integration points identified for every existing service this sprint calls into (§8).
- [x] Both reconciliation gaps found during this design pass (§1.1, §1.2) are resolved with a
 stated reason, not silently patched or left as a HALT.
- [x] Two numeric constants total: `POLL_INTERVAL_MS` and `STALE_THRESHOLD_MS` (§4.9, §5.2 —
 engineering-owned, neither fixed as a specific number at spec time; both derived during Forge
 from real measured generation timing, expected concurrency, and endpoint cost, per §4.9's
 explicit derivation methodology, with the derived values and their measured evidence recorded
 as code comments next to the constants, not a separate tracking artifact). §1.1's partial
 unique index remains a structural DB constraint, not a magic number. §4.7's bitemporal queries
 and §4.8's eligibility check remain pure comparisons against already-existing columns, not
 thresholds.
- [x] External review findings 1-8 and 11 (Codex + Sol, 2026-08-23) are each resolved with a stated
 mechanism, not a prose assurance: Finding 1 — §1.3, §4.2 (fire-and-forget + `onRunCreated`
 hook); Finding 2 — §3.2 (`validationRecords`/`toolInvocations`/`webSearchQueries` closed
 against real persisted tables); Finding 3 — §3.1a, §5.1 (human-readable `versionNumber`
 route, reload-stable); Finding 4 — §1.4, §3.1b (reuse and extend the existing
 `POST /api/investigations` route, no new `:id/sources` route); Finding 5 — §1.5, §4.8
 (`hasEligibleNewEvidenceSinceCurrentBriefVersion` against real resolution-status +
 consumed-evidence chain); Finding 6 — §3.2, §4.5 (`decisionLineage` split from per-version
 `priorDecisions`, resolved condition content); Finding 7 — §3.6, §4.7 (`sequence` column,
 target-existence validation before insert); Finding 8 — §4.9 (`livenessState`,
 engineering-derived threshold per §4.9); Finding 11 — §0 (Checkpoint-1 edit boundary), §3.1
 (heading fix), and no "API response alone is sufficient" language found anywhere in this
 document (verified by search, not asserted).
- [x] US-12's full Slice 12 contract (`StatusEvent`, `assignValidityState`,
 `getAssignedState`/`getAssignedStateAsRecorded`, dependent-decision reconstruction,
 browser-visible non-valid/prior-decisions/supersession-history surfacing) is reused verbatim
 from the already-committed `problem-department-mvp/02-ARCHITECTURE.md` contract (§3.6, §4.7)
 — not redesigned — and carries no browser-reachable invalidation trigger (§4.7, §5.3,
 Anti-Patterns).
- [x] US-13's resubmission-driven correction path is gated exclusively on new-evidence-submitted
 (§4.2's revised rule, §4.8), calls the existing, unmodified `generateBriefVersion`
 `supersedesVersionId` contract (§8), and preserves every prior `BriefVersion` and its bound
 `Decision`(s) unmodified and independently retrievable (§3.4, §3.5's append-only tables — no
 new mutation path is introduced).
- [x] `assignValidityState` (US-12) and `generateBriefVersion` with `supersedesVersionId` (US-13)
 remain two independent operations with no shared trigger, control, or endpoint (§4.2 step 3
 comment, §4.7's "no browser-reachable trigger," §4.8's mechanism note, §6 Patterns/
 Anti-Patterns) — Danny's 2026-08-22 decoupling ruling is enforced structurally, not only by
 documentation.
