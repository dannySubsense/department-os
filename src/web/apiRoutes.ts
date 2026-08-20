import express, { type Request, type Response } from 'express';
import { getMissionControlView } from '../services/getMissionControlView.js';

export const apiRoutes = express.Router();

// GET /api/mission-control
// 200 -> MissionControlView (§3). Never 500 on empty data — every array degrades to [], every
// count to 0 (Edge Cases table, row 6).
apiRoutes.get('/api/mission-control', async (req: Request, res: Response): Promise<void> => {
  const view = await getMissionControlView();
  res.status(200).json(view);
});
