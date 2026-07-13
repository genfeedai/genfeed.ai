import {
  AgentChatInput,
  type ExtractedMention,
} from '@genfeedai/agent/components/AgentChatInput';
import { AgentComposerStatusStack } from '@genfeedai/agent/components/AgentComposerStatusStack';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import type {
  AgentInputRequest,
  AgentProposedPlan,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentSocketConnectionState } from '@genfeedai/agent/stores/agent-chat.store';
import type {
  AttachmentItem,
  ChatAttachment,
  DragHandlers,
  DragState,
} from '@genfeedai/props/ui/attachments.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';

type AgentChatPromptBarProps = {
  apiService: AgentApiService;
  layoutMode: 'fixed' | 'surface-fixed';
  isBusy: boolean;
  isReadOnly: boolean;
  isRunActive: boolean;
  placeholder?: string;
  showSuggestedActionsWhenNotEmpty: boolean;
  promptBarSuggestions: ReactNode;
  chatAttachments: AttachmentItem[];
  isAttachmentUploading: boolean;
  dragState: DragState;
  dragHandlers: DragHandlers;
  addFiles: (files: File[]) => void;
  removeAttachment: (id: string) => void;
  getCompletedAttachments: () => ChatAttachment[];
  clearAllAttachments: () => void;
  onSend: (
    content: string,
    mentions?: ExtractedMention[],
    attachments?: ChatAttachment[],
    options?: { planModeEnabled?: boolean },
  ) => void;
  onStop: () => void;
  activeWorkEvent: AgentWorkEvent | null;
  error: string | null;
  isSubmittingInputRequest: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  onClearError: () => void;
  onSubmitInputRequest: (answer: string) => void | Promise<void>;
  pendingInputRequest: AgentInputRequest | null;
  socketConnectionState: AgentSocketConnectionState;
};

export function AgentChatPromptBar({
  apiService,
  layoutMode,
  isBusy,
  isReadOnly,
  isRunActive,
  placeholder,
  showSuggestedActionsWhenNotEmpty,
  promptBarSuggestions,
  chatAttachments,
  isAttachmentUploading,
  dragState,
  dragHandlers,
  addFiles,
  removeAttachment,
  getCompletedAttachments,
  clearAllAttachments,
  onSend,
  onStop,
  activeWorkEvent,
  error,
  isSubmittingInputRequest,
  latestProposedPlan,
  onClearError,
  onSubmitInputRequest,
  pendingInputRequest,
  socketConnectionState,
}: AgentChatPromptBarProps): ReactElement {
  const composerShell = useConversationComposerShell();
  const statusStack = (
    <AgentComposerStatusStack
      activeWorkEvent={activeWorkEvent}
      error={error}
      isSubmittingInputRequest={isSubmittingInputRequest}
      latestProposedPlan={latestProposedPlan}
      onClearError={onClearError}
      onSubmitInputRequest={onSubmitInputRequest}
      pendingInputRequest={pendingInputRequest}
      socketConnectionState={socketConnectionState}
    />
  );
  const topContent = (
    <>
      {statusStack}
      {showSuggestedActionsWhenNotEmpty && promptBarSuggestions ? (
        <div className="px-1 pb-3">{promptBarSuggestions}</div>
      ) : null}
    </>
  );
  const promptBar = (
    <PromptBarContainer
      layoutMode={composerShell?.portalTarget ? 'inflow' : layoutMode}
      maxWidth="4xl"
      showTopFade={!composerShell?.portalTarget}
      topContent={topContent}
      zIndex={40}
      className={cn(
        composerShell?.portalTarget && 'w-full',
        layoutMode === 'fixed' && 'bottom-2 md:bottom-4',
        layoutMode === 'surface-fixed' && 'bottom-3 md:bottom-5',
      )}
    >
      <AgentChatInput
        onSend={onSend}
        disabled={isBusy || isReadOnly}
        placeholder={
          isReadOnly ? 'Archived threads are read-only' : placeholder
        }
        onStop={onStop}
        apiService={apiService}
        showStop={isRunActive}
        attachments={chatAttachments}
        isUploading={isAttachmentUploading}
        dragState={dragState}
        dragHandlers={dragHandlers}
        addFiles={addFiles}
        removeAttachment={removeAttachment}
        getCompletedAttachments={getCompletedAttachments}
        clearAllAttachments={clearAllAttachments}
      />
    </PromptBarContainer>
  );

  return composerShell?.portalTarget
    ? createPortal(promptBar, composerShell.portalTarget)
    : promptBar;
}
