'use client';

import {
  isTaskInWorkspaceInboxQueue,
  TasksService,
} from '@genfeedai/services/management/tasks.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useWorkspaceInboxRead } from '@hooks/data/tasks/use-workspace-inbox-read';
import { useQuery } from '@tanstack/react-query';

const WORKSPACE_INBOX_REFRESH_MS = 60_000;

export function useWorkspaceInboxCount(): number {
  const { isUnread, state } = useWorkspaceInboxRead();
  const { getToken, orgId, userId } = useAuthIdentity();
  const { data = [] } = useQuery({
    refetchInterval: WORKSPACE_INBOX_REFRESH_MS,
    staleTime: WORKSPACE_INBOX_REFRESH_MS / 2,
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

  if (!state.data) return 0;

  return data.filter(
    (task) => isTaskInWorkspaceInboxQueue(task) && isUnread(task),
  ).length;
}
