import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { app } from './server.js';
import { pool } from '../db/pool.js';
import {
  __allowPrivateNetworkHostForTests,
  __resetPrivateNetworkTestAllowlist,
} from '../services/resolveSourceArtifact.js';

// Integration coverage for the Express routes (03-UI-SPEC.md "Screen: Submission Screen" and
// "Investigation Screen — Generating State"). submitSources.test.ts covers the service layer;
// these tests cover the HTTP layer wired on top of it — the routes, the server-side-enforced
// zero-artifact rejection, and the actual rendered Generating-state HTML, none of which the
// service-layer tests exercise.
//
// Since Slice 3, POST /investigations synchronously resolves submitted sources (see server.ts's
// documented trigger-point judgment call) before redirecting — so any test that needs a
// "reachable" source must serve one locally rather than depending on a real third-party URL's
// behavior/uptime. A tiny local HTTP fixture server does that here.

let baseUrl: string;
let server: ReturnType<typeof app.listen>;

let fixtureBaseUrl: string;
let fixtureServer: ReturnType<typeof createServer>;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;

  fixtureServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('a'.repeat(500)); // well over the 200-char reachable-content threshold
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, resolve));
  const fixturePort = (fixtureServer.address() as AddressInfo).port;
  fixtureBaseUrl = `http://localhost:${fixturePort}`;
  // These integration tests submit real fixture URLs on localhost through the full HTTP route ->
  // resolveSourceArtifact chain. See resolveSourceArtifact.ts's `__allowPrivateNetworkHostForTests`
  // doc comment for why this is a legitimate, deliberate opt-in rather than a bypass.
  __allowPrivateNetworkHostForTests('localhost');
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  __resetPrivateNetworkTestAllowlist();
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
      body: 'type=url&raw=' + encodeURIComponent(fixtureBaseUrl + '/status-check'),
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
  it('redirects to the durable Investigation URL, which renders the Generating state with live resolution status', async () => {
    const articleUrl = fixtureBaseUrl + '/article';
    const postRes = await fetch(`${baseUrl}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'type=url&raw=' + encodeURIComponent(articleUrl),
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
    expect(html).toContain(articleUrl);
    // Since Slice 3, POST synchronously resolves sources — a reachable fixture URL with plenty
    // of body content resolves to 'content-retrieved', not the DB default 'unresolved'/"pending".
    expect(html).toContain('status: content retrieved');
    expect(html).toContain('This exact URL is your durable reference');
  });
});

describe('GET /investigations/:id — Blocked State (03-UI-SPEC.md, Flow 2)', () => {
  it('all-unreachable submission blocks the Investigation and renders failureReason per source, linking back to the Submission Screen', async () => {
    const deadUrl = 'http://this-host-does-not-exist.invalid/dead';
    const postRes = await fetch(`${baseUrl}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'type=url&raw=' + encodeURIComponent(deadUrl),
      redirect: 'manual',
    });
    const location = postRes.headers.get('location')!;
    const investigationId = location.split('/').pop()!;

    const getRes = await fetch(`${baseUrl}${location}`);
    expect(getRes.status).toBe(200);
    const html = await getRes.text();

    expect(html).toContain('No Brief could be generated — no source was reachable');
    expect(html).toContain('status: blocked');
    expect(html).toContain(deadUrl);
    expect(html).toMatch(/id="add-source-link"/);
    expect(html).toContain(`/investigations/new?investigationId=${investigationId}`);

    const investigation = await pool.query('SELECT status FROM investigation WHERE id = $1', [
      investigationId,
    ]);
    expect(investigation.rows[0].status).toBe('blocked');

    // 03-UI-SPEC.md names Investigation.statusReason as the Blocked state's "Reason statement"
    // data source — the rendered page must include it, matching Generation-Failed's own rendering.
    expect(html).toContain('No submitted source was reachable.');
  });
});

describe('POST /investigations — Blocked -> Open recovery (Flow 2 remedy)', () => {
  it('a dead-URL submission blocks the Investigation, then a subsequent reachable submission to the same investigationId clears it back to open', async () => {
    const deadUrl = 'http://this-host-does-not-exist.invalid/dead-2';
    const firstPostRes = await fetch(`${baseUrl}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'type=url&raw=' + encodeURIComponent(deadUrl),
      redirect: 'manual',
    });
    const location = firstPostRes.headers.get('location')!;
    const investigationId = location.split('/').pop()!;

    const blockedGetRes = await fetch(`${baseUrl}${location}`);
    const blockedHtml = await blockedGetRes.text();
    expect(blockedHtml).toContain('status: blocked');

    // Use the Blocked screen's own recovery link target: resubmit to the same investigationId.
    const reachableUrl = fixtureBaseUrl + '/recovery-article';
    const secondPostRes = await fetch(`${baseUrl}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `type=url&raw=${encodeURIComponent(reachableUrl)}&investigationId=${investigationId}`,
      redirect: 'manual',
    });
    expect(secondPostRes.status).toBe(303);
    const secondLocation = secondPostRes.headers.get('location')!;
    expect(secondLocation).toBe(`/investigations/${investigationId}`);

    const recoveredGetRes = await fetch(`${baseUrl}${secondLocation}`);
    const recoveredHtml = await recoveredGetRes.text();
    expect(recoveredHtml).toContain('status: open');
    expect(recoveredHtml).not.toContain('status: blocked');

    const investigation = await pool.query(
      'SELECT status, status_reason FROM investigation WHERE id = $1',
      [investigationId],
    );
    expect(investigation.rows[0].status).toBe('open');
    expect(investigation.rows[0].status_reason).toBeNull();
  });
});

describe('GET /investigations/:id — Generation Failed State (03-UI-SPEC.md, Flow 2a, G-13)', () => {
  it('renders copy distinct from Blocked and never offers "add a source" as the fix, given a fixture statusReason', async () => {
    // No pipeline exists yet to drive an Investigation into 'generation-failed' (Slice 9 owns
    // that live transition) — this test exercises the component against a fixture statusReason,
    // per 04-ROADMAP.md Slice 3's explicit scope note.
    const investigation = await pool.query<{ id: string }>(
      `INSERT INTO investigation (status, status_reason)
       VALUES ('generation-failed', $1) RETURNING id`,
      ['No valid Problem Statement could be established from the submitted material.'],
    );
    const investigationId = investigation.rows[0].id;

    const getRes = await fetch(`${baseUrl}/investigations/${investigationId}`);
    expect(getRes.status).toBe(200);
    const html = await getRes.text();

    expect(html).toContain('Sources were reachable, but Brief generation did not complete');
    expect(html).toContain('status: generation-failed');
    expect(html).toContain('No valid Problem Statement could be established from the submitted material.');
    expect(html).toContain('This is not a missing-source issue');
    expect(html).toMatch(/id="retry-link"/);
    expect(html).toContain(`/investigations/new?investigationId=${investigationId}`);

    // G-13: never share the Blocked state's "add a source" framing.
    expect(html).not.toContain('No Brief could be generated — no source was reachable');
    expect(html).not.toMatch(/add\s+(a|another)\s+source/i);
  });
});

describe('POST /investigations — status transition guard (Sol review item 3)', () => {
  it('does not revert a generation-failed Investigation to blocked when a follow-up submission is all-unreachable', async () => {
    const investigation = await pool.query<{ id: string }>(
      `INSERT INTO investigation (status, status_reason)
       VALUES ('generation-failed', $1) RETURNING id`,
      ['No valid Problem Statement could be established from the submitted material.'],
    );
    const investigationId = investigation.rows[0].id;

    const deadUrl = 'http://this-host-does-not-exist.invalid/dead-3';
    const postRes = await fetch(`${baseUrl}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `type=url&raw=${encodeURIComponent(deadUrl)}&investigationId=${investigationId}`,
      redirect: 'manual',
    });
    expect(postRes.status).toBe(303);

    const row = await pool.query('SELECT status FROM investigation WHERE id = $1', [
      investigationId,
    ]);
    expect(row.rows[0].status).toBe('generation-failed');
  });
});
