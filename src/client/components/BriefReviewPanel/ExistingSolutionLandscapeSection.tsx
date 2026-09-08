import type { ExistingSolution, NegativeFinding } from '../../../types/domain.js';
import { NegativeFindingNotice } from './NegativeFindingNotice.js';

interface ExistingSolutionLandscapeSectionProps {
  existingSolutions: ExistingSolution[];
  negativeFindings: NegativeFinding[];
}

export function ExistingSolutionLandscapeSection({
  existingSolutions,
  negativeFindings,
}: ExistingSolutionLandscapeSectionProps) {
  return (
    <section className="brief-review-panel__section brief-review-panel__section--existing-solution-landscape">
      <h3>Existing-Solution Landscape</h3>
      <NegativeFindingNotice negativeFindings={negativeFindings} element="existing-solution" />
      {existingSolutions.map((solution) => (
        <div key={solution.id} className="brief-review-panel__existing-solution">
          <p className="brief-review-panel__existing-solution-name">{solution.name}</p>
          <p>
            <strong>What it addresses:</strong> {solution.whatItAddresses}
          </p>
          <p>
            <strong>How people cope now:</strong> {solution.howPeopleCopeNow}
          </p>
          <p>
            <strong>Where it's inadequate:</strong> {solution.whereItsInadequate}
          </p>
        </div>
      ))}
    </section>
  );
}
