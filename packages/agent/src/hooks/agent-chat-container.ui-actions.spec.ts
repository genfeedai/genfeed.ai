import type { AgentRunHandoff } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findUiActionState,
  type HandleUiActionDeps,
  handleAgentUiAction,
  hasPendingPlanReview,
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
 * `POST .../ui-actions` only enqueues the run and acks
 * `{executionId, status, threadId}` — a log position, never a result.
 */
function makeAck(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'exec-1',
    status: 'queued' as const,
    threadId: 'thread-1',
    ...overrides,
  };
}

function makeHandoff(threadId = 'thread-1'): AgentRunHandoff {
  return {
    generation: 1,
    preAssistantIds: new Set(),
    previousPending: null,
    previousRunId: null,
    threadId,
  };
}

/**
 * The api double has no read methods: a ui-action must never poll messages or
 * its execution — its result arrives on the thread's event stream.
 */
function makeDeps(
  overrides: Partial<HandleUiActionDeps> = {},
): HandleUiActionDeps {
  return {
    activeThreadId: 'thread-1',
    activeUiAction: null,
    adoptRun: vi.fn(),
    apiService: {
      respondToUiAction: vi.fn().mockResolvedValue(makeAck()),
    } as unknown as AgentApiService,
    beginRunHandoff: vi.fn((threadId: string) => makeHandoff(threadId)),
    cancelRunHandoff: vi.fn(),
    followLatestTurn: vi.fn(),
    isBusy: false,
    isReadOnly: false,
    sendMessage: vi.fn(),
    setActiveUiAction: vi.fn(),
    setError: vi.fn(),
    threads: [makeThread('thread-1')],
    ...overrides,
  };
}

function uiActionStates(threadId = 'thread-1') {
  return useAgentChatStore.getState().uiActionStatesByThread[threadId];
}

describe('handleAgentUiAction', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.setState({ activeThreadId: 'thread-1' });
  });

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

  it('acks the command, tracks its run as pending and adopts it into the thread stream', async () => {
    const deps = makeDeps();
    const payload = { approvalId: 'approval-1', sourceActionId: 'card-1' };

    const outcome = await handleAgentUiAction(
      'confirm_mutation',
      payload,
      deps,
    );

    expect(outcome).toBe('pending');
    expect(deps.apiService.respondToUiAction).toHaveBeenCalledWith(
      'thread-1',
      'confirm_mutation',
      payload,
      undefined,
      { brandId: 'brand-1', expectedContextVersion: 3 },
    );
    const handoff = vi.mocked(deps.beginRunHandoff).mock.results[0]?.value;
    expect(deps.adoptRun).toHaveBeenCalledWith(handoff, 'exec-1', null, {
      requireRunId: true,
    });
    expect(
      findUiActionState(uiActionStates(), 'confirm_mutation', payload),
    ).toMatchObject({
      action: 'confirm_mutation',
      runId: 'exec-1',
      sourceId: 'card-1',
      status: 'pending',
    });
    expect(deps.setActiveUiAction).toHaveBeenNthCalledWith(
      1,
      'confirm_mutation',
    );
    expect(deps.setActiveUiAction).toHaveBeenLastCalledWith(null);
  });

  it('holds the thread events from before the request, so a result that outruns the ack is not lost', async () => {
    const order: string[] = [];
    const deps = makeDeps({
      adoptRun: vi.fn(() => order.push('adopt')),
      apiService: {
        respondToUiAction: vi.fn(async () => {
          order.push('post');
          return makeAck();
        }),
      } as unknown as AgentApiService,
      beginRunHandoff: vi.fn((threadId: string) => {
        order.push('hold');
        return makeHandoff(threadId);
      }),
    });

    await handleAgentUiAction('approve_plan', { planId: 'plan-1' }, deps);

    expect(order).toEqual(['hold', 'post', 'adopt']);
  });

  it('adopts a late ack for the thread it was sent from after the user left and came back', async () => {
    let resolveAck: (ack: ReturnType<typeof makeAck>) => void = () => {};
    const deps = makeDeps({
      apiService: {
        respondToUiAction: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveAck = resolve;
            }),
        ),
      } as unknown as AgentApiService,
    });

    const pending = handleAgentUiAction(
      'confirm_mutation',
      { approvalId: 'approval-1', sourceActionId: 'card-1' },
      deps,
    );
    useAgentChatStore.getState().setActiveThread('thread-2');
    useAgentChatStore.getState().setActiveThread('thread-1');
    resolveAck(makeAck());

    await expect(pending).resolves.toBe('pending');
    expect(deps.beginRunHandoff).toHaveBeenCalledWith('thread-1');
    expect(deps.adoptRun).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-1' }),
      'exec-1',
      null,
      { requireRunId: true },
    );
    expect(uiActionStates('thread-1')).toBeDefined();
    expect(uiActionStates('thread-2')).toBeUndefined();
  });

  it('releases the held events and reports a rejected request', async () => {
    const deps = makeDeps({
      apiService: {
        respondToUiAction: vi.fn().mockRejectedValue(new Error('Forbidden')),
      } as unknown as AgentApiService,
    });

    const outcome = await handleAgentUiAction(
      'approve_plan',
      { planId: 'plan-1' },
      deps,
    );

    expect(outcome).toBe(false);
    const handoff = vi.mocked(deps.beginRunHandoff).mock.results[0]?.value;
    expect(deps.cancelRunHandoff).toHaveBeenCalledWith(handoff);
    expect(deps.adoptRun).not.toHaveBeenCalled();
    expect(deps.setError).toHaveBeenLastCalledWith('Forbidden');
    expect(uiActionStates()).toBeUndefined();
    expect(deps.setActiveUiAction).toHaveBeenLastCalledWith(null);
  });

  it('does not write a rejection into a thread the user moved to', async () => {
    const deps = makeDeps({
      apiService: {
        respondToUiAction: vi.fn(async () => {
          useAgentChatStore.getState().setActiveThread('thread-2');
          throw new Error('Forbidden');
        }),
      } as unknown as AgentApiService,
    });

    await handleAgentUiAction('approve_plan', { planId: 'plan-1' }, deps);

    expect(deps.setError).not.toHaveBeenCalledWith('Forbidden');
  });
});

describe('duplicate submissions while a run is pending', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.setState({ activeThreadId: 'thread-1' });
  });

  it('does not execute a plan again while a review of it is running', async () => {
    useAgentChatStore.getState().trackUiActionRun('thread-1', {
      action: 'revise_plan',
      runId: 'exec-earlier',
      sourceId: 'plan-1',
    });
    const deps = makeDeps();

    await expect(
      handleAgentUiAction('approve_plan', { planId: 'plan-1' }, deps),
    ).resolves.toBe('pending');
    expect(deps.apiService.respondToUiAction).not.toHaveBeenCalled();
    expect(deps.beginRunHandoff).not.toHaveBeenCalled();
  });

  it('does not resubmit a card action whose run is still pending', async () => {
    const payload = { sourceActionId: 'proposal-1' };
    useAgentChatStore.getState().trackUiActionRun('thread-1', {
      action: 'confirm_generate_media',
      runId: 'exec-earlier',
      sourceId: 'proposal-1',
    });
    const deps = makeDeps();

    await expect(
      handleAgentUiAction('confirm_generate_media', payload, deps),
    ).resolves.toBe('pending');
    expect(deps.apiService.respondToUiAction).not.toHaveBeenCalled();
  });

  it('runs the action again once the earlier run settled', async () => {
    const payload = { sourceActionId: 'proposal-1' };
    useAgentChatStore.getState().trackUiActionRun('thread-1', {
      action: 'confirm_generate_media',
      runId: 'exec-earlier',
      sourceId: 'proposal-1',
    });
    useAgentChatStore
      .getState()
      .settleUiActionRun('thread-1', 'exec-earlier', { status: 'failed' });
    const deps = makeDeps();

    await expect(
      handleAgentUiAction('confirm_generate_media', payload, deps),
    ).resolves.toBe('pending');
    expect(deps.apiService.respondToUiAction).toHaveBeenCalledTimes(1);
  });

  it('scopes a pending plan review to its plan', () => {
    useAgentChatStore.getState().trackUiActionRun('thread-1', {
      action: 'approve_plan',
      runId: 'exec-1',
      sourceId: 'plan-1',
    });
    const states = uiActionStates();

    expect(hasPendingPlanReview(states, 'plan-1')).toBe(true);
    expect(hasPendingPlanReview(states, 'plan-2')).toBe(false);
    expect(hasPendingPlanReview(uiActionStates('thread-2'), 'plan-1')).toBe(
      false,
    );
  });
});
