-- Department OS Core — Problem Department MVP
-- Slice 6: Landscape Researcher — WebSearchQuery / WebSearchResult / QueryLimitation
-- (Architecture §1.6 "Persistence — provably not dropped").
--
-- generation_run_id is stored as a plain NOT NULL UUID column WITHOUT a REFERENCES constraint:
-- `generation_run` (Architecture §3 "Provenance") is not created until Slice 8 (Provenance
-- Recorder), and Slice 6 depends only on Slice 4 per the roadmap's dependency graph — it does not
-- depend on Slice 8. Architecture §1.6 specifies this column as
-- "generation_run_id NOT NULL REFERENCES generation_run(id)"; the NOT NULL half is enforced here,
-- the FK half is deferred to a follow-up migration once Slice 8 creates the referenced table
-- (tracked, not silently dropped — this comment is that tracking).
--
-- web_search_query / web_search_result are append-only (Architecture §1.6) via the same
-- `reject_update_or_delete()` trigger function 004_claims_and_evidence.sql already defines
-- (CREATE OR REPLACE — idempotent, safe to reuse here rather than redefining).
--
-- web_search_query.query_limitation_id <-> query_limitation.web_search_query_id is a mutual
-- reference between two append-only (insert-only, no UPDATE) tables. Because web_search_query
-- forbids UPDATE once inserted, `query_limitation_id` must be known at web_search_query INSERT
-- time — but query_limitation's own row (and the id it will be given) cannot exist before
-- web_search_query does either, since query_limitation.web_search_query_id is itself NOT NULL.
-- Both foreign keys are declared DEFERRABLE INITIALLY DEFERRED so the persistence transaction can
-- insert both rows (ids generated application-side) in either order and have referential
-- integrity checked once, at COMMIT, rather than requiring a disallowed UPDATE to link them
-- after the fact.

CREATE TABLE IF NOT EXISTS query_limitation (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_search_query_id  UUID NOT NULL, -- FK added below, after web_search_query exists — see note
  reason               TEXT NOT NULL,
  occurred_at          TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS web_search_query (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id     UUID NOT NULL REFERENCES investigation(id),
  generation_run_id    UUID NOT NULL, -- REFERENCES generation_run(id) deferred — see header note
  query                TEXT NOT NULL,
  performed_at         TIMESTAMPTZ NOT NULL,
  scope_note           TEXT,
  limitations          TEXT[] NOT NULL DEFAULT '{}',
  query_limitation_id  UUID
);

-- Mutual FKs between web_search_query and query_limitation, added now that both tables exist.
-- DEFERRABLE INITIALLY DEFERRED on both — see header note on the insert-ordering rationale.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'query_limitation_web_search_query_id_fkey'
      AND conrelid = 'query_limitation'::regclass
  ) THEN
    ALTER TABLE query_limitation
      ADD CONSTRAINT query_limitation_web_search_query_id_fkey
      FOREIGN KEY (web_search_query_id) REFERENCES web_search_query(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'web_search_query_query_limitation_id_fkey'
      AND conrelid = 'web_search_query'::regclass
  ) THEN
    ALTER TABLE web_search_query
      ADD CONSTRAINT web_search_query_query_limitation_id_fkey
      FOREIGN KEY (query_limitation_id) REFERENCES query_limitation(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS web_search_result (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_search_query_id   UUID NOT NULL REFERENCES web_search_query(id),
  url                   TEXT NOT NULL,
  retrieved_at          TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('retrieved', 'blocked', 'failed')),
  failure_reason        TEXT,
  source_artifact_id    UUID REFERENCES source_artifact(id),
  UNIQUE (web_search_query_id, url),
  CONSTRAINT web_search_result_failure_reason_matches_status CHECK (
    (status <> 'retrieved' AND failure_reason IS NOT NULL) OR
    (status = 'retrieved' AND failure_reason IS NULL)
  ),
  CONSTRAINT web_search_result_source_artifact_id_matches_status CHECK (
    (status = 'retrieved' AND source_artifact_id IS NOT NULL) OR
    (status <> 'retrieved' AND source_artifact_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_web_search_query_investigation_id
  ON web_search_query (investigation_id);
CREATE INDEX IF NOT EXISTS idx_web_search_result_web_search_query_id
  ON web_search_result (web_search_query_id);

-- Append-only immutability (Architecture §1.6) — reuses reject_update_or_delete() from
-- 004_claims_and_evidence.sql; guarded the same tgrelid-scoped way that migration established.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'web_search_query_immutable' AND tgrelid = 'web_search_query'::regclass
  ) THEN
    CREATE TRIGGER web_search_query_immutable BEFORE UPDATE OR DELETE ON web_search_query
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'web_search_result_immutable' AND tgrelid = 'web_search_result'::regclass
  ) THEN
    CREATE TRIGGER web_search_result_immutable BEFORE UPDATE OR DELETE ON web_search_result
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'query_limitation_immutable' AND tgrelid = 'query_limitation'::regclass
  ) THEN
    CREATE TRIGGER query_limitation_immutable BEFORE UPDATE OR DELETE ON query_limitation
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
END $$;
