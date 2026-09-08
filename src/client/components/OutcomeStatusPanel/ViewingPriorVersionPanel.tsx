import { Link } from 'react-router-dom';
import type { InvestigationWorkspaceView } from '../../../types/readModels.js';

interface ViewingPriorVersionPanelProps {
  investigationId: string;
  forwardSupersededByVersionNumber: number | null; // this version's own immediate successor —
  // NOT necessarily the current version in a lineage of 3+
  latestGenerationRun: InvestigationWorkspaceView['latestGenerationRun'];
}

/** §5.4 rule 2 — selected whenever the displayed `BriefVersion.isCurrent === false`, regardless of
 *  `investigation.status` and regardless of `latestGenerationRun?.outcome` (including `'failed'`
 *  AND `'in-progress'`). Read-only: no `AddSourceInline`, no `GenerateButton`, no "Abandon and
 *  retry", no other current-run-mutating control of any kind — this component has no code path
 *  that could render any of them (structural, not a runtime suppression). */
export function ViewingPriorVersionPanel({
  investigationId,
  forwardSupersededByVersionNumber,
  latestGenerationRun,
}: ViewingPriorVersionPanelProps) {
  const currentRunActive =
    latestGenerationRun !== null &&
    latestGenerationRun.outcome === 'in-progress' &&
    (latestGenerationRun.livenessState === 'active' ||
      latestGenerationRun.livenessState === 'stale-or-interrupted');

  return (
    <section className="outcome-status-panel outcome-status-panel--viewing-prior-version" aria-label="Status: Viewing Prior Version">
      <p className="outcome-status-panel__body">
        You are viewing a prior version of this Brief. No correction can be triggered from this
        view.
      </p>
      {forwardSupersededByVersionNumber !== null ? (
        <p>
          <Link
            to={`/departments/problem-department/investigations/${investigationId}/versions/${forwardSupersededByVersionNumber}`}
          >
            View Version {forwardSupersededByVersionNumber}
          </Link>
        </p>
      ) : null}
      {currentRunActive ? (
        <p className="outcome-status-panel__current-run-notice" role="status">
          A generation run is currently active/stalled on the current version — go to{' '}
          <Link to={`/departments/problem-department/investigations/${investigationId}`}>
            the current workspace
          </Link>{' '}
          to view or manage it.
        </p>
      ) : null}
    </section>
  );
}
