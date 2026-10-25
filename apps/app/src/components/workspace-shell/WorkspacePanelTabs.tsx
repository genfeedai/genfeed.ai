'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { TabItem } from '@genfeedai/props/ui/navigation/tabs.props';
import type { WorkspacePanelTabsProps } from '@props/ui/workspace-panel.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ChevronDown, Maximize2, SquarePen } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The sidebar and compact sheet share one header, with stable named views. */
export default function WorkspacePanelTabs({
  activeTab,
  hasAgent,
  onClose,
  onNewThread,
  onOpenFullPage,
  onSelectTab,
}: WorkspacePanelTabsProps) {
  const translate = useTranslations('common.sidePanel');
  const items: TabItem[] = hasAgent
    ? [
        {
          id: 'agent',
          label: translate('chat'),
          testId: 'workspace-panel-tab-chat',
        },
        {
          id: 'details',
          label: translate('context'),
          testId: 'workspace-panel-tab-context',
        },
        {
          id: 'history',
          label: translate('history'),
          testId: 'workspace-panel-tab-history',
        },
      ]
    : [
        {
          id: 'details',
          label: translate('context'),
          testId: 'workspace-panel-tab-context',
        },
      ];
  return (
    <div
      className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2"
      data-testid="workspace-panel-header"
    >
      <Tabs
        activeTab={activeTab}
        ariaLabel={translate('tabs')}
        className="ml-0 min-w-0 justify-start"
        fullWidth={false}
        items={items}
        listClassName="ml-0"
        onTabChange={(value) => {
          if (value === 'agent' || value === 'details' || value === 'history')
            onSelectTab(value);
        }}
      />
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {hasAgent ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-testid="workspace-panel-more"
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              >
                {translate('more')}
                <ChevronDown aria-hidden="true" className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                data-testid="workspace-panel-new-thread"
                disabled={!onNewThread}
                onSelect={onNewThread}
              >
                <SquarePen aria-hidden="true" className="size-4" />
                {translate('newThread')}
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="workspace-panel-full-page"
                onSelect={onOpenFullPage}
              >
                <Maximize2 aria-hidden="true" className="size-4" />
                {translate('openFullPage')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button
          ariaLabel={translate('close')}
          data-testid="workspace-panel-close"
          onClick={onClose}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          {translate('closeLabel')}
        </Button>
      </div>
    </div>
  );
}
