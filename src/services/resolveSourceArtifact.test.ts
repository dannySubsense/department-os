import { beforeEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { pool } from '../db/pool.js';
import {
  resolveSourceArtifact,
  __allowPrivateNetworkHostForTests,
  __resetPrivateNetworkTestAllowlist,
} from './resolveSourceArtifact.js';

// Smoke coverage per this slice's contract. Uses a local HTTP fixture server rather than real
// third-party URLs, per 04-ROADMAP.md Slice 3's determinism/speed constraint.

let fixtureBaseUrl: string;
let fixtureServer: ReturnType<typeof createServer>;

beforeAll(async () => {
  fixtureServer = createServer((req, res) => {
    if (req.url === '/large-content') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('lorem ipsum '.repeat(50)); // well over 200 chars
      return;
    }
    if (req.url === '/empty') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('');
      return;
    }
    if (req.url === '/paywall') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>Subscribe to continue</body></html>'); // short boilerplate
      return;
    }
    if (req.url === '/not-found') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(500);
    res.end();
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, resolve));
  const port = (fixtureServer.address() as AddressInfo).port;
  fixtureBaseUrl = `http://localhost:${port}`;
  // This suite's fixture server legitimately runs on localhost (a loopback address) — opt it into
  // the SSRF-guard's test allowlist so these tests exercise real fetch/classification behavior.
  // See resolveSourceArtifact.ts's `__allowPrivateNetworkHostForTests` doc comment.
  __allowPrivateNetworkHostForTests('localhost');
});

afterAll(async () => {
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  __resetPrivateNetworkTestAllowlist();
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE source_artifact, submission, investigation CASCADE');
});

async function insertArtifact(type: 'url' | 'text', raw: string): Promise<string> {
  const investigation = await pool.query<{ id: string }>(
    `INSERT INTO investigation (status) VALUES ('open') RETURNING id`,
  );
  const submission = await pool.query<{ id: string }>(
    `INSERT INTO submission (investigation_id, origin) VALUES ($1, 'human') RETURNING id`,
    [investigation.rows[0].id],
  );
  const artifact = await pool.query<{ id: string }>(
    `INSERT INTO source_artifact (investigation_id, submission_id, type, raw, origin)
     VALUES ($1, $2, $3, $4, 'submitted') RETURNING id`,
    [investigation.rows[0].id, submission.rows[0].id, type, raw],
  );
  return artifact.rows[0].id;
}

describe('resolveSourceArtifact', () => {
  it('classifies a reachable URL with substantial body content as content-retrieved', async () => {
    const id = await insertArtifact('url', `${fixtureBaseUrl}/large-content`);
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('content-retrieved');

    const row = await pool.query(
      'SELECT resolution_status, resolved_content FROM source_artifact WHERE id = $1',
      [id],
    );
    expect(row.rows[0].resolution_status).toBe('content-retrieved');
    expect(row.rows[0].resolved_content).toBe('lorem ipsum '.repeat(50));
  });

  it('classifies a dead/unreachable URL (404) as unreachable with a failureReason, and persists it', async () => {
    const id = await insertArtifact('url', `${fixtureBaseUrl}/not-found`);
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toBeTruthy();
    expect(resolution.failureReason).toContain('404');

    const row = await pool.query(
      'SELECT resolution_status, resolution_failure_reason FROM source_artifact WHERE id = $1',
      [id],
    );
    expect(row.rows[0].resolution_status).toBe('unreachable');
    expect(row.rows[0].resolution_failure_reason).toBe(resolution.failureReason);
  });

  it('classifies an unresolvable host as unreachable with a failureReason', async () => {
    const id = await insertArtifact('url', 'http://this-host-does-not-exist.invalid/page');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toBeTruthy();
  });

  it('classifies a reachable-but-empty response as reachable-no-content, distinct from both content-retrieved and unreachable', async () => {
    const id = await insertArtifact('url', `${fixtureBaseUrl}/empty`);
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('reachable-no-content');
    expect(resolution.status).not.toBe('content-retrieved');
    expect(resolution.status).not.toBe('unreachable');
    expect(resolution.noContentReason).toBeTruthy();
  });

  it('classifies a reachable paywall-like short response as reachable-no-content', async () => {
    const id = await insertArtifact('url', `${fixtureBaseUrl}/paywall`);
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('reachable-no-content');
  });

  it('resolves a text artifact to content-retrieved without any network call, persisting the pasted text as resolved content', async () => {
    const id = await insertArtifact('text', 'this is pasted text, already content');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('content-retrieved');

    const row = await pool.query('SELECT resolved_content FROM source_artifact WHERE id = $1', [
      id,
    ]);
    expect(row.rows[0].resolved_content).toBe('this is pasted text, already content');
  });

  it('throws for a nonexistent source artifact id', async () => {
    await expect(
      resolveSourceArtifact('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow('does not exist');
  });

  it('classifies an artifact whose type is neither "url" nor "text" as unsupported, without attempting a network fetch (discriminator fix)', async () => {
    // SourceArtifactType is an open discriminator (Decision 1.1) — arbitrary runtime string
    // values are valid at the type level. We insert a row with type = 'screenshot' directly
    // (bypassing normal TS literal narrowing, which is the point of the open discriminator) and
    // give it a `raw` value that WOULD succeed if it were ever fetched as a URL, proving the
    // fallback path — not a fall-through into URL-fetching — is what actually runs.
    const investigation = await pool.query<{ id: string }>(
      `INSERT INTO investigation (status) VALUES ('open') RETURNING id`,
    );
    const submission = await pool.query<{ id: string }>(
      `INSERT INTO submission (investigation_id, origin) VALUES ($1, 'human') RETURNING id`,
      [investigation.rows[0].id],
    );
    const artifact = await pool.query<{ id: string }>(
      `INSERT INTO source_artifact (investigation_id, submission_id, type, raw, origin)
       VALUES ($1, $2, 'screenshot', $3, 'submitted') RETURNING id`,
      [investigation.rows[0].id, submission.rows[0].id, `${fixtureBaseUrl}/large-content`],
    );

    const resolution = await resolveSourceArtifact(artifact.rows[0].id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toContain('screenshot');
    expect(resolution.failureReason).toMatch(/unsupported/i);
  });
});
