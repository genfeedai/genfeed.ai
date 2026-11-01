import {
  ButtonVariant,
  CardEmptySize,
  CardVariant,
} from '@genfeedai/contracts';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import { cn } from '@genfeedai/helpers';
import {
  CARD_SURFACE_BASE_CLASS,
  CARD_SURFACE_VARIANT_CLASSES,
} from '@ui/styles/card-surface';
import type { ReactElement, ReactNode } from 'react';
import { Button } from './button';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  ariaLabel?: string;
}

/**
 * Where the empty state paints:
 * - `none` (default) — bare content; the host card, table or panel owns the
 *   surface.
 * - `card` — standalone page or region empty with its own card chrome. Never
 *   nest it inside another card or table.
 */
export type EmptyStateSurface = 'none' | 'card';

export interface EmptyStateProps {
  /** Headline describing what is empty, in the user's terms. */
  title?: string;
  /** One supporting sentence: why it is empty, or what to do next. */
  description?: ReactNode;
  /** Optional leading icon; sized by `size`. */
  icon?: IconComponent;
  /**
   * Emoji or single character shown in the icon ring when there is no
   * `icon` (agent-authored blocks send emoji, not components).
   */
  glyph?: string;
  /** The next step, rendered as one button. */
  action?: EmptyStateAction;
  /**
   * Custom action nodes (several CTAs or navigation links). Takes precedence
   * over `action`.
   */
  actions?: ReactNode;
  /** Scale of the icon, title and vertical padding. @default CardEmptySize.DEFAULT */
  size?: CardEmptySize;
  /** @default 'none' */
  surface?: EmptyStateSurface;
  /**
   * Fill the positioned parent (`absolute inset-0`, no vertical padding), for
   * an empty chart or media frame.
   */
  isFill?: boolean;
  /** Layout classes only (width, margin, position). */
  className?: string;
}

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
    <div
      className={cn(
        CARD_SURFACE_BASE_CLASS,
        CARD_SURFACE_VARIANT_CLASSES[CardVariant.DEFAULT],
        'w-full',
        className,
      )}
    >
      {content}
    </div>
  );
}
