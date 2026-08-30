import {
  AgentChatInput,
  type ExtractedMention,
} from '@genfeedai/agent/components/AgentChatInput';
import {
  AgentComposerStatusStack,
  hasRenderableComposerTasks,
} from '@genfeedai/agent/components/AgentComposerStatusStack';
import { ComposerFollowUpQueue } from '@genfeedai/agent/components/ComposerFollowUpQueue';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import type {
  AgentInputRequest,
  AgentProposedPlan,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import type { ConversationComposerSendOptions } from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentSocketConnectionState } from '@genfeedai/agent/stores/agent-chat.store';
import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
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
  followUps?: readonly ComposerFollowUp[];
  isBusy: boolean;
  isComposerUnavailable?: boolean;
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
    options?: ConversationComposerSendOptions,
  ) => boolean | undefined | Promise<boolean | undefined>;
  onStop: () => void;
  onMoveFollowUp?: (fromIndex: number, toIndex: number) => void;
  onPromoteQueuedFollowUp?: () => void;
  onRemoveFollowUp?: (id: string) => void;
  onRetryFollowUp?: (id: string) => void;
  onSendFollowUpNow?: (id: string) => void;
  isInterruptingFollowUps?: boolean;
  activeWorkEvent: AgentWorkEvent | null;
  workEvents: readonly AgentWorkEvent[];
  error: string | null;
  isSubmittingInputRequest: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  onClearError: () => void;
  onSubmitInputRequest: (answer: string) => void | Promise<void>;
  pendingInputRequest: AgentInputRequest | null;
  socketConnectionState: AgentSocketConnectionState;
  creditsAvailable?: number | null;
  onOverlayElement?: (node: HTMLElement | null) => void;
};

export function AgentChatPromptBar({
  apiService,
  layoutMode,
  followUps = [],
  isBusy,
  isComposerUnavailable = false,
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
  onMoveFollowUp,
  onPromoteQueuedFollowUp,
  onRemoveFollowUp,
  onRetryFollowUp,
  onSendFollowUpNow,
  isInterruptingFollowUps = false,
  activeWorkEvent,
  workEvents,
  error,
  isSubmittingInputRequest,
  latestProposedPlan,
  onClearError,
  onSubmitInputRequest,
  pendingInputRequest,
  socketConnectionState,
  creditsAvailable = null,
  onOverlayElement,
}: AgentChatPromptBarProps): ReactElement {
  const composerShell = useConversationComposerShell();
  const isInspectorComposer = composerShell?.placement === 'inspector';
  const statusStack = (
    <AgentComposerStatusStack
      activeWorkEvent={activeWorkEvent}
      error={error}
      isRunActive={isRunActive}
      isSubmittingInputRequest={isSubmittingInputRequest}
      latestProposedPlan={latestProposedPlan}
      onClearError={onClearError}
      onSubmitInputRequest={onSubmitInputRequest}
      pendingInputRequest={pendingInputRequest}
      socketConnectionState={socketConnectionState}
      workEvents={workEvents}
    />
  );
  const hasFollowUpChips =
    showSuggestedActionsWhenNotEmpty && Boolean(promptBarSuggestions);
  const hasRunningTasks = hasRenderableComposerTasks({
    isRunActive,
    latestProposedPlan,
    workEvents,
  });
  const topContent = (
    <>
      {followUps.length > 0 &&
      onMoveFollowUp &&
      onRemoveFollowUp &&
      onSendFollowUpNow ? (
        <ComposerFollowUpQueue
          isBusy={isBusy}
          isInterrupting={isInterruptingFollowUps}
          onMove={onMoveFollowUp}
          onRemove={onRemoveFollowUp}
          onRetry={onRetryFollowUp}
          onSendNow={onSendFollowUpNow}
          queue={followUps}
        />
      ) : null}
      {statusStack}
      {hasFollowUpChips ? (
        // The row owns no surface or shadow. Each action button owns its own
        // elevation, and the padding keeps it visually separate from composer.
        <div className="relative z-10 bg-transparent pb-3 shadow-none">
          {promptBarSuggestions}
        </div>
      ) : null}
    </>
  );
  const isPortaled = Boolean(composerShell?.portalTarget);
  // Surface canvas portal already owns AGENT_CONVERSATION_TRACK_CLASS (max-w-3xl).
  // Inspector rail is narrower — fill it. Never re-center with a second max-w.
  const promptBar = (
    <PromptBarContainer
      layoutMode={isPortaled ? 'inflow' : layoutMode}
      // Portal already owns max-w-4xl + matching px; fill it without re-padding.
      maxWidth={isPortaled ? 'full' : '4xl'}
      showTopFade={!hasFollowUpChips}
      topContent={topContent}
      zIndex={40}
      containerRef={onOverlayElement}
      className={cn(
        'w-full min-w-0 max-w-full',
        isPortaled && 'pointer-events-auto',
        layoutMode === 'fixed' && 'bottom-2 md:bottom-4',
        layoutMode === 'surface-fixed' && 'bottom-0',
      )}
    >
      <AgentChatInput
        onSend={onSend}
        isTopAttached={!isReadOnly && hasRunningTasks}
        hasQueuedFollowUps={followUps.length > 0}
        onPromoteQueuedFollowUp={onPromoteQueuedFollowUp}
        disabled={
          isReadOnly ||
          isComposerUnavailable ||
          composerShell?.isConsequentiallyBlocked
        }
        placeholder={
          isReadOnly
            ? 'Archived threads are read-only'
            : composerShell?.isConsequentiallyBlocked
              ? 'Synchronize the conversation scope before continuing'
              : placeholder
        }
        onStop={onStop}
        apiService={apiService}
        // Error ends the turn from the operator's POV — show Send again, not Stop.
        showStop={isRunActive && !error}
        willQueueFollowUp={isBusy}
        density={isInspectorComposer ? 'inspector' : 'default'}
        attachments={chatAttachments}
        isUploading={isAttachmentUploading}
        dragState={dragState}
        dragHandlers={dragHandlers}
        addFiles={addFiles}
        removeAttachment={removeAttachment}
        getCompletedAttachments={getCompletedAttachments}
        clearAllAttachments={clearAllAttachments}
        creditsAvailable={creditsAvailable}
      />
    </PromptBarContainer>
  );

  return composerShell?.portalTarget
    ? createPortal(promptBar, composerShell.portalTarget)
    : promptBar;
}
