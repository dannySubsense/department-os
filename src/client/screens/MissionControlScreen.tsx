import { useEffect, useState } from 'react';
import { fetchMissionControl } from '../api.js';
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

/** Renders `MissionControlView`: Installed Departments strip, four Active-work group sections,
 *  activity panel, three recent lists, planned-Departments note (03-UI-SPEC.md Screen: Mission
 *  Control). This is the first implementation of the Visual Direction section's shared visual
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
  const plannedDepartments = view.departments.filter((d) => d.status === 'planned');

  return (
    <div className="screen mission-control-screen">
      <h1 className="screen__title">Mission Control</h1>

      <section className="section" aria-label="Installed Departments">
        <h2 className="section__header">Departments</h2>
        <div className="department-strip">
          {view.departments.map((dept) => (
            <div
              key={dept.id}
              className={
                dept.status === 'installed'
                  ? 'department-tile department-tile--installed'
                  : 'department-tile department-tile--planned'
              }
            >
              <div className="department-tile__name">{dept.name}</div>
              <div className="department-tile__status data-value">{dept.status}</div>
            </div>
          ))}
        </div>
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

      <section className="section" aria-label="Planned Departments note">
        <p className="planned-note">
          {plannedDepartments.length > 0
            ? `${plannedDepartments.map((d) => d.name).join(', ')} ${
                plannedDepartments.length === 1 ? 'is' : 'are'
              } planned but not yet built.`
            : 'All Departments are currently installed.'}
        </p>
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
                <span className="data-value work-group__row-id">{inv.id}</span>
                <span className="data-value work-group__row-status">{inv.status}</span>
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
          <a
            href={`/investigations/${run.investigationId}`}
            className="data-value activity-panel__investigation-link"
          >
            {run.investigationId}
          </a>
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
          {investigations.map((inv, index) =>
            index === 0 ? (
              <li key={inv.id}>
                {/* Last-active Investigation link — plain <a>, not a router <Link> (US-4 AC2). */}
                <span className="data-value">{inv.id}</span>{' '}
                <a href={`/investigations/${inv.id}`} className="data-value">
                  View current status
                </a>{' '}
                <span className="data-value">{inv.status}</span>
              </li>
            ) : (
              <li key={inv.id}>
                <span className="data-value">{inv.id}</span>{' '}
                <span className="data-value">{inv.status}</span>
              </li>
            ),
          )}
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
