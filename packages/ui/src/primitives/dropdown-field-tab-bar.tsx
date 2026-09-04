'use client';

import type { DropdownFieldTab } from './dropdown-field';
import { Tabs, TabsList, TabsTrigger } from './tabs';

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
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList aria-label="Option category">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              onClick={(event) => event.stopPropagation()}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
