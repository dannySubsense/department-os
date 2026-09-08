import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProblemDepartmentScreen } from './ProblemDepartmentScreen.js';
import * as api from '../api.js';
import {
  formatDateTime,
  formatInvestigationLabel,
  humanizeStatus,
  shortenId,
} from '../lib/investigationDisplay.js';
import type {
  ProblemDepartmentOverview,
  InvestigationSummary,
  GenerationRunSummary,
} from '../../types/readModels.js';

// Render/behavior coverage for ProblemDepartmentScreen (04-ROADMAP.md Slice 2 Tests list,
// C2-S2-corrected per 04-ROADMAP.md's Files list for InvestigationPortfolioTable's per-row
// navigation retarget: every row's affordance is now a router <Link> to the new durable workspace
// route, rendered for all four InvestigationStatus values including 'brief-generated' — the
// legacy "Brief ready — review workspace not yet available." plain-text branch was removed. This
// file now wraps every render in a MemoryRouter, since InvestigationPortfolioTable renders a real
// react-router <Link>.

vi.mock('../api.js', () => ({
  fetchProblemDepartmentOverview: vi.fn(),
  createInvestigation: vi.fn(),
}));

// handleSubmitted (ProblemDepartmentScreen.tsx) navigates into the new durable workspace route on
// a successful submission instead of refetching this same-page overview (US-2 AC1) — mock
// useNavigate (keeping the real MemoryRouter/Link machinery via importActual) so that behavior is
// observable without a full <Routes> table.
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

afterEach(() => {
  cleanup();
  mockNavigate.mockClear();
});

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

function buildView(overrides: Partial<ProblemDepartmentOverview> = {}): ProblemDepartmentOverview {
  return {
    department: {
      id: 'problem-department',
      name: 'Problem Department',
      thesis: 'What do people genuinely need, and where is the unresolved demand?',
      status: 'installed',
    },
    investigations: [],
    lastActiveInvestigationId: null,
    sourceCount: 0,
    evidenceCount: 0,
    recentRuns: [],
    ...overrides,
  };
}

async function renderWithView(view: ProblemDepartmentOverview) {
  vi.mocked(api.fetchProblemDepartmentOverview).mockResolvedValue(view);
  render(
    <MemoryRouter>
      <ProblemDepartmentScreen />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText('Problem Department')).toBeInTheDocument());
}

describe('ProblemDepartmentScreen — Investigation portfolio table', () => {
  it('renders every row from a mocked overview, matching label/id/status/createdAt/statusReason', async () => {
    const createdAt1 = '2026-01-01T00:00:00.000Z';
    const createdAt2 = '2026-01-02T00:00:00.000Z';
    await renderWithView(
      buildView({
        investigations: [
          investigation({
            id: 'inv-1',
            status: 'open',
            createdAt: createdAt1,
          }),
          investigation({
            id: 'inv-2',
            status: 'blocked',
            statusReason: 'No source reachable.',
            createdAt: createdAt2,
          }),
        ],
      }),
    );

    expect(screen.getByText(formatInvestigationLabel(createdAt1))).toBeInTheDocument();
    expect(screen.getByText(shortenId('inv-1'))).toBeInTheDocument();
    expect(screen.getAllByText(humanizeStatus('open')).length).toBeGreaterThan(0);
    expect(screen.getByText(formatDateTime(createdAt1))).toBeInTheDocument();

    expect(screen.getByText(formatInvestigationLabel(createdAt2))).toBeInTheDocument();
    expect(screen.getByText(shortenId('inv-2'))).toBeInTheDocument();
    expect(screen.getAllByText(humanizeStatus('blocked')).length).toBeGreaterThan(0);
    expect(screen.getByText(formatDateTime(createdAt2))).toBeInTheDocument();
    expect(screen.getByText('No source reachable.')).toBeInTheDocument();
  });
});

describe('ProblemDepartmentScreen — zero-Investigation empty state', () => {
  it('renders the exact empty-state copy, and Sources/Evidence/Runs sections still render with zero values', async () => {
    await renderWithView(buildView());

    expect(
      screen.getByText('No investigations yet — Start Investigation'),
    ).toBeInTheDocument();

    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    const zeroValues = screen.getAllByText('0');
    expect(zeroValues.length).toBe(2);

    expect(screen.getByText('No runs recorded yet.')).toBeInTheDocument();
  });
});

describe('ProblemDepartmentScreen — status filter', () => {
  it('changing the status filter re-renders the filtered subset with no additional network call', async () => {
    await renderWithView(
      buildView({
        investigations: [
          investigation({ id: 'inv-open', status: 'open' }),
          investigation({ id: 'inv-blocked', status: 'blocked' }),
        ],
      }),
    );

    expect(screen.getByText(shortenId('inv-open'))).toBeInTheDocument();
    expect(screen.getByText(shortenId('inv-blocked'))).toBeInTheDocument();

    const callsBeforeFilter = vi.mocked(api.fetchProblemDepartmentOverview).mock.calls.length;

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'blocked' } });

    expect(screen.queryByText(shortenId('inv-open'))).not.toBeInTheDocument();
    expect(screen.getByText(shortenId('inv-blocked'))).toBeInTheDocument();
    expect(vi.mocked(api.fetchProblemDepartmentOverview).mock.calls.length).toBe(
      callsBeforeFilter,
    );
  });
});

describe('ProblemDepartmentScreen — StartInvestigationForm submission', () => {
  it('a successful submission navigates into the new durable workspace route (US-2 AC1) instead of refetching the portfolio', async () => {
    await renderWithView(buildView());

    vi.mocked(api.createInvestigation).mockResolvedValue({
      investigationId: 'new-inv',
      status: 'open',
      sourcesAdded: 1,
    });
    const callsBeforeSubmit = vi.mocked(api.fetchProblemDepartmentOverview).mock.calls.length;

    fireEvent.change(screen.getByLabelText('Source content'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Investigation' }));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/departments/problem-department/investigations/new-inv',
      ),
    );
    expect(vi.mocked(api.fetchProblemDepartmentOverview).mock.calls.length).toBe(
      callsBeforeSubmit,
    );
  });

  it('a failed submission renders an inline error and does not refetch the portfolio', async () => {
    await renderWithView(buildView());

    vi.mocked(api.createInvestigation).mockRejectedValue(new Error('submission-failed'));
    const callsBeforeSubmit = vi.mocked(api.fetchProblemDepartmentOverview).mock.calls.length;

    fireEvent.change(screen.getByLabelText('Source content'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Investigation' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('submission-failed'));
    expect(vi.mocked(api.fetchProblemDepartmentOverview).mock.calls.length).toBe(
      callsBeforeSubmit,
    );
  });
});

describe('ProblemDepartmentScreen — per-row Open-current-view affordance', () => {
  it('renders the shortened id as plain text plus a router <Link> labeled "Open current view" targeting the new workspace route', async () => {
    await renderWithView(
      buildView({
        investigations: [investigation({ id: 'inv-last-active', status: 'open' })],
        lastActiveInvestigationId: 'inv-last-active',
      }),
    );

    // shortened id renders as plain text
    expect(screen.getByText(shortenId('inv-last-active'))).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Open current view' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveClass('legacy-view-button');
    expect(link).toHaveAttribute(
      'href',
      '/departments/problem-department/investigations/inv-last-active',
    );
  });

  it('renders the same "Open current view" link for a brief-generated row (the legacy no-link branch was removed)', async () => {
    await renderWithView(
      buildView({
        investigations: [investigation({ id: 'inv-last-active', status: 'brief-generated' })],
        lastActiveInvestigationId: 'inv-last-active',
      }),
    );

    expect(
      screen.queryByText('Brief ready — review workspace not yet available.'),
    ).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Open current view' });
    expect(link).toHaveAttribute(
      'href',
      '/departments/problem-department/investigations/inv-last-active',
    );
  });

  it('the affordance is not gated to only the last-active row — a non-last-active row also renders the "Open current view" link, targeting the new workspace route', async () => {
    await renderWithView(
      buildView({
        investigations: [
          investigation({ id: 'inv-last-active', status: 'open' }),
          investigation({ id: 'inv-other', status: 'blocked' }),
        ],
        lastActiveInvestigationId: 'inv-last-active',
      }),
    );

    const links = screen.getAllByRole('link', { name: 'Open current view' });
    expect(links.length).toBe(2);
    expect(links[1]).toHaveAttribute(
      'href',
      '/departments/problem-department/investigations/inv-other',
    );
  });
});

describe('ProblemDepartmentScreen — Runs/Activity panel row rendering', () => {
  it('renders each run row investigation id as plain shortened text, not inside a link', async () => {
    await renderWithView(
      buildView({
        recentRuns: [run({ generationRunId: 'run-1', investigationId: 'inv-run-1' })],
      }),
    );

    const idEl = screen.getByText(shortenId('inv-run-1'));
    expect(idEl.closest('a')).toBeNull();
    expect(
      screen.queryByRole('link', { name: shortenId('inv-run-1') }),
    ).not.toBeInTheDocument();
  });
});

describe('ProblemDepartmentScreen — department status badge removal', () => {
  it('renders no department-status-badge element and no "installed"/"planned" text', async () => {
    await renderWithView(buildView());

    expect(document.querySelector('.department-status-badge')).toBeNull();
    expect(screen.queryByText(/installed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/planned/i)).not.toBeInTheDocument();
  });
});
