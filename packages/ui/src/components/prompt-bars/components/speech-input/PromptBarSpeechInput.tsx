'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { PromptBarSpeechInputProps } from '@props/prompt-bars/prompt-bar-layout.props';
import { Input } from '@ui/primitives/input';
import { type ChangeEvent, memo } from 'react';

const PromptBarSpeechInput = memo(function PromptBarSpeechInput({
  shouldRender,
  isAvatarRoute,
  watchedSpeech,
  onSpeechChange,
  isDisabled,
  charLimit,
}: PromptBarSpeechInputProps) {
  const placeholder = isAvatarRoute
    ? 'What should the avatar say?'
    : 'What the avatar will say (8 seconds of speech)';

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (isAvatarRoute || value.length <= charLimit) {
      onSpeechChange(value);
    }
  };

  const characterCount = watchedSpeech?.length ?? 0;
  const isNearLimit = characterCount > charLimit * 0.9;

  if (!shouldRender) {
    return null;
  }

  return (
    <div className="relative w-full">
      <Input
        name="speech"
        type="text"
        placeholder={placeholder}
        value={watchedSpeech ?? ''}
        className={cn(
          'h-11 w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 text-sm',
          !isAvatarRoute && 'pr-28',
        )}
        isDisabled={isDisabled}
        onChange={handleChange}
      />

      {!isAvatarRoute && (
        <span
          className={cn(
            'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs',
            isNearLimit ? 'text-warning' : 'text-foreground/60',
          )}
        >
          {characterCount}/{charLimit} characters
        </span>
      )}
    </div>
  );
});

export default PromptBarSpeechInput;
