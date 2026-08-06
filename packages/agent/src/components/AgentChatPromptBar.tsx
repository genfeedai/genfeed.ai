import {
  AgentChatInput,
  type ExtractedMention,
} from '@genfeedai/agent/components/AgentChatInput';
import { AgentComposerStatusStack } from '@genfeedai/agent/components/AgentComposerStatusStack';
import { useConversationComposerShell } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { GenerationActionCard } from '@genfeedai/agent/components/GenerationActionCard';
import type {
  AgentInputRequest,
  AgentProposedPlan,
  AgentUiAction,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import type { ConversationComposerSendOptions } from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentSocketConnectionState } from '@genfeedai/agent/stores/agent-chat.store';
import type { AgentUiActionHandler } from '@genfeedai/interfaces';
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
  activeGenerationAction: AgentUiAction | null;
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
    options?: ConversationComposerSendOptions,
  ) => void;
  onStop: () => void;
  activeWorkEvent: AgentWorkEvent | null;
  error: string | null;
  isSubmittingInputRequest: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  onClearError: () => void;
  onSubmitInputRequest: (answer: string) => void | Promise<void>;
  onUiAction: AgentUiActionHandler;
  pendingInputRequest: AgentInputRequest | null;
  socketConnectionState: AgentSocketConnectionState;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  models?: import('@genfeedai/agent/constants/agent-models.constant').AgentModelOption[];
  isModelsLoading?: boolean;
  creditsAvailable?: number | null;
  onBuyCredits?: () => void;
};

export function AgentChatPromptBar({
  activeGenerationAction,
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
  onUiAction,
  pendingInputRequest,
  socketConnectionState,
  selectedModel,
  onModelChange,
  models,
  isModelsLoading = false,
  creditsAvailable = null,
  onBuyCredits,
}: AgentChatPromptBarProps): ReactElement {
  const composerShell = useConversationComposerShell();
  const isInspectorComposer = composerShell?.placement === 'inspector';
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
  const hasFollowUpChips =
    showSuggestedActionsWhenNotEmpty && Boolean(promptBarSuggestions);
  const topContent = (
    <>
      {!isReadOnly && activeGenerationAction ? (
        <div className="pb-2">
          <GenerationActionCard
            action={activeGenerationAction}
            apiService={apiService}
            className="mt-0 rounded-lg shadow-sm"
            onUiAction={onUiAction}
          />
        </div>
      ) : null}
      {statusStack}
      {hasFollowUpChips ? (
        // Opaque strip so last-message CTAs never show through the chip row.
        <div className="relative z-10 -mx-1 bg-background px-1 pb-3 pt-1">
          {promptBarSuggestions}
        </div>
      ) : null}
    </>
  );
  const isPortaled = Boolean(composerShell?.portalTarget);
  const promptBar = (
    <PromptBarContainer
      layoutMode={isPortaled ? 'inflow' : layoutMode}
      maxWidth={isInspectorComposer ? 'full' : '4xl'}
      // Overlay (portaled or surface-fixed) needs a scrim so transcript
      // soft-fades into the frosted bar instead of clipping hard.
      showTopFade={!isInspectorComposer}
      topContent={topContent}
      topFadeClassName={
        hasFollowUpChips ? 'h-36 from-background from-50%' : undefined
      }
      zIndex={40}
      className={cn(
        isPortaled && 'pointer-events-auto w-full',
        layoutMode === 'fixed' && 'bottom-2 md:bottom-4',
        layoutMode === 'surface-fixed' && 'bottom-3 md:bottom-5',
      )}
    >
      <AgentChatInput
        onSend={onSend}
        disabled={
          isBusy || isReadOnly || composerShell?.isConsequentiallyBlocked
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
        showStop={isRunActive}
        density={isInspectorComposer ? 'inspector' : 'default'}
        attachments={chatAttachments}
        isUploading={isAttachmentUploading}
        dragState={dragState}
        dragHandlers={dragHandlers}
        addFiles={addFiles}
        removeAttachment={removeAttachment}
        getCompletedAttachments={getCompletedAttachments}
        clearAllAttachments={clearAllAttachments}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        models={models}
        isModelsLoading={isModelsLoading}
        creditsAvailable={creditsAvailable}
        onBuyCredits={onBuyCredits}
      />
    </PromptBarContainer>
  );

  return composerShell?.portalTarget
    ? createPortal(promptBar, composerShell.portalTarget)
    : promptBar;
}
