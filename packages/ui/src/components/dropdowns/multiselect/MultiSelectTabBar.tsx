'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { MultiSelectDropdownTab } from '@genfeedai/props/ui/forms/button.props';
import { Button } from '@ui/primitives/button';
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
        {tabs.map((tab) => {
          const isActive = activeTabOrDefault === tab.id;
          return (
            <Button
              key={tab.id}
              withWrapper={false}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.XS}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-full',
                isActive ? 'bg-primary/10 text-primary' : 'text-foreground/70',
              )}
            >
              {tab.label}
            </Button>
          );
        })}
      </div>
      <DropdownMenuSeparator />
    </>
  );
}
