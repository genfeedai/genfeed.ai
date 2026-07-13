'use client';

import { AgentFullPage } from '@genfeedai/agent';
import { isEEEnabled } from '@genfeedai/config/license';
import { APP_ROUTES } from '@genfeedai/constants';
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

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-1 flex-col">
      <AgentFullPage
        apiService={agentApiService}
        authReady={isLoaded}
        onboardingMode={isOnboarding}
        onCreateFollowUpTasks={handleCreateFollowUpTasks}
        onOpenRunThread={(runThreadId) => {
          push(orgHref(`${APP_ROUTES.AGENT.ROOT}/${runThreadId}`));
        }}
        showThreadSidebar={false}
        showRunSummary
        threadId={threadId}
        onNavigateToBilling={() => {
          push(
            orgHref(isEEEnabled() ? '/settings/billing' : '/settings/credits'),
          );
        }}
        onOAuthConnect={handleOAuthConnect}
        onBrandCreate={handleBrandCreate}
        onOnboardingCompleted={completeOnboardingFlow}
        onSelectCreditPack={(pack) => {
          push(
            isEEEnabled()
              ? orgHref(`/settings/billing?pack=${pack.label.toLowerCase()}`)
              : orgHref('/settings/credits'),
          );
        }}
      />
    </div>
  );
}
