import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
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

// Render/behavior coverage for ProblemDepartmentScreen (04-ROADMAP.md Slice 2 Tests list).
// The last-active-Investigation link is asserted to be a plain <a>, not a router <Link> — this
// file renders with NO Router wrapper anywhere, so a successful render is itself evidence of that
// (matching MissionControlScreen.test.tsx's established convention, though that file needs a
// MemoryRouter for an unrelated component — ProblemDepartmentScreen has no such dependency).

vi.mock('../api.js', () => ({
  fetchProblemDepartmentOverview: vi.fn(),
  createInvestigation: vi.fn(),
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
  render(<ProblemDepartmentScreen />);
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
  it('a successful submission triggers a portfolio refetch', async () => {
    await renderWithView(buildView());

    vi.mocked(api.createInvestigation).mockResolvedValue({
      investigationId: 'new-inv',
      status: 'open',
    });
    const refetchedView = buildView({
      investigations: [investigation({ id: 'new-inv', status: 'open' })],
    });
    vi.mocked(api.fetchProblemDepartmentOverview).mockResolvedValue(refetchedView);

    fireEvent.change(screen.getByLabelText('Source content'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Investigation' }));

    await waitFor(() => expect(screen.getByText(shortenId('new-inv'))).toBeInTheDocument());
    expect(vi.mocked(api.fetchProblemDepartmentOverview).mock.calls.length).toBeGreaterThan(1);
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
  it("renders the shortened id as plain text plus a separate honestly-labeled <a href=\"/investigations/{id}\"> anchor labeled \"Open current view\" (not a router Link)", async () => {
    await renderWithView(
      buildView({
        investigations: [investigation({ id: 'inv-last-active', status: 'open' })],
        lastActiveInvestigationId: 'inv-last-active',
      }),
    );

    // shortened id renders as plain text
    expect(screen.getByText(shortenId('inv-last-active'))).toBeInTheDocument();

    // a separate, honestly-labeled anchor exists alongside it
    const link = screen.getByRole('link', { name: 'Open current view' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveClass('legacy-view-button');
    expect(link).toHaveAttribute('href', '/investigations/inv-last-active');
  });

  it('renders plain text, not a link, when the investigation status is brief-generated', async () => {
    await renderWithView(
      buildView({
        investigations: [investigation({ id: 'inv-last-active', status: 'brief-generated' })],
        lastActiveInvestigationId: 'inv-last-active',
      }),
    );

    expect(
      screen.getByText('Brief ready — review workspace not yet available.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open current view' })).not.toBeInTheDocument();
  });

  it('renders no interactive control at all (no link, no button) for a brief-generated row', async () => {
    await renderWithView(
      buildView({
        investigations: [investigation({ id: 'inv-brief', status: 'brief-generated' })],
      }),
    );

    const row = screen
      .getByText('Brief ready — review workspace not yet available.')
      .closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row!).queryByRole('button')).not.toBeInTheDocument();
  });

  it('the affordance is no longer gated to only the last-active row — a non-last-active row with an actionable status also renders the "Open current view" button', async () => {
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
    expect(links[1]).toHaveAttribute('href', '/investigations/inv-other');
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
