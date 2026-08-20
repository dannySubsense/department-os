import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { app } from './server.js';
import { pool } from '../db/pool.js';
import type { MissionControlView } from '../types/readModels.js';

// Integration coverage for GET /api/mission-control (04-ROADMAP.md Slice 1 Tests list) — asserts
// 200 + response shape matches MissionControlView, never 500 on an empty database.

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

describe('GET /api/mission-control', () => {
  it('returns 200 with the full MissionControlView shape on an empty database (never 500)', async () => {
    const res = await fetch(`${baseUrl}/api/mission-control`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as MissionControlView;
    expect(Array.isArray(body.departments)).toBe(true);
    expect(body.departments.length).toBe(4);
    expect(body.activeWork).toEqual({
      active: [],
      readyNotStarted: [],
      needsAttention: [],
      recentCompleted: [],
    });
    expect(body.activeActivity).toEqual([]);
    expect(body.recent).toEqual({ investigations: [], briefs: [], evidence: [] });
  });

  it('returns 200 with real rows reflected in the response when Investigations exist', async () => {
    await pool.query(`INSERT INTO investigation (status) VALUES ('open')`);
    const res = await fetch(`${baseUrl}/api/mission-control`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as MissionControlView;
    expect(body.activeWork.readyNotStarted.length).toBe(1);
    expect(body.recent.investigations.length).toBe(1);
  });

  it('an unmatched /api/* path 404s as JSON, not the SPA catch-all', async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'not-found' });
  });
});
