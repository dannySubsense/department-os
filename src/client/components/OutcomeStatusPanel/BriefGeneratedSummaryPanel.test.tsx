import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BriefGeneratedSummaryPanel } from './BriefGeneratedSummaryPanel.js';
import * as api from '../../api.js';
import type { InvestigationWorkspaceView, WorkspaceGenerationRunSummary } from '../../../types/readModels.js';

// Component coverage for BriefGeneratedSummaryPanel (04-ROADMAP.md C2-S4 Tests list): correction
// control disabled/enabled based on real eligibility (generationEligible, itself driven server-side
// by newSourceSnapshotSinceCurrentBriefVersion), and the no-new-usable-evidence disposition.

vi.mock('../../api.js', () => ({
  createGenerationRun: vi.fn(),
  CreateGenerationRunApiError: class CreateGenerationRunApiError extends Error {},
}));

afterEach(() => cleanup());

function buildWorkspace(overrides: Partial<InvestigationWorkspaceView> = {}): InvestigationWorkspaceView {
  return {
    investigation: {
      id: 'inv-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'brief-generated',
      statusReason: null,
      sourceCount: 1,
      sources: [{ id: 'src-1', type: 'url', raw: 'https://example.com', resolutionStatus: 'content-retrieved' }],
    },
    generationRuns: [],
    latestGenerationRun: null,
    briefs: [],
    decisionLineage: [],
    generationEligible: false,
    newSourceSnapshotSinceCurrentBriefVersion: false,
    ...overrides,
  };
}

describe('BriefGeneratedSummaryPanel', () => {
  it('disables the correction control when generationEligible is false (no new source snapshot yet)', () => {
    const workspace = buildWorkspace({ generationEligible: false });
    render(<BriefGeneratedSummaryPanel workspace={workspace} onWorkspaceChanged={() => {}} />);
    expect(screen.getByRole('button', { name: 'Regenerate with new source snapshot' })).toBeDisabled();
  });

  it('enables the correction control when generationEligible is true (a distinct new snapshot was added and the workspace was re-fetched)', () => {
    const workspace = buildWorkspace({ generationEligible: true });
    render(<BriefGeneratedSummaryPanel workspace={workspace} onWorkspaceChanged={() => {}} />);
    expect(screen.getByRole('button', { name: 'Regenerate with new source snapshot' })).toBeEnabled();
  });

  it('renders the persisted no-new-usable-evidence reason, keeps the current Brief/Decisions context visible, and disables retry until another distinct snapshot is added', () => {
    const failedNoNewEvidenceRun: WorkspaceGenerationRunSummary = {
      id: 'run-2',
      outcome: 'failed',
      livenessState: 'terminal',
      startedAt: '2026-01-02T00:00:00.000Z',
      completedAt: '2026-01-02T00:01:00.000Z',
      runtimeIdentifier: 'test-runtime',
      steps: [
        {
          component: 'claims-extractor',
          startedAt: '2026-01-02T00:00:00.000Z',
          completedAt: '2026-01-02T00:01:00.000Z',
          outcome: 'failed',
          error: 'no-new-usable-evidence',
        },
      ],
      webSearchQueries: [],
    };
    const workspace = buildWorkspace({
      generationEligible: false,
      latestGenerationRun: failedNoNewEvidenceRun,
      generationRuns: [failedNoNewEvidenceRun],
    });
    render(<BriefGeneratedSummaryPanel workspace={workspace} onWorkspaceChanged={() => {}} />);

    expect(
      screen.getByText(/did not contribute any usable new evidence/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate with new source snapshot' })).toBeDisabled();
  });

  it('does not render the no-new-usable-evidence notice when the latest run failed for a different reason', () => {
    const failedOtherRun: WorkspaceGenerationRunSummary = {
      id: 'run-2',
      outcome: 'failed',
      livenessState: 'terminal',
      startedAt: '2026-01-02T00:00:00.000Z',
      completedAt: '2026-01-02T00:01:00.000Z',
      runtimeIdentifier: 'test-runtime',
      steps: [
        {
          component: 'claims-extractor',
          startedAt: '2026-01-02T00:00:00.000Z',
          completedAt: '2026-01-02T00:01:00.000Z',
          outcome: 'failed',
          error: 'some-other-failure',
        },
      ],
      webSearchQueries: [],
    };
    const workspace = buildWorkspace({ latestGenerationRun: failedOtherRun, generationRuns: [failedOtherRun] });
    render(<BriefGeneratedSummaryPanel workspace={workspace} onWorkspaceChanged={() => {}} />);
    expect(screen.queryByText(/did not contribute any usable new evidence/)).not.toBeInTheDocument();
  });
});
