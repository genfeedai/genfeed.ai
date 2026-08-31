'use client';

import {
  isTaskInWorkspaceInboxQueue,
  isUnreadWorkspaceInboxTask,
  TasksService,
} from '@genfeedai/services/management/tasks.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useQuery } from '@tanstack/react-query';

export function useWorkspaceInboxCount(): number {
  const { getToken, orgId, userId } = useAuthIdentity();
  const { data = [] } = useQuery({
    queryKey: [
      'workspace-inbox-tasks',
      userId ?? 'anonymous',
      orgId ?? 'no-org',
    ],
    queryFn: async () => {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        return [];
      }

      return TasksService.getInstance(token).list({});
    },
  });

  return data.filter(
    (task) =>
      isTaskInWorkspaceInboxQueue(task) && isUnreadWorkspaceInboxTask(task),
  ).length;
}
