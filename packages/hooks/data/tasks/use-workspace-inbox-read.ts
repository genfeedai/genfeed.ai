'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { IWorkspaceInboxRead } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { type Task, TasksService } from '@services/management/tasks.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

function isTaskUnreadSince(
  task: Pick<Task, 'updatedAt' | 'createdAt'>,
  seen: string | undefined,
): boolean {
  return (
    !seen ||
    new Date(task.updatedAt ?? task.createdAt).getTime() >
      new Date(seen).getTime()
  );
}

export function isWorkspaceInboxTaskUnread(
  task: Pick<Task, 'id' | 'updatedAt' | 'createdAt'>,
  reads: readonly IWorkspaceInboxRead[] | null | undefined,
): boolean {
  // A task collection (or any partial payload) has no reads list. Missing
  // receipts mean unseen. Calling find on that list crashes the inbox.
  const readList = Array.isArray(reads) ? reads : [];
  const seen = readList.find((read) => read.taskId === task.id)?.seenUpdatedAt;
  return isTaskUnreadSince(task, seen);
}

export function useWorkspaceInboxRead() {
  const { getToken, orgId, userId } = useAuthIdentity();
  // Session activeOrganizationId is often null. The workspace org is the
  // scope the page is showing, and the API resolves the tenant from the token.
  const { organizationId: workspaceOrganizationId } = useBrand();
  const scopeId = orgId || workspaceOrganizationId || 'session';
  const client = useQueryClient();
  const key = ['workspace-inbox-read', userId, scopeId];
  const service = async () => {
    const token = await resolveAuthToken(getToken);
    if (!token) throw new Error('Authentication required');
    return TasksService.getInstance(token);
  };
  const state = useQuery({
    queryKey: key,
    enabled: Boolean(userId),
    queryFn: async ({ signal }) => (await service()).findInboxReadState(signal),
    refetchInterval: 60_000,
  });
  const hasReadState = Boolean(state.data);
  const receiptList = state.data?.reads;
  // biome-ignore lint/correctness/useExhaustiveDependencies: user and organization scope reset the derived receipt snapshot even if it shares an array.
  const isUnread = useMemo(() => {
    let seenByTaskId: Map<string, string> | undefined;
    return (task: Task): boolean => {
      if (!hasReadState) return false;
      if (!seenByTaskId) {
        seenByTaskId = new Map();
        for (const read of Array.isArray(receiptList) ? receiptList : []) {
          const { taskId } = read;
          if (!seenByTaskId.has(taskId))
            seenByTaskId.set(taskId, read.seenUpdatedAt);
        }
      }
      return isTaskUnreadSince(task, seenByTaskId.get(task.id));
    };
  }, [hasReadState, receiptList, scopeId, userId]);
  const read = useMutation({
    mutationKey: key,
    scope: { id: key.join(':') },
    mutationFn: async (tasks: Task[] | null) => {
      // Chunk a large inbox without dropping any items from "Mark all read".
      const usersService = await service();
      if (tasks === null) return usersService.markAllInboxRead();
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
    isUnread,
  };
}
