import type { ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

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
