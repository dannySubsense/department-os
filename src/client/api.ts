import type { MissionControlView, ProblemDepartmentOverview } from '../types/readModels.js';
import type { InvestigationStatus } from '../types/domain.js';

/** Thin `fetch` wrapper for `GET /api/mission-control`. */
export async function fetchMissionControl(): Promise<MissionControlView> {
  const response = await fetch('/api/mission-control');
  if (!response.ok) {
    throw new Error(`fetchMissionControl: request failed with status ${response.status}`);
  }
  return (await response.json()) as MissionControlView;
}

/** Thin `fetch` wrapper for `GET /api/problem-department`. */
export async function fetchProblemDepartmentOverview(): Promise<ProblemDepartmentOverview> {
  const response = await fetch('/api/problem-department');
  if (!response.ok) {
    throw new Error(`fetchProblemDepartmentOverview: request failed with status ${response.status}`);
  }
  return (await response.json()) as ProblemDepartmentOverview;
}

export interface CreateInvestigationRequestBody {
  artifacts: Array<{ type: string; raw: string }>;
  investigationId?: string;
}
export interface CreateInvestigationResponseBody {
  investigationId: string;
  status: InvestigationStatus;
}

/** Thin `fetch` wrapper for `POST /api/investigations`. Does not itself special-case non-2xx
 *  responses beyond surfacing the server's JSON error body — callers (StartInvestigationForm)
 *  render the inline error and preserve form values on failure. */
export async function createInvestigation(
  body: CreateInvestigationRequestBody,
): Promise<CreateInvestigationResponseBody> {
  const response = await fetch('/api/investigations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `createInvestigation: request failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as { error?: string; message?: string };
      message = errorBody.message ?? errorBody.error ?? message;
    } catch {
      // response body was not JSON — fall back to the generic message above
    }
    throw new Error(message);
  }
  return (await response.json()) as CreateInvestigationResponseBody;
}
