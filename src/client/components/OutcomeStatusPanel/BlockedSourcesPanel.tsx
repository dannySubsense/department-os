import { useState } from 'react';
import type { InvestigationWorkspaceView } from '../../../types/readModels.js';
import { AddSourceInline } from '../AddSourceInline.js';
import { recheckSourceArtifact } from '../../api.js';

interface BlockedSourcesPanelProps {
  investigationId: string;
  sources: InvestigationWorkspaceView['investigation']['sources'];
  onWorkspaceChanged: () => void; // re-fetches GET.../workspace
}

/** Renders each unreachable source with its real `failureReason` (US-5 AC2), a real
 *  `AddSourceInline` instance for adding another source, and its own per-source "Re-check this
 *  source" control calling `recheckSourceArtifact(sourceArtifactId)` (US-5 AC4,
 *  02-ARCHITECTURE.md §1.4a) and re-fetching the workspace on completion. */
export function BlockedSourcesPanel({
  investigationId,
  sources,
  onWorkspaceChanged,
}: BlockedSourcesPanelProps) {
  const [rechecking, setRechecking] = useState<string | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);

  const blockedSources = sources.filter(
    (s) => s.resolutionStatus === 'unreachable' || s.resolutionStatus === 'reachable-no-content',
  );

  async function handleRecheck(sourceArtifactId: string) {
    setRechecking(sourceArtifactId);
    setRecheckError(null);
    try {
      await recheckSourceArtifact(sourceArtifactId);
      onWorkspaceChanged();
    } catch (err) {
      setRecheckError((err as Error).message);
    } finally {
      setRechecking(null);
    }
  }

  return (
    <section className="outcome-status-panel outcome-status-panel--blocked" aria-label="Status: Blocked">
      <h2 className="outcome-status-panel__title">Blocked</h2>
      <p className="outcome-status-panel__body">
        No submitted source was reachable. Add a reachable source, or re-check an unreachable one
        below.
      </p>
      {blockedSources.length === 0 ? (
        <p className="empty-text">No unreachable sources.</p>
      ) : (
        <ul className="blocked-sources-panel__list">
          {blockedSources.map((source) => (
            <li key={source.id} className="blocked-sources-panel__row">
              <span className="blocked-sources-panel__raw">{source.raw}</span>
              {source.resolutionStatus === 'unreachable' ? (
                <>
                  <span className="blocked-sources-panel__reason">{source.failureReason}</span>
                  <button
                    type="button"
                    onClick={() => handleRecheck(source.id)}
                    disabled={rechecking === source.id}
                  >
                    {rechecking === source.id ? 'Re-checking…' : 'Re-check this source'}
                  </button>
                </>
              ) : (
                <span className="blocked-sources-panel__reason">{source.noContentReason}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {recheckError ? (
        <p className="blocked-sources-panel__error" role="alert">
          {recheckError}
        </p>
      ) : null}
      <AddSourceInline investigationId={investigationId} onSubmitted={onWorkspaceChanged} />
    </section>
  );
}
