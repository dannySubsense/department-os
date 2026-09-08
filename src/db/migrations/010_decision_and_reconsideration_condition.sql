-- Department OS Core — Product Surface Checkpoint 2, C2-S5
-- Decision / ReconsiderationCondition (Architecture §3.4, §3.5, §1.2 resolution applied) —
-- append-only, same reject_update_or_delete trigger pattern as brief_version/problem_statement
-- (007_problem_brief_and_versioning.sql).
--
-- Migration numbering note (Architecture §3.5): this is migration 010, created in this slice
-- AFTER 011/012/013 (created in C2-S4/C2-S3/C2-S2 respectively) already exist on disk. This is
-- expected and safe — src/db/migrate.ts sorts migrations/ lexically and applies whichever
-- filenames are not yet recorded in schema_migrations; it is not a numeric high-water-mark
-- assuming contiguous, in-order file creation. No migration's SQL depends on a lower-numbered
-- file already existing.

CREATE TABLE IF NOT EXISTS decision (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_version_id UUID NOT NULL REFERENCES brief_version(id),
  decision        TEXT NOT NULL CHECK (decision IN ('Approve', 'Reject', 'Watch')),
  decided_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  rationale       TEXT
  -- No decided_by / actor column — §1.2, Interview Q2 binding ruling.
);

CREATE TABLE IF NOT EXISTS reconsideration_condition (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id     UUID NOT NULL REFERENCES decision(id),
  type            TEXT NOT NULL CHECK (type IN
                    ('new-evidence', 'product-change', 'stronger-demand-signal',
                     'feasibility-shift', 'price-change', 'market-event', 'other')),
  other_type_label TEXT,
  description     TEXT NOT NULL CHECK (length(trim(description)) > 0),
  CONSTRAINT reconsideration_condition_other_type_label_required
    CHECK (type <> 'other' OR (other_type_label IS NOT NULL AND length(trim(other_type_label)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_decision_brief_version_id ON decision (brief_version_id);
CREATE INDEX IF NOT EXISTS idx_reconsideration_condition_decision_id
  ON reconsideration_condition (decision_id);

-- Server-side, transaction-scoped enforcement of "Watch requires >=1 condition" happens in
-- recordDecision.ts (insert Decision + its ReconsiderationConditions in one transaction; if
-- decision = 'Watch' and zero conditions were supplied, roll back and reject before either table
-- is written — US-10 AC4's "no Decision persisted on rejection"). A CHECK constraint cannot
-- express a cross-table cardinality rule directly; the transaction boundary is the enforcement
-- mechanism, matching this doc set's existing pattern of combining DB CHECKs for intra-row rules
-- with app-layer transaction discipline for cross-row/cross-table rules.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'decision_immutable' AND tgrelid = 'decision'::regclass) THEN
    CREATE TRIGGER decision_immutable BEFORE UPDATE OR DELETE ON decision
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reconsideration_condition_immutable' AND tgrelid = 'reconsideration_condition'::regclass) THEN
    CREATE TRIGGER reconsideration_condition_immutable BEFORE UPDATE OR DELETE ON reconsideration_condition
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
END $$;
