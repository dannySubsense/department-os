import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DecisionHistoryBanner } from './DecisionHistoryBanner.js';
import type { DecisionWithResolvedConditions } from '../../../services/getDecisionsForBriefVersion.js';
import type { WorkspaceDecisionSummary } from '../../../types/readModels.js';

// Component coverage for DecisionHistoryBanner (04-ROADMAP.md C2-S5 Tests list).

afterEach(() => cleanup());

function decision(overrides: Partial<DecisionWithResolvedConditions> = {}): DecisionWithResolvedConditions {
  return {
    id: 'd-1',
    briefVersionId: 'bv-1',
    decision: 'Approve',
    decidedAt: '2026-01-01T00:00:00.000Z',
    reconsiderationConditions: [],
    ...overrides,
  };
}

function lineageEntry(overrides: Partial<WorkspaceDecisionSummary> = {}): WorkspaceDecisionSummary {
  return {
    id: 'd-1',
    briefVersionId: 'bv-1',
    versionNumber: 1,
    decision: 'Approve',
    decidedAt: '2026-01-01T00:00:00.000Z',
    reconsiderationConditions: [],
    ...overrides,
  };
}

function renderBanner(props: {
  priorDecisions: DecisionWithResolvedConditions[];
  decisionLineage: WorkspaceDecisionSummary[];
}) {
  render(
    <MemoryRouter initialEntries={['/departments/problem-department/investigations/inv-1']}>
      <Routes>
        <Route
          path="/departments/problem-department/investigations/:investigationId"
          element={
            <DecisionHistoryBanner
              investigationId="inv-1"
              priorDecisions={props.priorDecisions}
              decisionLineage={props.decisionLineage}
            />
          }
        />
        <Route
          path="/departments/problem-department/investigations/:investigationId/versions/:versionNumber"
          element={<div data-testid="versioned-route-landed">Landed on versioned route</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DecisionHistoryBanner', () => {
  it('renders priorDecisions and decisionLineage as two separate, labeled lists, never merged', () => {
    renderBanner({
      priorDecisions: [decision({ id: 'd-this-version' })],
      decisionLineage: [lineageEntry({ id: 'd-other-version', versionNumber: 2, decision: 'Reject' })],
    });

    const thisVersionSection = screen.getByText('Decisions on this version').closest('section')!;
    const lineageSection = screen.getByText('Decisions across this Investigation').closest('section')!;
    expect(within(thisVersionSection).getByText('Approve')).toBeInTheDocument();
    expect(within(thisVersionSection).queryByText('Reject')).not.toBeInTheDocument();
    expect(within(lineageSection).getByText('Reject')).toBeInTheDocument();
    expect(within(lineageSection).queryByText(/^Approve$/)).not.toBeInTheDocument();
  });

  it('regression: two Decisions recorded against the same briefVersionId both appear, in order, in the same per-version history list', () => {
    renderBanner({
      priorDecisions: [
        decision({ id: 'd-1', decision: 'Watch', decidedAt: '2026-01-01T00:00:00.000Z' }),
        decision({ id: 'd-2', decision: 'Approve', decidedAt: '2026-01-02T00:00:00.000Z' }),
      ],
      decisionLineage: [],
    });
    const thisVersionSection = screen.getByText('Decisions on this version').closest('section')!;
    const items = within(thisVersionSection).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Watch')).toBeInTheDocument();
    expect(within(items[1]).getByText('Approve')).toBeInTheDocument();
  });

  it("each decisionLineage entry's version label is a real, clickable navigation link to that version's own versioned route", () => {
    renderBanner({
      priorDecisions: [],
      decisionLineage: [lineageEntry({ id: 'd-lineage-1', versionNumber: 3, decision: 'Approve' })],
    });

    const link = screen.getByRole('link', { name: /Version 3/ });
    expect(link).toHaveAttribute(
      'href',
      '/departments/problem-department/investigations/inv-1/versions/3',
    );
    fireEvent.click(link);
    expect(screen.getByTestId('versioned-route-landed')).toBeInTheDocument();
  });

  it('renders no raw StatusEvent, targetId, briefVersionId, or ReconsiderationCondition id as primary content', () => {
    renderBanner({
      priorDecisions: [
        decision({
          id: '11111111-1111-1111-1111-111111111111',
          briefVersionId: '22222222-2222-2222-2222-222222222222',
        }),
      ],
      decisionLineage: [],
    });
    expect(screen.queryByText('11111111-1111-1111-1111-111111111111')).not.toBeInTheDocument();
    expect(screen.queryByText('22222222-2222-2222-2222-222222222222')).not.toBeInTheDocument();
  });

  it('does not render an assignedState/isSuperseded notice (repositioned to InvestigationIdentityHeader in C2-S4)', () => {
    renderBanner({ priorDecisions: [], decisionLineage: [] });
    expect(screen.queryByText(/challenged/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalidated/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/superseded/i)).not.toBeInTheDocument();
  });
});
