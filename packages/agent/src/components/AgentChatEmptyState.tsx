import {
  AgentChatInput,
  type ExtractedMention,
} from '@genfeedai/agent/components/AgentChatInput';
import { ComposerFollowUpQueue } from '@genfeedai/agent/components/ComposerFollowUpQueue';
import type { ConversationComposerSendOptions } from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import type { RouterPriority } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type {
  AttachmentItem,
  ChatAttachment,
  DragHandlers,
  DragState,
} from '@genfeedai/props/ui/attachments.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import type { ReactElement, ReactNode } from 'react';

type AgentChatEmptyStateProps = {
  addFiles: (files: File[]) => void;
  apiService: AgentApiService;
  chatAttachments: AttachmentItem[];
  clearAllAttachments: () => void;
  dragHandlers: DragHandlers;
  dragState: DragState;
  emptyStateTitle: string;
  emptyStateDescription: string;
  followUps?: readonly ComposerFollowUp[];
  getCompletedAttachments: () => ChatAttachment[];
  isAttachmentUploading: boolean;
  isBusy: boolean;
  isComposerVisible: boolean;
  composerBanner?: ReactNode;
  isReadOnly: boolean;
  isRunActive: boolean;
  isWideLayout: boolean;
  /** Compact rail layout for the workspace inspector drawer. */
  variant?: 'default' | 'inspector';
  onMoveFollowUp?: (fromIndex: number, toIndex: number) => void;
  onRemoveFollowUp?: (id: string) => void;
  onSend: (
    content: string,
    mentions?: ExtractedMention[],
    attachments?: ChatAttachment[],
    options?: ConversationComposerSendOptions,
  ) => void;
  onSendFollowUpNow?: (id: string) => void;
  onStop: () => void;
  placeholder?: string;
  promptBarSuggestions: ReactNode;
  removeAttachment: (id: string) => void;
  selectedModel?: string;
  /** Registry-backed chat catalogue. Empty means Auto is the only choice. */
  models: readonly IModel[];
  isModelsLoading?: boolean;
  onModelChange?: (model: string) => void;
  onPrioritizeChange?: (priority: RouterPriority) => void;
  prioritize?: RouterPriority;
  creditsAvailable?: number | null;
};

export function AgentChatEmptyState({
  addFiles,
  apiService,
  chatAttachments,
  clearAllAttachments,
  dragHandlers,
  dragState,
  emptyStateTitle,
  emptyStateDescription,
  followUps = [],
  getCompletedAttachments,
  isAttachmentUploading,
  isBusy,
  isComposerVisible,
  composerBanner,
  isReadOnly,
  isRunActive,
  isWideLayout,
  variant = 'default',
  onMoveFollowUp,
  onSend,
  onSendFollowUpNow,
  onStop,
  onRemoveFollowUp,
  placeholder,
  promptBarSuggestions,
  removeAttachment,
  selectedModel,
  models,
  isModelsLoading = false,
  onModelChange,
  onPrioritizeChange,
  prioritize,
  creditsAvailable = null,
}: AgentChatEmptyStateProps): ReactElement {
  const isInspector = variant === 'inspector';
  const followUpQueue =
    followUps.length > 0 &&
    onMoveFollowUp &&
    onRemoveFollowUp &&
    onSendFollowUpNow ? (
      <ComposerFollowUpQueue
        onMove={onMoveFollowUp}
        onRemove={onRemoveFollowUp}
        onSendNow={onSendFollowUpNow}
        queue={followUps}
      />
    ) : null;
  const composerTopContent =
    composerBanner || followUpQueue ? (
      <>
        {composerBanner}
        {followUpQueue}
      </>
    ) : null;

  if (isInspector) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-6">
          <div className="w-full max-w-sm px-1 text-center">
            <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
              {emptyStateTitle}
            </h2>
            <p className="mt-1 truncate text-xs leading-5 text-foreground/48">
              {emptyStateDescription}
            </p>
          </div>
          {/* Page-contextual action cards (route-aware via pageContext store). */}
          {promptBarSuggestions ? (
            <div className="w-full max-w-sm [&_[role=toolbar]]:!grid-cols-1">
              {promptBarSuggestions}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-y-auto px-4 py-8 md:px-6">
        <div
          className={cn(
            'mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center',
            isWideLayout && 'md:max-w-3xl',
          )}
        >
          <h2 className="mb-2 text-center text-2xl font-semibold tracking-[-0.03em] text-foreground md:text-[1.75rem]">
            {emptyStateTitle}
          </h2>
          <p className="mb-5 max-w-2xl truncate text-center text-sm leading-5 text-foreground/48">
            {emptyStateDescription}
          </p>

          {promptBarSuggestions ? (
            <div className="mb-5 w-full max-w-2xl">{promptBarSuggestions}</div>
          ) : null}

          {isComposerVisible ? (
            <PromptBarContainer
              className="w-full"
              layoutMode="inflow"
              maxWidth="full"
              showTopFade
              topContent={composerTopContent}
              zIndex={60}
            >
              <AgentChatInput
                addFiles={addFiles}
                apiService={apiService}
                attachments={chatAttachments}
                clearAllAttachments={clearAllAttachments}
                disabled={isReadOnly}
                dragHandlers={dragHandlers}
                dragState={dragState}
                getCompletedAttachments={getCompletedAttachments}
                isModelsLoading={isModelsLoading}
                isUploading={isAttachmentUploading}
                models={models}
                onSend={onSend}
                onStop={onStop}
                placeholder={placeholder}
                removeAttachment={removeAttachment}
                showStop={isRunActive}
                willQueueFollowUp={isBusy}
                selectedModel={selectedModel}
                onModelChange={onModelChange}
                onPrioritizeChange={onPrioritizeChange}
                prioritize={prioritize}
                creditsAvailable={creditsAvailable}
              />
            </PromptBarContainer>
          ) : null}
        </div>
      </div>
    </div>
  );
}
