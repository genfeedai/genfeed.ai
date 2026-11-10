import { isCurrentAgentStreamEntry } from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import type { AgentStreamEntry } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';

export type AgentStreamRunningThreadPatch = Partial<
  Pick<
    AgentThread,
    'attentionState' | 'lastActivityAt' | 'pendingInputCount' | 'runStatus'
  >
>;

/**
 * Patches the sidebar summary of a thread the stream owns. A run that ends
 * on a thread the user is not looking at marks it updated, and the cached
 * conversation is dropped so the next open reloads it.
 */
export function updateAgentStreamThreadSummary(
  entry: AgentStreamEntry,
  threadId: string,
  patch: Partial<AgentThread>,
): void {
  const existingThread = useAgentChatStore
    .getState()
    .threads.find((thread) => thread.id === threadId);

  if (!isCurrentAgentStreamEntry(entry) || !existingThread) {
    return;
  }

  const actualVisible =
    useAgentChatStore.getState().activeThreadId === threadId;
  useAgentChatStore.getState().updateThread(threadId, {
    ...patch,
    ...(patch.runStatus === 'completed' ||
    patch.runStatus === 'failed' ||
    patch.runStatus === 'cancelled'
      ? { attentionState: actualVisible ? null : 'updated' }
      : {}),
  });
  useAgentChatStore.setState((state) => {
    if (!(threadId in state.conversationCacheByThread)) {
      return state;
    }
    const cache = { ...state.conversationCacheByThread };
    delete cache[threadId];
    return { conversationCacheByThread: cache };
  });
}

export function markAgentStreamThreadRunning(
  entry: AgentStreamEntry,
  threadId: string,
  patch?: AgentStreamRunningThreadPatch,
): void {
  updateAgentStreamThreadSummary(entry, threadId, {
    attentionState: 'running',
    lastActivityAt: patch?.lastActivityAt ?? new Date().toISOString(),
    pendingInputCount: patch?.pendingInputCount ?? 0,
    runStatus: patch?.runStatus ?? 'running',
  });
}
