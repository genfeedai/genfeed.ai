import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import {
  HiArrowUp,
  HiOutlineArrowPath,
  HiOutlineMicrophone,
} from 'react-icons/hi2';

type AgentChatInputToolbarProps = {
  disabled: boolean | undefined;
  isUploading: boolean;
  showStop: boolean;
  onStop: (() => void | Promise<void>) | undefined;
  isTranscribing: boolean;
  isListening: boolean;
  shouldShowVoiceInput: boolean;
  shouldShowSendButton: boolean;
  canSendMessage: boolean;
  hasEditor: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onSend: () => void;
};

export function AgentChatInputToolbar({
  disabled,
  isUploading,
  showStop,
  onStop,
  isTranscribing,
  isListening,
  shouldShowVoiceInput,
  shouldShowSendButton,
  canSendMessage,
  hasEditor,
  onStartListening,
  onStopListening,
  onSend,
}: AgentChatInputToolbarProps): ReactElement {
  return (
    <div className="mt-1">
      <div className="flex items-center justify-end gap-2">
        {showStop && onStop ? (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => {
              void onStop();
            }}
            className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
            ariaLabel="Stop agent"
          >
            Stop
          </Button>
        ) : null}

        {isTranscribing ? (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            isDisabled
            className="shrink-0 flex size-9 items-center justify-center rounded-md bg-primary/20 text-primary"
            aria-label="Transcribing"
          >
            <HiOutlineArrowPath className="size-4 animate-spin" />
          </Button>
        ) : !showStop && isListening ? (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={onStopListening}
            className="relative shrink-0 flex size-9 items-center justify-center rounded-md bg-red-500/20 text-red-400 transition-colors hover:bg-red-500/30"
            aria-label="Stop listening"
          >
            <HiOutlineMicrophone className="size-4" />
            <span className="absolute right-0 top-0 size-2 animate-pulse rounded-full bg-red-500" />
          </Button>
        ) : shouldShowVoiceInput ? (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={onStartListening}
            isDisabled={disabled}
            className="shrink-0 flex size-9 items-center justify-center rounded-md border border-white/12 bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
            ariaLabel="Start voice input"
          >
            <HiOutlineMicrophone className="size-4" />
          </Button>
        ) : shouldShowSendButton ? (
          <Button
            variant={ButtonVariant.GENERATE}
            size={ButtonSize.ICON}
            icon={<HiArrowUp />}
            onClick={onSend}
            isDisabled={
              disabled || !hasEditor || !canSendMessage || isUploading
            }
            className="shrink-0"
          />
        ) : null}
      </div>
    </div>
  );
}
