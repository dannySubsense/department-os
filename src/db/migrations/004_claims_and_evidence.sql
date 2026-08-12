-- Department OS Core — Problem Department MVP
-- Slice 4: Evidence/Claim Model (Architecture §3 "Evidence & Claims" — Q-4 stable-identity /
-- immutable-version split; PR-review binding correction — stance lives on the claim-evidence
-- relationship, not on EvidenceItem).
--
-- `Claim` deliberately carries no `investigation_id` column: Architecture §3 defines `Claim` as
-- `{ id, createdAt }` only, and Claims are explicitly "shared across Briefs" — not hard-scoped to
-- one Investigation by a foreign key. Investigation-scoping for the clustering/matching heuristic
-- (see extractClaimsAndEvidence.ts) is derived by joining claim_version_evidence -> evidence_item
-- -> source_artifact.investigation_id, not by a field this table doesn't have in the spec.
--
-- Immutability (Claim never mutated; ClaimVersion/EvidenceItem/ClaimVersionEvidence immutable once
-- created — Architecture §3) is enforced with the same BEFORE UPDATE OR DELETE trigger pattern
-- DDR-0001 row 2 spiked and confirmed working against a dedicated local Postgres.

CREATE OR REPLACE FUNCTION reject_update_or_delete() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: % is immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS claim (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_version (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id               UUID NOT NULL REFERENCES claim(id),
  version_number         INT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  text                   TEXT NOT NULL,
  supersedes_version_id  UUID REFERENCES claim_version(id),
  UNIQUE (claim_id, version_number)
);

CREATE TABLE IF NOT EXISTS evidence_item (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_artifact_id  UUID NOT NULL REFERENCES source_artifact(id),
  excerpt_or_summary  TEXT NOT NULL,
  -- EvidenceLabel (Architecture §3) — exactly one, closed five-value enum. No `stance` column
  -- here by design (PR-review binding correction): stance lives on claim_version_evidence below.
  label               TEXT NOT NULL CHECK (label IN
                         ('fact', 'observation', 'interpretation', 'assumption', 'unknown')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The claim-evidence relationship (Architecture §3 ClaimVersionEvidence). A single evidence_item
-- may be referenced by many claim_version rows, each with its own independent stance — the same
-- EvidenceItem can support one ClaimVersion and contradict another.
CREATE TABLE IF NOT EXISTS claim_version_evidence (
  claim_version_id  UUID NOT NULL REFERENCES claim_version(id),
  evidence_item_id  UUID NOT NULL REFERENCES evidence_item(id),
  stance            TEXT NOT NULL CHECK (stance IN ('supporting', 'contradicting', 'neutral-context')),
  relevance_note    TEXT,
  PRIMARY KEY (claim_version_id, evidence_item_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_version_claim_id ON claim_version (claim_id);
CREATE INDEX IF NOT EXISTS idx_evidence_item_source_artifact_id ON evidence_item (source_artifact_id);
CREATE INDEX IF NOT EXISTS idx_claim_version_evidence_claim_version_id
  ON claim_version_evidence (claim_version_id);
CREATE INDEX IF NOT EXISTS idx_claim_version_evidence_evidence_item_id
  ON claim_version_evidence (evidence_item_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'claim_immutable' AND tgrelid = 'claim'::regclass
  ) THEN
    CREATE TRIGGER claim_immutable BEFORE UPDATE OR DELETE ON claim
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'claim_version_immutable' AND tgrelid = 'claim_version'::regclass
  ) THEN
    CREATE TRIGGER claim_version_immutable BEFORE UPDATE OR DELETE ON claim_version
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'evidence_item_immutable' AND tgrelid = 'evidence_item'::regclass
  ) THEN
    CREATE TRIGGER evidence_item_immutable BEFORE UPDATE OR DELETE ON evidence_item
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'claim_version_evidence_immutable'
      AND tgrelid = 'claim_version_evidence'::regclass
  ) THEN
    CREATE TRIGGER claim_version_evidence_immutable BEFORE UPDATE OR DELETE ON claim_version_evidence
      FOR EACH ROW EXECUTE FUNCTION reject_update_or_delete();
  END IF;
END $$;
