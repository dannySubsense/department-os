import { useState } from 'react';
import type { InvestigationWorkspaceView } from '../../../types/readModels.js';
import { GenerateButton } from '../GenerateButton.js';
import { createGenerationRun, CreateGenerationRunApiError } from '../../api.js';

interface OpenEligiblePanelProps {
  workspace: InvestigationWorkspaceView;
  onWorkspaceChanged: () => void;
}

/** Identity/eligibility fact display (02-ARCHITECTURE.md §5.3) plus the real, clickable
 *  `GenerateButton` (C2-S3) — enabled iff `workspace.generationEligible === true`, labeled "Start
 *  generation" when hosted here. */
export function OpenEligiblePanel({ workspace, onWorkspaceChanged }: OpenEligiblePanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function handleStart() {
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
    <section className="outcome-status-panel outcome-status-panel--open" aria-label="Status: Open">
      <h2 className="outcome-status-panel__title">Open</h2>
      <p className="outcome-status-panel__body">
        This Investigation is accepting submissions and has no Brief yet.
      </p>
      <p className="data-value outcome-status-panel__eligibility">
        Generation eligible: {workspace.generationEligible ? 'yes' : 'no'}
      </p>
      <GenerateButton
        label="Start generation"
        enabled={workspace.generationEligible && !starting}
        onClick={handleStart}
      />
      {error ? (
        <p className="outcome-status-panel__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
