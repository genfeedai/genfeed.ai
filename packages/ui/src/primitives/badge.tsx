import { cn } from '@genfeedai/helpers';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { getBadgeStatus } from './badge.status';
import { badgeVariants } from './badge.variants';

/** A badge with nothing to say still reads as "no value", never blank. */
const EMPTY_BADGE_LABEL = '—';

export interface BadgeProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'children'>,
    VariantProps<typeof badgeVariants> {
  children?: ReactNode;
  icon?: ReactNode;
  /**
   * Product status or content type ('failed', 'draft', 'video', ...). Sets the
   * variant, default label, icon and tint; explicit children still win.
   */
  status?: string;
  /** A count or short value, rendered semibold. A value of 0 renders nothing. */
  value?: number | string;
}

function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== '';
}

function Badge({
  children,
  className,
  icon,
  size,
  status,
  value,
  variant,
  ...props
}: BadgeProps) {
  if (value === 0) {
    return null;
  }

  const statusConfig = status ? getBadgeStatus(status) : null;
  const StatusIcon = statusConfig?.Icon;
  const resolvedIcon = StatusIcon ? <StatusIcon /> : icon;
  const label = hasContent(children) ? children : statusConfig?.label;

  let content: ReactNode = EMPTY_BADGE_LABEL;
  if (value !== undefined) {
    content = <span className="font-semibold">{value}</span>;
  } else if (hasContent(label) || resolvedIcon) {
    content = label;
  }

  return (
    <span
      className={cn(
        badgeVariants({ size, variant: statusConfig?.variant ?? variant }),
        statusConfig?.className,
        className,
      )}
      {...props}
    >
      {resolvedIcon && (
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 [&_svg]:size-3"
          data-slot="badge-icon"
        >
          {resolvedIcon}
        </span>
      )}
      {content}
    </span>
  );
}

export { Badge };
