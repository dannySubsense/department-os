-- submission_id is NULL exactly when origin != 'submitted' (e.g. 'landscape-research' —
-- Decision 1.5/Q-6: a Landscape Researcher artifact has no Submission by definition).
--
-- 001_initial_schema.sql wrongly declared submission_id NOT NULL for all origins; this migration
-- corrects it on any database (fresh or already carrying 001) using unconditional ALTERs, so it
-- is safe to re-run and safe to apply on top of a pre-existing table (not just fresh installs).

ALTER TABLE source_artifact
  ALTER COLUMN submission_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'source_artifact_submission_id_matches_origin'
      AND conrelid = 'source_artifact'::regclass
  ) THEN
    ALTER TABLE source_artifact
      ADD CONSTRAINT source_artifact_submission_id_matches_origin CHECK (
        (origin = 'submitted' AND submission_id IS NOT NULL) OR
        (origin != 'submitted' AND submission_id IS NULL)
      );
  END IF;
END $$;
