'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import type { MenuShellConfig } from '@genfeedai/props/navigation/menu.props';
import { Kbd } from '@genfeedai/ui';
import MenuItem from '@ui/menus/item/MenuItem';
import { useNavigationPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { HiPlus } from 'react-icons/hi2';

interface MenuSharedPrimaryActionProps {
  config: MenuShellConfig;
  primaryItems: MenuItemConfig[];
  prefixHref: (
    item:
      | MenuItemConfig
      | { href: string; hrefScope?: MenuItemConfig['hrefScope'] },
  ) => string | undefined;
  isActiveItem: (item: MenuItemConfig) => boolean;
  handleLinkClick: () => void;
}

export default function MenuSharedPrimaryAction({
  config,
  primaryItems,
  prefixHref,
  isActiveItem,
  handleLinkClick,
}: MenuSharedPrimaryActionProps) {
  const primaryActionHref = config.primaryAction?.href
    ? (prefixHref(config.primaryAction) ?? config.primaryAction.href)
    : undefined;
  const prefetchPrimaryActionHref = useNavigationPrefetch(primaryActionHref);

  if (config.primaryAction) {
    return (
      <div className="px-3 pt-2 pb-1">
        {config.primaryAction.href ? (
          <Link
            data-testid="sidebar-primary-action"
            href={primaryActionHref ?? config.primaryAction.href}
            onClick={handleLinkClick}
            onFocus={prefetchPrimaryActionHref}
            onMouseEnter={prefetchPrimaryActionHref}
            className="flex h-9 w-full items-center gap-3 rounded-md shadow-border bg-background-secondary px-3 py-1.5 text-left text-xs font-semibold transition-colors hover:shadow-border-strong hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            data-tone="accent"
          >
            {config.primaryAction.icon ? (
              config.primaryAction.icon
            ) : config.primaryAction.solid ? (
              <config.primaryAction.solid className="size-4" />
            ) : config.primaryAction.outline ? (
              <config.primaryAction.outline className="size-4" />
            ) : (
              <HiPlus className="size-4" />
            )}
            <span className="flex-1">{config.primaryAction.label}</span>
            <Kbd
              variant="subtle"
              size="xs"
              className="bg-foreground/10 text-foreground/52"
            >
              {'⌘⇧'}N
            </Kbd>
          </Link>
        ) : (
          <Button
            data-testid="sidebar-primary-action"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => {
              handleLinkClick();
              config.primaryAction?.onClick?.();
            }}
            className="flex h-9 w-full items-center gap-3 rounded-md shadow-border bg-background-secondary px-3 py-1.5 text-left text-xs font-semibold transition-colors hover:shadow-border-strong hover:bg-background-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            data-tone="accent"
          >
            {config.primaryAction.icon ? (
              config.primaryAction.icon
            ) : config.primaryAction.solid ? (
              <config.primaryAction.solid className="size-4" />
            ) : config.primaryAction.outline ? (
              <config.primaryAction.outline className="size-4" />
            ) : (
              <HiPlus className="size-4" />
            )}
            <span className="flex-1">{config.primaryAction.label}</span>
            <Kbd
              variant="subtle"
              size="xs"
              className="bg-foreground/10 text-foreground/52"
            >
              {'⌘⇧'}N
            </Kbd>
          </Button>
        )}
      </div>
    );
  }

  if (primaryItems.length > 0) {
    return (
      <div className="px-3 pt-2 pb-1">
        <ul className="flex flex-col gap-1">
          {primaryItems.map((item, index) => {
            const itemHref = prefixHref(item);

            return (
              <MenuItem
                key={itemHref ?? `${item.label}-${index}`}
                href={itemHref}
                label={item.label}
                icon={item.icon}
                outline={item.outline}
                solid={item.solid}
                isActive={isActiveItem(item)}
                isComingSoon={item.isComingSoon}
                onClick={handleLinkClick}
                variant="icon"
                isCollapsed={false}
              />
            );
          })}
        </ul>
      </div>
    );
  }

  return null;
}
