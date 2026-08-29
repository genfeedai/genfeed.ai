'use client';

import { AgentFullPage } from '@genfeedai/agent';
import { useAgentBrandCreate } from '@genfeedai/hooks/agent/use-agent-brand-create';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { TasksService } from '@services/management/tasks.service';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useAgentWorkspace } from './agent-workspace-context';

interface AgentWorkspacePageShellProps {
  threadId?: string;
}

export function AgentWorkspacePageShell({
  threadId,
}: AgentWorkspacePageShellProps) {
  const { push } = useRouter();
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
