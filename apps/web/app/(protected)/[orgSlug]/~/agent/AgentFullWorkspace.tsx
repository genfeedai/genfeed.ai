'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AgentThreadOpenProvider,
  AgentThreadResolutionProvider,
  useAgentChatStore,
} from '@genfeedai/agent';
import {
  AgentThreadStatus,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import AgentThreadListLayout from '@ui/layout/agent-output-layout/AgentThreadListLayout';
import { Button } from '@ui/primitives/button';
import { Minimize2, SquarePen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect } from 'react';
import AgentThreadsPanel from '@/components/workspace-shell/AgentThreadsPanel';
import type { AgentFullWorkspaceProps } from '@/features/agents/props/agent-full-workspace.props';
import { AgentWorkspacePageShell } from './AgentWorkspacePageShell';
import { useAgentWorkspace } from './agent-workspace-context';
import { useAgentThreadLinks } from './use-agent-thread-links';
import { useThreadResolution } from './use-thread-resolution';

const THREAD_LIST_LIMIT = 30;

/**
 * `/agent/new` and `/agent/[id]?view=full`: the conversation at full size. The
 * thread list moves to the left, in the same grouped queue the split shows
 * beside the master, and the conversation takes the larger share. A thread in
 * the list opens full size in place; the way back to the split is the button
 * in the conversation header.
 */
export default function AgentFullWorkspace({
  onExitFullView,
  threadId,
}: AgentFullWorkspaceProps) {
  const translate = useTranslations('common.agentOutput');
  const translateWorkspace = useTranslations('common.agentWorkspace');
  const { push } = useRouter();
  const { activeHref } = useOrgUrl();
  const { brandId } = useBrand();
  const { agentApiService, isLoaded } = useAgentWorkspace();
  const threads = useAgentChatStore((state) => state.threads);
  const setThreads = useAgentChatStore((state) => state.setThreads);
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
  const { buildThreadHref } = useAgentThreadLinks(resolvedThreads);

  // The split's shell loads the active threads for the list; at full size the
  // list is the page, so it loads them itself.
  // use-effect-audit: ignore abortable request
  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    const controller = new AbortController();
    agentApiService
      .getThreads(
        { limit: THREAD_LIST_LIMIT, status: AgentThreadStatus.ACTIVE },
        controller.signal,
      )
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setThreads(loaded);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [agentApiService, isLoaded, setThreads]);

  const getFullThreadHref = useCallback(
    (id: string) => buildThreadHref(id, { isFull: true }),
    [buildThreadHref],
  );
  const openFullThread = useCallback(
    (id: string) => push(getFullThreadHref(id)),
    [getFullThreadHref, push],
  );
  const activeThreadTitle = useAgentChatStore(
    (state) =>
      state.threads.find((thread) => thread.id === threadId)?.title?.trim() ??
      '',
  );

  return (
    <AgentThreadOpenProvider value={openFullThread}>
      <AgentThreadResolutionProvider value={resolution}>
        <AgentThreadListLayout
          conversation={<AgentWorkspacePageShell threadId={threadId} />}
          conversationHeader={
            <>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {activeThreadTitle}
              </span>
              <Button
                ariaLabel={translate('newThread')}
                data-testid="agent-full-new-thread"
                icon={<SquarePen className="size-4" />}
                onClick={() => push(activeHref(APP_ROUTES.AGENT.NEW))}
                size={ButtonSize.SM}
                tooltip={translate('newThread')}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
              {threadId ? (
                <Button
                  ariaLabel={translateWorkspace('exitFullPage')}
                  data-testid="agent-full-exit"
                  icon={<Minimize2 className="size-4" />}
                  onClick={onExitFullView}
                  size={ButtonSize.SM}
                  tooltip={translateWorkspace('exitFullPage')}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              ) : null}
            </>
          }
          conversationKey={threadId ?? null}
          labels={{
            conversation: translateWorkspace('conversation'),
            threads: translate('threads'),
          }}
          list={
            <AgentThreadsPanel
              apiService={agentApiService}
              brandId={brandId || null}
              getThreadHref={getFullThreadHref}
              hasMoreResolved={hasMoreResolved}
              isLoadingMoreResolved={isLoadingMoreResolved}
              onLoadMoreResolved={loadMoreResolved}
              onOpenThreadChange={(id) => {
                if (id) {
                  openFullThread(id);
                }
              }}
              onReopenThread={reopenThread}
              onResolveThread={resolveThread}
              openThreadId={null}
              pendingThreadIds={pendingThreadIds}
              resolvedThreads={resolvedThreads}
              threads={threads}
            />
          }
        />
      </AgentThreadResolutionProvider>
    </AgentThreadOpenProvider>
  );
}
