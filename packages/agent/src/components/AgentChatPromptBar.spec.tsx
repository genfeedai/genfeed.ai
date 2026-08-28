import { AgentChatPromptBar } from '@genfeedai/agent/components/AgentChatPromptBar';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@genfeedai/agent/components/AgentChatInput', () => ({
  AgentChatInput: (props: {
    disabled?: boolean;
    isTopAttached?: boolean;
    showStop?: boolean;
    willQueueFollowUp?: boolean;
  }) => (
    <div
      data-disabled={props.disabled ? 'true' : 'false'}
      data-show-stop={props.showStop ? 'true' : 'false'}
      data-testid="chat-input"
      data-top-attached={props.isTopAttached ? 'true' : 'false'}
      data-will-queue={props.willQueueFollowUp ? 'true' : 'false'}
    />
  ),
}));

vi.mock('@genfeedai/agent/components/AgentComposerStatusStack', () => ({
  AgentComposerStatusStack: () => null,
  hasRenderableComposerTasks: () => false,
}));

vi.mock('@genfeedai/agent/components/ConversationComposerShellContext', () => ({
  useConversationComposerShell: () => null,
}));

vi.mock('@genfeedai/agent/components/GenerationActionCard', () => ({
  GenerationActionCard: ({
    className,
    defaultCollapsed,
  }: {
    className?: string;
    defaultCollapsed?: boolean;
  }) => (
    <div
      className={className}
      data-default-collapsed={defaultCollapsed ? 'true' : 'false'}
      data-testid="generation-action-card"
    />
  ),
}));

vi.mock('@ui/layout/prompt-bar-container/PromptBarContainer', () => ({
  default: ({
    children,
    topContent,
  }: {
    children: ReactNode;
    topContent: ReactNode;
  }) => (
    <div>
      {topContent}
      {children}
    </div>
  ),
}));

const activeGenerationAction = {
  generationType: 'image',
  id: 'generation-card-1',
  title: 'Generate image',
  type: 'generation_action_card',
} satisfies AgentUiAction;

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
    isBusy: boolean;
    isRunActive: boolean;
    onMoveFollowUp: () => void;
    onRemoveFollowUp: () => void;
    onSendFollowUpNow: () => void;
  }> = {},
): void {
  render(
    <AgentChatPromptBar
      activeGenerationAction={activeGenerationAction}
      activeWorkEvent={null}
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
      error={null}
      followUps={extras.followUps}
      getCompletedAttachments={() => []}
      isAttachmentUploading={false}
      isBusy={extras.isBusy ?? false}
      isReadOnly={isReadOnly}
      isRunActive={extras.isRunActive ?? false}
      isSubmittingInputRequest={false}
      latestProposedPlan={null}
      layoutMode="fixed"
      models={[]}
      onClearError={vi.fn()}
      onMoveFollowUp={extras.onMoveFollowUp}
      onRemoveFollowUp={extras.onRemoveFollowUp}
      onSend={vi.fn()}
      onSendFollowUpNow={extras.onSendFollowUpNow}
      onStop={vi.fn()}
      onSubmitInputRequest={vi.fn()}
      onUiAction={vi.fn()}
      pendingInputRequest={null}
      promptBarSuggestions={null}
      removeAttachment={vi.fn()}
      showSuggestedActionsWhenNotEmpty={false}
      socketConnectionState="connected"
    />,
  );
}

describe('AgentChatPromptBar', () => {
  it('hides actionable generation cards in read-only threads', () => {
    renderPromptBar(true);

    expect(
      screen.queryByTestId('generation-action-card'),
    ).not.toBeInTheDocument();
  });

  it('keeps generation cards available in writable threads', () => {
    renderPromptBar(false);

    expect(screen.getByTestId('generation-action-card')).toBeInTheDocument();
  });

  it('docks the generation card flush on the prompt bar without a transcript gap', () => {
    renderPromptBar(false);

    const card = screen.getByTestId('generation-action-card');
    expect(card.parentElement).not.toHaveClass('pb-2');
  });

  it('attaches a collapsed generation mode strip to the one prompt bar', () => {
    renderPromptBar(false);

    const card = screen.getByTestId('generation-action-card');
    expect(card).toHaveClass('w-full');
    expect(card).not.toHaveClass('w-[95%]');
    expect(card).toHaveAttribute('data-default-collapsed', 'true');
    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-top-attached',
      'true',
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
});
