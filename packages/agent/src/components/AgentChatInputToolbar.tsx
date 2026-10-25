import { AgentModeDropdown } from '@genfeedai/agent/components/AgentModeDropdown';
import type { ConversationComposerGenerationMode } from '@genfeedai/agent/models/conversation-composer.model';
import {
  AgentGenerationMode,
  type AgentThreadMode,
  inferAgentMediaGenerationModeFromPrompt,
} from '@genfeedai/contracts';
import GenerationHarnessSettingsPopover from '@ui/dropdowns/generation-setup/GenerationHarnessSettingsPopover';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarSubmitSlot from '@ui/prompt-bars/components/toolbar/PromptBarSubmitSlot';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import { memo, type ReactElement, useEffect } from 'react';

export interface AgentChatInputToolbarProps {
  agentMode: AgentThreadMode;
  canSendMessage: boolean;
  /** Voice Control is on and the browser can record, regardless of field state. */
  canUseVoiceInput: boolean;
  disabled: boolean | undefined;
  hasEditor: boolean;
  /** Hides agent mode, generation setup and the Library reference picker. */
  isAgentControlsHidden?: boolean;
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
}

function AgentChatInputToolbarInner({
  agentMode,
  canSendMessage,
  canUseVoiceInput,
  disabled,
  hasEditor,
  isAgentControlsHidden = false,
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
}: AgentChatInputToolbarProps): ReactElement {
  // The Agent infers output type from the prompt itself (#4672) — there is no
  // user control for it any more, only the mode dropdown (Auto/Manual/Plan).
  useEffect(() => {
    if (isAgentControlsHidden) {
      return;
    }
    onGenerationModeChange(
      inferAgentMediaGenerationModeFromPrompt(promptText) ??
        AgentGenerationMode.AUTO,
    );
  }, [isAgentControlsHidden, onGenerationModeChange, promptText]);

  const send =
    showStop && !canSendMessage ? null : (
      <PromptBarSendButton
        ariaLabel={
          willQueueFollowUp
            ? 'Queue follow-up'
            : generationMode === AgentGenerationMode.IMAGE
              ? 'Generate image'
              : generationMode === AgentGenerationMode.VIDEO
                ? 'Generate video'
                : 'Send message'
        }
        isDisabled={disabled || !hasEditor || !canSendMessage || isUploading}
        onClick={onSend}
        tooltip={willQueueFollowUp ? 'Queue follow-up (Enter)' : 'Send (Enter)'}
      />
    );

  return (
    <PromptBarToolbar
      mode={
        isAgentControlsHidden ? null : (
          <AgentModeDropdown
            isDisabled={disabled || showStop}
            mode={agentMode}
            onChange={onAgentModeChange}
          />
        )
      }
      enhance={
        isAgentControlsHidden ? null : (
          <GenerationHarnessSettingsPopover
            className="size-8"
            isDisabled={disabled || showStop}
          />
        )
      }
      reference={
        isAgentControlsHidden ? null : (
          <PromptBarReferenceControls
            isAttachmentDisabled={disabled}
            isLibraryDisabled={disabled || !hasEditor}
            onAddFiles={onAddFiles}
            onOpenLibrary={onInsertReference}
          />
        )
      }
      trailing={
        <PromptBarSubmitSlot
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
