# Progress: problem-department-mvp

## Status: IN_PROGRESS

## Slices
- [x] Slice 1: Runtime & Storage Evaluation — COMPLETE (2026-08-10). DDR-0001 ACCEPTED. Runtime: Claude Agent SDK / direct Anthropic API. Storage: dedicated local Postgres for Department OS Core (separate from LORE).
- [x] Slice 2: Core Persistence + Intake Service + Submission Screen — COMPLETE (2026-08-10). 26/26 tests, QC PASS on 5th re-verification (5 rounds, 12 real defects found and fixed, converged via personal falsification testing).
- [x] Slice 3: Source Resolver + getInvestigation Read Path + Blocked/Generation-Failed States — COMPLETE (2026-08-10). 43/43 tests, QC PASS on 2nd re-verification.
- [x] Slice 4: Evidence/Claim Model + Extraction & Clustering Engine + Evidence Labeler — COMPLETE (2026-08-12). 83/83 tests, QC PASS on 2nd re-verification (both blocking bugs confirmed via destructive testing, not just green tests). First slice calling the LLM (forced tool-use per DDR-0001).
- [x] Slice 5: Demand Analyzer + Personal Pull Extractor — COMPLETE (2026-08-13). 106/106 tests, QC PASS on 3rd re-verification (pass 1: F-1 through F-4 blocking, incl. a regression of Slice 4's F-3 pattern; pass 2: F-5, a stale doc comment left asserting the pre-fix contract; pass 3: PASS, all closed).
- [ ] Slice 6: Landscape Researcher + Gap Hypothesis Generator — PENDING (Row 9 PROVISIONAL must be resolved before this slice begins — see DDR-0001)
- [ ] Slice 7: Uncertainty Compiler + Recommendation Engine — PENDING
- [ ] Slice 8: Provenance Recorder — PENDING
- [ ] Slice 9: Brief Assembler — PENDING
- [ ] Slice 10: Investigation Screen — Completed State — PENDING
- [ ] Slice 11: Decision Recorder + Decision Form + Decision Confirmation Panel — PENDING
- [ ] Slice 12: Validity/Invalidation Service + Decision-History Banner — PENDING

## Current
Slice: 6 starting — Landscape Researcher + Gap Hypothesis Generator
Step: pre-slice — DDR-0001 Row 9 PROVISIONAL (web-search blocked-retrieval path) must be resolved before/during this slice
Last updated: 2026-08-13

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
