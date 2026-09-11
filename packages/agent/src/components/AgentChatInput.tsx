import { AgentChatInputAttachmentTray } from '@genfeedai/agent/components/AgentChatInputAttachmentTray';
import { AgentChatInputStyles } from '@genfeedai/agent/components/AgentChatInputStyles';
import { AgentChatInputToolbar } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import { useAgentChatInput } from '@genfeedai/agent/components/useAgentChatInput';
import type {
  ConversationComposerGenerationMode,
  ConversationComposerSendOptions,
} from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { AgentGenerationMode, AgentThreadMode } from '@genfeedai/contracts';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type {
  AttachmentItem,
  ChatAttachment,
  DragHandlers,
  DragState,
} from '@genfeedai/props/ui/attachments.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';

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
  | { type: 'content'; id: string; contentTitle: string; contentType: string }
  | { type: 'character'; id: string; handle: string; label: string };

interface AgentChatInputProps {
  agentMode?: AgentThreadMode;
  onAgentModeChange?: (mode: AgentThreadMode) => void;
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
  /** Joins the composer to an expandable mode/settings strip above it. */
  isTopAttached?: boolean;
  /** Unused by this component directly; forwarded by some hosts for parity. */
  creditsAvailable?: number | null;
  willQueueFollowUp?: boolean;
  /** Knowledge selection sent with every turn from this composer. */
  knowledgeSelection?: KnowledgeSelection;
  /** Host-provided picker rendered above the attachment tray. */
  knowledgePicker?: ReactNode;
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
  agentMode = AgentThreadMode.MANUAL,
  onAgentModeChange = () => {},
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
  isTopAttached = false,
  willQueueFollowUp = false,
  knowledgeSelection,
  knowledgePicker,
}: AgentChatInputProps): ReactElement {
  const isCompact = density === 'compact';
  const isInspector = density === 'inspector';
  const [generationMode, setGenerationMode] =
    useState<ConversationComposerGenerationMode>(AgentGenerationMode.AUTO);
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
    promptText,
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
    generationMode,
    hasQueuedFollowUps,
    knowledgeSelection,
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

      <PromptBarComposer
        beforeBody={
          knowledgePicker || hasAttachments || references.length > 0 ? (
            <>
              {knowledgePicker}
              {hasAttachments || references.length > 0 ? (
                <AgentChatInputAttachmentTray
                  assets={trayAssets}
                  attachmentStatusById={attachmentStatusById}
                  isDisabled={disabled}
                  onRemoveAttachedAsset={handleRemoveAttachment}
                  onRemoveReference={handleRemoveReference}
                  references={references}
                />
              ) : null}
            </>
          ) : null
        }
        className={cn(
          isTopAttached && 'rounded-t-none',
          isDragActive && 'ring-1 ring-primary/40',
        )}
        data-testid="agent-chat-input-shell"
        density={isCompact ? 'compact' : 'default'}
        onPointerDown={handleShellPointerDown}
      >
        <PromptEditor
          ariaLabel="Conversation prompt"
          className="flex-1"
          editor={editor}
        />

        <AgentChatInputToolbar
          agentMode={agentMode}
          canSendMessage={canSendMessage}
          disabled={disabled}
          hasEditor={Boolean(editor)}
          isListening={isListening}
          isTranscribing={isTranscribing}
          isUploading={isUploading}
          generationMode={generationMode}
          promptText={promptText}
          onAddFiles={addFiles}
          onAgentModeChange={onAgentModeChange}
          onInsertReference={handleInsertReference}
          onGenerationModeChange={setGenerationMode}
          onSelectAction={handleSelectAction}
          onSend={handleToolbarSend}
          onStartListening={startListening}
          onStop={onStop}
          onStopListening={stopListening}
          shouldShowSendButton={shouldShowSendButton}
          shouldShowVoiceInput={shouldShowVoiceInput}
          showStop={Boolean(showStop)}
          willQueueFollowUp={willQueueFollowUp}
          // Inspector rail is narrow — use compact icon-only toolbar density.
          density={isCompact || isInspector ? 'compact' : 'default'}
        />
      </PromptBarComposer>

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
