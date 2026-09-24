import { getAgentStreamRuntime } from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';

/** An async restore may apply only while its captured local state still owns it. */
export function captureAgentRunRestore(
  threadId: string,
): (restoredRunId: string | null) => boolean {
  const runtime = getAgentStreamRuntime();
  const generation = runtime.ownerGeneration;
  const initialState = useAgentChatStore.getState();
  const initialVisibleThreadId = initialState.activeThreadId;
  const initialRunId = initialState.activeRunId;
  const initialRunStatus = initialState.activeRunStatus;
  const initialThread = initialState.threads.find(
    (thread) => thread.id === threadId,
  );

  return (restoredRunId) => {
    const state = useAgentChatStore.getState();
    const isVisible = state.activeThreadId === threadId;
    if (
      runtime.ownerGeneration !== generation ||
      state.activeThreadId !== initialVisibleThreadId ||
      state.threads.find((thread) => thread.id === threadId) !==
        initialThread ||
      (isVisible &&
        (state.activeRunId !== initialRunId ||
          state.activeRunStatus !== initialRunStatus))
    ) {
      return false;
    }

    const isSettledOrStopping =
      state.activeRunStatus === 'completed' ||
      state.activeRunStatus === 'failed' ||
      state.activeRunStatus === 'cancelled' ||
      state.activeRunStatus === 'awaiting_input' ||
      state.activeRunStatus === 'cancelling';
    return !(
      isVisible &&
      state.activeRunId === restoredRunId &&
      isSettledOrStopping
    );
  };
}
