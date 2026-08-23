import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IBadgeStatusConfig } from '@genfeedai/interfaces/ui/badge-status-config.interface';
import type { BadgeProps } from '@genfeedai/props/ui/display/badge.props';
import { Badge as PrimitiveBadge } from '@ui/primitives/badge';
import type { VariantProps } from 'class-variance-authority';
import { Calendar, CircleCheck, CircleX, Clock, RefreshCw } from 'lucide-react';

import { badgeVariants } from './badge.variants';

const PRIMITIVE_VARIANT_MAP = {
  accent: 'default',
  amber: 'warning',
  audio: 'warning',
  avatar: 'info',
  blue: 'info',
  default: 'default',
  destructive: 'destructive',
  error: 'destructive',
  ghost: 'secondary',
  gif: 'info',
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
  voice: 'warning',
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
        icon: <CircleCheck className="size-3" />,
        label: 'Completed',
        variant: 'success',
      };

    case 'scheduled':
      return {
        icon: <Calendar className="size-3" />,
        label: 'Scheduled',
        shouldSpin: false,
        variant: 'info',
      };

    case 'processing':
    case 'running':
    case 'uploading':
      return {
        icon: <RefreshCw className="size-3" />,
        label: 'Processing',
        shouldSpin: true,
        variant: 'accent',
      };

    case 'pending':
    case 'paused':
    case 'inactive':
    case 'warning':
      return {
        icon: <Clock className="size-3" />,
        label: 'Pending',
        variant: 'secondary',
      };

    case 'failed':
    case 'error':
    case 'cancelled':
    case 'canceled':
      return {
        icon: <CircleX className="size-3" />,
        label: 'Failed',
        variant: 'error',
      };

    case 'draft':
    case 'private':
    case 'unlisted':
    case 'skipped':
      return {
        icon: <Clock className="size-3" />,
        label: 'Draft',
        variant: 'ghost',
      };

    // Content type badges
    case 'image':
    case 'image_edit':
      return {
        label: 'Image',
        variant: 'image',
      };
    case 'video':
    case 'video_edit':
      return {
        label: 'Video',
        variant: 'video',
      };
    case 'gif':
      return {
        label: 'GIF',
        variant: 'gif',
      };
    case 'avatar':
      return {
        label: 'Avatar',
        variant: 'avatar',
      };
    case 'audio':
    case 'music':
      return {
        label: 'Audio',
        variant: 'audio',
      };
    case 'voice':
      return {
        label: 'Voice',
        variant: 'voice',
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
        icon: <CircleCheck className="size-3" />,
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
  // Explicit children always win over statusConfig's canned label so product
  // surfaces can pair a status tone (e.g. completed/failed) with their own
  // copy ("Approved" / "Rejected") without Badge overwriting it.
  const hasExplicitChildren =
    children !== undefined && children !== null && children !== '';
  const effectiveLabel = hasExplicitChildren
    ? children
    : (statusConfig?.label ?? children);

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
