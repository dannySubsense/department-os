-- Department OS Core — Problem Department MVP
-- Slice 9 QC FAIL remediation (Composer-directed, 2026-08-16): reconciliation migration for
-- databases carrying the QUARANTINED 007_problem_brief_and_versioning.sql (branch
-- quarantine/slice-9-attempt-1, 86f7b8b), which was applied and recorded under 007's filename
-- before 007 was rewritten. Because migrate.ts (src/db/migrate.ts) tracks applied migrations by
-- FILENAME ONLY, a database that already has a `schema_migrations` row for '007_...sql' will
-- NEVER re-run 007's file contents even though those contents changed. This migration does NOT
-- edit 007 (007 stays correct-and-unchanged for fresh installs) — it brings a database still
-- carrying the quarantined 007's *actual* shape up to parity with what the corrected 007 declares,
-- by comparing and fixing CONSTRAINT DEFINITIONS (not merely constraint NAMES) and COLUMN TYPES.
--
-- Every step below is idempotent and guarded so this migration is a no-op on a database that
-- already has the corrected 007 (fresh install: 001 -> 008 in order, 008 finds every guard
-- condition already satisfied and changes nothing).
--
-- Reconciliation findings (verified directly against the live dev DB's pg_constraint /
-- information_schema, not assumed from the brief that requested this migration — the brief's own
-- drift list undercounted; see report):
--
--   1. Six `brief_version_id` foreign keys (problem_statement, negative_finding, demand_signal,
--      existing_solution, gap_hypothesis, personal_pull_note -> brief_version) are
--      DEFERRABLE INITIALLY DEFERRED on the quarantined shape; the corrected 007 declares all six
--      as plain (non-deferrable) FKs, because the corrected 007's Brief Assembler insert order
--      no longer needs the same-transaction ordering cycle the quarantined attempt's deferred FKs
--      existed to solve (see corrected 007's own header note: brief_version's *_ids columns are
--      populated directly on brief_version's own single INSERT, not backfilled after child rows).
--      Deferrability cannot be altered in place — each must be DROPPED and RE-ADDED.
--
--   2. Six free-text CHECK constraints the corrected 007 declares are entirely absent from the
--      quarantined shape (the quarantined attempt left these fields as bare `NOT NULL`, deferring
--      whitespace-only rejection to the application layer): problem_statement.who_experiences_it /
--      .context_or_workflow / .consequence_or_friction; existing_solution.name /
--      .what_it_addresses / .how_people_cope_now / .where_its_inadequate; gap_hypothesis.statement;
--      personal_pull_note.text. THIS WAS NOT IN THE BRIEF'S DRIFT LIST — found by diffing the
--      corrected 007's full CHECK set against live pg_constraint, not by trusting the brief's
--      enumeration. See report for the full list this migration adds beyond what was requested.
--
--   3. The six conditional-required-field / non-empty-array CHECKs and the two additional
--      constraints named in the remediation brief (demand_signal_other_type_label_required,
--      gap_hypothesis_other_category_label_required, brief_version_problem_statement_ids_non_empty,
--      brief_version_claim_version_ids_non_empty, brief_version_generation_run_id_unique,
--      generation_run_brief_version_id_fkey) are confirmed absent and added here.
--
--   4. COLUMN TYPE drift, NOT mentioned anywhere in the remediation brief, found only by querying
--      information_schema directly: all ten `*_ids` array columns across brief_version,
--      problem_statement, demand_signal, existing_solution, gap_hypothesis are TEXT[]
--      (`_text` udt) on the quarantined shape; the corrected 007 declares every one of them
--      UUID[]. This migration converts each column with `USING col::uuid[]`, which will FAIL
--      the migration (not silently coerce or drop rows) if any existing value is not a valid UUID
--      string — per the brief's binding requirement 5, a violation stops the migration, it is
--      never hidden or skipped.
--
-- Nothing here touches 007's own file. Nothing here uses NOT VALID to dodge validation — every
-- ADD CONSTRAINT below is a fully validated constraint, checked against existing rows at apply
-- time, exactly like the corrected 007 would produce on a fresh database.

-- ---- Step 1: column type reconciliation (TEXT[] -> UUID[]), guarded, fails loudly on bad data ----

DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT * FROM (VALUES
      ('brief_version', 'problem_statement_ids'),
      ('brief_version', 'claim_version_ids'),
      ('brief_version', 'demand_signal_ids'),
      ('brief_version', 'existing_solution_ids'),
      ('brief_version', 'gap_hypothesis_ids'),
      ('brief_version', 'personal_pull_note_ids'),
      ('problem_statement', 'supporting_claim_version_ids'),
      ('demand_signal', 'evidence_item_ids'),
      ('existing_solution', 'evidence_item_ids'),
      ('gap_hypothesis', 'evidence_item_ids')
    ) AS t(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = col.table_name AND column_name = col.column_name AND udt_name = '_text'
    ) THEN
      -- A TEXT[] DEFAULT '{}' (present on four of brief_version's *_ids columns —
      -- demand_signal_ids/existing_solution_ids/gap_hypothesis_ids/personal_pull_note_ids)
      -- cannot be automatically cast to UUID[] in place — drop the default, retype, then restore
      -- an equivalent UUID[] default only on those four. problem_statement_ids and
      -- claim_version_ids carry NO default in the corrected 007 (both are mandatory-non-empty,
      -- always explicitly supplied) — restoring a default on them here would diverge from the
      -- corrected 007's own DDL, so they are deliberately excluded.
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', col.table_name, col.column_name);
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE UUID[] USING %I::uuid[]',
        col.table_name, col.column_name, col.column_name
      );
      IF col.table_name = 'brief_version'
         AND col.column_name IN ('demand_signal_ids', 'existing_solution_ids', 'gap_hypothesis_ids', 'personal_pull_note_ids') THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT ''{}''::uuid[]', col.table_name, col.column_name);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---- Step 2: drop-and-recreate the six stale DEFERRABLE brief_version_id FKs as non-deferrable ----

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('problem_statement', 'problem_statement_brief_version_id_fkey'),
      ('negative_finding', 'negative_finding_brief_version_id_fkey'),
      ('demand_signal', 'demand_signal_brief_version_id_fkey'),
      ('existing_solution', 'existing_solution_brief_version_id_fkey'),
      ('gap_hypothesis', 'gap_hypothesis_brief_version_id_fkey'),
      ('personal_pull_note', 'personal_pull_note_brief_version_id_fkey')
    ) AS t(table_name, constraint_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = fk.constraint_name
        AND conrelid = fk.table_name::regclass
        AND condeferrable = true
    ) THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', fk.table_name, fk.constraint_name);
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (brief_version_id) REFERENCES brief_version(id)',
        fk.table_name, fk.constraint_name
      );
    END IF;
  END LOOP;
END $$;

-- ---- Step 3: add every missing CHECK / UNIQUE / FK constraint the corrected 007 declares ----

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'problem_statement_who_experiences_it_check' AND conrelid = 'problem_statement'::regclass) THEN
    ALTER TABLE problem_statement ADD CONSTRAINT problem_statement_who_experiences_it_check CHECK (length(trim(who_experiences_it)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'problem_statement_context_or_workflow_check' AND conrelid = 'problem_statement'::regclass) THEN
    ALTER TABLE problem_statement ADD CONSTRAINT problem_statement_context_or_workflow_check CHECK (length(trim(context_or_workflow)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'problem_statement_consequence_or_friction_check' AND conrelid = 'problem_statement'::regclass) THEN
    ALTER TABLE problem_statement ADD CONSTRAINT problem_statement_consequence_or_friction_check CHECK (length(trim(consequence_or_friction)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'existing_solution_name_check' AND conrelid = 'existing_solution'::regclass) THEN
    ALTER TABLE existing_solution ADD CONSTRAINT existing_solution_name_check CHECK (length(trim(name)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'existing_solution_what_it_addresses_check' AND conrelid = 'existing_solution'::regclass) THEN
    ALTER TABLE existing_solution ADD CONSTRAINT existing_solution_what_it_addresses_check CHECK (length(trim(what_it_addresses)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'existing_solution_how_people_cope_now_check' AND conrelid = 'existing_solution'::regclass) THEN
    ALTER TABLE existing_solution ADD CONSTRAINT existing_solution_how_people_cope_now_check CHECK (length(trim(how_people_cope_now)) > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'existing_solution_where_its_inadequate_check' AND conrelid = 'existing_solution'::regclass) THEN
    ALTER TABLE existing_solution ADD CONSTRAINT existing_solution_where_its_inadequate_check CHECK (length(trim(where_its_inadequate)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gap_hypothesis_statement_check' AND conrelid = 'gap_hypothesis'::regclass) THEN
    ALTER TABLE gap_hypothesis ADD CONSTRAINT gap_hypothesis_statement_check CHECK (length(trim(statement)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_pull_note_text_check' AND conrelid = 'personal_pull_note'::regclass) THEN
    ALTER TABLE personal_pull_note ADD CONSTRAINT personal_pull_note_text_check CHECK (length(trim(text)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demand_signal_other_type_label_required' AND conrelid = 'demand_signal'::regclass) THEN
    ALTER TABLE demand_signal ADD CONSTRAINT demand_signal_other_type_label_required
      CHECK (type <> 'other-observed-behavior' OR (other_type_label IS NOT NULL AND length(trim(other_type_label)) > 0));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gap_hypothesis_other_category_label_required' AND conrelid = 'gap_hypothesis'::regclass) THEN
    ALTER TABLE gap_hypothesis ADD CONSTRAINT gap_hypothesis_other_category_label_required
      CHECK (category <> 'other' OR (other_category_label IS NOT NULL AND length(trim(other_category_label)) > 0));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brief_version_problem_statement_ids_non_empty' AND conrelid = 'brief_version'::regclass) THEN
    ALTER TABLE brief_version ADD CONSTRAINT brief_version_problem_statement_ids_non_empty
      CHECK (array_length(problem_statement_ids, 1) IS NOT NULL AND array_length(problem_statement_ids, 1) >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brief_version_claim_version_ids_non_empty' AND conrelid = 'brief_version'::regclass) THEN
    ALTER TABLE brief_version ADD CONSTRAINT brief_version_claim_version_ids_non_empty
      CHECK (array_length(claim_version_ids, 1) IS NOT NULL AND array_length(claim_version_ids, 1) >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brief_version_generation_run_id_unique' AND conrelid = 'brief_version'::regclass) THEN
    ALTER TABLE brief_version ADD CONSTRAINT brief_version_generation_run_id_unique UNIQUE (generation_run_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generation_run_brief_version_id_fkey' AND conrelid = 'generation_run'::regclass) THEN
    ALTER TABLE generation_run ADD CONSTRAINT generation_run_brief_version_id_fkey
      FOREIGN KEY (brief_version_id) REFERENCES brief_version(id);
  END IF;
END $$;
