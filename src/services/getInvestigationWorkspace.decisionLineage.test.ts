import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import { recordDecision } from './recordDecision.js';
import { getInvestigationWorkspace } from './getInvestigationWorkspace.js';
import { getBriefForReview } from './getBriefForReview.js';

// Integration coverage for getInvestigationWorkspace's decisionLineage (04-ROADMAP.md C2-S5 Tests
// list, 02-ARCHITECTURE.md §4.4 step 4) — distinctness from getBriefForReview's priorDecisions.

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
});

/** Same minimal direct-seed shape as this checkpoint's other service tests. */
async function seedBriefVersion(options: {
  investigationId: string;
  versionNumber: number;
  supersedesVersionId?: string | null;
}): Promise<string> {
  const runResult = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, 'succeeded', now(), now(), 'test-runtime') RETURNING id`,
    [options.investigationId],
  );

  let problemBriefId: string;
  const existingBrief = await pool.query<{ id: string }>(
    `SELECT id FROM problem_brief WHERE investigation_id = $1`,
    [options.investigationId],
  );
  if (existingBrief.rowCount && existingBrief.rowCount > 0) {
    problemBriefId = existingBrief.rows[0].id;
  } else {
    const briefResult = await pool.query<{ id: string }>(
      `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
      [options.investigationId],
    );
    problemBriefId = briefResult.rows[0].id;
  }

  const briefVersionId = randomUUID();
  await pool.query(
    `INSERT INTO brief_version
       (id, problem_brief_id, version_number, supersedes_version_id, generation_run_id,
        problem_statement_ids, claim_version_ids, demand_signal_ids,
        demand_confidence_classification, existing_solution_ids, gap_hypothesis_ids,
        uncertainty_statement, recommendation, personal_pull_note_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '{}', '{}'::jsonb, '{}', '{}', '{}'::jsonb, '{}'::jsonb, '{}')`,
    [
      briefVersionId,
      problemBriefId,
      options.versionNumber,
      options.supersedesVersionId ?? null,
      runResult.rows[0].id,
      [randomUUID()],
      [randomUUID()],
    ],
  );

  await pool.query(`UPDATE problem_brief SET current_version_id = $1 WHERE id = $2`, [
    briefVersionId,
    problemBriefId,
  ]);
  await pool.query(`UPDATE investigation SET problem_brief_id = $1 WHERE id = $2`, [
    problemBriefId,
    options.investigationId,
  ]);

  return briefVersionId;
}

describe('getInvestigationWorkspace.decisionLineage vs getBriefForReview.priorDecisions', () => {
  it('decisionLineage unions decisions across >=2 real BriefVersions, each labeled with its own versionNumber, and is demonstrably distinct from a single version\'s priorDecisions', async () => {
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
    const investigationId = submission.investigationId;

    const v1 = await seedBriefVersion({ investigationId, versionNumber: 1 });
    const v2 = await seedBriefVersion({ investigationId, versionNumber: 2, supersedesVersionId: v1 });

    const decisionOnV1 = await recordDecision({ briefVersionId: v1, decision: 'Approve' });
    const decisionOnV2 = await recordDecision({ briefVersionId: v2, decision: 'Reject' });

    const workspace = await getInvestigationWorkspace(investigationId);
    expect(workspace!.decisionLineage).toHaveLength(2);
    const lineageForV1 = workspace!.decisionLineage.find((d) => d.id === decisionOnV1.id)!;
    const lineageForV2 = workspace!.decisionLineage.find((d) => d.id === decisionOnV2.id)!;
    expect(lineageForV1.versionNumber).toBe(1);
    expect(lineageForV2.versionNumber).toBe(2);

    const briefReviewV1 = await getBriefForReview(v1);
    expect(briefReviewV1.priorDecisions).toHaveLength(1);
    expect(briefReviewV1.priorDecisions[0].id).toBe(decisionOnV1.id);

    // Explicit distinctness assertion: the whole-Investigation lineage is NOT the same list as one
    // version's own priorDecisions for an Investigation with decisions against more than one version.
    expect(workspace!.decisionLineage.map((d) => d.id).sort()).not.toEqual(
      briefReviewV1.priorDecisions.map((d) => d.id).sort(),
    );
    expect(workspace!.decisionLineage).toHaveLength(2);
    expect(briefReviewV1.priorDecisions).toHaveLength(1);
  });
});
