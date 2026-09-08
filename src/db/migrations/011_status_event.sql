-- Department OS Core — Product Surface Checkpoint 2, C2-S4
-- StatusEvent (Architecture §3.6, US-12) — append-only, same reject_update_or_delete trigger
-- pattern as claim/claim_version/evidence_item/claim_version_evidence (004) and
-- brief_version/problem_statement/... (007). No mutable status/validity column is added to
-- claim, claim_version, or brief_version anywhere in this project — assigned validity is always
-- answered by querying this table (Non-Functional Requirements, binding).
--
-- Migration numbering note (Architecture §3.5): this is migration 011, created in this slice
-- AFTER 012/013 (both created in C2-S2/C2-S3) already exist on disk. This is expected and safe —
-- src/db/migrate.ts sorts migrations/ lexically and applies whichever filenames are not yet
-- recorded in schema_migrations; it is not a numeric high-water-mark assuming contiguous,
-- in-order file creation. No migration's SQL depends on a lower-numbered file already existing.

CREATE TABLE IF NOT EXISTS status_event (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence       BIGSERIAL NOT NULL, -- deterministic ordering tiebreak, DB-assigned, always
                                      -- distinct and monotonic by insertion order
  target_type    TEXT NOT NULL CHECK (target_type IN ('claim-version', 'brief-version')),
  target_id      UUID NOT NULL,
  assigned_state TEXT NOT NULL CHECK (assigned_state IN ('valid', 'challenged', 'invalidated')),
  effective_at   TIMESTAMPTZ NOT NULL,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by    TEXT NOT NULL,
  reason         TEXT NOT NULL CHECK (length(trim(reason)) > 0)
  -- target_id intentionally has no FK: it references claim_version.id OR brief_version.id
  -- depending on target_type, and Postgres has no polymorphic FK — matches this doc set's
  -- existing practice of enforcing polymorphic-target integrity in application code, not the
  -- schema, when a CHECK/FK cannot express it.
);

CREATE INDEX IF NOT EXISTS idx_status_event_target
  ON status_event (target_type, target_id, effective_at DESC, recorded_at DESC, sequence DESC);
-- index order matches the exact ORDER BY getAssignedState/getAssignedStateAsRecorded use
-- (Architecture §4.7) — effective_at, then recorded_at, then sequence, all DESC — so "latest"
-- resolves via one index scan, not a sort.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'status_event_immutable' AND tgrelid = 'status_event'::regclass) THEN
    CREATE TRIGGER status_event_immutable BEFORE UPDATE OR DELETE ON status_event
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
END $$;
