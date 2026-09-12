import { AgentModeDropdown } from '@genfeedai/agent/components/AgentModeDropdown';
import { CONVERSATION_COMPOSER_ACTIONS } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import type {
  ConversationComposerActionName,
  ConversationComposerGenerationMode,
} from '@genfeedai/agent/models/conversation-composer.model';
import {
  AgentGenerationMode,
  type AgentThreadMode,
  ButtonSize,
  ButtonVariant,
  inferAgentMediaGenerationModeFromPrompt,
} from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarVoiceControl from '@ui/prompt-bars/components/toolbar/PromptBarVoiceControl';
import { ArrowUp, Square, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, type ReactElement, useEffect } from 'react';

export interface AgentChatInputToolbarProps {
  agentMode: AgentThreadMode;
  canSendMessage: boolean;
  disabled: boolean | undefined;
  hasEditor: boolean;
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
  onSelectAction: (actionName: ConversationComposerActionName) => void;
  onSend: () => void;
  onStartListening: () => void;
  onStop: (() => void | Promise<void>) | undefined;
  onStopListening: () => void;
  shouldShowSendButton: boolean;
  shouldShowVoiceInput: boolean;
  showStop: boolean;
  /** Send will enqueue instead of starting a new turn. */
  willQueueFollowUp?: boolean;
  density?: 'compact' | 'default';
}

function AgentChatInputToolbarInner({
  agentMode,
  canSendMessage,
  disabled,
  hasEditor,
  isListening,
  isTranscribing,
  isUploading,
  generationMode,
  promptText,
  onAddFiles,
  onAgentModeChange,
  onInsertReference,
  onGenerationModeChange,
  onSelectAction,
  onSend,
  onStartListening,
  onStop,
  onStopListening,
  shouldShowSendButton,
  shouldShowVoiceInput,
  showStop,
  willQueueFollowUp = false,
  density = 'default',
}: AgentChatInputToolbarProps): ReactElement {
  const translate = useTranslations('agent.composerToolbar');
  const isCompact = density === 'compact';

  // The Agent infers output type from the prompt itself (#4672) — there is no
  // user control for it any more, only the mode dropdown (Auto/Manual/Plan).
  useEffect(() => {
    onGenerationModeChange(
      inferAgentMediaGenerationModeFromPrompt(promptText) ??
        AgentGenerationMode.AUTO,
    );
  }, [onGenerationModeChange, promptText]);

  // Match paperclip / link / actions: square ICON control with default
  // design-system radius (rounded-md via ButtonSize.ICON) — never a full pill.
  const controlSize = isCompact ? 'size-8' : 'size-9';
  const trailingControlClass = cn(
    'shrink-0',
    controlSize,
    'min-h-0 min-w-0 p-0',
  );
  // Pull only the far-right send into the shell padding — leading setup chip
  // keeps natural shell inset so it doesn't hug the border or fight icon gap.
  const trailingEdgeOffset = isCompact ? '-mr-1.5' : '-mr-2';

  // Trailing primary: Stop replaces mic during a run; send sits beside Stop
  // only when the field has text to queue.
  let trailingPrimary: ReactElement | null = null;

  if (isTranscribing || isListening) {
    trailingPrimary = (
      <PromptBarVoiceControl
        density={density}
        isDisabled={disabled}
        isListening={isListening}
        isTranscribing={isTranscribing}
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />
    );
  } else {
    const stopButton =
      showStop && onStop ? (
        <Button
          ariaLabel="Stop agent"
          className={trailingControlClass}
          icon={
            <Square aria-hidden className="size-2.5 fill-current stroke-none" />
          }
          onClick={() => {
            void onStop();
          }}
          size={ButtonSize.ICON}
          tooltip="Stop"
          variant={ButtonVariant.DESTRUCTIVE}
          withWrapper={false}
        />
      ) : null;

    let actionButton: ReactElement | null = null;
    if (shouldShowVoiceInput && !showStop) {
      actionButton = (
        <PromptBarVoiceControl
          density={density}
          isDisabled={disabled}
          isListening={false}
          isTranscribing={false}
          onStartListening={onStartListening}
          onStopListening={onStopListening}
        />
      );
    } else if (shouldShowSendButton) {
      actionButton = (
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
          className={trailingControlClass}
          icon={<ArrowUp className="size-4" />}
          isDisabled={disabled || !hasEditor || !canSendMessage || isUploading}
          onClick={onSend}
          size={ButtonSize.ICON}
          tooltip={
            willQueueFollowUp ? 'Queue follow-up (Enter)' : 'Send (Enter)'
          }
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        />
      );
    }

    trailingPrimary =
      stopButton || actionButton ? (
        <>
          {stopButton}
          {actionButton}
        </>
      ) : null;
  }

  return (
    <div
      className={cn(
        // min-w-0 + wrap: narrow inspector rails must not stack labels on icons.
        'mt-0.5 flex min-w-0 items-center justify-between gap-2',
        isCompact ? 'min-h-8 flex-wrap pt-0.5' : 'min-h-9 pt-1',
      )}
    >
      {/* Leading: mode dropdown, then tools tight to it (no inflated gap). */}
      <div className="flex min-w-0 shrink items-center gap-0.5">
        <AgentModeDropdown
          className={cn('shrink-0', controlSize)}
          isDisabled={disabled || showStop}
          mode={agentMode}
          onChange={onAgentModeChange}
        />

        <PromptBarReferenceControls
          density={density}
          isAttachmentDisabled={disabled}
          isLibraryDisabled={disabled || !hasEditor}
          onAddFiles={onAddFiles}
          onOpenLibrary={onInsertReference}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ariaLabel={translate('actionsAria')}
              className={cn('shrink-0', controlSize)}
              icon={<Zap className="size-4" />}
              isDisabled={disabled || !hasEditor}
              size={ButtonSize.ICON}
              tooltip={translate('actionsAria')}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-56"
            side="top"
            sideOffset={8}
          >
            <DropdownMenuLabel className="flex flex-col gap-0.5 normal-case tracking-normal">
              <span className="text-xs font-semibold text-foreground">
                {translate('actions')}
              </span>
              <span className="text-2xs font-normal leading-4 text-muted-foreground">
                {translate('actionsDescription')}
              </span>
            </DropdownMenuLabel>
            {CONVERSATION_COMPOSER_ACTIONS.map((action) => (
              <DropdownMenuItem
                key={action.name}
                onSelect={() => {
                  onSelectAction(action.name);
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {action.label}
                  </p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {action.description}
                  </p>
                </div>
                <DropdownMenuShortcut className="normal-case tracking-normal">
                  /{action.name}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Trailing: stop (replaces mic) + optional queue send */}
      <div
        className={cn(
          'flex min-w-0 shrink items-center justify-end',
          trailingEdgeOffset,
        )}
      >
        {trailingPrimary}
      </div>
    </div>
  );
}

export const AgentChatInputToolbar = memo(AgentChatInputToolbarInner);
