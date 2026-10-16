import {
  AgentChatInput,
  type ExtractedMention,
} from '@genfeedai/agent/components/AgentChatInput';
import { ComposerFollowUpQueue } from '@genfeedai/agent/components/ComposerFollowUpQueue';
import type { ConversationComposerSendOptions } from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import type { AgentThreadMode } from '@genfeedai/contracts';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
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
  agentMode: AgentThreadMode;
  onAgentModeChange: (mode: AgentThreadMode) => void;
  apiService: AgentApiService;
  /** Knowledge selection sent with every turn from the composer. */
  knowledgeSelection?: KnowledgeSelection;
  /** Host-provided Knowledge picker rendered inside the composer. */
  knowledgeSection?: ReactNode;
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
  /** Compact rail layout for the workspace agent dock. */
  variant?: 'default' | 'dock';
  onMoveFollowUp?: (fromIndex: number, toIndex: number) => void;
  onPromoteQueuedFollowUp?: () => void;
  onRemoveFollowUp?: (id: string) => void;
  onRetryFollowUp?: (id: string) => void;
  onSend: (
    content: string,
    mentions?: ExtractedMention[],
    attachments?: ChatAttachment[],
    options?: ConversationComposerSendOptions,
  ) => boolean | undefined | Promise<boolean | undefined>;
  onSendFollowUpNow?: (id: string) => void;
  isInterruptingFollowUps?: boolean;
  onStop: () => void;
  placeholder?: string;
  promptBarSuggestions: ReactNode;
  removeAttachment: (id: string) => void;
  creditsAvailable?: number | null;
};

export function AgentChatEmptyState({
  knowledgeSelection,
  knowledgeSection,
  addFiles,
  agentMode,
  onAgentModeChange,
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
  onPromoteQueuedFollowUp,
  onSend,
  onSendFollowUpNow,
  onStop,
  onRemoveFollowUp,
  onRetryFollowUp,
  isInterruptingFollowUps = false,
  placeholder,
  promptBarSuggestions,
  removeAttachment,
  creditsAvailable = null,
}: AgentChatEmptyStateProps): ReactElement {
  const isDock = variant === 'dock';
  const followUpQueue =
    followUps.length > 0 &&
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
    ) : null;
  const composerTopContent =
    composerBanner || followUpQueue ? (
      <>
        {composerBanner}
        {followUpQueue}
      </>
    ) : null;

  if (isDock) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <div className="flex flex-col gap-5">
            <div className="w-full text-left">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                {emptyStateTitle}
              </h2>
              <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">
                {emptyStateDescription}
              </p>
            </div>
            {/* Page-contextual action cards (route-aware via pageContext store). */}
            {promptBarSuggestions ? (
              <div className="w-full">{promptBarSuggestions}</div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 md:px-6">
        <div
          className={cn(
            'mx-auto flex w-full max-w-2xl flex-col items-center gap-5',
            isWideLayout && 'md:max-w-3xl',
          )}
        >
          <div className="w-full text-center">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground md:text-[1.75rem]">
              {emptyStateTitle}
            </h2>
            <p className="mt-2 break-words text-sm leading-5 text-muted-foreground">
              {emptyStateDescription}
            </p>
          </div>
          {promptBarSuggestions ? (
            <div className="w-full">{promptBarSuggestions}</div>
          ) : null}
        </div>
      </div>
      {isComposerVisible ? (
        <div className="shrink-0 px-4 pb-4 md:px-6">
          <PromptBarContainer
            className={cn(
              'mx-auto w-full max-w-2xl',
              isWideLayout && 'md:max-w-3xl',
            )}
            layoutMode="inflow"
            maxWidth="full"
            showTopFade={false}
            topContent={composerTopContent}
            zIndex={60}
          >
            <AgentChatInput
              addFiles={addFiles}
              agentMode={agentMode}
              onAgentModeChange={onAgentModeChange}
              apiService={apiService}
              knowledgeSelection={knowledgeSelection}
              knowledgeSection={knowledgeSection}
              attachments={chatAttachments}
              clearAllAttachments={clearAllAttachments}
              disabled={isReadOnly}
              hasQueuedFollowUps={followUps.length > 0}
              onPromoteQueuedFollowUp={onPromoteQueuedFollowUp}
              dragHandlers={dragHandlers}
              dragState={dragState}
              getCompletedAttachments={getCompletedAttachments}
              isUploading={isAttachmentUploading}
              onSend={onSend}
              onStop={onStop}
              placeholder={placeholder}
              removeAttachment={removeAttachment}
              showStop={isRunActive}
              willQueueFollowUp={isBusy}
              creditsAvailable={creditsAvailable}
            />
          </PromptBarContainer>
        </div>
      ) : null}
    </div>
  );
}
