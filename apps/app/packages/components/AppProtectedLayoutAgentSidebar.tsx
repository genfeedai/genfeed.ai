'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Link from 'next/link';
import { type ReactNode, useCallback, useState } from 'react';
import { HiPlus } from 'react-icons/hi2';

type Props = {
  renderConversations: (
    searchAction?: ReactNode,
    onActionsChange?: (actions: ReactNode) => void,
  ) => ReactNode;
};

/**
 * Owns conversation header actions state so parent layout can keep a stable
 * nav-panel identity. Lifting actions into AppProtectedLayout used to recreate
 * the panel every time the thread list published actions, remounting the list
 * (and reloading) on every thread change.
 */
export default function AgentSidebarContent({ renderConversations }: Props) {
  const { orgHref } = useOrgUrl();
  const [conversationActions, setConversationActions] =
    useState<ReactNode>(null);
  const handleActionsChange = useCallback((actions: ReactNode) => {
    setConversationActions(actions);
  }, []);

  const newThreadAction = (
    <Link
      href={orgHref(APP_ROUTES.AGENT.NEW)}
      aria-label="New agent thread"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background-secondary text-foreground/70 transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <HiPlus className="size-4" aria-hidden="true" />
    </Link>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col pb-2 pt-2">
        <div className="flex w-full items-center gap-2 px-3 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/40">
            Conversations
          </span>
          {conversationActions ? (
            <div className="ml-auto flex items-center gap-0.5">
              {conversationActions}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1">
          {renderConversations(newThreadAction, handleActionsChange)}
        </div>
      </div>
    </div>
  );
}
