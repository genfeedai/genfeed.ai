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
  tabs,
  headerTabs,
  activeTab: controlledActiveTab,
  onTabChange: controlledOnTabChange,
  left,
  right,
  children,
  className = '',
}: ContainerProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<string>('');
  const hasLeft = Boolean(left);

  // Use controlled props if provided, otherwise use internal state
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const onTabChange = controlledOnTabChange ?? setInternalActiveTab;

  const hasHeaderRight = Boolean(right);

  return (
    <div
      className={`mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 ${className}`}
    >
      {(label || hasHeaderRight) && (
        <div
          className={cn(
            'flex items-center mb-4 capitalize',
            label ? 'justify-between' : 'justify-end',
          )}
        >
          {label && (
            <ContainerTitle
              title={label}
              description={description}
              icon={icon}
            />
          )}

          {(headerTabs || hasHeaderRight) && (
            <div className="flex flex-wrap items-center gap-2">
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
        <div className="border-b border-white/5 mb-6">
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
