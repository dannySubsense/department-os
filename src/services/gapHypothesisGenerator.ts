import { callForcedTool, LlmValidationError } from './llmClient.js';
import type {
  DemandConfidenceClassificationCandidate,
  DemandSignalCandidate,
  EvidenceItem,
  ExistingSolutionCandidate,
  GapCategory,
  GapHypothesisCandidate,
  NonEmptyArray,
} from '../types/domain.js';

const GAP_CATEGORIES: GapCategory[] = [
  'capability',
  'usability',
  'price',
  'workflow-fit',
  'trust',
  'integration',
  'accessibility',
  'distribution',
  'other',
];

// ---- Raw (unvalidated-beyond-shape) shape the model's tool call returns ----

interface RawGapHypothesis {
  category: string;
  otherCategoryLabel?: string;
  statement: string;
  evidenceIndices: number[];
}

interface RawGapHypotheses {
  gapHypotheses: RawGapHypothesis[];
}

const TOOL_NAME = 'identify_gap_hypotheses';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    gapHypotheses: {
      type: 'array',
      description:
        'Zero or more falsifiable gap hypotheses — specific claims about what is missing from ' +
        'existing solutions, given the evidence and demand context. An empty array is a valid, ' +
        'expected result when no gap is established — do not invent one to avoid an empty array.',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: GAP_CATEGORIES },
          otherCategoryLabel: {
            type: 'string',
            description: "Required when category is 'other'; omit otherwise.",
          },
          statement: {
            type: 'string',
            description: 'A specific, falsifiable claim about what is missing.',
          },
          evidenceIndices: {
            type: 'array',
            minItems: 1,
            items: { type: 'integer' },
            description:
              'Indices into the EVIDENCE array (below) that establish this gap. Must cite at ' +
              'least one piece of evidence — never leave this empty.',
          },
        },
        required: ['category', 'statement', 'evidenceIndices'],
      },
    },
  },
  required: ['gapHypotheses'],
} as const;

function isGapCategory(value: unknown): value is GapCategory {
  return typeof value === 'string' && (GAP_CATEGORIES as readonly string[]).includes(value);
}

/** Structural/enum validation only (R-4) — resolving evidenceIndices against the actual evidence
 *  array, and the resulting non-empty-citation fail-closed filtering, is handled as a separate
 *  post-processing step below, matching `extractClaimsAndEvidence`/`analyzeDemand`'s stated
 *  rationale for the same split. */
function validateRawGapHypotheses(
  input: unknown,
): { valid: true; value: RawGapHypotheses } | { valid: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: 'tool input is not an object' };
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.gapHypotheses)) {
    return { valid: false, error: 'gapHypotheses is not an array' };
  }
  for (let i = 0; i < obj.gapHypotheses.length; i++) {
    const g = obj.gapHypotheses[i] as Record<string, unknown>;
    if (!isGapCategory(g?.category)) {
      return { valid: false, error: `gapHypotheses[${i}].category "${String(g?.category)}" is not a valid GapCategory` };
    }
    if (g.category === 'other' && (typeof g.otherCategoryLabel !== 'string' || g.otherCategoryLabel.length === 0)) {
      return { valid: false, error: `gapHypotheses[${i}].otherCategoryLabel is required when category is 'other'` };
    }
    if (typeof g?.statement !== 'string' || g.statement.length === 0) {
      return { valid: false, error: `gapHypotheses[${i}].statement is missing/invalid` };
    }
    if (!Array.isArray(g?.evidenceIndices) || g.evidenceIndices.length === 0) {
      return { valid: false, error: `gapHypotheses[${i}].evidenceIndices must be a non-empty array` };
    }
    for (const idx of g.evidenceIndices) {
      if (typeof idx !== 'number') {
        return { valid: false, error: `gapHypotheses[${i}].evidenceIndices contains a non-numeric index` };
      }
    }
  }
  return { valid: true, value: obj as unknown as RawGapHypotheses };
}

function buildUserPrompt(
  existingSolutionCandidates: ExistingSolutionCandidate[],
  allEvidenceItems: EvidenceItem[],
  demandSignalCandidates: DemandSignalCandidate[] | undefined,
  demandConfidenceClassificationCandidate: DemandConfidenceClassificationCandidate | undefined,
): string {
  const evidenceBlock = allEvidenceItems
    .map((e, i) => `[${i}] (sourceArtifactId=${e.sourceArtifactId}, label=${e.label}) ${e.excerptOrSummary}`)
    .join('\n');

  const solutionsBlock =
    existingSolutionCandidates.length > 0
      ? existingSolutionCandidates
          .map(
            (s) =>
              `- ${s.name}: addresses "${s.whatItAddresses}"; people cope now via "${s.howPeopleCopeNow}"; ` +
              `inadequate because "${s.whereItsInadequate}" (evidence: ${s.evidenceItemIds.join(', ')})`,
          )
          .join('\n')
      : 'EXISTING SOLUTIONS: none found.';

  const demandBlock =
    demandSignalCandidates && demandSignalCandidates.length > 0
      ? `DEMAND SIGNALS:\n` +
        demandSignalCandidates
          .map((d) => `- ${d.type}${d.otherTypeLabel ? ` (${d.otherTypeLabel})` : ''}`)
          .join('\n') +
        (demandConfidenceClassificationCandidate
          ? `\nDEMAND CONFIDENCE: ${demandConfidenceClassificationCandidate.level} — ${demandConfidenceClassificationCandidate.narrative}`
          : '')
      : 'DEMAND SIGNALS: none supplied for this run.';

  return (
    `Identify gap hypotheses — specific, falsifiable claims about what is missing from existing ` +
    `solutions — given the existing solutions, evidence, and (if present) demand context below.\n\n` +
    `EXISTING SOLUTIONS:\n${solutionsBlock}\n\n` +
    `${demandBlock}\n\n` +
    `EVIDENCE:\n${evidenceBlock}\n\n` +
    `Instructions:\n` +
    `- Only record a gap hypothesis the evidence actually establishes — an empty array is a valid, ` +
    `expected result when no gap is established.\n` +
    `- Tag each hypothesis with exactly one category: ${GAP_CATEGORIES.join(', ')}. Use 'other' ` +
    `with an otherCategoryLabel only when a genuine gap is present but does not fit the other eight.\n` +
    `- Each statement must be specific and falsifiable, not a vague generality.\n` +
    `- Every hypothesis must cite at least one evidenceIndex into the EVIDENCE array above — never ` +
    `propose one with zero cited evidence. A gap hypothesis may cite evidence that never went ` +
    `through an existing solution (e.g. a direct demand-signal excerpt describing what's missing).`
  );
}

export interface GapHypothesisGenerationResult {
  gapHypothesisCandidates: GapHypothesisCandidate[];
  generationFailed: boolean;
  generationFailureReason?: string;
  /** Populated iff gapHypothesisCandidates is empty AND generationFailed === false — carries what
   *  Slice 9 needs to construct a NegativeFinding row with element: 'gap-hypothesis'. */
  negativeFindingSignal?: { statement: string };
}

export interface GenerateGapHypothesesInput {
  investigationId: string;
  existingSolutionCandidates: ExistingSolutionCandidate[];
  /** All evidence available to reason over — original Investigation evidence plus
   *  landscapeEvidenceItems, i.e. researchLandscape's combined evidence array. A GapHypothesis may
   *  cite evidence that never went through an ExistingSolution (e.g. a direct demand-signal excerpt
   *  describing what's missing). */
  allEvidenceItems: EvidenceItem[];
  /** Optional — present when Slice 5 has already run for this GenerationRun (Provenance Recorder
   *  wiring decision, not this function's concern). Absent, this component still runs: it produces
   *  gap hypotheses from evidence + landscape alone, without a demand cross-reference. */
  demandSignalCandidates?: DemandSignalCandidate[];
  demandConfidenceClassificationCandidate?: DemandConfidenceClassificationCandidate;
}

/** Gap Hypothesis Generator (Architecture §1.7, Roadmap Slice 6). Takes the Landscape Researcher's
 *  output plus OPTIONAL Slice-5 demand candidates as call-time parameters (not an internal fetch —
 *  Slice 8's Provenance Recorder decides when/whether to wire the demand inputs in), and produces
 *  `GapHypothesisCandidate`s via a forced-tool LLM call. Does not persist `GapHypothesis` rows —
 *  candidate-only until Slice 9.
 *
 *  Same F-1 outer try/catch discipline as `analyzeDemand`/`researchLandscape`. Same fail-closed
 *  per-entity citation filter: a hypothesis whose evidenceIndices resolve to zero valid
 *  `allEvidenceItems` entries is dropped; if the model proposed ≥1 hypothesis but the filter drops
 *  all of them, the whole result is `generationFailed: true`, not a confident empty result. */
export async function generateGapHypotheses(
  input: GenerateGapHypothesesInput,
): Promise<GapHypothesisGenerationResult> {
  try {
    const hasDemandInput = !!input.demandSignalCandidates && input.demandSignalCandidates.length > 0;

    if (input.existingSolutionCandidates.length === 0 && !hasDemandInput) {
      return {
        gapHypothesisCandidates: [],
        generationFailed: true,
        generationFailureReason:
          'No existing-solution candidates and no demand-signal input were supplied — there is ' +
          'nothing to reason a gap hypothesis from.',
      };
    }

    let raw: RawGapHypotheses;
    try {
      const result = await callForcedTool<RawGapHypotheses>({
        systemPrompt:
          'You are the Gap Hypothesis Generator for Department OS Problem Department. You propose ' +
          'falsifiable gap hypotheses from existing solutions, evidence, and demand context, ' +
          'strictly via the provided tool call — never respond in free text.',
        userPrompt: buildUserPrompt(
          input.existingSolutionCandidates,
          input.allEvidenceItems,
          input.demandSignalCandidates,
          input.demandConfidenceClassificationCandidate,
        ),
        toolName: TOOL_NAME,
        toolDescription: 'Record identified gap hypotheses.',
        inputSchema: INPUT_SCHEMA,
        validate: validateRawGapHypotheses,
      });
      raw = result.value;
    } catch (err) {
      if (err instanceof LlmValidationError) {
        return {
          gapHypothesisCandidates: [],
          generationFailed: true,
          generationFailureReason: `Gap hypothesis generation failed schema validation after bounded repair: ${err.message}`,
        };
      }
      throw err;
    }

    const evidenceIds = input.allEvidenceItems.map((e) => e.id);
    const resolveIndex = (idx: number): string | undefined =>
      idx >= 0 && idx < evidenceIds.length ? evidenceIds[idx] : undefined;

    const gapHypothesisCandidates: GapHypothesisCandidate[] = [];
    for (const g of raw.gapHypotheses) {
      const resolvedIds = Array.from(
        new Set(g.evidenceIndices.map(resolveIndex).filter((id): id is string => id !== undefined)),
      );
      if (resolvedIds.length === 0) continue;
      gapHypothesisCandidates.push({
        category: g.category as GapCategory,
        otherCategoryLabel: g.category === 'other' ? g.otherCategoryLabel : undefined,
        statement: g.statement,
        evidenceItemIds: resolvedIds as NonEmptyArray<string>,
      });
    }

    // F-2-style rule: if the model proposed ≥1 hypothesis but fail-closed filtering dropped all of
    // them, the result is untrustworthy, not a confident empty finding.
    if (raw.gapHypotheses.length > 0 && gapHypothesisCandidates.length === 0) {
      return {
        gapHypothesisCandidates: [],
        generationFailed: true,
        generationFailureReason:
          'All proposed gap hypotheses were dropped by fail-closed per-entity evidence validation ' +
          '(every hypothesis cited only invalid/unresolvable evidenceIndices).',
      };
    }

    return {
      gapHypothesisCandidates,
      generationFailed: false,
      negativeFindingSignal:
        gapHypothesisCandidates.length === 0
          ? {
              statement:
                'No gap hypotheses were established from the available existing-solution, ' +
                'evidence, and demand context for this Investigation.',
            }
          : undefined,
    };
  } catch (err) {
    return {
      gapHypothesisCandidates: [],
      generationFailed: true,
      generationFailureReason: `Gap hypothesis generation failed with an unexpected error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
