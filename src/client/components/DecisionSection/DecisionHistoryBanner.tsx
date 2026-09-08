import { Link } from 'react-router-dom';
import type { DecisionWithResolvedConditions } from '../../../services/getDecisionsForBriefVersion.js';
import type { WorkspaceDecisionSummary } from '../../../types/readModels.js';

interface DecisionHistoryBannerProps {
  investigationId: string;
  priorDecisions: DecisionWithResolvedConditions[]; // this version's own decisions, scoped to
  // exactly the displayed briefVersionId
  decisionLineage: WorkspaceDecisionSummary[]; // whole-Investigation chronological view, across
  // every BriefVersion in this Investigation's lineage
}

function formatConditions(
  conditions: Array<{ type: string; otherTypeLabel?: string; description: string }>,
): string {
  return conditions
    .map((c) => (c.type === 'other' && c.otherTypeLabel ? `${c.otherTypeLabel}: ${c.description}` : `${c.type}: ${c.description}`))
    .join('; ');
}

/** Renders TWO requirements-distinct lists, never merged (US-10 AC12, US-12): (1) the displayed
 *  version's own `priorDecisions`; (2) the whole-Investigation `decisionLineage`, each entry
 *  labeled by its own human-readable `versionNumber` and rendered as a real, clickable navigation
 *  link to that version's own versioned route. This component renders only these two chronological
 *  lists — it does NOT read or render `assignedState`/`isSuperseded` (that is
 *  `InvestigationIdentityHeader`'s job alone), and it has no control that could write a
 *  `StatusEvent` (Out of Scope, US-12). No raw `StatusEvent` row, `targetId`, `briefVersionId`, or
 *  `ReconsiderationCondition` id is rendered as primary content anywhere. */
export function DecisionHistoryBanner({
  investigationId,
  priorDecisions,
  decisionLineage,
}: DecisionHistoryBannerProps) {
  return (
    <div className="decision-history-banner">
      <section className="decision-history-banner__prior-decisions">
        <h3>Decisions on this version</h3>
        {priorDecisions.length === 0 ? (
          <p className="decision-history-banner__empty">No decisions recorded against this version yet.</p>
        ) : (
          <ul>
            {priorDecisions.map((decision) => (
              <li key={decision.id}>
                <span className="decision-history-banner__decision-label">{decision.decision}</span>
                {decision.rationale ? <p>{decision.rationale}</p> : null}
                {decision.reconsiderationConditions.length > 0 ? (
                  <p className="decision-history-banner__conditions">
                    {formatConditions(decision.reconsiderationConditions)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="decision-history-banner__lineage">
        <h3>Decisions across this Investigation</h3>
        {decisionLineage.length === 0 ? (
          <p className="decision-history-banner__empty">No decisions recorded yet.</p>
        ) : (
          <ul>
            {decisionLineage.map((decision) => (
              <li key={decision.id}>
                <Link
                  to={`/departments/problem-department/investigations/${investigationId}/versions/${decision.versionNumber}`}
                >
                  Decision recorded against Version {decision.versionNumber}
                </Link>
                : <span className="decision-history-banner__decision-label">{decision.decision}</span>
                {decision.rationale ? <p>{decision.rationale}</p> : null}
                {decision.reconsiderationConditions.length > 0 ? (
                  <p className="decision-history-banner__conditions">
                    {formatConditions(decision.reconsiderationConditions)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
