'use client';

import { type AgentThread, useAgentChatStore } from '@genfeedai/agent';
import { AgentThreadKind, AgentThreadStatus } from '@genfeedai/contracts';
import { logger } from '@genfeedai/services/core/logger.service';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ThreadResolutionApi,
  ThreadResolutionState,
} from '@/features/agents/props/thread-resolution.props';

const RESOLVED_LIST_LIMIT = 50;

/**
 * Which threads are resolved, for the master workspace: the Threads panel and
 * the cards in the master conversation both read this one state. Resolved is
 * the thread's archived status, so it survives a reload and needs no new
 * field; reopening makes the thread active again.
 */
export function useThreadResolution(
  apiService: ThreadResolutionApi | null,
  isEnabled: boolean,
): ThreadResolutionState {
  const updateThread = useAgentChatStore((state) => state.updateThread);
  const upsertThread = useAgentChatStore((state) => state.upsertThread);
  const storeThreads = useAgentChatStore((state) => state.threads);
  const [resolvedById, setResolvedById] = useState<
    ReadonlyMap<string, AgentThread>
  >(new Map());
  const [pendingThreadIds, setPendingThreadIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  useEffect(() => {
    if (!isEnabled || !apiService) {
      return;
    }

    const controller = new AbortController();
    apiService
      .getThreads(
        { limit: RESOLVED_LIST_LIMIT, status: AgentThreadStatus.ARCHIVED },
        controller.signal,
      )
      .then((loaded) => {
        if (controller.signal.aborted) {
          return;
        }
        setResolvedById((current) => {
          const next = new Map(current);
          for (const thread of loaded) {
            if (thread.kind !== AgentThreadKind.MASTER) {
              next.set(thread.id, thread);
            }
          }
          return next;
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          logger.error('Failed to load resolved threads', { error });
        }
      });

    return () => controller.abort();
  }, [apiService, isEnabled]);

  // The store wins where it knows a thread: reopened elsewhere means active.
  const resolvedThreads = useMemo(() => {
    const merged = new Map(resolvedById);
    for (const thread of storeThreads) {
      if (thread.status === AgentThreadStatus.ARCHIVED) {
        merged.set(thread.id, thread);
      } else if (thread.status === AgentThreadStatus.ACTIVE) {
        merged.delete(thread.id);
      }
    }
    return [...merged.values()]
      .filter((thread) => thread.kind !== AgentThreadKind.MASTER)
      .toSorted((left, right) =>
        (right.updatedAt ?? right.createdAt).localeCompare(
          left.updatedAt ?? left.createdAt,
        ),
      );
  }, [resolvedById, storeThreads]);

  const resolvedIds = useMemo(
    () => new Set(resolvedThreads.map((thread) => thread.id)),
    [resolvedThreads],
  );

  const setPending = useCallback((threadId: string, isPending: boolean) => {
    setPendingThreadIds((current) => {
      const next = new Set(current);
      if (isPending) {
        next.add(threadId);
      } else {
        next.delete(threadId);
      }
      return next;
    });
  }, []);

  const resolveThread = useCallback(
    async (threadId: string) => {
      if (!apiService) {
        return;
      }
      setPending(threadId, true);
      try {
        const archived = await apiService.archiveThread(threadId);
        const resolved: AgentThread = {
          ...archived,
          status: AgentThreadStatus.ARCHIVED,
        };
        setResolvedById((current) => new Map(current).set(threadId, resolved));
        updateThread(threadId, { status: AgentThreadStatus.ARCHIVED });
      } catch (error: unknown) {
        logger.error('Failed to resolve thread', { error, threadId });
      } finally {
        setPending(threadId, false);
      }
    },
    [apiService, setPending, updateThread],
  );

  const reopenThread = useCallback(
    async (threadId: string) => {
      if (!apiService) {
        return;
      }
      setPending(threadId, true);
      try {
        const restored = await apiService.unarchiveThread(threadId);
        setResolvedById((current) => {
          const next = new Map(current);
          next.delete(threadId);
          return next;
        });
        upsertThread({ ...restored, status: AgentThreadStatus.ACTIVE });
      } catch (error: unknown) {
        logger.error('Failed to reopen thread', { error, threadId });
      } finally {
        setPending(threadId, false);
      }
    },
    [apiService, setPending, upsertThread],
  );

  const isResolved = useCallback(
    (threadId: string) => resolvedIds.has(threadId),
    [resolvedIds],
  );
  const isPending = useCallback(
    (threadId: string) => pendingThreadIds.has(threadId),
    [pendingThreadIds],
  );

  return {
    isPending,
    isResolved,
    pendingThreadIds,
    reopenThread,
    resolveThread,
    resolvedThreads,
  };
}
