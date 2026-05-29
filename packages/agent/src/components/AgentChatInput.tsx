import { AgentChatInputAttachmentTray } from '@genfeedai/agent/components/AgentChatInputAttachmentTray';
import { AgentChatInputStyles } from '@genfeedai/agent/components/AgentChatInputStyles';
import { AgentChatInputToolbar } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { useAgentChatInput } from '@genfeedai/agent/components/useAgentChatInput';
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
import { Input } from '@ui/primitives/input';
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
    options?: {
      planModeEnabled?: boolean;
    },
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
    canSendMessage,
    draftPlanModeEnabled,
    editor,
    fileInputRef,
    handleFileInputChange,
    handlePlanModeToggle,
    handleRemoveAttachment,
    handleSend,
    handleShellPointerDown,
    hasAttachments,
    isDragActive,
    isListening,
    isTranscribing,
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

  return (
    <div className="w-full relative" {...dragHandlers}>
      <AgentChatInputStyles />

      {isDragActive && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary/50 bg-primary/5">
          <p className="text-sm font-medium text-primary/70">
            Drop images here
          </p>
        </div>
      )}

      <Input
        inputRef={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      <PromptBarShell
        className={cn(
          'p-2 shadow-[0_6px_18px_rgba(0,0,0,0.16)] focus-within:shadow-[0_8px_22px_rgba(0,0,0,0.2)]',
          disabled && 'opacity-50',
          isDragActive && 'ring-1 ring-primary/40',
        )}
        data-testid="agent-chat-input-shell"
        onPointerDown={handleShellPointerDown}
      >
        {hasAttachments && (
          <AgentChatInputAttachmentTray
            assets={trayAssets}
            isDisabled={disabled}
            onBrowseAssets={() => fileInputRef.current?.click()}
            onRemoveAttachedAsset={handleRemoveAttachment}
          />
        )}

        <div className="p-2">
          <EditorContent editor={editor} className="flex-1" />
        </div>

        <AgentChatInputToolbar
          draftPlanModeEnabled={draftPlanModeEnabled}
          onPlanModeToggle={() => {
            void handlePlanModeToggle();
          }}
          disabled={disabled}
          isUploading={isUploading}
          showStop={showStop}
          onStop={onStop}
          isTranscribing={isTranscribing}
          isListening={isListening}
          shouldShowVoiceInput={shouldShowVoiceInput}
          shouldShowSendButton={shouldShowSendButton}
          canSendMessage={canSendMessage}
          hasEditor={Boolean(editor)}
          onStartListening={startListening}
          onStopListening={stopListening}
          onSend={handleSend}
          onAttachClick={
            addFiles ? () => fileInputRef.current?.click() : undefined
          }
        />
      </PromptBarShell>
    </div>
  );
}
