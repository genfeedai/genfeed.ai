'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import type { PromptBarSuggestionItem } from '@ui/prompt-bars/types/prompt-bar-suggestion-item';
import { memo, type ReactElement } from 'react';

interface PromptBarSuggestionsProps {
  suggestions: PromptBarSuggestionItem[];
  onSuggestionSelect: (item: PromptBarSuggestionItem) => void;
  isDisabled?: boolean;
  maxSuggestions?: number;
  className?: string;
}

const PromptBarSuggestions = memo(function PromptBarSuggestions({
  suggestions,
  onSuggestionSelect,
  isDisabled = false,
  maxSuggestions = 3,
  className,
}: PromptBarSuggestionsProps): ReactElement | null {
  const visibleSuggestions = suggestions.slice(0, maxSuggestions);

  if (visibleSuggestions.length === 0) {
    return null;
  }

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      aria-label="Prompt suggestions"
      role="toolbar"
    >
      {visibleSuggestions.map((suggestion) => (
        <Button
          key={suggestion.id}
          variant={ButtonVariant.SOFT}
          tooltip={suggestion.description ?? suggestion.prompt}
          tooltipPosition="top"
          ariaLabel={suggestion.label}
          className={cn(
            'h-auto max-w-full px-3 py-2 text-xs',
            isDisabled && 'pointer-events-none opacity-50',
          )}
          isDisabled={isDisabled}
          withWrapper={false}
          onClick={() => {
            onSuggestionSelect(suggestion);
          }}
        >
          <span className="flex min-w-0 items-center gap-3">
            {suggestion.icon && (
              <span className="flex shrink-0" aria-hidden="true">
                {suggestion.icon}
              </span>
            )}
            <span className="truncate text-xs font-medium normal-case tracking-normal">
              {suggestion.label}
            </span>
          </span>
        </Button>
      ))}
    </div>
  );
});

export default PromptBarSuggestions;
