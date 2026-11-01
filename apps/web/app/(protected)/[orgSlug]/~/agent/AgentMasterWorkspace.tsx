'use client';

import { useAgentOutputHost } from '@contexts/ui/agent-output-host-context';
import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import { AgentThreadOpenProvider, useAgentChatStore } from '@genfeedai/agent';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AgentOutputTabDefinition } from '@props/ui/agent-output-shell.props';
import AgentOutputLayout from '@ui/layout/agent-output-layout/AgentOutputLayout';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AgentThreadsPanel from '@/components/workspace-shell/AgentThreadsPanel';
import { AgentWorkspacePageShell } from './AgentWorkspacePageShell';
import { useAgentWorkspace } from './agent-workspace-context';
import { useMasterThread } from './use-master-thread';

const THREADS_TAB_ID = 'threads';
const CONTEXT_TAB_ID = 'context';

/**
 * `/agent`: the master conversation on the left, split 50/50 with a rail that
 * has Threads (the default) and Context. Threads the master starts show up in
 * the panel, where one can be read and steered without leaving the page.
 */
export default function AgentMasterWorkspace() {
  const translate = useTranslations('common.agentOutput');
  const translateWorkspace = useTranslations('common.agentWorkspace');
  const { push } = useRouter();
  const { orgHref } = useOrgUrl();
  const { agentApiService, isLoaded } = useAgentWorkspace();
  const host = useAgentOutputHost();
  const contextSidebar = useContextSidebar();
  const threads = useAgentChatStore((state) => state.threads);
  const { hasFailed, isLoading, masterThreadId } = useMasterThread(
    agentApiService,
    isLoaded,
  );
  const [activeTabId, setActiveTabId] = useState(THREADS_TAB_ID);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  // A record the operator picked opens in the Context tab; the page's own
  // selections stay a tab away.
  const selection = contextSidebar?.selection ?? null;
  const selectionKey = selection ? `${selection.kind}:${selection.id}` : null;
  const isUserSelectionOpen =
    selection?.origin === 'user' &&
    (Boolean(contextSidebar?.isOpen) || Boolean(contextSidebar?.isMobileOpen));
  useEffect(() => {
    if (selectionKey && isUserSelectionOpen) {
      setActiveTabId(CONTEXT_TAB_ID);
    }
  }, [isUserSelectionOpen, selectionKey]);

  // A thread chip in the master's transcript opens that thread in the panel.
  const openThreadInPanel = useCallback((threadId: string) => {
    setOpenThreadId(threadId);
    setActiveTabId(THREADS_TAB_ID);
  }, []);

  const openFullThread = useCallback(
    (threadId: string) => push(orgHref(`/agent/${threadId}`)),
    [orgHref, push],
  );

  const tabs = useMemo<AgentOutputTabDefinition[]>(
    () => [
      {
        content: (
          <AgentThreadsPanel
            apiService={agentApiService}
            isLoading={isLoading}
            onOpenFullThread={openFullThread}
            onOpenThreadChange={setOpenThreadId}
            openThreadId={openThreadId}
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
      host?.contextPanel,
      isLoading,
      openFullThread,
      openThreadId,
      threads,
      translate,
    ],
  );

  return (
    <AgentOutputLayout
      activeTabId={activeTabId}
      agent={
        // A failed master read falls back to a blank conversation, so the page
        // is never empty.
        isLoading && !hasFailed ? null : (
          <AgentThreadOpenProvider value={openThreadInPanel}>
            <AgentWorkspacePageShell threadId={masterThreadId ?? undefined} />
          </AgentThreadOpenProvider>
        )
      }
      agentHeader={
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {translateWorkspace('master')}
        </span>
      }
      labels={{
        agent: translateWorkspace('master'),
        collapseAgent: translate('collapseAgent'),
        collapseOutput: translate('collapseOutput'),
        expandAgent: translate('expandAgent'),
        expandOutput: translate('expandOutput'),
        output: translate('threads'),
      }}
      mode="split"
      onTabChange={setActiveTabId}
      tabs={tabs}
    />
  );
}
