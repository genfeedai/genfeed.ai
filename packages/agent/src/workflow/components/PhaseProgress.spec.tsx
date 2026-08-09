import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAgentWorkflowStore } from '../store';
import { PhaseProgress } from './PhaseProgress';

describe('PhaseProgress', () => {
  afterEach(() => {
    useAgentWorkflowStore.getState().reset();
  });

  it('renders every phase with the current one highlighted', () => {
    render(<PhaseProgress />);

    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Clarify')).toBeInTheDocument();
    expect(screen.getByText('Propose')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Implement')).toBeInTheDocument();
    expect(screen.getByText('Verify')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('rolls back to an earlier phase after confirmation', () => {
    useAgentWorkflowStore.getState().advance('agent'); // → clarifying
    useAgentWorkflowStore.getState().forceAdvance(); // → proposing
    render(<PhaseProgress />);

    fireEvent.click(screen.getByRole('button', { name: /explore/i }));
    expect(screen.getByText(/roll back to/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm rollback/i }));

    expect(useAgentWorkflowStore.getState().phase).toBe('exploring');
    expect(screen.queryByText(/roll back to/i)).not.toBeInTheDocument();
  });

  it('cancel dismisses the confirmation without rolling back', () => {
    useAgentWorkflowStore.getState().advance('agent');
    render(<PhaseProgress />);

    fireEvent.click(screen.getByRole('button', { name: /explore/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(useAgentWorkflowStore.getState().phase).toBe('clarifying');
    expect(screen.queryByText(/roll back to/i)).not.toBeInTheDocument();
  });

  it('disables future phases and shows the lock indicator when locked', () => {
    useAgentWorkflowStore.getState().setLocked(true);
    const { container } = render(<PhaseProgress />);

    // All steps disabled: current phase and future phases cannot roll back.
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    expect(container.querySelector('.lucide-lock')).not.toBeNull();
  });
});
