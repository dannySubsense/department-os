-- Product Surface Checkpoint 2 — C2-S3
-- §4.8 Correction-attempt eligibility and source-snapshot ledger. Records which SourceArtifact
-- rows a given GenerationRun's extraction pass(es) actually read (extractionInputSourceIds, both
-- primary Extraction and Landscape Research), so hasUnattemptedCorrectionSnapshot can exclude an
-- already-attempted resolved-content hash without any timestamp boundary or canonical-URL
-- anti-join. For an initial run, correction_target_brief_version_id is null; for a correction
-- attempt it is the server-resolved supersedesVersionId — durable even when the attempt creates no
-- BriefVersion (e.g. the no-new-usable-evidence disposition).

CREATE TABLE IF NOT EXISTS generation_run_consumed_source (
  generation_run_id UUID NOT NULL REFERENCES generation_run(id),
  source_artifact_id UUID NOT NULL REFERENCES source_artifact(id),
  correction_target_brief_version_id UUID REFERENCES brief_version(id),
  PRIMARY KEY (generation_run_id, source_artifact_id)
);
