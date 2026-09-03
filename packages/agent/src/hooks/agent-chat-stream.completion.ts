import { findRecoveredAssistantMessage } from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
import {
  type PendingStreamCompletion,
  STREAM_COMPLETION_GRACE_PERIOD_MS,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { extractLastGeneratedAssetFromMetadata } from '@genfeedai/agent/utils/extract-last-generated-asset.util';
import { serializeAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';

export type ResolveStreamFromMessagesDeps = {
  apiService: AgentApiService;
  cleanupSubscriptions: () => void;
  clearCompletionWatchdog: () => void;
  clearPendingInputRequest: () => void;
  clearPendingCompletion: (threadId: string) => void;
  isCurrentPendingThread: (threadId: string) => boolean;
  isThreadVisible: (threadId: string) => boolean;
  resetStreamState: () => void;
  scheduleCompletionWatchdog: () => void;
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
  setActiveRunStatus: (
    status:
      | 'cancelled'
      | 'cancelling'
      | 'completed'
      | 'failed'
      | 'idle'
      | 'running',
  ) => void;
  setError: (error: string | null) => void;
  setMessages: (
    messages: import('@genfeedai/agent/models/agent-chat.model').AgentChatMessage[],
  ) => void;
  updateThreadSummary: (threadId: string, patch: Partial<AgentThread>) => void;
};

/**
 * Recovery path when the stream socket dies mid-run: poll messages until a
 * new assistant reply appears or the grace period expires.
 */
export async function resolveStreamFromMessages(
  pending: PendingStreamCompletion,
  deps: ResolveStreamFromMessagesDeps,
): Promise<void> {
  const hasExceededGracePeriod =
    Date.now() - pending.initiatedAt >= STREAM_COMPLETION_GRACE_PERIOD_MS;
  let shouldKeepWaiting = false;

  try {
    const messages = await deps.apiService.getMessages(pending.threadId, {
      limit: 100,
    });

    const recoveredAssistantMessage = findRecoveredAssistantMessage(
      messages,
      pending.preAssistantIds,
    );

    if (!recoveredAssistantMessage) {
      if (!hasExceededGracePeriod) {
        deps.scheduleCompletionWatchdog();
        return;
      }

      const persistedExecution = pending.runId
        ? await deps.apiService.getWorkflowExecution(pending.runId)
        : null;
      if (
        persistedExecution?.status === WorkflowExecutionStatus.PENDING ||
        persistedExecution?.status === WorkflowExecutionStatus.RUNNING
      ) {
        shouldKeepWaiting = true;
        deps.updateThreadSummary(pending.threadId, {
          runStatus:
            persistedExecution.status === WorkflowExecutionStatus.PENDING
              ? 'queued'
              : 'running',
        });
        deps.scheduleCompletionWatchdog();
        return;
      }

      throw new Error(
        persistedExecution?.error ||
          'Agent run did not finish before the recovery timeout.',
      );
    }

    deps.resetStreamState();
    deps.setMessages(messages);
    const lastGeneratedAsset = extractLastGeneratedAssetFromMetadata(
      recoveredAssistantMessage.metadata,
    );
    deps.updateThreadSummary(pending.threadId, {
      attentionState: deps.isThreadVisible(pending.threadId) ? null : 'updated',
      lastActivityAt:
        recoveredAssistantMessage.createdAt ?? new Date().toISOString(),
      lastAssistantPreview: recoveredAssistantMessage.content.slice(0, 280),
      ...(lastGeneratedAsset
        ? { lastGeneratedAssetUrl: lastGeneratedAsset.url }
        : {}),
      pendingInputCount: 0,
      runStatus: 'completed',
    });
    if (deps.isThreadVisible(pending.threadId)) {
      deps.setError(null);
      deps.clearPendingInputRequest();
      deps.setActiveRun(pending.runId, {
        startedAt: pending.startedAt,
        status: 'completed',
      });
    }
  } catch (error) {
    if (!hasExceededGracePeriod) {
      deps.scheduleCompletionWatchdog();
      return;
    }

    deps.updateThreadSummary(pending.threadId, {
      attentionState: deps.isThreadVisible(pending.threadId) ? null : 'updated',
      lastActivityAt: new Date().toISOString(),
      runStatus: 'failed',
    });
    if (deps.isThreadVisible(pending.threadId)) {
      deps.setError(
        serializeAgentError({
          detail:
            error instanceof Error
              ? error.message
              : 'Agent run did not finish before the recovery timeout.',
          message: 'Agent run recovery timed out',
          source: 'stream_recovery',
          status: 408,
        }),
      );
      deps.setActiveRunStatus('failed');
      deps.resetStreamState();
    }
  } finally {
    if (
      deps.isCurrentPendingThread(pending.threadId) &&
      hasExceededGracePeriod &&
      !shouldKeepWaiting
    ) {
      deps.clearPendingCompletion(pending.threadId);
      deps.clearCompletionWatchdog();
      deps.cleanupSubscriptions();
    }
  }
}
