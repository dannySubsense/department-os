import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GenerationProgressPanel } from './GenerationProgressPanel.js';
import * as api from '../../api.js';
import type { WorkspaceGenerationRunSummary } from '../../../types/readModels.js';

// Render/behavior coverage for GenerationProgressPanel (04-ROADMAP.md C2-S3 Tests list).
//
// Polling itself (starting/stopping a setInterval keyed on livenessState) is owned by
// InvestigationWorkspaceScreen, not this component — GenerationProgressPanel is a stateless
// display of one already-fetched `generationRun` plus its own "Refresh status"/"Abandon and
// retry" handlers, which merely call `onWorkspaceChanged` (a re-fetch) or the real
// `abandonGenerationRun` API. This suite therefore tests what this component actually owns: it
// renders exactly the persisted steps/web-search fields, and it renders the distinct
// stale/interrupted disclosure (with both controls) only when `livenessState ===
// 'stale-or-interrupted'`, never a fixed millisecond threshold (the REDESIGNED relative-gap
// logic lives in the read-model computation, not here).

vi.mock('../../api.js', () => ({
  abandonGenerationRun: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.mocked(api.abandonGenerationRun).mockReset();
});

function buildRun(overrides: Partial<WorkspaceGenerationRunSummary> = {}): WorkspaceGenerationRunSummary {
  return {
    id: 'run-1',
    outcome: 'in-progress',
    livenessState: 'active',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    runtimeIdentifier: 'test-runtime',
    steps: [],
    webSearchQueries: [],
    ...overrides,
  };
}

describe('GenerationProgressPanel', () => {
  it('renders exactly the persisted steps array, including component/outcome/error/modelIdentifier fields, and the webSearchQueries', () => {
    const run = buildRun({
      steps: [
        {
          component: 'Extraction',
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:01.000Z',
          outcome: 'succeeded',
          modelIdentifier: 'gpt-test',
        },
        {
          component: 'Demand Analyzer',
          startedAt: '2026-01-01T00:00:01.000Z',
          completedAt: '2026-01-01T00:00:02.000Z',
          outcome: 'failed',
          error: 'a real failure reason',
        },
      ],
      webSearchQueries: [
        {
          id: 'wsq-1',
          query: 'real query text',
          performedAt: '2026-01-01T00:00:00.500Z',
          scopeNote: null,
          limitations: ['a real limitation'],
          results: [],
        },
      ],
    });

    render(
      <GenerationProgressPanel
        investigationId="inv-1"
        generationRun={run}
        onWorkspaceChanged={vi.fn()}
      />,
    );

    expect(screen.getByText('Extraction')).toBeInTheDocument();
    expect(screen.getByText('gpt-test')).toBeInTheDocument();
    expect(screen.getByText('Demand Analyzer')).toBeInTheDocument();
    expect(screen.getByText('a real failure reason')).toBeInTheDocument();
    expect(screen.getByText('real query text')).toBeInTheDocument();
    expect(screen.getByText('a real limitation')).toBeInTheDocument();
  });

  it('renders neither "Refresh status" nor "Abandon and retry" and shows the no-progress-yet notice when livenessState is active and steps is empty', () => {
    render(
      <GenerationProgressPanel
        investigationId="inv-1"
        generationRun={buildRun({ livenessState: 'active', steps: [] })}
        onWorkspaceChanged={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Refresh status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abandon and retry' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/No progress recorded yet\. If a previous attempt on this Investigation/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Generation is running. Persisted progress will appear here as each step completes.'),
    ).not.toBeInTheDocument();
  });

  it('renders the "Generation is running" message (not the no-progress-yet notice) when livenessState is active and one or more steps are present', () => {
    render(
      <GenerationProgressPanel
        investigationId="inv-1"
        generationRun={buildRun({
          livenessState: 'active',
          steps: [
            {
              component: 'Extraction',
              startedAt: '2026-01-01T00:00:00.000Z',
              completedAt: '2026-01-01T00:00:01.000Z',
              outcome: 'succeeded',
            },
          ],
        })}
        onWorkspaceChanged={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Generation is running. Persisted progress will appear here as each step completes.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No progress recorded yet\. If a previous attempt on this Investigation/),
    ).not.toBeInTheDocument();
  });

  it('renders the distinct stale/interrupted disclosure with both "Refresh status" and "Abandon and retry" controls when livenessState is stale-or-interrupted, and "Refresh status" triggers a re-fetch via onWorkspaceChanged', async () => {
    const onWorkspaceChanged = vi.fn();
    render(
      <GenerationProgressPanel
        investigationId="inv-1"
        generationRun={buildRun({ livenessState: 'stale-or-interrupted' })}
        onWorkspaceChanged={onWorkspaceChanged}
      />,
    );

    const refreshButton = screen.getByRole('button', { name: 'Refresh status' });
    const abandonButton = screen.getByRole('button', { name: 'Abandon and retry' });
    expect(refreshButton).toBeInTheDocument();
    expect(abandonButton).toBeInTheDocument();

    fireEvent.click(refreshButton);
    await waitFor(() => expect(onWorkspaceChanged).toHaveBeenCalledTimes(1));
  });

  it('"Abandon and retry" calls the real abandonGenerationRun API for this run and triggers a re-fetch, surfacing a real error on rejection', async () => {
    vi.mocked(api.abandonGenerationRun).mockRejectedValueOnce(new Error('abandon-failed'));
    const onWorkspaceChanged = vi.fn();
    render(
      <GenerationProgressPanel
        investigationId="inv-1"
        generationRun={buildRun({ id: 'run-42', livenessState: 'stale-or-interrupted' })}
        onWorkspaceChanged={onWorkspaceChanged}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abandon and retry' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('abandon-failed'));
    expect(api.abandonGenerationRun).toHaveBeenCalledWith('inv-1', 'run-42');
    expect(onWorkspaceChanged).not.toHaveBeenCalled();
  });
});
