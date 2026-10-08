import {
  type AgentUiAction,
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import { fireEvent, render, screen } from '@testing-library/react';
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
    deferNextSteps,
    message,
  }: {
    isRetryableUserPrompt?: boolean;
    deferNextSteps?: boolean;
    message: { id: string; content: string };
  }) {
    return (
      <div
        data-testid={`message-${message.id}`}
        data-defer-next-steps={deferNextSteps}
      >
        {message.content}
        {isRetryableUserPrompt ? (
          <button type="button">Retry message</button>
        ) : null}
      </div>
    );
  },
  UiActionRenderer: ({
    isDisabled,
    action,
  }: {
    isDisabled?: boolean;
    action: AgentUiAction;
  }) => (
    <div
      data-testid={isDisabled ? 'ui-action-busy' : 'ui-action-interactive'}
      data-action-type={action.type}
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

  it('shows a terminal failure without offering an unsafe prompt retry', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        timeline={[
          buildUserMessage('user-failed', 'Latest failed prompt'),
          buildFailedWorkGroup('wg-fail', 'Provider authentication failed'),
        ]}
        onRetryLastFailedRun={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Retry message')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
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

describe('completed turn output focus', () => {
  it('hides intermediate copy and work until Steps is expanded, preserving all outputs', () => {
    const output = buildAssistantMessage('output', 'Generated image');
    output.message.metadata = {
      uiActions: [
        { id: 'image', title: 'Generated image', type: 'content_preview_card' },
      ],
    };
    render(
      <AgentChatTimeline
        {...baseProps}
        timeline={[
          buildUserMessage('prompt', 'Generate images'),
          buildAssistantMessage('progress', 'Checking references'),
          buildSucceededWorkGroup('work'),
          output,
          buildAssistantMessage('final', 'Your images are ready'),
        ]}
      />,
    );
    expect(screen.getByText('Generate images')).toBeVisible();
    expect(screen.getByText('Generated image')).toBeVisible();
    expect(screen.getByText('Your images are ready')).toBeVisible();
    expect(screen.queryByText('Checking references')).toBeNull();
    expect(screen.queryByTestId('work-group-work')).toBeNull();
    const steps = screen.getByRole('button', { name: 'Steps' });
    expect(steps).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(steps);
    expect(screen.getByText('Checking references')).toBeVisible();
    expect(screen.getByTestId('work-group-work')).toBeVisible();
  });

  it('keeps the active turn expanded until it settles', () => {
    const timeline = [
      buildUserMessage('prompt', 'Create'),
      buildAssistantMessage('progress', 'Preparing'),
      buildAssistantMessage('final', 'Ready'),
    ];
    const view = render(
      <AgentChatTimeline {...baseProps} isBusy timeline={timeline} />,
    );
    expect(screen.getByText('Preparing')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Steps' })).toBeNull();
    view.rerender(<AgentChatTimeline {...baseProps} timeline={timeline} />);
    expect(screen.queryByText('Preparing')).toBeNull();
    expect(screen.getByText('Ready')).toBeVisible();
  });

  it('leaves a failed turn without a final answer visible', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        timeline={[
          buildUserMessage('prompt', 'Create'),
          buildFailedWorkGroup('failure', 'status code 503'),
        ]}
      />,
    );
    expect(screen.getByTestId('work-group-failure')).toBeVisible();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Steps' })).toBeNull();
  });
});

describe('completed turn result preservation', () => {
  it('keeps a generated text artifact visible before the final summary', () => {
    const generated = buildAssistantMessage('generated', 'Generated post');
    generated.message.metadata = {
      generatedContent: 'The launch post',
      contentType: 'post',
    };
    render(
      <AgentChatTimeline
        {...baseProps}
        timeline={[
          buildUserMessage('prompt', 'Write a post'),
          buildAssistantMessage('progress', 'Reviewing context'),
          generated,
          buildAssistantMessage('summary', 'Post is ready'),
        ]}
      />,
    );
    expect(screen.getByText('Generated post')).toBeVisible();
    expect(screen.getByText('Post is ready')).toBeVisible();
    expect(screen.queryByText('Reviewing context')).toBeNull();
  });

  it('opens activity when a message in it is highlighted', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        highlightedMessageId="progress"
        timeline={[
          buildUserMessage('prompt', 'Write'),
          buildAssistantMessage('progress', 'Working'),
          buildAssistantMessage('summary', 'Ready'),
        ]}
      />,
    );
    expect(screen.getByText('Working')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Steps' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps progress visible if work fails after an intermediate assistant message', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        timeline={[
          buildUserMessage('prompt', 'Write'),
          buildAssistantMessage('progress', 'Starting'),
          buildFailedWorkGroup('failure', 'status code 503'),
        ]}
      />,
    );
    expect(screen.getByText('Starting')).toBeVisible();
    expect(screen.getByTestId('work-group-failure')).toBeVisible();
    expect(screen.getByRole('alert')).toBeVisible();
  });
});

describe('next-step availability', () => {
  it.each(['isBusy', 'isGenerating', 'isStreamingActive'] as const)(
    'waits for %s to settle before showing pending next steps',
    (liveFlag) => {
      const pendingUiActions: AgentUiAction[] = [
        {
          id: 'next-steps',
          type: 'next_steps_card',
          title: 'Next steps',
          nextSteps: [],
        },
      ];
      const view = render(
        <AgentChatTimeline
          {...baseProps}
          {...{ [liveFlag]: true }}
          timeline={[]}
          pendingUiActions={pendingUiActions}
        />,
      );
      expect(screen.queryByTestId('ui-action-busy')).toBeNull();
      expect(screen.queryByTestId('ui-action-interactive')).toBeNull();
      view.rerender(
        <AgentChatTimeline
          {...baseProps}
          timeline={[]}
          pendingUiActions={pendingUiActions}
        />,
      );
      expect(screen.getByTestId('ui-action-interactive')).toHaveAttribute(
        'data-action-type',
        'next_steps_card',
      );
    },
  );

  it('defers only the live turn next steps, preserving historical output', () => {
    const timeline = [
      buildUserMessage('old-prompt', 'Earlier prompt'),
      buildAssistantMessage('old-answer', 'Earlier answer'),
      buildUserMessage('current-prompt', 'Current prompt'),
      buildAssistantMessage('current-answer', 'Current answer'),
    ];
    const view = render(
      <AgentChatTimeline
        {...baseProps}
        isStreamingActive
        timeline={timeline}
      />,
    );
    expect(screen.getByTestId('message-old-answer')).toHaveAttribute(
      'data-defer-next-steps',
      'false',
    );
    expect(screen.getByTestId('message-current-answer')).toHaveAttribute(
      'data-defer-next-steps',
      'true',
    );
    view.rerender(<AgentChatTimeline {...baseProps} timeline={timeline} />);
    expect(screen.getByTestId('message-current-answer')).toHaveAttribute(
      'data-defer-next-steps',
      'false',
    );
  });

  it('keeps pending scheduling controls mounted while next steps wait', () => {
    render(
      <AgentChatTimeline
        {...baseProps}
        isBusy
        timeline={[]}
        pendingUiActions={[
          {
            id: 'next-steps',
            type: 'next_steps_card',
            title: 'Next steps',
            nextSteps: [],
          },
          {
            id: 'schedule',
            type: 'schedule_post_card',
            title: 'Schedule post',
          },
        ]}
      />,
    );
    expect(screen.getAllByTestId('ui-action-busy')).toHaveLength(1);
    expect(screen.getByTestId('ui-action-busy')).toHaveAttribute(
      'data-action-type',
      'schedule_post_card',
    );
    expect(screen.getByTestId('ui-action-busy')).toHaveAttribute('inert');
  });
});
