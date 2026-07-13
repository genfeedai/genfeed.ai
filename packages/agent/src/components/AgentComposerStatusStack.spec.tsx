import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AgentComposerStatusStack } from './AgentComposerStatusStack';

const baseProps = {
  error: null,
  isSubmittingInputRequest: false,
  latestProposedPlan: null,
  onClearError: vi.fn(),
  onSubmitInputRequest: vi.fn(),
  pendingInputRequest: null,
  socketConnectionState: 'connected' as const,
};

describe('AgentComposerStatusStack', () => {
  it('renders determinate progress only for a measurable value', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={{
          createdAt: '2026-07-13T00:00:00.000Z',
          event: AgentWorkEventType.TOOL_STARTED,
          id: 'event-1',
          label: 'Rendering frames',
          progress: 42,
          status: AgentWorkEventStatus.RUNNING,
          threadId: 'thread-1',
        }}
      />,
    );

    expect(
      screen.getByRole('progressbar', { name: 'Rendering frames progress' }),
    ).toHaveAttribute('aria-valuetext', '42 percent');
  });

  it('uses activity status without inventing a percentage', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={{
          createdAt: '2026-07-13T00:00:00.000Z',
          event: AgentWorkEventType.TOOL_STARTED,
          id: 'event-1',
          label: 'Researching sources',
          status: AgentWorkEventStatus.RUNNING,
          threadId: 'thread-1',
        }}
      />,
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('labels reconnect recovery without exposing prompt contents', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={null}
        socketConnectionState="offline"
      />,
    );

    expect(
      screen.getByText('Offline. Your draft is safe; sending is paused.'),
    ).toBeInTheDocument();
  });
});
