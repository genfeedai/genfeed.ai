'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from './button';

const SUGGESTION_ROW_CLASS_NAME =
  'flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors';

export interface SuggestionListProps {
  /** Names the list and makes it a `listbox`: then every row is a `SuggestionItem` with `role="option"`. */
  ariaLabel?: string;
  children: ReactNode;
  /** Layout only: width, height cap. */
  className?: string;
  testId?: string;
}

/**
 * The popup behind an `@` or `!` mention in a text field: a short, scrollable
 * list the keyboard drives from the field, so focus never leaves it. Rows are
 * `SuggestionItem`s; an empty list shows a `SuggestionEmpty`.
 */
export function SuggestionList({
  ariaLabel,
  children,
  className,
  testId,
}: SuggestionListProps) {
  return (
    <div
      className={cn(
        'max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg',
        className,
      )}
      data-testid={testId}
      {...(ariaLabel ? { 'aria-label': ariaLabel, role: 'listbox' } : {})}
    >
      {children}
    </div>
  );
}

export function SuggestionEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2 text-xs text-muted-foreground">{children}</p>;
}

export interface SuggestionItemProps
  extends Pick<
    ComponentProps<typeof Button>,
    'ariaLabel' | 'children' | 'onClick' | 'onMouseDown'
  > {
  /** The row the keyboard is on. */
  isSelected: boolean;
  /** `option` when the list is a `listbox`. */
  role?: 'option';
}

/** One row of a `SuggestionList`; the list owns its look, callers pass content. */
export function SuggestionItem({
  ariaLabel,
  children,
  isSelected,
  onClick,
  onMouseDown,
  role,
}: SuggestionItemProps) {
  return (
    <Button
      aria-selected={role === 'option' ? isSelected : undefined}
      ariaLabel={ariaLabel}
      className={cn(
        SUGGESTION_ROW_CLASS_NAME,
        isSelected
          ? 'bg-accent text-accent-foreground'
          : 'text-popover-foreground hover:bg-accent/50',
      )}
      onClick={onClick}
      onMouseDown={onMouseDown}
      role={role}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      {children}
    </Button>
  );
}
