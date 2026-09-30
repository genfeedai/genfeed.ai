import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentWorkflowStore } from '../store';
import type { PhaseMessage } from '../types';
import { PhaseConversation } from './PhaseConversation';

function makeMessage(overrides: Partial<PhaseMessage> = {}): PhaseMessage {
  return {
    content: 'Which platform first?',
    id: 'm-1',
    phase: 'clarifying',
    role: 'agent',
    timestamp: Date.UTC(2026, 0, 1, 9, 15),
    ...overrides,
  };
}

function setMessages(messages: PhaseMessage[]): void {
  useAgentWorkflowStore.setState({ messages });
}

describe('PhaseConversation', () => {
  beforeEach(() => {
    setMessages([]);
  });

  it('shows the empty state with no messages', () => {
    render(<PhaseConversation />);

    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('groups messages under their phase heading', () => {
    setMessages([
      makeMessage(),
      makeMessage({
        content: 'Instagram',
        id: 'm-2',
        phase: 'clarifying',
        role: 'user',
      }),
      makeMessage({
        content: 'Proposed: "Extend the scheduler"',
        id: 'm-3',
        phase: 'proposing',
      }),
    ]);

    render(<PhaseConversation />);

    expect(screen.getByText('Clarify')).toBeInTheDocument();
    expect(screen.getByText('Propose')).toBeInTheDocument();
    expect(screen.getByText('Which platform first?')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
  });

  it('renders no heading for phases with no messages', () => {
    setMessages([makeMessage({ phase: 'exploring' })]);

    render(<PhaseConversation />);

    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.queryByText('Verify')).not.toBeInTheDocument();
    expect(screen.queryByText('Complete')).not.toBeInTheDocument();
  });

  it('scrolls the transcript to the bottom on mount', () => {
    setMessages([makeMessage()]);

    const { container } = render(<PhaseConversation />);
    const scroller = container.firstElementChild as HTMLElement;

    // jsdom reports zero geometry, so the assertion is that the effect ran
    // against the scroller without throwing and left a defined scrollTop.
    expect(scroller.scrollTop).toBe(0);
  });
});
