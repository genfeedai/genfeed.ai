'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { NavigationTab } from '@genfeedai/interfaces/ui/navigation.interface';
import type {
  RouteTabItem,
  TabItem,
  TabsEnhancedProps,
  TabsItem,
} from '@genfeedai/props/ui/navigation/tabs.props';
import { TabsList, Tabs as TabsRoot, TabsTrigger } from '@ui/primitives/tabs';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

function isNavigationTab(
  tab: NavigationTab | RouteTabItem | TabItem,
): tab is RouteTabItem {
  return tab && typeof tab === 'object' && 'href' in tab;
}

function getTabId(tab: TabsItem): string {
  if (typeof tab === 'string') {
    return tab;
  }

  if (isNavigationTab(tab)) {
    return tab.id || tab.href;
  }

  return tab.id;
}

function getRouteParts(href: string) {
  const [path, search = ''] = href.split('?');

  return {
    full: search ? `${path}?${search}` : path,
    path,
  };
}

export default function Tabs({
  items,
  tabs,
  activeTab,
  onTabChange,
  className = '',
  variant = 'default',
  size = 'md',
  fullWidth = true,
}: TabsEnhancedProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString();
  const currentRoute = search ? `${pathname}?${search}` : pathname || '';

  const normalizedTabs = useMemo(
    () =>
      (items || tabs || []).map((tab) => {
        if (typeof tab === 'string') {
          return { id: tab, isDisabled: false, label: tab };
        }
        return tab;
      }),
    [items, tabs],
  );

  // Check if we're in navigation mode (any tab has href)
  const hasNavigationTabs = normalizedTabs.some(isNavigationTab);

  // For navigation tabs, determine active based on pathname
  const getActiveValue = () => {
    if (activeTab) {
      const activeMatch = normalizedTabs.find((tab) => {
        if (typeof tab === 'string') {
          return tab === activeTab;
        }

        return (
          getTabId(tab) === activeTab ||
          (isNavigationTab(tab) && tab.href === activeTab)
        );
      });

      return activeMatch ? getTabId(activeMatch) : activeTab;
    }

    if (hasNavigationTabs) {
      const activeNavTab = normalizedTabs
        .filter(isNavigationTab)
        .map((tab) => {
          const routeParts = getRouteParts(tab.href);
          const exactMatch =
            tab.matchPaths?.includes(pathname || '') ||
            tab.matchPaths?.includes(currentRoute) ||
            currentRoute === routeParts.full ||
            pathname === routeParts.path;
          const prefixMatch =
            pathname === routeParts.path ||
            Boolean(pathname?.startsWith(`${routeParts.path}/`));

          if (tab.matchMode === 'exact') {
            return { score: exactMatch ? 3 : -1, tab };
          }

          if (exactMatch) {
            return { score: 2, tab };
          }

          if (prefixMatch) {
            return { score: 1, tab };
          }

          return { score: -1, tab };
        })
        .filter((match) => match.score >= 0)
        .sort((left, right) => right.score - left.score)[0]?.tab;

      return activeNavTab ? getTabId(activeNavTab) : activeTab;
    }
    return activeTab;
  };

  const handleValueChange = (value: string) => {
    // For non-navigation tabs, call onTabChange
    if (!hasNavigationTabs && onTabChange) {
      onTabChange(value);
    }
  };

  return (
    <TabsRoot
      value={getActiveValue()}
      onValueChange={handleValueChange}
      className={cn('inline-flex', fullWidth && 'w-full', className)}
    >
      <TabsList
        data-variant={variant}
        data-size={size}
        className={cn(
          fullWidth && 'w-full',
          variant === 'pills'
            ? 'rounded-2xl border border-white/10 bg-white/[0.03] p-1'
            : variant === 'underline'
              ? 'gap-1 border-b border-foreground/10'
              : variant === 'segmented'
                ? 'rounded-xl bg-muted p-1'
                : 'gap-0.5',
        )}
      >
        {normalizedTabs.map((tab) => {
          const isNavTab = isNavigationTab(tab);
          const navTab = isNavTab ? (tab as RouteTabItem) : null;
          const tabItem = !isNavTab ? (tab as TabItem) : null;

          const key = getTabId(tab);
          const value = getTabId(tab);

          const label: ReactNode =
            isNavTab && typeof tab.label === 'function'
              ? tab.label({})
              : (tab.label as ReactNode);

          const Icon = isNavTab ? navTab?.icon : tabItem?.icon;

          const triggerContent = (
            <span
              className={cn(
                'flex items-center gap-2',
                !isNavTab && 'capitalize',
              )}
            >
              {Icon && <Icon className="text-lg" />}
              {label}
              {tab.badge}
            </span>
          );

          // For navigation tabs, wrap in Link
          if (isNavTab && navTab?.href) {
            return (
              <TabsTrigger
                key={key}
                value={value}
                disabled={tab.isDisabled}
                data-variant={variant}
                data-size={size}
                asChild
                className={cn(
                  tab.isDisabled && 'opacity-50 cursor-not-allowed',
                )}
              >
                <Link href={navTab.href}>{triggerContent}</Link>
              </TabsTrigger>
            );
          }

          return (
            <TabsTrigger
              key={key}
              value={value}
              data-variant={variant}
              data-size={size}
              disabled={tab.isDisabled}
              className={cn(tab.isDisabled && 'opacity-50 cursor-not-allowed')}
            >
              {triggerContent}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </TabsRoot>
  );
}
