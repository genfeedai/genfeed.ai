import { cn } from '@genfeedai/helpers';
import type { VariantProps } from 'class-variance-authority';
import {
  CircleAlert,
  CircleCheck,
  Info,
  type LucideIcon,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';
import { getBadgeStatus } from './badge.status';
import { badgeVariants } from './badge.variants';

const NUMERIC_CONTENT_PATTERN = /^[\d\s.,%+/-]+$/;

/** A badge with nothing to say still reads as "no value", never blank. */
const EMPTY_BADGE_LABEL = '—';

export interface BadgeProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'children'>,
    VariantProps<typeof badgeVariants> {
  children?: ReactNode;
  /** Colours for `variant="custom"`: a user-picked tag colour, painted inline. */
  colors?: { backgroundColor: string; textColor: string };
  icon?: ReactNode;
  isRemoveDisabled?: boolean;
  /** Ellipsises a long label instead of letting the badge grow. */
  isTruncated?: boolean;
  /** Shows a remove button after the label; needs `removeLabel`. */
  onRemove?: () => void;
  /** Accessible name of the remove button, translated by the caller. */
  removeLabel?: string;
  /**
   * Product status or content type ('failed', 'draft', 'video', ...). Sets the
   * variant, default label, icon and tint; explicit children still win.
   * Status badges are always uppercase and always carry an icon.
   */
  status?: string;
  /** A count or short value, rendered semibold. A value of 0 renders nothing. */
  value?: number | string;
}

/**
 * The icon a status-toned badge shows when the caller gave none, so a
 * success / warning / error / info chip never reads as a bare coloured label.
 */
function getToneIcon(variant: BadgeProps['variant']): LucideIcon | undefined {
  switch (variant) {
    case 'destructive':
      return CircleAlert;
    case 'info':
      return Info;
    case 'success':
      return CircleCheck;
    case 'warning':
      return TriangleAlert;
    default:
      return undefined;
  }
}

function isNumericContent(node: ReactNode): boolean {
  return (
    typeof node === 'number' ||
    (typeof node === 'string' && NUMERIC_CONTENT_PATTERN.test(node))
  );
}

function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== '';
}

function Badge({
  children,
  casing,
  className,
  colors,
  icon,
  isDot,
  isMono,
  isRemoveDisabled,
  isSolid,
  isTruncated,
  onRemove,
  removeLabel,
  shape,
  size,
  status,
  style,
  value,
  variant,
  ...props
}: BadgeProps) {
  if (value === 0) {
    return null;
  }

  if (isDot) {
    return (
      <span
        className={cn(
          badgeVariants({ isDot, shape, size, variant }),
          className,
        )}
        data-slot="badge"
        {...props}
      />
    );
  }

  const statusConfig = status ? getBadgeStatus(status) : null;
  const StatusIcon = statusConfig?.Icon;
  const label = hasContent(children) ? children : statusConfig?.label;

  // Status-toned badges carry an icon unless the caller opted out of the
  // status look: author casing (tags), mono ids, truncated labels and bare
  // counts are not statuses.
  const ToneIcon =
    !status &&
    !icon &&
    value === undefined &&
    casing !== 'normal' &&
    !isMono &&
    !isTruncated &&
    hasContent(children) &&
    !isNumericContent(children)
      ? getToneIcon(variant)
      : undefined;
  const LeadingIcon = StatusIcon ?? ToneIcon;
  const resolvedIcon = LeadingIcon ? <LeadingIcon /> : icon;

  let content: ReactNode = EMPTY_BADGE_LABEL;
  if (value !== undefined) {
    content = <span className="font-semibold">{value}</span>;
  } else if (hasContent(label) || resolvedIcon) {
    content = label;
  }

  const customStyle: CSSProperties | undefined = colors
    ? {
        backgroundColor: colors.backgroundColor,
        color: colors.textColor,
        ...style,
      }
    : style;

  return (
    <span
      className={cn(
        badgeVariants({
          // A status is a fixed product label, never author text: always
          // uppercase, whatever casing a caller asks for.
          casing: statusConfig ? 'upper' : casing,
          isMono,
          isSolid,
          shape,
          size,
          variant: statusConfig?.variant ?? variant,
        }),
        statusConfig?.className,
        isTruncated && 'min-w-0 max-w-full',
        className,
      )}
      data-slot="badge"
      style={customStyle}
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
      {isTruncated ? <span className="truncate">{content}</span> : content}
      {onRemove && (
        <button
          aria-label={removeLabel}
          className="-mr-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          disabled={isRemoveDisabled}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      )}
    </span>
  );
}

export { Badge };
