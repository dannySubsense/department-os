import { Link } from 'react-router-dom';
import type { InvestigationWorkspaceView } from '../../types/readModels.js';
import type { GetBriefForReviewResult } from '../../services/getBriefForReview.js';
import {
  formatDateTime,
  formatInvestigationLabel,
  humanizeStatus,
  shortenId,
} from '../lib/investigationDisplay.js';

interface InvestigationIdentityHeaderProps {
  investigation: InvestigationWorkspaceView['investigation'];
  briefs: InvestigationWorkspaceView['briefs']; // workspace.briefs — "Version N of M" count and
  // backward-link versionNumber resolution
  displayedBrief: GetBriefForReviewResult | null; // the routed/fetched brief for whichever
  // version is currently on screen — source of the compact non-valid/supersession notice
  // (never workspace.briefs.find(isCurrent))
}

/** Renders creation date, status, status reason, source count as the primary human-readable
 *  identity (US-1 AC3) — a shortened id may appear only as a secondary, explicitly-labeled
 *  detail, never the primary label. C2-S4: also renders "Version N of M" for the displayed
 *  BriefVersion, the compact non-valid/supersession (forward) notice, and the backward
 *  supersession link — the SAME displayed-version binding DecisionHistoryBanner will use
 *  (02-ARCHITECTURE.md §5.3, InvestigationIdentityHeader rows). */
export function InvestigationIdentityHeader({
  investigation,
  briefs,
  displayedBrief,
}: InvestigationIdentityHeaderProps) {
  const displayedSummary = displayedBrief
    ? briefs.find((b) => b.briefVersionId === displayedBrief.version.id)
    : undefined;

  return (
    <header className="investigation-identity-header">
      <h1 className="investigation-identity-header__title">
        {formatInvestigationLabel(investigation.createdAt)}
      </h1>
      <p className="data-value investigation-identity-header__id">
        Investigation ID: {shortenId(investigation.id)}
      </p>
      <dl className="investigation-identity-header__facts">
        <dt>Status</dt>
        <dd className="data-value">{humanizeStatus(investigation.status)}</dd>
        <dt>Created</dt>
        <dd className="data-value">{formatDateTime(investigation.createdAt)}</dd>
        <dt>Sources</dt>
        <dd className="data-value">{investigation.sourceCount}</dd>
      </dl>
      {investigation.statusReason ? (
        <p className="investigation-identity-header__status-reason">
          {investigation.statusReason}
        </p>
      ) : null}

      {displayedBrief && briefs.length > 0 ? (
        <div className="investigation-identity-header__version">
          <p className="investigation-identity-header__version-indicator">
            Version {displayedBrief.version.versionNumber} of {briefs.length}
            {displayedSummary?.isCurrent ? ' (current)' : ''}
          </p>

          {/* Compact non-valid/supersession notice — plain-language only when non-'valid'. */}
          {displayedBrief.assignedState !== 'valid' ? (
            <p className="investigation-identity-header__assigned-state" role="status">
              This Brief version has been{' '}
              {displayedBrief.assignedState === 'challenged' ? 'challenged' : 'invalidated'}.
            </p>
          ) : null}

          {/* Forward link — the immediate successor that actually named the displayed version. */}
          {displayedBrief.isSuperseded && displayedSummary?.forwardSupersededByVersionNumber ? (
            <p className="investigation-identity-header__forward-link">
              Version {displayedSummary.forwardSupersededByVersionNumber} of this Brief exists.{' '}
              <Link
                to={`/departments/problem-department/investigations/${investigation.id}/versions/${displayedSummary.forwardSupersededByVersionNumber}`}
              >
                View Version {displayedSummary.forwardSupersededByVersionNumber}
              </Link>
            </p>
          ) : null}

          {/* Backward link — whenever the displayed version's own supersedesVersionId is
              non-null, resolved to a human-readable versionNumber via workspace.briefs. */}
          {displayedBrief.version.supersedesVersionId ? (
            (() => {
              const priorSummary = briefs.find(
                (b) => b.briefVersionId === displayedBrief.version.supersedesVersionId,
              );
              return priorSummary ? (
                <p className="investigation-identity-header__backward-link">
                  <Link
                    to={`/departments/problem-department/investigations/${investigation.id}/versions/${priorSummary.versionNumber}`}
                  >
                    View prior Version {priorSummary.versionNumber}
                  </Link>
                </p>
              ) : null;
            })()
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
