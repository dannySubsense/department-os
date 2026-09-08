import type { MissionControlView, ProblemDepartmentOverview } from '../types/readModels.js';
import type { InvestigationStatus, SourceArtifactType, SourceResolution } from '../types/domain.js';
import type { InvestigationWorkspaceView } from '../types/readModels.js';
import type { GetBriefForReviewResult } from '../services/getBriefForReview.js';

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
  sourcesAdded: number; // §3.1b — count of artifacts accepted this request
}

/** Typed error thrown by `createInvestigation` on a non-2xx response — carries the server's real
 *  error `code`/`status`/`message` so callers (`AddSourceInline`, `StartInvestigationForm`) can
 *  branch on `.code` and read `.status` directly, rather than string-matching a message
 *  (02-ARCHITECTURE.md §3.1b/§5.3). */
export class CreateInvestigationApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: InvestigationStatus,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'CreateInvestigationApiError';
  }
}

/** Thin `fetch` wrapper for `POST /api/investigations`. On a non-2xx response, parses and
 *  preserves the response body's typed shape into a `CreateInvestigationApiError` instead of a
 *  bare `Error` — callers render the inline error and preserve form values on failure. */
export async function createInvestigation(
  body: CreateInvestigationRequestBody,
): Promise<CreateInvestigationResponseBody> {
  const response = await fetch('/api/investigations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let errorBody: { error?: string; status?: InvestigationStatus; message?: string } = {};
    try {
      errorBody = (await response.json()) as typeof errorBody;
    } catch {
      // response body was not JSON — fall back to the generic error below
    }
    throw new CreateInvestigationApiError(
      errorBody.error ?? 'unknown-error',
      errorBody.status,
      errorBody.message ??
        errorBody.error ??
        `createInvestigation: request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as CreateInvestigationResponseBody;
}

/** Thin `fetch` wrapper for `GET /api/investigations/:id/workspace` (§4.4). */
export async function fetchInvestigationWorkspace(
  investigationId: string,
): Promise<InvestigationWorkspaceView> {
  const response = await fetch(`/api/investigations/${investigationId}/workspace`);
  if (!response.ok) {
    throw new Error(
      `fetchInvestigationWorkspace: request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as InvestigationWorkspaceView;
}

/** Thin wrapper around the EXISTING `createInvestigation`/`POST /api/investigations` route
 *  (§1.4, §3.1b, §5.2, per the Add-Source-route ruling) — always supplies `investigationId`. No
 *  `:id/sources` sub-route exists or is added. */
export async function addSourcesToInvestigation(
  investigationId: string,
  artifacts: Array<{ type: SourceArtifactType; raw: string }>,
): Promise<CreateInvestigationResponseBody> {
  return createInvestigation({ investigationId, artifacts });
}

// ---- Generation Run Connector (§4.2) ----

export interface CreateGenerationRunIneligibleBody {
  outcome: 'ineligible';
  currentStatus: InvestigationStatus;
  reason: string;
}
export interface CreateGenerationRunConflictBody {
  error: 'generation-run-conflict';
  existingGenerationRunId: string;
  stillInProgress: boolean;
  message: string;
}

/** Typed error thrown by `createGenerationRun` on a non-2xx response — callers branch on `.kind`
 *  and `.body` rather than string-matching a message. */
export class CreateGenerationRunApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: CreateGenerationRunIneligibleBody | CreateGenerationRunConflictBody | { error: string; message?: string },
  ) {
    super('reason' in body ? body.reason : 'message' in body && body.message ? body.message : 'createGenerationRun failed');
    this.name = 'CreateGenerationRunApiError';
  }
}

/** Thin `fetch` wrapper for `POST /api/investigations/:id/generation-runs` (§4.2). Resolves
 *  `202 { generationRunId }` the instant the concurrency-guarding row exists — never awaits the
 *  full pipeline. */
export async function createGenerationRun(investigationId: string): Promise<{ generationRunId: string }> {
  const response = await fetch(`/api/investigations/${investigationId}/generation-runs`, {
    method: 'POST',
  });
  if (!response.ok) {
    let body: CreateGenerationRunIneligibleBody | CreateGenerationRunConflictBody | { error: string; message?: string } = {
      error: 'unknown-error',
    };
    try {
      body = await response.json();
    } catch {
      // response body was not JSON — fall back to the generic body above
    }
    throw new CreateGenerationRunApiError(response.status, body);
  }
  return (await response.json()) as { generationRunId: string };
}

/** Thin `fetch` wrapper for `POST /api/investigations/:id/generation-runs/:runId/abandon`
 *  (§1.6/§3.1c). */
export async function abandonGenerationRun(
  investigationId: string,
  generationRunId: string,
): Promise<{ generationRunId: string; outcome: 'failed' }> {
  const response = await fetch(
    `/api/investigations/${investigationId}/generation-runs/${generationRunId}/abandon`,
    { method: 'POST' },
  );
  if (!response.ok) {
    let message = `abandonGenerationRun: request failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as { message?: string; error?: string };
      message = errorBody.message ?? errorBody.error ?? message;
    } catch {
      // response body was not JSON — fall back to the generic message above
    }
    throw new Error(message);
  }
  return (await response.json()) as { generationRunId: string; outcome: 'failed' };
}

/** Typed error thrown by `fetchBriefForReviewByVersionNumber` on a non-2xx response — carries the
 *  server's real `error` code and HTTP `status` so callers (`InvestigationWorkspaceScreen`) can
 *  distinguish `brief-version-not-found` (§5.4 rule 0 — Version Not Found) from
 *  `investigation-not-found` or `invalid-version-number`, rather than string-matching a message. */
export class FetchBriefForReviewApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'FetchBriefForReviewApiError';
  }
}

/** Thin `fetch` wrapper for `GET.../brief-versions/by-version/:versionNumber` (§3.1a). Response
 *  body IS `GetBriefForReviewResult` verbatim — no wrapper object. */
export async function fetchBriefForReviewByVersionNumber(
  investigationId: string,
  versionNumber: number,
): Promise<GetBriefForReviewResult> {
  const response = await fetch(
    `/api/investigations/${investigationId}/brief-versions/by-version/${versionNumber}`,
  );
  if (!response.ok) {
    let code = 'unknown-error';
    try {
      const errorBody = (await response.json()) as { error?: string };
      code = errorBody.error ?? code;
    } catch {
      // response body was not JSON — fall back to the generic code above
    }
    throw new FetchBriefForReviewApiError(response.status, code);
  }
  return (await response.json()) as GetBriefForReviewResult;
}

/** Thin `fetch` wrapper for `POST /api/source-artifacts/:id/recheck` (§1.4a). */
export async function recheckSourceArtifact(sourceArtifactId: string): Promise<{
  sourceArtifactId: string;
  resolutionStatus: SourceResolution['status'];
  investigationStatus: InvestigationStatus;
}> {
  const response = await fetch(`/api/source-artifacts/${sourceArtifactId}/recheck`, {
    method: 'POST',
  });
  if (!response.ok) {
    let message = `recheckSourceArtifact: request failed with status ${response.status}`;
    try {
      const errorBody = (await response.json()) as { error?: string; message?: string };
      message = errorBody.message ?? errorBody.error ?? message;
    } catch {
      // response body was not JSON — fall back to the generic message above
    }
    throw new Error(message);
  }
  return (await response.json()) as {
    sourceArtifactId: string;
    resolutionStatus: SourceResolution['status'];
    investigationStatus: InvestigationStatus;
  };
}
