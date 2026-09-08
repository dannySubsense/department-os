import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GenerationFailedPanel } from './GenerationFailedPanel.js';
import type { InvestigationWorkspaceView, WorkspaceGenerationRunSummary } from '../../../types/readModels.js';

// Render/behavior coverage for GenerationFailedPanel (04-ROADMAP.md C2-S3 Tests list).

vi.mock('../../api.js', () => ({
  createGenerationRun: vi.fn(),
  CreateGenerationRunApiError: class CreateGenerationRunApiError extends Error {},
  addSourcesToInvestigation: vi.fn(),
  CreateInvestigationApiError: class CreateInvestigationApiError extends Error {},
}));

afterEach(() => cleanup());

function buildRun(overrides: Partial<WorkspaceGenerationRunSummary> = {}): WorkspaceGenerationRunSummary {
  return {
    id: 'run-1',
    outcome: 'failed',
    livenessState: 'terminal',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:05.000Z',
    runtimeIdentifier: 'test-runtime',
    steps: [],
    webSearchQueries: [],
    ...overrides,
  };
}

function buildWorkspace(
  run: WorkspaceGenerationRunSummary | null,
  overrides: Partial<InvestigationWorkspaceView['investigation']> = {},
): InvestigationWorkspaceView {
  return {
    investigation: {
      id: 'inv-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'generation-failed',
      statusReason: null,
      sourceCount: 1,
      sources: [],
      ...overrides,
    },
    generationRuns: run ? [run] : [],
    latestGenerationRun: run,
    briefs: [],
    decisionLineage: [],
    generationEligible: true,
    newSourceSnapshotSinceCurrentBriefVersion: false,
  };
}

describe('GenerationFailedPanel', () => {
  it('renders the real investigation.statusReason as the failure reason when present, not a raw enum/code', () => {
    const run = buildRun({
      steps: [
        {
          component: 'Demand Analyzer',
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          outcome: 'failed',
          error: 'RAW_STEP_ERROR_CODE',
        },
      ],
    });
    const workspace = buildWorkspace(run, {
      statusReason: 'a real, human-readable persisted failure reason',
    });

    render(<GenerationFailedPanel workspace={workspace} onWorkspaceChanged={vi.fn()} />);

    expect(
      screen.getByText('a real, human-readable persisted failure reason'),
    ).toBeInTheDocument();
  });

  it('falls back to the failed step\'s own persisted error text when investigation.statusReason is null, still not blank or generic', () => {
    const run = buildRun({
      steps: [
        {
          component: 'Landscape Researcher',
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          outcome: 'failed',
          error: 'a real persisted step-level error message',
        },
      ],
    });
    const workspace = buildWorkspace(run, { statusReason: null });

    const { container } = render(
      <GenerationFailedPanel workspace={workspace} onWorkspaceChanged={vi.fn()} />,
    );

    // The same error text is also rendered a second time, intentionally, in the failed step's
    // own list entry — scope this assertion to the panel body paragraph specifically.
    expect(
      container.querySelector('.outcome-status-panel__body'),
    ).toHaveTextContent('a real persisted step-level error message');
  });

  it('falls back to the honest unrecorded-reason message when neither statusReason nor a failed step\'s error exists', () => {
    const workspace = buildWorkspace(null, { statusReason: null });

    render(<GenerationFailedPanel workspace={workspace} onWorkspaceChanged={vi.fn()} />);

    expect(screen.getByText('Generation failed for an unrecorded reason.')).toBeInTheDocument();
  });

  it('renders the shared GenerateButton labeled "Retry generation"', () => {
    const workspace = buildWorkspace(buildRun(), { statusReason: 'x' });
    render(<GenerationFailedPanel workspace={workspace} onWorkspaceChanged={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Retry generation' })).toBeInTheDocument();
  });
});
