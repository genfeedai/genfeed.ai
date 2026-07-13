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
import { HiOutlineSparkles } from 'react-icons/hi2';

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
  onSend,
  onStop,
  placeholder,
  promptBarSuggestions,
  removeAttachment,
}: AgentChatEmptyStateProps): ReactElement {
  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div
          className={cn(
            'mx-auto flex h-full w-full flex-col items-center justify-center',
            isWideLayout ? 'max-w-3xl' : 'max-w-3xl',
          )}
        >
          <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-foreground/[0.05] ring-1 ring-inset ring-foreground/[0.08]">
            <HiOutlineSparkles className="size-4 text-foreground/68" />
          </div>

          <h2 className="mb-1 text-center text-base font-semibold tracking-[-0.02em] text-foreground">
            {emptyStateTitle}
          </h2>
          <p className="max-w-md text-center text-xs leading-5 text-foreground/52">
            {emptyStateDescription}
          </p>

          {isComposerVisible ? (
            <PromptBarContainer
              className="mt-4 w-full"
              layoutMode="inflow"
              maxWidth={isWideLayout ? '2xl' : '4xl'}
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
              />
            </PromptBarContainer>
          ) : null}

          {promptBarSuggestions ? (
            <div className="mt-5">{promptBarSuggestions}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
