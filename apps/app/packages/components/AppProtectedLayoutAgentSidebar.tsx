'use client';

import type { ReactNode } from 'react';

type Props = {
  /**
   * Stable factory from the protected layout. Must not close over
   * frequently-changing parent state — the nav panel memo only depends on
   * this reference and the route flag.
   */
  renderConversations: () => ReactNode;
};

/**
 * Module-owned conversation nav column body.
 *
 * Header actions (refresh / archive) live inside `AgentThreadList` itself so
 * we never lift ReactNode state into a parent useMemo that would recreate the
 * nav panel identity and remount the list. Starting a conversation is a
 * sidebar row ("New Conversation") next to Search, like every other surface's
 * quick actions — this column no longer carries a bare "+" of its own.
 */
export default function AgentSidebarContent({ renderConversations }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col pb-2 pt-1">
        {renderConversations()}
      </div>
    </div>
  );
}
