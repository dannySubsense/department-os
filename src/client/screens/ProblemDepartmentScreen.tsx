import { useCallback, useEffect, useState } from 'react';
import { fetchProblemDepartmentOverview } from '../api.js';
import { InvestigationPortfolioTable } from '../components/InvestigationPortfolioTable.js';
import { InvestigationPortfolioEmptyState } from '../components/InvestigationPortfolioEmptyState.js';
import { StartInvestigationForm } from '../components/StartInvestigationForm.js';
import { SourcesEvidenceCounts } from '../components/SourcesEvidenceCounts.js';
import { RunsActivityPanel } from '../components/RunsActivityPanel.js';
import type { ProblemDepartmentOverview } from '../../types/readModels.js';
import type { InvestigationStatus } from '../../types/domain.js';

interface FetchState {
  data: ProblemDepartmentOverview | null;
  error: string | null;
}

/** Renders `ProblemDepartmentOverview`: Department header, Investigation portfolio (or empty
 *  state), Sources/Evidence counts, Runs/Activity, Start Investigation form
 *  (03-UI-SPEC.md Screen: Problem Department Overview). */
export function ProblemDepartmentScreen() {
  const [state, setState] = useState<FetchState>({ data: null, error: null });
  const [statusFilter, setStatusFilter] = useState<InvestigationStatus | 'all'>('all');

  const load = useCallback(() => {
    fetchProblemDepartmentOverview()
      .then((data) => {
        setState({ data, error: null });
      })
      .catch((err: Error) => {
        setState({ data: null, error: err.message });
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchProblemDepartmentOverview()
      .then((data) => {
        if (!cancelled) setState({ data, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ data: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.error) {
    return (
      <div className="screen">
        <div className="page-error" role="alert">
          Failed to load Problem Department: {state.error}
        </div>
      </div>
    );
  }

  if (!state.data) {
    return (
      <div className="screen">
        <div className="page-loading" role="status">
          Loading Problem Department…
        </div>
      </div>
    );
  }

  const overview = state.data;

  // On successful submission, re-fetch GET /api/problem-department once — a one-shot refetch
  // triggered by the submit event, never a polling/interval loop (§8 Anti-Patterns).
  function handleSubmitted() {
    load();
  }

  return (
    <div className="screen problem-department-screen">
      <section className="section" aria-label="Department header">
        <h1 className="screen__title">{overview.department.name}</h1>
        <p className="problem-department-screen__thesis">{overview.department.thesis}</p>
      </section>

      <section className="section" aria-label="Investigation portfolio">
        <h2 className="section__header">Investigation Portfolio</h2>
        {overview.investigations.length === 0 ? (
          <InvestigationPortfolioEmptyState onSubmitted={handleSubmitted} />
        ) : (
          <InvestigationPortfolioTable
            investigations={overview.investigations}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            lastActiveInvestigationId={overview.lastActiveInvestigationId}
          />
        )}
      </section>

      <section className="section" aria-label="Sources and evidence">
        <h2 className="section__header">Sources / Evidence</h2>
        <SourcesEvidenceCounts
          sourceCount={overview.sourceCount}
          evidenceCount={overview.evidenceCount}
        />
      </section>

      <section className="section" aria-label="Runs and activity">
        <h2 className="section__header">Runs / Activity</h2>
        <RunsActivityPanel runs={overview.recentRuns} />
      </section>

      {overview.investigations.length > 0 ? (
        <section className="section" aria-label="Start investigation">
          <StartInvestigationForm onSubmitted={handleSubmitted} />
        </section>
      ) : null}
    </div>
  );
}
