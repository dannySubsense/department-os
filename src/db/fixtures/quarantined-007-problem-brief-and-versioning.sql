-- Department OS Core — Problem Department MVP
-- Slice 9: Brief Assembler — ProblemBrief / BriefVersion / ProblemStatement / NegativeFinding
-- persistence (Architecture §3 "Problem Brief identity & versioning" / "Evidence & Claims" /
-- "Negative findings"), plus the Brief-scoped persisted counterparts of Slice 5/6's candidate
-- shapes (DemandSignal, ExistingSolution, GapHypothesis, PersonalPullNote).
--
-- Immutability enforcement (Anti-Patterns table, "No in-place Brief mutation" / "No in-place
-- mutation of a published BriefVersion enforced at the persistence layer, not just by
-- convention"): brief_version, problem_statement, negative_finding, demand_signal,
-- existing_solution, gap_hypothesis, and personal_pull_note are all BEFORE UPDATE OR DELETE
-- trigger-guarded with the existing reject_update_or_delete() function (004's migration).
-- problem_brief carries ONE permitted mutation (current_version_id) — see its own trigger below,
-- which is narrower than reject_update_or_delete(): it rejects any UPDATE that touches
-- investigation_id or created_at, but allows current_version_id to change.
--
-- Linear-chain enforcement (Danny, binding ruling on Slice 9 OQ-2): the DB schema alone cannot
-- enforce "supersedesVersionId must equal ProblemBrief.currentVersionId at commit time" (that is
-- inherently a check against a value read earlier in the same transaction, under a row lock —
-- see generateBriefVersion.ts's phase 4, not a static CHECK constraint). This migration enforces
-- the two invariants that ARE expressible statically: (a) version_number is unique per
-- problem_brief_id (UNIQUE below) so two concurrent commits can never both claim the same
-- version_number, and (b) supersedes_version_id, when present, must reference a real prior
-- brief_version row (FK below) — the same-ProblemBrief-ownership check and the
-- equals-current-version-at-lock-time check are both application-layer, enforced in
-- generateBriefVersion.ts's phase 4 under the problem_brief row lock.
--
-- Insert-ordering fix (Forge-time correction, not in the design doc's narrative but required by
-- it): SLICE-09-DESIGN.md §3 phase 4 describes inserting problem_statement/demand_signal/
-- personal_pull_note/existing_solution/gap_hypothesis/negative_finding rows BEFORE the single
-- brief_version row (so that row's *_ids TEXT[] columns can be populated with the real child ids
-- in one INSERT), yet every child table has a NOT NULL brief_version_id FK. That insert order is
-- only possible if those FKs are DEFERRABLE INITIALLY DEFERRED — exactly the same same-transaction
-- insert-ordering cycle 005_web_search_query_results.sql already solved for
-- web_search_query <-> query_limitation, applied here for the same reason: the app pre-generates
-- brief_version's id client-side (randomUUID()), inserts every child row against that
-- not-yet-existent id, then inserts the brief_version row itself with that same id — the deferred
-- FK is only checked at COMMIT, by which point brief_version exists. brief_version itself is
-- immutable (see trigger below), so there is no later UPDATE available to backfill these FKs —
-- this is the only ordering that works within a single, short, immutable-row transaction.

CREATE TABLE IF NOT EXISTS problem_brief (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id    UUID NOT NULL UNIQUE REFERENCES investigation(id),
    -- UNIQUE: Decision 1.2 (one Investigation -> exactly one ProblemBrief identity for this MVP)
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
                                                                        -- (OQ-2 ruling) — app-layer
                                                                        -- enforces "absent iff
                                                                        -- version_number = 1"
  generation_run_id                UUID NOT NULL REFERENCES generation_run(id),
  -- The seven required elements: id-array fields as TEXT[] (exact ClaimVersion/DemandSignal/
  -- ExistingSolution/GapHypothesis/ProblemStatement ids — never copied text, Q-4), and the
  -- three always-populated single-row-per-version elements as JSONB (no separate table needed
  -- for these — they are 1:1 with brief_version and have no independent identity of their own).
  problem_statement_ids           TEXT[] NOT NULL DEFAULT '{}',
  claim_version_ids               TEXT[] NOT NULL DEFAULT '{}',
  demand_signal_ids               TEXT[] NOT NULL DEFAULT '{}',
  demand_confidence_classification JSONB NOT NULL,
  existing_solution_ids           TEXT[] NOT NULL DEFAULT '{}',
  gap_hypothesis_ids              TEXT[] NOT NULL DEFAULT '{}',
  uncertainty_statement           JSONB NOT NULL,
  recommendation                  JSONB NOT NULL,
  personal_pull_note_ids          TEXT[] NOT NULL DEFAULT '{}',
  -- No `status` column (Q-3, binding) — assigned validity is read from status_event (Slice 12) at
  -- query time. Do not add one; see Anti-Patterns table.
  UNIQUE (problem_brief_id, version_number)
    -- Also the concurrency backstop for OQ-2's linear-chain rule: even if the application-layer
    -- row-lock check were ever bypassed by a bug, two concurrent inserts computing the same
    -- version_number for the same problem_brief_id cannot both commit.
);

ALTER TABLE problem_brief
  ADD CONSTRAINT problem_brief_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES brief_version(id);

-- Problem Statement is non-negatable (Q-2): every brief_version this migration's persistence
-- layer ever writes must own at least one problem_statement row. NOT a DB-level CHECK (a CHECK
-- cannot count sibling rows in another table) — enforced by generateBriefVersion.ts's phase-3
-- validation before the INSERT ever runs (see §3/§5). This comment documents that the DB layer
-- deliberately does NOT attempt to re-enforce this invariant, so a future reader does not go
-- looking for a constraint that cannot exist here.
CREATE TABLE IF NOT EXISTS problem_statement (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id            UUID NOT NULL REFERENCES brief_version(id) DEFERRABLE INITIALLY DEFERRED,
  who_experiences_it          TEXT NOT NULL,
  context_or_workflow         TEXT NOT NULL,
  consequence_or_friction     TEXT NOT NULL,
  supporting_claim_version_ids TEXT[] NOT NULL,
  CONSTRAINT problem_statement_supporting_claims_non_empty
    CHECK (array_length(supporting_claim_version_ids, 1) IS NOT NULL
           AND array_length(supporting_claim_version_ids, 1) >= 1)
    -- NonEmptyArray<string> enforced at the DB level (Section 3's citation-non-empty contract) —
    -- matches the "runtime validation before persistence" note on NonEmptyArray<T> in domain.ts.
    -- NOTE: this guarantees the array is non-empty, not that each id resolves to a claim_version
    -- row with non-empty evidence — THAT is the evidence-chain verification (OQ-1 ruling, §3
    -- phase 3 check 1), which is necessarily an application-layer, pre-INSERT check (a CHECK
    -- constraint on this table cannot join out to claim_version_evidence).
);

-- BriefElement (Architecture §3, closed 4-member union — 'problem-statement' deliberately
-- excluded, Q-2/PR-review binding correction). 'evidence' remains a valid member (OQ-1 ruling —
-- do not remove it from the schema/enum) even though this implementation never constructs a row
-- with element = 'evidence' (see §3 phase 3 check 1's "structurally unreachable" note). Enforced
-- at the DB level via CHECK, matching evidence_item.label's precedent (004).
CREATE TABLE IF NOT EXISTS negative_finding (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id UUID NOT NULL REFERENCES brief_version(id) DEFERRABLE INITIALLY DEFERRED,
  element         TEXT NOT NULL CHECK (element IN
                     ('evidence', 'demand-signal-type', 'existing-solution', 'gap-hypothesis')),
  statement       TEXT NOT NULL CHECK (length(trim(statement)) > 0),
  UNIQUE (brief_version_id, element)
    -- at most one NegativeFinding per element per BriefVersion — matches the fail-closed rule's
    -- "not both populated and negative-findinged" exclusivity (§3 phase 3)
);

-- ---- Brief-scoped persisted counterparts of Slice 5/6's candidate shapes ----
-- These did not exist before Slice 9 (Slices 5-7 returned candidates only, per the roadmap's
-- "Slice 4/5-7: ProblemStatement/candidate persistence timing" correction). Slice 9 is the sole
-- persister.

CREATE TABLE IF NOT EXISTS demand_signal (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id    UUID NOT NULL REFERENCES brief_version(id) DEFERRABLE INITIALLY DEFERRED,
  type                TEXT NOT NULL CHECK (type IN
                         ('recurring-complaints', 'workarounds', 'existing-spend', 'paid-labor',
                          'switching-behavior', 'willingness-to-pay', 'rfps', 'feature-requests',
                          'other-observed-behavior')),
  other_type_label    TEXT,  -- required when type = 'other-observed-behavior' — app-layer check
                              -- (matches domain.ts's existing pattern of not DB-enforcing
                              -- conditional-required fields for the analogous GapHypothesis/
                              -- SourceArtifact 'other'-style fields elsewhere in this schema)
  evidence_item_ids   TEXT[] NOT NULL,
  CONSTRAINT demand_signal_evidence_non_empty
    CHECK (array_length(evidence_item_ids, 1) IS NOT NULL AND array_length(evidence_item_ids, 1) >= 1)
);

CREATE TABLE IF NOT EXISTS existing_solution (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id      UUID NOT NULL REFERENCES brief_version(id) DEFERRABLE INITIALLY DEFERRED,
  name                  TEXT NOT NULL,
  what_it_addresses     TEXT NOT NULL,
  how_people_cope_now   TEXT NOT NULL,
  where_its_inadequate  TEXT NOT NULL,
  evidence_item_ids     TEXT[] NOT NULL,
  CONSTRAINT existing_solution_evidence_non_empty
    CHECK (array_length(evidence_item_ids, 1) IS NOT NULL AND array_length(evidence_item_ids, 1) >= 1)
);

CREATE TABLE IF NOT EXISTS gap_hypothesis (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id     UUID NOT NULL REFERENCES brief_version(id) DEFERRABLE INITIALLY DEFERRED,
  category             TEXT NOT NULL CHECK (category IN
                          ('capability', 'usability', 'price', 'workflow-fit', 'trust',
                           'integration', 'accessibility', 'distribution', 'other')),
  other_category_label TEXT,  -- required when category = 'other' — app-layer check
  statement            TEXT NOT NULL,
  evidence_item_ids    TEXT[] NOT NULL,
  CONSTRAINT gap_hypothesis_evidence_non_empty
    CHECK (array_length(evidence_item_ids, 1) IS NOT NULL AND array_length(evidence_item_ids, 1) >= 1)
);

CREATE TABLE IF NOT EXISTS personal_pull_note (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id    UUID NOT NULL REFERENCES brief_version(id) DEFERRABLE INITIALLY DEFERRED,
  source_artifact_id  UUID NOT NULL REFERENCES source_artifact(id),
  text                TEXT NOT NULL,
  label               TEXT NOT NULL DEFAULT 'contextual-motivation'
                         CHECK (label = 'contextual-motivation')
    -- fixed literal, enforced at the DB level — cannot be relabeled into a demand field (US-12)
);

CREATE INDEX IF NOT EXISTS idx_brief_version_problem_brief_id ON brief_version (problem_brief_id);
CREATE INDEX IF NOT EXISTS idx_problem_statement_brief_version_id ON problem_statement (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_negative_finding_brief_version_id ON negative_finding (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_demand_signal_brief_version_id ON demand_signal (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_existing_solution_brief_version_id ON existing_solution (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_gap_hypothesis_brief_version_id ON gap_hypothesis (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_personal_pull_note_brief_version_id ON personal_pull_note (brief_version_id);

-- ---- Immutability triggers ----

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

-- problem_brief: narrower guard than reject_update_or_delete() — permits current_version_id to
-- change (PR-review binding correction, option (a) — the ONE derived-index field allowed to
-- mutate) but rejects any UPDATE touching investigation_id or created_at, and rejects DELETE
-- outright.
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
