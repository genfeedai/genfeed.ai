'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  WorkspacePanelTab,
  WorkspacePanelTabsProps,
} from '@props/ui/workspace-panel.props';
import { Button } from '@ui/primitives/button';
import { Maximize2, PanelRightClose, Sparkles, SquarePen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AgentDockThreadMenu from './AgentDockThreadMenu';

const TAB_CLASS_NAME =
  'h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground aria-selected:bg-muted aria-selected:text-foreground aria-selected:ring-1 aria-selected:ring-border';

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

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
      <div
        aria-label={translate('tabs')}
        className="flex min-w-0 items-center gap-0.5"
        role="tablist"
      >
        {tabs.map((tab) => (
          <Button
            aria-selected={tab === activeTab}
            className={TAB_CLASS_NAME}
            data-testid={`workspace-panel-tab-${tab}`}
            key={tab}
            onClick={() => onSelectTab(tab)}
            role="tab"
            size={ButtonSize.SM}
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
