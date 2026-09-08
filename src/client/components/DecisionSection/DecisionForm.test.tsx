import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DecisionForm } from './DecisionForm.js';

// Component coverage for DecisionForm (04-ROADMAP.md C2-S5 Tests list).

afterEach(() => cleanup());

describe('DecisionForm', () => {
  it('Watch submit stays disabled with zero conditions', () => {
    const onSubmit = vi.fn();
    render(<DecisionForm pending={false} error={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    expect(screen.getByRole('button', { name: 'Submit Watch' })).toBeDisabled();
  });

  it('Watch submit stays disabled with a whitespace-only condition description', () => {
    const onSubmit = vi.fn();
    render(<DecisionForm pending={false} error={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    fireEvent.change(screen.getByLabelText('Condition description'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Submit Watch' })).toBeDisabled();
  });

  it('Watch submit becomes enabled once a non-whitespace condition description is entered', () => {
    const onSubmit = vi.fn();
    render(<DecisionForm pending={false} error={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));
    fireEvent.change(screen.getByLabelText('Condition description'), {
      target: { value: 'a competitor launches a similar product' },
    });
    expect(screen.getByRole('button', { name: 'Submit Watch' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Submit Watch' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'Watch',
        reconsiderationConditions: [
          expect.objectContaining({ description: 'a competitor launches a similar product' }),
        ],
      }),
    );
  });

  it('Approve is enabled as soon as the type is selected, with no condition required', () => {
    const onSubmit = vi.fn();
    render(<DecisionForm pending={false} error={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('button', { name: 'Submit Approve' })).not.toBeDisabled();
  });

  it('Reject is enabled as soon as the type is selected, with no condition required', () => {
    const onSubmit = vi.fn();
    render(<DecisionForm pending={false} error={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByRole('button', { name: 'Submit Reject' })).not.toBeDisabled();
  });
});
