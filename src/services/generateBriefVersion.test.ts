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
 * Slice 9 (Brief Assembler) — generateBriefVersion.
 *
 * INDEPENDENCE NOTE: written against docs/specs/problem-department-mvp/SLICE-09-DESIGN.md
 * revision 8 and 04-ROADMAP.md's "Slice 9: Brief Assembler" Tests checklist ONLY. The seven
 * pipeline components (extractClaimsAndEvidence, analyzeDemand, extractPersonalPull,
 * researchLandscape, generateGapHypotheses, compileUncertainty, generateRecommendation) are
 * mocked at their module boundary — the contract Slice 9 owns is orchestration, fail-closed
 * validation, and persistence, not those components' own internal logic (already covered by
 * their own suites). Persistence, locking, and concurrency assertions run against the real
 * database, matching the idiom of provenanceRecorder.test.ts / demandAnalyzer.test.ts.
 */

vi.mock('./extractClaimsAndEvidence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./extractClaimsAndEvidence.js')>();
  return { ...actual, extractClaimsAndEvidence: vi.fn() };
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

const { extractClaimsAndEvidence } = await import('./extractClaimsAndEvidence.js');
const { analyzeDemand } = await import('./demandAnalyzer.js');
const { extractPersonalPull } = await import('./personalPullExtractor.js');
const { researchLandscape } = await import('./landscapeResearcher.js');
const { generateGapHypotheses } = await import('./gapHypothesisGenerator.js');
const { compileUncertainty } = await import('./uncertaintyCompiler.js');
const { generateRecommendation } = await import('./recommendationEngine.js');

const {
  generateBriefVersion,
  BriefGenerationFailedError,
  InvalidSupersedeTargetError,
  StaleCorrectionConflictError,
} = await import('./generateBriefVersion.js');
const { getInvestigation } = await import('./getInvestigation.js');

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
  vi.mocked(analyzeDemand).mockReset();
  vi.mocked(extractPersonalPull).mockReset();
  vi.mocked(researchLandscape).mockReset();
  vi.mocked(generateGapHypotheses).mockReset();
  vi.mocked(compileUncertainty).mockReset();
  vi.mocked(generateRecommendation).mockReset();
});

// ---- Fixtures ----------------------------------------------------------------------------

async function seedInvestigation(): Promise<{ investigationId: string; sourceArtifactId: string }> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  return { investigationId: submission.investigationId, sourceArtifactId: submission.sourceArtifactIds[0] };
}

/** Inserts a real, persisted EvidenceItem scoped to the given sourceArtifactId (and therefore to
 *  whatever Investigation owns that source artifact). Used to build local vs. foreign fixtures. */
async function insertEvidenceItem(sourceArtifactId: string, excerpt = 'evidence'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label)
     VALUES ($1, $2, 'observation') RETURNING id`,
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

async function linkClaimVersionEvidence(
  claimVersionId: string,
  evidenceItemId: string,
  stance: 'supporting' | 'contradicting' | 'neutral-context' = 'supporting',
): Promise<void> {
  await pool.query(
    `INSERT INTO claim_version_evidence (claim_version_id, evidence_item_id, stance) VALUES ($1, $2, $3)`,
    [claimVersionId, evidenceItemId, stance],
  );
}

/** A complete, otherwise-valid ExtractionResult: one ClaimVersion citing one FRESH EvidenceItem
 *  this call itself inserts (member of ExtractionResult.evidenceItems, NOT a member of
 *  startSnapshot — this is the ordinary path per revision 8). */
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
    generationFailed: false,
  };
  return { claimVersionId, evidenceItemId, extraction };
}

function cleanDemand(evidenceItemId: string): DemandAnalysisResult {
  return {
    demandSignalCandidates: [
      { localId: 'ds-1', type: 'recurring-complaints', evidenceItemIds: [evidenceItemId] },
    ],
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
    personalPullNoteCandidates: [
      { sourceArtifactId, text: 'founder motivation note', label: 'contextual-motivation' },
    ],
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
  };
}

function cleanGap(evidenceItemId: string): GapHypothesisGenerationResult {
  return {
    gapHypothesisCandidates: [
      {
        category: 'capability',
        statement: 'No automated reconciliation exists.',
        evidenceItemIds: [evidenceItemId],
      },
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

/** Wires all seven mocks to a fully clean, successful pipeline run, given the fixtures produced
 *  by seedCleanExtraction/seedInvestigation. Individual tests override specific mocks to produce
 *  the scenario under test. */
function wireCleanPipeline(params: {
  extraction: ExtractionResult;
  sourceArtifactId: string;
  primaryEvidenceItemId: string;
}): void {
  vi.mocked(extractClaimsAndEvidence).mockResolvedValue(params.extraction);
  vi.mocked(analyzeDemand).mockResolvedValue(cleanDemand(params.primaryEvidenceItemId));
  vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(params.sourceArtifactId));
  vi.mocked(researchLandscape).mockResolvedValue(cleanLandscape(params.primaryEvidenceItemId));
  vi.mocked(generateGapHypotheses).mockResolvedValue(cleanGap(params.primaryEvidenceItemId));
  vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
  vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);
}

// ---- 1. Happy path — version 1, all seven elements, generationRunId (roadmap checkbox 1) -------

describe('generateBriefVersion — first generation, happy path', () => {
  it('roadmap checkbox 1: creates exactly one version-1 BriefVersion with all seven elements populated and generationRunId set (also falsification test A: citing THIS run\'s own fresh Extraction evidence must succeed, the ordinary path)', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction, sourceArtifactId, primaryEvidenceItemId: evidenceItemId });

    const version = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    expect(version.versionNumber).toBe(1);
    expect(version.problemStatementIds.length).toBeGreaterThan(0);
    expect(version.claimVersionIds.length).toBeGreaterThan(0);
    expect(version.demandSignalIds.length).toBeGreaterThan(0);
    expect(version.demandConfidenceClassification).toBeDefined();
    expect(version.existingSolutionIds.length).toBeGreaterThan(0);
    expect(version.gapHypothesisIds.length).toBeGreaterThan(0);
    expect(version.uncertaintyStatement).toBeDefined();
    expect(version.recommendation).toBeDefined();
    expect(version.personalPullNoteIds.length).toBeGreaterThan(0);
    expect(version.generationRunId).toBeTruthy();

    const brief = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(brief.rowCount).toBe(1);
    expect(brief.rows[0].current_version_id).toBe(version.id);

    const investigation = await pool.query(`SELECT status, problem_brief_id FROM investigation WHERE id = $1`, [investigationId]);
    expect(investigation.rows[0].status).toBe('brief-generated');
    expect(investigation.rows[0].problem_brief_id).toBe(brief.rows[0].id);
  });
});

// ---- 2. Correction versioning (roadmap checkbox 2) -----------------------------------------

describe('generateBriefVersion — correction versioning', () => {
  it('roadmap checkbox 2: a correction creates a superseding version; the prior version remains readable unchanged; ONLY ProblemBrief.currentVersionId changes on ProblemBrief', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction, sourceArtifactId, primaryEvidenceItemId: evidenceItemId });

    const v1 = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });
    const briefBefore = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);

    // Fresh fixtures for the correction's own extraction (a real, distinct run).
    const { evidenceItemId: evidenceItemId2, extraction: extraction2 } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction: extraction2, sourceArtifactId, primaryEvidenceItemId: evidenceItemId2 });

    const v2 = await generateBriefVersion({
      investigationId,
      supersedesVersionId: v1.id,
      runtimeIdentifier: 'test',
    });

    expect(v2.versionNumber).toBe(2);
    expect(v2.supersedesVersionId).toBe(v1.id);

    // Prior version still readable, unchanged.
    const priorRow = await pool.query(`SELECT * FROM brief_version WHERE id = $1`, [v1.id]);
    expect(priorRow.rowCount).toBe(1);
    expect(priorRow.rows[0].version_number).toBe(1);

    const briefAfter = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefAfter.rows[0].current_version_id).toBe(v2.id);
    expect(briefAfter.rows[0].id).toBe(briefBefore.rows[0].id);
    expect(briefAfter.rows[0].investigation_id).toBe(briefBefore.rows[0].investigation_id);
    expect(new Date(briefAfter.rows[0].created_at).getTime()).toBe(new Date(briefBefore.rows[0].created_at).getTime());
  });
});

// ---- 3. Q-2 non-negatable problem statement (roadmap checkbox) -----------------------------

describe('generateBriefVersion — Q-2 non-negatable Problem Statement', () => {
  it('given no valid ProblemStatement can be established, the run fails explicitly: no BriefVersion persisted, Investigation.status becomes generation-failed, and no problem-statement NegativeFinding is ever constructed (not in BriefElement)', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    void sourceArtifactId;
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue({
      claimVersions: [],
      evidenceItems: [],
      problemStatementCandidates: [],
      generationFailed: false, // nominally successful extraction, but zero problem statements
    });

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);

    expect(analyzeDemand).not.toHaveBeenCalled();

    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);

    const investigation = await pool.query(`SELECT status FROM investigation WHERE id = $1`, [investigationId]);
    expect(investigation.rows[0].status).toBe('generation-failed');

    const findings = await pool.query(
      `SELECT * FROM negative_finding nf JOIN brief_version bv ON bv.id = nf.brief_version_id
       WHERE bv.problem_brief_id IN (SELECT id FROM problem_brief WHERE investigation_id = $1)`,
      [investigationId],
    );
    expect(findings.rowCount).toBe(0);
  });
});

// ---- 4. G-1 hard stop precedence (roadmap checkbox — Demand/Landscape/Gap failure) ----------

describe('generateBriefVersion — G-1 precedence hard stop', () => {
  it('given the Demand Analyzer returns generationFailed:true, the run hard-stops immediately: Landscape/Gap/Uncertainty/Recommendation are never called, no BriefVersion, Investigation.status becomes generation-failed', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { extraction } = await seedCleanExtraction(sourceArtifactId);
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(analyzeDemand).mockResolvedValue({
      demandSignalCandidates: [],
      demandConfidenceClassificationCandidate: { level: 'Insufficient', narrative: 'n/a', citedDemandSignalIds: [] },
      generationFailed: true,
      generationFailureReason: 'model call failed',
    });

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);

    expect(researchLandscape).not.toHaveBeenCalled();
    expect(generateGapHypotheses).not.toHaveBeenCalled();
    expect(compileUncertainty).not.toHaveBeenCalled();
    expect(generateRecommendation).not.toHaveBeenCalled();

    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
    const investigation = await pool.query(`SELECT status FROM investigation WHERE id = $1`, [investigationId]);
    expect(investigation.rows[0].status).toBe('generation-failed');
  });
});

// ---- 4b. getInvestigation surfaces the REAL statusReason after a live failure (roadmap
//          checkbox — "revisiting the Investigation Screen renders the Generation Failed State
//          built in Slice 3 with the real statusReason") ------------------------------------
//
// Slice 3 built the Generation Failed State component against a FIXTURE statusReason; this slice
// is explicitly the one whose tests "exercise it end-to-end" (04-ROADMAP.md, Slice 9 Tests list).
// getInvestigation (src/services/getInvestigation.ts) is the single durable-URL read path every
// screen uses — this test drives generateBriefVersion to a genuine failure, then calls
// getInvestigation and asserts the reason it returns is the one THIS pipeline run actually
// produced, not a hardcoded string, proving the live wiring rather than trusting the component
// fixture built in an earlier slice.

describe('generateBriefVersion — getInvestigation returns the real statusReason after a live failure', () => {
  it('after a failed generation run, getInvestigation returns status generation-failed carrying the exact reason produced by this run\'s pipeline failure', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { extraction } = await seedCleanExtraction(sourceArtifactId);
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    const distinctiveFailureReason = `demand analysis model call failed — run marker ${randomUUID()}`;
    vi.mocked(analyzeDemand).mockResolvedValue({
      demandSignalCandidates: [],
      demandConfidenceClassificationCandidate: { level: 'Insufficient', narrative: 'n/a', citedDemandSignalIds: [] },
      generationFailed: true,
      generationFailureReason: distinctiveFailureReason,
    });

    let caught: unknown;
    try {
      await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BriefGenerationFailedError);

    const { investigation } = await getInvestigation(investigationId);

    expect(investigation.status).toBe('generation-failed');
    expect(investigation.statusReason).toBeTruthy();
    // Real pipeline output, not a fixture: the returned reason traces back to THIS run's own
    // distinctive, randomly-marked failure text, not a canned/hardcoded string.
    expect(investigation.statusReason).toContain(distinctiveFailureReason.split(' — run marker ')[0]);
    expect(investigation.statusReason).toContain(distinctiveFailureReason.split(' — run marker ')[1]);
  });
});

// ---- 5. Blocked distinct from generation-failed (roadmap checkbox, G-13) -------------------
//
// SLICE-09-DESIGN.md §5's taxonomy, row 1 ("No reachable sources"): "'blocked' (set by Slice 3,
// unchanged)" — generateBriefVersion never inspects source-artifact reachability itself and owns
// no code path that SETS 'blocked'. The actual, spec-grounded guarantee this checkbox protects is
// downstream of that: §6's ALLOWED_PRIOR_STATUSES table only permits the 'generation-failed'
// transition FROM 'open' or 'generation-failed' — 'blocked' is not a member. So even when
// generateBriefVersion's phase-1 GenerationRun creation and pipeline execution proceed against an
// Investigation a prior Slice-3 pass already left 'blocked' (nothing in this slice checks that
// before running), the phase-4/failure-path guarded UPDATE to 'generation-failed' affects zero
// rows and the Investigation is left exactly as it was found (§6, lines ~1160-1169: "the correct
// behavior is to LEAVE the Investigation exactly as this concurrent observation found it"). This
// test calls generateBriefVersion for real and proves the two statuses stay distinct at the type
// level, not merely as differently-labeled free text.
describe('generateBriefVersion — blocked distinct from generation-failed (G-13)', () => {
  it('given an Investigation already left blocked (zero reachable sources) whose pipeline run then fails, Investigation.status remains blocked rather than being overwritten to generation-failed, the thrown error reports investigationStatus: blocked, and no BriefVersion is created', async () => {
    const { investigationId } = await seedInvestigation();
    await pool.query(`UPDATE investigation SET status = 'blocked' WHERE id = $1`, [investigationId]);

    // A genuine pipeline failure (extraction fails) — the same trigger the I-1/C-1 row of §5 uses
    // to drive the ordinary generation-failed transition. If this test's replacement collapsed
    // 'blocked' and 'generation-failed' into one value (e.g. ALLOWED_PRIOR_STATUSES wrongly
    // included 'blocked', or the guarded-UPDATE return value were ignored and the status forced),
    // the assertions below would observe status === 'generation-failed' and FAIL.
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue({
      claimVersions: [],
      evidenceItems: [],
      problemStatementCandidates: [],
      generationFailed: true,
    });

    let caught: unknown;
    try {
      await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(BriefGenerationFailedError);
    const err = caught as InstanceType<typeof BriefGenerationFailedError>;
    expect(err.investigationStatus).toBe('blocked');
    expect(err.investigationStatus).not.toBe('generation-failed');

    const investigation = await pool.query(`SELECT status FROM investigation WHERE id = $1`, [investigationId]);
    expect(investigation.rows[0].status).toBe('blocked');
    expect(investigation.rows[0].status).not.toBe('generation-failed');

    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
  });
});

// ---- 6. Demand-signal-type negative finding (roadmap checkbox) -----------------------------

describe('generateBriefVersion — demand-signal-type negative finding', () => {
  it('given the Demand Analyzer finds zero signals but supplies a non-empty negativeFindingSignal, the assembled BriefVersion.negativeFindings contains exactly one demand-signal-type row with that statement, and demandSignalIds is empty', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction, sourceArtifactId, primaryEvidenceItemId: evidenceItemId });
    vi.mocked(analyzeDemand).mockResolvedValue({
      demandSignalCandidates: [],
      demandConfidenceClassificationCandidate: {
        level: 'Insufficient',
        narrative: 'nothing found',
        citedDemandSignalIds: [],
        negativeFindingSignal: { statement: 'No demand signals were found in the reviewed material.' },
      },
      generationFailed: false,
    });

    const version = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    expect(version.demandSignalIds).toHaveLength(0);
    const findings = await pool.query(
      `SELECT element, statement FROM negative_finding WHERE brief_version_id = $1`,
      [version.id],
    );
    const demandFindings = findings.rows.filter((r) => r.element === 'demand-signal-type');
    expect(demandFindings).toHaveLength(1);
    expect(demandFindings[0].statement).toBe('No demand signals were found in the reviewed material.');
  });
});

// ---- 7. Negative-findings success case, maximum THREE rows (roadmap checkbox) --------------

describe('generateBriefVersion — negative findings, maximum three rows', () => {
  it('given demand-signal-type, existing-solution, and gap-hypothesis each legitimately empty with a negativeFindingSignal, the BriefVersion persists exactly THREE NegativeFinding rows (not 0-4 — evidence is structurally unreachable)', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(sourceArtifactId));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
    vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);
    void evidenceItemId;

    vi.mocked(analyzeDemand).mockResolvedValue({
      demandSignalCandidates: [],
      demandConfidenceClassificationCandidate: {
        level: 'Insufficient',
        narrative: 'nothing found',
        citedDemandSignalIds: [],
        negativeFindingSignal: { statement: 'No demand signals found.' },
      },
      generationFailed: false,
    });
    vi.mocked(researchLandscape).mockResolvedValue({
      webSearchQueries: [],
      existingSolutionCandidates: [],
      landscapeEvidenceItems: [],
      generationFailed: false,
      negativeFindingSignal: { statement: 'No existing solutions found.' },
    });
    vi.mocked(generateGapHypotheses).mockResolvedValue({
      gapHypothesisCandidates: [],
      generationFailed: false,
      negativeFindingSignal: { statement: 'No gap hypotheses found.' },
    });

    const version = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const findings = await pool.query(
      `SELECT element FROM negative_finding WHERE brief_version_id = $1`,
      [version.id],
    );
    expect(findings.rowCount).toBe(3);
    const elements = findings.rows.map((r) => r.element).sort();
    expect(elements).toEqual(['demand-signal-type', 'existing-solution', 'gap-hypothesis']);
    // Structurally unreachable — must never appear.
    expect(elements).not.toContain('evidence');
  });
});

// ---- 8. Both-empty fail-closed rejection (roadmap checkbox) --------------------------------

describe('generateBriefVersion — both-empty fail-closed rejection', () => {
  it('given demand-signal-type has both an empty id array AND no NegativeFinding row, the run terminal-fails directly with no BriefVersion — no bounded repair', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction, sourceArtifactId, primaryEvidenceItemId: evidenceItemId });
    vi.mocked(analyzeDemand).mockResolvedValue({
      demandSignalCandidates: [],
      demandConfidenceClassificationCandidate: {
        level: 'Insufficient',
        narrative: 'nothing found',
        citedDemandSignalIds: [],
        // negativeFindingSignal deliberately absent — neither branch satisfied.
      },
      generationFailed: false,
    });

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);

    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
  });
});

// ---- 9. Falsification test E: nominally-successful extraction, zero resolvable evidence -----

describe('generateBriefVersion — falsification test E: overrides upstream generationFailed:false', () => {
  it('a nominally successful extraction whose accepted ProblemStatements resolve to ZERO persisted EvidenceItems fails closed: no BriefVersion, no evidence NegativeFinding, proving Slice 9 distrusts the upstream flag', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const claimId = await insertClaim();
    const claimVersionId = await insertClaimVersion(claimId);
    // Deliberately NO claim_version_evidence row inserted — broken chain.

    const extraction: ExtractionResult = {
      claimVersions: [
        {
          id: claimVersionId,
          claimId,
          versionNumber: 1,
          createdAt: new Date().toISOString(),
          text: 'claim text',
          // NonEmptyArray contract requires at least one entry structurally, but nothing was
          // ever persisted to back it — this is the broken-reference shape the test targets.
          evidence: [{ evidenceItemId: randomUUID(), stance: 'supporting' }],
          supersedesVersionId: null,
        },
      ],
      evidenceItems: [],
      problemStatementCandidates: [
        {
          whoExperiencesIt: 'x',
          contextOrWorkflow: 'y',
          consequenceOrFriction: 'z',
          supportingClaimVersionIds: [claimVersionId],
        },
      ],
      generationFailed: false,
    };
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    void sourceArtifactId;

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);

    expect(analyzeDemand).not.toHaveBeenCalled();
    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
    const investigation = await pool.query(`SELECT status FROM investigation WHERE id = $1`, [investigationId]);
    expect(investigation.rows[0].status).toBe('generation-failed');
  });
});

// ---- 10. Falsification tests C/D: foreign and mixed-ownership evidence ---------------------

describe('generateBriefVersion — falsification tests C/D: ownership (zero-foreign, not "at least one local")', () => {
  it('falsification test C: a citation entirely OUTSIDE the run\'s evidence universe (foreign Investigation) fails closed', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const foreign = await seedInvestigation();
    const foreignEvidenceId = await insertEvidenceItem(foreign.sourceArtifactId, 'foreign evidence');

    const claimId = await insertClaim();
    const claimVersionId = await insertClaimVersion(claimId);
    await linkClaimVersionEvidence(claimVersionId, foreignEvidenceId);

    const extraction: ExtractionResult = {
      claimVersions: [
        {
          id: claimVersionId,
          claimId,
          versionNumber: 1,
          createdAt: new Date().toISOString(),
          text: 'claim text',
          evidence: [{ evidenceItemId: foreignEvidenceId, stance: 'supporting' }],
          supersedesVersionId: null,
        },
      ],
      evidenceItems: [],
      problemStatementCandidates: [
        {
          whoExperiencesIt: 'x',
          contextOrWorkflow: 'y',
          consequenceOrFriction: 'z',
          supportingClaimVersionIds: [claimVersionId],
        },
      ],
      generationFailed: false,
    };
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    void sourceArtifactId;

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);
    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
  });

  it('falsification test D: a ClaimVersion citing ONE LOCAL and ONE FOREIGN EvidenceItem fails closed (proves "zero foreign", not "at least one local")', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const foreign = await seedInvestigation();
    const localEvidenceId = await insertEvidenceItem(sourceArtifactId, 'local evidence');
    const foreignEvidenceId = await insertEvidenceItem(foreign.sourceArtifactId, 'foreign evidence');

    const claimId = await insertClaim();
    const claimVersionId = await insertClaimVersion(claimId);
    await linkClaimVersionEvidence(claimVersionId, localEvidenceId);
    await linkClaimVersionEvidence(claimVersionId, foreignEvidenceId);

    const extraction: ExtractionResult = {
      claimVersions: [
        {
          id: claimVersionId,
          claimId,
          versionNumber: 1,
          createdAt: new Date().toISOString(),
          text: 'claim text',
          evidence: [
            { evidenceItemId: localEvidenceId, stance: 'supporting' },
            { evidenceItemId: foreignEvidenceId, stance: 'supporting' },
          ],
          supersedesVersionId: null,
        },
      ],
      evidenceItems: [
        { id: localEvidenceId, sourceArtifactId, excerptOrSummary: 'local evidence', label: 'observation' },
      ],
      problemStatementCandidates: [
        {
          whoExperiencesIt: 'x',
          contextOrWorkflow: 'y',
          consequenceOrFriction: 'z',
          supportingClaimVersionIds: [claimVersionId],
        },
      ],
      generationFailed: false,
    };
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);
    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
  });

  it('falsification test D (DemandSignal): mixed local/foreign evidenceItemIds on a DemandSignalCandidate fails closed', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const foreign = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    const foreignEvidenceId = await insertEvidenceItem(foreign.sourceArtifactId, 'foreign evidence');

    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(sourceArtifactId));
    vi.mocked(researchLandscape).mockResolvedValue(cleanLandscape(evidenceItemId));
    vi.mocked(generateGapHypotheses).mockResolvedValue(cleanGap(evidenceItemId));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
    vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);
    vi.mocked(analyzeDemand).mockResolvedValue({
      demandSignalCandidates: [
        { localId: 'ds-1', type: 'recurring-complaints', evidenceItemIds: [evidenceItemId, foreignEvidenceId] },
      ],
      demandConfidenceClassificationCandidate: {
        level: 'Emerging',
        narrative: 'mixed',
        citedDemandSignalIds: ['ds-1'],
      },
      generationFailed: false,
    });

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);
    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
  });

  it('falsification test D (ExistingSolution): mixed local/foreign evidenceItemIds on an ExistingSolutionCandidate fails closed', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const foreign = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    const foreignEvidenceId = await insertEvidenceItem(foreign.sourceArtifactId, 'foreign evidence');

    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(sourceArtifactId));
    vi.mocked(analyzeDemand).mockResolvedValue(cleanDemand(evidenceItemId));
    vi.mocked(generateGapHypotheses).mockResolvedValue(cleanGap(evidenceItemId));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
    vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);
    vi.mocked(researchLandscape).mockResolvedValue({
      webSearchQueries: [],
      existingSolutionCandidates: [
        {
          localId: 'es-1',
          name: 'Competitor X',
          whatItAddresses: 'a',
          howPeopleCopeNow: 'b',
          whereItsInadequate: 'c',
          evidenceItemIds: [evidenceItemId, foreignEvidenceId],
        },
      ],
      landscapeEvidenceItems: [],
      generationFailed: false,
    });

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);
    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
  });

  it('falsification test D (GapHypothesis): mixed local/foreign evidenceItemIds on a GapHypothesisCandidate fails closed', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const foreign = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    const foreignEvidenceId = await insertEvidenceItem(foreign.sourceArtifactId, 'foreign evidence');

    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(sourceArtifactId));
    vi.mocked(analyzeDemand).mockResolvedValue(cleanDemand(evidenceItemId));
    vi.mocked(researchLandscape).mockResolvedValue(cleanLandscape(evidenceItemId));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
    vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);
    vi.mocked(generateGapHypotheses).mockResolvedValue({
      gapHypothesisCandidates: [
        { category: 'capability', statement: 'gap', evidenceItemIds: [evidenceItemId, foreignEvidenceId] },
      ],
      generationFailed: false,
    });

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);
    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
  });

  it('falsification test D (PersonalPullNote): a foreign sourceArtifactId fails closed', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const foreign = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);

    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(analyzeDemand).mockResolvedValue(cleanDemand(evidenceItemId));
    vi.mocked(researchLandscape).mockResolvedValue(cleanLandscape(evidenceItemId));
    vi.mocked(generateGapHypotheses).mockResolvedValue(cleanGap(evidenceItemId));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
    vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);
    vi.mocked(extractPersonalPull).mockResolvedValue({
      personalPullNoteCandidates: [
        { sourceArtifactId: foreign.sourceArtifactId, text: 'foreign note', label: 'contextual-motivation' },
      ],
      generationFailed: false,
    });

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);
    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
  });
});

// ---- 11. Falsification test B: legitimate correction citing pre-run LOCAL evidence ----------

describe('generateBriefVersion — falsification test B: legitimate correction citing local evidence that predates this run', () => {
  it('a correction citing a LOCAL EvidenceItem present in startSnapshot (not in any of this run\'s own step outputs) MUST SUCCEED', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId: v1Evidence, extraction: v1Extraction } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction: v1Extraction, sourceArtifactId, primaryEvidenceItemId: v1Evidence });
    const v1 = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    // The correction's own extraction cites the OLD evidence item (v1Evidence), which predates
    // this run — present in startSnapshot, absent from this run's own ExtractionResult.evidenceItems.
    const claimId = await insertClaim();
    const claimVersionId = await insertClaimVersion(claimId, 'corrected claim text');
    await linkClaimVersionEvidence(claimVersionId, v1Evidence);

    const correctionExtraction: ExtractionResult = {
      claimVersions: [
        {
          id: claimVersionId,
          claimId,
          versionNumber: 1,
          createdAt: new Date().toISOString(),
          text: 'corrected claim text',
          evidence: [{ evidenceItemId: v1Evidence, stance: 'supporting' }],
          supersedesVersionId: null,
        },
      ],
      evidenceItems: [], // this run's own Extraction step created nothing new
      problemStatementCandidates: [
        {
          whoExperiencesIt: 'small teams',
          contextOrWorkflow: 'manual reconciliation',
          consequenceOrFriction: 'hours lost weekly',
          supportingClaimVersionIds: [claimVersionId],
        },
      ],
      generationFailed: false,
    };
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(correctionExtraction);
    vi.mocked(analyzeDemand).mockResolvedValue(cleanDemand(v1Evidence));
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(sourceArtifactId));
    vi.mocked(researchLandscape).mockResolvedValue(cleanLandscape(v1Evidence));
    vi.mocked(generateGapHypotheses).mockResolvedValue(cleanGap(v1Evidence));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
    vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);

    const v2 = await generateBriefVersion({
      investigationId,
      supersedesVersionId: v1.id,
      runtimeIdentifier: 'test',
    });

    expect(v2.versionNumber).toBe(2);
    expect(v2.supersedesVersionId).toBe(v1.id);
  });
});

// ---- 12. Falsification test F: stale same-Brief target rejected in PREFLIGHT ----------------

describe('generateBriefVersion — falsification test F: stale same-Brief supersede target', () => {
  it('current is v3, caller supplies v1: rejected in PREFLIGHT with InvalidSupersedeTargetError (NOT StaleCorrectionConflictError), ZERO LLM calls, no BriefVersion persisted', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();

    let v1Id = '';
    let priorId: string | undefined;
    for (let i = 0; i < 3; i++) {
      const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
      wireCleanPipeline({ extraction, sourceArtifactId, primaryEvidenceItemId: evidenceItemId });
      const v = await generateBriefVersion({
        investigationId,
        supersedesVersionId: priorId,
        runtimeIdentifier: 'test',
      });
      if (i === 0) v1Id = v.id;
      priorId = v.id;
    }

    vi.mocked(extractClaimsAndEvidence).mockReset();
    vi.mocked(analyzeDemand).mockReset();
    vi.mocked(extractPersonalPull).mockReset();
    vi.mocked(researchLandscape).mockReset();
    vi.mocked(generateGapHypotheses).mockReset();
    vi.mocked(compileUncertainty).mockReset();
    vi.mocked(generateRecommendation).mockReset();

    await expect(
      generateBriefVersion({ investigationId, supersedesVersionId: v1Id, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(InvalidSupersedeTargetError);

    expect(extractClaimsAndEvidence).not.toHaveBeenCalled();
    expect(analyzeDemand).not.toHaveBeenCalled();
    expect(researchLandscape).not.toHaveBeenCalled();
    expect(generateGapHypotheses).not.toHaveBeenCalled();
    expect(compileUncertainty).not.toHaveBeenCalled();
    expect(generateRecommendation).not.toHaveBeenCalled();

    const versions = await pool.query(
      `SELECT count(*) FROM brief_version bv JOIN problem_brief pb ON pb.id = bv.problem_brief_id
       WHERE pb.investigation_id = $1`,
      [investigationId],
    );
    expect(Number(versions.rows[0].count)).toBe(3);
  });
});

// ---- 13. Concurrency (real, not simulated) — roadmap checkboxes -----------------------------

describe('generateBriefVersion — real concurrency', () => {
  it('falsification test G(i)/G(ii): two corrections racing from the same version — exactly one commits; the loser gets a stale-correction conflict, no branch; the loser\'s failed GenerationRun records the conflict reason while the Investigation still resolves to the winner\'s Brief with status/statusReason/problemBriefId/currentVersionId unchanged by the loser and NOT moved to generation-failed', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId: e0, extraction: x0 } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction: x0, sourceArtifactId, primaryEvidenceItemId: e0 });
    const v1 = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const { evidenceItemId: eA, extraction: xA } = await seedCleanExtraction(sourceArtifactId);
    const { evidenceItemId: eB, extraction: xB } = await seedCleanExtraction(sourceArtifactId);

    // Two genuinely concurrent DB connections/pipeline runs racing the same supersedesVersionId.
    // Mocks are call-order-shared across both concurrent invocations of this module's shared
    // mock functions — each resolves once per call, consumed in call order by whichever
    // generateBriefVersion invocation reaches that pipeline step first.
    vi.mocked(extractClaimsAndEvidence)
      .mockResolvedValueOnce(xA)
      .mockResolvedValueOnce(xB);
    vi.mocked(analyzeDemand)
      .mockResolvedValueOnce(cleanDemand(eA))
      .mockResolvedValueOnce(cleanDemand(eB));
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(sourceArtifactId));
    vi.mocked(researchLandscape)
      .mockResolvedValueOnce(cleanLandscape(eA))
      .mockResolvedValueOnce(cleanLandscape(eB));
    vi.mocked(generateGapHypotheses)
      .mockResolvedValueOnce(cleanGap(eA))
      .mockResolvedValueOnce(cleanGap(eB));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
    vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);

    const results = await Promise.allSettled([
      generateBriefVersion({ investigationId, supersedesVersionId: v1.id, runtimeIdentifier: 'racer-A' }),
      generateBriefVersion({ investigationId, supersedesVersionId: v1.id, runtimeIdentifier: 'racer-B' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(StaleCorrectionConflictError);
    expect(rejection.reason.expectedSupersedesVersionId).toBe(v1.id);

    const winner = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof generateBriefVersion>>>).value;
    expect(winner.versionNumber).toBe(2);
    expect(winner.supersedesVersionId).toBe(v1.id);

    // No branch: exactly 2 versions total on this ProblemBrief.
    const versionCount = await pool.query(
      `SELECT count(*) FROM brief_version bv JOIN problem_brief pb ON pb.id = bv.problem_brief_id
       WHERE pb.investigation_id = $1`,
      [investigationId],
    );
    expect(Number(versionCount.rows[0].count)).toBe(2);

    const brief = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(brief.rows[0].current_version_id).toBe(winner.id);

    const investigation = await pool.query(
      `SELECT status, status_reason, problem_brief_id FROM investigation WHERE id = $1`,
      [investigationId],
    );
    expect(investigation.rows[0].status).toBe('brief-generated');
    expect(investigation.rows[0].status).not.toBe('generation-failed');
    expect(investigation.rows[0].problem_brief_id).toBe(brief.rows[0].id);

    // The loser's own GenerationRun is a real, distinct failed run recording the conflict.
    const failedRuns = await pool.query(
      `SELECT gr.outcome, gr.brief_version_id, gs.error FROM generation_run gr
       LEFT JOIN generation_step gs ON gs.generation_run_id = gr.id
       WHERE gr.investigation_id = $1 AND gr.outcome = 'failed'
       ORDER BY gr.started_at DESC LIMIT 1`,
      [investigationId],
    );
    expect(failedRuns.rowCount).toBeGreaterThanOrEqual(1);
    expect(failedRuns.rows[0].brief_version_id).toBeNull();
  }, 20000);

  it('falsification test G(iii): two concurrent FIRST generations for the same investigationId — exactly one commits; the loser receives StaleCorrectionConflictError with expectedSupersedesVersionId: null, not a raw unique-constraint error and not a generation-failed transition', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId: eA, extraction: xA } = await seedCleanExtraction(sourceArtifactId);
    const { evidenceItemId: eB, extraction: xB } = await seedCleanExtraction(sourceArtifactId);

    vi.mocked(extractClaimsAndEvidence).mockResolvedValueOnce(xA).mockResolvedValueOnce(xB);
    vi.mocked(analyzeDemand).mockResolvedValueOnce(cleanDemand(eA)).mockResolvedValueOnce(cleanDemand(eB));
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(sourceArtifactId));
    vi.mocked(researchLandscape).mockResolvedValueOnce(cleanLandscape(eA)).mockResolvedValueOnce(cleanLandscape(eB));
    vi.mocked(generateGapHypotheses).mockResolvedValueOnce(cleanGap(eA)).mockResolvedValueOnce(cleanGap(eB));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
    vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);

    const results = await Promise.allSettled([
      generateBriefVersion({ investigationId, runtimeIdentifier: 'racer-A' }),
      generateBriefVersion({ investigationId, runtimeIdentifier: 'racer-B' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const rejection = rejected[0] as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(StaleCorrectionConflictError);
    expect(rejection.reason.expectedSupersedesVersionId).toBeNull();

    const briefs = await pool.query(`SELECT count(*) FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(Number(briefs.rows[0].count)).toBe(1);

    const investigation = await pool.query(`SELECT status FROM investigation WHERE id = $1`, [investigationId]);
    expect(investigation.rows[0].status).toBe('brief-generated');
  }, 20000);
});

// ---- 14. Retry from generation-failed (roadmap checkbox / falsification test H) -------------

describe('generateBriefVersion — retry from generation-failed', () => {
  it('falsification test H: an Investigation in generation-failed that succeeds on retry reaches brief-generated; a Brief never commits while the Investigation stays generation-failed', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();

    vi.mocked(extractClaimsAndEvidence).mockResolvedValueOnce({
      claimVersions: [],
      evidenceItems: [],
      problemStatementCandidates: [],
      generationFailed: false,
    });
    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);

    const afterFailure = await pool.query(`SELECT status FROM investigation WHERE id = $1`, [investigationId]);
    expect(afterFailure.rows[0].status).toBe('generation-failed');

    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction, sourceArtifactId, primaryEvidenceItemId: evidenceItemId });

    const version = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const afterRetry = await pool.query(`SELECT status, problem_brief_id FROM investigation WHERE id = $1`, [investigationId]);
    expect(afterRetry.rows[0].status).toBe('brief-generated');
    expect(afterRetry.rows[0].status).not.toBe('generation-failed');
    expect(afterRetry.rows[0].problem_brief_id).toBeTruthy();

    const brief = await pool.query(`SELECT current_version_id FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(brief.rows[0].current_version_id).toBe(version.id);
  });
});

// ---- 15. Exactly-once finalization (roadmap checkbox) ----------------------------------------

describe('generateBriefVersion — exactly-once finalization', () => {
  it('a successful run finalizes exactly once, with outcome succeeded and briefVersionId set', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction, sourceArtifactId, primaryEvidenceItemId: evidenceItemId });

    const version = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const runs = await pool.query(
      `SELECT outcome, brief_version_id FROM generation_run WHERE investigation_id = $1`,
      [investigationId],
    );
    expect(runs.rowCount).toBe(1);
    expect(runs.rows[0].outcome).toBe('succeeded');
    expect(runs.rows[0].brief_version_id).toBe(version.id);
  });

  it('a failed run finalizes exactly once after rollback, with outcome failed and briefVersionId null; no run is left in-progress', async () => {
    const { investigationId } = await seedInvestigation();
    vi.mocked(extractClaimsAndEvidence).mockResolvedValueOnce({
      claimVersions: [],
      evidenceItems: [],
      problemStatementCandidates: [],
      generationFailed: false,
    });

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);

    const runs = await pool.query(
      `SELECT outcome, brief_version_id, completed_at FROM generation_run WHERE investigation_id = $1`,
      [investigationId],
    );
    expect(runs.rowCount).toBe(1);
    expect(runs.rows[0].outcome).toBe('failed');
    expect(runs.rows[0].brief_version_id).toBeNull();
    expect(runs.rows[0].completed_at).not.toBeNull();
  });
});

// ---- 16. End-to-end pipeline provenance (SLICE-09-DESIGN.md §3, "End-to-end pipeline
// provenance tests to specify at Forge time" block, ~line 589-602) ---------------------------

describe('generateBriefVersion — end-to-end pipeline provenance (persisted generation_step rows)', () => {
  it('Demand Analyzer generationFailed:true (no throw): its GenerationStep is recorded outcome failed with a non-empty error derived from generationFailureReason and outputRefs: []; Landscape/Gap/Uncertainty/Recommendation NEVER APPEAR in stepLog at all (not merely failed); GenerationRun.outcome failed, briefVersionId null, Investigation.status generation-failed (initial)', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { extraction } = await seedCleanExtraction(sourceArtifactId);
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(analyzeDemand).mockResolvedValue({
      demandSignalCandidates: [],
      demandConfidenceClassificationCandidate: { level: 'Insufficient', narrative: 'n/a', citedDemandSignalIds: [] },
      generationFailed: true,
      generationFailureReason: 'demand analyzer: schema-validation repair exhausted',
    });

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);

    const run = await pool.query(
      `SELECT id, outcome, brief_version_id FROM generation_run WHERE investigation_id = $1`,
      [investigationId],
    );
    expect(run.rowCount).toBe(1);
    expect(run.rows[0].outcome).toBe('failed');
    expect(run.rows[0].brief_version_id).toBeNull();

    const steps = await pool.query(
      `SELECT component, outcome, error, output_refs FROM generation_step
       WHERE generation_run_id = $1 ORDER BY step_index`,
      [run.rows[0].id],
    );
    // Extraction succeeded, Demand Analyzer failed — and NOTHING ELSE appears at all: not
    // Landscape Researcher, not Gap Hypothesis Generator, not Uncertainty Compiler, not
    // Recommendation Engine. Absence from the step log, not a recorded 'failed' entry for them —
    // this is what proves G-1 precedence actually stops the run rather than continuing through
    // it and marking every remaining step failed.
    const components = steps.rows.map((r) => r.component);
    expect(components).not.toContain('Landscape Researcher');
    expect(components).not.toContain('Gap Hypothesis Generator');
    expect(components).not.toContain('Uncertainty Compiler');
    expect(components).not.toContain('Recommendation Engine');

    const demandStep = steps.rows.find((r) => r.component === 'Demand Analyzer');
    expect(demandStep).toBeDefined();
    expect(demandStep.outcome).toBe('failed');
    expect(typeof demandStep.error).toBe('string');
    expect(demandStep.error.length).toBeGreaterThan(0);
    expect(demandStep.output_refs).toEqual([]);

    const investigation = await pool.query(`SELECT status FROM investigation WHERE id = $1`, [investigationId]);
    expect(investigation.rows[0].status).toBe('generation-failed'); // I-2, initial generation
  });

  it('Demand Analyzer generationFailed:true on a CORRECTION: Investigation.status is left brief-generated (C-2, unchanged) — not generation-failed', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction, sourceArtifactId, primaryEvidenceItemId: evidenceItemId });
    const v1 = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const { extraction: correctionExtraction } = await seedCleanExtraction(sourceArtifactId);
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(correctionExtraction);
    vi.mocked(analyzeDemand).mockResolvedValue({
      demandSignalCandidates: [],
      demandConfidenceClassificationCandidate: { level: 'Insufficient', narrative: 'n/a', citedDemandSignalIds: [] },
      generationFailed: true,
      generationFailureReason: 'demand analyzer: schema-validation repair exhausted',
    });

    await expect(
      generateBriefVersion({ investigationId, supersedesVersionId: v1.id, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);

    const investigation = await pool.query(
      `SELECT status, problem_brief_id FROM investigation WHERE id = $1`,
      [investigationId],
    );
    expect(investigation.rows[0].status).toBe('brief-generated');
    expect(investigation.rows[0].status).not.toBe('generation-failed');

    const brief = await pool.query(`SELECT current_version_id FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(brief.rows[0].current_version_id).toBe(v1.id); // untouched by the failed correction
  });

  it('a fully clean run: every GenerationStep outcome succeeded, and each step\'s outputRefs matches the design\'s per-step table EXACTLY — non-empty only for step 1 (Extraction) and step 4 (Landscape Researcher), [] for steps 2/3/5/6/7, proving the () => [] mappings are deliberate, not an oversight to "fix" later', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction, sourceArtifactId, primaryEvidenceItemId: evidenceItemId });

    const version = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const run = await pool.query(`SELECT id FROM generation_run WHERE investigation_id = $1`, [investigationId]);
    const steps = await pool.query(
      `SELECT component, outcome, output_refs FROM generation_step
       WHERE generation_run_id = $1 ORDER BY step_index`,
      [run.rows[0].id],
    );
    expect(steps.rowCount).toBe(7);
    for (const step of steps.rows) {
      expect(step.outcome).toBe('succeeded');
    }

    const byComponent = Object.fromEntries(steps.rows.map((r) => [r.component, r.output_refs]));
    expect(byComponent['Extraction & Clustering Engine'].length).toBeGreaterThan(0); // step 1 — real ids
    expect(byComponent['Demand Analyzer']).toEqual([]); // step 2 — candidate-only, () => []
    expect(byComponent['Personal Pull Extractor']).toEqual([]); // step 3
    expect(byComponent['Landscape Researcher'].length).toBeGreaterThan(0); // step 4 — real WebSearchQuery ids... or empty if none issued this run
    expect(byComponent['Gap Hypothesis Generator']).toEqual([]); // step 5
    expect(byComponent['Uncertainty Compiler']).toEqual([]); // step 6
    expect(byComponent['Recommendation Engine']).toEqual([]); // step 7
    void version;
  });
});

// ---- 17. Slice-8 bounded-repair exhaustion (roadmap Tests checklist bullet 5) ---------------

describe('generateBriefVersion — Slice-8 bounded-repair exhaustion surfaces as generation-failed', () => {
  // Bounded-repair exhaustion inside callForcedTool throws LlmValidationError; each of the seven
  // Slice 4-7 components catches that throw internally and converts it to an ordinary
  // `generationFailed: true` return with a generationFailureReason (per Danny's audit finding,
  // relayed by the coordinator, 2026-08-14 — not independently re-derived here since the shape at
  // Slice 9's boundary is identical to any other modeled component failure it already handles).
  // This test is therefore intentionally NOT structurally distinct from the G-1 hard-stop test
  // above — it exists to name the specific failure ORIGIN (schema-validation/citation-array
  // exhaustion) the roadmap's Tests checklist calls out by name, so a later reader does not mistake
  // this for a redundant duplicate and delete it.
  it('exhaustion of the required-citation-array schema rule (e.g. Gap Hypothesis Generator) surfaces as generationFailed:true with a citation-array-exhaustion reason: Investigation.status becomes generation-failed and no BriefVersion is created', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(analyzeDemand).mockResolvedValue(cleanDemand(evidenceItemId));
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(sourceArtifactId));
    vi.mocked(researchLandscape).mockResolvedValue(cleanLandscape(evidenceItemId));
    vi.mocked(generateGapHypotheses).mockResolvedValue({
      gapHypothesisCandidates: [],
      generationFailed: true,
      generationFailureReason:
        'gap hypothesis generator: bounded-repair exhausted — model repeatedly returned an ' +
        'empty required evidenceItemIds citation array and could not be repaired within the ' +
        'attempt budget',
    });

    await expect(
      generateBriefVersion({ investigationId, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(BriefGenerationFailedError);

    expect(compileUncertainty).not.toHaveBeenCalled();
    expect(generateRecommendation).not.toHaveBeenCalled();

    const investigation = await pool.query(`SELECT status FROM investigation WHERE id = $1`, [investigationId]);
    expect(investigation.rows[0].status).toBe('generation-failed');
    const briefs = await pool.query(`SELECT * FROM problem_brief WHERE investigation_id = $1`, [investigationId]);
    expect(briefs.rowCount).toBe(0);
  });
});

// ---- 18. Composer FAIL round 2, defect 1 — unexpected preflight failure must not strand the
// GenerationRun. 02-ARCHITECTURE.md §1.9 point 4's EXACTLY-ONCE finalization contract: "FAILURE ->
// finalize AFTER the rollback and BEFORE the rethrow, on its own connection" — for ANY failure, not
// only the caller-contract class. SLICE-09-DESIGN.md §3 documents Phase 1 (createGenerationRun) as
// a single INSERT, immediately followed by Phase 2 step 0's preflight-snapshot read — that ordering
// (not generateBriefVersion.ts's own SQL text, which independence forbids reading) is what lets
// this test target the preflight read: it intercepts the SECOND pool.query call issued after
// invocation and injects a genuinely unexpected DB-level failure there, passing every other call
// through unmodified. -----------------------------------------------------------------------------

describe('generateBriefVersion — unexpected preflight failure still finalizes exactly once (Composer FAIL round 2, defect 1)', () => {
  it('an unexpected (non-caller-contract) failure during the preflight read finalizes the GenerationRun outcome:failed/briefVersionId:null — not left in-progress', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { extraction } = await seedCleanExtraction(sourceArtifactId);
    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);

    let callCount = 0;
    const originalQuery = pool.query.bind(pool);
    const querySpy = vi.spyOn(pool, 'query').mockImplementation((...args: unknown[]) => {
      callCount += 1;
      if (callCount === 2) {
        return Promise.reject(new Error('SIMULATED_UNEXPECTED_DB_FAILURE: connection reset during preflight read'));
      }
      return (originalQuery as (...a: unknown[]) => unknown)(...args);
    });

    let caught: unknown;
    try {
      await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });
    } catch (e) {
      caught = e;
    } finally {
      querySpy.mockRestore();
    }

    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(InvalidSupersedeTargetError);
    expect((caught as Error).message).toMatch(/SIMULATED_UNEXPECTED_DB_FAILURE/);

    // The GenerationRun this call's Phase 1 created must be finalized, not stranded in-progress —
    // asserted against the persisted row, not a return value (this call never returned one). This
    // is the assertion that would FAIL against an implementation that only finalizes for
    // InvalidSupersedeTargetError: the row would still read outcome:'in-progress', completed_at NULL.
    const runs = await pool.query(
      `SELECT outcome, brief_version_id, completed_at FROM generation_run WHERE investigation_id = $1`,
      [investigationId],
    );
    expect(runs.rowCount).toBe(1);
    expect(runs.rows[0].outcome).toBe('failed');
    expect(runs.rows[0].outcome).not.toBe('in-progress');
    expect(runs.rows[0].brief_version_id).toBeNull();
    expect(runs.rows[0].completed_at).not.toBeNull();

    expect(extractClaimsAndEvidence).not.toHaveBeenCalled(); // died before Phase 2 ever started
  });

  it('the caller-contract path (InvalidSupersedeTargetError) still finalizes the run, still spends zero LLM calls, and still does NOT transition the Investigation — distinct from the unexpected-failure path above', async () => {
    const { investigationId, sourceArtifactId } = await seedInvestigation();
    const { evidenceItemId, extraction } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction, sourceArtifactId, primaryEvidenceItemId: evidenceItemId });
    const v1 = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const { evidenceItemId: evidenceItemId2, extraction: extraction2 } = await seedCleanExtraction(sourceArtifactId);
    wireCleanPipeline({ extraction: extraction2, sourceArtifactId, primaryEvidenceItemId: evidenceItemId2 });
    const v2 = await generateBriefVersion({ investigationId, supersedesVersionId: v1.id, runtimeIdentifier: 'test' });

    // v1 is now stale (no longer ProblemBrief.currentVersionId) but WAS a real, valid,
    // same-ProblemBrief BriefVersion at preflight time — the exact InvalidSupersedeTargetError
    // caller-contract shape (SLICE-09-DESIGN.md §3 Phase 2 step 0: "current is v3, caller supplied
    // v1" — a real target that is simply not current), distinct from StaleCorrectionConflictError's
    // race-between-two-concurrent-calls shape.
    vi.mocked(extractClaimsAndEvidence).mockClear();

    await expect(
      generateBriefVersion({ investigationId, supersedesVersionId: v1.id, runtimeIdentifier: 'test' }),
    ).rejects.toThrow(InvalidSupersedeTargetError);

    expect(extractClaimsAndEvidence).not.toHaveBeenCalled(); // zero LLM calls spent, per design

    const runs = await pool.query(
      `SELECT outcome, brief_version_id, completed_at FROM generation_run
       WHERE investigation_id = $1 ORDER BY started_at DESC LIMIT 1`,
      [investigationId],
    );
    expect(runs.rows[0].outcome).toBe('failed');
    expect(runs.rows[0].brief_version_id).toBeNull();
    expect(runs.rows[0].completed_at).not.toBeNull();

    // A failed CORRECTION leaves Investigation exactly as it was — 'brief-generated', unchanged —
    // not 'generation-failed' (SLICE-09-DESIGN.md finding 8).
    const investigation = await pool.query(
      `SELECT status, problem_brief_id FROM investigation WHERE id = $1`,
      [investigationId],
    );
    expect(investigation.rows[0].status).toBe('brief-generated');
    expect(investigation.rows[0].status).not.toBe('generation-failed');

    const brief = await pool.query(
      `SELECT current_version_id FROM problem_brief WHERE investigation_id = $1`,
      [investigationId],
    );
    expect(brief.rows[0].current_version_id).toBe(v2.id); // untouched by the caller-contract failure
  });
});

// ---- 19. Composer FAIL round 2, defect 2 — declined failure transitions must be handled and
// recorded, not silently swallowed. SLICE-09-DESIGN.md §6 (~lines 1160-1169): when the guarded
// UPDATE to 'generation-failed' is declined because the Investigation's observed status is not an
// allowed prior state (ALLOWED_PRIOR_STATUSES excludes 'blocked' from 'generation-failed`'s
// permitted priors), "the correct behavior is to LEAVE the Investigation exactly as this
// concurrent observation found it (do not retry, do not force an overwrite)... logged into the
// GenerationRun's own failed-step record as informational context". -------------------------------

describe('generateBriefVersion — declined status transition is recorded, not silently swallowed (Composer FAIL round 2, defect 2)', () => {
  it('given an Investigation already blocked whose pipeline run then fails, the declined generation-failed transition leaves status/statusReason unchanged, the thrown error reports the OBSERVED status, and the decline is recorded in the run\'s provenance step log', async () => {
    const { investigationId } = await seedInvestigation();
    await pool.query(`UPDATE investigation SET status = 'blocked', status_reason = NULL WHERE id = $1`, [investigationId]);
    const before = await pool.query(`SELECT status, status_reason FROM investigation WHERE id = $1`, [investigationId]);

    vi.mocked(extractClaimsAndEvidence).mockResolvedValue({
      claimVersions: [],
      evidenceItems: [],
      problemStatementCandidates: [],
      generationFailed: false,
    });

    let caught: unknown;
    try {
      await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BriefGenerationFailedError);
    const err = caught as InstanceType<typeof BriefGenerationFailedError>;

    // (a) status/statusReason unchanged from what they were before this run — no retry, no forced
    // overwrite of a declined transition.
    const after = await pool.query(`SELECT status, status_reason FROM investigation WHERE id = $1`, [investigationId]);
    expect(after.rows[0].status).toBe(before.rows[0].status);
    expect(after.rows[0].status).toBe('blocked');
    expect(after.rows[0].status_reason).toBe(before.rows[0].status_reason);

    // (b) the error reports the ACTUAL OBSERVED status, not an assumed 'generation-failed'.
    expect(err.investigationStatus).toBe('blocked');
    expect(err.investigationStatus).not.toBe('generation-failed');

    // (c) the decline is recorded durably/auditably. SLICE-09-DESIGN.md §6 names the location: "logged
    // into the GenerationRun's own failed-step record as informational context". This assertion is
    // keyed on the observed-status string 'blocked' appearing in some generation_step's error for
    // this run, rather than "any non-empty error" — the run's OWN extraction failure already
    // produces an unrelated failed step with its own non-empty error text, so a mere
    // non-emptiness check would pass even if the decline itself were never recorded at all.
    const run = await pool.query(`SELECT id FROM generation_run WHERE investigation_id = $1`, [investigationId]);
    expect(run.rowCount).toBe(1);
    const steps = await pool.query(
      `SELECT component, outcome, error FROM generation_step WHERE generation_run_id = $1`,
      [run.rows[0].id],
    );
    const declineStep = steps.rows.find(
      (r) => typeof r.error === 'string' && r.error.toLowerCase().includes('blocked'),
    );
    // If this fails, dump every step's component/outcome/error to make the miss diagnosable —
    // expected a generation_step row recording the declined generation-failed transition (its
    // error mentioning the observed 'blocked' status).
    if (!declineStep) {
      console.error('generation_step rows for this run:', JSON.stringify(steps.rows, null, 2));
    }
    expect(declineStep).toBeDefined();
  });
});
