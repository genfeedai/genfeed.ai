import { AgentChatInputAttachmentTray } from '@genfeedai/agent/components/AgentChatInputAttachmentTray';
import { AgentChatInputStyles } from '@genfeedai/agent/components/AgentChatInputStyles';
import { AgentChatInputToolbar } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import { useAgentChatInput } from '@genfeedai/agent/components/useAgentChatInput';
import type { ConversationComposerSendOptions } from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { RouterPriority } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type {
  AttachmentItem,
  ChatAttachment,
  DragHandlers,
  DragState,
} from '@genfeedai/props/ui/attachments.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { EditorContent } from '@tiptap/react';
import PromptBarBody from '@ui/prompt-bars/components/shell/PromptBarBody';
import PromptBarShell, {
  PROMPT_BAR_SURFACE_CLASS,
} from '@ui/prompt-bars/components/shell/PromptBarShell';
import { type ReactElement, useCallback, useMemo } from 'react';

// Stable default so memoized children do not see a new [] every render.
const EMPTY_CHAT_ATTACHMENTS: AttachmentItem[] = [];

export type ExtractedMention =
  | { type: 'brand'; id: string; brandName: string; brandSlug: string }
  | {
      type: 'team';
      id: string;
      displayName: string;
      role: string;
      isAgent: boolean;
    }
  | { type: 'credential'; id: string; handle: string; platform: string }
  | { type: 'content'; id: string; contentTitle: string; contentType: string };

interface AgentChatInputProps {
  onSend: (
    content: string,
    mentions?: ExtractedMention[],
    attachments?: ChatAttachment[],
    options?: ConversationComposerSendOptions,
  ) => boolean | undefined | Promise<boolean | undefined>;
  onPromoteQueuedFollowUp?: () => void;
  hasQueuedFollowUps?: boolean;
  onStop?: () => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  apiService?: AgentApiService;
  showStop?: boolean;
  attachments?: AttachmentItem[];
  isUploading?: boolean;
  dragState?: DragState;
  dragHandlers?: DragHandlers;
  addFiles?: (files: File[]) => void;
  removeAttachment?: (id: string) => void;
  getCompletedAttachments?: () => ChatAttachment[];
  clearAllAttachments?: () => void;
  density?: 'compact' | 'default' | 'inspector';
  selectedModel?: string;
  /** Registry-backed chat catalogue for the shared ModelSelectorPopover. */
  models: readonly IModel[];
  isModelsLoading?: boolean;
  onModelChange?: (model: string) => void;
  onPrioritizeChange?: (priority: RouterPriority) => void;
  prioritize?: RouterPriority;
  creditsAvailable?: number | null;
  willQueueFollowUp?: boolean;
}

function mapAttachmentToTrayAsset(
  item: AttachmentItem,
): PromptBarAttachedAsset {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    previewUrl: item.previewUrl,
    role: 'input',
    source: 'upload',
  };
}

export function AgentChatInput({
  onSend,
  onPromoteQueuedFollowUp,
  hasQueuedFollowUps = false,
  onStop,
  disabled,
  placeholder,
  apiService,
  showStop = false,
  attachments = EMPTY_CHAT_ATTACHMENTS,
  isUploading = false,
  dragState,
  dragHandlers,
  addFiles,
  removeAttachment,
  getCompletedAttachments,
  clearAllAttachments,
  density = 'default',
  selectedModel,
  models,
  isModelsLoading = false,
  onModelChange,
  onPrioritizeChange,
  prioritize,
  creditsAvailable = null,
  willQueueFollowUp = false,
}: AgentChatInputProps): ReactElement {
  const isCompact = density === 'compact';
  const isInspector = density === 'inspector';
  const {
    actionFeedback,
    canSendMessage,
    contentLibraryItems,
    editor,
    handlePasteImages,
    handleRemoveAttachment,
    handleRemoveReference,
    handleInsertReference,
    handleSelectAction,
    handleSelectContentReference,
    handleSend,
    handleShellPointerDown,
    hasAttachments,
    isContentLibraryLoading,
    isContentPickerOpen,
    isDragActive,
    isListening,
    isTranscribing,
    references,
    selectedContentIds,
    setIsContentPickerOpen,
    shouldShowSendButton,
    shouldShowVoiceInput,
    startListening,
    stopListening,
  } = useAgentChatInput({
    addFiles,
    apiService,
    attachments,
    clearAllAttachments,
    disabled,
    dragState,
    getCompletedAttachments,
    hasQueuedFollowUps,
    isUploading,
    onPromoteQueuedFollowUp,
    onSend,
    onStop,
    placeholder,
    removeAttachment,
    showStop,
  });

  const trayAssets: PromptBarAttachedAsset[] = useMemo(
    () => attachments.map(mapAttachmentToTrayAsset),
    [attachments],
  );
  const attachmentStatusById = useMemo(
    () =>
      Object.fromEntries(
        attachments.map((attachment) => [attachment.id, attachment.status]),
      ),
    [attachments],
  );
  const handleToolbarSend = useCallback(() => {
    void handleSend();
  }, [handleSend]);

  return (
    <div
      className="relative w-full min-w-0 max-w-full"
      data-density={density}
      onPaste={handlePasteImages}
      {...dragHandlers}
    >
      <AgentChatInputStyles />

      {actionFeedback ? (
        <div
          aria-live="polite"
          className="mb-2 rounded-lg border border-border bg-background-secondary/92 px-3 py-2 text-xs leading-5 text-foreground/78 shadow-border"
          role="status"
        >
          {actionFeedback}
        </div>
      ) : null}

      <PromptBarShell
        className={cn(
          PROMPT_BAR_SURFACE_CLASS,
          isDragActive && 'ring-1 ring-primary/40',
        )}
        data-testid="agent-chat-input-shell"
        onPointerDown={handleShellPointerDown}
      >
        {(hasAttachments || references.length > 0) && (
          <AgentChatInputAttachmentTray
            assets={trayAssets}
            attachmentStatusById={attachmentStatusById}
            isDisabled={disabled}
            onRemoveAttachedAsset={handleRemoveAttachment}
            onRemoveReference={handleRemoveReference}
            references={references}
          />
        )}

        <PromptBarBody density={isCompact ? 'compact' : 'default'}>
          <EditorContent editor={editor} className="flex-1" />

          <AgentChatInputToolbar
            canSendMessage={canSendMessage}
            creditsAvailable={creditsAvailable}
            disabled={disabled}
            hasEditor={Boolean(editor)}
            isListening={isListening}
            isModelsLoading={isModelsLoading}
            isTranscribing={isTranscribing}
            isUploading={isUploading}
            models={models}
            onAddFiles={addFiles}
            onInsertReference={handleInsertReference}
            onModelChange={onModelChange}
            onPrioritizeChange={onPrioritizeChange}
            onSelectAction={handleSelectAction}
            onSend={handleToolbarSend}
            onStartListening={startListening}
            onStop={onStop}
            onStopListening={stopListening}
            prioritize={prioritize}
            selectedModel={selectedModel}
            shouldShowSendButton={shouldShowSendButton}
            shouldShowVoiceInput={shouldShowVoiceInput}
            showStop={Boolean(showStop)}
            willQueueFollowUp={willQueueFollowUp}
            // Inspector rail is narrow — use compact icon-only toolbar density.
            density={isCompact || isInspector ? 'compact' : 'default'}
          />
        </PromptBarBody>
      </PromptBarShell>

      <ContentLibraryPicker
        isLoading={isContentLibraryLoading}
        isOpen={isContentPickerOpen}
        items={contentLibraryItems}
        onOpenChange={setIsContentPickerOpen}
        onSelect={handleSelectContentReference}
        selectedIds={selectedContentIds}
      />
    </div>
  );
}
