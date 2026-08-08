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
import { Input } from '@ui/primitives/input';
import {
  ArrowUp,
  Link,
  Mic,
  Paperclip,
  RefreshCw,
  Square,
  Zap,
} from 'lucide-react';
import { type ChangeEvent, memo, type ReactElement, useRef } from 'react';

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
  models?: readonly IModel[];
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
  models = [],
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
  density = 'default',
}: AgentChatInputToolbarProps): ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCompact = density === 'compact';
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();
  const isAutoSelected =
    !selectedModel || selectedModel === AUTO_MODEL_OPTION_VALUE;
  const autoLabel = prioritize ? getAutoModelLabel(prioritize) : 'Auto';
  // One shared picker for agent chat + studio/generation (selectionMode=single).
  // autoLabel opts single mode into Auto + priority cards (user settings:
  // empty defaultAgentModel + generationPriority).
  const modelSelector =
    onModelChange && (selectedModel || models.length > 0 || isModelsLoading) ? (
      <ModelSelectorPopover
        autoLabel={autoLabel}
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
        models={[...models]}
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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      onAddFiles?.(files);
    }
    event.target.value = '';
  }

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

  // Trailing primary: Stop run | mic (voice-on + empty) | send (otherwise).
  // Mic replaces send in the same slot — never both, never a blank corner
  // when Voice Control is off (disabled send stays).
  let trailingPrimary: ReactElement | null = null;

  if (showStop && onStop) {
    trailingPrimary = (
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
    );
  } else if (isTranscribing) {
    trailingPrimary = (
      <Button
        ariaLabel="Transcribing"
        className={trailingControlClass}
        icon={
          <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
        }
        isDisabled
        size={ButtonSize.ICON}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
    );
  } else if (isListening) {
    trailingPrimary = (
      <Button
        ariaLabel="Stop listening"
        className={cn(
          trailingControlClass,
          'relative bg-destructive/15 text-destructive',
        )}
        onClick={onStopListening}
        size={ButtonSize.ICON}
        tooltip="Stop listening"
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      >
        <Mic className="size-4" />
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 size-2 animate-pulse rounded-full bg-destructive motion-reduce:animate-none"
        />
      </Button>
    );
  } else if (shouldShowVoiceInput) {
    trailingPrimary = (
      <Button
        ariaLabel="Start voice input"
        className={trailingControlClass}
        icon={<Mic className="size-4" />}
        isDisabled={disabled}
        onClick={onStartListening}
        size={ButtonSize.ICON}
        tooltip="Voice input"
        variant={ButtonVariant.DEFAULT}
        withWrapper={false}
      />
    );
  } else if (shouldShowSendButton) {
    trailingPrimary = (
      <Button
        ariaLabel="Send message"
        className={trailingControlClass}
        icon={<ArrowUp className="size-4" />}
        isDisabled={disabled || !hasEditor || !canSendMessage || isUploading}
        onClick={onSend}
        size={ButtonSize.ICON}
        tooltip="Send (Enter)"
        variant={ButtonVariant.DEFAULT}
        withWrapper={false}
      />
    );
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

        {onAddFiles ? (
          <>
            <Input
              ref={fileInputRef}
              accept="image/*,video/*,audio/*"
              aria-label="Choose composer attachments"
              className="sr-only"
              multiple
              onChange={handleFileChange}
              type="file"
            />
            <Button
              ariaLabel="Attach files"
              className={cn('shrink-0', controlSize)}
              icon={<Paperclip className="size-4" />}
              isDisabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              size={ButtonSize.ICON}
              tooltip="Attach files"
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </>
        ) : null}

        <Button
          ariaLabel="Reference library content"
          className={cn('shrink-0', controlSize)}
          icon={<Link className="size-4" />}
          isDisabled={disabled || !hasEditor}
          onClick={onInsertReference}
          size={ButtonSize.ICON}
          tooltip="Reference library content"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ariaLabel="Open composer actions"
              className={cn('shrink-0', controlSize)}
              icon={<Zap className="size-4" />}
              isDisabled={disabled || !hasEditor}
              size={ButtonSize.ICON}
              tooltip="Actions"
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
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {CONVERSATION_COMPOSER_ACTIONS.map((action) => (
              <DropdownMenuItem
                key={action.name}
                onSelect={() => {
                  onSelectAction(action.name);
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-primary">
                    {action.label}
                  </p>
                  <p className="truncate text-[11px] text-muted">
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

      {/* Trailing: stop | mic (voice-on + empty) | send */}
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
