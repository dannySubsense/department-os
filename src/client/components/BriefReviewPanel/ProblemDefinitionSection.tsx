import type { ProblemStatement } from '../../../types/domain.js';

interface ProblemDefinitionSectionProps {
  problemStatements: ProblemStatement[];
}

/** Non-negatable (Q-2) — no NegativeFindingNotice rendering path exists here; every real
 *  BriefVersion carries at least one ProblemStatement. Uncollapsed by default. */
export function ProblemDefinitionSection({ problemStatements }: ProblemDefinitionSectionProps) {
  return (
    <section className="brief-review-panel__section brief-review-panel__section--problem-definition">
      <h3>Problem Definition</h3>
      {problemStatements.map((ps) => (
        <div key={ps.id} className="brief-review-panel__problem-statement">
          <p>
            <strong>Who experiences it:</strong> {ps.whoExperiencesIt}
          </p>
          <p>
            <strong>Context/workflow:</strong> {ps.contextOrWorkflow}
          </p>
          <p>
            <strong>Consequence/friction:</strong> {ps.consequenceOrFriction}
          </p>
        </div>
      ))}
    </section>
  );
}
