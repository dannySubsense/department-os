import type { WorkspaceGenerationRunSummary } from '../../../types/readModels.js';
import { formatDateTime } from '../../lib/investigationDisplay.js';

interface RunHistoryListProps {
  generationRuns: WorkspaceGenerationRunSummary[]; // ALL runs for this Investigation, not only the
  // latest and not only the displayed version's producing run — genuinely version-independent by
  // design (§5.2 "Navigate to a Specific Brief Version")
}

/** Per-run runtime identifier/start-completion/outcome/steps for EVERY run in
 *  `workspace.generationRuns`, including each step's real `validationRecords`/`toolInvocations`
 *  and each run's real `webSearchQueries`. Version-independent — does not change when the
 *  displayed Brief version changes. Uncollapsed by default. */
export function RunHistoryList({ generationRuns }: RunHistoryListProps) {
  return (
    <section className="provenance-rail__run-history-list" aria-label="Run history">
      <h4>Run History</h4>
      {generationRuns.length === 0 ? <p>No generation runs recorded yet.</p> : null}
      {generationRuns.map((run) => (
        <div key={run.id} className="provenance-rail__run">
          <p className="provenance-rail__run-header">
            <span className="data-value">{run.runtimeIdentifier}</span> —{' '}
            <span className="data-value">{run.outcome}</span> —{' '}
            {formatDateTime(run.startedAt)}
            {run.completedAt ? ` – ${formatDateTime(run.completedAt)}` : ''}
          </p>
          <ul className="provenance-rail__run-steps">
            {run.steps.map((step, i) => (
              <li key={i}>
                <p>
                  <span className="data-value">{step.component}</span> —{' '}
                  <span className="data-value">{step.outcome}</span>
                  {step.modelIdentifier ? ` — ${step.modelIdentifier}` : ''}
                </p>
                {step.error ? <p>{step.error}</p> : null}
                {step.validationRecords && step.validationRecords.length > 0 ? (
                  <ul className="provenance-rail__validation-records">
                    {step.validationRecords.map((vr, j) => (
                      <li key={j}>
                        {vr.toolName} — {vr.finalOutcome} ({vr.attempts.length} attempt
                        {vr.attempts.length === 1 ? '' : 's'})
                      </li>
                    ))}
                  </ul>
                ) : null}
                {step.toolInvocations && step.toolInvocations.length > 0 ? (
                  <ul className="provenance-rail__tool-invocations">
                    {step.toolInvocations.map((ti, j) => (
                      <li key={j}>
                        {ti.toolName} — {ti.outcome}
                        {ti.failureReason ? ` — ${ti.failureReason}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {run.webSearchQueries.length > 0 ? (
            <ul className="provenance-rail__run-web-search-queries">
              {run.webSearchQueries.map((q) => (
                <li key={q.id}>
                  {q.query}
                  <ul>
                    {q.results.map((r) => (
                      <li key={r.url}>
                        {r.url} — {r.status}
                        {r.failureReason ? ` — ${r.failureReason}` : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  );
}
