'use client';

import Tabs from '@ui/navigation/tabs/Tabs';
import type { DropdownFieldTab } from './dropdown-field';

type DropdownTabBarProps = {
  tabs: DropdownFieldTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
};

export default function DropdownTabBar({
  tabs,
  activeTab,
  onTabChange,
}: DropdownTabBarProps) {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 border-b border-border px-3 pb-2">
      <Tabs
        activeTab={activeTab}
        ariaLabel="Option category"
        fullWidth={false}
        items={tabs}
        onTabChange={onTabChange}
        stopClickPropagation
      />
    </div>
  );
}
