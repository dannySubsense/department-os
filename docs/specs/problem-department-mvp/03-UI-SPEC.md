# UI Spec: Problem Department — Vertical Slice MVP

**Feeds**: `01-REQUIREMENTS.md` (US-1–US-13, Required Brief Elements, Numeric Scope Rule),
`02-ARCHITECTURE.md` (Sections 1–5)

## Scope Discipline

Per `docs/milestones/problem-department-mvp.md`, this MVP explicitly does **not** need a
polished dashboard UI — "a minimal way to review and decide on a Problem Brief is sufficient."
This spec defines only the two durable-URL surfaces required to (1) submit source artifacts and
start/revisit an Investigation, and (2) review a generated Brief and record a decision. No
navigation shell, no investigation list/dashboard, no search, no filtering, no multi-brief
browsing, no notification system, no client-side polling, no visual design system, and no
frontend framework are specified. Where a capability would be useful but is not required by
US-1–US-13, it is named as Out of Scope below rather than added.

No frontend framework or specific UI technology is selected — this document describes screens,
flows, and information architecture only.

---

## Screens

There are **two durable-URL screens**. Everything else in this document is a state that one of
those two URLs renders, not an independently routed page — this replaces the prior "five
screen/state entries" framing, which both undercounted (by folding Investigation's three states
into one row) and self-contradicted its own screen count (G-17).

| Screen | Purpose | Entry Point |
|--------|---------|--------------|
| **Submission Screen** | Human submits one-or-more source artifacts (URLs/text) to start (or add to) an Investigation | Direct link/URL (e.g. `/investigations/new`); no prior screen required |
| **Investigation Screen** (`/investigations/{investigationId}`) | The single durable URL a human is given after submitting, and the only URL they ever need to revisit. Renders exactly one of four states — **Generating**, **Blocked**, **Generation Failed**, or **Completed (Brief presented from Investigation)** — by reading `getInvestigation(investigationId)` (and, once `status === 'brief-generated'`, `getBriefForReview`). No notification, dashboard, list view, or polling is used; a manual revisit/refresh is sufficient (US-1 AC4, architecture Q-7) | Returned as the durable reference on Submission Screen success; revisited directly thereafter |

### Investigation Screen states

| State | Rendered when | Content |
|---|---|---|
| **Generating** | `Investigation.status === 'open'` | plain "still generating" message + submitted sources list |
| **Blocked** | `Investigation.status === 'blocked'` | reason (zero reachable sources) + per-source failure detail + "add a source" remedy |
| **Generation Failed** | `Investigation.status === 'generation-failed'` | reason (pipeline could not populate all seven required elements) + a *different* remedy (no "add a source" control — see below) |
| **Completed** | `Investigation.status === 'brief-generated'` | the Brief, presented from the Investigation resource via `problemBriefId → ProblemBrief.currentVersionId → getBriefForReview`, embedded/linked under the same URL — see "Screen: Investigation Screen — Completed State" below |

The **Decision Confirmation** moment (after `recordDecision` succeeds) is a transient
in-place confirmation on the Completed state, not a fifth URL — it does not replace the
Investigation Screen or navigate away from it.

---

## User Flows

### Flow 1: Submit source artifacts to start an investigation (US-1)

1. User starts at: **Submission Screen**.
2. User sees: an empty artifact-entry list (starts with one empty row), each row offering a
   choice of artifact kind (URL or pasted text) and an input matching that kind, plus an
   "Add another source" control and a "Start Investigation" submit control (disabled until at
   least one row has content).
3. User action: enters one or more URLs and/or pastes text blocks; adds rows as needed; clicks
   "Start Investigation."
4. System response: validates at least one non-empty artifact is present (client-side check
   mirroring US-1 AC3); calls `submitSources`; on success, creates one `Investigation` +
   `SourceArtifact` records and begins source resolution and Brief generation asynchronously.
5. User sees: a redirect to the **Investigation Screen** at its durable URL
   (`/investigations/{investigationId}`), initially in its **Generating** state — the
   Investigation reference, the list of submitted sources with a per-source resolution
   indicator, and an explicit statement that this exact URL is the only thing needed to check
   on progress or retrieve the Brief later (no separate notification will be sent).
6. End state: user has a durable Investigation URL; no Brief exists yet.

**Success path**: at least one artifact submitted → Investigation created → Investigation Screen
shown in Generating state.
**Error path**: zero artifacts submitted → submit control stays disabled and/or server rejects
per US-1 AC3 → an inline validation message states at least one source is required; no
Investigation is created.

### Flow 2: Investigation blocked — zero reachable sources (Edge Case)

1. User starts at: **Investigation Screen**, Generating state, having submitted only
   unreachable/dead sources.
2. System response: `resolveInvestigationSources` reports `allUnreachable: true`;
   `Investigation.status` becomes `'blocked'`; no `BriefVersion` is generated.
3. User sees (on revisiting the same Investigation URL): the **Blocked** state — a plain
   statement that no Brief could be generated because no submitted source was reachable, the
   list of sources with their `unreachable`/`failureReason` values, and a control to add
   another source to this same Investigation (routes back to Submission Screen
   pre-associated with `investigationId`).
4. End state: Investigation remains `blocked`, not silently empty.

### Flow 2a: Investigation generation-failed — sources reachable, pipeline could not complete (Edge Case, G-13-derived)

1. User starts at: **Investigation Screen**, Generating state, having submitted at least one
   reachable source.
2. System response: the generation pipeline (`generateBriefVersion`) runs but fails to populate
   all seven required Brief elements; `Investigation.status` becomes `'generation-failed'`;
   `GenerationRun` is persisted with `outcome: 'failed'` and `briefVersionId: null`; no
   `BriefVersion` is created.
3. User sees (on revisiting the same Investigation URL): the **Generation Failed** state — a
   plain statement that sources were reachable but Brief generation did not complete, distinct
   in wording from the Blocked state. **"Add another source" is NOT offered here** — adding a
   source addresses zero-reachable-sources, not a pipeline failure, and offering it would point
   the human at the wrong remedy (this is the exact failure mode `InvestigationStatus`'s
   two-value split exists to prevent — architecture G-13). Instead this state offers: the
   `statusReason` detail as recorded, and a plain statement that the human may retry by
   resubmitting the same sources (a fresh `submitSources`/regeneration path — not a distinct UI
   control beyond what Submission Screen already offers) or contact support/investigate via the
   `GenerationRun` provenance record. No dedicated "retry" button is specified — retry is the
   same "add sources to this Investigation" path as Blocked, but the copy and stated reason are
   never conflated with "no reachable sources."
4. End state: Investigation remains `generation-failed`, distinguishable in the UI (copy, not
   just internal status value) from `blocked`.

### Flow 3: Review a Brief and record Approve/Reject/Watch (US-3–US-9, US-13)

1. User starts at: **Investigation Screen**, Completed state, addressed by `investigationId`
   (the Brief itself is reached via this same durable URL, resolved through
   `problemBriefId → currentVersionId → getBriefForReview`, per Q-7 — there is no separate
   `/briefs/{briefVersionId}` entry point a human is expected to bookmark independently, though
   the resolved `briefVersionId` remains stable and inspectable for provenance purposes).
2. User sees: the full read model returned by `getBriefForReview` — all seven required Brief
   elements, rendered per the layout in "Screen: Investigation Screen — Completed State" below —
   plus, if `priorDecisions` is non-empty, a visible decision-history banner (see Flow 5), plus
   the citation-presence-not-correctness notice (see below), plus the landscape search-scope
   notice (see below).
3. User action: reads the Brief; selects a decision (Approve / Reject / Watch) via three
   mutually-exclusive controls.
4. System response (Watch only): reveals a reconsideration-conditions sub-form requiring at
   least one named condition (type + description) before the decision can be submitted.
5. User action: optionally enters a rationale (free text, optional per schema); clicks
   "Record Decision."
6. System response: calls `recordDecision`; server rejects if `decision === 'Watch'` and zero
   reconsideration conditions were supplied (US-9 AC2) — this is also enforced client-side by
   disabling submit until at least one condition row is complete.
7. User sees: an in-place **Decision Confirmation** panel on the same Investigation Screen URL —
   the decision recorded, the exact `briefVersionId` it is bound to, timestamp, and (for Watch)
   the reconsideration conditions as recorded. The URL does not change.
8. End state: `Decision` persisted, bound to this `BriefVersion.id` only; the Investigation
   Screen, on any future revisit, now shows this decision in the decision-history banner.

**Success path**: Approve/Reject submitted directly; Watch submitted with ≥1 condition.
**Error path**: Watch submitted with 0 conditions → submit blocked client-side; if reached
server-side anyway, an inline error states at least one reconsideration condition is required
and no `Decision` is persisted.

### Flow 4: Reject retains the record and is reconsiderable, not reopenable (US-9 AC1, architecture Q-5)

1. User starts at: Investigation Screen, Completed state, records Reject (Flow 3).
2. System response: `Decision` persisted with `decision: 'Reject'`; no deletion of the Brief,
   its versions, or its evidence occurs anywhere in the flow; the Investigation is not closed or
   mutated into any terminal/archived state (no such `InvestigationStatus` value exists).
3. User sees: the in-place Decision Confirmation panel, identical in structure to any other
   decision — Reject is not a distinct "destructive" UI action; the Brief remains reachable at
   the same Investigation URL indefinitely.
4. **Reconsideration path (explicit, not a dedicated "Reopen" control)**: this spec does not add
   a Reopen button or operation anywhere. To reconsider a Rejected Investigation, the human uses
   the ordinary Submission Screen (routed back to this same `investigationId`, the same control
   already shown on Blocked/Generation-Failed states and always available from the Investigation
   Screen) to add new source material. That triggers a new `generateBriefVersion` run, which
   produces a new, independent `BriefVersion` under the same `problemBriefId` lineage. That new
   version is reviewed and decided exactly as in Flow 3, producing a new, independent `Decision`
   — the original Reject `Decision` is never edited or removed.
5. End state: Reject is durable; the Investigation URL, if revisited before new material is
   added, still shows the original Rejected Brief exactly as decided. If new material is later
   added and a new version generated, revisiting resolves to the newest `BriefVersion` per
   `ProblemBrief.currentVersionId`, with the full decision lineage (old Reject + new Decision)
   visible per Flow 5.

### Flow 5: Revisit a Brief version with decision history and/or lineage state

1. User starts at: **Investigation Screen**, Completed state, for a `BriefVersion` that already
   has one or more entries in `priorDecisions`, and/or whose `assignedState` (via
   `getAssignedState`) is `challenged`/`invalidated`, and/or whose `isSuperseded` is `true`.
2. User sees: a status/decision-history banner at the top of the Brief content (see Layout
   Structure below) stating, plainly and without burying it below the fold:
   - **if `priorDecisions` is non-empty**: every decision on record for this exact
     `BriefVersion`, in `decidedAt` order — not just the latest — each with its decision type,
     `decidedBy`, `decidedAt`, and rationale/reconsideration conditions. This is a lineage list,
     not a single-decision summary, because architecture's `Decision.priorDecisions` is a list:
     multiple independent Decisions can exist against the same `BriefVersion` over time (e.g. an
     earlier Watch later revisited as Approve/Reject on the same version), and — per Flow 4 — a
     Reject on one version followed by reconsideration produces an entirely separate
     `BriefVersion` with its own decision list, reachable via this same Investigation URL once
     it becomes current;
   - **if `assignedState !== 'valid'`**: which state applies (`challenged` / `invalidated`), per
     `getAssignedState`, worded as Department OS's own assigned state, not a claim about
     objective truth (architecture Q-3 framing);
   - **if `isSuperseded === true`**: a link to the current version via
     `ProblemBrief.currentVersionId`, worded as a structural fact distinct from assigned
     validity.
3. User action: user may still read the full Brief content below the banner; the decision
   controls from Flow 3 remain available (a new decision can always be recorded against the
   current version being viewed — recording one does not alter any prior decision).
4. End state: no ambiguity about which version is being viewed, its assigned state, or its full
   decision history.

---

## Screen: Submission Screen

### Layout Structure

```
┌───────────────────────────────────────────────────┐
│ Page title: "Start an Investigation"                │
├───────────────────────────────────────────────────┤
│ Source artifact rows (repeatable):                  │
│   [ kind: URL | Text ]  [ input matching kind ]  [x]│
│   [ kind: URL | Text ]  [ input matching kind ]  [x]│
│   + Add another source                               │
├───────────────────────────────────────────────────┤
│ Validation message area (shown only on error)        │
├───────────────────────────────────────────────────┤
│ [ Start Investigation ]  (disabled until ≥1 filled)  │
└───────────────────────────────────────────────────┘
```

### Sections

| Section | Content | Data Source |
|---------|---------|--------------|
| Source artifact rows | One row per `{type, raw}` pair the user is composing | Client-side form state → `submitSources.artifacts[]` |
| Validation message | "At least one source is required" or server-reported rejection | US-1 AC3 |
| Submit control | Triggers `submitSources({ origin: 'human', artifacts, investigationId? })` | `SubmissionOrigin`; origin is always `'human'` from this screen. `investigationId` is present when reached via a "add another source" recovery link (Flows 2, 2a, 4), absent when starting fresh |

---

## Screen: Investigation Screen

This is the **single durable URL** covering Generating, Blocked, Generation Failed, and
Completed states, and the Brief review/decide surface. All content below is what renders under
one `/investigations/{investigationId}` route.

### Investigation Screen — Generating State

```
┌───────────────────────────────────────────────────┐
│ "Investigation in progress" + Investigation reference │
├───────────────────────────────────────────────────┤
│ Submitted sources list:                              │
│   [type] [raw, truncated] — status: pending/unreachable/│
│     content retrieved/reachable, no usable content     │
├───────────────────────────────────────────────────┤
│ Note: this exact URL is your durable reference — revisit│
│ it to see the Brief once generation completes. No       │
│ notification will be sent.                              │
└───────────────────────────────────────────────────┘
```

| Section | Content | Data Source |
|---------|---------|--------------|
| Investigation reference | `Investigation.id`, `status` | `Investigation` |
| Sources list | Each `SourceArtifact.raw` (truncated) + `SourceResolution.status` per the four-way distinction below | `SourceArtifact`, `SourceResolution` |

**Per-source status display (G-9-derived fix)**: `SourceResolution.status` renders as one of
four distinct labels, mapping directly onto architecture's first-class four-value
`SourceResolution.status` enum (`'unresolved' | 'unreachable' | 'content-retrieved' |
'reachable-no-content'`) with no translation layer between the two:

- `unresolved` → "pending"
- `unreachable` → "unreachable" + `failureReason`
- `content-retrieved` → "content retrieved"
- `reachable-no-content` → "reachable, no usable content found" + `noContentReason` where
  available (e.g. paywall, login-wall, JS-only render) — this state is distinguishable from
  both "unreachable" and "content retrieved" — collapsing it into a generic "reachable" success
  indicator would make a source that legitimately had no relevant content indistinguishable from
  a source the system simply failed to read, per Requirements' edge-case table

Each of the four UI labels is a direct rendering of one `SourceResolution.status` enum value —
this screen performs no derivation, inference, or downstream-extraction lookup to distinguish
the four states; the distinction is carried first-class by the enum itself.

### Investigation Screen — Blocked State

```
┌───────────────────────────────────────────────────┐
│ "No Brief could be generated — no source was reachable"│
├───────────────────────────────────────────────────┤
│ Sources list with failureReason per source              │
├───────────────────────────────────────────────────┤
│ [ Add another source to this Investigation ]            │
└───────────────────────────────────────────────────┘
```

| Section | Content | Data Source |
|---------|---------|--------------|
| Reason statement | Plain-language statement: zero reachable sources | `Investigation.status === 'blocked'`, `statusReason` |
| Sources list | Each source's `failureReason` | `SourceResolution` |
| Recovery action | Routes to Submission Screen pre-associated with this `investigationId` | Correct remedy — zero reachable sources genuinely requires a new/working source |

### Investigation Screen — Generation Failed State (G-13-derived, new)

```
┌───────────────────────────────────────────────────┐
│ "Sources were reachable, but Brief generation did not│
│  complete"                                             │
├───────────────────────────────────────────────────┤
│ Reason: statusReason (pipeline could not populate all │
│ seven required elements)                                │
├───────────────────────────────────────────────────┤
│ You may retry by resubmitting sources to this          │
│ Investigation, or investigate via the run record below. │
│ [ Add / resubmit sources to this Investigation ]         │
└───────────────────────────────────────────────────┘
```

| Section | Content | Data Source |
|---------|---------|--------------|
| Reason statement | Plain-language statement distinct from Blocked: sources were reachable, the generation pipeline itself did not complete | `Investigation.status === 'generation-failed'`, `statusReason` |
| Retry note | States this is a pipeline-completion issue, not a missing-source issue — never worded as "add a source to fix this" | Distinguishes remedy from Blocked state per G-13 |
| Recovery action | Same underlying route as Blocked (Submission Screen, pre-associated `investigationId`) but labeled/explained as retry-by-resubmission, not "your sources were the problem" | `GenerationRun` (`outcome: 'failed'`) for provenance detail, if surfaced |

**This state must never present the Blocked state's "add a source" framing as the fix.** The
two states share a recovery mechanism (resubmission via Submission Screen) but must never share
copy that implies the same root cause.

### Investigation Screen — Completed State (Brief presented from the Investigation)

This is the primary screen this MVP exists to deliver (US-13). It renders when
`Investigation.status === 'brief-generated'`, resolved via `problemBriefId →
ProblemBrief.currentVersionId → getBriefForReview(briefVersionId)`. The Brief is presented
**embedded within this Investigation URL**, not as a navigation to a separate disconnected page
— the browser location remains `/investigations/{investigationId}` throughout (per Q-7: "the
Brief is presented FROM the Investigation resource, not a replacement of it"). All seven required
Brief elements must be visible without being buried, collapsed-by-default, or requiring a mode
switch to reveal uncertainty or contradicting evidence.

```
┌─────────────────────────────────────────────────────────┐
│ Investigation reference (still visible — this is the same │
│ URL/resource the Brief is presented from)                  │
├─────────────────────────────────────────────────────────┤
│ Decision-history banner (only if priorDecisions non-empty, │
│ assignedState !== 'valid', or isSuperseded) — see Flow 5    │
├─────────────────────────────────────────────────────────┤
│ Provenance line: BriefVersion #N · generated <date> ·      │
│ runtime <runtimeIdentifier> · model(s) <modelIdentifiers>  │
├─────────────────────────────────────────────────────────┤
│ Citation-scope notice (fixed, always shown — see below):    │
│ "Citations are verified to be present and attributed;       │
│ their relevance/correctness has not been independently      │
│ verified by the system."                                    │
├─────────────────────────────────────────────────────────┤
│ 1. Problem Statement(s)                                    │
│    who / context / consequence, per statement, OR an        │
│    explicit "no specific problem could be established"      │
│    negative finding — never a blank section (G-18)          │
├─────────────────────────────────────────────────────────┤
│ 2. Evidence                                                 │
│    Grouped by claim; each item shows: label badge            │
│    (fact/observation/interpretation/assumption/unknown),     │
│    stance (supporting/contradicting), excerpt, source link    │
│    Contradicting evidence shown inline with supporting        │
│    evidence under the same claim.                             │
│    If no evidence was found at all: explicit statement        │
│    "No adequate evidence was found" (G-18) — not omission     │
├─────────────────────────────────────────────────────────┤
│ 3. Demand Evidence (one Brief element; signal type and       │
│    confidence are two distinct fields within it, never        │
│    merged into one score or label — Requirements Constraint)  │
│  3a. Demand Signal Types                                      │
│    List of {type, evidence links}; "other" shows              │
│    otherTypeLabel. If none found: explicit "No demand         │
│    signal types were found" statement, not a blank list (G-18)│
│  3b. Demand Confidence                                        │
│    Level badge: Insufficient / Emerging / Substantiated       │
│    (text label only — never a number, anywhere on this        │
│    screen)                                                     │
│    Narrative text, in full, directly below the badge — for     │
│    Insufficient driven by "no signals found," the narrative    │
│    states that explicitly (this is itself the required,        │
│    non-empty finding, not a placeholder)                       │
├─────────────────────────────────────────────────────────┤
│ 4. Existing-Solution Landscape                               │
│    Per solution: name, what it addresses, how people cope,    │
│    where it's inadequate. If none found within the             │
│    documented search scope: explicit "No existing solutions   │
│    were found within the documented search scope" statement    │
│    (G-18) — plus, always (Q-6):                                │
│    Search-scope note: the queries performed, and any failed/   │
│    blocked retrievals (from WebSearchQuery.limitations /        │
│    WebSearchResult.status !== 'retrieved') — worded so the      │
│    research reads as scoped and honestly bounded, never as      │
│    an exhaustive market scan                                    │
├─────────────────────────────────────────────────────────┤
│ 5. Gap Hypothesis                                            │
│    Per hypothesis: category badge, statement, evidence links.  │
│    If none established: explicit "No defensible gap was        │
│    established" statement, not a blank section (G-18)          │
├─────────────────────────────────────────────────────────┤
│ 6. Uncertainty                                               │
│    Three named lists: What's unknown / What would change      │
│    the conclusion / What's undeterminable — always shown       │
│    expanded, never collapsed-by-default                        │
├─────────────────────────────────────────────────────────┤
│ Personal Pull Note(s) (if any) — visually and structurally     │
│ separate from section 3, labeled "Contextual motivation         │
│ — not market evidence"                                          │
├─────────────────────────────────────────────────────────┤
│ 7. Decision Recommendation (rendered as "System                │
│    Recommendation")                                            │
│    Decision badge (Approve/Reject/Watch) + rationale text      │
├─────────────────────────────────────────────────────────┤
│ Decision Form                                                 │
│   ( ) Approve  ( ) Reject  ( ) Watch                           │
│   [Watch only] Reconsideration conditions (repeatable):         │
│     [ type ▾ ] [ description ]  + Add another condition         │
│   Rationale (optional, free text)                               │
│   [ Record Decision ]                                           │
├─────────────────────────────────────────────────────────┤
│ Decision Confirmation panel (in-place, shown after submit)     │
│   "Decision recorded" · decision · bound BriefVersion ·         │
│   decided by/at · conditions (Watch) · rationale                │
└─────────────────────────────────────────────────────────┘
```

**Distinguishing recorded-negative-finding from true UI-empty-state (G-18, binding)**: the
templates above (e.g. "No demand signals were found," "No existing solutions were found within
the documented search scope," "No defensible gap was established") are only ever rendered when
`getBriefForReview` returns a **populated, explicit absence statement** in the corresponding
field — per Requirements' Required Brief Elements rule, the fail-closed validation gate at the
architecture layer already guarantees these fields are never null/blank for a `brief-generated`
Investigation. This is categorically different from a true UI-loading-empty-state (e.g. the
Investigation Screen has not yet resolved data from the backend, or a network error occurred):
- A **recorded negative finding** renders as a plain, non-error, non-loading statement, styled
  identically to a populated section (same section header, same layout position) — it is a
  completed, meaningful result.
- A **true loading/error empty-state** (e.g. "Unable to load Brief," a spinner, a retry control)
  is never used as a substitute for a negative finding, and never shares visual/structural
  treatment with the negative-finding copy above — conflating the two would let a human mistake
  "the system found nothing" for "the system is broken," or vice versa.
  If `getBriefForReview` fails to return at all for a `brief-generated` Investigation, that is a
  genuine system error state (not specified in further UI detail here — out of scope beyond
  noting the distinction must exist), never rendered using the negative-finding copy.

**Citation-scope notice (R-1 fix, fixed and always visible)**: per architecture's accepted MVP
limitation, the Brief Review surface must state — visibly, not buried in a tooltip or footnote —
that citations are verified to be **present and attributed** (every citation field is required
and non-empty by construction) but their **relevance/correctness has not been independently
verified by the system**. This notice appears once, near the top of the Completed state (below
the provenance line, above section 1), and is never worded in a way that could be read as "these
citations have been checked for you."

**Landscape search-scope notice (Q-6 fix)**: section 4 (Existing-Solution Landscape) always
surfaces, in addition to any `ExistingSolution` findings, the scope of the independent web
research performed: the set of `WebSearchQuery.query` values run for this `BriefVersion`, and
any `WebSearchResult` entries with `status !== 'retrieved'` (i.e. `'blocked'` or `'failed'`,
with their `failureReason`). This applies whether or not solutions were found — a populated
landscape section still states what was and wasn't searched; an empty landscape section states
the same plus the explicit negative finding. This directly prevents the Brief from reading as an
exhaustive market scan when it is a scoped, honestly-bounded search.

### Sections

| Section | Content | Data Source |
|---------|---------|--------------|
| Investigation reference | `Investigation.id` | `Investigation` (still shown — Completed state is the same resource) |
| Decision-history banner | Every `priorDecisions[]` entry (lineage, not just latest), `assignedState`, `isSuperseded` + link to current version | `getBriefForReview().priorDecisions`, `.assignedState`, `.isSuperseded` |
| Provenance line | Version number, generation timestamp, runtime/model identifiers | `BriefVersion`, `GenerationRun` |
| Citation-scope notice | Fixed copy per R-1 | Static copy, not data-driven |
| Problem Statement(s) | `whoExperiencesIt`, `contextOrWorkflow`, `consequenceOrFriction` per `ProblemStatement`, or negative-finding copy | `problemStatements[]` |
| Evidence | `Claim.text` (via `ClaimVersion`) as group heading; nested `EvidenceItem` with `label`, `stance`, `excerptOrSummary`, source reference; or negative-finding copy | `claimVersions[]` (with embedded `evidence[]`) |
| Demand Signal Types | `DemandSignal.type` (+ `otherTypeLabel`), linked evidence, or negative-finding copy | `demandSignals[]` |
| Demand Confidence | `level`, `narrative`, `citedDemandSignalIds` resolved to their signals | `demandConfidence` |
| Existing-Solution Landscape | `ExistingSolution` fields or negative-finding copy, plus search-scope/limitations note | `existingSolutions[]`, `WebSearchQuery[]`/`WebSearchResult[]` for this `generationRunId` |
| Gap Hypothesis | `category` (+ `otherCategoryLabel`), `statement`, linked evidence, or negative-finding copy | `gapHypotheses[]` |
| Uncertainty | `whatsUnknown[]`, `whatWouldChangeConclusion[]`, `whatsUndeterminable[]` | `uncertainty` |
| Personal Pull Note(s) | `text`, fixed label `contextual-motivation` | `personalPullNotes[]` |
| Decision Recommendation ("System Recommendation") | `Recommendation.decision`, `rationale` | `recommendation` |
| Decision Form | User-entered decision, conditions, rationale | Submits via `recordDecision` |
| Decision Confirmation panel | `Decision` fields as persisted, in-place, non-navigating | `recordDecision` response |

---

## Interactions

### Add/remove source artifact row (Submission Screen)

**Trigger**: user clicks "Add another source" / row's remove control.
**Component**: source-artifact-row list (client-side form state; not a persisted entity until submit).
**Behavior**:
1. New empty row appended, or targeted row removed.
2. Submit control's enabled state recalculated (enabled iff ≥1 row has non-empty content).

**Loading state**: n/a (client-side only).
**Error state**: n/a.
**Success state**: row present/removed in form.

### Submit sources (Submission Screen)

**Trigger**: click "Start Investigation" (or "Add / resubmit sources").
**Component**: Intake Service (`submitSources`).
**Behavior**:
1. Client-side check: at least one non-empty artifact — blocks submit if not (mirrors US-1 AC3).
2. Calls `submitSources`; submit control disabled and shows a busy indicator while the call is in flight.
3. On success, navigates to the Investigation Screen's durable URL — a fresh submission creates
   and navigates to a new `investigationId`; a submission carrying an existing `investigationId`
   (Blocked/Generation-Failed/Reject recovery paths) navigates back to that same URL, now back
   in its Generating state pending re-resolution/regeneration.

**Loading state**: submit control shows busy state; form remains visible but inputs disabled to prevent double-submit.
**Error state**: inline message from server rejection (e.g. zero-artifact rejection reaching the server despite client check); form re-enabled, entered content preserved.
**Success state**: Investigation Screen shown (Generating state).

### Select decision type (Investigation Screen — Completed State)

**Trigger**: user selects Approve / Reject / Watch radio control.
**Component**: Decision Recorder (client-side form, pre-submit).
**Behavior**:
1. If Watch selected, reconsideration-conditions sub-form is revealed and becomes required.
2. If Approve/Reject selected (or Watch deselected), sub-form is hidden and its values discarded from the pending submission.
3. "Record Decision" control's enabled state recalculated: enabled for Approve/Reject immediately; enabled for Watch only once ≥1 complete condition row exists.

**Loading state**: n/a (client-side only).
**Error state**: n/a.
**Success state**: form reflects selected decision type and its requirements.

### Record decision (Investigation Screen — Completed State)

**Trigger**: click "Record Decision."
**Component**: Decision Recorder (`recordDecision`).
**Behavior**:
1. Client-side check: Watch requires ≥1 complete reconsideration condition (US-9 AC2) — blocks submit if not.
2. Calls `recordDecision`; control disabled and shows busy state while in flight.
3. On success, reveals the in-place Decision Confirmation panel on the same URL — no navigation.

**Loading state**: control shows busy state; decision selection and condition rows disabled to prevent double-submit.
**Error state**: inline message if server rejects (e.g. Watch with zero conditions reaching the server, or the `BriefVersion` no longer resolvable); form re-enabled, entered content preserved.
**Success state**: Decision Confirmation panel shown in place; decision-history banner (Flow 5) will include this decision on any future load.

---

## Component Hierarchy

```
SubmissionScreen
├── SourceArtifactRowList
│   └── SourceArtifactRow (×n)
│       ├── KindSelector (URL | Text)
│       └── ArtifactInput
├── ValidationMessage
└── SubmitControl

InvestigationScreen                          // single durable-URL route
├── InvestigationReference
├── GeneratingState (conditional on status === 'open')
│   └── SourceStatusList
│       └── SourceStatusItem (×n)            // pending | unreachable | content-retrieved |
│                                             // reachable-no-content (G-9-derived four-way,
│                                             // direct mapping onto SourceResolution.status)
├── BlockedState (conditional on status === 'blocked')
│   ├── ReasonStatement
│   ├── SourceFailureList
│   │   └── SourceFailureItem (×n)
│   └── AddSourceLink
├── GenerationFailedState (conditional on status === 'generation-failed')
│   ├── ReasonStatement                      // distinct copy from BlockedState (G-13-derived)
│   ├── RetryNote
│   └── ResubmitSourceLink
└── CompletedState (conditional on status === 'brief-generated')
    ├── DecisionHistoryBanner (conditional)  // priorDecisions[] lineage + assignedState + isSuperseded
    ├── ProvenanceLine
    ├── CitationScopeNotice                  // fixed copy, R-1
    ├── ProblemStatementSection
    │   └── ProblemStatementItem (×n) | NegativeFindingNotice
    ├── EvidenceSection
    │   ├── ClaimGroup (×n)
    │   │   └── EvidenceItemRow (×n)
    │   └── NegativeFindingNotice (conditional)
    ├── DemandSignalSection                  // Demand Evidence element, field 3a
    │   └── DemandSignalItem (×n) | NegativeFindingNotice
    ├── DemandConfidenceSection              // Demand Evidence element, field 3b
    │   ├── LevelBadge
    │   └── NarrativeText                    // Insufficient-driven-by-"no signals" is stated
    │                                         // in the narrative itself, not a NegativeFindingNotice
    │                                         // component — this section is never blank/omitted
    ├── ExistingSolutionSection
    │   ├── ExistingSolutionItem (×n) | NegativeFindingNotice
    │   └── SearchScopeNotice                // Q-6: queries run + blocked/failed retrievals
    ├── GapHypothesisSection
    │   └── GapHypothesisItem (×n) | NegativeFindingNotice
    ├── UncertaintySection                   // always three populated lists; no NegativeFindingNotice
    │   ├── UnknownList                       // — "undeterminable"/"unknown" is itself the content,
    │   ├── WouldChangeConclusionList          // never an empty-list state
    │   └── UndeterminableList
    ├── PersonalPullSection (conditional, visually separated)
    │   └── PersonalPullNoteItem (×n)
    ├── RecommendationSection                // Decision Recommendation element (7th of seven)
    │   ├── DecisionBadge
    │   └── RationaleText
    ├── DecisionForm
    │   ├── DecisionTypeSelector (Approve | Reject | Watch)
    │   ├── ReconsiderationConditionList (conditional, Watch only)
    │   │   └── ReconsiderationConditionRow (×n)
    │   ├── RationaleInput (optional)
    │   └── RecordDecisionControl
    └── DecisionConfirmationPanel (conditional, shown in-place post-submit)
```

Per Requirements' canonical enumeration, the seven required Brief elements are: (1) Problem
definition, (2) Evidence, (3) Demand evidence (signal type and confidence — two fields, one
element), (4) Existing-solution landscape, (5) Gap hypothesis, (6) Uncertainty, and (7) Decision
recommendation. `DemandSignalSection` and `DemandConfidenceSection` above are two rendered
sub-sections of that single element 3, not two separate elements; `RecommendationSection` is
element 7.

`NegativeFindingNotice` appears within **5 of the seven** required Brief elements — Problem
Statement(s), Evidence, Demand Evidence (specifically its signal-type sub-field, rendered by
`DemandSignalSection`), Existing-Solution Landscape, and Gap Hypothesis — each of which can
legitimately have zero populated items and therefore needs an explicit absence-statement
component (G-18). The remaining **2 of the seven**, Uncertainty and Decision Recommendation, are
structurally always-populated and use no `NegativeFindingNotice`: Uncertainty always renders its
three named lists, and Decision Recommendation always produces an Approve/Reject/Watch
determination with rationale — even when that rationale is driven by insufficient or absent
evidence (e.g. a Watch recommendation citing "no defensible gap established"), the recommendation
field itself is never absent, so it has no "not found" case to notice. (Demand Evidence's
confidence sub-field, `DemandConfidenceSection`, is likewise always-populated on its own — the
element as a whole still falls in the 5-of-7 group because its signal-type sub-field can be
empty.)

Maps to `02-ARCHITECTURE.md` Section 2 components: `Intake Service` (SubmissionScreen),
`Source Resolver` (GeneratingState/BlockedState source lists), `Provenance Recorder`
(GenerationFailedState reason, ProvenanceLine), `Landscape Researcher`/`WebSearchQuery`
(SearchScopeNotice), `Review Surface` (CompletedState's read via `getBriefForReview`),
`Decision Recorder` (DecisionForm → `recordDecision`), `Validity/Invalidation Service`
(DecisionHistoryBanner's `assignedState`/`isSuperseded`).

---

## State Visibility

| State | Visible In | Updated By |
|-------|------------|------------|
| `Investigation.status` (`open`/`blocked`/`generation-failed`/`brief-generated`) | Investigation Screen — determines which of the four states renders | Intake Service on submit; Source Resolver on resolution completion; Brief generation pipeline on completion/failure |
| `SourceArtifact.raw`, `SourceResolution.status`/`failureReason` | GeneratingState, BlockedState | Source Resolver |
| `BriefVersion` (all seven elements + computed `assignedState`/`isSuperseded`) | CompletedState | Brief Assembler (`generateBriefVersion`); read via `getBriefForReview` |
| `GenerationRun` (runtime/model identifiers, `outcome`) | CompletedState — Provenance line; GenerationFailedState — reason detail | Provenance Recorder, wrapped around `generateBriefVersion`; persisted even on `outcome: 'failed'` |
| `WebSearchQuery[]`, `WebSearchResult[]` | CompletedState — Existing-Solution Landscape section's SearchScopeNotice | Landscape Researcher (`searchWeb`) |
| `EvidenceItem.label`, `.stance` | CompletedState — Evidence section | Evidence Labeler |
| `DemandSignal[]`, `DemandConfidenceClassification` | CompletedState — Demand Evidence element's two sub-sections | Demand Analyzer |
| `PersonalPullNote[]` | CompletedState — Personal Pull section (segregated) | Personal Pull Extractor |
| `ExistingSolution[]`, `GapHypothesis[]` | CompletedState — Landscape/Gap sections | Landscape Researcher, Gap Hypothesis Generator |
| `UncertaintyStatement` | CompletedState — Uncertainty section | Uncertainty Compiler |
| `Recommendation` | CompletedState — Decision Recommendation section | Recommendation Engine |
| `priorDecisions[]` (lineage, not singular) | CompletedState — Decision-history banner | Decision Recorder, read via `getBriefForReview` |
| `Decision` (new) | CompletedState — Decision Confirmation panel (in-place) | Decision Recorder (`recordDecision`), initiated by Decision Form |

---

## Out of Scope

Per the milestone's explicit "no polished dashboard" boundary and to avoid over-scoping into
`docs/architecture.md`'s full Department OS dashboard, the following are **not** specified here
and are not required by US-1–US-13:

- An investigation/brief list, dashboard, search, or filter view.
- In-app notifications or client-side polling UI for Brief-generation progress — the durable
  Investigation URL, manually revisited, is the entire mechanism (Q-7).
- A dedicated "Reopen" control or operation for Rejected investigations — reconsideration flows
  entirely through the existing Submission Screen "add sources to this Investigation" path
  (Flow 4); no new button, route, or backend operation is specified.
- A UI for triggering Brief corrections/new versions independent of resubmitting sources, or for
  invoking `assignValidityState`/invalidation directly — Invalidation Service and correction
  generation are backend-triggered per the architecture; no screen is specified for a human to
  initiate them in this MVP.
- A UI for browsing full `BriefVersion` lineage/history beyond the decision-history banner
  (Flow 5) and the single "current vs. superseded" pointer it surfaces.
- Any visual design system, color/typography/spacing decisions, or responsive-layout
  specification — deferred to implementation per this agent's scope.
- Multi-Investigation or multi-Brief batch operations.
- Authentication/authorization UI — `decidedBy`/`recordedBy` are treated as an already-known
  human identity string; no login screen is specified.
- Selection or configuration UI for the web-search provider/vendor used by the Landscape
  Researcher — this spec only requires that search scope/limitations, whatever the vendor,
  are surfaced (Q-6); no vendor-specific UI is described.

---

## Output Verification

- [x] Every user story with a UI-facing acceptance criterion (US-1, US-2, US-3, US-4, US-5,
      US-6, US-7, US-8, US-9, US-13) has a flow.
- [x] Every flow has a screen (two durable-URL screens; Investigation Screen's four states are
      documented as states of one screen, not uncounted or double-counted — G-17 fixed).
- [x] Every screen/state has a layout structure.
- [x] Interactions cover success, loading, and error states (Add/Remove row, Submit sources,
      Select decision type, Record decision).
- [x] Component hierarchy maps to `02-ARCHITECTURE.md` Section 2 components.
- [x] Uncertainty, contradicting evidence, and demand-confidence narrative are specified as
      always-visible, non-collapsed, non-numeric elements on the Investigation Screen's
      Completed state.
- [x] Every one of the seven required Brief elements — (1) Problem definition, (2) Evidence,
      (3) Demand evidence [signal type + confidence, one element], (4) Existing-solution
      landscape, (5) Gap hypothesis, (6) Uncertainty, (7) Decision recommendation — specifies its
      explicit-negative-finding handling: 5 of the 7 (Problem Statement(s), Evidence, Demand
      Evidence's signal-type field, Existing-Solution Landscape, Gap Hypothesis) render a
      dedicated `NegativeFindingNotice` when empty; the remaining 2 (Uncertainty, Decision
      Recommendation) are structurally always-populated — Uncertainty always states its three
      lists, and Decision Recommendation always produces an Approve/Reject/Watch determination,
      so neither has a "not found" case — and carry no negative-finding case at all rather than
      carrying it in narrative content; every one has a stated, structural distinction from a
      true UI loading/error empty-state (G-18).
- [x] Blocked and Generation-Failed states are specified as distinct, with distinct remedies —
      "add a source" is never offered as the fix for a generation failure (G-13-derived).
- [x] Per-source status display distinguishes reachable-with-content from
      reachable-with-no-usable-content, not collapsed into one "reachable" indicator, and maps
      directly onto architecture's four-value `SourceResolution.status` enum (G-9-derived).
- [x] Citation-presence-not-correctness caveat specified as fixed, always-visible copy on the
      Brief review surface (R-1).
- [x] Existing-Solution Landscape section specifies a search-scope/limitations notice, sourced
      from `WebSearchQuery`/`WebSearchResult`, shown regardless of whether solutions were found
      (Q-6).
- [x] Decision-history banner specified as a lineage (all `priorDecisions`), not a single latest
      decision, reflecting `Decision.priorDecisions` as a list (Q-5).
- [x] The Investigation URL is specified as the sole submission→result mechanism: no dashboard,
      notification, list view, or polling UI anywhere in this document (Q-7).
- [x] No frontend framework or technology selected.
