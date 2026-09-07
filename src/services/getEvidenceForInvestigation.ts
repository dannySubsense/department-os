import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import type { EvidenceItem, EvidenceLabel } from '../types/domain.js';

/** Shared read helper for Slice 5 (Demand Analyzer + Personal Pull Extractor): both components
 *  consume the SAME `EvidenceItem` set for an Investigation — extracted/persisted by Slice 4,
 *  independently of any Brief — but read it via two structurally separate LLM calls (Architecture
 *  §3 "Personal Pull may be retained... and is never fed to the Demand Analyzer"). Centralizing the
 *  read avoids two divergent copies of the same join. Accepts an optional in-transaction
 *  `PoolClient` for callers that need this read inside a larger transaction; defaults to the pool. */
export async function getEvidenceForInvestigation(
  investigationId: string,
  client?: PoolClient,
): Promise<EvidenceItem[]> {
  const runner = client ?? pool;
  const result = await runner.query<{
    id: string;
    source_artifact_id: string;
    excerpt_or_summary: string;
    label: EvidenceLabel;
  }>(
    `SELECT ei.id, ei.source_artifact_id, ei.excerpt_or_summary, ei.label
     FROM evidence_item ei
     JOIN source_artifact sa ON sa.id = ei.source_artifact_id
     WHERE sa.investigation_id = $1
     ORDER BY ei.id ASC`,
    [investigationId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    sourceArtifactId: r.source_artifact_id,
    excerptOrSummary: r.excerpt_or_summary,
    label: r.label,
  }));
}
