'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { PROMPT_BAR_ICON_BUTTON_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import { Mic } from 'lucide-react';
import type { ReactElement } from 'react';

export interface PromptBarVoiceControlProps {
  className?: string;
  isDisabled?: boolean;
  /**
   * Primary when the mic owns the send slot (empty composer); a plain icon
   * beside Send once there is something to submit.
   */
  isPrimary?: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
}

/** Shared voice state machine for every conversational prompt bar. */
export default function PromptBarVoiceControl({
  className,
  isDisabled = false,
  isPrimary = true,
  isListening,
  isTranscribing,
  onStartListening,
  onStopListening,
}: PromptBarVoiceControlProps): ReactElement {
  const controlClass = cn(PROMPT_BAR_ICON_BUTTON_CLASS, className);

  if (isTranscribing) {
    return (
      <Button
        ariaLabel="Transcribing"
        className={controlClass}
        isLoading
        size={ButtonSize.ICON}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
    );
  }

  if (isListening) {
    return (
      <Button
        ariaLabel="Stop listening"
        className={cn(
          controlClass,
          'relative bg-destructive/10 text-destructive',
        )}
        onClick={onStopListening}
        size={ButtonSize.ICON}
        tooltip="Stop listening"
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      >
        <Mic className="size-3.5" />
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 size-2 animate-pulse rounded-full bg-destructive motion-reduce:animate-none"
        />
      </Button>
    );
  }

  return (
    <Button
      ariaLabel="Start voice input"
      className={controlClass}
      icon={<Mic className="size-3.5" />}
      isDisabled={isDisabled}
      onClick={onStartListening}
      size={ButtonSize.ICON}
      tooltip="Voice input"
      variant={isPrimary ? ButtonVariant.DEFAULT : ButtonVariant.GHOST}
      withWrapper={false}
    />
  );
}
