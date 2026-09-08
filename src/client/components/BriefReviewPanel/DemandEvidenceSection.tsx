import type { DemandConfidenceClassification, DemandSignal, NegativeFinding } from '../../../types/domain.js';
import { NegativeFindingNotice } from './NegativeFindingNotice.js';

interface DemandEvidenceSectionProps {
  demandSignals: DemandSignal[];
  demandConfidence: DemandConfidenceClassification;
  negativeFindings: NegativeFinding[];
}

/** Demand Evidence — signal types plus qualitative Insufficient/Emerging/Substantiated confidence
 *  only (Q-1, binding — never a numeric score). Structurally separate from Personal Pull (own
 *  section, below). Uncollapsed by default. */
export function DemandEvidenceSection({
  demandSignals,
  demandConfidence,
  negativeFindings,
}: DemandEvidenceSectionProps) {
  return (
    <section className="brief-review-panel__section brief-review-panel__section--demand-evidence">
      <h3>Demand Evidence</h3>
      <NegativeFindingNotice negativeFindings={negativeFindings} element="demand-signal-type" />
      <p className="brief-review-panel__demand-confidence">
        Confidence: <span className="data-value">{demandConfidence.level}</span>
      </p>
      <p>{demandConfidence.narrative}</p>
      <ul className="brief-review-panel__demand-signal-list">
        {demandSignals.map((signal) => (
          <li key={signal.id}>
            {signal.type === 'other-observed-behavior' ? signal.otherTypeLabel : signal.type}
          </li>
        ))}
      </ul>
    </section>
  );
}
