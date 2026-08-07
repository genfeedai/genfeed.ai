import { AgentModelSelector } from '@genfeedai/agent/components/AgentModelSelector';
import type { AgentModelOption } from '@genfeedai/agent/constants/agent-models.constant';
import { CONVERSATION_COMPOSER_ACTIONS } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import type { ConversationComposerActionName } from '@genfeedai/agent/models/conversation-composer.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
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
  /** Registry-backed chat catalogue; omitted falls back to the constants list. */
  models?: readonly AgentModelOption[];
  onAddFiles?: (files: File[]) => void;
  onBuyCredits?: () => void;
  onInsertReference: () => void;
  onModelChange?: (model: string) => void;
  onSelectAction: (actionName: ConversationComposerActionName) => void;
  onSend: () => void;
  onStartListening: () => void;
  onStop: (() => void | Promise<void>) | undefined;
  onStopListening: () => void;
  selectedModel?: string;
  shouldShowSendButton: boolean;
  shouldShowVoiceInput: boolean;
  showStop: boolean;
  density?: 'compact' | 'default';
}

function AgentChatInputToolbarInner({
  canSendMessage,
  creditsAvailable = null,
  disabled,
  hasEditor,
  isListening,
  isModelsLoading = false,
  isTranscribing,
  isUploading,
  models = [],
  onAddFiles,
  onBuyCredits,
  onInsertReference,
  onModelChange,
  onSelectAction,
  onSend,
  onStartListening,
  onStop,
  onStopListening,
  selectedModel,
  shouldShowSendButton,
  shouldShowVoiceInput,
  showStop,
  density = 'default',
}: AgentChatInputToolbarProps): ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCompact = density === 'compact';
  const modelSelector =
    selectedModel && onModelChange ? (
      <AgentModelSelector
        ariaLabel="Select model"
        creditsAvailable={creditsAvailable}
        density={isCompact ? 'compact' : 'default'}
        // Model pick stays available while reconnecting / send is paused —
        // only block during an active run or attachment/mic work.
        isDisabled={Boolean(showStop || isUploading || isTranscribing)}
        isLoading={isModelsLoading}
        models={models}
        onBuyCredits={onBuyCredits}
        onModelChange={onModelChange}
        selectedModel={selectedModel}
      />
    ) : null;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      onAddFiles?.(files);
    }
    event.target.value = '';
  }

  // One toolbar control height so model chip + send share a single baseline.
  const controlSize = isCompact ? 'size-8' : 'size-9';
  // Cancel outer padding at the row edges so the first glyph lines up with the
  // editor text above it.
  const leadingEdgeOffset = isCompact ? '-ml-2' : '-ml-2.5';
  const trailingEdgeOffset = isCompact ? '-mr-2' : '-mr-2.5';

  return (
    <div
      className={cn(
        // min-w-0 + wrap: narrow inspector rails must not stack labels on icons.
        'mt-1 flex min-w-0 items-center justify-between gap-1',
        isCompact ? 'min-h-9 flex-wrap pt-1' : 'min-h-10 pt-1.5',
      )}
    >
      <div
        className={cn(
          'flex min-w-0 shrink items-center gap-1',
          leadingEdgeOffset,
        )}
      >
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

        {/* Voice lives with leading tools — far right is model + send only. */}
        {isTranscribing ? (
          <Button
            ariaLabel="Transcribing"
            className={cn('shrink-0', controlSize)}
            icon={
              <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
            }
            isDisabled
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : isListening ? (
          <Button
            ariaLabel="Stop listening"
            className={cn(
              'relative shrink-0 bg-destructive/15 text-destructive',
              controlSize,
            )}
            onClick={onStopListening}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <Mic className="size-4" />
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 size-2 animate-pulse rounded-full bg-destructive motion-reduce:animate-none"
            />
          </Button>
        ) : shouldShowVoiceInput ? (
          <Button
            ariaLabel="Start voice input"
            className={cn('shrink-0', controlSize)}
            icon={<Mic className="size-4" />}
            isDisabled={disabled}
            onClick={onStartListening}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : null}
      </div>

      {/* T3-style trailing cluster: model immediately left of send/stop. */}
      <div
        className={cn(
          'flex min-w-0 shrink items-center justify-end gap-1.5',
          trailingEdgeOffset,
        )}
      >
        {modelSelector}

        {showStop && onStop ? (
          <Button
            ariaLabel="Stop agent"
            className={cn(
              'shrink-0 rounded-full',
              controlSize,
              'min-h-0 min-w-0 p-0',
            )}
            icon={
              <Square
                aria-hidden
                className="size-2.5 fill-current stroke-none"
              />
            }
            onClick={() => {
              void onStop();
            }}
            size={ButtonSize.ICON}
            tooltip="Stop"
            variant={ButtonVariant.DESTRUCTIVE}
            withWrapper={false}
          />
        ) : shouldShowSendButton ? (
          <Button
            ariaLabel="Send message"
            className={cn(
              'shrink-0 rounded-full',
              controlSize,
              'min-h-0 min-w-0 p-0',
            )}
            icon={<ArrowUp className="size-4" />}
            isDisabled={
              disabled || !hasEditor || !canSendMessage || isUploading
            }
            onClick={onSend}
            size={ButtonSize.ICON}
            tooltip="Send (Enter)"
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          />
        ) : null}
      </div>
    </div>
  );
}

export const AgentChatInputToolbar = memo(AgentChatInputToolbarInner);
