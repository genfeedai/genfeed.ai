import type { CardEmptySize, CardVariant } from '@genfeedai/enums';
import type { CardEmptyAction } from '@genfeedai/props/ui/cards/card-empty.props';
import type { ComponentType } from 'react';

/**
 * Shared contract for the `EmptyState` primitive.
 *
 * Deliberately stricter than {@link CardEmptyProps}: an empty state must always
 * tell the user *what* is empty (`title`) and offer a concrete next step
 * (`action`). This prevents surfaces from shipping bare skeleton chrome — an
 * empty grid, pending placeholder cards, or zero-value tiles — as if it were
 * content. Optional `icon`/`description` add context; the primitive delegates
 * rendering to `CardEmptyContent` (mapping `title` -> `label`).
 */
export interface EmptyStateProps {
  /** Required headline describing what is empty, in the user's terms. */
  title: string;
  /** Required next step. An empty state must always offer an action. */
  action: CardEmptyAction;
  /** Optional leading icon; sized by `size`. */
  icon?: ComponentType<{ className?: string }>;
  iconClassName?: string;
  /** Optional supporting copy under the title. */
  description?: string;
  className?: string;
  size?: CardEmptySize;
  /** Card visual variant — applies to the card-wrapped `EmptyStateCard` only. */
  variant?: CardVariant;
}
