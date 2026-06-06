'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '../lib/utils';
import { Button } from './button';
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
    <div className="mb-2 flex items-center gap-2 border-b border-border px-3 pb-2">
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          onClick={(event) => {
            event.stopPropagation();
            onTabChange(tab.id);
          }}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === tab.id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
}
