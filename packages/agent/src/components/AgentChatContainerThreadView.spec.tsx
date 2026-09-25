import {
  AgentChatContainerThreadView,
  selectActiveWorkEvent,
} from '@genfeedai/agent/components/AgentChatContainerThreadView';
import type { AgentWorkEvent } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    usePromptModal: () => ({ openPromptModal: vi.fn() }),
  }),
);

vi.mock('@genfeedai/agent/components/AgentChatTimeline', () => ({
  AgentChatTimeline: () => <div>timeline</div>,
}));

vi.mock('@genfeedai/agent/components/AgentWorkObjects', () => ({
  AgentWorkObjects: () => null,
}));

vi.mock('@genfeedai/agent/components/AgentPlanReviewSection', () => ({
  AgentPlanReviewSection: () => null,
}));

vi.mock('@genfeedai/agent/components/AgentInputRequestOverlay', () => ({
  AgentInputRequestOverlay: () => null,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: function MockPrimitiveButton(props: {
    ariaLabel?: string;
    onClick?: () => void;
    children?: ReactNode;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

function makeWorkEvent(
  overrides: Partial<AgentWorkEvent> = {},
): AgentWorkEvent {
  return {
    createdAt: '2026-08-19T00:00:00.000Z',
    event: AgentWorkEventType.STARTED,
    id: 'event-1',
    label: 'Working',
    status: AgentWorkEventStatus.PENDING,
    threadId: 'thread-1',
    ...overrides,
  };
}

describe('selectActiveWorkEvent', () => {
  it('returns the latest pending or running event', () => {
    const selected = selectActiveWorkEvent([
      makeWorkEvent({
        id: 'older-running',
        status: AgentWorkEventStatus.RUNNING,
      }),
      makeWorkEvent({
        id: 'latest-pending',
        status: AgentWorkEventStatus.PENDING,
      }),
      makeWorkEvent({
        id: 'done',
        status: AgentWorkEventStatus.COMPLETED,
      }),
    ]);

    expect(selected?.id).toBe('latest-pending');
  });

  it('prefers a tool event over a lifecycle bookend', () => {
    const selected = selectActiveWorkEvent([
      makeWorkEvent({
        id: 'lifecycle',
        status: AgentWorkEventStatus.RUNNING,
      }),
      makeWorkEvent({
        id: 'tool',
        status: AgentWorkEventStatus.PENDING,
        toolCallId: 'call-1',
        toolName: 'generate_image',
      }),
    ]);

    expect(selected?.id).toBe('tool');
  });

  it('returns null when the stream is no longer active', () => {
    expect(
      selectActiveWorkEvent(
        [
          makeWorkEvent({
            id: 'stuck',
            status: AgentWorkEventStatus.RUNNING,
            toolName: 'generate_image',
          }),
        ],
        { isStreamActive: false },
      ),
    ).toBeNull();
  });

  it('ignores completed, failed, and cancelled events', () => {
    expect(
      selectActiveWorkEvent([
        makeWorkEvent({
          id: 'completed',
          status: AgentWorkEventStatus.COMPLETED,
          toolName: 'generate_image',
        }),
        makeWorkEvent({
          id: 'failed',
          status: AgentWorkEventStatus.FAILED,
          toolName: 'generate_image',
        }),
        makeWorkEvent({
          id: 'cancelled',
          status: AgentWorkEventStatus.CANCELLED,
          toolName: 'generate_image',
        }),
      ]),
    ).toBeNull();
  });
});

describe('AgentChatContainerThreadView', () => {
  it('sits the jump-to-latest control on the composer overlay, not under it', () => {
    render(
      <AgentChatContainerThreadView
        activeThreadTitle={null}
        activeUiAction={null}
        apiService={{} as never}
        followUpTaskMessage={null}
        highlightedMessageId={null}
        isAtBottom={false}
        isBusy={false}
        isCreatingFollowUpTasks={false}
        isGenerating={false}
        isWideLayout={false}
        isReadOnly={false}
        isStreamingActive={false}
        isSubmittingInputRequest={false}
        latestProposedPlan={null}
        messagesEndRef={createRef<HTMLDivElement>()}
        onboardingMode={false}
        onApprovePlan={vi.fn()}
        onCopy={vi.fn()}
        onCreateFollowUpTasks={vi.fn()}
        onIngredientSelect={vi.fn()}
        onRequestPlanChanges={vi.fn()}
        onRetry={vi.fn()}
        onRetryLastFailedRun={vi.fn()}
        onSubmitInputRequest={vi.fn()}
        onUiAction={vi.fn()}
        padBottomForComposer
        composerTranscriptPaddingPx={180}
        pendingInputRequest={null}
        pendingUiActions={[]}
        scrollContainerRef={createRef<HTMLDivElement>()}
        scrollToBottom={vi.fn()}
        shouldShowInputRequestOverlay={false}
        showFollowUpButton={false}
        timeline={[]}
      />,
    );

    const jump = screen.getByRole('button', {
      name: 'Scroll to latest message',
    });

    expect(jump.parentElement).toHaveStyle({ bottom: '180px' });
  });
});
