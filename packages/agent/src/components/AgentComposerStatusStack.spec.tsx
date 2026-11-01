import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('separates a red compact failure notice from the composer', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={null}
        error="Failed to stop the active agent run."
      />,
    );

    const notice = screen.getByRole('alert');
    expect(notice).toHaveClass('max-w-2xl');
    expect(notice).toHaveTextContent('Failed to stop the active agent run.');
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

  it('keeps a research turn as Working instead of dumping every tool as a plan', () => {
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
            label: 'get_current_brand',
            status: AgentWorkEventStatus.COMPLETED,
            threadId: 'thread-1',
            toolCallId: 'call-1',
            toolName: 'get_current_brand',
          },
          {
            createdAt: '2026-07-13T00:00:01.000Z',
            event: AgentWorkEventType.TOOL_STARTED,
            id: 'event-2',
            label: 'capture_knowledge',
            status: AgentWorkEventStatus.COMPLETED,
            threadId: 'thread-1',
            toolCallId: 'call-2',
            toolName: 'capture_knowledge',
          },
          {
            createdAt: '2026-07-13T00:00:02.000Z',
            event: AgentWorkEventType.TOOL_STARTED,
            id: 'event-3',
            label: 'draft_brand_voice_profile',
            status: AgentWorkEventStatus.RUNNING,
            threadId: 'thread-1',
            toolCallId: 'call-3',
            toolName: 'draft_brand_voice_profile',
          },
        ]}
      />,
    );

    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.queryByText('Creating audio')).not.toBeInTheDocument();
    expect(screen.getByText('Draft Brand Voice')).toBeInTheDocument();
    expect(screen.queryByText('Current Brand')).not.toBeInTheDocument();
    expect(screen.queryByText('Capture Knowledge')).not.toBeInTheDocument();
  });

  it('uses the model plan steps while they are awaiting approval', () => {
    render(
      <AgentComposerStatusStack
        {...baseProps}
        activeWorkEvent={null}
        isRunActive
        latestProposedPlan={{
          createdAt: '2026-07-13T00:00:00.000Z',
          id: 'plan-1',
          status: 'awaiting_approval',
          steps: [
            { status: 'pending', step: 'Read the brand kit' },
            { status: 'pending', step: 'Draft the voice' },
          ],
          updatedAt: '2026-07-13T00:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('Read the brand kit')).toBeInTheDocument();
    expect(screen.getByText('Draft the voice')).toBeInTheDocument();
    expect(screen.queryByText('Creating audio')).not.toBeInTheDocument();
  });

  it('shows an approved plan when the run is not a generation pipeline', () => {
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
            { status: 'in_progress', step: 'Gather brand context' },
            { status: 'pending', step: 'Draft the voice' },
          ],
          updatedAt: '2026-07-13T00:00:00.000Z',
        }}
        workEvents={[
          {
            createdAt: '2026-07-13T00:00:00.000Z',
            event: AgentWorkEventType.TOOL_STARTED,
            id: 'event-1',
            label: 'get_current_brand',
            status: AgentWorkEventStatus.RUNNING,
            threadId: 'thread-1',
            toolCallId: 'call-1',
            toolName: 'get_current_brand',
          },
        ]}
      />,
    );

    expect(screen.getByText('Gather brand context')).toBeInTheDocument();
    expect(screen.getByText('Draft the voice')).toBeInTheDocument();
    expect(screen.queryByText('Current Brand')).not.toBeInTheDocument();
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
  describe('agent task list', () => {
    function taskListEvent(
      id: string,
      tasks: unknown,
      status = AgentWorkEventStatus.COMPLETED,
    ) {
      return {
        createdAt: '2026-07-13T00:00:00.000Z',
        event: AgentWorkEventType.TOOL_COMPLETED,
        id,
        label: 'update_task_list',
        parameters: { tasks },
        status,
        threadId: 'thread-1',
        toolCallId: id,
        toolName: 'update_task_list',
      };
    }

    const generateEvent = {
      createdAt: '2026-07-13T00:00:00.000Z',
      event: AgentWorkEventType.TOOL_STARTED,
      id: 'generate-1',
      label: 'generate',
      parameters: { generationType: 'video' },
      status: AgentWorkEventStatus.RUNNING,
      threadId: 'thread-1',
      toolCallId: 'generate-1',
      toolName: 'generate',
    };

    it('shows the named phases with the one that is running', () => {
      render(
        <AgentComposerStatusStack
          {...baseProps}
          activeWorkEvent={null}
          isRunActive
          workEvents={[
            taskListEvent('call-1', [
              { id: 'script', label: 'Write the script', status: 'completed' },
              { id: 'shots', label: 'Generate the shots', status: 'active' },
              { id: 'grade', label: 'Colour grade', status: 'pending' },
            ]),
            generateEvent,
          ]}
        />,
      );

      const items = screen
        .getByTestId('agent-composer-tasks')
        .querySelectorAll('li');
      expect(
        Array.from(items).map((item) => [
          item.textContent,
          item.getAttribute('data-task-status'),
        ]),
      ).toEqual([
        ['Write the script', 'completed'],
        ['Generate the shots', 'active'],
        ['Colour grade', 'pending'],
      ]);
      expect(screen.queryByText('Generate Media')).not.toBeInTheDocument();
    });

    it('follows the latest call, since each call sends the whole list', () => {
      render(
        <AgentComposerStatusStack
          {...baseProps}
          activeWorkEvent={null}
          isRunActive
          workEvents={[
            taskListEvent('call-1', [
              { id: 'script', label: 'Write the script', status: 'active' },
              { id: 'shots', label: 'Generate the shots', status: 'pending' },
            ]),
            taskListEvent('call-2', [
              { id: 'script', label: 'Write the script', status: 'completed' },
              { id: 'shots', label: 'Generate the shots', status: 'active' },
            ]),
          ]}
        />,
      );

      expect(
        screen.getByTestId('agent-composer-tasks').querySelectorAll('li'),
      ).toHaveLength(2);
      expect(
        screen.getByText('Write the script').closest('li'),
      ).toHaveAttribute('data-task-status', 'completed');
    });

    it('ignores a call that failed or sent a malformed list', () => {
      render(
        <AgentComposerStatusStack
          {...baseProps}
          activeWorkEvent={null}
          isRunActive
          workEvents={[
            taskListEvent('call-1', [
              { id: 'script', label: 'Write the script', status: 'active' },
            ]),
            taskListEvent(
              'call-2',
              [{ id: 'shots', label: 'Generate the shots', status: 'active' }],
              AgentWorkEventStatus.FAILED,
            ),
            taskListEvent('call-3', [
              { id: 'grade', label: 'Colour grade', status: 'running' },
            ]),
          ]}
        />,
      );

      expect(screen.getByText('Write the script')).toBeInTheDocument();
      expect(screen.queryByText('Generate the shots')).not.toBeInTheDocument();
      expect(screen.queryByText('Colour grade')).not.toBeInTheDocument();
    });

    it('does not list the update call itself as a step', () => {
      const { container } = render(
        <AgentComposerStatusStack
          {...baseProps}
          activeWorkEvent={null}
          isRunActive
          workEvents={[
            taskListEvent('call-1', 'not a list', AgentWorkEventStatus.RUNNING),
          ]}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('hides the list once the run is no longer active', () => {
      const { container } = render(
        <AgentComposerStatusStack
          {...baseProps}
          activeWorkEvent={null}
          isRunActive={false}
          workEvents={[
            taskListEvent('call-1', [
              { id: 'script', label: 'Write the script', status: 'active' },
            ]),
          ]}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('stalled turn notice', () => {
    it('offers keep waiting and stop and retry when the turn is stalled', () => {
      const onKeepWaiting = vi.fn();
      const onStopAndRetry = vi.fn();
      render(
        <AgentComposerStatusStack
          {...baseProps}
          activeWorkEvent={null}
          isRunActive
          isTurnStalled
          onKeepWaiting={onKeepWaiting}
          onStopAndRetry={onStopAndRetry}
        />,
      );

      expect(
        screen.getByText('This is taking longer than expected.'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Keep waiting' }));
      expect(onKeepWaiting).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByRole('button', { name: 'Stop and retry' }));
      expect(onStopAndRetry).toHaveBeenCalledOnce();
    });

    it('hides the notice once the run is no longer active', () => {
      const { container } = render(
        <AgentComposerStatusStack
          {...baseProps}
          activeWorkEvent={null}
          isRunActive={false}
          isTurnStalled
          onKeepWaiting={vi.fn()}
          onStopAndRetry={vi.fn()}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });
  });
});
