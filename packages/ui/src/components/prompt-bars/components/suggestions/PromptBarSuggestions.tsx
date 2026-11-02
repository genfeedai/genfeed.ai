'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarSuggestionItem } from '@genfeedai/props/prompt-bars/prompt-bar-suggestion-item.props';
import { Button } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { Fragment, memo, type ReactElement } from 'react';

interface PromptBarSuggestionsProps {
  suggestions: PromptBarSuggestionItem[];
  onSuggestionSelect: (item: PromptBarSuggestionItem) => void;
  isDisabled?: boolean;
  maxSuggestions?: number;
  className?: string;
  /** `cards` = Codex-style tiles; `chips` = compact pills. */
  variant?: 'cards' | 'chips';
}

const TOOLTIP_MAX_LENGTH = 160;

function normalize(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

/**
 * Hovering a suggestion explains what the tile does when its text is cut
 * short: the description (chips hide it), else the prompt a click sends,
 * trimmed to a sentence or two. Anything the tile already shows, or that only
 * repeats its label, is never repeated, so such a tile gets no tooltip.
 */
export function resolveSuggestionTooltip(
  suggestion: PromptBarSuggestionItem,
  isCards: boolean,
): string | null {
  const shown = [
    normalize(suggestion.label),
    ...(isCards ? [normalize(suggestion.description)] : []),
  ].map((text) => text.toLowerCase());
  const candidates = isCards
    ? [suggestion.prompt]
    : [suggestion.description, suggestion.prompt];
  for (const candidate of candidates) {
    const text = normalize(candidate);
    if (text && !shown.includes(text.toLowerCase())) {
      return text.length > TOOLTIP_MAX_LENGTH
        ? `${text.slice(0, TOOLTIP_MAX_LENGTH).trimEnd()}…`
        : text;
    }
  }
  return null;
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
      {visibleSuggestions.map((suggestion) => {
        const tooltip = resolveSuggestionTooltip(suggestion, isCards);
        const button = (
          <Button
            key={suggestion.id}
            variant={ButtonVariant.UNSTYLED}
            ariaLabel={suggestion.label}
            className={cn(
              'h-auto min-w-0 max-w-full text-left normal-case tracking-normal',
              isCards
                ? 'flex min-h-[5.5rem] w-full flex-col items-start gap-2.5 rounded-2xl border border-border bg-background px-3.5 py-3.5 text-foreground/90 shadow-md shadow-black/20 transition-colors hover:border-border/80 hover:bg-card'
                : // Elevated pills so transcript CTAs fade under them cleanly
                  // without a tall opaque composer slab behind the row.
                  'inline-flex max-w-[min(100%,18rem)] items-center rounded-full border border-border/80 bg-background px-3.5 py-2 text-xs shadow-md shadow-black/20 ring-1 ring-black/20 hover:border-border hover:bg-card',
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
                <span className="break-words text-left text-sm font-medium leading-snug text-foreground/90">
                  {suggestion.label}
                </span>
                {suggestion.description ? (
                  <span className="break-words text-left text-2xs leading-snug text-muted-foreground">
                    {suggestion.description}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                {suggestion.icon ? (
                  <span
                    className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4"
                    aria-hidden="true"
                  >
                    {suggestion.icon}
                  </span>
                ) : null}
                <span className="truncate text-sm font-medium text-foreground/90">
                  {suggestion.label}
                </span>
              </span>
            )}
          </Button>
        );

        return tooltip ? (
          <SimpleTooltip
            key={suggestion.id}
            label={tooltip}
            contentClassName="max-w-xs whitespace-normal break-words text-left leading-snug normal-case tracking-normal"
            position="top"
            isDisabled={isDisabled}
          >
            {button}
          </SimpleTooltip>
        ) : (
          <Fragment key={suggestion.id}>{button}</Fragment>
        );
      })}
    </div>
  );
});

export default PromptBarSuggestions;
