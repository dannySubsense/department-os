import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SourceListPanel } from './SourceListPanel.js';
import type { InvestigationWorkspaceView } from '../../types/readModels.js';

// Render coverage for SourceListPanel (04-ROADMAP.md C2-S2 Tests list, SOL-HIGH-3 fix) — renders
// every source's real persisted resolutionStatus, including 'content-retrieved', the case no
// other component in this checkpoint renders.

afterEach(() => cleanup());

type Source = InvestigationWorkspaceView['investigation']['sources'][number];

describe('SourceListPanel', () => {
  it('renders a distinct, correctly-labeled row for content-retrieved, unreachable, and reachable-no-content sources', () => {
    const sources: Source[] = [
      { id: 's1', type: 'url', raw: 'https://retrieved.example.com', resolutionStatus: 'content-retrieved' },
      { id: 's2', type: 'url', raw: 'https://dead.example.com', resolutionStatus: 'unreachable', failureReason: 'HTTP 404' },
      {
        id: 's3',
        type: 'text',
        raw: 'blank text',
        resolutionStatus: 'reachable-no-content',
        noContentReason: 'Empty body',
      },
    ];
    render(<SourceListPanel sources={sources} />);

    expect(screen.getByText('Content retrieved')).toBeInTheDocument();
    expect(screen.getByText('Unreachable')).toBeInTheDocument();
    expect(screen.getByText('No content')).toBeInTheDocument();
    expect(screen.getByText('https://retrieved.example.com')).toBeInTheDocument();
    expect(screen.getByText('https://dead.example.com')).toBeInTheDocument();
    expect(screen.getByText('blank text')).toBeInTheDocument();
  });

  it('never renders a raw enum value for an unrecognized resolutionStatus label', () => {
    const sources: Source[] = [
      { id: 's1', type: 'url', raw: 'https://x.example.com', resolutionStatus: 'unresolved' },
    ];
    render(<SourceListPanel sources={sources} />);
    expect(screen.getByText('Not yet resolved')).toBeInTheDocument();
    expect(screen.queryByText('unresolved')).not.toBeInTheDocument();
  });

  it('renders empty-state copy when there are no sources', () => {
    render(<SourceListPanel sources={[]} />);
    expect(screen.getByText('No sources yet.')).toBeInTheDocument();
  });
});
