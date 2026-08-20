import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App.js';
import * as api from './api.js';
import type { MissionControlView } from '../types/readModels.js';

// Client scaffold render coverage (04-ROADMAP.md Slice 1 Tests list, POST-CORRECTION §0a/§6) —
// App mounts and both declared route paths resolve without a routing error; `/departments` is
// NOT a declared route (Danny's ruling — no Departments catalog route this checkpoint).

vi.mock('./api.js', () => ({
  fetchMissionControl: vi.fn(),
}));

afterEach(() => cleanup());

const emptyView: MissionControlView = {
  problemDepartment: {
    id: 'problem-department',
    name: 'Problem Department',
    thesis: 'What do people genuinely need, and where is the unresolved demand?',
    investigationCount: 0,
    activeCount: 0,
    needsAttentionCount: 0,
    recentCompletedCount: 0,
  },
  activeWork: { active: [], readyNotStarted: [], needsAttention: [], recentCompleted: [] },
  activeActivity: [],
  recent: { investigations: [], briefs: [], evidence: [] },
};

describe('App', () => {
  it('renders the real MissionControlScreen at "/"', async () => {
    vi.mocked(api.fetchMissionControl).mockResolvedValue(emptyView);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Mission Control' })).toBeInTheDocument(),
    );
    expect(document.querySelector('nav.persistent-nav')).not.toBeNull();
  });

  it('renders the honest inline stub at "/departments/problem-department" without a routing error', () => {
    render(
      <MemoryRouter initialEntries={['/departments/problem-department']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByText('Problem Department — not built yet this slice.'),
    ).toBeInTheDocument();
    expect(document.querySelector('nav.persistent-nav')).not.toBeNull();
  });

  it('does NOT declare a "/departments" catalog route (Danny\'s ruling — no Departments route this checkpoint)', () => {
    render(
      <MemoryRouter initialEntries={['/departments']}>
        <App />
      </MemoryRouter>,
    );

    // No route matches "/departments" exactly (only "/" and "/departments/problem-department" are
    // declared), so <Routes> renders nothing inside <main> — neither the Mission Control screen
    // nor the Problem Department stub, and no "not built yet" text at all.
    expect(screen.queryByRole('heading', { name: 'Mission Control' })).not.toBeInTheDocument();
    expect(screen.queryByText(/not built yet this slice/)).not.toBeInTheDocument();
  });
});
