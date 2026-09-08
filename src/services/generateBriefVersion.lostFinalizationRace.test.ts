import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import type { ExtractionResult } from './extractClaimsAndEvidence.js';
import type { DemandAnalysisResult } from './demandAnalyzer.js';
import type { PersonalPullExtractionResult } from './personalPullExtractor.js';
import type { LandscapeResearchResult } from './landscapeResearcher.js';
import type { GapHypothesisGenerationResult } from './gapHypothesisGenerator.js';
import type { UncertaintyCompilationResult } from './uncertaintyCompiler.js';
import type { RecommendationResult } from './recommendationEngine.js';

/**
 * C2-S3 04-ROADMAP.md Tests — "lost finalization race propagation":
 * `GenerationRunLostFinalizationRaceError` (generateBriefVersion.ts:30, thrown at :886) had zero
 * test coverage.
 *
 * Mocking setup and fixture shapes mirror generateBriefVersion.test.ts's own established idiom
 * exactly (same seven module-boundary mocks, same clean-pipeline fixtures) — duplicated here
 * rather than imported because that file does not export its helpers. The one addition: the
 * last-called component, `generateRecommendation`, is made to await a controllable gate
 * immediately before it resolves (the same test-double-gate idiom C2-S3's SELF-3 test already
 * uses for `callForcedTool`, never a real network wait). Because `fenceToken` is captured once in
 * Phase 1 and never re-read or rotated by any successful-step `recordGenerationStep` call, it is
 * still valid when a real, direct `finalizeGenerationRun({ outcome: 'failed' })` call is issued
 * for the same generationRunId while the gate holds — simulating a concurrent
 * `abandonGenerationRun` winning the race. Releasing the gate lets Phase 4 proceed to its own
 * `finalizeGenerationRun({ outcome: 'succeeded' })` call, which must lose the guarded UPDATE
 * (rowCount 0), throw `GenerationRunAlreadyFinalizedError`, and be converted to
 * `GenerationRunLostFinalizationRaceError` per generateBriefVersion.ts:881-889.
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

const { generateBriefVersion, GenerationRunLostFinalizationRaceError, BriefGenerationFailedError } = await import(
  './generateBriefVersion.js'
);
const { finalizeGenerationRun } = await import('./provenanceRecorder.js');

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE negative_finding, gap_hypothesis, existing_solution, demand_signal,
              problem_statement, brief_version, problem_brief,
              generation_step, generation_run,
              claim_version_evidence, evidence_item, claim_version, claim,
              source_artifact, submission, investigation CASCADE`,
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

// ---- Fixtures — duplicated verbatim in shape from generateBriefVersion.test.ts's own (unexported) helpers ----

async function seedInvestigation(): Promise<{ investigationId: string; sourceArtifactId: string }> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  return { investigationId: submission.investigationId, sourceArtifactId: submission.sourceArtifactIds[0] };
}

async function insertEvidenceItem(sourceArtifactId: string, excerpt = 'evidence'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label) VALUES ($1, $2, 'observation') RETURNING id`,
    [sourceArtifactId, excerpt],
  );
  return result.rows[0].id;
}

async function insertClaim(): Promise<string> {
  const result = await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`);
  return result.rows[0].id;
}

async function insertClaimVersion(claimId: string, text = 'claim text'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, $2) RETURNING id`,
    [claimId, text],
  );
  return result.rows[0].id;
}

async function linkClaimVersionEvidence(claimVersionId: string, evidenceItemId: string): Promise<void> {
  await pool.query(
    `INSERT INTO claim_version_evidence (claim_version_id, evidence_item_id, stance) VALUES ($1, $2, 'supporting')`,
    [claimVersionId, evidenceItemId],
  );
}

async function seedCleanExtraction(sourceArtifactId: string): Promise<{
  claimVersionId: string;
  evidenceItemId: string;
  extraction: ExtractionResult;
}> {
  const claimId = await insertClaim();
  const claimVersionId = await insertClaimVersion(claimId);
  const evidenceItemId = await insertEvidenceItem(sourceArtifactId, 'fresh extraction evidence');
  await linkClaimVersionEvidence(claimVersionId, evidenceItemId);

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
      { id: evidenceItemId, sourceArtifactId, excerptOrSummary: 'fresh extraction evidence', label: 'observation' },
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
  return { claimVersionId, evidenceItemId, extraction };
}

function cleanDemand(evidenceItemId: string): DemandAnalysisResult {
  return {
    demandSignalCandidates: [{ localId: 'ds-1', type: 'recurring-complaints', evidenceItemIds: [evidenceItemId] }],
    demandConfidenceClassificationCandidate: {
      level: 'Emerging',
      narrative: 'One recurring-complaints signal.',
      citedDemandSignalIds: ['ds-1'],
    },
    generationFailed: false,
  };
}

function cleanPersonalPull(sourceArtifactId: string): PersonalPullExtractionResult {
  return {
    personalPullNoteCandidates: [{ sourceArtifactId, text: 'founder motivation note', label: 'contextual-motivation' }],
    generationFailed: false,
  };
}

function cleanLandscape(evidenceItemId: string): LandscapeResearchResult {
  return {
    webSearchQueries: [
      {
        id: randomUUID(),
        investigationId: '',
        generationRunId: '',
        query: 'existing solutions for this problem space',
        performedAt: new Date().toISOString(),
        results: [],
        limitations: [],
      },
    ],
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
}

function cleanGap(evidenceItemId: string): GapHypothesisGenerationResult {
  return {
    gapHypothesisCandidates: [
      { category: 'capability', statement: 'No automated reconciliation exists.', evidenceItemIds: [evidenceItemId] },
    ],
    generationFailed: false,
  };
}

const cleanUncertainty: UncertaintyCompilationResult = {
  uncertaintyStatementCandidate: {
    whatsUnknown: ['long-term retention'],
    whatWouldChangeConclusion: ['a failed pilot'],
    whatsUndeterminable: ['nothing at this time'],
  },
  generationFailed: false,
};

const cleanRecommendation: RecommendationResult = {
  recommendationCandidate: { decision: 'Approve', rationale: 'Evidence supports the problem.' },
  generationFailed: false,
};

describe('generateBriefVersion — GenerationRunLostFinalizationRaceError propagation', () => {
  it('propagates GenerationRunLostFinalizationRaceError (not swallowed, not converted to BriefGenerationFailedError) when a concurrent finalize wins the race, and Phase 4 rolls back entirely', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);

    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(extractClaimsAndEvidenceForSourceArtifacts).mockResolvedValue(extraction);
    vi.mocked(analyzeDemand).mockResolvedValue(cleanDemand(evidenceItemId));
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(sourceArtifactId));
    vi.mocked(researchLandscape).mockResolvedValue(cleanLandscape(evidenceItemId));
    vi.mocked(generateGapHypotheses).mockResolvedValue(cleanGap(evidenceItemId));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);

    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    vi.mocked(generateRecommendation).mockImplementation(async () => {
      await gate;
      return cleanRecommendation;
    });

    let capturedRunId: string | null = null;
    const pipelinePromise = generateBriefVersion({
      investigationId,
      runtimeIdentifier: 'test-runtime',
      onRunCreated: (run) => {
        capturedRunId = run.id;
      },
    });

    // Wait for Phase 1's run to exist (onRunCreated fires synchronously right after), then win the
    // race directly: a concurrent abandon finalizing this run 'failed' while the pipeline is held
    // open at the gate, well before Phase 4 reaches its own finalize call.
    for (let i = 0; i < 50 && capturedRunId === null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(capturedRunId).not.toBeNull();
    const runId = capturedRunId as unknown as string;
    const runRow = await pool.query<{ fence_token: number }>(`SELECT fence_token FROM generation_run WHERE id = $1`, [
      runId,
    ]);
    await finalizeGenerationRun({
      generationRunId: runId,
      outcome: 'failed',
      briefVersionId: null,
      fenceToken: runRow.rows[0].fence_token,
    });

    releaseGate();

    await expect(pipelinePromise).rejects.toBeInstanceOf(GenerationRunLostFinalizationRaceError);
    await expect(pipelinePromise).rejects.not.toBeInstanceOf(BriefGenerationFailedError);

    // Phase 4's own transaction rolled back — no BriefVersion persisted, no status transition.
    const briefVersions = await pool.query(`SELECT count(*) FROM brief_version WHERE generation_run_id = $1`, [
      runId,
    ]);
    expect(Number(briefVersions.rows[0].count)).toBe(0);

    const investigation = await pool.query<{ status: string }>(`SELECT status FROM investigation WHERE id = $1`, [
      investigationId,
    ]);
    expect(investigation.rows[0].status).not.toBe('brief-generated');

    // finalizeGenerationRun was NOT called a second time for this run — its persisted outcome
    // remains 'failed' (the abandon's own write), never overwritten by the would-have-succeeded
    // pipeline.
    const finalRow = await pool.query<{ outcome: string }>(`SELECT outcome FROM generation_run WHERE id = $1`, [
      runId,
    ]);
    expect(finalRow.rows[0].outcome).toBe('failed');
  });
});
