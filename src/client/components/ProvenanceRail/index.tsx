import type { GetBriefForReviewResult } from '../../../services/getBriefForReview.js';
import type { InvestigationWorkspaceView } from '../../../types/readModels.js';
import { EvidenceProvenanceList } from './EvidenceProvenanceList.js';
import { SearchScopeNotice } from './SearchScopeNotice.js';
import { CitationScopeNotice } from './CitationScopeNotice.js';
import { RunHistoryList } from './RunHistoryList.js';
import { TechnicalDisclosurePanel } from './TechnicalDisclosurePanel.js';

interface ProvenanceRailProps {
  brief: GetBriefForReviewResult | null; // null before any BriefVersion exists (e.g. a first run
  // still in-progress or failed) — region 4's own precondition is ≥1 GenerationRun, not ≥1
  // BriefVersion, so this rail renders independently of Brief presence
  workspace: InvestigationWorkspaceView;
}

/** Region 4 — the CONTAINER (`CitationScopeNotice`/`RunHistoryList`/`TechnicalDisclosurePanel`) is
 *  version-independent and does not change when the displayed Brief version changes; it renders
 *  whenever ≥1 `GenerationRun` exists, regardless of whether any `BriefVersion` exists yet.
 *  `EvidenceProvenanceList` and `SearchScopeNotice` are scoped to the DISPLAYED version instead
 *  (only meaningful once a Brief exists), and DO update when the target version changes (§5.2
 *  "Navigate to a Specific Brief Version"). */
export function ProvenanceRail({ brief, workspace }: ProvenanceRailProps) {
  const producingRun = brief
    ? workspace.generationRuns.find((r) => r.id === brief.version.generationRunId)
    : undefined;

  return (
    <section className="provenance-rail" aria-label="Research and Provenance">
      {brief ? (
        <>
          <EvidenceProvenanceList
            claimVersions={brief.claimVersions}
            sources={workspace.investigation.sources}
          />
          <SearchScopeNotice producingRun={producingRun} />
        </>
      ) : null}
      <CitationScopeNotice />
      <RunHistoryList generationRuns={workspace.generationRuns} />
      <TechnicalDisclosurePanel generationRuns={workspace.generationRuns} />
    </section>
  );
}
