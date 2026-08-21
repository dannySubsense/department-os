import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import type { ClaimVersion, ClaimVersionEvidenceRef } from '../types/domain.js';

/** New read helper (Architecture §1.8, Slice 7 design gap): the Uncertainty Compiler needs
 *  `ClaimVersion` rows (with their embedded, stance-carrying `evidence` array) back out for an
 *  Investigation to detect unresolved contradictions — neither `getEvidenceForInvestigation`
 *  (flat `EvidenceItem[]`, no claim/stance context) nor any other existing helper exposes this.
 *  Same helper pattern/shape as `getEvidenceForInvestigation.ts` (Slice 5): scopes `ClaimVersion`
 *  rows to one Investigation by joining claim_version_evidence -> evidence_item -> source_artifact,
 *  mirroring the investigation-scoping approach 004_claims_and_evidence.sql's own comment documents
 *  for `Claim` (which carries no investigation_id column of its own). Denormalizes each
 *  ClaimVersion's evidence array exactly as `ClaimVersion`/`ClaimVersionEvidenceRef` (Architecture
 *  §3) already specify. Accepts an optional in-transaction `PoolClient`, defaulting to the pool. */
export async function getClaimVersionsForInvestigation(
  investigationId: string,
  client?: PoolClient,
): Promise<ClaimVersion[]> {
  const runner = client ?? pool;

  const claimVersionRows = await runner.query<{
    id: string;
    claim_id: string;
    version_number: number;
    created_at: Date;
    text: string;
    supersedes_version_id: string | null;
  }>(
    `SELECT DISTINCT cv.id, cv.claim_id, cv.version_number, cv.created_at, cv.text,
            cv.supersedes_version_id
     FROM claim_version cv
     JOIN claim_version_evidence cve ON cve.claim_version_id = cv.id
     JOIN evidence_item ei ON ei.id = cve.evidence_item_id
     JOIN source_artifact sa ON sa.id = ei.source_artifact_id
     WHERE sa.investigation_id = $1
     ORDER BY cv.id ASC`,
    [investigationId],
  );

  if (claimVersionRows.rows.length === 0) {
    return [];
  }

  const claimVersionIds = claimVersionRows.rows.map((r) => r.id);
  // Scoped to the SAME investigation as the first query (not just claim_version_id) — EvidenceItem
  // is shared/cross-referenceable across Investigations per the domain model, so a ClaimVersion's
  // evidence rows can legitimately span multiple Investigations. Without this join/filter, evidence
  // cited only in a different Investigation would leak into this Investigation's denormalized
  // `evidence` array and could feed uncertaintyCompiler.ts a foreign contradiction (QC BLOCKER-1).
  const evidenceRows = await runner.query<{
    claim_version_id: string;
    evidence_item_id: string;
    stance: 'supporting' | 'contradicting' | 'neutral-context';
    relevance_note: string | null;
  }>(
    `SELECT cve.claim_version_id, cve.evidence_item_id, cve.stance, cve.relevance_note
     FROM claim_version_evidence cve
     JOIN evidence_item ei ON ei.id = cve.evidence_item_id
     JOIN source_artifact sa ON sa.id = ei.source_artifact_id
     WHERE cve.claim_version_id = ANY($1::uuid[])
       AND sa.investigation_id = $2
     ORDER BY cve.claim_version_id ASC, cve.evidence_item_id ASC`,
    [claimVersionIds, investigationId],
  );

  const evidenceByClaimVersionId = new Map<string, ClaimVersionEvidenceRef[]>();
  for (const row of evidenceRows.rows) {
    const refs = evidenceByClaimVersionId.get(row.claim_version_id) ?? [];
    refs.push({
      evidenceItemId: row.evidence_item_id,
      stance: row.stance,
      relevanceNote: row.relevance_note ?? undefined,
    });
    evidenceByClaimVersionId.set(row.claim_version_id, refs);
  }

  return claimVersionRows.rows.map((r) => {
    const evidence = evidenceByClaimVersionId.get(r.id) ?? [];
    // Every ClaimVersion is joined into claimVersionRows via at least one claim_version_evidence
    // row above, so `evidence` is guaranteed non-empty here — cast to the NonEmptyArray contract
    // (ClaimVersion.evidence, Architecture §3) rather than widening the type.
    return {
      id: r.id,
      claimId: r.claim_id,
      versionNumber: r.version_number,
      createdAt: r.created_at.toISOString(),
      text: r.text,
      evidence: evidence as ClaimVersion['evidence'],
      supersedesVersionId: r.supersedes_version_id,
    };
  });
}
