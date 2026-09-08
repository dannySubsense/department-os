import type { GetBriefForReviewResult } from '../../../services/getBriefForReview.js';
import type { InvestigationWorkspaceView } from '../../../types/readModels.js';

interface EvidenceProvenanceListProps {
  claimVersions: GetBriefForReviewResult['claimVersions'];
  sources: InvestigationWorkspaceView['investigation']['sources'];
}

/** Per-evidence: excerpt, label, source, stance (from `ClaimVersionEvidenceRef`, never
 *  `EvidenceItem`), relevance note — scoped to whichever `BriefVersion` is currently on screen
 *  (renders the resolved evidence for the DISPLAYED version, updates when the target version
 *  changes). Contradicting evidence renders inline with supporting evidence, never hidden or in a
 *  separate collapsed tab. `source` is resolved against `workspace.investigation.sources` by
 *  `sourceArtifactId` — no separate backend fetch. */
export function EvidenceProvenanceList({ claimVersions, sources }: EvidenceProvenanceListProps) {
  // De-duplicate by evidenceItemId across claim versions — the same EvidenceItem may be cited by
  // more than one ClaimVersion; each citation's own stance/relevance is still rendered per claim.
  const rows = claimVersions.flatMap((cv) =>
    cv.resolvedEvidence.map((ref) => ({ claimVersionId: cv.id, ref })),
  );

  return (
    <section className="provenance-rail__evidence-list" aria-label="Evidence">
      <h4>Evidence</h4>
      {rows.length === 0 ? <p>No evidence citations for this Brief version.</p> : null}
      <ul>
        {rows.map(({ claimVersionId, ref }) => {
          const source = sources.find((s) => s.id === ref.item.sourceArtifactId);
          return (
            <li
              key={`${claimVersionId}-${ref.evidenceItemId}`}
              className={`provenance-rail__evidence-row provenance-rail__evidence-row--${ref.stance}`}
            >
              <p className="provenance-rail__evidence-excerpt">{ref.item.excerptOrSummary}</p>
              <p className="provenance-rail__evidence-meta">
                <span className="data-value">{ref.item.label}</span> —{' '}
                <span className="data-value">{ref.stance}</span> —{' '}
                <span className="data-value">{source ? source.raw : ref.item.sourceArtifactId}</span>
              </p>
              {ref.relevanceNote ? <p>{ref.relevanceNote}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
