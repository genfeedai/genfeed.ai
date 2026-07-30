import {
  AgentChatInput,
  type ExtractedMention,
} from '@genfeedai/agent/components/AgentChatInput';
import type { ConversationComposerSendOptions } from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
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
  getCompletedAttachments: () => ChatAttachment[];
  isAttachmentUploading: boolean;
  isBusy: boolean;
  isComposerVisible: boolean;
  isReadOnly: boolean;
  isRunActive: boolean;
  isWideLayout: boolean;
  /** Compact rail layout for the workspace inspector drawer. */
  variant?: 'default' | 'inspector';
  onSend: (
    content: string,
    mentions?: ExtractedMention[],
    attachments?: ChatAttachment[],
    options?: ConversationComposerSendOptions,
  ) => void;
  onStop: () => void;
  placeholder?: string;
  promptBarSuggestions: ReactNode;
  removeAttachment: (id: string) => void;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
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
  getCompletedAttachments,
  isAttachmentUploading,
  isBusy,
  isComposerVisible,
  isReadOnly,
  isRunActive,
  isWideLayout,
  variant = 'default',
  onSend,
  onStop,
  placeholder,
  promptBarSuggestions,
  removeAttachment,
  selectedModel,
  onModelChange,
}: AgentChatEmptyStateProps): ReactElement {
  const isInspector = variant === 'inspector';

  if (isInspector) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col justify-center px-3 py-4">
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            {emptyStateTitle}
          </h2>
          <p className="mt-1 text-xs leading-5 text-foreground/48">
            {emptyStateDescription}
          </p>
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
              zIndex={60}
            >
              <AgentChatInput
                addFiles={addFiles}
                apiService={apiService}
                attachments={chatAttachments}
                clearAllAttachments={clearAllAttachments}
                disabled={isBusy || isReadOnly}
                dragHandlers={dragHandlers}
                dragState={dragState}
                getCompletedAttachments={getCompletedAttachments}
                isUploading={isAttachmentUploading}
                onSend={onSend}
                onStop={onStop}
                placeholder={placeholder}
                removeAttachment={removeAttachment}
                showStop={isRunActive}
                selectedModel={selectedModel}
                onModelChange={onModelChange}
              />
            </PromptBarContainer>
          ) : null}
        </div>
      </div>
    </div>
  );
}
