import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { app } from './server.js';
import { pool } from '../db/pool.js';
import { submitSources } from '../services/submitSources.js';
import {
  __allowPrivateNetworkHostForTests,
  __resetPrivateNetworkTestAllowlist,
} from '../services/resolveSourceArtifact.js';
import { transitionInvestigationStatus } from '../services/transitionInvestigationStatus.js';
import type { InvestigationWorkspaceView } from '../types/readModels.js';

// Integration coverage for GET /api/investigations/:id/workspace, the extended
// POST /api/investigations Add-Source Connector, and POST /api/source-artifacts/:id/recheck
// (04-ROADMAP.md C2-S2 Tests list, 02-ARCHITECTURE.md §1.4/§1.4a/§3.1b/§4.4).

let baseUrl: string;
let server: ReturnType<typeof app.listen>;
let fixtureBaseUrl: string;
let fixtureServer: ReturnType<typeof createServer>;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;

  fixtureServer = createServer((req, res) => {
    if (req.url === '/reachable') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('substantial content here '.repeat(20));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, resolve));
  const fixturePort = (fixtureServer.address() as AddressInfo).port;
  fixtureBaseUrl = `http://localhost:${fixturePort}`;
  __allowPrivateNetworkHostForTests('localhost');
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  __resetPrivateNetworkTestAllowlist();
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE web_search_result, query_limitation, web_search_query, generation_step,
              generation_run, source_artifact, submission, investigation
     CASCADE`,
  );
});

describe('GET /api/investigations/:id/workspace', () => {
  it('200s with the InvestigationWorkspaceView shape for a real Investigation', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'content' }],
    });
    const res = await fetch(`${baseUrl}/api/investigations/${submission.investigationId}/workspace`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as InvestigationWorkspaceView;
    expect(body.investigation.id).toBe(submission.investigationId);
    expect(body.generationRuns).toEqual([]);
    expect(body.generationEligible).toBe(true);
  });

  it('404s investigation-not-found only for explicit absence', async () => {
    const res = await fetch(
      `${baseUrl}/api/investigations/00000000-0000-0000-0000-000000000000/workspace`,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'investigation-not-found' });
  });

  it('an injected database/query failure reaches the shell 500 handling, never rendered as not-found', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'content' }],
    });
    const spy = vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('connection reset'));
    const res = await fetch(`${baseUrl}/api/investigations/${submission.investigationId}/workspace`);
    expect(res.status).toBe(500);
    spy.mockRestore();
  });
});

describe('POST /api/investigations (existing-investigationId, extended per §3.1b)', () => {
  it('201s with sourcesAdded and the real read-back status after add-source succeeds', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/reachable` }],
    });
    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigationId: submission.investigationId,
        artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/reachable` }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sourcesAdded).toBe(1);
    expect(body.status).toBe('open');
  });

  it('400s for zero non-blank artifacts', async () => {
    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifacts: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('404s investigation-not-found for a nonexistent investigationId', async () => {
    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigationId: '00000000-0000-0000-0000-000000000000',
        artifacts: [{ type: 'text', raw: 'x' }],
      }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'investigation-not-found' });
  });

  it('responds 201, not 409, when adding a reachable source to an already-open Investigation (benign no-op)', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/reachable` }],
    });
    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigationId: submission.investigationId,
        artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/reachable` }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('open');

    const persisted = await pool.query(
      'SELECT count(*)::int AS count FROM source_artifact WHERE investigation_id = $1',
      [submission.investigationId],
    );
    expect(persisted.rows[0].count).toBe(2);
  });

  it('responds 201, not 409, when adding an unreachable source to an already-blocked Investigation (benign no-op)', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/dead-link` }],
    });
    await pool.query(`UPDATE investigation SET status = 'blocked' WHERE id = $1`, [
      submission.investigationId,
    ]);

    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigationId: submission.investigationId,
        artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/dead-link-2` }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('blocked');
  });

  it("responds 201, not 409, for a 'generation-failed' Investigation given a reachable source (target 'open' declined)", async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/reachable` }],
    });
    await pool.query(`UPDATE investigation SET status = 'generation-failed' WHERE id = $1`, [
      submission.investigationId,
    ]);

    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigationId: submission.investigationId,
        artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/reachable` }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('generation-failed');
  });

  it("responds 201, not 409, for a 'generation-failed' Investigation given an all-unreachable source (target 'blocked' declined)", async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/dead-link` }],
    });
    await pool.query(`UPDATE investigation SET status = 'generation-failed' WHERE id = $1`, [
      submission.investigationId,
    ]);

    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigationId: submission.investigationId,
        artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/dead-link-2` }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('generation-failed');
  });

  it("does NOT call transitionInvestigationStatus and leaves status 'brief-generated' unchanged, while still persisting the new source (required regression)", async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/reachable` }],
    });
    await pool.query(
      `UPDATE investigation SET status = 'brief-generated' WHERE id = $1`,
      [submission.investigationId],
    );

    const spy = vi.spyOn(pool, 'query');
    const before = spy.mock.calls.filter((c) => String(c[0]).includes('UPDATE investigation')).length;

    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigationId: submission.investigationId,
        artifacts: [{ type: 'text', raw: 'a new source' }],
      }),
    });

    const after = spy.mock.calls.filter((c) => String(c[0]).includes('UPDATE investigation')).length;
    expect(after).toBe(before);
    spy.mockRestore();

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('brief-generated');

    const persisted = await pool.query(
      'SELECT count(*)::int AS count FROM source_artifact WHERE investigation_id = $1',
      [submission.investigationId],
    );
    expect(persisted.rows[0].count).toBe(2);
  });

  it('genuine concurrent conflict: a real commit lands between this request\'s own step-2 pre-mutation read and its own transition attempt — responds 409 with the real freshly-read status', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/dead-link` }],
    });
    await pool.query(`UPDATE investigation SET status = 'blocked' WHERE id = $1`, [
      submission.investigationId,
    ]);

    // Intercept exactly ONE call — the route's own step-2 pre-mutation `getInvestigation` read —
    // and, real-synchronously between that read returning 'blocked' to the handler and the
    // handler's later transition attempt, commit a real, independent, concurrent transition to
    // 'open' directly against the row (the "other request" that wins the race). This reproduces
    // the exact interleaving §3.1b's step-6 check exists to catch, without relying on true
    // parallel HTTP scheduling, which cannot be made deterministic in a single test process.
    const originalQuery = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
    let intercepted = false;
    const spy = vi.spyOn(pool, 'query').mockImplementation(((...args: unknown[]) => {
      const text = String(args[0]);
      const isStepTwoRead =
        !intercepted &&
        text.includes('SELECT id, created_at, status, status_reason, problem_brief_id') &&
        text.includes('FROM investigation WHERE id');
      if (isStepTwoRead) {
        intercepted = true;
        return originalQuery(...args).then(async (result) => {
          // The real concurrent commit — via the same guarded function the route itself uses —
          // wins the race here, strictly after this read, strictly before this request's own
          // transition attempt below.
          const committed = await transitionInvestigationStatus(
            submission.investigationId,
            'open',
            null,
          );
          expect(committed).toBe(true);
          return result;
        });
      }
      return originalQuery(...args);
    }) as never);

    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigationId: submission.investigationId,
        artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/reachable` }],
      }),
    });
    spy.mockRestore();

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('invalid-status-transition');
    expect(body.status).toBe('open');
  });
});

describe('POST /api/source-artifacts/:id/recheck', () => {
  it('200s with real read-back sourceArtifactId/resolutionStatus/investigationStatus', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/dead-link` }],
    });
    const id = submission.sourceArtifactIds[0];
    await pool.query(
      `UPDATE source_artifact SET resolution_status = 'unreachable', resolution_failure_reason = 'HTTP 404', raw = $2
       WHERE id = $1`,
      [id, `${fixtureBaseUrl}/reachable`],
    );

    const res = await fetch(`${baseUrl}/api/source-artifacts/${id}/recheck`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceArtifactId).toBe(id);
    expect(body.resolutionStatus).toBe('content-retrieved');
    expect(body.investigationStatus).toBe('open');
  });

  it('404s for a nonexistent id', async () => {
    const res = await fetch(
      `${baseUrl}/api/source-artifacts/00000000-0000-0000-0000-000000000000/recheck`,
      { method: 'POST' },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'source-artifact-not-found' });
  });

  it("409s RecheckNotEligibleResponseBody for a source whose resolution_status is not 'unreachable'", async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'resolved content' }],
    });
    const id = submission.sourceArtifactIds[0];
    await pool.query(
      `UPDATE source_artifact SET resolution_status = 'content-retrieved', resolved_content = 'resolved content'
       WHERE id = $1`,
      [id],
    );

    const res = await fetch(`${baseUrl}/api/source-artifacts/${id}/recheck`, { method: 'POST' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('recheck-not-eligible');
    expect(body.sourceArtifactId).toBe(id);
  });
});

describe('resolveInvestigationSources C1 regression — skip-already-resolved', () => {
  it("a second add-source request against an Investigation with a prior terminal source leaves that row byte-identical; only the new source resolves", async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'first source content' }],
    });
    // Resolve the first source terminally by driving it through the real pipeline.
    await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigationId: submission.investigationId,
        artifacts: [{ type: 'text', raw: 'unused placeholder, first submission already resolved' }],
      }),
    });
    // The initial submission's own source resolves via submitSources's own real pipeline (Slice
    // 3's resolveInvestigationSources call, exercised indirectly by the route above) — assert its
    // state now, before the second add-source call.
    const firstSourceId = submission.sourceArtifactIds[0];
    const beforeSecondCall = await pool.query('SELECT * FROM source_artifact WHERE id = $1', [
      firstSourceId,
    ]);
    expect(beforeSecondCall.rows[0].resolution_status).toBe('content-retrieved');

    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investigationId: submission.investigationId,
        artifacts: [{ type: 'text', raw: 'a genuinely new second source' }],
      }),
    });
    expect(res.status).toBe(201);

    const afterSecondCall = await pool.query('SELECT * FROM source_artifact WHERE id = $1', [
      firstSourceId,
    ]);
    expect(afterSecondCall.rows[0]).toEqual(beforeSecondCall.rows[0]);

    const newestSource = await pool.query(
      `SELECT resolution_status FROM source_artifact WHERE investigation_id = $1
         AND raw = 'a genuinely new second source'`,
      [submission.investigationId],
    );
    expect(newestSource.rows[0].resolution_status).toBe('content-retrieved');
  });
});
