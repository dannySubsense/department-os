import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { app } from './server.js';
import { pool } from '../db/pool.js';
import { submitSources } from '../services/submitSources.js';
import type { GetBriefForReviewResult } from '../services/getBriefForReview.js';

// Integration coverage for GET /api/investigations/:id/brief-versions/by-version/:versionNumber
// (04-ROADMAP.md C2-S4 Tests list, 02-ARCHITECTURE.md §3.1a).

let baseUrl: string;
let server: ReturnType<typeof app.listen>;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
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

/** Same minimal direct-seed shape as getBriefForReview.test.ts's own helper — duplicated locally
 *  (not imported) because it is test fixture code, not production surface. */
async function seedBriefVersion(options?: {
  supersedesVersionId?: string | null;
  versionNumber?: number;
  investigationId?: string;
  sourceArtifactId?: string;
}): Promise<{ investigationId: string; briefVersionId: string; problemBriefId: string }> {
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
  const claimVersionResult = await pool.query<{ id: string }>(
    `INSERT INTO claim_version (claim_id, version_number, text) VALUES ($1, 1, 'claim text') RETURNING id`,
    [claimResult.rows[0].id],
  );
  const claimVersionId = claimVersionResult.rows[0].id;

  const evidenceResult = await pool.query<{ id: string }>(
    `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label)
     VALUES ($1, 'evidence excerpt', 'observation') RETURNING id`,
    [sourceArtifactId],
  );
  await pool.query(
    `INSERT INTO claim_version_evidence (claim_version_id, evidence_item_id, stance) VALUES ($1, $2, 'supporting')`,
    [claimVersionId, evidenceResult.rows[0].id],
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
      JSON.stringify({ briefVersionId, level: 'Emerging', narrative: 'n', citedDemandSignalIds: [] }),
      JSON.stringify({
        briefVersionId,
        whatsUnknown: ['x'],
        whatWouldChangeConclusion: ['y'],
        whatsUndeterminable: ['z'],
      }),
      JSON.stringify({ briefVersionId, decision: 'Approve', rationale: 'Evidence supports the problem.' }),
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

  await pool.query(`UPDATE investigation SET problem_brief_id = $1 WHERE id = $2`, [
    problemBriefId,
    investigationId,
  ]);

  return { investigationId, briefVersionId, problemBriefId };
}

describe('GET /api/investigations/:id/brief-versions/by-version/:versionNumber', () => {
  it('400s invalid-version-number for a non-numeric versionNumber', async () => {
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'x' }] });
    const res = await fetch(
      `${baseUrl}/api/investigations/${submission.investigationId}/brief-versions/by-version/abc`,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-version-number' });
  });

  it('400s invalid-version-number for a non-positive versionNumber', async () => {
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'x' }] });
    const res = await fetch(
      `${baseUrl}/api/investigations/${submission.investigationId}/brief-versions/by-version/0`,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-version-number' });
  });

  it('404s investigation-not-found for a nonexistent Investigation', async () => {
    const res = await fetch(
      `${baseUrl}/api/investigations/00000000-0000-0000-0000-000000000000/brief-versions/by-version/1`,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'investigation-not-found' });
  });

  it('404s brief-version-not-found for a real Investigation with no BriefVersion at that number', async () => {
    const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'x' }] });
    const res = await fetch(
      `${baseUrl}/api/investigations/${submission.investigationId}/brief-versions/by-version/1`,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'brief-version-not-found' });
  });

  it('200s with the correctly-resolved GetBriefForReviewResult for a real versionNumber under a lineage with >=2 versions', async () => {
    const seed1 = await seedBriefVersion({ versionNumber: 1 });
    const seed2 = await seedBriefVersion({
      versionNumber: 2,
      supersedesVersionId: seed1.briefVersionId,
      investigationId: seed1.investigationId,
    });

    const resV1 = await fetch(
      `${baseUrl}/api/investigations/${seed1.investigationId}/brief-versions/by-version/1`,
    );
    expect(resV1.status).toBe(200);
    const bodyV1 = (await resV1.json()) as GetBriefForReviewResult;
    expect(bodyV1.version.id).toBe(seed1.briefVersionId);
    expect(bodyV1.isSuperseded).toBe(true);

    const resV2 = await fetch(
      `${baseUrl}/api/investigations/${seed1.investigationId}/brief-versions/by-version/2`,
    );
    expect(resV2.status).toBe(200);
    const bodyV2 = (await resV2.json()) as GetBriefForReviewResult;
    expect(bodyV2.version.id).toBe(seed2.briefVersionId);
    expect(bodyV2.isSuperseded).toBe(false);
  });
});
