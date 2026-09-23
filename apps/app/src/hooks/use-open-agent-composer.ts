'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import { useCallback } from 'react';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';
import { dispatchOpenConversationTab } from '@/lib/workspace/agent-composer-events';

/**
 * Seed the in-shell agent composer in a fresh conversation and open the
 * inspector Conversation tab.
 *
 * Stays on the current product route so page context (Publishing review, drafts,
 * calendar, …) remains visible. Prefer this over navigating to `/agent/new`.
 *
 * Every caller is a "start this task" entry point (new post, article, bulk
 * rewrite), so the seed never lands in whichever thread happened to be open —
 * that would append an unrelated task to an old conversation, possibly one
 * bound to another brand.
 */
export function useOpenAgentComposer(): (prompt: string) => void {
  const setInspectorOpen = useWorkspaceInspector()?.setIsOpen;

  return useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        return;
      }

      const { resetActiveConversationState, seedComposer, setActiveThread } =
        useAgentChatStore.getState();

      setActiveThread(null);
      // Clears composerSeed — seed only after the reset lands.
      resetActiveConversationState();
      seedComposer(trimmed, null);

      setInspectorOpen?.(true);
      dispatchOpenConversationTab();
    },
    [setInspectorOpen],
  );
}
