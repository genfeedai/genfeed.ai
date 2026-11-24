'use client';

import { useAgentOutputHost } from '@contexts/ui/agent-output-host-context';
import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AgentThreadOpenProvider,
  AgentThreadResolutionProvider,
  useAgentChatStore,
} from '@genfeedai/agent';
import { useAgentThreadPrefetch } from '@genfeedai/agent/components/useAgentThreadPrefetch';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AgentOutputTabDefinition } from '@props/ui/agent-output-shell.props';
import AgentOutputLayout from '@ui/layout/agent-output-layout/AgentOutputLayout';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo } from 'react';
import AgentThreadsPanel from '@/components/workspace-shell/AgentThreadsPanel';
import type { AgentMasterWorkspaceProps } from '@/features/agents/props/agent-master-workspace.props';
import { AgentWorkspacePageShell } from './AgentWorkspacePageShell';
import { useAgentWorkspace } from './agent-workspace-context';
import { useAgentThreadLinks } from './use-agent-thread-links';
import { useMasterThread } from './use-master-thread';
import { useThreadResolution } from './use-thread-resolution';

const THREADS_TAB_ID = 'threads';
const CONTEXT_TAB_ID = 'context';

/**
 * `/agent`, `/agent/threads` and `/agent/[id]`: the master conversation on the
 * left, split 50/50 with the Threads panel on the right. Both read like one
 * conversation design, with no header above the master. The topbar's Context
 * icon swaps the right side to Context. Threads the master starts show up in
 * the panel, where one can be read and steered without leaving the page. The
 * thread open on the right is the one in the URL (`/agent/[id]`), so a reload
 * or a shared link opens it; the list is `/agent/threads`.
 */
export default function AgentMasterWorkspace({
  openThreadId,
}: AgentMasterWorkspaceProps) {
  const translate = useTranslations('common.agentOutput');
  const translateWorkspace = useTranslations('common.agentWorkspace');
  const { push } = useRouter();
  const { activeHref, orgSlug } = useOrgUrl();
  const { brandId } = useBrand();
  const { agentApiService, isLoaded } = useAgentWorkspace();
  const host = useAgentOutputHost();
  const contextSidebar = useContextSidebar();
  const threads = useAgentChatStore((state) => state.threads);
  const { hasFailed, isLoading, masterThreadId } = useMasterThread(
    agentApiService,
    isLoaded,
    orgSlug,
  );
  const resolution = useThreadResolution(agentApiService, isLoaded);
  const { prefetchThread } = useAgentThreadPrefetch({
    apiService: agentApiService,
  });

  // The thread open in the panel is the one full view would show: warm its
  // conversation now, so expanding it paints from the cache with no request.
  // use-effect-audit: ignore warms the conversation cache with a network prefetch
  useEffect(() => {
    if (isLoaded && openThreadId) {
      prefetchThread(openThreadId);
    }
  }, [isLoaded, openThreadId, prefetchThread]);
  const {
    hasMoreResolved,
    isLoadingMoreResolved,
    loadMoreResolved,
    pendingThreadIds,
    reopenThread,
    resolveThread,
    resolvedThreads,
  } = resolution;

  // A record the operator picked opens in Context; the page's own selections
  // stay a click away on the topbar's Context icon.
  const selection = contextSidebar?.selection ?? null;
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : null;
  const isUserSelectionOpen =
    selection?.origin === 'user' &&
    (Boolean(contextSidebar?.isOpen) || Boolean(contextSidebar?.isMobileOpen));
  const onOpenContext = host?.onOpenContext;
  // use-effect-audit: ignore opens the host's Context panel
  useEffect(() => {
    if (selectionKey && isUserSelectionOpen) {
      onOpenContext?.();
    }
  }, [isUserSelectionOpen, onOpenContext, selectionKey]);

  const { buildThreadHref, openFullThread } =
    useAgentThreadLinks(resolvedThreads);

  // A thread chip in the master's transcript, or a row in the list, opens that
  // thread in the panel by moving the URL to it; Back returns to the list.
  const openThreadInPanel = useCallback(
    (threadId: string) => {
      host?.onCloseContext();
      push(buildThreadHref(threadId));
    },
    [buildThreadHref, host, push],
  );

  const setOpenThreadId = useCallback(
    (threadId: string | null) => {
      if (threadId) {
        openThreadInPanel(threadId);
        return;
      }
      push(activeHref(APP_ROUTES.AGENT.THREADS));
    },
    [activeHref, openThreadInPanel, push],
  );

  const tabs = useMemo<AgentOutputTabDefinition[]>(
    () => [
      {
        content: (
          <AgentThreadsPanel
            apiService={agentApiService}
            brandId={brandId || null}
            getThreadHref={buildThreadHref}
            hasMoreResolved={hasMoreResolved}
            isLoading={isLoading}
            isLoadingMoreResolved={isLoadingMoreResolved}
            onLoadMoreResolved={loadMoreResolved}
            onOpenFullThread={openFullThread}
            onOpenThreadChange={setOpenThreadId}
            onReopenThread={reopenThread}
            onResolveThread={resolveThread}
            openThreadId={openThreadId}
            pendingThreadIds={pendingThreadIds}
            resolvedThreads={resolvedThreads}
            threads={threads}
          />
        ),
        id: THREADS_TAB_ID,
        label: translate('threads'),
      },
      {
        content: host?.contextPanel ?? null,
        id: CONTEXT_TAB_ID,
        label: translate('context'),
      },
    ],
    [
      agentApiService,
      brandId,
      buildThreadHref,
      hasMoreResolved,
      host?.contextPanel,
      isLoading,
      isLoadingMoreResolved,
      loadMoreResolved,
      openFullThread,
      openThreadId,
      pendingThreadIds,
      reopenThread,
      resolveThread,
      resolvedThreads,
      setOpenThreadId,
      threads,
      translate,
    ],
  );

  return (
    <AgentOutputLayout
      activeTabId={host?.isContextOpen ? CONTEXT_TAB_ID : THREADS_TAB_ID}
      agent={
        // A failed master read falls back to a blank conversation, so the page
        // is never empty.
        isLoading && !hasFailed ? null : (
          <AgentThreadOpenProvider value={openThreadInPanel}>
            <AgentThreadResolutionProvider value={resolution}>
              <AgentWorkspacePageShell threadId={masterThreadId ?? undefined} />
            </AgentThreadResolutionProvider>
          </AgentThreadOpenProvider>
        )
      }
      labels={{
        agent: translateWorkspace('master'),
        collapseOutput: translate('collapseOutput'),
        expandOutput: translate('expandOutput'),
        output: translate('threads'),
        resizePanes: translate('resizePanes'),
      }}
      tabs={tabs}
    />
  );
}
