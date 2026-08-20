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
    <div className="rounded-3xl bg-secondary p-5 shadow-border md:p-6">
      <div className="space-y-5">
        <div className="space-y-1">
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Asset Workspace
          </p>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h2>
        </div>

        <Tabs
          activeTab={activeTab}
          contentClassName="mt-5 space-y-5"
          fullWidth={false}
          listClassName="-m-1 max-w-full overflow-x-auto p-1"
          onTabChange={onTabChange}
          size="sm"
          tabs={tabs}
          variant="underline"
        >
          {children}
        </Tabs>
      </div>
    </div>
  );
}
