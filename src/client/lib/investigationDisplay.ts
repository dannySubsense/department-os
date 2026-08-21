/** Shared display-layer helpers for Investigation rows across InvestigationPortfolioTable and
 *  Mission Control's RecentInvestigationsList / RunsActivityPanel — pure client-side formatting,
 *  no new fields, no fetches. */

/** Shortens a UUID to its first 8 characters followed by an ellipsis, e.g. "de20a01e…". */
export function shortenId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

/** Formats an ISO timestamp as `YYYY-MM-DD HH:mm`. Falls back to the raw input if unparseable.
 *  Single source of truth for this format — used directly and via `formatInvestigationLabel`. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

/** Builds a truthful, temporary, human-facing label from the real `createdAt` field, e.g.
 *  "Investigation — 2026-08-20 12:40". Never invents data. */
export function formatInvestigationLabel(createdAt: string): string {
  return `Investigation — ${formatDateTime(createdAt)}`;
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  blocked: 'Blocked',
  'generation-failed': 'Generation failed',
  'brief-generated': 'Brief generated',
};

/** Humanizes a domain `InvestigationStatus` value for display. Does not affect the underlying
 *  domain value — display-only. */
export function humanizeStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
