import type { Recommendation } from '../../../types/domain.js';

interface SystemRecommendationSectionProps {
  recommendation: Recommendation;
}

/** Non-negatable — the system's own suggestion, never bare/scored (Q-1). */
export function SystemRecommendationSection({ recommendation }: SystemRecommendationSectionProps) {
  return (
    <section className="brief-review-panel__section brief-review-panel__section--system-recommendation">
      <h3>System Recommendation</h3>
      <p className="data-value">{recommendation.decision}</p>
      <p>{recommendation.rationale}</p>
    </section>
  );
}
