import { beforeEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { pool } from '../db/pool.js';
import {
  resolveSourceArtifact,
  __allowPrivateNetworkHostForTests,
  __resetPrivateNetworkTestAllowlist,
} from './resolveSourceArtifact.js';

// Sol review item 2 (SSRF hardening) regression coverage. Deliberately does NOT allowlist
// loopback/private hosts via __allowPrivateNetworkHostForTests (except where noted below for a
// redirect's SAFE initial hop) — these tests exist to prove the guard actually blocks the
// dangerous cases, not to bypass it.

let fixtureBaseUrl: string;
let fixtureServer: ReturnType<typeof createServer>;

beforeAll(async () => {
  fixtureServer = createServer((req, res) => {
    if (req.url === '/redirect-to-metadata-endpoint') {
      // Common cloud-metadata-endpoint SSRF pattern: a URL that looks safe redirects to a
      // private/link-local target. The initial hop is this fixture (allowlisted below as
      // 'localhost'); the redirect target is a raw IP literal that is NOT allowlisted.
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
      return;
    }
    if (req.url === '/redirect-to-private-ip') {
      res.writeHead(302, { Location: 'http://10.0.0.5/internal' });
      res.end();
      return;
    }
    if (req.url === '/oversized') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      // Stream well over the 5MB response-size cap.
      const chunk = 'x'.repeat(1024 * 1024); // 1MB
      let written = 0;
      const writeMore = () => {
        if (written >= 8) {
          res.end();
          return;
        }
        written += 1;
        res.write(chunk, () => writeMore());
      };
      writeMore();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('unused');
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, resolve));
  const port = (fixtureServer.address() as AddressInfo).port;
  fixtureBaseUrl = `http://localhost:${port}`;
  // Only the INITIAL hop of the redirect fixture is allowlisted (it's a legitimate localhost test
  // server); the redirect targets it issues (169.254.169.254 / 10.0.0.5) are raw IP literals and
  // are never allowlisted, so they must still be blocked by the guard.
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

async function insertArtifact(raw: string): Promise<string> {
  const investigation = await pool.query<{ id: string }>(
    `INSERT INTO investigation (status) VALUES ('open') RETURNING id`,
  );
  const submission = await pool.query<{ id: string }>(
    `INSERT INTO submission (investigation_id, origin) VALUES ($1, 'human') RETURNING id`,
    [investigation.rows[0].id],
  );
  const artifact = await pool.query<{ id: string }>(
    `INSERT INTO source_artifact (investigation_id, submission_id, type, raw, origin)
     VALUES ($1, $2, 'url', $3, 'submitted') RETURNING id`,
    [investigation.rows[0].id, submission.rows[0].id, raw],
  );
  return artifact.rows[0].id;
}

describe('resolveSourceArtifact — SSRF hardening', () => {
  it('rejects a file:// URL before attempting to fetch', async () => {
    const id = await insertArtifact('file:///etc/passwd');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/protocol/i);
  });

  it('rejects a URL whose host is a loopback IP literal (127.0.0.1)', async () => {
    const id = await insertArtifact('http://127.0.0.1:9/probe');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a URL whose host is an RFC 1918 private IP literal (10.x.x.x)', async () => {
    const id = await insertArtifact('http://10.1.2.3/probe');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a URL whose host is the cloud-metadata link-local address (169.254.169.254)', async () => {
    const id = await insertArtifact('http://169.254.169.254/latest/meta-data/');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a URL that REDIRECTS to a private-range target (cloud-metadata-endpoint pattern), not just the direct case', async () => {
    const id = await insertArtifact(`${fixtureBaseUrl}/redirect-to-metadata-endpoint`);
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a URL that REDIRECTS to an RFC 1918 private IP target', async () => {
    const id = await insertArtifact(`${fixtureBaseUrl}/redirect-to-private-ip`);
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a response exceeding the response-size cap rather than buffering it unboundedly', async () => {
    const id = await insertArtifact(`${fixtureBaseUrl}/oversized`);
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/exceeded maximum size/i);
  }, 15_000);

  // Regression for the live-exploited bypass: WHATWG `URL` normalizes IPv4-mapped IPv6 addresses
  // to COMPRESSED HEX form (`::ffff:7f00:1`), never the dotted form (`::ffff:127.0.0.1`) — a
  // dotted-form-only regex is dead code against any real URL-derived hostname and never blocks
  // this address class. This test uses the HEX form specifically — `::ffff:127.0.0.1` in hex is
  // `::ffff:7f00:1` (0x7f00 = 127.0, 0x0001 = 0.1) — because a test using the dotted form would
  // incidentally pass even with the dead regex still in place and NOT catch this bug.
  it('rejects a URL whose host is an IPv4-mapped IPv6 loopback address in COMPRESSED HEX form (::ffff:7f00:1 → 127.0.0.1)', async () => {
    const id = await insertArtifact('http://[::ffff:7f00:1]:9/probe');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a URL whose host is an IPv4-mapped IPv6 metadata-endpoint address in COMPRESSED HEX form (::ffff:a9fe:a9fe → 169.254.169.254)', async () => {
    const id = await insertArtifact('http://[::ffff:a9fe:a9fe]/latest/meta-data/');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a URL whose host is an IPv4-mapped IPv6 loopback address in the less-common ::ffff:0:HHHH:HHHH form', async () => {
    const id = await insertArtifact('http://[::ffff:0:7f00:1]:9/probe');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a URL whose host is a CGNAT IP literal (100.64.0.0/10, RFC 6598)', async () => {
    const id = await insertArtifact('http://100.64.1.1/probe');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a URL whose host is a multicast IP literal (224.0.0.0/4)', async () => {
    const id = await insertArtifact('http://224.0.0.1/probe');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a URL whose host is a reserved/future-use IP literal (240.0.0.0/4)', async () => {
    const id = await insertArtifact('http://240.0.0.1/probe');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });

  it('rejects a URL whose host is an IETF-protocol-assignment IP literal (192.0.0.0/24)', async () => {
    const id = await insertArtifact('http://192.0.0.1/probe');
    const resolution = await resolveSourceArtifact(id);
    expect(resolution.status).toBe('unreachable');
    expect(resolution.failureReason).toMatch(/blocked/i);
  });
});
