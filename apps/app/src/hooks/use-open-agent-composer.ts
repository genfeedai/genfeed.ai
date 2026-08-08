'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import { useCallback } from 'react';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';
import { dispatchOpenConversationTab } from '@/lib/workspace/agent-composer-events';

/**
 * Seed the in-shell agent composer and open the inspector Conversation tab.
 *
 * Stays on the current product route so page context (Publish review, drafts,
 * calendar, …) remains visible. Prefer this over navigating to `/agent/new`.
 */
export function useOpenAgentComposer(): (prompt: string) => void {
  const seedComposer = useAgentChatStore((state) => state.seedComposer);
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const setInspectorOpen = useWorkspaceInspector()?.setIsOpen;

  return useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        return;
      }

      seedComposer(trimmed, activeThreadId);
      setInspectorOpen?.(true);
      dispatchOpenConversationTab();
    },
    [activeThreadId, seedComposer, setInspectorOpen],
  );
}
