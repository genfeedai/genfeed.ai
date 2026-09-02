'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import { Button } from '@ui/primitives/button';
import { memo, type ReactElement } from 'react';

interface PromptBarSuggestionsProps {
  suggestions: PromptBarSuggestionItem[];
  onSuggestionSelect: (item: PromptBarSuggestionItem) => void;
  isDisabled?: boolean;
  maxSuggestions?: number;
  className?: string;
  /** `cards` = Codex-style tiles; `chips` = compact pills. */
  variant?: 'cards' | 'chips';
}

const PromptBarSuggestions = memo(function PromptBarSuggestions({
  suggestions,
  onSuggestionSelect,
  isDisabled = false,
  maxSuggestions = 3,
  className,
  variant = 'chips',
}: PromptBarSuggestionsProps): ReactElement | null {
  const visibleSuggestions = suggestions.slice(0, maxSuggestions);

  if (visibleSuggestions.length === 0) {
    return null;
  }

  const isCards = variant === 'cards';

  return (
    <div
      className={cn(
        'w-full min-w-0 max-w-full',
        isCards
          ? 'grid grid-cols-1 gap-2 sm:grid-cols-3'
          : 'flex min-w-0 flex-wrap items-center justify-center gap-2',
        className,
      )}
      aria-label="Prompt suggestions"
      role="toolbar"
    >
      {visibleSuggestions.map((suggestion) => (
        <Button
          key={suggestion.id}
          variant={ButtonVariant.UNSTYLED}
          tooltip={suggestion.description ?? suggestion.prompt}
          tooltipPosition="top"
          ariaLabel={suggestion.label}
          className={cn(
            'h-auto min-w-0 max-w-full text-left normal-case tracking-normal',
            isCards
              ? 'flex min-h-[5.5rem] w-full flex-col items-start gap-2.5 rounded-2xl border border-border bg-background px-3.5 py-3.5 text-foreground/88 shadow-md shadow-black/25 transition-colors hover:border-border/80 hover:bg-background-secondary'
              : // Elevated pills so transcript CTAs fade under them cleanly
                // without a tall opaque composer slab behind the row.
                'inline-flex max-w-[min(100%,18rem)] items-center rounded-full border border-border/80 bg-background px-3.5 py-2 text-xs shadow-md shadow-black/30 ring-1 ring-black/20 hover:border-border hover:bg-background-secondary',
            isDisabled && 'pointer-events-none opacity-50',
          )}
          isDisabled={isDisabled}
          withWrapper={false}
          onClick={() => {
            onSuggestionSelect(suggestion);
          }}
        >
          {isCards ? (
            <span className="flex min-w-0 flex-col items-start gap-2.5">
              {suggestion.icon ? (
                <span className="flex shrink-0" aria-hidden="true">
                  {suggestion.icon}
                </span>
              ) : null}
              <span className="break-words text-left text-sm font-medium leading-snug text-foreground/88">
                {suggestion.label}
              </span>
              {suggestion.description ? (
                <span className="break-words text-left text-2xs leading-snug text-foreground/48">
                  {suggestion.description}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              {suggestion.icon ? (
                <span className="flex shrink-0" aria-hidden="true">
                  {suggestion.icon}
                </span>
              ) : null}
              <span className="truncate text-sm font-medium text-foreground/88">
                {suggestion.label}
              </span>
            </span>
          )}
        </Button>
      ))}
    </div>
  );
});

export default PromptBarSuggestions;
