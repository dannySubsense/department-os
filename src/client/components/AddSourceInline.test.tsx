import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AddSourceInline } from './AddSourceInline.js';
import * as api from '../api.js';

// Render/behavior coverage for AddSourceInline (04-ROADMAP.md C2-S2 Tests list) — asserts it
// calls the real, extended `addSourcesToInvestigation` wrapper (POST /api/investigations), never
// a fabricated success, and triggers a workspace re-fetch rather than a navigation.

vi.mock('../api.js', () => ({
  addSourcesToInvestigation: vi.fn(),
  CreateInvestigationApiError: class CreateInvestigationApiError extends Error {
    code: string;
    constructor(code: string, _status?: unknown, message?: string) {
      super(message ?? code);
      this.code = code;
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.mocked(api.addSourcesToInvestigation).mockReset();
});

describe('AddSourceInline', () => {
  it('submitting a source calls addSourcesToInvestigation with the given investigationId and triggers onSubmitted (workspace re-fetch, not navigation)', async () => {
    vi.mocked(api.addSourcesToInvestigation).mockResolvedValue({
      investigationId: 'inv-1',
      status: 'open',
      sourcesAdded: 1,
    });
    const onSubmitted = vi.fn();
    render(<AddSourceInline investigationId="inv-1" onSubmitted={onSubmitted} />);

    fireEvent.change(screen.getByLabelText('Source content'), {
      target: { value: 'https://example.com/new' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(api.addSourcesToInvestigation).toHaveBeenCalledWith('inv-1', [
      { type: 'url', raw: 'https://example.com/new' },
    ]);
  });

  it('renders an inline error and does not call onSubmitted when the real endpoint rejects', async () => {
    vi.mocked(api.addSourcesToInvestigation).mockRejectedValue(new Error('submission-failed'));
    const onSubmitted = vi.fn();
    render(<AddSourceInline investigationId="inv-1" onSubmitted={onSubmitted} />);

    fireEvent.change(screen.getByLabelText('Source content'), {
      target: { value: 'https://example.com/new' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('submission-failed'));
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('rejects an empty submission client-side without calling the API at all', async () => {
    const onSubmitted = vi.fn();
    render(<AddSourceInline investigationId="inv-1" onSubmitted={onSubmitted} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('At least one source is required.'),
    );
    expect(api.addSourcesToInvestigation).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});
