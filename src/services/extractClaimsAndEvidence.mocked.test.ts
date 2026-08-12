import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';

/** Mocked-LLM unit tests for `extractClaimsAndEvidence`'s edge cases — contradicting evidence,
 *  shared evidence cited with different stances, unlabelable evidence, and empty-evidence claim
 *  rejection. These scenarios are deterministic invariants of the persistence/filtering logic,
 *  not of the model's judgment, so constructing them via a real LLM call would be unreliable
 *  (nothing forces a real model to reliably reproduce "cite the same evidence with two different
 *  stances" on demand) — mocking `callForcedTool` at the same boundary Slice 3 mocked HTTP with
 *  local fixture servers keeps the thing genuinely under test (extraction/labeling *persistence*
 *  logic) isolated from model non-determinism, while `extractClaimsAndEvidence.test.ts` covers the
 *  real-LLM-call paths this file deliberately does not. */
vi.mock('./llmClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmClient.js')>();
  return {
    ...actual,
    callForcedTool: vi.fn(),
  };
});

const { callForcedTool } = await import('./llmClient.js');
const { extractClaimsAndEvidence, __setF2RaceDelayForTests } = await import('./extractClaimsAndEvidence.js');

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE claim_version_evidence, evidence_item, claim_version, claim, source_artifact, submission, investigation CASCADE',
  );
  vi.mocked(callForcedTool).mockReset();
});

/** Seeds a single 'content-retrieved' text source directly (Slice 4 tests exercise extraction
 *  logic against already-resolved sources, not the Slice 3 resolver — matching Slice 3's own test
 *  file's pattern of building on the prior slice's persisted state rather than re-exercising it). */
async function seedResolvedTextSource(content: string): Promise<{ investigationId: string; sourceArtifactId: string }> {
  const submission = await submitSources({
    origin: 'human',
    artifacts: [{ type: 'text', raw: content }],
  });
  const sourceArtifactId = submission.sourceArtifactIds[0];
  await pool.query(
    `UPDATE source_artifact
     SET resolution_status = 'content-retrieved', resolution_resolved_at = now(), resolved_content = $2
     WHERE id = $1`,
    [sourceArtifactId, content],
  );
  return { investigationId: submission.investigationId, sourceArtifactId };
}

describe('extractClaimsAndEvidence (mocked LLM)', () => {
  it('persists contradicting evidence with stance: contradicting, not dropped', async () => {
    const { investigationId, sourceArtifactId } = await seedResolvedTextSource(
      'Some users say the export feature works fine; others say it is broken.',
    );

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [
          { sourceArtifactId, excerptOrSummary: 'export works fine', label: 'observation' },
          { sourceArtifactId, excerptOrSummary: 'export is broken', label: 'observation' },
        ],
        claims: [
          {
            text: 'The export feature is broken',
            evidenceRefs: [
              { evidenceIndex: 0, stance: 'contradicting' },
              { evidenceIndex: 1, stance: 'supporting' },
            ],
          },
        ],
        problemStatements: [
          {
            whoExperiencesIt: 'Users of the export feature',
            contextOrWorkflow: 'Exporting data',
            consequenceOrFriction: 'Inconsistent export reliability',
            supportingClaimIndices: [0],
          },
        ],
      },
    });

    const result = await extractClaimsAndEvidence(investigationId);

    expect(result.generationFailed).toBe(false);
    expect(result.claimVersions).toHaveLength(1);
    expect(result.claimVersions[0].evidence).toHaveLength(2);
    const contradicting = result.claimVersions[0].evidence.find((e) => e.stance === 'contradicting');
    expect(contradicting).toBeDefined();

    const rows = await pool.query(
      `SELECT stance FROM claim_version_evidence WHERE claim_version_id = $1 ORDER BY stance`,
      [result.claimVersions[0].id],
    );
    expect(rows.rows.map((r) => r.stance).sort()).toEqual(['contradicting', 'supporting']);
  });

  it('persists one shared EvidenceItem cited by two ClaimVersions with different stances, independently', async () => {
    const { investigationId, sourceArtifactId } = await seedResolvedTextSource(
      'A single review mentions both a workaround and its underlying limitation.',
    );

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [{ sourceArtifactId, excerptOrSummary: 'shared excerpt', label: 'fact' }],
        claims: [
          { text: 'Claim A', evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }] },
          { text: 'Claim B', evidenceRefs: [{ evidenceIndex: 0, stance: 'contradicting' }] },
        ],
        problemStatements: [
          {
            whoExperiencesIt: 'Reviewers',
            contextOrWorkflow: 'Using the workaround',
            consequenceOrFriction: 'Underlying limitation remains',
            supportingClaimIndices: [0, 1],
          },
        ],
      },
    });

    const result = await extractClaimsAndEvidence(investigationId);

    expect(result.evidenceItems).toHaveLength(1);
    expect('stance' in result.evidenceItems[0]).toBe(false);
    expect(result.claimVersions).toHaveLength(2);

    const [claimA, claimB] = result.claimVersions;
    expect(claimA.evidence[0].evidenceItemId).toBe(result.evidenceItems[0].id);
    expect(claimB.evidence[0].evidenceItemId).toBe(result.evidenceItems[0].id);
    expect(claimA.evidence[0].stance).toBe('supporting');
    expect(claimB.evidence[0].stance).toBe('contradicting');

    const rows = await pool.query(
      `SELECT claim_version_id, stance FROM claim_version_evidence WHERE evidence_item_id = $1`,
      [result.evidenceItems[0].id],
    );
    expect(rows.rows).toHaveLength(2);
  });

  it('defaults an unlabelable EvidenceItem to unknown/assumption, never omitting the label', async () => {
    const { investigationId, sourceArtifactId } = await seedResolvedTextSource(
      'An ambiguous, unverifiable statement about the market.',
    );

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [{ sourceArtifactId, excerptOrSummary: 'ambiguous statement', label: 'unknown' }],
        claims: [{ text: 'Some claim', evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }] }],
        problemStatements: [
          {
            whoExperiencesIt: 'Someone',
            contextOrWorkflow: 'Somewhere',
            consequenceOrFriction: 'Something',
            supportingClaimIndices: [0],
          },
        ],
      },
    });

    const result = await extractClaimsAndEvidence(investigationId);

    expect(result.evidenceItems).toHaveLength(1);
    expect(result.evidenceItems[0].label).toBeDefined();
    expect(['unknown', 'assumption']).toContain(result.evidenceItems[0].label);

    const row = await pool.query('SELECT label FROM evidence_item WHERE id = $1', [
      result.evidenceItems[0].id,
    ]);
    expect(row.rows[0].label).not.toBeNull();
  });

  it('does not persist a ClaimVersion with zero evidence, even transiently', async () => {
    const { investigationId, sourceArtifactId } = await seedResolvedTextSource(
      'A source with one supportable claim and one unsupportable one.',
    );

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [{ sourceArtifactId, excerptOrSummary: 'real evidence', label: 'fact' }],
        claims: [
          { text: 'Supported claim', evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }] },
          { text: 'Unsupported claim', evidenceRefs: [] }, // no evidence cited at all
        ],
        problemStatements: [
          {
            whoExperiencesIt: 'Someone',
            contextOrWorkflow: 'Somewhere',
            consequenceOrFriction: 'Something',
            supportingClaimIndices: [0, 1], // index 1 (unsupported claim) should be dropped, not persisted
          },
        ],
      },
    });

    const result = await extractClaimsAndEvidence(investigationId);

    expect(result.claimVersions).toHaveLength(1);
    expect(result.claimVersions[0].text).toBe('Supported claim');
    expect(result.problemStatementCandidates).toHaveLength(1);
    expect(result.problemStatementCandidates[0].supportingClaimVersionIds).toEqual([
      result.claimVersions[0].id,
    ]);

    const claimCount = await pool.query('SELECT count(*) FROM claim_version');
    expect(Number(claimCount.rows[0].count)).toBe(1);
  });

  it('surfaces an explicit generation-failure signal when zero problem statement candidates survive', async () => {
    const { investigationId, sourceArtifactId } = await seedResolvedTextSource(
      'Vague, unfocused source material.',
    );

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [{ sourceArtifactId, excerptOrSummary: 'vague bit', label: 'observation' }],
        claims: [{ text: 'Vague claim', evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }] }],
        problemStatements: [], // model correctly declines to invent one
      },
    });

    const result = await extractClaimsAndEvidence(investigationId);

    expect(result.problemStatementCandidates).toHaveLength(0);
    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toBeTruthy();
  });

  it('creates a new ClaimVersion under the same Claim.id on a correction, without editing the prior version', async () => {
    const { investigationId, sourceArtifactId } = await seedResolvedTextSource(
      'Original statement about a workflow problem.',
    );

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [{ sourceArtifactId, excerptOrSummary: 'original evidence', label: 'fact' }],
        claims: [{ text: 'Original claim text', evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }] }],
        problemStatements: [
          {
            whoExperiencesIt: 'Someone',
            contextOrWorkflow: 'Somewhere',
            consequenceOrFriction: 'Something',
            supportingClaimIndices: [0],
          },
        ],
      },
    });

    const first = await extractClaimsAndEvidence(investigationId);
    const originalClaimVersion = first.claimVersions[0];

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [{ sourceArtifactId, excerptOrSummary: 'corrected evidence', label: 'fact' }],
        claims: [
          {
            text: 'Corrected claim text',
            matchesExistingClaimId: originalClaimVersion.claimId,
            evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }],
          },
        ],
        problemStatements: [
          {
            whoExperiencesIt: 'Someone',
            contextOrWorkflow: 'Somewhere',
            consequenceOrFriction: 'Something, corrected',
            supportingClaimIndices: [0],
          },
        ],
      },
    });

    const second = await extractClaimsAndEvidence(investigationId);
    const correctedClaimVersion = second.claimVersions[0];

    expect(correctedClaimVersion.claimId).toBe(originalClaimVersion.claimId);
    expect(correctedClaimVersion.versionNumber).toBe(originalClaimVersion.versionNumber + 1);
    expect(correctedClaimVersion.supersedesVersionId).toBe(originalClaimVersion.id);
    expect(correctedClaimVersion.id).not.toBe(originalClaimVersion.id);

    const priorRow = await pool.query('SELECT text, version_number FROM claim_version WHERE id = $1', [
      originalClaimVersion.id,
    ]);
    expect(priorRow.rows[0].text).toBe('Original claim text');
    expect(priorRow.rows[0].version_number).toBe(1);
  });

  it('F-1: dedupes a claim citing the same evidence twice with different stances, keeping contradicting, without crashing the run', async () => {
    const { investigationId, sourceArtifactId } = await seedResolvedTextSource(
      'One excerpt is cited by the model as both supporting and contradicting the same claim.',
    );

    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [{ sourceArtifactId, excerptOrSummary: 'ambiguous excerpt', label: 'observation' }],
        claims: [
          {
            text: 'Claim citing the same evidence index twice',
            evidenceRefs: [
              { evidenceIndex: 0, stance: 'supporting' },
              { evidenceIndex: 0, stance: 'contradicting' },
            ],
          },
          {
            // A sibling, otherwise-valid claim in the same batch — must still persist even though
            // the claim above previously would have crashed the whole transaction.
            text: 'A separate, valid claim',
            evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }],
          },
        ],
        problemStatements: [
          {
            whoExperiencesIt: 'Someone',
            contextOrWorkflow: 'Somewhere',
            consequenceOrFriction: 'Something',
            supportingClaimIndices: [0, 1],
          },
        ],
      },
    });

    const result = await extractClaimsAndEvidence(investigationId);

    expect(result.generationFailed).toBe(false);
    expect(result.claimVersions).toHaveLength(2);

    const dedupedClaim = result.claimVersions.find((cv) => cv.text === 'Claim citing the same evidence index twice');
    expect(dedupedClaim).toBeDefined();
    // Exactly one evidence ref survives, with the higher-precedence stance kept.
    expect(dedupedClaim!.evidence).toHaveLength(1);
    expect(dedupedClaim!.evidence[0].stance).toBe('contradicting');

    // The sibling claim in the same batch still persisted successfully.
    const otherClaim = result.claimVersions.find((cv) => cv.text === 'A separate, valid claim');
    expect(otherClaim).toBeDefined();

    // In-memory read-shape matches exactly what's persisted — no divergence (Architecture §3).
    const rows = await pool.query(
      `SELECT evidence_item_id, stance FROM claim_version_evidence WHERE claim_version_id = $1`,
      [dedupedClaim!.id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].stance).toBe('contradicting');
  });

  it('F-3: surfaces an unexpected mid-extraction DB error as generationFailed rather than an unhandled throw', async () => {
    const { investigationId, sourceArtifactId } = await seedResolvedTextSource(
      'Source material that would otherwise extract successfully.',
    );

    // `callForcedTool` is mocked at this file's boundary, so `validateRawExtraction`'s runtime
    // checks never run on this fixture — deliberately used here to smuggle a value the real model
    // could never produce (a label outside evidence_item's CHECK constraint) past the app layer,
    // inducing a genuine, mid-transaction Postgres error (not simulated/mocked at the DB level) to
    // confirm the general escape-hatch (F-3), not just the two specific F-1/F-2 bugs, converts to
    // `generationFailed` instead of an unhandled throw.
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [
          // Cast bypasses this file's own TS types — mirrors what an untrusted raw tool-call
          // payload could actually contain at runtime.
          { sourceArtifactId, excerptOrSummary: 'evidence', label: 'not-a-real-label' as 'fact' },
        ],
        claims: [{ text: 'A claim', evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }] }],
        problemStatements: [
          {
            whoExperiencesIt: 'Someone',
            contextOrWorkflow: 'Somewhere',
            consequenceOrFriction: 'Something',
            supportingClaimIndices: [0],
          },
        ],
      },
    });

    const result = await extractClaimsAndEvidence(investigationId);

    expect(result.generationFailed).toBe(true);
    expect(result.generationFailureReason).toBeTruthy();
    expect(result.generationFailureReason).toMatch(/unexpected error/i);
    expect(result.claimVersions).toHaveLength(0);
    expect(result.evidenceItems).toHaveLength(0);

    // Nothing was left half-committed — the failed transaction was rolled back.
    const claimCount = await pool.query('SELECT count(*) FROM claim_version');
    expect(Number(claimCount.rows[0].count)).toBe(0);
    const evidenceCount = await pool.query('SELECT count(*) FROM evidence_item');
    expect(Number(evidenceCount.rows[0].count)).toBe(0);
  });

  it('F-2: two concurrent extraction runs superseding the SAME existing Claim do not race/crash — both serialize into distinct, correctly-chained versions', async () => {
    const { investigationId, sourceArtifactId } = await seedResolvedTextSource(
      'A source that both concurrent runs will re-extract, each correcting the same existing claim.',
    );

    // Step 1: seed a real, already-persisted Claim (version 1) via a genuine prior extraction run —
    // this is the "existing claim" both concurrent runs below will race to supersede.
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [{ sourceArtifactId, excerptOrSummary: 'original evidence', label: 'fact' }],
        claims: [{ text: 'Original claim text', evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }] }],
        problemStatements: [
          {
            whoExperiencesIt: 'Someone',
            contextOrWorkflow: 'Somewhere',
            consequenceOrFriction: 'Something',
            supportingClaimIndices: [0],
          },
        ],
      },
    });
    const seeded = await extractClaimsAndEvidence(investigationId);
    const existingClaimId = seeded.claimVersions[0].claimId;
    expect(seeded.claimVersions[0].versionNumber).toBe(1);

    const makeRawExtraction = (claimText: string) => ({
      attempts: 1 as const,
      value: {
        evidenceItems: [{ sourceArtifactId, excerptOrSummary: `evidence for ${claimText}`, label: 'fact' as const }],
        claims: [
          {
            text: claimText,
            // Both concurrent calls target the SAME existing Claim.id — genuinely racing to
            // insert the next version_number under one Claim, which is exactly what the
            // advisory lock (F-2) exists to serialize.
            matchesExistingClaimId: existingClaimId,
            evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' as const }],
          },
        ],
        problemStatements: [
          {
            whoExperiencesIt: 'Someone',
            contextOrWorkflow: 'Somewhere',
            consequenceOrFriction: 'Something',
            supportingClaimIndices: [0],
          },
        ],
      },
    });

    vi.mocked(callForcedTool)
      .mockResolvedValueOnce(makeRawExtraction('Concurrent correction A'))
      .mockResolvedValueOnce(makeRawExtraction('Concurrent correction B'));

    // Force a genuine race window: without this, the two concurrent calls race on real,
    // uncontrolled async timing between the advisory-lock acquire and the existing-claims read,
    // which is too narrow to reliably overlap on normal test-run timing (a client-side `setTimeout`
    // delay was tried first and found unreliable — see below). A genuine DB-side hold, run
    // independently on each connection's own open transaction, is what reliably widens the window:
    // both connections are provably still asleep/mid-transaction on the Postgres server itself for
    // the full second, so both `SELECT`s below land while neither has written anything yet — this
    // is the same approach QC's own probe script used to first prove the race (see this test's F-2
    // doc comment in extractClaimsAndEvidence.ts). A pure client-side `setTimeout` was tried first
    // and rejected: it only delays when each call's JS resumes, not when the DB itself is holding
    // the transaction open, so real network/event-loop scheduling skew between the two calls could
    // still let one call's whole select-through-commit chain finish before the other's `SELECT`
    // round-trip ever reached the server, masking the race.
    __setF2RaceDelayForTests((client) => client.query('SELECT pg_sleep(1)').then(() => undefined));
    let resultA: Awaited<ReturnType<typeof extractClaimsAndEvidence>>;
    let resultB: Awaited<ReturnType<typeof extractClaimsAndEvidence>>;
    try {
      [resultA, resultB] = await Promise.all([
        extractClaimsAndEvidence(investigationId),
        extractClaimsAndEvidence(investigationId),
      ]);
    } finally {
      __setF2RaceDelayForTests(null);
    }

    // Neither run crashed/threw — both returned a well-formed result (this is what fails with
    // `duplicate key value violates unique constraint` when the advisory lock is removed).
    expect(resultA.generationFailed).toBe(false);
    expect(resultB.generationFailed).toBe(false);
    expect(resultA.claimVersions).toHaveLength(1);
    expect(resultB.claimVersions).toHaveLength(1);

    // Both new versions are under the SAME pre-existing claim_id — this is the contended row.
    expect(resultA.claimVersions[0].claimId).toBe(existingClaimId);
    expect(resultB.claimVersions[0].claimId).toBe(existingClaimId);

    // No UNIQUE(claim_id, version_number) violation occurred — every persisted claim_version row
    // for this claim has a distinct version_number, and they are exactly {1, 2, 3} (seed + two
    // concurrent corrections), not a collision on {1, 2, 2} or similar.
    const rows = await pool.query(
      'SELECT id, version_number, supersedes_version_id FROM claim_version WHERE claim_id = $1 ORDER BY version_number',
      [existingClaimId],
    );
    expect(rows.rows.map((r) => r.version_number)).toEqual([1, 2, 3]);

    // The two new versions correctly chain via supersedes_version_id — whichever ran second
    // supersedes whichever ran first (order between A/B is not deterministic under Promise.all,
    // but the chain integrity is: version 3's supersedes_version_id must equal version 2's id,
    // and version 2's must equal version 1's id).
    const [v1, v2, v3] = rows.rows;
    expect(v2.supersedes_version_id).toBe(v1.id);
    expect(v3.supersedes_version_id).toBe(v2.id);

    // Both concurrent results' own claimVersion rows are exactly the persisted v2/v3 rows, one each
    // — confirms no lost update (both writers' work survived, none silently overwrote the other).
    const resultVersionIds = [resultA.claimVersions[0].id, resultB.claimVersions[0].id].sort();
    expect(resultVersionIds).toEqual([v2.id, v3.id].sort());
  });

  it('rejects an UPDATE or DELETE against every immutable evidence/claim table, not just claim_version', async () => {
    // Slice 2's QC found a migration guard and its own test sharing an unscoped-query blind spot,
    // and a prior version of this test file only exercised the trigger on `claim_version` — leaving
    // `claim`, `evidence_item`, and `claim_version_evidence`'s triggers (004_claims_and_evidence.sql)
    // completely unverified. Exercise all four tables the migration claims to protect.
    const { investigationId, sourceArtifactId } = await seedResolvedTextSource('Some source content.');
    vi.mocked(callForcedTool).mockResolvedValueOnce({
      attempts: 1,
      value: {
        evidenceItems: [{ sourceArtifactId, excerptOrSummary: 'evidence', label: 'fact' }],
        claims: [{ text: 'A claim', evidenceRefs: [{ evidenceIndex: 0, stance: 'supporting' }] }],
        problemStatements: [
          {
            whoExperiencesIt: 'Someone',
            contextOrWorkflow: 'Somewhere',
            consequenceOrFriction: 'Something',
            supportingClaimIndices: [0],
          },
        ],
      },
    });
    const result = await extractClaimsAndEvidence(investigationId);
    const claimId = result.claimVersions[0].claimId;
    const claimVersionId = result.claimVersions[0].id;
    const evidenceItemId = result.evidenceItems[0].id;

    await expect(
      pool.query('UPDATE claim_version SET text = $1 WHERE id = $2', ['tampered', claimVersionId]),
    ).rejects.toThrow(/immutable/);
    await expect(
      pool.query('DELETE FROM claim_version WHERE id = $1', [claimVersionId]),
    ).rejects.toThrow(/immutable/);

    await expect(
      pool.query('UPDATE claim SET created_at = now() WHERE id = $1', [claimId]),
    ).rejects.toThrow(/immutable/);

    await expect(
      pool.query('UPDATE evidence_item SET label = $1 WHERE id = $2', ['fact', evidenceItemId]),
    ).rejects.toThrow(/immutable/);

    await expect(
      pool.query(
        'UPDATE claim_version_evidence SET stance = $1 WHERE claim_version_id = $2 AND evidence_item_id = $3',
        ['neutral-context', claimVersionId, evidenceItemId],
      ),
    ).rejects.toThrow(/immutable/);
  });
});
