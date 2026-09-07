import type { PoolClient } from 'pg';
import type {
  BriefElement,
  BriefVersion,
  DemandConfidenceClassificationCandidate,
  DemandSignalCandidate,
  ExistingSolutionCandidate,
  GapHypothesisCandidate,
  PersonalPullNoteCandidate,
  ProblemStatementCandidate,
  RecommendationCandidate,
  UncertaintyStatementCandidate,
} from '../types/domain.js';

/** Pure persistence helper (SLICE-09-DESIGN.md §1 module plan) — given already-validated
 *  candidates, pre-generated ids, and a DB client already inside a transaction, inserts
 *  `brief_version` FIRST using those pre-generated ids, then every Brief-scoped child row
 *  referencing it (finding 1: FK-satisfiable insert order). No LLM/network calls. Called only
 *  from `generateBriefVersion.ts`'s phase-4 transaction block. */
export interface PersistBriefVersionInput {
  client: PoolClient;
  briefVersionId: string;
  problemBriefId: string;
  versionNumber: number;
  supersedesVersionId: string | null;
  generationRunId: string;

  problemStatementCandidates: ProblemStatementCandidate[];
  problemStatementIds: string[]; // same length/order as problemStatementCandidates

  claimVersionIds: string[]; // union of every cited ClaimVersion id across all problemStatementCandidates

  demandSignalCandidates: DemandSignalCandidate[];
  demandSignalIds: string[]; // same length/order as demandSignalCandidates
  demandConfidenceClassificationCandidate: DemandConfidenceClassificationCandidate;
  demandNegativeFindingId: string | undefined;

  existingSolutionCandidates: ExistingSolutionCandidate[];
  existingSolutionIds: string[]; // same length/order as existingSolutionCandidates

  gapHypothesisCandidates: GapHypothesisCandidate[];
  gapHypothesisIds: string[]; // same length/order as gapHypothesisCandidates

  personalPullNoteCandidates: PersonalPullNoteCandidate[];
  personalPullNoteIds: string[]; // same length/order as personalPullNoteCandidates

  uncertaintyStatementCandidate: UncertaintyStatementCandidate;
  recommendationCandidate: RecommendationCandidate;

  negativeFindings: Array<{ id: string; element: BriefElement; statement: string }>;
}

export async function persistBriefVersion(input: PersistBriefVersionInput): Promise<BriefVersion> {
  const { client } = input;

  // Note: `problem_brief` row creation (version 1 only) is the CALLER's responsibility
  // (generateBriefVersion.ts phase 4) — this function only ever inserts `brief_version` and its
  // children, referencing a `problemBriefId` that already exists by the time this is called.

  // demandSignalCandidate.localId -> pre-generated real DemandSignal id remap, used to translate
  // DemandConfidenceClassificationCandidate.citedDemandSignalIds (SLICE-09-DESIGN.md §3 phase 4).
  const localIdToRealId = new Map<string, string>();
  input.demandSignalCandidates.forEach((c, i) => localIdToRealId.set(c.localId, input.demandSignalIds[i]));

  const demandConfidenceClassification = {
    briefVersionId: input.briefVersionId,
    level: input.demandConfidenceClassificationCandidate.level,
    narrative: input.demandConfidenceClassificationCandidate.narrative,
    citedDemandSignalIds: input.demandConfidenceClassificationCandidate.citedDemandSignalIds
      .map((localId) => localIdToRealId.get(localId))
      .filter((id): id is string => id !== undefined),
    negativeFindingRef: input.demandNegativeFindingId,
  };

  const uncertaintyStatement = {
    briefVersionId: input.briefVersionId,
    whatsUnknown: input.uncertaintyStatementCandidate.whatsUnknown,
    whatWouldChangeConclusion: input.uncertaintyStatementCandidate.whatWouldChangeConclusion,
    whatsUndeterminable: input.uncertaintyStatementCandidate.whatsUndeterminable,
  };

  const recommendation = {
    briefVersionId: input.briefVersionId,
    decision: input.recommendationCandidate.decision,
    rationale: input.recommendationCandidate.rationale,
  };

  await client.query(
    `INSERT INTO brief_version
       (id, problem_brief_id, version_number, supersedes_version_id, generation_run_id,
        problem_statement_ids, claim_version_ids, demand_signal_ids,
        demand_confidence_classification, existing_solution_ids, gap_hypothesis_ids,
        uncertainty_statement, recommendation, personal_pull_note_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      input.briefVersionId,
      input.problemBriefId,
      input.versionNumber,
      input.supersedesVersionId,
      input.generationRunId,
      input.problemStatementIds,
      input.claimVersionIds,
      input.demandSignalIds,
      JSON.stringify(demandConfidenceClassification),
      input.existingSolutionIds,
      input.gapHypothesisIds,
      JSON.stringify(uncertaintyStatement),
      JSON.stringify(recommendation),
      input.personalPullNoteIds,
    ],
  );

  for (let i = 0; i < input.problemStatementCandidates.length; i++) {
    const c = input.problemStatementCandidates[i];
    await client.query(
      `INSERT INTO problem_statement
         (id, brief_version_id, who_experiences_it, context_or_workflow, consequence_or_friction,
          supporting_claim_version_ids)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.problemStatementIds[i],
        input.briefVersionId,
        c.whoExperiencesIt,
        c.contextOrWorkflow,
        c.consequenceOrFriction,
        c.supportingClaimVersionIds,
      ],
    );
  }

  for (let i = 0; i < input.demandSignalCandidates.length; i++) {
    const c = input.demandSignalCandidates[i];
    await client.query(
      `INSERT INTO demand_signal (id, brief_version_id, type, other_type_label, evidence_item_ids)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.demandSignalIds[i], input.briefVersionId, c.type, c.otherTypeLabel ?? null, c.evidenceItemIds],
    );
  }

  for (let i = 0; i < input.personalPullNoteCandidates.length; i++) {
    const c = input.personalPullNoteCandidates[i];
    await client.query(
      `INSERT INTO personal_pull_note (id, brief_version_id, source_artifact_id, text, label)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.personalPullNoteIds[i], input.briefVersionId, c.sourceArtifactId, c.text, c.label],
    );
  }

  for (let i = 0; i < input.existingSolutionCandidates.length; i++) {
    const c = input.existingSolutionCandidates[i];
    await client.query(
      `INSERT INTO existing_solution
         (id, brief_version_id, name, what_it_addresses, how_people_cope_now, where_its_inadequate,
          evidence_item_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.existingSolutionIds[i],
        input.briefVersionId,
        c.name,
        c.whatItAddresses,
        c.howPeopleCopeNow,
        c.whereItsInadequate,
        c.evidenceItemIds,
      ],
    );
  }

  for (let i = 0; i < input.gapHypothesisCandidates.length; i++) {
    const c = input.gapHypothesisCandidates[i];
    await client.query(
      `INSERT INTO gap_hypothesis
         (id, brief_version_id, category, other_category_label, statement, evidence_item_ids)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.gapHypothesisIds[i],
        input.briefVersionId,
        c.category,
        c.otherCategoryLabel ?? null,
        c.statement,
        c.evidenceItemIds,
      ],
    );
  }

  for (const nf of input.negativeFindings) {
    await client.query(
      `INSERT INTO negative_finding (id, brief_version_id, element, statement) VALUES ($1, $2, $3, $4)`,
      [nf.id, input.briefVersionId, nf.element, nf.statement],
    );
  }

  return {
    id: input.briefVersionId,
    problemBriefId: input.problemBriefId,
    versionNumber: input.versionNumber,
    createdAt: new Date().toISOString(), // DB default; caller does not depend on exact value
    supersedesVersionId: input.supersedesVersionId,
    generationRunId: input.generationRunId,
    problemStatementIds: input.problemStatementIds,
    claimVersionIds: input.claimVersionIds,
    demandSignalIds: input.demandSignalIds,
    demandConfidenceClassification,
    existingSolutionIds: input.existingSolutionIds,
    gapHypothesisIds: input.gapHypothesisIds,
    negativeFindings: input.negativeFindings.map((nf) => ({
      id: nf.id,
      briefVersionId: input.briefVersionId,
      element: nf.element,
      statement: nf.statement,
    })),
    uncertaintyStatement,
    recommendation,
    personalPullNoteIds: input.personalPullNoteIds,
  };
}
