import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BlockedSourcesPanel } from './BlockedSourcesPanel.js';
import * as api from '../../api.js';
import type { InvestigationWorkspaceView } from '../../../types/readModels.js';

// Render/behavior coverage for BlockedSourcesPanel (04-ROADMAP.md C2-S2 Tests list).

vi.mock('../../api.js', () => ({
  recheckSourceArtifact: vi.fn(),
  addSourcesToInvestigation: vi.fn(),
  CreateInvestigationApiError: class CreateInvestigationApiError extends Error {},
}));

afterEach(() => cleanup());

type Source = InvestigationWorkspaceView['investigation']['sources'][number];

describe('BlockedSourcesPanel', () => {
  it('clicking "Re-check this source" calls the real recheck endpoint for that source id only and triggers a workspace re-fetch', async () => {
    vi.mocked(api.recheckSourceArtifact).mockResolvedValue({
      sourceArtifactId: 'src-unreachable',
      resolutionStatus: 'content-retrieved',
      investigationStatus: 'open',
    });
    const onWorkspaceChanged = vi.fn();
    const sources: Source[] = [
      {
        id: 'src-unreachable',
        type: 'url',
        raw: 'https://dead.example.com',
        resolutionStatus: 'unreachable',
        failureReason: 'HTTP 404',
      },
    ];
    render(
      <BlockedSourcesPanel
        investigationId="inv-1"
        sources={sources}
        onWorkspaceChanged={onWorkspaceChanged}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Re-check this source' }));

    await waitFor(() => expect(onWorkspaceChanged).toHaveBeenCalledTimes(1));
    expect(api.recheckSourceArtifact).toHaveBeenCalledWith('src-unreachable');
  });

  it('renders no "Re-check this source" control for a reachable-no-content row, while the unreachable row keeps its own control', () => {
    const sources: Source[] = [
      {
        id: 'src-no-content',
        type: 'url',
        raw: 'https://empty.example.com',
        resolutionStatus: 'reachable-no-content',
        noContentReason: 'Response body was empty.',
      },
      {
        id: 'src-unreachable',
        type: 'url',
        raw: 'https://dead.example.com',
        resolutionStatus: 'unreachable',
        failureReason: 'HTTP 404',
      },
    ];
    render(
      <BlockedSourcesPanel investigationId="inv-1" sources={sources} onWorkspaceChanged={vi.fn()} />,
    );

    expect(screen.getByText('Response body was empty.')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button', { name: 'Re-check this source' });
    expect(buttons).toHaveLength(1);
    expect(screen.getByText('HTTP 404')).toBeInTheDocument();
  });
});
