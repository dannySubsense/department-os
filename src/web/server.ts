import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { submitSources } from '../services/submitSources.js';
import type { SourceArtifactType } from '../types/domain.js';
import {
  renderSubmissionScreen,
  renderInvestigationGeneratingScreen,
  type SubmissionFormRow,
  type InvestigationSourceForDisplay,
} from './views.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Submission Screen (03-UI-SPEC.md "Screen: Submission Screen")
app.get('/investigations/new', (req, res) => {
  const investigationId =
    typeof req.query.investigationId === 'string' ? req.query.investigationId : undefined;
  res.send(renderSubmissionScreen({ investigationId }));
});

// Submit sources (03-UI-SPEC.md "Interactions > Submit sources")
app.post('/investigations', async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const rawTypes = normalizeToArray(body.type);
  const rawValues = normalizeToArray(body.raw);
  const investigationId =
    typeof body.investigationId === 'string' && body.investigationId.length > 0
      ? body.investigationId
      : undefined;

  const rows: SubmissionFormRow[] = rawValues.map((raw, i) => ({
    type: (rawTypes[i] as SourceArtifactType) ?? 'url',
    raw,
  }));

  const artifacts = rows
    .filter((row) => row.raw.trim().length > 0)
    .map((row) => ({ type: row.type as SourceArtifactType, raw: row.raw.trim() }));

  // Server-side enforcement (US-1 AC3) — required even though the client also disables the
  // submit control until content exists, per UI Spec's explicit both-layers requirement.
  if (artifacts.length === 0) {
    res.status(400).send(
      renderSubmissionScreen({
        investigationId,
        rows: rows.length > 0 ? rows : undefined,
        errorMessage: 'At least one source is required.',
      }),
    );
    return;
  }

  try {
    const submission = await submitSources({
      investigationId,
      origin: 'human',
      artifacts,
    });
    // Redirect target IS the Generating state — there is no separate confirmation screen (Q-7).
    res.redirect(303, `/investigations/${submission.investigationId}`);
  } catch (err) {
    res.status(500).send(
      renderSubmissionScreen({
        investigationId,
        rows,
        errorMessage: err instanceof Error ? err.message : 'Submission failed.',
      }),
    );
  }
});

// Investigation Screen — Generating State only, this slice (03-UI-SPEC.md
// "Investigation Screen — Generating State"). Blocked/Generation-Failed/Completed states are
// built in later slices (3, 9/10).
//
// Express 4.x does not forward a rejected promise from an async handler to error middleware —
// an unhandled rejection results and the request hangs forever. Wrap in try/catch so a DB error
// produces a real response instead of hanging (this is the single durable URL Q-7 rests on).
app.get('/investigations/:id', async (req, res) => {
  const investigationId = req.params.id;

  try {
    const investigationResult = await pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM investigation WHERE id = $1',
      [investigationId],
    );
    if (investigationResult.rowCount === 0) {
      res.status(404).send('Investigation not found');
      return;
    }
    const status = investigationResult.rows[0].status;

    const sourcesResult = await pool.query<{
      type: string;
      raw: string;
      resolution_status: InvestigationSourceForDisplay['status'];
      resolution_failure_reason: string | null;
      resolution_no_content_reason: string | null;
    }>(
      `SELECT type, raw, resolution_status, resolution_failure_reason, resolution_no_content_reason
       FROM source_artifact WHERE investigation_id = $1 ORDER BY added_at ASC`,
      [investigationId],
    );

    const sources: InvestigationSourceForDisplay[] = sourcesResult.rows.map((row) => ({
      type: row.type,
      raw: row.raw,
      status: row.resolution_status,
      failureReason: row.resolution_failure_reason ?? undefined,
      noContentReason: row.resolution_no_content_reason ?? undefined,
    }));

    res.send(renderInvestigationGeneratingScreen(investigationId, status, sources));
  } catch (err) {
    res.status(500).send('Internal server error.');
  }
});

function normalizeToArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [String(value)];
}

if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.listen(port, () => {
    console.log(`Department OS — Problem Department dev server listening on :${port}`);
  });
}
