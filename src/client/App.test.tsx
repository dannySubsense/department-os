import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App.js';
import * as api from './api.js';
import type { MissionControlView } from '../types/readModels.js';

// Client scaffold render coverage (04-ROADMAP.md Slice 1 Tests list) — App mounts and all three
// route paths resolve without a routing error.

vi.mock('./api.js', () => ({
  fetchMissionControl: vi.fn(),
}));

afterEach(() => cleanup());

const emptyView: MissionControlView = {
  departments: [],
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

  it('renders the honest inline stub at "/departments" without a routing error', () => {
    render(
      <MemoryRouter initialEntries={['/departments']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Departments — not built yet this slice.')).toBeInTheDocument();
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
});
