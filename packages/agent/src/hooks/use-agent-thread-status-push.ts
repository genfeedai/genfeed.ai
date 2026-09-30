'use client';

import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AGENT_THREAD_STATUS_EVENT_TYPE } from '@genfeedai/contracts/constants';
import type { AgentThreadStatusEvent } from '@genfeedai/contracts/interfaces';
import { countAgentThreadStatusClient } from '@genfeedai/services/core/agent-thread-status-metrics.service';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useEffect, useRef } from 'react';
import { findAgentStreamEntry } from './agent-chat-stream.runtime';

/** Coalesces a burst of events about threads the list does not hold yet. */
const UNKNOWN_THREAD_RELOAD_DEBOUNCE_MS = 1_000;
/** How often the list refetches while the push channel is unavailable. */
export const AGENT_THREAD_STATUS_FALLBACK_INTERVAL_MS = 30_000;

interface UseAgentThreadStatusPushParams {
  isActive: boolean;
  /** Reloads the thread list; resolves `false` when it did not complete. */
  reloadThreads: () => Promise<boolean>;
}

/**
 * Keeps every thread row's run status current from the server's push (#5636),
 * over the session's one socket — never a subscription per thread.
 *
 * - An event applies only when its sequence is newer than the row's
 *   (`statusSequence`, read with the list) and, for a thread whose live stream
 *   this client owns, newer than the stream's own sequence, so a push never
 *   overwrites a stream that is ahead of it. Row position does not change.
 * - On connect and reconnect the list reloads; events are not replayed. A list
 *   response carries each row's sequence, so a push that raced ahead of it is
 *   kept and an older one is superseded.
 * - While the channel is not connected, the list refetches when the window
 *   regains focus and, while down, on an interval as long as the sidebar is
 *   visible. With the channel connected neither runs: the push makes them
 *   redundant. No error is shown.
 */
export function useAgentThreadStatusPush({
  isActive,
  reloadThreads,
}: UseAgentThreadStatusPushParams): void {
  const { connectionState, isReady, subscribe } = useSocketManager();
  const reloadThreadsRef = useRef(reloadThreads);
  reloadThreadsRef.current = reloadThreads;
  const previousConnectionStateRef = useRef(connectionState);
  const unknownThreadTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  useEffect(() => {
    if (!isActive || !isReady) {
      return;
    }

    // The reload callback changes with the list's brand/status scope. Keep
    // unresolved IDs suppressed within that scope until a row appears.
    const unknownThreadIds = new Set<string>();

    const unsubscribe = subscribe<AgentThreadStatusEvent>(
      AGENT_THREAD_STATUS_EVENT_TYPE,
      (event) => {
        countAgentThreadStatusClient('received');
        const state = useAgentChatStore.getState();
        const streamEntry = findAgentStreamEntry(event.threadId);
        const streamSequenceFloor =
          streamEntry && streamEntry.terminalAt === null
            ? (state.threadEventSequenceById[event.threadId] ?? 0)
            : 0;
        const result = state.applyThreadStatusPush(event, streamSequenceFloor);

        if (result === 'applied') {
          unknownThreadIds.delete(event.threadId);
          countAgentThreadStatusClient('applied');
          return;
        }
        if (result === 'stale') {
          unknownThreadIds.delete(event.threadId);
          countAgentThreadStatusClient('dropped_out_of_order');
          return;
        }

        // A thread started elsewhere is not in this list yet: the list, not
        // the event, is what introduces a row.
        countAgentThreadStatusClient('unknown_thread');
        if (unknownThreadIds.has(event.threadId)) {
          return;
        }
        unknownThreadIds.add(event.threadId);
        clearTimeout(unknownThreadTimerRef.current);
        unknownThreadTimerRef.current = setTimeout(() => {
          const pendingIds = [...unknownThreadIds];
          void reloadThreads()
            .catch(() => false)
            .then((isLoaded) => {
              if (!isLoaded) {
                for (const id of pendingIds) unknownThreadIds.delete(id);
              }
            });
        }, UNKNOWN_THREAD_RELOAD_DEBOUNCE_MS);
      },
    );

    return () => {
      unsubscribe();
      clearTimeout(unknownThreadTimerRef.current);
    };
  }, [isActive, isReady, reloadThreads, subscribe]);

  useEffect(() => {
    const previous = previousConnectionStateRef.current;
    previousConnectionStateRef.current = connectionState;
    if (!isActive || connectionState !== 'connected') {
      return;
    }
    if (previous === 'connected') {
      return;
    }

    countAgentThreadStatusClient('reconnect_reload');
    void reloadThreadsRef.current().catch(() => false);
  }, [connectionState, isActive]);

  useEffect(() => {
    if (!isActive || connectionState === 'connected') {
      return;
    }

    const handleFocus = () => {
      countAgentThreadStatusClient('fallback_refetch');
      void reloadThreadsRef.current().catch(() => false);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [connectionState, isActive]);

  useEffect(() => {
    if (
      !isActive ||
      (connectionState !== 'offline' && connectionState !== 'reconnecting')
    ) {
      return;
    }

    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      countAgentThreadStatusClient('fallback_refetch');
      void reloadThreadsRef.current().catch(() => false);
    }, AGENT_THREAD_STATUS_FALLBACK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [connectionState, isActive]);
}
