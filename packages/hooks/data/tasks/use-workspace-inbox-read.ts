'use client';

import type { IWorkspaceInboxRead } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { type Task, TasksService } from '@services/management/tasks.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function isWorkspaceInboxTaskUnread(
  task: Pick<Task, 'id' | 'updatedAt' | 'createdAt'>,
  reads: readonly IWorkspaceInboxRead[],
): boolean {
  const seen = reads.find((read) => read.taskId === task.id)?.seenUpdatedAt;
  return (
    !seen ||
    new Date(task.updatedAt ?? task.createdAt).getTime() >
      new Date(seen).getTime()
  );
}

export function useWorkspaceInboxRead() {
  const { getToken, orgId, userId } = useAuthIdentity();
  const client = useQueryClient();
  const key = ['workspace-inbox-read', userId, orgId];
  const service = async () => {
    const token = await resolveAuthToken(getToken);
    if (!token) throw new Error('Authentication required');
    return TasksService.getInstance(token);
  };
  const state = useQuery({
    queryKey: key,
    enabled: Boolean(userId && orgId),
    queryFn: async ({ signal }) => (await service()).findInboxReadState(signal),
    refetchInterval: 60_000,
  });
  const read = useMutation({
    mutationKey: key,
    scope: { id: key.join(':') },
    mutationFn: async (tasks: Task[]) => {
      // Chunk a large inbox without dropping any items from "Mark all read".
      const usersService = await service();
      let saved = state.data;
      for (let offset = 0; offset < tasks.length; offset += 500) {
        saved = await usersService.markInboxRead(
          tasks.slice(offset, offset + 500).map((task) => ({
            taskId: task.id,
            seenUpdatedAt: task.updatedAt ?? task.createdAt,
          })),
        );
      }
      return saved;
    },
    onSuccess: (saved) => {
      if (saved) client.setQueryData(key, saved);
      void client.invalidateQueries({ queryKey: key });
    },
  });
  return {
    state,
    read,
    isUnread: (task: Task) =>
      isWorkspaceInboxTaskUnread(task, state.data?.reads ?? []),
  };
}
