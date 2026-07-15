import { AgentChatInputAttachmentTray } from '@genfeedai/agent/components/AgentChatInputAttachmentTray';
import { AgentChatInputStyles } from '@genfeedai/agent/components/AgentChatInputStyles';
import { AgentChatInputToolbar } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { AgentComposerContextRail } from '@genfeedai/agent/components/AgentComposerContextRail';
import { useAgentChatInput } from '@genfeedai/agent/components/useAgentChatInput';
import type { ConversationComposerSendOptions } from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type {
  AttachmentItem,
  ChatAttachment,
  DragHandlers,
  DragState,
} from '@genfeedai/props/ui/attachments.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { EditorContent } from '@tiptap/react';
import PromptBarShell from '@ui/prompt-bars/components/shell/PromptBarShell';
import { type ReactElement, useMemo } from 'react';

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
  ) => void;
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
  onStop,
  disabled,
  placeholder,
  apiService,
  showStop = false,
  attachments = [],
  isUploading = false,
  dragState,
  dragHandlers,
  addFiles,
  removeAttachment,
  getCompletedAttachments,
  clearAllAttachments,
}: AgentChatInputProps): ReactElement {
  const {
    actionFeedback,
    canSendMessage,
    editor,
    handlePasteImages,
    handleRemoveAttachment,
    handleInsertReference,
    handleSelectAction,
    handleSend,
    handleShellPointerDown,
    hasAttachments,
    isDragActive,
    isListening,
    isTranscribing,
    references,
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

  return (
    <div
      className="relative w-full"
      onPaste={handlePasteImages}
      {...dragHandlers}
    >
      <AgentChatInputStyles />

      {isDragActive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/50 bg-primary/5">
          <p className="text-sm font-medium text-primary/70">Drop files here</p>
        </div>
      )}

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
          'overflow-hidden rounded-xl border border-border bg-card shadow-border transition-[border-color,box-shadow] focus-within:border-foreground/[0.18] focus-within:shadow-border-strong',
          isDragActive && 'ring-1 ring-primary/40',
        )}
        data-testid="agent-chat-input-shell"
        onPointerDown={handleShellPointerDown}
      >
        <AgentComposerContextRail
          attachmentCount={attachments.length}
          referenceCount={references.length}
        />

        {(hasAttachments || references.length > 0) && (
          <AgentChatInputAttachmentTray
            assets={trayAssets}
            attachmentStatusById={attachmentStatusById}
            isDisabled={disabled}
            onRemoveAttachedAsset={handleRemoveAttachment}
            references={references}
          />
        )}

        <div className="px-3 pb-1 pt-2">
          <EditorContent editor={editor} className="flex-1" />

          <AgentChatInputToolbar
            canSendMessage={canSendMessage}
            disabled={disabled}
            hasEditor={Boolean(editor)}
            isListening={isListening}
            isTranscribing={isTranscribing}
            isUploading={isUploading}
            onAddFiles={addFiles}
            onInsertReference={handleInsertReference}
            onSelectAction={handleSelectAction}
            onSend={() => {
              void handleSend();
            }}
            onStartListening={startListening}
            onStop={onStop}
            onStopListening={stopListening}
            shouldShowSendButton={shouldShowSendButton}
            shouldShowVoiceInput={shouldShowVoiceInput}
            showStop={showStop}
          />
        </div>
      </PromptBarShell>
    </div>
  );
}
