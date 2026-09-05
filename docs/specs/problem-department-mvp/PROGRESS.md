# Progress: problem-department-mvp

## Status: IN_PROGRESS

## Slices
- [x] Slice 1: Runtime & Storage Evaluation — COMPLETE (2026-08-10). DDR-0001 ACCEPTED. Runtime: Claude Agent SDK / direct Anthropic API. Storage: dedicated local Postgres for Department OS Core (separate from LORE).
- [x] Slice 2: Core Persistence + Intake Service + Submission Screen — COMPLETE (2026-08-10). 26/26 tests, QC PASS on 5th re-verification (5 rounds, 12 real defects found and fixed, converged via personal falsification testing).
- [x] Slice 3: Source Resolver + getInvestigation Read Path + Blocked/Generation-Failed States — COMPLETE (2026-08-10). 43/43 tests, QC PASS on 2nd re-verification.
- [x] Slice 4: Evidence/Claim Model + Extraction & Clustering Engine + Evidence Labeler — COMPLETE (2026-08-12). 83/83 tests, QC PASS on 2nd re-verification (both blocking bugs confirmed via destructive testing, not just green tests). First slice calling the LLM (forced tool-use per DDR-0001).
- [x] Slice 5: Demand Analyzer + Personal Pull Extractor — COMPLETE (2026-08-13). 106/106 tests, QC PASS on 3rd re-verification (pass 1: F-1 through F-4 blocking, incl. a regression of Slice 4's F-3 pattern; pass 2: F-5, a stale doc comment left asserting the pre-fix contract; pass 3: PASS, all closed).
- [x] Slice 6: Landscape Researcher + Gap Hypothesis Generator — COMPLETE (2026-08-13). searchWeb failure boundary resolved DDR-0001 Row 9 (3 QC rounds); Landscape Researcher + Gap Hypothesis Generator implementation (2 QC rounds, 2 real data-loss bugs found and fixed). 179/179 tests, tsc clean.
- [x] Slice 7: Uncertainty Compiler + Recommendation Engine — COMPLETE (2026-08-13). 3 QC rounds (pass 1: 2 blocking bugs — cross-investigation evidence leakage in a new read helper, and a Date/string type lie; pass 2: 1 blocking test-coverage gap that also surfaced a genuine unimplemented Slice-5 requirement — numeric-scope non-adoption guard missing from demandAnalyzer.ts entirely; pass 3: PASS, mutation-tested). 208/208 tests, tsc clean.
- [x] Slice 8: Provenance Recorder — COMPLETE (2026-08-14), then **RETROACTIVELY CORRECTED (2026-08-14)** — see below. Per Danny's binding directive: instrumented callForcedTool/searchWeb rather than adding a second validation/repair layer. 2 QC rounds at original close (pass 1: 2 blocking bugs — a migration that would fail against real pre-existing data, and a validation-record grouping bug that would fabricate repair histories once a step calls the same tool twice; pass 2: PASS, independently re-probed).
- [x] Slice 8 RETROACTIVE CORRECTION (2026-08-14) — defect discovered during Slice 9 design, not by Slice 8's own gate. `runStepWithProvenance` recorded a normally-returned `{ generationFailed: true }` as a SUCCEEDED step (all seven components catch internally and return rather than throw, so the throw branch Slice 8's tests exercised is effectively unreachable — the tested path could not occur while the real path went untested). `outputRefs` was separately hardcoded `[]` on both branches. Blast radius MEASURED, not assumed: zero production call sites at `64fff5e` (the intended caller `generateBriefVersion.ts` is Slice 9 work and did not exist), so LATENT/pre-integration — no mis-recorded rows provable from product code; a read-only DB census found 1 run / 1 step total. Fixes: result-aware outcome classification; `error` populated from `generationFailureReason`; `getOutputRefs: (result: T) => string[]` added as a **required** input field (Composer ruling — each caller maps its own result shape, `() => []` makes emptiness deliberate; the initially-implemented internal whitelist was removed entirely as it returned `[]` silently for unrecognised shapes). Binding contract corrected in `02-ARCHITECTURE.md` §1.9 pt 3 (the `error` text encoded the false assumption that failures reach the recorder only by throwing) and §1.9 pt 4 (stale four-field signature). **3 independent QC rounds** (pass 1 FAIL: architecture/code contradiction, `domain.ts` "iff" overclaim, and a vacuous `expect(true).toBe(true)` placeholder test that passed while asserting nothing; pass 2 FAIL: the remediation left §1.9 pt 4's signature stale — same defect class as pass 1; pass 3 PASS, with type checking restored and compiler-probed). Bounded-repair reachability audited: the `failed`-step-with-`error: undefined` branch is unreachable for all seven components.
- [x] Slice 9: Brief Assembler — **COMPLETE (2026-08-16). Frank forge-gate PASS, attempt 1/3.** Design took FOUR Composer design gates (revisions 4→8) before implementation was authorised: rev 4 failed with 7 blocking + 4 significant; rev 5 added the G-1 precedence ruling (a component failure means "unknown because generation failed", not "searched and found nothing", so it may never produce a NegativeFinding) then failed with 5 more; rev 6 failed on a stale same-Brief supersede target passing preflight and an evidence-universe rule that made ordinary runs impossible; rev 7 failed on one omission (`startSnapshot` is captured before Extraction, so the union had to include `ExtractionResult.evidenceItems`); rev 8 PASSED. A first implementation attempt against the pre-rev-4 design is QUARANTINED at `quarantine/slice-9-attempt-1` (`86f7b8b`) and is explicitly not evidence. **2 QC rounds.** Round 1 FAIL, 5 defects, the critical one being a SHARED WELL: the dev database was carrying the QUARANTINED attempt's schema (migration runner tracks filenames only, so the rewritten 007 was never reapplied) — every green result before the rebuild, including a reported 266/266, was measured against a schema that did not match its own migrations and has been WITHDRAWN as evidence. Also found: a merged Slice 8 test broken by Slice 9's new FK on any fresh DB, a vacuous test asserting its own fixture, an uncovered roadmap checkbox, and no migration test for 007. Remediation: migration `008_reconcile_brief_versioning_constraints.sql` reconciles constraint DEFINITIONS (not names) — 10 `TEXT[]`→`UUID[]` conversions, 6 wrongly-`DEFERRABLE` FKs made plain, 13 constraints added — failing loudly on violating data with no `NOT VALID` and no row deletion; `deptos_core` dropped and replayed 001→008. Replacing the vacuous test immediately exposed a real defect: `BriefGenerationFailedError.investigationStatus` was assumed rather than observed, reporting `'generation-failed'` for a `'blocked'` Investigation — the same ignored-return-value class the Composer caught at the design gate, recurring on the failure paths. Fixed at 4 sites via read-back. Round 2 PASS, mutation-verified. 270 passed / 1 skipped, `tsc` clean, on a database rebuilt from the migrations as written. Orchestrator independent re-derivation: AGREES — Ledger independently verified before dispatching Frank: the quarantined-007 fixture is the genuine stale shape (7 DEFERRABLE, 12 TEXT[], 0 UUID[], matching the drift measured on the live DB before rebuild); the rebuilt schema matches the migration set (0 missing constraints, `_uuid` x10, 92 constraints, only migration 005's legitimate deferrable pair remaining); and the legacy-reconciliation test is mutation-verified — inverting a single guard in 008 so the deferrable-FK fix never fires makes it FAIL, restoring makes it PASS. Standing caveat recorded at close: one proof can no longer be completed. Whether the quarantined 007 file is byte-identical to what was ACTUALLY applied to `deptos_core` is now unfalsifiable — the database was replayed without a prior `pg_dump -s`. Convergence is proven FROM THE QUARANTINED FILE; the two main drift dimensions (column types, missing constraints) were captured before the drop, but not a full dump.
- [~] Slice 10: Investigation Screen — Completed State — **SUPERSEDED (2026-08-22), never built.**
  Requirements traced into `docs/specs/product-surface-checkpoint-2/` (see that sprint's
  `01-REQUIREMENTS.md` for the retained/revised/moved/removed disposition of each item).
- [~] Slice 11: Decision Recorder + Decision Form + Decision Confirmation Panel — **SUPERSEDED
  (2026-08-22), never built.** Requirements traced into `docs/specs/product-surface-checkpoint-2/`.
- [~] Slice 12: Validity/Invalidation Service + Decision-History Banner — **SUPERSEDED (2026-08-22),
  never built.** Requirements traced into `docs/specs/product-surface-checkpoint-2/`.

## Current

> **This section is the single live status record for this sprint** (see
> `docs/development-workflow.md`, "Working on this repository right now"). Read it first when
> picking up work. Do not copy current state into any other file — a root `NOW.md` status card
> did that until 2026-08-14 and drifted out of sync with this file; it was removed rather than
> resynced. Detailed slice history is below, not here.

Build target: Problem Department MVP · Phase: Spec (re-planning remaining browser-to-decision path)
Product code exists: Slices 1-9 (this file) + Product Surface Checkpoint 1 Slices 1-2
(`docs/specs/product-surface-checkpoint-1/PROGRESS`-equivalent — see that sprint's own roadmap;
its own Slice numbers are local to that roadmap, not a continuation of this file's counter).
Last completed product gate: **Slice 9 Frank forge-gate PASS (2026-08-16), attempt 1/3**, and
separately, Product Surface Checkpoint 1's own Frank forge-gate PASS (SHA `152a124`, 2026-08-21).
Last merged side tool: spec-doc-checker (PR #5, 2026-08-10) — tooling, not product progress.

**This stream's single active implementation plan is now `docs/specs/product-surface-checkpoint-2/`**
(spec in progress as of 2026-08-22). Old Slices 10-12 below are SUPERSEDED, not completed — their
requirements were traced into Checkpoint 2 rather than built as originally specced. Checkpoint 2's
own roadmap uses qualified task identifiers (`C2-S1`, `C2-S2`, ...) local to that document, so
"Slice 1" is never ambiguous across the two roadmaps that now make up this one unfinished stream.
Do not dispatch Forge against Slice 10/11/12 as written below — they are historical record only.

Next product capability (not yet built): whatever Checkpoint 2's roadmap specifies as `C2-S1` once
that spec is Frank-gated and Danny-approved.

**Product Reality Demonstration run 2026-08-17 against 6c54fde** (isolated worktree, fresh
database `deptos_slice9_demo_20260817` with 001-008 replayed, real LLM, no mocks). Two Briefs were
generated end to end through the real submission path and the real `generateBriefVersion` service:
a controlled case (Investigation `e797cd56-3fa9-47f5-ae20-d5537138f675`, BriefVersion
`16a96624-4275-4626-ab3c-7ff1dd614aa4`, recommendation Approve) and the AI Video Playbook case
(Investigation `97f62097-e5c2-495c-958d-adb8e894b090`, BriefVersion
`eeaeabc4-bcd7-4eae-aa46-ba888c81a668`, demand Insufficient, one `demand-signal-type`
NegativeFinding, recommendation **Reject**). The fail-closed machinery behaved correctly: it
recorded absence as a first-class NegativeFinding and rejected its own department's experiment on
the evidence. A deliberately-vague submission produced a genuine `generation-failed` state.

The demonstration also established the product boundary and two defects, NEITHER of which is
fixed and neither of which any test caught:

1. **DISCOVERED-BROKEN — every `type: 'url'` source fails to resolve on Node 22.**
   `safeLookup` (`ssrfGuardedFetch.ts:178`) returns a single address via
   `callback(null, chosen.address, chosen.family)`, but Node 22 enables `autoSelectFamily` and
   calls a custom `lookup` with `{all: true}` expecting an ARRAY, so it reads
   `addresses[0].address` -> `undefined` and reports `Invalid IP address: undefined`. Confirmed
   against live reachable hosts (`curl` 200, product `unreachable`), including a URL Danny
   submitted through the browser himself. Consequence: the Landscape Researcher's independent web
   research retrieved NOTHING in both runs -- 219 `web_search_result` rows across 26 queries, all
   `status='failed'` with that same reason -- while both Landscape steps still recorded
   `outcome: 'succeeded'`. Both Briefs' landscape sections therefore rest on the submitted text
   alone. The suite misses this because the `allowedTestHosts` branch passes Node's original
   `options` straight through to `dns.lookup`, so fixture-server tests exercise a DIFFERENT BRANCH
   than production.
2. **Browser retry loop is inert.** The Generation Failed screen tells the user to retry by
   resubmitting. Resubmission is accepted and persists new sources, but `ALLOWED_PRIOR_STATUSES.open
   = ['blocked']` so the Investigation can never return to `open`, and no route invokes
   `generateBriefVersion`, so nothing regenerates. Verified by resubmitting real material to
   `f0c5bd3e-01c0-4d89-bebc-56bea3f7229f`: 3 sources persisted, status unchanged.

Product boundary at Slice 9, stated exactly: **a human can start an investigation and see it fail;
a human cannot see one succeed.** Three routes exist (`GET /investigations/new`,
`POST /investigations`, `GET /investigations/:id`); `/` is 404; the durable URL returns
**HTTP 501 "Brief review surface is not implemented yet."** for `brief-generated`. Nothing renders
a Brief, its provenance, or the failed-retrieval fact; nothing triggers generation from the
browser; nothing records a human decision.

## Open constant-integrity items (2026-09-05)

**TRACKED, NOT OWNED — seven constants remain unsourced after a benchmark-agent audit, two Cold
Frank FAILs, a Cold Frank HALT resolved by DDR-0002, and a subsequent Cold Frank FAIL (unbriefed,
commit 7cfb1bc) that added four more.** This is a separate audit finding from a different
date/process than the Product Reality Demonstration defects above — not a third item in that list.

1. `MAX_REPAIR_ATTEMPTS` (`llmClient.ts`, caps schema-repair attempts at 1)
2. `MAX_OUTPUT_TOKENS` (`llmClient.ts`, 8192-token generation cap)
3. `MAX_SEARCH_OUTPUT_TOKENS` (`searchWebAdapter.ts`, 1024-token search-call cap, named and
   extracted from a bare literal 2026-09-05 per DDR-0002 item 4)
4. `MAX_SEARCHES_PER_TURN` (`searchWebAdapter.ts`, 5-search-per-turn budget, named and extracted
   from a bare `max_uses: 5` literal 2026-09-05, Cold Frank FAIL finding F2)
5. `FETCH_TIMEOUT_MS` (`ssrfGuardedFetch.ts`, 10-second fetch timeout; carried a disqualified
   `owner: Ledger` — an agent — until Cold Frank FAIL finding F3 stripped it)
6. `MAX_RESPONSE_BYTES` (`ssrfGuardedFetch.ts`, 5 MiB response-body cap; same F3 correction)
7. `MAX_REDIRECTS` (`ssrfGuardedFetch.ts`, 5-hop redirect cap; same F3 correction)

Each has no mathematical, scientific, or programmatic precedent — per Danny's explicit ruling,
none may carry a named owner until real precedent exists; an `owner: unassigned` label is also not
acceptable (Frank: "a fourth option the rule doesn't allow"), and neither is an agent's own name
(DDR-0002 branch (b) explicitly disqualifies an agent naming itself — the defect found and
corrected in constants 5-7 above). The rule itself is now tracked in
`docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md`, not left to conversation and
commit-message history alone (a Cold Frank HALT on commit ac63adf found the rule invisible to an
isolated-worktree gate before the DDR existed). This is a tracked task, not a label on the
constant: next real step is dispatching `benchmark` to check whether this pipeline's own
`SchemaValidationAttempt` history already has real data on repair-attempt success rates that could
ground `MAX_REPAIR_ATTEMPTS` instead of leaving it a bare assumption. Until that lands, these seven
constants stay exactly as documented in their own source comments: real, in production, unsourced,
undeleted — not quietly built on further.

**`MIN_CONTENT_LENGTH` resolved by deletion (2026-09-05, Danny's explicit ruling).** It was doing
two jobs: (1) catching a literally-empty/whitespace-only response, and (2) distinguishing real
content from a paywall/JS-shell page with substantial markup but no substance. Job 2 does not
belong at the fetch layer — it is already handled correctly downstream, where content extraction
either finds real claims/evidence in the content or produces a legitimate `NegativeFinding` if it
doesn't. Job 1 needs no arbitrary number at all — it is a strict definition with no threshold to
source: the response body, trimmed, has zero length. The constant is deleted entirely from
`resolveSourceArtifact.ts` and `classifyRetrievalOutcome.ts`, both of which now apply this
strict-emptiness check independently. This removes it from the eight-constant list above (now
seven) — it is resolved, not tracked-open. An earlier measurement-based approach to this constant
(a `benchmark`-style URL-fetch harness under `scripts/`) was abandoned in favor of this deletion
and its untracked artifacts were removed.

**Real-LLM test environment gap (as of this commit, branch `fix/llm-and-resolver-constant-integrity`).**
The real-LLM-call test suite (`extractClaimsAndEvidence.test.ts`) cannot run in this environment:
it fails with `400 invalid_request_error: Your credit balance is too low`. The same failure was
confirmed present at this branch's base commit (i.e. environmental, not a regression introduced by
this branch's changes). Consequence: the `stop_reason` classification logic added/changed in both
`llmClient.ts` (`callForcedTool`'s `max_tokens`/`pause_turn`/`refusal` branches) and
`searchWebAdapter.ts` (its `end_turn`/`pause_turn`/`tool_use` handling) has only been verified
against mocked Anthropic SDK responses at this commit — it has not been exercised against a live
model call. Not fixed here; this note only records the gap honestly. Credentials/credit
replenishment is out of scope for this fix.

Test counts ARE now recorded for closed slices, but only as runner output taken at a quiescent
database against a schema replayed from the migrations as written — never as an agent's report.

A count is not a coverage claim. Agent-reported counts were found inflated twice on 2026-08-14
(15→12, 14→13); two separate tests were found asserting nothing (one `expect(true).toBe(true)`,
one asserting its own fixture); and on 2026-08-16 an entire slice was found green against a
database schema that did not match its own migrations. Read the assertions, and check what
database the suite ran against. The suite also deadlocks on `TRUNCATE` if another process touches
the DB concurrently, so a green result taken during concurrent runs is not evidence.

**Environment is part of a quarantine.** When work is quarantined, reverting git is not enough —
a quarantined migration may already have written its schema into the shared dev database, where a
filename-tracking runner will never replace it. Dump the schema before rebuilding, and verify the
live schema against the migration set rather than inferring it from a passing suite.

Open, unowned items carried forward (none blocks Slice 9's close):
- `callId` is typed optional (`provenanceContext.ts`) while `buildValidationRecords`' safety
  property depends on it always being set; the `inv.callId ?? inv.toolName` fallback would merge
  two same-tool calls and make the `error: undefined` branch live. Dead today, unenforced.
- `landscapeResearcher.ts:276-292` deliberately absorbs a nested extraction failure into a
  landscape success when evidence is non-empty. Documented as intentional and predates the G-1
  precedence ruling, which it now sits crosswise to.

Last updated: 2026-08-14

## Fix Attempts (Slice 8 — Provenance Recorder)
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| Architecture design (§1.9) | 1 | @architect designed an AsyncLocalStorage-based collector per Danny's explicit "instrument, don't duplicate" directive — zero-churn to all 7 existing call sites. Resolved a roadmap-scope question explicitly: Slice 8 builds the Provenance Recorder library, Slice 9's generateBriefVersion orchestrator wires it into the actual pipeline sequence — not guessed silently. |
| Implementation + fixture round + QC pass 1 | 1 | 225/225 after a migration-application fixture round (migration 006 wasn't applied to the test DB, plus 2 real test-fixture bugs it surfaced: a non-UUID literal in a uuid column, and 8 tests missing a required parent generation_run row for a new FK — both fixed). QC pass 1: FAIL — 2 blocking findings. BLOCKER-1: migration 006's FK on web_search_query.generation_run_id was an immediate validating constraint that QC live-probed would fail against real pre-existing orphaned data from Slice 6 (migration 005 shipped this column with no FK at all). BLOCKER-2: buildValidationRecords grouped tool invocations by toolName alone — QC live-probed that two callForcedTool calls with the same tool name within one step would merge into a single fabricated SchemaValidationRecord with an impossible attempts sequence, violating the documented 1+MAX_REPAIR_ATTEMPTS bound; latent today but explicitly anticipated by Slice 9's step design. |
| Fix round + QC pass 2 | 1 | BLOCKER-1 fixed via NOT VALID constraint (skips validating existing rows, still enforces new writes, documented rationale for not using migration 005's DEFERRABLE pattern). BLOCKER-2 fixed via a per-invocation callId (UUID) generated once per callForcedTool call, grouping by callId instead of toolName. Also fixed a related field-semantics issue (fieldPath was silently holding a tool name instead of its documented schema-field-path meaning — redocumented honestly rather than faked) and corrected a now-false "zero churn" claim in the architecture doc. QC pass 2: PASS — all fixes independently re-probed against QC's own constructed scenarios (a fresh orphaned-row DB state, a fresh same-tool-twice invocation sequence), not just the committed tests. 227/227 tests, tsc clean. |

## Fix Attempts (Slice 7 — Uncertainty Compiler + Recommendation Engine)
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| Architecture design (§1.8) | 1 | @architect confirmed the candidate-output pattern applies (both entities carry briefVersionId); identified a missing read helper (getClaimVersionsForInvestigation) needed for contradiction detection; established that only compileUncertainty ever interprets upstream generationFailed flags (recommendationEngine never sees raw upstream flags), applying the Slice-6-BLOCKER-1 lesson explicitly. |
| Implementation + type-fix + QC pass 1 | 1 | 204/204 after a type-fix round on test fixtures (missing citedDemandSignalIds field, wrong LlmValidationError constructor arity — mechanical, not logic bugs). QC pass 1: FAIL — 2 blocking defects in the new getClaimVersionsForInvestigation.ts read helper. BLOCKER-1: cross-investigation evidence leakage — the evidence-fetching query was unscoped by investigation, so a ClaimVersion with evidence cited across two investigations leaked the foreign investigation's evidence into the result, directly feeding uncertaintyCompiler's contradiction-surfacing logic with a false cross-investigation contradiction. BLOCKER-2: created_at typed as string but is actually a runtime Date object — a type lie inconsistent with this codebase's established Date/.toISOString() precedent, uncaught because no test asserted the field's actual type. |
| Fix round + QC pass 2 | 1 | Both blockers fixed (query now joins through source_artifact and filters by investigation_id; created_at typed Date with .toISOString()), both independently re-verified by QC via its own constructed two-investigation scenario. QC pass 2: FAIL — 1 new finding, BLOCKER-3: a roadmap-mandated test (numeric-scope non-adoption: an unverifiable claim like "$50M market" must not be adopted into Recommendation.rationale or DemandConfidenceClassification.narrative as validated) was entirely missing. Investigation revealed this was not just a test gap — the DemandConfidenceClassification.narrative half of the guard was never implemented in Slice 5's demandAnalyzer.ts at all, a genuine unimplemented requirement discovered retroactively. |
| Retroactive Slice 5 fix + QC pass 3 | 1 | Added the missing prompt-instruction guard to demandAnalyzer.ts (mirroring recommendationEngine.ts's existing guard), added prompt-capture tests for both guards. QC pass 3: PASS — verified via mutation testing (replaced guard text with "MUTATED" in both files, confirmed exactly the 2 new tests failed and nothing else), not just a green suite. Noted as a standing limitation: this is a best-effort prompt constraint, not an enforced output-side invariant — worth revisiting if a hard guarantee is ever needed. 208/208 tests, tsc clean. |

## Fix Attempts (Slice 6 — Landscape Researcher + Gap Hypothesis Generator)
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| Architecture design (§1.7) | 1 | @architect designed both services per the candidate-output pattern; caught a real design gap during design (not implementation): extractClaimsAndEvidence reprocessing all sources unconditionally would silently duplicate evidence when called again after searchWeb creates new landscape-research SourceArtifacts. Resolved via a scoped extractClaimsAndEvidenceForSourceArtifacts refactor, existing function becomes a thin wrapper. |
| Implementation + QC pass 1 | 1 | 177/177 tests passing. QC pass 1: FAIL — 2 blocking findings, both in landscapeResearcher.ts. BLOCKER-1: extraction's generationFailed:true (meaning "no problem statement established" — normal/expected for landscape pages) was propagated as a landscapeResearcher-level failure, discarding already-persisted non-empty evidenceItems; the test fixture had hardcoded evidenceItems:[] alongside generationFailed:true, encoding the same wrong assumption as the bug, making it untestable by the existing suite (shared-well instance). BLOCKER-2: outer catch returned webSearchQueries:[] on any escaping error, discarding provenance for WebSearchQueries searchWeb() had already committed to the DB before the throw. |
| Fix round + QC pass 2 | 1 | BLOCKER-1: landscapeResearcher.ts now only treats extraction as a failure when evidenceItems.length === 0; non-empty evidence used regardless of inner generationFailed. BLOCKER-2: issuedWebSearchQueries tracked in outer-catch-visible scope, returned instead of []. Both independently re-verified by QC via its own constructed scenarios (different mocking seam than the committed tests), including inverse cases to rule out over-correction (empty evidence still fails closed; first-call throw still returns []). QC pass 2: PASS. 179/179 tests, tsc clean. 3 non-blocking observations logged for Slice 8/9 (generationFailureReason dropped when evidence overrides failure; minor error-path asymmetry; an aliased-not-copied array). |

## Fix Attempts (Slice 6 — searchWeb failure boundary)
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| Architecture design (§1.6) | 1 | @architect designed the searchWeb adapter contract per Danny's explicit direction: failure classification lives at the adapter boundary, not on Anthropic provider behavior. Extracted SSRF-hardened fetch machinery into shared ssrfGuardedFetch.ts; retrieved/blocked/failed classification table; not-dropped persistence invariant; migration 005. |
| Implementation + QC pass 1 | 1 | 145/145 tests passing (post 3-item fix-round: type error, unapplied migration, and a red herring ipv4ToInt failure that turned out to be the TEST's own int32-overflow arithmetic, not a code bug — SSRF extraction confirmed byte-faithful vs Slice 4). QC pass 1: FAIL — 6 blocking findings: F1 searchWebAdapter's `.find()` silently dropped URLs/limitations from search blocks 2-5; F2 unguarded response.content could throw; F3 duplicate URLs caused a UNIQUE violation that rolled back and lost the entire search record; F4 SourceArtifact insert outside the persistence transaction (orphan-row risk); F5 unreachable dead-code assertion; F6 malformed-URL error message falsely claimed a protocol cause. |
| Fix round 1 + QC pass 2 | 1 | F1/F3/F4/F5/F6 confirmed fixed via live probes. F2 NOT fully fixed — 3 remaining malformed-response shapes (null response, null content item, item missing url) could still throw or, worse, silently emit `null` into selectedResultUrls. New finding N1: that null-url leak chained into a second total-loss bug (NOT NULL violation rolling back the whole record) — same failure class as F3, different route. N2: architecture doc still said queryLimitation was populated "iff query-limited," now false since F1 allows partial-success+limitation. N3: dedup fix (F3) contradicted the literal not-dropped invariant text in 02-ARCHITECTURE.md §1.6 item 4 — escalated to Danny rather than silently resolved. N4: classification table row not split to match F6's two distinct messages. |
| Danny's ruling (N3) | — | Keep deduplication. Invariant applies to the deduplicated list: `persistedResults.length === deduplicatedSelectedResultUrls.length`. Provider-returned duplicates collapse before retrieval and must not create duplicate audit records. Update 02-ARCHITECTURE.md and INVARIANTS.md accordingly. |
| Fix round 2 + QC pass 3 | 1 | F2 fully closed (guards null response, drops malformed/url-less items, folds drop-count into queryLimitation so it's never silently invisible). N1 resolved as a structural consequence, independently re-verified via fuzzing 9 invalid url-value shapes through the adapter. N2/N4 doc fixes applied. N3: docs/INVARIANTS.md checked directly — contains no web-search-specific invariant text (QC's pass-2 line reference was a misread); the only contradicting text was in 02-ARCHITECTURE.md, now fixed to match Danny's ruling. QC pass 3: PASS — closes DDR-0001 Row 9 (PROVISIONAL → PASS). 151/151 tests, tsc clean. |

## Fix Attempts (Slice 5)
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| QC pass 1, Slice 5 | 1 | Blocking: Slice 4's F-3 fix (unhandled non-validation errors → generationFailed) regressed verbatim in both demandAnalyzer.ts and personalPullExtractor.ts — API/DB errors escape unhandled, live-reproduced. Blocking: all-signals-dropped (e.g. every signal has hallucinated/invalid evidence indices) produces a false, self-contradictory result — generationFailed:false, a real confidence level + narrative claiming demand exists, AND a negativeFindingSignal simultaneously claiming zero signals were found — live-reproduced with a mocked 2-signal response where both drop. Blocking: negativeFindingSignal is populated on failure paths (zero-evidence, LlmValidationError) even though its own doc comment restricts it to "zero signals found," not "run failed" — a failed run has an unknown signal set, not a confirmed-empty one. Blocking (test gap): the R-4 validator itself (validateRawDemandAnalysis/validateRawPersonalPullExtraction) is never executed by any test — both test files mock callForcedTool, so enum rejection, otherTypeLabel requirement, and non-empty evidenceIndices enforcement have zero real coverage. |
| Fix round, Slice 5 | 1 | @code-executor fixed F-1/F-2/F-3 (outer try/catch mirroring extractClaimsAndEvidence.ts; all-dropped now generationFailed:true; negativeFindingSignal unset on all failure paths). @test-writer added F-4 coverage in two new sibling files (demandAnalyzer.validation.test.ts, personalPullExtractor.validation.test.ts) mocking @anthropic-ai/sdk below callForcedTool so the real R-4 validators execute; correctly declined to fabricate a "level=Insufficient with signals cited" test since no such rule exists in spec or code. |
| Test-runner, round 1 | 1 | 105/106 passing — 1 stale test (demandAnalyzer.test.ts:245) asserting the pre-fix "negativeFindingSignal populated on zero-evidence path" behavior that F-3's fix deliberately removed. Not a regression — an intentionally-changed contract the test hadn't caught up to. |
| Test-writer, stale assertion fix | 1 | Updated the one test to expect negativeFindingSignal undefined on the zero-evidence generationFailed:true path; renamed test description accordingly. |
| QC pass 2, Slice 5 | 1 | F-1 through F-4 independently re-verified fixed (live-probed ECONNRESET/API errors, all-dropped scenario, negativeFindingSignal unset on 4 distinct failure sites). New finding F-5 (non-blocking to logic, blocking to gate): two doc comments (domain.ts:198, demandAnalyzer.ts:227) still asserted the pre-fix "iff zero signals found" contract, contradicting the fix — risk flagged specifically because Slice 9's Brief Assembler will read this contract later. |
| Doc fix, F-5 | 1 | Orchestrator (Ledger) corrected both comments directly (comment-only, no logic change) to qualify "...AND generationFailed === false". |
| QC pass 3, Slice 5 | 1 | PASS. F-1 through F-5 all closed, no new findings. 106/106 tests, tsc clean. |

## Fix Attempts (Slice 4, cont.)
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| F-2 concurrency test, post-QC-PASS hardening | 2 | QC's second pass flagged the committed F-2 regression test as non-blocking-but-weak: it didn't actually force the race it claims to test (both concurrent calls created new claims instead of superseding the same one). Rewrote to target the real contended claim; falsification (test-runner) then found the rewrite still didn't reliably reproduce the race on real async timing (0/6 failures with the lock disabled) — narrow window, not a fix regression, since QC's own independent probe (with an artificial delay) had already proven the underlying advisory-lock fix sound. Added a production-safe test-only delay seam (three delay-placement strategies tried before finding one that actually forces the collision) — now 5/5 deterministic failures with the lock removed, 5/5 clean with it restored. |

## Checkpoint Correction (post-Slice-3, pre-Slice-4) — independent review findings
Independent PR review (Sol) found 3 issues at the retrieval boundary Slice 4 depends on before
Slice 4 began: resolved content was discarded (no durable snapshot for extraction to use), SSRF
vulnerability in URL fetching (no protocol/private-network/size guards), unguarded status
transitions (blocked-transition could overwrite generation-failed), plus a discriminator bug
(non-text/url types silently fetched as URLs). All four fixed, 57/57 tests. QC's live-probe
review then found a real, live-exploited bypass in the fix: IPv4-mapped IPv6 addresses
(`[::ffff:7f00:1]`) bypass the private-IP check entirely — the dotted-form regex meant to catch
this can never match, since WHATWG URL normalizes to compressed hex before the check runs. Live
loopback fetch succeeded and persisted content through this path. Also flagged: several IP ranges
(CGNAT 100.64.0.0/10, multicast 224.0.0.0/4, 240.0.0.0/4, 192.0.0.0/24) not blocked. Fixed:
hex-form decoder added and independently verified live against a real loopback listener (2 QC
rounds), all four ranges added and live-verified, decoder confirmed to generalize beyond its own
test cases (probed with addresses appearing nowhere in the suite), no new false positives
introduced. 64/64 tests. Two minor residual gaps logged, non-blocking, not exploitable in this
MVP's scope: `febx::` link-local prefix variants beyond `fe80:`, NAT64 64:ff9b::/96 embedded
IPv4. Checkpoint CLEARED — Slice 4 unblocked.

## Fix Attempts (Slice 4)
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| test-writer audit, Slice 4 | 1 | Two real coverage gaps found and closed: only 1 of 4 immutability triggers tested (same blind-spot shape as Slice 2's scoped-query history); R-4 repair-then-fail control flow never actually exercised (every existing test mocked callForcedTool itself). Real implementation bug found, not yet fixed: 004_claims_and_evidence.sql's trigger-existence guards query pg_trigger unscoped by table (tgrelid), same unscoped-catalog-query class as Slice 2's 002_nullable_submission_id.sql bug (which does scope correctly) — trigger names are unique per-table in Postgres, not globally, so a same-named trigger elsewhere could cause a guard to silently skip creating the intended one. |

| QC pass 1, Slice 4 | 1 | Blocking: duplicate evidenceIndex within one claim (model citing the same excerpt with two stances, e.g. supporting+contradicting — explicitly invited by the prompt) violates the claim_version_evidence PK and crashes the WHOLE transaction unhandled, destroying every valid claim in the run, not just the bad one — violates per-entity fail-closed semantics. Blocking, same crash class: concurrent extraction runs on one Investigation race on version_number (existing-claims lookup outside the transaction), unhandled UNIQUE violation. Minor: non-LlmValidationError failures (API/rate-limit/DB errors) aren't converted to the generationFailed signal Slice 9 depends on; undeclared evidence_item.created_at column; unused Claim import. Observation (not blocking, documented not fixed): Claims/EvidenceItems from a failed run are still committed — legitimate since they're Brief-independent, but undocumented; prompt-injection surface via raw resolvedContent interpolation, flagged for Slice 6 (web research), not this slice. |

## Slice 6 Carry-Forward Note (from Slice 4's QC)
- `resolvedContent` is interpolated raw into the LLM prompt with no delimiter escaping — a
  fetched page could close the pseudo-XML tag and inject instructions. Not exploitable yet
  (Slice 4 only processes human-submitted/already-resolved sources), but Slice 6 (Landscape
  Researcher, autonomous web retrieval) is where this becomes a real attack surface — address
  before or as part of that slice.

## Slice 4 Carry-Forward Notes (advisories from Slice 3's QC, non-blocking)
- `server.ts` issues raw SQL from the web layer for the blocked/open status transition — a small
  service function would keep layering consistent with the rest of the codebase.
- Every POST to `/investigations` re-resolves ALL of an Investigation's sources, including
  already-resolved ones — a transient failure could downgrade a prior `content-retrieved` source.
  Worst case N×10s blocking the redirect. Worth addressing if resolution becomes a bottleneck.
- `resolveSourceArtifact`'s abort/timeout branch has no dedicated test.

## Fix Attempts (Slice 3)
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| QC pass 1, Slice 3 | 1 | Blocking: blocked-to-open recovery never fires — server.ts's POST handler only sets status to 'blocked' when allUnreachable, never clears it back to 'open' when a newly-added source resolves successfully, live-verified via full HTTP flow (dead URL -> blocked -> add reachable source via the Blocked screen's own recovery link -> status stays 'blocked', screen still says no source was reachable while a retrieved source is listed). Breaks the only remedy Flow 2 offers. Advisory folded into same fix: Blocked view never renders statusReason though UI Spec names it as that screen's reason-statement data source and it's already being written. |

## Slice 3 Carry-Forward Notes (from Slice 2's QC)
- `server.ts`'s ad-hoc `SELECT id, status FROM investigation` (line ~89) must be replaced by
  a real `getInvestigation` read function — the roadmap explicitly forbids ad-hoc status
  queries scattered elsewhere once this exists.
- Generating State currently renders unconditionally regardless of `Investigation.status` —
  must gate on `status === 'open'` once Blocked/Generation-Failed states exist.
- `migrate.test.ts`'s two CHECK-constraint assertions are non-vacuous only because a preceding
  `is_nullable === 'YES'` assertion incidentally rules out the NOT NULL path first — fragile
  coupling, worth asserting the constraint name directly in the error message if this file is
  touched again.

## Fix Attempts
| Test/File | Attempts | Last Error |
|-----------|----------|------------|
| submitSources.test.ts (adds to existing Investigation) | 1 | Intermittent Postgres "deadlock detected" in per-artifact INSERT loop, real production concern not just test flake; passed on immediate rerun. Routed to code-executor for proper transaction/lock-ordering fix, not a retry workaround. (Fixed: root cause was cross-test-file TRUNCATE race, not app bug; batched insert + fileParallelism:false, verified 5x stable.) |
| QC pass 1, Slice 2 | 1 | Blocking: schema.sql submission_id NOT NULL breaks the spec'd landscape-research origin path (live 23502 error); submittedAt returned as JS Date not contracted ISO-8601 string; async route handler has no try/catch, hangs forever on DB error (verified live). Non-blocking-fix-now: type-openness test only proves non-closure not non-widening; no test persists landscape-research origin; Generating State doesn't render Investigation.status; submit control not disabled/busy during in-flight request (double-submit risk). Plus: close the untested-client-JS gap with jsdom in the same pass. (All 8 fixed and re-verified via live falsification testing.) |
| QC pass 2, Slice 2 | 1 | Blocking: migrate.ts silently no-ops on any pre-existing DB — CHECK constraint inside CREATE TABLE IF NOT EXISTS never reaches an already-created table, runner reports success regardless (reproduced live: NOT NULL still present, no CHECK, after "Migration applied"). Blocking: kind selector (URL/Text) has no effect, UI always renders textarea, violates UI Spec's "input matching kind." Advisory carried to Slice 3: ad-hoc SELECT id,status query in server.ts must be replaced by getInvestigation (roadmap explicitly forbids ad-hoc status queries elsewhere); GeneratingState currently renders unconditionally, should gate on status==='open' once other statuses exist; stray empty src/web/views/ directory. |
| QC pass 3, Slice 2 | 1 | Blocking (N-1 recurrence): the migration guard AND its own regression test both query pg_constraint with no schema/table scope — inside the test's isolated schema, the unscoped query finds the SAME constraint already present in `public` from the dev DB, so the guard silently skips creating it in the target schema AND the test's assertion passes against the wrong row. Falsification confirmed: deleting the entire constraint-creation block still left the test green. Classic shared-well — the fix and its verifier drank from the same wrong-schema source. Fix: scope via conrelid, and add a behavioral assertion (attempt the actual insert that should be rejected) rather than relying on catalog inspection alone. |
| QC pass 4, Slice 2 | 1 | N-1 confirmed genuinely fixed (independently re-falsified). But the requested broader sweep for the same shared-well/vacuous-assertion pattern found two more, both falsification-proven: N-3, submitSources.ts's zero-artifact guard deleted entirely still passes all 6 tests (bare rejects.toThrow() satisfied by an incidental SQL syntax error from the malformed batched INSERT, not the actual validation); N-4, the jsdom client test's DOM fixture is hand-written and never derived from the real renderSubmissionScreen() output, so it doesn't actually exercise the real markup — flipping the real default kind from 'url' to 'text' left all 26 tests green. Both are the same underlying failure shape: a test whose assertion can be satisfied by something other than the behavior it claims to verify. |

## Notes
- Spec: docs/specs/problem-department-mvp/ (Spec Gate PASSED attempt 3/3, NORTH-STAR Status: Locked)
- Runtime/storage decision: docs/decisions/DDR-0001-problem-department-runtime.md (ACCEPTED)
- Branch: feature/problem-department-mvp (off origin/main), draft PR #6
- Storage: dedicated local Postgres for Department OS Core provisioned during Slice 1 spike
  (Docker, postgres:16-alpine, port 55432, db deptos_core) — this was throwaway spike
  infrastructure per the roadmap's "not part of the shipped codebase" note; Slice 2 will need
  its own real provisioning decision (same container, or a persistent equivalent) as part of
  building the actual persistence layer.
