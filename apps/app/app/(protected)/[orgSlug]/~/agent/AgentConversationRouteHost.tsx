'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { AgentConversationRouteHostProps } from '@props/agent/agent-conversation-route-host.props';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import {
  normalizeProtectedPathname,
  resolveAgentConversationRoute,
} from '@/lib/navigation/operator-shell';
import AgentMasterWorkspace from './AgentMasterWorkspace';
import { AgentWorkspacePageShell } from './AgentWorkspacePageShell';

/**
 * Persistent host for the agent conversation.
 *
 * `/agent/[id]` is a dynamic segment, so a page rendered under it remounts on
 * every thread switch: the transcript unmounted, the store still held the
 * previous thread, then the fresh mount reset to a skeleton (or repainted the
 * cached thread from scratch). Every switch flashed even when the conversation
 * cache had the thread ready. Hosting the shell in the layout — which Next.js
 * keeps mounted across `[id]` values — makes the URL a thread selector:
 * `useAgentFullPage` sees `threadId` change in place, keeps the previous
 * transcript on screen, and swaps to the cached or fetched thread without a
 * remount.
 *
 * The routes' `page.tsx` files stay the owners of route intent (reset on
 * `/agent` and `/agent/new`, malformed-id redirect on `/agent/[id]`) and render
 * nothing themselves; `/agent/journey` keeps its own content.
 */
export default function AgentConversationRouteHost({
  children,
}: AgentConversationRouteHostProps) {
  const rawPathname = usePathname();
  const route = useMemo(() => {
    // `usePathname()` is null during the first App Router paint. Treat that
    // as the unthreaded conversation so /agent/new keeps the shell mounted
    // instead of rendering only a page that returns null.
    if (!rawPathname) {
      return { threadId: undefined };
    }

    return resolveAgentConversationRoute(
      normalizeProtectedPathname(rawPathname),
    );
  }, [rawPathname]);

  if (!route) {
    return children;
  }

  // `/agent` is the master: its conversation on the left, Threads on the right.
  // `/agent/new` and `/agent/[id]` stay a single full-page conversation.
  const isMasterRoute =
    Boolean(rawPathname) &&
    normalizeProtectedPathname(rawPathname ?? '') === APP_ROUTES.AGENT.ROOT;
  const shell = isMasterRoute ? (
    <AgentMasterWorkspace />
  ) : (
    <AgentWorkspacePageShell threadId={route.threadId} />
  );

  return (
    <>
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {shell}
      </div>
      {children}
    </>
  );
}
