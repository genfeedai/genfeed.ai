'use client';

import { useAgentDock } from '@contexts/ui/agent-dock-context';
import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { Button } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { BotMessageSquare, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId } from 'react';

type PanelToggleProps = {
  readonly ariaControls: string;
  readonly ariaKeyShortcuts?: string;
  readonly icon: ReactNode;
  readonly isDisabled?: boolean;
  readonly isPressed: boolean;
  readonly label: string;
  readonly onToggle: () => void;
  readonly testId: string;
};

function PanelToggle({
  ariaControls,
  ariaKeyShortcuts,
  icon,
  isDisabled = false,
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
      isDisabled={isDisabled}
      onClick={onToggle}
      size={ButtonSize.ICON}
      tooltip={isDisabled ? undefined : label}
      type="button"
      variant={ButtonVariant.GHOST}
      withWrapper={false}
    >
      {icon}
    </Button>
  );
}

// A disabled button is not in the tab order and does not receive pointer
// events, so the reason has to live on a focusable wrapper. The button stays
// natively disabled; Enter/Space on the wrapper do not activate it.
function UnavailableToggleFrame({
  children,
  reason,
}: {
  readonly children: ReactNode;
  readonly reason: string;
}) {
  const reasonId = useId();

  return (
    <SimpleTooltip label={reason} position="bottom">
      <span
        aria-describedby={reasonId}
        aria-label={reason}
        className={cn(
          'inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
          }
        }}
        role="group"
        // The disabled button cannot take focus. This group is the tab stop
        // that exposes the reason; removing tabIndex hides it from the keyboard.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: disabled control's reason needs a focusable wrapper
        tabIndex={0}
      >
        {children}
        <span className="sr-only" id={reasonId}>
          {reason}
        </span>
      </span>
    </SimpleTooltip>
  );
}

/**
 * Account chrome only: the two toggles that open the right-hand side panel.
 * Chat (⌘J) opens the conversation and its history; Context opens what the
 * page has selected. The panel header names the view, so there is one control
 * per view and no tab strip. Chat uses the unavailable frame on `/agent`,
 * where the conversation is the page. Admin has no agent, so it only shows
 * Context, and only while something is selected.
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

  const hasChat = Boolean(agentDock) && !isAdminChrome;
  const isChatAvailable = agentDock?.isAvailable ?? false;
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

  const chatLabel = !isChatAvailable
    ? translateAgentDock('unavailable')
    : isChatPressed
      ? translateAgentDock('close')
      : translateAgentDock('open');
  const chatToggle = (
    <PanelToggle
      ariaControls="workspace-agent-dock"
      ariaKeyShortcuts="Meta+J Control+J"
      icon={<BotMessageSquare className="size-4" />}
      isDisabled={!isChatAvailable}
      isPressed={isChatPressed}
      label={chatLabel}
      onToggle={toggleChat}
      testId="topbar-agent-dock-toggle"
    />
  );

  return (
    <div className="flex items-center gap-1" data-testid="topbar-panel-toggles">
      {hasChat ? (
        isChatAvailable ? (
          chatToggle
        ) : (
          <UnavailableToggleFrame reason={chatLabel}>
            {chatToggle}
          </UnavailableToggleFrame>
        )
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
