import { pool } from '../db/pool.js';
import type { InvestigationStatus } from '../types/domain.js';

/** Sol review item 3 (SIGNIFICANT). `server.ts` previously ran the blocked->open recovery
 *  transition guarded (`WHERE status = 'blocked'`), but the open/generation-failed->blocked
 *  transition was unguarded raw SQL — a resolution pass finding zero reachable sources could
 *  silently overwrite `'generation-failed'` (or, once it exists, `'brief-generated'`) back to
 *  `'blocked'`. Both directions are centralized here with an explicit allowed-prior-states map so
 *  neither can regress without going through this guard again.
 *
 *  An attempted transition whose current status is not in the allowed set is a no-op (not an
 *  error) — a resolution pass running against a `'generation-failed'` (or `'brief-generated'`)
 *  Investigation should simply decline to touch status, not throw. */
const ALLOWED_PRIOR_STATUSES: Record<'blocked' | 'open', InvestigationStatus[]> = {
  blocked: ['open'],
  open: ['blocked'],
};

/** Transitions `investigation.id` to `toStatus`, but only if its current status is one of the
 *  allowed prior states for that transition. Returns true if the row was updated, false if the
 *  transition was declined (current status not eligible) — callers that don't need to
 *  distinguish can ignore the return value. */
export async function transitionInvestigationStatus(
  investigationId: string,
  toStatus: 'blocked' | 'open',
  statusReason: string | null,
): Promise<boolean> {
  const allowedFrom = ALLOWED_PRIOR_STATUSES[toStatus];
  const result = await pool.query(
    `UPDATE investigation
     SET status = $2, status_reason = $3
     WHERE id = $1 AND status = ANY($4::text[])`,
    [investigationId, toStatus, statusReason, allowedFrom],
  );
  return (result.rowCount ?? 0) > 0;
}
