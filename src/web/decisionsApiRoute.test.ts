import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { app } from './server.js';
import { pool } from '../db/pool.js';
import { submitSources } from '../services/submitSources.js';

// Integration coverage for POST /api/brief-versions/:briefVersionId/decisions
// (04-ROADMAP.md C2-S5 Tests list, 02-ARCHITECTURE.md §3.1a/§4.3).

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
    `TRUNCATE reconsideration_condition, decision, negative_finding, gap_hypothesis,
              existing_solution, demand_signal, problem_statement, brief_version, problem_brief,
              generation_step, generation_run, claim_version_evidence, evidence_item, claim_version,
              claim, source_artifact, submission, investigation CASCADE`,
  );
});

async function seedBriefVersion(): Promise<string> {
  const submission = await submitSources({ origin: 'human', artifacts: [{ type: 'text', raw: 'seed' }] });
  const runResult = await pool.query<{ id: string }>(
    `INSERT INTO generation_run (investigation_id, outcome, started_at, completed_at, runtime_identifier)
     VALUES ($1, 'succeeded', now(), now(), 'test-runtime') RETURNING id`,
    [submission.investigationId],
  );
  const briefResult = await pool.query<{ id: string }>(
    `INSERT INTO problem_brief (investigation_id) VALUES ($1) RETURNING id`,
    [submission.investigationId],
  );
  const briefVersionResult = await pool.query<{ id: string }>(
    `INSERT INTO brief_version
       (problem_brief_id, version_number, generation_run_id, problem_statement_ids, claim_version_ids,
        demand_signal_ids, demand_confidence_classification, existing_solution_ids, gap_hypothesis_ids,
        uncertainty_statement, recommendation, personal_pull_note_ids)
     VALUES ($1, 1, $2, $3, $4, '{}', '{}'::jsonb, '{}', '{}', '{}'::jsonb, '{}'::jsonb, '{}')
     RETURNING id`,
    [briefResult.rows[0].id, runResult.rows[0].id, [randomUUID()], [randomUUID()]],
  );
  return briefVersionResult.rows[0].id;
}

const NONEXISTENT_BRIEF_VERSION_ID = '00000000-0000-0000-0000-000000000000';

describe('POST /api/brief-versions/:briefVersionId/decisions', () => {
  it('201s with the persisted Decision verbatim for a valid Approve request', async () => {
    const briefVersionId = await seedBriefVersion();
    const res = await fetch(`${baseUrl}/api/brief-versions/${briefVersionId}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'Approve', rationale: 'Looks solid.' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.decision).toBe('Approve');
    expect(body.briefVersionId).toBe(briefVersionId);
    expect(body.id).toBeTruthy();
  });

  it('400s invalid-request for a missing decision field', async () => {
    const briefVersionId = await seedBriefVersion();
    const res = await fetch(`${baseUrl}/api/brief-versions/${briefVersionId}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid-request');
  });

  it('SOL-MEDIUM-5: 404s brief-version-not-found for a nonexistent briefVersionId', async () => {
    const res = await fetch(`${baseUrl}/api/brief-versions/${NONEXISTENT_BRIEF_VERSION_ID}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'Approve' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'brief-version-not-found' });
  });

  it('422s watch-requires-condition for a real BriefVersion given a zero-condition Watch', async () => {
    const briefVersionId = await seedBriefVersion();
    const res = await fetch(`${baseUrl}/api/brief-versions/${briefVersionId}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'Watch' }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('watch-requires-condition');
  });

  it('SOL-MEDIUM-5 ordering: a request supplying BOTH a nonexistent briefVersionId AND a zero-condition Watch responds 404, never 422', async () => {
    const res = await fetch(`${baseUrl}/api/brief-versions/${NONEXISTENT_BRIEF_VERSION_ID}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'Watch' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'brief-version-not-found' });
  });
});
