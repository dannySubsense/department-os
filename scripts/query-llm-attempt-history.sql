-- Real-precedent queries for MAX_REPAIR_ATTEMPTS and MAX_OUTPUT_TOKENS (DDR-0002 branch (a)).
--
-- Run: psql "$DATABASE_URL" -f scripts/query-llm-attempt-history.sql
--   (local dev default: postgres://deptos:deptos@localhost:55432/deptos_core -- see src/db/pool.ts)
--
-- Per-attempt LLM records are persisted by src/services/provenanceRecorder.ts into
-- generation_step.step_data -> 'validationRecords' -> [] -> 'attempts' -> [], each attempt
-- carrying attemptNumber, valid, validationError, modelIdentifier and tokenUsage
-- {inputTokens, outputTokens} (shape: SchemaValidationAttempt in src/types/domain.ts).
-- There is no dedicated schema_validation_attempt table; this jsonb path is the whole record.

\echo '== corpus size =='
SELECT
  (SELECT count(*) FROM generation_run)  AS generation_runs,
  (SELECT count(*) FROM generation_step) AS generation_steps,
  (SELECT count(*) FROM generation_step
     WHERE step_data ? 'validationRecords')            AS steps_with_validation_records;

\echo ''
\echo '== Q1 (MAX_REPAIR_ATTEMPTS): does the one allowed repair, attempt 2, actually succeed? =='
SELECT
  (a->>'attemptNumber')::int          AS attempt_number,
  (a->>'valid')::boolean              AS valid,
  count(*)                            AS n
FROM generation_step gs
CROSS JOIN LATERAL jsonb_array_elements(gs.step_data->'validationRecords') AS vr
CROSS JOIN LATERAL jsonb_array_elements(vr->'attempts')                    AS a
GROUP BY 1, 2
ORDER BY 1, 2;

\echo ''
\echo '== Q2 (MAX_REPAIR_ATTEMPTS): per-call final outcome by attempts used =='
SELECT
  jsonb_array_length(vr->'attempts') AS attempts_used,
  vr->>'finalOutcome'                AS final_outcome,
  count(*)                           AS n
FROM generation_step gs
CROSS JOIN LATERAL jsonb_array_elements(gs.step_data->'validationRecords') AS vr
GROUP BY 1, 2
ORDER BY 1, 2;

\echo ''
\echo '== Q3 (MAX_OUTPUT_TOKENS): observed output-token distribution vs the 8192 cap =='
SELECT
  count(*)                                                      AS attempts_with_token_usage,
  min((a->'tokenUsage'->>'outputTokens')::int)                  AS min_output_tokens,
  round(avg((a->'tokenUsage'->>'outputTokens')::numeric), 1)    AS mean_output_tokens,
  percentile_cont(0.95) WITHIN GROUP (
    ORDER BY (a->'tokenUsage'->>'outputTokens')::int)           AS p95_output_tokens,
  max((a->'tokenUsage'->>'outputTokens')::int)                  AS max_output_tokens,
  count(*) FILTER (WHERE (a->'tokenUsage'->>'outputTokens')::int >= 8192) AS attempts_at_or_over_cap
FROM generation_step gs
CROSS JOIN LATERAL jsonb_array_elements(gs.step_data->'validationRecords') AS vr
CROSS JOIN LATERAL jsonb_array_elements(vr->'attempts')                    AS a
WHERE a->'tokenUsage'->>'outputTokens' IS NOT NULL;

\echo ''
\echo '== Q4 (MAX_OUTPUT_TOKENS): has the cap ever actually been hit? =='
-- callForcedTool writes this exact phrase into validationError on stop_reason = max_tokens.
SELECT count(*) AS truncation_failures
FROM generation_step gs
CROSS JOIN LATERAL jsonb_array_elements(gs.step_data->'validationRecords') AS vr
CROSS JOIN LATERAL jsonb_array_elements(vr->'attempts')                    AS a
WHERE a->>'validationError' LIKE '%truncated at the%token output cap%';
