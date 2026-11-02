'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { Minimize2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { AgentConversationRouteHostProps } from '@/features/agents/props/agent-conversation-route-host.props';
import {
  buildAgentThreadHref,
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
 * The URL picks the layout (see `resolveAgentConversationRoute`):
 * - `/agent`, `/agent/threads` and `/agent/[id]` are the master conversation
 *   on the left with the Threads list, or the thread named in the URL, on the
 *   right.
 * - `/agent/new` and `/agent/[id]/full` are one full-width conversation. A
 *   thread opened full size shows a button back to `/agent/[id]`.
 *
 * The routes' `page.tsx` files stay the owners of route intent (reset on
 * `/agent/new`, malformed-id redirect on `/agent/[id]`) and render nothing
 * themselves; `/agent/journey` keeps its own content.
 */
export default function AgentConversationRouteHost({
  children,
}: AgentConversationRouteHostProps) {
  const rawPathname = usePathname();
  const { push } = useRouter();
  const { orgHref } = useOrgUrl();
  const translate = useTranslations('common.agentWorkspace');
  const route = useMemo(() => {
    // `usePathname()` is null during the first App Router paint. Treat that
    // as the unthreaded conversation so /agent/new keeps the shell mounted
    // instead of rendering only a page that returns null.
    if (!rawPathname) {
      return { layout: 'single' as const, threadId: undefined };
    }

    return resolveAgentConversationRoute(
      normalizeProtectedPathname(rawPathname),
    );
  }, [rawPathname]);

  if (!route) {
    return children;
  }

  const shell =
    route.layout === 'master' ? (
      <AgentMasterWorkspace openThreadId={route.threadId ?? null} />
    ) : (
      <AgentWorkspacePageShell threadId={route.threadId} />
    );
  const fullThreadId = route.layout === 'single' ? route.threadId : undefined;

  return (
    <>
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {shell}
        {fullThreadId ? (
          <Button
            ariaLabel={translate('exitFullPage')}
            className="absolute right-3 top-2 z-10"
            icon={<Minimize2 className="size-4" />}
            onClick={() => push(orgHref(buildAgentThreadHref(fullThreadId)))}
            size={ButtonSize.ICON}
            tooltip={translate('exitFullPage')}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : null}
      </div>
      {children}
    </>
  );
}
