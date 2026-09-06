# MAX_REPAIR_ATTEMPTS and MAX_OUTPUT_TOKENS — Real Measurement Attempt

**Constants under audit:** `MAX_REPAIR_ATTEMPTS = 1` and `MAX_OUTPUT_TOKENS = 8192`
(`src/services/llmClient.ts`)
**Attempted:** 2026-09-05
**Governing rule:** DDR-0002 (`docs/decisions/DDR-0002-constant-integrity-no-fourth-option.md`)

**Finding, stated up front:** **the data does not exist.** The pipeline's own persisted
LLM-attempt history — the one candidate real precedent named in `llmClient.ts`'s own comment — is
**empty**: zero generation runs, zero generation steps, zero recorded attempts, zero token-usage
records. Neither constant can be sourced from it today. This is not a search that failed; it is a
corpus that has never been written to. Both constants remain **unsourced**, and this document
records exactly what was checked, the reproducible query that checks it, and precisely what real
data would resolve each one.

---

## Where this data lives (verified against the schema, not assumed)

There is **no** `schema_validation_attempt` table. `SchemaValidationAttempt`
(`src/types/domain.ts`) is persisted as JSON by `src/services/provenanceRecorder.ts` into:

```
generation_step.step_data -> 'validationRecords' -> [] -> 'attempts' -> []
```

Each attempt object carries `attemptNumber`, `valid`, `validationError`, `startedAt`,
`completedAt`, `modelIdentifier`, and `tokenUsage: { inputTokens, outputTokens }` — which is
exactly the data both constants would need. The schema is capable of answering both questions. It
simply holds no rows.

Database: `deptos_core` on the local dev Postgres (`postgres://deptos:deptos@localhost:55432/deptos_core`,
the default in `src/db/pool.ts`; container `deptos-core-db`). It was verified to be the live
schema — 21 tables present, migrations applied.

---

## Method (reproducible)

Query script: `scripts/query-llm-attempt-history.sql`

```
psql "$DATABASE_URL" -f scripts/query-llm-attempt-history.sql
```

Four queries: corpus size; attempt-number x validity crosstab (Q1, repair-success rate); per-call
attempts-used x final-outcome (Q2); output-token distribution against the 8192 cap (Q3); and count
of real truncation failures, matched on the exact `validationError` phrase `callForcedTool` writes
on `stop_reason === 'max_tokens'` (Q4).

## Result, verbatim, 2026-09-05

```
== corpus size ==
 generation_runs | generation_steps | steps_with_validation_records
-----------------+------------------+-------------------------------
               0 |                0 |                             0

== Q1 (MAX_REPAIR_ATTEMPTS): does the one allowed repair, attempt 2, actually succeed? ==
 attempt_number | valid | n
----------------+-------+---
(0 rows)

== Q2 (MAX_REPAIR_ATTEMPTS): per-call final outcome by attempts used ==
 attempts_used | final_outcome | n
---------------+---------------+---
(0 rows)

== Q3 (MAX_OUTPUT_TOKENS): observed output-token distribution vs the 8192 cap ==
 attempts_with_token_usage | min | mean | p95 | max | attempts_at_or_over_cap
---------------------------+-----+------+-----+-----+-------------------------
                         0 |     |      |     |     |                       0

== Q4 (MAX_OUTPUT_TOKENS): has the cap ever actually been hit? ==
 truncation_failures
---------------------
                   0
```

The queries are syntactically valid and execute successfully — they return nothing because the
tables are empty, not because the query is wrong. The rest of the database is consistent with a
pipeline that has barely run: `source_artifact` holds a single row, and that row is a `type: 'text'`
artifact (130 chars, `content-retrieved`), which bypasses the URL/fetch path entirely.

**`0` truncation failures in Q4 is not evidence that 8192 is sufficient.** It is the same `0` as
every other cell: no calls have been made. A zero drawn from an empty corpus carries no
information, and must not be read as a passing measurement.

---

## Per-constant conclusion

### `MAX_REPAIR_ATTEMPTS = 1` — still unsourced; cannot be sourced yet

The candidate precedent named in the code comment ("whether real schema-validation failures in this
pipeline's own attempt history tend to repair-succeed on attempt 2 or need more") was checked
directly. **No such history exists.** The prior citation chain for this value — 02-ARCHITECTURE.md
§3 quoting a decision text naming "1-2 attempts" — remains what a previous audit found it to be: a
chain terminating in a quote that does not appear verbatim in this repo's doc history. Nothing in
this measurement changes that.

**What would resolve it:** real production or realistic-load runs producing schema-validation
failures, then Q1/Q2 above. The number that decides the constant is the conditional
`P(valid | attemptNumber = 2, attempt 1 invalid)`. If repairs that succeed overwhelmingly succeed
on attempt 2, `1` is sourced. If a material share of eventual successes need attempt 3, `1` is
wrong. **A minimum of some dozens of observed attempt-1 failures is needed before that conditional
means anything** — the exact sample size is itself a decision to make, not a number to assume, and
this document does not set one.

### `MAX_OUTPUT_TOKENS = 8192` — still unsourced; cannot be sourced yet

No output-token measurement exists for any real extraction this pipeline has produced. Zero
attempts carry `tokenUsage`, so there is no distribution to compare against 8192 and no observed
truncation event.

**What would resolve it:** real extraction runs across a realistic spread of source-set sizes, then
Q3/Q4. The decision needs the observed `outputTokens` distribution — specifically its upper tail
(p95/max) as a function of input source-set size — and any real truncation events. If the largest
realistic source set produces outputs comfortably under the cap with headroom, 8192 is sourced; if
the tail approaches it, the cap is a silent correctness risk on exactly the largest, most valuable
inputs. Note this constant is **also** the extraction path's practical ceiling on how much can be
extracted from one call, so "is 8192 sufficient" and "how large a source set is supported" are the
same question.

### Neither constant may carry a named owner

Per DDR-0002 branch (b), an owner may only be named by a human who has genuinely reviewed **that
specific value** against real evidence. There is no real evidence to review. No owner is named here
and none should be written into the code.

---

## What this document is, and is not

It **is** a real, reproducible negative result: the named candidate precedent was checked with a
tracked query against the live schema and found empty.

It is **not** a source, and it does not upgrade either constant. It converts "nobody has looked"
into "someone looked, on 2026-09-05, and the data required does not yet exist" — which is real
information, and which makes the constants' status re-checkable at any time by re-running one
script.
