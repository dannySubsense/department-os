import { useState } from 'react';
import { createInvestigation } from '../api.js';

interface ArtifactRow {
  type: string;
  raw: string;
}

interface StartInvestigationFormProps {
  onSubmitted: (investigationId: string) => void; // triggers parent's re-fetch (US-5 AC2)
}

/** Presentational form wrapping `POST /api/investigations`. Mounted once and reused in both the
 *  empty-state and non-empty layouts (04-ROADMAP.md Slice 2 Implementation Notes — one component,
 *  not two). On success, clears and calls `onSubmitted`; on failure, renders an inline error and
 *  preserves the entered values (03-UI-SPEC.md Start Investigation Submission). */
export function StartInvestigationForm({ onSubmitted }: StartInvestigationFormProps) {
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
      const result = await createInvestigation({ artifacts });
      setRows([{ type: 'url', raw: '' }]);
      onSubmitted(result.investigationId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="start-investigation-form" onSubmit={handleSubmit}>
      <h3 className="start-investigation-form__label">Start Investigation</h3>
      {rows.map((row, index) => (
        <div className="start-investigation-form__row" key={index}>
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
      <div className="start-investigation-form__actions">
        <button type="button" onClick={addRow} disabled={pending}>
          + Add source
        </button>
        <button type="submit" disabled={pending}>
          {pending ? 'Submitting…' : 'Start Investigation'}
        </button>
      </div>
      {error ? (
        <p className="start-investigation-form__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
