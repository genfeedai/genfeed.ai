'use client';

import { AgentFullPage } from '@genfeedai/agent';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { TasksService } from '@services/management/tasks.service';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { isEEEnabled } from '@/lib/config/edition';
import { useChatWorkspace } from './chat-workspace-context';

interface ChatWorkspacePageShellProps {
  threadId?: string;
}

export function ChatWorkspacePageShell({
  threadId,
}: ChatWorkspacePageShellProps) {
  const { push } = useRouter();
  const { orgHref } = useOrgUrl();
  const { getToken } = useAuthIdentity();
  const {
    agentApiService,
    isLoaded,
    handleOAuthConnect,
    completeOnboardingFlow,
    isOnboarding,
  } = useChatWorkspace();

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
        showThreadSidebar={false}
        threadId={threadId}
        onNavigateToBilling={() => {
          push(
            orgHref(isEEEnabled() ? '/settings/billing' : '/settings/api-keys'),
          );
        }}
        onOAuthConnect={handleOAuthConnect}
        onOnboardingCompleted={completeOnboardingFlow}
        onSelectCreditPack={(pack) => {
          push(
            isEEEnabled()
              ? orgHref(`/settings/billing?pack=${pack.label.toLowerCase()}`)
              : orgHref('/settings/api-keys'),
          );
        }}
      />
    </div>
  );
}
