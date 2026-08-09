import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentWorkflowStore } from '../store';
import type { AgentWorkflowState } from '../types';
import { AgentWorkflow } from './AgentWorkflow';

function setState(overrides: Partial<AgentWorkflowState>): void {
  useAgentWorkflowStore.setState({
    approaches: [],
    isLocked: false,
    messages: [],
    phase: 'exploring',
    questions: [],
    selectedApproachId: null,
    transitions: [],
    verificationEvidence: [],
    ...overrides,
  });
}

describe('AgentWorkflow', () => {
  beforeEach(() => {
    setState({});
  });

  it('renders the exploring view first', () => {
    render(<AgentWorkflow />);

    expect(
      screen.getByText(
        'Agent is exploring context and reading relevant files…',
      ),
    ).toBeInTheDocument();
  });

  it('renders the proposing view', () => {
    setState({ phase: 'proposing' });

    render(<AgentWorkflow />);

    expect(
      screen.getByText('Agent is crafting approaches based on your answers…'),
    ).toBeInTheDocument();
  });

  it('renders the implementing view', () => {
    setState({ phase: 'implementing' });

    render(<AgentWorkflow />);

    expect(
      screen.getByText('Agent is implementing the approved approach…'),
    ).toBeInTheDocument();
  });

  it('renders the complete view with no manual controls', () => {
    setState({ phase: 'complete' });

    render(<AgentWorkflow />);

    expect(screen.getByText('Workflow complete')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Force advance/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Advance/ }),
    ).not.toBeInTheDocument();
  });

  it('prompts for questions in the clarifying phase when none exist yet', () => {
    setState({ phase: 'clarifying' });

    render(<AgentWorkflow />);

    expect(
      screen.getByText('Waiting for agent to ask questions…'),
    ).toBeInTheDocument();
    expect(screen.getByText('0/0 answered')).toBeInTheDocument();
  });

  it('shows the first unanswered question and the answered ones below', () => {
    setState({
      phase: 'clarifying',
      questions: [
        {
          answer: 'Instagram',
          id: 'q-1',
          text: 'Platform?',
          type: 'free_text',
        },
        { id: 'q-2', text: 'Cadence?', type: 'free_text' },
      ],
    });

    render(<AgentWorkflow />);

    expect(screen.getByText('1/2 answered')).toBeInTheDocument();
    expect(screen.getByText('Cadence?')).toBeInTheDocument();
    expect(screen.getByText('Platform?')).toBeInTheDocument();
    expect(screen.getByText('Answered: Instagram')).toBeInTheDocument();
  });

  it('confirms the clarifying gate once every question is answered', () => {
    setState({
      phase: 'clarifying',
      questions: [
        {
          answer: 'Instagram',
          id: 'q-1',
          text: 'Platform?',
          type: 'free_text',
        },
      ],
    });

    render(<AgentWorkflow />);

    expect(
      screen.getByText(
        'All questions answered. Agent will propose approaches next.',
      ),
    ).toBeInTheDocument();
  });

  it('offers force advance while the gate is unmet', () => {
    setState({
      phase: 'clarifying',
      questions: [{ id: 'q-1', text: 'Platform?', type: 'free_text' }],
    });

    render(<AgentWorkflow />);
    fireEvent.click(screen.getByRole('button', { name: /Force advance/ }));

    expect(useAgentWorkflowStore.getState().phase).toBe('proposing');
  });

  it('hides force advance while the workflow is locked', () => {
    setState({
      isLocked: true,
      phase: 'clarifying',
      questions: [{ id: 'q-1', text: 'Platform?', type: 'free_text' }],
    });

    render(<AgentWorkflow />);

    expect(
      screen.queryByRole('button', { name: /Force advance/ }),
    ).not.toBeInTheDocument();
  });

  it('offers advance once the clarifying gate is met', () => {
    setState({
      phase: 'clarifying',
      questions: [
        {
          answer: 'Instagram',
          id: 'q-1',
          text: 'Platform?',
          type: 'free_text',
        },
      ],
    });

    render(<AgentWorkflow />);
    fireEvent.click(screen.getByRole('button', { name: /^Advance/ }));

    expect(useAgentWorkflowStore.getState().phase).toBe('proposing');
  });

  it('leaves approval and verification to their own panels', () => {
    setState({
      approaches: [
        {
          description: 'Reuse it',
          id: 'a-1',
          recommended: true,
          title: 'Extend the scheduler',
          tradeoffs: { cons: [], pros: [] },
        },
      ],
      phase: 'awaiting_approval',
      selectedApproachId: 'a-1',
    });

    render(<AgentWorkflow />);

    expect(
      screen.getByText('Select & approve an approach'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Advance/ }),
    ).not.toBeInTheDocument();
  });
});
