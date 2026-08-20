import type { InvestigationSummary } from '../../types/readModels.js';
import type { InvestigationStatus } from '../../types/domain.js';

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
              {status}
            </option>
          ))}
        </select>
      </div>
      <table className="investigation-portfolio-table__table">
        <thead>
          <tr>
            <th>id</th>
            <th>status</th>
            <th>Created</th>
            <th>Status reason</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((inv) => {
            const isLastActive = inv.id === lastActiveInvestigationId;
            return (
              <tr key={inv.id} className="investigation-portfolio-table__row">
                <td className="data-value">
                  {isLastActive ? (
                    <>
                      <span className="data-value">{inv.id}</span>{' '}
                      <a href={`/investigations/${inv.id}`} className="data-value">
                        View current status
                      </a>
                    </>
                  ) : (
                    inv.id
                  )}
                </td>
                <td className="data-value">{inv.status}</td>
                <td className="data-value">{inv.createdAt}</td>
                <td>{inv.statusReason ? inv.statusReason : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
