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
    <div className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,22,0.96),rgba(10,10,14,0.88))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-6">
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
