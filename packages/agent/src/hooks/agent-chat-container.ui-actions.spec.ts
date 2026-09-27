import type {
  AgentChatMessage,
  AgentThread,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadMode, AgentThreadStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type HandleUiActionDeps,
  handleAgentUiAction,
  UI_ACTION_RECONCILE_TIMEOUT_MS,
} from './agent-chat-container.ui-actions';
import { AGENT_DRAFT_SUGGESTION_EVENT } from './use-agent-draft-context';

function makeThread(
  id: string,
  overrides: Partial<AgentThread> = {},
): AgentThread {
  return {
    brandId: 'brand-1',
    contextVersion: 3,
    createdAt: '2026-03-20T10:00:00.000Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title: 'Thread',
    updatedAt: '2026-03-20T10:00:00.000Z',
    ...overrides,
  } as AgentThread;
}

/**
 * `POST .../ui-actions` (`AgentOrchestratorService.handleThreadUiAction`)
 * only enqueues a workflow and acks `{executionId, status, threadId}` — it
 * never carries a `message`. Real assertion coverage for this file means
 * mocking exactly that ack, not the synchronous shape the client used to
 * (incorrectly) assume.
 */
function makeAck(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'exec-1',
    status: 'queued' as const,
    threadId: 'thread-1',
    ...overrides,
  };
}

function makeRecoveredMessage(
  overrides: Partial<AgentChatMessage> = {},
): AgentChatMessage {
  return {
    content: 'Done.',
    createdAt: '2026-03-20T10:05:00.000Z',
    id: 'assistant-recovered-1',
    metadata: {},
    role: 'assistant',
    threadId: 'thread-1',
    ...overrides,
  } as AgentChatMessage;
}

function seedUiAction(actionId: string): void {
  useAgentChatStore.getState().setMessages([
    {
      content: 'Review this action.',
      createdAt: '2026-03-20T10:00:00.000Z',
      id: 'message-1',
      metadata: {
        uiActions: [{ id: actionId, type: 'brand_voice_profile_card' }],
      },
      role: 'assistant',
      threadId: 'thread-1',
    } as AgentChatMessage,
  ]);
}

function makeDeps(
  overrides: Partial<HandleUiActionDeps> = {},
): HandleUiActionDeps {
  return {
    activeThreadId: 'thread-1',
    activeUiAction: null,
    addMessage: vi.fn(),
    apiService: {
      getCreditsInfo: vi
        .fn()
        .mockResolvedValue({ balance: 90, modelAccess: {}, modelCosts: {} }),
      getMessages: vi.fn().mockResolvedValue([makeRecoveredMessage()]),
      getThread: vi.fn().mockResolvedValue(
        makeThread('thread-1', {
          contextVersion: 4,
        }),
      ),
      respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
    } as unknown as AgentApiService,
    draftAgentMode: AgentThreadMode.MANUAL,
    followLatestTurn: vi.fn(),
    isBusy: false,
    isReadOnly: false,
    latestProposedPlan: null,
    sendMessage: vi.fn(),
    setActiveThread: vi.fn(),
    setActiveUiAction: vi.fn(),
    setCreditsRemaining: vi.fn(),
    setError: vi.fn(),
    setLatestProposedPlan: vi.fn(),
    threads: [makeThread('thread-1')],
    upsertThread: vi.fn(),
    ...overrides,
  };
}

describe('handleAgentUiAction', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it.each(
    (['completed', 'failed', 'cancelled'] as const).flatMap((executionStatus) =>
      [true, false].map((hasSource) => ({ executionStatus, hasSource })),
    ),
  )(
    'keeps one approval card after $executionStatus execution (source present: $hasSource)',
    async ({ executionStatus, hasSource }) => {
      const status = executionStatus === 'cancelled' ? 'declined' : 'approved';
      const sourceCard = {
        id: 'approval-card',
        type: 'mutation_approval_card' as const,
        data: {
          approvalId: 'approval-1',
          sourceActionId: 'approval-card',
          status: 'pending',
          summary: 'Delete draft?',
          items: [],
        },
      };
      useAgentChatStore.getState().setMessages([
        {
          id: 'source-message',
          threadId: 'thread-1',
          role: 'assistant',
          content: 'Review draft',
          createdAt: '2026-09-06T00:00:00Z',
          metadata: { uiActions: [sourceCard] },
        },
      ]);
      if (!hasSource) useAgentChatStore.getState().setMessages([]);
      const deps = makeDeps({
        addMessage: (message) =>
          useAgentChatStore.getState().addMessage(message),
      });
      const preExisting = useAgentChatStore.getState().messages;
      vi.mocked(deps.apiService.getMessages).mockResolvedValue([
        ...preExisting,
        makeRecoveredMessage({
          content: `The action ${executionStatus}.`,
          metadata: {
            uiActions: [
              { id: 'unrelated', type: 'next_steps_card' },
              {
                ...sourceCard,
                data: {
                  ...sourceCard.data,
                  status,
                  executionStatus,
                },
              },
            ],
          },
        }),
      ]);
      await handleAgentUiAction(
        executionStatus === 'cancelled'
          ? 'decline_mutation'
          : 'confirm_mutation',
        { approvalId: 'approval-1', sourceActionId: 'approval-card' },
        deps,
      );
      const cards = useAgentChatStore
        .getState()
        .messages.flatMap((message) => message.metadata?.uiActions ?? []);
      expect(
        cards.filter((card) => card.type === 'mutation_approval_card'),
      ).toHaveLength(1);
      expect(
        cards.find((card) => card.type === 'mutation_approval_card'),
      ).toMatchObject({
        data: { status, executionStatus },
        ...(hasSource ? { ctas: [] } : {}),
      });
      expect(cards.find((card) => card.id === 'unrelated')).toBeDefined();
    },
  );

  it('rejects actions on read-only threads', async () => {
    const deps = makeDeps({ isReadOnly: true });

    await handleAgentUiAction('anything', undefined, deps);

    expect(deps.setError).toHaveBeenCalledWith(
      'Archived threads are read-only.',
    );
  });

  it('send_prompt forwards the prompt into the composer', async () => {
    const deps = makeDeps();

    await handleAgentUiAction(
      'send_prompt',
      { prompt: '  Retry with a new angle  ' },
      deps,
    );

    expect(deps.followLatestTurn).toHaveBeenCalledWith('smooth');
    expect(deps.sendMessage).toHaveBeenCalledWith('Retry with a new angle');
    expect(deps.setActiveUiAction).toHaveBeenNthCalledWith(1, 'send_prompt');
    expect(deps.setActiveUiAction).toHaveBeenLastCalledWith(null);
  });

  it('silently ignores send_prompt while another action is pending', async () => {
    const deps = makeDeps({ activeUiAction: 'other_action' });

    await handleAgentUiAction(
      'send_prompt',
      { prompt: 'Retry with a new angle' },
      deps,
    );

    expect(deps.sendMessage).not.toHaveBeenCalled();
    expect(deps.setError).not.toHaveBeenCalled();
  });

  it('send_prompt without a prompt errors', async () => {
    const deps = makeDeps();

    await handleAgentUiAction('send_prompt', {}, deps);

    expect(deps.sendMessage).not.toHaveBeenCalled();
    expect(deps.setError).toHaveBeenCalledWith(
      'No follow-up prompt is available for this action.',
    );
  });

  it('apply_to_draft dispatches the draft suggestion event when handled', async () => {
    const deps = makeDeps();
    const listener = vi.fn((event: Event) => {
      event.preventDefault();
    });
    window.addEventListener(AGENT_DRAFT_SUGGESTION_EVENT, listener);

    await handleAgentUiAction(
      'apply_to_draft',
      { sourceAction: 'Rewrite', text: 'New copy' },
      deps,
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(deps.setError).toHaveBeenCalledWith(null);
    window.removeEventListener(AGENT_DRAFT_SUGGESTION_EVENT, listener);
  });

  it('apply_to_draft errors when no writing surface handles the event', async () => {
    const deps = makeDeps();

    await handleAgentUiAction('apply_to_draft', { text: 'New copy' }, deps);

    expect(deps.setError).toHaveBeenCalledWith(
      'Open a writing surface before applying text to a draft.',
    );
  });

  it('apply_to_draft with empty text errors', async () => {
    const deps = makeDeps();

    await handleAgentUiAction('apply_to_draft', { text: '  ' }, deps);

    expect(deps.setError).toHaveBeenCalledWith(
      'No generated text is available for this action.',
    );
  });

  it('errors without an active thread', async () => {
    const deps = makeDeps({ activeThreadId: null });

    await handleAgentUiAction('approve_plan', undefined, deps);

    expect(deps.setError).toHaveBeenCalledWith('No active thread selected.');
  });

  it('silently ignores concurrent UI actions', async () => {
    const deps = makeDeps({ activeUiAction: 'other_action' });

    await handleAgentUiAction('approve_plan', undefined, deps);

    expect(deps.setError).not.toHaveBeenCalled();
    expect(deps.apiService.respondToUiAction).not.toHaveBeenCalled();
  });

  it('runs a thread-bound action and reconciles the eventual message through the async ack', async () => {
    const respondToUiAction = vi.fn().mockResolvedValue(makeAck());
    const getMessages = vi
      .fn()
      .mockResolvedValue([makeRecoveredMessage({ content: 'Done.' })]);
    const getThread = vi
      .fn()
      .mockResolvedValue(makeThread('thread-1', { contextVersion: 4 }));
    const getCreditsInfo = vi
      .fn()
      .mockResolvedValue({ balance: 42, modelAccess: {}, modelCosts: {} });
    const deps = makeDeps({
      apiService: {
        getCreditsInfo,
        getMessages,
        getThread,
        respondToUiAction,
      } as unknown as AgentApiService,
    });

    await handleAgentUiAction('start_interview', { step: 1 }, deps);

    // The ack is the request-side contract only: it never carries a message,
    // credits, or context version — those come from the reconciliation below.
    expect(respondToUiAction).toHaveBeenCalledWith(
      'thread-1',
      'start_interview',
      { step: 1 },
      undefined,
      { brandId: 'brand-1', expectedContextVersion: 3 },
    );
    expect(getMessages).toHaveBeenCalledWith('thread-1', { limit: 100 });
    expect(deps.setActiveUiAction).toHaveBeenNthCalledWith(
      1,
      'start_interview',
    );
    expect(deps.setActiveUiAction).toHaveBeenLastCalledWith(null);
    expect(deps.setCreditsRemaining).toHaveBeenCalledWith(42);
    expect(deps.upsertThread).toHaveBeenCalledWith(
      expect.objectContaining({
        contextVersion: 4,
        id: 'thread-1',
        status: AgentThreadStatus.ACTIVE,
      }),
    );
    expect(deps.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Done.', role: 'assistant' }),
    );
    expect(deps.setLatestProposedPlan).toHaveBeenCalledWith(null);
  });

  it('marks the source UI action completed after the reconciled message arrives', async () => {
    const deps = makeDeps();
    seedUiAction('brand-voice-card-1');

    await handleAgentUiAction(
      'confirm_save_brand_voice_profile',
      { sourceActionId: 'brand-voice-card-1' },
      deps,
    );

    expect(
      useAgentChatStore.getState().messages[0]?.metadata?.uiActions?.[0]
        ?.status,
    ).toBe('completed');
  });

  it('does not resolve the source UI action while reconciliation is still pending', async () => {
    vi.useFakeTimers();
    const deps = makeDeps({
      apiService: {
        getCreditsInfo: vi
          .fn()
          .mockResolvedValue({ balance: 0, modelAccess: {}, modelCosts: {} }),
        // No new assistant message ever appears — the workflow never
        // produces a reply within the poll window.
        getMessages: vi.fn().mockResolvedValue([]),
        getThread: vi.fn().mockResolvedValue(makeThread('thread-1')),
        respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
      } as unknown as AgentApiService,
    });
    seedUiAction('brand-voice-card-1');

    const resultPromise = handleAgentUiAction(
      'confirm_save_brand_voice_profile',
      { sourceActionId: 'brand-voice-card-1' },
      deps,
    );
    await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_TIMEOUT_MS + 1_000);
    const result = await resultPromise;
    vi.useRealTimers();

    // Accepted, not failed: the workflow may still complete server-side.
    expect(result).toBe(true);
    expect(deps.setError).toHaveBeenCalledWith(
      expect.stringContaining('taking longer than expected'),
    );
    expect(deps.addMessage).not.toHaveBeenCalled();
    expect(
      useAgentChatStore.getState().messages[0]?.metadata?.uiActions?.[0]
        ?.status,
    ).toBeUndefined();
  });

  it('does not dispatch a delayed thread-list refresh after a UI action', async () => {
    const refreshListener = vi.fn();
    window.addEventListener('agent:threads:refresh', refreshListener);
    const deps = makeDeps();

    await handleAgentUiAction('start_interview', { step: 1 }, deps);

    expect(refreshListener).not.toHaveBeenCalled();
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(2000);
    expect(refreshListener).not.toHaveBeenCalled();
    vi.useRealTimers();
    window.removeEventListener('agent:threads:refresh', refreshListener);
  });

  it('switches the active thread when the response lands elsewhere', async () => {
    const deps = makeDeps({
      apiService: {
        getCreditsInfo: vi
          .fn()
          .mockResolvedValue({ balance: 0, modelAccess: {}, modelCosts: {} }),
        getMessages: vi
          .fn()
          .mockResolvedValue([makeRecoveredMessage({ threadId: 'thread-2' })]),
        getThread: vi.fn().mockResolvedValue(makeThread('thread-2')),
        respondToUiAction: vi
          .fn()
          .mockResolvedValue(makeAck({ threadId: 'thread-2' })),
      } as unknown as AgentApiService,
    });

    await handleAgentUiAction('start_interview', undefined, deps);

    expect(deps.setActiveThread).toHaveBeenCalledWith('thread-2');
  });

  it('approve_plan marks the current plan approved when none is returned', async () => {
    const plan = {
      awaitingApproval: true,
      planId: 'plan-1',
      status: 'proposed',
    } as unknown as HandleUiActionDeps['latestProposedPlan'];
    const deps = makeDeps({ latestProposedPlan: plan });

    await handleAgentUiAction('approve_plan', undefined, deps);

    expect(deps.setLatestProposedPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        awaitingApproval: false,
        lastReviewAction: 'approve',
        planId: 'plan-1',
        status: 'approved',
      }),
    );
  });

  it('surfaces API failures and clears the active action', async () => {
    seedUiAction('failed-source-action');
    const deps = makeDeps({
      apiService: {
        respondToUiAction: vi
          .fn()
          .mockRejectedValue(new Error('context conflict')),
      } as unknown as AgentApiService,
    });

    await handleAgentUiAction(
      'start_interview',
      { sourceActionId: 'failed-source-action' },
      deps,
    );

    expect(deps.setError).toHaveBeenCalledWith('context conflict');
    expect(deps.setActiveUiAction).toHaveBeenLastCalledWith(null);
    expect(deps.addMessage).not.toHaveBeenCalled();
    expect(
      useAgentChatStore.getState().messages[0]?.metadata?.uiActions?.[0]
        ?.status,
    ).toBeUndefined();
  });
});
