import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { getMissionControlView } from '../services/getMissionControlView.js';
import { getProblemDepartmentOverview } from '../services/getProblemDepartmentOverview.js';
import { submitSources } from '../services/submitSources.js';
import { resolveInvestigationSources } from '../services/resolveInvestigationSources.js';
import { transitionInvestigationStatus } from '../services/transitionInvestigationStatus.js';
import { getInvestigation, InvestigationNotFoundError } from '../services/getInvestigation.js';
import {
  getInvestigationWorkspace,
  hasUnattemptedCorrectionSnapshot,
  computeLivenessState,
} from '../services/getInvestigationWorkspace.js';
import {
  recheckSourceArtifact,
  SourceArtifactNotFoundError,
  RecheckNotEligibleError,
} from '../services/recheckSourceArtifact.js';
import { generateBriefVersion } from '../services/generateBriefVersion.js';
import { pool } from '../db/pool.js';
import {
  recordGenerationStep,
  finalizeGenerationRun,
  getGenerationRunOutcome,
  GenerationRunAlreadyFinalizedError,
  GenerationRunFencedOutError,
} from '../services/provenanceRecorder.js';
import type { GenerationRun, InvestigationStatus, SourceArtifactType } from '../types/domain.js';

export const apiRoutes = express.Router();

// ---- §4.2 step 4 — runtimeIdentifier resolution. Server-configured only, never a route
// parameter/client-supplied value. A real, meaningful identifier of the execution environment
// (package version), not a placeholder string. ----
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();
const RUNTIME_IDENTIFIER = process.env.RUNTIME_IDENTIFIER ?? `department-os@${PACKAGE_VERSION}`;

/** §4.2 step 5 — checks that `err` is a Postgres error whose `code` property is `'23505'` AND
 *  whose `constraint` property equals `constraintName`. No other caller in this document; exists
 *  purely to discriminate the concurrency guard's own conflict from a genuinely unexpected
 *  pre-Phase-1 failure. */
export function isUniqueViolation(err: unknown, constraintName: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === '23505' &&
    (err as { constraint?: unknown }).constraint === constraintName
  );
}

type CreateGenerationRunOutcome =
  | { outcome: 'started'; generationRunId: string }
  | { outcome: 'not-found' }
  | { outcome: 'conflict'; existingGenerationRunId: string; stillInProgress: boolean }
  | { outcome: 'ineligible'; currentStatus: InvestigationStatus; reason: string };

/** §4.2 — the Generation Run Connector's orchestration function, independently unit-testable
 *  without an HTTP layer. Returns the instant the concurrency-guarding GenerationRun row exists
 *  (via `onRunCreated`), racing that against a pre-Phase-1 rejection — it does NOT await
 *  `generateBriefVersion`'s full resolution. */
export async function createGenerationRunForInvestigation(
  investigationId: string,
): Promise<CreateGenerationRunOutcome> {
  // Step 1
  let investigation;
  try {
    ({ investigation } = await getInvestigation(investigationId));
  } catch (err) {
    if (err instanceof InvestigationNotFoundError) {
      return { outcome: 'not-found' };
    }
    throw err;
  }

  // Step 2 — the single, revised Generation Eligibility Rule (§4.2).
  if (investigation.status === 'blocked') {
    return { outcome: 'ineligible', currentStatus: investigation.status, reason: "the Investigation is blocked" };
  }
  const inProgressResult = await pool.query(
    `SELECT 1 FROM generation_run WHERE investigation_id = $1 AND outcome = 'in-progress' LIMIT 1`,
    [investigationId],
  );
  if ((inProgressResult.rowCount ?? 0) > 0) {
    return {
      outcome: 'ineligible',
      currentStatus: investigation.status,
      reason: 'a generation run is already in progress for this investigation',
    };
  }
  const hasProblemBrief = investigation.problemBriefId !== null;
  if (hasProblemBrief) {
    const eligible = await hasUnattemptedCorrectionSnapshot(investigationId);
    if (!eligible) {
      return {
        outcome: 'ineligible',
        currentStatus: investigation.status,
        reason: 'no new source snapshot has been added since the current Brief version',
      };
    }
  } else if (investigation.status !== 'open' && investigation.status !== 'generation-failed') {
    return {
      outcome: 'ineligible',
      currentStatus: investigation.status,
      reason: `Investigation status '${investigation.status}' is not eligible for generation`,
    };
  }

  // Step 3 — supersedesVersionId, server-resolved only.
  let supersedesVersionId: string | undefined;
  if (hasProblemBrief) {
    const pbResult = await pool.query<{ current_version_id: string | null }>(
      `SELECT current_version_id FROM problem_brief WHERE investigation_id = $1`,
      [investigationId],
    );
    supersedesVersionId = pbResult.rows[0]?.current_version_id ?? undefined;
  }

  // Step 4 — runtimeIdentifier, server-configured only.
  const runtimeIdentifier = RUNTIME_IDENTIFIER;

  // Step 5 — kick off generateBriefVersion without awaiting its resolution, racing onRunCreated
  // against a pre-Phase-1 rejection.
  let resolveRunCreated: (run: GenerationRun) => void;
  let rejectRunCreated: (err: unknown) => void;
  const runCreated = new Promise<GenerationRun>((resolve, reject) => {
    resolveRunCreated = resolve;
    rejectRunCreated = reject;
  });

  const pipeline = generateBriefVersion({
    investigationId,
    supersedesVersionId,
    runtimeIdentifier,
    onRunCreated: (run) => resolveRunCreated(run),
  });

  // Synchronization catch — NOT the finalization safety net (attached separately below, only once
  // `generationRun` is genuinely assigned). Sole job: relay a pre-Phase-1 rejection into
  // `runCreated`. Never references `generationRun`, never writes a terminal record.
  pipeline.catch((err) => {
    rejectRunCreated(err);
  });

  let generationRun: GenerationRun;
  try {
    generationRun = await runCreated;
  } catch (err) {
    if (isUniqueViolation(err, 'idx_generation_run_investigation_in_progress_unique')) {
      const existing = await pool.query<{ id: string; outcome: 'in-progress' | 'succeeded' | 'failed' }>(
        `SELECT id, outcome FROM generation_run WHERE investigation_id = $1
         ORDER BY started_at DESC LIMIT 1`,
        [investigationId],
      );
      if (existing.rows.length === 0) {
        throw new Error(`Unique violation on ${investigationId} but no GenerationRun row found on lookup`);
      }
      const conflictingRun = existing.rows[0];
      return {
        outcome: 'conflict',
        existingGenerationRunId: conflictingRun.id,
        stillInProgress: conflictingRun.outcome === 'in-progress',
      };
    }
    throw err;
  }

  // Step 5b — after runCreated resolves, the SECOND .catch (finalization safety net) is attached.
  // It can never observe a pre-Phase-1 rejection and can never dereference an unassigned
  // generationRun.
  pipeline.catch(async (err) => {
    let current: { outcome: 'in-progress' | 'succeeded' | 'failed' };
    try {
      current = await getGenerationRunOutcome(generationRun.id);
    } catch (readErr) {
      console.error('safety-net: failed to read persisted GenerationRun state', {
        generationRunId: generationRun.id,
        readErr,
        originalErr: err,
      });
      return;
    }

    if (current.outcome !== 'in-progress') {
      console.error('generateBriefVersion rejected; run already terminal, no action taken', {
        generationRunId: generationRun.id,
        persistedOutcome: current.outcome,
        err,
      });
      return;
    }

    try {
      const nowIso = new Date().toISOString();
      await recordGenerationStep({
        generationRunId: generationRun.id,
        fenceToken: generationRun.fenceToken,
        step: {
          component: 'Generation Run Connector: finalization safety net',
          outcome: 'failed',
          error: err instanceof Error ? err.message : String(err),
          startedAt: nowIso,
          completedAt: nowIso,
          inputRefs: [],
          outputRefs: [],
        },
      });
      await finalizeGenerationRun({
        generationRunId: generationRun.id,
        outcome: 'failed',
        briefVersionId: null,
        fenceToken: generationRun.fenceToken,
      });
      console.error('generateBriefVersion meta-failure — wrote terminal record (best-effort)', {
        generationRunId: generationRun.id,
        err,
      });
    } catch (writeErr) {
      console.error('safety-net: best-effort terminal write itself failed', {
        generationRunId: generationRun.id,
        writeErr,
        originalErr: err,
      });
    }
  });

  return { outcome: 'started', generationRunId: generationRun.id };
}

// POST /api/investigations/:id/generation-runs — 02-ARCHITECTURE.md §4.2.
interface GenerationRunConflictResponseBody {
  error: 'generation-run-conflict';
  existingGenerationRunId: string;
  stillInProgress: boolean;
  message: string;
}
apiRoutes.post(
  '/api/investigations/:id/generation-runs',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await createGenerationRunForInvestigation(req.params.id);
      switch (result.outcome) {
        case 'not-found':
          res.status(404).json({ error: 'investigation-not-found' });
          return;
        case 'ineligible':
          res.status(422).json({
            outcome: 'ineligible',
            currentStatus: result.currentStatus,
            reason: result.reason,
          });
          return;
        case 'conflict': {
          const body: GenerationRunConflictResponseBody = {
            error: 'generation-run-conflict',
            existingGenerationRunId: result.existingGenerationRunId,
            stillInProgress: result.stillInProgress,
            message: result.stillInProgress
              ? 'A generation run is already in progress for this investigation.'
              : 'The conflicting generation run has already finished — you can retry now.',
          };
          res.status(409).json(body);
          return;
        }
        case 'started':
          res.status(202).json({ generationRunId: result.generationRunId });
          return;
      }
    } catch (err) {
      res.status(500).json({ error: 'generation-run-start-failed', message: (err as Error).message });
    }
  },
);

// POST /api/investigations/:id/generation-runs/:runId/abandon — 02-ARCHITECTURE.md §1.6/§3.1c.
interface AbandonGenerationRunResponseBody {
  generationRunId: string;
  outcome: 'failed';
}
interface AbandonGenerationRunNotEligibleResponseBody {
  error: 'abandon-not-eligible';
  generationRunId: string;
  currentOutcome: 'in-progress' | 'succeeded' | 'failed';
  livenessState: 'active' | 'stale-or-interrupted' | 'terminal';
  message: string;
}

/** §4.9's relative-cadence `computeLivenessState` needs this run's own GenerationStep completion
 *  timestamps (ascending) to derive its observed step-to-step gap — no fixed threshold constant.
 *  Shared by both `computeLivenessState` calls below (initial read and post-fence-loss re-read). */
async function getStepCompletionTimestamps(generationRunId: string): Promise<string[]> {
  const result = await pool.query<{ completed_at: Date }>(
    `SELECT completed_at FROM generation_step
      WHERE generation_run_id = $1
      ORDER BY step_index ASC`,
    [generationRunId],
  );
  return result.rows.map((r) => r.completed_at.toISOString());
}

/** Test-only race-window hook for `abandonGenerationRun`. Fires immediately after the step-3
 *  classification read (the `computeLivenessState` call below) and before step 4's guarded
 *  fence-increment UPDATE — the exact window a test needs to inject a concurrent
 *  `recordGenerationStep` heartbeat renewal that should cause the guarded UPDATE's
 *  `heartbeat_revision` check to miss. Defaults to a no-op in production. */
let abandonHeartbeatRaceDelayForTests: (() => Promise<void>) | null = null;

export function __setAbandonHeartbeatRaceDelayForTests(delay: (() => Promise<void>) | null): void {
  abandonHeartbeatRaceDelayForTests = delay;
}

export function __resetAbandonHeartbeatRaceDelayForTests(): void {
  abandonHeartbeatRaceDelayForTests = null;
}

/** §1.6 — the human-initiated recovery path for a run `computeLivenessState` classifies
 *  'stale-or-interrupted'. Finalizes it 'failed' via the existing exactly-once
 *  `finalizeGenerationRun`, clearing §1.1's concurrency guard so retry becomes possible. Never
 *  invoked automatically. */
export async function abandonGenerationRun(
  investigationId: string,
  generationRunId: string,
): Promise<
  | { outcome: 'not-found' }
  | {
      outcome: 'not-eligible';
      currentOutcome: 'in-progress' | 'succeeded' | 'failed';
      livenessState: 'active' | 'stale-or-interrupted' | 'terminal';
    }
  | { outcome: 'abandoned' }
> {
  // Steps 1-3 — one read that classifies liveness and captures the exact fence_token/
  // heartbeat_revision values this request will gate step 4 on.
  const readResult = await pool.query<{
    outcome: 'in-progress' | 'succeeded' | 'failed';
    started_at: Date;
    lease_heartbeat_at: Date;
    fence_token: number;
    heartbeat_revision: number;
    investigation_id: string;
  }>(
    `SELECT outcome, started_at, lease_heartbeat_at, fence_token, heartbeat_revision, investigation_id
       FROM generation_run WHERE id = $1`,
    [generationRunId],
  );
  if (readResult.rows.length === 0 || readResult.rows[0].investigation_id !== investigationId) {
    return { outcome: 'not-found' };
  }
  const row = readResult.rows[0];
  if (row.outcome !== 'in-progress') {
    return { outcome: 'not-eligible', currentOutcome: row.outcome, livenessState: 'terminal' };
  }
  const stepCompletionTimestamps = await getStepCompletionTimestamps(generationRunId);
  const { livenessState } = computeLivenessState(
    {
      outcome: row.outcome,
      leaseHeartbeatAt: row.lease_heartbeat_at.toISOString(),
      startedAt: row.started_at.toISOString(),
    },
    stepCompletionTimestamps,
  );
  if (livenessState === 'active') {
    return { outcome: 'not-eligible', currentOutcome: 'in-progress', livenessState: 'active' };
  }

  if (abandonHeartbeatRaceDelayForTests) {
    await abandonHeartbeatRaceDelayForTests();
  }

  // Step 4 — authorization: lock investigation FOR UPDATE first (lock-order fix, matching Phase
  // 4's own order), THEN the guarded fence-increment UPDATE, gated on BOTH fence_token AND
  // heartbeat_revision read above.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const investigationRow = await client.query<{ problem_brief_id: string | null }>(
      `SELECT problem_brief_id FROM investigation WHERE id = $1 FOR UPDATE`,
      [investigationId],
    );
    if (investigationRow.rows.length === 0) {
      await client.query('ROLLBACK');
      return { outcome: 'not-found' };
    }
    const isCorrection = investigationRow.rows[0].problem_brief_id !== null;

    const fenceResult = await client.query<{ fence_token: number }>(
      `UPDATE generation_run SET fence_token = fence_token + 1
        WHERE id = $1 AND outcome = 'in-progress' AND fence_token = $2 AND heartbeat_revision = $3
      RETURNING fence_token`,
      [generationRunId, row.fence_token, row.heartbeat_revision],
    );
    if (fenceResult.rowCount === 0) {
      await client.query('ROLLBACK');
      // Re-read the run's real current outcome/livenessState — never the stale values above.
      const reread = await pool.query<{
        outcome: 'in-progress' | 'succeeded' | 'failed';
        started_at: Date;
        lease_heartbeat_at: Date;
      }>(
        `SELECT outcome, started_at, lease_heartbeat_at FROM generation_run WHERE id = $1`,
        [generationRunId],
      );
      const currentOutcome = reread.rows[0]?.outcome ?? row.outcome;
      const rereadStepTimestamps = await getStepCompletionTimestamps(generationRunId);
      const relive = computeLivenessState(
        {
          outcome: currentOutcome,
          leaseHeartbeatAt: (reread.rows[0]?.lease_heartbeat_at ?? row.lease_heartbeat_at).toISOString(),
          startedAt: (reread.rows[0]?.started_at ?? row.started_at).toISOString(),
        },
        rereadStepTimestamps,
      );
      return { outcome: 'not-eligible', currentOutcome, livenessState: relive.livenessState };
    }
    const newFenceToken = fenceResult.rows[0].fence_token;

    // Step 5 — steps 5-7 inside the SAME transaction, committing together.
    const nowIso = new Date().toISOString();
    await recordGenerationStep({
      generationRunId,
      fenceToken: newFenceToken,
      client,
      step: {
        component: 'Operator abandonment',
        outcome: 'failed',
        error: `No progress recorded since ${row.lease_heartbeat_at.toISOString()} — abandoned by operator.`,
        startedAt: nowIso,
        completedAt: nowIso,
        inputRefs: [],
        outputRefs: [],
      },
    });
    await finalizeGenerationRun({
      generationRunId,
      outcome: 'failed',
      briefVersionId: null,
      fenceToken: newFenceToken,
      client,
    });
    if (!isCorrection) {
      await transitionInvestigationStatus(investigationId, 'generation-failed', null, { client });
    }
    await client.query('COMMIT');
    return { outcome: 'abandoned' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      // transaction may already be aborted — safe to ignore
    });
    if (err instanceof GenerationRunAlreadyFinalizedError || err instanceof GenerationRunFencedOutError) {
      const reread = await pool.query<{ outcome: 'in-progress' | 'succeeded' | 'failed' }>(
        `SELECT outcome FROM generation_run WHERE id = $1`,
        [generationRunId],
      );
      const currentOutcome = reread.rows[0]?.outcome ?? 'failed';
      return { outcome: 'not-eligible', currentOutcome, livenessState: 'terminal' };
    }
    throw err;
  } finally {
    client.release();
  }
}

apiRoutes.post(
  '/api/investigations/:id/generation-runs/:runId/abandon',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await abandonGenerationRun(req.params.id, req.params.runId);
      if (result.outcome === 'not-found') {
        res.status(404).json({ error: 'generation-run-not-found' });
        return;
      }
      if (result.outcome === 'not-eligible') {
        const body: AbandonGenerationRunNotEligibleResponseBody = {
          error: 'abandon-not-eligible',
          generationRunId: req.params.runId,
          currentOutcome: result.currentOutcome,
          livenessState: result.livenessState,
          message:
            result.livenessState === 'active'
              ? 'This run is still actively progressing and cannot be abandoned.'
              : 'This run is no longer eligible to be abandoned.',
        };
        res.status(409).json(body);
        return;
      }
      const body: AbandonGenerationRunResponseBody = { generationRunId: req.params.runId, outcome: 'failed' };
      res.status(200).json(body);
    } catch (err) {
      res.status(500).json({ error: 'abandon-failed', message: (err as Error).message });
    }
  },
);

// GET /api/mission-control
// 200 -> MissionControlView (§3). Never 500 on empty data — every array degrades to [], every
// count to 0 (Edge Cases table, row 6).
apiRoutes.get('/api/mission-control', async (req: Request, res: Response): Promise<void> => {
  const view = await getMissionControlView();
  res.status(200).json(view);
});

// GET /api/problem-department
// 200 -> ProblemDepartmentOverview (§3). Zero-Investigation case degrades to empty arrays/nulls —
// never a different shape.
apiRoutes.get(
  '/api/problem-department',
  async (req: Request, res: Response): Promise<void> => {
    const view = await getProblemDepartmentOverview();
    res.status(200).json(view);
  },
);

// POST /api/investigations — extended in place (02-ARCHITECTURE.md §1.4/§3.1b, Add-Source
// Connector) to also accept an existing `investigationId`, appending sources to it rather than
// creating a new Investigation. No new route, no duplication.
interface CreateInvestigationRequestBody {
  artifacts: Array<{ type: string; raw: string }>;
  investigationId?: string;
}
interface CreateInvestigationResponseBody {
  investigationId: string;
  status: InvestigationStatus;
  sourcesAdded: number;
}
apiRoutes.post(
  '/api/investigations',
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as CreateInvestigationRequestBody;
    if (!Array.isArray(body.artifacts) || body.artifacts.length === 0) {
      res.status(400).json({ error: 'at-least-one-artifact-required' });
      return;
    }

    try {
      // Step 2 — pre-mutation status read, existing-Investigation path only.
      let preMutationStatus: InvestigationStatus | null = null;
      if (body.investigationId) {
        try {
          const { investigation } = await getInvestigation(body.investigationId);
          preMutationStatus = investigation.status;
        } catch (err) {
          if (err instanceof InvestigationNotFoundError) {
            res.status(404).json({ error: 'investigation-not-found' });
            return;
          }
          throw err;
        }
      }

      // Step 3 — submitSources + resolveInvestigationSources, unmodified call sites.
      const submission = await submitSources({
        investigationId: body.investigationId,
        origin: 'human',
        artifacts: body.artifacts.map((a) => ({
          type: a.type as SourceArtifactType,
          raw: a.raw.trim(),
        })),
      });
      const { allUnreachable } = await resolveInvestigationSources(submission.investigationId);
      const target: 'open' | 'blocked' = allUnreachable ? 'blocked' : 'open';

      let conflict = false;
      if (preMutationStatus === 'brief-generated') {
        // Step 4, 'brief-generated' branch — explicit skip, never an unconditional call relying
        // on the guard to decline it.
      } else {
        // Step 4 (existing-Investigation, not 'brief-generated') or step 5 (create path).
        const transitioned = await transitionInvestigationStatus(
          submission.investigationId,
          target,
          allUnreachable ? 'No submitted source was reachable.' : null,
        );
        if (!transitioned && preMutationStatus !== null) {
          // Step 6 — existing-Investigation path only: a `false` return needs the
          // benign-no-op-vs-genuine-conflict check against the status observed in step 2.
          const { investigation: reread } = await getInvestigation(submission.investigationId);
          if (reread.status !== preMutationStatus) {
            res.status(409).json({
              error: 'invalid-status-transition',
              investigationId: submission.investigationId,
              status: reread.status,
              message: `Investigation status changed concurrently (now '${reread.status}').`,
            });
            conflict = true;
          }
        }
        // preMutationStatus === null (create path): a `false` return is always benign per §3.1b
        // step 5 — never compared against step 2, since there is no step-2 read on the create
        // path.
      }

      if (conflict) return;

      // Step 7 — real, freshly-read status, never the value the handler attempted or assumed.
      const { investigation: final } = await getInvestigation(submission.investigationId);
      const responseBody: CreateInvestigationResponseBody = {
        investigationId: submission.investigationId,
        status: final.status,
        sourcesAdded: body.artifacts.length,
      };
      res.status(201).json(responseBody);
    } catch (err) {
      res.status(500).json({ error: 'submission-failed', message: (err as Error).message });
    }
  },
);

// GET /api/investigations/:id/workspace — 02-ARCHITECTURE.md §4.4.
apiRoutes.get(
  '/api/investigations/:id/workspace',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const view = await getInvestigationWorkspace(req.params.id);
      if (view === null) {
        res.status(404).json({ error: 'investigation-not-found' });
        return;
      }
      res.status(200).json(view);
    } catch (err) {
      res.status(500).json({ error: 'workspace-read-failed', message: (err as Error).message });
    }
  },
);

// POST /api/source-artifacts/:id/recheck — 02-ARCHITECTURE.md §1.4a.
apiRoutes.post(
  '/api/source-artifacts/:id/recheck',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await recheckSourceArtifact(req.params.id);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof SourceArtifactNotFoundError) {
        res.status(404).json({ error: 'source-artifact-not-found' });
        return;
      }
      if (err instanceof RecheckNotEligibleError) {
        res.status(409).json({
          error: 'recheck-not-eligible',
          sourceArtifactId: err.sourceArtifactId,
          currentResolutionStatus: err.currentResolutionStatus,
          message: `Source artifact ${err.sourceArtifactId} is not eligible for recheck (current status: ${err.currentResolutionStatus}).`,
        });
        return;
      }
      throw err;
    }
  },
);
