import { captureAgentRunRestore } from '@genfeedai/agent/hooks/agent-chat-stream.restore-guard';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { selectActiveRun } from '@genfeedai/agent/stores/agent-chat.store.run';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { useEffect } from 'react';

/**
 * Restores the active workflow execution when the user returns to a thread.
 */
export function useRestoreActiveRun(
  apiService: AgentApiService,
  activeThreadId: string | null,
  activeRunId: string | null,
): void {
  const clearStaleActiveRun = useAgentChatStore((s) => s.clearStaleActiveRun);
  const markStreamLive = useAgentChatStore((s) => s.markStreamLive);
  const setActiveRun = useAgentChatStore((s) => s.setActiveRun);

  // use-effect-audit: ignore restores the running workflow from the API and aborts the request on cleanup
  useEffect(() => {
    if (!activeThreadId) return;
    const controller = new AbortController();
    const restoredRunId = activeRunId;
    const canRestore = captureAgentRunRestore(activeThreadId);

    apiService
      .getActiveWorkflowExecutions(controller.signal, {
        threadId: activeThreadId,
        executionId: restoredRunId ?? undefined,
      })
      .then((executions) => {
        if (controller.signal.aborted) {
          return;
        }

        const matchingExecution = executions.find(
          (execution) => execution.metadata?.threadId === activeThreadId,
        );

        if (!canRestore(matchingExecution?.id ?? null)) {
          return;
        }

        if (!matchingExecution) {
          const state = useAgentChatStore.getState();
          if (
            restoredRunId &&
            state.activeThreadId === activeThreadId &&
            selectActiveRun(state).runId === restoredRunId
          ) {
            clearStaleActiveRun();
          }
          return;
        }

        const isExecutionLive =
          matchingExecution.status === WorkflowExecutionStatus.RUNNING ||
          matchingExecution.status === WorkflowExecutionStatus.PENDING;
        setActiveRun(matchingExecution.id, {
          startedAt: matchingExecution.startedAt ?? null,
          status: isExecutionLive ? 'running' : 'idle',
        });
        // Without a live stream the transcript renders nothing while Stop and
        // WORKING are on, and no listener is attached to hear the run finish.
        if (isExecutionLive) {
          markStreamLive();
        } else if (matchingExecution.id === restoredRunId) {
          // The run this thread was restoring has ended. The sidebar trusts the
          // thread summary, which the local `idle` above does not touch.
          const thread = useAgentChatStore
            .getState()
            .threads.find((item) => item.id === activeThreadId);
          if (
            thread?.runStatus === 'queued' ||
            thread?.runStatus === 'running'
          ) {
            useAgentChatStore.getState().updateThread(activeThreadId, {
              attentionState: null,
              runStatus: 'idle',
            });
          }
        }
      })
      .catch(() => {
        /* ignore restore failures */
      });

    return () => controller.abort();
  }, [
    activeRunId,
    activeThreadId,
    apiService,
    clearStaleActiveRun,
    markStreamLive,
    setActiveRun,
  ]);
}
