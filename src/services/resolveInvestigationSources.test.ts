import { beforeEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import { resolveInvestigationSources } from './resolveInvestigationSources.js';

let fixtureBaseUrl: string;
let fixtureServer: ReturnType<typeof createServer>;

beforeAll(async () => {
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
  const port = (fixtureServer.address() as AddressInfo).port;
  fixtureBaseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE source_artifact, submission, investigation CASCADE');
});

describe('resolveInvestigationSources', () => {
  it('does not report allUnreachable when at least one source is reachable, even if others are dead', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [
        { type: 'url', raw: `${fixtureBaseUrl}/reachable` },
        { type: 'url', raw: `${fixtureBaseUrl}/dead-link` },
      ],
    });

    const { allUnreachable, resolutions } = await resolveInvestigationSources(
      submission.investigationId,
    );

    expect(allUnreachable).toBe(false);
    expect(resolutions).toHaveLength(2);
    expect(resolutions.some((r) => r.status === 'content-retrieved')).toBe(true);
    const deadResolution = resolutions.find((r) => r.status === 'unreachable');
    expect(deadResolution).toBeDefined();
    expect(deadResolution!.failureReason).toBeTruthy();

    // The Investigation itself is not mutated by this function (Architecture §4 — separation of
    // concerns: the caller transitions status).
    const investigation = await pool.query('SELECT status FROM investigation WHERE id = $1', [
      submission.investigationId,
    ]);
    expect(investigation.rows[0].status).toBe('open');
  });

  it('reports allUnreachable: true when every source is unreachable', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [
        { type: 'url', raw: `${fixtureBaseUrl}/dead-one` },
        { type: 'url', raw: `${fixtureBaseUrl}/dead-two` },
      ],
    });

    const { allUnreachable, resolutions } = await resolveInvestigationSources(
      submission.investigationId,
    );

    expect(allUnreachable).toBe(true);
    expect(resolutions.every((r) => r.status === 'unreachable')).toBe(true);
  });

  it('does NOT count a reachable-no-content source as unreachable for the allUnreachable flag', async () => {
    const emptyServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(''); // reachable, no content
    });
    await new Promise<void>((resolve) => emptyServer.listen(0, resolve));
    const emptyPort = (emptyServer.address() as AddressInfo).port;

    try {
      const submission = await submitSources({
        origin: 'human',
        artifacts: [{ type: 'url', raw: `http://localhost:${emptyPort}/empty` }],
      });

      const { allUnreachable, resolutions } = await resolveInvestigationSources(
        submission.investigationId,
      );

      expect(resolutions[0].status).toBe('reachable-no-content');
      expect(allUnreachable).toBe(false);
    } finally {
      await new Promise<void>((resolve) => emptyServer.close(() => resolve()));
    }
  });
});
