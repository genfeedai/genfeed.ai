import { DEFAULT_RUNTIME_AGENT_MODEL } from '@cloud/agent/constants/agent-runtime-model.constant';
import type { AgentChatMessage } from '@cloud/agent/models/agent-chat.model';
import type { AgentApiService } from '@cloud/agent/services/agent-api.service';
import { runAgentApiEffect } from '@cloud/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@cloud/agent/stores/agent-chat.store';
import { applyDashboardOperation } from '@cloud/agent/utils/apply-dashboard-operation';
import { mapToolCallResponse } from '@cloud/agent/utils/map-tool-call-response';
import type { AgentDashboardOperation, AgentUIBlock } from '@cloud/interfaces';
import { AgentThreadStatus } from '@genfeedai/enums';
import type { ChatAttachment } from '@props/ui/attachments.props';
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
        if (metadata?.uiBlocks && metadata?.dashboardOperation) {
          applyDashboardOperation(
            metadata.dashboardOperation as AgentDashboardOperation,
            metadata.uiBlocks as AgentUIBlock[],
            metadata.blockIds as string[] | undefined,
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
    ],
  );

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    clearMessages();
  }, [clearMessages]);

  return { clearChat, sendMessage };
}
