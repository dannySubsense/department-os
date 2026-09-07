import { pool } from '../db/pool.js';
import type { Investigation, SourceArtifact, SourceResolution } from '../types/domain.js';

interface InvestigationRow {
  id: string;
  created_at: Date;
  status: Investigation['status'];
  status_reason: string | null;
  problem_brief_id: string | null;
}

interface SourceArtifactRow {
  id: string;
  investigation_id: string;
  type: string;
  raw: string;
  origin: string;
  added_at: Date;
  resolution_status: SourceResolution['status'];
  resolution_resolved_at: Date | null;
  resolution_failure_reason: string | null;
  resolution_no_content_reason: string | null;
  resolved_content: string | null;
}

/** Investigation read model — Architecture §4, Q-7 (binding). This is the SINGLE durable-URL
 *  read path: every screen/state that needs Investigation status calls this function, and no
 *  other ad-hoc status query exists anywhere else in the codebase.
 *
 *  Covers the `open`, `blocked`, and `generation-failed` status branches now. The
 *  `brief-generated` branch's downstream chain (`problemBriefId -> currentVersionId ->
 *  getBriefForReview`) is not implemented here — those entities don't exist until Slice 9/10 —
 *  but this function's return shape already accommodates it (`Investigation.problemBriefId` is
 *  returned as-is; a later slice resolves it further without needing to change this contract). */
export async function getInvestigation(investigationId: string): Promise<{
  investigation: Investigation;
  sourceArtifacts: Array<SourceArtifact & { resolution: SourceResolution }>;
}> {
  const investigationResult = await pool.query<InvestigationRow>(
    `SELECT id, created_at, status, status_reason, problem_brief_id
     FROM investigation WHERE id = $1`,
    [investigationId],
  );
  if (investigationResult.rowCount === 0) {
    throw new Error(`getInvestigation: investigation ${investigationId} does not exist`);
  }
  const row = investigationResult.rows[0];

  const investigation: Investigation = {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    status: row.status,
    statusReason: row.status_reason ?? undefined,
    problemBriefId: row.problem_brief_id,
  };

  const sourcesResult = await pool.query<SourceArtifactRow>(
    `SELECT id, investigation_id, type, raw, origin, added_at,
            resolution_status, resolution_resolved_at,
            resolution_failure_reason, resolution_no_content_reason, resolved_content
     FROM source_artifact WHERE investigation_id = $1 ORDER BY added_at ASC`,
    [investigationId],
  );

  const sourceArtifacts = sourcesResult.rows.map((r) => {
    const resolution: SourceResolution = {
      status: r.resolution_status,
      resolvedAt: r.resolution_resolved_at?.toISOString(),
      failureReason: r.resolution_failure_reason ?? undefined,
      noContentReason: r.resolution_no_content_reason ?? undefined,
    };
    return {
      id: r.id,
      investigationId: r.investigation_id,
      type: r.type,
      raw: r.raw,
      resolution,
      addedAt: r.added_at.toISOString(),
      origin: r.origin,
      resolvedContent: r.resolved_content ?? undefined,
      // SourceArtifact & { resolution } per Architecture §4 — SourceArtifact already declares
      // `resolution`; the intersection is satisfied structurally by the single field above.
    };
  });

  return { investigation, sourceArtifacts };
}
