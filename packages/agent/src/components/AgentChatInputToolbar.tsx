import { CONVERSATION_COMPOSER_ACTIONS } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import type { ConversationComposerActionName } from '@genfeedai/agent/models/conversation-composer.model';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
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
  disabled: boolean | undefined;
  hasEditor: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  isUploading: boolean;
  onAddFiles?: (files: File[]) => void;
  onInsertReference: () => void;
  onSelectAction: (actionName: ConversationComposerActionName) => void;
  onSend: () => void;
  onStartListening: () => void;
  onStop: (() => void | Promise<void>) | undefined;
  onStopListening: () => void;
  shouldShowSendButton: boolean;
  shouldShowVoiceInput: boolean;
  showStop: boolean;
}

export function AgentChatInputToolbar({
  canSendMessage,
  disabled,
  hasEditor,
  isListening,
  isTranscribing,
  isUploading,
  onAddFiles,
  onInsertReference,
  onSelectAction,
  onSend,
  onStartListening,
  onStop,
  onStopListening,
  shouldShowSendButton,
  shouldShowVoiceInput,
  showStop,
}: AgentChatInputToolbarProps): ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      onAddFiles?.(files);
    }
    event.target.value = '';
  }

  return (
    <div className="mt-1 flex min-h-10 items-center justify-between gap-2 border-t border-border/70 pt-2">
      <div className="flex min-w-0 items-center gap-1">
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
              className="size-9 shrink-0"
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
          className="size-9 shrink-0"
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
              className="h-9 shrink-0 gap-1.5 px-2.5"
              icon={<HiOutlineBolt className="size-4" />}
              isDisabled={disabled || !hasEditor}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              <span className="hidden text-xs sm:inline">Actions</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 rounded-xl border-border bg-popover p-1.5"
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

      <div className="flex shrink-0 items-center gap-2">
        {showStop && onStop ? (
          <Button
            ariaLabel="Stop agent"
            className="h-9 shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
            onClick={() => {
              void onStop();
            }}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            Stop
          </Button>
        ) : null}

        {isTranscribing ? (
          <Button
            ariaLabel="Transcribing"
            className="size-9 shrink-0"
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
            className="relative size-9 shrink-0 bg-destructive/15 text-destructive"
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
            className="size-9 shrink-0"
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
            className="size-9 shrink-0"
            icon={<HiArrowUp className="size-4" />}
            isDisabled={
              disabled || !hasEditor || !canSendMessage || isUploading
            }
            onClick={onSend}
            size={ButtonSize.ICON}
            tooltip="Send (Enter)"
            variant={ButtonVariant.GENERATE}
            withWrapper={false}
          />
        ) : null}
      </div>
    </div>
  );
}
