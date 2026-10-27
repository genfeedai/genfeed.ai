'use client';

import { useAgentDock } from '@contexts/ui/agent-dock-context';
import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { BotMessageSquare, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

type PanelToggleProps = {
  readonly ariaControls: string;
  readonly ariaKeyShortcuts?: string;
  readonly icon: ReactNode;
  readonly isPressed: boolean;
  readonly label: string;
  readonly onToggle: () => void;
  readonly testId: string;
};

function PanelToggle({
  ariaControls,
  ariaKeyShortcuts,
  icon,
  isPressed,
  label,
  onToggle,
  testId,
}: PanelToggleProps) {
  return (
    <Button
      aria-controls={ariaControls}
      aria-expanded={isPressed}
      aria-keyshortcuts={ariaKeyShortcuts}
      ariaLabel={label}
      className="size-8"
      data-active={isPressed ? 'true' : 'false'}
      data-testid={testId}
      onClick={onToggle}
      size={ButtonSize.ICON}
      tooltip={label}
      type="button"
      variant={ButtonVariant.GHOST}
      withWrapper={false}
    >
      {icon}
    </Button>
  );
}

/**
 * Account chrome only: the two toggles that open the right-hand side panel.
 * Chat (⌘J) opens the conversation and its history; Context opens what the
 * page has selected. The panel header names the view, so there is one control
 * per view and no tab strip. Chat is hidden wherever the dock is unavailable
 * (`/agent`, where the conversation is the page). Admin has no agent, so it
 * only shows Context, and only while something is selected.
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

  if (!hasChat && !isContextVisible) {
    return null;
  }

  const chatLabel = isChatPressed
    ? translateAgentDock('close')
    : translateAgentDock('open');

  return (
    <div className="flex items-center gap-1" data-testid="topbar-panel-toggles">
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
          icon={<Info className="size-4" />}
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
