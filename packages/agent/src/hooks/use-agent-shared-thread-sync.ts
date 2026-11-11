'use client';

import { restoreThreadFromSnapshot } from '@genfeedai/agent/hooks/agent-chat-stream.restore';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AGENT_THREAD_STATUS_EVENT_TYPE } from '@genfeedai/contracts/constants';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useEffect, useRef } from 'react';
import { findAgentStreamEntry } from './agent-chat-stream.runtime';

/** Events that change what the open thread shows, from a run this client did not start. */
const SHARED_THREAD_EVENT_TYPES = [
  AGENT_THREAD_STATUS_EVENT_TYPE,
  'agent:stream_start',
  'agent:tool_complete',
  'agent:ui_blocks',
  'agent:input_request',
  'agent:input_resolved',
  'agent:work_event',
  'agent:done',
  'agent:error',
] as const;

/** A burst of events from one run reloads the open thread once. */
export const SHARED_THREAD_SYNC_DEBOUNCE_MS = 400;

/** Rehydrates the open thread from its snapshot and messages. */
export function restoreActiveThread(apiService: AgentApiService): void {
  const state = useAgentChatStore.getState();
  if (!state.activeThreadId) {
    return;
  }
  const threadId = state.activeThreadId;
  void restoreThreadFromSnapshot(threadId, {
    apiService,
    clearCompletionWatchdog: () => {},
    clearPendingCompletionIfThread: () => {},
    clearPendingInputRequest: state.clearPendingInputRequest,
    markStreamLive: state.markStreamLive,
    resetStreamState: state.resetStreamState,
    setActiveRun: (runId, meta) =>
      state.transitionRun(threadId, {
        runId,
        startedAt: meta?.startedAt,
        status: meta?.status,
        type: 'begin',
      }),
    setError: state.setError,
    setLatestProposedPlan: state.setLatestProposedPlan,
    setMessages: state.setMessages,
    setPendingInputRequest: state.setPendingInputRequest,
    setRunStartedAt: (startedAt) =>
      state.transitionRun(threadId, { startedAt, type: 'started-at' }),
    setWorkEvents: state.setWorkEvents,
    updateThreadSummary: state.updateThread,
  }).catch(() => undefined);
}

/**
 * Keeps the open thread current while someone else runs it (#9938). A thread
 * shared with this member streams to their socket too, but this client only
 * follows streams it started, so events for a run it does not own reload the
 * thread from its snapshot (the same path a reconnect uses) instead of being
 * dropped. A thread whose stream this client owns is left to that stream.
 */
export function useAgentSharedThreadSync(apiService: AgentApiService): void {
  const { isReady, subscribe } = useSocketManager();
  const apiServiceRef = useRef(apiService);
  apiServiceRef.current = apiService;

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onEvent = (event: { threadId?: string }) => {
      const state = useAgentChatStore.getState();
      const threadId = state.activeThreadId;
      if (
        !threadId ||
        event.threadId !== threadId ||
        state.stream.isStreaming
      ) {
        return;
      }
      const entry = findAgentStreamEntry(threadId);
      if (entry && entry.terminalAt === null) {
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(
        () => restoreActiveThread(apiServiceRef.current),
        SHARED_THREAD_SYNC_DEBOUNCE_MS,
      );
    };

    const unsubscribers = SHARED_THREAD_EVENT_TYPES.map((type) =>
      subscribe<{ threadId?: string }>(type, onEvent),
    );
    return () => {
      clearTimeout(timer);
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [isReady, subscribe]);
}
