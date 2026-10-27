import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { useLayoutEffect, useRef } from 'react';

/**
 * The chat store is a process-wide singleton, but threads, the open
 * conversation and cached messages all belong to one organization. When the
 * routed organization changes, drop them so the previous organization's
 * conversations can never be listed (or kept open) under the new one — its
 * thread ids 404 there. Empty ids are the loading gap between organizations
 * and are ignored.
 *
 * This is a layout effect on purpose: the full page selects the routed thread in
 * a passive effect of the same commit, and passive effects of children run
 * before the ones of this hook's parent. A passive reset here would wipe the
 * thread the URL just opened; a layout effect runs first, so the new route's
 * thread is selected on top of the cleared store.
 */
export function useResetAgentOnOrganizationChange(
  organizationId: string | null | undefined,
): void {
  const previousOrganizationIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!organizationId) {
      return;
    }

    const previousOrganizationId = previousOrganizationIdRef.current;
    previousOrganizationIdRef.current = organizationId;
    if (!previousOrganizationId || previousOrganizationId === organizationId) {
      return;
    }

    const store = useAgentChatStore.getState();
    store.setThreads([]);
    store.setActiveThread(null);
    store.resetActiveConversationState();
    store.clearConversationCache();
  }, [organizationId]);
}
