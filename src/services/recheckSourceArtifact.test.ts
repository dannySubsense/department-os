import { beforeEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import {
  recheckSourceArtifact,
  RecheckNotEligibleError,
  SourceArtifactNotFoundError,
} from './recheckSourceArtifact.js';
import {
  __allowPrivateNetworkHostForTests,
  __resetPrivateNetworkTestAllowlist,
} from './resolveSourceArtifact.js';

// Integration coverage for recheckSourceArtifact (04-ROADMAP.md C2-S2 Tests list, §1.4a).

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

async function seedUnreachableSourceOnBlockedInvestigation(): Promise<{
  investigationId: string;
  sourceArtifactId: string;
}> {
  const submission = await submitSources({
    origin: 'human',
    artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/dead-link` }],
  });
  await pool.query(
    `UPDATE source_artifact SET resolution_status = 'unreachable', resolution_failure_reason = 'HTTP 404'
     WHERE investigation_id = $1`,
    [submission.investigationId],
  );
  await pool.query(`UPDATE investigation SET status = 'blocked' WHERE id = $1`, [
    submission.investigationId,
  ]);
  return {
    investigationId: submission.investigationId,
    sourceArtifactId: submission.sourceArtifactIds[0],
  };
}

describe('recheckSourceArtifact', () => {
  it('throws SourceArtifactNotFoundError for a nonexistent id', async () => {
    await expect(
      recheckSourceArtifact('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(SourceArtifactNotFoundError);
  });

  it("updates only the target row's persisted resolution state, leaving an already-resolved sibling row byte-identical", async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [
        { type: 'url', raw: `${fixtureBaseUrl}/dead-link` },
        { type: 'text', raw: 'sibling content' },
      ],
    });
    const [targetId, siblingId] = submission.sourceArtifactIds;
    await pool.query(
      `UPDATE source_artifact SET resolution_status = 'unreachable', resolution_failure_reason = 'HTTP 404'
       WHERE id = $1`,
      [targetId],
    );
    await pool.query(
      `UPDATE source_artifact SET resolution_status = 'content-retrieved', resolved_content = 'sibling content'
       WHERE id = $1`,
      [siblingId],
    );
    const before = await pool.query('SELECT * FROM source_artifact WHERE id = $1', [siblingId]);

    await recheckSourceArtifact(targetId);

    const after = await pool.query('SELECT * FROM source_artifact WHERE id = $1', [siblingId]);
    expect(after.rows[0]).toEqual(before.rows[0]);

    const targetRow = await pool.query('SELECT resolution_status FROM source_artifact WHERE id = $1', [
      targetId,
    ]);
    expect(targetRow.rows[0].resolution_status).toBe('unreachable');
  });

  it("transitions a blocked Investigation to 'open' when the rechecked source is now the only reachable one", async () => {
    const { investigationId, sourceArtifactId } = await seedUnreachableSourceOnBlockedInvestigation();
    await pool.query(`UPDATE source_artifact SET raw = $2 WHERE id = $1`, [
      sourceArtifactId,
      `${fixtureBaseUrl}/reachable`,
    ]);

    const result = await recheckSourceArtifact(sourceArtifactId);

    expect(result.resolutionStatus).toBe('content-retrieved');
    expect(result.investigationStatus).toBe('open');
    const investigation = await pool.query('SELECT status FROM investigation WHERE id = $1', [
      investigationId,
    ]);
    expect(investigation.rows[0].status).toBe('open');
  });

  it('never calls transitionInvestigationStatus for a non-blocked Investigation (explicit-skip half of §1.4a, verified via spy)', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/dead-link` }],
    });
    await pool.query(
      `UPDATE source_artifact SET resolution_status = 'unreachable', resolution_failure_reason = 'HTTP 404'
       WHERE investigation_id = $1`,
      [submission.investigationId],
    );
    await pool.query(`UPDATE source_artifact SET raw = $2 WHERE investigation_id = $1`, [
      submission.investigationId,
      `${fixtureBaseUrl}/reachable`,
    ]);

    const spy = vi.spyOn(pool, 'query');
    const updateCallsBefore = spy.mock.calls.filter((c) =>
      String(c[0]).includes('UPDATE investigation'),
    ).length;

    await recheckSourceArtifact(submission.sourceArtifactIds[0]);

    const updateCallsAfter = spy.mock.calls.filter((c) =>
      String(c[0]).includes('UPDATE investigation'),
    ).length;
    expect(updateCallsAfter).toBe(updateCallsBefore);
    spy.mockRestore();
  });

  it('server-side no-overwrite guard: a source in a terminal, non-unreachable state is rejected with RecheckNotEligibleError and left byte-identical', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'text', raw: 'already resolved content' }],
    });
    const id = submission.sourceArtifactIds[0];
    await pool.query(
      `UPDATE source_artifact SET resolution_status = 'content-retrieved', resolved_content = 'already resolved content'
       WHERE id = $1`,
      [id],
    );
    const before = await pool.query('SELECT * FROM source_artifact WHERE id = $1', [id]);

    await expect(recheckSourceArtifact(id)).rejects.toThrow(RecheckNotEligibleError);

    const after = await pool.query('SELECT * FROM source_artifact WHERE id = $1', [id]);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('CAS guard is real: two concurrent recheck calls against the same unreachable row result in exactly one winning UPDATE, never a lost update', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/reachable` }],
    });
    const id = submission.sourceArtifactIds[0];
    await pool.query(
      `UPDATE source_artifact SET resolution_status = 'unreachable', resolution_failure_reason = 'HTTP 404'
       WHERE id = $1`,
      [id],
    );

    // Synchronization barrier: hold each call after its initial SELECT until BOTH calls have
    // completed that SELECT (both observing resolution_revision = N, status 'unreachable'),
    // before either is allowed to proceed to computeSourceResolution/UPDATE. This is the "real
    // DB-level or test-harness synchronization point" the CAS-race test description requires
    // (04-ROADMAP.md C2-S2 §1.4a) — an unsynchronized Promise.all cannot guarantee interleaving.
    let selectCount = 0;
    let releaseBarrier: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    const updateResults: number[] = [];
    const originalQuery = pool.query.bind(pool);
    const spy = vi.spyOn(pool, 'query').mockImplementation(async (...args: unknown[]) => {
      const text = String(args[0]);
      const isInitialSelect = text.includes(
        'SELECT id, investigation_id, type, raw, resolution_status',
      );
      if (isInitialSelect) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (originalQuery as any)(...args);
        selectCount += 1;
        if (selectCount >= 2) {
          releaseBarrier();
        } else {
          await barrier;
        }
        return result;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (originalQuery as any)(...args);
      if (text.includes('UPDATE source_artifact') && text.includes('resolution_revision = $11')) {
        updateResults.push(result.rowCount ?? 0);
      }
      return result;
    });

    let resultA: Awaited<ReturnType<typeof recheckSourceArtifact>>;
    let resultB: Awaited<ReturnType<typeof recheckSourceArtifact>>;
    try {
      [resultA, resultB] = await Promise.all([
        recheckSourceArtifact(id),
        recheckSourceArtifact(id),
      ]);
    } finally {
      spy.mockRestore();
    }

    // Exactly one call's UPDATE won (rowCount === 1); the other lost (rowCount === 0) because the
    // barrier proved both had already read the pre-write state before either wrote.
    expect(updateResults.sort()).toEqual([0, 1]);

    // Neither call throws RecheckNotEligibleError — the loser re-reads and returns the winner's
    // real final state rather than erroring or overwriting.
    expect(resultA.resolutionStatus).toBe('content-retrieved');
    expect(resultB.resolutionStatus).toBe('content-retrieved');

    // resolution_revision advances by exactly 1 total, never 2 (no lost update, no double-write).
    const finalRow = await pool.query(
      'SELECT resolution_status, resolution_revision FROM source_artifact WHERE id = $1',
      [id],
    );
    expect(finalRow.rows[0].resolution_status).toBe('content-retrieved');
    expect(finalRow.rows[0].resolution_revision).toBe(1);
  });

  it('resolution_revision advances by exactly 1 under a forced identical-status, identical-timestamp collision, with exactly one winner', async () => {
    const submission = await submitSources({
      origin: 'human',
      artifacts: [{ type: 'url', raw: `${fixtureBaseUrl}/reachable` }],
    });
    const id = submission.sourceArtifactIds[0];
    await pool.query(
      `UPDATE source_artifact SET resolution_status = 'unreachable', resolution_failure_reason = 'HTTP 404'
       WHERE id = $1`,
      [id],
    );

    const fixedNow = new Date('2026-01-01T00:00:00.000Z');
    // Fake only `Date` (not timers) — the fixture server's real HTTP round trip still needs real
    // setTimeout/AbortController scheduling to complete.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixedNow);
    try {
      const [resultA, resultB] = await Promise.all([
        recheckSourceArtifact(id),
        recheckSourceArtifact(id),
      ]);
      // Exactly one of the two responses reflects a fresh write; both report the row's real
      // current (winner's) state — never a stale value.
      expect(resultA.resolutionStatus).toBe(resultB.resolutionStatus);
    } finally {
      vi.useRealTimers();
    }

    const finalRow = await pool.query(
      'SELECT resolution_status, resolution_revision FROM source_artifact WHERE id = $1',
      [id],
    );
    expect(finalRow.rows[0].resolution_status).toBe('content-retrieved');
    expect(finalRow.rows[0].resolution_revision).toBe(1);
  });
});
