import type { InvestigationWorkspaceView } from '../../types/readModels.js';

const RESOLUTION_STATUS_LABELS: Record<string, string> = {
  unresolved: 'Not yet resolved',
  unreachable: 'Unreachable',
  'content-retrieved': 'Content retrieved',
  'reachable-no-content': 'No content',
};

function humanizeResolutionStatus(status: string): string {
  return RESOLUTION_STATUS_LABELS[status] ?? status;
}

interface SourceListPanelProps {
  sources: InvestigationWorkspaceView['investigation']['sources'];
}

/** SOL-HIGH-3 fix, relocated from C2-S1's own Browser Demonstration — a small, always-mounted
 *  list rendering each of `investigation.sources`' real `raw`/`type` alongside a human-readable
 *  label for its persisted `resolutionStatus`, never a raw enum value. Rendered for every
 *  workspace state, not gated on any particular `investigation.status`. */
export function SourceListPanel({ sources }: SourceListPanelProps) {
  return (
    <div className="source-list-panel">
      <h3 className="source-list-panel__label">Sources</h3>
      {sources.length === 0 ? (
        <p className="empty-text">No sources yet.</p>
      ) : (
        <ul className="source-list-panel__list">
          {sources.map((source) => (
            <li key={source.id} className="source-list-panel__row">
              <span className="source-list-panel__type data-value">{source.type}</span>
              <span className="source-list-panel__raw">{source.raw}</span>
              <span className="source-list-panel__status">
                {humanizeResolutionStatus(source.resolutionStatus)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
