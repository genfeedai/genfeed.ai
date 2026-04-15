'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { NavigationTab } from '@genfeedai/interfaces/ui/navigation.interface';
import type {
  RouteTabItem,
  TabItem,
  TabsEnhancedProps,
  TabsItem,
} from '@genfeedai/props/ui/navigation/tabs.props';
import {
  getTabsListClassName,
  getTabsTriggerClassName,
  TabsList,
  Tabs as TabsRoot,
  TabsTrigger,
} from '@ui/primitives/tabs';
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

    if (!hasNavigationTabs) {
      return activeTab;
    }

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
  };

  const activeValue = getActiveValue();

  const handleValueChange = (value: string) => {
    // For non-navigation tabs, call onTabChange
    if (!hasNavigationTabs && onTabChange) {
      onTabChange(value);
    }
  };

  if (hasNavigationTabs) {
    return (
      <nav className={cn('inline-flex', fullWidth && 'w-full', className)}>
        <div
          className={cn(
            getTabsListClassName(
              cn(
                fullWidth && 'w-full',
                variant === 'pills'
                  ? 'rounded-2xl border border-white/10 bg-white/[0.03] p-1'
                  : variant === 'underline'
                    ? 'gap-1 border-b border-foreground/10'
                    : variant === 'segmented'
                      ? 'rounded-xl bg-muted p-1'
                      : 'gap-0.5',
              ),
            ),
          )}
          data-size={size}
          data-variant={variant}
        >
          {normalizedTabs.map((tab) => {
            const key = getTabId(tab);
            const value = getTabId(tab);
            const isActive = activeValue === value;

            if (!isNavigationTab(tab)) {
              const tabItem = tab as TabItem;
              const Icon = tabItem.icon;

              return (
                <button
                  key={key}
                  type="button"
                  data-size={size}
                  data-state={isActive ? 'active' : 'inactive'}
                  data-variant={variant}
                  disabled={tabItem.isDisabled}
                  className={getTabsTriggerClassName(
                    cn(tabItem.isDisabled && 'opacity-50 cursor-not-allowed'),
                  )}
                  onClick={() => {
                    if (!tabItem.isDisabled) {
                      onTabChange?.(value);
                    }
                  }}
                >
                  <span className="flex items-center gap-2 capitalize">
                    {Icon && <Icon className="text-lg" />}
                    {tabItem.label}
                    {tabItem.badge}
                  </span>
                </button>
              );
            }

            const Icon = tab.icon;
            const content = (
              <span className="flex items-center gap-2">
                {Icon && <Icon className="text-lg" />}
                {tab.label}
                {tab.badge}
              </span>
            );

            if (tab.isDisabled) {
              return (
                <span
                  key={key}
                  aria-disabled="true"
                  data-size={size}
                  data-state={isActive ? 'active' : 'inactive'}
                  data-variant={variant}
                  className={getTabsTriggerClassName(
                    'cursor-not-allowed opacity-50',
                  )}
                >
                  {content}
                </span>
              );
            }

            return (
              <Link
                key={key}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                data-size={size}
                data-state={isActive ? 'active' : 'inactive'}
                data-variant={variant}
                className={getTabsTriggerClassName()}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <TabsRoot
      value={activeValue}
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
          const tabItem =
            typeof tab === 'string'
              ? { id: tab, isDisabled: false, label: tab }
              : (tab as TabItem);

          const key = getTabId(tab);
          const value = getTabId(tab);
          const Icon = tabItem.icon;

          const triggerContent = (
            <span className={cn('flex items-center gap-2', 'capitalize')}>
              {Icon && <Icon className="text-lg" />}
              {tabItem.label as ReactNode}
              {tab.badge}
            </span>
          );

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
