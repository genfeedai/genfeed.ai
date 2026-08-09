import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentWorkflowStore } from '../store';
import type { Approach } from '../types';
import { ApprovalPanel } from './ApprovalPanel';

function makeApproach(overrides: Partial<Approach> = {}): Approach {
  return {
    description: 'Reuse the existing scheduler',
    id: 'approach-1',
    recommended: false,
    title: 'Extend the scheduler',
    tradeoffs: { cons: ['Couples modules'], pros: ['Fast to ship'] },
    ...overrides,
  };
}

function resetStore(): void {
  useAgentWorkflowStore.setState({
    approaches: [],
    isLocked: false,
    messages: [],
    phase: 'awaiting_approval',
    selectedApproachId: null,
    transitions: [],
  });
}

describe('ApprovalPanel', () => {
  beforeEach(() => {
    resetStore();
  });

  it('lists every approach from the store', () => {
    useAgentWorkflowStore.setState({
      approaches: [
        makeApproach(),
        makeApproach({ id: 'approach-2', title: 'Rewrite the scheduler' }),
      ],
    });

    render(<ApprovalPanel />);

    expect(screen.getByText('Extend the scheduler')).toBeInTheDocument();
    expect(screen.getByText('Rewrite the scheduler')).toBeInTheDocument();
  });

  it('hides the approve row until an approach is selected', () => {
    useAgentWorkflowStore.setState({ approaches: [makeApproach()] });

    render(<ApprovalPanel />);

    expect(
      screen.queryByRole('button', { name: /Approve & proceed/ }),
    ).not.toBeInTheDocument();
  });

  it('selects an approach through the store when a card is clicked', () => {
    useAgentWorkflowStore.setState({ approaches: [makeApproach()] });

    render(<ApprovalPanel />);
    fireEvent.click(screen.getByText('Extend the scheduler'));

    expect(useAgentWorkflowStore.getState().selectedApproachId).toBe(
      'approach-1',
    );
  });

  it('records an approval message and advances the phase on approve', () => {
    useAgentWorkflowStore.setState({
      approaches: [makeApproach()],
      selectedApproachId: 'approach-1',
    });

    render(<ApprovalPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Approve & proceed/ }));

    const state = useAgentWorkflowStore.getState();

    expect(state.messages.at(-1)?.content).toBe(
      'Approved approach: "Extend the scheduler"',
    );
    expect(state.phase).toBe('implementing');
  });

  it('records a change request without approving', () => {
    useAgentWorkflowStore.setState({
      approaches: [makeApproach()],
      selectedApproachId: 'approach-1',
    });

    render(<ApprovalPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Request changes/ }));

    const state = useAgentWorkflowStore.getState();

    expect(state.messages.at(-1)?.content).toBe(
      'Requesting changes to the proposed approaches.',
    );
    expect(state.phase).toBe('awaiting_approval');
  });

  it('disables the actions while the workflow is locked', () => {
    useAgentWorkflowStore.setState({
      approaches: [makeApproach()],
      isLocked: true,
      selectedApproachId: 'approach-1',
    });

    render(<ApprovalPanel />);

    expect(
      screen.getByRole('button', { name: /Approve & proceed/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Request changes/ }),
    ).toBeDisabled();
  });
});
