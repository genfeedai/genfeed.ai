import { AGENT_REFRESH_CONVERSATIONS_EVENT } from '@genfeedai/agent/components/agent-thread-list.helpers';
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
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { applyDashboardOperation } from '@genfeedai/agent/utils/apply-dashboard-operation';
import { mapToolCallResponse } from '@genfeedai/agent/utils/map-tool-call-response';
import { AgentThreadStatus } from '@genfeedai/enums';

export type HandleUiActionDeps = {
  activeThreadId: string | null;
  activeUiAction: string | null;
  addMessage: (message: AgentChatMessage) => void;
  apiService: AgentApiService;
  draftPlanModeEnabled: boolean;
  followLatestTurn: (behavior?: ScrollBehavior) => void;
  isBusy: boolean;
  isReadOnly: boolean;
  latestProposedPlan: AgentProposedPlan | null;
  sendMessage: (content: string) => void;
  setActiveThread: (id: string | null) => void;
  setActiveUiAction: (action: string | null) => void;
  setCreditsRemaining: (credits: number) => void;
  setError: (error: string | null) => void;
  setLatestProposedPlan: (plan: AgentProposedPlan | null) => void;
  threads: AgentThread[];
  upsertThread: (thread: AgentThread) => void;
};

export async function handleAgentUiAction(
  action: string,
  payload: Record<string, unknown> | undefined,
  deps: HandleUiActionDeps,
): Promise<void> {
  if (deps.isReadOnly) {
    deps.setError('Archived threads are read-only.');
    return;
  }

  if (action === 'send_prompt') {
    const prompt =
      typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';

    if (!prompt) {
      deps.setError('No follow-up prompt is available for this action.');
      return;
    }

    deps.followLatestTurn('smooth');
    void deps.sendMessage(prompt);
    return;
  }

  if (action === 'apply_to_draft') {
    const text = typeof payload?.text === 'string' ? payload.text : '';

    if (!text.trim()) {
      deps.setError('No generated text is available for this action.');
      return;
    }

    if (typeof window === 'undefined') {
      deps.setError('Draft updates are only available in the browser.');
      return;
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
      return;
    }

    deps.setError(null);
    return;
  }

  if (!deps.activeThreadId) {
    deps.setError('No active thread selected.');
    return;
  }

  if (deps.isBusy || deps.activeUiAction) {
    deps.setError('A UI action is already in progress.');
    return;
  }

  deps.setActiveUiAction(action);
  deps.setError(null);

  try {
    const currentThread = deps.threads.find(
      (thread) => thread.id === deps.activeThreadId,
    );
    const response = await runAgentApiEffect(
      deps.apiService.respondToUiActionEffect(
        deps.activeThreadId,
        action,
        payload,
        undefined,
        {
          brandId: currentThread?.brandId ?? null,
          expectedContextVersion: currentThread?.contextVersion,
        },
      ),
    );

    if (response.threadId !== deps.activeThreadId) {
      deps.setActiveThread(response.threadId);
    }

    const now = new Date().toISOString();
    const existingThread = deps.threads.find(
      (thread) => thread.id === response.threadId,
    );

    deps.upsertThread({
      brandId: response.brandId,
      createdAt: existingThread?.createdAt ?? now,
      contextVersion: response.contextVersion,
      id: response.threadId,
      planModeEnabled:
        existingThread?.planModeEnabled ?? deps.draftPlanModeEnabled,
      status: AgentThreadStatus.ACTIVE,
      title: existingThread?.title ?? 'Agent thread',
      updatedAt: now,
    });

    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new Event(AGENT_REFRESH_CONVERSATIONS_EVENT));
      }, 2000);
    }

    deps.setCreditsRemaining(response.creditsRemaining);

    deps.addMessage({
      content: response.message.content,
      createdAt: new Date().toISOString(),
      id: `assistant-${Date.now()}`,
      metadata: {
        toolCalls: response.toolCalls.map(mapToolCallResponse),
        ...response.message.metadata,
      },
      role: 'assistant',
      threadId: response.threadId,
    });
    const returnedPlan = response.message.metadata?.proposedPlan as
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

    const metadata = response.message.metadata;
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
  } catch (err) {
    deps.setError(
      err instanceof Error ? err.message : 'Failed to respond to UI action',
    );
  } finally {
    deps.setActiveUiAction(null);
  }
}
