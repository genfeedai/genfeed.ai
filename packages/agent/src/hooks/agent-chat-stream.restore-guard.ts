import { getAgentStreamRuntime } from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import {
  selectActiveRun,
  useAgentChatStore,
} from '@genfeedai/agent/stores/agent-chat.store';

/** An async restore may apply only while its captured local state still owns it. */
export function captureAgentRunRestore(
  threadId: string,
): (restoredRunId: string | null) => boolean {
  const runtime = getAgentStreamRuntime();
  const generation = runtime.ownerGeneration;
  const initialState = useAgentChatStore.getState();
  const initialVisibleThreadId = initialState.activeThreadId;
  const initialRun = selectActiveRun(initialState);
  const initialThread = initialState.threads.find(
    (thread) => thread.id === threadId,
  );

  return (restoredRunId) => {
    const state = useAgentChatStore.getState();
    const run = selectActiveRun(state);
    const isVisible = state.activeThreadId === threadId;
    if (
      runtime.ownerGeneration !== generation ||
      state.activeThreadId !== initialVisibleThreadId ||
      state.threads.find((thread) => thread.id === threadId) !==
        initialThread ||
      (isVisible &&
        (run.runId !== initialRun.runId || run.status !== initialRun.status))
    ) {
      return false;
    }

    const isSettledOrStopping =
      run.status === 'completed' ||
      run.status === 'failed' ||
      run.status === 'cancelled' ||
      run.status === 'awaiting_input' ||
      run.status === 'cancelling';
    return !(isVisible && run.runId === restoredRunId && isSettledOrStopping);
  };
}
