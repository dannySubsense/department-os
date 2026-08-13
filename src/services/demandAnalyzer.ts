import { randomUUID } from 'crypto';
import { getEvidenceForInvestigation } from './getEvidenceForInvestigation.js';
import { callForcedTool, LlmValidationError } from './llmClient.js';
import type {
  DemandConfidenceClassificationCandidate,
  DemandConfidenceLevel,
  DemandSignalCandidate,
  DemandSignalType,
  EvidenceItem,
  NonEmptyArray,
} from '../types/domain.js';

const DEMAND_SIGNAL_TYPES: DemandSignalType[] = [
  'recurring-complaints',
  'workarounds',
  'existing-spend',
  'paid-labor',
  'switching-behavior',
  'willingness-to-pay',
  'rfps',
  'feature-requests',
  'other-observed-behavior',
];

const DEMAND_CONFIDENCE_LEVELS: DemandConfidenceLevel[] = ['Insufficient', 'Emerging', 'Substantiated'];

export interface DemandAnalysisResult {
  demandSignalCandidates: DemandSignalCandidate[];
  demandConfidenceClassificationCandidate: DemandConfidenceClassificationCandidate;
  /** Mirrors Slice 4's `ExtractionResult.generationFailed` — set only on infra/LLM failure or the
   *  total absence of evidence to analyze, not on a legitimate zero-demand-signals finding (that
   *  case is a normal, successful result: empty `demandSignalCandidates` + `Insufficient` level +
   *  a populated `negativeFindingSignal`). */
  generationFailed: boolean;
  generationFailureReason?: string;
}

// ---- Raw (unvalidated-beyond-shape) shapes the model's tool call returns ----

interface RawDemandSignal {
  type: string;
  otherTypeLabel?: string;
  evidenceIndices: number[];
}

interface RawDemandConfidenceClassification {
  level: string;
  narrative: string;
  citedSignalIndices: number[];
}

interface RawDemandAnalysis {
  demandSignals: RawDemandSignal[];
  confidenceClassification: RawDemandConfidenceClassification;
}

const TOOL_NAME = 'analyze_demand';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    demandSignals: {
      type: 'array',
      description:
        'Zero or more observed demand signals found in the evidence. Only record a signal when ' +
        'the evidence actually shows one of the named behaviors — do not invent signals to avoid ' +
        'an empty array; an empty array is a valid, expected result when the evidence establishes ' +
        'no demand.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: DEMAND_SIGNAL_TYPES },
          otherTypeLabel: {
            type: 'string',
            description: "Required when type is 'other-observed-behavior'; omit otherwise.",
          },
          evidenceIndices: {
            type: 'array',
            minItems: 1,
            items: { type: 'integer' },
            description:
              'Indices into the EVIDENCE array (below) that establish this signal. Must cite at ' +
              'least one piece of evidence — never leave this empty.',
          },
        },
        required: ['type', 'evidenceIndices'],
      },
    },
    confidenceClassification: {
      type: 'object',
      description:
        'Exactly one qualitative demand-confidence classification for this Investigation, never a ' +
        'numeric score.',
      properties: {
        level: { type: 'string', enum: DEMAND_CONFIDENCE_LEVELS },
        narrative: {
          type: 'string',
          description:
            'Explain which signals (by evidenceIndices/type) or gaps in the evidence drove this ' +
            'classification. If no demand signals were found, explain that absence here.',
        },
        citedSignalIndices: {
          type: 'array',
          items: { type: 'integer' },
          description:
            'Indices into the demandSignals array above that specifically drove this ' +
            'classification. May be empty — e.g. when no signals were found, or when the ' +
            'classification rests on the absence/weakness of signals rather than any specific one.',
        },
      },
      required: ['level', 'narrative', 'citedSignalIndices'],
    },
  },
  required: ['demandSignals', 'confidenceClassification'],
} as const;

function isDemandSignalType(value: unknown): value is DemandSignalType {
  return typeof value === 'string' && (DEMAND_SIGNAL_TYPES as readonly string[]).includes(value);
}

function isDemandConfidenceLevel(value: unknown): value is DemandConfidenceLevel {
  return typeof value === 'string' && (DEMAND_CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

/** Structural/enum validation only (R-4) — resolving evidenceIndices/citedSignalIndices against
 *  the actual evidence/signal arrays, and the resulting non-empty-citation fail-closed filtering,
 *  is handled as a separate post-processing step in `analyzeDemand`, matching
 *  `extractClaimsAndEvidence`'s stated rationale for the same split. */
function validateRawDemandAnalysis(
  input: unknown,
): { valid: true; value: RawDemandAnalysis } | { valid: false; error: string } {
  if (typeof input !== 'object' || input === null) {
    return { valid: false, error: 'tool input is not an object' };
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.demandSignals)) {
    return { valid: false, error: 'demandSignals is not an array' };
  }
  for (let i = 0; i < obj.demandSignals.length; i++) {
    const s = obj.demandSignals[i] as Record<string, unknown>;
    if (!isDemandSignalType(s?.type)) {
      return { valid: false, error: `demandSignals[${i}].type "${String(s?.type)}" is not a valid DemandSignalType` };
    }
    if (s.type === 'other-observed-behavior' && (typeof s.otherTypeLabel !== 'string' || s.otherTypeLabel.length === 0)) {
      return { valid: false, error: `demandSignals[${i}].otherTypeLabel is required when type is 'other-observed-behavior'` };
    }
    if (!Array.isArray(s?.evidenceIndices) || s.evidenceIndices.length === 0) {
      return { valid: false, error: `demandSignals[${i}].evidenceIndices must be a non-empty array` };
    }
    for (const idx of s.evidenceIndices) {
      if (typeof idx !== 'number') {
        return { valid: false, error: `demandSignals[${i}].evidenceIndices contains a non-numeric index` };
      }
    }
  }

  const cc = obj.confidenceClassification as Record<string, unknown> | undefined;
  if (typeof cc !== 'object' || cc === null) {
    return { valid: false, error: 'confidenceClassification is not an object' };
  }
  if (!isDemandConfidenceLevel(cc.level)) {
    return { valid: false, error: `confidenceClassification.level "${String(cc.level)}" is not a valid DemandConfidenceLevel` };
  }
  if (typeof cc.narrative !== 'string' || cc.narrative.length === 0) {
    return { valid: false, error: 'confidenceClassification.narrative is missing/invalid' };
  }
  if (!Array.isArray(cc.citedSignalIndices)) {
    return { valid: false, error: 'confidenceClassification.citedSignalIndices is not an array' };
  }
  for (const idx of cc.citedSignalIndices) {
    if (typeof idx !== 'number') {
      return { valid: false, error: 'confidenceClassification.citedSignalIndices contains a non-numeric index' };
    }
  }

  return { valid: true, value: obj as unknown as RawDemandAnalysis };
}

function buildUserPrompt(evidenceItems: EvidenceItem[]): string {
  const evidenceBlock = evidenceItems
    .map((e, i) => `[${i}] (sourceArtifactId=${e.sourceArtifactId}, label=${e.label}) ${e.excerptOrSummary}`)
    .join('\n');

  return (
    `Analyze the following evidence, extracted from an Investigation's sources, for market/demand ` +
    `signals — evidence that people actually want, need, or are already acting on a solution to ` +
    `this problem.\n\n` +
    `EVIDENCE:\n${evidenceBlock}\n\n` +
    `Instructions:\n` +
    `- Tag every observed demand signal against exactly one of the named types: ` +
    `${DEMAND_SIGNAL_TYPES.join(', ')}. Use 'other-observed-behavior' with an otherTypeLabel only ` +
    `when a genuine demand behavior is present but does not fit the other eight.\n` +
    `- Do NOT record Personal Pull content as a demand signal — personal motivation, founder ` +
    `passion, or "I want to build this" framing is not market demand and must be excluded here ` +
    `entirely, even if it is the only content present.\n` +
    `- Every signal must cite at least one evidenceIndex — never propose a signal with zero cited ` +
    `evidence.\n` +
    `- Produce exactly one confidenceClassification: 'Insufficient' | 'Emerging' | 'Substantiated'. ` +
    `This must be a qualitative judgment only — never invent or imply a numeric score. If you ` +
    `quote a number FROM the evidence itself (e.g. "3 customers mentioned this"), that is fine; ` +
    `authoring your own evaluative score is not.\n` +
    `- The narrative must explain which signals (or which gaps/absences in the evidence) drove the ` +
    `classification. If no demand signals were found at all, say so explicitly and classify as ` +
    `'Insufficient'.\n` +
    `- citedSignalIndices should list only the signals that specifically drove the classification — ` +
    `it is legitimate and expected to leave this empty when no signals were found, or when the ` +
    `classification rests on general absence/weakness rather than any specific signal.`
  );
}

/** Demand Analyzer (Architecture §2 component table; Roadmap Slice 5). Reads an Investigation's
 *  `EvidenceItem`s (persisted by Slice 4) via the LLM, forced tool-use, and produces zero-or-more
 *  `DemandSignalCandidate`s plus exactly one `DemandConfidenceClassificationCandidate`. Does not
 *  persist anything — Brief-scoped entities are candidate-only until Slice 9 (roadmap correction,
 *  "Slice 4/5-7 — ProblemStatement/candidate persistence timing", generalized to this slice's
 *  entities per Danny's binding resolution).
 *
 *  Fail-closed per-signal filtering (same discipline as `extractClaimsAndEvidence`): a demand
 *  signal whose evidenceIndices resolve to zero valid evidence items (out-of-range index, or an
 *  index the model invented) is dropped entirely, not persisted-with-empty-citations — this is the
 *  R-4 enforcement point for `DemandSignal.evidenceItemIds`' non-empty contract, since the
 *  candidate is never written to the DB for a schema constraint to catch it. `citedSignalIndices`
 *  on the confidence classification is resolved against the SURVIVING (post-filter) signal list —
 *  an index pointing at a dropped signal is silently omitted, since that signal no longer exists to
 *  cite.
 *
 *  `negativeFindingSignal` trigger (Architecture §3 / roadmap, PR-review re-review correction):
 *  populated if and only if the surviving `demandSignalCandidates` array is empty AND the run did
 *  not fail (`generationFailed === false`) — never derived from `level` or from
 *  `citedDemandSignalIds` being empty, and never populated on any `generationFailed: true` path
 *  (a failed run has an unknown signal set, not a confirmed-empty one). */
export async function analyzeDemand(investigationId: string): Promise<DemandAnalysisResult> {
  // F-1: the entire operation — including the evidence read below — is wrapped in this outer
  // try/catch, mirroring extractClaimsAndEvidence.ts's pattern, so ANY unexpected error (DB read
  // failure, LLM API error, etc.) converts to a clean `generationFailed: true` result instead of
  // an unhandled throw.
  try {
    const evidenceItems = await getEvidenceForInvestigation(investigationId);

    if (evidenceItems.length === 0) {
      return {
        demandSignalCandidates: [],
        demandConfidenceClassificationCandidate: {
          level: 'Insufficient',
          narrative: 'No evidence is available for this Investigation — demand cannot be assessed.',
          citedDemandSignalIds: [],
          // F-3: negativeFindingSignal must stay unset on generationFailed:true paths — a failed
          // run has an UNKNOWN signal set, not a confirmed-empty one.
        },
        generationFailed: true,
        generationFailureReason: 'No EvidenceItem is available for this Investigation — demand analysis cannot run.',
      };
    }

    let raw: RawDemandAnalysis;
    try {
      const result = await callForcedTool<RawDemandAnalysis>({
        systemPrompt:
          'You are the Demand Analyzer for Department OS Problem Department. You classify evidence ' +
          'for observed market-demand signals and produce a qualitative demand-confidence ' +
          'classification, strictly via the provided tool call — never respond in free text. You ' +
          'never treat personal motivation/founder-passion framing as a demand signal.',
        userPrompt: buildUserPrompt(evidenceItems),
        toolName: TOOL_NAME,
        toolDescription: 'Record observed demand signals and a qualitative demand-confidence classification.',
        inputSchema: INPUT_SCHEMA,
        validate: validateRawDemandAnalysis,
      });
      raw = result.value;
    } catch (err) {
      if (err instanceof LlmValidationError) {
        return {
          demandSignalCandidates: [],
          demandConfidenceClassificationCandidate: {
            level: 'Insufficient',
            narrative: 'Demand analysis failed schema validation after bounded repair.',
            citedDemandSignalIds: [],
            // F-3: negativeFindingSignal must stay unset on generationFailed:true paths — a failed
            // run has an UNKNOWN signal set, not a confirmed-empty one.
          },
          generationFailed: true,
          generationFailureReason: `Demand analysis failed schema validation after bounded repair: ${err.message}`,
        };
      }
      throw err;
    }

    const evidenceIds = evidenceItems.map((e) => e.id);
    const knownEvidenceIndex = (idx: number): string | undefined =>
      idx >= 0 && idx < evidenceIds.length ? evidenceIds[idx] : undefined;

    // Fail-closed per-signal filter: drop any signal whose evidenceIndices resolve to zero valid
    // evidence items. Track surviving-signal-index -> candidate for citedSignalIndices resolution.
    const survivingCandidates: Array<DemandSignalCandidate | null> = [];
    for (const s of raw.demandSignals) {
      const resolvedIds = Array.from(
        new Set(s.evidenceIndices.map(knownEvidenceIndex).filter((id): id is string => id !== undefined)),
      );
      if (resolvedIds.length === 0) {
        survivingCandidates.push(null);
        continue;
      }
      survivingCandidates.push({
        localId: randomUUID(),
        type: s.type as DemandSignalType,
        otherTypeLabel: s.type === 'other-observed-behavior' ? s.otherTypeLabel : undefined,
        evidenceItemIds: resolvedIds as NonEmptyArray<string>,
      });
    }

    const demandSignalCandidates = survivingCandidates.filter((c): c is DemandSignalCandidate => c !== null);

    // F-2: if the model proposed one or more demand signals but per-entity fail-closed filtering
    // dropped ALL of them (e.g. every signal cited only invalid/hallucinated evidenceIndices), the
    // model's confidenceClassification narrative/level was built against signals that no longer
    // exist — it cannot be trusted or reconstructed. Treat this as a generation failure rather than
    // silently proceeding with a confident, populated result. This is distinct from the legitimate
    // case where the model itself proposed zero signals (raw.demandSignals.length === 0), which is
    // a normal, successful "no demand" finding.
    if (raw.demandSignals.length > 0 && demandSignalCandidates.length === 0) {
      return {
        demandSignalCandidates: [],
        demandConfidenceClassificationCandidate: {
          level: 'Insufficient',
          narrative:
            'Demand analysis proposed demand signals, but all of them cited only invalid or ' +
            'unresolvable evidence and were dropped by fail-closed validation — the resulting ' +
            'classification could not be trusted and was discarded.',
          citedDemandSignalIds: [],
          // F-3: negativeFindingSignal must stay unset on generationFailed:true paths — a failed
          // run has an UNKNOWN signal set, not a confirmed-empty one.
        },
        generationFailed: true,
        generationFailureReason:
          'All proposed demand signals were dropped by fail-closed per-entity evidence validation ' +
          '(every signal cited only invalid/unresolvable evidenceIndices) — the confidence ' +
          'classification could not be trusted and demand analysis is treated as failed.',
      };
    }

    const citedDemandSignalIds = Array.from(
      new Set(
        raw.confidenceClassification.citedSignalIndices
          .map((idx) => survivingCandidates[idx])
          .filter((c): c is DemandSignalCandidate => c != null)
          .map((c) => c.localId),
      ),
    );

    const demandConfidenceClassificationCandidate: DemandConfidenceClassificationCandidate = {
      level: raw.confidenceClassification.level as DemandConfidenceLevel,
      narrative: raw.confidenceClassification.narrative,
      citedDemandSignalIds,
      negativeFindingSignal:
        demandSignalCandidates.length === 0
          ? {
              statement:
                'No demand signals were found in the reachable source material for this Investigation.',
            }
          : undefined,
    };

    return {
      demandSignalCandidates,
      demandConfidenceClassificationCandidate,
      generationFailed: false,
    };
  } catch (err) {
    return {
      demandSignalCandidates: [],
      demandConfidenceClassificationCandidate: {
        level: 'Insufficient',
        narrative: 'Demand analysis failed with an unexpected error.',
        citedDemandSignalIds: [],
        // F-3: negativeFindingSignal must stay unset on generationFailed:true paths — a failed
        // run has an UNKNOWN signal set, not a confirmed-empty one.
      },
      generationFailed: true,
      generationFailureReason: `Demand analysis failed with an unexpected error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
