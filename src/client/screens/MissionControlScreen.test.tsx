import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MissionControlScreen } from './MissionControlScreen.js';
import * as api from '../api.js';
import { DEPARTMENTS } from '../../config/departments.js';
import type {
  MissionControlView,
  InvestigationSummary,
  GenerationRunSummary,
} from '../../types/readModels.js';

// Render/behavior coverage for MissionControlScreen (04-ROADMAP.md Slice 1 Tests list).
// MissionControlScreen is rendered with NO Router wrapper anywhere in this file — a deliberate
// choice, not an oversight: react-router-dom's <Link>/<NavLink> throw an invariant violation when
// rendered outside a Router context, so a render that succeeds here is itself evidence the
// last-active-Investigation link is a plain <a>, not a router <Link> (US-4 AC2).

vi.mock('../api.js', () => ({
  fetchMissionControl: vi.fn(),
}));

afterEach(() => cleanup());

function investigation(overrides: Partial<InvestigationSummary>): InvestigationSummary {
  return {
    id: 'inv-default',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function run(overrides: Partial<GenerationRunSummary>): GenerationRunSummary {
  return {
    generationRunId: 'run-default',
    investigationId: 'inv-default',
    runtimeIdentifier: 'test-runtime',
    outcome: 'in-progress',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

function buildView(overrides: Partial<MissionControlView> = {}): MissionControlView {
  return {
    departments: [...DEPARTMENTS],
    activeWork: { active: [], readyNotStarted: [], needsAttention: [], recentCompleted: [] },
    activeActivity: [],
    recent: { investigations: [], briefs: [], evidence: [] },
    ...overrides,
  };
}

async function renderWithView(view: MissionControlView) {
  vi.mocked(api.fetchMissionControl).mockResolvedValue(view);
  render(<MissionControlScreen />);
  await waitFor(() => expect(screen.getByText('Departments')).toBeInTheDocument());
}

describe('MissionControlScreen — Departments strip', () => {
  it('shows exactly 1 installed tile and 3 planned tiles, with no activity numbers on planned tiles', async () => {
    await renderWithView(buildView());

    const installedTiles = document.querySelectorAll('.department-tile--installed');
    const plannedTiles = document.querySelectorAll('.department-tile--planned');
    expect(installedTiles).toHaveLength(1);
    expect(plannedTiles).toHaveLength(3);

    plannedTiles.forEach((tile) => {
      expect(tile.textContent).not.toMatch(/\d/);
    });
  });
});

describe('MissionControlScreen — Active-work groups', () => {
  it('renders the four groups as separate labeled sections, each with its own empty state when empty', async () => {
    await renderWithView(
      buildView({
        activeWork: {
          active: [investigation({ id: 'active-1', status: 'open' })],
          readyNotStarted: [],
          needsAttention: [],
          recentCompleted: [],
        },
      }),
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Ready / Not Started')).toBeInTheDocument();
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    expect(screen.getByText('Recent / Completed')).toBeInTheDocument();

    // active is populated -> no empty text for it
    expect(screen.getByText('active-1')).toBeInTheDocument();
    // the other three each render their own independent empty state
    expect(screen.getByText('No investigations are waiting to start.')).toBeInTheDocument();
    expect(screen.getByText('No investigations need attention.')).toBeInTheDocument();
    expect(screen.getByText('No recently completed investigations.')).toBeInTheDocument();
  });
});

describe('MissionControlScreen — activity panel', () => {
  it('renders only GenerationRunSummary fields, never a currentComponent field', async () => {
    const runWithForeignField = {
      ...run({ generationRunId: 'run-1', investigationId: 'inv-1' }),
      currentComponent: 'demand-analyzer',
    } as GenerationRunSummary & { currentComponent: string };

    await renderWithView(buildView({ activeActivity: [runWithForeignField] }));

    // investigationId is the field the row actually renders (per ActiveActivityPanel) — asserting
    // it confirms the row rendered at all, before asserting the foreign field is absent.
    expect(screen.getByText('inv-1')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('demand-analyzer');
  });
});

describe('MissionControlScreen — recent lists', () => {
  it('renders recent Investigations/Briefs/Evidence in payload order (no client re-sort)', async () => {
    await renderWithView(
      buildView({
        recent: {
          investigations: [
            investigation({ id: 'zzz-last-in-alpha-order', status: 'open' }),
            investigation({ id: 'aaa-first-in-alpha-order', status: 'blocked' }),
          ],
          briefs: [],
          evidence: [],
        },
      }),
    );

    const ids = Array.from(document.querySelectorAll('.recent-list ul li')).map(
      (li) => li.textContent,
    );
    expect(ids[0]).toContain('zzz-last-in-alpha-order');
    expect(ids[1]).toContain('aaa-first-in-alpha-order');
  });

  it("the recent-Investigations top row's last-active link is a plain <a href=\"/investigations/{id}\"> (US-4 AC2)", async () => {
    await renderWithView(
      buildView({
        recent: {
          investigations: [investigation({ id: 'inv-top', status: 'open' })],
          briefs: [],
          evidence: [],
        },
      }),
    );

    const link = screen.getByRole('link', { name: 'View current status' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/investigations/inv-top');
  });
});

describe('MissionControlScreen — loading/error states', () => {
  it('loading, error, and populated states each render visually distinct markers', async () => {
    let rejectFetch!: (err: Error) => void;
    vi.mocked(api.fetchMissionControl).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFetch = reject;
      }),
    );

    render(<MissionControlScreen />);
    expect(screen.getByRole('status')).toHaveClass('page-loading');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rejectFetch(new Error('network down'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveClass('page-error'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Departments')).not.toBeInTheDocument();
  });

  it('the populated state renders neither the loading nor error marker', async () => {
    await renderWithView(buildView());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
