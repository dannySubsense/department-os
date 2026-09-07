import { pool } from '../db/pool.js';
import { resolveSourceArtifact } from './resolveSourceArtifact.js';
import type { SourceResolution } from '../types/domain.js';

const TERMINAL_STATUSES: SourceResolution['status'][] = [
  'unreachable',
  'content-retrieved',
  'reachable-no-content',
];

/** Source Resolver — Architecture §4/§1.4 (C1 fix). Resolves every SourceArtifact belonging to an
 *  Investigation and reports the aggregate. `allUnreachable` is true ONLY when every single
 *  resolution has `status === 'unreachable'` — a `reachable-no-content` source is NOT unreachable
 *  (it was reachable, it just had no usable content), so it does not count toward this flag.
 *
 *  §1.4 C1 fix: rows already in a terminal resolution state (`'unreachable'`,
 *  `'content-retrieved'`, `'reachable-no-content'`) are reused as-is, not re-fetched or
 *  rewritten — this function runs on every add-source request, and calling
 *  `resolveSourceArtifact` unconditionally would silently overwrite the persisted
 *  `resolution_status`/content of every already-resolved source (including sources already
 *  consumed by the current BriefVersion) on each add. Only rows still `'unresolved'` (a
 *  freshly-inserted row's default) are resolved. This is a no-op for the original single-call
 *  submission flow (every row is freshly `'unresolved'` at first submission) and only changes
 *  behavior on a second call against an Investigation that already has terminally-resolved rows.
 *
 *  Per its documented separation of concerns (Architecture §4), this function does NOT itself
 *  transition `Investigation.status` — the caller is responsible for that. */
export async function resolveInvestigationSources(
  investigationId: string,
): Promise<{ allUnreachable: boolean; resolutions: SourceResolution[] }> {
  const artifactsResult = await pool.query<{
    id: string;
    resolution_status: SourceResolution['status'];
    resolution_resolved_at: Date | null;
    resolution_failure_reason: string | null;
    resolution_no_content_reason: string | null;
  }>(
    `SELECT id, resolution_status, resolution_resolved_at, resolution_failure_reason,
            resolution_no_content_reason
       FROM source_artifact WHERE investigation_id = $1`,
    [investigationId],
  );

  const resolutions: SourceResolution[] = [];
  for (const row of artifactsResult.rows) {
    if (TERMINAL_STATUSES.includes(row.resolution_status)) {
      resolutions.push({
        status: row.resolution_status,
        resolvedAt: row.resolution_resolved_at?.toISOString(),
        failureReason: row.resolution_failure_reason ?? undefined,
        noContentReason: row.resolution_no_content_reason ?? undefined,
      });
    } else {
      resolutions.push(await resolveSourceArtifact(row.id));
    }
  }

  const allUnreachable =
    resolutions.length > 0 && resolutions.every((r) => r.status === 'unreachable');

  return { allUnreachable, resolutions };
}
