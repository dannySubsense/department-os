import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
});
