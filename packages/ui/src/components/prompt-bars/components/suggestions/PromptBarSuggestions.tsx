'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import type { PromptBarSuggestionItem } from '@ui/prompt-bars/types/prompt-bar-suggestion-item';
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
        isCards
          ? 'grid w-full grid-cols-1 gap-2 sm:grid-cols-3'
          : 'flex flex-wrap items-center gap-2',
        className,
      )}
      aria-label="Prompt suggestions"
      role="toolbar"
    >
      {visibleSuggestions.map((suggestion) => (
        <Button
          key={suggestion.id}
          variant={ButtonVariant.UNSTYLED}
          tooltip={
            isCards
              ? (suggestion.description ?? suggestion.prompt)
              : (suggestion.description ?? suggestion.prompt)
          }
          tooltipPosition="top"
          ariaLabel={suggestion.label}
          className={cn(
            'h-auto text-left normal-case tracking-normal',
            isCards
              ? 'flex min-h-[5.5rem] w-full flex-col items-start gap-2.5 rounded-2xl border border-border/45 bg-foreground/[0.03] px-3.5 py-3.5 text-foreground/88 transition-colors hover:border-border/70 hover:bg-foreground/[0.055]'
              : 'max-w-full rounded-xl border border-border/45 bg-foreground/[0.03] px-3 py-2 text-xs hover:bg-foreground/[0.06]',
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
              <span className="text-left text-[13px] font-medium leading-snug text-foreground/88">
                {suggestion.label}
              </span>
              {suggestion.description ? (
                <span className="text-left text-[11px] leading-snug text-foreground/48">
                  {suggestion.description}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-2.5">
              {suggestion.icon ? (
                <span className="flex shrink-0" aria-hidden="true">
                  {suggestion.icon}
                </span>
              ) : null}
              <span className="truncate text-xs font-medium">
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
