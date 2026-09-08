import { useState } from 'react';
import type { InvestigationWorkspaceView } from '../../../types/readModels.js';
import { GenerateButton } from '../GenerateButton.js';
import { AddSourceInline } from '../AddSourceInline.js';
import { createGenerationRun, CreateGenerationRunApiError } from '../../api.js';

interface BriefGeneratedSummaryPanelProps {
  workspace: InvestigationWorkspaceView;
  onWorkspaceChanged: () => void;
}

/** Current-version `'brief-generated'` summary (§5.4 rule 4 default) — its own `AddSourceInline`
 *  and a "Regenerate with new source snapshot" `GenerateButton`, enabled iff the server-computed
 *  `workspace.generationEligible` is `true`. This is the ONLY control this checkpoint that can
 *  make a `'brief-generated'` Investigation generation-eligible again (via `AddSourceInline`
 *  triggering a workspace re-fetch, which flips `newSourceSnapshotSinceCurrentBriefVersion`/
 *  `generationEligible`). A correction attempt finalized with persisted reason
 *  `'no-new-usable-evidence'` (last persisted failed step's `error`, §5.4 rule 3's exception)
 *  renders that specific reason here, keeping the existing current Brief and Decisions visible,
 *  and leaves generation disabled until another new snapshot is added — the client never infers
 *  evidence usability. */
export function BriefGeneratedSummaryPanel({
  workspace,
  onWorkspaceChanged,
}: BriefGeneratedSummaryPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const run = workspace.latestGenerationRun;
  const failedStep = run?.outcome === 'failed' ? run.steps.find((s) => s.outcome === 'failed') : undefined;
  const noNewUsableEvidence = failedStep?.error === 'no-new-usable-evidence';

  async function handleRegenerate() {
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
    <section className="outcome-status-panel outcome-status-panel--brief-generated" aria-label="Status: Brief Generated">
      <h2 className="outcome-status-panel__title">Brief Generated</h2>
      <p className="outcome-status-panel__body">
        A Problem Brief has been generated for this Investigation. Review the Brief below, or add
        new evidence to trigger a corrective generation.
      </p>

      {noNewUsableEvidence ? (
        <p className="brief-generated-summary-panel__no-new-usable-evidence" role="status">
          The most recently added source did not contribute any usable new evidence. The current
          Brief is unchanged. Add a genuinely new source to attempt another correction.
        </p>
      ) : null}

      <GenerateButton
        label="Regenerate with new source snapshot"
        enabled={workspace.generationEligible && !starting}
        onClick={handleRegenerate}
      />
      {error ? (
        <p className="brief-generated-summary-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      <AddSourceInline investigationId={workspace.investigation.id} onSubmitted={onWorkspaceChanged} />
    </section>
  );
}
