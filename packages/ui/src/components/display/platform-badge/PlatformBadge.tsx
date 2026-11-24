import { ComponentSize, formatPlatformLabel } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { getPlatformBrand } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type { PlatformBadgeProps } from '@genfeedai/props/ui/display/platform-badge.props';
import { Globe } from 'lucide-react';

const SIZE_CLASSES = {
  [ComponentSize.LG]: {
    container: 'px-2.5 py-1.5 gap-2 text-sm',
    icon: 'size-4',
  },
  [ComponentSize.MD]: {
    container: 'px-2 py-1 gap-1.5 text-xs',
    icon: 'size-3.5',
  },
  [ComponentSize.SM]: {
    container: 'px-1.5 py-0.5 gap-1 text-xs',
    icon: 'size-3',
  },
};

// Without a label the badge is a logo tile, so it is square: padding sized for
// a word beside the icon made it a wide rectangle. `lg` matches the `lg`
// Avatar it stands in for in a card header.
const ICON_ONLY_CLASSES = {
  [ComponentSize.LG]: { container: 'size-10 justify-center', icon: 'size-5' },
  [ComponentSize.MD]: { container: 'size-6 justify-center', icon: 'size-3.5' },
  [ComponentSize.SM]: { container: 'size-5 justify-center', icon: 'size-3' },
};

/**
 * Platform badge with icon, label, and platform-specific colors
 * Use this for consistent platform display across tables and lists
 */
export default function PlatformBadge({
  platform,
  className,
  showLabel = true,
  size = ComponentSize.MD,
  variant = 'subtle',
}: PlatformBadgeProps) {
  const brand = getPlatformBrand(platform);
  // A platform without a logo keeps its name behind a neutral globe rather than vanishing.
  const name = brand?.label ?? formatPlatformLabel(platform);

  if (!name) {
    return <span className="text-foreground/50">-</span>;
  }

  const Icon = brand?.icon ?? Globe;
  const iconColor = brand?.iconColor ?? 'text-muted-foreground';
  const isSolid = variant === 'solid';
  const sizeClasses = showLabel ? SIZE_CLASSES[size] : ICON_ONLY_CLASSES[size];
  const solidTextColor = brand?.solidTextColor ?? 'text-white'; // design-system-allow-content-color -- glyph on platform brand fill

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-sm font-medium',
        isSolid
          ? (brand?.solidBgColor ?? 'bg-foreground')
          : (brand?.bgColor ?? 'bg-foreground/10'),
        isSolid ? solidTextColor : (brand?.textColor ?? 'text-foreground'),
        sizeClasses.container,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(sizeClasses.icon, isSolid ? solidTextColor : iconColor)}
      />
      {showLabel ? (
        <span>{name}</span>
      ) : (
        <span className="sr-only">{name}</span>
      )}
    </span>
  );
}
