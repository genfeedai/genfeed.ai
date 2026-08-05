import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it } from 'vitest';

describe('agent-chat.store finalizeStream', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it('persists pending ui actions into the finalized assistant message without duplicates', () => {
    const pendingAction: AgentUiAction = {
      id: 'review-queue-1',
      primaryCta: {
        href: '/publish/review?batch=69c2d469368c4314a3cfff32&filter=ready',
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
    expect(useAgentChatStore.getState().workEvents).toEqual([]);
  });

  it('dedupes analytics snapshot cards by type+title when ids differ', () => {
    useAgentChatStore.getState().addPendingUiActions([
      {
        id: 'analytics-1',
        title: 'Analytics summary (7d)',
        type: 'analytics_snapshot_card',
      },
    ]);

    useAgentChatStore.getState().finalizeStream({
      content: 'Here is your analytics',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'assistant-1',
      metadata: {
        uiActions: [
          {
            id: 'analytics-2',
            title: 'Analytics summary (7d)',
            type: 'analytics_snapshot_card',
          },
        ],
      },
      role: 'assistant',
      threadId: 'thread-1',
    });

    expect(
      useAgentChatStore.getState().messages[0]?.metadata?.uiActions,
    ).toHaveLength(1);
  });

  it('merges tool work events by toolCallId across lifecycle updates', () => {
    const store = useAgentChatStore.getState();
    store.addWorkEvent({
      createdAt: '2026-03-26T10:00:00.000Z',
      detail: 'Running get_analytics',
      event: AgentWorkEventType.TOOL_STARTED,
      id: 'call-1',
      label: 'get_analytics',
      status: AgentWorkEventStatus.RUNNING,
      threadId: 'thread-1',
      toolCallId: 'call-1',
      toolName: 'get_analytics',
    });
    store.addWorkEvent({
      createdAt: '2026-03-26T10:00:01.000Z',
      detail: 'get_analytics completed',
      event: AgentWorkEventType.TOOL_COMPLETED,
      id: 'call-1',
      label: 'get_analytics',
      progress: 100,
      status: AgentWorkEventStatus.COMPLETED,
      threadId: 'thread-1',
      toolCallId: 'call-1',
      toolName: 'get_analytics',
    });

    expect(useAgentChatStore.getState().workEvents).toHaveLength(1);
    expect(useAgentChatStore.getState().workEvents[0]).toMatchObject({
      progress: 100,
      status: AgentWorkEventStatus.COMPLETED,
      toolCallId: 'call-1',
    });
  });
});

describe('agent-chat.store stream item upserts', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it('updates duplicate active tool calls instead of appending them', () => {
    const store = useAgentChatStore.getState();

    store.addActiveToolCall({
      arguments: {},
      id: 'call-1',
      name: 'generate',
      status: 'running',
    });
    store.addActiveToolCall({
      arguments: {},
      detail: 'Completed',
      id: 'call-1',
      name: 'generate',
      status: 'completed',
    });

    expect(useAgentChatStore.getState().stream.activeToolCalls).toEqual([
      {
        arguments: {},
        detail: 'Completed',
        id: 'call-1',
        name: 'generate',
        status: 'completed',
      },
    ]);
  });

  it('updates duplicate pending UI actions instead of appending them', () => {
    const store = useAgentChatStore.getState();

    store.addPendingUiActions([
      {
        id: 'action-1',
        title: 'Generate',
        type: 'generation_action_card',
      },
    ]);
    store.addPendingUiActions([
      {
        id: 'action-1',
        status: 'completed',
        title: 'Generate',
        type: 'generation_action_card',
      },
    ]);

    expect(useAgentChatStore.getState().stream.pendingUiActions).toEqual([
      {
        id: 'action-1',
        status: 'completed',
        title: 'Generate',
        type: 'generation_action_card',
      },
    ]);
  });
});

describe('agent-chat.store upsertThread', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  function makeThread(id: string) {
    return {
      contextVersion: 1,
      createdAt: '2026-03-26T10:00:00.000Z',
      id,
      status: AgentThreadStatus.ACTIVE,
      title: 'Thread',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };
  }

  it('inserts and updates threads with valid ids', () => {
    useAgentChatStore.getState().upsertThread(makeThread('t-1'));
    useAgentChatStore
      .getState()
      .upsertThread({ ...makeThread('t-1'), title: 'Renamed' });

    expect(useAgentChatStore.getState().threads).toHaveLength(1);
    expect(useAgentChatStore.getState().threads[0]?.title).toBe('Renamed');
  });

  it('ignores threads without a usable id', () => {
    useAgentChatStore
      .getState()
      .upsertThread(makeThread(undefined as unknown as string));
    useAgentChatStore.getState().upsertThread(makeThread('undefined'));
    useAgentChatStore.getState().upsertThread(makeThread(''));

    expect(useAgentChatStore.getState().threads).toHaveLength(0);
  });
});
