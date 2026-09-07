import { useEffect, useState } from 'react';
import { fetchMissionControl } from '../api.js';
import { ProblemDepartmentCard } from '../components/ProblemDepartmentCard.js';
import {
  formatInvestigationLabel,
  humanizeStatus,
  shortenId,
} from '../lib/investigationDisplay.js';
import type {
  MissionControlView,
  InvestigationSummary,
  GenerationRunSummary,
  BriefSummary,
  EvidenceSummary,
} from '../../types/readModels.js';

interface FetchState {
  data: MissionControlView | null;
  error: string | null;
}

/** Renders `MissionControlView`: `ProblemDepartmentCard`, four Active-work group sections,
 *  activity panel, three recent lists (03-UI-SPEC.md Screen: Mission Control, POST-CORRECTION
 *  §0a). This is the first implementation of the Visual Direction section's shared visual
 *  language — Slices 2 and 3 reuse these tokens/patterns. */
export function MissionControlScreen() {
  const [state, setState] = useState<FetchState>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchMissionControl()
      .then((data) => {
        if (!cancelled) setState({ data, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ data: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.error) {
    return (
      <div className="screen">
        <div className="page-error" role="alert">
          Failed to load Mission Control: {state.error}
        </div>
      </div>
    );
  }

  if (!state.data) {
    return (
      <div className="screen">
        <div className="page-loading" role="status">
          Loading Mission Control…
        </div>
      </div>
    );
  }

  const view = state.data;

  return (
    <div className="screen mission-control-screen">
      <h1 className="screen__title">Mission Control</h1>

      <section className="section" aria-label="Problem Department">
        <ProblemDepartmentCard problemDepartment={view.problemDepartment} />
      </section>

      <section className="section" aria-label="Active work">
        <h2 className="section__header">Active Work</h2>
        <div className="active-work-groups">
          <ActiveWorkGroup
            label="Active"
            variant="active"
            investigations={view.activeWork.active}
            emptyText="No investigations are actively running."
          />
          <ActiveWorkGroup
            label="Ready / Not Started"
            variant="ready"
            investigations={view.activeWork.readyNotStarted}
            emptyText="No investigations are waiting to start."
          />
          <ActiveWorkGroup
            label="Needs Attention"
            variant="attention"
            investigations={view.activeWork.needsAttention}
            emptyText="No investigations need attention."
          />
          <ActiveWorkGroup
            label="Recent / Completed"
            variant="completed"
            investigations={view.activeWork.recentCompleted}
            emptyText="No recently completed investigations."
          />
        </div>
      </section>

      <section className="section" aria-label="Active orchestrations">
        <h2 className="section__header">Active Orchestrations</h2>
        <ActiveActivityPanel runs={view.activeActivity} />
      </section>

      <section className="section" aria-label="Recent activity">
        <h2 className="section__header">Recent</h2>
        <div className="recent-lists">
          <RecentInvestigationsList investigations={view.recent.investigations} />
          <RecentBriefsList briefs={view.recent.briefs} />
          <RecentEvidenceList evidence={view.recent.evidence} />
        </div>
      </section>
    </div>
  );
}

function ActiveWorkGroup({
  label,
  variant,
  investigations,
  emptyText,
}: {
  label: string;
  variant: 'active' | 'ready' | 'attention' | 'completed';
  investigations: InvestigationSummary[];
  emptyText: string;
}) {
  return (
    <div className={`work-group work-group--${variant}`}>
      <h3 className="work-group__label">{label}</h3>
      {investigations.length === 0 ? (
        <p className="work-group__empty">{emptyText}</p>
      ) : (
        <ul className="work-group__list">
          {investigations.map((inv) => {
            // Row-level rendering rule (Danny's ruling, 2026-08-20): an Active-group row whose
            // real status is 'blocked' (the race-window case) renders with the Needs Attention
            // alarm treatment, not the calmer Active live cue.
            const isBlockedWhileActive = variant === 'active' && inv.status === 'blocked';
            const rowVariant = isBlockedWhileActive ? 'attention' : variant;
            return (
              <li key={inv.id} className={`work-group__row work-group__row--${rowVariant}`}>
                <span className="work-group__row-label">
                  <span className="work-group__row-label-primary">
                    {formatInvestigationLabel(inv.createdAt)}
                  </span>
                  <span className="data-value work-group__row-label-secondary">
                    {shortenId(inv.id)}
                  </span>
                </span>
                <span className="data-value work-group__row-status">
                  {humanizeStatus(inv.status)}
                </span>
                {inv.statusReason ? (
                  <span className="work-group__row-reason">{inv.statusReason}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActiveActivityPanel({ runs }: { runs: GenerationRunSummary[] }) {
  if (runs.length === 0) {
    return <p className="empty-text">No orchestrations are currently running.</p>;
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

function RecentInvestigationsList({ investigations }: { investigations: InvestigationSummary[] }) {
  return (
    <div className="recent-list">
      <h3 className="recent-list__label">Investigations</h3>
      {investigations.length === 0 ? (
        <p className="empty-text">No investigations yet.</p>
      ) : (
        <ul>
          {investigations.map((inv) => (
            <li key={inv.id}>
              <div className="recent-list__label-primary">
                {formatInvestigationLabel(inv.createdAt)}
              </div>
              <div className="data-value recent-list__label-secondary">{shortenId(inv.id)}</div>
              {inv.status === 'brief-generated' ? (
                <p className="investigation-portfolio-table__legacy-note">
                  Brief ready — review workspace not yet available.
                </p>
              ) : (
                <a href={`/investigations/${inv.id}`} className="legacy-view-button">
                  Open current view
                </a>
              )}{' '}
              <span className="data-value">{humanizeStatus(inv.status)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentBriefsList({ briefs }: { briefs: BriefSummary[] }) {
  return (
    <div className="recent-list">
      <h3 className="recent-list__label">Briefs</h3>
      {briefs.length === 0 ? (
        <p className="empty-text">No briefs yet.</p>
      ) : (
        <ul>
          {briefs.map((brief) => (
            <li key={brief.briefVersionId}>
              <span className="data-value">v{brief.versionNumber}</span>{' '}
              <span className="data-value">{brief.recommendationDecision}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentEvidenceList({ evidence }: { evidence: EvidenceSummary[] }) {
  return (
    <div className="recent-list">
      <h3 className="recent-list__label">Evidence</h3>
      {evidence.length === 0 ? (
        <p className="empty-text">No evidence yet.</p>
      ) : (
        <ul>
          {evidence.map((item) => (
            <li key={item.evidenceItemId}>
              <span className="data-value">{item.label}</span> {item.excerptOrSummary}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
