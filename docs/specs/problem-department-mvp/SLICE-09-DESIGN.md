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

**Revision note (revision 6 — this revision): SECOND Composer design-gate FAIL.** Revision 5
correctly implemented the 11 findings from the first FAIL, but five further BLOCKING defects were
found on a second full read. None of the revision 2–5 rulings are reopened by this revision —
these are five new findings plus three additional design-side fixes:

1. **Successful retry from `'generation-failed'` could not complete.** `ALLOWED_PRIOR_STATUSES`
   omitted `'generation-failed' -> 'brief-generated'`, and phase 4 never checked
   `transitionInvestigationStatus`'s return value — a retried initial generation would commit a
   real `BriefVersion` while the guarded `UPDATE investigation` silently affected zero rows,
   leaving `Investigation.status` stuck at `'generation-failed'` against a committed Brief. Fixed
   in §6 (allowed transition added) and §3 phase 4 (return value checked, whole transaction rolled
   back if `false`).
2. **The stale-race taxonomy could not be implemented from a single read.** Nothing snapshotted
   `currentVersionId` before the pipeline ran, so an already-stale request and a genuine
   concurrent race were indistinguishable at phase 4, and the concurrent first-generation LOSER
   was wrongly classified as a caller-contract error even though its request was valid when
   issued. Fixed in §3 (new preflight-snapshot step, Phase 2 step 0) and §2/§5 (comparison is now
   preflight-snapshot vs. phase-4-lock-time read, not one read; `StaleCorrectionConflictError`
   widened to represent the first-generation race case).
3. **The ownership query permitted mixed local/foreign evidence.** Requiring only "at least one
   local" citation let a `ClaimVersion` with one local and one foreign evidence reference pass —
   exactly the cross-Investigation leak the check exists to prevent. Fixed in §3 phase 3 check 1:
   now requires ALL cited evidence to be local (zero foreign), applied to every Brief-scoped
   entity's evidence citations (not just `ClaimVersion`), and cited `ClaimVersion` ids must come
   from THIS run's own extraction result, not merely from the Investigation at large.
4. **Persisted nested JSONB objects omitted architecture-required fields.** `DemandConfidenceClassification.briefVersionId`/`negativeFindingRef`, `UncertaintyStatement.briefVersionId`, and
   `Recommendation.briefVersionId` were never set in the phase-4 construction pseudocode. Fixed by
   an explicit, swept enumeration of every persisted entity's required fields against
   `02-ARCHITECTURE.md` §3, cross-checked against the phase-4 construction, in §3 phase 4.
5. **`GenerationRun` finalization contracts conflicted.** Architecture §1.9 requires finalization
   from a `finally` block; revision 5 finalizes success inside the Brief transaction. Implemented
   literally, both fire — double finalization, which `finalizeGenerationRun`'s own
   already-idempotency-guarded contract treats as a hard, programming-error-level assertion
   failure. Fixed in §3 phase 4 with an EXACTLY-ONCE finalization contract (success: inside the
   transaction; failure: after rollback, before rethrow; no unconditional second finalization
   anywhere; every read AND write inside a successful `finalizeGenerationRun` — including
   `loadStepLog` — uses the supplied transaction client, not the pool). Danny is making the
   corresponding `02-ARCHITECTURE.md` §1.9 correction himself; this design is written against that
   corrected contract and states the dependency explicitly (not edited here).

Design-side fixes also required this revision (not separately numbered above, per the dispatch):
migration 007 now adds the deferred FK from `generation_run.brief_version_id` to
`brief_version.id` (§7), with a stated recommendation on `UNIQUE (brief_version.generation_run_id)`
(§7); the negative-finding cross-component invariant (§3 phase 3 check 2) is now stated as a
DIRECT terminal-fail — not routed through R-4's bounded-repair contract, since there is no model
output at that stage to repair (this corrects an earlier instruction of Ledger's own design
framing that Danny's ruling supersedes); and every surviving "still in progress, not yet merged"
reference to the Slice 8 provenance correction is swept and replaced — it landed and is merged,
commit `ce5be58`, pushed (§3, §9).

`04-ROADMAP.md` and `02-ARCHITECTURE.md` are intentionally NOT edited here — Danny is making both
corrections directly himself (the roadmap's ProblemBrief-vs-Investigation lock wording, its
unqualified generation-failed failure rule, and its 0–4 `NegativeFinding` test count, which this
design's own §3 phase 3 check 1 note already established should read 0–3 given evidence's
structurally-unreachable negative path; and the architecture's §1.9 finalization contract).

**Revision note (revision 8 — this revision): SINGLE MECHANICAL CONTRACT CORRECTION, gate at
`a61677c` FAIL on one defect.** The Composer ACCEPTED both revision-7 Producer decisions — the
snapshot-union approach (the four existing component signatures are NOT to be changed) and keeping
`claimVersionId` restricted to this run's extraction (fresh `ClaimVersion`s are minted each run).
The preflight current-version equality fix also PASSED. One defect remained: `startSnapshot` is
captured BEFORE the Extraction step runs, but the permitted union was written as
`startSnapshot ∪ landscapeEvidenceItems` — omitting `ExtractionResult.evidenceItems`. Extraction
inserts fresh `EvidenceItem`s and the Demand Analyzer subsequently reads them, so a candidate
citing that legitimate step-1 evidence would have failed phase 3. This is the PRIMARY path, not an
edge case. All seven references now read
`startSnapshot ∪ ExtractionResult.evidenceItems ∪ LandscapeResearchResult.landscapeEvidenceItems`,
and one falsification test is added (a normal first generation citing Extraction-created evidence
must SUCCEED). Nothing else in the document was touched — this was a formula correction, not a
redesign, and was applied by Ledger directly rather than dispatched, as it is mechanical and the
Composer specified the exact replacement text.

**Revision note (revision 7): NARROW patch, gate at `12d1902` FAIL.** Composer
review: exactly-once finalization, zero-foreign ownership, locking, migration constraints, and the
retry transition (revision 6's BLOCKING 1/3/5 fixes and the standing locking/migration work) are
ACCEPTED and NOT re-examined here. Two blockers only, both scoped to §3:
1. **Preflight never actually checked `problemBrief.current_version_id === input.supersedesVersionId`**
   — a same-Brief, non-current target (e.g. current v3, supplied v1) passed preflight and produced
   an off-chain branch. Fixed: §3 Phase 2 step 0 now explicitly rejects this case as
   `InvalidSupersedeTargetError`, before any LLM call. Falsification test added.
2. **The "this run's own extraction/research output" ownership narrowing (revision 6) is
   incompatible with the live `demandAnalyzer.ts`/`personalPullExtractor.ts`/
   `landscapeResearcher.ts`, which read ALL persisted Investigation evidence via
   `getEvidenceForInvestigation`, not a run-scoped subset — making correct corrections
   unassemblable.** Fixed per Danny's chosen resolution (Composer offered two options; Danny
   selects the snapshotted-evidence-universe option as Producer): the evidence universe for a run
   is the start-of-run `getEvidenceForInvestigation` snapshot UNION evidence created during the
   run, stated once (§3 Phase 2) and referenced, not redefined, by phase 3's validation (§3 Phase
   3 check 1(c)). Zero-foreign is unchanged. Two falsification tests added (a legitimate
   older-local-evidence citation must succeed; an out-of-universe citation must still fail).
   Flagged explicitly as a Producer decision under the Composer's "must not guess between
   contracts" instruction, open to override at re-gate.

Also corrected: the module plan's stale present-tense description of the Slice 8
`runStepWithProvenance` correction as still requiring work — it is merged, commit `ce5be58`,
pushed (§1). Nothing else in this document was touched; no other section was re-examined or
restructured.

---

## 1. Module/File Plan

| Path | Action | Responsibility |
|---|---|---|
| `src/db/migrations/007_problem_brief_and_versioning.sql` | create | `problem_brief`, `brief_version`, `problem_statement`, `negative_finding` tables + strengthened immutability/enum/non-empty constraints (finding 11) |
| `src/services/generateBriefVersion.ts` | create | The orchestrator: creates the `GenerationRun`; preflight-validates and snapshots the supersede target before any LLM call (revision 6 BLOCKING 2); runs Slices 4–7 with G-1-precedence hard-stop semantics (finding 5, revision 5's Composer ruling); applies the fail-closed rules (Q-2 precheck, full zero-foreign/this-run-provenance ownership verification across every Brief-scoped entity — revision 6 BLOCKING 3, four-element `negativeFindings` rule, terminal-fail direct); opens the one short persistence transaction (locked, FK-ordered, snapshot-vs-lock race classification, transition-return-value checked, every persisted entity's required fields swept, exactly-once finalization — findings 1/3/4/7 and revision 6 BLOCKING 1/2/4/5), returns `BriefVersion` or throws `BriefGenerationFailedError` / `InvalidSupersedeTargetError` / `StaleCorrectionConflictError` (finding 9, revision 6 BLOCKING 2) |
| `src/services/persistBriefVersion.ts` | create | Pure persistence helper: given validated candidates, pre-generated ids, and a DB client already inside a transaction, inserts `brief_version` FIRST using those pre-generated ids, then Brief-scoped child rows referencing it (finding 1). No LLM/network calls. Called only from `generateBriefVersion.ts`'s transaction block. |
| `src/services/transitionInvestigationStatus.ts` | modify | (a) Extend `ALLOWED_PRIOR_STATUSES`, keyed by whether the call is for an initial generation or a correction (finding 8); (b) accept an optional `client: PoolClient`; (c) accept an optional `problemBriefId` to set `investigation.problem_brief_id` atomically in the same statement (finding 4) |
| `src/services/provenanceRecorder.ts` | modify (additive only) | `finalizeGenerationRun` accepts an optional `client: PoolClient` — when provided, EVERY read and write it performs, INCLUDING its internal `loadStepLog` call (revision 6, BLOCKING 5 sweep — revision 5 only threaded `client` through the existing-row check and the final `UPDATE`, missing `loadStepLog`), runs on that client so a **successful** run's finalization commits inside phase 4's transaction, reading a view consistent with what that same transaction just wrote (finding 7, BLOCKING 5). This is a narrow, additive signature change, orthogonal to and NOT a substitute for the Slice 8 correction finding 6 requires (see §3's provenance-mapping subsection and §9 OQ-6) |
| `src/types/domain.ts` | modify | Add `ProblemBrief`, `BriefVersion`, `ProblemStatement`, `NegativeFinding`, `BriefElement` interfaces (copied from `02-ARCHITECTURE.md` §3, matching the file's existing "copied exactly" convention); update `DemandSignal`, `ExistingSolution`, `GapHypothesis`, `PersonalPullNote` as the persisted (non-candidate) counterparts of the Slice 5/6 candidate shapes, each carrying `id`/`briefVersionId` |

No changes to Slice 4–7 pipeline-component service files' own logic — `generateBriefVersion.ts` is a
pure caller of their existing exported functions. Per Danny's OQ-1 ruling (revision 2, confirmed),
`ExtractionResult` (Slice 4) is not extended. Slice 8's `runStepWithProvenance` correction (finding
6) is MERGED — commit `ce5be58`, pushed, not a pending dependency — its implementation was out of
scope for this document to author, and this document only consumes its now-settled, now-available
contract (see §3).

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
 *  StaleCorrectionConflictError). **Revision 6 correction (BLOCKING 2):** every one of these
 *  conditions is now evaluated at the PREFLIGHT step (§3 Phase 2 step 0), BEFORE the pipeline
 *  runs — snapshotted once, up front, never re-derived from a later, possibly-changed read. This
 *  is what makes it correct to call these "wrong on arrival, independent of any race": they are
 *  observed true before any concurrent call has had a chance to change anything.
 *   - supersedesVersionId references a real BriefVersion belonging to a DIFFERENT ProblemBrief
 *     than the one resolved for this investigationId (checked at preflight)
 *   - supersedesVersionId is present but no ProblemBrief exists yet for this Investigation at all
 *     (there is nothing to correct) (checked at preflight)
 *   - supersedesVersionId is absent AND a ProblemBrief ALREADY existed for this Investigation AT
 *     PREFLIGHT TIME (caller must target the current version explicitly) — **the corresponding
 *     case where no ProblemBrief existed at preflight but one appears by phase-4 lock time is NOT
 *     this type** (that was revision 5's mislabeling, finding 2's "concurrent first-generation
 *     LOSER" defect) — it is a genuine race, `StaleCorrectionConflictError` with
 *     `expectedSupersedesVersionId: null` (see that class's doc comment)
 *  A real GenerationRun IS still created and finalized 'failed' for these (the run was attempted
 *  with a specific input and that attempt is auditable), but no currentVersionId can be
 *  represented as "what you should have targeted" in the general case (e.g. the "no ProblemBrief
 *  exists" case has no current version at all) — hence this remains a distinct type from
 *  StaleCorrectionConflictError, which always has a real, resolvable actualCurrentVersionId. */
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
 *  also covered caller-contract cases InvalidSupersedeTargetError now owns). **Widened this
 *  revision (revision 6, BLOCKING 2):** thrown whenever a PREFLIGHT-VALIDATED target (see §3
 *  Phase 2 step 0) no longer matches what phase 4 observes under the investigation-row lock — two
 *  shapes, both genuine races because both were valid when the run began:
 *   (a) CORRECTION race — supersedesVersionId was a correct, same-ProblemBrief target at preflight
 *       time, but ProblemBrief.currentVersionId is a DIFFERENT, real BriefVersion by lock time
 *       (another correction won). expectedSupersedesVersionId is the originally-supplied,
 *       preflight-validated id (a string).
 *   (b) FIRST-GENERATION race (revision 6 fix — previously mislabeled InvalidSupersedeTargetError
 *       even though the request was valid when issued): supersedesVersionId was ABSENT and no
 *       ProblemBrief existed for this Investigation at preflight time, but a ProblemBrief now
 *       exists by lock time (another first-generation call won). expectedSupersedesVersionId is
 *       `null` for this shape — "expected no ProblemBrief to exist yet" is itself the snapshotted
 *       expectation being violated.
 *  In both shapes, actualCurrentVersionId is always populated and always resolvable — this class
 *  only ever fires once phase 4 has confirmed a ProblemBrief and a valid current version
 *  DEFINITELY exist (whether or not that was true at preflight time). Classification is always
 *  the CHANGE BETWEEN TWO OBSERVATIONS (preflight snapshot vs. phase-4 lock-time read), never a
 *  single read — see §3 Phase 2 step 0 and §3 Phase 4. */
export class StaleCorrectionConflictError extends Error {
  constructor(
    public readonly problemBriefId: string,
    public readonly expectedSupersedesVersionId: string | null,
    public readonly actualCurrentVersionId: string,
    public readonly generationRunId: string,
  ) {
    super(
      expectedSupersedesVersionId === null
        ? `StaleCorrectionConflict: no ProblemBrief existed for this Investigation when generation ` +
          `began, but one now exists (current version ${actualCurrentVersionId}) — another ` +
          `first-generation call won the race; regenerate as a correction against the current ` +
          `version.`
        : `StaleCorrectionConflict: supersedesVersionId ${expectedSupersedesVersionId} is no longer ` +
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

**Revised step sequence — step 0 is NEW this revision (BLOCKING 2):**

0. **Supersede-target preflight validation and snapshot (revision 6, BLOCKING 2 fix).** Runs
   immediately after phase 1's `createGenerationRun`, BEFORE any LLM call — a read-only check
   against `problem_brief`/`brief_version`, no lock, no transaction:
   - If `input.supersedesVersionId` is present: read `problem_brief` for `investigationId`. If it
     doesn't exist → `InvalidSupersedeTargetError` (no ProblemBrief to correct), hard stop, zero
     LLM calls spent. Read the referenced `brief_version`; if it doesn't exist or its
     `problem_brief_id` doesn't match → `InvalidSupersedeTargetError` (wrong-Brief target), hard
     stop, zero LLM calls spent. **(Revision 7, BLOCKER 1 fix — this equality was previously
     assumed "implicitly" and never actually checked.) Otherwise, explicitly compare
     `problemBrief.current_version_id` against `input.supersedesVersionId`: if they are NOT equal
     — i.e. `supersedesVersionId` names a real `BriefVersion` that DOES belong to this
     `ProblemBrief` but is NOT the current one (e.g. current is v3, caller supplied v1) — throw
     `InvalidSupersedeTargetError` ("supersedesVersionId is not the current version of this
     ProblemBrief") right here, hard stop, zero LLM calls spent. This is a CALLER-CONTRACT error,
     not a race: the request was already invalid the moment it was issued, before any concurrent
     call could have changed anything — classifying it as `StaleCorrectionConflictError` would be
     wrong (that class is reserved for a target that WAS current at preflight and changed during
     the run, per §2's doc comment). Only once this equality holds** does preflight SNAPSHOT
     `preflightCurrentVersionId := problemBrief.current_version_id` (now genuinely, explicitly
     equal to `input.supersedesVersionId`, not merely assumed to be) and continue to step 1.
   - If `input.supersedesVersionId` is absent: read `problem_brief` for `investigationId`. If one
     already exists → `InvalidSupersedeTargetError` (caller must target the current version
     explicitly), hard stop, zero LLM calls spent. Otherwise, SNAPSHOT
     `preflightCurrentVersionId := null` (meaning "no ProblemBrief existed at preflight time") and
     continue to step 1.
   - **This is the ONLY place `InvalidSupersedeTargetError` is ever thrown** (revision 6 moves it
     out of phase 4 entirely — see §3 Phase 4) — a genuine benefit beyond correctness: a
     caller-contract error is now caught before spending a single LLM call on a doomed run,
     consistent with G-1's "no LLM spend on already-doomed work" principle (§ above) applied to
     this failure class too.
   - `preflightCurrentVersionId` (a `string | null`) is carried through phases 1–3 in memory and
     compared, under lock, against a FRESH read at phase 4 (§3 Phase 4) — this is the
     "classify from the CHANGE BETWEEN TWO OBSERVATIONS, not a single read" fix BLOCKING 2
     requires. Nothing about this preflight check re-validates or re-locks anything at phase 4;
     phase 4 only compares its own fresh read against this snapshot.
   - **Falsification test to specify at Forge time (NEW, revision 7, BLOCKER 1):**
     `ProblemBrief.currentVersionId` is v3; caller supplies `supersedesVersionId: v1` (a real
     `BriefVersion` that DOES belong to this `ProblemBrief`, just not the current one). Assert:
     rejected at preflight with `InvalidSupersedeTargetError` — specifically NOT
     `StaleCorrectionConflictError` — zero LLM calls are made (no phase-2 step ever runs), and no
     `BriefVersion` is persisted. This is the test that proves the previously-assumed-but-unchecked
     `problemBrief.current_version_id === input.supersedesVersionId` equality is now an explicit,
     enforced gate, not an implication.

**The evidence universe for this run (revision 7, replacing revision 6's "this run's own
extraction/research output" narrowing — Producer decision, flagged for Composer re-gate, see
below).** Immediately after step 0, and BEFORE step 1 runs, snapshot
`startSnapshot := getEvidenceForInvestigation(investigationId)` — the full set of
`EvidenceItem`s persisted and visible for this Investigation at the moment this run begins,
captured explicitly once, not re-derived later. This is the SAME call
`demandAnalyzer.ts`/`personalPullExtractor.ts`/`landscapeResearcher.ts` already make internally
(verified against the live code for this revision) — they read ALL persisted evidence for the
Investigation, not a run-scoped subset, and `landscapeResearcher.ts`'s
`LandscapeResearchResult.landscapeEvidenceItems` returns only NEWLY-created evidence, while its
`ExistingSolutionCandidate`s may legitimately cite OLDER evidence from that same full read. The
run's full evidence universe is therefore:

```
startSnapshot
  ∪ ExtractionResult.evidenceItems
  ∪ LandscapeResearchResult.landscapeEvidenceItems
```

— the start-of-run snapshot, UNION the evidence this run's own Extraction step (step 1) newly
inserts, UNION the evidence the Landscape Researcher newly creates. **All three terms are
required.** `startSnapshot` is captured BEFORE step 1 runs, so it cannot contain Extraction's
rows; Extraction inserts fresh `EvidenceItem`s and returns them in `ExtractionResult.evidenceItems`
(verified against the live extraction code), and the Demand Analyzer subsequently reads them via
its own `getEvidenceForInvestigation` call. A two-term union of
`startSnapshot ∪ landscapeEvidenceItems` therefore REJECTS a candidate citing perfectly legitimate
step-1 evidence — that omission was a real defect in revision 7, corrected here (Composer gate,
2026-08-14). Phase 3 check 1(c) below validates every non-`ClaimVersion` citation against exactly
this three-term union. **Older, local evidence a component legitimately read from the
Investigation's full evidence set IS valid provenance** — it is not required to have been newly
created by this run to be citable; and evidence created BY this run's own Extraction step is
likewise valid provenance, not an out-of-universe citation.

> **Producer decision (this revision), made under the Composer's "the implementer must not guess
> between contracts" instruction, flagged prominently for re-gate override:** two options were
> available — (a) adopt the snapshotted evidence universe above, keeping `demandAnalyzer.ts`/
> `personalPullExtractor.ts`/`landscapeResearcher.ts` untouched; or (b) change those three merged,
> QC-passed slices' signatures to accept an explicit run-scoped evidence set instead of reading
> the Investigation's full evidence themselves. This document adopts (a) — it preserves the real
> property wanted (no cross-Investigation leakage, no citation of evidence that did not exist to
> this run) without a large blast radius into closed, already-shipped work for no gain in that
> property. Zero-foreign (§ check 1(a) above) is UNCHANGED and still applies in full — evidence
> from a DIFFERENT Investigation is rejected regardless of which universe definition is used; only
> the "this run's own output" narrowing is replaced by this snapshot-union universe.

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

The corrected `runStepWithProvenance` signature (ruled on and now MERGED — commit `ce5be58`,
pushed; no longer "in progress") adds a REQUIRED field to its input:

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

Runs after all non-hard-stopping phase-2 steps complete. Two checks, in order.

1. **Evidence-chain verification, WITH FULL ownership check (revision 6, BLOCKING 3 — strengthened
   again from revision 4's finding 10).** Revision 4's ownership fix (requiring AT LEAST ONE local
   `claim_version_evidence` row per cited `claimVersionId`) was still insufficient, per Danny's
   ruling: a `ClaimVersion` with ONE local and ONE foreign evidence reference PASSED that check —
   exactly the cross-Investigation leak it exists to prevent. This revision closes that gap and
   extends the same discipline to every other Brief-scoped citation, not just `ClaimVersion`s:

   - **(a) Zero foreign, not "at least one local."** For each cited `claimVersionId`, compare the
     TOTAL count of its `claim_version_evidence` rows against the count of those rows whose
     `evidence_item.source_artifact_id` resolves to a `source_artifact` scoped to THIS
     `investigationId`:

     ```
     for each problemStatementCandidate:
       for each claimVersionId in candidate.supportingClaimVersionIds:
         totalCount = SELECT count(*) FROM claim_version_evidence WHERE claim_version_id = $claimVersionId
         localCount = SELECT count(*)
                        FROM claim_version_evidence cve
                        JOIN evidence_item ei ON ei.id = cve.evidence_item_id
                        JOIN source_artifact sa ON sa.id = ei.source_artifact_id
                       WHERE cve.claim_version_id = $claimVersionId
                         AND sa.investigation_id = $investigationId
         -- require localCount >= 1 AND localCount === totalCount (zero foreign rows permitted)
     ```

     `localCount >= 1` alone (revision 4's check) is necessary but not sufficient — Danny's exact
     wording: "require at least one local citation AND ZERO foreign citations." A `claimVersionId`
     failing either half of this (no local evidence at all, OR any foreign evidence mixed in)
     fails phase 3.

   - **(b) Cited `claimVersionId`s must come from THIS RUN's own extraction, not merely from the
     Investigation.** Every `claimVersionId` in every accepted `ProblemStatementCandidate`'s
     `supportingClaimVersionIds` must be a member of THIS run's own
     `ExtractionResult.claimVersions` id set (the in-memory array phase 2 step 1 actually
     returned) — not merely a `ClaimVersion` that happens to exist, ownership-correctly, somewhere
     in this Investigation's history from a PRIOR run. This closes a narrower but real gap: a
     `ClaimVersion` can legitimately belong to this Investigation (ownership-correct) while still
     being the wrong provenance for THIS specific `GenerationRun` to cite as its own output — this
     run's candidates should only ever reference what this run's own extraction step actually
     produced.

   - **(c) Zero-foreign applies to EVERY Brief-scoped entity's evidence citations, not only
     `ProblemStatementCandidate`/`ClaimVersion` (Danny's ruling, explicit — "apply ownership
     validation to ALL evidence ids entering the Brief"). REVISION 7 CORRECTION (BLOCKER 2):
     revision 6's "this run's own extraction/research output" narrowing for THESE entities is
     REPLACED by the evidence-universe contract stated once in §3 Phase 2 (the "evidence universe
     for this run" callout) — it is restated here, not redefined, so the two cannot drift:**
     - `DemandSignalCandidate.evidenceItemIds`, `ExistingSolutionCandidate.evidenceItemIds`, and
       `GapHypothesisCandidate.evidenceItemIds` — every id must (i) resolve to an `evidence_item`
       whose `source_artifact.investigation_id = investigationId` (zero foreign — these arrays are
       already non-empty by the candidate's own `NonEmptyArray` contract, so "zero foreign" alone
       is the remaining bar), AND (ii) be a member of `startSnapshot ∪ ExtractionResult.evidenceItems ∪ LandscapeResearchResult.landscapeEvidenceItems`
       (§3 Phase 2's snapshotted universe) — NOT narrowed to only what this run's own step
       produced. An older, local `EvidenceItem` a component read from the Investigation's full
       evidence set (via `getEvidenceForInvestigation`, as `demandAnalyzer.ts`/
       `landscapeResearcher.ts` genuinely do) IS legitimate provenance under this rule.
     - `PersonalPullNoteCandidate.sourceArtifactId` — a single id, not an array; require it
       resolves to a `source_artifact` with `investigation_id = investigationId` (zero foreign)
       AND that the `SourceArtifact` backs an `EvidenceItem` within the same
       `startSnapshot ∪ ExtractionResult.evidenceItems ∪ LandscapeResearchResult.landscapeEvidenceItems` set (i.e. the source was among what this run's
       own pipeline was actually handed to read, per the same universe — not merely any
       `source_artifact` row that happens to share this `investigationId`).

   If ANY citation across ANY of the above fails either discipline, the run fails: §5 row I-4/C-4.
   This still runs unconditionally, distrusting every upstream component's own
   `generationFailed`/success signal entirely, per revision 2's OQ-1 ruling (confirmed, not
   revisited) — now generalized from "distrust Slice 4" to "distrust every upstream candidate
   producer's implicit provenance claims."

   `'evidence'` remains structurally unreachable as a `NegativeFinding` element in this MVP for
   the same reason as before (revision 2) — the schema keeps `'evidence'` as a valid
   `BriefElement` member, but no code path constructs one.

   **Falsification tests to specify at Forge time (design only), FIVE required (revision 7 adds
   two to the three revision 6 specified):**
   - (unchanged from revision 2) a nominally successful extraction where the persisted
     `claim_version_evidence` join for a cited `claimVersionId` is empty or missing entirely →
     assembly fails closed.
   - (unchanged from revision 4) a nominally successful extraction where the persisted
     `claim_version_evidence` join for a cited `claimVersionId` resolves ENTIRELY to a foreign
     Investigation's evidence → assembly fails closed.
   - (unchanged from revision 6) a nominally successful extraction where a cited
     `claimVersionId`'s `claim_version_evidence` join is MIXED — at least one local row AND at
     least one foreign row (the specific gap Danny's ruling names: "a ClaimVersion with one local
     AND one foreign evidence reference PASSES" under the pre-revision-6 check) → assembly MUST
     still fail closed. This is the test that proves check 1(a) is genuinely "zero foreign," not
     merely "at least one local."
   - **(NEW, revision 7, BLOCKER 2)** a correction whose candidate (e.g. a
     `DemandSignalCandidate`) cites a LOCAL `EvidenceItem` that PREDATES this run — it was present
     in the start-of-run `startSnapshot` but is not a member of any of this run's own
     step outputs (`ExtractionResult.evidenceItems`, `landscapeEvidenceItems`, etc.) → assembly
     MUST SUCCEED. This is the test that proves the universe rule does not reject legitimate
     corrections — the exact failure mode revision 6's "this run's own output" narrowing produced
     and BLOCKER 2 identified.
   - **(NEW, revision 7, BLOCKER 2, paired with the test above)** a candidate citing an
     `EvidenceItem` OUTSIDE the `startSnapshot ∪ ExtractionResult.evidenceItems ∪ LandscapeResearchResult.landscapeEvidenceItems` union — either because
     it belongs to a foreign Investigation (already covered structurally by check 1(a)'s
     zero-foreign rule, restated here as the paired case) OR because it was created AFTER this
     run's start-of-run snapshot by something other than this run's own steps (e.g. a concurrent,
     unrelated write to the same Investigation's evidence that this run never read) → assembly
     MUST still fail closed.
   - **(NEW, revision 8 — Composer gate, 2026-08-14)** a NORMAL FIRST GENERATION whose candidate
     (e.g. a `DemandSignalCandidate`) cites an `EvidenceItem` created by **this run's own
     Extraction step** — i.e. a member of `ExtractionResult.evidenceItems`, which by construction
     is absent from `startSnapshot` because the snapshot is taken before step 1 runs → assembly
     MUST SUCCEED. This is the ordinary, overwhelmingly common case: Extraction inserts fresh
     evidence, the Demand Analyzer reads it back via `getEvidenceForInvestigation`, and cites it.
     Revision 7's two-term union (`startSnapshot ∪ landscapeEvidenceItems`) omitted
     `ExtractionResult.evidenceItems` and would therefore have rejected it — failing not an edge
     case but the primary path. This test exists so that omission cannot recur silently: it fails
     against any union missing the Extraction term.

2. **Four-element `negativeFindings` fail-closed rule (G-1) — TERMINAL-FAIL DIRECTLY, no
   bounded-repair (Danny's ruling, explicit; corrects an earlier framing of Ledger's own design
   that this ruling supersedes).** For each of `'evidence' | 'demand-signal-type' |
   'existing-solution' | 'gap-hypothesis'`, exactly one of (a) the corresponding id source is
   non-empty, or (b) a matching `negativeFindingSignal` with a non-empty `statement` is present —
   never both, never neither. `'evidence'` always resolves "populated" per check 1 above. On
   violation, this check fails the run IMMEDIATELY and TERMINALLY — it is a structural check over
   already-produced, already-validated candidates, not a schema-constrained model output, so there
   is no model output at this stage to bound-repair, and it must never be routed through R-4's
   bounded-repair/re-prompt mechanism (which exists specifically for re-prompting a MODEL with a
   validation error — there is no model call to re-prompt here). **Revision 5 correction (still in
   force):** under the three-hard-stop-class scheme (§ Phase 2 above), phase 3 is now reached ONLY
   after a genuinely clean pipeline run — every Demand/Landscape/Gap step already returned
   `generationFailed: false` (class 2 hard-stops otherwise, before phase 3 is ever entered). This
   check therefore validates genuine "found vs. legitimately verified absent" outcomes, not
   upstream infra/LLM failures — those are now excluded from ever reaching this check at all,
   which is exactly the G-1 precedence stated in Phase 2's callout: an unknown-due-to-failure
   state never gets a chance to be mistaken for (or to require) a verified-absence
   `NegativeFinding` here, because it never arrives at this check in the first place.

If phase 3 passes, proceed to phase 4.

### Phase 4 — Persistence (the one short transaction) + finalization

**Corrected in full per findings 1, 2, 3, 4, 7 (revisions 4/5) and this revision's BLOCKING 1, 2,
4, 5.** Phase 4 no longer RE-RESOLVES the supersede target from scratch (that was revision 5's
design and is what caused BLOCKING 2 — a single read cannot distinguish "already stale" from "a
genuine race"). It now COMPARES a fresh, lock-protected read against the snapshot §3 Phase 2 step
0 took before any LLM call ran. Sequence, inside a single `pool.connect()` / `BEGIN` / `COMMIT`
block:

```
client = await pool.connect()
BEGIN

  -- Lock the STABLE investigation row first (finding 3, unchanged this revision) — serializes
  -- ANY two concurrent generateBriefVersion calls for the same investigationId, including the
  -- first-generation case where no problem_brief row exists yet to lock directly.
  SELECT id FROM investigation WHERE id = $investigationId FOR UPDATE

  problemBrief = SELECT * FROM problem_brief WHERE investigation_id = $investigationId
  currentVersionIdAtLock = problemBrief?.current_version_id ?? null

  -- ---- BLOCKING 2 FIX: classify from the CHANGE between the step-0 preflight snapshot and
  -- THIS lock-protected read — never from this read alone. InvalidSupersedeTargetError is no
  -- longer thrown here at all (it is now exclusively a step-0/preflight error, §3 Phase 2 step 0)
  -- — by the time execution reaches here, the request was ALREADY validated as legitimate at
  -- preflight time; the only question left is whether it is STILL legitimate now. ----
  IF preflightCurrentVersionId !== currentVersionIdAtLock:
    -- something changed between preflight and lock time — always a genuine race, by construction
    -- (a caller-contract defect would already have been caught at step 0, before the pipeline
    -- ever ran)
    ROLLBACK
    winningProblemBriefId = problemBrief?.id ?? <should not happen: if preflight saw a Brief and
      now none exists, that is a deeper invariant violation than this design's error taxonomy
      covers — problem_brief rows are never deleted (§7) — treat as an assertion failure, not a
      modeled StaleCorrectionConflictError case>
    recordGenerationStep({ generationRunId, step: {
      component: 'Brief Assembler', outcome: 'failed',
      error: preflightCurrentVersionId === null
        ? `StaleCorrectionConflict: no ProblemBrief existed at preflight time; one now exists ` +
          `(current version ${currentVersionIdAtLock})`
        : `StaleCorrectionConflict: expected current version ${preflightCurrentVersionId}, ` +
          `actual ${currentVersionIdAtLock}`,
      startedAt: <phase-4 start>, completedAt: <now>,
      inputRefs: preflightCurrentVersionId === null ? [] : [preflightCurrentVersionId],
      outputRefs: [],
    } })
    -- EXACTLY-ONCE FINALIZATION (BLOCKING 5): finalize AFTER rollback, using the pool (no
    -- client — the transaction that held `client` is gone), exactly once, right here — not a
    -- second, later, unconditional finally that would double-finalize.
    finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null })
    -- Conflict paths BYPASS the generic initial-failure Investigation-status transition entirely
    -- (standing ruling, revision 3, reconfirmed this revision) — a concurrency rejection must
    -- never move a healthy Investigation to 'generation-failed'. No transitionInvestigationStatus
    -- call of any kind on this path, initial or correction.
    THROW StaleCorrectionConflictError(winningProblemBriefId, preflightCurrentVersionId,
                                        currentVersionIdAtLock, generationRunId)

  -- Unchanged since preflight: proceed with the version this request was always going to write.
  versionNumber = isCorrection ? (supersedesRow.version_number + 1) : 1
    -- supersedesRow was already read and validated at step 0 (§3 Phase 2); phase 4 does not
    -- re-read brief_version here beyond what the comparison above already required
    -- (currentVersionIdAtLock IS supersedesRow.id when isCorrection and nothing changed).

  -- Generate every id this transaction will need BEFORE any INSERT (finding 1, unchanged),
  -- so brief_version can be inserted FIRST and every child row's FK is satisfiable on its own
  -- INSERT.
  briefVersionId = randomUUID()
  problemBriefId = problemBrief?.id ?? randomUUID()
  problemStatementIds = problemStatementCandidates.map(() => randomUUID())
  demandSignalIds = demandSignalCandidates.map(() => randomUUID())
  existingSolutionIds = existingSolutionCandidates.map(() => randomUUID())
  gapHypothesisIds = gapHypothesisCandidates.map(() => randomUUID())
  personalPullNoteIds = personalPullNoteCandidates.map(() => randomUUID())
  negativeFindingIds = <one per row phase-3 determined necessary>.map(() => randomUUID())
  demandNegativeFindingId = negativeFindingIds.find(row => row.element === 'demand-signal-type')?.id
    -- BLOCKING 4: needed below to populate DemandConfidenceClassification.negativeFindingRef

  IF NOT isCorrection:
    INSERT problem_brief (id: problemBriefId, investigation_id: investigationId)

  -- ---- BLOCKING 4 FIX: every persisted entity's REQUIRED fields, swept against
  -- 02-ARCHITECTURE.md §3 in full (not spot-fixed) — see the enumeration table immediately below
  -- this pseudocode block. brief_version is inserted FIRST (finding 1/2, unchanged) and carries
  -- NO negative_findings column (finding 2). ----
  INSERT brief_version (
    id: briefVersionId, problem_brief_id: problemBriefId, version_number: versionNumber,
    supersedes_version_id: input.supersedesVersionId ?? null, generation_run_id: generationRunId,
    problem_statement_ids: problemStatementIds,
    claim_version_ids: <union of every cited ClaimVersion id across all
      problemStatementCandidates>,
    demand_signal_ids: demandSignalIds,
    demand_confidence_classification: {
      -- BLOCKING 4: briefVersionId and negativeFindingRef were both OMITTED in revision 5 —
      -- both required by DemandConfidenceClassification (Architecture §3). Set explicitly:
      briefVersionId: briefVersionId,
      level: demandAnalysis.demandConfidenceClassificationCandidate.level,
      narrative: demandAnalysis.demandConfidenceClassificationCandidate.narrative,
      citedDemandSignalIds: <demandAnalysis.demandConfidenceClassificationCandidate
        .citedDemandSignalIds remapped from localId to the pre-generated demandSignalIds above>,
      negativeFindingRef: demandNegativeFindingId,
        -- set iff a NegativeFinding row with element: 'demand-signal-type' exists on this
        -- BriefVersion (phase 3's four-element rule determined this, not derived from `level` or
        -- `citedDemandSignalIds` — Architecture §3's exact trigger); undefined/absent otherwise
    },
    existing_solution_ids: existingSolutionIds,
    gap_hypothesis_ids: gapHypothesisIds,
    uncertainty_statement: {
      -- BLOCKING 4: briefVersionId OMITTED in revision 5 — required by UncertaintyStatement
      -- (Architecture §3). Set explicitly:
      briefVersionId: briefVersionId,
      whatsUnknown: uncertaintyCompilation.uncertaintyStatementCandidate.whatsUnknown,
      whatWouldChangeConclusion:
        uncertaintyCompilation.uncertaintyStatementCandidate.whatWouldChangeConclusion,
      whatsUndeterminable: uncertaintyCompilation.uncertaintyStatementCandidate.whatsUndeterminable,
    },
    recommendation: {
      -- BLOCKING 4: briefVersionId OMITTED in revision 5 — required by Recommendation
      -- (Architecture §3). Set explicitly:
      briefVersionId: briefVersionId,
      decision: recommendation.recommendationCandidate.decision,
      rationale: recommendation.recommendationCandidate.rationale,
    },
    personal_pull_note_ids: personalPullNoteIds,
  )

  -- Children, each using its own pre-generated id and referencing briefVersionId (finding 1) —
  -- every FK is satisfiable because brief_version already exists as of the INSERT above. Every
  -- row below carries brief_version_id as its own binding field (a real relational column, §7 —
  -- not a JSONB omission risk the way the three embedded objects above were).
  INSERT problem_statement rows (using problemStatementIds, brief_version_id: briefVersionId,
    who_experiences_it, context_or_workflow, consequence_or_friction,
    supporting_claim_version_ids — every required field per ProblemStatement, Architecture §3)
  INSERT demand_signal rows (using demandSignalIds, brief_version_id: briefVersionId, type,
    other_type_label, evidence_item_ids — every required field per DemandSignal, Architecture §3)
  INSERT personal_pull_note rows (using personalPullNoteIds, brief_version_id: briefVersionId,
    source_artifact_id, text, label — every required field per PersonalPullNote, Architecture §3)
  INSERT existing_solution rows (using existingSolutionIds, brief_version_id: briefVersionId,
    name, what_it_addresses, how_people_cope_now, where_its_inadequate, evidence_item_ids — every
    required field per ExistingSolution, Architecture §3)
  INSERT gap_hypothesis rows (brief_version_id: briefVersionId, category, other_category_label,
    statement, evidence_item_ids — every required field per GapHypothesis, Architecture §3)
  INSERT negative_finding rows (0..3 in practice — 'evidence' never constructed —
    brief_version_id: briefVersionId, element, statement — every required field per
    NegativeFinding, Architecture §3)

  UPDATE problem_brief SET current_version_id = briefVersionId WHERE id = problemBriefId

  -- ---- BLOCKING 1 FIX: check the return value. Never ignore it. ----
  transitioned = transitionInvestigationStatus(investigationId, 'brief-generated', null,
    { client, problemBriefId })
  IF NOT transitioned:
    -- The guarded UPDATE affected zero rows — Investigation.status was not one of the allowed
    -- prior states (§6: 'open', 'generation-failed', 'brief-generated') at the moment of this
    -- UPDATE, despite everything checked so far in this transaction. Given the investigation-row
    -- lock acquired at the top of this transaction, this should be structurally unreachable in
    -- practice — but BLOCKING 1 was exactly "a return value silently ignored," so it is checked
    -- and branched on explicitly here, never assumed away by the lock's presence.
    ROLLBACK
    recordGenerationStep({ generationRunId, step: {
      component: 'Brief Assembler', outcome: 'failed',
      error: 'Investigation status transition to brief-generated returned false — status was ' +
             'not in an allowed prior state at update time',
      startedAt: <phase-4 start>, completedAt: <now>, inputRefs: [], outputRefs: [],
    } })
    finalizeGenerationRun({ generationRunId, outcome: 'failed', briefVersionId: null })  -- no
                                                                                           -- client
    THROW BriefGenerationFailedError(
      'Investigation status transition to brief-generated failed unexpectedly during assembly',
      generationRunId, 'generation-failed')
      -- this path does NOT call transitionInvestigationStatus again (the one call already made
      -- returned false — a second call is not retried; see §6's note on why retrying here would
      -- itself be another ignored-edge-case risk)

  -- ---- BLOCKING 5 FIX: EXACTLY-ONCE finalization, success path — finalize INSIDE this
  -- transaction, using the SAME client for every read and write finalizeGenerationRun performs,
  -- including its internal loadStepLog call (which, pre-this-revision, always used the bare
  -- `pool` — now threaded through `client` when supplied, so the finalize read is consistent
  -- with the just-committed-in-this-transaction state, not a separate connection's view). This is
  -- the ONLY call to finalizeGenerationRun for this GenerationRun's success path — there is no
  -- separate, unconditional `finally` that could double-finalize it (see the Finalization
  -- Contract subsection immediately after this pseudocode block). ----
  finalizeGenerationRun({ generationRunId, outcome: 'succeeded', briefVersionId, client })

COMMIT
client.release()
return newVersion
```

**Every persisted entity's required fields, swept against `02-ARCHITECTURE.md` §3 in full
(BLOCKING 4 — the sweep, not a spot-fix of the three Danny named):**

| Entity | Required fields (Architecture §3) | Where set in phase 4 |
|---|---|---|
| `ProblemBrief` | `id`, `investigationId`, `createdAt`, `currentVersionId` | `id`/`investigation_id` at `INSERT problem_brief`; `created_at` DB default; `current_version_id` at the `UPDATE problem_brief` immediately after children are inserted |
| `BriefVersion` | `id`, `problemBriefId`, `versionNumber`, `createdAt`, `supersedesVersionId`, `generationRunId`, `problemStatementIds`, `claimVersionIds`, `demandSignalIds`, `demandConfidenceClassification`, `existingSolutionIds`, `gapHypothesisIds`, `negativeFindings` (read-time join, finding 2 — not a stored field), `uncertaintyStatement`, `recommendation`, `personalPullNoteIds` | All set at `INSERT brief_version` above except `negativeFindings` (never a column, see finding 2) and `createdAt` (DB default) |
| `ProblemStatement` | `id`, `briefVersionId`, `whoExperiencesIt`, `contextOrWorkflow`, `consequenceOrFriction`, `supportingClaimVersionIds` | All set at `INSERT problem_statement` |
| `DemandSignal` | `id`, `briefVersionId`, `type`, `otherTypeLabel` (conditional), `evidenceItemIds` | All set at `INSERT demand_signal` |
| `DemandConfidenceClassification` | `briefVersionId`, `level`, `narrative`, `citedDemandSignalIds`, `negativeFindingRef` (conditional) | **BLOCKING 4 fix — both previously omitted:** `briefVersionId` and `negativeFindingRef` now set explicitly in the JSONB construction above |
| `PersonalPullNote` | `id`, `briefVersionId`, `sourceArtifactId`, `text`, `label` | All set at `INSERT personal_pull_note` |
| `ExistingSolution` | `id`, `briefVersionId`, `name`, `whatItAddresses`, `howPeopleCopeNow`, `whereItsInadequate`, `evidenceItemIds` | All set at `INSERT existing_solution` |
| `GapHypothesis` | `id`, `briefVersionId`, `category`, `otherCategoryLabel` (conditional), `statement`, `evidenceItemIds` | All set at `INSERT gap_hypothesis` |
| `NegativeFinding` | `id`, `briefVersionId`, `element`, `statement` | All set at `INSERT negative_finding` |
| `UncertaintyStatement` | `briefVersionId`, `whatsUnknown`, `whatWouldChangeConclusion`, `whatsUndeterminable` | **BLOCKING 4 fix — previously omitted:** `briefVersionId` now set explicitly in the JSONB construction above |
| `Recommendation` | `briefVersionId`, `decision`, `rationale` | **BLOCKING 4 fix — previously omitted:** `briefVersionId` now set explicitly in the JSONB construction above |
| `GenerationRun` | `id`, `investigationId`, `briefVersionId`, `outcome`, `startedAt`, `completedAt`, `runtimeIdentifier`, `modelIdentifiers`, `toolsInvoked`, `stepLog` | `id`/`investigationId`/`startedAt`/`runtimeIdentifier` at phase 1's `createGenerationRun`; `briefVersionId`/`outcome`/`completedAt`/`modelIdentifiers`/`toolsInvoked` at `finalizeGenerationRun` (this slice does not construct this object directly — `provenanceRecorder.ts` owns its shape; listed here only to confirm the sweep covered it) |
| `Investigation` (mutable fields this slice writes) | `status`, `statusReason`, `problemBriefId` | All three via `transitionInvestigationStatus(..., { client, problemBriefId })` — `statusReason: null` on success (no reason needed for a success) |

No entity's required field was left unaccounted for by this sweep. `EvidenceItem`, `Claim`,
`ClaimVersion`, `ClaimVersionEvidence`, `WebSearchQuery`, `WebSearchResult` are Slice 4/6's own
persistence (unchanged, outside this slice's INSERT list) and were verified against their own
migrations (004/005) when those slices shipped — not re-verified here, since this slice does not
construct them.

**Finalization contract — EXACTLY-ONCE, stated precisely (BLOCKING 5, replaces revision 5's
`finally`-based description in full):**

- **Success:** `finalizeGenerationRun({ ..., client })` is called exactly once, as the LAST
  statement before `COMMIT`, inside phase 4's transaction, using the supplied `client` for every
  read (including its internal `loadStepLog`, which — per this revision's required
  `provenanceRecorder.ts` change, §1 module plan — must accept and use `options?.client ?? pool`
  the same way `transitionInvestigationStatus` already does) and every write.
- **Failure (any of: phase 2/3 hard stop, phase 4 conflict, phase 4 transition-returned-false,
  phase 4 other DB error):** `finalizeGenerationRun({ ..., briefVersionId: null })` — no `client`
  — is called exactly once, AFTER any transaction has been rolled back (or, for phase 2/3 hard
  stops, where no transaction was ever opened), BEFORE the corresponding error is thrown/rethrown.
- **There is NO unconditional `finally` block anywhere in `generateBriefVersion.ts` that finalizes
  regardless of whether a path already did.** Revision 5's "outer `try/finally`" description (for
  the "uncaught exception" taxonomy row) is corrected: that row's handling is now "the catch
  clause for an unexpected/uncaught exception calls `finalizeGenerationRun({ outcome: 'failed',
  ... })` itself, exactly once, then rethrows" — a `catch`, not a `finally` — so it composes with
  every other path above without any risk of a second call. Architecture §1.9's requirement that
  finalization happen "from a `finally` block" is being corrected by Danny directly (§1.9,
  not edited in this document) to match this EXACTLY-ONCE contract; this design is written against
  that corrected contract and treats it as a stated, explicit dependency, not a silent
  reinterpretation — `generateBriefVersion.ts` cannot be implemented to both this document's
  exactly-once contract AND a literal, unconditional `finally` simultaneously, and Danny's
  §1.9 correction is what resolves that conflict, not a workaround in this document.

**Writes intentionally outside the transaction, and why (constraint 5 — structural, not
conventional, unchanged from prior revisions):** every phase-2 write
(`Claim`/`ClaimVersion`/`EvidenceItem`/`ClaimVersionEvidence` from Slice 4;
`WebSearchQuery`/`WebSearchResult`/landscape `SourceArtifact`/`EvidenceItem` from Slice 6) is
committed by its own owning component before phase 3/4 ever runs, and is structurally unreachable
from Slice 9's transaction. The FAILURE-path `finalizeGenerationRun` calls are likewise outside any
transaction, because there is no Brief-content transaction for them to be atomic with on a
failure. The SUCCESS-path `finalizeGenerationRun` call is the one thing revision 5 moved INSIDE
the transaction (finding 7) — unchanged this revision, now made exactly-once-correct (BLOCKING 5)
rather than merely atomic.

---

## 4. Transaction Boundaries (summary)

| Boundary | Scope | Held across LLM/network calls? |
|---|---|---|
| Phase 1 | `INSERT generation_run` (single statement, autocommit) | No |
| Phase 2, step 0 (preflight, NEW this revision — BLOCKING 2) | Read-only `SELECT`s against `problem_brief`/`brief_version`, no lock, no writes — snapshots `preflightCurrentVersionId` | No |
| Phase 2, steps 1–7 (Slice 4/6 sub-txns) | Unchanged from prior revisions — owned by `extractClaimsAndEvidence.ts`/`researchLandscape`/`searchWeb` | No |
| Phase 2 (Slices 5, 7's candidate generation) | No persistence (candidate-only, in-memory) | N/A |
| Phase 3 | Read-only `SELECT`s, full ownership-scoped (revision 6, BLOCKING 3) — no transaction, no writes | No |
| Phase 4, SUCCESS path | `investigation` row lock (finding 3), `problem_brief` create-or-locate, snapshot-vs-lock comparison (BLOCKING 2), `brief_version` (inserted FIRST, finding 1, with every required field swept per BLOCKING 4), Brief-scoped children (inserted after, referencing pre-generated ids), `negative_finding`, `problem_brief.current_version_id`, `investigation.status` AND `investigation.problem_brief_id` (finding 4, both via the extended `transitionInvestigationStatus`, return value checked — BLOCKING 1), `generation_run` finalization (finding 7, INSIDE this transaction, using `client` for every read/write including `loadStepLog` — BLOCKING 5) | **No** |
| Phase 4, CONFLICT/FAILURE path (stale race, transition-returned-false, or other DB error) | Rolled back entirely; `finalizeGenerationRun` (no client) runs exactly once, immediately after rollback, before the corresponding error is thrown — never a separate, later, unconditional finalization (BLOCKING 5). `transitionInvestigationStatus` is called ONLY for the plain-failure case (initial generation only, finding 8) — conflict paths (stale race) never call it, on either initial or correction shape (standing ruling) | No |

---

## 5. Error Taxonomy

**Reworked structurally per finding 8: every row distinguishes an INITIAL generation
(`supersedesVersionId` absent) from a CORRECTION (`supersedesVersionId` present). Reworked again
this revision (BLOCKING 1, 2) for the retry-from-`'generation-failed'` transition and the
snapshot-vs-lock classification. Rows are labeled `I-n` (initial) / `C-n` (correction) where the
two diverge, and unified where they don't.**

| # | Trigger | Detected in | `GenerationRun.outcome` | `Investigation.status` — INITIAL generation | `Investigation.status` — CORRECTION | Persisted? |
|---|---|---|---|---|---|---|
| 1 (precondition) | No reachable sources | Before phase 1 | Run never created | `'blocked'` (set by Slice 3, unchanged) | N/A — a correction is never attempted against a `'blocked'` Investigation (it has no current Brief to correct) | Nothing |
| CALLER-A (revision 6: EXCLUSIVELY a preflight error now — moved out of phase 4 entirely, BLOCKING 2) | `InvalidSupersedeTargetError` — `supersedesVersionId` belongs to a different `ProblemBrief`, OR no `ProblemBrief` exists yet while `supersedesVersionId` is given, OR `supersedesVersionId` is absent while a `ProblemBrief` ALREADY existed AT PREFLIGHT TIME | §3 Phase 2, step 0 — BEFORE any LLM call, zero LLM spend | `'failed'`, `briefVersionId: null` | N/A — caller-contract error, not a race; reachable on either an initial-shaped or correction-shaped call | **UNCHANGED** — the caller's request was wrong, but if a healthy current Brief exists it is not disturbed | `GenerationRun` created (phase 1) then immediately finalized `'failed'` (independently, no client) — `stepLog` is EMPTY (no pipeline step ever ran); no `BriefVersion` |
| I-1 / C-1 | Extraction fails: `generationFailed: true` OR zero `ProblemStatementCandidate`s (class 1) | Phase 2, step 1 | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **`'brief-generated'` — UNCHANGED (finding 8).** `transitionInvestigationStatus` is not even called on this path | `GenerationRun` + partial `stepLog` (step 1 only); no `BriefVersion` |
| I-2 / C-2 | Demand Analyzer, Landscape Researcher, or Gap Hypothesis Generator's OWN `generationFailed: true` (class 2 — hard stop, revision 5) | Phase 2, step 2, 4, or 5 (whichever fails first) | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **`'brief-generated'` — UNCHANGED** | `GenerationRun` + `stepLog` through the failing step ONLY — Uncertainty Compiler and Recommendation Engine never run; no `BriefVersion` |
| I-3 / C-3 | Uncertainty Compiler's OR Recommendation Engine's OWN `generationFailed: true` (class 3) | Phase 2, step 6 or 7 | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **`'brief-generated'` — UNCHANGED** | `GenerationRun` + `stepLog` through the failing step; no `BriefVersion` |
| I-4 / C-4 | Evidence-chain / ownership verification failure — zero-foreign, this-run-provenance, ALL Brief-scoped citations (revision 6, BLOCKING 3) | Phase 3, check 1 | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **`'brief-generated'` — UNCHANGED** | `GenerationRun` + full `stepLog`; no `BriefVersion` |
| I-5 / C-5 | Four-element `negativeFindings` fail-closed rule violated — TERMINAL-FAIL DIRECTLY, no bounded-repair (revision 6 explicit correction) — reached only on an otherwise-clean pipeline run | Phase 3, check 2 | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **`'brief-generated'` — UNCHANGED** | `GenerationRun` + full `stepLog`; no `BriefVersion`, no `NegativeFinding` rows |
| **CONFLICT (revision 6, unified — widened `StaleCorrectionConflictError`, BLOCKING 2)** | The preflight-snapshotted target (§3 Phase 2 step 0 — either a specific `supersedesVersionId` or "no ProblemBrief exists yet") no longer matches what phase 4 observes under the `investigation` lock — a GENUINE race won by another concurrent call, whether that call was itself a correction OR a first-ever generation (revision 6 fixes the mislabeled first-generation-loser case, formerly `InvalidSupersedeTargetError`) | Phase 4, immediately after the lock-protected re-read, before any INSERT | `'failed'`, `briefVersionId: null`, **and the conflict reason recorded** as a `GenerationStep.error` entry (component `'Brief Assembler'`) | N/A — only reachable via a call whose target was valid at preflight time | **All four fields from the revision-3 ruling remain UNCHANGED: `Investigation.status`, `Investigation.statusReason`, `Investigation.problemBriefId`, `ProblemBrief.currentVersionId`.** No new `InvestigationStatus` value. Conflict paths BYPASS the generic failure transition entirely — `transitionInvestigationStatus` is never called on this path, initial-shaped or correction-shaped alike | Transaction rolled back in full. `GenerationRun` finalized `'failed'` exactly once, immediately after rollback (BLOCKING 5). Caller receives `StaleCorrectionConflictError` with `actualCurrentVersionId` to regenerate against |
| **TRANSITION-FALSE (revision 6, NEW — BLOCKING 1)** | `transitionInvestigationStatus`'s guarded `UPDATE investigation` returns `false` inside phase 4's success path (zero rows affected — status was not an allowed prior state at update time, despite the investigation-row lock) | Phase 4, after all INSERTs, before `COMMIT` | `'failed'`, `briefVersionId: null` | `'generation-failed'` (via `BriefGenerationFailedError`, not a second `transitionInvestigationStatus` call — the one call already made returned `false`, it is not retried) | Same handling — this row does not distinguish initial vs. correction differently, since it represents an unexpected structural state, not a modeled concurrency case | Transaction rolled back in full — no `BriefVersion`, no child rows, `problem_brief.current_version_id` untouched. `GenerationRun` finalized `'failed'` exactly once, immediately after rollback |
| — | Any other phase-4 transaction failure (DB error, connection loss) after the lock was acquired | Phase 4 | `'failed'`, `briefVersionId: null` | `'generation-failed'` | **UNCHANGED** | `GenerationRun` + full `stepLog`; transaction rolled back — atomicity guarantees no partial rows |
| — (RESOLVED, finding 7) | ~~`finalizeGenerationRun` throws after phase 4 committed~~ | — | — | — | — | **No longer possible on the success path** — finalization happens inside the same transaction as the Brief content, exactly once (finding 7, BLOCKING 5). Former OQ-3 is resolved, not deferred — see §9 |
| — | Uncaught exception anywhere in phase 2/3 not represented by a component's own `generationFailed` field | Any phase-2/3 step | `'failed'` — **revision 6 correction (BLOCKING 5): the `catch` clause itself calls `finalizeGenerationRun({ outcome: 'failed', briefVersionId: null })` exactly once, then rethrows. This is NOT an unconditional `finally` — see §3 Phase 4's "Finalization contract" subsection for why that distinction matters** | `'generation-failed'` | **UNCHANGED** | `GenerationRun` + `stepLog` through the failing step; no `BriefVersion` |

**Revision 5 resolution of the tension revision 4 surfaced (history, kept for the record):**
revision 4 observed that, under its four-class "continue" scheme, an upstream Demand/Landscape/Gap
`generationFailed: true` almost never actually rescued a run — it just relocated the eventual
failure to the four-element rule and spent extra LLM calls getting there, because
`negativeFindingSignal` is contractually populated only on `generationFailed: false`. Danny's
ruling (revision 5) resolved that observation by removing the "continue" step entirely. Unchanged
this revision.

**Concurrency tests to specify at Forge time (design only), FOUR required (revision 6 corrects one
of the three from revision 4/5 and states it precisely; no new count-increase, but the
first-generation test's expected error type changes):**

1. **No-branch test** (unchanged from revision 2/3) — two corrections racing from the same
   version: exactly one commits, the other receives `StaleCorrectionConflictError`, no branch.
2. **Loser-leaves-winner-intact test** (unchanged from revision 3) — same race; assert the loser's
   `GenerationRun` records the conflict and the Investigation still resolves to the winner's Brief
   in full.
3. **Destructive concurrent-first-generation test (revision 6 CORRECTS revision 4/5's version of
   this test — the expected error type was wrong).** Two `generateBriefVersion` calls, BOTH with
   `supersedesVersionId` absent, targeting the SAME `investigationId` with no `ProblemBrief` yet
   in existence, started concurrently. Both PASS their own preflight check (step 0) — neither sees
   a `ProblemBrief` yet, because neither has reached phase 4's lock yet. Assert: exactly one call
   commits a new `problem_brief` row (satisfying `UNIQUE(investigation_id)`, §7) and its
   `BriefVersion` 1; the OTHER call — blocked on the `investigation` row lock (finding 3) until
   the winner's transaction commits, then observing `currentVersionIdAtLock !==
   preflightCurrentVersionId (null)` under that same lock — receives
   `StaleCorrectionConflictError` with `expectedSupersedesVersionId: null` (**revision 6 fix — NOT
   `InvalidSupersedeTargetError`**, which was revision 4/5's mislabeling; this call's request was
   VALID when issued, it lost a genuine race, not a caller-contract defect), not a raw
   `UNIQUE(investigation_id)` constraint-violation exception surfacing uncaught, and not a
   silent/incorrect `'generation-failed'` transition on an Investigation whose first-ever
   generation actually just succeeded.
4. **Successful-retry-from-`'generation-failed'` test (NEW, revision 6, BLOCKING 1).** An
   Investigation at `Investigation.status === 'generation-failed'` (from a prior failed initial
   generation) receives a new `generateBriefVersion` call with `supersedesVersionId` absent
   (a retry-by-resubmission, per the UI contract). Assert: the call succeeds end-to-end — a
   `BriefVersion` is persisted, `ProblemBrief.currentVersionId` is set,
   `Investigation.status === 'brief-generated'`, `Investigation.problemBriefId` is set, and the
   `GenerationRun` finalizes `'succeeded'` — none of which was possible under revision 5's
   `ALLOWED_PRIOR_STATUSES` (which omitted `'generation-failed' -> 'brief-generated'`) or its
   unchecked `transitionInvestigationStatus` return value (§6, §3 Phase 4).

---

## 6. Status-Transition Rules

`transitionInvestigationStatus` (existing, Slice 3) is extended this revision (supersedes
revision 5's three-way extension — BLOCKING 1 corrects the `ALLOWED_PRIOR_STATUSES` gap that
prevented a successful retry from completing):

```typescript
const ALLOWED_PRIOR_STATUSES: Record<'blocked' | 'open' | 'generation-failed' | 'brief-generated', InvestigationStatus[]> = {
  blocked: ['open'],
  open: ['blocked'],
  'generation-failed': ['open', 'generation-failed'],
  'brief-generated': ['open', 'generation-failed', 'brief-generated'],
    // REVISION 6 FIX (BLOCKING 1): 'generation-failed' -> 'brief-generated' is now explicitly
    // ALLOWED. Revision 5's reasoning for omitting it — "a correction only makes sense when a
    // ProblemBrief already exists, which means the Investigation is already 'brief-generated'" —
    // was correct for CORRECTIONS but wrong as a justification for omitting this transition
    // entirely: an INITIAL generation (supersedesVersionId absent) retried after a PRIOR failed
    // initial generation is exactly the case the UI's retry-by-resubmission contract requires,
    // and that retry's target toStatus is 'brief-generated' FROM 'generation-failed' — the exact
    // pair revision 5 omitted. Without this entry, a successful retry's guarded UPDATE would
    // silently affect zero rows (see the BLOCKING-1 return-value check below), leaving a
    // committed BriefVersion against a stuck 'generation-failed' Investigation — the defect
    // Danny's ruling named directly.
};

export async function transitionInvestigationStatus(
  investigationId: string,
  toStatus: 'blocked' | 'open' | 'generation-failed' | 'brief-generated',
  statusReason: string | null,
  options?: { client?: PoolClient; problemBriefId?: string },
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

**BLOCKING 1, the "never ignore the return value" half:** every call site of this function in
`generateBriefVersion.ts` now checks the boolean it returns, explicitly, rather than treating the
call as fire-and-forget:

- **Phase 4's success path** (§3 Phase 4): `transitioned = transitionInvestigationStatus(...)`;
  `IF NOT transitioned`, the ENTIRE transaction is rolled back (no `BriefVersion`, no child rows,
  `problem_brief.current_version_id` untouched) and the run is finalized `'failed'` — this is a
  new taxonomy row (§5, "TRANSITION-FALSE"). A committed `BriefVersion` against an
  un-transitioned Investigation, the exact defect BLOCKING 1 named, is now structurally
  impossible: the `UPDATE investigation` and every Brief-content `INSERT` either all commit
  together or none do.
- **Phase 4's failure/conflict paths and every phase-2/3 hard-stop path** (§3 Phase 4, §5): these
  call `transitionInvestigationStatus(investigationId, 'generation-failed', reason, {})` for
  INITIAL generations only (correction failures never call it at all, finding 8). Its return value
  IS checked here too, per BLOCKING 1's "never ignore it anywhere" instruction — but the correct
  handling on `false` is different from the success path's: a `false` here means the Investigation
  was NOT in an allowed prior state for `'generation-failed'` (`'open'` or `'generation-failed'`
  itself) at update time — most plausibly because a CONCURRENT call already moved it to
  `'brief-generated'` (a genuine success elsewhere) or `'blocked'` while this run was failing. In
  that case, the correct behavior is to LEAVE the Investigation exactly as this concurrent
  observation found it (do not retry, do not force an overwrite) — the `false` return is checked
  and explicitly branched on (logged into the `GenerationRun`'s own failed-step record as
  informational context), but does not change this run's own outcome (`GenerationRun.outcome`
  remains `'failed'` — THIS run still did not produce a Brief) and does not throw a SECOND,
  different error class — the run's own `BriefGenerationFailedError` (or whichever error already
  applies to that failure path) is still what's thrown; the unchecked-transition defect this
  revision closes is "silently ignoring the boolean," not "must always escalate to a new error
  type when it's false."

`generateBriefVersion` calls this function exclusively for every `Investigation.status`/
`problem_brief_id` write — never a second, ad hoc `UPDATE investigation ...` elsewhere.

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

-- Revision 6 ("ALSO FIX BEFORE APPROVAL" item 1): deferred FK from generation_run.brief_version_id
-- (006's migration, a bare UUID column with no FK — brief_version didn't exist yet when 006 ran)
-- to brief_version.id, now that brief_version exists as of this migration. A PLAIN (validated, not
-- NOT VALID) FK is correct here, unlike 006's own NOT VALID precedent for
-- web_search_query.generation_run_id -> generation_run.id: every EXISTING generation_run row's
-- brief_version_id is NULL by construction (Slice 9 is the only writer that ever sets this column
-- to a non-NULL value, and Slice 9 does not exist until this migration ships) — NULL always
-- satisfies a FK check, so validating pre-existing rows is free/trivial here, not the
-- availability-risking table scan 006 was avoiding for a column that COULD already carry
-- non-NULL orphaned values in some environment.
ALTER TABLE generation_run
  ADD CONSTRAINT generation_run_brief_version_id_fkey
  FOREIGN KEY (brief_version_id) REFERENCES brief_version(id);

-- Revision 6 recommendation ("ALSO FIX BEFORE APPROVAL" item 1, second half): UNIQUE
-- (brief_version.generation_run_id) — RECOMMENDED, added below. Reasoning: §3 Phase 4's design
-- already guarantees "one BriefVersion per GenerationRun" behaviorally (a given generationRunId
-- is used to construct exactly one brief_version row, once, inside one phase-4 transaction,
-- during one generateBriefVersion call) — this constraint does not change any legitimate write
-- path. What it buys is a DB-level backstop against a future Forge-introduced bug that reuses a
-- generationRunId across two separate phase-4 calls (e.g. a retry that fails to mint a fresh
-- GenerationRun first) — without this constraint such a bug would silently succeed at the SQL
-- layer and produce two BriefVersion rows both claiming the same GenerationRun as their
-- provenance, undermining GenerationRun's own "one record per Brief-generating run" identity
-- (Architecture §3). The cost is negligible (one more index, checked only on brief_version
-- insert, which already happens at most once per generateBriefVersion call). Recommended: ADD.
ALTER TABLE brief_version
  ADD CONSTRAINT brief_version_generation_run_id_unique UNIQUE (generation_run_id);
```

**Numbering:** `007_` — unchanged, next after `006_generation_run_provenance.sql`.

**Citation for every constraint above:** each CHECK/trigger/FK cites the architecture-doc passage
or this revision's finding number that requires it inline. No unsourced constant; no PROVISIONAL
markers needed — this migration introduces no numeric threshold.

---

## 8. Supersede/Versioning Mechanics (US-10 AC2) — Linear Chain

Unchanged in substance from revision 2/3 (OQ-2 ruling, confirmed, not revisited) — restated here
only where findings 1/3/4/9 (revisions 4/5) and this revision's BLOCKING 1/2 corrections to phase
4's mechanics change HOW the rules are executed, not the rules themselves:

1. **Version 1:** `supersedesVersionId` MUST be absent. **Revision 6 correction (BLOCKING 2):**
   enforced at PREFLIGHT (§3 Phase 2 step 0), not phase 4 — if a `problem_brief` row already
   exists at preflight time and the caller omitted `supersedesVersionId`,
   `InvalidSupersedeTargetError` (caller-contract class). If NO `problem_brief` row exists at
   preflight time but one appears by phase-4 lock time (another first-generation call won), that
   is now correctly classified as `StaleCorrectionConflictError` with
   `expectedSupersedesVersionId: null` — a genuine race, not a caller-contract defect (the
   revision-4/5 mislabeling BLOCKING 2 corrects).
2. **Every later version supersedes the then-current version.** **Revision 6 correction
   (BLOCKING 2):** ownership (does `supersedesVersionId` belong to THIS `ProblemBrief`?) is
   checked once, at PREFLIGHT — a wrong-Brief target is always `InvalidSupersedeTargetError`,
   independent of timing. Whether the target is STILL current is checked TWICE and compared: once
   implicitly at preflight (the read that established `preflightCurrentVersionId`), and once under
   the `investigation` row lock at phase 4 (§3 Phase 4) — the comparison between those two
   observations, not either single read alone, is what determines `StaleCorrectionConflictError`.
   This is the fix for BLOCKING 2's core defect: a single read at phase 4 could not distinguish
   "was already stale when the caller issued the request" (which would actually have been caught
   at preflight, before the pipeline ran) from "was current when the caller issued the request but
   changed during the run" (a genuine race) — now it doesn't have to, because it never relies on
   a single read to begin with.
3. `versionNumber = supersedesRow.version_number + 1` for a correction; `1` for the first version.
   `supersedesRow` itself is read once, at preflight (§3 Phase 2 step 0) — phase 4 does not
   re-read `brief_version` beyond the `problem_brief.current_version_id` comparison described
   above.
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

**OQ-6 — SETTLED AND MERGED (revision 6 update; settled in revision 5, merged as of this revision).** The Slice 8
`runStepWithProvenance` correction has landed and is merged (commit `ce5be58`, pushed): a REQUIRED
`getOutputRefs: (result: T) => string[]` field on `runStepWithProvenance`'s input, outcome
classified as `'failed'` iff the result carries `generationFailed === true` OR any
`validationRecord` has `finalOutcome: 'invalid'`, and the previously-speculated internal
`deriveOutputRefs` whitelist removed from scope entirely. §3's provenance-mapping subsection now
specifies the exact `getOutputRefs` this design passes for each of the seven wrapped components
(non-empty only for step 1, Extraction, and step 4, Landscape Researcher — both already persist
real ids at call time; `() => []` for the five candidate-only steps, stated plainly rather than
implying richer provenance than exists). `generateBriefVersion.ts` can now be implemented directly against this signature — the Slice 8
correction landed and is merged (commit `ce5be58`, pushed), so this is no longer a pending
cross-slice dependency blocking Forge; it is a settled, available API.

**The class-2 "continue" tension revision 4 surfaced no longer applies — see the "Revision 5
resolution" note at the end of §5's error taxonomy.** Revision 5 removed the "continue" behavior
entirely (Demand/Landscape/Gap failure is now a hard stop, §3 Phase 2 class 2), so there is no
remaining tension between provenance completeness and LLM spend to track as an open question:
Danny's ruling resolved it by stopping earlier, not by continuing further.

**BLOCKING 1–4 (revision 6) are RESOLVED by this revision** — §6/§3 Phase 4 (BLOCKING 1, retry
transition + checked return value), §2/§3 Phase 2 step 0/§3 Phase 4/§5/§8 (BLOCKING 2, preflight
snapshot + change-based classification), §3 Phase 3 check 1 (BLOCKING 3, zero-foreign + this-run
provenance, generalized to every Brief-scoped entity), §3 Phase 4's field-by-field sweep table
(BLOCKING 4). None of these introduces a new open question — each was a concrete defect with a
concrete fix, not a design choice requiring Danny's further input.

**BLOCKING 5 (revision 6) is RESOLVED design-side, but carries an explicit, named EXTERNAL
dependency, exactly as OQ-6 did before it merged — new open item, NOT closable by this document
alone:** `generateBriefVersion.ts`'s exactly-once finalization contract (§3 Phase 4's
"Finalization contract" subsection) requires `02-ARCHITECTURE.md` §1.9 to be corrected FROM its
current wording (finalization "from a `finally` block," which — implemented literally alongside
this design's success-path in-transaction finalization — produces the double-finalization
`finalizeGenerationRun`'s own idempotency assertion is designed to catch and reject) TO match this
document's exactly-once contract (success inside the transaction; failure via an explicit `catch`,
not a blanket `finally`). **Danny has stated he is making this §1.9 correction himself** — this
document is written against that corrected contract and states the dependency here explicitly, the
same discipline OQ-6 already established for the Slice 8 provenance correction. `generateBriefVersion.ts`
should not be implemented against the CURRENT (uncorrected) §1.9 wording — doing so would
reproduce the exact double-finalization defect BLOCKING 5 identified.

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
- Caller-contract errors distinguished from genuine concurrent races, classified from a
  CHANGE between two observations rather than a single read (finding 9, revision 6 BLOCKING 2
  correction): §2, §3 Phase 2 step 0, §3 Phase 4, §5 CALLER-A/CONFLICT.
- Successful retry from `'generation-failed'` completes correctly, with the status-transition
  return value checked everywhere it is called (revision 6 BLOCKING 1): §6, §3 Phase 4, §5
  TRANSITION-FALSE row.
- Ownership verification requires zero foreign citations (not merely one local) and confines
  every Brief-scoped entity's evidence to THIS run's own extraction/research output (revision 6
  BLOCKING 3): §3 phase 3 check 1.
- Every persisted entity's architecture-required fields set, swept in full rather than spot-fixed
  — including `DemandConfidenceClassification.briefVersionId`/`negativeFindingRef`,
  `UncertaintyStatement.briefVersionId`, `Recommendation.briefVersionId` (revision 6 BLOCKING 4):
  §3 phase 4's field-sweep table.
- `GenerationRun` finalized exactly once per run, success inside the transaction, failure after
  rollback, no unconditional `finally` — an explicit, named dependency on Danny's own
  `02-ARCHITECTURE.md` §1.9 correction (revision 6 BLOCKING 5): §3 phase 4's "Finalization
  contract" subsection, §9.
- `generation_run.brief_version_id` FK added; `brief_version.generation_run_id` UNIQUE added with
  stated reasoning (revision 6, "ALSO FIX BEFORE APPROVAL"): §7.
- Negative-finding cross-component invariant terminal-fails directly, not routed through R-4's
  bounded-repair contract (revision 6, "ALSO FIX BEFORE APPROVAL," Danny's ruling superseding an
  earlier framing): §3 phase 3 check 2.
- No surviving "still in progress"/"not yet merged" claim about the Slice 8 provenance correction
  — it is merged, commit `ce5be58` (revision 6 sweep): §3, §9.
