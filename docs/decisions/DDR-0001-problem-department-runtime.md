# DDR-0001: Problem Department MVP — Runtime & Storage Evaluation and Adoption

**Status:** ACCEPTED

**Scope note (binding, per Q-8 / Slice 1 framing discipline):** This is a practical evaluation and
adoption of a runtime and storage technology for **this milestone's own implementation** —
Problem Department MVP, Slice 1 of `docs/specs/problem-department-mvp/04-ROADMAP.md`. It is
**not** a selection of Department OS's permanent runtime or permanent storage platform. It is
explicitly revisable via a future DDR as other modules (Signal Foundry, Prototype Department,
Creative Practice Engine) bring their own requirements to the table.

---

## Context

Per `docs/specs/problem-department-mvp/04-ROADMAP.md` Slice 1, `02-ARCHITECTURE.md` deliberately
selects no agent runtime, database, or framework — Section 6 instead specifies nine required
**capabilities** any candidate runtime/storage combination must provide, and Slice 1's job is to
score real candidates against that table and record the outcome here, before Slice 2 (Core
persistence + Intake Service) can begin.

Section 7 (Integration Points) states that every Section 3 entity is a Department OS **Core**
domain record, evidence record, workflow-state record, or decision record — "a module without
Core underneath it is not a complete vertical slice." This means the storage decision below is not
a Problem-Department-scoped database; it is the first concrete instance of Department OS Core
storage, with Problem Department as its first consumer. It is explicitly **not** the existing LORE
Postgres instance (VM 103) — LORE is a memory/knowledge-capture substrate for agent context, out
of scope for Core's domain-record storage.

Two candidates were spiked and live-tested this session, one per decision axis:

- **Runtime:** Claude Agent SDK / direct Anthropic API (`claude-sonnet-4-5-20250929` or current
  equivalent) using forced tool-use for schema-constrained structured output.
- **Storage:** a dedicated local PostgreSQL instance for Department OS Core, physically separate
  from LORE's instance.

No other runtime or storage candidate was spiked this session. Per G-22 (the Stopping Rule), this
is recorded as a scoring result against the candidates actually tried, not a claim that every
reasonably-available candidate was surveyed.

---

## Decision

Adopt, **for the Problem Department MVP implementation only**:

- **Runtime:** Claude Agent SDK / direct Anthropic API (`claude-sonnet-4-5-20250929` or current
  equivalent), using forced tool-use (JSON-schema-constrained tool calls) as the mechanism for
  schema-constrained structured output, with a client-side validate → repair-once → hard-fail
  control loop (Section 3 `SchemaValidationRecord`, `MAX_REPAIR_ATTEMPTS = 1`, R-4).
- **Storage:** a dedicated local PostgreSQL instance for Department OS Core (Problem Department is
  its first consumer), kept physically and operationally separate from the LORE Postgres instance
  on VM 103.

This decision is scoped to Problem Department MVP Slices 2 onward. It does not bind Signal Foundry,
Prototype Department, Creative Practice Engine, or Mandate to Build, and it does not foreclose a
future DDR revisiting either axis for Department OS Core more broadly.

---

## Evidence

Scored row-by-row against `02-ARCHITECTURE.md` Section 6's nine-row capability table. Every row
gets an explicit verdict below; no row is folded into a summary paragraph.

### Runtime — live-tested against the real Anthropic API

| # | Section 6 Capability | Verdict | Evidence |
|---|---|---|---|
| 4 | Multi-step orchestration with per-step provenance capture (model/tool/timing per `GenerationStep`), including on failed runs | **PASS, with caveat** | Each API response exposes `id`, `model`, `stop_reason`, and a rich `usage` object (tokens, cache stats, service tier) — but **not** wall-clock timing; that must be captured client-side. A malformed multi-step request produced a clean structured `BadRequestError` with a `request_id`, but no usage/timing metadata was present (no inference occurred), so failed-run provenance is **partial**: `request_id` + error are available; token/timing are not, because there is nothing to meter on a request the API rejected before inferencing. |
| 5 | Fetch/resolve capability for URL-type `SourceArtifact`s, with graceful unreachable-source handling | **Not spiked — desk-assessed, N/A as a runtime differentiator** | This capability is satisfiable by any standard HTTP client regardless of which LLM runtime is chosen; it does not depend on the Anthropic API specifically, so it was not live-tested here. Reasoning stated explicitly rather than silently omitted. |
| 6 | Structured-output / schema-constrained generation mode capable of producing the exact literal unions in Section 3 (`EvidenceLabel`, `DemandConfidenceLevel`, `GapCategory`, `RecommendationDecision`) without free-text drift | **PASS** | Forced tool-use with a JSON-schema enum reliably returned valid `EvidenceLabel` values on both a normal statement and a deliberately ambiguous/adversarial one — server-side schema enforcement, never emitted an off-enum value. Free-text mode (no tool forcing) was also tried and does drift off-schema, confirming forced tool-use is required, not merely convenient. |
| 7 | Schema/enum validation of structured model output with a bounded re-prompt-and-repair path (`MAX_REPAIR_ATTEMPTS = 1`), explicit run-failure (not silent coercion) when repair also fails | **PASS** | The repair-loop control flow (validate → repair once → hard fail, no silent coercion) was exercised end-to-end client-side against the forced-tool-use output from row 6; combined with row 6's server-side enum enforcement, off-schema output was never observed to reach the repair path in practice during this spike, but the client-side control flow itself was verified to execute correctly. |
| 8 | A minimal read/write surface reachable by a human (no requirement on framework) for the Review Surface | **Not spiked — desk-assessed, N/A as a runtime differentiator** | Any minimal web framework satisfies this regardless of which LLM runtime is chosen; not a capability the Anthropic API itself provides or blocks. Reasoning stated explicitly rather than silently omitted. |
| 9 | A tool or adapter through which the runtime can search the public web and retrieve/inspect selected results, preserving query/URL/retrieval-time and surfacing failed or blocked retrievals | **PASS on happy path; PARTIAL/PROVISIONAL on failure path** | Anthropic's built-in `web_search` tool works live, exposes query + result URLs + a `page_age` freshness estimate (not a true retrieval timestamp — must be captured client-side). The spike could **not** provoke a genuine blocked/failed retrieval to confirm Anthropic's documented `WebSearchToolResultError` types actually surface cleanly in practice. **Flagged PROVISIONAL** — named owner: Ledger, to validate against a real blocked source **before Slice 6** (Landscape Researcher) begins. |

Rows 1, 2, 3 are storage-axis capabilities, not runtime-axis — scored below under Storage.

### Storage — live-tested against a dedicated local Postgres

Environment: Docker, `postgres:16-alpine`, port 55432, database `deptos_core`, own anonymous
Docker volume — physically separate from LORE's instance on VM 103.

| # | Section 6 Capability | Verdict | Evidence |
|---|---|---|---|
| 1 | Durable, queryable persistence of the Section 3 entities with foreign-key-style integrity (a `Decision` cannot reference a nonexistent `BriefVersion`) | **PASS** | A `Decision` insert referencing a real `BriefVersion` id succeeded; one referencing a nonexistent id was rejected with a real Postgres FK violation: `ERROR: insert or update on table "decision" violates foreign key constraint "decision_brief_version_id_fkey"...` |
| 2 | Append-only / immutable-record support (or enforced-at-application-layer immutability) for `BriefVersion`, `ClaimVersion`, `EvidenceItem`, and `StatusEvent` | **PASS** | `BEFORE UPDATE OR DELETE` triggers on all four immutable entity types rejected both UPDATE and DELETE attempts against an existing row with a real trigger-raised error: `ERROR: append-only table: brief_version is immutable...`. Row confirmed unchanged after both attempts. |
| 3 | Efficient reverse lookup of `BriefVersion`s by a member `claimVersionId` | **PASS** | Array-containment query (`@>`) correctly returned matching BriefVersions. At small scale the planner chose a Seq Scan — correct cost-based behavior, not a failure. At realistic scale (5,000+ rows, post-`ANALYZE`), the planner naturally selected a Bitmap Index Scan on the GIN index without forcing — this larger-scale result is the confirming evidence for the capability, not the small-scale result alone. |

Rows 4–9 are runtime-axis capabilities and are not re-scored here (see Runtime table above); the
storage layer plays no role in provenance capture, structured-output enforcement, fetch/resolve,
the human review surface, or web search.

### Coverage summary

All nine Section 6 rows have an explicit verdict above: three PASS (storage, rows 1–3), four PASS
(runtime, rows 4, 6, 7, and 9's happy path), one PARTIAL/PROVISIONAL (row 9's failure path), and
two rows (5, 8) explicitly reasoned as non-differentiating between runtime candidates rather than
silently omitted.

---

## Consequences

**This makes easier:**
- Schema-constrained generation for every literal-union field in Section 3 (`EvidenceLabel`,
  `DemandConfidenceLevel`, `GapCategory`, `RecommendationDecision`) via forced tool-use, with a
  concrete, tested repair-loop pattern to implement against (R-4).
- Referential integrity, append-only immutability, and the `claimVersionId` reverse-lookup query
  (Q-4) are all native Postgres features already confirmed working, not features Slice 2–4 need to
  hand-roll at the application layer.
- Core storage now has a real home distinct from LORE, satisfying Section 7's "a module without
  Core underneath it is not a complete vertical slice" requirement concretely rather than as an
  aspiration.

**This makes harder / open risk:**
- Wall-clock timing for `GenerationStep` provenance (row 4) must be captured client-side; the API
  does not provide it. Slice 8 (Provenance Recorder) must budget for this explicitly.
- Failed-run provenance (row 4) is partial: a rejected request yields `request_id` + error but no
  usage/token data, since no inference occurred. Slice 8 must design `GenerationRun` failure
  records around this asymmetry rather than assuming symmetric success/failure provenance.
- Row 9's failure-path behavior (blocked/failed web retrieval surfacing as a clean
  `WebSearchToolResultError`) is **unconfirmed** and carries real risk for Slice 6 (Landscape
  Researcher) if it does not behave as documented. This must be validated before Slice 6 begins,
  not discovered during it.

**This forecloses (for this milestone only):**
- No other runtime (e.g. OpenAI function-calling, a different agent framework) or storage
  technology (e.g. a document store, a different RDBMS) is evaluated in this DDR. If either axis
  proves inadequate during Slices 2–12, the correct response is a new DDR, not a silent
  in-implementation swap.

---

## Reversibility

**Runtime swap cost:** Moderate. The forced-tool-use / structured-output layer and the
validate-repair-fail control loop are the primary runtime-coupled surface; swapping runtimes means
re-implementing that layer against the new provider's structured-output mechanism (if one exists)
and re-validating the provenance-capture approach (row 4) and web-search adapter (row 9) against
the new provider's actual API shape. The Section 3 schemas and Section 4 API contracts themselves
are runtime-agnostic by design and do not need to change.

**Storage swap cost:** Moderate, but the core schema logic is portable. A swap would require a
migration script and re-implementation of the four `BEFORE UPDATE OR DELETE` immutability triggers
and the GIN-indexed array-containment reverse lookup in the target technology's equivalent
primitives. None of this is vendor-locked to Postgres specifically — foreign-key integrity,
append-only enforcement, and indexed array/reverse-lookup queries are standard relational
capabilities available in most mainstream RDBMSs; the SQL used here is portable relational design,
not a proprietary Postgres feature. The physical separation from LORE's instance means a storage
swap for Department OS Core does not touch or risk LORE's data at all.

**Named open item requiring resolution before it can be treated as fully reversible-or-not:** the
row 9 PROVISIONAL flag (web-search failure-path behavior) is a decision-relevant unknown, not a
sunk cost — resolving it before Slice 6 could still change the row 9 verdict from PASS/PARTIAL to
a genuine gap, which under G-22 would require a HALT to Danny rather than silent continuation.

---

## Stopping Rule (G-22) Status

Not triggered. Every scored row is at minimum PASS or explicitly-reasoned-N/A; no row failed
outright. The single PARTIAL/PROVISIONAL item (row 9 failure path) is named with an owner and a
deadline (before Slice 6) rather than treated as a silent gap — per G-22, this is recorded as a
documented open item, not glossed over.

---

## Gate Status

**Status: ACCEPTED.** Both Slice 1 Done-When conditions are satisfied: Frank reviewed this DDR
and confirmed it is not a bare assertion (verdict PASS, 2026-08-10 — cites verbatim Postgres error
strings, a scale-dependent planner transition, a negative control on forced vs. free-text output,
and self-reported limitations rather than a suspicious 9/9 clean sweep). Danny accepted the Row 9
PROVISIONAL item (web-search blocked/failed-retrieval path unverified) as a tracked risk, owned by
Ledger, to be validated against a real blocked source before Slice 6 (Landscape Researcher)
begins. Slice 2 may now proceed.
