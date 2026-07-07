import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IBadgeStatusConfig } from '@genfeedai/interfaces/ui/badge-status-config.interface';
import type { BadgeProps } from '@genfeedai/props/ui/display/badge.props';
import { Badge as PrimitiveBadge } from '@ui/primitives/badge';
import type { VariantProps } from 'class-variance-authority';
import {
  HiArrowPath,
  HiCalendar,
  HiCheckCircle,
  HiClock,
  HiXCircle,
} from 'react-icons/hi2';
import { badgeVariants } from './badge.variants';

const PRIMITIVE_VARIANT_MAP = {
  accent: 'default',
  amber: 'warning',
  audio: 'warning',
  blue: 'info',
  default: 'default',
  destructive: 'destructive',
  error: 'destructive',
  ghost: 'secondary',
  image: 'info',
  info: 'info',
  multimodal: 'default',
  operational: 'success',
  outline: 'outline',
  primary: 'default',
  purple: 'default',
  secondary: 'secondary',
  slate: 'secondary',
  success: 'success',
  text: 'success',
  validated: 'success',
  video: 'default',
  warning: 'warning',
} as const;

const BADGE_SIZE_MAP: Record<
  string,
  VariantProps<typeof badgeVariants>['size']
> = {
  [ComponentSize.LG]: 'lg',
  [ComponentSize.MD]: 'default',
  [ComponentSize.SM]: 'sm',
};

/**
 * Get complete badge configuration from status string
 * Returns variant, icon, label, and animation state
 */
function getStatusConfig(status: string): IBadgeStatusConfig {
  const normalizedStatus = status.toLowerCase().trim();

  switch (normalizedStatus) {
    case 'completed':
    case 'published':
    case 'active':
    case 'success':
      return {
        icon: <HiCheckCircle className="size-3" />,
        label: 'Completed',
        variant: 'success',
      };

    case 'scheduled':
      return {
        icon: <HiCalendar className="size-3" />,
        label: 'Scheduled',
        shouldSpin: false,
        variant: 'info',
      };

    case 'processing':
    case 'running':
    case 'uploading':
      return {
        icon: <HiArrowPath className="size-3" />,
        label: 'Processing',
        shouldSpin: true,
        variant: 'accent',
      };

    case 'pending':
    case 'paused':
    case 'inactive':
    case 'warning':
      return {
        icon: <HiClock className="size-3" />,
        label: 'Pending',
        variant: 'secondary',
      };

    case 'failed':
    case 'error':
    case 'cancelled':
    case 'canceled':
      return {
        icon: <HiXCircle className="size-3" />,
        label: 'Failed',
        variant: 'error',
      };

    case 'draft':
    case 'private':
    case 'unlisted':
    case 'skipped':
      return {
        icon: <HiClock className="size-3" />,
        label: 'Draft',
        variant: 'ghost',
      };

    // Content type badges
    case 'image':
      return {
        label: 'Image',
        variant: 'image',
      };
    case 'video':
      return {
        label: 'Video',
        variant: 'video',
      };
    case 'audio':
      return {
        label: 'Audio',
        variant: 'audio',
      };
    case 'text':
      return {
        label: 'Text',
        variant: 'text',
      };
    case 'multimodal':
      return {
        label: 'Multimodal',
        variant: 'multimodal',
      };

    // Operational status
    case 'validated':
    case 'operational':
      return {
        icon: <HiCheckCircle className="size-3" />,
        label: 'Operational',
        variant: 'validated',
      };

    default:
      return {
        variant: 'default',
      };
  }
}

export default function Badge({
  className = '',
  children,
  icon,
  value,
  variant = 'default',
  size = ComponentSize.MD,
  status,
  backgroundColor,
  textColor,
}: BadgeProps & {
  backgroundColor?: string;
  textColor?: string;
}) {
  // Don't render badge if value is 0
  if (value === 0) {
    return null;
  }

  // If status is provided, get complete status configuration
  const statusConfig = status ? getStatusConfig(status) : null;
  const effectiveVariant = statusConfig?.variant ?? variant;
  const effectiveIcon = statusConfig?.icon ?? icon;
  const effectiveLabel = statusConfig?.label ?? children;

  const badgeClasses = cn(
    badgeVariants({
      size: BADGE_SIZE_MAP[size] ?? 'default',
      variant: effectiveVariant as VariantProps<
        typeof badgeVariants
      >['variant'],
    }),
    className,
    backgroundColor && `bg-${backgroundColor}`,
    textColor && `text-${textColor}`,
  );

  return (
    <PrimitiveBadge
      className={badgeClasses}
      variant={
        PRIMITIVE_VARIANT_MAP[
          effectiveVariant as keyof typeof PRIMITIVE_VARIANT_MAP
        ] ?? 'default'
      }
    >
      {effectiveIcon && (
        <span
          className={cn(
            'flex-shrink-0',
            statusConfig?.shouldSpin && 'animate-spin',
          )}
        >
          {effectiveIcon}
        </span>
      )}

      {value !== undefined ? (
        <span className="font-semibold">{value}</span>
      ) : (
        effectiveLabel
      )}
    </PrimitiveBadge>
  );
}
