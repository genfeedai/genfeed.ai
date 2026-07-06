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
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
            Asset Workspace
          </p>
          <h2 className="text-sm font-semibold tracking-tight text-white/90">
            {title}
          </h2>
        </div>

        <Tabs
          activeTab={activeTab}
          onTabChange={onTabChange}
          className="w-full"
          variant="pills"
          tabs={tabs}
        />

        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}
