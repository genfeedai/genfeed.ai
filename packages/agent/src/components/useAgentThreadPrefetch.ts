import { AGENT_MESSAGE_PAGE_SIZE } from '@genfeedai/agent/constants/agent-message-pagination.constant';
import type { AgentProposedPlan } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  mapSnapshotPendingInputRequest,
  mapSnapshotWorkEvents,
  readSnapshotRunError,
} from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import { conversationHydrationFlights } from '@genfeedai/agent/utils/conversation-hydration-flight';
import { logger } from '@genfeedai/services/core/logger.service';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Hovering (or keyboard-focusing) a thread row is a strong signal the user is
 * about to click it, but a mouse sweeping down the sidebar fires
 * pointer-enter on every row it passes over. This delay must outlast a sweep
 * so only the row the pointer actually settles on triggers a fetch — without
 * it, scanning the list would fan out one request per row (#2790).
 */
const THREAD_PREFETCH_DEBOUNCE_MS = 150;

interface UseAgentThreadPrefetchParams {
  apiService: AgentApiService;
}

interface UseAgentThreadPrefetchResult {
  /** Debounced hover/focus prefetch. Safe to call on every pointer-enter. */
  prefetchThread: (threadId: string) => void;
  /**
   * Cancels a pending or in-flight prefetch. When `threadId` is given, only
   * cancels if that thread is the one currently pending/in-flight — a stale
   * pointer-leave for a row that has already been superseded by a newer
   * hover must not cancel the newer prefetch. Omit `threadId` to cancel
   * whatever is currently pending, unconditionally.
   */
  cancelPrefetch: (threadId?: string) => void;
}

/**
 * Warms `conversationCacheByThread` for a thread the user is likely about to
 * open, so the real switch (`useAgentFullPage`'s thread effect) is a cache
 * hit instead of a cold fetch. Only the messages payload — the one response
 * that gates paint — plus the snapshot (plan/pending-input/work-events) are
 * fetched. The thread record is deliberately not among them: priming stamps
 * `cachedAt`, so the switch that follows sees a fresh cache and skips
 * `getThread` too. `useAgentFullPage` covers that gap from the thread list
 * row, which already carries every field the skipped handler would have set.
 */
export function useAgentThreadPrefetch({
  apiService,
}: UseAgentThreadPrefetchParams): UseAgentThreadPrefetchResult {
  const primeConversationCache = useAgentChatStore(
    (s) => s.primeConversationCache,
  );

  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pendingThreadIdRef = useRef<string | null>(null);

  const cancelPrefetch = useCallback((threadId?: string) => {
    if (threadId && pendingThreadIdRef.current !== threadId) {
      return;
    }

    const targetThreadId = threadId ?? pendingThreadIdRef.current;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = undefined;
    }

    // A click (or a switch that already adopted this flight) makes the
    // thread active. Aborting here would cancel the request set the switch
    // is waiting on and force a duplicate.
    const activeThreadId = useAgentChatStore.getState().activeThreadId;
    if (targetThreadId && targetThreadId !== activeThreadId) {
      conversationHydrationFlights.abort(targetThreadId);
    }
    pendingThreadIdRef.current = null;
  }, []);

  const prefetchThread = useCallback(
    (threadId: string) => {
      // Re-hovering the thread that is already pending/in-flight (e.g. the
      // pointer briefly left and returned to the same row) must be a no-op —
      // restarting here would cancel a fetch that was about to satisfy this
      // exact request and stack a duplicate in its place.
      if (threadId === pendingThreadIdRef.current) {
        return;
      }

      // Single-flight: a new hover target always supersedes whatever prefetch
      // was pending or in-flight before it.
      cancelPrefetch();
      pendingThreadIdRef.current = threadId;

      debounceTimeoutRef.current = setTimeout(() => {
        debounceTimeoutRef.current = undefined;

        // Read live state at fire time, not the state when the hover began —
        // both the active thread and cache freshness can change during the
        // debounce window.
        const state = useAgentChatStore.getState();
        if (
          threadId !== pendingThreadIdRef.current ||
          threadId === state.activeThreadId ||
          state.isConversationCacheFresh(threadId)
        ) {
          pendingThreadIdRef.current = null;
          return;
        }

        const flight = conversationHydrationFlights.begin(
          threadId,
          async (signal) => {
            const [page, snapshot] = await Promise.all([
              runAgentApiEffect(
                apiService.getMessagesPageEffect(
                  threadId,
                  { limit: AGENT_MESSAGE_PAGE_SIZE },
                  signal,
                ),
              ),
              runAgentApiEffect(
                apiService.getThreadSnapshotEffect(threadId, signal),
              ),
            ]);
            return { page, snapshot };
          },
        );

        flight.promise
          .then(({ page, snapshot }) => {
            if (flight.signal.aborted || !snapshot) {
              return;
            }
            primeConversationCache(threadId, {
              error: readSnapshotRunError(snapshot),
              hasMoreMessages: page.hasMore,
              latestProposedPlan:
                (snapshot.latestProposedPlan as AgentProposedPlan | null) ??
                null,
              messages: page.messages,
              messagesCursor: page.nextCursor,
              pendingInputRequest: mapSnapshotPendingInputRequest(snapshot),
              workEvents: mapSnapshotWorkEvents(snapshot),
            });
          })
          .catch((error) => {
            if (!flight.signal.aborted) {
              logger.error('useAgentThreadPrefetch prefetch failed', error);
            }
          })
          .finally(() => {
            if (pendingThreadIdRef.current === threadId) {
              pendingThreadIdRef.current = null;
            }
          });
      }, THREAD_PREFETCH_DEBOUNCE_MS);
    },
    [apiService, cancelPrefetch, primeConversationCache],
  );

  // Never let a prefetch outlive the component that requested it.
  useEffect(() => {
    return () => {
      cancelPrefetch();
    };
  }, [cancelPrefetch]);

  return { cancelPrefetch, prefetchThread };
}
