'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
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
      <Button
        asChild
        withWrapper={false}
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.ICON}
      >
        <Link href={newThreadHref} aria-label="New agent thread">
          <Plus className="size-4" aria-hidden="true" />
        </Link>
      </Button>
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
