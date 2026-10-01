'use client';

import type { TabItem } from '@genfeedai/props/ui/navigation/tabs.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import type { ReactNode } from 'react';

interface IngredientWorkspacePanelProps {
  title: string;
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
}

export default function IngredientWorkspacePanel({
  title,
  tabs,
  activeTab,
  onTabChange,
  children,
}: IngredientWorkspacePanelProps) {
  return (
    <section className="min-w-0">
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
        </div>

        <Tabs
          activeTab={activeTab}
          contentClassName="mt-5 space-y-5"
          fullWidth={false}
          listClassName="mr-auto ml-0 max-w-full overflow-x-auto"
          onTabChange={onTabChange}
          tabs={tabs}
        >
          {children}
        </Tabs>
      </div>
    </section>
  );
}
