import { AgentChatPromptBar } from '@genfeedai/agent/components/AgentChatPromptBar';
import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@genfeedai/agent/components/AgentChatInput', () => ({
  AgentChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock('@genfeedai/agent/components/AgentComposerStatusStack', () => ({
  AgentComposerStatusStack: () => null,
}));

vi.mock('@genfeedai/agent/components/ConversationComposerShellContext', () => ({
  useConversationComposerShell: () => null,
}));

vi.mock('@genfeedai/agent/components/GenerationActionCard', () => ({
  GenerationActionCard: () => <div data-testid="generation-action-card" />,
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
    }>;
    onMoveFollowUp: () => void;
    onRemoveFollowUp: () => void;
    onSendFollowUpNow: () => void;
  }> = {},
): void {
  render(
    <AgentChatPromptBar
      activeGenerationAction={activeGenerationAction}
      activeWorkEvent={null}
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
      isBusy={false}
      isReadOnly={isReadOnly}
      isRunActive={false}
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

  it('renders queued follow-ups above the composer', () => {
    renderPromptBar(false, {
      followUps: [
        {
          content: 'Write a caption next',
          createdAt: '2026-08-13T00:00:00.000Z',
          id: 'q-1',
        },
      ],
      onMoveFollowUp: vi.fn(),
      onRemoveFollowUp: vi.fn(),
      onSendFollowUpNow: vi.fn(),
    });

    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'Write a caption next',
    );
  });
});
