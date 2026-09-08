import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import { recordDecision } from './recordDecision.js';
import { getBriefForReview } from './getBriefForReview.js';
import type { ExtractionResult } from './extractClaimsAndEvidence.js';
import type { DemandAnalysisResult } from './demandAnalyzer.js';
import type { PersonalPullExtractionResult } from './personalPullExtractor.js';
import type { LandscapeResearchResult } from './landscapeResearcher.js';
import type { GapHypothesisGenerationResult } from './gapHypothesisGenerator.js';
import type { UncertaintyCompilationResult } from './uncertaintyCompiler.js';
import type { RecommendationResult } from './recommendationEngine.js';

/**
 * Full US-13 five-item closing regression (04-ROADMAP.md C2-S5 Tests list, service/route level):
 * a real prior Decision exists against the current BriefVersion -> a real new source is added ->
 * eligibility flips -> a real generation run with supersedesVersionId set completes -> the new
 * BriefVersion is current and reviewable -> the prior BriefVersion AND its Decision remain
 * retrievable via getBriefForReview (the service backing GET.../brief-versions/by-version/:N),
 * unmodified, and unreassigned.
 *
 * Same mocking convention as generateBriefVersion.test.ts: only the seven pipeline components are
 * mocked; generateBriefVersion, getCandidateCorrectionSourceIds, and every persistence path run for
 * real against Postgres.
 */

vi.mock('./extractClaimsAndEvidence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./extractClaimsAndEvidence.js')>();
  return { ...actual, extractClaimsAndEvidence: vi.fn(), extractClaimsAndEvidenceForSourceArtifacts: vi.fn() };
});
vi.mock('./demandAnalyzer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./demandAnalyzer.js')>();
  return { ...actual, analyzeDemand: vi.fn() };
});
vi.mock('./personalPullExtractor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./personalPullExtractor.js')>();
  return { ...actual, extractPersonalPull: vi.fn() };
});
vi.mock('./landscapeResearcher.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./landscapeResearcher.js')>();
  return { ...actual, researchLandscape: vi.fn() };
});
vi.mock('./gapHypothesisGenerator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gapHypothesisGenerator.js')>();
  return { ...actual, generateGapHypotheses: vi.fn() };
});
vi.mock('./uncertaintyCompiler.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./uncertaintyCompiler.js')>();
  return { ...actual, compileUncertainty: vi.fn() };
});
vi.mock('./recommendationEngine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./recommendationEngine.js')>();
  return { ...actual, generateRecommendation: vi.fn() };
});

const { extractClaimsAndEvidence, extractClaimsAndEvidenceForSourceArtifacts } = await import(
  './extractClaimsAndEvidence.js'
);
const { analyzeDemand } = await import('./demandAnalyzer.js');
const { extractPersonalPull } = await import('./personalPullExtractor.js');
const { researchLandscape } = await import('./landscapeResearcher.js');
const { generateGapHypotheses } = await import('./gapHypothesisGenerator.js');
const { compileUncertainty } = await import('./uncertaintyCompiler.js');
const { generateRecommendation } = await import('./recommendationEngine.js');
const { generateBriefVersion } = await import('./generateBriefVersion.js');
const { hasUnattemptedCorrectionSnapshot } = await import('./getInvestigationWorkspace.js');
const workspaceModule = await import('./getInvestigationWorkspace.js');
const { assignValidityState } = await import('./validityState.js');

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE reconsideration_condition, decision, negative_finding, gap_hypothesis,
              existing_solution, demand_signal, problem_statement, brief_version, problem_brief,
              generation_step, generation_run, claim_version_evidence, evidence_item, claim_version,
              claim, source_artifact, submission, investigation CASCADE`,
  );
  vi.mocked(extractClaimsAndEvidence).mockReset();
  vi.mocked(extractClaimsAndEvidenceForSourceArtifacts).mockReset();
  vi.mocked(analyzeDemand).mockReset();
  vi.mocked(extractPersonalPull).mockReset();
  vi.mocked(researchLandscape).mockReset();
  vi.mocked(generateGapHypotheses).mockReset();
  vi.mocked(compileUncertainty).mockReset();
  vi.mocked(generateRecommendation).mockReset();
});

async function insertEvidenceItem(sourceArtifactId: string, excerpt = 'evidence'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label)
     VALUES ($1, $2, 'observation') RETURNING id`,
    [sourceArtifactId, excerpt],
  );
  return result.rows[0].id;
}

/** Persists the claim_version_evidence row a real ClaimVersion needs to pass
 *  generateBriefVersion's ownership-verification check (generateBriefVersion.ts's
 *  claimVersionOwnership query) — matches generateBriefVersion.test.ts's own seeding convention. */
async function linkClaimVersionEvidence(claimVersionId: string, evidenceItemId: string): Promise<void> {
  await pool.query(
    `INSERT INTO claim_version_evidence (claim_version_id, evidence_item_id, stance) VALUES ($1, $2, 'supporting')`,
    [claimVersionId, evidenceItemId],
  );
}

function cleanFixtures(sourceArtifactId: string, evidenceItemId: string, claimVersionId: string, claimId: string) {
  const extraction: ExtractionResult = {
    claimVersions: [
      {
        id: claimVersionId,
        claimId,
        versionNumber: 1,
        createdAt: new Date().toISOString(),
        text: 'claim text',
        evidence: [{ evidenceItemId, stance: 'supporting' }],
        supersedesVersionId: null,
      },
    ],
    evidenceItems: [
      { id: evidenceItemId, sourceArtifactId, excerptOrSummary: 'evidence', label: 'observation' },
    ],
    problemStatementCandidates: [
      {
        whoExperiencesIt: 'small teams',
        contextOrWorkflow: 'manual reconciliation',
        consequenceOrFriction: 'hours lost weekly',
        supportingClaimVersionIds: [claimVersionId],
      },
    ],
    outcome: 'completed-with-evidence',
    generationFailed: false,
    extractionInputSourceIds: [sourceArtifactId],
  };
  const demand: DemandAnalysisResult = {
    demandSignalCandidates: [{ localId: 'ds-1', type: 'recurring-complaints', evidenceItemIds: [evidenceItemId] }],
    demandConfidenceClassificationCandidate: {
      level: 'Emerging',
      narrative: 'One recurring-complaints signal.',
      citedDemandSignalIds: ['ds-1'],
    },
    generationFailed: false,
  };
  const personalPull: PersonalPullExtractionResult = {
    personalPullNoteCandidates: [{ sourceArtifactId, text: 'founder motivation note', label: 'contextual-motivation' }],
    generationFailed: false,
  };
  const landscape: LandscapeResearchResult = {
    webSearchQueries: [],
    existingSolutionCandidates: [
      {
        localId: 'es-1',
        name: 'Competitor X',
        whatItAddresses: 'partial overlap',
        howPeopleCopeNow: 'manual spreadsheets',
        whereItsInadequate: 'no automation',
        evidenceItemIds: [evidenceItemId],
      },
    ],
    landscapeEvidenceItems: [],
    generationFailed: false,
    extractionInputSourceIds: [],
  };
  const gap: GapHypothesisGenerationResult = {
    gapHypothesisCandidates: [
      { category: 'capability', statement: 'No automated reconciliation exists.', evidenceItemIds: [evidenceItemId] },
    ],
    generationFailed: false,
  };
  const uncertainty: UncertaintyCompilationResult = {
    uncertaintyStatementCandidate: {
      whatsUnknown: ['long-term retention'],
      whatWouldChangeConclusion: ['a failed pilot'],
      whatsUndeterminable: ['nothing at this time'],
    },
    generationFailed: false,
  };
  const recommendation: RecommendationResult = {
    recommendationCandidate: { decision: 'Approve', rationale: 'Evidence supports the problem.' },
    generationFailed: false,
  };
  return { extraction, demand, personalPull, landscape, gap, uncertainty, recommendation };
}

function wirePipeline(fixtures: ReturnType<typeof cleanFixtures>) {
  vi.mocked(extractClaimsAndEvidence).mockResolvedValue(fixtures.extraction);
  vi.mocked(extractClaimsAndEvidenceForSourceArtifacts).mockResolvedValue(fixtures.extraction);
  vi.mocked(analyzeDemand).mockResolvedValue(fixtures.demand);
  vi.mocked(extractPersonalPull).mockResolvedValue(fixtures.personalPull);
  vi.mocked(researchLandscape).mockResolvedValue(fixtures.landscape);
  vi.mocked(generateGapHypotheses).mockResolvedValue(fixtures.gap);
  vi.mocked(compileUncertainty).mockResolvedValue(fixtures.uncertainty);
  vi.mocked(generateRecommendation).mockResolvedValue(fixtures.recommendation);
}

describe('US-13 full five-item closing regression (service/route level)', () => {
  it('a pre-existing Decision survives a real evidence-driven correction untouched, and the prior BriefVersion remains retrievable via getBriefForReview scoped to its own versionNumber', async () => {
    // ---- Item 1: initial generation, current BriefVersion v1 ----
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
    const investigationId = submission.investigationId;
    const sourceArtifactId1 = submission.sourceArtifactIds[0];

    const claim1 = await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`);
    const claimVersion1 = await pool.query<{ id: string }>(
      `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, 'claim text') RETURNING id`,
      [claim1.rows[0].id],
    );
    const evidenceItemId1 = await insertEvidenceItem(sourceArtifactId1, 'first-run evidence');
    await linkClaimVersionEvidence(claimVersion1.rows[0].id, evidenceItemId1);
    const fixtures1 = cleanFixtures(sourceArtifactId1, evidenceItemId1, claimVersion1.rows[0].id, claim1.rows[0].id);
    wirePipeline(fixtures1);

    const v1 = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });
    expect(v1.versionNumber).toBe(1);

    // ---- A real prior Decision recorded against the current BriefVersion (v1) ----
    const priorDecision = await recordDecision({
      briefVersionId: v1.id,
      decision: 'Approve',
      rationale: 'Evidence supports the problem, initial review.',
    });

    // ---- Item 2: a real new source is added, real submitted+content-retrieved+hashed (the shape
    // getCandidateCorrectionSourceIds requires — matches
    // generateBriefVersion.correctionZeroEvidence.test.ts's own insertSubmittedResolvedSource
    // convention) ----
    const additionalSubmissionResult = await pool.query<{ id: string }>(
      `INSERT INTO submission (investigation_id, origin) VALUES ($1, 'human') RETURNING id`,
      [investigationId],
    );
    const newSourceArtifactResult = await pool.query<{ id: string }>(
      `INSERT INTO source_artifact
         (investigation_id, submission_id, type, raw, origin, resolution_status, resolution_resolved_at,
          resolved_content, resolved_content_hash)
       VALUES ($1, $2, 'url', 'https://example.com/new-evidence', 'submitted', 'content-retrieved', now(),
               'a materially new piece of evidence', 'hash-new-correction-source')
       RETURNING id`,
      [investigationId, additionalSubmissionResult.rows[0].id],
    );
    const newSourceArtifactId = newSourceArtifactResult.rows[0].id;

    // ---- Item 3: eligibility flips ----
    const eligible = await hasUnattemptedCorrectionSnapshot(investigationId);
    expect(eligible).toBe(true);

    // ---- Item 4: a real generation run with supersedesVersionId completes ----
    const claim2 = await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`);
    const claimVersion2 = await pool.query<{ id: string }>(
      `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, 'corrected claim text') RETURNING id`,
      [claim2.rows[0].id],
    );
    const evidenceItemId2 = await insertEvidenceItem(newSourceArtifactId, 'correction evidence');
    await linkClaimVersionEvidence(claimVersion2.rows[0].id, evidenceItemId2);
    const fixtures2 = cleanFixtures(newSourceArtifactId, evidenceItemId2, claimVersion2.rows[0].id, claim2.rows[0].id);
    wirePipeline(fixtures2);

    const v2 = await generateBriefVersion({
      investigationId,
      supersedesVersionId: v1.id,
      runtimeIdentifier: 'test',
    });
    expect(v2.versionNumber).toBe(2);
    expect(v2.supersedesVersionId).toBe(v1.id);

    // ---- Item 5: the new BriefVersion is current and reviewable ----
    const problemBriefRow = await pool.query<{ current_version_id: string }>(
      `SELECT current_version_id FROM problem_brief WHERE investigation_id = $1`,
      [investigationId],
    );
    expect(problemBriefRow.rows[0].current_version_id).toBe(v2.id);
    const currentReview = await getBriefForReview(v2.id);
    expect(currentReview.version.id).toBe(v2.id);
    expect(currentReview.isSuperseded).toBe(false);

    // ---- Item 5 (continued): the prior BriefVersion AND its Decision remain retrievable via the
    // real versioned-navigation-backing service, unmodified, and unreassigned ----
    const priorReview = await getBriefForReview(v1.id);
    expect(priorReview.version.id).toBe(v1.id);
    expect(priorReview.version.versionNumber).toBe(1);
    expect(priorReview.isSuperseded).toBe(true);
    expect(priorReview.priorDecisions).toHaveLength(1);
    expect(priorReview.priorDecisions[0].id).toBe(priorDecision.id);
    expect(priorReview.priorDecisions[0].decision).toBe('Approve');
    expect(priorReview.priorDecisions[0].rationale).toBe('Evidence supports the problem, initial review.');

    // Never reassigned to the superseding version.
    const decisionRow = await pool.query<{ brief_version_id: string }>(
      `SELECT brief_version_id FROM decision WHERE id = $1`,
      [priorDecision.id],
    );
    expect(decisionRow.rows[0].brief_version_id).toBe(v1.id);
    expect(decisionRow.rows[0].brief_version_id).not.toBe(v2.id);

    // Prior brief_version row itself is unmodified (still version 1, still supersedes_version_id null).
    const priorRow = await pool.query(`SELECT version_number, supersedes_version_id FROM brief_version WHERE id = $1`, [
      v1.id,
    ]);
    expect(priorRow.rows[0].version_number).toBe(1);
    expect(priorRow.rows[0].supersedes_version_id).toBeNull();
  });

  it('writes no status_event row anywhere in the full US-13 correction path (04-ROADMAP.md:1983-1986 isolation)', async () => {
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
    const investigationId = submission.investigationId;
    const sourceArtifactId1 = submission.sourceArtifactIds[0];

    const claim1 = await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`);
    const claimVersion1 = await pool.query<{ id: string }>(
      `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, 'claim text') RETURNING id`,
      [claim1.rows[0].id],
    );
    const evidenceItemId1 = await insertEvidenceItem(sourceArtifactId1, 'first-run evidence');
    await linkClaimVersionEvidence(claimVersion1.rows[0].id, evidenceItemId1);
    const fixtures1 = cleanFixtures(sourceArtifactId1, evidenceItemId1, claimVersion1.rows[0].id, claim1.rows[0].id);
    wirePipeline(fixtures1);

    const v1 = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const priorDecision = await recordDecision({
      briefVersionId: v1.id,
      decision: 'Approve',
      rationale: 'Evidence supports the problem, initial review.',
    });
    expect(priorDecision.id).toBeTruthy();

    const additionalSubmissionResult = await pool.query<{ id: string }>(
      `INSERT INTO submission (investigation_id, origin) VALUES ($1, 'human') RETURNING id`,
      [investigationId],
    );
    const newSourceArtifactResult = await pool.query<{ id: string }>(
      `INSERT INTO source_artifact
         (investigation_id, submission_id, type, raw, origin, resolution_status, resolution_resolved_at,
          resolved_content, resolved_content_hash)
       VALUES ($1, $2, 'url', 'https://example.com/new-evidence', 'submitted', 'content-retrieved', now(),
               'a materially new piece of evidence', 'hash-new-correction-source')
       RETURNING id`,
      [investigationId, additionalSubmissionResult.rows[0].id],
    );
    const newSourceArtifactId = newSourceArtifactResult.rows[0].id;

    const beforeCount = await pool.query<{ count: string }>(`SELECT count(*) FROM status_event`);

    const eligible = await hasUnattemptedCorrectionSnapshot(investigationId);
    expect(eligible).toBe(true);

    const claim2 = await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`);
    const claimVersion2 = await pool.query<{ id: string }>(
      `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, 'corrected claim text') RETURNING id`,
      [claim2.rows[0].id],
    );
    const evidenceItemId2 = await insertEvidenceItem(newSourceArtifactId, 'correction evidence');
    await linkClaimVersionEvidence(claimVersion2.rows[0].id, evidenceItemId2);
    const fixtures2 = cleanFixtures(newSourceArtifactId, evidenceItemId2, claimVersion2.rows[0].id, claim2.rows[0].id);
    wirePipeline(fixtures2);

    const v2 = await generateBriefVersion({
      investigationId,
      supersedesVersionId: v1.id,
      runtimeIdentifier: 'test',
    });
    expect(v2.versionNumber).toBe(2);

    await getBriefForReview(v2.id);
    await getBriefForReview(v1.id);

    const afterCount = await pool.query<{ count: string }>(`SELECT count(*) FROM status_event`);
    expect(afterCount.rows[0].count).toBe(beforeCount.rows[0].count);
  });

  it('runs no generation-eligibility check (hasUnattemptedCorrectionSnapshot) as part of assignValidityState (04-ROADMAP.md:1983-1986 isolation)', async () => {
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
    const investigationId = submission.investigationId;
    const sourceArtifactId1 = submission.sourceArtifactIds[0];

    const claim1 = await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`);
    const claimVersion1 = await pool.query<{ id: string }>(
      `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, 'claim text') RETURNING id`,
      [claim1.rows[0].id],
    );
    const evidenceItemId1 = await insertEvidenceItem(sourceArtifactId1, 'first-run evidence');
    await linkClaimVersionEvidence(claimVersion1.rows[0].id, evidenceItemId1);
    const fixtures1 = cleanFixtures(sourceArtifactId1, evidenceItemId1, claimVersion1.rows[0].id, claim1.rows[0].id);
    wirePipeline(fixtures1);

    const v1 = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const spy = vi.spyOn(workspaceModule, 'hasUnattemptedCorrectionSnapshot');
    try {
      const { statusEvent } = await assignValidityState({
        targetType: 'brief-version',
        targetId: v1.id,
        assignedState: 'invalidated',
        effectiveAt: new Date().toISOString(),
        reason: 'test-only isolation check',
        recordedBy: 'test-harness',
      });
      expect(statusEvent.targetId).toBe(v1.id);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
