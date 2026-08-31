import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    children?: ReactNode;
    onClick?: () => void;
  }) {
    return (
      <button type="button" onClick={props.onClick}>
        {props.children}
      </button>
    );
  },
}));

vi.mock('@ui/primitives/button', () => ({
  Button: function MockPrimitiveButton(props: {
    children?: ReactNode;
    onClick?: () => void;
  }) {
    return (
      <button type="button" onClick={props.onClick}>
        {props.children}
      </button>
    );
  },
}));

vi.mock('./AgentChatMessage', () => ({
  AgentChatMessage: function MockMessage({
    isRetryableUserPrompt,
    message,
  }: {
    isRetryableUserPrompt?: boolean;
    message: { id: string; content: string };
  }) {
    return (
      <div data-testid={`message-${message.id}`}>
        {message.content}
        {isRetryableUserPrompt ? (
          <button type="button">Retry message</button>
        ) : null}
      </div>
    );
  },
  UiActionRenderer: ({ isDisabled }: { isDisabled?: boolean }) => (
    <div
      data-testid={isDisabled ? 'ui-action-busy' : 'ui-action-interactive'}
      inert={isDisabled ? true : undefined}
    />
  ),
}));

vi.mock('./TimelineWorkGroup', () => ({
  TimelineWorkGroup: function MockWorkGroup({
    entry,
  }: {
    entry: { id: string };
  }) {
    return <div data-testid={`work-group-${entry.id}`} />;
  },
}));

vi.mock('./TimelineStreamingRow', () => ({
  TimelineStreamingRow: () => null,
}));

vi.mock('./AnimatedStatusText', () => ({
  AnimatedStatusText: () => null,
}));

import { AgentChatTimeline } from './AgentChatTimeline';

function buildFailedWorkGroup(
  id: string,
  detail: string,
): Extract<TimelineEntry, { kind: 'work-group' }> {
  return {
    createdAt: '2026-03-18T10:00:00.000Z',
    events: [
      {
        createdAt: '2026-03-18T10:00:00.000Z',
        detail,
        event: AgentWorkEventType.FAILED,
        id: `${id}-event`,
        label: 'Tool failed',
        status: AgentWorkEventStatus.FAILED,
        threadId: 't1',
        toolName: 'tool_a',
      },
    ],
    id,
    kind: 'work-group',
    presentation: 'archived',
    totalDurationMs: 1200,
  };
}

function buildSucceededWorkGroup(
  id: string,
): Extract<TimelineEntry, { kind: 'work-group' }> {
  return {
    createdAt: '2026-03-18T10:01:00.000Z',
    events: [
      {
        createdAt: '2026-03-18T10:01:00.000Z',
        event: AgentWorkEventType.TOOL_COMPLETED,
        id: `${id}-event`,
        label: 'Tool done',
        status: AgentWorkEventStatus.COMPLETED,
        threadId: 't1',
        toolName: 'tool_b',
      },
    ],
    id,
    kind: 'work-group',
    presentation: 'archived',
    totalDurationMs: 800,
  };
}

function buildAssistantMessage(
  id: string,
  content: string,
): Extract<TimelineEntry, { kind: 'assistant-message' }> {
  return {
    createdAt: '2026-03-18T10:02:00.000Z',
    id,
    kind: 'assistant-message',
    message: {
      content,
      createdAt: '2026-03-18T10:02:00.000Z',
      id,
      role: 'assistant',
      threadId: 't1',
    },
  };
}

function buildUserMessage(
  id: string,
  content: string,
): Extract<TimelineEntry, { kind: 'user-message' }> {
  return {
    createdAt: '2026-03-18T09:59:00.000Z',
    id,
    kind: 'user-message',
    message: {
      content,
      createdAt: '2026-03-18T09:59:00.000Z',
      id,
      role: 'user',
      threadId: 't1',
    },
  };
}

const baseProps = {
  apiService: {} as never,
  highlightedMessageId: null,
  isBusy: false,
  isGenerating: false,
  isStreamingActive: false,
  messagesEndRef: { current: null },
  onCopy: vi.fn(),
  onRetry: vi.fn(),
  onSelectIngredient: vi.fn(),
  onUiAction: vi.fn(),
  pendingUiActions: [],
};

describe('AgentChatTimeline failure card', () => {
  it('offers retry only on the user prompt that owns the terminal failure', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        timeline={[
          buildUserMessage('user-old', 'Earlier successful prompt'),
          buildSucceededWorkGroup('wg-ok'),
          buildUserMessage('user-failed', 'Latest failed prompt'),
          buildFailedWorkGroup('wg-fail', 'status code 503'),
        ]}
        onRetryLastFailedRun={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('message-user-failed').querySelector('button'),
    ).toHaveTextContent('Retry message');
    expect(
      screen.getByTestId('message-user-old').querySelector('button'),
    ).toBeNull();
  });

  it('does not offer prompt retry after a successful terminal run', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        timeline={[
          buildUserMessage('user-ok', 'Successful prompt'),
          buildSucceededWorkGroup('wg-ok'),
        ]}
      />,
    );

    expect(screen.queryByText('Retry message')).toBeNull();
  });

  it('renders the failure card only when the terminal entry is a failed work group', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        timeline={[
          buildSucceededWorkGroup('wg-ok'),
          buildFailedWorkGroup('wg-fail', 'status code 503'),
        ]}
        onRetryLastFailedRun={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Provider temporarily unavailable')).toBeTruthy();
  });

  it('does not render an older failure when the terminal work group succeeded', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        timeline={[
          buildFailedWorkGroup('wg-old-fail', 'status code 503'),
          buildSucceededWorkGroup('wg-ok'),
        ]}
        onRetryLastFailedRun={vi.fn()}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not render a failure card when the terminal entry is an assistant message', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        timeline={[
          buildFailedWorkGroup('wg-old-fail', 'status code 503'),
          buildAssistantMessage('msg-1', 'Recovered answer'),
        ]}
        onRetryLastFailedRun={vi.fn()}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides the timeline failure card when a generation card already owns the error', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        hasDockedGenerationCard
        timeline={[
          buildFailedWorkGroup(
            'wg-fail',
            'Failed to respond to UI action: 403 - Organization context is required',
          ),
        ]}
        onRetryLastFailedRun={vi.fn()}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides the failure card while generating or streaming', () => {
    const { rerender } = render(
      <AgentChatTimeline
        {...baseProps}
        isGenerating
        timeline={[buildFailedWorkGroup('wg-fail', 'status code 503')]}
        onRetryLastFailedRun={vi.fn()}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();

    rerender(
      <AgentChatTimeline
        {...baseProps}
        isStreamingActive
        timeline={[buildFailedWorkGroup('wg-fail', 'status code 503')]}
        onRetryLastFailedRun={vi.fn()}
      />,
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('makes pending structured actions inert while busy', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        isBusy
        pendingUiActions={[
          {
            id: 'pending-schedule',
            title: 'Schedule post',
            type: 'schedule_post_card',
          } as never,
        ]}
        timeline={[]}
      />,
    );

    expect(screen.getByTestId('ui-action-busy')).toHaveAttribute('inert');
  });
});
