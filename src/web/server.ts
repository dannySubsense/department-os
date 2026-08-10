import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { submitSources } from '../services/submitSources.js';
import { resolveInvestigationSources } from '../services/resolveInvestigationSources.js';
import { getInvestigation } from '../services/getInvestigation.js';
import type { SourceArtifactType } from '../types/domain.js';
import {
  renderSubmissionScreen,
  renderInvestigationGeneratingScreen,
  renderInvestigationBlockedScreen,
  renderInvestigationGenerationFailedScreen,
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

    // Resolution trigger point (Slice 3 judgment call, no background-job infra exists in this
    // codebase yet): resolve this Investigation's sources synchronously, right here, before
    // redirecting — rather than truly asynchronously/backgrounded per 03-UI-SPEC.md Flow 1's
    // "begins source resolution ... asynchronously" framing. This keeps the flow deterministic
    // and testable without introducing a job queue for the MVP; it does mean the POST response
    // is only sent once every submitted source has been fetched/checked. If `allUnreachable`,
    // transition the Investigation to 'blocked' here — `resolveInvestigationSources` deliberately
    // does not do this itself (Architecture §4 separation of concerns).
    const { allUnreachable } = await resolveInvestigationSources(submission.investigationId);
    if (allUnreachable) {
      await pool.query(
        `UPDATE investigation SET status = 'blocked', status_reason = $2 WHERE id = $1`,
        [submission.investigationId, 'No submitted source was reachable.'],
      );
    } else {
      // Blocked -> Open recovery (Slice 3 fix): at least one of this Investigation's sources is
      // now reachable. Only the 'blocked' status is eligible for this transition — 'open' is a
      // no-op, and 'generation-failed' / 'brief-generated' are unrelated states this logic must
      // not touch (they are not reachability-driven).
      await pool.query(
        `UPDATE investigation SET status = 'open', status_reason = NULL
         WHERE id = $1 AND status = 'blocked'`,
        [submission.investigationId],
      );
    }

    // Redirect target IS the Investigation Screen — there is no separate confirmation screen
    // (Q-7). It renders whichever state (Generating/Blocked) the resolution above produced.
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
    const { investigation, sourceArtifacts } = await getInvestigation(investigationId);

    const sources: InvestigationSourceForDisplay[] = sourceArtifacts.map((artifact) => ({
      type: artifact.type,
      raw: artifact.raw,
      status: artifact.resolution.status,
      failureReason: artifact.resolution.failureReason,
      noContentReason: artifact.resolution.noContentReason,
    }));

    switch (investigation.status) {
      case 'open':
        res.send(
          renderInvestigationGeneratingScreen(investigationId, investigation.status, sources),
        );
        return;
      case 'blocked':
        res.send(
          renderInvestigationBlockedScreen(investigationId, sources, investigation.statusReason),
        );
        return;
      case 'generation-failed':
        res.send(
          renderInvestigationGenerationFailedScreen(investigationId, investigation.statusReason),
        );
        return;
      case 'brief-generated':
        // Live wiring (problemBriefId -> currentVersionId -> getBriefForReview) does not exist
        // until Slice 9/10 — this branch is not exercised end-to-end yet (04-ROADMAP.md Slice 3).
        res.status(501).send('Brief review surface is not implemented yet.');
        return;
    }
  } catch (err) {
    if (err instanceof Error && /does not exist$/.test(err.message)) {
      res.status(404).send('Investigation not found');
      return;
    }
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
