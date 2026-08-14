-- Department OS Core — Problem Department MVP
-- Slice 8: Provenance Recorder — GenerationRun / GenerationStep persistence
-- (Architecture §3 "Provenance", refined per §1.9).
--
-- §1.9's "Out of scope for Slice 8" note explicitly leaves the exact table/column shape for the
-- refined per-attempt fields (SchemaValidationRecord/SchemaValidationAttempt/ToolInvocationRecord)
-- as a Forge implementation detail. This migration persists those nested, per-step shapes as a
-- single JSONB column on generation_step (`step_data`) rather than fully normalizing them into
-- their own tables — this avoids fixing a specific normalized schema the design step deliberately
-- deferred, while still persisting every field losslessly (never silently dropped, matching the
-- provably-not-dropped discipline already established for web_search_result in 005).
--
-- generation_run is NOT append-only: createGenerationRun inserts a row with
-- outcome = 'in-progress', and finalizeGenerationRun performs exactly one UPDATE to set
-- outcome/completed_at/brief_version_id/model_identifiers/tools_invoked (§1.9 point 4,
-- "idempotency: calling this twice ... is a programming-error-level defect" — enforced in Forge
-- code, not by a DB constraint, since a DB-level "exactly once" check would require reading current
-- state anyway). generation_step IS append-only (recordGenerationStep only ever inserts, in
-- execution order) — same reject_update_or_delete() trigger pattern as prior migrations.

CREATE TABLE IF NOT EXISTS generation_run (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id    UUID NOT NULL REFERENCES investigation(id),
  brief_version_id    UUID,
  outcome             TEXT NOT NULL CHECK (outcome IN ('in-progress', 'succeeded', 'failed')),
  started_at          TIMESTAMPTZ NOT NULL,
  completed_at        TIMESTAMPTZ,
  runtime_identifier  TEXT NOT NULL,
  model_identifiers   TEXT[] NOT NULL DEFAULT '{}',
  tools_invoked       TEXT[] NOT NULL DEFAULT '{}',
  CONSTRAINT generation_run_completed_at_matches_outcome CHECK (
    (outcome = 'in-progress' AND completed_at IS NULL) OR
    (outcome <> 'in-progress' AND completed_at IS NOT NULL)
  ),
  CONSTRAINT generation_run_brief_version_id_matches_outcome CHECK (
    (outcome = 'succeeded') OR (brief_version_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS generation_step (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_run_id   UUID NOT NULL REFERENCES generation_run(id),
  step_index          INTEGER NOT NULL, -- execution order within the run (recordGenerationStep
                                         -- append order — §1.9 "Ordering guarantee")
  component           TEXT NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL,
  completed_at        TIMESTAMPTZ NOT NULL,
  outcome             TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed')),
  error               TEXT,
  model_identifier    TEXT,
  input_refs          TEXT[] NOT NULL DEFAULT '{}',
  output_refs         TEXT[] NOT NULL DEFAULT '{}',
  -- validationRecords / toolInvocations (refined SchemaValidationRecord/SchemaValidationAttempt/
  -- ToolInvocationRecord shapes, §1.9 point 3) — persisted losslessly as JSONB; see header note.
  step_data           JSONB NOT NULL DEFAULT '{}',
  UNIQUE (generation_run_id, step_index),
  CONSTRAINT generation_step_error_matches_outcome CHECK (
    (outcome = 'failed') OR (error IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_generation_run_investigation_id
  ON generation_run (investigation_id);
CREATE INDEX IF NOT EXISTS idx_generation_step_generation_run_id
  ON generation_step (generation_run_id);

-- Append-only immutability for generation_step only (generation_run is intentionally mutated
-- exactly once by finalizeGenerationRun — see header note).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'generation_step_immutable' AND tgrelid = 'generation_step'::regclass
  ) THEN
    CREATE TRIGGER generation_step_immutable BEFORE UPDATE OR DELETE ON generation_step
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
END $$;

-- Deferred FK from 005_web_search_query_results.sql — generation_run now exists.
--
-- Backfill-safety (Slice 8 QC BLOCKER-1): web_search_query.generation_run_id has been a bare
-- NOT NULL UUID with no FK since Slice 6 (005's header note documents this as an intentional,
-- tracked deferral, not an oversight). Any web_search_query row inserted since Slice 6 in a given
-- environment may reference a generation_run_id with no corresponding generation_run row, because
-- nothing has ever enforced that reference. A plain `ADD CONSTRAINT ... FOREIGN KEY` here is an
-- immediate VALIDATE-on-add operation — it would fail outright the first time this migration runs
-- against an environment carrying any such orphaned row, which is a real, not hypothetical, risk
-- for this table (Slice 6 shipped without the FK specifically so writers could proceed before
-- Slice 8 existed).
--
-- Fix: add the constraint NOT VALID. This still enforces the FK for every INSERT/UPDATE from this
-- migration forward (Postgres does not skip validation for new writes with NOT VALID — only the
-- one-time backfill scan of pre-existing rows is skipped), so it is not "hope the failure never
-- happens" — it is the standard Postgres-documented pattern for adding a constraint to a table that
-- may carry legacy data without an availability-blocking table scan. Existing rows are NOT
-- retroactively checked by this migration.
--
-- Operational follow-up (tracked here, not silently left undone): before this constraint can be
-- relied on to guarantee no orphans exist historically, run
--   ALTER TABLE web_search_query VALIDATE CONSTRAINT web_search_query_generation_run_id_fkey;
-- as a separate, explicit operational step once any pre-Slice-8 orphaned rows have been identified
-- and resolved (this repository's local dev Postgres carries no production data requiring that
-- cleanup as of this migration's authoring, per Danny/QC's local-dev-Postgres context — but that
-- fact does not travel with this file to any other environment it may run against, hence NOT VALID
-- rather than assuming it as a given).
--
-- DEFERRABLE INITIALLY DEFERRED asymmetry (QC-noted): 005's mutual query_limitation <->
-- web_search_query FKs are DEFERRABLE INITIALLY DEFERRED because they resolve a same-transaction
-- insert-ordering cycle (each table's row must exist before the other's FK can point at it — see
-- 005's header note). No such cycle exists here: generation_run rows are always created before any
-- web_search_query row that references them (createGenerationRun runs before Slice 9's pipeline
-- steps, which is where web_search_query rows are written), so there is no ordering problem for
-- this FK to solve. NOT VALID (not DEFERRABLE) is the correct, narrower fix for this FK's actual
-- problem (legacy data, not insert ordering) — matching 005's pattern where it applies is not the
-- same as copying it where it doesn't.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'web_search_query_generation_run_id_fkey'
      AND conrelid = 'web_search_query'::regclass
  ) THEN
    ALTER TABLE web_search_query
      ADD CONSTRAINT web_search_query_generation_run_id_fkey
      FOREIGN KEY (generation_run_id) REFERENCES generation_run(id)
      NOT VALID;
  END IF;
END $$;
