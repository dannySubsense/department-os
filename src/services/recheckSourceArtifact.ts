import { pool } from '../db/pool.js';
import type { InvestigationStatus, SourceResolution } from '../types/domain.js';
import { computeSourceResolution } from './resolveSourceArtifact.js';
import { transitionInvestigationStatus } from './transitionInvestigationStatus.js';

interface SourceArtifactRow {
  id: string;
  investigation_id: string;
  type: string;
  raw: string;
  resolution_status: SourceResolution['status'];
  resolution_resolved_at: Date | null;
  resolution_revision: number;
}

export class SourceArtifactNotFoundError extends Error {
  constructor(public readonly sourceArtifactId: string) {
    super(`recheckSourceArtifact: source_artifact ${sourceArtifactId} does not exist`);
    this.name = 'SourceArtifactNotFoundError';
  }
}

export class RecheckNotEligibleError extends Error {
  constructor(
    public readonly sourceArtifactId: string,
    public readonly currentResolutionStatus: SourceResolution['status'],
  ) {
    super(
      `recheckSourceArtifact: source_artifact ${sourceArtifactId} is not eligible for recheck ` +
        `(current resolution_status: ${currentResolutionStatus})`,
    );
    this.name = 'RecheckNotEligibleError';
  }
}

export interface RecheckSourceArtifactResult {
  sourceArtifactId: string;
  resolutionStatus: SourceResolution['status'];
  investigationStatus: InvestigationStatus;
}

/** Single-source recheck — atomic, no silent overwrite under concurrent requests
 *  (02-ARCHITECTURE.md §1.4a). Intentionally retries a source that resolved `'unreachable'`
 *  without triggering the bulk add-source path (which never re-resolves already-resolved
 *  sources, §1.4). */
export async function recheckSourceArtifact(
  sourceArtifactId: string,
): Promise<RecheckSourceArtifactResult> {
  const readResult = await pool.query<SourceArtifactRow>(
    `SELECT id, investigation_id, type, raw, resolution_status, resolution_resolved_at,
            resolution_revision
       FROM source_artifact WHERE id = $1`,
    [sourceArtifactId],
  );
  if (readResult.rowCount === 0) {
    throw new SourceArtifactNotFoundError(sourceArtifactId);
  }
  const row = readResult.rows[0];

  if (row.resolution_status !== 'unreachable') {
    throw new RecheckNotEligibleError(sourceArtifactId, row.resolution_status);
  }

  const computed = await computeSourceResolution({ id: row.id, type: row.type, raw: row.raw });

  const updateResult = await pool.query<{
    resolution_status: SourceResolution['status'];
    resolution_resolved_at: Date | null;
    resolution_revision: number;
  }>(
    `UPDATE source_artifact
        SET resolution_status = $2,
            resolution_resolved_at = $3,
            resolution_failure_reason = $4,
            resolution_no_content_reason = $5,
            resolved_content = $6,
            canonical_url = $7,
            resolved_content_hash = $8,
            resolution_revision = resolution_revision + 1
      WHERE id = $1 AND resolution_status = $9 AND resolution_resolved_at IS NOT DISTINCT FROM $10
        AND resolution_revision = $11
      RETURNING resolution_status, resolution_resolved_at, resolution_revision`,
    [
      sourceArtifactId,
      computed.resolution.status,
      computed.resolution.resolvedAt ?? null,
      computed.resolution.failureReason ?? null,
      computed.resolution.noContentReason ?? null,
      computed.resolvedContent,
      computed.canonicalUrl,
      computed.resolvedContentHash,
      row.resolution_status,
      row.resolution_resolved_at,
      row.resolution_revision,
    ],
  );

  let resolutionStatus: SourceResolution['status'];
  if ((updateResult.rowCount ?? 0) === 1) {
    resolutionStatus = updateResult.rows[0].resolution_status;
  } else {
    // Lost the race — another writer already advanced this row's resolution_revision past the
    // value this call read. Return the row's real current state rather than overwriting it.
    const current = await pool.query<{ resolution_status: SourceResolution['status'] }>(
      'SELECT resolution_status FROM source_artifact WHERE id = $1',
      [sourceArtifactId],
    );
    resolutionStatus = current.rows[0].resolution_status;
  }

  const investigationResult = await pool.query<{ status: InvestigationStatus }>(
    'SELECT status FROM investigation WHERE id = $1',
    [row.investigation_id],
  );
  let investigationStatus = investigationResult.rows[0].status;

  // Status recovery (§1.4a): only after a winning write. The loser performed no write and must
  // not attempt a transition at all — it simply reports current state.
  if ((updateResult.rowCount ?? 0) === 1) {
    // Status recovery: only when the Investigation's current status is 'blocked' — an explicit
    // skip for every other status, not a value the transition guard is relied on to decline.
    if (investigationStatus === 'blocked') {
      const sourcesResult = await pool.query<{ resolution_status: SourceResolution['status'] }>(
        'SELECT resolution_status FROM source_artifact WHERE investigation_id = $1',
        [row.investigation_id],
      );
      const allUnreachable =
        sourcesResult.rows.length > 0 &&
        sourcesResult.rows.every((r) => r.resolution_status === 'unreachable');
      if (!allUnreachable) {
        const transitioned = await transitionInvestigationStatus(
          row.investigation_id,
          'open',
          null,
        );
        if (transitioned) {
          investigationStatus = 'open';
        } else {
          const refreshed = await pool.query<{ status: InvestigationStatus }>(
            'SELECT status FROM investigation WHERE id = $1',
            [row.investigation_id],
          );
          investigationStatus = refreshed.rows[0].status;
        }
      }
    }
  }

  return { sourceArtifactId, resolutionStatus, investigationStatus };
}
