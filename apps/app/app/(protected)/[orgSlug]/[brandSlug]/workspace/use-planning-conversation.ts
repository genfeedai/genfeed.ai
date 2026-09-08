import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { UsePlanningConversationParams } from '@genfeedai/props/workspace/workspace-planning-conversation.props';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { Task, TasksService } from '@services/management/tasks.service';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export type { UsePlanningConversationParams } from '@genfeedai/props/workspace/workspace-planning-conversation.props';

/**
 * Ensures a task's planning thread exists and navigates to it. Extracted so
 * both the workspace page and the standalone tasks page can open the same
 * planning conversation instead of each re-implementing the round trip.
 */
export function usePlanningConversation({
  onError,
  onTaskUpdated,
  setBusyTaskId,
}: UsePlanningConversationParams) {
  const { getToken } = useAuthIdentity();
  const { push } = useRouter();

  const openPlanningConversation = useCallback(
    async (task: Task) => {
      setBusyTaskId(task.id);

      try {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          onError('Authentication token unavailable.');
          return;
        }

        const service = TasksService.getInstance(token);
        const planningThread = await service.ensurePlanningThread(task.id);

        onTaskUpdated(
          new Task({ ...task, planningThreadId: planningThread.threadId }),
        );

        push(`${APP_ROUTES.AGENT.ROOT}/${planningThread.threadId}`);
      } catch (error) {
        onError(
          error instanceof Error
            ? error.message
            : 'Failed to open the planning conversation.',
        );
      } finally {
        setBusyTaskId(null);
      }
    },
    [getToken, onError, onTaskUpdated, push, setBusyTaskId],
  );

  return { openPlanningConversation };
}
