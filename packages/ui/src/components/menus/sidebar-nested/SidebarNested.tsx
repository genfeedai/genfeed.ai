'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import MenuItem from '@ui/menus/item/MenuItem';
import { Button } from '@ui/primitives/button';
import { usePathname } from 'next/navigation';
import { Fragment, useCallback, useMemo } from 'react';
import { HiArrowLeft } from 'react-icons/hi2';

interface SidebarNestedProps {
  /** Group label displayed in the back-button header */
  groupLabel: string;
  /** Label for the back button — defaults to groupLabel if not provided */
  backLabel?: string;
  /** Items to display in the flat list */
  items: MenuItemConfig[];
  /** Callback when user clicks the back button */
  onBack: () => void;
  /** Callback when user clicks any menu item (e.g. close mobile drawer) */
  onItemClick?: () => void;
}

/**
 * SidebarNested — Full-width (260px) single-column nested sidebar view.
 * Shows a `← GroupName` back button header and a flat list of group items.
 */
export default function SidebarNested({
  groupLabel,
  backLabel,
  items,
  onBack,
  onItemClick,
}: SidebarNestedProps) {
  const rawPathname = usePathname();
  const { href: buildHref, orgHref } = useOrgUrl();

  /** Strip org/brand prefix so we can compare against config-level paths. */
  const pathname = useMemo(() => {
    const parts = rawPathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[1] === '~') {
      return `/${parts.slice(2).join('/')}`;
    }
    if (parts.length >= 3) {
      return `/${parts.slice(2).join('/')}`;
    }
    return rawPathname;
  }, [rawPathname]);

  /** Prefix a config-level path with the correct org scope. */
  const prefixHref = useCallback(
    (path: string) =>
      path.startsWith('/settings') ? orgHref(path) : buildHref(path),
    [buildHref, orgHref],
  );

  const isActive = useCallback(
    (href: string) => {
      if (!href || !pathname) {
        return false;
      }

      if (href.startsWith('/elements/') && pathname.startsWith('/elements/')) {
        return true;
      }
      if (
        href.startsWith('/ingredients/') &&
        pathname.startsWith('/ingredients/')
      ) {
        return true;
      }

      return pathname === href || pathname.startsWith(href);
    },
    [pathname],
  );
  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Back button — styled as a menu row */}
      <div className="px-3 pt-2 pb-1 flex-shrink-0">
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={onBack}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-200 group cursor-pointer',
            'text-white/80 hover:bg-white/[0.04]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
          )}
          ariaLabel={`Back to ${backLabel ?? groupLabel}`}
        >
          <HiArrowLeft className="w-4 h-4 text-white/60 group-hover:text-white transition-colors duration-200" />
          <span className="text-sm font-medium text-white/90">
            {backLabel ?? groupLabel}
          </span>
        </Button>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-3 py-2">
        <ul className="flex flex-col gap-0.5">
          {items.map((item, index) => {
            const isFirstDynamic =
              item.isDynamic && (index === 0 || !items[index - 1]?.isDynamic);

            return (
              <Fragment key={item.href || `nested-item-${index}`}>
                {item.hasDividerAbove && (
                  <li className="my-2">
                    <div className="border-t border-white/[0.08]" />
                  </li>
                )}
                {isFirstDynamic && (
                  <li className="my-2">
                    <div className="border-t border-white/[0.06]" />
                    <span className="px-3 pt-2 text-[10px] uppercase tracking-wider text-white/30 block">
                      Accounts
                    </span>
                  </li>
                )}
                <MenuItem
                  href={item.href ? prefixHref(item.href) : undefined}
                  label={item.label}
                  icon={item.icon}
                  outline={item.outline}
                  solid={item.solid}
                  isActive={isActive(item.href ?? '')}
                  onClick={onItemClick}
                  variant="icon"
                  isCollapsed={false}
                />
              </Fragment>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
