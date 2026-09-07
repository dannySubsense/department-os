import type { InvestigationWorkspaceView } from '../../types/readModels.js';
import {
  formatDateTime,
  formatInvestigationLabel,
  humanizeStatus,
  shortenId,
} from '../lib/investigationDisplay.js';

interface InvestigationIdentityHeaderProps {
  investigation: InvestigationWorkspaceView['investigation'];
}

/** Renders creation date, status, status reason, source count as the primary human-readable
 *  identity (US-1 AC3) — a shortened id may appear only as a secondary, explicitly-labeled
 *  detail, never the primary label. This slice's own scope: identity only — the compact
 *  non-valid/supersession notice for the displayed BriefVersion is C2-S4's own scope (no
 *  BriefVersion exists yet for this checkpoint's own regions). */
export function InvestigationIdentityHeader({ investigation }: InvestigationIdentityHeaderProps) {
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
    </header>
  );
}
