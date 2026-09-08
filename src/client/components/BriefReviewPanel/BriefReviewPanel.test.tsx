import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BriefReviewPanel } from './index.js';
import type { GetBriefForReviewResult } from '../../../services/getBriefForReview.js';

// Component coverage for BriefReviewPanel's 7 required sections + NegativeFindingNotice
// (04-ROADMAP.md C2-S4 Tests list: "all seven sections render uncollapsed by default;
// PersonalPullSection renders structurally separate from Demand; NegativeFindingNotice renders for
// a real negative-finding row and never for Problem Definition").

afterEach(() => cleanup());

function buildBrief(overrides: Partial<GetBriefForReviewResult> = {}): GetBriefForReviewResult {
  return {
    version: {
      id: 'bv-1',
      problemBriefId: 'pb-1',
      versionNumber: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      supersedesVersionId: null,
      generationRunId: 'run-1',
      problemStatementIds: ['ps-1'],
      claimVersionIds: ['cv-1'],
      demandSignalIds: ['ds-1'],
      demandConfidenceClassification: { briefVersionId: 'bv-1', level: 'Emerging', narrative: 'n', citedDemandSignalIds: [] },
      existingSolutionIds: ['es-1'],
      gapHypothesisIds: ['gh-1'],
      negativeFindings: [],
      uncertaintyStatement: { briefVersionId: 'bv-1', whatsUnknown: ['unk'], whatWouldChangeConclusion: ['change'], whatsUndeterminable: ['undet'] },
      recommendation: { briefVersionId: 'bv-1', decision: 'Approve', rationale: 'because' },
      personalPullNoteIds: [],
    },
    assignedState: 'valid',
    isSuperseded: false,
    problemStatements: [
      { id: 'ps-1', briefVersionId: 'bv-1', whoExperiencesIt: 'small teams', contextOrWorkflow: 'manual reconciliation', consequenceOrFriction: 'hours lost weekly', supportingClaimVersionIds: ['cv-1'] },
    ],
    claimVersions: [
      {
        id: 'cv-1',
        claimId: 'c-1',
        versionNumber: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        text: 'Teams reconcile manually.',
        evidence: [{ evidenceItemId: 'ei-1', stance: 'supporting', relevanceNote: 'directly on point' }],
        supersedesVersionId: null,
        resolvedEvidence: [
          {
            evidenceItemId: 'ei-1',
            stance: 'supporting',
            relevanceNote: 'directly on point',
            item: { id: 'ei-1', sourceArtifactId: 'src-1', excerptOrSummary: 'a real excerpt', label: 'observation', createdAt: '2026-01-01T00:00:00.000Z' },
          },
        ],
        assignedState: 'valid',
      } as GetBriefForReviewResult['claimVersions'][number],
    ],
    demandSignals: [{ id: 'ds-1', briefVersionId: 'bv-1', type: 'feature-requests', evidenceItemIds: ['ei-1'] }],
    demandConfidence: { briefVersionId: 'bv-1', level: 'Emerging', narrative: 'n', citedDemandSignalIds: [] },
    existingSolutions: [
      { id: 'es-1', briefVersionId: 'bv-1', name: 'Spreadsheet', whatItAddresses: 'tracking', howPeopleCopeNow: 'manual copy', whereItsInadequate: 'no automation', evidenceItemIds: ['ei-1'] },
    ],
    gapHypotheses: [{ id: 'gh-1', briefVersionId: 'bv-1', category: 'workflow-fit', statement: 'no automation exists', evidenceItemIds: ['ei-1'] }],
    negativeFindings: [],
    uncertainty: { briefVersionId: 'bv-1', whatsUnknown: ['unk'], whatWouldChangeConclusion: ['change'], whatsUndeterminable: ['undet'] },
    recommendation: { briefVersionId: 'bv-1', decision: 'Approve', rationale: 'because' },
    personalPullNotes: [{ id: 'pp-1', briefVersionId: 'bv-1', sourceArtifactId: 'src-1', text: 'I personally care about this.', label: 'contextual-motivation' }],
    priorDecisions: [],
    ...overrides,
  };
}

describe('BriefReviewPanel', () => {
  it('renders all seven required elements, uncollapsed by default, from real Brief content', () => {
    const brief = buildBrief();
    render(<BriefReviewPanel brief={brief} />);

    expect(screen.getByRole('heading', { name: 'Problem Definition' })).toBeInTheDocument();
    expect(screen.getByText('small teams')).toBeInTheDocument();
    expect(screen.getByText('manual reconciliation')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Claims and Evidence' })).toBeInTheDocument();
    expect(screen.getByText('Teams reconcile manually.')).toBeInTheDocument();
    expect(screen.getByText('a real excerpt')).toBeInTheDocument();
    expect(screen.getByText('supporting')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Demand Evidence' })).toBeInTheDocument();
    expect(screen.getByText('Emerging')).toBeInTheDocument();
    expect(screen.getByText('feature-requests')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Personal Pull' })).toBeInTheDocument();
    expect(screen.getByText('I personally care about this.')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Existing-Solution Landscape' })).toBeInTheDocument();
    expect(screen.getByText('Spreadsheet')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Gap Hypothesis' })).toBeInTheDocument();
    expect(screen.getByText('no automation exists')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Uncertainty' })).toBeInTheDocument();
    expect(screen.getByText('unk')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'System Recommendation' })).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('because')).toBeInTheDocument();

    // No content is behind a click-to-expand control anywhere in this panel.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders Personal Pull structurally separate from Demand Evidence, not nested inside it', () => {
    const brief = buildBrief();
    render(<BriefReviewPanel brief={brief} />);
    const demandSection = screen.getByRole('heading', { name: 'Demand Evidence' }).closest('section');
    const pullSection = screen.getByRole('heading', { name: 'Personal Pull' }).closest('section');
    expect(demandSection).not.toBe(pullSection);
    expect(demandSection?.contains(pullSection)).toBe(false);
  });

  it('renders human-readable field values, not raw enum members, for demand confidence and gap category', () => {
    const brief = buildBrief({
      gapHypotheses: [{ id: 'gh-1', briefVersionId: 'bv-1', category: 'other', otherCategoryLabel: 'Custom Gap Label', statement: 'no automation exists', evidenceItemIds: ['ei-1'] }],
    });
    render(<BriefReviewPanel brief={brief} />);
    expect(screen.getByText('Custom Gap Label')).toBeInTheDocument();
    expect(screen.queryByText('other')).not.toBeInTheDocument();
  });

  it('renders NegativeFindingNotice for a real negative-finding row on a negatable element, replacing normal content expectations for that element', () => {
    const brief = buildBrief({
      claimVersions: [],
      negativeFindings: [
        { id: 'nf-1', briefVersionId: 'bv-1', element: 'evidence', statement: 'No supporting claims/evidence were found for this Investigation.' },
      ],
    });
    render(<BriefReviewPanel brief={brief} />);
    expect(screen.getByText('No supporting claims/evidence were found for this Investigation.')).toBeInTheDocument();
    expect(screen.queryByText('Teams reconcile manually.')).not.toBeInTheDocument();
  });

  it('never renders NegativeFindingNotice for Problem Definition, even when negativeFindings is non-empty for other elements', () => {
    const brief = buildBrief({
      negativeFindings: [
        { id: 'nf-1', briefVersionId: 'bv-1', element: 'gap-hypothesis', statement: 'No gap hypothesis could be substantiated.' },
      ],
    });
    render(<BriefReviewPanel brief={brief} />);
    const problemDefSection = screen.getByRole('heading', { name: 'Problem Definition' }).closest('section');
    expect(problemDefSection?.querySelector('.negative-finding-notice')).toBeNull();
    expect(screen.getByText('No gap hypothesis could be substantiated.')).toBeInTheDocument();
  });
});
