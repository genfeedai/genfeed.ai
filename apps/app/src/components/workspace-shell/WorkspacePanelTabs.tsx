'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  WorkspacePanelTab,
  WorkspacePanelTabsProps,
} from '@props/ui/workspace-panel.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { Maximize2, PanelRightClose, SquarePen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AgentDockThreadMenu from './AgentDockThreadMenu';

/**
 * The side panel's tab strip. It sits on the topbar row, so the agent and the
 * selection's details share one panel instead of a bubble and a second rail.
 */
export default function WorkspacePanelTabs({
  activeTab,
  hasAgent,
  hasDetails,
  onClose,
  onNewThread,
  onOpenFullPage,
  onSelectTab,
  threadMenu,
}: WorkspacePanelTabsProps) {
  const translate = useTranslations('common.sidePanel');
  const tabs: readonly WorkspacePanelTab[] = [
    ...(hasAgent ? (['agent'] as const) : []),
    ...(hasDetails ? (['details'] as const) : []),
  ];
  // The shared Tabs falls back to the first tab (and reports it) when the
  // active one is missing; hand it a tab it has so it never re-selects.
  const activeValue = tabs.includes(activeTab) ? activeTab : tabs[0];

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
      <Tabs
        activeTab={activeValue}
        ariaLabel={translate('tabs')}
        className="ml-0 min-w-0 justify-start"
        fullWidth={false}
        items={tabs.map((tab) => ({
          id: tab,
          label: translate(tab),
          testId: `workspace-panel-tab-${tab}`,
        }))}
        listClassName="ml-0"
        onTabChange={(tab) => onSelectTab(tab as WorkspacePanelTab)}
      />
      {activeTab === 'agent' && hasAgent ? (
        <AgentDockThreadMenu {...threadMenu} />
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {activeTab === 'agent' && hasAgent ? (
          <>
            <Button
              ariaLabel={translate('newThread')}
              data-testid="workspace-panel-new-thread"
              icon={<SquarePen className="size-4" />}
              onClick={onNewThread}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
            <Button
              ariaLabel={translate('openFullPage')}
              data-testid="workspace-panel-full-page"
              icon={<Maximize2 className="size-4" />}
              onClick={onOpenFullPage}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </>
        ) : null}
        <Button
          ariaLabel={translate('close')}
          data-testid="workspace-panel-close"
          icon={<PanelRightClose className="size-4" />}
          onClick={onClose}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>
    </div>
  );
}
