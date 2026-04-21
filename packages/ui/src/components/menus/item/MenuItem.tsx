import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { MenuItemProps } from '@genfeedai/props/navigation/menu.props';
import ComingSoonBadge from '@ui/badges/ComingSoonBadge';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
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
    'relative flex items-center justify-center transition-all duration-200',
    isIconVariant
      ? isHorizontalLayout
        ? [
            'h-4 w-4 shrink-0',
            isActive
              ? 'text-foreground'
              : 'text-foreground/42 group-hover:text-foreground/78',
          ]
        : [
            'gen-shell-surface h-11 w-11 rounded-2xl text-foreground/78',
            'group-hover:border-white/[0.14] group-hover:bg-white/[0.07] group-hover:text-foreground',
            isActive &&
              'border-white/[0.14] bg-white text-background shadow-[0_18px_42px_-30px_rgba(0,0,0,0.88)]',
          ]
      : isActive
        ? 'text-foreground'
        : 'text-foreground/42 group-hover:text-foreground/78',
  );

  const iconNode = renderedIcon ? (
    <span className={iconWrapperClass}>{renderedIcon}</span>
  ) : null;

  const baseClasses = isIconVariant
    ? isHorizontalLayout
      ? cn(
          'group relative flex h-10 w-full flex-row items-center gap-3 rounded-xl px-3.5 py-2 text-left transition-[background-color,color,transform] duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )
      : cn(
          'group relative flex w-full flex-col items-center gap-2 p-2 text-center transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )
    : 'group flex h-10 items-center gap-3 rounded-xl px-3.5 py-2 text-left transition-[background-color,color] duration-200';

  const activeClasses = isIconVariant
    ? isHorizontalLayout
      ? isActive
        ? 'bg-white/[0.06] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
        : 'hover:bg-white/[0.035] hover:text-foreground'
      : '' // No outer wrapper styling for vertical card variant - highlighting is on the icon itself
    : isActive
      ? 'bg-white/[0.06] text-foreground font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
      : 'text-foreground/72 hover:bg-white/[0.035] hover:text-foreground';

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
            'min-w-0 truncate text-[13px] font-medium tracking-[-0.01em] text-foreground/88 transition-colors duration-200',
            isActive && 'text-foreground font-semibold',
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
          'text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/58 transition-colors duration-200',
          isActive && 'text-foreground',
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
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={onClick}
        className={cn(contentClasses, 'cursor-pointer')}
        ariaLabel={accessibleLabel}
      >
        {contentBody}
      </Button>
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
