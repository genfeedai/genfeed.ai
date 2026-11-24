'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { AgentConversationRouteHostProps } from '@/features/agents/props/agent-conversation-route-host.props';
import {
  AGENT_VIEW_PARAM,
  normalizeProtectedPathname,
  resolveAgentConversationRoute,
} from '@/lib/navigation/operator-shell';
import AgentFullWorkspace from './AgentFullWorkspace';
import AgentMasterWorkspace from './AgentMasterWorkspace';

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
 * The URL picks the layout (see `resolveAgentConversationRoute`):
 * - `/agent`, `/agent/threads` and `/agent/[id]` are the master conversation
 *   on the left with the Threads list, or the thread named in the URL, on the
 *   right.
 * - `/agent/new` and `/agent/[id]?view=full` are the conversation at full
 *   size: the thread list on the left, the conversation taking the larger
 *   share. A thread opened full size shows a button back to `/agent/[id]`.
 *
 * Full view is a search param, not a route: entering and leaving it rewrites
 * the URL in place (`history.pushState`, which the App Router follows), so it
 * never waits on a route request and the thread the panel already loaded is
 * the one shown.
 *
 * The routes' `page.tsx` files stay the owners of route intent (reset on
 * `/agent/new`, malformed-id redirect on `/agent/[id]`) and render nothing
 * themselves; `/agent/journey` keeps its own content.
 */
export default function AgentConversationRouteHost({
  children,
}: AgentConversationRouteHostProps) {
  const rawPathname = usePathname();
  const searchParams = useSearchParams();
  const route = useMemo(() => {
    // `usePathname()` is null during the first App Router paint. Treat that
    // as the unthreaded conversation so /agent/new keeps the shell mounted
    // instead of rendering only a page that returns null.
    if (!rawPathname) {
      return { layout: 'single' as const, threadId: undefined };
    }

    return resolveAgentConversationRoute(
      normalizeProtectedPathname(rawPathname),
      searchParams,
    );
  }, [rawPathname, searchParams]);

  const exitFullView = useCallback(() => {
    if (!rawPathname) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete(AGENT_VIEW_PARAM);
    const query = nextParams.toString();
    window.history.pushState(
      null,
      '',
      query ? `${rawPathname}?${query}` : rawPathname,
    );
  }, [rawPathname, searchParams]);

  if (!route) {
    return children;
  }

  return (
    <>
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {route.layout === 'master' ? (
          <AgentMasterWorkspace openThreadId={route.threadId ?? null} />
        ) : (
          <AgentFullWorkspace
            onExitFullView={exitFullView}
            threadId={route.threadId}
          />
        )}
      </div>
      {children}
    </>
  );
}
