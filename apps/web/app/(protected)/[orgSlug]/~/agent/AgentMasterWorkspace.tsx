'use client';

import { useAgentOutputHost } from '@contexts/ui/agent-output-host-context';
import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
} from '@contexts/user/brand-context/brand-context.helpers';
import {
  AgentThreadOpenProvider,
  AgentThreadResolutionProvider,
  useAgentChatStore,
} from '@genfeedai/agent';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AgentOutputTabDefinition } from '@props/ui/agent-output-shell.props';
import AgentOutputLayout from '@ui/layout/agent-output-layout/AgentOutputLayout';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo } from 'react';
import AgentThreadsPanel from '@/components/workspace-shell/AgentThreadsPanel';
import type { AgentMasterWorkspaceProps } from '@/features/agents/props/agent-master-workspace.props';
import { buildAgentThreadHref } from '@/lib/navigation/operator-shell';
import { AgentWorkspacePageShell } from './AgentWorkspacePageShell';
import { useAgentWorkspace } from './agent-workspace-context';
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
  const { brandId, brands, organizationId } = useBrand();
  const { agentApiService, isLoaded } = useAgentWorkspace();
  const host = useAgentOutputHost();
  const contextSidebar = useContextSidebar();
  const threads = useAgentChatStore((state) => state.threads);
  const { hasFailed, isLoading, masterThreadId } = useMasterThread(
    agentApiService,
    isLoaded,
  );
  const resolution = useThreadResolution(agentApiService, isLoaded);
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
  useEffect(() => {
    if (selectionKey && isUserSelectionOpen) {
      onOpenContext?.();
    }
  }, [isUserSelectionOpen, onOpenContext, selectionKey]);

  // A thread opens in its own brand: the link carries the owning brand's slug,
  // so the topbar follows the thread. A thread with no brand (or one the
  // brand list does not know) stays in the scope the operator is in.
  const buildThreadHref = useCallback(
    (threadId: string, options?: { isFull?: boolean }) => {
      const thread =
        threads.find((item) => item.id === threadId) ??
        resolvedThreads.find((item) => item.id === threadId);
      const ownerBrand = thread?.brandId
        ? brands.find(
            (brand) =>
              getBrandEntityId(brand) === thread.brandId &&
              getBrandOrganizationId(brand) === organizationId,
          )
        : undefined;
      if (ownerBrand?.slug && orgSlug) {
        return createBrandAppRoute(
          orgSlug,
          ownerBrand.slug,
          buildAgentThreadHref(threadId, options),
        );
      }
      return activeHref(buildAgentThreadHref(threadId, options));
    },
    [activeHref, brands, orgSlug, organizationId, resolvedThreads, threads],
  );

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

  const openFullThread = useCallback(
    (threadId: string) => push(buildThreadHref(threadId, { isFull: true })),
    [buildThreadHref, push],
  );

  const tabs = useMemo<AgentOutputTabDefinition[]>(
    () => [
      {
        content: (
          <AgentThreadsPanel
            apiService={agentApiService}
            brandId={brandId || null}
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
      }}
      tabs={tabs}
    />
  );
}
