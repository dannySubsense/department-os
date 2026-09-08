import type { UncertaintyStatement } from '../../../types/domain.js';

interface UncertaintySectionProps {
  uncertainty: UncertaintyStatement;
}

/** Non-negatable — every array always contains at least one entry (Architecture §1.8), so this
 *  section never needs a NegativeFindingNotice. */
export function UncertaintySection({ uncertainty }: UncertaintySectionProps) {
  return (
    <section className="brief-review-panel__section brief-review-panel__section--uncertainty">
      <h3>Uncertainty</h3>
      <div>
        <p>
          <strong>What's unknown:</strong>
        </p>
        <ul>
          {uncertainty.whatsUnknown.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <p>
          <strong>What would change the conclusion:</strong>
        </p>
        <ul>
          {uncertainty.whatWouldChangeConclusion.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <p>
          <strong>What's undeterminable:</strong>
        </p>
        <ul>
          {uncertainty.whatsUndeterminable.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
