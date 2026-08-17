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
