'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  isReleaseItemVisible,
} from '@genfeedai/contracts/constants';
import type { AgentDockContextValue } from '@props/ui/agent-dock.props';
import { useCallback, useMemo } from 'react';
import { useFeatureFlagContext } from '@/hooks/feature-flags/provider';
import { buildAgentThreadHref } from '@/lib/navigation/operator-shell';

interface UseAgentFullPageInput {
  activeHref: (href: string) => string;
  agentDock: AgentDockContextValue | null;
  /** The thread the full page would open, if any. */
  destinationThreadId: string | null;
  /** Where the shell records that the next transition returns to the conversation. */
  pendingTransitionRef: { current: unknown };
  push: (href: string) => void;
}

/**
 * The hand-off from the sidebar to the full-page Agent app. It is undefined
 * while the Agent app is not released to the organization: the sidebar itself
 * works either way, but there is no full page to open.
 */
export function useAgentFullPage({
  activeHref,
  agentDock,
  destinationThreadId,
  pendingTransitionRef,
  push,
}: UseAgentFullPageInput): { openFullConversation: (() => void) | undefined } {
  const { settings, settingsLoading } = useBrand();
  const { flags } = useFeatureFlagContext();
  const isReleased = isReleaseItemVisible(
    'agent',
    settingsLoading ? null : settings,
    flags,
  );
  // Brand-scoped full agent surface: keeps the selected brand in the URL so
  // the expanded conversation does not lose topbar/brand context.
  const fullConversationHref = useMemo(
    () =>
      activeHref(
        destinationThreadId
          ? buildAgentThreadHref(destinationThreadId, { isFull: true })
          : APP_ROUTES.AGENT.NEW,
      ),
    [activeHref, destinationThreadId],
  );
  const openFullConversation = useCallback(() => {
    pendingTransitionRef.current = 'conversation_return';
    // The full page is the conversation; the dock closes as it hands off
    // (arriving on `/agent` by any other way closes it once the route mounts).
    agentDock?.close();
    push(fullConversationHref);
  }, [agentDock, fullConversationHref, pendingTransitionRef, push]);

  return {
    openFullConversation: isReleased ? openFullConversation : undefined,
  };
}
