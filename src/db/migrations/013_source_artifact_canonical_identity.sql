-- Product Surface Checkpoint 2 — C2-S2
-- §1.4a SOL-MEDIUM-2 fix (resolution_revision — the recheckSourceArtifact CAS guard's collision-
-- free monotonic counter) and §4.8 SOL-MEDIUM-1 fix (canonical_url / resolved_content_hash —
-- source snapshot identity/fingerprint). One ALTER TABLE covering all three additive columns, per
-- 02-ARCHITECTURE.md §1.4a.
--
-- There is no historical canonical-URL backfill script (02-ARCHITECTURE.md §4.8) — a
-- pre-migration redirect's final destination was never stored and must not be reconstructed from
-- `raw` or claimed as known. This migration fully backfills the historical content snapshot hash
-- for rows that actually have stored content, and nothing else.

ALTER TABLE source_artifact
  ADD COLUMN IF NOT EXISTS canonical_url TEXT,
  ADD COLUMN IF NOT EXISTS resolved_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS resolution_revision INTEGER NOT NULL DEFAULT 0;

UPDATE source_artifact
   SET resolved_content_hash = encode(sha256(convert_to(resolved_content, 'UTF8')), 'hex')
 WHERE resolution_status = 'content-retrieved'
   AND resolved_content IS NOT NULL
   AND resolved_content_hash IS NULL;
