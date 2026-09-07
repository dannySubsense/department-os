import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
 * §4.8 "landscape ledger union" (04-ROADMAP.md C2-S3 Tests): both extraction passes'
 * `extractionInputSourceIds` are ledgered into `generation_run_consumed_source`. This exercises
 * the REAL `writeConsumedSourceLedger` write path (`generateBriefVersion.ts:428-459`, called at
 * `:708` with the real UNION computed at `:705-707`) through a full, real, successful
 * `generateBriefVersion` run — not a hand-inserted row, matching
 * `generateBriefVersion.correctionZeroEvidence.test.ts`'s established idiom of asserting against
 * the real ledger table after a real run.
 *
 * Same mocking boundary as `generateBriefVersion.test.ts`: the seven pipeline components are
 * mocked at their module boundary (orchestration/persistence is Slice 9's own contract, not those
 * components' internal logic) — `writeConsumedSourceLedger` itself, `assertFenceOwnership`, and
 * all persistence run for real against Postgres.
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

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE negative_finding, gap_hypothesis, existing_solution, demand_signal,
              problem_statement, brief_version, problem_brief,
              generation_step, generation_run, generation_run_consumed_source,
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

async function seedInvestigation(): Promise<{ investigationId: string; sourceArtifactId: string }> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  return { investigationId: submission.investigationId, sourceArtifactId: submission.sourceArtifactIds[0] };
}

async function insertEvidenceItem(sourceArtifactId: string, excerpt = 'evidence'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label)
     VALUES ($1, $2, 'observation') RETURNING id`,
    [sourceArtifactId, excerpt],
  );
  return result.rows[0].id;
}

/** A second, real, unresolved SourceArtifact standing in for the landscape-origin source: only its
 *  id matters for this test (it is never dereferenced by the mocked pipeline components), matching
 *  how `LandscapeResearchResult.extractionInputSourceIds` is populated in real production — the id
 *  of a `SourceArtifact` `searchWeb`/landscape extraction actually read, distinct from primary
 *  Extraction's own input set. */
async function insertLandscapeSourceArtifact(investigationId: string): Promise<string> {
  // origin='landscape-research' (!= 'submitted') requires submission_id IS NULL per
  // `source_artifact_submission_id_matches_origin`.
  const result = await pool.query<{ id: string }>(
    `INSERT INTO source_artifact
       (investigation_id, submission_id, type, raw, origin, resolution_status, resolution_resolved_at,
        resolved_content, resolved_content_hash)
     VALUES ($1, NULL, 'url', 'landscape-origin', 'landscape-research', 'content-retrieved', now(),
             'landscape content', 'hash-landscape')
     RETURNING id`,
    [investigationId],
  );
  return result.rows[0].id;
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

describe('generateBriefVersion — generation_run_consumed_source real write path, landscape ledger union (§4.8)', () => {
  it('ledgers the UNION of primary Extraction\'s and Landscape Research\'s own extractionInputSourceIds — both origins present, no duplicate row for an id both passes happened to read, and a source neither pass read is never ledgered', async () => {
    const { investigationId, sourceArtifactId: primarySourceArtifactId } = await seedInvestigation();
    const landscapeSourceArtifactId = await insertLandscapeSourceArtifact(investigationId);
    const untouchedSourceArtifactId = await insertLandscapeSourceArtifact(investigationId);

    const claimId = (await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`)).rows[0].id;
    const claimVersionId = (
      await pool.query<{ id: string }>(
        `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, $2) RETURNING id`,
        [claimId, 'claim text'],
      )
    ).rows[0].id;
    const evidenceItemId = await insertEvidenceItem(primarySourceArtifactId, 'fresh extraction evidence');
    await pool.query(
      `INSERT INTO claim_version_evidence (claim_version_id, evidence_item_id, stance) VALUES ($1, $2, 'supporting')`,
      [claimVersionId, evidenceItemId],
    );

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
        { id: evidenceItemId, sourceArtifactId: primarySourceArtifactId, excerptOrSummary: 'fresh extraction evidence', label: 'observation' },
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
      // Primary Extraction's own real read set — includes ONLY the primary source, matching
      // extractClaimsAndEvidence.ts's real read-set semantics.
      extractionInputSourceIds: [primarySourceArtifactId],
    };

    const landscape: LandscapeResearchResult = {
      webSearchQueries: [
        {
          id: randomUUID(),
          investigationId,
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
      // Landscape Research's own second extraction pass's real read set — includes ONLY the
      // landscape-origin source. `untouchedSourceArtifactId` deliberately appears in NEITHER set.
      extractionInputSourceIds: [landscapeSourceArtifactId],
    };

    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(extractClaimsAndEvidenceForSourceArtifacts).mockResolvedValue(extraction);
    vi.mocked(analyzeDemand).mockResolvedValue(cleanDemand(evidenceItemId));
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(primarySourceArtifactId));
    vi.mocked(researchLandscape).mockResolvedValue(landscape);
    vi.mocked(generateGapHypotheses).mockResolvedValue(cleanGap(evidenceItemId));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
    vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);

    const version = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const ledgerRows = await pool.query<{ source_artifact_id: string; correction_target_brief_version_id: string | null }>(
      `SELECT source_artifact_id, correction_target_brief_version_id
         FROM generation_run_consumed_source
        WHERE generation_run_id = $1
        ORDER BY source_artifact_id`,
      [version.generationRunId],
    );

    // Real persisted union: exactly the two ids each pass actually read, deduplicated, never the
    // untouched third source.
    expect(ledgerRows.rows.map((r) => r.source_artifact_id).sort()).toEqual(
      [primarySourceArtifactId, landscapeSourceArtifactId].sort(),
    );
    expect(ledgerRows.rows.map((r) => r.source_artifact_id)).not.toContain(untouchedSourceArtifactId);
    // Initial (non-correction) run: correction_target_brief_version_id is null for every row.
    for (const row of ledgerRows.rows) {
      expect(row.correction_target_brief_version_id).toBeNull();
    }
  });

  it('ledgers a duplicate id read by BOTH passes exactly once (ON CONFLICT DO NOTHING de-dup), proving the union is a real Set, not a naive concatenation', async () => {
    const { investigationId, sourceArtifactId: primarySourceArtifactId } = await seedInvestigation();

    const claimId = (await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`)).rows[0].id;
    const claimVersionId = (
      await pool.query<{ id: string }>(
        `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, $2) RETURNING id`,
        [claimId, 'claim text'],
      )
    ).rows[0].id;
    const evidenceItemId = await insertEvidenceItem(primarySourceArtifactId, 'fresh extraction evidence');
    await pool.query(
      `INSERT INTO claim_version_evidence (claim_version_id, evidence_item_id, stance) VALUES ($1, $2, 'supporting')`,
      [claimVersionId, evidenceItemId],
    );

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
        { id: evidenceItemId, sourceArtifactId: primarySourceArtifactId, excerptOrSummary: 'fresh extraction evidence', label: 'observation' },
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
      // Same source id read by BOTH the primary pass and the (contrived-for-this-test) landscape
      // pass — a real, legitimate overlap (e.g. the landscape pass re-reads a source the primary
      // pass already extracted).
      extractionInputSourceIds: [primarySourceArtifactId],
    };

    const landscape: LandscapeResearchResult = {
      webSearchQueries: [],
      existingSolutionCandidates: [],
      landscapeEvidenceItems: [],
      generationFailed: false,
      negativeFindingSignal: { statement: 'No existing solutions found.' },
      extractionInputSourceIds: [primarySourceArtifactId],
    };

    vi.mocked(extractClaimsAndEvidence).mockResolvedValue(extraction);
    vi.mocked(extractClaimsAndEvidenceForSourceArtifacts).mockResolvedValue(extraction);
    vi.mocked(analyzeDemand).mockResolvedValue(cleanDemand(evidenceItemId));
    vi.mocked(extractPersonalPull).mockResolvedValue(cleanPersonalPull(primarySourceArtifactId));
    vi.mocked(researchLandscape).mockResolvedValue(landscape);
    vi.mocked(generateGapHypotheses).mockResolvedValue(cleanGap(evidenceItemId));
    vi.mocked(compileUncertainty).mockResolvedValue(cleanUncertainty);
    vi.mocked(generateRecommendation).mockResolvedValue(cleanRecommendation);

    const version = await generateBriefVersion({ investigationId, runtimeIdentifier: 'test' });

    const ledgerRows = await pool.query<{ source_artifact_id: string }>(
      `SELECT source_artifact_id FROM generation_run_consumed_source WHERE generation_run_id = $1`,
      [version.generationRunId],
    );
    expect(ledgerRows.rows).toHaveLength(1);
    expect(ledgerRows.rows[0].source_artifact_id).toBe(primarySourceArtifactId);
  });
});
