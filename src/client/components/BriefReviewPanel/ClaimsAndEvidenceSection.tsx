import type { GetBriefForReviewResult } from '../../../services/getBriefForReview.js';
import type { NegativeFinding } from '../../../types/domain.js';
import { NegativeFindingNotice } from './NegativeFindingNotice.js';

interface ClaimsAndEvidenceSectionProps {
  claimVersions: GetBriefForReviewResult['claimVersions'];
  negativeFindings: NegativeFinding[];
}

/** Claims and Evidence — contradicting evidence rendered inline with supporting evidence, never
 *  hidden or in a separate collapsed tab. Stance is read per `ClaimVersionEvidenceRef`
 *  (`resolvedEvidence`), never from `EvidenceItem` directly. Uncollapsed by default. */
export function ClaimsAndEvidenceSection({
  claimVersions,
  negativeFindings,
}: ClaimsAndEvidenceSectionProps) {
  return (
    <section className="brief-review-panel__section brief-review-panel__section--claims-and-evidence">
      <h3>Claims and Evidence</h3>
      <NegativeFindingNotice negativeFindings={negativeFindings} element="evidence" />
      {claimVersions.map((cv) => (
        <div key={cv.id} className="brief-review-panel__claim">
          <p className="brief-review-panel__claim-text">{cv.text}</p>
          {cv.assignedState !== 'valid' ? (
            <p className="brief-review-panel__claim-assigned-state" role="status">
              This claim has been {cv.assignedState === 'challenged' ? 'challenged' : 'invalidated'}.
            </p>
          ) : null}
          <ul className="brief-review-panel__evidence-list">
            {cv.resolvedEvidence.map((ref) => (
              <li key={ref.evidenceItemId} className={`brief-review-panel__evidence brief-review-panel__evidence--${ref.stance}`}>
                <p className="brief-review-panel__evidence-excerpt">{ref.item.excerptOrSummary}</p>
                <p className="brief-review-panel__evidence-meta">
                  <span className="data-value">{ref.item.label}</span> —{' '}
                  <span className="data-value">{ref.stance}</span>
                </p>
                {ref.relevanceNote ? <p>{ref.relevanceNote}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
