import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';

export function reconcileGenerationDecision(
  actions: unknown,
  sourceActionId: unknown,
  threadId: string,
): Set<unknown> {
  const reconciled = new Set<unknown>();
  if (typeof sourceActionId !== 'string' || !Array.isArray(actions))
    return reconciled;
  for (const candidate of actions as AgentUiAction[]) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (
      candidate.type !== 'generation_action_card' ||
      candidate.id !== sourceActionId ||
      (candidate.data?.decision !== 'approved' &&
        candidate.data?.decision !== 'declined')
    )
      continue;
    const state = useAgentChatStore.getState();
    if (state.conversationCacheByThread[threadId]) {
      useAgentChatStore.setState((current) => {
        const { [threadId]: _discarded, ...remaining } =
          current.conversationCacheByThread;
        return { conversationCacheByThread: remaining };
      });
    }
    if (
      !state.messages.some(
        (message) =>
          message.threadId === threadId &&
          message.metadata?.uiActions?.some(
            (card) =>
              card.id === sourceActionId &&
              card.type === 'generation_action_card',
          ),
      )
    )
      continue;
    useAgentChatStore.setState((current) => ({
      messages: current.messages.map((message) =>
        message.threadId !== threadId
          ? message
          : {
              ...message,
              metadata: {
                ...message.metadata,
                uiActions: message.metadata?.uiActions?.map((card) =>
                  card.id === sourceActionId &&
                  card.type === 'generation_action_card'
                    ? { ...card, data: { ...card.data, ...candidate.data } }
                    : card,
                ),
              },
            },
      ),
    }));
    reconciled.add(candidate);
  }
  return reconciled;
}
