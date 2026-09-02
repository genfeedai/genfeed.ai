'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Mic, RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';

export interface PromptBarVoiceControlProps {
  className?: string;
  density?: 'compact' | 'default';
  isDisabled?: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
}

/** Shared voice state machine for every conversational prompt bar. */
export default function PromptBarVoiceControl({
  className,
  density = 'default',
  isDisabled = false,
  isListening,
  isTranscribing,
  onStartListening,
  onStopListening,
}: PromptBarVoiceControlProps): ReactElement {
  const controlClass = cn(
    'shrink-0 min-h-0 min-w-0 p-0',
    density === 'compact' ? 'size-8' : 'size-9',
    className,
  );

  if (isTranscribing) {
    return (
      <Button
        ariaLabel="Transcribing"
        className={controlClass}
        icon={
          <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
        }
        isDisabled
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
  }

  return (
    <Button
      ariaLabel="Start voice input"
      className={controlClass}
      icon={<Mic className="size-4" />}
      isDisabled={isDisabled}
      onClick={onStartListening}
      size={ButtonSize.ICON}
      tooltip="Voice input"
      variant={ButtonVariant.DEFAULT}
      withWrapper={false}
    />
  );
}
