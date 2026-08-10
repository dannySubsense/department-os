import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { app } from './server.js';
import { pool } from '../db/pool.js';

// Integration coverage for the Express routes (03-UI-SPEC.md "Screen: Submission Screen" and
// "Investigation Screen — Generating State"). submitSources.test.ts covers the service layer;
// these tests cover the HTTP layer wired on top of it — the routes, the server-side-enforced
// zero-artifact rejection, and the actual rendered Generating-state HTML, none of which the
// service-layer tests exercise.

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
  await pool.query('TRUNCATE source_artifact, submission, investigation CASCADE');
});

describe('GET /investigations/new — Submission Screen', () => {
  it('renders the submit control disabled in its initial state', async () => {
    const res = await fetch(`${baseUrl}/investigations/new`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/id="submit-control"[^>]*disabled/);
  });
});

describe('GET /investigations/:id — error handling does not hang', () => {
  it('returns 404 for a well-formed but nonexistent investigation id', async () => {
    const res = await fetch(`${baseUrl}/investigations/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  });

  it('returns a real response (not a hang) when the id is not a valid UUID (DB error path)', async () => {
    const res = await fetch(`${baseUrl}/investigations/not-a-uuid`);
    expect(res.status).toBe(500);
  });

  it('renders the Investigation status alongside the id in the Generating state', async () => {
    const postRes = await fetch(`${baseUrl}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'type=url&raw=' + encodeURIComponent('https://example.com/status-check'),
      redirect: 'manual',
    });
    const location = postRes.headers.get('location')!;
    const getRes = await fetch(`${baseUrl}${location}`);
    const html = await getRes.text();
    expect(html).toContain('status: open');
  });
});

describe('POST /investigations — server-side zero-artifact enforcement', () => {
  it('rejects a direct API call with no source rows at all (bypassing the client form)', async () => {
    const res = await fetch(`${baseUrl}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    expect(res.status).toBe(400);

    const investigations = await pool.query('SELECT * FROM investigation');
    expect(investigations.rowCount).toBe(0);
  });

  it('rejects whitespace-only content, shows an inline validation message, and preserves the entered content', async () => {
    const res = await fetch(`${baseUrl}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'type=url&raw=' + encodeURIComponent('   '),
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toMatch(/class="validation-message"[^>]*role="alert"/);
    expect(html).toContain('At least one source is required.');
    // the originally submitted raw value is echoed back into the re-rendered input matching its
    // kind ('url'), not silently dropped
    expect(html).toContain('<input type="url" name="raw" placeholder="Paste a URL" value="   " />');

    const investigations = await pool.query('SELECT * FROM investigation');
    expect(investigations.rowCount).toBe(0);
  });
});

describe('POST /investigations — success path redirects to the Generating state', () => {
  it('redirects to the durable Investigation URL, which renders the Generating state', async () => {
    const postRes = await fetch(`${baseUrl}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'type=url&raw=' + encodeURIComponent('https://example.com/article'),
      redirect: 'manual',
    });
    expect(postRes.status).toBe(303);
    const location = postRes.headers.get('location');
    expect(location).toMatch(/^\/investigations\/[0-9a-f-]+$/);

    const getRes = await fetch(`${baseUrl}${location}`);
    expect(getRes.status).toBe(200);
    const html = await getRes.text();

    const investigationId = location!.split('/').pop()!;
    expect(html).toContain('Investigation reference');
    expect(html).toContain(investigationId);
    expect(html).toContain('https://example.com/article');
    // Source Resolver does not exist until Slice 3 — every source must show the genuine DB
    // default ('unresolved') rendered as "pending", not a hardcoded/fake resolution.
    expect(html).toContain('status: pending');
    expect(html).toContain('This exact URL is your durable reference');
  });
});
