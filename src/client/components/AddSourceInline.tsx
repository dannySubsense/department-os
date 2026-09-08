import { useState } from 'react';
import { addSourcesToInvestigation, CreateInvestigationApiError } from '../api.js';

interface ArtifactRow {
  type: string;
  raw: string;
}

interface AddSourceInlineProps {
  investigationId: string;
  onSubmitted: () => void; // triggers a workspace re-fetch, never a navigation
}

/** Its OWN small form component (02-ARCHITECTURE.md §5.3) — not a reuse of
 *  `StartInvestigationForm`, which has no `investigationId` prop and always calls
 *  `createInvestigation` with `investigationId` omitted. Calls
 *  `addSourcesToInvestigation(investigationId, artifacts)`, a thin wrapper that always supplies
 *  `investigationId` to the EXISTING, extended `POST /api/investigations` route. No `:id/sources`
 *  sub-route exists or is added. On success, triggers a workspace re-fetch — never a navigation,
 *  since the operator is already at the destination. */
export function AddSourceInline({ investigationId, onSubmitted }: AddSourceInlineProps) {
  const [rows, setRows] = useState<ArtifactRow[]>([{ type: 'url', raw: '' }]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, field: keyof ArtifactRow, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { type: 'url', raw: '' }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const artifacts = rows
      .filter((row) => row.raw.trim().length > 0)
      .map((row) => ({ type: row.type, raw: row.raw.trim() }));

    if (artifacts.length === 0) {
      setError('At least one source is required.');
      return;
    }

    setPending(true);
    setError(null);
    try {
      await addSourcesToInvestigation(investigationId, artifacts);
      setRows([{ type: 'url', raw: '' }]);
      onSubmitted();
    } catch (err) {
      if (err instanceof CreateInvestigationApiError) {
        setError(err.message);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="add-source-inline" onSubmit={handleSubmit}>
      <h3 className="add-source-inline__label">Add a source</h3>
      {rows.map((row, index) => (
        <div className="add-source-inline__row" key={index}>
          <select
            aria-label="Source type"
            value={row.type}
            onChange={(e) => updateRow(index, 'type', e.target.value)}
          >
            <option value="url">url</option>
            <option value="text">text</option>
          </select>
          <input
            type="text"
            aria-label="Source content"
            placeholder="URL or text…"
            value={row.raw}
            onChange={(e) => updateRow(index, 'raw', e.target.value)}
          />
        </div>
      ))}
      <div className="add-source-inline__actions">
        <button type="button" onClick={addRow} disabled={pending}>
          + Add another
        </button>
        <button type="submit" disabled={pending}>
          {pending ? 'Submitting…' : 'Add source'}
        </button>
      </div>
      {error ? (
        <p className="add-source-inline__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
