import {
  isForeignRunEvent,
  readRecordedRunFailure,
  takeSourceActionUpdate,
} from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
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
  /**
   * Whether a settlement at `sequence` is newer than what the thread already
   * reflects (see the store's `acceptThreadEventSequence`).
   */
  acceptThreadEventSequence: (threadId: string, sequence?: number) => boolean;
  activeStreamRunIdRef: MutableRefObject<string | null>;
  activeStreamThreadRef: MutableRefObject<string | null>;
  addActiveToolCall: (toolCall: AgentToolCall) => void;
  addPendingUiActions: (actions: AgentUiAction[]) => void;
  addWorkEvent: (event: AgentWorkEvent) => void;
  appendStreamToken: (token: string) => void;
  /**
   * Settle a source card in place, with its server-resolved copy if any.
   * Returns whether the card is loaded in the conversation.
   */
  applySourceActionUpdate: (
    sourceId: string,
    card: AgentUiAction | null,
  ) => boolean;
  bufferedEventsRef: MutableRefObject<BufferedThreadEvent[]>;
  /**
   * Whether a settled run's result may update its source card: the run is the
   * one the source shows (`isAgentUiActionSourceOwner`).
   */
  isUiActionSourceOwner: (
    threadId: string,
    result: { runId: string; sequence?: number; sourceId: string },
  ) => boolean;
  bufferEvent?: (event: BufferedThreadEvent) => void;
  getPendingInputRequest?: () => AgentInputRequest | null;
  getWorkEvents?: () => AgentWorkEvent[];
  isActuallyVisible?: (threadId: string) => boolean;
  cleanupSubscriptions: () => void;
  clearCompletionWatchdog: () => void;
  clearPendingInputRequest: (inputRequestId?: string) => void;
  resolvePendingInputRequest: (
    threadId: string,
    inputRequestId: string,
    timestamp: string,
  ) => boolean;
  completeOnboardingIfNeeded: (
    toolCalls: AgentStreamDonePayload['toolCalls'],
  ) => void | Promise<void>;
  finalizeStream: (message: AgentChatMessage) => void;
  isAwaitingRunIdRef: MutableRefObject<boolean>;
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
  settleUiActionRun: (
    threadId: string,
    runId: string,
    outcome: {
      error?: string;
      sequence?: number;
      status: 'completed' | 'failed' | 'cancelled';
    },
  ) => void;
  subscribe: <T>(event: string, handler: (payload: T) => void) => () => void;
  touchCompletionWatchdog: () => void;
  updateActiveToolCall: (
    toolCallId: string,
    patch: Record<string, unknown>,
  ) => void;
  updateThreadSummary: (threadId: string, patch: Partial<AgentThread>) => void;
};

function applyResultDashboardOperation(
  metadata: Record<string, unknown> | undefined,
): void {
  const uiBlocksState =
    metadata?.uiBlocks &&
    typeof metadata.uiBlocks === 'object' &&
    !Array.isArray(metadata.uiBlocks)
      ? (metadata.uiBlocks as Record<string, unknown>)
      : null;
  const operation =
    typeof metadata?.dashboardOperation === 'string'
      ? metadata.dashboardOperation
      : typeof uiBlocksState?.operation === 'string'
        ? uiBlocksState.operation
        : undefined;
  if (!operation) {
    return;
  }
  applyDashboardOperation(
    operation,
    uiBlocksState?.blocks ??
      (uiBlocksState?.components ? uiBlocksState : undefined),
    uiBlocksState?.blockIds,
  );
}

/**
 * Register all agent stream socket listeners for one send/turn.
 * Returns unsubscribe functions to push onto the caller's unsubscribers list.
 */
export function attachAgentStreamSubscriptions(
  deps: StreamSubscriptionDeps,
): Array<() => void> {
  // Events are scoped to one thread *and* one run. Until the send is
  // acknowledged the run id is unknown, so events are held and replayed (or
  // discarded as another run's) once it is — a slow earlier run on the same
  // thread must not flip Stop/WORKING back on or stream into this turn.
  const filterByThread =
    (
      handler: (data: unknown) => void,
      isInputResolution = false,
      onForeignRun?: (data: unknown) => void,
    ) =>
    (data: unknown) => {
      const payload = data as {
        runId?: string;
        threadId?: string;
        inputRequestId?: string;
      };

      if (
        !deps.activeStreamThreadRef.current ||
        deps.isAwaitingRunIdRef.current
      ) {
        const bufferedEvent: BufferedThreadEvent = {
          data,
          handler,
          resolvedInputRequestId: isInputResolution
            ? payload.inputRequestId
            : undefined,
          runId: payload.runId,
          threadId: payload.threadId,
        };
        if (deps.bufferEvent) deps.bufferEvent(bufferedEvent);
        else deps.bufferedEventsRef.current.push(bufferedEvent);
        return;
      }

      if (payload.threadId !== deps.activeStreamThreadRef.current) {
        return;
      }

      if (isForeignRunEvent(payload.runId, deps.activeStreamRunIdRef.current)) {
        onForeignRun?.(data);
        return;
      }

      handler(data);
    };

  const unsubscribers: Array<() => void> = [];
  const completedRuns = new Set<string | null>();

  // A ui-action run queued on this thread settles its card whichever run the
  // stream is following; only that followed run drives the conversation.
  function settleQueuedUiActionRun(data: unknown): void {
    const payload = data as
      | AgentStreamDonePayload
      | (AgentStreamErrorPayload & { runStatus?: undefined });
    if (!payload.runId) {
      return;
    }
    const failure =
      'fullContent' in payload
        ? payload.runStatus === 'failed'
          ? (payload.error ?? 'The action failed before it finished.')
          : readRecordedRunFailure(payload.metadata)
        : payload.error;
    deps.settleUiActionRun(payload.threadId, payload.runId, {
      ...(failure
        ? {
            error: failure,
            status:
              failure === 'Agent run cancelled'
                ? ('cancelled' as const)
                : ('failed' as const),
          }
        : { status: 'completed' as const }),
      sequence: payload.sequence,
    });
    // Its result carries the server-resolved source card (already persisted
    // on the source message): show it, wherever the card is loaded, when the
    // run is the one the source shows. An older result arriving late, or a
    // duplicate failure after a success, only records the run's outcome.
    if (
      'fullContent' in payload &&
      payload.uiAction &&
      deps.isUiActionSourceOwner(payload.threadId, {
        runId: payload.runId,
        sequence: payload.sequence,
        sourceId: payload.uiAction.sourceId,
      })
    ) {
      const { card } = takeSourceActionUpdate(
        payload.metadata?.uiActions,
        payload.uiAction.sourceId,
      );
      deps.applySourceActionUpdate(payload.uiAction.sourceId, card);
    }
  }

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
      filterByThread(
        (data) => {
          const payload = data as AgentStreamDonePayload;
          const completedRun =
            payload.runId ?? deps.activeStreamRunIdRef.current;
          if (completedRuns.has(completedRun)) return;
          completedRuns.add(completedRun);

          deps.pendingCompletionRef.current = null;
          deps.clearCompletionWatchdog();
          // A structured failure still carries its reply; the run failed.
          const failure =
            payload.runStatus === 'failed'
              ? (payload.error ?? 'The action failed before it finished.')
              : readRecordedRunFailure(payload.metadata);
          const outcome = failure
            ? { error: failure, status: 'failed' as const }
            : { status: 'completed' as const };

          // The thread's snapshot already reflects this run (a hydration read
          // it after the run's events were recorded): its reply, plan and cards
          // are in place, and applying it again would duplicate or regress them.
          if (
            !deps.acceptThreadEventSequence(payload.threadId, payload.sequence)
          ) {
            if (payload.runId) {
              deps.settleUiActionRun(payload.threadId, payload.runId, {
                ...outcome,
                sequence: payload.sequence,
              });
            }
            if (deps.isThreadVisible(payload.threadId)) deps.resetStreamState();
            deps.cleanupSubscriptions();
            return;
          }

          const pendingInput = deps.getPendingInputRequest?.();
          const retainedWork = pendingInput
            ? (deps.getWorkEvents?.() ?? [])
            : [];
          if (payload.runId) {
            deps.settleUiActionRun(payload.threadId, payload.runId, {
              ...outcome,
              sequence: payload.sequence,
            });
          }
          const sourceUpdate = payload.uiAction
            ? takeSourceActionUpdate(
                payload.metadata?.uiActions,
                payload.uiAction.sourceId,
              )
            : null;
          // The source card is updated wherever it is loaded, however old,
          // when this run is the one the source shows. One that is not loaded
          // (a composer generation's source) keeps its resolved copy in the
          // reply; the server already persisted it.
          const isSourceOwned =
            payload.uiAction && payload.runId
              ? deps.isUiActionSourceOwner(payload.threadId, {
                  runId: payload.runId,
                  sequence: payload.sequence,
                  sourceId: payload.uiAction.sourceId,
                })
              : true;
          const isSourceUpdated =
            payload.uiAction && sourceUpdate && isSourceOwned
              ? deps.applySourceActionUpdate(
                  payload.uiAction.sourceId,
                  sourceUpdate.card,
                )
              : false;

          const assistantMessage: AgentChatMessage = {
            content: payload.fullContent,
            createdAt: new Date().toISOString(),
            id: `assistant-${Date.now()}`,
            metadata: {
              ...payload.metadata,
              // A settled source keeps only the reply's own cards; a stale
              // result's resolved copy of the source is dropped, not shown.
              ...((isSourceUpdated || !isSourceOwned) &&
              sourceUpdate?.replyActions
                ? { uiActions: sourceUpdate.replyActions }
                : {}),
              toolCalls: payload.toolCalls.map(mapToolCallResponse),
            },
            role: 'assistant',
            threadId: payload.threadId,
          };

          const lastGeneratedAsset = extractLastGeneratedAssetFromMetadata(
            payload.metadata,
          );
          deps.updateThreadSummary(payload.threadId, {
            attentionState: (deps.isActuallyVisible ?? deps.isThreadVisible)(
              payload.threadId,
            )
              ? null
              : 'updated',
            lastActivityAt: assistantMessage.createdAt,
            lastAssistantPreview: payload.fullContent.slice(0, 280),
            ...(lastGeneratedAsset
              ? { lastGeneratedAssetUrl: lastGeneratedAsset.url }
              : {}),
            pendingInputCount: pendingInput ? 1 : 0,
            runStatus: pendingInput
              ? 'waiting_input'
              : failure
                ? 'failed'
                : 'completed',
            ...(pendingInput ? { attentionState: 'needs-input' as const } : {}),
            // A first-run generated title lands with the same event that ends
            // the stream — no refetch needed for the sidebar to rename.
            ...(payload.threadTitle?.trim()
              ? { title: payload.threadTitle.trim() }
              : {}),
            // A ui-action can move the thread's scope (a brand confirmation);
            // the next action must send the new context version.
            ...(typeof payload.contextVersion === 'number'
              ? {
                  brandId: payload.brandId ?? null,
                  contextVersion: payload.contextVersion,
                }
              : {}),
          });
          if (deps.isThreadVisible(payload.threadId)) {
            deps.setError(failure);
            deps.finalizeStream(assistantMessage);
            deps.setActiveRun(payload.runId ?? null, {
              startedAt: payload.startedAt ?? null,
              status: pendingInput
                ? 'awaiting_input'
                : failure
                  ? 'failed'
                  : 'completed',
            });
            deps.setCreditsRemaining(payload.creditsRemaining);
            if (pendingInput) {
              deps.setPendingInputRequest(pendingInput);
              for (const event of retainedWork) deps.addWorkEvent(event);
            } else deps.clearPendingInputRequest();
            // A turn streams its dashboard blocks as `agent:ui_blocks`; a
            // ui-action run's blocks arrive with its result.
            if (payload.uiAction)
              applyResultDashboardOperation(payload.metadata);
          }
          if (!pendingInput) deps.cleanupSubscriptions();

          Promise.resolve(
            deps.completeOnboardingIfNeeded(payload.toolCalls),
          ).catch(() => {
            // Intentionally swallowed — onboarding completion is fire-and-forget
          });
        },
        false,
        settleQueuedUiActionRun,
      ),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentStreamErrorPayload>(
      'agent:error',
      filterByThread(
        (data) => {
          const payload = data as AgentStreamErrorPayload;

          deps.pendingCompletionRef.current = null;
          deps.clearCompletionWatchdog();
          const nextStatus =
            payload.error === 'Agent run cancelled' ? 'cancelled' : 'failed';
          if (
            !deps.acceptThreadEventSequence(payload.threadId, payload.sequence)
          ) {
            if (payload.runId) {
              deps.settleUiActionRun(payload.threadId, payload.runId, {
                error: payload.error,
                sequence: payload.sequence,
                status: nextStatus,
              });
            }
            if (deps.isThreadVisible(payload.threadId)) deps.resetStreamState();
            deps.cleanupSubscriptions();
            return;
          }
          if (payload.runId) {
            deps.settleUiActionRun(payload.threadId, payload.runId, {
              error: payload.error,
              sequence: payload.sequence,
              status: nextStatus,
            });
          }
          deps.updateThreadSummary(payload.threadId, {
            attentionState: (deps.isActuallyVisible ?? deps.isThreadVisible)(
              payload.threadId,
            )
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
        },
        false,
        settleQueuedUiActionRun,
      ),
    ),
  );

  unsubscribers.push(
    deps.subscribe<AgentStreamUIBlocksPayload>(
      'agent:ui_blocks',
      filterByThread((data) => {
        const payload = data as AgentStreamUIBlocksPayload;
        deps.touchCompletionWatchdog();
        deps.markThreadRunning(payload.threadId);
        if (
          (deps.isActuallyVisible ?? deps.isThreadVisible)(payload.threadId)
        ) {
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
        deps.pendingCompletionRef.current = null;
        deps.clearCompletionWatchdog();
        deps.updateThreadSummary(payload.threadId, {
          attentionState: 'needs-input',
          lastActivityAt: payload.timestamp,
          pendingInputCount: 1,
          runStatus: 'waiting_input',
        });
        if (deps.isThreadVisible(payload.threadId)) {
          deps.setActiveRunStatus('awaiting_input');
          deps.setPendingInputRequest({
            allowFreeText: payload.allowFreeText,
            isMultiSelect: payload.isMultiSelect,
            maxSelections: payload.maxSelections,
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
        const resolved = deps.resolvePendingInputRequest(
          payload.threadId,
          payload.inputRequestId,
          payload.timestamp,
        );
        if (resolved && deps.isThreadVisible(payload.threadId)) {
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
      }, true),
    ),
  );

  return unsubscribers;
}
