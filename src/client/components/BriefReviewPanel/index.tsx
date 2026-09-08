import type { GetBriefForReviewResult } from '../../../services/getBriefForReview.js';
import { ProblemDefinitionSection } from './ProblemDefinitionSection.js';
import { ClaimsAndEvidenceSection } from './ClaimsAndEvidenceSection.js';
import { DemandEvidenceSection } from './DemandEvidenceSection.js';
import { PersonalPullSection } from './PersonalPullSection.js';
import { ExistingSolutionLandscapeSection } from './ExistingSolutionLandscapeSection.js';
import { GapHypothesisSection } from './GapHypothesisSection.js';
import { UncertaintySection } from './UncertaintySection.js';
import { SystemRecommendationSection } from './SystemRecommendationSection.js';

interface BriefReviewPanelProps {
  brief: GetBriefForReviewResult;
}

/** Renders all seven required Brief elements uncollapsed by default, from `getBriefForReview`'s
 *  result (unchanged rendering contract from `problem-department-mvp`'s Slice 10 forward
 *  reference, now actually wired). Personal Pull renders structurally separate from Demand
 *  Evidence. No generation-trigger control appears anywhere in this panel. */
export function BriefReviewPanel({ brief }: BriefReviewPanelProps) {
  return (
    <section className="brief-review-panel" aria-label="Complete Brief Review">
      <ProblemDefinitionSection problemStatements={brief.problemStatements} />
      <ClaimsAndEvidenceSection
        claimVersions={brief.claimVersions}
        negativeFindings={brief.negativeFindings}
      />
      <DemandEvidenceSection
        demandSignals={brief.demandSignals}
        demandConfidence={brief.demandConfidence}
        negativeFindings={brief.negativeFindings}
      />
      <PersonalPullSection personalPullNotes={brief.personalPullNotes} />
      <ExistingSolutionLandscapeSection
        existingSolutions={brief.existingSolutions}
        negativeFindings={brief.negativeFindings}
      />
      <GapHypothesisSection
        gapHypotheses={brief.gapHypotheses}
        negativeFindings={brief.negativeFindings}
      />
      <UncertaintySection uncertainty={brief.uncertainty} />
      <SystemRecommendationSection recommendation={brief.recommendation} />
    </section>
  );
}
