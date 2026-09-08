import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import { getBriefForReview, BriefVersionNotFoundError } from './getBriefForReview.js';

// Integration coverage for getBriefForReview (04-ROADMAP.md C2-S4 Tests list,
// 02-ARCHITECTURE.md §3.3/§4).

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE status_event, negative_finding, gap_hypothesis, existing_solution, demand_signal,
              problem_statement, brief_version, problem_brief,
              generation_step, generation_run,
              claim_version_evidence, evidence_item, claim_version, claim,
              source_artifact, submission, investigation CASCADE`,
  );
});

/** Directly seeds one complete, real, minimal BriefVersion (and its owning ProblemBrief,
 *  GenerationRun, ClaimVersion/EvidenceItem chain, and ProblemStatement) — this slice's
 *  `generateBriefVersion` pipeline is exercised elsewhere (generateBriefVersion.test.ts); this
 *  helper exists so getBriefForReview's own read shape can be verified directly against real
 *  persisted rows without re-mocking all seven generation components. */
async function seedBriefVersion(options?: {
  supersedesVersionId?: string | null;
  versionNumber?: number;
  investigationId?: string;
  sourceArtifactId?: string;
}): Promise<{
  investigationId: string;
  problemBriefId: string;
  briefVersionId: string;
  claimVersionId: string;
  evidenceItemId: string;
  sourceArtifactId: string;
}> {
  let investigationId = options?.investigationId;
  let sourceArtifactId = options?.sourceArtifactId;
  if (!investigationId) {
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
    investigationId = submission.investigationId;
    sourceArtifactId = submission.sourceArtifactIds[0];
  } else if (!sourceArtifactId) {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM source_artifact WHERE investigation_id = $1 LIMIT 1`,
      [investigationId],
    );
    sourceArtifactId = existing.rows[0].id;
  }

  const runResult = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, 'succeeded', now(), now(), 'test-runtime') RETURNING id`,
    [investigationId],
  );
  const generationRunId = runResult.rows[0].id;

  let problemBriefId: string;
  const existingBrief = await pool.query<{ id: string }>(
    `SELECT id FROM problem_brief WHERE investigation_id = $1`,
    [investigationId],
  );
  if (existingBrief.rowCount && existingBrief.rowCount > 0) {
    problemBriefId = existingBrief.rows[0].id;
  } else {
    const briefResult = await pool.query<{ id: string }>(
      `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
      [investigationId],
    );
    problemBriefId = briefResult.rows[0].id;
  }

  const claimResult = await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`);
  const claimId = claimResult.rows[0].id;
  const claimVersionResult = await pool.query<{ id: string }>(
    `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, 'claim text') RETURNING id`,
    [claimId],
  );
  const claimVersionId = claimVersionResult.rows[0].id;

  const evidenceResult = await pool.query<{ id: string }>(
    `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label)
     VALUES ($1, 'evidence excerpt', 'observation') RETURNING id`,
    [sourceArtifactId],
  );
  const evidenceItemId = evidenceResult.rows[0].id;

  await pool.query(
    `INSERT INTO claim_version_evidence (claim_version_id, evidence_item_id, stance) VALUES ($1, $2, 'supporting')`,
    [claimVersionId, evidenceItemId],
  );

  const briefVersionId = randomUUID();
  const problemStatementId = randomUUID();
  const versionNumber = options?.versionNumber ?? 1;

  await pool.query(
    `INSERT INTO brief_version
       (id, problem_brief_id, version_number, supersedes_version_id, generation_run_id,
        problem_statement_ids, claim_version_ids, demand_signal_ids,
        demand_confidence_classification, existing_solution_ids, gap_hypothesis_ids,
        uncertainty_statement, recommendation, personal_pull_note_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '{}',
             $8::jsonb, '{}', '{}', $9::jsonb, $10::jsonb, '{}')`,
    [
      briefVersionId,
      problemBriefId,
      versionNumber,
      options?.supersedesVersionId ?? null,
      generationRunId,
      [problemStatementId],
      [claimVersionId],
      JSON.stringify({
        briefVersionId,
        level: 'Emerging',
        narrative: 'One recurring-complaints signal.',
        citedDemandSignalIds: [],
      }),
      JSON.stringify({
        briefVersionId,
        whatsUnknown: ['long-term retention'],
        whatWouldChangeConclusion: ['a failed pilot'],
        whatsUndeterminable: ['nothing at this time'],
      }),
      JSON.stringify({
        briefVersionId,
        decision: 'Approve',
        rationale: 'Evidence supports the problem.',
      }),
    ],
  );

  await pool.query(
    `INSERT INTO problem_statement (id, brief_version_id, who_experiences_it, context_or_workflow,
       consequence_or_friction, supporting_claim_version_ids)
     VALUES ($1, $2, 'small teams', 'manual reconciliation', 'hours lost weekly', $3)`,
    [problemStatementId, briefVersionId, [claimVersionId]],
  );

  await pool.query(`UPDATE problem_brief SET current_version_id = $1 WHERE id = $2`, [
    briefVersionId,
    problemBriefId,
  ]);

  return {
    investigationId,
    problemBriefId,
    briefVersionId,
    claimVersionId,
    evidenceItemId,
    sourceArtifactId,
  };
}

describe('getBriefForReview', () => {
  it('throws BriefVersionNotFoundError for a nonexistent brief version id', async () => {
    await expect(getBriefForReview('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      BriefVersionNotFoundError,
    );
  });

  it('resolves the full chain for a real generated Brief, uncollapsed, with per-evidence provenance fields', async () => {
    const seed = await seedBriefVersion();

    const result = await getBriefForReview(seed.briefVersionId);

    expect(result.version.id).toBe(seed.briefVersionId);
    expect(result.problemStatements).toHaveLength(1);
    expect(result.problemStatements[0].whoExperiencesIt).toBe('small teams');
    expect(result.claimVersions).toHaveLength(1);
    expect(result.claimVersions[0].resolvedEvidence).toHaveLength(1);
    expect(result.claimVersions[0].resolvedEvidence[0].stance).toBe('supporting');
    expect(result.claimVersions[0].resolvedEvidence[0].item.id).toBe(seed.evidenceItemId);
    expect(result.claimVersions[0].resolvedEvidence[0].item.excerptOrSummary).toBe('evidence excerpt');
    expect(result.claimVersions[0].assignedState).toBe('valid');
    expect(result.demandConfidence.level).toBe('Emerging');
    expect(result.uncertainty.whatsUnknown).toEqual(['long-term retention']);
    expect(result.recommendation.decision).toBe('Approve');
    expect(result.isSuperseded).toBe(false);
    expect(result.priorDecisions).toEqual([]);
  });

  it('sources assignedState from a real getAssignedState call, reflecting a seeded non-valid StatusEvent row', async () => {
    const seed = await seedBriefVersion();

    await pool.query(
      `INSERT INTO status_event (target_type, target_id, assigned_state, effective_at, recorded_by, reason)
       VALUES ('brief-version', $1, 'invalidated', now(), 'test-operator', 'seeded for test')`,
      [seed.briefVersionId],
    );

    const result = await getBriefForReview(seed.briefVersionId);
    expect(result.assignedState).toBe('invalidated');
  });

  it('reports isSuperseded true when another real BriefVersion names this one via supersedesVersionId', async () => {
    const seed = await seedBriefVersion({ versionNumber: 1 });
    await seedBriefVersion({
      versionNumber: 2,
      supersedesVersionId: seed.briefVersionId,
      investigationId: seed.investigationId,
      sourceArtifactId: seed.sourceArtifactId,
    });

    const result = await getBriefForReview(seed.briefVersionId);
    expect(result.isSuperseded).toBe(true);
  });
});
