# Progress: problem-department-mvp

## Status: IN_PROGRESS

## Slices
- [x] Slice 1: Runtime & Storage Evaluation — COMPLETE (2026-08-10). DDR-0001 ACCEPTED. Runtime: Claude Agent SDK / direct Anthropic API. Storage: dedicated local Postgres for Department OS Core (separate from LORE).
- [x] Slice 2: Core Persistence + Intake Service + Submission Screen — COMPLETE (2026-08-10). 26/26 tests, QC PASS on 5th re-verification (5 rounds, 12 real defects found and fixed, converged via personal falsification testing).
- [x] Slice 3: Source Resolver + getInvestigation Read Path + Blocked/Generation-Failed States — COMPLETE (2026-08-10). 43/43 tests, QC PASS on 2nd re-verification.
- [ ] Slice 4: Evidence/Claim Model + Extraction & Clustering Engine + Evidence Labeler — PENDING
- [ ] Slice 5: Demand Analyzer + Personal Pull Extractor — PENDING
- [ ] Slice 6: Landscape Researcher + Gap Hypothesis Generator — PENDING (Row 9 PROVISIONAL must be resolved before this slice begins — see DDR-0001)
- [ ] Slice 7: Uncertainty Compiler + Recommendation Engine — PENDING
- [ ] Slice 8: Provenance Recorder — PENDING
- [ ] Slice 9: Brief Assembler — PENDING
- [ ] Slice 10: Investigation Screen — Completed State — PENDING
- [ ] Slice 11: Decision Recorder + Decision Form + Decision Confirmation Panel — PENDING
- [ ] Slice 12: Validity/Invalidation Service + Decision-History Banner — PENDING

## Current
Slice: 3 COMPLETE, starting Slice 4
Step: @github-ops commit
Last updated: 2026-08-10

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
