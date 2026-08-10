import type { SourceArtifactType } from '../types/domain.js';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface SubmissionFormRow {
  type: SourceArtifactType | '';
  raw: string;
}

/** Input matching the selected kind (03-UI-SPEC.md "Submission Screen" layout diagram: "[ input
 *  matching kind ]") — a single-line URL input for `url`, a multi-line textarea for `text`. Both
 *  share `name="raw"` so the server-side form parser (server.ts) needs no branching. */
function rawInputHtml(type: SourceArtifactType | '', raw: string): string {
  if (type === 'text') {
    return `<textarea name="raw" placeholder="Paste text">${escapeHtml(raw)}</textarea>`;
  }
  return `<input type="url" name="raw" placeholder="Paste a URL" value="${escapeHtml(raw)}" />`;
}

export interface RenderSubmissionScreenOptions {
  investigationId?: string;
  rows?: SubmissionFormRow[];
  errorMessage?: string;
}

/** Submission Screen — 03-UI-SPEC.md "Screen: Submission Screen". */
export function renderSubmissionScreen(opts: RenderSubmissionScreenOptions = {}): string {
  const rows: SubmissionFormRow[] =
    opts.rows && opts.rows.length > 0 ? opts.rows : [{ type: 'url', raw: '' }];

  const rowsHtml = rows
    .map(
      (row, i) => `
      <div class="source-artifact-row">
        <select name="type">
          <option value="url" ${row.type === 'url' ? 'selected' : ''}>URL</option>
          <option value="text" ${row.type === 'text' ? 'selected' : ''}>Text</option>
        </select>
        ${rawInputHtml(row.type, row.raw)}
        <button type="button" class="remove-row" aria-label="Remove source ${i + 1}">x</button>
      </div>`,
    )
    .join('\n');

  const errorHtml = opts.errorMessage
    ? `<div class="validation-message" role="alert">${escapeHtml(opts.errorMessage)}</div>`
    : `<div class="validation-message" hidden></div>`;

  const investigationIdField = opts.investigationId
    ? `<input type="hidden" name="investigationId" value="${escapeHtml(opts.investigationId)}" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Start an Investigation</title>
</head>
<body>
  <h1>Start an Investigation</h1>
  <form method="POST" action="/investigations" id="submission-form">
    ${investigationIdField}
    <div id="source-artifact-rows">
      ${rowsHtml}
    </div>
    <button type="button" id="add-row">+ Add another source</button>
    ${errorHtml}
    <button type="submit" id="submit-control" disabled>Start Investigation</button>
  </form>
  <script src="/submission-screen.js"></script>
</body>
</html>`;
}

export interface InvestigationSourceForDisplay {
  type: string;
  raw: string;
  status: 'unresolved' | 'unreachable' | 'content-retrieved' | 'reachable-no-content';
  failureReason?: string;
  noContentReason?: string;
}

/** Investigation Screen — Generating State — 03-UI-SPEC.md
 *  "Investigation Screen — Generating State". Per-source status is now live, sourced from
 *  `getInvestigation` (Slice 3's Source Resolver populates the other three status values). */
export function renderInvestigationGeneratingScreen(
  investigationId: string,
  status: string,
  sources: InvestigationSourceForDisplay[],
): string {
  const sourcesHtml = sources
    .map((s) => {
      const label = statusLabel(s.status);
      const detail =
        s.status === 'unreachable' && s.failureReason
          ? ` — ${escapeHtml(s.failureReason)}`
          : s.status === 'reachable-no-content' && s.noContentReason
            ? ` — ${escapeHtml(s.noContentReason)}`
            : '';
      const truncatedRaw = escapeHtml(s.raw.length > 120 ? `${s.raw.slice(0, 120)}…` : s.raw);
      return `<li><span class="source-type">[${escapeHtml(s.type)}]</span> ${truncatedRaw} — status: ${label}${detail}</li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Investigation in progress</title>
</head>
<body>
  <h1>Investigation in progress</h1>
  <p class="investigation-reference">Investigation reference: <code>${escapeHtml(investigationId)}</code> — status: ${escapeHtml(status)}</p>
  <h2>Submitted sources</h2>
  <ul class="submitted-sources-list">
    ${sourcesHtml}
  </ul>
  <p class="durable-url-note">
    This exact URL is your durable reference — revisit it to see the Brief once generation
    completes. No notification will be sent.
  </p>
  <p><a href="/investigations/new?investigationId=${encodeURIComponent(investigationId)}">Add another source to this Investigation</a></p>
</body>
</html>`;
}

/** Investigation Screen — Blocked State — 03-UI-SPEC.md "Investigation Screen — Blocked State".
 *  Zero reachable sources: states plainly that no Brief could be generated because no submitted
 *  source was reachable, lists each source's `failureReason`, and routes back to the Submission
 *  Screen pre-associated with this `investigationId` — the correct remedy here, because zero
 *  reachable sources genuinely requires a new/working source (G-13). */
export function renderInvestigationBlockedScreen(
  investigationId: string,
  sources: InvestigationSourceForDisplay[],
  statusReason?: string,
): string {
  const sourcesHtml = sources
    .map((s) => {
      const truncatedRaw = escapeHtml(s.raw.length > 120 ? `${s.raw.slice(0, 120)}…` : s.raw);
      const reason = s.failureReason ? ` — ${escapeHtml(s.failureReason)}` : '';
      return `<li><span class="source-type">[${escapeHtml(s.type)}]</span> ${truncatedRaw}${reason}</li>`;
    })
    .join('\n');

  const reasonHtml = statusReason
    ? escapeHtml(statusReason)
    : 'No further detail was recorded for this run.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>No Brief could be generated</title>
</head>
<body>
  <h1>No Brief could be generated — no source was reachable</h1>
  <p class="investigation-reference">Investigation reference: <code>${escapeHtml(investigationId)}</code> — status: blocked</p>
  <p class="reason-statement">Reason: ${reasonHtml}</p>
  <h2>Submitted sources</h2>
  <ul class="submitted-sources-list">
    ${sourcesHtml}
  </ul>
  <p><a href="/investigations/new?investigationId=${encodeURIComponent(investigationId)}" id="add-source-link">Add another source to this Investigation</a></p>
</body>
</html>`;
}

/** Investigation Screen — Generation Failed State (G-13-derived) — 03-UI-SPEC.md "Investigation
 *  Screen — Generation Failed State". Sources WERE reachable; the generation pipeline itself did
 *  not complete. Copy is deliberately distinct from the Blocked state and — critically (G-13) —
 *  NEVER frames the fix as "add a source": the recovery action routes to the same Submission
 *  Screen as Blocked, but is labeled/explained as retry-by-resubmission, not "your sources were
 *  the problem." This slice builds this component against a given/fixture `statusReason` — the
 *  live pipeline that produces `generation-failed` does not exist until Slice 9. */
export function renderInvestigationGenerationFailedScreen(
  investigationId: string,
  statusReason: string | undefined,
): string {
  const reasonHtml = statusReason
    ? escapeHtml(statusReason)
    : 'No further detail was recorded for this run.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Brief generation did not complete</title>
</head>
<body>
  <h1>Sources were reachable, but Brief generation did not complete</h1>
  <p class="investigation-reference">Investigation reference: <code>${escapeHtml(investigationId)}</code> — status: generation-failed</p>
  <p class="reason-statement">Reason: ${reasonHtml}</p>
  <p class="retry-note">
    This is not a missing-source issue — your submitted sources were reachable. You may retry by
    resubmitting sources to this Investigation, or investigate further via the generation run
    record.
  </p>
  <p><a href="/investigations/new?investigationId=${encodeURIComponent(investigationId)}" id="retry-link">Add / resubmit sources to this Investigation</a></p>
</body>
</html>`;
}

function statusLabel(status: InvestigationSourceForDisplay['status']): string {
  switch (status) {
    case 'unresolved':
      return 'pending';
    case 'unreachable':
      return 'unreachable';
    case 'content-retrieved':
      return 'content retrieved';
    case 'reachable-no-content':
      return 'reachable, no usable content found';
  }
}
