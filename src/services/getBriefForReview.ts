import { pool } from '../db/pool.js';
import { getAssignedState } from './validityState.js';
import type {
  BriefVersion,
  ClaimVersion,
  ClaimVersionEvidenceRef,
  DemandConfidenceClassification,
  EvidenceItem,
  DemandSignal,
  DemandSignalType,
  ExistingSolution,
  GapHypothesis,
  NegativeFinding,
  NonEmptyArray,
  PersonalPullNote,
  ProblemStatement,
  Recommendation,
  RecommendationDecision,
  ReconsiderationConditionType,
  UncertaintyStatement,
  AssignedValidityState,
} from '../types/domain.js';

/** Mirrors `02-ARCHITECTURE.md` §4.5's revised `getDecisionsForBriefVersion` return shape —
 *  `DecisionWithResolvedConditions`, restated here rather than imported because
 *  `getDecisionsForBriefVersion.ts` (and migration 010's `decision`/`reconsideration_condition`
 *  tables it reads) do not exist until C2-S5. This slice's own `priorDecisions` is always `[]`
 *  (see doc comment below); C2-S5 replaces this local restatement with a real import when it
 *  wires the real query in, per its own Files entry. */
export interface DecisionWithResolvedConditions {
  id: string;
  briefVersionId: string;
  decision: RecommendationDecision;
  decidedAt: string;
  rationale?: string;
  reconsiderationConditions: Array<{
    type: ReconsiderationConditionType;
    otherTypeLabel?: string;
    description: string;
  }>;
}

/** Thrown only when no `brief_version` row exists for the given id — never for a database,
 *  connection, or query failure, which propagates unchanged. */
export class BriefVersionNotFoundError extends Error {
  constructor(public readonly briefVersionId: string) {
    super(`getBriefForReview: brief version ${briefVersionId} does not exist`);
    this.name = 'BriefVersionNotFoundError';
  }
}

export interface GetBriefForReviewResult {
  version: BriefVersion;
  assignedState: AssignedValidityState;
  isSuperseded: boolean;
  problemStatements: ProblemStatement[];
  claimVersions: Array<
    ClaimVersion & {
      resolvedEvidence: Array<ClaimVersionEvidenceRef & { item: EvidenceItem }>;
      assignedState: AssignedValidityState;
    }
  >;
  demandSignals: DemandSignal[];
  demandConfidence: DemandConfidenceClassification;
  existingSolutions: ExistingSolution[];
  gapHypotheses: GapHypothesis[];
  negativeFindings: NegativeFinding[];
  uncertainty: UncertaintyStatement;
  recommendation: Recommendation;
  personalPullNotes: PersonalPullNote[];
  priorDecisions: DecisionWithResolvedConditions[];
}

interface BriefVersionRow {
  id: string;
  problem_brief_id: string;
  version_number: number;
  created_at: Date;
  supersedes_version_id: string | null;
  generation_run_id: string;
  problem_statement_ids: string[];
  claim_version_ids: string[];
  demand_signal_ids: string[];
  demand_confidence_classification: DemandConfidenceClassification;
  existing_solution_ids: string[];
  gap_hypothesis_ids: string[];
  uncertainty_statement: UncertaintyStatement;
  recommendation: Recommendation;
  personal_pull_note_ids: string[];
}

/** Review Surface (read model) — reused verbatim (field shape) from
 *  `problem-department-mvp/02-ARCHITECTURE.md` §4, per `02-ARCHITECTURE.md` §3.3's pointer.
 *  `assignedState`/`isSuperseded` resolve via real, unconditional calls to `getAssignedState`/the
 *  structural supersession check (§3.3 "No narrowing" — US-12 restored to full scope this
 *  checkpoint). `priorDecisions` returns `[]` unconditionally this slice — `decision`/
 *  `reconsideration_condition` (migration 010) and `getDecisionsForBriefVersion` do not exist
 *  until C2-S5; `[]` is a real, correct answer ("no Decision has ever been recorded, because the
 *  table doesn't exist yet"), not a placeholder masquerading as data. C2-S5 edits this function to
 *  wire the real query in. */
export async function getBriefForReview(briefVersionId: string): Promise<GetBriefForReviewResult> {
  const briefVersionResult = await pool.query<BriefVersionRow>(
    `SELECT id, problem_brief_id, version_number, created_at, supersedes_version_id,
            generation_run_id, problem_statement_ids, claim_version_ids, demand_signal_ids,
            demand_confidence_classification, existing_solution_ids, gap_hypothesis_ids,
            uncertainty_statement, recommendation, personal_pull_note_ids
       FROM brief_version WHERE id = $1`,
    [briefVersionId],
  );
  if (briefVersionResult.rowCount === 0) {
    throw new BriefVersionNotFoundError(briefVersionId);
  }
  const row = briefVersionResult.rows[0];

  const negativeFindingsResult = await pool.query<{
    id: string;
    brief_version_id: string;
    element: NegativeFinding['element'];
    statement: string;
  }>(`SELECT id, brief_version_id, element, statement FROM negative_finding WHERE brief_version_id = $1`, [
    briefVersionId,
  ]);
  const negativeFindings: NegativeFinding[] = negativeFindingsResult.rows.map((r) => ({
    id: r.id,
    briefVersionId: r.brief_version_id,
    element: r.element,
    statement: r.statement,
  }));

  const version: BriefVersion = {
    id: row.id,
    problemBriefId: row.problem_brief_id,
    versionNumber: row.version_number,
    createdAt: row.created_at.toISOString(),
    supersedesVersionId: row.supersedes_version_id,
    generationRunId: row.generation_run_id,
    problemStatementIds: row.problem_statement_ids,
    claimVersionIds: row.claim_version_ids,
    demandSignalIds: row.demand_signal_ids,
    demandConfidenceClassification: row.demand_confidence_classification,
    existingSolutionIds: row.existing_solution_ids,
    gapHypothesisIds: row.gap_hypothesis_ids,
    negativeFindings,
    uncertaintyStatement: row.uncertainty_statement,
    recommendation: row.recommendation,
    personalPullNoteIds: row.personal_pull_note_ids,
  };

  // assignedState — real, unconditional getAssignedState call (§4.7 "Read-side wiring").
  const assignedState = await getAssignedState({ targetType: 'brief-version', targetId: briefVersionId });

  // isSuperseded — structural fact: some other BriefVersion under the same problemBriefId names
  // this one via supersedesVersionId.
  const supersededResult = await pool.query<{ id: string }>(
    `SELECT id FROM brief_version WHERE problem_brief_id = $1 AND supersedes_version_id = $2 LIMIT 1`,
    [row.problem_brief_id, briefVersionId],
  );
  const isSuperseded = (supersededResult.rowCount ?? 0) > 0;

  const problemStatementsResult = await pool.query<{
    id: string;
    brief_version_id: string;
    who_experiences_it: string;
    context_or_workflow: string;
    consequence_or_friction: string;
    supporting_claim_version_ids: string[];
  }>(
    `SELECT id, brief_version_id, who_experiences_it, context_or_workflow, consequence_or_friction,
            supporting_claim_version_ids
       FROM problem_statement WHERE brief_version_id = $1`,
    [briefVersionId],
  );
  const problemStatements: ProblemStatement[] = problemStatementsResult.rows.map((r) => ({
    id: r.id,
    briefVersionId: r.brief_version_id,
    whoExperiencesIt: r.who_experiences_it,
    contextOrWorkflow: r.context_or_workflow,
    consequenceOrFriction: r.consequence_or_friction,
    supportingClaimVersionIds: r.supporting_claim_version_ids as ProblemStatement['supportingClaimVersionIds'],
  }));

  // claimVersions — resolved via version.claimVersionIds, with per-claim resolvedEvidence
  // (ClaimVersionEvidenceRef + the shared EvidenceItem it resolves against) and per-claim
  // assignedState.
  let claimVersions: GetBriefForReviewResult['claimVersions'] = [];
  if (version.claimVersionIds.length > 0) {
    const claimVersionRows = await pool.query<{
      id: string;
      claim_id: string;
      version_number: number;
      created_at: Date;
      text: string;
      supersedes_version_id: string | null;
    }>(
      `SELECT id, claim_id, version_number, created_at, text, supersedes_version_id
         FROM claim_version WHERE id = ANY($1::uuid[])`,
      [version.claimVersionIds],
    );

    const evidenceRows = await pool.query<{
      claim_version_id: string;
      evidence_item_id: string;
      stance: ClaimVersionEvidenceRef['stance'];
      relevance_note: string | null;
      item_source_artifact_id: string;
      item_excerpt_or_summary: string;
      item_label: EvidenceItem['label'];
      item_created_at: Date | null;
    }>(
      `SELECT cve.claim_version_id, cve.evidence_item_id, cve.stance, cve.relevance_note,
              ei.source_artifact_id AS item_source_artifact_id,
              ei.excerpt_or_summary AS item_excerpt_or_summary,
              ei.label AS item_label,
              ei.created_at AS item_created_at
         FROM claim_version_evidence cve
         JOIN evidence_item ei ON ei.id = cve.evidence_item_id
        WHERE cve.claim_version_id = ANY($1::uuid[])
        ORDER BY cve.claim_version_id ASC, cve.evidence_item_id ASC`,
      [version.claimVersionIds],
    );

    const evidenceByClaimVersionId = new Map<
      string,
      Array<ClaimVersionEvidenceRef & { item: EvidenceItem }>
    >();
    for (const r of evidenceRows.rows) {
      const list = evidenceByClaimVersionId.get(r.claim_version_id) ?? [];
      list.push({
        evidenceItemId: r.evidence_item_id,
        stance: r.stance,
        relevanceNote: r.relevance_note ?? undefined,
        item: {
          id: r.evidence_item_id,
          sourceArtifactId: r.item_source_artifact_id,
          excerptOrSummary: r.item_excerpt_or_summary,
          label: r.item_label,
          createdAt: r.item_created_at?.toISOString(),
        },
      });
      evidenceByClaimVersionId.set(r.claim_version_id, list);
    }

    claimVersions = await Promise.all(
      claimVersionRows.rows.map(async (r) => ({
        id: r.id,
        claimId: r.claim_id,
        versionNumber: r.version_number,
        createdAt: r.created_at.toISOString(),
        text: r.text,
        evidence: (evidenceByClaimVersionId.get(r.id) ?? []) as unknown as ClaimVersion['evidence'],
        supersedesVersionId: r.supersedes_version_id,
        resolvedEvidence: evidenceByClaimVersionId.get(r.id) ?? [],
        assignedState: await getAssignedState({ targetType: 'claim-version', targetId: r.id }),
      })),
    );
  }

  const demandSignalsResult = await pool.query<{
    id: string;
    brief_version_id: string;
    type: DemandSignalType;
    other_type_label: string | null;
    evidence_item_ids: string[];
  }>(
    `SELECT id, brief_version_id, type, other_type_label, evidence_item_ids
       FROM demand_signal WHERE brief_version_id = $1`,
    [briefVersionId],
  );
  const demandSignals: DemandSignal[] = demandSignalsResult.rows.map((r) => ({
    id: r.id,
    briefVersionId: r.brief_version_id,
    type: r.type,
    otherTypeLabel: r.other_type_label ?? undefined,
    evidenceItemIds: r.evidence_item_ids as NonEmptyArray<string>,
  }));

  const existingSolutionsResult = await pool.query<{
    id: string;
    brief_version_id: string;
    name: string;
    what_it_addresses: string;
    how_people_cope_now: string;
    where_its_inadequate: string;
    evidence_item_ids: string[];
  }>(
    `SELECT id, brief_version_id, name, what_it_addresses, how_people_cope_now, where_its_inadequate,
            evidence_item_ids
       FROM existing_solution WHERE brief_version_id = $1`,
    [briefVersionId],
  );
  const existingSolutions: ExistingSolution[] = existingSolutionsResult.rows.map((r) => ({
    id: r.id,
    briefVersionId: r.brief_version_id,
    name: r.name,
    whatItAddresses: r.what_it_addresses,
    howPeopleCopeNow: r.how_people_cope_now,
    whereItsInadequate: r.where_its_inadequate,
    evidenceItemIds: r.evidence_item_ids as ExistingSolution['evidenceItemIds'],
  }));

  const gapHypothesesResult = await pool.query<{
    id: string;
    brief_version_id: string;
    category: GapHypothesis['category'];
    other_category_label: string | null;
    statement: string;
    evidence_item_ids: string[];
  }>(
    `SELECT id, brief_version_id, category, other_category_label, statement, evidence_item_ids
       FROM gap_hypothesis WHERE brief_version_id = $1`,
    [briefVersionId],
  );
  const gapHypotheses: GapHypothesis[] = gapHypothesesResult.rows.map((r) => ({
    id: r.id,
    briefVersionId: r.brief_version_id,
    category: r.category,
    otherCategoryLabel: r.other_category_label ?? undefined,
    statement: r.statement,
    evidenceItemIds: r.evidence_item_ids as GapHypothesis['evidenceItemIds'],
  }));

  const personalPullNotesResult = await pool.query<{
    id: string;
    brief_version_id: string;
    source_artifact_id: string;
    text: string;
    label: 'contextual-motivation';
  }>(
    `SELECT id, brief_version_id, source_artifact_id, text, label
       FROM personal_pull_note WHERE brief_version_id = $1`,
    [briefVersionId],
  );
  const personalPullNotes: PersonalPullNote[] = personalPullNotesResult.rows.map((r) => ({
    id: r.id,
    briefVersionId: r.brief_version_id,
    sourceArtifactId: r.source_artifact_id,
    text: r.text,
    label: r.label,
  }));

  return {
    version,
    assignedState,
    isSuperseded,
    problemStatements,
    claimVersions,
    demandSignals,
    demandConfidence: row.demand_confidence_classification,
    existingSolutions,
    gapHypotheses,
    negativeFindings,
    uncertainty: row.uncertainty_statement,
    recommendation: row.recommendation,
    personalPullNotes,
    priorDecisions: [],
  };
}
