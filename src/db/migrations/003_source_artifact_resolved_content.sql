-- Slice 3 hardening fix (Sol review item 1): resolveSourceArtifact previously fetched/classified
-- URL content and then discarded the body, persisting only the status. Slice 4 (Evidence/Claim
-- extraction) needs the actual normalized content, not just a status flag — re-fetching there
-- would be wasteful, non-deterministic (the page may have changed), and duplicates work this
-- slice already does. This column durably captures that content at resolution time.
--
-- NULL for 'unreachable' / 'reachable-no-content' / 'unresolved' sources (nothing usable was
-- retrieved). Populated for 'content-retrieved' sources: the fetched body text for `type: 'url'`
-- artifacts, or the raw pasted text itself for `type: 'text'` artifacts (no fetch needed).

ALTER TABLE source_artifact
  ADD COLUMN IF NOT EXISTS resolved_content TEXT;
