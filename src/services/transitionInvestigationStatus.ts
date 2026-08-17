import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import type { InvestigationStatus } from '../types/domain.js';

/** Sol review item 3 (SIGNIFICANT). `server.ts` previously ran the blocked->open recovery
 *  transition guarded (`WHERE status = 'blocked'`), but the open/generation-failed->blocked
 *  transition was unguarded raw SQL — a resolution pass finding zero reachable sources could
 *  silently overwrite `'generation-failed'` (or, once it exists, `'brief-generated'`) back to
 *  `'blocked'`. Both directions are centralized here with an explicit allowed-prior-states map so
 *  neither can regress without going through this guard again.
 *
 *  Extended for Slice 9 (SLICE-09-DESIGN.md §6, revision 6 BLOCKING 1 fix):
 *  'generation-failed' -> 'brief-generated' is explicitly ALLOWED — a retried INITIAL generation
 *  (supersedesVersionId absent) after a prior failed initial generation is exactly the UI's
 *  retry-by-resubmission contract, and its target toStatus is 'brief-generated' FROM
 *  'generation-failed'. Without this entry, a successful retry's guarded UPDATE would silently
 *  affect zero rows, leaving a committed BriefVersion against a stuck 'generation-failed'
 *  Investigation.
 *
 *  An attempted transition whose current status is not in the allowed set is a no-op (not an
 *  error) — a resolution pass running against a `'generation-failed'` (or `'brief-generated'`)
 *  Investigation should simply decline to touch status, not throw. */
const ALLOWED_PRIOR_STATUSES: Record<
  'blocked' | 'open' | 'generation-failed' | 'brief-generated',
  InvestigationStatus[]
> = {
  blocked: ['open'],
  open: ['blocked'],
  'generation-failed': ['open', 'generation-failed'],
  'brief-generated': ['open', 'generation-failed', 'brief-generated'],
};

/** Transitions `investigation.id` to `toStatus`, but only if its current status is one of the
 *  allowed prior states for that transition. Returns true if the row was updated, false if the
 *  transition was declined (current status not eligible) — every call site that matters for
 *  correctness must check this return value explicitly (SLICE-09-DESIGN.md §6, revision 6
 *  BLOCKING 1 — "never ignore the return value").
 *
 *  `options.client` — accepts an optional in-transaction `PoolClient` (Slice 9's phase-4 assembly
 *  transaction); defaults to the pool.
 *  `options.problemBriefId` — when supplied, sets `investigation.problem_brief_id` atomically in
 *  the SAME statement as the status/statusReason update (SLICE-09-DESIGN.md §3 Phase 4, finding
 *  4) — never a second, separate `UPDATE investigation` elsewhere. */
export async function transitionInvestigationStatus(
  investigationId: string,
  toStatus: 'blocked' | 'open' | 'generation-failed' | 'brief-generated',
  statusReason: string | null,
  options?: { client?: PoolClient; problemBriefId?: string },
): Promise<boolean> {
  const runner = options?.client ?? pool;
  const allowedFrom = ALLOWED_PRIOR_STATUSES[toStatus];
  const result = options?.problemBriefId
    ? await runner.query(
        `UPDATE investigation
           SET status = $2, status_reason = $3, problem_brief_id = $5
         WHERE id = $1 AND status = ANY($4::text[])`,
        [investigationId, toStatus, statusReason, allowedFrom, options.problemBriefId],
      )
    : await runner.query(
        `UPDATE investigation
           SET status = $2, status_reason = $3
         WHERE id = $1 AND status = ANY($4::text[])`,
        [investigationId, toStatus, statusReason, allowedFrom],
      );
  return (result.rowCount ?? 0) > 0;
}
