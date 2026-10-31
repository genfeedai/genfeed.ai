'use client';

import type { MultiSelectDropdownTab } from '@genfeedai/props/ui/forms/button.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { DropdownMenuSeparator } from '@ui/primitives/dropdown-menu';

type MultiSelectTabBarProps = {
  tabs: MultiSelectDropdownTab[];
  activeTabOrDefault: string | undefined;
  setActiveTab: (tabId: string) => void;
};

export default function MultiSelectTabBar({
  tabs,
  activeTabOrDefault,
  setActiveTab,
}: MultiSelectTabBarProps) {
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2">
        <Tabs
          activeTab={activeTabOrDefault}
          ariaLabel="Option category"
          fullWidth={false}
          items={tabs}
          onTabChange={setActiveTab}
        />
      </div>
      <DropdownMenuSeparator />
    </>
  );
}
