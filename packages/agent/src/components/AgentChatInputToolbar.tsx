import { AgentModeDropdown } from '@genfeedai/agent/components/AgentModeDropdown';
import type { ConversationComposerGenerationMode } from '@genfeedai/agent/models/conversation-composer.model';
import {
  AgentGenerationMode,
  type AgentThreadMode,
  ButtonSize,
  ButtonVariant,
  inferAgentMediaGenerationModeFromPrompt,
} from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import GenerationHarnessSettingsPopover from '@ui/dropdowns/generation-setup/GenerationHarnessSettingsPopover';
import { Button } from '@ui/primitives/button';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarSubmitSlot from '@ui/prompt-bars/components/toolbar/PromptBarSubmitSlot';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import { ArrowUp } from 'lucide-react';
import { memo, type ReactElement, useEffect } from 'react';

export interface AgentChatInputToolbarProps {
  agentMode: AgentThreadMode;
  canSendMessage: boolean;
  /** Voice Control is on and the browser can record, regardless of field state. */
  canUseVoiceInput: boolean;
  disabled: boolean | undefined;
  hasEditor: boolean;
  /** No text and no ready attachments: the mic owns the submit slot. */
  isEmptyComposer: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  isUploading: boolean;
  generationMode: ConversationComposerGenerationMode;
  /** Live prompt text — drives Auto's keyword-based media inference. */
  promptText: string;
  onAddFiles?: (files: File[]) => void;
  onAgentModeChange: (mode: AgentThreadMode) => void;
  onInsertReference: () => void;
  onGenerationModeChange: (mode: ConversationComposerGenerationMode) => void;
  onSend: () => void;
  onStartListening: () => void;
  onStop: (() => void | Promise<void>) | undefined;
  onStopListening: () => void;
  showStop: boolean;
  /** Send will enqueue instead of starting a new turn. */
  willQueueFollowUp?: boolean;
  density?: 'compact' | 'default';
}

function AgentChatInputToolbarInner({
  agentMode,
  canSendMessage,
  canUseVoiceInput,
  disabled,
  hasEditor,
  isEmptyComposer,
  isListening,
  isTranscribing,
  isUploading,
  generationMode,
  promptText,
  onAddFiles,
  onAgentModeChange,
  onInsertReference,
  onGenerationModeChange,
  onSend,
  onStartListening,
  onStop,
  onStopListening,
  showStop,
  willQueueFollowUp = false,
  density = 'default',
}: AgentChatInputToolbarProps): ReactElement {
  const isCompact = density === 'compact';

  // The Agent infers output type from the prompt itself (#4672) — there is no
  // user control for it any more, only the mode dropdown (Auto/Manual/Plan).
  useEffect(() => {
    onGenerationModeChange(
      inferAgentMediaGenerationModeFromPrompt(promptText) ??
        AgentGenerationMode.AUTO,
    );
  }, [onGenerationModeChange, promptText]);

  const controlSize = isCompact ? 'size-8' : 'size-9';
  const send =
    showStop && !canSendMessage ? null : (
      <Button
        ariaLabel={
          willQueueFollowUp
            ? 'Queue follow-up'
            : generationMode === AgentGenerationMode.IMAGE
              ? 'Generate image'
              : generationMode === AgentGenerationMode.VIDEO
                ? 'Generate video'
                : 'Send message'
        }
        className={cn('shrink-0 min-h-0 min-w-0 p-0', controlSize)}
        icon={<ArrowUp className="size-4" />}
        isDisabled={disabled || !hasEditor || !canSendMessage || isUploading}
        onClick={onSend}
        size={ButtonSize.ICON}
        tooltip={willQueueFollowUp ? 'Queue follow-up (Enter)' : 'Send (Enter)'}
        variant={ButtonVariant.DEFAULT}
        withWrapper={false}
      />
    );

  return (
    <PromptBarToolbar
      density={density}
      leading={
        <>
          <PromptBarReferenceControls
            density={density}
            isAttachmentDisabled={disabled}
            isLibraryDisabled={disabled || !hasEditor}
            onAddFiles={onAddFiles}
            onOpenLibrary={onInsertReference}
          />
          <AgentModeDropdown
            isDisabled={disabled || showStop}
            mode={agentMode}
            onChange={onAgentModeChange}
          />
          <GenerationHarnessSettingsPopover
            className={controlSize}
            isDisabled={disabled || showStop}
          />
        </>
      }
      trailing={
        <PromptBarSubmitSlot
          density={density}
          isDisabled={disabled}
          isEmpty={isEmptyComposer}
          isListening={isListening}
          isTranscribing={isTranscribing}
          isVoiceAvailable={canUseVoiceInput}
          onStartListening={onStartListening}
          onStop={
            onStop
              ? () => {
                  void onStop();
                }
              : undefined
          }
          onStopListening={onStopListening}
          send={send}
          showStop={showStop}
          stopLabel="Stop agent"
        />
      }
    />
  );
}

export const AgentChatInputToolbar = memo(AgentChatInputToolbarInner);
