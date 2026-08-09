import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentWorkflowStore } from '../store';
import type { PhaseTransition } from '../types';
import { PhaseTransitionLog } from './PhaseTransitionLog';

function makeTransition(
  overrides: Partial<PhaseTransition> = {},
): PhaseTransition {
  return {
    actor: 'agent',
    from: 'exploring',
    id: 't-1',
    timestamp: Date.UTC(2026, 0, 1, 12, 30, 45),
    to: 'clarifying',
    trigger: 'gate_met',
    ...overrides,
  };
}

function setTransitions(transitions: PhaseTransition[]): void {
  useAgentWorkflowStore.setState({ transitions });
}

describe('PhaseTransitionLog', () => {
  beforeEach(() => {
    setTransitions([]);
  });

  it('renders nothing when there are no transitions', () => {
    const { container } = render(<PhaseTransitionLog />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the transition count collapsed by default', () => {
    setTransitions([
      makeTransition(),
      makeTransition({ from: 'clarifying', id: 't-2', to: 'proposing' }),
    ]);

    render(<PhaseTransitionLog />);

    expect(screen.getByText('Transition log (2)')).toBeInTheDocument();
    expect(screen.queryByText('Explore')).not.toBeInTheDocument();
  });

  it('expands and collapses the entries on click', () => {
    setTransitions([makeTransition()]);

    render(<PhaseTransitionLog />);
    const toggle = screen.getByRole('button');

    fireEvent.click(toggle);
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Clarify')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText('Explore')).not.toBeInTheDocument();
  });

  it('labels each trigger kind with its actor', () => {
    setTransitions([
      makeTransition({ actor: 'agent', id: 't-1', trigger: 'gate_met' }),
      makeTransition({ actor: 'user', id: 't-2', trigger: 'force_advance' }),
      makeTransition({
        actor: 'user',
        from: 'proposing',
        id: 't-3',
        to: 'exploring',
        trigger: 'rollback',
      }),
    ]);

    render(<PhaseTransitionLog />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Gate met · agent')).toBeInTheDocument();
    expect(screen.getByText('Force advance · user')).toBeInTheDocument();
    expect(screen.getByText('Rollback · user')).toBeInTheDocument();
  });
});
