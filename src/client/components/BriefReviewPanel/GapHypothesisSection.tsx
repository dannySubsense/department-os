import type { GapHypothesis, NegativeFinding } from '../../../types/domain.js';
import { NegativeFindingNotice } from './NegativeFindingNotice.js';

interface GapHypothesisSectionProps {
  gapHypotheses: GapHypothesis[];
  negativeFindings: NegativeFinding[];
}

export function GapHypothesisSection({ gapHypotheses, negativeFindings }: GapHypothesisSectionProps) {
  return (
    <section className="brief-review-panel__section brief-review-panel__section--gap-hypothesis">
      <h3>Gap Hypothesis</h3>
      <NegativeFindingNotice negativeFindings={negativeFindings} element="gap-hypothesis" />
      {gapHypotheses.map((gap) => (
        <div key={gap.id} className="brief-review-panel__gap-hypothesis">
          <p className="data-value">
            {gap.category === 'other' ? gap.otherCategoryLabel : gap.category}
          </p>
          <p>{gap.statement}</p>
        </div>
      ))}
    </section>
  );
}
