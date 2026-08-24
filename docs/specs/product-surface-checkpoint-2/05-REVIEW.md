# Spec Review: Product Surface — Checkpoint 2

**Reviewer**: @spec-reviewer (independent, read-only)
**Date**: 2026-08-24 (round 7 — post-M6/N19/N20 remediation of the timing-constant reframe)
**Documents reviewed**: `INTAKE.md`, `INTERVIEW.md`, `NORTH-STAR.md`, `01-REQUIREMENTS.md`,
`02-ARCHITECTURE.md`, `03-UI-SPEC.md`, `04-ROADMAP.md`, `05-REVIEW.md` — all eight re-read live and
in full this round, not diffed against a prior round's notes.
**Verdict**: **READY FOR FRANK — yes.** Zero HIGH, zero MEDIUM, seven LOW carried (each fails safe,
none changes what gets built). This review does not HALT.

---

## 1. Scope of This Round

Round 6 found one MEDIUM and two LOW defects surviving the 2026-08-24 timing-constant reframe:

| ID | Severity | Defect |
|---|---|---|
| M6 | MEDIUM | `02-ARCHITECTURE.md` §5.2 asserted "not on every 2-second poll" — a live, present-tense numeric claim inside the very section the reframe rewrote |
| N19 | LOW | `02-ARCHITECTURE.md`'s header did not log its own 2026-08-24 revisions |
| N20 | LOW | `02-ARCHITECTURE.md`'s Output Verification still described the pre-H-1 "new JSON connector" design |

This round: (1) verify those three; (2) re-sweep ALL eight documents for surviving timing numerals
with a *broader* pattern than the one that let M6 through; (3) re-confirm no regression across all
prior corrections; (4) fresh live-source spot-checks; (5) decide.

---

## 2. M6 / N19 / N20 — Verified Fixed

**M6 — FIXED.** `02-ARCHITECTURE.md:1734` now reads:

> "...keeping the frequently-polled workspace payload small and the seven-element Brief payload
> fetched exactly once per version, **not re-fetched on every poll tick**."

No numeral, no unit, no implied magnitude. The clause still carries the design rationale it existed
to carry (payload-size separation between `getInvestigationWorkspace` and `getBriefForReview`),
so the fix removed the defect without removing the information. Read in surrounding context
(`02:1728-1738`), not grep-matched in isolation: the whole paragraph is now consistent with the
engineering-ownership framing twenty lines above it at `02:1713-1720`. The contradiction round 6
identified — a concrete number and an abstract prohibition in the same section, with the number
winning for any Forge reader — is gone.

**N19 — FIXED.** `02-ARCHITECTURE.md:9` now records all five of this document's 2026-08-24
revisions by name: §1.3's re-verification pass, §1.4's H-1 correction, §3.1b's H-2 correction, §4.2
steps 5/5b's two-catch correction, and §4.9/§5.2's timing-constant reframing. Each named revision
was independently confirmed present in the body this round (see §4 below). The header no longer
under-reports its own document's revision history — the defect class N18 already closed on `01`.

**N20 — FIXED.** `02-ARCHITECTURE.md:1930` (Output Verification, Finding 4 line) now reads
"reuse and extend the existing `POST /api/investigations` route, no new `:id/sources` route" —
matching §1.4, §3.1b, §4.1, §8, and H-1's on-record ruling. The stale pre-H-1 description is gone.

---

## 3. Exhaustive Numeric Sweep — All Eight Documents, Broadened Pattern

Round 6's sweep missed M6 because it searched for the literal forms `~2s`, `~2000ms`, `2000` and not
the spelled-out hyphenated `2-second`. This round the pattern was widened before searching, in three
independent passes across all eight files:

1. `\b\d[\d_,.]*\s*(ms|millisecond|second|sec|s|minute|min|hour)\b` — any digit followed by any
   time unit, abbreviated or spelled out.
2. `(one|two|three|four|five|six|ten|fifteen|twenty|thirty|sixty|ninety)[- ](second|minute|ms|
   millisecond|hour)` — spelled-out cardinals, hyphenated or spaced. **This is the pass that would
   have caught M6.**
3. `(every|each|per)\s+(\d+|one|two|three|five|ten|thirty|sixty|half)`, `\d+\s*[×x]`,
   `\d+(\.\d+)?\s*(s|ms)\b`, `\d+_\d+` — cadence phrasing, multipliers, underscore-separated
   literals.

Every hit across all eight documents, adjudicated:

| Location | Hit | Adjudication |
|---|---|---|
| `02:1627` | `FETCH_TIMEOUT_MS = 10_000` | **Legitimate context citation, re-verified live** — `src/services/ssrfGuardedFetch.ts` declares it. The doc states explicitly it bounds a single outbound source-URL fetch and is "cited here for completeness, **not reused as a source for this value**." Not a default for either constant. |
| `03:21` | `"~2 seconds," "~2000ms"` | **Correction-history prose**, inside the 2026-08-24 revision banner naming exactly what was withdrawn and why. Quoted as the withdrawn claim, not asserted. Desirable — the withdrawal is traceable. |
| `04:25`, `04:1440-1441` | `PROVISIONAL`/numeric framing | **Negations.** Both state the values are "never PROVISIONAL with Danny as named owner" and "never asserted as specific numbers." Correct. |
| `05` (this file, prior body + Disposition) | `2-second`, `2000`, `10000`, `10_000` | **Review-history prose** — the round-4/5/6 findings and Frank's superseded gate entries. Historical record, not spec assertion. Preserved deliberately (see §7). |
| `INTAKE:36`, `01:32`, `04:916` | `501s`, `404s` | HTTP status codes matched by the `\d+s` pattern. False positives. |
| `01:466`, `03:1028`, `04:438`, `02:996`, `02:1324` | "every one of these" | Prose. False positives. |

**Result: zero surviving live numeric assertions for `POLL_INTERVAL_MS` or `STALE_THRESHOLD_MS`
anywhere in the eight documents.** Every reference to either constant across `01`-`04` is
behavioral or derivational.

**Danny-ownership framing sweep — also clean.** No document frames either constant as PROVISIONAL
with Danny as named owner, or as pending his ratification. `03:1122-1126` carries an explicit
self-check to this effect; `04:1294-1303` makes it a binding roadmap constraint; `01`'s
Non-Functional Requirements section states the derivation obligation as the sole source of the
values. The three documents agree, and none contradicts `02` §4.9's methodology.

**One asymmetry, noted and judged non-blocking (N22, LOW).** `01-REQUIREMENTS.md`'s Non-Functional
Requirements still allow "an explicit PROVISIONAL-tag-with-named-owner" as one satisfying option
for these two constants, alongside the measurement derivation, while `04:1294-1303` prohibits a
Danny-owned PROVISIONAL value outright. These are reconcilable — `01` permits a PROVISIONAL tag with
*some* named owner (which, post-ruling, would be an engineering owner, not Danny) and `04` prohibits
specifically a Danny-owned one — and `01`'s own preceding sentence names the measurement as the
required citable derivation. The residual risk is that Forge reads `01`'s general clause as a
license to skip measurement. It is mitigated structurally: C2-S3's Done-When cannot be marked
complete without the measurement-and-report step (`04:698-706`, `04:827`), which is a checkbox, not
prose. Fails safe.

---

## 4. Regression Re-Confirmation Across Prior Corrections

Spot-checked eight prior corrections at current text (target was five), by reading the cited
locations in context rather than trusting a prior round's assertion:

| Correction | Check at current text | Status |
|---|---|---|
| **H-1** (reuse `POST /api/investigations`, no `:id/sources`) | Full-corpus `:id/sources` sweep: every hit across `01`-`04` is an explicit negation ("not a new `:id/sources` route") or a withdrawn-claim record. **Zero live references to the removed route.** `02` §1.4, §3.1b's 7-step branch, §4.1, §5.3, §8; `03:13/:271/:696/:1012/:1137`; `04:6/:97/:1264/:1335` all consistent. | **HOLDS** |
| **H-2** (benign no-op vs. genuine conflict) | `02:422-436` (409 shape, narrowed) and `02:466-489` (step 6's compare-to-step-2 branch, with the `'generation-failed'` rationale parenthetical) intact and mutually consistent; `04:9-11` syncs C2-S2's test list to it. | **HOLDS** |
| **§4.2 steps 5/5b two-catch** | `02:1080-1093` (synchronization catch — explicitly forbidden from writing a terminal record or referencing `generationRun`) and `02:1119-1165` (finalization safety net, attached only after `generationRun` is assigned) are two structurally distinct handlers. `04:645-652` and `04:717-719` mirror it. | **HOLDS** |
| **§1.3 honest gap disclosure** | `02:114-129` still discloses the meta-failure gap (a throw inside `finalizeGenerationRun`/`attemptGenerationFailedTransition`/`client.release()` propagates un-finalized) rather than the prior "confirmed live" overclaim — and §4.2 step 5b is the mechanism that answers it. The reframe did not soften this back. | **HOLDS** |
| **Finding 5 / US-13 AC2** | `02` §4.8's six-step mechanism intact: `resolution_status = 'content-retrieved'` (excludes unreachable/unresolved/empty), consumed-evidence join, trimmed/case-normalized `raw` duplicate check, and step 6's explicit statement that the fourth disqualifier is satisfied structurally so Forge does not add a redundant query. Function name still the renamed `hasEligibleNewEvidenceSinceCurrentBriefVersion`. | **HOLDS** |
| **§1.2 no-actor-field** | `decidedBy` sweep across `01`-`04`: every hit is the §1.2 resolution, a "no `decidedBy`" comment, or a prohibition (`02:759`, `02:789`, `02:1215`, `04:1068`, `04:1122`, `04:1139`). Migration 010 has no `decided_by` column. `nextCheckAt` prohibitions (`01:448`, `01:763`) intact. | **HOLDS** |
| **G12** (US-5 AC3 joint completion) | `04:120-127` states the split; `04:1257` quotes the ruling's clause (b) verbatim; `04:687-695` is C2-S3's own Done-When claiming AC3 only via the integrated test/demonstration, with C2-S2 named as a precondition. `01:338-342` points at the roadmap as the binding statement rather than asserting it. | **HOLDS** |
| **Phantom join table** (round-1 finding) | Zero references to `brief_version_claim_versions` anywhere in the doc set; `02` §4.7 step 2 uses `WHERE $1 = ANY(brief_version.claim_version_ids)`. | **HOLDS** |

Also re-confirmed: M-2 (`ReconsiderationConditionType` declared as this checkpoint's own first
definition, `02:735-748`, mirroring migration 010's CHECK exactly); L-5 (`02:1152-1170`'s
single-object provenance calls with required `briefVersionId: null`, plus the `pool`-import and
definite-assignment caveats); L-6 (`04:738-739`'s invocation-order assertion and `04:1287`'s binding
constraint). None of the eleven Codex/Sol findings has regressed at current text.

---

## 5. Independent Live-Source Spot-Checks (fresh this round)

Three claims not checked in any prior round, verified against primary source:

1. **`source_artifact.resolution_status`'s enumeration** — `02` §4.8 step 4 claims one column check
   excludes "unresolved/unreachable" AND "reachable-no-content" in a single filter.
   `src/db/migrations/001_initial_schema.sql:35-37` declares
   `CHECK (resolution_status IN ('unresolved', 'unreachable', 'content-retrieved',
   'reachable-no-content'))`. **Exact** — `= 'content-retrieved'` does disqualify all three
   non-usable outcomes in one predicate, with no new column, as claimed.
2. **`provenanceRecorder.ts` signatures** — `02` §4.2 step 5b's safety net and its trailing note
   claim single-object parameters with `briefVersionId: string | null` required on
   `finalizeGenerationRun`. Live: `createGenerationRun(input: { investigationId, runtimeIdentifier })`,
   `recordGenerationStep(input: { generationRunId, step })`, `finalizeGenerationRun(input: {
   generationRunId, outcome, briefVersionId: string | null, client?: PoolClient })`. **Exact**,
   including the optional `client` the doc correctly omits from its sample.
3. **Migration ceiling** — `02:831-835` claims `008_reconcile_brief_versioning_constraints.sql` is
   the highest existing migration, making `009`/`010`/`011` genuinely this sprint's additions.
   `src/db/migrations/` contains `001`-`008` with no `009`+. **Exact.**

All three architecture claims survive independent verification. No spot-check found a discrepancy.

---

## 6. Cross-Reference Coverage

| Axis | Result |
|---|---|
| Requirements → Architecture | Every US-1 through US-13 maps to a named component in `02` §2's `Satisfies` column and to a §3/§4/§5 mechanism. No orphan story. |
| Requirements → UI | Every user-facing story has a Flow in `03`; US-12/US-13's read-only and evidence-gated boundaries are enforced in `03`'s header notes and component table, not only in `01`'s Out of Scope. |
| Architecture → Roadmap | Every `02` §2 component lands in exactly one owning `C2-S` slice, with `04` §1 stating why each 2026-08-23/24 correction did not move a slice boundary. Migrations `009`/`010`/`011` each have an owning slice. |
| Dependency ordering | Linear C2-S1 → C2-S5, no cycle. The one genuinely split behavior (US-5 AC3) is governed by G12's explicit joint-completion rule rather than being double-claimed. |
| Slice-identifier discipline | `04` §0 binding; no bare "Slice N" header appears in `04`. Verified. |
| Traceability | `01`'s Slice 10/11/12 trace table gives all 25 rows a stated disposition, with the summary recomputed per-row rather than carried forward. |

---

## 7. Open Items (all LOW, all fail safe)

| ID | Item | Why non-blocking |
|---|---|---|
| N16, N17, G13, G14, L-3 | Carried from prior rounds; each independently judged non-blocking by both this review and Frank. | None changes what gets built. |
| N21 | Minor phrasing residue in `04`'s header revision list (five stacked "further revised 2026-08-24" clauses). | Cosmetic; the content of each is accurate and each corresponds to a real, verified change. |
| N22 (new) | `01`'s NFR permits "PROVISIONAL-tag-with-named-owner" as an alternative to measurement for the two timing constants, where `04` prohibits a Danny-owned PROVISIONAL outright. | Reconcilable on a plain reading; the measurement obligation is enforced by a C2-S3 Done-When checkbox, not by prose. See §3. |
| N23 (new, disclosed) | The Spec-Gate Disposition's closing paragraph (`05:556-557`) still reads "One MEDIUM residue of the reframing sweep (M6, `02:1733`) is open." M6 is now closed. | **I am forbidden from modifying that section** (preserve-exactly constraint), so I disclose rather than fix. The stale sentence is a status claim about a review round, not a build instruction; no Forge task reads it. Recommend the orchestrator append a dated closure line to that section — not edit the existing text — before or alongside Frank's dispatch. |

**Explicit answer to Danny's standing question — are there ANY known unresolved gaps of any
severity? YES: zero HIGH, zero MEDIUM, seven LOW (N16, N17, N21, N22, N23, G13, G14, L-3 — eight
identifiers, of which L-3/G13/G14 are the three carried unchanged from prior rounds).**

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation (in-spec) |
|---|---|---|---|
| Forge picks timing constants by guess rather than measurement | M | H | `04:698-706` makes the measurement-and-report a Done-When checkbox for C2-S3; `04:827` repeats it; `02` §4.9 gives the exact four-step methodology and where the evidence is recorded |
| Node 22 `safeLookup` fix's true failure boundary differs from the design's expectation | M | M | `02` §4.6 explicitly withdraws the IP-literal exemption as an assertion and assigns boundary diagnosis to C2-S1 as instrumented Forge work; all four regression tests are written to hold either way |
| Meta-failure of the finalization write path leaves a run non-terminal | L | M | Disclosed honestly in `02` §1.3; §4.2 step 5b's second catch is the answer; `04` tests it directly |
| In-process generation is not crash-durable | H (by design) | M | Explicitly out of scope, honestly disclosed in UI copy (`03:218-230`), and separated from the stale/interrupted disclosure requirement which is binding |
| Extending the live `POST /api/investigations` handler regresses the create path | L | H | `02` §3.1b's step-by-step branch marks each step "identical to today" or "explicit addition"; C2-S2's tests cover both paths |

---

## 9. Assumptions

| Assumption | Impact if wrong |
|---|---|
| The recorded 2026-08-22 and 2026-08-24 rulings (scope restoration, H-1, timing-constant ownership) faithfully state Danny's decisions | Material scope or design would be built on a misrecorded ruling. **No document review can discharge this** — it is due at human approval, and it is the surviving half of Frank's dissolved Carried Condition. |
| `generateBriefVersion`, `submitSources`, `resolveInvestigationSources`, `transitionInvestigationStatus` remain correct except where US-7 touches `ssrfGuardedFetch` | `01`'s Constraints make this a blocking finding to raise, not to work around |
| Real-run measurement in C2-S3 will yield a usable latency distribution | If generation latency is too variable to derive a safe threshold, C2-S3 must raise it rather than pick a number |

---

## 10. Approval Checklist

### Requirements (01)
- [x] Summary, scope, out-of-scope, edge cases, anti-patterns, constraints all populated
- [x] Every user story has testable acceptance criteria
- [x] No numeric timing constant asserted anywhere
- [ ] Reviewed by human

### Architecture (02)
- [x] Every requirement has architecture coverage
- [x] Schemas are complete TypeScript, not pseudocode
- [x] Every reconciliation gap resolved with a stated reason, not silently patched
- [x] Header logs its own revisions (N19)
- [x] Output Verification matches the H-1-corrected design (N20)
- [x] Zero live timing numerals (M6)
- [ ] Reviewed by human

### UI Spec (03)
- [x] Every user-facing story has a flow; every state has a rendering
- [x] Honest-progress, stale/interrupted, and no-phantom-control rules explicit
- [x] Engineering-owned-constants guarantee stated and verified
- [ ] Reviewed by human

### Roadmap (04)
- [x] Every architecture and UI component has an owning slice
- [x] Linear dependency chain, no cycles
- [x] Measurement obligation is a checkbox, not prose
- [x] G12's joint-completion rule stated in both affected slices
- [ ] Reviewed by human

### Overall
- [x] Zero HIGH, zero MEDIUM findings
- [x] All risks have in-spec mitigations
- [x] All prior corrections hold at current text
- [ ] Danny confirms the recorded rulings faithfully state his decisions (the one assumption review cannot discharge)

---

## 11. Verdict

The three defects round 6 held on are fixed, verified in context rather than by grep alone. The
broadened numeric sweep — run with the spelled-out-cardinal pattern that would have caught M6 — finds
zero surviving live timing assertions across all eight documents. Eight prior corrections re-confirmed
at current text, none regressed. Three fresh live-source spot-checks all exact.

Nothing remains that I would expect Frank to find in the sections this round was convened to fix.
The residual LOWs are disclosure and phrasing items; none changes what gets built, and N23 is a stale
sentence inside a section I am constrained not to edit — disclosed above for the orchestrator.

**Dispatch Frank.** He should receive the eight documents and, if useful, this review's *findings* —
never its route, its greps, its patterns, or which files I opened.

**READY FOR FRANK: yes.**

This review does not HALT.

---

## Spec-Gate Disposition

Canonical record of spec-gate findings and current disposition — not a chronological gate log
(removed per Danny's 2026-08-23 ruling: attempt-by-attempt narrative is exactly the kind of
tracking artifact this checkpoint's file constraints prohibit, whether it lives in `GATE-LOG.md`
or inline here). This section states what was found and what is currently true; it does not
narrate the sequence of attempts that got here.

**Findings, resolved:**
- A false live-schema claim in `02-ARCHITECTURE.md` §4.7 step 2 (asserted a
  `brief_version_claim_versions` join table that was never created) — resolved. The real
  mechanism is array containment against `brief_version.claim_version_ids UUID[]` (migration 007),
  verified directly against the migration file. Zero remaining references to the phantom table in
  `01`-`04`.
- `01-REQUIREMENTS.md`'s `assignValidityState` signature used `status` (contradicting the
  project's own `assignedState` vocabulary rule) and omitted `recordedBy` — resolved; now reads
  `assignedState`/`recordedBy`, matching `02` and `04`.

**Findings, disclosed and judged non-blocking (independently, by both review and Frank):**
N16, N17, G11, G13, G14 — see body of this review for detail on each. None changes what gets
built; each fails safe.

**G12 — RESOLVED, Danny's ruling, 2026-08-23 (recorded here as the on-record answer; not present in
any earlier-dated section of this document, which predates the ruling):** US-5 AC3 may be
satisfied jointly by C2-S2 and C2-S3 only when (a) the dependency between them is stated explicitly
in both slices' own text, (b) neither slice's own Done-When claims independent completion of AC3,
and (c) an integrated test and browser demonstration prove the complete behavior. ACCEPTED.

**H-1 — RESOLVED, Danny's binding ruling, 2026-08-24 (recorded here as the sole on-record source —
`02-ARCHITECTURE.md` §1.4/§3.1b state the corrected design but explicitly defer the full
correction record to this entry; this is that record, not a paraphrase elsewhere):** An external
review (Codex + Sol) found `02-ARCHITECTURE.md` §1.4 falsely stated "no such route exists in live
code" about `POST /api/investigations`. That route exists — `src/web/apiRoutes.ts:41-74`, shipped
by Checkpoint 1 — and already accepts an optional `investigationId`. Danny's ruling: **reuse and
extend the existing `POST /api/investigations` route. Do not introduce `POST
/api/investigations/:id/sources`.** The canonical contract distinguishes: (a) no `investigationId`
— create a new Investigation and submit its sources; (b) existing `investigationId`, Investigation
not `'brief-generated'` — append sources to that Investigation; (c) existing `investigationId`,
Investigation IS `'brief-generated'` — resolve and persist the new sources WITHOUT transitioning
the Investigation back to `'open'`; it remains `'brief-generated'` until the separate
evidence-eligibility check permits "Regenerate with new evidence"; (d) other states — follow the
explicitly specified lifecycle rules rather than deriving or claiming a status that
`transitionInvestigationStatus` rejected. The response must report actual persisted state. `01`,
`02`, `03`, `04` were updated consistently, including component contracts, endpoint references,
tests, and browser demonstrations. ACCEPTED.

**Fidelity, both layers confirmed against primary source (not self-report):**
- Layer 1 (sprint North Star fidelity): every Declared Intent element of `NORTH-STAR.md`
  (Status: Locked) is carried by `01`-`04`.
- Layer 2 (project North Star relevance): `docs/NORTHSTAR.md` Status: Active, non-DRAFT, no
  PROVISIONAL tag. This checkpoint implements Thesis ¶2's signal→brief→decision chain and Success
  Criteria bullet 1's complete-vertical-slice requirement.

**Approval state:** the doc set that reached the disposition above was returned by Danny's own
external reviewers (Codex + Sol, 2026-08-23) with FAIL and 11 further findings. Remediation of
those findings, the resulting H-1/H-2 design corrections, and Frank's re-gate verdict are recorded
in the entries immediately following this paragraph, within this same Spec-Gate Disposition
section. The disposition above is not a claim that the checkpoint is currently approved.

---

**Frank spec-gate, 2026-08-24 (post-external-review re-gate, cold dispatch): FAIL.**

- Layer 1 (sprint North Star fidelity): PASS — every Declared Intent element (full browser path,
  Node 22 fix in §4.6/C2-S1, Blocked-retry via H-1/H-2 in C2-S2/C2-S3, no-simulation, Slice 10-12
  tracing) is carried by `01`-`04`, verified against the docs and live source directly.
- Layer 2 (project North Star relevance): PASS — `docs/NORTHSTAR.md` Status: Active, read directly;
  this checkpoint implements Thesis ¶2 (signal→brief→decision) and Success Criteria bullet 1.
  No PROVISIONAL tag.
- Verified live this gate: `apiRoutes.ts:41-74` matches §1.4/§3.1b exactly (including the discarded
  transition boolean); H-2's four benign no-op cases trace correctly against
  `transitionInvestigationStatus.ts:23-31`'s real `ALLOWED_PRIOR_STATUSES` map; §4.2's two-catch
  design is structurally coherent (step 5b unreachable before `generationRun` assignment); the
  ordering-contract citations `generateBriefVersion.ts:258-262/:306-309/:690-692` are all exact;
  G12's ruling is genuinely recorded above (2026-08-23) and `04-ROADMAP.md` constraint 7 quotes it
  verbatim — the prior fabricated-citation fix stays fixed; sprint directory contains exactly the
  eight permitted files, no recovery residue from the 04-ROADMAP incident.
- **BLOCKING — H-1's designated on-record ruling source does not exist.** `02:130` and `02:133`
  ("see `05-REVIEW.md` H-1 for the full correction record; it is not repeated here"), `03:11/:675/
  :989/:1111` ("Danny's binding H-1 ruling, `05-REVIEW.md` §3"), and `04:7/:1207` ("recorded in
  `05-REVIEW.md` H-1") all cite a section of this file that no longer exists — this file now
  contains only the round-4 review, whose §3 is the L-4 closure, and the sprint directory is
  untracked, so no earlier round survives anywhere. The full H-1 correction record the doc set
  explicitly declines to repeat is recorded nowhere. Same defect class as the fabricated G12
  citation this sprint already caught once; G12 got the correct fix (ruling recorded here,
  quoted in `04`) and H-1 did not. `01:167`'s pointer to "Frank attempt-1's Open Questions log
  in `05-REVIEW.md`" is rotted the same way.
- Required before re-gate: (1) record Danny's H-1 ruling and the withdrawn-claim correction record
  in this Spec-Gate Disposition section, dated, as was done for G12, and repoint all nine
  citations across `01`-`04` to it; sweep for any other citation into superseded review-round
  sections. (2) L-5: restate §4.2 step 5b's two provenance calls in their real single-object form
  incl. `briefVersionId: null`, add the `pool` import note and definite-assignment assertions.
  (3) L-6: add the record-step-before-finalize ordering assertion to `04`'s safety-net test and
  to binding constraint 10. Also fix this section's own stale "see the material correction round
  below" pointer (nothing is below it).
- N16, N17, G13, G14, L-3: judged independently, non-blocking — each fails safe, none changes what
  gets built. `STALE_THRESHOLD_MS = 10000` remains correctly PROVISIONAL, owner Danny, ratified at
  human approval.

---

**Frank spec-gate, 2026-08-24 (second re-gate, cold dispatch, post-FAIL remediation): PASS.**

- Layer 1 (sprint North Star fidelity): PASS — `NORTH-STAR.md` verified **Status: Locked** live;
  every Declared Intent element remains carried by `01`-`04` (US-1–US-13 coverage re-confirmed at
  current text; this round's edits were narrow and touched none of it destructively).
- Layer 2 (project North Star relevance): PASS — `docs/NORTHSTAR.md` read directly, **Status:
  Active**, non-DRAFT, no PROVISIONAL tag. This checkpoint implements Thesis ¶2's
  signal→brief→decision chain and Success Criteria bullet 1 (complete vertical slice).
- **The prior FAIL's blocking issue is closed, verified fresh.** The H-1 entry above is a genuine,
  self-contained, dated, attributed, ACCEPTED ruling record — the terminal node of every citation
  chain, not a pointer. Its withdrawn-claim record and four-branch contract were re-read in full
  and traced: the factual premise was re-verified against live `src/web/apiRoutes.ts:25-74`
  (`investigationId?: string` on the request body, passed to `submitSources`, transition boolean
  discarded, `201` with assumed status — exact); all four branches plus the read-back requirement
  trace into `02` §3.1b, including branch (c) as an explicit skip with the naive-extension failure
  mode named.
- **Citations re-verified topically, not just link-valid** — 6 of 9 opened in surrounding context
  this gate (`02:130`, `02:133-134`, `03:11`, `03:675`, `03:989`/`:1111`, `04:7`, `04:1211-1214`,
  `01:164-189`): each cites H-1 for route design and H-1 is about route design. `01`'s "Resolved
  Scope Corrections" — the citation mis-scoped in the fix round — now states Danny's 2026-08-22
  material-scope ruling inline in its own right and references H-1 only as a disambiguated,
  separate ruling. Correct shape; genuinely repaired.
- **L-5 verified against live source**: `02:1151-1174`'s sample matches
  `provenanceRecorder.ts:95-98`/`:139-144` field for field (single-object args, required
  `briefVersionId: null`, optional `client` omitted); the `pool`-import and definite-assignment
  caveats are stated. **L-6 verified both halves**: `04:688-691` asserts write ORDER via
  spy/invocation-order, and constraint 10 (`04:1225-1243`) names reversed ordering as out of
  conformance in bold, with the ordering-contract citations
  (`generateBriefVersion.ts:258-262`/`:306-309`/`:690-692`) re-opened and exact.
- **L-7 verified fixed**: the "Approval state" paragraph now points at "the entries immediately
  following this paragraph, within this same Spec-Gate Disposition section" — which exist. The
  only surviving "material correction round" strings are the round-5 review's own finding
  narrative and my prior FAIL's quoted requirement, neither a live pointer. Note for the record:
  the round-5 review body (§5, §9, §14, §15) describes L-7 as undischarged — that was true when
  it was written and the fix landed after; this entry is the closure record. **N18 verified
  fixed**: `01:7` now reads 2026-08-24.
- Fresh live-source spot-checks this gate: `transitionInvestigationStatus.ts:23-31`'s
  `ALLOWED_PRIOR_STATUSES` map exact as described; `server.ts:60-95` matches `02`'s account of the
  existing form path; `src/db/migrations/` tops out at `008` — migrations `009`-`011` are genuinely
  this sprint's builds; full `:id/sources` sweep across `01`-`04` returns zero live references.
- Checklist re-run: all 11 Codex/Sol findings hold closed at current text; G12 quotation in `04`
  verbatim against the entry above; H-2 discrimination intact (constraint 9); M-1–M-4 intact;
  `INTAKE.md` APPROVED and `INTERVIEW.md` Complete verified live; sprint directory contains
  exactly the eight permitted files; no competing active plan; numeric-constant discipline
  compliant (`POLL_INTERVAL_MS`, `STALE_THRESHOLD_MS` PROVISIONAL, owner Danny).
- Open LOWs carried, judged non-blocking independently: N16, N17, G13, G14, L-3 — each fails safe,
  none changes what gets built.
- **Carried Condition (required at human approval, not before):** Danny ratifies or replaces
  `STALE_THRESHOLD_MS = 10000` and `POLL_INTERVAL_MS = 2000` (both PROVISIONAL, owner Danny), and
  confirms the recorded 2026-08-22 and 2026-08-24 rulings (H-1, G12, scope restoration) faithfully
  state his decisions — the one assumption no document review can discharge.

---

**Disposition update, 2026-08-24 (post-timing-constant reframing, round-6 review):** Frank's
Carried Condition above is **dissolved, not deferred**. Danny ruled that `POLL_INTERVAL_MS` and
`STALE_THRESHOLD_MS` are engineering timing decisions, not his to ratify; the specification now
defines required behavior only, and both values are derived during Forge from an explicit
measurement methodology (`02-ARCHITECTURE.md` §4.9), recorded as code comments next to the
constants. There is no longer a numeric value for Danny to ratify, and `01`-`04` no longer ask him
to. The condition's second half — that Danny confirm the recorded 2026-08-22 and 2026-08-24 rulings
faithfully state his decisions — stands unchanged and remains due at human approval. One MEDIUM
residue of the reframing sweep (M6, `02:1733`) was found open as of the round-6 review; it has
since been fixed and verified closed in round 7 (`02-ARCHITECTURE.md:1734` now reads "not
re-fetched on every poll tick," no numeral) — see round 7's review body above for the full
verification.

---

**Frank spec-gate, 2026-08-24 (third re-gate, cold dispatch, post-timing-reframe rounds 6/7): PASS.**

- Layer 1 (sprint North Star fidelity): PASS — `NORTH-STAR.md` **Status: Locked** verified live;
  Declared Intent (full browser path, Node 22 fix, Blocked-retry, no-simulation, Slice 10-12
  tracing) remains carried by `01`-`04`; the timing reframe touched none of it destructively.
- Layer 2 (project North Star relevance): PASS — `docs/NORTHSTAR.md` read directly, **Status:
  Active**, non-DRAFT, no PROVISIONAL tag. Thesis ¶2 (signal→brief→decision) and Success Criteria
  bullet 1 (complete vertical slice) served.
- **Fresh, independent numeric sweep (my own patterns, not the round-7 review's):** literal
  digit-with-unit, spelled-out cardinals, and Danny-ownership framings across all eight files.
  Zero live numeric assertions for `POLL_INTERVAL_MS`/`STALE_THRESHOLD_MS` outside (a) `03:21`'s
  revision banner quoting the *withdrawn* claim as history and (b) this file's preserved prior
  gate entries — both legitimate record, not assertion. Zero live Danny-ownership framing: every
  hit in `01`-`04` is a negation, a prohibition, or the general named-owner rule with the
  measurement named as the required citable derivation for these two constants.
- **§4.9 methodology verified actionable and its premise verified live**: four concrete steps
  (measure real runs per-step/per-run → conservative percentile + explicit stated margin →
  concurrency/endpoint-cost derivation for the poll interval → derivation recorded as code
  comments next to the constants, not a separate artifact). Checked the claims myself:
  `src/services/llmClient.ts` configures no timeout of any kind (no timeout/AbortSignal anywhere
  in its 195 lines) — the "no reusable upstream timeout" claim is true, not asserted;
  `src/services/ssrfGuardedFetch.ts:14` declares `FETCH_TIMEOUT_MS = 10_000` bounding a single
  outbound fetch exactly as §4.9 describes, cited-not-reused.
- **Measurement obligation is real and enforceable, both ends**: `01-REQUIREMENTS.md:675-689`
  states the behavioral contract (configurable values, no numeric assertion, Forge must measure
  and report rate/gaps/longest-legitimate-silence/observed warning behavior) and `01:725` states
  the stale disclosure never mutates persisted workflow state; `04-ROADMAP.md:698-706` makes the
  measurement-and-derivation a required Tests checkbox for C2-S3 and `04:827-829` repeats it in
  Done-When. Connected by explicit mutual citation. A checkbox, not prose.
- **Carried-condition scoping verified correct, not conflated**: the 2026-08-24 disposition entry
  above dissolves the numeric-ratification half (nothing numeric remains for Danny to ratify, and
  `01`-`04` no longer ask him) while explicitly retaining the second half — Danny confirms the
  recorded rulings (2026-08-22 scope, G12, H-1, this timing reframing) faithfully state his
  decisions — as due at human approval. Round 7's §9 and checklist restate the same split. Correct.
- **Regression re-check at current text**: H-1 (zero live `:id/sources` references; live
  `src/web/apiRoutes.ts:31-50` re-read — existing `POST /api/investigations` with optional
  `investigationId`, no new route), G12 quotation intact, migrations still top out at `008` so
  `009`-`011` are genuinely this sprint's, sprint directory contains exactly the eight permitted
  files, `INTAKE.md` APPROVED and `INTERVIEW.md` Complete verified live. N23's stale closing
  sentence is fixed by dated addendum, not rewrite. None of the Codex/Sol findings, H-2, M-1–M-6,
  or L-1–L-7 regressed at the locations spot-checked.
- Open LOWs carried, judged non-blocking independently: N16, N17, N21, N22, N23(closed), G13, G14,
  L-3. On N22 specifically: `01`'s general PROVISIONAL-with-named-owner clause cannot be read as a
  license to skip measurement, because C2-S3's Done-When checkbox blocks completion without the
  measurement regardless of prose readings. Fails safe.
- **Carried Condition (due at human approval, not before):** Danny confirms the recorded rulings
  (2026-08-22 scope restoration, G12, H-1, and the 2026-08-24 timing-ownership reframing) faithfully
  state his actual decisions. This is a fidelity-of-record confirmation only — he is NOT being asked
  to ratify any numeric value; none exists in the spec to ratify. Owner: Ledger, at the human
  approval step.

**This is the loop's stop point. Spec-gate: PASS, both layers, binding.**
