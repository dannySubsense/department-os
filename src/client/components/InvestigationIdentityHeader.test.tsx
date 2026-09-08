import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { InvestigationIdentityHeader } from './InvestigationIdentityHeader.js';
import type { InvestigationWorkspaceView } from '../../types/readModels.js';
import type { GetBriefForReviewResult } from '../../services/getBriefForReview.js';

// Component coverage for InvestigationIdentityHeader (04-ROADMAP.md C2-S5 Tests list —
// displayed-version binding and backward supersession link).

afterEach(() => cleanup());

function buildInvestigation(): InvestigationWorkspaceView['investigation'] {
  return {
    id: 'inv-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'brief-generated',
    statusReason: null,
    sourceCount: 1,
    sources: [],
  };
}

function buildBrief(overrides: Partial<GetBriefForReviewResult> = {}): GetBriefForReviewResult {
  return {
    version: {
      id: 'bv-1',
      problemBriefId: 'pb-1',
      versionNumber: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      supersedesVersionId: null,
      generationRunId: 'run-1',
      problemStatementIds: [],
      claimVersionIds: [],
      demandSignalIds: [],
      demandConfidenceClassification: { briefVersionId: 'bv-1', level: 'Emerging', narrative: 'n', citedDemandSignalIds: [] },
      existingSolutionIds: [],
      gapHypothesisIds: [],
      negativeFindings: [],
      uncertaintyStatement: { briefVersionId: 'bv-1', whatsUnknown: [], whatWouldChangeConclusion: [], whatsUndeterminable: [] },
      recommendation: { briefVersionId: 'bv-1', decision: 'Approve', rationale: 'because' },
      personalPullNoteIds: [],
    },
    assignedState: 'valid',
    isSuperseded: false,
    problemStatements: [],
    claimVersions: [],
    demandSignals: [],
    demandConfidence: { briefVersionId: 'bv-1', level: 'Emerging', narrative: 'n', citedDemandSignalIds: [] },
    existingSolutions: [],
    gapHypotheses: [],
    negativeFindings: [],
    uncertainty: { briefVersionId: 'bv-1', whatsUnknown: [], whatWouldChangeConclusion: [], whatsUndeterminable: [] },
    recommendation: { briefVersionId: 'bv-1', decision: 'Approve', rationale: 'because' },
    personalPullNotes: [],
    priorDecisions: [],
    ...overrides,
  };
}

describe('InvestigationIdentityHeader — displayed-version binding (New, required, C2-S5)', () => {
  it("renders the PRIOR version's own non-'valid' statement when the prior version is displayed, even though the CURRENT version's real assignedState is 'valid'", () => {
    const priorBrief = buildBrief({
      version: { ...buildBrief().version, id: 'bv-1', versionNumber: 1 },
      assignedState: 'challenged',
      isSuperseded: true,
    });
    const briefs: InvestigationWorkspaceView['briefs'] = [
      { briefVersionId: 'bv-1', versionNumber: 1, createdAt: '2026-01-01T00:00:00.000Z', isCurrent: false, assignedState: 'challenged', isSuperseded: true, forwardSupersededByVersionNumber: 2 },
      { briefVersionId: 'bv-2', versionNumber: 2, createdAt: '2026-01-02T00:00:00.000Z', isCurrent: true, assignedState: 'valid', isSuperseded: false, forwardSupersededByVersionNumber: null },
    ];

    render(
      <MemoryRouter>
        <InvestigationIdentityHeader investigation={buildInvestigation()} briefs={briefs} displayedBrief={priorBrief} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/This Brief version has been challenged/)).toBeInTheDocument();
  });

  it("renders NO non-'valid' statement when the CURRENT version (real assignedState 'valid') is displayed, even though a prior version in the same lineage is non-'valid'", () => {
    const currentBrief = buildBrief({
      version: { ...buildBrief().version, id: 'bv-2', versionNumber: 2 },
      assignedState: 'valid',
      isSuperseded: false,
    });
    const briefs: InvestigationWorkspaceView['briefs'] = [
      { briefVersionId: 'bv-1', versionNumber: 1, createdAt: '2026-01-01T00:00:00.000Z', isCurrent: false, assignedState: 'challenged', isSuperseded: true, forwardSupersededByVersionNumber: 2 },
      { briefVersionId: 'bv-2', versionNumber: 2, createdAt: '2026-01-02T00:00:00.000Z', isCurrent: true, assignedState: 'valid', isSuperseded: false, forwardSupersededByVersionNumber: null },
    ];

    render(
      <MemoryRouter>
        <InvestigationIdentityHeader investigation={buildInvestigation()} briefs={briefs} displayedBrief={currentBrief} />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/This Brief version has been/)).not.toBeInTheDocument();
  });

  it("the prior version's real isSuperseded: true renders on the prior version's own page", () => {
    const priorBrief = buildBrief({
      version: { ...buildBrief().version, id: 'bv-1', versionNumber: 1 },
      isSuperseded: true,
    });
    const briefs: InvestigationWorkspaceView['briefs'] = [
      { briefVersionId: 'bv-1', versionNumber: 1, createdAt: '2026-01-01T00:00:00.000Z', isCurrent: false, assignedState: 'valid', isSuperseded: true, forwardSupersededByVersionNumber: 2 },
      { briefVersionId: 'bv-2', versionNumber: 2, createdAt: '2026-01-02T00:00:00.000Z', isCurrent: true, assignedState: 'valid', isSuperseded: false, forwardSupersededByVersionNumber: null },
    ];
    render(
      <MemoryRouter>
        <InvestigationIdentityHeader investigation={buildInvestigation()} briefs={briefs} displayedBrief={priorBrief} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Version 2 of this Brief exists/)).toBeInTheDocument();
  });
});

describe('InvestigationIdentityHeader — backward supersession link (New, required, C2-S5)', () => {
  it('renders a real, navigable link (human-readable versionNumber, never a raw UUID) to the specific prior version the current version supersedes', () => {
    const currentBrief = buildBrief({
      version: {
        ...buildBrief().version,
        id: 'bv-2',
        versionNumber: 2,
        supersedesVersionId: 'bv-1',
      },
      isSuperseded: false,
    });
    const briefs: InvestigationWorkspaceView['briefs'] = [
      { briefVersionId: 'bv-1', versionNumber: 1, createdAt: '2026-01-01T00:00:00.000Z', isCurrent: false, assignedState: 'valid', isSuperseded: true, forwardSupersededByVersionNumber: 2 },
      { briefVersionId: 'bv-2', versionNumber: 2, createdAt: '2026-01-02T00:00:00.000Z', isCurrent: true, assignedState: 'valid', isSuperseded: false, forwardSupersededByVersionNumber: null },
    ];

    render(
      <MemoryRouter>
        <InvestigationIdentityHeader investigation={buildInvestigation()} briefs={briefs} displayedBrief={currentBrief} />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: /View prior Version 1/ });
    expect(link).toHaveAttribute(
      'href',
      '/departments/problem-department/investigations/inv-1/versions/1',
    );
    // Never a raw UUID rendered as the navigable content.
    expect(screen.queryByText('bv-1')).not.toBeInTheDocument();
  });

  it('renders no backward link when supersedesVersionId is null (version 1)', () => {
    const currentBrief = buildBrief({
      version: { ...buildBrief().version, id: 'bv-1', versionNumber: 1, supersedesVersionId: null },
    });
    const briefs: InvestigationWorkspaceView['briefs'] = [
      { briefVersionId: 'bv-1', versionNumber: 1, createdAt: '2026-01-01T00:00:00.000Z', isCurrent: true, assignedState: 'valid', isSuperseded: false, forwardSupersededByVersionNumber: null },
    ];
    render(
      <MemoryRouter>
        <InvestigationIdentityHeader investigation={buildInvestigation()} briefs={briefs} displayedBrief={currentBrief} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/View prior Version/)).not.toBeInTheDocument();
  });
});
