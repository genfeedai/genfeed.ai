'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';

type Props = {
  /**
   * Stable factory from the protected layout. Must not close over
   * frequently-changing parent state — the nav panel memo only depends on
   * this reference and the route flag.
   */
  renderConversations: (searchAction?: ReactNode) => ReactNode;
};

/**
 * Module-owned conversation nav column body.
 *
 * Header actions (refresh / archive) live inside `AgentThreadList` itself so
 * we never lift ReactNode state into a parent useMemo that would recreate the
 * nav panel identity and remount the list.
 */
export default function AgentSidebarContent({ renderConversations }: Props) {
  const { activeHref } = useOrgUrl();
  const newThreadHref = activeHref(APP_ROUTES.AGENT.NEW);
  const newThreadAction = useMemo(
    () => (
      <Link
        href={newThreadHref}
        aria-label="New agent thread"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background-secondary text-foreground/70 transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Plus className="size-4" aria-hidden="true" />
      </Link>
    ),
    [newThreadHref],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col pb-2 pt-1">
        {renderConversations(newThreadAction)}
      </div>
    </div>
  );
}
