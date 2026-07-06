'use client';

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
  fullWidth = false,
  className = '',
}: ContainerProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<string>('');
  const hasLeft = Boolean(left);

  // Use controlled props if provided, otherwise use internal state
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const onTabChange = controlledOnTabChange ?? setInternalActiveTab;

  const hasHeaderRight = Boolean(right);
  const hasVisibleTitle = Boolean(label && titleVisibility !== 'sr-only');
  const hasScreenReaderTitle = Boolean(label && titleVisibility === 'sr-only');

  return (
    <div
      className={cn(
        'w-full px-5 py-4 sm:px-6 lg:px-6',
        fullWidth ? 'mx-0 max-w-none' : 'mx-auto max-w-[1280px]',
        className,
      )}
    >
      {hasScreenReaderTitle ? (
        <ContainerTitle title={label} titleVisibility="sr-only" />
      ) : null}

      {(hasVisibleTitle || headerTabs || hasHeaderRight) && (
        <div
          className={cn(
            'mb-4 flex items-center gap-4 border-b border-border pb-3',
            hasVisibleTitle ? 'justify-between' : 'justify-end',
          )}
        >
          {hasVisibleTitle && (
            <ContainerTitle
              title={label}
              description={description}
              icon={icon}
            />
          )}

          {(headerTabs || hasHeaderRight) && (
            <div className="flex flex-wrap items-center gap-2.5">
              {headerTabs && (
                <Tabs {...headerTabs} className={cn(headerTabs.className)} />
              )}
              {hasHeaderRight && right}
            </div>
          )}
        </div>
      )}

      {hasLeft && <div className="mb-4">{left}</div>}

      {tabs && tabs.length > 0 && (
        <div className="mb-6 border-b border-border">
          <Tabs
            tabs={tabs}
            className="mb-0"
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
        </div>
      )}

      {children}
    </div>
  );
}
