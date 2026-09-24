'use client';

import { createAgentStreamController } from '@genfeedai/agent/hooks/agent-chat-stream.entry';
import { restoreThreadFromSnapshot } from '@genfeedai/agent/hooks/agent-chat-stream.restore';
import {
  bindAgentStreamTransport,
  createAgentStreamEntry,
  disposeAgentStreamEntry,
  findAgentStreamEntry,
  getAgentStreamRuntime,
  projectAgentStreamEntry,
  resetAgentStreamRuntime,
} from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import type {
  AgentStreamEntry,
  UseAgentChatStreamOptions,
  UseAgentChatStreamReturn,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useCallback, useEffect, useRef } from 'react';

export type {
  SendStreamMessageOptions,
  UseAgentChatStreamOptions,
  UseAgentChatStreamReturn,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';

function requestId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function useAgentChatStream(
  options: UseAgentChatStreamOptions,
): UseAgentChatStreamReturn {
  const { connectionState, subscribe, isReady, getSocketManager } =
    useSocketManager();
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const isStreaming = useAgentChatStore((state) => state.stream.isStreaming);
  const runtime = getAgentStreamRuntime();
  const latestOptions = useRef(options);
  latestOptions.current = options;
  const controller = useCallback((entry: AgentStreamEntry) => {
    entry.controller ??= createAgentStreamController(
      entry,
      latestOptions.current,
    );
    return entry.controller;
  }, []);

  useEffect(() => {
    runtime.mountCount += 1;
    return () => {
      if (--runtime.mountCount === 0) resetAgentStreamRuntime();
    };
  }, [runtime]);

  useEffect(() => {
    if (isReady)
      bindAgentStreamTransport(subscribe, getSocketManager?.() ?? subscribe);
  });

  useEffect(() => {
    const previous = runtime.connectionState;
    runtime.connectionState = connectionState;
    useAgentChatStore.getState().setSocketConnectionState(connectionState);
    if (
      connectionState === 'connected' &&
      previous !== 'connected' &&
      previous !== 'connecting'
    ) {
      for (const entry of runtime.entries.values())
        if (entry.terminalAt === null) entry.recover?.();
      const state = useAgentChatStore.getState();
      if (
        state.activeThreadId &&
        !state.stream.isStreaming &&
        !state.stream.pendingUiActions?.length
      ) {
        void restoreThreadFromSnapshot(state.activeThreadId, {
          apiService: latestOptions.current.apiService,
          clearCompletionWatchdog: () => {},
          clearPendingCompletionIfThread: () => {},
          clearPendingInputRequest: state.clearPendingInputRequest,
          markStreamLive: state.markStreamLive,
          resetStreamState: state.resetStreamState,
          setActiveRun: state.setActiveRun,
          setError: state.setError,
          setLatestProposedPlan: state.setLatestProposedPlan,
          setMessages: state.setMessages,
          setPendingInputRequest: state.setPendingInputRequest,
          setRunStartedAt: state.setRunStartedAt,
          setWorkEvents: state.setWorkEvents,
          updateThreadSummary: state.updateThread,
        }).catch(() => undefined);
      }
    }
  }, [connectionState, runtime]);

  useEffect(() => {
    if (!isReady || !activeThreadId) return;
    let entry = findAgentStreamEntry(activeThreadId);
    if (!entry && isStreaming) {
      entry = createAgentStreamEntry(activeThreadId, requestId());
      controller(entry);
    }
    if (entry) projectAgentStreamEntry(entry);
  }, [activeThreadId, controller, isReady, isStreaming]);

  return {
    isStreaming,
    sendMessage: async (content, sendOptions) => {
      if (sendOptions?.signal?.aborted) return;
      const threadId = sendOptions?.forceNewThread
        ? null
        : useAgentChatStore.getState().activeThreadId;
      const entry = createAgentStreamEntry(
        threadId,
        sendOptions?.clientRequestId ?? requestId(),
      );
      await controller(entry).sendMessage(content, sendOptions);
    },
    beginRunHandoff: (threadId) => {
      const entry =
        findAgentStreamEntry(threadId) ??
        createAgentStreamEntry(threadId, requestId());
      return controller(entry).beginRunHandoff(threadId);
    },
    adoptRun: (handoff, runId, startedAt) => {
      if (handoff.owner)
        controller(handoff.owner).adoptRun(handoff, runId, startedAt);
    },
    cancelRunHandoff: (handoff, failedRequest) => {
      if (handoff.owner)
        controller(handoff.owner).cancelRunHandoff(handoff, failedRequest);
    },
    clearChat: () => {
      const entry = findAgentStreamEntry(
        useAgentChatStore.getState().activeThreadId,
      );
      if (entry) {
        controller(entry).clearChat();
        disposeAgentStreamEntry(entry);
      } else useAgentChatStore.getState().clearMessages();
    },
  };
}
