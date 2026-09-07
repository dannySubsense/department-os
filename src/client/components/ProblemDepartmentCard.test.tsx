import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProblemDepartmentCard } from './ProblemDepartmentCard.js';
import type { MissionControlProblemDepartmentSummary } from '../../types/readModels.js';

// Render/interaction coverage for ProblemDepartmentCard (04-ROADMAP.md Slice 1 Tests list,
// POST-CORRECTION §0a — replaces the removed Installed-Departments strip). Danny's ruling items:
// (1) no installed/planned label anywhere; (2) whole card is clickable AND has an explicit
// separately-visible "Open Problem Department →" affordance; (3) counts degrade to 0, never a
// placeholder.

afterEach(() => cleanup());

const summary: MissionControlProblemDepartmentSummary = {
  id: 'problem-department',
  name: 'Problem Department',
  thesis: 'What do people genuinely need, and where is the unresolved demand?',
  investigationCount: 5,
  activeCount: 2,
  needsAttentionCount: 1,
  recentCompletedCount: 3,
};

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}</div>;
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <ProblemDepartmentCard problemDepartment={summary} />
              <LocationDisplay />
            </>
          }
        />
        <Route
          path="/departments/problem-department"
          element={
            <>
              <div>problem department stub</div>
              <LocationDisplay />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProblemDepartmentCard', () => {
  it('renders name, thesis, and all four counts as monospace data-register values', () => {
    renderCard();

    expect(screen.getByText('Problem Department')).toBeInTheDocument();
    expect(
      screen.getByText('What do people genuinely need, and where is the unresolved demand?'),
    ).toBeInTheDocument();

    const investigationCount = screen.getByText('5');
    const activeCount = screen.getByText('2');
    const needsAttentionCount = screen.getByText('1');
    const recentCompletedCount = screen.getByText('3');

    [investigationCount, activeCount, needsAttentionCount, recentCompletedCount].forEach(
      (el) => {
        expect(el).toHaveClass('data-value');
      },
    );
  });

  it('renders no installed/planned label anywhere (Danny\'s ruling item 1)', () => {
    renderCard();
    expect(screen.queryByText(/installed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/planned/i)).not.toBeInTheDocument();
  });

  it('clicking anywhere on the card navigates to /departments/problem-department (Danny\'s ruling item 2)', () => {
    renderCard();

    fireEvent.click(screen.getByText('Problem Department'));

    expect(screen.getByTestId('location-display').textContent).toBe(
      '/departments/problem-department',
    );
    expect(screen.getByText('problem department stub')).toBeInTheDocument();
  });

  it('renders an explicit "Open Problem Department →" affordance as a distinct element from the outer click-target wrapper (Danny\'s ruling item 2)', () => {
    renderCard();

    const affordance = screen.getByText('Open Problem Department →');
    const wrapper = screen.getByRole('link', { name: /Open Problem Department/i });

    // The affordance is a distinct child element inside the outer <Link> wrapper, not the same
    // node as the wrapper itself.
    expect(affordance).not.toBe(wrapper);
    expect(wrapper).toContainElement(affordance);
  });

  it('degrades counts to 0 rather than a placeholder when the summary has zero activity', () => {
    const zeroSummary: MissionControlProblemDepartmentSummary = {
      ...summary,
      investigationCount: 0,
      activeCount: 0,
      needsAttentionCount: 0,
      recentCompletedCount: 0,
    };
    render(
      <MemoryRouter>
        <ProblemDepartmentCard problemDepartment={zeroSummary} />
      </MemoryRouter>,
    );

    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(4);
    zeros.forEach((el) => expect(el).toHaveClass('data-value'));
  });
});
