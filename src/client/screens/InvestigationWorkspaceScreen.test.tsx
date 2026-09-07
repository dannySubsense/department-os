import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InvestigationWorkspaceScreen } from './InvestigationWorkspaceScreen.js';
import * as api from '../api.js';
import { shortenId } from '../lib/investigationDisplay.js';
import type { InvestigationWorkspaceView } from '../../types/readModels.js';

// Render/behavior coverage for InvestigationWorkspaceScreen (04-ROADMAP.md C2-S2 Tests list).

vi.mock('../api.js', () => ({
  fetchInvestigationWorkspace: vi.fn(),
  recheckSourceArtifact: vi.fn(),
  addSourcesToInvestigation: vi.fn(),
  createGenerationRun: vi.fn(),
  abandonGenerationRun: vi.fn(),
  CreateGenerationRunApiError: class CreateGenerationRunApiError extends Error {},
  CreateInvestigationApiError: class CreateInvestigationApiError extends Error {},
}));

afterEach(() => cleanup());

function buildWorkspace(overrides: Partial<InvestigationWorkspaceView> = {}): InvestigationWorkspaceView {
  return {
    investigation: {
      id: 'inv-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'open',
      statusReason: null,
      sourceCount: 1,
      sources: [
        { id: 'src-1', type: 'url', raw: 'https://example.com', resolutionStatus: 'content-retrieved' },
      ],
    },
    generationRuns: [],
    latestGenerationRun: null,
    briefs: [],
    decisionLineage: [],
    generationEligible: true,
    newSourceSnapshotSinceCurrentBriefVersion: false,
    ...overrides,
  };
}

async function renderAt(investigationId: string) {
  render(
    <MemoryRouter
      initialEntries={[`/departments/problem-department/investigations/${investigationId}`]}
    >
      <Routes>
        <Route
          path="/departments/problem-department/investigations/:investigationId"
          element={<InvestigationWorkspaceScreen />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InvestigationWorkspaceScreen', () => {
  it('renders the not-found state on a 404', async () => {
    vi.mocked(api.fetchInvestigationWorkspace).mockRejectedValue(
      new Error('fetchInvestigationWorkspace: request failed with status 404'),
    );
    await renderAt('inv-missing');
    await waitFor(() => expect(screen.getByText('Investigation not found.')).toBeInTheDocument());
  });

  it('renders the identity header with human-readable fields, never the raw UUID as primary label, on a 200', async () => {
    const workspace = buildWorkspace({
      investigation: {
        ...buildWorkspace().investigation,
        id: '11111111-2222-3333-4444-555555555555',
      },
    });
    vi.mocked(api.fetchInvestigationWorkspace).mockResolvedValue(workspace);
    await renderAt(workspace.investigation.id);

    await waitFor(() =>
      expect(screen.getByText('Investigation — 2026-01-01 00:00')).toBeInTheDocument(),
    );
    expect(screen.queryByText(workspace.investigation.id)).not.toBeInTheDocument();
    expect(screen.getByText(shortenId(workspace.investigation.id), { exact: false })).toBeInTheDocument();
  });

  it('renders an error state for a non-404 failure', async () => {
    vi.mocked(api.fetchInvestigationWorkspace).mockRejectedValue(new Error('network down'));
    await renderAt('inv-1');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('network down'));
  });

  it('integrated US-5 AC3: Blocked → real AddSourceInline submission → status returns to open → real generation-run start → progresses to a terminal outcome, all in one continuous path', async () => {
    // This file has no shared beforeEach mock reset, so `fetchInvestigationWorkspace`'s call
    // history otherwise accumulates across the earlier tests in this describe block (3 prior
    // calls) before this test's own 4 real calls — inflating the final assertion below to 7
    // unless explicitly cleared first.
    vi.mocked(api.fetchInvestigationWorkspace).mockClear();
    const blockedWorkspace = buildWorkspace({
      investigation: {
        ...buildWorkspace().investigation,
        status: 'blocked',
        sources: [
          {
            id: 'src-dead',
            type: 'url',
            raw: 'https://dead.example.com',
            resolutionStatus: 'unreachable',
            failureReason: 'HTTP 404',
          },
        ],
      },
      generationEligible: false,
    });

    const openWorkspace = buildWorkspace({
      investigation: { ...buildWorkspace().investigation, status: 'open' },
      generationEligible: true,
    });

    const inProgressRun: InvestigationWorkspaceView['latestGenerationRun'] = {
      id: 'run-1',
      outcome: 'in-progress',
      livenessState: 'active',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
      runtimeIdentifier: 'test-runtime',
      steps: [],
      webSearchQueries: [],
    };
    const inProgressWorkspace = buildWorkspace({
      investigation: { ...buildWorkspace().investigation, status: 'open' },
      generationEligible: true,
      latestGenerationRun: inProgressRun,
      generationRuns: [inProgressRun],
    });

    const succeededWorkspace = buildWorkspace({
      investigation: { ...buildWorkspace().investigation, status: 'brief-generated' },
      generationEligible: false,
      latestGenerationRun: { ...inProgressRun, outcome: 'succeeded', livenessState: 'terminal', completedAt: '2026-01-01T00:00:10.000Z' },
      generationRuns: [{ ...inProgressRun, outcome: 'succeeded', livenessState: 'terminal', completedAt: '2026-01-01T00:00:10.000Z' }],
    });

    vi.mocked(api.fetchInvestigationWorkspace)
      .mockResolvedValueOnce(blockedWorkspace) // initial mount
      .mockResolvedValueOnce(openWorkspace) // after AddSourceInline submission re-fetch
      .mockResolvedValueOnce(inProgressWorkspace) // after "Start generation" click re-fetch
      .mockResolvedValueOnce(succeededWorkspace); // after poll re-fetch reaching terminal outcome

    vi.mocked(api.addSourcesToInvestigation).mockResolvedValue({
      investigationId: 'inv-1',
      status: 'open',
      sourcesAdded: 1,
    });
    vi.mocked(api.createGenerationRun).mockResolvedValue({ generationRunId: 'run-1' });

    await renderAt('inv-1');

    // Blocked state, real AddSourceInline submission — scoped to the BlockedSourcesPanel itself
    // (aria-label "Status: Blocked") since the identity header also renders "Blocked" separately.
    await waitFor(() =>
      expect(within(screen.getByRole('region', { name: 'Status: Blocked' })).getByText('Blocked')).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText('Source content'), {
      target: { value: 'https://reachable.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));

    // Status returns to Open — scoped to the OutcomeStatusPanel itself (aria-label "Status: Open")
    // since the identity header also renders "Open" separately, same pattern as the Blocked
    // scoping above.
    await waitFor(() =>
      expect(within(screen.getByRole('region', { name: 'Status: Open' })).getByText('Open')).toBeInTheDocument(),
    );

    // Real "Start generation" click — a real, distinct in-progress run becomes visible.
    fireEvent.click(screen.getByRole('button', { name: 'Start generation' }));
    await waitFor(() => expect(api.createGenerationRun).toHaveBeenCalledWith('inv-1'));
    await waitFor(() => expect(screen.getByText('Generation in progress')).toBeInTheDocument());

    // The active liveness state drives the screen's own poll re-fetch (POLL_INTERVAL_MS), which
    // this test lets fire for real rather than faking timers (matching this file's existing
    // real-timer `waitFor` idiom) — asserts the run reaches a real terminal outcome and the
    // in-progress panel is replaced.
    await waitFor(
      () => expect(screen.queryByText('Generation in progress')).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(api.fetchInvestigationWorkspace).toHaveBeenCalledTimes(4);
  });
});
