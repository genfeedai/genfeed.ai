import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/enums';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandleUiActionDeps } from './agent-chat-container.ui-actions';
import { handleAgentUiAction } from './agent-chat-container.ui-actions';
import { AGENT_DRAFT_SUGGESTION_EVENT } from './use-agent-draft-context';

function makeThread(id: string): AgentThread {
  return {
    brandId: 'brand-1',
    contextVersion: 3,
    createdAt: '2026-03-20T10:00:00.000Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title: 'Thread',
    updatedAt: '2026-03-20T10:00:00.000Z',
  } as AgentThread;
}

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    contextVersion: 4,
    creditsRemaining: 90,
    message: { content: 'Done.', metadata: {} },
    threadId: 'thread-1',
    toolCalls: [],
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<HandleUiActionDeps> = {},
): HandleUiActionDeps {
  return {
    activeThreadId: 'thread-1',
    activeUiAction: null,
    addMessage: vi.fn(),
    apiService: {
      respondToUiActionEffect: vi.fn(() => Effect.succeed(makeResponse())),
    } as unknown as AgentApiService,
    draftPlanModeEnabled: false,
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

  it('rejects concurrent UI actions', async () => {
    const deps = makeDeps({ activeUiAction: 'other_action' });

    await handleAgentUiAction('approve_plan', undefined, deps);

    expect(deps.setError).toHaveBeenCalledWith(
      'A UI action is already in progress.',
    );
  });

  it('runs a thread-bound action and applies the response', async () => {
    const respondToUiActionEffect = vi.fn(() =>
      Effect.succeed(makeResponse({ creditsRemaining: 42 })),
    );
    const deps = makeDeps({
      apiService: {
        respondToUiActionEffect,
      } as unknown as AgentApiService,
    });

    await handleAgentUiAction('start_interview', { step: 1 }, deps);

    expect(respondToUiActionEffect).toHaveBeenCalledWith(
      'thread-1',
      'start_interview',
      { step: 1 },
      undefined,
      { brandId: 'brand-1', expectedContextVersion: 3 },
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

  it('switches the active thread when the response lands elsewhere', async () => {
    const deps = makeDeps({
      apiService: {
        respondToUiActionEffect: vi.fn(() =>
          Effect.succeed(makeResponse({ threadId: 'thread-2' })),
        ),
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
    const deps = makeDeps({
      apiService: {
        respondToUiActionEffect: vi.fn(() =>
          Effect.fail(new Error('context conflict')),
        ),
      } as unknown as AgentApiService,
    });

    await handleAgentUiAction('start_interview', undefined, deps);

    expect(deps.setError).toHaveBeenCalledWith('context conflict');
    expect(deps.setActiveUiAction).toHaveBeenLastCalledWith(null);
    expect(deps.addMessage).not.toHaveBeenCalled();
  });
});
