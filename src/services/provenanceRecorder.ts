import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
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

async function loadStepLog(generationRunId: string, client?: PoolClient): Promise<GenerationStep[]> {
  const runner = client ?? pool;
  const result = await runner.query<GenerationStepRow>(
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

  const result = await pool.query<{ fence_token: number }>(
    `INSERT INTO generation_run
       (id, investigation_id, brief_version_id, outcome, started_at, completed_at,
        runtime_identifier, model_identifiers, tools_invoked)
     VALUES ($1, $2, NULL, 'in-progress', $3, NULL, $4, '{}', '{}')
     RETURNING fence_token`,
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
    fenceToken: result.rows[0].fence_token,
  };
}

/** §1.6 SOL-HIGH-2 — thrown by `assertFenceOwnership` when the caller's `fenceToken` no longer
 *  matches the row's current token, OR the row is no longer `outcome === 'in-progress'` (a fenced-
 *  out or already-terminal run). Every call site treats this identically to
 *  `GenerationRunAlreadyFinalizedError`'s graceful-no-op disposition — caught, logged, and treated
 *  as "this run has been superseded, stop attempting further writes on its behalf." */
export class GenerationRunFencedOutError extends Error {
  constructor(public readonly generationRunId: string) {
    super(`GenerationRun ${generationRunId} is fenced out (stale fence token or no longer in-progress)`);
    this.name = 'GenerationRunFencedOutError';
  }
}

/** §1.6 — thrown by `finalizeGenerationRun`'s atomic guarded UPDATE when `rowCount === 0`: either
 *  another finalizer already won (outcome no longer 'in-progress'), or this call was fenced out
 *  (fence_token no longer matches). Callers do not need to distinguish which — the disposition is
 *  identical either way (see 02-ARCHITECTURE.md §1.6 mechanism (a)/(b)). */
export class GenerationRunAlreadyFinalizedError extends Error {
  constructor(public readonly generationRunId: string) {
    super(`GenerationRun ${generationRunId} was already finalized or has been fenced out`);
    this.name = 'GenerationRunAlreadyFinalizedError';
  }
}

/** §1.6 — the single new guard mechanism, alongside recordGenerationStep/finalizeGenerationRun.
 *  `SELECT ... FOR UPDATE` takes a row lock on `generation_run.id`, closing the check-then-act race:
 *  a concurrent `abandonGenerationRun` fence-increment blocks until this transaction commits or
 *  rolls back, and vice versa. Throws `GenerationRunFencedOutError` when the row is missing, its
 *  `fence_token` no longer matches, OR its `outcome` is no longer `'in-progress'` (SOL-HIGH-2 —
 *  outcome, not id/token alone, since a legitimately-finalized run's fence_token never changes). */
export async function assertFenceOwnership(
  client: PoolClient,
  generationRunId: string,
  fenceToken: number,
): Promise<void> {
  const { rows } = await client.query<{ fence_token: number; outcome: string }>(
    `SELECT fence_token, outcome FROM generation_run WHERE id = $1 FOR UPDATE`,
    [generationRunId],
  );
  if (rows.length === 0 || rows[0].fence_token !== fenceToken || rows[0].outcome !== 'in-progress') {
    throw new GenerationRunFencedOutError(generationRunId);
  }
}

/** §4.2 step 5b — small, new read helper used only by the Generation Run Connector's finalization
 *  safety net: reads the run's REAL persisted `outcome` before that handler decides whether a
 *  best-effort terminal write is needed. Never used to infer anything from an error's class. */
export async function getGenerationRunOutcome(
  generationRunId: string,
): Promise<{ outcome: 'in-progress' | 'succeeded' | 'failed' }> {
  const result = await pool.query<{ outcome: 'in-progress' | 'succeeded' | 'failed' }>(
    `SELECT outcome FROM generation_run WHERE id = $1`,
    [generationRunId],
  );
  if (result.rows.length === 0) {
    throw new Error(`getGenerationRunOutcome: no GenerationRun found for id ${generationRunId}`);
  }
  return { outcome: result.rows[0].outcome };
}

/** Called once per completed OR failed component step, in pipeline order — appends exactly one
 *  entry to the persisted GenerationRun.stepLog (never replaces or reorders existing entries).
 *  `step_index` is computed as one past the current max for this run in the same INSERT
 *  statement, so append order matches true execution order (§1.9 "Ordering guarantee"). */
export async function recordGenerationStep(input: {
  generationRunId: string;
  step: GenerationStep;
  fenceToken: number;
  client?: PoolClient;
}): Promise<void> {
  const runner = input.client ?? pool;

  // §1.6 write-site guard — renews the heartbeat AND the monotonic heartbeat_revision CAS counter
  // (SOL-HIGH-1) in the same statement, only if the caller's fence_token still matches.
  // rowCount === 0: this pipeline has been fenced out — silent no-op, no GenerationStep inserted.
  const heartbeat = await runner.query(
    `UPDATE generation_run SET lease_heartbeat_at = now(), heartbeat_revision = heartbeat_revision + 1
      WHERE id = $1 AND fence_token = $2
    RETURNING id`,
    [input.generationRunId, input.fenceToken],
  );
  if ((heartbeat.rowCount ?? 0) === 0) {
    return;
  }

  const { step } = input;
  const stepData = {
    validationRecords: step.validationRecords,
    toolInvocations: step.toolInvocations,
  };

  await runner.query(
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

/** EXACTLY-ONCE FINALIZATION (Architecture §1.9 point 4, corrected 2026-08-14 — SLICE-09-DESIGN.md
 *  §3 Phase 4 "Finalization contract"): SUCCESS finalizes INSIDE Slice 9's phase-4 assembly
 *  transaction, using the supplied `client` for EVERY read and write it performs — including this
 *  function's own `loadStepLog` call — so the finalize read is consistent with what that same
 *  transaction just wrote, not a separate connection's view (a pool read inside a transaction
 *  cannot see the transaction's own uncommitted rows). FAILURE finalizes AFTER rollback, BEFORE
 *  the rethrow, on its own connection (no `client`). There is no unconditional `finally` anywhere
 *  that finalizes regardless of outcome — both paths above have already finalized exactly once.
 *  Sets completedAt, outcome, briefVersionId, and the computed modelIdentifiers/toolsInvoked union.
 *  Idempotency: calling this twice for the same generationRunId is a programming-error-level
 *  defect — enforced here as a hard assertion, not a silent overwrite. */
export async function finalizeGenerationRun(input: {
  generationRunId: string;
  outcome: 'succeeded' | 'failed';
  briefVersionId: string | null;
  fenceToken: number;
  client?: PoolClient;
}): Promise<GenerationRun> {
  const runner = input.client ?? pool;

  const stepLog = await loadStepLog(input.generationRunId, input.client);

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

  // §1.6 — atomic guarded UPDATE, replacing the prior unguarded SELECT-then-UPDATE. rowCount === 0
  // means either another finalizer already won (outcome no longer 'in-progress') or this call was
  // fenced out (fence_token no longer matches) — both are "I do not own this write anymore."
  const result = await runner.query<{ investigation_id: string; started_at: Date; runtime_identifier: string }>(
    `UPDATE generation_run
        SET outcome = $2, completed_at = $3, brief_version_id = $4,
            model_identifiers = $5, tools_invoked = $6
      WHERE id = $1 AND outcome = 'in-progress' AND fence_token = $7
    RETURNING investigation_id, started_at, runtime_identifier`,
    [
      input.generationRunId,
      input.outcome,
      completedAt,
      input.briefVersionId,
      modelIdentifiers,
      toolsInvoked,
      input.fenceToken,
    ],
  );

  if (result.rowCount === 0) {
    throw new GenerationRunAlreadyFinalizedError(input.generationRunId);
  }

  return {
    id: input.generationRunId,
    investigationId: result.rows[0].investigation_id,
    briefVersionId: input.briefVersionId,
    outcome: input.outcome,
    startedAt: result.rows[0].started_at.toISOString(),
    completedAt,
    runtimeIdentifier: result.rows[0].runtime_identifier,
    modelIdentifiers,
    toolsInvoked,
    stepLog,
    fenceToken: input.fenceToken,
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

/** Shape shared by every Slice 4-7 component result (`DemandAnalysisResult`,
 *  `PersonalPullExtractionResult`, `LandscapeResearchResult`, `GapHypothesisGenerationResult`,
 *  `UncertaintyCompilationResult`, `RecommendationResult`, `ExtractionResult`) — verified against
 *  each component's own `*Result` interface in src/services/*.ts (Slice 8 correction audit): all
 *  seven expose `generationFailed: boolean` and `generationFailureReason?: string`, and none uses
 *  a differently-named modeled-failure field. */
interface ModeledFailureCarrier {
  generationFailed: boolean;
  generationFailureReason?: string;
}

function isModeledFailureCarrier(result: unknown): result is ModeledFailureCarrier {
  return (
    typeof result === 'object' &&
    result !== null &&
    'generationFailed' in result &&
    typeof (result as { generationFailed: unknown }).generationFailed === 'boolean'
  );
}

/** True when the wrapped component RETURNED (did not throw) but reported its own modeled failure
 *  — precondition failure, fail-closed post-filter drop, or an infra/DB error caught by the
 *  component's own outer catch (Slice 8 correction, Architecture §1.9 point 3). This is the gap
 *  the original outcome classification missed: it only inspected whether `fn` threw and whether
 *  any SchemaValidationRecord had `finalOutcome === 'invalid'`, so a `generationFailed: true`
 *  result with no invalid validation attempt was recorded as `outcome: 'succeeded'`. */
function isModeledFailure(result: unknown): result is ModeledFailureCarrier & { generationFailed: true } {
  return isModeledFailureCarrier(result) && result.generationFailed === true;
}

/** Convenience wrapper Slice 9's orchestrator uses around each Slice 4-7 component call — NOT a
 *  new orchestration layer; this only removes the repetitive try/finally + telemetry-collection
 *  boilerplate every call site would otherwise duplicate. Opens a provenanceContext.ts collector
 *  scope around `fn`, so every callForcedTool/searchWeb invocation `fn` triggers is captured; on
 *  return, builds GenerationStep.validationRecords/toolInvocations from the collected invocations
 *  and calls recordGenerationStep. On throw, still calls recordGenerationStep with
 *  outcome: 'failed' and error: the caught message, using whatever partial telemetry was
 *  accumulated before the throw, then rethrows.
 *
 *  Slice 8 correction (retroactive, found during Slice 9 design): all seven Slice 4-7 components
 *  wrap themselves in an outer catch that converts throws into a `generationFailed: true` result,
 *  so this function's `catch` branch is effectively unreachable for real components — the
 *  PRIMARY failure path is `fn` returning normally with `generationFailed: true`. Outcome is now
 *  classified from BOTH sources: a returned `generationFailed: true` result (see
 *  `isModeledFailure`), or any validationRecord with `finalOutcome === 'invalid'`. `error` is
 *  populated from the result's `generationFailureReason` on a modeled failure. `outputRefs` is
 *  no longer inferred from a hardcoded whitelist of known result-shape field names (Composer
 *  ruling, retroactive Slice 8 correction #2 — the whitelist's failure mode was a silent `[]` for
 *  any result shape it didn't recognise, unacceptable in an audit field). Instead every caller
 *  supplies a REQUIRED `getOutputRefs: (result: T) => string[]` callback, mirroring the existing
 *  `inputRefs: string[]` field: each caller maps its OWN component's result shape explicitly, so a
 *  component with no referenceable, already-persisted output ids supplies `() => []` and that
 *  emptiness is a deliberate caller choice, not silent inference. The `catch` branch is kept,
 *  unreduced, for any unexpected throw from outside a component's own boundary; it has no result
 *  to call `getOutputRefs` on, so it still records `outputRefs: []` honestly. */
export async function runStepWithProvenance<T>(input: {
  generationRunId: string;
  component: string;
  inputRefs: string[];
  fn: () => Promise<T>;
  getOutputRefs: (result: T) => string[];
  fenceToken: number;
}): Promise<T> {
  const invocations: CapturedToolInvocation[] = [];
  const collector = { record: (invocation: CapturedToolInvocation) => invocations.push(invocation) };
  const startedAt = new Date().toISOString();

  try {
    const result = await withProvenanceCollector(collector, input.fn);
    const completedAt = new Date().toISOString();
    const validationRecords = buildValidationRecords(invocations);
    const toolInvocations = buildToolInvocations(invocations);
    const modeledFailure = isModeledFailure(result);
    const outcome: GenerationStep['outcome'] =
      modeledFailure || validationRecords.some((r) => r.finalOutcome === 'invalid') ? 'failed' : 'succeeded';

    await recordGenerationStep({
      generationRunId: input.generationRunId,
      step: {
        component: input.component,
        startedAt,
        completedAt,
        outcome,
        error: modeledFailure ? result.generationFailureReason : undefined,
        modelIdentifier: invocations.find((inv) => inv.modelIdentifier)?.modelIdentifier,
        inputRefs: input.inputRefs,
        outputRefs: input.getOutputRefs(result),
        validationRecords: validationRecords.length > 0 ? validationRecords : undefined,
        toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
      },
      fenceToken: input.fenceToken,
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
        // `fn` threw rather than returning a result, so there is no result to derive ids from —
        // honestly empty, not the try branch's unconditional [] (Slice 8 correction, defect 3).
        outputRefs: [],
        validationRecords: validationRecords.length > 0 ? validationRecords : undefined,
        toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
      },
      fenceToken: input.fenceToken,
    });

    throw err;
  }
}
