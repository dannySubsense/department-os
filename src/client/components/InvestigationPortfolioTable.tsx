import type { InvestigationSummary } from '../../types/readModels.js';
import type { InvestigationStatus } from '../../types/domain.js';
import {
  formatDateTime,
  formatInvestigationLabel,
  humanizeStatus,
  shortenId,
} from '../lib/investigationDisplay.js';

const STATUS_OPTIONS: Array<InvestigationStatus> = [
  'open',
  'blocked',
  'generation-failed',
  'brief-generated',
];

interface InvestigationPortfolioTableProps {
  investigations: InvestigationSummary[];
  statusFilter: InvestigationStatus | 'all';
  onStatusFilterChange: (next: InvestigationStatus | 'all') => void;
  lastActiveInvestigationId: string | null;
}

/** Presentational: renders every `InvestigationSummary` row, client-side status filter only — no
 *  server round trip per filter change (§8 Patterns). Mutually exclusive with
 *  `InvestigationPortfolioEmptyState`. */
export function InvestigationPortfolioTable({
  investigations,
  statusFilter,
  onStatusFilterChange,
  lastActiveInvestigationId,
}: InvestigationPortfolioTableProps) {
  const filtered =
    statusFilter === 'all'
      ? investigations
      : investigations.filter((inv) => inv.status === statusFilter);

  return (
    <div className="investigation-portfolio-table">
      <div className="investigation-portfolio-table__filter">
        <label htmlFor="status-filter">Status</label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) =>
            onStatusFilterChange(e.target.value as InvestigationStatus | 'all')
          }
        >
          <option value="all">all</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {humanizeStatus(status)}
            </option>
          ))}
        </select>
      </div>
      <table className="investigation-portfolio-table__table">
        <thead>
          <tr>
            <th>Investigation</th>
            <th>status</th>
            <th>Created</th>
            <th>Status reason</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((inv) => {
            return (
              <tr key={inv.id} className="investigation-portfolio-table__row">
                <td>
                  <div className="investigation-portfolio-table__label">
                    {formatInvestigationLabel(inv.createdAt)}
                  </div>
                  <div className="data-value investigation-portfolio-table__id">
                    {shortenId(inv.id)}
                  </div>
                  {inv.status === 'brief-generated' ? (
                    <p className="investigation-portfolio-table__legacy-note">
                      Brief ready — review workspace not yet available.
                    </p>
                  ) : (
                    <a href={`/investigations/${inv.id}`} className="legacy-view-button">
                      Open current view
                    </a>
                  )}
                </td>
                <td className="data-value">{humanizeStatus(inv.status)}</td>
                <td className="data-value">{formatDateTime(inv.createdAt)}</td>
                <td>{inv.statusReason ? inv.statusReason : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
