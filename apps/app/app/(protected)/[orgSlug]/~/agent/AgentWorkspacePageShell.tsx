'use client';

import { AgentFullPage, useAgentChatStore } from '@genfeedai/agent';
import { APP_ROUTES } from '@genfeedai/constants';
import { useAgentBrandCreate } from '@genfeedai/hooks/agent/use-agent-brand-create';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { TasksService } from '@services/management/tasks.service';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { useAgentWorkspace } from './agent-workspace-context';

interface AgentWorkspacePageShellProps {
  threadId?: string;
}

export function AgentWorkspacePageShell({
  threadId,
}: AgentWorkspacePageShellProps) {
  const { push, replace } = useRouter();
  const { orgHref } = useOrgUrl();
  const { getToken } = useAuthIdentity();
  const {
    agentApiService,
    isLoaded,
    handleOAuthConnect,
    completeOnboardingFlow,
    isOnboarding,
  } = useAgentWorkspace();
  const handleBrandCreate = useAgentBrandCreate();

  // The first turn on `/agent/new` or `/agent/onboarding` creates the thread
  // and the conversation store adopts it, but the URL used to stay on the
  // unthreaded route — a reload, a shared link, or the OAuth round-trip (which
  // returns to `${AGENT.ONBOARDING}/${threadId}`) then reopened an empty
  // conversation. Promote the route to the thread the shell is already showing.
  //
  // Subscribing to the store rather than reading it in render is deliberate:
  // `useAgentFullPage` clears the active thread from a *layout* effect when the
  // route has no thread, so a render-time read would still see the departing
  // thread here and bounce the operator straight back into it.
  useEffect(() => {
    if (threadId) {
      return;
    }

    const conversationRoute = isOnboarding
      ? APP_ROUTES.AGENT.ONBOARDING
      : APP_ROUTES.AGENT.ROOT;

    return useAgentChatStore.subscribe((state, previousState) => {
      const promotedThreadId = state.activeThreadId;
      if (
        !promotedThreadId ||
        promotedThreadId === previousState.activeThreadId
      ) {
        return;
      }

      replace(orgHref(`${conversationRoute}/${promotedThreadId}`));
    });
  }, [isOnboarding, orgHref, replace, threadId]);

  const handleCreateFollowUpTasks = useCallback(
    async (taskId: string) => {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        throw new Error('Authentication token unavailable.');
      }

      const service = TasksService.getInstance(token);
      const createdTasks = await service.createChildTasks(taskId);

      return {
        createdCount: createdTasks.length,
      };
    },
    [getToken],
  );

  // `onSelectCreditPack` is drilled all the way down to `AgentChatMessage`
  // (now `React.memo`-wrapped, see #2517) for every message row. An inline
  // arrow here would be a fresh reference on every render of this shell,
  // defeating that memoization for the entire conversation history. Stabilize
  // both billing callbacks with `useCallback` for the same reason.
  const handleNavigateToBilling = useCallback(() => {
    push(orgHref('/settings/credits'));
  }, [push, orgHref]);

  const handleSelectCreditPack = useCallback(
    (pack: { label: string; price: string; credits: number }) => {
      push(orgHref(`/settings/credits?pack=${pack.label.toLowerCase()}`));
    },
    [push, orgHref],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <AgentFullPage
        apiService={agentApiService}
        authReady={isLoaded}
        onboardingMode={isOnboarding}
        onCreateFollowUpTasks={handleCreateFollowUpTasks}
        showThreadSidebar={false}
        threadId={threadId}
        onNavigateToBilling={handleNavigateToBilling}
        onOAuthConnect={handleOAuthConnect}
        onBrandCreate={handleBrandCreate}
        onOnboardingCompleted={completeOnboardingFlow}
        onSelectCreditPack={handleSelectCreditPack}
      />
    </div>
  );
}
