'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarSubmitSlotProps } from '@genfeedai/props/prompt-bars/prompt-bar-toolbar.props';
import { Button } from '@ui/primitives/button';
import PromptBarVoiceControl from '@ui/prompt-bars/components/toolbar/PromptBarVoiceControl';
import { Square } from 'lucide-react';
import type { ReactElement } from 'react';

/**
 * The trailing submit slot every prompt bar shares:
 * - recording / transcribing → the voice control owns the slot;
 * - empty with voice available → a primary mic owns the slot;
 * - otherwise → Stop (during a run) and/or the surface's send, with the mic
 *   beside send as a secondary icon so dictation can keep appending.
 */
export default function PromptBarSubmitSlot({
  density = 'default',
  isDisabled = false,
  isEmpty,
  isListening,
  isTranscribing,
  isVoiceAvailable,
  onStartListening,
  onStop,
  onStopListening,
  send,
  showStop = false,
  stopLabel = 'Stop',
}: PromptBarSubmitSlotProps): ReactElement {
  if (isListening || isTranscribing) {
    return (
      <PromptBarVoiceControl
        density={density}
        isDisabled={isDisabled}
        isListening={isListening}
        isTranscribing={isTranscribing}
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />
    );
  }

  if (isVoiceAvailable && isEmpty && !showStop) {
    return (
      <PromptBarVoiceControl
        density={density}
        isDisabled={isDisabled}
        isListening={false}
        isTranscribing={false}
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />
    );
  }

  return (
    <>
      {isVoiceAvailable && !showStop && send ? (
        <PromptBarVoiceControl
          density={density}
          isDisabled={isDisabled}
          isListening={false}
          isPrimary={false}
          isTranscribing={false}
          onStartListening={onStartListening}
          onStopListening={onStopListening}
        />
      ) : null}
      {showStop && onStop ? (
        <Button
          ariaLabel={stopLabel}
          className={cn(
            'shrink-0 min-h-0 min-w-0 p-0',
            density === 'compact' ? 'size-8' : 'size-9',
          )}
          icon={
            <Square aria-hidden className="size-2.5 fill-current stroke-none" />
          }
          onClick={onStop}
          size={ButtonSize.ICON}
          tooltip="Stop"
          variant={ButtonVariant.DESTRUCTIVE}
          withWrapper={false}
        />
      ) : null}
      {send}
    </>
  );
}
