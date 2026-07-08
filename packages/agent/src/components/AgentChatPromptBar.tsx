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
}: AgentChatPromptBarProps): ReactElement {
  return (
    <PromptBarContainer
      layoutMode={layoutMode}
      maxWidth="4xl"
      showTopFade
      topContent={
        showSuggestedActionsWhenNotEmpty && promptBarSuggestions ? (
          <div className="px-1 pb-3">{promptBarSuggestions}</div>
        ) : undefined
      }
      zIndex={40}
      className={cn(
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
}
