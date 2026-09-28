import type {
  AgentRunHandoff,
  UseAgentChatStreamReturn,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';
import {
  AGENT_DRAFT_SUGGESTION_EVENT,
  type AgentDraftSuggestionPayload,
} from '@genfeedai/agent/hooks/use-agent-draft-context';
import type {
  AgentThread,
  AgentThreadUiActionState,
  AgentUiActionOutcome,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  getAgentUiActionSourceId,
  getAgentUiActionStateKey,
} from '@genfeedai/contracts/interfaces';

export type HandleUiActionDeps = Pick<
  UseAgentChatStreamReturn,
  'adoptRun' | 'beginRunHandoff' | 'cancelRunHandoff'
> & {
  activeThreadId: string | null;
  activeUiAction: string | null;
  apiService: AgentApiService;
  followLatestTurn: (behavior?: ScrollBehavior) => void;
  isBusy: boolean;
  isReadOnly: boolean;
  sendMessage: (content: string) => Promise<void>;
  setActiveUiAction: (action: string | null) => void;
  setError: (error: string | null) => void;
  threads: AgentThread[];
};

type UiActionStates = Readonly<Record<string, AgentThreadUiActionState>>;

const PLAN_REVIEW_ACTIONS: ReadonlySet<string> = new Set([
  'approve_plan',
  'revise_plan',
]);

/** The projected state of the run `action` last started on its source. */
export function findUiActionState(
  states: UiActionStates | undefined,
  action: string,
  payload: Record<string, unknown> | undefined,
): AgentThreadUiActionState | undefined {
  return states?.[
    getAgentUiActionStateKey(action, getAgentUiActionSourceId(payload))
  ];
}

/**
 * Whether a plan review (approval or revision) of this plan is still running.
 * Its controls stay locked until it settles: the run executes the plan, and a
 * second submission would execute it again.
 */
export function hasPendingPlanReview(
  states: UiActionStates | undefined,
  planId: unknown,
): boolean {
  return (
    typeof planId === 'string' &&
    Object.values(states ?? {}).some(
      (state) =>
        state.status === 'pending' &&
        PLAN_REVIEW_ACTIONS.has(state.action) &&
        state.sourceId === planId,
    )
  );
}

/** A submission whose earlier run on the same source is still running. */
function isDuplicateSubmission(
  threadId: string,
  action: string,
  payload: Record<string, unknown> | undefined,
): boolean {
  const states = useAgentChatStore.getState().uiActionStatesByThread[threadId];
  if (PLAN_REVIEW_ACTIONS.has(action)) {
    return hasPendingPlanReview(states, payload?.planId);
  }
  return findUiActionState(states, action, payload)?.status === 'pending';
}

/**
 * `POST .../ui-actions` is a command: it acks `{executionId, status: 'queued',
 * threadId}` and nothing more. The run it starts is an ordinary thread run —
 * its result arrives as the same `agent:done` / `agent:error` a turn emits, so
 * the stream adopts it like an input-response continuation: events are held
 * from before the request, pinned to the acked execution, and settled by the
 * turn's completion path (watchdog and snapshot resume included). Cards derive
 * their state from the thread's ui-action states, not from this call.
 */
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

  const threadId = deps.activeThreadId;
  if (isDuplicateSubmission(threadId, action, payload)) {
    return 'pending';
  }

  deps.setActiveUiAction(action);
  deps.setError(null);
  // Held from before the request: a result that outruns the ack is replayed
  // once the ack names its run, never lost.
  const handoff: AgentRunHandoff = deps.beginRunHandoff(threadId);

  try {
    const currentThread = deps.threads.find((thread) => thread.id === threadId);
    // Never aborted: the user confirmed the action, and leaving the thread
    // must not withdraw it.
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
    useAgentChatStore.getState().trackUiActionRun(threadId, {
      action,
      runId: ack.executionId,
      sourceId: getAgentUiActionSourceId(payload),
    });
    // Its reply is always stamped with the execution id; the thread holds
    // older replies this client never hydrated.
    deps.adoptRun(handoff, ack.executionId, null, { requireRunId: true });
    return 'pending';
  } catch (err) {
    deps.cancelRunHandoff(handoff);
    if (useAgentChatStore.getState().activeThreadId === threadId) {
      deps.setError(
        err instanceof Error ? err.message : 'Failed to respond to UI action',
      );
    }
    return false;
  } finally {
    deps.setActiveUiAction(null);
  }
}
