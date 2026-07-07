import { DEFAULT_RUNTIME_AGENT_MODEL } from '@genfeedai/agent/constants/agent-runtime-model.constant';
import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { applyDashboardOperation } from '@genfeedai/agent/utils/apply-dashboard-operation';
import { mapToolCallResponse } from '@genfeedai/agent/utils/map-tool-call-response';
import { AgentThreadStatus } from '@genfeedai/enums';
import type { ChatAttachment } from '@genfeedai/props/ui/attachments.props';
import { useCallback, useRef } from 'react';

interface UseAgentChatOptions {
  apiService: AgentApiService;
  model?: string;
  onOnboardingCompleted?: () => void | Promise<void>;
}

interface SendMessageOptions {
  source?: 'agent' | 'proactive' | 'onboarding';
  signal?: AbortSignal;
  attachments?: ChatAttachment[];
  planModeEnabled?: boolean;
}

interface UseAgentChatReturn {
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  clearChat: () => void;
}

export function useAgentChat(options: UseAgentChatOptions): UseAgentChatReturn {
  const { apiService, model, onOnboardingCompleted } = options;
  const addMessage = useAgentChatStore((s) => s.addMessage);
  const activeThreadId = useAgentChatStore((s) => s.activeThreadId);
  const setActiveThread = useAgentChatStore((s) => s.setActiveThread);
  const setIsGenerating = useAgentChatStore((s) => s.setIsGenerating);
  const setError = useAgentChatStore((s) => s.setError);
  const setCreditsRemaining = useAgentChatStore((s) => s.setCreditsRemaining);
  const upsertThread = useAgentChatStore((s) => s.upsertThread);
  const clearMessages = useAgentChatStore((s) => s.clearMessages);
  const setLatestProposedPlan = useAgentChatStore(
    (s) => s.setLatestProposedPlan,
  );
  const pageContext = useAgentChatStore((s) => s.pageContext);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string, sendOptions?: SendMessageOptions) => {
      if (sendOptions?.signal?.aborted) {
        return;
      }
      const userMessage: AgentChatMessage = {
        content,
        createdAt: new Date().toISOString(),
        id: `user-${Date.now()}`,
        metadata: sendOptions?.attachments?.length
          ? { attachments: sendOptions.attachments }
          : undefined,
        role: 'user',
        threadId: activeThreadId ?? '',
      };

      addMessage(userMessage);
      setIsGenerating(true);
      setError(null);

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const internalSignal = abortRef.current.signal;
      const signal = sendOptions?.signal || internalSignal;

      try {
        const resolvedModel = model?.trim() || DEFAULT_RUNTIME_AGENT_MODEL;
        const response = await runAgentApiEffect(
          apiService.chatEffect(
            {
              attachments: sendOptions?.attachments,
              content,
              model: resolvedModel,
              pageContext: pageContext ?? undefined,
              planModeEnabled: sendOptions?.planModeEnabled,
              source: sendOptions?.source,
              threadId: activeThreadId ?? undefined,
            },
            signal,
          ),
        );

        if (response.threadId !== activeThreadId) {
          setActiveThread(response.threadId);
        }
        const now = new Date().toISOString();
        const existingThread = useAgentChatStore
          .getState()
          .threads.find((item) => item.id === response.threadId);
        upsertThread({
          createdAt: existingThread?.createdAt ?? now,
          id: response.threadId,
          planModeEnabled:
            existingThread?.planModeEnabled ?? sendOptions?.planModeEnabled,
          status: AgentThreadStatus.ACTIVE,
          title: existingThread?.title || content.slice(0, 60),
          updatedAt: now,
        });
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            window.dispatchEvent(new Event('agent:threads:refresh'));
          }, 2000);
        }

        setCreditsRemaining(response.creditsRemaining);

        const assistantMessage: AgentChatMessage = {
          content: response.message.content,
          createdAt: new Date().toISOString(),
          id: `assistant-${Date.now()}`,
          metadata: {
            toolCalls: response.toolCalls.map(mapToolCallResponse),
            ...response.message.metadata,
          },
          role: 'assistant',
          threadId: response.threadId,
        };

        addMessage(assistantMessage);
        setLatestProposedPlan(
          (response.message.metadata?.proposedPlan as
            | Parameters<typeof setLatestProposedPlan>[0]
            | undefined) ?? null,
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
          (uiBlocksState?.components ? uiBlocksState : metadata?.uiBlocks);

        if (dashboardOperation && metadata?.uiBlocks) {
          applyDashboardOperation(
            dashboardOperation,
            dashboardPayload,
            uiBlocksState?.blockIds ?? metadata.blockIds,
          );
        }

        const hasCompletedOnboardingTool = response.toolCalls.some(
          (toolCall) =>
            toolCall.toolName === 'complete_onboarding' &&
            toolCall.status === 'completed',
        );
        if (hasCompletedOnboardingTool && onOnboardingCompleted) {
          await onOnboardingCompleted();
        }
      } catch (err) {
        if (signal.aborted) {
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Failed to generate response',
        );
      } finally {
        if (!signal.aborted) {
          setIsGenerating(false);
        }
      }
    },
    [
      activeThreadId,
      model,
      apiService,
      addMessage,
      setActiveThread,
      setIsGenerating,
      setError,
      setCreditsRemaining,
      upsertThread,
      setLatestProposedPlan,
      onOnboardingCompleted,
      pageContext,
    ],
  );

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    clearMessages();
  }, [clearMessages]);

  return { clearChat, sendMessage };
}
