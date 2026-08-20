import { CONVERSATION_COMPOSER_ACTIONS } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import type { ConversationComposerActionName } from '@genfeedai/agent/models/conversation-composer.model';
import {
  ButtonSize,
  ButtonVariant,
  type RouterPriority,
} from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import ModelSelectorPopover from '@ui/dropdowns/model-selector/ModelSelectorPopover';
import {
  AUTO_MODEL_OPTION_VALUE,
  getAutoModelLabel,
} from '@ui/dropdowns/model-selector/model-selector.constants';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
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
import { memo, type ReactElement } from 'react';

export interface AgentChatInputToolbarProps {
  canSendMessage: boolean;
  creditsAvailable?: number | null;
  disabled: boolean | undefined;
  hasEditor: boolean;
  isListening: boolean;
  /** Registry catalogue is still loading — selector shows its skeleton. */
  isModelsLoading?: boolean;
  isTranscribing: boolean;
  isUploading: boolean;
  /** Registry-backed chat catalogue (shared ModelSelectorPopover). */
  models: readonly IModel[];
  onAddFiles?: (files: File[]) => void;
  onInsertReference: () => void;
  onModelChange?: (model: string) => void;
  /** Session Auto routing priority (maps from settings.generationPriority). */
  onPrioritizeChange?: (priority: RouterPriority) => void;
  onSelectAction: (actionName: ConversationComposerActionName) => void;
  onSend: () => void;
  onStartListening: () => void;
  onStop: (() => void | Promise<void>) | undefined;
  onStopListening: () => void;
  prioritize?: RouterPriority;
  selectedModel?: string;
  shouldShowSendButton: boolean;
  shouldShowVoiceInput: boolean;
  showStop: boolean;
  /** Send will enqueue instead of starting a new turn. */
  willQueueFollowUp?: boolean;
  density?: 'compact' | 'default';
}

function AgentChatInputToolbarInner({
  canSendMessage,
  disabled,
  hasEditor,
  isListening,
  isModelsLoading = false,
  isTranscribing,
  isUploading,
  models,
  creditsAvailable = null,
  onAddFiles,
  onInsertReference,
  onModelChange,
  onPrioritizeChange,
  onSelectAction,
  onSend,
  onStartListening,
  onStop,
  onStopListening,
  prioritize,
  selectedModel,
  shouldShowSendButton,
  shouldShowVoiceInput,
  showStop,
  willQueueFollowUp = false,
  density = 'default',
}: AgentChatInputToolbarProps): ReactElement {
  const translate = useTranslations('agent.composerToolbar');
  const isCompact = density === 'compact';
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();
  const hasSelectableModels = models.length > 0;
  const isAutoSelected =
    hasSelectableModels &&
    (!selectedModel || selectedModel === AUTO_MODEL_OPTION_VALUE);
  const autoLabel = prioritize ? getAutoModelLabel(prioritize) : 'Auto';
  // One shared picker for agent chat + studio/generation (selectionMode=single).
  // autoLabel opts single mode into Auto + priority cards (user settings:
  // empty defaultAgentModel + generationPriority).
  const emptyAllowlistControl =
    onModelChange && !hasSelectableModels && !isModelsLoading ? (
      <Button
        ariaLabel={translate('noModelsEnabled')}
        className={cn(
          'max-w-[12rem] justify-start text-muted-foreground',
          isCompact ? 'h-8 px-1.5' : 'h-9 px-2',
        )}
        isDisabled
        size={ButtonSize.SM}
        textTransform="none"
        title={translate('noModelsEnabledTitle')}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      >
        <span className="truncate text-xs">{translate('noModelsEnabled')}</span>
      </Button>
    ) : null;
  const modelSelector = emptyAllowlistControl ? (
    emptyAllowlistControl
  ) : onModelChange ? (
    <ModelSelectorPopover
      autoLabel={hasSelectableModels ? autoLabel : undefined}
      className={cn(
        'max-w-[12rem] text-muted-foreground hover:text-foreground',
        isCompact ? 'h-8 px-1.5' : 'h-9 px-2',
      )}
      favoriteModelKeys={favoriteModelKeys}
      // Model pick stays available while reconnecting — only block during an
      // active run or attachment/mic work.
      isDisabled={Boolean(
        showStop || isUploading || isTranscribing || isModelsLoading,
      )}
      models={models}
      name="agent-chat-model"
      onChange={(_name, values) => {
        const next = values[0]?.trim();
        if (!next) {
          return;
        }
        // Auto or a concrete key — never leave the previous model in values.
        onModelChange(next);
      }}
      onFavoriteToggle={onFavoriteToggle}
      onPrioritizeChange={(priority) => {
        // Parent handlePrioritizeChange already pins Auto + persists
        // generationPriority. Do NOT also call onModelChange first — that
        // raced a model-only settings patch and dropped the priority save.
        onPrioritizeChange?.(priority);
      }}
      prioritize={prioritize}
      creditsAvailable={creditsAvailable}
      selectionMode="single"
      values={
        isAutoSelected
          ? [AUTO_MODEL_OPTION_VALUE]
          : selectedModel
            ? [selectedModel]
            : []
      }
    />
  ) : null;

  // Match paperclip / link / actions: square ICON control with default
  // design-system radius (rounded-md via ButtonSize.ICON) — never a full pill.
  const controlSize = isCompact ? 'size-8' : 'size-9';
  const trailingControlClass = cn(
    'shrink-0',
    controlSize,
    'min-h-0 min-w-0 p-0',
  );
  // Pull only the far-right send into the shell padding — leading model chip
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
          ariaLabel={willQueueFollowUp ? 'Queue follow-up' : 'Send message'}
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
      {/* Leading: model first, then tools tight to the chip (no inflated gap). */}
      <div className="flex min-w-0 shrink items-center gap-0.5">
        {modelSelector}

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
              tooltip={translate('actions')}
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
            <DropdownMenuLabel>{translate('actions')}</DropdownMenuLabel>
            {CONVERSATION_COMPOSER_ACTIONS.map((action) => (
              <DropdownMenuItem
                key={action.name}
                onSelect={() => {
                  onSelectAction(action.name);
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-primary">
                    {action.label}
                  </p>
                  <p className="truncate text-2xs text-muted">
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
