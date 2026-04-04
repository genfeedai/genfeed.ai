'use client';

import { useAuth } from '@clerk/nextjs';
import { AgentFullPage } from '@genfeedai/agent';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { WorkspaceTasksService } from '@services/workspace/workspace-tasks.service';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useChatWorkspace } from './chat-workspace-context';

interface ChatWorkspacePageShellProps {
  threadId?: string;
}

export function ChatWorkspacePageShell({
  threadId,
}: ChatWorkspacePageShellProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const {
    agentApiService,
    isLoaded,
    handleOAuthConnect,
    completeOnboardingFlow,
    isOnboarding,
  } = useChatWorkspace();

  const handleCreateFollowUpTasks = useCallback(
    async (taskId: string) => {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        throw new Error('Authentication token unavailable.');
      }

      const service = WorkspaceTasksService.getInstance(token);
      const createdTasks = await service.createFollowUpTasks(taskId);

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
        onNavigateToBilling={() =>
          router.push('/settings/organization/billing')
        }
        onOAuthConnect={handleOAuthConnect}
        onOnboardingCompleted={completeOnboardingFlow}
        onSelectCreditPack={(pack) => {
          router.push(
            `/settings/organization/billing?pack=${pack.label.toLowerCase()}`,
          );
        }}
      />
    </div>
  );
}
