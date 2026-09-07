import type { InvestigationWorkspaceView } from '../../../types/readModels.js';
import { GenerateButton } from '../GenerateButton.js';
import { AddSourceInline } from '../AddSourceInline.js';
import { createGenerationRun, CreateGenerationRunApiError } from '../../api.js';
import { useState } from 'react';

interface GenerationFailedPanelProps {
  workspace: InvestigationWorkspaceView;
  onWorkspaceChanged: () => void;
}

/** Generation-Failed outcome (US-6). `investigation.statusReason` when present; otherwise falls
 *  back to the failed run's own persisted step/error text (02-ARCHITECTURE.md §5.4 rule 3) — never
 *  a blank/generic message in either case. Hosts the shared `GenerateButton` labeled "Retry
 *  generation" and a second `AddSourceInline` instance for adding new evidence before retrying. */
export function GenerationFailedPanel({ workspace, onWorkspaceChanged }: GenerationFailedPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const run = workspace.latestGenerationRun;
  const failedStep = run?.steps.find((s) => s.outcome === 'failed');
  const fallbackMessage =
    workspace.investigation.statusReason ??
    failedStep?.error ??
    'Generation failed for an unrecorded reason.';

  async function handleRetry() {
    setStarting(true);
    setError(null);
    try {
      await createGenerationRun(workspace.investigation.id);
      onWorkspaceChanged();
    } catch (err) {
      if (err instanceof CreateGenerationRunApiError) {
        setError(err.message);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="outcome-status-panel outcome-status-panel--generation-failed" aria-label="Status: Generation Failed">
      <h2 className="outcome-status-panel__title">Generation Failed</h2>
      <p className="outcome-status-panel__body">{fallbackMessage}</p>

      {run ? (
        <ul className="generation-failed-panel__steps">
          {run.steps.map((step, i) => (
            <li key={i}>
              <span>{step.component}</span>
              <span>{step.outcome}</span>
              {step.error ? <span>{step.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <GenerateButton
        label="Retry generation"
        enabled={workspace.generationEligible && !starting}
        onClick={handleRetry}
      />
      {error ? (
        <p className="generation-failed-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      <AddSourceInline investigationId={workspace.investigation.id} onSubmitted={onWorkspaceChanged} />
    </section>
  );
}
