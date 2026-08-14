# Slice 9 Design: Brief Assembler (`generateBriefVersion`)

**Feeds:** `01-REQUIREMENTS.md` (US-10, US-11, R-4, G-1, G-13, Q-2, Q-3, Q-4), `02-ARCHITECTURE.md`
(§1.3, §1.9, §2, §3, §4), `04-ROADMAP.md` "Slice 9: Brief Assembler."
**Precedes:** Slice 10 (`getBriefForReview`, read-only), Slice 11 (Decision Recorder), Slice 12
(Validity/Invalidation Service).
**Design only** — no implementation code, no tests, per dispatch instructions.

**Revision note (revision 2):** updates OQ-1, OQ-2, and OQ-4 from the first revision per Danny's
binding ruling, delivered over the coordinator relay, verified against the live Slice 4
implementation and the binding architecture (authoritative over this document where they disagree).

**Revision note (revision 3):** Danny confirmed the row-6 (stale-correction conflict) deviation
and added binding specifics on rollback scope, reason recording, and the four-field "leave
unchanged" list. Superseded by finding 9 below, which further splits row 6 into two error classes
— see that finding.

**Revision note (revision 4 — this revision): responds to a Composer QC FAIL.** Danny retracted
his prior approval after a full read of the document (not a re-litigation of the revision 2/3
rulings, which are confirmed correctly represented and are NOT revisited here). Eleven findings
were returned, seven BLOCKING and four SIGNIFICANT. This revision corrects all eleven. Context:
an implementation attempted against the pre-revision-4 design exists on quarantined branch
`quarantine/slice-9-attempt-1` (commit `86f7b8b`) — it is NOT treated as evidence of correctness;
it is read only as a record of where implementation pressure independently exposed findings 1 and
4 below (its workarounds for those are not assumed correct here and were not carried forward
without independent verification against this revision's own reasoning). Findings addressed:

1. Persistence order violated its own foreign keys (children inserted before `brief_version`) —
   fixed in §3 phase 4 and §7.
2. Phase-4 pseudocode inserted a nonexistent `brief_version.negative_findings` column — fixed in
   §3 phase 4 (negative findings are read-time joins over `negative_finding`, never a stored
   column on `brief_version`).
3. Initial-generation concurrency was unserialized (`FOR UPDATE` on a not-yet-existing
   `problem_brief` row locks nothing) — fixed by locking the stable `investigation` row first,
   §3 phase 4.
4. The initial Brief was never linked to `Investigation.problemBriefId` — fixed in §3 phase 4 and
   §6 (the status-transition helper now sets it atomically).
5. Failure handling contradicted the live, merged Slice 7 contract (`compileUncertainty` already
   converts upstream Demand/Landscape/Gap `generationFailed: true` into `whatsUndeterminable`
   content, verified by reading `uncertaintyCompiler.ts`/`recommendationEngine.ts` directly for
   this revision) — phase 2's flow and the error taxonomy were both reworked to CONTINUE through
   Uncertainty Compilation on an upstream failure. **SUPERSEDED by revision 5's Composer ruling
   below: G-1 wins — Demand/Landscape/Gap failure now hard-stops the run. This revision-4 bullet
   is kept for history; do not implement it as written. See the revision 5 note above and §3/§5.**
6. Provenance would misreport modeled (non-throwing) failures as successful steps — this
   revision defined the result-to-outcome mapping Slice 9 requires and declared an
   unresolved-signature dependency on a Slice 8 correction. **UPDATED by revision 5: the
   dependency is now settled, not merely declared — see the revision 5 note above, §3's
   provenance mapping, and §9's OQ-6.** The Slice 8 fix's implementation itself remains out of
   scope for this document.
7. Successful Brief persistence and `GenerationRun` finalization were needlessly non-atomic —
   former OQ-3 is now RESOLVED, not deferred; see §3 phase 4 and §9.
8. Failed-correction status handling was self-contradictory (would have hidden a healthy current
   Brief) — the taxonomy in §5 now distinguishes initial generation from correction on every row.
9. Row 6 combined two incompatible error classes (caller-contract errors vs. genuine concurrent
   races) under one type that could not represent all its own cases — split in §5/§2.
10. Evidence-chain verification checked existence only, not Investigation ownership — strengthened
    in §3 phase 3 check 1 and its falsification test.
11. Schema CHECK constraints were weaker than the prose claimed (empty required arrays possible,
    `TEXT[]` instead of `UUID[]`, no whitespace-only rejection, conditional `other_*_label` fields
    unenforced) — strengthened in §7.

**Revision note (revision 5 — this revision): Composer ruling on finding 5, REPLACING revision
4's resolution of it.** Danny ruled his original finding 5 was too broad, and that the tension
revision 4 surfaced (rather than smoothed over) resolves the OPPOSITE way from what revision 4
implemented: **G-1 wins.** Governing principle, binding: a component failure means "unknown
because generation failed," not "searched and found nothing" — those are different epistemic
states, and a failed component cannot legally produce a `NegativeFinding` (a `NegativeFinding`
asserts a VERIFIED absence; a failed run verified nothing). Consequently: Demand/Landscape/Gap
`generationFailed: true` now HARD-STOPS the run (reverting revision 4's "continue through
Uncertainty Compilation" for these three); provenance completeness is explicitly rejected as a
justification for spending further LLM calls on an already-doomed run; Slice 7's tolerant,
already-shipped behavior when `compileUncertainty` is invoked directly is UNCHANGED and not a
defect, but Slice 9's orchestration is not obliged to exercise it. §3's phase-2 flow and §5's
error taxonomy are both reworked back to a three-hard-stop-class scheme, and every four-class-era
cross-reference is swept from the document (module plan, phase 2, provenance-mapping subsection,
taxonomy, §9, §10). Danny is making the corresponding `04-ROADMAP.md` wording change directly —
not edited here. **Additionally, OQ-6 (the Slice 8 `runStepWithProvenance` correction) is now
SETTLED, not merely declared:** the corrected signature adds a REQUIRED `getOutputRefs: (result:
T) => string[]` field to `runStepWithProvenance`'s input (each caller maps its own result shape
explicitly; `() => []` is the honest, deliberate value for a component with no referenceable
output at wrap time — not a silently-inferred gap), the internal `deriveOutputRefs` whitelist
revision 4 speculated about is REMOVED from scope entirely, and outcome classification is fixed as
`'failed'` iff the result carries `generationFailed === true` OR any `validationRecord` has
`finalOutcome === 'invalid'`. §3's provenance-mapping subsection and §9's OQ-6 are updated to this
settled contract, including the exact `getOutputRefs` this design passes for each of the seven
wrapped components.

`04-ROADMAP.md` is intentionally NOT edited here — Danny makes that wording change directly. Every
constant/threshold introduced or retained below still carries a citation or an explicit
`PROVISIONAL` marker with a named owner; none were added by this revision without one.

---

## 1. Module/File Plan

| Path | Action | Responsibility |
|---|---|---|
| `src/db/migrations/007_problem_brief_and_versioning.sql` | create | `problem_brief`, `brief_version`, `problem_statement`, `negative_finding` tables + strengthened immutability/enum/non-empty constraints (finding 11) |
| `src/services/generateBriefVersion.ts` | create | The orchestrator: creates the `GenerationRun`, runs Slices 4–7 with G-1-precedence hard-stop semantics (finding 5, revision 5's Composer ruling — Demand/Landscape/Gap failure hard-stops, matching Extraction and Compiler/Recommendation), applies the fail-closed rules (Q-2 precheck, ownership-checked evidence-chain verification (finding 10), four-element `negativeFindings` rule), opens the one short persistence transaction (locked, FK-ordered, atomically finalized on success — findings 1, 3, 4, 7), returns `BriefVersion` or throws `BriefGenerationFailedError` / `StaleCorrectionConflictError` (finding 9) |
| `src/services/persistBriefVersion.ts` | create | Pure persistence helper: given validated candidates, pre-generated ids, and a DB client already inside a transaction, inserts `brief_version` FIRST using those pre-generated ids, then Brief-scoped child rows referencing it (finding 1). No LLM/network calls. Called only from `generateBriefVersion.ts`'s transaction block. |
| `src/services/transitionInvestigationStatus.ts` | modify | (a) Extend `ALLOWED_PRIOR_STATUSES`, keyed by whether the call is for an initial generation or a correction (finding 8); (b) accept an optional `client: PoolClient`; (c) accept an optional `problemBriefId` to set `investigation.problem_brief_id` atomically in the same statement (finding 4) |
| `src/services/provenanceRecorder.ts` | modify (additive only) | `finalizeGenerationRun` accepts an optional `client: PoolClient` — when provided, the finalize `UPDATE`/read runs on that client so a **successful** run's finalization can commit inside phase 4's transaction (finding 7). This is a narrow, additive signature change, orthogonal to and NOT a substitute for the Slice 8 correction finding 6 requires (see §3's provenance-mapping subsection and §9 OQ-6) |
| `src/types/domain.ts` | modify | Add `ProblemBrief`, `BriefVersion`, `ProblemStatement`, `NegativeFinding`, `BriefElement` interfaces (copied from `02-ARCHITECTURE.md` §3, matching the file's existing "copied exactly" convention); update `DemandSignal`, `ExistingSolution`, `GapHypothesis`, `PersonalPullNote` as the persisted (non-candidate) counterparts of the Slice 5/6 candidate shapes, each carrying `id`/`briefVersionId` |

No changes to Slice 4–7 pipeline-component service files' own logic — `generateBriefVersion.ts` is a
pure caller of their existing exported functions. Per Danny's OQ-1 ruling (revision 2, confirmed),
`ExtractionResult` (Slice 4) is not extended. Per finding 6, Slice 8's `runStepWithProvenance` DOES
require a correction, but that correction is explicitly out of scope for this document — Slice 9
only declares the contract it needs from the corrected function (see §3).

---

## 2. `generateBriefVersion` Signature

Signature is fixed by `02-ARCHITECTURE.md` §4 and not renegotiated here:

```typescript
async function generateBriefVersion(input: {
  investigationId: string;
  supersedesVersionId?: string;     // present only for corrections (US-10 AC2); MUST be absent
                                     // for a first-ever BriefVersion
  runtimeIdentifier: string;
}): Promise<BriefVersion>
```

**Success return:** the persisted `BriefVersion` (all seven elements populated; `id`,
`problemBriefId`, `versionNumber`, `generationRunId` set).

**Failure — three distinct exception types (finding 9, revised from revision 3's single
`StaleCorrectionConflictError`):**

```typescript
/** Pipeline, validation, or infrastructure failure — the run could not produce a usable Brief.
 *  Covers both initial-generation and correction attempts; §5/§6 specify how the two differ in
 *  Investigation-status handling (finding 8) even though they share this one exception type. */
export class BriefGenerationFailedError extends Error {
  constructor(
    public readonly reason: string,
    public readonly generationRunId: string,
    public readonly investigationStatus: 'blocked' | 'generation-failed' | 'brief-generated',
    // 'brief-generated' is a NEW valid value here (finding 8): a failed CORRECTION leaves the
    // Investigation at 'brief-generated' — its pre-existing healthy status — not
    // 'generation-failed'. Only a failed INITIAL generation moves it to 'generation-failed'.
  ) {
    super(reason);
    this.name = 'BriefGenerationFailedError';
  }
}

/** CALLER-CONTRACT class (finding 9, NEW — split out of what revision 3 called
 *  StaleCorrectionConflictError). Thrown when the caller's own input cannot be satisfied
 *  regardless of timing/concurrency:
 *   - supersedesVersionId references a real BriefVersion belonging to a DIFFERENT ProblemBrief
 *     than the one resolved for this investigationId
 *   - supersedesVersionId is present but no ProblemBrief exists yet for this Investigation at all
 *     (there is nothing to correct)
 *   - supersedesVersionId is absent but a ProblemBrief already exists for this Investigation
 *     (caller must target the current version explicitly)
 *  None of these is "the pointer moved while we were running" — they are wrong on arrival,
 *  independent of any race. A real GenerationRun IS still created and finalized 'failed' for
 *  these (the run was attempted with a specific input and that attempt is auditable), but no
 *  currentVersionId can be represented as "what you should have targeted" in the general case
 *  (e.g. the "no ProblemBrief exists" case has no current version at all) — hence this is a
 *  distinct type from StaleCorrectionConflictError below, which always has a real, resolvable
 *  actualCurrentVersionId. */
export class InvalidSupersedeTargetError extends Error {
  constructor(
    public readonly reason: string,
    public readonly investigationId: string,
    public readonly generationRunId: string,
    public readonly suppliedSupersedesVersionId: string | undefined,
  ) {
    super(reason);
    this.name = 'InvalidSupersedeTargetError';
  }
}

/** GENUINE STALE RACE class (finding 9 — narrowed from revision 3's version, which incorrectly
 *  also covered caller-contract cases InvalidSupersedeTargetError now owns). Thrown ONLY when
 *  supersedesVersionId was a CORRECT, same-ProblemBrief target at input time but
 *  ProblemBrief.currentVersionId moved to a different, real BriefVersion before this run's
 *  transaction acquired its lock — i.e. another call won a genuine concurrent race. This is why
 *  actualCurrentVersionId is always populated and always resolvable here — unlike
 *  InvalidSupersedeTargetError, this class only ever arises when a ProblemBrief and a valid
 *  current version already, definitely exist. */
export class StaleCorrectionConflictError extends Error {
  constructor(
    public readonly problemBriefId: string,
    public readonly expectedSupersedesVersionId: string,
    public readonly actualCurrentVersionId: string,
    public readonly generationRunId: string,
  ) {
    super(
      `StaleCorrectionConflict: supersedesVersionId ${expectedSupersedesVersionId} is no longer ` +
        `ProblemBrief.currentVersionId (now ${actualCurrentVersionId}) — regenerate against the ` +
        `current version.`,
    );
    this.name = 'StaleCorrectionConflictError';
  }
}
```

Rationale for throw-not-return, and for three distinct types rather than one, is unchanged from
prior revisions except as widened by finding 9: `recordDecision`/`getBriefForReview` (Slice 10/11
callers) and any eventual UI layer need to distinguish three different remedies — "the pipeline or
validation genuinely failed" (`BriefGenerationFailedError`), "your input was wrong regardless of
timing, fix the request" (`InvalidSupersedeTargetError`), and "you lost a race, re-fetch current
and retry" (`StaleCorrectionConflictError`) — the same G-13-style reasoning ("type-level
distinction lets the caller switch on the error itself rather than parsing free text") applied one
layer up, now correctly separated into three classes instead of collapsing two of them into one.

---

## 3. Phase-by-Phase Data Flow

Four phases, as before. **Constraint 3 (binding, unchanged):** no DB transaction is held open
across phase 2 (LLM calls / web search / retrieval). Phase 3 issues read-only queries only. Only
phase 4's persistence write is transactional, and it performs zero LLM/network calls.

### Phase 1 — Run creation (single write, no transaction needed beyond its own statement)

Unchanged: `createGenerationRun({ investigationId, runtimeIdentifier })` → `GenerationRun` with
`outcome: 'in-progress'`, persisted immediately (constraint 1).

### Phase 2 — Pipeline execution (transaction-free; G-1-precedence hard-stop scheme — revision 5, REPLACES revision 4's four-class scheme for this section)

**Governing principle (Danny's revision-5 ruling, binding, verbatim in substance): a component
failure means "unknown because generation failed," not "searched and found nothing." Those are
different epistemic states and must not be collapsed. A `NegativeFinding` asserts a VERIFIED
absence; a failed run verified nothing, so a failed component cannot legally produce one. G-1
(the four-element fail-closed rule) therefore takes PRECEDENCE over continuing the pipeline to let
Slice 7's tolerant seeding behavior run — not the reverse.**

Revision 4 read `compileUncertainty`/`generateRecommendation` correctly (both are, and remain,
exactly as documented: `compileUncertainty` deterministically seeds `whatsUndeterminable` from an
upstream `generationFailed: true`, and both components' OWN `generationFailed` fields are reserved
strictly for their own LLM/infra failure — nothing about that reading was wrong). What revision 4
got wrong was the CONCLUSION drawn from it: that Slice 7's tolerance for upstream failure meant
Slice 9's ORCHESTRATION should exercise that tolerance by continuing the pipeline past an upstream
failure. Danny's ruling makes this precedence explicit, correcting the prior implicit gap (finding
5's REPLACEMENT correction, per the dispatch): **Slice 7's compiler MAY remain tolerant when
DIRECTLY INVOKED — that behavior is unchanged and is not a defect. But its tolerance is NOT an
orchestration requirement. Slice 9 is not obliged to exercise it, and — per this ruling — does
not.** A future reader must be able to see this precedence stated, not merely infer it from the
combination of G-1's fail-closed rule and `negativeFindingSignal`'s gating; this paragraph and the
"G-1 precedence, stated explicitly" callout below are that documentation.

**Three hard-stop classes (revision 5, replacing revision 4's four-class scheme in full — no
"continue" class remains):**

1. **Extraction (Slice 4) failure → hard stop.** Unchanged across every revision — the Q-2
   non-negatable-problem-statement precheck. Without at least one `ProblemStatementCandidate`,
   there is no evidence basis for any later step to reason over.
2. **Demand Analyzer / Landscape Researcher / Gap Hypothesis Generator failure → hard stop
   (REVERSED from revision 4).** A `generationFailed: true` from ANY of these three now stops the
   pipeline immediately, at that step — `compileUncertainty` and `generateRecommendation` are
   never invoked for this run. Rationale (Danny's ruling): a `generationFailed: true` result is an
   UNKNOWN state, not a verified absence — it cannot legally satisfy either branch of the
   four-element `negativeFindings` rule (§3 phase 3 check 2: non-empty id array, or a legitimate
   `negativeFindingSignal`), and `negativeFindingSignal` is, by every one of these three
   components' own contracts, populated ONLY when `generationFailed === false` (verified in
   `domain.ts`'s doc comments — "Unset on every `generationFailed: true` path"). Continuing the
   pipeline anyway would only spend further LLM calls (Uncertainty Compilation, Recommendation
   Generation) on a run phase 3 was always going to reject at check 2 — revision 4's own analysis
   established this ("continuing only changes which taxonomy row the run dies at"); Danny has
   taken that finding as the reason to STOP, not the reason to continue. Provenance completeness
   is explicitly NOT a valid justification for spending LLM calls on an already-doomed run
   (Danny's ruling, point 2, verbatim).
3. **Compiler or Recommendation Engine's OWN failure → hard stop.** Unchanged from revision 4:
   `UncertaintyStatement` and `Recommendation` are both always-populated, non-negatable elements,
   so either component's own LLM/infra failure is terminal on its own terms, independent of the
   G-1 precedence question above (there is no upstream-failure ambiguity here — these are each
   component's OWN failure, never a propagated flag).

**Final Brief validation (phase 3, unchanged mechanism) still fails closed if a required element
lacks both content and a legitimate negative finding** — but under this three-class scheme it is
now reached only on a genuinely clean pipeline run (every phase-2 step's own `generationFailed`
was `false`) where a component legitimately found nothing (and correctly populated
`negativeFindingSignal`) or omitted it. It is no longer the backstop that catches upstream
research/analysis failures — class 2 now catches those directly, earlier, before further LLM
spend.

**G-1 precedence, stated explicitly (finding 5's replacement correction, point 5 of Danny's
ruling):** both contracts below previously implied this precedence without stating it. This design
now states it directly, so a later reader does not have to reconstruct it from the combination of
two other rules:

> **G-1's fail-closed rule (a required element needs verified content OR a verified absence) takes
> precedence over Slice 7's tolerance for upstream failure (its willingness to seed
> `whatsUndeterminable` from a `generationFailed: true` flag when directly invoked). Slice 9's
> orchestration therefore treats a Demand/Landscape/Gap `generationFailed: true` as an immediate,
> hard-stopping failure of the RUN — never as input to feed forward into Uncertainty Compilation
> — because "unknown due to failure" is not the same epistemic state as "verified absent," and
> only the latter may satisfy a `NegativeFinding`.**

**Revised step sequence:**

1. **Extraction & Clustering Engine** (`extractClaimsAndEvidence(investigationId)`) →
   `ExtractionResult`. Q-2 precheck (class 1): `generationFailed === true` OR
   `problemStatementCandidates.length === 0` → hard stop, §5 row I-1/C-1.
2. **Demand Analyzer** (`analyzeDemand(investigationId)`) → `DemandAnalysisResult`.
   `generationFailed === true` → hard stop immediately (class 2), §5 row I-2/C-2. Only on
   `generationFailed === false` does the pipeline proceed to step 3.
3. **Personal Pull Extractor** (`extractPersonalPull(investigationId)`) →
   `PersonalPullExtractionResult`. Unchanged across every revision — informational only, never
   blocks, its `generationFailed` never affects the run.
4. **Landscape Researcher** (`researchLandscape(investigationId, generationRunId)`) →
   `LandscapeResearchResult`. `generationFailed === true` → hard stop immediately (class 2), §5
   row I-2/C-2. Its own `WebSearchQuery`/`WebSearchResult`/landscape-origin
   `SourceArtifact`/`EvidenceItem` persistence, unchanged from prior revisions, happens inside
   `researchLandscape`/`searchWeb` themselves, outside Slice 9's transaction, and is NOT rolled
   back by a hard stop here (constraint 5 — these are evidence/search audit records, not Brief
   content, per §3 phase 4's "writes intentionally outside the transaction" note, unaffected by
   this revision).
5. **Gap Hypothesis Generator** (`generateGapHypotheses({ ... })`) →
   `GapHypothesisGenerationResult`. `generationFailed === true` → hard stop immediately (class 2),
   §5 row I-2/C-2.
6. **Uncertainty Compiler** (`compileUncertainty({ investigationId, problemStatementCandidates,
   evidenceItems, claimVersions, demandAnalysis, landscapeResearch, gapHypothesisGeneration })`)
   — reached ONLY when steps 2, 4, and 5 all returned `generationFailed: false` (class 2 never
   triggered). Its OWN `generationFailed` hard-stops (class 3), §5 row I-3/C-3.
7. **Recommendation Engine** (`generateRecommendation({ problemStatementCandidates,
   demandAnalysis, landscapeResearch, gapHypothesisGeneration,
   uncertaintyStatementCandidate: uncertainty.uncertaintyStatementCandidate })`) — reached only
   after step 6 succeeds. Its OWN `generationFailed` hard-stops (class 3), §5 row I-3/C-3.

**Provenance mapping this design requires from the corrected Slice 8 API — SETTLED this revision
(finding 6/OQ-6), not merely declared as in revision 4:**

The corrected `runStepWithProvenance` signature (ruled on and now being implemented, per the
dispatch) adds a REQUIRED field to its input:

```typescript
export async function runStepWithProvenance<T>(input: {
  generationRunId: string;
  component: string;
  inputRefs: string[];
  fn: () => Promise<T>;
  getOutputRefs: (result: T) => string[];   // REQUIRED — no default, no internal whitelist.
                                              // Each caller maps its own result shape explicitly.
                                              // A component with no referenceable output at wrap
                                              // time supplies `() => []` so emptiness is a
                                              // deliberate statement, not a silently-inferred gap.
}): Promise<T>
```

Outcome classification (settled, not Slice 9's to redesign): `outcome: 'failed'` iff the result
carries `generationFailed === true` OR any of the step's `validationRecord`s has `finalOutcome:
'invalid'`; `outcome: 'succeeded'` otherwise. The previously-proposed internal `deriveOutputRefs`
whitelist (revision 4's speculation) has been REMOVED from scope entirely and is not designed
against here.

**Exact `getOutputRefs` this design passes for each of the seven wrapped components — stated
plainly rather than implying richer provenance than exists.** Five of the seven return
pre-persistence CANDIDATES with no database id until Slice 9's phase 4 persists them; their honest
`getOutputRefs` value at wrap time is `() => []`. Only the two components with a genuine
already-persisted or synthetic-but-stable identifier at wrap time can supply anything else:

| Step | Component | `getOutputRefs` | Why |
|---|---|---|---|
| 1 | Extraction & Clustering Engine | `(r) => [...r.claimVersions.map(cv => cv.id), ...r.evidenceItems.map(e => e.id)]` | The ONLY phase-2 step whose output is already persisted at call time (Slice 4 commits `ClaimVersion`/`EvidenceItem` itself) — real database ids exist and are honest to reference |
| 2 | Demand Analyzer | `() => []` | `DemandSignalCandidate`/`DemandConfidenceClassificationCandidate` are pre-persistence candidates; `DemandSignalCandidate.localId` is a per-run synthetic handle for cross-referencing WITHIN this run (e.g. `citedDemandSignalIds`), not a stable, externally-meaningful reference — supplying it as an `outputRef` would overstate what it is. Honest value: `() => []` |
| 3 | Personal Pull Extractor | `() => []` | `PersonalPullNoteCandidate` has no id of any kind pre-persistence |
| 4 | Landscape Researcher | `(r) => r.webSearchQueries.map(q => q.id)` | `WebSearchQuery` rows ARE persisted by `researchLandscape`/`searchWeb` at call time (unchanged from prior revisions) — these are real, honest ids. `ExistingSolutionCandidate.localId` values are NOT included, same reasoning as step 2 |
| 5 | Gap Hypothesis Generator | `() => []` | `GapHypothesisCandidate` has no id of any kind pre-persistence, and (per OQ-5, carried forward unchanged) no `localId` at all |
| 6 | Uncertainty Compiler | `() => []` | `UncertaintyStatementCandidate` has no id of any kind pre-persistence |
| 7 | Recommendation Engine | `() => []` | `RecommendationCandidate` has no id of any kind pre-persistence |

Once phase 4 persists the real Brief-scoped rows, the resulting `BriefVersion`'s own id arrays
(`demandSignalIds`, `existingSolutionIds`, `gapHypothesisIds`, etc. — §7) are where the durable,
real-id provenance for steps 2/3/5/6/7's output ultimately lives; the `() => []` above is not a
permanent gap, it is an honest statement that step-level provenance and Brief-level provenance are
recorded at different times because persistence itself happens later, in phase 4, by design
(candidate-only pattern, unchanged since Slice 5).

`generateBriefVersion.ts` supplies this `getOutputRefs` mapping at each of the seven
`runStepWithProvenance` call sites. This document does not claim any historical/already-persisted
`GenerationRun`/`GenerationStep` rows are wrong — the blast radius of the PRE-correction
`runStepWithProvenance` behavior is being measured separately (per the dispatch) and is not
established here.

**End-to-end pipeline provenance tests to specify at Forge time (design only, not implemented
here), reworked for the three-class scheme:**
- Given a run where the Demand Analyzer returns `generationFailed: true` (no throw), assert (a)
  its `GenerationStep` is recorded `outcome: 'failed'` with a non-empty `error` (derived from
  `generationFailureReason`) and `outputRefs: []`; (b) the pipeline does NOT proceed to Landscape
  Researcher, Gap Hypothesis Generator, Uncertainty Compiler, or Recommendation Engine — their
  components never appear in `stepLog` at all for this run, not merely as failed steps; (c)
  `GenerationRun.outcome === 'failed'`, `briefVersionId: null`, and `Investigation.status` follows
  §5's initial-vs-correction split (I-2 for initial, C-2/unchanged for correction).
- Given a fully clean run (every step's own `generationFailed === false`), assert every
  `GenerationStep` shows `outcome: 'succeeded'` and each step's `outputRefs` matches the table
  above exactly (non-empty only for steps 1 and 4; `[]` for steps 2, 3, 5, 6, 7) — this is the
  test that proves the `() => []` mappings are deliberate and stable, not an oversight a later
  Forge pass "fixes" into inventing ids that don't exist.

### Phase 3 — Validation (read-only against persisted rows + in-memory candidate checks)

Runs after all non-hard-stopping phase-2 steps complete. Two checks, in order:

1. **Evidence-chain verification, WITH ownership check (finding 10, strengthened from revision
   3).** Revision 3's check (existence of a `claim_version_evidence` join row) is INSUFFICIENT on
   its own: it would pass a `claimVersionId` whose evidence exists but belongs to a completely
   different Investigation's source lineage (e.g. a stale/incorrect id, or a future bug that
   leaks another Investigation's `ClaimVersion` id into a candidate). The check now requires the
   full chain to resolve AND to terminate at a `source_artifact` scoped to THIS
   `investigationId`:

   ```
   for each problemStatementCandidate:
     for each claimVersionId in candidate.supportingClaimVersionIds:
       SELECT 1
         FROM claim_version_evidence cve
         JOIN claim_version cv ON cv.id = cve.claim_version_id
         JOIN evidence_item ei ON ei.id = cve.evidence_item_id
         JOIN source_artifact sa ON sa.id = ei.source_artifact_id
        WHERE cve.claim_version_id = $claimVersionId
          AND sa.investigation_id = $investigationId
       -- must resolve to >= 1 row
   ```

   If any cited `claimVersionId`, for any accepted `ProblemStatementCandidate`, resolves to zero
   rows under this ownership-scoped query — including the case where a `claim_version_evidence`
   row for that id DOES exist, but only for evidence sourced from a DIFFERENT Investigation — the
   run fails: §5. This still runs unconditionally, distrusting `ExtractionResult.generationFailed`
   entirely, per revision 2's OQ-1 ruling (confirmed, not revisited).

   `'evidence'` remains structurally unreachable as a `NegativeFinding` element in this MVP for
   the same reason as before (revision 2) — the schema keeps `'evidence'` as a valid
   `BriefElement` member, but no code path constructs one.

   **Falsification tests to specify at Forge time (design only), TWO required (finding 10 adds a
   second):**
   - (unchanged from revision 2) a nominally successful extraction
     (`ExtractionResult.generationFailed === false`) where the persisted `claim_version_evidence`
     join for a cited `claimVersionId` is empty or missing entirely → assembly fails closed.
   - **(NEW, finding 10)** a nominally successful extraction where the persisted
     `claim_version_evidence` join for a cited `claimVersionId` IS non-empty, but the referenced
     `evidence_item.source_artifact_id` resolves to a `source_artifact` belonging to a DIFFERENT
     `investigation_id` than the one `generateBriefVersion` was called with (e.g. seeded via test
     fixture to simulate a cross-Investigation id leak) → assembly MUST still fail closed. This is
     the test that proves ownership, not mere existence, is what's being checked.

2. **Four-element `negativeFindings` fail-closed rule (G-1).** Unchanged mechanism from revision
   2: for each of `'evidence' | 'demand-signal-type' | 'existing-solution' | 'gap-hypothesis'`,
   exactly one of (a) the corresponding id source is non-empty, or (b) a matching
   `negativeFindingSignal` with a non-empty `statement` is present — never both, never neither.
   `'evidence'` always resolves "populated" per check 1 above. **Revision 5 correction:** under
   the three-hard-stop-class scheme (§ Phase 2 above), phase 3 is now reached ONLY after a
   genuinely clean pipeline run — every Demand/Landscape/Gap step already returned
   `generationFailed: false` (class 2 hard-stops otherwise, before phase 3 is ever entered). This
   check therefore validates genuine "found vs. legitimately verified absent" outcomes, not
   upstream infra/LLM failures — those are now excluded from ever reaching this check at all,
   which is exactly the G-1 precedence stated in Phase 2's callout: an unknown-due-to-failure
   state never gets a chance to be mistaken for (or to require) a verified-absence
   `NegativeFinding` here, because it never arrives at this check in the first place.

If phase 3 passes, proceed to phase 4.

### Phase 4 — Persistence (the one short transaction) + finalization

**Corrected in full per findings 1, 2, 3, 4, 7.** Sequence, inside a single `pool.connect()` /
`BEGIN` / `COMMIT` block:

```
client = await pool.connect()
BEGIN

  -- FINDING 3 FIX: lock the STABLE investigation row first, not the not-yet-existing
  -- problem_brief row. investigation ALWAYS exists by this point (it was created at Intake,
  -- Slice 2) — locking it serializes ANY two concurrent generateBriefVersion calls for the same
  -- investigationId, including the FIRST-EVER-generation case where no problem_brief row exists
  -- for FOR UPDATE to lock. This closes the finding-3 hole: the old design's
  -- "SELECT ... FROM problem_brief ... FOR UPDATE" locked nothing when problem_brief didn't
  -- exist yet, so two first-generation calls could both proceed past the lock and race on the
  -- problem_brief UNIQUE(investigation_id) constraint — one of them failing AFTER having
  -- potentially already written some child rows, and (before finding 8's fix) incorrectly
  -- moving a since-successful Investigation to 'generation-failed'.
  SELECT id FROM investigation WHERE id = $investigationId FOR UPDATE

  problemBrief = SELECT * FROM problem_brief WHERE investigation_id = $investigationId
    -- no FOR UPDATE needed here anymore — the investigation-row lock above already serializes
    -- every concurrent caller for this investigationId through this entire transaction body

  -- ---- Resolve target: caller-contract errors (finding 9) vs. genuine stale race ----
  IF input.supersedesVersionId is present:
    IF problemBrief is null:
      ROLLBACK
      THROW InvalidSupersedeTargetError('no ProblemBrief exists for this Investigation', ...)
    supersedesRow = SELECT * FROM brief_version WHERE id = $supersedesVersionId
    IF supersedesRow is null OR supersedesRow.problem_brief_id !== problemBrief.id:
      ROLLBACK
      THROW InvalidSupersedeTargetError('supersedesVersionId does not belong to this ProblemBrief', ...)
    IF problemBrief.current_version_id !== input.supersedesVersionId:
      -- supersedesRow DOES belong to this ProblemBrief, so this is a genuine race, not a
      -- caller-contract error (finding 9's exact distinction)
      ROLLBACK
      recordGenerationStep({ generationRunId, step: {
        component: 'Brief Assembler', outcome: 'failed',
        error: `StaleCorrectionConflict: expected current version ${input.supersedesVersionId}, ` +
               `actual ${problemBrief.current_version_id}`,
        startedAt: <phase-4 start>, completedAt: <now>, inputRefs: [input.supersedesVersionId], outputRefs: [],
      } })  -- same "no GenerationRun-level reason field, use GenerationStep.error" mechanism as
            -- revision 3's ruling (unchanged, not revisited)
      THROW StaleCorrectionConflictError(problemBrief.id, input.supersedesVersionId,
                                          problemBrief.current_version_id, generationRunId)
    versionNumber = supersedesRow.version_number + 1
    isCorrection = true
  ELSE:
    IF problemBrief is not null:
      ROLLBACK
      THROW InvalidSupersedeTargetError(
        'ProblemBrief already exists for this Investigation; supersedesVersionId is required', ...)
    versionNumber = 1
    isCorrection = false

  -- FINDING 1 FIX: generate every id THIS transaction will need BEFORE any INSERT, then insert
  -- brief_version FIRST using those pre-generated ids, so every child row's brief_version_id FK
  -- is satisfiable on its own INSERT (no deferred-constraint trick needed, no child-before-parent
  -- ordering bug).
  briefVersionId = randomUUID()
  problemBriefId = problemBrief?.id ?? randomUUID()
  problemStatementIds = problemStatementCandidates.map(() => randomUUID())
  demandSignalIds = demandSignalCandidates.map(() => randomUUID())
  existingSolutionIds = existingSolutionCandidates.map(() => randomUUID())
  gapHypothesisIds = gapHypothesisCandidates.map(() => randomUUID())
  personalPullNoteIds = personalPullNoteCandidates.map(() => randomUUID())
  negativeFindingIds = <one per row phase-3 determined necessary>.map(() => randomUUID())

  IF NOT isCorrection:
    INSERT problem_brief (id: problemBriefId, investigation_id: investigationId)

  -- FINDING 1 + FINDING 2 FIX: brief_version is inserted FIRST (children reference it, not the
  -- reverse), and it carries NO negative_findings column — that column does not exist in the DDL
  -- (§7). BriefVersion.negativeFindings (the domain.ts field) is a READ-TIME join over
  -- negative_finding rows filtered by brief_version_id, computed by Slice 10's getBriefForReview,
  -- exactly the same "computed at read time, never stored redundantly" pattern BriefVersion's own
  -- doc comment already uses for "superseded."
  INSERT brief_version (
    id: briefVersionId, problem_brief_id: problemBriefId, version_number: versionNumber,
    supersedes_version_id: input.supersedesVersionId ?? null, generation_run_id: generationRunId,
    problem_statement_ids: problemStatementIds, claim_version_ids: <union of every cited
      ClaimVersion id across all problemStatementCandidates>, demand_signal_ids: demandSignalIds,
    demand_confidence_classification: <JSONB, citedDemandSignalIds remapped from localId to the
      pre-generated demandSignalIds above>, existing_solution_ids: existingSolutionIds,
    gap_hypothesis_ids: gapHypothesisIds, uncertainty_statement: <JSONB>, recommendation: <JSONB>,
    personal_pull_note_ids: personalPullNoteIds,
  )

  -- Now children, each using its own pre-generated id and referencing briefVersionId — every FK
  -- is satisfiable because brief_version already exists as of the INSERT above.
  INSERT problem_statement rows (using problemStatementIds, brief_version_id: briefVersionId)
  INSERT demand_signal rows (using demandSignalIds, brief_version_id: briefVersionId)
  INSERT personal_pull_note rows (using personalPullNoteIds, brief_version_id: briefVersionId)
  INSERT existing_solution rows (using existingSolutionIds, brief_version_id: briefVersionId)
  INSERT gap_hypothesis rows (brief_version_id: briefVersionId)
  INSERT negative_finding rows (0..3 in practice — 'evidence' never constructed —
                                  brief_version_id: briefVersionId)

  UPDATE problem_brief SET current_version_id = briefVersionId WHERE id = problemBriefId

  -- FINDING 4 FIX: problem_brief_id is now written explicitly, atomically, in the SAME statement
  -- as the status transition — not merely claimed to happen. See §6 for the extended
  -- transitionInvestigationStatus signature.
  transitionInvestigationStatus(investigationId, 'brief-generated', null,
    { client, problemBriefId })

  -- FINDING 7 FIX: finalize the SUCCESSFUL run INSIDE this transaction, using the same client —
  -- resolves former OQ-3 (a real BriefVersion can no longer exist against a permanently
  -- 'in-progress' GenerationRun, because both commit or both roll back together).
  finalizeGenerationRun({ generationRunId, outcome: 'succeeded', briefVersionId, client })

COMMIT
client.release()
return newVersion
```

**Failure path (pipeline/validation failure, classes 1/3/4 from §'s phase-2 rework, or phase-3
checks 1/2) — no phase-4 transaction is ever opened for these; `finalizeGenerationRun` and the
status transition are called independently, OUTSIDE any transaction, exactly as before (unchanged
mechanism from revision 2), with `finding 8`'s initial-vs-correction branch (§5, §6) now governing
which status results:**

```
finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null })  -- no client
                                                                                       -- — nothing
                                                                                       -- to be
                                                                                       -- atomic with
IF isCorrection:  -- known from input.supersedesVersionId presence, no DB read needed
  -- leave Investigation exactly as it is — it is already 'brief-generated' and stays that way
  -- (finding 8) — do not call transitionInvestigationStatus at all
ELSE:
  transitionInvestigationStatus(investigationId, 'generation-failed', reason, {})  -- no client
```

**Writes intentionally outside the transaction, and why (constraint 5 — structural, not
conventional, unchanged from prior revisions):** every phase-2 write
(`Claim`/`ClaimVersion`/`EvidenceItem`/`ClaimVersionEvidence` from Slice 4;
`WebSearchQuery`/`WebSearchResult`/landscape `SourceArtifact`/`EvidenceItem` from Slice 6) is
committed by its own owning component before phase 3/4 ever runs, and is structurally unreachable
from Slice 9's transaction. The FAILURE-path `finalizeGenerationRun`/`transitionInvestigationStatus`
calls are likewise outside any transaction, because there is no Brief-content transaction for them
to be atomic with on a failure. The SUCCESS-path calls are the one thing this revision moves
INSIDE the transaction (finding 7) — this is a narrowing of scope, not a reversal of the general
principle: only the two writes that exist BECAUSE the Brief was actually produced
(`finalizeGenerationRun` with a real `briefVersionId`, and the `'brief-generated'` transition) now
share its atomicity; nothing that must survive a rollback was moved.

---

## 4. Transaction Boundaries (summary)

| Boundary | Scope | Held across LLM/network calls? |
|---|---|---|
| Phase 1 | `INSERT generation_run` (single statement, autocommit) | No |
| Phase 2 (Slice 4/6 sub-txns) | Unchanged from prior revisions — owned by `extractClaimsAndEvidence.ts`/`researchLandscape`/`searchWeb` | No |
| Phase 2 (Slices 5, 7's candidate generation) | No persistence (candidate-only, in-memory) | N/A |
| Phase 3 | Read-only `SELECT`s, ownership-scoped (finding 10) — no transaction, no writes | No |
| Phase 4, SUCCESS path (this slice, revised) | `investigation` row lock (finding 3), `problem_brief` create-or-locate, `brief_version` (inserted FIRST, finding 1), Brief-scoped children (inserted after, referencing pre-generated ids), `negative_finding`, `problem_brief.current_version_id`, `investigation.status` AND `investigation.problem_brief_id` (finding 4, both via the extended `transitionInvestigationStatus`), `generation_run` finalization (finding 7, now INSIDE this transaction) | **No** |
| Phase 4, FAILURE/CONFLICT path | Rolled back entirely; `finalizeGenerationRun`/`transitionInvestigationStatus` (initial-generation only, finding 8) run independently afterward, autocommit | No |

---

## 5. Error Taxonomy

**Reworked structurally per finding 8: every row now distinguishes an INITIAL generation
(`supersedesVersionId` absent) from a CORRECTION (`supersedesVersionId` present), because they
resolve to different `Investigation.status` outcomes for the identical underlying failure. Rows
are labeled `I-n` (initial) / `C-n` (correction) where the two diverge, and unified where they
don't.**

| # | Trigger | Detected in | `GenerationRun.outcome` | `Investigation.status` — INITIAL generation | `Investigation.status` — CORRECTION | Persisted? |
|---|---|---|---|---|---|---|
| 1 (precondition) | No reachable sources | Before phase 1 | Run never created | `'blocked'` (set by Slice 3, unchanged) | N/A — a correction is never attempted against a `'blocked'` Investigation (it has no current Brief to correct) | Nothing |
| I-1 / C-1 | Extraction fails: `generationFailed: true` OR zero `ProblemStatementCandidate`s (class 1) | Phase 2, step 1 | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **`'brief-generated'` — UNCHANGED (finding 8).** A failed correction attempt does not erase or hide the Investigation's existing, healthy current Brief. `transitionInvestigationStatus` is not even called on this path (see §3 phase 4's failure-path pseudocode) | `GenerationRun` + partial `stepLog` (step 1 only); no `BriefVersion` |
| I-2 / C-2 | Demand Analyzer, Landscape Researcher, or Gap Hypothesis Generator's OWN `generationFailed: true` (class 2 — **REVISION 5: now a hard stop, reverted from revision 4's "continue"**) | Phase 2, step 2, 4, or 5 (whichever fails first) | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **`'brief-generated'` — UNCHANGED**, same reasoning as I-1/C-1 | `GenerationRun` + `stepLog` through the failing step ONLY — Uncertainty Compiler and Recommendation Engine never run for this GenerationRun (no LLM calls spent past the failure point, per Danny's ruling point 2); no `BriefVersion` |
| I-3 / C-3 | Uncertainty Compiler's OR Recommendation Engine's OWN `generationFailed: true` (class 3) | Phase 2, step 6 or 7 | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **`'brief-generated'` — UNCHANGED**, same reasoning as I-1/C-1 | `GenerationRun` + `stepLog` through the failing step; no `BriefVersion` |
| I-4 / C-4 | Evidence-chain verification failure, ownership-scoped (finding 10) | Phase 3, check 1 | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **`'brief-generated'` — UNCHANGED** | `GenerationRun` + full `stepLog`; no `BriefVersion` |
| I-5 / C-5 | Four-element `negativeFindings` fail-closed rule violated — reached only on an otherwise-clean pipeline run (revision 5: I-2/C-2 now intercepts every upstream Demand/Landscape/Gap failure before phase 3) | Phase 3, check 2 | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **`'brief-generated'` — UNCHANGED** | `GenerationRun` + full `stepLog`; no `BriefVersion`, no `NegativeFinding` rows |
| **CONFLICT-A (finding 9, NEW type)** | `InvalidSupersedeTargetError` — `supersedesVersionId` belongs to a different `ProblemBrief`, OR no `ProblemBrief` exists yet while `supersedesVersionId` is given, OR `supersedesVersionId` is absent while a `ProblemBrief` already exists | Phase 4, before any INSERT | `'failed'`, `briefVersionId: null` | N/A — this case is only reachable via a correction-shaped call (or a caller bug on an initial-shaped call that turns out to already have a Brief); either way it is a CALLER-CONTRACT error, not a race | **UNCHANGED** — same reasoning as I-1..I-4/C-1..C-4: the caller's request was wrong, but if a healthy current Brief exists it is not disturbed | Transaction rolled back — no `BriefVersion`, no child rows. `GenerationRun` finalized `'failed'` (independently, no client) |
| **CONFLICT-B (finding 9, narrowed from revision 3)** | `StaleCorrectionConflictError` — a genuinely valid, same-`ProblemBrief` `supersedesVersionId` no longer equals `ProblemBrief.currentVersionId` at lock time (another call won a real race) | Phase 4, immediately after resolving `problemBrief`/`supersedesRow`, before any INSERT | `'failed'`, `briefVersionId: null`, **and the conflict reason recorded** as a `GenerationStep.error` entry (component `'Brief Assembler'`) — unchanged mechanism from revision 3's ruling, confirmed, not revisited | N/A — only reachable via a correction-shaped call | **All four fields Danny named in the revision-3 ruling remain UNCHANGED: `Investigation.status`, `Investigation.statusReason`, `Investigation.problemBriefId`, `ProblemBrief.currentVersionId`.** No new `InvestigationStatus` value (declined, confirmed, not revisited) | Transaction rolled back in full. `GenerationRun` finalized `'failed'` independently. Caller receives `StaleCorrectionConflictError` with `actualCurrentVersionId` to regenerate against |
| — | Any other phase-4 transaction failure (DB error, connection loss) after the lock was acquired | Phase 4 | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **UNCHANGED**, same reasoning | `GenerationRun` + full `stepLog`; transaction rolled back — atomicity guarantees no partial rows |
| — (RESOLVED, finding 7) | ~~`finalizeGenerationRun` throws after phase 4 committed~~ | — | — | — | — | **No longer possible on the success path** — finalization now happens inside the same transaction as the Brief content (§3 phase 4). Former OQ-3 is resolved, not deferred — see §9 |
| — | Uncaught exception anywhere in phase 2/3 not represented by a component's own `generationFailed` field | Any phase-2/3 step | `'failed'` via an outer `try/finally` that calls `finalizeGenerationRun({ outcome: 'failed', briefVersionId: null })` before re-throwing | `'generation-failed'` | **UNCHANGED** | `GenerationRun` + `stepLog` through the failing step; no `BriefVersion` |

**Revision 5 resolution of the tension revision 4 surfaced (history, kept for the record — this
paragraph replaces revision 4's "New tension surfaced" note, which described the four-class
scheme's I-4/C-4-as-eventual-backstop behavior and is no longer applicable):** revision 4 observed
that, under its four-class "continue" scheme, an upstream Demand/Landscape/Gap
`generationFailed: true` almost never actually rescued a run — it just relocated the eventual
failure to the four-element rule (then I-4/C-4, now I-5/C-5) and spent extra LLM calls getting
there, because `negativeFindingSignal` is contractually populated only on `generationFailed:
false`. Danny's ruling (revision 5) resolved that observation by removing the "continue" step
entirely: since continuing essentially never changed the outcome, and G-1's epistemic distinction
(unknown-due-to-failure vs. verified-absent) means it SHOULDN'T be allowed to even if it
occasionally could, the correct fix was to stop earlier (I-2/C-2, class 2, hard stop) rather than
let the pipeline run to a foregone conclusion. There is no remaining tension to track here — this
paragraph exists only so a later reader who recalls revision 4's framing understands why it
changed, rather than encountering an unexplained scheme swap.

**Concurrency tests to specify at Forge time (design only), THREE required (finding 3 adds one to
the two already specified in revision 3):**

1. **No-branch test** (unchanged from revision 2/3) — two corrections racing from the same
   version: exactly one commits, the other receives `StaleCorrectionConflictError`, no branch.
2. **Loser-leaves-winner-intact test** (unchanged from revision 3) — same race; assert the loser's
   `GenerationRun` records the conflict and the Investigation still resolves to the winner's Brief
   in full.
3. **Destructive concurrent-first-generation test (NEW, finding 3).** Two `generateBriefVersion`
   calls, BOTH with `supersedesVersionId` absent, targeting the SAME `investigationId` with no
   `ProblemBrief` yet in existence, started concurrently. Assert: exactly one call commits a new
   `problem_brief` row (satisfying `UNIQUE(investigation_id)`, §7) and its `BriefVersion` 1; the
   OTHER call — because it blocks on the `investigation` row lock (finding 3's fix) until the
   winner's transaction commits, then observes `problemBrief` already exists on its own
   `SELECT ... WHERE investigation_id = $1` — receives `InvalidSupersedeTargetError` (**not**
   `StaleCorrectionConflictError` — this is a caller-contract shape, `supersedesVersionId` absent
   while a `ProblemBrief` now exists, finding 9's classification), not a raw
   `UNIQUE(investigation_id)` constraint-violation exception surfacing uncaught, and not a
   silent/incorrect `'generation-failed'` transition on an Investigation whose first-ever
   generation actually just succeeded (the historical bug finding 3 exists to close — this
   assertion is the test that specifically proves that bug is gone).

---

## 6. Status-Transition Rules

`transitionInvestigationStatus` (existing, Slice 3) is extended three ways this revision
(supersedes revision 3's two-way extension):

```typescript
const ALLOWED_PRIOR_STATUSES: Record<'blocked' | 'open' | 'generation-failed' | 'brief-generated', InvestigationStatus[]> = {
  blocked: ['open'],
  open: ['blocked'],
  'generation-failed': ['open', 'generation-failed'],
  'brief-generated': ['open', 'brief-generated'],
    // FINDING 8 FIX: 'generation-failed' -> 'brief-generated' is deliberately NOT listed.
    // transitionInvestigationStatus is never called with toStatus: 'brief-generated' FROM a
    // 'generation-failed' Investigation via a correction path, because a correction (by
    // definition, supersedesVersionId present) only makes sense when a ProblemBrief already
    // exists — which means the Investigation is already 'brief-generated', not
    // 'generation-failed'. An initial generation succeeding from 'open' is the only path into
    // 'brief-generated' that matters here; a FAILED correction leaves 'brief-generated' as-is by
    // never calling this function at all (§3 phase 4's failure-path pseudocode), so there is no
    // 'generation-failed' -> 'brief-generated' transition to represent.
};

export async function transitionInvestigationStatus(
  investigationId: string,
  toStatus: 'blocked' | 'open' | 'generation-failed' | 'brief-generated',
  statusReason: string | null,
  options?: { client?: PoolClient; problemBriefId?: string },  // FINDING 4 FIX: problemBriefId added
): Promise<boolean> {
  const runner = options?.client ?? pool;
  const allowedFrom = ALLOWED_PRIOR_STATUSES[toStatus];
  const result = await runner.query(
    options?.problemBriefId
      ? `UPDATE investigation
           SET status = $2, status_reason = $3, problem_brief_id = $5
         WHERE id = $1 AND status = ANY($4::text[])`
      : `UPDATE investigation
           SET status = $2, status_reason = $3
         WHERE id = $1 AND status = ANY($4::text[])`,
    options?.problemBriefId
      ? [investigationId, toStatus, statusReason, allowedFrom, options.problemBriefId]
      : [investigationId, toStatus, statusReason, allowedFrom],
  );
  return (result.rowCount ?? 0) > 0;
}
```

**Finding 4 fix, explicitly:** phase 4's success path calls this with
`{ client, problemBriefId }`, so `investigation.problem_brief_id` is written in the SAME statement
as the status transition, inside the SAME transaction as the rest of phase 4 — not merely asserted
to happen in prose (the specific defect finding 4 identified: the pre-revision-4 pseudocode never
actually wrote it). This is the only call site that ever supplies `problemBriefId` — every failure
path calls this function (when it calls it at all — see finding 8, I-1..I-4 correction rows never
call it) without `problemBriefId`, since a failed run never has one to set.

`generateBriefVersion` calls this function exclusively for every `Investigation.status`/
`problem_brief_id` write — never a second, ad hoc `UPDATE investigation ...` elsewhere, matching
the existing "single durable-URL contract for reads / single transition mechanism for writes"
discipline.

---

## 7. Migration DDL — `007_problem_brief_and_versioning.sql`

**Strengthened per finding 11: non-empty `CHECK`s on `problem_statement_ids`/`claim_version_ids`,
`UUID[]` instead of `TEXT[]` for every id-array column (for both type safety and consistency —
finding 11 named two columns explicitly; this revision applies the same fix uniformly to every
id-array column in this migration rather than leaving an inconsistent mix), whitespace-only text
rejected via `CHECK (length(trim(x)) > 0)`, and conditional `other_*_label` fields enforced via
`CHECK`.**

```sql
-- Department OS Core — Problem Department MVP
-- Slice 9: Brief Assembler — ProblemBrief / BriefVersion / ProblemStatement / NegativeFinding
-- persistence (Architecture §3 "Problem Brief identity & versioning" / "Evidence & Claims" /
-- "Negative findings"), plus the Brief-scoped persisted counterparts of Slice 5/6's candidate
-- shapes (DemandSignal, ExistingSolution, GapHypothesis, PersonalPullNote).
--
-- Revision 4 (Composer QC FAIL correction) strengthens this migration per finding 11: id-array
-- columns are UUID[] (not TEXT[]), problem_statement_ids/claim_version_ids on brief_version carry
-- non-empty CHECKs (both are mandatory-and-non-empty per Architecture §3/§4's citation-validation
-- discipline — Q-2's non-negatable Problem Statement guarantees at least one problem_statement,
-- and every problem_statement cites at least one ClaimVersion by its own NonEmptyArray contract,
-- so claim_version_ids at the brief_version level is transitively non-empty too), every free-text
-- content field rejects whitespace-only values, and 'other'-shaped conditional fields
-- (other_type_label, other_category_label) are CHECK-enforced rather than left to app-layer
-- discipline alone.
--
-- brief_version carries NO negative_findings column (finding 2 fix) — NegativeFinding rows live
-- only in the negative_finding table below, joined by brief_version_id at read time (Slice 10's
-- getBriefForReview), matching BriefVersion's own "superseded is computed at read time" pattern.
--
-- Immutability enforcement (Anti-Patterns table): brief_version, problem_statement,
-- negative_finding, demand_signal, existing_solution, gap_hypothesis, and personal_pull_note are
-- all BEFORE UPDATE OR DELETE trigger-guarded with the existing reject_update_or_delete()
-- function (004's migration). problem_brief carries ONE permitted mutation (current_version_id)
-- — see its own narrower trigger below.
--
-- Linear-chain enforcement (Danny's OQ-2 ruling, confirmed, not revisited): UNIQUE
-- (problem_brief_id, version_number) below is the DB-level backstop; the
-- equals-current-version-at-lock-time check and the same-ProblemBrief-ownership check are
-- application-layer, enforced in generateBriefVersion.ts's phase 4 under the investigation row
-- lock (finding 3's corrected lock target).

CREATE TABLE IF NOT EXISTS problem_brief (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id    UUID NOT NULL UNIQUE REFERENCES investigation(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_version_id  UUID  -- FK to brief_version added below (deferred: brief_version references
                             -- problem_brief, so this FK must be added after brief_version exists)
);

CREATE TABLE IF NOT EXISTS brief_version (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_brief_id                UUID NOT NULL REFERENCES problem_brief(id),
  version_number                  INT NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  supersedes_version_id           UUID REFERENCES brief_version(id),  -- NULL for version 1 ONLY
  generation_run_id               UUID NOT NULL REFERENCES generation_run(id),
  problem_statement_ids           UUID[] NOT NULL,
  claim_version_ids               UUID[] NOT NULL,
  demand_signal_ids               UUID[] NOT NULL DEFAULT '{}',
  demand_confidence_classification JSONB NOT NULL,
  existing_solution_ids           UUID[] NOT NULL DEFAULT '{}',
  gap_hypothesis_ids              UUID[] NOT NULL DEFAULT '{}',
  uncertainty_statement           JSONB NOT NULL,
  recommendation                  JSONB NOT NULL,
  personal_pull_note_ids          UUID[] NOT NULL DEFAULT '{}',
  -- No `status` column (Q-3, binding, unchanged).
  CONSTRAINT brief_version_problem_statement_ids_non_empty
    CHECK (array_length(problem_statement_ids, 1) IS NOT NULL AND array_length(problem_statement_ids, 1) >= 1),
    -- finding 11: Problem Statement is non-negatable (Q-2) — every brief_version this design ever
    -- writes has at least one. This CHECK is a backstop on top of the phase-3 Q-2 precheck, not a
    -- replacement for it (a CHECK here cannot verify the ids resolve to real, ownership-correct
    -- problem_statement rows — that remains an application-layer guarantee from insert ordering).
  CONSTRAINT brief_version_claim_version_ids_non_empty
    CHECK (array_length(claim_version_ids, 1) IS NOT NULL AND array_length(claim_version_ids, 1) >= 1),
    -- finding 11: transitively non-empty via problem_statement_ids' own NonEmptyArray-of-evidence
    -- contract (Architecture §3) — see header note.
  UNIQUE (problem_brief_id, version_number)
);

ALTER TABLE problem_brief
  ADD CONSTRAINT problem_brief_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES brief_version(id);

CREATE TABLE IF NOT EXISTS problem_statement (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id            UUID NOT NULL REFERENCES brief_version(id),
  who_experiences_it          TEXT NOT NULL CHECK (length(trim(who_experiences_it)) > 0),
  context_or_workflow         TEXT NOT NULL CHECK (length(trim(context_or_workflow)) > 0),
  consequence_or_friction     TEXT NOT NULL CHECK (length(trim(consequence_or_friction)) > 0),
  supporting_claim_version_ids UUID[] NOT NULL,
  CONSTRAINT problem_statement_supporting_claims_non_empty
    CHECK (array_length(supporting_claim_version_ids, 1) IS NOT NULL
           AND array_length(supporting_claim_version_ids, 1) >= 1)
);

CREATE TABLE IF NOT EXISTS negative_finding (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id UUID NOT NULL REFERENCES brief_version(id),
  element         TEXT NOT NULL CHECK (element IN
                     ('evidence', 'demand-signal-type', 'existing-solution', 'gap-hypothesis')),
  statement       TEXT NOT NULL CHECK (length(trim(statement)) > 0),
  UNIQUE (brief_version_id, element)
);

CREATE TABLE IF NOT EXISTS demand_signal (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id    UUID NOT NULL REFERENCES brief_version(id),
  type                TEXT NOT NULL CHECK (type IN
                         ('recurring-complaints', 'workarounds', 'existing-spend', 'paid-labor',
                          'switching-behavior', 'willingness-to-pay', 'rfps', 'feature-requests',
                          'other-observed-behavior')),
  other_type_label    TEXT,
  evidence_item_ids   UUID[] NOT NULL,
  CONSTRAINT demand_signal_evidence_non_empty
    CHECK (array_length(evidence_item_ids, 1) IS NOT NULL AND array_length(evidence_item_ids, 1) >= 1),
  CONSTRAINT demand_signal_other_type_label_required
    -- finding 11: conditional-required field now DB-enforced, not app-layer-only
    CHECK (type <> 'other-observed-behavior' OR (other_type_label IS NOT NULL AND length(trim(other_type_label)) > 0))
);

CREATE TABLE IF NOT EXISTS existing_solution (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id      UUID NOT NULL REFERENCES brief_version(id),
  name                  TEXT NOT NULL CHECK (length(trim(name)) > 0),
  what_it_addresses     TEXT NOT NULL CHECK (length(trim(what_it_addresses)) > 0),
  how_people_cope_now   TEXT NOT NULL CHECK (length(trim(how_people_cope_now)) > 0),
  where_its_inadequate  TEXT NOT NULL CHECK (length(trim(where_its_inadequate)) > 0),
  evidence_item_ids     UUID[] NOT NULL,
  CONSTRAINT existing_solution_evidence_non_empty
    CHECK (array_length(evidence_item_ids, 1) IS NOT NULL AND array_length(evidence_item_ids, 1) >= 1)
);

CREATE TABLE IF NOT EXISTS gap_hypothesis (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id     UUID NOT NULL REFERENCES brief_version(id),
  category             TEXT NOT NULL CHECK (category IN
                          ('capability', 'usability', 'price', 'workflow-fit', 'trust',
                           'integration', 'accessibility', 'distribution', 'other')),
  other_category_label TEXT,
  statement            TEXT NOT NULL CHECK (length(trim(statement)) > 0),
  evidence_item_ids    UUID[] NOT NULL,
  CONSTRAINT gap_hypothesis_evidence_non_empty
    CHECK (array_length(evidence_item_ids, 1) IS NOT NULL AND array_length(evidence_item_ids, 1) >= 1),
  CONSTRAINT gap_hypothesis_other_category_label_required
    CHECK (category <> 'other' OR (other_category_label IS NOT NULL AND length(trim(other_category_label)) > 0))
);

CREATE TABLE IF NOT EXISTS personal_pull_note (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id    UUID NOT NULL REFERENCES brief_version(id),
  source_artifact_id  UUID NOT NULL REFERENCES source_artifact(id),
  text                TEXT NOT NULL CHECK (length(trim(text)) > 0),
  label               TEXT NOT NULL DEFAULT 'contextual-motivation'
                         CHECK (label = 'contextual-motivation')
);

CREATE INDEX IF NOT EXISTS idx_brief_version_problem_brief_id ON brief_version (problem_brief_id);
CREATE INDEX IF NOT EXISTS idx_problem_statement_brief_version_id ON problem_statement (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_negative_finding_brief_version_id ON negative_finding (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_demand_signal_brief_version_id ON demand_signal (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_existing_solution_brief_version_id ON existing_solution (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_gap_hypothesis_brief_version_id ON gap_hypothesis (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_personal_pull_note_brief_version_id ON personal_pull_note (brief_version_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'brief_version_immutable' AND tgrelid = 'brief_version'::regclass) THEN
    CREATE TRIGGER brief_version_immutable BEFORE UPDATE OR DELETE ON brief_version
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'problem_statement_immutable' AND tgrelid = 'problem_statement'::regclass) THEN
    CREATE TRIGGER problem_statement_immutable BEFORE UPDATE OR DELETE ON problem_statement
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'negative_finding_immutable' AND tgrelid = 'negative_finding'::regclass) THEN
    CREATE TRIGGER negative_finding_immutable BEFORE UPDATE OR DELETE ON negative_finding
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'demand_signal_immutable' AND tgrelid = 'demand_signal'::regclass) THEN
    CREATE TRIGGER demand_signal_immutable BEFORE UPDATE OR DELETE ON demand_signal
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'existing_solution_immutable' AND tgrelid = 'existing_solution'::regclass) THEN
    CREATE TRIGGER existing_solution_immutable BEFORE UPDATE OR DELETE ON existing_solution
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'gap_hypothesis_immutable' AND tgrelid = 'gap_hypothesis'::regclass) THEN
    CREATE TRIGGER gap_hypothesis_immutable BEFORE UPDATE OR DELETE ON gap_hypothesis
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'personal_pull_note_immutable' AND tgrelid = 'personal_pull_note'::regclass) THEN
    CREATE TRIGGER personal_pull_note_immutable BEFORE UPDATE OR DELETE ON personal_pull_note
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION reject_problem_brief_substantive_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'problem_brief is immutable: delete rejected';
  END IF;
  IF NEW.investigation_id IS DISTINCT FROM OLD.investigation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'problem_brief.investigation_id/created_at are immutable — only current_version_id may change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'problem_brief_substantive_immutable' AND tgrelid = 'problem_brief'::regclass) THEN
    CREATE TRIGGER problem_brief_substantive_immutable BEFORE UPDATE OR DELETE ON problem_brief
      FOR EACH ROW EXECUTE FUNCTION reject_problem_brief_substantive_mutation();
  END IF;
END $$;
```

**Numbering:** `007_` — unchanged, next after `006_generation_run_provenance.sql`.

**Citation for every constraint above:** each CHECK/trigger cites the architecture-doc passage or
this revision's finding number that requires it inline. No unsourced constant; no PROVISIONAL
markers needed — this migration introduces no numeric threshold.

---

## 8. Supersede/Versioning Mechanics (US-10 AC2) — Linear Chain

Unchanged in substance from revision 2/3 (OQ-2 ruling, confirmed, not revisited) — restated here
only where finding 1/3/4/9's corrections to phase 4's mechanics change HOW the rules are executed,
not the rules themselves:

1. **Version 1:** `supersedesVersionId` MUST be absent. Enforced in phase 4 (§3) — if a
   `problem_brief` row already exists and the caller omitted it, `InvalidSupersedeTargetError`
   (finding 9's caller-contract class, not `StaleCorrectionConflictError`).
2. **Every later version supersedes the then-current version, verified after locking
   `investigation` (finding 3, not `problem_brief` — the lock target changed; the comparison
   itself — `supersedesVersionId === problemBrief.current_version_id` — is unchanged).** A
   mismatch against a legitimately-owned target is `StaleCorrectionConflictError` (finding 9);
   ownership itself failing is `InvalidSupersedeTargetError`.
3. `versionNumber = supersedesRow.version_number + 1` for a correction; `1` for the first version.
4. The new `brief_version` row is inserted with `supersedes_version_id` set accordingly — using a
   PRE-GENERATED id (finding 1), inserted BEFORE its children, never after. The row referenced by
   `supersedesVersionId` is never updated (`brief_version_immutable` trigger, §7).
5. `problem_brief.current_version_id` updates to the new version's id — the sole permitted
   `problem_brief` mutation (`reject_problem_brief_substantive_mutation()`, §7).
6. Every Brief-scoped entity is freshly re-persisted per version, using its own pre-generated id
   (finding 1) — none of a prior version's rows are touched, reused, or pointed at.
7. "Superseded" is computed at read time by `getBriefForReview` (Slice 10) — unchanged.

`Investigation.status` on a correction: **finding 8 changes this.** A SUCCESSFUL correction
re-asserts `'brief-generated'` (via `transitionInvestigationStatus(..., { client, problemBriefId })`
inside phase 4's transaction) and writes `problem_brief_id` (finding 4) — both unchanged values in
practice for a correction (same `ProblemBrief`, already-`'brief-generated'` Investigation), but now
actually executed via the corrected write path rather than merely claimed. A FAILED correction, by
contrast, calls `transitionInvestigationStatus` **not at all** (§3 phase 4's failure-path
pseudocode) — the Investigation's pre-existing `'brief-generated'` status, `statusReason`, and
`problemBriefId` are left completely untouched because no write targeting them is ever issued, not
merely because a write happened to be a no-op.

---

## 9. Open Questions

**OQ-1, OQ-2, and the `transitionInvestigationStatus`-client half of former OQ-4 are RESOLVED**
(revision 2, confirmed by Danny, not revisited).

**OQ-3 is now RESOLVED (finding 7), not deferred.** Former OQ-3 ("`finalizeGenerationRun` failure
after phase-4 commit leaves `GenerationRun` stuck `'in-progress'` against a real `BriefVersion`")
is closed by moving the successful-path finalization INSIDE phase 4's transaction (§3) — both
writes now commit or roll back together, so the asymmetric state OQ-3 described can no longer
arise on the success path. (The failure path's independent `finalizeGenerationRun` call can still,
in principle, itself throw after a ROLLBACK — but in that case there is no `BriefVersion` to be
inconsistent WITH; a `GenerationRun` stuck `'in-progress'` with `briefVersionId: null` and no
corresponding Brief is a stale-but-not-misleading record, not the "real Brief, phantom run" defect
OQ-3 named. This residual case is not tracked as a further open question — it is a strictly milder
failure mode than the one OQ-3 identified and does not misrepresent Brief state.)

**OQ-5 — carried forward unchanged, not part of this revision's findings.** No `localId` remap
exists from `GapHypothesisCandidate` back to `ExistingSolutionCandidate` in the current
`domain.ts` shapes — noted so Forge does not look for a remap step the shapes don't require.

**OQ-6 — SETTLED this revision (revision 5), no longer open.** The Slice 8
`runStepWithProvenance` correction has been ruled on and is now being implemented: a REQUIRED
`getOutputRefs: (result: T) => string[]` field on `runStepWithProvenance`'s input, outcome
classified as `'failed'` iff the result carries `generationFailed === true` OR any
`validationRecord` has `finalOutcome: 'invalid'`, and the previously-speculated internal
`deriveOutputRefs` whitelist removed from scope entirely. §3's provenance-mapping subsection now
specifies the exact `getOutputRefs` this design passes for each of the seven wrapped components
(non-empty only for step 1, Extraction, and step 4, Landscape Researcher — both already persist
real ids at call time; `() => []` for the five candidate-only steps, stated plainly rather than
implying richer provenance than exists). `generateBriefVersion.ts` still cannot be finalized at
Forge time until the Slice 8 implementation actually lands (the CONTRACT is settled; the
implementation is in progress per the dispatch, not yet merged) — this remains a real, named
cross-slice dependency, now with a fixed target signature rather than an open one.

**The class-2 "continue" tension revision 4 surfaced no longer applies — see the "Revision 5
resolution" note at the end of §5's error taxonomy.** Revision 5 removed the "continue" behavior
entirely (Demand/Landscape/Gap failure is now a hard stop, §3 Phase 2 class 2), so there is no
remaining tension between provenance completeness and LLM spend to track as an open question:
Danny's ruling resolved it by stopping earlier, not by continuing further.

---

## 10. Verification Against Requirements

- US-10 AC1 (claims trace to evidence, ownership-verified): §3 phase 3 check 1 (finding 10).
- US-10 AC2 (corrections supersede, linear chain, no branching): §8, §7 `UNIQUE`.
- R-4 (fail-closed structured output / non-empty citations): §3 phase 3, §7 DDL non-empty CHECKs
  (finding 11).
- G-1 (negativeFindings fail-closed, and its revision-5 PRECEDENCE over Slice 7's upstream-failure tolerance — a failed component may never produce a NegativeFinding): §3 phase 2's G-1-precedence callout and class 2 hard stop, §3 phase 3 checks 1–2, §5 I-2/C-2, I-4/C-4, I-5/C-5.
- G-13 (`'blocked'` vs `'generation-failed'` distinct, plus the correction-preserves-healthy-Brief
  distinction this revision adds via finding 8): §5's full initial-vs-correction column split.
- Q-2 (problem statement non-negatable): §3 phase 2 step 1; §5 I-1/C-1; §7 DDL CHECK.
- Q-3 (no `status` column on `BriefVersion`): §7 DDL, unchanged.
- Q-4 (`claimVersionIds` exact ids, never Claim/text, ownership-verified): §3 phase 3/4, §7 DDL.
- `ProblemBrief.currentVersionId` sole mutable field: §7 trigger, unchanged.
- No in-place mutation of a published `BriefVersion`: §7 trigger, unchanged.
- Linear `BriefVersion` chain, no branching, correctly serialized even for first-ever generation
  (finding 3): §7 `UNIQUE`, §3 phase 4's `investigation`-row lock.
- `Investigation.problemBriefId` actually written (finding 4): §3 phase 4, §6.
- Foreign-key-satisfiable insert order (finding 1): §3 phase 4.
- No reference to a nonexistent `brief_version.negative_findings` column (finding 2): §3 phase 4,
  §7.
- Successful Brief persistence and run finalization atomic (finding 7): §3 phase 4, §9 (OQ-3
  resolved).
- Failure-handling flow matches the live, shipped Slice 7 contract, AND respects G-1's
  precedence over that contract's tolerance at the orchestration layer (finding 5, superseded by
  revision 5's Composer ruling): §3 phase 2, verified against
  `uncertaintyCompiler.ts`/`recommendationEngine.ts` directly, with the explicit G-1-precedence
  statement documented rather than left implicit.
- Caller-contract errors distinguished from genuine concurrent races (finding 9): §2, §5
  CONFLICT-A/CONFLICT-B.
