import { AgentChatPromptBar } from '@genfeedai/agent/components/AgentChatPromptBar';
import type {
  AgentInputRequest,
  AgentProposedPlan,
} from '@genfeedai/agent/models/agent-chat.model';
import { AgentThreadMode } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@genfeedai/agent/components/AgentChatInput', () => ({
  AgentChatInput: (props: {
    disabled?: boolean;
    isTopAttached?: boolean;
    onSend?: (content: string) => void;
    placeholder?: string;
    showStop?: boolean;
    willQueueFollowUp?: boolean;
  }) => (
    <div
      data-disabled={props.disabled ? 'true' : 'false'}
      data-placeholder={props.placeholder}
      data-show-stop={props.showStop ? 'true' : 'false'}
      data-testid="chat-input"
      data-top-attached={props.isTopAttached ? 'true' : 'false'}
      data-will-queue={props.willQueueFollowUp ? 'true' : 'false'}
    >
      <button onClick={() => props.onSend?.('Make it shorter')} type="button">
        send draft
      </button>
    </div>
  ),
}));

const { hasRenderableComposerTasksMock } = vi.hoisted(() => ({
  hasRenderableComposerTasksMock: vi.fn(() => false),
}));

vi.mock('@genfeedai/agent/components/AgentComposerStatusStack', () => ({
  AgentComposerStatusStack: () => null,
  hasRenderableComposerTasks: hasRenderableComposerTasksMock,
}));

vi.mock('@genfeedai/agent/components/ConversationComposerShellContext', () => ({
  useConversationComposerShell: () => null,
}));

function renderPromptBar(
  isReadOnly: boolean,
  extras: Partial<{
    followUps: Array<{
      content: string;
      createdAt: string;
      id: string;
      status: 'queued' | 'sending' | 'failed';
      threadId: string | null;
    }>;
    error: string | null;
    socketConnectionState: 'connected' | 'reconnecting';
    isBusy: boolean;
    isRunActive: boolean;
    latestProposedPlan: AgentProposedPlan;
    onApprovePlan: () => void;
    onRequestPlanChanges: (note: string) => void;
    onSend: ComponentProps<typeof AgentChatPromptBar>['onSend'];
    onMoveFollowUp: () => void;
    onRemoveFollowUp: () => void;
    onSendFollowUpNow: () => void;
    pendingInputRequest: AgentInputRequest | null;
    promptBarSuggestions: ReactNode;
  }> = {},
): void {
  render(
    <AgentChatPromptBar
      activeWorkEvent={null}
      agentMode={AgentThreadMode.MANUAL}
      workEvents={[]}
      addFiles={vi.fn()}
      apiService={{} as never}
      chatAttachments={[]}
      clearAllAttachments={vi.fn()}
      dragHandlers={{
        onDragEnter: vi.fn(),
        onDragLeave: vi.fn(),
        onDragOver: vi.fn(),
        onDrop: vi.fn(),
      }}
      dragState={{ isActive: false }}
      error={extras.error ?? null}
      followUps={extras.followUps}
      getCompletedAttachments={() => []}
      isAttachmentUploading={false}
      isBusy={extras.isBusy ?? false}
      isReadOnly={isReadOnly}
      isRunActive={extras.isRunActive ?? false}
      isSubmittingInputRequest={false}
      latestProposedPlan={extras.latestProposedPlan ?? null}
      onApprovePlan={extras.onApprovePlan}
      onRequestPlanChanges={extras.onRequestPlanChanges}
      layoutMode="fixed"
      onAgentModeChange={vi.fn()}
      onClearError={vi.fn()}
      onMoveFollowUp={extras.onMoveFollowUp}
      onRemoveFollowUp={extras.onRemoveFollowUp}
      onSend={extras.onSend ?? vi.fn()}
      onSendFollowUpNow={extras.onSendFollowUpNow}
      onStop={vi.fn()}
      onSubmitInputRequest={vi.fn()}
      pendingInputRequest={extras.pendingInputRequest ?? null}
      promptBarSuggestions={extras.promptBarSuggestions ?? null}
      removeAttachment={vi.fn()}
      showSuggestedActionsWhenNotEmpty={Boolean(extras.promptBarSuggestions)}
      socketConnectionState={extras.socketConnectionState ?? 'connected'}
    />,
  );
}

describe('AgentChatPromptBar', () => {
  beforeEach(() => {
    hasRenderableComposerTasksMock.mockReturnValue(false);
  });

  it.each([
    { error: 'This approval expired. Prepare the action again.' },
    { socketConnectionState: 'reconnecting' as const },
  ])('does not shade the transcript above a composer notice: %s', (extras) => {
    renderPromptBar(false, extras);

    expect(document.querySelector('[data-composer-top-fade]')).toBeNull();
    expect(
      document.querySelector('[data-composer-prompt-slot]'),
    ).toContainElement(screen.getByTestId('chat-input'));
  });

  it('keeps read-only threads from rendering a second generation surface', () => {
    renderPromptBar(true);

    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-disabled',
      'true',
    );
    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-top-attached',
      'false',
    );
  });

  it('renders queued follow-ups above the composer', () => {
    renderPromptBar(false, {
      followUps: [
        {
          content: 'Write a caption next',
          createdAt: '2026-08-13T00:00:00.000Z',
          id: 'q-1',
          status: 'queued',
          threadId: 'thread-1',
        },
      ],
      isBusy: true,
      isRunActive: true,
      onMoveFollowUp: vi.fn(),
      onRemoveFollowUp: vi.fn(),
      onSendFollowUpNow: vi.fn(),
    });

    const queue = screen.getByTestId('composer-follow-up-queue');
    expect(queue).toHaveTextContent('Write a caption next');
    expect(queue).toHaveAccessibleName('count');
    expect(screen.getByLabelText('remove')).toBeInTheDocument();
  });

  it('keeps the composer writable and Stop visible while a run is active', () => {
    renderPromptBar(false, {
      isBusy: true,
      isRunActive: true,
    });

    const input = screen.getByTestId('chat-input');
    expect(input).toHaveAttribute('data-disabled', 'false');
    expect(input).toHaveAttribute('data-show-stop', 'true');
    expect(input).toHaveAttribute('data-will-queue', 'true');
  });

  it('renders follow-up chips above the composer once the turn has settled', () => {
    renderPromptBar(false, {
      promptBarSuggestions: <div data-testid="follow-up-chips" />,
    });

    expect(screen.getByTestId('follow-up-chips')).toBeInTheDocument();
  });

  it('hides follow-up chips while the task panel sits above the composer', () => {
    hasRenderableComposerTasksMock.mockReturnValue(true);

    renderPromptBar(false, {
      isRunActive: true,
      promptBarSuggestions: <div data-testid="follow-up-chips" />,
    });

    expect(screen.queryByTestId('follow-up-chips')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-top-attached',
      'true',
    );
  });

  it('hides follow-up chips while an input request is pending', () => {
    renderPromptBar(false, {
      pendingInputRequest: {
        inputRequestId: 'input-1',
        prompt: 'Pick a format',
        threadId: 'thread-1',
        title: 'Format',
      },
      promptBarSuggestions: <div data-testid="follow-up-chips" />,
    });

    expect(screen.queryByTestId('follow-up-chips')).not.toBeInTheDocument();
  });

  describe('plan decision', () => {
    const awaitingPlan: AgentProposedPlan = {
      content: '1. Draft the tweets',
      createdAt: '2026-10-28T07:00:00.000Z',
      id: 'plan-1',
      status: 'awaiting_approval',
      updatedAt: '2026-10-28T07:00:00.000Z',
    };

    it('puts Approve above the prompt bar and sends typed text as the requested change', () => {
      const onApprovePlan = vi.fn();
      const onRequestPlanChanges = vi.fn();
      const onSend = vi.fn();
      renderPromptBar(false, {
        latestProposedPlan: awaitingPlan,
        onApprovePlan,
        onRequestPlanChanges,
        onSend,
      });

      expect(screen.getByTestId('chat-input')).toHaveAttribute(
        'data-placeholder',
        'revisePlaceholder',
      );
      fireEvent.click(screen.getByRole('button', { name: 'approve' }));
      expect(onApprovePlan).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'send draft' }));
      expect(onRequestPlanChanges).toHaveBeenCalledWith('Make it shorter');
      expect(onSend).not.toHaveBeenCalled();
    });

    it('leaves the prompt bar alone once the plan is approved', () => {
      const onRequestPlanChanges = vi.fn();
      const onSend = vi.fn();
      renderPromptBar(false, {
        latestProposedPlan: { ...awaitingPlan, status: 'approved' },
        onApprovePlan: vi.fn(),
        onRequestPlanChanges,
        onSend,
      });

      expect(screen.queryByTestId('agent-plan-decision')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'send draft' }));
      expect(onSend).toHaveBeenCalled();
      expect(onRequestPlanChanges).not.toHaveBeenCalled();
    });

    it('does not ask for a decision on a plan with nothing in it', () => {
      renderPromptBar(false, {
        latestProposedPlan: { ...awaitingPlan, content: '' },
        onApprovePlan: vi.fn(),
        onRequestPlanChanges: vi.fn(),
      });

      expect(screen.queryByTestId('agent-plan-decision')).toBeNull();
    });
  });
});
