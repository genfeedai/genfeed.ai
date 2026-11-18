'use client';

import type { useAgentDock } from '@contexts/ui/agent-dock-context';
import { attachContentToConversationDraft } from '@genfeedai/agent/stores/conversation-composer-draft.store';
import type { WorkspacePanelControls } from '@props/ui/workspace-panel.props';
import { useEffect, useState } from 'react';
import type { WorkspaceShellState } from '@/lib/workspace-shell/workspace-shell-location';

const DOCK_PANEL_PREFETCH_TIMEOUT_MS = 8000;

interface UseAgentDockBridgeOptions {
  agentDock: ReturnType<typeof useAgentDock>;
  draftScopeKey: string;
  isAgentDockHost: boolean;
  isAgentOutputSurface: boolean;
  isAgentRoute: boolean;
  isConversationHost: boolean;
  loadConversationDockPanel: () => Promise<unknown>;
  panelControls: WorkspacePanelControls;
  state: WorkspaceShellState;
}

/**
 * Connects the workspace shell to the agent dock: hands it the panel
 * controls, availability and attach handler, closes it on the agent routes,
 * and mounts the conversation once it is first needed.
 */
export function useAgentDockBridge({
  agentDock,
  draftScopeKey,
  isAgentDockHost,
  isAgentOutputSurface,
  isAgentRoute,
  isConversationHost,
  loadConversationDockPanel,
  panelControls,
  state,
}: UseAgentDockBridgeOptions): { hasOpenedAgentDock: boolean } {
  const [hasOpenedAgentDock, setHasOpenedAgentDock] = useState(false);
  const closeAgentDock = agentDock?.close;
  const isAgentDockOpen = agentDock?.isOpen ?? false;
  const registerAgentDockAttachHandler = agentDock?.registerAttachHandler;
  const registerAgentDockPanel = agentDock?.registerPanel;
  const setIsAgentDockAvailable = agentDock?.setIsAvailable;

  // use-effect-audit: ignore registers the panel controls with the agent dock
  useEffect(() => {
    registerAgentDockPanel?.(panelControls);
  }, [panelControls, registerAgentDockPanel]);

  // use-effect-audit: ignore releases the panel controls on unmount
  useEffect(
    () => () => {
      registerAgentDockPanel?.(null);
    },
    [registerAgentDockPanel],
  );

  // use-effect-audit: ignore registers availability with the agent dock
  useEffect(() => {
    if (!setIsAgentDockAvailable) {
      return;
    }

    setIsAgentDockAvailable(isAgentDockHost);
    return () => setIsAgentDockAvailable(false);
  }, [isAgentDockHost, setIsAgentDockAvailable]);

  // use-effect-audit: ignore closes the agent dock when the route becomes an agent page
  useEffect(() => {
    if ((isAgentRoute || isAgentOutputSurface) && isAgentDockOpen) {
      closeAgentDock?.();
    }
  }, [closeAgentDock, isAgentDockOpen, isAgentOutputSurface, isAgentRoute]);

  // Warm the conversation chunk once the page is idle so the first open does
  // not wait on the network.
  // use-effect-audit: ignore schedules an idle-time chunk prefetch and cancels it on cleanup
  useEffect(() => {
    if (!isAgentDockHost || hasOpenedAgentDock) {
      return;
    }
    const prefetch = () => {
      void loadConversationDockPanel();
    };
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(prefetch, {
        timeout: DOCK_PANEL_PREFETCH_TIMEOUT_MS,
      });
      return () => window.cancelIdleCallback(handle);
    }
    const timeout = window.setTimeout(prefetch, 2000);
    return () => window.clearTimeout(timeout);
  }, [hasOpenedAgentDock, isAgentDockHost, loadConversationDockPanel]);

  // Mount the conversation on first open, or when a registered overlay needs
  // its composer before the dock was ever opened.
  if (
    !hasOpenedAgentDock &&
    isAgentDockHost &&
    (isAgentDockOpen || state === 'overlay')
  ) {
    setHasOpenedAgentDock(true);
  }

  // use-effect-audit: ignore registers the attach handler with the agent dock
  useEffect(() => {
    if (!isConversationHost || !registerAgentDockAttachHandler) {
      return;
    }

    // Pages stamp the record's own brand; the composer leaves out one that
    // does not match the conversation instead of relabelling it.
    return registerAgentDockAttachHandler((reference) => {
      attachContentToConversationDraft(draftScopeKey, reference);
    });
  }, [draftScopeKey, isConversationHost, registerAgentDockAttachHandler]);

  return { hasOpenedAgentDock };
}
