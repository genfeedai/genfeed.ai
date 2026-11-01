import {
  ButtonVariant,
  CardEmptySize,
  CardPadding,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { EmptyStateProps } from '@genfeedai/props/ui/feedback/empty-state.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

const SIZE_CLASSES: Record<
  CardEmptySize,
  { body: string; heading: string; icon: string }
> = {
  [CardEmptySize.SM]: {
    body: 'px-4 py-6',
    icon: 'size-6',
    heading: 'text-sm font-medium text-foreground/70',
  },
  [CardEmptySize.DEFAULT]: {
    body: 'px-6 py-10',
    icon: 'size-10',
    heading: 'text-sm font-medium text-foreground/70',
  },
  [CardEmptySize.LG]: {
    body: 'px-6 py-16',
    icon: 'size-14',
    heading: 'text-base font-medium text-foreground/80',
  },
};

/**
 * The one empty state for the whole app.
 *
 * Variants live here, never at the call site:
 * - `surface="none"` (default) — bare content inside a host card, table or
 *   panel; `surface="card"` — standalone with its own card chrome
 * - `size` — sm (panels, menus, modals), default, lg (pages)
 * - `isFill` — fill the positioned parent, for an empty chart or media frame
 * - `action` (one button) or `actions` (custom nodes)
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  glyph,
  action,
  actions,
  size = CardEmptySize.DEFAULT,
  surface = 'none',
  isFill = false,
  className,
}: EmptyStateProps): ReactElement {
  const sizeClasses = SIZE_CLASSES[size];

  const content = (
    <div
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-1 text-center',
        isFill ? 'absolute inset-0 px-6' : sizeClasses.body,
        surface === 'card' && 'min-h-48 w-full',
        surface === 'none' && className,
      )}
      data-surface={surface}
      data-testid="empty-state"
    >
      {Icon ? (
        <span className="mb-3 flex items-center justify-center rounded-full p-2.5 ring-1 ring-inset ring-border/60">
          <Icon
            aria-hidden="true"
            className={cn('text-muted-foreground', sizeClasses.icon)}
          />
        </span>
      ) : glyph ? (
        <span
          aria-hidden="true"
          className="mb-3 flex items-center justify-center rounded-full p-2.5 text-xl leading-none ring-1 ring-inset ring-border/60"
        >
          {glyph}
        </span>
      ) : null}

      {title ? <h2 className={sizeClasses.heading}>{title}</h2> : null}

      {description ? (
        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}

      {actions
        ? actions
        : action && (
            <Button
              withWrapper={false}
              variant={action.variant || ButtonVariant.GHOST}
              onClick={action.onClick}
              ariaLabel={action.ariaLabel || action.label}
              className="mt-1 h-8 text-xs"
            >
              {action.label}
            </Button>
          )}
    </div>
  );

  if (surface === 'none') {
    return content;
  }

  return (
    <Card
      className={cn('w-full', className)}
      padding={CardPadding.NONE}
      bodyClassName="relative min-h-48"
    >
      {content}
    </Card>
  );
}
