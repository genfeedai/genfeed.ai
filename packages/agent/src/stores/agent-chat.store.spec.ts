import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { beforeEach, describe, expect, it } from 'vitest';

describe('agent-chat.store finalizeStream', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it('persists pending ui actions into the finalized assistant message without duplicates', () => {
    const pendingAction: AgentUiAction = {
      id: 'review-queue-1',
      primaryCta: {
        href: '/posts/review?batch=69c2d469368c4314a3cfff32&filter=ready',
        label: 'Open review queue',
      },
      status: 'completed',
      summaryText: 'Loaded the review queue.',
      title: 'Review queue loaded',
      type: 'completion_summary_card',
    };

    useAgentChatStore.getState().addPendingUiActions([pendingAction]);

    useAgentChatStore.getState().finalizeStream({
      content: '',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'assistant-1',
      metadata: {
        uiActions: [pendingAction],
      },
      role: 'assistant',
      threadId: 'thread-1',
    });

    expect(useAgentChatStore.getState().messages).toHaveLength(1);
    expect(
      useAgentChatStore.getState().messages[0]?.metadata?.uiActions,
    ).toEqual([pendingAction]);
  });
});
