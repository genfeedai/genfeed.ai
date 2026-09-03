import type { BufferedThreadEvent } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type {
  AgentChatMessage,
  AgentInputRequest,
  AgentInputRequestPayload,
  AgentInputResolvedPayload,
  AgentStreamDonePayload,
  AgentStreamErrorPayload,
  AgentStreamReasoningPayload,
  AgentStreamStartPayload,
  AgentStreamTokenPayload,
  AgentStreamToolCompletePayload,
  AgentStreamToolStartPayload,
  AgentStreamUIBlocksPayload,
  AgentThread,
  AgentToolCall,
  AgentUiAction,
  AgentWorkEvent,
  AgentWorkEventPayload,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { MappedSnapshotRunStatus } from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import { applyDashboardOperation } from '@genfeedai/agent/utils/apply-dashboard-operation';
import { extractLastGeneratedAssetFromMetadata } from '@genfeedai/agent/utils/extract-last-generated-asset.util';
import { mapToolCallResponse } from '@genfeedai/agent/utils/map-tool-call-response';
import type { MutableRefObject } from 'react';

export type StreamSubscriptionDeps = {
  activeStreamThreadRef: MutableRefObject<string | null>;
  addActiveToolCall: (toolCall: AgentToolCall) => void;
  addPendingUiActions: (actions: AgentUiAction[]) => void;
  addWorkEvent: (event: AgentWorkEvent) => void;
  appendStreamToken: (token: string) => void;
  bufferedEventsRef: MutableRefObject<BufferedThreadEvent[]>;
  cleanupSubscriptions: () => void;
  clearCompletionWatchdog: () => void;
  clearPendingInputRequest: () => void;
  completeOnboardingIfNeeded: (
    toolCalls: AgentStreamDonePayload['toolCalls'],
  ) => void | Promise<void>;
  finalizeStream: (message: AgentChatMessage) => void;
  isThreadVisible: (threadId: string) => boolean;
  markThreadRunning: (
    threadId: string,
    patch?: Partial<
      Pick<
        AgentThread,
        'attentionState' | 'lastActivityAt' | 'pendingInputCount' | 'runStatus'
      >
    >,
  ) => void;
  pendingCompletionRef: MutableRefObject<{ threadId: string } | null>;
  resetStreamState: () => void;
  setActiveRun: (
    runId: string | null,
    options?: {
      startedAt?: string | null;
      status?: MappedSnapshotRunStatus;
    },
  ) => void;
  setActiveRunStatus: (status: MappedSnapshotRunStatus) => void;
  setCreditsRemaining: (credits: number) => void;
  setError: (error: string | null) => void;
  setPendingInputRequest: (request: AgentInputRequest | null) => void;
  setRunStartedAt: (startedAt: string | null) => void;
  setStreamingReasoning: (content: string) => void;
  subscribe: <T>(event: string, handler: (payload: T) => void) => () => void;
  touchCompletionWatchdog: () => void;
  updateActiveToolCall: (
    toolCallId: string,
    patch: Record<string, unknown>,
  ) => void;
  updateThreadSummary: (threadId: string, patch: Partial<AgentThread>) => void;
};

/**
 * Register all agent stream socket listeners for one send/turn.
 * Returns unsubscribe functions to push onto the caller's unsubscribers list.
 */
export function attachAgentStreamSubscriptions(
  deps: StreamSubscriptionDeps,
): Array<() => void> {
  const filterByThread =
    (handler: (data: unknown) => void) => (data: unknown) => {
      const payload = data as { threadId?: string };

      if (!deps.activeStreamThreadRef.current) {
        deps.bufferedEventsRef.current.push({
          data,
          handler,
          threadId: payload.threadId,
        });
        return;
      }

      if (payload.threadId === deps.activeStreamThreadRef.current) {
        handler(data);
      }
    };

  const unsubscribers: Array<() => void> = [];

  unsubscribers.push(
    deps.subscribe<AgentStreamStartPayload>(
      'agent:stream_start',
      filterByThread((data) => {
        const payload = data as AgentStreamStartPayload;
        deps.touchCompletionWatchdog();
        deps.markThreadRunning(payload.threadId, {
          lastActivityAt: payload.startedAt ?? new Date().toISOString(),
        });

        if (payload.runId && deps.isThreadVisible(payload.threadId)) {
          deps.setActiveRun(payload.runId, {
            startedAt: payload.startedAt ?? null,
            status: 'running',
          });
        }

        if (payload.startedAt && deps.isThreadVisible(payload.threadId)) {
          deps.setRunStartedAt(payload.startedAt);
        }
      }),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentStreamTokenPayload>(
      'agent:token',
      filterByThread((data) => {
        const payload = data as AgentStreamTokenPayload;
        deps.touchCompletionWatchdog();
        deps.markThreadRunning(payload.threadId);
        if (deps.isThreadVisible(payload.threadId)) {
          deps.appendStreamToken(payload.token);
        }
      }),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentStreamReasoningPayload>(
      'agent:reasoning',
      filterByThread((data) => {
        const payload = data as AgentStreamReasoningPayload;
        deps.touchCompletionWatchdog();
        deps.markThreadRunning(payload.threadId);
        if (deps.isThreadVisible(payload.threadId)) {
          deps.setStreamingReasoning(payload.content);
        }
      }),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentStreamToolStartPayload>(
      'agent:tool_start',
      filterByThread((data) => {
        const payload = data as AgentStreamToolStartPayload;
        deps.touchCompletionWatchdog();
        deps.markThreadRunning(payload.threadId);
        if (deps.isThreadVisible(payload.threadId)) {
          deps.addActiveToolCall({
            arguments: payload.parameters,
            detail: payload.detail,
            id: payload.toolCallId,
            label: payload.label,
            name: payload.toolName,
            parameters: payload.parameters,
            phase: payload.phase,
            progress: payload.progress,
            startedAt: payload.startedAt ?? payload.timestamp,
            status: 'running',
          });
        }
      }),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentStreamToolCompletePayload>(
      'agent:tool_complete',
      filterByThread((data) => {
        const payload = data as AgentStreamToolCompletePayload;
        deps.touchCompletionWatchdog();
        deps.markThreadRunning(payload.threadId);
        if (deps.isThreadVisible(payload.threadId)) {
          deps.updateActiveToolCall(payload.toolCallId, {
            debug: payload.debug,
            detail: payload.detail,
            error: payload.error,
            estimatedDurationMs: payload.estimatedDurationMs,
            label: payload.label,
            phase: payload.phase,
            progress: payload.progress,
            remainingDurationMs: payload.remainingDurationMs,
            resultSummary: payload.resultSummary,
            status: payload.status,
          });
          if (payload.uiActions?.length) {
            deps.addPendingUiActions(payload.uiActions);
          }
        }
      }),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentStreamDonePayload>(
      'agent:done',
      filterByThread((data) => {
        const payload = data as AgentStreamDonePayload;

        deps.pendingCompletionRef.current = null;
        deps.clearCompletionWatchdog();

        const assistantMessage: AgentChatMessage = {
          content: payload.fullContent,
          createdAt: new Date().toISOString(),
          id: `assistant-${Date.now()}`,
          metadata: {
            ...payload.metadata,
            toolCalls: payload.toolCalls.map(mapToolCallResponse),
          },
          role: 'assistant',
          threadId: payload.threadId,
        };

        const lastGeneratedAsset = extractLastGeneratedAssetFromMetadata(
          payload.metadata,
        );
        deps.updateThreadSummary(payload.threadId, {
          attentionState: deps.isThreadVisible(payload.threadId)
            ? null
            : 'updated',
          lastActivityAt: assistantMessage.createdAt,
          lastAssistantPreview: payload.fullContent.slice(0, 280),
          ...(lastGeneratedAsset
            ? { lastGeneratedAssetUrl: lastGeneratedAsset.url }
            : {}),
          pendingInputCount: 0,
          runStatus: 'completed',
          // A first-run generated title lands with the same event that ends
          // the stream — no refetch needed for the sidebar to rename.
          ...(payload.threadTitle?.trim()
            ? { title: payload.threadTitle.trim() }
            : {}),
        });
        if (deps.isThreadVisible(payload.threadId)) {
          deps.setError(null);
          deps.finalizeStream(assistantMessage);
          deps.setActiveRun(payload.runId ?? null, {
            startedAt: payload.startedAt ?? null,
            status: 'completed',
          });
          deps.setCreditsRemaining(payload.creditsRemaining);
          deps.clearPendingInputRequest();
        }
        deps.cleanupSubscriptions();

        Promise.resolve(
          deps.completeOnboardingIfNeeded(payload.toolCalls),
        ).catch(() => {
          // Intentionally swallowed — onboarding completion is fire-and-forget
        });
      }),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentStreamErrorPayload>(
      'agent:error',
      filterByThread((data) => {
        const payload = data as AgentStreamErrorPayload;

        deps.pendingCompletionRef.current = null;
        deps.clearCompletionWatchdog();
        const nextStatus =
          payload.error === 'Agent run cancelled' ? 'cancelled' : 'failed';
        deps.updateThreadSummary(payload.threadId, {
          attentionState: deps.isThreadVisible(payload.threadId)
            ? null
            : 'updated',
          lastActivityAt: new Date().toISOString(),
          pendingInputCount: 0,
          runStatus: nextStatus,
        });
        if (deps.isThreadVisible(payload.threadId)) {
          deps.setError(payload.error);
          deps.setActiveRunStatus(nextStatus);
          deps.resetStreamState();
        }
        deps.cleanupSubscriptions();
      }),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentStreamUIBlocksPayload>(
      'agent:ui_blocks',
      filterByThread((data) => {
        const payload = data as AgentStreamUIBlocksPayload;
        deps.touchCompletionWatchdog();
        deps.markThreadRunning(payload.threadId);
        if (deps.isThreadVisible(payload.threadId)) {
          applyDashboardOperation(
            payload.operation,
            payload.blocks,
            payload.blockIds,
          );
        }
      }),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentWorkEventPayload>(
      'agent:work_event',
      filterByThread((data) => {
        const payload = data as AgentWorkEventPayload;
        deps.touchCompletionWatchdog();
        deps.markThreadRunning(payload.threadId, {
          lastActivityAt: payload.timestamp,
        });
        if (deps.isThreadVisible(payload.threadId)) {
          // Stable id so tool_started → tool_progress → tool_completed update
          // one row. Prefixing with the event name left "running" rows stuck at
          // the start progress forever while completed twins accumulated.
          const stableId =
            payload.toolCallId ??
            payload.inputRequestId ??
            `${payload.event}-${payload.timestamp}`;
          deps.addWorkEvent({
            createdAt: payload.timestamp,
            debug: payload.debug,
            detail: payload.detail,
            estimatedDurationMs: payload.estimatedDurationMs,
            event: payload.event,
            id: stableId,
            inputRequestId: payload.inputRequestId,
            label: payload.label,
            parameters: payload.parameters,
            phase: payload.phase,
            progress: payload.progress,
            remainingDurationMs: payload.remainingDurationMs,
            resultSummary: payload.resultSummary,
            runId: payload.runId,
            startedAt: payload.startedAt,
            status: payload.status,
            threadId: payload.threadId,
            toolCallId: payload.toolCallId,
            toolName: payload.toolName,
          });
        }
      }),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentInputRequestPayload>(
      'agent:input_request',
      filterByThread((data) => {
        const payload = data as AgentInputRequestPayload;
        deps.touchCompletionWatchdog();
        deps.updateThreadSummary(payload.threadId, {
          attentionState: 'needs-input',
          lastActivityAt: payload.timestamp,
          pendingInputCount: 1,
          runStatus: 'waiting_input',
        });
        if (deps.isThreadVisible(payload.threadId)) {
          deps.setPendingInputRequest({
            allowFreeText: payload.allowFreeText,
            fieldId: payload.fieldId,
            inputRequestId: payload.inputRequestId,
            metadata: payload.metadata,
            options: payload.options,
            prompt: payload.prompt,
            recommendedOptionId: payload.recommendedOptionId,
            runId: payload.runId,
            threadId: payload.threadId,
            title: payload.title,
          });
          deps.addWorkEvent({
            createdAt: payload.timestamp,
            detail: payload.prompt,
            event: AgentWorkEventType.INPUT_REQUESTED,
            id: `input-request-${payload.inputRequestId}`,
            inputRequestId: payload.inputRequestId,
            label: payload.title,
            runId: payload.runId,
            status: AgentWorkEventStatus.PENDING,
            threadId: payload.threadId,
          });
        }
      }),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentInputResolvedPayload>(
      'agent:input_resolved',
      filterByThread((data) => {
        const payload = data as AgentInputResolvedPayload;
        deps.touchCompletionWatchdog();
        deps.markThreadRunning(payload.threadId, {
          lastActivityAt: payload.timestamp,
          pendingInputCount: 0,
          runStatus: 'running',
        });
        if (deps.isThreadVisible(payload.threadId)) {
          deps.clearPendingInputRequest();
          deps.addWorkEvent({
            createdAt: payload.timestamp,
            detail: payload.answer,
            event: AgentWorkEventType.INPUT_SUBMITTED,
            id: `input-resolved-${payload.inputRequestId}`,
            inputRequestId: payload.inputRequestId,
            label: 'User input submitted',
            runId: payload.runId,
            status: AgentWorkEventStatus.COMPLETED,
            threadId: payload.threadId,
          });
        }
      }),
    ),
  );

  return unsubscribers;
}
