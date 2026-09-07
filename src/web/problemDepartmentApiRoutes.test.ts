import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { app } from './server.js';
import { pool } from '../db/pool.js';
import type { ProblemDepartmentOverview } from '../types/readModels.js';

// Integration coverage for GET /api/problem-department and POST /api/investigations
// (04-ROADMAP.md Slice 2 Tests list), run against the real server + real Postgres, no mocking of
// the database.

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
    `TRUNCATE evidence_item, source_artifact, submission, brief_version, problem_brief,
              generation_step, generation_run, investigation
     CASCADE`,
  );
});

describe('GET /api/problem-department', () => {
  it('returns 200 with the full ProblemDepartmentOverview empty shape on an empty database (never 500)', async () => {
    const res = await fetch(`${baseUrl}/api/problem-department`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ProblemDepartmentOverview;
    expect(body.department.id).toBe('problem-department');
    expect(body.investigations).toEqual([]);
    expect(body.lastActiveInvestigationId).toBeNull();
    expect(body.sourceCount).toBe(0);
    expect(body.evidenceCount).toBe(0);
    expect(body.recentRuns).toEqual([]);
  });

  it('returns 200 with real rows reflected in the response when Investigations exist', async () => {
    const insert = await pool.query<{ id: string }>(
      `INSERT INTO investigation (status) VALUES ('open') RETURNING id`,
    );
    const res = await fetch(`${baseUrl}/api/problem-department`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ProblemDepartmentOverview;
    expect(body.investigations.map((i) => i.id)).toEqual([insert.rows[0].id]);
    expect(body.lastActiveInvestigationId).toBe(insert.rows[0].id);
  });
});

describe('POST /api/investigations', () => {
  it('a valid submission returns 201 with investigationId/status, and the Investigation is persisted', async () => {
    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifacts: [{ type: 'text', raw: 'a pasted source excerpt' }] }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { investigationId: string; status: string };
    expect(body.investigationId).toBeTruthy();
    expect(body.status).toBe('open');

    const persisted = await pool.query('SELECT id, status FROM investigation WHERE id = $1', [
      body.investigationId,
    ]);
    expect(persisted.rowCount).toBe(1);
    expect(persisted.rows[0].status).toBe('open');
  });

  it('a zero-artifact body returns 400 and creates no Investigation', async () => {
    const before = await pool.query('SELECT COUNT(*)::int AS count FROM investigation');

    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifacts: [] }),
    });
    expect(res.status).toBe(400);

    const after = await pool.query('SELECT COUNT(*)::int AS count FROM investigation');
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("a submission whose only source is unreachable resolves the created Investigation's status to 'blocked'", async () => {
    // An unsupported URL protocol is rejected deterministically by resolveSourceArtifact's own
    // protocol allowlist (only http/https pass) without making any real network call — this keeps
    // the test hermetic and non-flaky while still exercising the real allUnreachable -> 'blocked'
    // transition path end-to-end.
    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifacts: [{ type: 'url', raw: 'ftp://example.com/unreachable' }] }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { investigationId: string; status: string };
    expect(body.status).toBe('blocked');

    const persisted = await pool.query('SELECT status FROM investigation WHERE id = $1', [
      body.investigationId,
    ]);
    expect(persisted.rows[0].status).toBe('blocked');
  });
});
