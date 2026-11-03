'use client';

import { useAgentDock } from '@contexts/ui/agent-dock-context';
import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import { BotMessageSquare, PanelRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NotificationInboxToggle from '@/components/shell/NotificationInboxToggle';
import PanelToggle from '@/components/shell/PanelToggle';

/**
 * Account chrome only: the toggles that open the right-hand side panel, one
 * per view and no tab strip. Notifications (the bell) opens the alert inbox;
 * Chat (⌘J) opens the conversation and its history; Context (the panel icon)
 * opens what the page has selected. Pressing the active toggle closes the
 * panel, so the panel itself has no close control. Chat is hidden wherever the
 * dock is unavailable (`/agent`, where the conversation is the page). Admin has
 * no agent or alerts, so it only shows Context, and only while something is
 * selected.
 */
export default function TopbarPanelToggles({
  isAdminChrome,
}: {
  readonly isAdminChrome: boolean;
}) {
  const agentDock = useAgentDock();
  const contextSidebar = useContextSidebar();
  const translateAgentDock = useTranslations('common.agentDock');
  const translateSidePanel = useTranslations('common.sidePanel');
  const panel = agentDock?.panel ?? null;

  const isChatAvailable = agentDock?.isAvailable ?? false;
  const hasChat = Boolean(agentDock) && !isAdminChrome && isChatAvailable;
  const isChatPressed =
    isChatAvailable &&
    (panel
      ? panel.activeView === 'agent' || panel.activeView === 'history'
      : (agentDock?.isOpen ?? false));

  const isContextVisible = panel
    ? panel.canShowContext
    : Boolean(contextSidebar?.selection);
  const isContextPressed = panel
    ? panel.activeView === 'details'
    : Boolean(contextSidebar?.isOpen || contextSidebar?.isMobileOpen);

  const hasNotifications = Boolean(panel) && !isAdminChrome;
  const isNotificationsPressed = panel?.activeView === 'notifications';

  const toggleNotifications = () => {
    if (!panel) {
      return;
    }
    if (isNotificationsPressed) {
      panel.close();
    } else {
      panel.selectView('notifications');
    }
  };

  const toggleChat = () => {
    if (!agentDock) {
      return;
    }
    if (!panel) {
      agentDock.toggle();
    } else if (isChatPressed) {
      panel.close();
    } else {
      panel.selectView('agent');
    }
  };

  const toggleContext = () => {
    if (panel) {
      if (isContextPressed) {
        panel.close();
      } else {
        panel.selectView('details');
      }
      return;
    }
    if (!contextSidebar) {
      return;
    }
    if (contextSidebar.isMobileOpen) {
      contextSidebar.setIsMobileOpen(false);
    } else if (contextSidebar.isOpen) {
      contextSidebar.toggle();
    } else {
      contextSidebar.reveal();
    }
  };

  if (!hasChat && !hasNotifications && !isContextVisible) {
    return null;
  }

  const chatLabel = isChatPressed
    ? translateAgentDock('close')
    : translateAgentDock('open');

  return (
    <div className="flex items-center gap-1" data-testid="topbar-panel-toggles">
      {hasNotifications ? (
        <NotificationInboxToggle
          isPressed={isNotificationsPressed}
          onToggle={toggleNotifications}
        />
      ) : null}
      {hasChat ? (
        <PanelToggle
          ariaControls="workspace-agent-dock"
          ariaKeyShortcuts="Meta+J Control+J"
          icon={<BotMessageSquare className="size-4" />}
          isPressed={isChatPressed}
          label={chatLabel}
          onToggle={toggleChat}
          testId="topbar-agent-dock-toggle"
        />
      ) : null}
      {isContextVisible ? (
        <PanelToggle
          ariaControls="workspace-details-panel"
          icon={<PanelRight className="size-4" />}
          isPressed={isContextPressed}
          label={
            isContextPressed
              ? translateSidePanel('closeContext')
              : translateSidePanel('openContext')
          }
          onToggle={toggleContext}
          testId="topbar-context-toggle"
        />
      ) : null}
    </div>
  );
}
