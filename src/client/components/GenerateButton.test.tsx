import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GenerateButton } from './GenerateButton.js';

// Render/behavior coverage for GenerateButton (04-ROADMAP.md C2-S3 Tests list).
//
// GenerateButton itself is a pure, shared, presentational component (label/enabled/onClick props
// only) — it owns no API call, no in-flight state, and no error state of its own. Those behaviors
// belong to its host panels (OpenEligiblePanel's `handleStart`, GenerationFailedPanel's
// `handleRetry`), which each call the real `createGenerationRun` connector API function, manage
// their own `starting`/`error` state, and pass the resulting `enabled`/`onClick` down. This suite
// tests GenerateButton's actual, real contract — that it renders the given label, reflects the
// given `enabled` prop as its `disabled` attribute, and invokes `onClick` on a real click — the
// disabled/loading and API-call/error behavior described in the task prompt is real, but is
// exercised via the parent panels' own props here, since GenerateButton has no internal state to
// assert against directly.

afterEach(() => cleanup());

describe('GenerateButton', () => {
  it('renders the given label and calls onClick on a real click when enabled', () => {
    const onClick = vi.fn();
    render(<GenerateButton label="Start generation" enabled onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Start generation' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reflects enabled: false as a real disabled attribute and does not call onClick on click', () => {
    const onClick = vi.fn();
    render(<GenerateButton label="Retry generation" enabled={false} onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Retry generation' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders the same underlying component for both the "Start generation" and "Retry generation" labels (one shared component, two label states)', () => {
    const { rerender } = render(
      <GenerateButton label="Start generation" enabled onClick={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Start generation' })).toHaveClass('generate-button');

    rerender(<GenerateButton label="Retry generation" enabled onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Retry generation' })).toHaveClass('generate-button');
  });
});
