-- Department OS Core — Problem Department MVP
-- Slice 2: Investigation, Submission, SourceArtifact (Architecture §3 "Intake" schemas)
--
-- SourceArtifact.resolution (SourceResolution) is stored inline as columns on source_artifact
-- rather than a separate table: SourceResolution has no independent identity in Architecture §3
-- (no `id` field) and always belongs to exactly one SourceArtifact — this is a judgment call
-- (Architecture leaves storage shape to the implementation; a 1:1 owned value object is the
-- natural relational representation, not a design deviation from the contract).

CREATE TABLE IF NOT EXISTS investigation (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'blocked', 'generation-failed', 'brief-generated')),
  status_reason    TEXT,
  problem_brief_id UUID
);

CREATE TABLE IF NOT EXISTS submission (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id    UUID NOT NULL REFERENCES investigation(id),
  origin              TEXT NOT NULL,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_artifact (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id  UUID NOT NULL REFERENCES investigation(id),
  submission_id     UUID NOT NULL REFERENCES submission(id),
  type              TEXT NOT NULL,
  raw               TEXT NOT NULL,
  origin            TEXT NOT NULL,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- SourceResolution (Architecture §3), inline:
  resolution_status         TEXT NOT NULL DEFAULT 'unresolved'
                               CHECK (resolution_status IN
                                 ('unresolved', 'unreachable', 'content-retrieved', 'reachable-no-content')),
  resolution_resolved_at    TIMESTAMPTZ,
  resolution_failure_reason TEXT,
  resolution_no_content_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_submission_investigation_id ON submission (investigation_id);
CREATE INDEX IF NOT EXISTS idx_source_artifact_investigation_id ON source_artifact (investigation_id);
CREATE INDEX IF NOT EXISTS idx_source_artifact_submission_id ON source_artifact (submission_id);
