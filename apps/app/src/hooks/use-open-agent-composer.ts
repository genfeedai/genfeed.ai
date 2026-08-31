'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAgentChatStore } from '@genfeedai/agent';
import { useCallback } from 'react';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';
import { dispatchOpenConversationTab } from '@/lib/workspace/agent-composer-events';

/**
 * Seed the in-shell agent composer and open the inspector Conversation tab.
 *
 * Stays on the current product route so page context (Publishing review, drafts,
 * calendar, …) remains visible. Prefer this over navigating to `/agent/new`.
 *
 * Seeded prompts name the selected brand ("draft a post for my brand X"), so
 * they must never land in a thread bound to a different brand. The shell only
 * resyncs threads that are *unbound*, so a conflicting thread is resolved here
 * by starting a fresh one — rebinding would retcon a conversation whose
 * history belongs to the other brand.
 */
export function useOpenAgentComposer(): (prompt: string) => void {
  const { brandId } = useBrand();
  const setInspectorOpen = useWorkspaceInspector()?.setIsOpen;

  return useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        return;
      }

      // Read on click rather than subscribing: `threads` churns on every
      // streaming update, and every caller of this hook would re-render.
      const {
        activeThreadId,
        resetActiveConversationState,
        seedComposer,
        setActiveThread,
        threads,
      } = useAgentChatStore.getState();

      const activeThreadBrandId =
        threads.find((thread) => thread.id === activeThreadId)?.brandId ?? null;
      const targetBrandId = brandId || null;
      const hasBrandConflict = Boolean(
        activeThreadBrandId &&
          targetBrandId &&
          activeThreadBrandId !== targetBrandId,
      );

      if (hasBrandConflict) {
        setActiveThread(null);
        // Clears composerSeed — seed only after the reset lands.
        resetActiveConversationState();
        seedComposer(trimmed, null);
      } else {
        seedComposer(trimmed, activeThreadId);
      }

      setInspectorOpen?.(true);
      dispatchOpenConversationTab();
    },
    [brandId, setInspectorOpen],
  );
}
