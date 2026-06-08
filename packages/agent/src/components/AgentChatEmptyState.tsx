import {
  AgentChatInput,
  type ExtractedMention,
} from '@genfeedai/agent/components/AgentChatInput';
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
  apiService: AgentApiService;
  emptyStateTitle: string;
  emptyStateDescription: string;
  isWideLayout: boolean;
  isBusy: boolean;
  isReadOnly: boolean;
  isRunActive: boolean;
  placeholder?: string;
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
  promptBarSuggestions: ReactNode;
};

export function AgentChatEmptyState({
  apiService,
  emptyStateTitle,
  emptyStateDescription,
  isWideLayout,
  isBusy,
  isReadOnly,
  isRunActive,
  placeholder,
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
  promptBarSuggestions,
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

          <PromptBarContainer
            layoutMode="inflow"
            maxWidth={isWideLayout ? '2xl' : '4xl'}
            zIndex={60}
            className="mt-4 w-full"
          >
            <AgentChatInput
              onSend={onSend}
              disabled={isBusy || isReadOnly}
              placeholder={placeholder}
              apiService={apiService}
              onStop={onStop}
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

          {promptBarSuggestions ? (
            <div className="mt-5">{promptBarSuggestions}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
