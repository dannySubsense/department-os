import { AsyncLocalStorage } from 'node:async_hooks';

/** One captured attempt/invocation, generic enough to cover both callForcedTool's schema-validated
 *  attempts and searchWeb's non-schema-validated tool calls (web_search, url-fetch) — see
 *  Architecture §1.9 "searchWeb telemetry". Not every field applies to every invocation kind;
 *  unused fields are omitted, never populated with a placeholder (Research Data Integrity
 *  discipline — no fabricated values). */
export interface CapturedToolInvocation {
  toolName: string; // e.g. 'identify_existing_solutions' (callForcedTool tool name),
  // 'web_search' (searchWeb adapter call), 'url-fetch' (searchWeb per-URL controlled retrieval)
  startedAt: string; // client-captured (DDR-0001 Row 4: API provides no wall-clock timing; this
  // codebase must capture it itself)
  completedAt: string;
  modelIdentifier?: string; // set for LLM-backed invocations (callForcedTool, searchWeb's
  // web_search adapter call which also invokes the model); unset for the pure-HTTP url-fetch
  // invocation
  attemptNumber?: number; // set for callForcedTool attempts (1 = original, 2 = repair); unset for
  // searchWeb invocations (no repair concept there)
  fieldPath?: string; // callForcedTool only — which SchemaValidationRecord this attempt belongs to
  // (mirrors existing SchemaValidationRecord.fieldPath)
  callId?: string; // callForcedTool only — one UUID generated per callForcedTool() invocation,
  // shared by every attempt (original + repair) that call makes. Required for
  // provenanceRecorder.ts's buildValidationRecords to correctly separate two distinct
  // callForcedTool calls to the SAME toolName within one GenerationStep into two
  // SchemaValidationRecords (grouping by toolName alone would wrongly merge them — see
  // Architecture §1.9 point 1 / Slice 8 QC fix). Unset for searchWeb invocations (no call-grouping
  // concept there — each searchWeb invocation is already its own ToolInvocationRecord).
  rawOutput?: unknown; // callForcedTool: the tool-call input as produced. searchWeb: omitted (body
  // content is persisted as SourceArtifact.resolvedContent already — not duplicated here)
  valid?: boolean; // callForcedTool: schema-validation result. searchWeb: unset — see outcome
  // below, a differently-shaped result (3-4 way, not boolean)
  validationError?: string; // callForcedTool only, present iff valid === false
  outcome?: 'retrieved' | 'blocked' | 'failed' | 'query-limited'; // searchWeb only — mirrors
  // WebSearchResult.status plus the adapter-level 'query-limited' case; unset for callForcedTool
  // attempts
  failureReason?: string; // searchWeb only, present iff outcome !== 'retrieved'
  tokenUsage?: { inputTokens: number; outputTokens: number }; // present when the underlying API
  // response included usage data — DDR-0001 Row 4: a provider-rejected request yields no usage
  // data, so this is optional, never defaulted to {0,0} (that would misrepresent "not measured"
  // as "measured zero")
}

export interface ProvenanceCollector {
  record(invocation: CapturedToolInvocation): void;
}

const storage = new AsyncLocalStorage<ProvenanceCollector>();

/** Opens a collection scope for the duration of `fn`. Every `recordToolInvocation` call made by
 *  code running inside `fn` (however deep the call stack — this is the whole point of
 *  AsyncLocalStorage over a passed-down parameter) is routed to `collector`. Nested scopes are not
 *  used by this design (Slice 9 opens exactly one scope per GenerationStep, never nests them). */
export function withProvenanceCollector<T>(
  collector: ProvenanceCollector,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(collector, fn);
}

/** No-op when no collector scope is active (e.g. a direct unit test of demandAnalyzer.ts calling
 *  callForcedTool with no Provenance Recorder involved at all) — this is what makes the
 *  instrumentation inert by default and safe to leave in place at every callForcedTool/searchWeb
 *  call site regardless of whether a caller cares about provenance. */
export function recordToolInvocation(invocation: CapturedToolInvocation): void {
  storage.getStore()?.record(invocation);
}
