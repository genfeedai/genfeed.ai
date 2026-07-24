import type { EmptyStateProps } from '@genfeedai/props/ui/feedback/empty-state.props';
import CardEmpty, { CardEmptyContent } from '@ui/card/empty/CardEmpty';

export type { EmptyStateProps };

/**
 * EmptyState - shared empty-state primitive (no card wrapper).
 *
 * Stricter than `CardEmptyContent`: `title` and `action` are required so a
 * surface can never ship bare skeleton chrome as if it were content. Delegates
 * rendering to `CardEmptyContent`, mapping `title` -> `label`.
 */
export function EmptyState({
  title,
  action,
  icon,
  iconClassName,
  description,
  className,
  size,
}: EmptyStateProps) {
  return (
    <CardEmptyContent
      icon={icon}
      iconClassName={iconClassName}
      label={title}
      description={description}
      action={action}
      className={className}
      size={size}
    />
  );
}

/**
 * EmptyStateCard - the same primitive wrapped in a `Card`.
 */
export function EmptyStateCard({
  title,
  action,
  icon,
  iconClassName,
  description,
  className,
  size,
  variant,
}: EmptyStateProps) {
  return (
    <CardEmpty
      icon={icon}
      iconClassName={iconClassName}
      label={title}
      description={description}
      action={action}
      className={className}
      size={size}
      variant={variant}
    />
  );
}
