import type { MissionControlView } from '../types/readModels.js';

/** Thin `fetch` wrapper for `GET /api/mission-control` — the only `apiClient` function
 *  implemented this slice (Slices 2 and 3 add `fetchDepartments`, `fetchProblemDepartmentOverview`,
 *  `createInvestigation`). */
export async function fetchMissionControl(): Promise<MissionControlView> {
  const response = await fetch('/api/mission-control');
  if (!response.ok) {
    throw new Error(`fetchMissionControl: request failed with status ${response.status}`);
  }
  return (await response.json()) as MissionControlView;
}
