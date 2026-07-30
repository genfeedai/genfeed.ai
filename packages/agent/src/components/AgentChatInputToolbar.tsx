import { AgentModelSelector } from '@genfeedai/agent/components/AgentModelSelector';
import { CONVERSATION_COMPOSER_ACTIONS } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import type { ConversationComposerActionName } from '@genfeedai/agent/models/conversation-composer.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { type ChangeEvent, type ReactElement, useRef, useState } from 'react';
import {
  HiArrowUp,
  HiOutlineArrowPath,
  HiOutlineBolt,
  HiOutlineLink,
  HiOutlineMicrophone,
  HiOutlinePaperClip,
} from 'react-icons/hi2';

interface AgentChatInputToolbarProps {
  canSendMessage: boolean;
  creditsAvailable?: number | null;
  disabled: boolean | undefined;
  hasEditor: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  isUploading: boolean;
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

export function AgentChatInputToolbar({
  canSendMessage,
  creditsAvailable = null,
  disabled,
  hasEditor,
  isListening,
  isTranscribing,
  isUploading,
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
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const isCompact = density === 'compact';
  const showModelSelector = Boolean(selectedModel && onModelChange);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      onAddFiles?.(files);
    }
    event.target.value = '';
  }

  // One toolbar control height so model chip + send share a single baseline.
  const controlSize = isCompact ? 'size-8' : 'size-9';
  const controlHeight = isCompact ? 'h-8' : 'h-9';

  return (
    <div
      className={cn(
        'mt-1 flex items-center justify-between gap-2 border-t border-border/70',
        isCompact ? 'min-h-9 pt-1.5' : 'min-h-10 pt-2',
      )}
    >
      <div className="flex min-w-0 items-center gap-0.5">
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
              icon={<HiOutlinePaperClip className="size-4" />}
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
          ariaLabel="Add an existing content reference"
          className={cn('shrink-0', controlSize)}
          icon={<HiOutlineLink className="size-4" />}
          isDisabled={disabled || !hasEditor}
          onClick={onInsertReference}
          size={ButtonSize.ICON}
          tooltip="Reference existing content"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />

        <Popover open={isActionsOpen} onOpenChange={setIsActionsOpen}>
          <PopoverTrigger asChild>
            <Button
              ariaLabel="Open composer actions"
              className={cn(
                'shrink-0 gap-1.5',
                isCompact ? 'size-8 px-0' : 'h-9 px-2.5',
              )}
              icon={<HiOutlineBolt className="size-4" />}
              isDisabled={disabled || !hasEditor}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              {isCompact ? null : (
                <span className="hidden text-xs sm:inline">Actions</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 rounded-xl border-border bg-popover p-1.5 text-popover-foreground"
            side="top"
          >
            <div aria-label="Trusted composer actions" role="group">
              {CONVERSATION_COMPOSER_ACTIONS.map((action) => (
                <Button
                  className="flex w-full items-start justify-start gap-3 rounded-lg px-3 py-2.5 text-left"
                  key={action.name}
                  onClick={() => {
                    onSelectAction(action.name);
                    setIsActionsOpen(false);
                  }}
                  textTransform="none"
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                >
                  <span className="min-w-16 text-xs font-medium text-foreground">
                    /{action.name}
                  </span>
                  <span className="text-xs leading-4 text-muted-foreground">
                    {action.description}
                  </span>
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {showModelSelector && selectedModel && onModelChange ? (
          <AgentModelSelector
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            creditsAvailable={creditsAvailable}
            onBuyCredits={onBuyCredits}
            density={isCompact ? 'compact' : 'default'}
            isDisabled={Boolean(
              disabled || showStop || isUploading || isTranscribing,
            )}
          />
        ) : null}

        {showStop && onStop ? (
          <Button
            ariaLabel="Stop agent"
            className={cn(
              'shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20',
              controlHeight,
            )}
            onClick={() => {
              void onStop();
            }}
            textTransform="none"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            Stop
          </Button>
        ) : null}

        {isTranscribing ? (
          <Button
            ariaLabel="Transcribing"
            className={cn('shrink-0', controlSize)}
            icon={
              <HiOutlineArrowPath className="size-4 animate-spin motion-reduce:animate-none" />
            }
            isDisabled
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : !showStop && isListening ? (
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
            <HiOutlineMicrophone className="size-4" />
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 size-2 animate-pulse rounded-full bg-destructive motion-reduce:animate-none"
            />
          </Button>
        ) : shouldShowVoiceInput ? (
          <Button
            ariaLabel="Start voice input"
            className={cn('shrink-0', controlSize)}
            icon={<HiOutlineMicrophone className="size-4" />}
            isDisabled={disabled}
            onClick={onStartListening}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : shouldShowSendButton ? (
          <Button
            ariaLabel="Send message"
            className={cn(
              'shrink-0 rounded-lg',
              controlSize,
              // Match model chip height; keep filled primary without oversized ship defaults
              'min-h-0 min-w-0 p-0',
            )}
            icon={<HiArrowUp className="size-4" />}
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
