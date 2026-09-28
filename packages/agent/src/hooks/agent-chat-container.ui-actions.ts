import { findRunAssistantMessage } from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
import {
  AGENT_DRAFT_SUGGESTION_EVENT,
  type AgentDraftSuggestionPayload,
} from '@genfeedai/agent/hooks/use-agent-draft-context';
import type {
  AgentChatMessage,
  AgentProposedPlan,
  AgentThread,
  AgentUiAction,
  AgentUiActionAckResponse,
  AgentUiActionOutcome,
  AgentUiActionRun,
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
 * execution status.
 *
 * The card waits for the short foreground window. After it, the run keeps
 * reconciling in the background with backoff until its execution is terminal
 * or the cap passes, and the result settles the card through
 * `uiActionRuns`. Leaving the thread stops it; returning resumes it.
 */
export const UI_ACTION_RECONCILE_POLL_INTERVAL_MS = 1_000;
export const UI_ACTION_RECONCILE_TIMEOUT_MS = 20_000;
export const UI_ACTION_BACKGROUND_INITIAL_DELAY_MS = 2_000;
export const UI_ACTION_BACKGROUND_MAX_DELAY_MS = 30_000;
export const UI_ACTION_BACKGROUND_CAP_MS = 10 * 60_000;
/** A run's reply is the newest message on its thread; this is headroom. */
export const UI_ACTION_RECONCILE_MESSAGE_LIMIT = 20;

export const UI_ACTION_PENDING_NOTICE =
  'This is taking longer than expected. It was accepted and may still complete — check back shortly.';
const UI_ACTION_FAILED_FALLBACK = 'The action failed before it finished.';

export type UiActionReconcileSchedule = {
  delayMs: (attempt: number) => number;
  timeoutMs: number;
};

export const UI_ACTION_FOREGROUND_SCHEDULE: UiActionReconcileSchedule = {
  delayMs: () => UI_ACTION_RECONCILE_POLL_INTERVAL_MS,
  timeoutMs: UI_ACTION_RECONCILE_TIMEOUT_MS,
};

export const UI_ACTION_BACKGROUND_SCHEDULE: UiActionReconcileSchedule = {
  delayMs: (attempt) =>
    Math.min(
      UI_ACTION_BACKGROUND_INITIAL_DELAY_MS * 2 ** attempt,
      UI_ACTION_BACKGROUND_MAX_DELAY_MS,
    ),
  timeoutMs: UI_ACTION_BACKGROUND_CAP_MS,
};

export type UiActionRunOutcome =
  | {
      status: 'completed';
      /** The thread's messages from the same read that found the result. */
      messages: AgentChatMessage[];
      reply: AgentChatMessage | null;
    }
  | { status: 'failed'; error: string }
  | { status: 'pending' };

/**
 * The key a run is stored under, and the key a card reads to derive its
 * state: the action's source card when it names one, else its payload.
 */
export function getUiActionRunKey(
  threadId: string,
  action: string,
  payload: Record<string, unknown> | undefined,
): string {
  const source =
    typeof payload?.sourceActionId === 'string'
      ? payload.sourceActionId
      : JSON.stringify(payload ?? {});
  return `${threadId}:${action}:${source}`;
}

function waitForNextPoll(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function readThreadMessages(
  apiService: Pick<AgentApiService, 'getMessages'>,
  threadId: string,
  signal: AbortSignal,
): Promise<AgentChatMessage[]> {
  return apiService.getMessages(
    threadId,
    { limit: UI_ACTION_RECONCILE_MESSAGE_LIMIT },
    signal,
  );
}

/**
 * Resolve an acknowledged ui-action run: `completed` with the reply that run
 * persisted (and the messages read with it), `failed` when its execution
 * failed or was cancelled, or `pending` when neither is known before the
 * schedule's timeout or the caller aborts. A transient read error is retried
 * on the next poll, never reported as a failure of an accepted action.
 */
export async function reconcileUiActionRun(
  apiService: Pick<AgentApiService, 'getMessages' | 'getWorkflowExecution'>,
  ack: Pick<AgentUiActionAckResponse, 'executionId' | 'threadId'>,
  signal: AbortSignal,
  schedule: UiActionReconcileSchedule = UI_ACTION_FOREGROUND_SCHEDULE,
): Promise<UiActionRunOutcome> {
  const startedAt = Date.now();

  for (let attempt = 0; !signal.aborted; attempt += 1) {
    try {
      const messages = await readThreadMessages(
        apiService,
        ack.threadId,
        signal,
      );
      const reply = findRunAssistantMessage(messages, ack.executionId);
      if (reply) {
        return { messages, reply, status: 'completed' };
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
        const settled = await readThreadMessages(
          apiService,
          ack.threadId,
          signal,
        );
        return {
          messages: settled,
          reply: findRunAssistantMessage(settled, ack.executionId) ?? null,
          status: 'completed',
        };
      }
    } catch {
      // Retried on the next poll; the abort check ends the loop.
    }

    if (signal.aborted || Date.now() - startedAt >= schedule.timeoutMs) {
      break;
    }
    await waitForNextPoll(schedule.delayMs(attempt), signal);
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

/**
 * A run can update the card that started it in place on the server (a
 * generation decision is written onto the original proposal message, not
 * into the reply). Take that persisted card from the same messages read, by
 * message id, so the visible copy never keeps the stale state.
 */
function reconcilePersistedSourceCard(
  messages: readonly AgentChatMessage[],
  sourceActionId: string | null,
  threadId: string,
): void {
  if (!sourceActionId) {
    return;
  }
  const persistedCards = new Map<string, AgentUiAction>();
  for (const message of messages) {
    const card = message.metadata?.uiActions?.find(
      (candidate) => candidate.id === sourceActionId,
    );
    if (card) {
      persistedCards.set(message.id, card);
    }
  }
  if (persistedCards.size === 0) {
    return;
  }
  useAgentChatStore.setState((state) => ({
    messages: state.messages.map((message) => {
      const persisted = persistedCards.get(message.id);
      if (!persisted || message.threadId !== threadId) {
        return message;
      }
      return {
        ...message,
        metadata: {
          ...message.metadata,
          uiActions: message.metadata?.uiActions?.map((card) =>
            card.id === sourceActionId ? persisted : card,
          ),
        },
      };
    }),
  }));
  discardConversationCache(threadId);
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
    const run: AgentUiActionRun = {
      action,
      executionId: ack.executionId,
      key: getUiActionRunKey(threadId, action, payload),
      payload,
      status: 'pending',
      threadId,
    };
    useAgentChatStore.getState().setUiActionRun(run);
    if (!isRunVisible(threadId, deps.signal)) {
      discardConversationCache(threadId);
      return 'pending';
    }

    const outcome = await reconcileUiActionRun(
      deps.apiService,
      { executionId: ack.executionId, threadId },
      deps.signal,
    );
    if (outcome.status === 'pending') {
      if (!isRunVisible(threadId, deps.signal)) {
        discardConversationCache(threadId);
        return 'pending';
      }
      deps.setError(UI_ACTION_PENDING_NOTICE);
      void resumeUiActionRun(run, deps);
      return 'pending';
    }
    return (await settleUiActionRun(run, outcome, deps)) === 'completed';
  } catch (err) {
    if (!isRunVisible(threadId, deps.signal)) {
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

/** Writes land in the visible conversation, so the run's thread must be it. */
function isRunVisible(threadId: string, signal: AbortSignal): boolean {
  return (
    !signal.aborted && useAgentChatStore.getState().activeThreadId === threadId
  );
}

/**
 * Keep reconciling a run whose foreground window passed, or one found pending
 * when its thread becomes visible again, with backoff until the execution is
 * terminal or the cap passes. `deps.signal` stops it on thread change or
 * unmount; the run then stays pending for the next visit to resume.
 */
export async function resumeUiActionRun(
  run: AgentUiActionRun,
  deps: HandleUiActionDeps,
): Promise<void> {
  const outcome = await reconcileUiActionRun(
    deps.apiService,
    { executionId: run.executionId, threadId: run.threadId },
    deps.signal,
    UI_ACTION_BACKGROUND_SCHEDULE,
  );
  if (outcome.status === 'pending') {
    return;
  }
  if (
    isRunVisible(run.threadId, deps.signal) &&
    useAgentChatStore.getState().error === UI_ACTION_PENDING_NOTICE
  ) {
    deps.setError(null);
  }
  await settleUiActionRun(run, outcome, deps);
}

/**
 * Record a terminal run and, while its thread is visible, apply the result to
 * the conversation. The run's status is recorded either way: it is the fact
 * cards derive their state from, including after a remount.
 */
async function settleUiActionRun(
  run: AgentUiActionRun,
  outcome: Exclude<UiActionRunOutcome, { status: 'pending' }>,
  deps: HandleUiActionDeps,
): Promise<'completed' | 'failed'> {
  const { setUiActionRun } = useAgentChatStore.getState();
  if (outcome.status === 'failed') {
    setUiActionRun({ ...run, error: outcome.error, status: 'failed' });
    if (isRunVisible(run.threadId, deps.signal)) {
      deps.setError(outcome.error);
    }
    return 'failed';
  }

  const isApplied = await applyCompletedRun(run, outcome, deps);
  if (!isApplied) {
    discardConversationCache(run.threadId);
  }
  setUiActionRun({ ...run, status: 'completed' });
  return 'completed';
}

async function applyCompletedRun(
  run: AgentUiActionRun,
  outcome: Extract<UiActionRunOutcome, { status: 'completed' }>,
  deps: HandleUiActionDeps,
): Promise<boolean> {
  const { action, payload, threadId } = run;
  if (!isRunVisible(threadId, deps.signal)) {
    return false;
  }

  // The ack carries no updated scope/credits — refetch them so the next
  // ui-action's `expectedContextVersion` isn't stale. Best-effort: a failure
  // here shouldn't hide the result that already arrived.
  const [updatedThread, creditsInfo] = await Promise.all([
    deps.apiService.getThread(threadId).catch(() => null),
    deps.apiService.getCreditsInfo().catch(() => null),
  ]);
  if (!isRunVisible(threadId, deps.signal)) {
    return false;
  }

  const knownThread =
    useAgentChatStore
      .getState()
      .threads.find((thread) => thread.id === threadId) ??
    deps.threads.find((thread) => thread.id === threadId);
  syncAgentThreadFromTurn({
    activeThreadId: threadId,
    brandId: updatedThread?.brandId ?? knownThread?.brandId ?? null,
    contextVersion:
      updatedThread?.contextVersion ?? knownThread?.contextVersion,
    createdAt: knownThread?.createdAt,
    mode: knownThread?.mode ?? deps.draftAgentMode,
    setActiveThread: deps.setActiveThread,
    threadId,
    title: knownThread?.title ?? 'Agent thread',
    upsertThread: deps.upsertThread,
  });

  if (creditsInfo) {
    deps.setCreditsRemaining(creditsInfo.balance);
  }

  const sourceActionId =
    typeof payload?.sourceActionId === 'string' ? payload.sourceActionId : null;
  reconcilePersistedSourceCard(outcome.messages, sourceActionId, threadId);

  const reply = outcome.reply;
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
    useAgentChatStore.getState().setUiActionStatus(sourceActionId, 'completed');
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
}
