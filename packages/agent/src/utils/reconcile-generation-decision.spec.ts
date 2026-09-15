import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { reconcileGenerationDecision } from '@genfeedai/agent/utils/reconcile-generation-decision';
import { describe, expect, it } from 'vitest';

describe('generation decision reconciliation', () => {
  it('invalidates a cached source after a decision arrives following navigation', () => {
    const source = {
      id: 'root',
      title: 'Image',
      type: 'generation_action_card' as const,
      data: { decision: 'declined' },
    };
    useAgentChatStore.setState({
      messages: [
        {
          id: 'other',
          threadId: 'other-thread',
          role: 'assistant',
          content: 'keep',
          createdAt: '',
        },
      ],
      conversationCacheByThread: { thread: { messages: [] } } as never,
    });
    reconcileGenerationDecision([source], 'root', 'thread');
    expect(
      useAgentChatStore.getState().conversationCacheByThread.thread,
    ).toBeUndefined();
    expect(useAgentChatStore.getState().messages[0].content).toBe('keep');
  });
});
