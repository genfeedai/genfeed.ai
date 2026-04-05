import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { MenuItemProps } from '@props/navigation/menu.props';
import ComingSoonBadge from '@ui/badges/ComingSoonBadge';
import Badge from '@ui/display/badge/Badge';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import Link from 'next/link';
import type { ReactElement } from 'react';

export default function MenuItem({
  badgeCount,
  href,
  label,
  icon,
  outline: OutlineIcon,
  solid: SolidIcon,
  isActive = false,
  isComingSoon = false,
  onClick,
  variant = 'default',
  isCollapsed = false,
}: MenuItemProps) {
  const isIconVariant = variant === 'icon';
  const shouldRenderBadge = typeof badgeCount === 'number' && badgeCount > 0;

  // Determine layout: horizontal when expanded on desktop, vertical otherwise
  const isHorizontalLayout = isIconVariant && !isCollapsed;

  const renderedIcon = (() => {
    if (icon) {
      return icon;
    }

    if (OutlineIcon && SolidIcon) {
      const IconComponent = isActive ? SolidIcon : OutlineIcon;
      return <IconComponent className="w-4 h-4" />;
    }

    return null;
  })();

  const iconWrapperClass = cn(
    'flex items-center justify-center transition-all duration-200 relative',
    isIconVariant
      ? isHorizontalLayout
        ? [
            // Horizontal layout (desktop expanded): smaller icon, accent color when active
            'w-4 h-4',
            isActive
              ? 'text-primary scale-110'
              : 'text-white/80 group-hover:text-white group-hover:scale-105',
          ]
        : [
            // Vertical card layout (collapsed or mobile): larger icon with border/bg
            'h-11 w-11 border border-white/[0.08] bg-white/5 text-white/80',
            'group-hover:border-white/30 group-hover:bg-white/10 group-hover:text-white',
            isActive && 'border-white bg-white text-black scale-105',
          ]
      : isActive
        ? 'text-black scale-105'
        : 'group-hover:text-white group-hover:scale-105',
  );

  const iconNode = renderedIcon ? (
    <span className={iconWrapperClass}>{renderedIcon}</span>
  ) : null;

  const baseClasses = isIconVariant
    ? isHorizontalLayout
      ? cn(
          // Horizontal layout (desktop expanded)
          'relative flex h-9 w-full flex-row items-center gap-3 rounded px-3 py-2 text-left transition group',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )
      : cn(
          // Vertical card layout (collapsed or mobile)
          'relative flex w-full flex-col items-center gap-2 border border-transparent p-2 text-center transition group',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )
    : 'flex h-9 items-center gap-3 rounded px-3 py-2 text-left transition group';

  const activeClasses = isIconVariant
    ? isHorizontalLayout
      ? isActive
        ? 'bg-white/[0.08] text-white'
        : 'hover:bg-white/[0.04]'
      : '' // No outer wrapper styling for vertical card variant - highlighting is on the icon itself
    : isActive
      ? 'bg-white/[0.08] text-white font-semibold'
      : 'hover:bg-white/[0.04]';

  const listItemClass = cn(
    'list-none overflow-visible',
    isIconVariant ? 'mb-0' : 'mb-1',
  );

  const accessibleLabel = isIconVariant ? label : undefined;
  const contentClasses = cn(baseClasses, activeClasses);

  const labelContent = isIconVariant ? (
    isHorizontalLayout ? (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            'min-w-0 truncate text-sm font-medium text-white/90 transition-colors duration-200',
            isActive && 'text-white font-semibold',
          )}
        >
          {label}
        </span>
        {shouldRenderBadge ? (
          <Badge
            className="ml-auto min-w-5 justify-center px-1.5"
            size={ComponentSize.SM}
            variant="error"
          >
            {badgeCount}
          </Badge>
        ) : null}
      </div>
    ) : isCollapsed ? null : ( // Collapsed: no label
      // Vertical card layout: uppercase small label
      <span
        className={cn(
          'text-xs font-semibold uppercase tracking-wide text-white/70 transition-colors duration-200',
          isActive && 'text-black',
        )}
      >
        {label}
      </span>
    )
  ) : (
    label
  );

  const contentBody = (
    <div
      className={cn(
        'flex items-center',
        isIconVariant
          ? isHorizontalLayout
            ? 'w-full flex-row gap-3' // Horizontal layout
            : 'flex-col gap-2 text-center' // Vertical card layout
          : 'gap-3',
        isComingSoon && 'opacity-50',
      )}
    >
      {iconNode}
      {labelContent}
      {shouldRenderBadge && isIconVariant && !isHorizontalLayout ? (
        <Badge
          className="absolute right-1 top-1 min-w-5 justify-center px-1.5"
          size={ComponentSize.SM}
          variant="error"
        >
          {badgeCount}
        </Badge>
      ) : null}
      {isComingSoon && isHorizontalLayout && (
        <div className="ml-auto">
          <ComingSoonBadge />
        </div>
      )}
    </div>
  );

  const content: ReactElement =
    href && !isComingSoon ? (
      <Link
        href={href}
        onClick={onClick}
        className={contentClasses}
        aria-label={accessibleLabel}
      >
        {contentBody}
      </Link>
    ) : (
      <button
        type="button"
        onClick={onClick}
        className={cn(contentClasses, 'cursor-pointer')}
        aria-label={accessibleLabel}
      >
        {contentBody}
      </button>
    );

  // Wrap with Tooltip when collapsed to render tooltip outside scroll container
  const wrappedContent =
    isCollapsed && isIconVariant ? (
      <SimpleTooltip label={label} position="right">
        {content}
      </SimpleTooltip>
    ) : (
      content
    );

  return <li className={listItemClass}>{wrappedContent}</li>;
}
