import { findRunAssistantMessage } from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
import {
  AGENT_DRAFT_SUGGESTION_EVENT,
  type AgentDraftSuggestionPayload,
} from '@genfeedai/agent/hooks/use-agent-draft-context';
import type {
  AgentChatMessage,
  AgentProposedPlan,
  AgentThread,
  AgentUiActionAckResponse,
  AgentUiActionOutcome,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { applyDashboardOperation } from '@genfeedai/agent/utils/apply-dashboard-operation';
import { reconcileGenerationDecision } from '@genfeedai/agent/utils/reconcile-generation-decision';
import { syncAgentThreadFromTurn } from '@genfeedai/agent/utils/sync-agent-thread-from-turn';
import {
  type AgentThreadMode,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';

export type HandleUiActionDeps = {
  activeThreadId: string | null;
  activeUiAction: string | null;
  addMessage: (message: AgentChatMessage) => void;
  apiService: AgentApiService;
  draftAgentMode: AgentThreadMode;
  followLatestTurn: (behavior?: ScrollBehavior) => void;
  isBusy: boolean;
  isReadOnly: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  sendMessage: (content: string) => Promise<void>;
  setActiveThread: (id: string | null) => void;
  setActiveUiAction: (action: string | null) => void;
  setCreditsRemaining: (credits: number) => void;
  setError: (error: string | null) => void;
  setLatestProposedPlan: (plan: AgentProposedPlan | null) => void;
  /**
   * Aborted when the conversation that started the action goes away (thread
   * switch or unmount). Reconciliation stops and writes nothing after it.
   */
  signal: AbortSignal;
  threads: AgentThread[];
  upsertThread: (thread: AgentThread) => void;
};

/**
 * `POST .../ui-actions` (`AgentOrchestratorService.handleThreadUiAction`)
 * only enqueues the `agent.thread.ui-action` workflow and acks
 * `{executionId, status: 'queued', threadId}`. No socket event follows a
 * ui-action run, so its result is reconciled over REST with the same two
 * signals the turn watchdog (`resolveStreamFromMessages`) uses: the assistant
 * reply stamped with the run's `metadata.runId`, and the run's workflow
 * execution status. The window is short because a ui-action is a single
 * mutation, not an LLM generation.
 */
export const UI_ACTION_RECONCILE_POLL_INTERVAL_MS = 1_000;
export const UI_ACTION_RECONCILE_TIMEOUT_MS = 20_000;
/** A run's reply is the newest message on its thread; this is headroom. */
export const UI_ACTION_RECONCILE_MESSAGE_LIMIT = 20;

export const UI_ACTION_PENDING_NOTICE =
  'This is taking longer than expected. It was accepted and may still complete — check back shortly.';
const UI_ACTION_FAILED_FALLBACK = 'The action failed before it finished.';

export type UiActionRunOutcome =
  | { status: 'completed'; message: AgentChatMessage | null }
  | { status: 'failed'; error: string }
  | { status: 'pending' };

function waitForNextPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, UI_ACTION_RECONCILE_POLL_INTERVAL_MS);
    function onAbort() {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function readRunReply(
  apiService: Pick<AgentApiService, 'getMessages'>,
  ack: AgentUiActionAckResponse,
  signal: AbortSignal,
): Promise<AgentChatMessage | null> {
  const messages = await apiService.getMessages(
    ack.threadId,
    { limit: UI_ACTION_RECONCILE_MESSAGE_LIMIT },
    signal,
  );
  return findRunAssistantMessage(messages, ack.executionId) ?? null;
}

/**
 * Resolve an acknowledged ui-action run: `completed` with the reply that run
 * persisted, `failed` when its execution failed or was cancelled, or
 * `pending` when neither is known before the timeout or the caller aborts.
 * A transient read error is retried on the next poll, never reported as a
 * failure of an action the server already accepted.
 */
export async function reconcileUiActionRun(
  apiService: Pick<AgentApiService, 'getMessages' | 'getWorkflowExecution'>,
  ack: AgentUiActionAckResponse,
  signal: AbortSignal,
): Promise<UiActionRunOutcome> {
  const startedAt = Date.now();

  while (!signal.aborted) {
    try {
      const reply = await readRunReply(apiService, ack, signal);
      if (reply) {
        return { message: reply, status: 'completed' };
      }

      const execution = await apiService.getWorkflowExecution(
        ack.executionId,
        signal,
      );
      if (
        execution.status === WorkflowExecutionStatus.FAILED ||
        execution.status === WorkflowExecutionStatus.CANCELLED
      ) {
        return {
          error: execution.error?.trim() || UI_ACTION_FAILED_FALLBACK,
          status: 'failed',
        };
      }
      if (execution.status === WorkflowExecutionStatus.COMPLETED) {
        // The reply is persisted before the execution completes, so a read
        // after `COMPLETED` is authoritative. A run can complete without a
        // reply of its own (an idempotent replay of an earlier confirmation).
        return {
          message: await readRunReply(apiService, ack, signal),
          status: 'completed',
        };
      }
    } catch {
      // Retried on the next poll; the abort check below ends the loop.
    }

    if (
      signal.aborted ||
      Date.now() - startedAt >= UI_ACTION_RECONCILE_TIMEOUT_MS
    ) {
      break;
    }
    await waitForNextPoll(signal);
  }

  return { status: 'pending' };
}

/**
 * Hydrate a reconciled reply by id: a thread re-hydrated from the server while
 * the run was in flight may already hold it.
 */
function upsertReconciledMessage(
  message: AgentChatMessage,
  addMessage: HandleUiActionDeps['addMessage'],
): void {
  const isHydrated = useAgentChatStore
    .getState()
    .messages.some((existing) => existing.id === message.id);
  if (!isHydrated) {
    addMessage(message);
    return;
  }
  useAgentChatStore.setState((state) => ({
    messages: state.messages.map((existing) =>
      existing.id === message.id ? message : existing,
    ),
  }));
}

/**
 * The thread's cached conversation predates the run's result; drop it so the
 * next visit hydrates from the server instead of showing the stale transcript.
 */
function discardConversationCache(threadId: string): void {
  if (!(threadId in useAgentChatStore.getState().conversationCacheByThread)) {
    return;
  }
  useAgentChatStore.setState((state) => {
    const { [threadId]: _stale, ...retained } = state.conversationCacheByThread;
    return { conversationCacheByThread: retained };
  });
}

function reconcileMutationApproval(
  actions: unknown,
  payload: Record<string, unknown> | undefined,
  threadId: string,
): Set<unknown> {
  const reconciled = new Set<unknown>();
  if (
    !Array.isArray(actions) ||
    typeof payload?.approvalId !== 'string' ||
    typeof payload.sourceActionId !== 'string'
  )
    return reconciled;
  const returnedActions: unknown[] = actions;
  for (const candidate of returnedActions) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      !('type' in candidate) ||
      candidate.type !== 'mutation_approval_card' ||
      !('id' in candidate) ||
      candidate.id !== payload.sourceActionId ||
      !('data' in candidate) ||
      !candidate.data ||
      typeof candidate.data !== 'object'
    )
      continue;
    const data = candidate.data;
    if (
      !('approvalId' in data) ||
      data.approvalId !== payload.approvalId ||
      !('sourceActionId' in data) ||
      data.sourceActionId !== payload.sourceActionId ||
      !('status' in data) ||
      (data.status !== 'approved' && data.status !== 'declined')
    )
      continue;
    const hasSourceCard = useAgentChatStore
      .getState()
      .messages.some(
        (message) =>
          message.threadId === threadId &&
          message.metadata?.uiActions?.some(
            (card) =>
              card.type === 'mutation_approval_card' &&
              card.id === payload.sourceActionId &&
              card.data?.approvalId === payload.approvalId,
          ),
      );
    if (!hasSourceCard) continue;
    reconciled.add(candidate);
    const resolvedData = { ...data };
    useAgentChatStore.setState((state) => ({
      messages: state.messages.map((message) =>
        message.threadId !== threadId
          ? message
          : {
              ...message,
              metadata: {
                ...message.metadata,
                uiActions: message.metadata?.uiActions?.map((card) =>
                  card.type === 'mutation_approval_card' &&
                  card.id === payload.sourceActionId &&
                  card.data?.approvalId === payload.approvalId
                    ? {
                        ...card,
                        ctas: [],
                        data: { ...card.data, ...resolvedData },
                        status: 'completed',
                      }
                    : card,
                ),
              },
            },
      ),
    }));
  }
  return reconciled;
}

export async function handleAgentUiAction(
  action: string,
  payload: Record<string, unknown> | undefined,
  deps: HandleUiActionDeps,
): Promise<AgentUiActionOutcome> {
  if (deps.isReadOnly) {
    deps.setError('Archived threads are read-only.');
    return false;
  }

  if (action === 'send_prompt') {
    const prompt =
      typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';

    if (!prompt) {
      deps.setError('No follow-up prompt is available for this action.');
      return false;
    }

    if (deps.isBusy || deps.activeUiAction) {
      return false;
    }

    deps.setActiveUiAction(action);
    deps.setError(null);

    try {
      deps.followLatestTurn('smooth');
      await deps.sendMessage(prompt);
      return true;
    } catch (err) {
      deps.setError(
        err instanceof Error ? err.message : 'Failed to send follow-up prompt',
      );
      return false;
    } finally {
      deps.setActiveUiAction(null);
    }
  }

  if (action === 'apply_to_draft') {
    const text = typeof payload?.text === 'string' ? payload.text : '';

    if (!text.trim()) {
      deps.setError('No generated text is available for this action.');
      return false;
    }

    if (typeof window === 'undefined') {
      deps.setError('Draft updates are only available in the browser.');
      return false;
    }

    const pageContext = useAgentChatStore.getState().pageContext;
    const event = new CustomEvent<AgentDraftSuggestionPayload>(
      AGENT_DRAFT_SUGGESTION_EVENT,
      {
        cancelable: true,
        detail: {
          mode: pageContext?.selectedText ? 'replace-selection' : 'append',
          selectedText: pageContext?.selectedText,
          sourceAction:
            typeof payload?.sourceAction === 'string'
              ? payload.sourceAction
              : undefined,
          text,
        },
      },
    );

    const wasHandled = !window.dispatchEvent(event);

    if (!wasHandled) {
      deps.setError('Open a writing surface before applying text to a draft.');
      return false;
    }

    deps.setError(null);
    return true;
  }

  if (!deps.activeThreadId) {
    deps.setError('No active thread selected.');
    return false;
  }

  if (deps.isBusy || deps.activeUiAction) {
    return false;
  }

  deps.setActiveUiAction(action);
  deps.setError(null);

  const threadId = deps.activeThreadId;
  // Every write below lands in the visible conversation, so it is valid only
  // while the thread that started the action is still the one on screen.
  const isStillCurrent = () =>
    !deps.signal.aborted &&
    useAgentChatStore.getState().activeThreadId === threadId;
  const leaveForLaterHydration = (): AgentUiActionOutcome => {
    discardConversationCache(threadId);
    return 'pending';
  };

  try {
    const currentThread = deps.threads.find((thread) => thread.id === threadId);

    // The request itself is never aborted: the user confirmed the action, and
    // leaving the thread must not withdraw it.
    const ack = await deps.apiService.respondToUiAction(
      threadId,
      action,
      payload,
      undefined,
      {
        brandId: currentThread?.brandId ?? null,
        expectedContextVersion: currentThread?.contextVersion,
      },
    );
    if (!isStillCurrent()) {
      return leaveForLaterHydration();
    }

    const outcome = await reconcileUiActionRun(
      deps.apiService,
      { ...ack, threadId },
      deps.signal,
    );
    if (!isStillCurrent()) {
      return leaveForLaterHydration();
    }

    if (outcome.status === 'pending') {
      deps.setError(UI_ACTION_PENDING_NOTICE);
      return 'pending';
    }
    if (outcome.status === 'failed') {
      deps.setError(outcome.error);
      return false;
    }

    // The ack carries no updated scope/credits — refetch them so the next
    // ui-action's `expectedContextVersion` isn't stale. Best-effort: a
    // failure here shouldn't hide the result that already arrived.
    const [updatedThread, creditsInfo] = await Promise.all([
      deps.apiService.getThread(threadId).catch(() => null),
      deps.apiService.getCreditsInfo().catch(() => null),
    ]);
    if (!isStillCurrent()) {
      return leaveForLaterHydration();
    }

    const existingThread = useAgentChatStore
      .getState()
      .threads.find((thread) => thread.id === threadId);
    syncAgentThreadFromTurn({
      activeThreadId: threadId,
      brandId:
        updatedThread?.brandId ??
        existingThread?.brandId ??
        currentThread?.brandId ??
        null,
      contextVersion:
        updatedThread?.contextVersion ??
        existingThread?.contextVersion ??
        currentThread?.contextVersion,
      createdAt: existingThread?.createdAt ?? currentThread?.createdAt,
      mode: existingThread?.mode ?? currentThread?.mode ?? deps.draftAgentMode,
      setActiveThread: deps.setActiveThread,
      threadId,
      title: existingThread?.title ?? currentThread?.title ?? 'Agent thread',
      upsertThread: deps.upsertThread,
    });

    if (creditsInfo) {
      deps.setCreditsRemaining(creditsInfo.balance);
    }

    const sourceActionId =
      typeof payload?.sourceActionId === 'string'
        ? payload.sourceActionId
        : null;
    const reply = outcome.message;

    if (!reply) {
      // The run completed without a reply of its own; the source card is
      // settled all the same.
      if (sourceActionId) {
        useAgentChatStore
          .getState()
          .setUiActionStatus(sourceActionId, 'completed');
      }
      return true;
    }

    const returnedActions = reply.metadata?.uiActions;
    const reconciledApprovals =
      action === 'confirm_mutation' || action === 'decline_mutation'
        ? reconcileMutationApproval(returnedActions, payload, threadId)
        : action === 'confirm_generate_media' ||
            action === 'decline_generate_media'
          ? reconcileGenerationDecision(
              returnedActions,
              payload?.sourceActionId,
              threadId,
            )
          : new Set<unknown>();

    if (sourceActionId) {
      useAgentChatStore
        .getState()
        .setUiActionStatus(sourceActionId, 'completed');
    }

    upsertReconciledMessage(
      {
        ...reply,
        metadata: {
          ...reply.metadata,
          ...(Array.isArray(returnedActions)
            ? {
                uiActions: returnedActions.filter(
                  (card) => !reconciledApprovals.has(card),
                ),
              }
            : {}),
        },
      },
      deps.addMessage,
    );

    const returnedPlan = reply.metadata?.proposedPlan as
      | typeof deps.latestProposedPlan
      | undefined;
    deps.setLatestProposedPlan(
      returnedPlan ??
        (action === 'approve_plan' && deps.latestProposedPlan
          ? {
              ...deps.latestProposedPlan,
              approvedAt: new Date().toISOString(),
              awaitingApproval: false,
              lastReviewAction: 'approve',
              status: 'approved',
            }
          : null),
    );

    const metadata = reply.metadata;
    const uiBlocksState =
      metadata?.uiBlocks &&
      typeof metadata.uiBlocks === 'object' &&
      !Array.isArray(metadata.uiBlocks)
        ? (metadata.uiBlocks as Record<string, unknown>)
        : null;
    const dashboardOperation =
      typeof metadata?.dashboardOperation === 'string'
        ? metadata.dashboardOperation
        : typeof uiBlocksState?.operation === 'string'
          ? uiBlocksState.operation
          : undefined;
    const dashboardPayload =
      uiBlocksState?.blocks ??
      (uiBlocksState?.components ? uiBlocksState : undefined);

    if (dashboardOperation) {
      applyDashboardOperation(
        dashboardOperation,
        dashboardPayload,
        uiBlocksState?.blockIds,
      );
    }
    return true;
  } catch (err) {
    if (!isStillCurrent()) {
      return false;
    }
    deps.setError(
      err instanceof Error ? err.message : 'Failed to respond to UI action',
    );
    return false;
  } finally {
    deps.setActiveUiAction(null);
  }
}
