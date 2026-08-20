import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProblemDepartmentScreen } from './ProblemDepartmentScreen.js';
import * as api from '../api.js';
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
  it('renders every row from a mocked overview, matching id/status/createdAt/statusReason', async () => {
    await renderWithView(
      buildView({
        investigations: [
          investigation({
            id: 'inv-1',
            status: 'open',
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
          investigation({
            id: 'inv-2',
            status: 'blocked',
            statusReason: 'No source reachable.',
            createdAt: '2026-01-02T00:00:00.000Z',
          }),
        ],
      }),
    );

    expect(screen.getByText('inv-1')).toBeInTheDocument();
    expect(screen.getAllByText('open').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-01-01T00:00:00.000Z')).toBeInTheDocument();

    expect(screen.getByText('inv-2')).toBeInTheDocument();
    expect(screen.getAllByText('blocked').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-01-02T00:00:00.000Z')).toBeInTheDocument();
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

    expect(screen.getByText('inv-open')).toBeInTheDocument();
    expect(screen.getByText('inv-blocked')).toBeInTheDocument();

    const callsBeforeFilter = vi.mocked(api.fetchProblemDepartmentOverview).mock.calls.length;

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'blocked' } });

    expect(screen.queryByText('inv-open')).not.toBeInTheDocument();
    expect(screen.getByText('inv-blocked')).toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText('new-inv')).toBeInTheDocument());
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

describe('ProblemDepartmentScreen — last-active-Investigation link', () => {
  it("renders the id as plain text plus a separate honestly-labeled <a href=\"/investigations/{id}\"> anchor (not a router Link)", async () => {
    await renderWithView(
      buildView({
        investigations: [investigation({ id: 'inv-last-active', status: 'open' })],
        lastActiveInvestigationId: 'inv-last-active',
      }),
    );

    // id renders as plain text
    expect(screen.getByText('inv-last-active')).toBeInTheDocument();

    // a separate, honestly-labeled anchor exists alongside it
    const link = screen.getByRole('link', { name: 'View current status' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/investigations/inv-last-active');
  });
});
