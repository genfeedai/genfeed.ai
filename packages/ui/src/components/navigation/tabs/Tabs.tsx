'use client';

import type { NavigationTab } from '@genfeedai/contracts/interfaces/ui/navigation.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  RouteTabItem,
  TabItem,
  TabsEnhancedProps,
  TabsItem,
} from '@genfeedai/props/ui/navigation/tabs.props';
import { useNavigationPrefetch } from '@ui/navigation/prefetch/useNavigationPrefetch';
import {
  TabsList,
  TabsContent as TabsPanel,
  Tabs as TabsRoot,
  TabsTrigger,
} from '@ui/primitives/tabs';
import {
  getTabsListClassName,
  getTabsTriggerClassName,
} from '@ui/primitives/tabs.styles';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, useEffect, useMemo } from 'react';

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

function NavigationTabLink({
  children,
  isActive,
  itemKey,
  tab,
}: {
  children: ReactNode;
  isActive: boolean;
  itemKey: string;
  tab: RouteTabItem;
}) {
  const prefetchHref = useNavigationPrefetch(tab.href);

  return (
    <Link
      key={itemKey}
      href={tab.href}
      aria-current={isActive ? 'page' : undefined}
      data-state={isActive ? 'active' : 'inactive'}
      prefetch={false}
      onFocus={prefetchHref}
      onMouseEnter={prefetchHref}
      className={getTabsTriggerClassName()}
    >
      {children}
    </Link>
  );
}

function TabsContent({
  ariaLabel,
  children,
  items,
  tabs,
  activeTab,
  onTabChange,
  className = '',
  contentClassName,
  fullWidth = true,
  stopClickPropagation = false,
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
  const firstEnabledTab = normalizedTabs.find((tab) => !tab.isDisabled);

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

      if (activeMatch && !activeMatch.isDisabled) {
        return getTabId(activeMatch);
      }

      if (!hasNavigationTabs) {
        return firstEnabledTab ? getTabId(firstEnabledTab) : undefined;
      }
    }

    if (!hasNavigationTabs) {
      return firstEnabledTab ? getTabId(firstEnabledTab) : undefined;
    }

    const activeNavTab = normalizedTabs.reduce<{
      score: number;
      tab: (typeof normalizedTabs)[number] | null;
    }>(
      (best, tab) => {
        if (!isNavigationTab(tab)) return best;
        const routeParts = getRouteParts(tab.href);
        const exactMatch =
          tab.matchPaths?.includes(pathname || '') ||
          tab.matchPaths?.includes(currentRoute) ||
          currentRoute === routeParts.full ||
          pathname === routeParts.path;
        const prefixMatch =
          pathname === routeParts.path ||
          Boolean(pathname?.startsWith(`${routeParts.path}/`));

        let score: number;
        if (tab.matchMode === 'exact') {
          score = exactMatch ? 3 : -1;
        } else if (exactMatch) {
          score = 2;
        } else if (prefixMatch) {
          score = 1;
        } else {
          score = -1;
        }

        if (score > best.score) {
          return { score, tab };
        }
        return best;
      },
      { score: -1, tab: null },
    ).tab;

    return activeNavTab ? getTabId(activeNavTab) : activeTab;
  };

  const activeValue = getActiveValue();
  const isContentSynchronized =
    activeTab === undefined || activeTab === activeValue;

  useEffect(() => {
    if (
      hasNavigationTabs ||
      !activeValue ||
      activeTab === activeValue ||
      !onTabChange
    ) {
      return;
    }

    onTabChange(activeValue);
  }, [activeTab, activeValue, hasNavigationTabs, onTabChange]);

  const handleValueChange = (value: string) => {
    // For non-navigation tabs, call onTabChange
    if (!hasNavigationTabs && onTabChange) {
      onTabChange(value);
    }
  };

  if (hasNavigationTabs) {
    return (
      <nav
        aria-label={ariaLabel}
        className={cn('inline-flex', fullWidth && 'w-full', className)}
      >
        <div className={cn(getTabsListClassName(cn(fullWidth && 'w-full')))}>
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
                  data-state={isActive ? 'active' : 'inactive'}
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
                  data-state={isActive ? 'active' : 'inactive'}
                  className={getTabsTriggerClassName(
                    'cursor-not-allowed opacity-50',
                  )}
                >
                  {content}
                </span>
              );
            }

            return (
              <NavigationTabLink
                key={key}
                itemKey={key}
                isActive={isActive}
                tab={tab}
              >
                {content}
              </NavigationTabLink>
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
      className={cn(
        children == null ? 'inline-flex' : 'flex min-w-0 flex-col',
        (fullWidth || children != null) && 'w-full',
        className,
      )}
    >
      <TabsList aria-label={ariaLabel} className={cn(fullWidth && 'w-full')}>
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
              disabled={tab.isDisabled}
              className={cn(tab.isDisabled && 'opacity-50 cursor-not-allowed')}
              onClick={(event) => {
                if (stopClickPropagation) {
                  event.stopPropagation();
                }
              }}
            >
              {triggerContent}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {children != null && activeValue ? (
        <TabsPanel className={contentClassName} value={activeValue}>
          {isContentSynchronized ? children : null}
        </TabsPanel>
      ) : null}
    </TabsRoot>
  );
}

export default function Tabs(props: TabsEnhancedProps) {
  return (
    <Suspense fallback={null}>
      <TabsContent {...props} />
    </Suspense>
  );
}
