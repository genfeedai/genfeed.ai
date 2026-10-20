'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { TabItem } from '@genfeedai/props/ui/navigation/tabs.props';
import type { WorkspacePanelTabsProps } from '@props/ui/workspace-panel.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { Maximize2, PanelRightClose, SquarePen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AgentDockThreadMenu from './AgentDockThreadMenu';

const CHAT_TAB_PREFIX = 'chat:';
const DETAILS_TAB_ID = 'details';

/**
 * The side panel's tab strip. It sits on the topbar row: one tab per open
 * chat, then the selection's Details, so the agent and the details share one
 * panel instead of a bubble and a second rail.
 */
export default function WorkspacePanelTabs({
  activeChatId,
  activeTab,
  chatTabs,
  hasDetails,
  onClose,
  onCloseChat,
  onNewThread,
  onOpenFullPage,
  onSelectChat,
  onSelectTab,
  threadMenu,
}: WorkspacePanelTabsProps) {
  const translate = useTranslations('common.sidePanel');
  const hasAgent = chatTabs.length > 0;
  const items: TabItem[] = [
    ...chatTabs.map((chat) => ({
      closeLabel: translate('closeChat', { title: chat.title }),
      id: `${CHAT_TAB_PREFIX}${chat.id}`,
      label: chat.title,
      onClose: onCloseChat ? () => onCloseChat(chat.id) : undefined,
      testId: `workspace-panel-tab-chat-${chat.id}`,
    })),
    ...(hasDetails
      ? [
          {
            id: DETAILS_TAB_ID,
            label: translate('details'),
            testId: 'workspace-panel-tab-details',
          },
        ]
      : []),
  ];
  const wantedValue =
    activeTab === 'details'
      ? DETAILS_TAB_ID
      : `${CHAT_TAB_PREFIX}${activeChatId ?? chatTabs[0]?.id}`;
  // The shared Tabs falls back to the first tab (and reports it) when the
  // active one is missing; hand it a tab it has so it never re-selects.
  const activeValue = items.some((item) => item.id === wantedValue)
    ? wantedValue
    : items[0]?.id;

  function handleTabChange(value: string) {
    if (value === DETAILS_TAB_ID) {
      onSelectTab('details');
    } else if (value.startsWith(CHAT_TAB_PREFIX)) {
      onSelectChat(value.slice(CHAT_TAB_PREFIX.length));
    }
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
      <Tabs
        activeTab={activeValue}
        ariaLabel={translate('tabs')}
        className="ml-0 min-w-0 justify-start"
        fullWidth={false}
        items={items}
        listClassName="ml-0"
        onTabChange={handleTabChange}
      />
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {hasAgent ? (
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
            <AgentDockThreadMenu {...threadMenu} isTriggerIconOnly />
          </>
        ) : null}
        {activeTab === 'agent' && hasAgent ? (
          <Button
            ariaLabel={translate('openFullPage')}
            data-testid="workspace-panel-full-page"
            icon={<Maximize2 className="size-4" />}
            onClick={onOpenFullPage}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
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
