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
  isRunActive: false,
  isSubmittingInputRequest: false,
  latestProposedPlan: null,
  onClearError: vi.fn(),
  onSubmitInputRequest: vi.fn(),
  pendingInputRequest: null,
  socketConnectionState: 'connected' as const,
  workEvents: [],
};

describe('AgentComposerStatusStack', () => {
  it('renders determinate progress only for a measurable value', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        isRunActive
        activeWorkEvent={{
          createdAt: '2026-07-13T00:00:00.000Z',
          event: AgentWorkEventType.TOOL_STARTED,
          id: 'event-1',
          label: 'Rendering frames',
          progress: 42,
          status: AgentWorkEventStatus.RUNNING,
          threadId: 'thread-1',
        }}
        workEvents={[
          {
            createdAt: '2026-07-13T00:00:00.000Z',
            event: AgentWorkEventType.TOOL_STARTED,
            id: 'event-1',
            label: 'Rendering frames',
            progress: 42,
            status: AgentWorkEventStatus.RUNNING,
            threadId: 'thread-1',
          },
        ]}
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
        isRunActive
        activeWorkEvent={{
          createdAt: '2026-07-13T00:00:00.000Z',
          event: AgentWorkEventType.TOOL_STARTED,
          id: 'event-1',
          label: 'Researching sources',
          status: AgentWorkEventStatus.RUNNING,
          threadId: 'thread-1',
          toolName: 'research',
        }}
        workEvents={[
          {
            createdAt: '2026-07-13T00:00:00.000Z',
            event: AgentWorkEventType.TOOL_STARTED,
            id: 'event-1',
            label: 'Researching sources',
            status: AgentWorkEventStatus.RUNNING,
            threadId: 'thread-1',
            toolName: 'research',
          },
        ]}
      />,
    );

    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.queryByText('research')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('hides generic lifecycle bookends like Agent started', () => {
    const { container } = render(
      <AgentComposerStatusStack
        {...baseProps}
        isRunActive
        activeWorkEvent={{
          createdAt: '2026-07-13T00:00:00.000Z',
          event: AgentWorkEventType.STARTED,
          id: 'event-1',
          label: 'Agent started',
          status: AgentWorkEventStatus.RUNNING,
          threadId: 'thread-1',
        }}
      />,
    );

    expect(screen.queryByText('Agent started')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('labels reconnect recovery without exposing prompt contents', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={null}
        socketConnectionState="offline"
      />,
    );

    const notice = screen.getByText(
      'Offline. Your draft is safe; sending is paused.',
    );
    expect(notice).toBeInTheDocument();
    const card = notice.closest('[role="status"]');
    expect(card?.className).toMatch(/bg-warning/);
    expect(card?.className).toMatch(/border-warning/);
  });

  it('separates a solid compact failure notice from the composer', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={null}
        error="Failed to stop the active agent run."
      />,
    );

    const notice = screen.getByRole('alert');
    expect(notice).toHaveClass('max-w-2xl');
    expect(notice).toHaveClass('bg-background-secondary');
    expect(notice).toHaveClass('shadow-border');
    expect(notice).not.toHaveClass('bg-destructive/15');
    expect(
      screen.getByRole('region', {
        name: 'Conversation status and pending input',
      }),
    ).toHaveClass('pb-2');
  });

  it('renders approved plan steps as compact live progress', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={null}
        isRunActive
        latestProposedPlan={{
          createdAt: '2026-07-13T00:00:00.000Z',
          id: 'plan-1',
          status: 'approved',
          steps: [
            { status: 'completed', step: 'Inspect the current surface' },
            { status: 'in_progress', step: 'Implement the fix' },
            { status: 'pending', step: 'Verify the result' },
          ],
          updatedAt: '2026-07-13T00:00:00.000Z',
        }}
      />,
    );

    expect(
      screen.getByRole('region', {
        name: 'Working progress, 1 of 3 steps',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Inspect the current surface')).toBeInTheDocument();
    expect(screen.getByText('Implement the fix')).toBeInTheDocument();
    expect(screen.getByText('Verify the result')).toBeInTheDocument();
  });

  it('shows semantic asset stages instead of internal tool names', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={null}
        isRunActive
        workEvents={[
          {
            createdAt: '2026-07-13T00:00:00.000Z',
            event: AgentWorkEventType.TOOL_STARTED,
            id: 'event-1',
            label: 'prepare_generation',
            parameters: { generationType: 'image' },
            status: AgentWorkEventStatus.COMPLETED,
            threadId: 'thread-1',
            toolCallId: 'call-1',
            toolName: 'prepare_generation',
          },
          {
            createdAt: '2026-07-13T00:00:01.000Z',
            event: AgentWorkEventType.TOOL_STARTED,
            id: 'event-2',
            label: 'suggest_ingredient_alternatives',
            parameters: { generationType: 'image' },
            status: AgentWorkEventStatus.RUNNING,
            threadId: 'thread-1',
            toolCallId: 'call-2',
            toolName: 'suggest_ingredient_alternatives',
          },
          {
            createdAt: '2026-07-13T00:00:02.000Z',
            event: AgentWorkEventType.TOOL_STARTED,
            id: 'event-3',
            label: 'suggest_ingredient_alternatives',
            parameters: { generationType: 'image' },
            status: AgentWorkEventStatus.RUNNING,
            threadId: 'thread-1',
            toolCallId: 'call-3',
            toolName: 'suggest_ingredient_alternatives',
          },
        ]}
      />,
    );

    expect(screen.getByText('Creating image')).toBeInTheDocument();
    expect(screen.getByText('Preparing image generation')).toBeInTheDocument();
    expect(screen.getAllByText('Finding stronger alternatives')).toHaveLength(
      1,
    );
    expect(screen.queryByText('prepare_generation')).not.toBeInTheDocument();
  });

  it('prefers reported execution stages over an approved plan', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={null}
        isRunActive
        latestProposedPlan={{
          createdAt: '2026-07-13T00:00:00.000Z',
          id: 'plan-1',
          status: 'approved',
          steps: [{ status: 'in_progress', step: 'Internal planning step' }],
          updatedAt: '2026-07-13T00:00:00.000Z',
        }}
        workEvents={[
          {
            createdAt: '2026-07-13T00:00:00.000Z',
            event: AgentWorkEventType.TOOL_STARTED,
            id: 'event-1',
            label: 'suggest_ingredient_alternatives',
            status: AgentWorkEventStatus.RUNNING,
            threadId: 'thread-1',
            toolCallId: 'call-1',
            toolName: 'suggest_ingredient_alternatives',
          },
        ]}
      />,
    );

    expect(
      screen.getByText('Finding stronger alternatives'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Internal planning step'),
    ).not.toBeInTheDocument();
  });

  it('hides successful progress as soon as every step is complete', () => {
    const { container } = render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={null}
        isRunActive
        workEvents={[
          {
            createdAt: '2026-07-13T00:00:00.000Z',
            event: AgentWorkEventType.TOOL_COMPLETED,
            id: 'event-1',
            label: 'prepare_generation',
            status: AgentWorkEventStatus.COMPLETED,
            threadId: 'thread-1',
            toolCallId: 'call-1',
            toolName: 'prepare_generation',
          },
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('does not render generic tool lifecycle copy', () => {
    const { container } = render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={null}
        isRunActive
        workEvents={[
          {
            createdAt: '2026-07-13T00:00:00.000Z',
            event: AgentWorkEventType.TOOL_STARTED,
            id: 'event-1',
            label: 'Tool completed',
            status: AgentWorkEventStatus.RUNNING,
            threadId: 'thread-1',
          },
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
