import { ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { BadgeProps } from '@genfeedai/props/ui/display/badge.props';
import { Badge as PrimitiveBadge } from '@ui/primitives/badge';
import {
  type StatusKey,
  statusBadge,
  statusIcon,
} from '@ui/tokens/status-colors';
import type { VariantProps } from 'class-variance-authority';

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
 * Returns the canonical status key, visual variant, and default label.
 */
interface BadgeStatusConfig {
  canonicalStatus?: StatusKey;
  label?: string;
  variant?: BadgeProps['variant'];
}

function getCanonicalStatusVariant(status: StatusKey): BadgeProps['variant'] {
  const tone = statusBadge[status];
  if (tone.includes('text-success')) {
    return 'success';
  }
  if (tone.includes('text-destructive')) {
    return 'error';
  }
  if (tone.includes('text-warning')) {
    return 'warning';
  }
  if (tone.includes('text-info')) {
    return 'info';
  }
  return 'secondary';
}

function getCanonicalStatusLabel(status: StatusKey): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getStatusConfig(status: string): BadgeStatusConfig {
  const normalizedStatus = status.toLowerCase().trim();

  if (normalizedStatus in statusBadge) {
    const canonicalStatus = normalizedStatus as StatusKey;
    return {
      canonicalStatus,
      label: getCanonicalStatusLabel(canonicalStatus),
      variant: getCanonicalStatusVariant(canonicalStatus),
    };
  }

  switch (normalizedStatus) {
    case 'published':
    case 'success':
      return {
        canonicalStatus: 'completed',
        label: 'Completed',
        variant: 'success',
      };

    case 'scheduled':
      return {
        canonicalStatus: 'pending',
        label: 'Scheduled',
        variant: 'warning',
      };

    case 'info':
      return {
        label: 'Information',
        variant: 'info',
      };

    case 'processing':
    case 'uploading':
      return {
        canonicalStatus: 'running',
        label: 'Processing',
        variant: 'info',
      };

    case 'inactive':
    case 'warning':
      return {
        canonicalStatus: 'pending',
        label: 'Pending',
        variant: 'warning',
      };

    case 'canceled':
      return {
        canonicalStatus: 'cancelled',
        label: 'Cancelled',
        variant: 'secondary',
      };

    case 'draft':
    case 'private':
    case 'unlisted':
    case 'skipped':
      return {
        canonicalStatus: 'planned',
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
        canonicalStatus: 'active',
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
  const StatusIcon = statusConfig?.canonicalStatus
    ? statusIcon[statusConfig.canonicalStatus]
    : null;
  const effectiveIcon = StatusIcon ? <StatusIcon /> : icon;
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
    statusConfig?.canonicalStatus && statusBadge[statusConfig.canonicalStatus],
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
      icon={effectiveIcon}
    >
      {value !== undefined ? (
        <span className="font-semibold">{value}</span>
      ) : (
        effectiveLabel
      )}
    </PrimitiveBadge>
  );
}
