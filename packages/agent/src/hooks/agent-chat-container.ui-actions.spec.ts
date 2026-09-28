import type {
  AgentChatMessage,
  AgentThread,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  AgentThreadMode,
  AgentThreadStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUiActionRunKey,
  type HandleUiActionDeps,
  handleAgentUiAction,
  hasPendingPlanReviewRun,
  resumePendingUiActionRuns,
  resumeUiActionRun,
  UI_ACTION_BACKGROUND_CAP_MS,
  UI_ACTION_BACKGROUND_INITIAL_DELAY_MS,
  UI_ACTION_PENDING_NOTICE,
  UI_ACTION_RECONCILE_MESSAGE_LIMIT,
  UI_ACTION_RECONCILE_POLL_INTERVAL_MS,
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

/**
 * The reply the acknowledged run persists: the server stamps every run reply
 * with `metadata.runId` = the ack's `executionId`
 * (`AgentOrchestratorUiActionFinalizerService`, `buildPersistedAgentResponseMetadata`).
 */
function makeRecoveredMessage(
  overrides: Partial<AgentChatMessage> = {},
): AgentChatMessage {
  const { metadata, ...rest } = overrides;
  return {
    content: 'Done.',
    createdAt: '2026-03-20T10:05:00.000Z',
    id: 'assistant-recovered-1',
    role: 'assistant',
    threadId: 'thread-1',
    ...rest,
    metadata: { runId: 'exec-1', ...metadata },
  } as AgentChatMessage;
}

function makeHistoricalMessages(count: number): AgentChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    content: `Historical message ${index}`,
    createdAt: new Date(Date.UTC(2026, 2, 1, 0, index)).toISOString(),
    id: `history-${index}`,
    // Older turns carry their own run ids, or none at all (pre-stamping rows).
    metadata: index % 4 === 1 ? { runId: `exec-old-${index}` } : {},
    role: index % 2 === 0 ? 'user' : 'assistant',
    threadId: 'thread-1',
  })) as AgentChatMessage[];
}

function makeExecution(
  status: WorkflowExecutionStatus,
  overrides: Record<string, unknown> = {},
) {
  return { id: 'exec-1', status, ...overrides };
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
      getWorkflowExecution: vi
        .fn()
        .mockResolvedValue(makeExecution(WorkflowExecutionStatus.RUNNING)),
      respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
    } as unknown as AgentApiService,
    draftAgentMode: AgentThreadMode.MANUAL,
    followLatestTurn: vi.fn(),
    isBusy: false,
    isReadOnly: false,
    latestProposedPlan: null,
    reconcilingRuns: new Map(),
    sendMessage: vi.fn(),
    setActiveThread: vi.fn(),
    setActiveUiAction: vi.fn(),
    setCreditsRemaining: vi.fn(),
    setError: vi.fn(),
    setLatestProposedPlan: vi.fn(),
    signal: new AbortController().signal,
    threads: [makeThread('thread-1')],
    upsertThread: vi.fn(),
    ...overrides,
  };
}

describe('handleAgentUiAction', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.setState({ activeThreadId: 'thread-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
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
        title: 'Approve change',
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
              { id: 'unrelated', title: 'Next steps', type: 'next_steps_card' },
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
    expect(getMessages).toHaveBeenCalledWith(
      'thread-1',
      { limit: UI_ACTION_RECONCILE_MESSAGE_LIMIT },
      expect.any(AbortSignal),
    );
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

  it('reports a pending outcome, not completion, when no result arrives in the window', async () => {
    vi.useFakeTimers();
    const deps = makeDeps({
      apiService: {
        getCreditsInfo: vi
          .fn()
          .mockResolvedValue({ balance: 0, modelAccess: {}, modelCosts: {} }),
        // No reply for this run ever appears and the execution keeps running.
        getMessages: vi.fn().mockResolvedValue([]),
        getThread: vi.fn().mockResolvedValue(makeThread('thread-1')),
        getWorkflowExecution: vi
          .fn()
          .mockResolvedValue(makeExecution(WorkflowExecutionStatus.RUNNING)),
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

    // Accepted but unconfirmed: neither success nor failure. The run stays
    // recorded as pending for the background reconciliation.
    expect(result).toBe('pending');
    expect(deps.setError).toHaveBeenCalledWith(UI_ACTION_PENDING_NOTICE);
    expect(
      useAgentChatStore.getState().uiActionRuns[
        getUiActionRunKey('thread-1', 'confirm_save_brand_voice_profile', {
          sourceActionId: 'brand-voice-card-1',
        })
      ],
    ).toMatchObject({ executionId: 'exec-1', status: 'pending' });
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
  describe('reconciliation correlates with the acknowledged execution', () => {
    it('ignores older assistant replies outside the hydrated 50-message window', async () => {
      vi.useFakeTimers();
      // The server holds 100 messages; the client hydrated only the latest 50.
      const history = makeHistoricalMessages(100);
      useAgentChatStore.getState().setMessages(history.slice(50));
      const reply = makeRecoveredMessage({
        content: 'Saved the brand voice.',
        id: 'reply-exec-1',
      });
      const getMessages = vi
        .fn()
        .mockResolvedValueOnce(history)
        .mockResolvedValue([...history, reply]);
      const deps = makeDeps({
        addMessage: (message) =>
          useAgentChatStore.getState().addMessage(message),
        apiService: {
          getCreditsInfo: vi
            .fn()
            .mockResolvedValue({ balance: 5, modelAccess: {}, modelCosts: {} }),
          getMessages,
          getThread: vi.fn().mockResolvedValue(makeThread('thread-1')),
          getWorkflowExecution: vi
            .fn()
            .mockResolvedValue(makeExecution(WorkflowExecutionStatus.RUNNING)),
          respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
        } as unknown as AgentApiService,
      });

      const resultPromise = handleAgentUiAction(
        'confirm_save_brand_voice_profile',
        undefined,
        deps,
      );
      await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_POLL_INTERVAL_MS);
      const result = await resultPromise;

      expect(result).toBe(true);
      expect(getMessages).toHaveBeenCalledTimes(2);
      const messages = useAgentChatStore.getState().messages;
      expect(messages).toHaveLength(51);
      expect(messages.at(-1)).toMatchObject({
        content: 'Saved the brand voice.',
        id: 'reply-exec-1',
      });
      expect(
        messages.filter((message) => message.id.startsWith('history-')),
      ).toHaveLength(50);
    });

    it('reports failure when the execution fails without a reply', async () => {
      seedUiAction('brand-voice-card-1');
      const deps = makeDeps({
        apiService: {
          getCreditsInfo: vi.fn(),
          getMessages: vi.fn().mockResolvedValue(makeHistoricalMessages(4)),
          getThread: vi.fn(),
          getWorkflowExecution: vi.fn().mockResolvedValue(
            makeExecution(WorkflowExecutionStatus.FAILED, {
              error: 'Brand voice could not be saved.',
            }),
          ),
          respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
        } as unknown as AgentApiService,
      });

      const result = await handleAgentUiAction(
        'confirm_save_brand_voice_profile',
        { sourceActionId: 'brand-voice-card-1' },
        deps,
      );

      expect(result).toBe(false);
      expect(deps.setError).toHaveBeenLastCalledWith(
        'Brand voice could not be saved.',
      );
      expect(deps.addMessage).not.toHaveBeenCalled();
      expect(
        useAgentChatStore.getState().messages[0]?.metadata?.uiActions?.[0]
          ?.status,
      ).toBeUndefined();
    });

    it('treats a cancelled execution as a failure', async () => {
      const deps = makeDeps({
        apiService: {
          getMessages: vi.fn().mockResolvedValue([]),
          getWorkflowExecution: vi
            .fn()
            .mockResolvedValue(
              makeExecution(WorkflowExecutionStatus.CANCELLED),
            ),
          respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
        } as unknown as AgentApiService,
      });

      const result = await handleAgentUiAction('start_interview', {}, deps);

      expect(result).toBe(false);
      expect(deps.setError).toHaveBeenLastCalledWith(
        'The action failed before it finished.',
      );
    });

    it('completes a run that finished without a reply of its own', async () => {
      seedUiAction('brand-voice-card-1');
      const deps = makeDeps({
        apiService: {
          getCreditsInfo: vi
            .fn()
            .mockResolvedValue({ balance: 7, modelAccess: {}, modelCosts: {} }),
          getMessages: vi.fn().mockResolvedValue(makeHistoricalMessages(4)),
          getThread: vi.fn().mockResolvedValue(makeThread('thread-1')),
          getWorkflowExecution: vi
            .fn()
            .mockResolvedValue(
              makeExecution(WorkflowExecutionStatus.COMPLETED),
            ),
          respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
        } as unknown as AgentApiService,
      });

      const result = await handleAgentUiAction(
        'confirm_save_brand_voice_profile',
        { sourceActionId: 'brand-voice-card-1' },
        deps,
      );

      expect(result).toBe(true);
      expect(deps.addMessage).not.toHaveBeenCalled();
      expect(deps.setCreditsRemaining).toHaveBeenCalledWith(7);
      expect(
        useAgentChatStore.getState().messages[0]?.metadata?.uiActions?.[0]
          ?.status,
      ).toBe('completed');
    });

    it('retries a transient read error instead of failing an accepted action', async () => {
      vi.useFakeTimers();
      const deps = makeDeps({
        apiService: {
          getCreditsInfo: vi
            .fn()
            .mockResolvedValue({ balance: 0, modelAccess: {}, modelCosts: {} }),
          getMessages: vi
            .fn()
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValue([makeRecoveredMessage()]),
          getThread: vi.fn().mockResolvedValue(makeThread('thread-1')),
          getWorkflowExecution: vi.fn(),
          respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
        } as unknown as AgentApiService,
      });

      const resultPromise = handleAgentUiAction('start_interview', {}, deps);
      await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_POLL_INTERVAL_MS);

      expect(await resultPromise).toBe(true);
      expect(deps.setError).not.toHaveBeenCalledWith('network down');
      expect(deps.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'assistant-recovered-1' }),
      );
    });
  });

  describe('delayed results and navigation', () => {
    function makeDelayedApi(reply: AgentChatMessage) {
      let isReplyPersisted = false;
      const getMessages = vi.fn(async () =>
        isReplyPersisted ? [reply] : ([] as AgentChatMessage[]),
      );
      return {
        api: {
          getCreditsInfo: vi
            .fn()
            .mockResolvedValue({ balance: 3, modelAccess: {}, modelCosts: {} }),
          getMessages,
          getThread: vi.fn().mockResolvedValue(makeThread('thread-1')),
          getWorkflowExecution: vi
            .fn()
            .mockResolvedValue(makeExecution(WorkflowExecutionStatus.RUNNING)),
          respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
        } as unknown as AgentApiService,
        getMessages,
        persistReply: () => {
          isReplyPersisted = true;
        },
      };
    }

    function seedThreadBConversation(): void {
      useAgentChatStore.setState({
        activeThreadId: 'thread-2',
        latestProposedPlan: null,
        messages: [
          {
            content: 'Thread B message',
            createdAt: '2026-03-20T11:00:00.000Z',
            id: 'thread-2-message',
            role: 'assistant',
            threadId: 'thread-2',
          } as AgentChatMessage,
        ],
      });
    }

    it('stops on a thread switch and never writes the result into the new thread', async () => {
      vi.useFakeTimers();
      const reply = makeRecoveredMessage({ id: 'reply-exec-1' });
      const { api, getMessages, persistReply } = makeDelayedApi(reply);
      const controller = new AbortController();
      useAgentChatStore.setState({
        conversationCacheByThread: {
          'thread-1': {
            cachedAt: Date.now(),
            error: null,
            hasMoreMessages: false,
            latestProposedPlan: null,
            messages: [],
            messagesCursor: null,
            pendingInputRequest: null,
            workEvents: [],
          },
        },
      });
      const deps = makeDeps({
        addMessage: (message) =>
          useAgentChatStore.getState().addMessage(message),
        apiService: api,
        signal: controller.signal,
      });

      const resultPromise = handleAgentUiAction('approve_plan', {}, deps);
      await vi.advanceTimersByTimeAsync(0);
      expect(getMessages).toHaveBeenCalledTimes(1);

      // The user opens thread B; the container aborts A's reconciliation.
      seedThreadBConversation();
      controller.abort();
      persistReply();
      await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_TIMEOUT_MS);

      expect(await resultPromise).toBe('pending');
      expect(getMessages).toHaveBeenCalledTimes(1);
      // Left pending for the next visit to resume.
      expect(
        useAgentChatStore.getState().uiActionRuns[
          getUiActionRunKey('thread-1', 'approve_plan', {})
        ]?.status,
      ).toBe('pending');
      expect(useAgentChatStore.getState().messages).toEqual([
        expect.objectContaining({ id: 'thread-2-message' }),
      ]);
      expect(deps.setLatestProposedPlan).not.toHaveBeenCalled();
      expect(deps.setError).not.toHaveBeenCalledWith(expect.any(String));
      expect(deps.setCreditsRemaining).not.toHaveBeenCalled();
      expect(deps.upsertThread).not.toHaveBeenCalled();
      // A's stale cached transcript is dropped so returning re-hydrates it.
      expect(
        useAgentChatStore.getState().conversationCacheByThread['thread-1'],
      ).toBeUndefined();
    });

    it('writes nothing when the thread changed before the abort propagated', async () => {
      const reply = makeRecoveredMessage({ id: 'reply-exec-1' });
      const deps = makeDeps({
        addMessage: (message) =>
          useAgentChatStore.getState().addMessage(message),
        apiService: {
          ...makeDelayedApi(reply).api,
          // The switch lands while the reply read is in flight.
          getMessages: vi.fn(async () => {
            seedThreadBConversation();
            return [reply];
          }),
        } as unknown as AgentApiService,
      });

      const result = await handleAgentUiAction('approve_plan', {}, deps);

      // The result is known, so the run settles, but nothing lands in B.
      expect(result).toBe(true);
      expect(
        useAgentChatStore.getState().uiActionRuns[
          getUiActionRunKey('thread-1', 'approve_plan', {})
        ]?.status,
      ).toBe('completed');
      expect(useAgentChatStore.getState().messages).toEqual([
        expect.objectContaining({ id: 'thread-2-message' }),
      ]);
      expect(deps.setLatestProposedPlan).not.toHaveBeenCalled();
    });

    it('does not duplicate a reply already hydrated when returning to the thread', async () => {
      vi.useFakeTimers();
      const reply = makeRecoveredMessage({
        content: 'Plan approved.',
        id: 'reply-exec-1',
      });
      const { api, persistReply } = makeDelayedApi(reply);
      const deps = makeDeps({
        addMessage: (message) =>
          useAgentChatStore.getState().addMessage(message),
        apiService: api,
      });

      const resultPromise = handleAgentUiAction('approve_plan', {}, deps);
      await vi.advanceTimersByTimeAsync(0);

      // Thread A is re-hydrated from the server, which already holds the reply.
      persistReply();
      useAgentChatStore.getState().setMessages([
        {
          content: 'Earlier message',
          createdAt: '2026-03-20T10:00:00.000Z',
          id: 'earlier',
          role: 'user',
          threadId: 'thread-1',
        } as AgentChatMessage,
        reply,
      ]);
      await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_POLL_INTERVAL_MS);

      expect(await resultPromise).toBe(true);
      const ids = useAgentChatStore
        .getState()
        .messages.map((message) => message.id);
      expect(ids).toEqual(['earlier', 'reply-exec-1']);
    });
  });
  describe('after the foreground window', () => {
    function makeSlowApi() {
      let reply: AgentChatMessage | null = null;
      let executionStatus = WorkflowExecutionStatus.RUNNING;
      let executionError: string | undefined;
      const api = {
        getCreditsInfo: vi
          .fn()
          .mockResolvedValue({ balance: 9, modelAccess: {}, modelCosts: {} }),
        getMessages: vi.fn(async () => (reply ? [reply] : [])),
        getThread: vi.fn().mockResolvedValue(makeThread('thread-1')),
        getWorkflowExecution: vi.fn(async () =>
          makeExecution(executionStatus, { error: executionError }),
        ),
        respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
      } as unknown as AgentApiService;
      return {
        api,
        complete: (message: AgentChatMessage) => {
          reply = message;
          executionStatus = WorkflowExecutionStatus.COMPLETED;
        },
        fail: (error: string) => {
          executionStatus = WorkflowExecutionStatus.FAILED;
          executionError = error;
        },
      };
    }

    const runKey =
      'thread-1:confirm_save_brand_voice_profile:brand-voice-card-1';

    it('keeps reconciling and settles a completion that lands after the timeout', async () => {
      vi.useFakeTimers();
      seedUiAction('brand-voice-card-1');
      const slow = makeSlowApi();
      const setError = vi.fn((error: string | null) =>
        useAgentChatStore.getState().setError(error),
      );
      const deps = makeDeps({
        addMessage: (message) =>
          useAgentChatStore.getState().addMessage(message),
        apiService: slow.api,
        setError,
      });

      const resultPromise = handleAgentUiAction(
        'confirm_save_brand_voice_profile',
        { sourceActionId: 'brand-voice-card-1' },
        deps,
      );
      await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_TIMEOUT_MS + 1_000);
      expect(await resultPromise).toBe('pending');

      slow.complete(makeRecoveredMessage({ content: 'Brand voice saved.' }));
      await vi.advanceTimersByTimeAsync(UI_ACTION_BACKGROUND_INITIAL_DELAY_MS);

      expect(useAgentChatStore.getState().uiActionRuns[runKey]?.status).toBe(
        'completed',
      );
      expect(useAgentChatStore.getState().messages.at(-1)).toMatchObject({
        content: 'Brand voice saved.',
      });
      expect(
        useAgentChatStore.getState().messages[0]?.metadata?.uiActions?.[0]
          ?.status,
      ).toBe('completed');
      // The "taking longer" notice clears once the result lands.
      expect(useAgentChatStore.getState().error).toBeNull();
    });

    it('records a failure that lands after the timeout', async () => {
      vi.useFakeTimers();
      seedUiAction('brand-voice-card-1');
      const slow = makeSlowApi();
      const deps = makeDeps({ apiService: slow.api });

      const resultPromise = handleAgentUiAction(
        'confirm_save_brand_voice_profile',
        { sourceActionId: 'brand-voice-card-1' },
        deps,
      );
      await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_TIMEOUT_MS + 1_000);
      expect(await resultPromise).toBe('pending');

      slow.fail('Brand voice could not be saved.');
      await vi.advanceTimersByTimeAsync(UI_ACTION_BACKGROUND_INITIAL_DELAY_MS);

      expect(useAgentChatStore.getState().uiActionRuns[runKey]).toMatchObject({
        error: 'Brand voice could not be saved.',
        status: 'failed',
      });
      expect(deps.setError).toHaveBeenLastCalledWith(
        'Brand voice could not be saved.',
      );
      expect(deps.addMessage).not.toHaveBeenCalled();
    });

    it('stops at the cap and leaves the run pending', async () => {
      vi.useFakeTimers();
      const slow = makeSlowApi();
      const deps = makeDeps({ apiService: slow.api });

      const resultPromise = handleAgentUiAction(
        'confirm_save_brand_voice_profile',
        { sourceActionId: 'brand-voice-card-1' },
        deps,
      );
      await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_TIMEOUT_MS + 1_000);
      await resultPromise;
      await vi.advanceTimersByTimeAsync(UI_ACTION_BACKGROUND_CAP_MS + 60_000);
      const callsAtCap = vi.mocked(slow.api.getMessages).mock.calls.length;
      await vi.advanceTimersByTimeAsync(10 * 60_000);

      expect(vi.mocked(slow.api.getMessages).mock.calls.length).toBe(
        callsAtCap,
      );
      expect(useAgentChatStore.getState().uiActionRuns[runKey]?.status).toBe(
        'pending',
      );
    });

    it('resumes a run left pending when its thread is shown again', async () => {
      seedUiAction('brand-voice-card-1');
      const slow = makeSlowApi();
      slow.complete(makeRecoveredMessage({ content: 'Saved while away.' }));
      const run = {
        action: 'confirm_save_brand_voice_profile',
        executionId: 'exec-1',
        key: runKey,
        payload: { sourceActionId: 'brand-voice-card-1' },
        status: 'pending' as const,
        threadId: 'thread-1',
      };
      useAgentChatStore.getState().setUiActionRun(run);
      const deps = makeDeps({
        addMessage: (message) =>
          useAgentChatStore.getState().addMessage(message),
        apiService: slow.api,
      });

      await resumeUiActionRun(run, deps);

      expect(useAgentChatStore.getState().uiActionRuns[runKey]?.status).toBe(
        'completed',
      );
      expect(useAgentChatStore.getState().messages.at(-1)).toMatchObject({
        content: 'Saved while away.',
      });
    });
  });

  describe('source cards the server updates in place', () => {
    it('takes a generation decision from the persisted proposal message, not the reply', async () => {
      const proposal = {
        data: { decision: 'pending', sourceActionId: 'generation-card-1' },
        generationType: 'image' as const,
        id: 'generation-card-1',
        title: 'Generate image',
        type: 'generation_action_card' as const,
      };
      useAgentChatStore.getState().setMessages([
        {
          content: 'Here is a generation proposal.',
          createdAt: '2026-03-20T10:00:00.000Z',
          id: 'proposal-message',
          metadata: { uiActions: [proposal] },
          role: 'assistant',
          threadId: 'thread-1',
        } as AgentChatMessage,
      ]);
      useAgentChatStore.setState({
        conversationCacheByThread: {
          'thread-1': {
            cachedAt: Date.now(),
            error: null,
            hasMoreMessages: false,
            latestProposedPlan: null,
            messages: useAgentChatStore.getState().messages,
            messagesCursor: null,
            pendingInputRequest: null,
            workEvents: [],
          },
        },
      });
      // The real REST shape: `AgentGenerationDecisionService.transition`
      // writes the decision onto the proposal message; the persisted reply
      // carries no decision card (`withGenerationDecision` only decorates the
      // in-process result).
      const deps = makeDeps({
        addMessage: (message) =>
          useAgentChatStore.getState().addMessage(message),
        apiService: {
          ...makeDeps().apiService,
          getMessages: vi.fn().mockResolvedValue([
            {
              content: 'Here is a generation proposal.',
              createdAt: '2026-03-20T10:00:00.000Z',
              id: 'proposal-message',
              metadata: {
                uiActions: [
                  {
                    ...proposal,
                    data: { ...proposal.data, decision: 'declined' },
                  },
                ],
              },
              role: 'assistant',
              threadId: 'thread-1',
            },
            makeRecoveredMessage({
              content: 'Generation declined. No credits were charged.',
              id: 'decline-reply',
              metadata: { uiActions: [] },
            }),
          ]),
        } as unknown as AgentApiService,
      });

      const result = await handleAgentUiAction(
        'decline_generate_media',
        { sourceActionId: 'generation-card-1' },
        deps,
      );

      expect(result).toBe(true);
      const [proposalMessage, reply] = useAgentChatStore.getState().messages;
      expect(proposalMessage?.metadata?.uiActions?.[0]?.data).toMatchObject({
        decision: 'declined',
      });
      expect(reply).toMatchObject({ id: 'decline-reply' });
      // A cached remount must not bring back the undecided card.
      expect(
        useAgentChatStore.getState().conversationCacheByThread['thread-1'],
      ).toBeUndefined();
    });
  });
});

describe('duplicate submissions while a run is pending', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.setState({ activeThreadId: 'thread-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeRunningApi() {
    return {
      getCreditsInfo: vi
        .fn()
        .mockResolvedValue({ balance: 0, modelAccess: {}, modelCosts: {} }),
      getMessages: vi.fn().mockResolvedValue([]),
      getThread: vi.fn().mockResolvedValue(makeThread('thread-1')),
      getWorkflowExecution: vi
        .fn()
        .mockResolvedValue(makeExecution(WorkflowExecutionStatus.RUNNING)),
      respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
    } as unknown as AgentApiService;
  }

  it('does not execute a plan again when its approval outlives the foreground window', async () => {
    vi.useFakeTimers();
    const apiService = makeRunningApi();
    const reconcilingRuns = new Map<string, AbortSignal>();
    const deps = () => makeDeps({ apiService, reconcilingRuns });

    const first = handleAgentUiAction(
      'approve_plan',
      { planId: 'plan-1' },
      deps(),
    );
    await vi.advanceTimersByTimeAsync(UI_ACTION_RECONCILE_TIMEOUT_MS + 1_000);
    expect(await first).toBe('pending');

    // The active ui-action lock is released, but the plan is still executing.
    const approveAgain = await handleAgentUiAction(
      'approve_plan',
      { planId: 'plan-1' },
      deps(),
    );
    const reviseMeanwhile = await handleAgentUiAction(
      'revise_plan',
      { planId: 'plan-1', revisionNote: 'Shorter' },
      deps(),
    );

    expect(approveAgain).toBe('pending');
    expect(reviseMeanwhile).toBe('pending');
    expect(apiService.respondToUiAction).toHaveBeenCalledTimes(1);
  });

  it('does not resubmit a card action whose run is still pending', async () => {
    const apiService = makeRunningApi();
    const payload = { sourceActionId: 'publish-card-1' };
    useAgentChatStore.getState().setUiActionRun({
      action: 'confirm_publish_post',
      executionId: 'exec-1',
      key: getUiActionRunKey('thread-1', 'confirm_publish_post', payload),
      payload,
      status: 'pending',
      threadId: 'thread-1',
    });
    const deps = makeDeps({ apiService });

    const result = await handleAgentUiAction(
      'confirm_publish_post',
      payload,
      deps,
    );

    expect(result).toBe('pending');
    expect(apiService.respondToUiAction).not.toHaveBeenCalled();
    expect(deps.setActiveUiAction).not.toHaveBeenCalled();
  });

  it('scopes a pending plan review to its thread and plan', () => {
    const run = {
      action: 'approve_plan',
      executionId: 'exec-1',
      key: getUiActionRunKey('thread-1', 'approve_plan', { planId: 'plan-1' }),
      payload: { planId: 'plan-1' },
      status: 'pending' as const,
      threadId: 'thread-1',
    };
    const runs = { [run.key]: run };

    expect(hasPendingPlanReviewRun(runs, 'thread-1', 'plan-1')).toBe(true);
    expect(hasPendingPlanReviewRun(runs, 'thread-1', 'plan-2')).toBe(false);
    expect(hasPendingPlanReviewRun(runs, 'thread-2', 'plan-1')).toBe(false);
    expect(
      hasPendingPlanReviewRun(
        { [run.key]: { ...run, status: 'completed' as const } },
        'thread-1',
        'plan-1',
      ),
    ).toBe(false);
  });
});

describe('reconciling runs registered on the visible thread', () => {
  const payload = { sourceActionId: 'publish-card-1' };
  const runKey = getUiActionRunKey('thread-1', 'confirm_publish_post', payload);

  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.setState({ activeThreadId: 'thread-1' });
  });

  function makeCompletingApi() {
    return {
      getCreditsInfo: vi
        .fn()
        .mockResolvedValue({ balance: 5, modelAccess: {}, modelCosts: {} }),
      getMessages: vi
        .fn()
        .mockResolvedValue([makeRecoveredMessage({ content: 'Published.' })]),
      getThread: vi.fn().mockResolvedValue(makeThread('thread-1')),
      getWorkflowExecution: vi
        .fn()
        .mockResolvedValue(makeExecution(WorkflowExecutionStatus.COMPLETED)),
      respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
    } as unknown as AgentApiService;
  }

  it('leaves a run acked after its submitter was aborted unclaimed, then settles it once resumed', async () => {
    const apiService = makeCompletingApi();
    const reconcilingRuns = new Map<string, AbortSignal>();
    const submitter = new AbortController();
    submitter.abort();

    const result = await handleAgentUiAction(
      'confirm_publish_post',
      payload,
      makeDeps({ apiService, reconcilingRuns, signal: submitter.signal }),
    );
    expect(result).toBe('pending');
    expect(useAgentChatStore.getState().uiActionRuns[runKey]?.status).toBe(
      'pending',
    );
    expect(reconcilingRuns.has('exec-1')).toBe(false);

    const createDeps = vi.fn(() => makeDeps({ apiService, reconcilingRuns }));
    resumePendingUiActionRuns(
      useAgentChatStore.getState().uiActionRuns,
      'thread-1',
      reconcilingRuns,
      createDeps,
    );
    // The same run is not reconciled twice while its reconciler is live.
    resumePendingUiActionRuns(
      useAgentChatStore.getState().uiActionRuns,
      'thread-1',
      reconcilingRuns,
      createDeps,
    );
    expect(createDeps).toHaveBeenCalledTimes(1);

    await vi.waitFor(() =>
      expect(useAgentChatStore.getState().uiActionRuns[runKey]?.status).toBe(
        'completed',
      ),
    );
    expect(reconcilingRuns.has('exec-1')).toBe(false);
  });

  it('does not start a second reconciler for a run its submitter is reconciling', async () => {
    let resolveMessages: (messages: AgentChatMessage[]) => void = () => {};
    const apiService = {
      ...makeCompletingApi(),
      getMessages: vi.fn(
        () =>
          new Promise<AgentChatMessage[]>((resolve) => {
            resolveMessages = resolve;
          }),
      ),
    } as unknown as AgentApiService;
    const reconcilingRuns = new Map<string, AbortSignal>();

    const result = handleAgentUiAction(
      'confirm_publish_post',
      payload,
      makeDeps({ apiService, reconcilingRuns }),
    );
    await vi.waitFor(() => expect(apiService.getMessages).toHaveBeenCalled());

    const createDeps = vi.fn(() => makeDeps({ apiService, reconcilingRuns }));
    resumePendingUiActionRuns(
      useAgentChatStore.getState().uiActionRuns,
      'thread-1',
      reconcilingRuns,
      createDeps,
    );
    expect(createDeps).not.toHaveBeenCalled();

    resolveMessages([makeRecoveredMessage({ content: 'Published.' })]);
    expect(await result).toBe(true);
    expect(reconcilingRuns.has('exec-1')).toBe(false);
  });

  it('takes over a run whose reconciler was aborted', () => {
    const apiService = makeCompletingApi();
    const stale = new AbortController();
    stale.abort();
    const reconcilingRuns = new Map<string, AbortSignal>([
      ['exec-1', stale.signal],
    ]);
    useAgentChatStore.getState().setUiActionRun({
      action: 'confirm_publish_post',
      executionId: 'exec-1',
      key: runKey,
      payload,
      status: 'pending',
      threadId: 'thread-1',
    });

    const createDeps = vi.fn(() => makeDeps({ apiService, reconcilingRuns }));
    resumePendingUiActionRuns(
      useAgentChatStore.getState().uiActionRuns,
      'thread-1',
      reconcilingRuns,
      createDeps,
    );

    expect(createDeps).toHaveBeenCalledTimes(1);
    expect(reconcilingRuns.get('exec-1')).not.toBe(stale.signal);
  });
});
