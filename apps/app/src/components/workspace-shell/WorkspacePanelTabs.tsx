'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  WorkspacePanelTab,
  WorkspacePanelTabsProps,
} from '@props/ui/workspace-panel.props';
import { Button } from '@ui/primitives/button';
import { Maximize2, PanelRightClose, Sparkles, SquarePen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import AgentDockThreadMenu from './AgentDockThreadMenu';

const TAB_CLASS_NAME =
  'h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground aria-selected:bg-muted aria-selected:text-foreground aria-selected:ring-1 aria-selected:ring-border';

// The panels the tabs control: the dock section and the details wrapper.
const TAB_PANEL_IDS: Record<WorkspacePanelTab, string> = {
  agent: 'workspace-agent-dock',
  details: 'workspace-details-panel',
};

export const WORKSPACE_PANEL_TAB_IDS: Record<WorkspacePanelTab, string> = {
  agent: 'workspace-panel-tab-agent',
  details: 'workspace-panel-tab-details',
};

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

  // Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern); only
  // the active tab sits in the tab order.
  function handleTabListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex === -1 || tabs.length < 2) {
      return;
    }

    let nextIndex = -1;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex === -1) {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onSelectTab(nextTab);
    document.getElementById(WORKSPACE_PANEL_TAB_IDS[nextTab])?.focus();
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
      <div
        aria-label={translate('tabs')}
        className="flex min-w-0 items-center gap-0.5"
        onKeyDown={handleTabListKeyDown}
        role="tablist"
      >
        {tabs.map((tab) => (
          <Button
            aria-controls={TAB_PANEL_IDS[tab]}
            aria-selected={tab === activeTab}
            className={TAB_CLASS_NAME}
            data-testid={`workspace-panel-tab-${tab}`}
            id={WORKSPACE_PANEL_TAB_IDS[tab]}
            key={tab}
            onClick={() => onSelectTab(tab)}
            role="tab"
            size={ButtonSize.SM}
            tabIndex={tab === activeTab ? 0 : -1}
            textTransform="none"
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {tab === 'agent' ? (
              <Sparkles aria-hidden="true" className="size-3.5 text-agent" />
            ) : null}
            {translate(tab)}
          </Button>
        ))}
      </div>
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
