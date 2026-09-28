import {
  findRecoveredAssistantMessage,
  readRecordedRunFailure,
} from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
import {
  type PendingStreamCompletion,
  STREAM_COMPLETION_GRACE_PERIOD_MS,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type {
  AgentChatMessage,
  AgentThread,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { MappedSnapshotRunStatus } from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import { extractLastGeneratedAssetFromMetadata } from '@genfeedai/agent/utils/extract-last-generated-asset.util';
import { serializeAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';

export type ResolveStreamFromMessagesDeps = {
  apiService: AgentApiService;
  cleanupSubscriptions: () => void;
  clearCompletionWatchdog: () => void;
  clearPendingInputRequest: () => void;
  clearPendingCompletion: (pending: PendingStreamCompletion) => void;
  /**
   * Whether `pending` is still the completion the stream tracks. A newer send,
   * handoff, or adoption replaces it, and a recovery started for the old one
   * must not complete or tear down the run that replaced it.
   */
  isCurrentPending: (pending: PendingStreamCompletion) => boolean;
  isThreadVisible: (threadId: string) => boolean;
  resetStreamState: () => void;
  scheduleCompletionWatchdog: () => void;
  setActiveRun: (
    runId: string | null,
    meta?: {
      startedAt?: string | null;
      status?: MappedSnapshotRunStatus;
    },
  ) => void;
  setActiveRunStatus: (status: MappedSnapshotRunStatus) => void;
  setError: (error: string | null) => void;
  setMessages: (
    messages: import('@genfeedai/agent/models/agent-chat.model').AgentChatMessage[],
  ) => void;
  /** Settle the ui-action state of the run this recovery resolved. */
  settleUiActionRun?: (
    threadId: string,
    runId: string,
    outcome: { error?: string; status: 'completed' | 'failed' },
  ) => void;
  updateThreadSummary: (threadId: string, patch: Partial<AgentThread>) => void;
  /**
   * Adopt the thread scope a recovered reply was written under (a brand
   * confirmation moves it), when it is newer than the one the client has.
   */
  adoptThreadScope?: (
    threadId: string,
    scope: { brandId: string | null; contextVersion: number },
  ) => void;
};

function readReplyScope(
  metadata: AgentChatMessage['metadata'],
): { brandId: string | null; contextVersion: number } | null {
  const scope = metadata?.agentScope;
  if (typeof scope?.contextVersion !== 'number') {
    return null;
  }
  return {
    brandId: typeof scope.brandId === 'string' ? scope.brandId : null,
    contextVersion: scope.contextVersion,
  };
}

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
  let settled = false;

  try {
    const messages = await deps.apiService.getMessages(pending.threadId, {
      limit: 100,
    });
    if (!deps.isCurrentPending(pending)) {
      return;
    }

    const recoveredAssistantMessage = findRecoveredAssistantMessage(
      messages,
      pending.preAssistantIds,
      pending.runId,
      {
        notBefore: pending.startedAt,
        requireRunId: pending.requireRunId === true,
      },
    );

    // A ui-action run can complete without a reply of its own (an idempotent
    // replay of an earlier confirmation): its execution is the evidence.
    const completedExecution =
      !recoveredAssistantMessage &&
      pending.requireRunId &&
      pending.runId &&
      hasExceededGracePeriod
        ? await deps.apiService.getWorkflowExecution(pending.runId)
        : null;
    if (!deps.isCurrentPending(pending)) {
      return;
    }
    const isCompletedWithoutReply =
      completedExecution?.status === WorkflowExecutionStatus.COMPLETED;

    if (!recoveredAssistantMessage && !isCompletedWithoutReply) {
      if (!hasExceededGracePeriod) {
        deps.scheduleCompletionWatchdog();
        return;
      }

      const persistedExecution = pending.runId
        ? (completedExecution ??
          (await deps.apiService.getWorkflowExecution(pending.runId)))
        : null;
      if (!deps.isCurrentPending(pending)) {
        return;
      }
      if (
        persistedExecution?.status === WorkflowExecutionStatus.PENDING ||
        persistedExecution?.status === WorkflowExecutionStatus.RUNNING
      ) {
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

    settled = true;
    // A run that failed without throwing still persisted its reply; the
    // reply records the failure, so recovery settles it the same way the
    // live `agent:done` would.
    const failure = readRecordedRunFailure(recoveredAssistantMessage?.metadata);
    if (pending.runId) {
      deps.settleUiActionRun?.(
        pending.threadId,
        pending.runId,
        failure
          ? { error: failure, status: 'failed' }
          : { status: 'completed' },
      );
    }
    if (deps.isThreadVisible(pending.threadId)) {
      deps.resetStreamState();
      deps.setMessages(messages);
    }
    const lastGeneratedAsset = extractLastGeneratedAssetFromMetadata(
      recoveredAssistantMessage?.metadata,
    );
    deps.updateThreadSummary(pending.threadId, {
      attentionState: deps.isThreadVisible(pending.threadId) ? null : 'updated',
      lastActivityAt:
        recoveredAssistantMessage?.createdAt ?? new Date().toISOString(),
      ...(recoveredAssistantMessage
        ? {
            lastAssistantPreview: recoveredAssistantMessage.content.slice(
              0,
              280,
            ),
          }
        : {}),
      ...(lastGeneratedAsset
        ? { lastGeneratedAssetUrl: lastGeneratedAsset.url }
        : {}),
      pendingInputCount: 0,
      runStatus: failure ? 'failed' : 'completed',
    });
    const replyScope = readReplyScope(recoveredAssistantMessage?.metadata);
    if (replyScope) {
      deps.adoptThreadScope?.(pending.threadId, replyScope);
    }
    if (deps.isThreadVisible(pending.threadId)) {
      deps.setError(failure);
      deps.clearPendingInputRequest();
      deps.setActiveRun(pending.runId, {
        startedAt: pending.startedAt,
        status: failure ? 'failed' : 'completed',
      });
    }
  } catch (error) {
    if (!deps.isCurrentPending(pending)) {
      return;
    }
    if (!hasExceededGracePeriod) {
      deps.scheduleCompletionWatchdog();
      return;
    }

    settled = true;
    const failure =
      error instanceof Error
        ? error.message
        : 'Agent run did not finish before the recovery timeout.';
    if (pending.runId) {
      deps.settleUiActionRun?.(pending.threadId, pending.runId, {
        error: failure,
        status: 'failed',
      });
    }
    deps.updateThreadSummary(pending.threadId, {
      attentionState: deps.isThreadVisible(pending.threadId) ? null : 'updated',
      lastActivityAt: new Date().toISOString(),
      runStatus: 'failed',
    });
    if (deps.isThreadVisible(pending.threadId)) {
      deps.setError(
        serializeAgentError({
          detail: failure,
          message: 'Agent run recovery timed out',
          source: 'stream_recovery',
          status: 408,
        }),
      );
      deps.setActiveRunStatus('failed');
      deps.resetStreamState();
    }
  } finally {
    if (deps.isCurrentPending(pending) && settled) {
      deps.clearPendingCompletion(pending);
      deps.clearCompletionWatchdog();
      deps.cleanupSubscriptions();
    }
  }
}
