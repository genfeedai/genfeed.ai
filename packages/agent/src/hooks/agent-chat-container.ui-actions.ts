import {
  collectAssistantMessageIds,
  findRecoveredAssistantMessage,
} from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
import {
  AGENT_DRAFT_SUGGESTION_EVENT,
  type AgentDraftSuggestionPayload,
} from '@genfeedai/agent/hooks/use-agent-draft-context';
import type {
  AgentChatMessage,
  AgentProposedPlan,
  AgentThread,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { applyDashboardOperation } from '@genfeedai/agent/utils/apply-dashboard-operation';
import { reconcileGenerationDecision } from '@genfeedai/agent/utils/reconcile-generation-decision';
import { syncAgentThreadFromTurn } from '@genfeedai/agent/utils/sync-agent-thread-from-turn';
import type { AgentThreadMode } from '@genfeedai/contracts';

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
  threads: AgentThread[];
  upsertThread: (thread: AgentThread) => void;
};

/**
 * `POST .../ui-actions` (`AgentOrchestratorService.handleThreadUiAction`)
 * only enqueues the `agent.thread.ui-action` workflow and acks
 * `{executionId, status: 'queued', threadId}` — the same async contract as a
 * turn. There is no synchronous `message` on that response; the resulting
 * assistant reply lands through the thread's normal message stream. Poll for
 * it the same way `agent-chat-stream.completion.ts`'s
 * `resolveStreamFromMessages` recovers a turn whose socket event never
 * arrives — a much shorter interval/timeout than a turn's, since a ui-action
 * is a single mutation, not an LLM generation.
 */
export const UI_ACTION_RECONCILE_POLL_INTERVAL_MS = 1_000;
export const UI_ACTION_RECONCILE_TIMEOUT_MS = 20_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForUiActionMessage(
  apiService: Pick<AgentApiService, 'getMessages'>,
  threadId: string,
  preExistingAssistantIds: ReadonlySet<string>,
): Promise<AgentChatMessage | null> {
  const startedAt = Date.now();

  for (;;) {
    const messages = await apiService.getMessages(threadId, { limit: 100 });
    const recovered = findRecoveredAssistantMessage(
      messages,
      preExistingAssistantIds,
    );
    if (recovered) {
      return recovered;
    }
    if (Date.now() - startedAt >= UI_ACTION_RECONCILE_TIMEOUT_MS) {
      return null;
    }
    await delay(UI_ACTION_RECONCILE_POLL_INTERVAL_MS);
  }
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
): Promise<boolean> {
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

  try {
    const activeThreadId = deps.activeThreadId;
    const currentThread = deps.threads.find(
      (thread) => thread.id === activeThreadId,
    );
    const preExistingAssistantIds = collectAssistantMessageIds(
      useAgentChatStore
        .getState()
        .messages.filter((message) => message.threadId === activeThreadId),
    );

    const ack = await deps.apiService.respondToUiAction(
      activeThreadId,
      action,
      payload,
      undefined,
      {
        brandId: currentThread?.brandId ?? null,
        expectedContextVersion: currentThread?.contextVersion,
      },
    );

    const recovered = await waitForUiActionMessage(
      deps.apiService,
      ack.threadId,
      preExistingAssistantIds,
    );

    if (!recovered) {
      // The workflow was accepted (the ack above didn't throw) — it just
      // hasn't produced a reply within the poll window. Don't report this
      // as a failure: the mutation itself likely already applied server
      // side, and a later reload/reconciliation will show its result.
      deps.setError(
        'This is taking longer than expected. It was accepted and may still complete — check back shortly.',
      );
      return true;
    }

    const returnedActions = recovered.metadata?.uiActions;
    const reconciledApprovals =
      action === 'confirm_mutation' || action === 'decline_mutation'
        ? reconcileMutationApproval(returnedActions, payload, ack.threadId)
        : action === 'confirm_generate_media' ||
            action === 'decline_generate_media'
          ? reconcileGenerationDecision(
              returnedActions,
              payload?.sourceActionId,
              ack.threadId,
            )
          : new Set<unknown>();

    const sourceActionId =
      typeof payload?.sourceActionId === 'string'
        ? payload.sourceActionId
        : null;
    if (sourceActionId) {
      useAgentChatStore
        .getState()
        .setUiActionStatus(sourceActionId, 'completed');
    }

    const existingThread = deps.threads.find(
      (thread) => thread.id === ack.threadId,
    );

    // The ack carries no updated scope/credits — refetch them so the next
    // ui-action's `expectedContextVersion` isn't stale. Best-effort: a
    // failure here shouldn't hide the message that already arrived.
    const [updatedThread, creditsInfo] = await Promise.all([
      deps.apiService.getThread(ack.threadId).catch(() => null),
      deps.apiService.getCreditsInfo().catch(() => null),
    ]);

    syncAgentThreadFromTurn({
      activeThreadId,
      brandId:
        updatedThread?.brandId ??
        existingThread?.brandId ??
        currentThread?.brandId ??
        null,
      contextVersion:
        updatedThread?.contextVersion ?? existingThread?.contextVersion,
      createdAt: existingThread?.createdAt,
      mode: existingThread?.mode ?? deps.draftAgentMode,
      setActiveThread: deps.setActiveThread,
      threadId: ack.threadId,
      title: existingThread?.title ?? 'Agent thread',
      upsertThread: deps.upsertThread,
    });

    if (creditsInfo) {
      deps.setCreditsRemaining(creditsInfo.balance);
    }

    deps.addMessage({
      ...recovered,
      metadata: {
        ...recovered.metadata,
        ...(Array.isArray(returnedActions)
          ? {
              uiActions: returnedActions.filter(
                (card) => !reconciledApprovals.has(card),
              ),
            }
          : {}),
      },
    });

    const returnedPlan = recovered.metadata?.proposedPlan as
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

    const metadata = recovered.metadata;
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
    deps.setError(
      err instanceof Error ? err.message : 'Failed to respond to UI action',
    );
    return false;
  } finally {
    deps.setActiveUiAction(null);
  }
}
