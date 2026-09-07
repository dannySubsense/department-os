import { useState } from 'react';
import type { WorkspaceGenerationRunSummary } from '../../../types/readModels.js';
import { abandonGenerationRun } from '../../api.js';

interface GenerationProgressPanelProps {
  investigationId: string;
  generationRun: WorkspaceGenerationRunSummary;
  onWorkspaceChanged: () => void; // re-fetches GET.../workspace
}

/** Honest in-progress / stale-interrupted disclosure (US-4, 02-ARCHITECTURE.md §4.9/§5.3).
 *  Renders exactly the persisted `steps` array — never a percent or "currently executing" claim
 *  beyond the last row. Rendered only for the current-version case (§5.4 rule 1); the prior-version
 *  case is C2-S4's `ViewingPriorVersionPanel`. */
export function GenerationProgressPanel({
  investigationId,
  generationRun,
  onWorkspaceChanged,
}: GenerationProgressPanelProps) {
  const [abandoning, setAbandoning] = useState(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const isStale = generationRun.livenessState === 'stale-or-interrupted';

  async function handleRefresh() {
    setRefreshing(true);
    try {
      onWorkspaceChanged();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAbandon() {
    setAbandoning(true);
    setAbandonError(null);
    try {
      await abandonGenerationRun(investigationId, generationRun.id);
      onWorkspaceChanged();
    } catch (err) {
      setAbandonError((err as Error).message);
    } finally {
      setAbandoning(false);
    }
  }

  return (
    <section
      className={
        isStale
          ? 'generation-progress-panel generation-progress-panel--stale'
          : 'generation-progress-panel generation-progress-panel--active'
      }
      aria-label="Generation progress"
    >
      <h3 className="generation-progress-panel__title">Generation in progress</h3>
      <ul className="generation-progress-panel__steps">
        {generationRun.steps.map((step, i) => (
          <li key={i} className="generation-progress-panel__step">
            <span className="generation-progress-panel__step-component">{step.component}</span>
            <span className="generation-progress-panel__step-outcome">{step.outcome}</span>
            {step.error ? <span className="generation-progress-panel__step-error">{step.error}</span> : null}
            {step.modelIdentifier ? (
              <span className="generation-progress-panel__step-model">{step.modelIdentifier}</span>
            ) : null}
          </li>
        ))}
      </ul>

      {generationRun.webSearchQueries.length > 0 ? (
        <ul className="generation-progress-panel__web-searches">
          {generationRun.webSearchQueries.map((q) => (
            <li key={q.id} className="generation-progress-panel__web-search">
              <span>{q.query}</span>
              {q.limitations.length > 0 ? (
                <span className="generation-progress-panel__web-search-limitations">
                  {q.limitations.join('; ')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {isStale ? (
        <div className="generation-progress-panel__stale-disclosure" role="status">
          <p>
            This run has not reported progress recently and may have been interrupted.
          </p>
          <button type="button" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh status'}
          </button>
          <button type="button" onClick={handleAbandon} disabled={abandoning}>
            {abandoning ? 'Abandoning…' : 'Abandon and retry'}
          </button>
          {abandonError ? (
            <p className="generation-progress-panel__abandon-error" role="alert">
              {abandonError}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="generation-progress-panel__gap-notice">
          Generation is running. Persisted progress will appear here as each step completes.
        </p>
      )}
    </section>
  );
}
