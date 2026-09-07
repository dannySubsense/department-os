import express, { type Request, type Response } from 'express';
import { getMissionControlView } from '../services/getMissionControlView.js';
import { getProblemDepartmentOverview } from '../services/getProblemDepartmentOverview.js';
import { submitSources } from '../services/submitSources.js';
import { resolveInvestigationSources } from '../services/resolveInvestigationSources.js';
import { transitionInvestigationStatus } from '../services/transitionInvestigationStatus.js';
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

// POST /api/investigations — JSON-equivalent wrapper around the EXISTING submitSources +
// resolveInvestigationSources + transitionInvestigationStatus sequence (src/web/server.ts:64-91),
// calling the identical exported functions with unchanged signatures (US-5 AC1, §5.1).
interface CreateInvestigationRequestBody {
  artifacts: Array<{ type: string; raw: string }>;
  investigationId?: string;
}
interface CreateInvestigationResponseBody {
  investigationId: string;
  status: InvestigationStatus;
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
      const submission = await submitSources({
        investigationId: body.investigationId,
        origin: 'human',
        artifacts: body.artifacts.map((a) => ({
          type: a.type as SourceArtifactType,
          raw: a.raw.trim(),
        })),
      });
      const { allUnreachable } = await resolveInvestigationSources(submission.investigationId);
      const status: InvestigationStatus = allUnreachable ? 'blocked' : 'open';
      await transitionInvestigationStatus(
        submission.investigationId,
        status,
        allUnreachable ? 'No submitted source was reachable.' : null,
      );
      const responseBody: CreateInvestigationResponseBody = {
        investigationId: submission.investigationId,
        status,
      };
      res.status(201).json(responseBody);
    } catch (err) {
      res.status(500).json({ error: 'submission-failed', message: (err as Error).message });
    }
  },
);
