import type { GenerationRunSummary } from '../../types/readModels.js';
import { shortenId } from '../lib/investigationDisplay.js';

interface RunsActivityPanelProps {
  runs: GenerationRunSummary[];
}

/** Presentational: renders `GenerationRunSummary[]` already present on the fetched
 *  `ProblemDepartmentOverview.recentRuns` — no independent fetch of its own (§2, §8
 *  Anti-Patterns). Same shape/columns as Mission Control's activity panel. */
export function RunsActivityPanel({ runs }: RunsActivityPanelProps) {
  if (runs.length === 0) {
    return <p className="empty-text">No runs recorded yet.</p>;
  }
  return (
    <ul className="activity-panel">
      {runs.map((run) => (
        <li key={run.generationRunId} className="activity-panel__row">
          <span className="data-value activity-panel__investigation-id">
            {shortenId(run.investigationId)}
          </span>
          <span className="data-value">{run.runtimeIdentifier}</span>
          <span className="data-value">{run.outcome}</span>
          <span className="data-value">{run.startedAt}</span>
          <span className="data-value">{run.completedAt ?? '—'}</span>
        </li>
      ))}
    </ul>
  );
}
