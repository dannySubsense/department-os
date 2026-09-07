import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/pool.js';
import { submitSources } from './submitSources.js';
import { getClaimVersionsForInvestigation } from './getClaimVersionsForInvestigation.js';

/** DB-integration tests for the new `getClaimVersionsForInvestigation` read helper (Architecture
 *  §1.8 design gap) — same TRUNCATE/seed pattern as `extractClaimsAndEvidence.test.ts` /
 *  `landscapeResearcher.test.ts`. Confirms investigation-scoping (a ClaimVersion belonging to a
 *  different Investigation's evidence chain is never returned) and correct denormalization of each
 *  ClaimVersion's `evidence: ClaimVersionEvidenceRef[]` (stance/relevanceNote carried through). */
afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE claim_version_evidence, evidence_item, claim_version, claim, source_artifact, submission, investigation CASCADE',
  );
});

async function seedInvestigationWithEvidence(
  excerpts: string[],
): Promise<{ investigationId: string; sourceArtifactId: string; evidenceItemIds: string[] }> {
  const submission = await submitSources({
    origin: 'human',
    artifacts: [{ type: 'text', raw: excerpts.join('\n') }],
  });
  const sourceArtifactId = submission.sourceArtifactIds[0];
  const evidenceItemIds: string[] = [];
  for (const excerpt of excerpts) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO evidence_item (source_artifact_id, excerpt_or_summary, label)
       VALUES ($1, $2, 'observation') RETURNING id`,
      [sourceArtifactId, excerpt],
    );
    evidenceItemIds.push(result.rows[0].id);
  }
  return { investigationId: submission.investigationId, sourceArtifactId, evidenceItemIds };
}

async function seedClaimVersion(
  text: string,
  evidenceRefs: { evidenceItemId: string; stance: 'supporting' | 'contradicting' | 'neutral-context'; relevanceNote?: string }[],
): Promise<{ claimVersionId: string; claimId: string }> {
  const claimInsert = await pool.query<{ id: string }>(`INSERT INTO claim DEFAULT VALUES RETURNING id`);
  const claimId = claimInsert.rows[0].id;
  const versionInsert = await pool.query<{ id: string }>(
    `INSERT INTO claim_version (claim_id, version_number, text, supersedes_version_id)
     VALUES ($1, 1, $2, NULL) RETURNING id`,
    [claimId, text],
  );
  const claimVersionId = versionInsert.rows[0].id;
  for (const ref of evidenceRefs) {
    await pool.query(
      `INSERT INTO claim_version_evidence (claim_version_id, evidence_item_id, stance, relevance_note)
       VALUES ($1, $2, $3, $4)`,
      [claimVersionId, ref.evidenceItemId, ref.stance, ref.relevanceNote ?? null],
    );
  }
  return { claimVersionId, claimId };
}

describe('getClaimVersionsForInvestigation', () => {
  it('scopes ClaimVersion rows to one Investigation, excluding ClaimVersions whose evidence belongs to a different Investigation', async () => {
    const { evidenceItemIds: idsA } = await seedInvestigationWithEvidence(['Evidence for investigation A.']);
    const { investigationId: investigationBId, evidenceItemIds: idsB } = await seedInvestigationWithEvidence([
      'Evidence for investigation B.',
    ]);

    const { claimVersionId: cvA } = await seedClaimVersion('Claim scoped to investigation A.', [
      { evidenceItemId: idsA[0], stance: 'supporting' },
    ]);
    const { claimVersionId: cvB } = await seedClaimVersion('Claim scoped to investigation B.', [
      { evidenceItemId: idsB[0], stance: 'supporting' },
    ]);

    const resultForB = await getClaimVersionsForInvestigation(investigationBId);

    const returnedIds = resultForB.map((cv) => cv.id);
    expect(returnedIds).toContain(cvB);
    expect(returnedIds).not.toContain(cvA);
    expect(resultForB).toHaveLength(1);
  });

  it('correctly denormalizes each ClaimVersion\'s evidence array — stance and relevanceNote carried through per ClaimVersionEvidenceRef', async () => {
    const { investigationId, evidenceItemIds } = await seedInvestigationWithEvidence([
      'Supporting excerpt.',
      'Contradicting excerpt.',
    ]);

    const { claimVersionId } = await seedClaimVersion('A claim with mixed-stance evidence.', [
      { evidenceItemId: evidenceItemIds[0], stance: 'supporting', relevanceNote: 'directly on point' },
      { evidenceItemId: evidenceItemIds[1], stance: 'contradicting' },
    ]);

    const result = await getClaimVersionsForInvestigation(investigationId);

    expect(result).toHaveLength(1);
    const cv = result[0];
    expect(cv.id).toBe(claimVersionId);
    expect(cv.text).toBe('A claim with mixed-stance evidence.');
    expect(cv.evidence).toHaveLength(2);

    const supporting = cv.evidence.find((e) => e.evidenceItemId === evidenceItemIds[0]);
    expect(supporting?.stance).toBe('supporting');
    expect(supporting?.relevanceNote).toBe('directly on point');

    const contradicting = cv.evidence.find((e) => e.evidenceItemId === evidenceItemIds[1]);
    expect(contradicting?.stance).toBe('contradicting');
    expect(contradicting?.relevanceNote).toBeUndefined();
  });

  it('returns an empty array when the Investigation has no ClaimVersions', async () => {
    const { investigationId } = await seedInvestigationWithEvidence(['Evidence with no claim yet.']);

    const result = await getClaimVersionsForInvestigation(investigationId);

    expect(result).toEqual([]);
  });

  it('BLOCKER-1: excludes evidence refs cited only in a different Investigation, even when the ClaimVersion itself is shared/cross-referenced', async () => {
    // EvidenceItem is shared/cross-referenceable per the domain model: the same ClaimVersion can
    // have evidence cited from Investigation A ('supporting') and Investigation B ('contradicting').
    // Querying for Investigation A must return ONLY A's evidence ref, never B's foreign one — a
    // leak here would feed uncertaintyCompiler.ts a contradiction that doesn't exist in A.
    const { investigationId: investigationAId, evidenceItemIds: idsA } = await seedInvestigationWithEvidence([
      'Supporting excerpt cited from investigation A.',
    ]);
    const { evidenceItemIds: idsB } = await seedInvestigationWithEvidence([
      'Contradicting excerpt cited from investigation B.',
    ]);

    const { claimVersionId } = await seedClaimVersion('A claim shared across investigations.', [
      { evidenceItemId: idsA[0], stance: 'supporting' },
      { evidenceItemId: idsB[0], stance: 'contradicting' },
    ]);

    const resultForA = await getClaimVersionsForInvestigation(investigationAId);

    expect(resultForA).toHaveLength(1);
    const cv = resultForA[0];
    expect(cv.id).toBe(claimVersionId);
    expect(cv.evidence).toHaveLength(1);
    expect(cv.evidence[0].evidenceItemId).toBe(idsA[0]);
    expect(cv.evidence[0].stance).toBe('supporting');
    expect(cv.evidence.some((e) => e.evidenceItemId === idsB[0])).toBe(false);
  });

  it('BLOCKER-2: createdAt is an ISO string, not a raw Date object, and round-trips correctly', async () => {
    const { investigationId, evidenceItemIds } = await seedInvestigationWithEvidence(['Excerpt for date check.']);
    await seedClaimVersion('A claim for date-typing verification.', [
      { evidenceItemId: evidenceItemIds[0], stance: 'supporting' },
    ]);

    const result = await getClaimVersionsForInvestigation(investigationId);

    expect(result).toHaveLength(1);
    expect(typeof result[0].createdAt).toBe('string');
    const roundTripped = new Date(result[0].createdAt);
    expect(Number.isNaN(roundTripped.getTime())).toBe(false);
    expect(roundTripped.toISOString()).toBe(result[0].createdAt);
  });
});
