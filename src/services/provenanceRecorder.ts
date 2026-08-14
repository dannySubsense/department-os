import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { withProvenanceCollector, type CapturedToolInvocation } from './provenanceContext.js';
import type {
  GenerationRun,
  GenerationStep,
  SchemaValidationAttempt,
  SchemaValidationRecord,
  ToolInvocationRecord,
} from '../types/domain.js';

/** Provenance Recorder — Architecture §1.9 point 4. Library functions Slice 9's
 *  `generateBriefVersion` orchestrator calls around the real Slice 4-7 pipeline sequence; this
 *  module does not itself decide step order or invoke any Slice 4-7 component (that wiring is
 *  explicitly out of scope for Slice 8 — see §1.9 "Out of scope"). */

interface GenerationStepRow {
  step_index: number;
  component: string;
  started_at: Date;
  completed_at: Date;
  outcome: 'succeeded' | 'failed';
  error: string | null;
  model_identifier: string | null;
  input_refs: string[];
  output_refs: string[];
  step_data: { validationRecords?: SchemaValidationRecord[]; toolInvocations?: ToolInvocationRecord[] };
}

function rowToGenerationStep(row: GenerationStepRow): GenerationStep {
  return {
    component: row.component,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at.toISOString(),
    outcome: row.outcome,
    error: row.error ?? undefined,
    modelIdentifier: row.model_identifier ?? undefined,
    inputRefs: row.input_refs,
    outputRefs: row.output_refs,
    validationRecords: row.step_data.validationRecords,
    toolInvocations: row.step_data.toolInvocations,
  };
}

async function loadStepLog(generationRunId: string): Promise<GenerationStep[]> {
  const result = await pool.query<GenerationStepRow>(
    `SELECT step_index, component, started_at, completed_at, outcome, error, model_identifier,
            input_refs, output_refs, step_data
       FROM generation_step
      WHERE generation_run_id = $1
      ORDER BY step_index ASC`,
    [generationRunId],
  );
  return result.rows.map(rowToGenerationStep);
}

/** Must be called by Slice 9's `generateBriefVersion` BEFORE the first Slice 4 step begins (Danny,
 *  binding) — not after the pipeline completes, and not lazily on first step. Persists a
 *  GenerationRun row immediately with outcome: 'in-progress', stepLog: [], briefVersionId: null. */
export async function createGenerationRun(input: {
  investigationId: string;
  runtimeIdentifier: string;
}): Promise<GenerationRun> {
  const id = randomUUID();
  const startedAt = new Date().toISOString();

  await pool.query(
    `INSERT INTO generation_run
       (id, investigation_id, brief_version_id, outcome, started_at, completed_at,
        runtime_identifier, model_identifiers, tools_invoked)
     VALUES ($1, $2, NULL, 'in-progress', $3, NULL, $4, '{}', '{}')`,
    [id, input.investigationId, startedAt, input.runtimeIdentifier],
  );

  return {
    id,
    investigationId: input.investigationId,
    briefVersionId: null,
    outcome: 'in-progress',
    startedAt,
    completedAt: '', // not meaningful while outcome === 'in-progress' — see GenerationRun doc comment
    runtimeIdentifier: input.runtimeIdentifier,
    modelIdentifiers: [],
    toolsInvoked: [],
    stepLog: [],
  };
}

/** Called once per completed OR failed component step, in pipeline order — appends exactly one
 *  entry to the persisted GenerationRun.stepLog (never replaces or reorders existing entries).
 *  `step_index` is computed as one past the current max for this run in the same INSERT
 *  statement, so append order matches true execution order (§1.9 "Ordering guarantee"). */
export async function recordGenerationStep(input: {
  generationRunId: string;
  step: GenerationStep;
}): Promise<void> {
  const { step } = input;
  const stepData = {
    validationRecords: step.validationRecords,
    toolInvocations: step.toolInvocations,
  };

  await pool.query(
    `INSERT INTO generation_step
       (id, generation_run_id, step_index, component, started_at, completed_at, outcome, error,
        model_identifier, input_refs, output_refs, step_data)
     SELECT $1, $2, COALESCE(MAX(step_index), -1) + 1, $3, $4, $5, $6, $7, $8, $9, $10, $11
       FROM generation_step
      WHERE generation_run_id = $2`,
    [
      randomUUID(),
      input.generationRunId,
      step.component,
      step.startedAt,
      step.completedAt,
      step.outcome,
      step.error ?? null,
      step.modelIdentifier ?? null,
      step.inputRefs,
      step.outputRefs,
      JSON.stringify(stepData),
    ],
  );
}

/** Must be called from Slice 9's `generateBriefVersion` in a finally block wrapping the ENTIRE
 *  pipeline — Danny, binding: "finalize failed runs even when a component throws". Sets
 *  completedAt, outcome, briefVersionId, and the computed modelIdentifiers/toolsInvoked union.
 *  Idempotency: calling this twice for the same generationRunId is a programming-error-level
 *  defect — enforced here as a hard assertion, not a silent overwrite. */
export async function finalizeGenerationRun(input: {
  generationRunId: string;
  outcome: 'succeeded' | 'failed';
  briefVersionId: string | null;
}): Promise<GenerationRun> {
  const existing = await pool.query<{ outcome: string; investigation_id: string; started_at: Date; runtime_identifier: string }>(
    `SELECT outcome, investigation_id, started_at, runtime_identifier FROM generation_run WHERE id = $1`,
    [input.generationRunId],
  );
  if (existing.rows.length === 0) {
    throw new Error(`finalizeGenerationRun: no GenerationRun found for id ${input.generationRunId}`);
  }
  if (existing.rows[0].outcome !== 'in-progress') {
    throw new Error(
      `finalizeGenerationRun: GenerationRun ${input.generationRunId} was already finalized ` +
        `(outcome: ${existing.rows[0].outcome}) — exactly one finalization per run is a hard ` +
        `programming-error-level assertion (Architecture §1.9 point 4)`,
    );
  }

  const stepLog = await loadStepLog(input.generationRunId);

  const modelIdentifiers = Array.from(
    new Set(
      stepLog.flatMap((step) => {
        const attemptModels =
          step.validationRecords?.flatMap((record) => record.attempts.map((a) => a.modelIdentifier)) ?? [];
        const toolInvocationModels =
          step.toolInvocations?.map((t) => t.modelIdentifier).filter((m): m is string => Boolean(m)) ?? [];
        return step.modelIdentifier
          ? [step.modelIdentifier, ...attemptModels, ...toolInvocationModels]
          : [...attemptModels, ...toolInvocationModels];
      }),
    ),
  );

  const toolsInvoked = Array.from(
    new Set(
      stepLog.flatMap((step) => {
        const validationToolNames = step.validationRecords?.map((r) => r.toolName) ?? [];
        const invocationToolNames = step.toolInvocations?.map((t) => t.toolName) ?? [];
        return [...validationToolNames, ...invocationToolNames];
      }),
    ),
  );

  const completedAt = new Date().toISOString();

  await pool.query(
    `UPDATE generation_run
        SET outcome = $2, completed_at = $3, brief_version_id = $4,
            model_identifiers = $5, tools_invoked = $6
      WHERE id = $1`,
    [input.generationRunId, input.outcome, completedAt, input.briefVersionId, modelIdentifiers, toolsInvoked],
  );

  return {
    id: input.generationRunId,
    investigationId: existing.rows[0].investigation_id,
    briefVersionId: input.briefVersionId,
    outcome: input.outcome,
    startedAt: existing.rows[0].started_at.toISOString(),
    completedAt,
    runtimeIdentifier: existing.rows[0].runtime_identifier,
    modelIdentifiers,
    toolsInvoked,
    stepLog,
  };
}

/** Builds the collected CapturedToolInvocation entries from one runStepWithProvenance scope into
 *  GenerationStep.validationRecords (callForcedTool-shaped invocations, i.e. ones carrying `valid`)
 *  and GenerationStep.toolInvocations (searchWeb-shaped invocations, i.e. ones carrying `outcome`).
 *  Attempts are grouped by `callId` (one UUID per real callForcedTool() invocation, shared only by
 *  that call's own attempts — see CapturedToolInvocation.callId doc comment), so two separate
 *  calls to the SAME toolName within one step produce two separate SchemaValidationRecords instead
 *  of being merged into one with a fabricated attempts sequence (Slice 8 QC fix — grouping by
 *  toolName alone could not distinguish two same-tool calls). Falls back to toolName only for
 *  invocations that predate callId being set (defensive; every current callForcedTool call site
 *  always sets it). */
function buildValidationRecords(invocations: CapturedToolInvocation[]): SchemaValidationRecord[] {
  const byCallId = new Map<string, CapturedToolInvocation[]>();
  for (const inv of invocations) {
    if (inv.valid === undefined) continue; // not a callForcedTool-shaped invocation
    const key = inv.callId ?? inv.toolName;
    const group = byCallId.get(key) ?? [];
    group.push(inv);
    byCallId.set(key, group);
  }

  return Array.from(byCallId.values()).map((group) => {
    const toolName = group[0].toolName;
    const attempts: SchemaValidationAttempt[] = group
      .slice()
      .sort((a, b) => (a.attemptNumber ?? 0) - (b.attemptNumber ?? 0))
      .map((inv) => ({
        attemptNumber: inv.attemptNumber ?? 1,
        rawOutput: JSON.stringify(inv.rawOutput),
        valid: inv.valid ?? false,
        validationError: inv.validationError,
        startedAt: inv.startedAt,
        completedAt: inv.completedAt,
        modelIdentifier: inv.modelIdentifier ?? '',
        tokenUsage: inv.tokenUsage,
      }));
    const lastAttempt = attempts[attempts.length - 1];
    return {
      // fieldPath is not supplied by callForcedTool's current call sites (no per-field granularity
      // is captured yet — see domain.ts's SchemaValidationRecord.fieldPath doc comment for what
      // this implementation actually populates it with, honestly redocumented rather than left
      // claiming a schema-field-path semantics it does not have).
      fieldPath: toolName,
      toolName,
      attempts,
      finalOutcome: lastAttempt?.valid ? 'valid' : 'invalid',
    } satisfies SchemaValidationRecord;
  });
}

function buildToolInvocations(invocations: CapturedToolInvocation[]): ToolInvocationRecord[] {
  return invocations
    .filter((inv) => inv.outcome !== undefined)
    .map((inv) => ({
      toolName: inv.toolName,
      startedAt: inv.startedAt,
      completedAt: inv.completedAt,
      outcome: inv.outcome as ToolInvocationRecord['outcome'],
      failureReason: inv.failureReason,
      modelIdentifier: inv.modelIdentifier,
    }));
}

/** Convenience wrapper Slice 9's orchestrator uses around each Slice 4-7 component call — NOT a
 *  new orchestration layer; this only removes the repetitive try/finally + telemetry-collection
 *  boilerplate every call site would otherwise duplicate. Opens a provenanceContext.ts collector
 *  scope around `fn`, so every callForcedTool/searchWeb invocation `fn` triggers is captured; on
 *  return, builds GenerationStep.validationRecords/toolInvocations from the collected invocations
 *  and calls recordGenerationStep. On throw, still calls recordGenerationStep with
 *  outcome: 'failed' and error: the caught message, using whatever partial telemetry was
 *  accumulated before the throw, then rethrows. */
export async function runStepWithProvenance<T>(input: {
  generationRunId: string;
  component: string;
  inputRefs: string[];
  fn: () => Promise<T>;
}): Promise<T> {
  const invocations: CapturedToolInvocation[] = [];
  const collector = { record: (invocation: CapturedToolInvocation) => invocations.push(invocation) };
  const startedAt = new Date().toISOString();

  try {
    const result = await withProvenanceCollector(collector, input.fn);
    const completedAt = new Date().toISOString();
    const validationRecords = buildValidationRecords(invocations);
    const toolInvocations = buildToolInvocations(invocations);
    const outcome: GenerationStep['outcome'] = validationRecords.some((r) => r.finalOutcome === 'invalid')
      ? 'failed'
      : 'succeeded';

    await recordGenerationStep({
      generationRunId: input.generationRunId,
      step: {
        component: input.component,
        startedAt,
        completedAt,
        outcome,
        modelIdentifier: invocations.find((inv) => inv.modelIdentifier)?.modelIdentifier,
        inputRefs: input.inputRefs,
        outputRefs: [],
        validationRecords: validationRecords.length > 0 ? validationRecords : undefined,
        toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
      },
    });

    return result;
  } catch (err) {
    const completedAt = new Date().toISOString();
    const validationRecords = buildValidationRecords(invocations);
    const toolInvocations = buildToolInvocations(invocations);

    await recordGenerationStep({
      generationRunId: input.generationRunId,
      step: {
        component: input.component,
        startedAt,
        completedAt,
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err),
        modelIdentifier: invocations.find((inv) => inv.modelIdentifier)?.modelIdentifier,
        inputRefs: input.inputRefs,
        outputRefs: [],
        validationRecords: validationRecords.length > 0 ? validationRecords : undefined,
        toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
      },
    });

    throw err;
  }
}
