import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  buildThreadSummaryFromSnapshot,
  mapSnapshotPendingInputRequest,
  mapSnapshotRunStatus,
  mapSnapshotWorkEvents,
  readSnapshotRunError,
} from '@genfeedai/agent/utils/agent-thread-snapshot.util';

export type RestoreThreadFromSnapshotDeps = {
  apiService: AgentApiService;
  clearCompletionWatchdog: () => void;
  clearPendingCompletionIfThread: (threadId: string) => void;
  clearPendingInputRequest: () => void;
  resetStreamState: () => void;
  setActiveRun: (
    runId: string | null,
    meta?: {
      startedAt?: string | null;
      status?:
        | 'cancelled'
        | 'cancelling'
        | 'completed'
        | 'failed'
        | 'idle'
        | 'running';
    },
  ) => void;
  setError: (error: string | null) => void;
  setLatestProposedPlan: (
    plan:
      | import('@genfeedai/agent/models/agent-chat.model').AgentProposedPlan
      | null,
  ) => void;
  setMessages: (
    messages: import('@genfeedai/agent/models/agent-chat.model').AgentChatMessage[],
  ) => void;
  setPendingInputRequest: (
    request:
      | import('@genfeedai/agent/models/agent-chat.model').AgentInputRequest
      | null,
  ) => void;
  setRunStartedAt: (startedAt: string | null) => void;
  setWorkEvents: (
    events: import('@genfeedai/agent/models/agent-chat.model').AgentWorkEvent[],
  ) => void;
  updateThreadSummary: (threadId: string, patch: Partial<AgentThread>) => void;
};

/** Rehydrate visible thread state after reconnect or explicit restore. */
export async function restoreThreadFromSnapshot(
  threadId: string,
  deps: RestoreThreadFromSnapshotDeps,
): Promise<void> {
  const [snapshot, messages] = await Promise.all([
    deps.apiService.getThreadSnapshot(threadId),
    deps.apiService.getMessages(threadId, { limit: 100 }),
  ]);

  const state = useAgentChatStore.getState();
  const existingThread = state.threads.find((thread) => thread.id === threadId);
  const isVisible = state.activeThreadId === threadId;

  deps.updateThreadSummary(threadId, {
    ...buildThreadSummaryFromSnapshot(snapshot, {
      existingThread,
      isVisible,
    }),
  });

  if (!snapshot.activeRun) {
    deps.clearPendingCompletionIfThread(threadId);
  }

  if (!isVisible) {
    return;
  }

  const pendingInputRequest = mapSnapshotPendingInputRequest(snapshot);

  deps.setMessages(messages);
  deps.setLatestProposedPlan(snapshot.latestProposedPlan ?? null);
  deps.setPendingInputRequest(pendingInputRequest);
  deps.setWorkEvents(mapSnapshotWorkEvents(snapshot));
  deps.setActiveRun(snapshot.activeRun?.runId ?? null, {
    startedAt: snapshot.activeRun?.startedAt ?? null,
    status: mapSnapshotRunStatus(snapshot.activeRun?.status),
  });
  deps.setRunStartedAt(snapshot.activeRun?.startedAt ?? null);

  if (!snapshot.activeRun && !pendingInputRequest) {
    deps.resetStreamState();
    deps.clearPendingInputRequest();
  }

  deps.setError(readSnapshotRunError(snapshot));
}
