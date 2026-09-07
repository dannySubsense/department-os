import express, { type Request, type Response } from 'express';
import { getMissionControlView } from '../services/getMissionControlView.js';
import { getProblemDepartmentOverview } from '../services/getProblemDepartmentOverview.js';
import { submitSources } from '../services/submitSources.js';
import { resolveInvestigationSources } from '../services/resolveInvestigationSources.js';
import { transitionInvestigationStatus } from '../services/transitionInvestigationStatus.js';
import { getInvestigation, InvestigationNotFoundError } from '../services/getInvestigation.js';
import { getInvestigationWorkspace } from '../services/getInvestigationWorkspace.js';
import {
  recheckSourceArtifact,
  SourceArtifactNotFoundError,
  RecheckNotEligibleError,
} from '../services/recheckSourceArtifact.js';
import type { InvestigationStatus, SourceArtifactType } from '../types/domain.js';

export const apiRoutes = express.Router();

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
