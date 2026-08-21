import { pool } from '../db/pool.js';
import { resolveSourceArtifact } from './resolveSourceArtifact.js';
import type { SourceResolution } from '../types/domain.js';

/** Source Resolver — Architecture §4. Resolves every SourceArtifact belonging to an Investigation
 *  and reports the aggregate. `allUnreachable` is true ONLY when every single resolution has
 *  `status === 'unreachable'` — a `reachable-no-content` source is NOT unreachable (it was
 *  reachable, it just had no usable content), so it does not count toward this flag.
 *
 *  Per its documented separation of concerns (Architecture §4), this function does NOT itself
 *  transition `Investigation.status` — the caller is responsible for that. */
export async function resolveInvestigationSources(
  investigationId: string,
): Promise<{ allUnreachable: boolean; resolutions: SourceResolution[] }> {
  const artifactsResult = await pool.query<{ id: string }>(
    'SELECT id FROM source_artifact WHERE investigation_id = $1',
    [investigationId],
  );

  const resolutions: SourceResolution[] = [];
  for (const row of artifactsResult.rows) {
    resolutions.push(await resolveSourceArtifact(row.id));
  }

  const allUnreachable =
    resolutions.length > 0 && resolutions.every((r) => r.status === 'unreachable');

  return { allUnreachable, resolutions };
}
