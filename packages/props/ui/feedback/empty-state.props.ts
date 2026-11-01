import type { ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactElement, ReactNode } from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  ariaLabel?: string;
}

/**
 * Shared contract for `EmptyState` (bare) and `EmptyStateCard` (framed).
 *
 * An empty state always names what is empty (`title`) so a surface never
 * ships bare skeleton chrome as if it were content. `description` says why or
 * what to do next; `action` or `actions` offer the next step.
 */
export interface EmptyStateProps {
  /** Headline describing what is empty, in the user's terms. */
  title: string;
  /** One supporting sentence under the title: why it is empty, or what to do next. */
  description?: ReactNode;
  /** Single next-step button. */
  action?: EmptyStateAction;
  /**
   * Custom action node rendered in place of the built-in single `action`
   * button, for several CTAs or navigation `Link`s. Takes precedence over
   * `action`.
   */
  actions?: ReactNode;
  /** Optional leading icon component (sized by `size`) or a ready-made element. */
  icon?: IconComponent | ReactElement;
  /** Colour/layout for the icon (not its size, which `size` owns). */
  iconClassName?: string;
  /** Layout only (width, margin, flex). Padding and type come from `size`. */
  className?: string;
  size?: CardEmptySize;
}
