import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProvenanceRail } from './index.js';
import type { GetBriefForReviewResult } from '../../../services/getBriefForReview.js';
import type { InvestigationWorkspaceView, WorkspaceGenerationRunSummary } from '../../../types/readModels.js';

// Component coverage for ProvenanceRail and its subsections (04-ROADMAP.md C2-S4 Tests list),
// specifically SearchScopeNotice's scoping to the DISPLAYED version's own producing run — this is
// the item tracing to a real, previously-found defect (Sol's original finding this checkpoint had
// to fix: a reader viewing an OLD Brief version must see that old version's own search scope, not
// a later run's) — plus RunHistoryList (all runs) and TechnicalDisclosurePanel (collapsed by
// default).

afterEach(() => cleanup());

function buildRun(overrides: Partial<WorkspaceGenerationRunSummary> = {}): WorkspaceGenerationRunSummary {
  return {
    id: 'run-1',
    outcome: 'succeeded',
    livenessState: 'terminal',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:05:00.000Z',
    runtimeIdentifier: 'test-runtime',
    steps: [],
    webSearchQueries: [],
    ...overrides,
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

function buildWorkspace(overrides: Partial<InvestigationWorkspaceView> = {}): InvestigationWorkspaceView {
  return {
    investigation: {
      id: 'inv-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'brief-generated',
      statusReason: null,
      sourceCount: 1,
      sources: [{ id: 'src-1', type: 'url', raw: 'https://example.com', resolutionStatus: 'content-retrieved' }],
    },
    generationRuns: [],
    latestGenerationRun: null,
    briefs: [],
    decisionLineage: [],
    generationEligible: false,
    newSourceSnapshotSinceCurrentBriefVersion: false,
    ...overrides,
  };
}

describe('ProvenanceRail — SearchScopeNotice version scoping', () => {
  it('scopes to the DISPLAYED (old) version\'s own producing run, not a later run\'s search queries', () => {
    // Run 1 (old, produced the OLD Brief version) searched for "old query".
    // Run 2 (later, current) searched for "new query" and must NOT leak into the old version's rail.
    const oldRun = buildRun({
      id: 'run-old',
      webSearchQueries: [
        { id: 'q-old', query: 'old query', performedAt: '2026-01-01T00:00:00.000Z', scopeNote: null, limitations: [], results: [] },
      ],
    });
    const newRun = buildRun({
      id: 'run-new',
      startedAt: '2026-01-02T00:00:00.000Z',
      webSearchQueries: [
        { id: 'q-new', query: 'new query', performedAt: '2026-01-02T00:00:00.000Z', scopeNote: null, limitations: [], results: [] },
      ],
    });

    const oldBrief = buildBrief({ version: { ...buildBrief().version, id: 'bv-old', generationRunId: 'run-old' } });
    const workspace = buildWorkspace({ generationRuns: [newRun, oldRun] });

    render(<ProvenanceRail brief={oldBrief} workspace={workspace} />);

    const searchScope = screen.getByRole('region', { name: 'Search scope' });
    expect(within(searchScope).getByText('old query')).toBeInTheDocument();
    expect(within(searchScope).queryByText('new query')).not.toBeInTheDocument();
  });

  it('renders the CURRENT version\'s own producing run when the current version is displayed', () => {
    const oldRun = buildRun({
      id: 'run-old',
      webSearchQueries: [
        { id: 'q-old', query: 'old query', performedAt: '2026-01-01T00:00:00.000Z', scopeNote: null, limitations: [], results: [] },
      ],
    });
    const newRun = buildRun({
      id: 'run-new',
      startedAt: '2026-01-02T00:00:00.000Z',
      webSearchQueries: [
        { id: 'q-new', query: 'new query', performedAt: '2026-01-02T00:00:00.000Z', scopeNote: null, limitations: [], results: [] },
      ],
    });

    const currentBrief = buildBrief({ version: { ...buildBrief().version, id: 'bv-new', generationRunId: 'run-new' } });
    const workspace = buildWorkspace({ generationRuns: [newRun, oldRun] });

    render(<ProvenanceRail brief={currentBrief} workspace={workspace} />);

    const searchScope = screen.getByRole('region', { name: 'Search scope' });
    expect(within(searchScope).getByText('new query')).toBeInTheDocument();
    expect(within(searchScope).queryByText('old query')).not.toBeInTheDocument();
  });

  it('renders an honest zero-queries statement when the producing run performed no web searches', () => {
    const run = buildRun({ webSearchQueries: [] });
    const brief = buildBrief();
    const workspace = buildWorkspace({ generationRuns: [run] });
    render(<ProvenanceRail brief={brief} workspace={workspace} />);
    expect(screen.getByText('No web searches were performed for this Brief version.')).toBeInTheDocument();
  });
});

describe('ProvenanceRail — RunHistoryList', () => {
  it('renders EVERY run, not only the latest, including real per-step validationRecords/toolInvocations and per-run webSearchQueries', () => {
    const run1 = buildRun({
      id: 'run-1',
      runtimeIdentifier: 'runtime-one',
      steps: [
        {
          component: 'claims-extractor',
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:01:00.000Z',
          outcome: 'succeeded',
          validationRecords: [{ toolName: 'schema-validator', finalOutcome: 'succeeded', attempts: [{ attemptNumber: 1 }] } as unknown as never],
          toolInvocations: [{ toolName: 'web-search', outcome: 'succeeded' } as unknown as never],
        },
      ],
      webSearchQueries: [
        { id: 'q-1', query: 'run one query', performedAt: '2026-01-01T00:00:00.000Z', scopeNote: null, limitations: [], results: [] },
      ],
    });
    const run2 = buildRun({
      id: 'run-2',
      runtimeIdentifier: 'runtime-two',
      startedAt: '2026-01-02T00:00:00.000Z',
      webSearchQueries: [
        { id: 'q-2', query: 'run two query', performedAt: '2026-01-02T00:00:00.000Z', scopeNote: null, limitations: [], results: [] },
      ],
    });

    const workspace = buildWorkspace({ generationRuns: [run2, run1] });
    render(<ProvenanceRail brief={null} workspace={workspace} />);

    const runHistory = screen.getByRole('region', { name: 'Run history' });
    expect(within(runHistory).getByText('runtime-one')).toBeInTheDocument();
    expect(within(runHistory).getByText('runtime-two')).toBeInTheDocument();
    expect(within(runHistory).getByText('run one query')).toBeInTheDocument();
    expect(within(runHistory).getByText('run two query')).toBeInTheDocument();
    expect(within(runHistory).getByText(/schema-validator/)).toBeInTheDocument();
    expect(within(runHistory).getByText(/web-search/)).toBeInTheDocument();
  });

  it('renders the Provenance Rail container (Run History/Citation Scope/Technical Disclosure) even when brief is null (no BriefVersion yet, but a run exists)', () => {
    const run = buildRun();
    const workspace = buildWorkspace({ generationRuns: [run] });
    render(<ProvenanceRail brief={null} workspace={workspace} />);
    expect(screen.getByRole('region', { name: 'Run history' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Citation scope' })).toBeInTheDocument();
    // Evidence/Search-scope are version-scoped and only meaningful once a Brief exists.
    expect(screen.queryByRole('region', { name: 'Evidence' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Search scope' })).not.toBeInTheDocument();
  });
});

describe('ProvenanceRail — TechnicalDisclosurePanel', () => {
  it('starts collapsed by default and reveals real raw run detail only after a real expand click', () => {
    const run = buildRun({ runtimeIdentifier: 'reveal-me-runtime' });
    const workspace = buildWorkspace({ generationRuns: [run] });
    render(<ProvenanceRail brief={null} workspace={workspace} />);

    const panel = screen.getByLabelText('Technical disclosure');
    const toggle = within(panel).getByRole('button', { name: 'Show technical disclosure' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(panel).queryByText(/reveal-me-runtime/)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(within(panel).getByRole('button', { name: 'Hide technical disclosure' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(panel).getAllByText(/reveal-me-runtime/).length).toBeGreaterThan(0);
  });
});

describe('ProvenanceRail — CitationScopeNotice', () => {
  it('always renders, regardless of brief presence', () => {
    const workspace = buildWorkspace({ generationRuns: [buildRun()] });
    render(<ProvenanceRail brief={null} workspace={workspace} />);
    expect(screen.getByRole('region', { name: 'Citation scope' })).toBeInTheDocument();
  });
});
