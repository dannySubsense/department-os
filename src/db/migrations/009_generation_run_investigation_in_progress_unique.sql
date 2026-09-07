-- Product Surface Checkpoint 2 — C2-S2
-- §1.1 Concurrent-generation uniqueness + §1.6 fencing/heartbeat columns (schema only; the
-- write-guard logic that reads/writes fence_token/heartbeat_revision at write time is C2-S3's
-- own scope — this migration only adds the columns and the concurrency index).
--
-- Stranded-row backfill MUST run before CREATE UNIQUE INDEX, in this same file, so the index
-- creation succeeds even against a dev/test database that already has multiple 'in-progress'
-- rows for one Investigation (02-ARCHITECTURE.md §1.1). On a fresh database this affects zero
-- rows.

WITH ranked AS (
  SELECT id, investigation_id,
         ROW_NUMBER() OVER (PARTITION BY investigation_id ORDER BY started_at DESC) AS rn
    FROM generation_run
   WHERE outcome = 'in-progress'
), stranded AS (
  SELECT id FROM ranked WHERE rn > 1
), logged_steps AS (
  INSERT INTO generation_step
    (id, generation_run_id, step_index, component, started_at, completed_at, outcome, error,
     model_identifier, input_refs, output_refs, step_data)
  SELECT gen_random_uuid(), gr.id,
         COALESCE((SELECT MAX(step_index) FROM generation_step WHERE generation_run_id = gr.id), -1) + 1,
         'Migration 009 backfill: stranded run reconciliation',
         gr.started_at, now(), 'failed',
         'Left in-progress by a process interruption predating this migration''s uniqueness ' ||
         'constraint; reconciled to permit it. No pipeline activity beyond what was already ' ||
         'recorded is claimed.',
         NULL, '{}', '{}', '{}'::jsonb
    FROM generation_run gr JOIN stranded s ON s.id = gr.id
  RETURNING generation_run_id
)
UPDATE generation_run
   SET outcome = 'failed', completed_at = now()
  FROM logged_steps
 WHERE generation_run.id = logged_steps.generation_run_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_run_investigation_in_progress_unique
  ON generation_run (investigation_id)
  WHERE outcome = 'in-progress';

-- §1.6 fencing/heartbeat columns (SOL-HIGH-1 fix) — additive, schema only. Read by this slice's
-- own getInvestigationWorkspace (lease_heartbeat_at, via computeLivenessState, §4.9). The
-- write-guard logic that reads/writes fence_token/heartbeat_revision at write time is C2-S3's
-- own scope; no GenerationRun is created by any code path in this slice, so there is nothing yet
-- to fence.
ALTER TABLE generation_run
  ADD COLUMN IF NOT EXISTS fence_token INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lease_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS heartbeat_revision INTEGER NOT NULL DEFAULT 0;
