import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IBadgeStatusConfig } from '@genfeedai/interfaces/ui/badge-status-config.interface';
import type { BadgeProps } from '@genfeedai/props/ui/display/badge.props';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  HiArrowPath,
  HiCalendar,
  HiCheckCircle,
  HiClock,
  HiXCircle,
} from 'react-icons/hi2';

/**
 * CVA badge variants with semantic color options
 * Uses harmonized dark-mode palette with subtle backgrounds and borders
 *
 * Note: Some variants are intentional semantic aliases:
 * - error/destructive (rose) - use based on context
 * - accent/purple (violet) - use based on context
 * - warning/amber (amber) - use based on context
 * - validated/operational (green) - use based on context
 */
const badgeVariants = cva(
  'inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        lg: 'px-3 py-1 text-sm',
        sm: 'px-2 py-0.5 text-[10px]',
      },
      variant: {
        // Harmonized dark-mode palette with subtle backgrounds
        accent: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
        amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        audio: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        default: 'bg-primary/15 text-primary border-primary/30',
        destructive: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        // Semantic aliases with harmonized colors
        error: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        ghost: 'bg-white/5 text-muted-foreground border-white/[0.08]',
        // Content type badges (Neural Noir colorful badges)
        image: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        info: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
        multimodal: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
        operational: 'bg-green-500/20 text-green-400 border-green-500/30',
        outline: 'border-white/[0.08] text-foreground bg-transparent',
        primary: 'bg-primary/15 text-primary border-primary/30',
        // Additional category colors
        purple: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
        secondary: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
        slate: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
        success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        text: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        // Status badges with vivid colors
        validated: 'bg-green-500/20 text-green-400 border-green-500/30',
        video: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      },
    },
  },
);

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
        icon: <HiCheckCircle className="h-3 w-3" />,
        label: 'Completed',
        variant: 'success',
      };

    case 'scheduled':
      return {
        icon: <HiCalendar className="h-3 w-3" />,
        label: 'Scheduled',
        shouldSpin: false,
        variant: 'info',
      };

    case 'processing':
    case 'running':
    case 'uploading':
      return {
        icon: <HiArrowPath className="h-3 w-3" />,
        label: 'Processing',
        shouldSpin: true,
        variant: 'accent',
      };

    case 'pending':
    case 'paused':
    case 'inactive':
    case 'warning':
      return {
        icon: <HiClock className="h-3 w-3" />,
        label: 'Pending',
        variant: 'secondary',
      };

    case 'failed':
    case 'error':
    case 'cancelled':
    case 'canceled':
      return {
        icon: <HiXCircle className="h-3 w-3" />,
        label: 'Failed',
        variant: 'error',
      };

    case 'draft':
    case 'private':
    case 'unlisted':
    case 'skipped':
      return {
        icon: <HiClock className="h-3 w-3" />,
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
        icon: <HiCheckCircle className="h-3 w-3" />,
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

  // Map size prop to CVA size
  const sizeMap: Record<string, VariantProps<typeof badgeVariants>['size']> = {
    [ComponentSize.LG]: 'lg',
    [ComponentSize.MD]: 'default',
    [ComponentSize.SM]: 'sm',
  };

  const badgeClasses = cn(
    badgeVariants({
      size: sizeMap[size] ?? 'default',
      variant: effectiveVariant as VariantProps<
        typeof badgeVariants
      >['variant'],
    }),
    className,
    backgroundColor && `bg-${backgroundColor}`,
    textColor && `text-${textColor}`,
  );

  return (
    <span className={badgeClasses}>
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
    </span>
  );
}

export { badgeVariants };
