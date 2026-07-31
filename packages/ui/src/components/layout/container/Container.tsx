'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ContainerProps } from '@genfeedai/props/ui/ui.props';
import ContainerTitle from '@ui/layout/container-title/ContainerTitle';
import Tabs from '@ui/navigation/tabs/Tabs';
import { useState } from 'react';

export default function Container({
  label,
  description,
  icon,
  titleVisibility = 'visible',
  tabs,
  headerTabs,
  activeTab: controlledActiveTab,
  onTabChange: controlledOnTabChange,
  left,
  right,
  children,
  bodyClassName,
  fullWidth = true,
  className = '',
}: ContainerProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<string>('');
  const hasLeft = Boolean(left);
  const { hasCanonicalBreadcrumb } = useSidebarNavigation();

  // Use controlled props if provided, otherwise use internal state
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const onTabChange = controlledOnTabChange ?? setInternalActiveTab;

  const hasHeaderRight = Boolean(right);
  const hasHeaderTabs = Boolean(headerTabs);
  // Topbar breadcrumb owns page identity when present — ContainerTitle becomes
  // sr-only. Do not keep an empty header row (mb-4 pb-3) that looks like broken
  // top padding under the shell topbar.
  const isTitleChromeSuppressed =
    titleVisibility === 'sr-only' || Boolean(label && hasCanonicalBreadcrumb);
  const hasVisibleTitle = Boolean(label && !isTitleChromeSuppressed);
  const hasScreenReaderTitle = Boolean(label && isTitleChromeSuppressed);
  // Equal page inset on every axis so content sits the same distance from
  // the topbar, sidebar, and inspector — pages must not invent their own.
  const insetClassName = fullWidth ? 'px-5 sm:px-6' : '';
  const bodyInsetClassName = fullWidth ? insetClassName : '';
  const hasHeaderChrome = hasVisibleTitle || hasHeaderTabs || hasHeaderRight;

  // Trailing toolbar (tabs + primary actions) alignment:
  // - tabs + actions → tabs left, actions right (justify-between)
  // - actions only → right edge (justify-end) — main CTAs never sit left
  // - tabs only → start
  // With a visible title, the outer row already justify-betweens title | toolbar;
  // when both tabs and actions exist, the toolbar itself also justify-betweens.
  const toolbarClassName = cn(
    'flex min-w-0 flex-wrap items-center gap-2.5',
    !hasVisibleTitle && (hasHeaderTabs || hasHeaderRight) && 'w-full',
    hasVisibleTitle &&
      hasHeaderTabs &&
      hasHeaderRight &&
      'flex-1 justify-between',
    hasVisibleTitle && !hasHeaderTabs && hasHeaderRight && 'ml-auto shrink-0',
    !hasVisibleTitle && hasHeaderTabs && hasHeaderRight && 'justify-between',
    !hasVisibleTitle && !hasHeaderTabs && hasHeaderRight && 'justify-end',
  );

  return (
    <div
      className={cn(
        'w-full py-5 sm:py-6',
        fullWidth ? 'mx-0 max-w-none' : 'mx-auto max-w-[1280px] px-5 sm:px-6',
        className,
      )}
    >
      {hasScreenReaderTitle ? (
        <ContainerTitle title={label} titleVisibility="sr-only" />
      ) : null}

      {hasHeaderChrome && (
        <div
          className={cn(
            'mb-4 flex items-center gap-4 pb-3',
            hasVisibleTitle &&
              (hasHeaderTabs || hasHeaderRight) &&
              'justify-between',
            !hasVisibleTitle && (hasHeaderTabs || hasHeaderRight) && 'w-full',
            insetClassName,
          )}
        >
          {hasVisibleTitle && (
            <ContainerTitle
              title={label}
              description={description}
              icon={icon}
            />
          )}

          {(hasHeaderTabs || hasHeaderRight) && (
            <div className={toolbarClassName}>
              {headerTabs ? (
                <Tabs {...headerTabs} className={cn(headerTabs.className)} />
              ) : null}
              {hasHeaderRight ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                  {right}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {hasLeft && <div className={cn('mb-4', insetClassName)}>{left}</div>}

      {tabs && tabs.length > 0 && (
        <div className="mb-6 border-b border-border">
          <Tabs
            tabs={tabs}
            className={cn('mb-0', insetClassName)}
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
        </div>
      )}

      <div className={cn(bodyInsetClassName, bodyClassName)}>{children}</div>
    </div>
  );
}
