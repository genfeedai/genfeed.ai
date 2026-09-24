import { createAgentStreamController } from '@genfeedai/agent/hooks/agent-chat-stream.entry';
import {
  bindAgentStreamTransport,
  captureAgentStreamHydration,
  createAgentStreamEntry,
  findAgentStreamEntry,
  getAgentStreamRuntime,
  projectAgentStreamEntry,
  resetAgentStreamRuntime,
} from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (data: unknown) => void>();
const subscribe = vi.fn((event: string, handler: (data: unknown) => void) => {
  handlers.set(event, handler);
  return () => handlers.delete(event);
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function accepted(threadId: string, executionId = `run-${threadId}`) {
  return {
    threadId,
    executionId,
    queuedAt: '2026-09-24T12:00:00Z',
    contextVersion: 1,
  };
}
function entry(
  threadId: string | null,
  api: Partial<AgentApiService> = {},
  clientRequestId = `request-${threadId}`,
) {
  const owner = createAgentStreamEntry(threadId, clientRequestId);
  const controller = createAgentStreamController(owner, {
    apiService: {
      chatStream: vi.fn().mockResolvedValue(accepted(threadId ?? 'new')),
      ...api,
    } as unknown as AgentApiService,
  });
  owner.controller = controller;
  return { owner, controller };
}
function emit(
  event: string,
  threadId: string,
  data: Record<string, unknown> = {},
) {
  handlers.get(event)?.({ threadId, runId: `run-${threadId}`, ...data });
}
function done(threadId: string) {
  emit('agent:done', threadId, {
    fullContent: `answer-${threadId}`,
    toolCalls: [],
    creditsRemaining: 10,
  });
}
function show(threadId: string) {
  useAgentChatStore.getState().setActiveThread(threadId);
  const owner = findAgentStreamEntry(threadId);
  if (owner) projectAgentStreamEntry(owner);
}

beforeEach(() => {
  resetAgentStreamRuntime();
  handlers.clear();
  subscribe.mockClear();
  vi.useFakeTimers();
  useAgentChatStore.getState().resetActiveConversationState();
  useAgentChatStore.setState({
    activeThreadId: 'a',
    threads: ['a', 'b'].map((id) => ({
      id,
      title: id,
      status: AgentThreadStatus.ACTIVE,
      contextVersion: 1,
      createdAt: '2026-09-24T12:00:00Z',
      updatedAt: '2026-09-24T12:00:00Z',
    })),
  });
  bindAgentStreamTransport(subscribe);
});
afterEach(() => {
  resetAgentStreamRuntime();
  vi.useRealTimers();
});

describe('thread stream registry', () => {
  it('routes interleaved tokens and completion independently through one listener per event', async () => {
    const a = entry('a');
    await a.controller.sendMessage('A');
    show('b');
    const b = entry('b');
    await b.controller.sendMessage('B');
    expect(
      subscribe.mock.calls.filter(([event]) => event === 'agent:token'),
    ).toHaveLength(1);
    emit('agent:token', 'a', { token: 'alpha' });
    emit('agent:token', 'b', { token: 'beta' });
    await vi.advanceTimersByTimeAsync(100);
    expect(useAgentChatStore.getState().stream.streamingContent).toBe('beta');
    show('a');
    expect(useAgentChatStore.getState().stream.streamingContent).toBe('alpha');
    show('b');
    done('b');
    expect(useAgentChatStore.getState().stream.isStreaming).toBe(false);
    expect(a.owner.completionTimeoutRef.current).not.toBeNull();
    const bState = useAgentChatStore.getState().messages;
    done('a');
    expect(a.owner.presentation.getState().messages.at(-1)?.content).toBe(
      'answer-a',
    );
    expect(useAgentChatStore.getState().messages).toBe(bState);
    expect(
      useAgentChatStore.getState().threads.find((t) => t.id === 'a')
        ?.attentionState,
    ).toBe('updated');
    expect(a.owner.completionTimeoutRef.current).toBeNull();
  });
  it('accepts a late background ACK without navigating back', async () => {
    const response = deferred<ReturnType<typeof accepted>>();
    const a = entry('a', { chatStream: vi.fn(() => response.promise) });
    const sending = a.controller.sendMessage('A');
    show('b');
    const before = useAgentChatStore.getState().stream;
    response.resolve(accepted('a'));
    await sending;
    expect(useAgentChatStore.getState().activeThreadId).toBe('b');
    expect(useAgentChatStore.getState().stream).toBe(before);
    expect(a.owner.activeStreamRunIdRef.current).toBe('run-a');
  });
  it('detaches replay and cannot revive a terminal event with a later token', async () => {
    const response = deferred<ReturnType<typeof accepted>>();
    const a = entry('a', { chatStream: vi.fn(() => response.promise) });
    const sending = a.controller.sendMessage('A');
    done('a');
    emit('agent:token', 'a', { token: 'late' });
    response.resolve(accepted('a'));
    await sending;
    await vi.advanceTimersByTimeAsync(100);
    expect(a.owner.presentation.getState().stream.isStreaming).toBe(false);
    expect(a.owner.presentation.getState().stream.streamingContent).toBe('');
    expect(a.owner.presentation.getState().messages.at(-1)?.content).toBe(
      'answer-a',
    );
  });
  it('keeps two unassigned ACKs and candidate events separate', async () => {
    useAgentChatStore.getState().setActiveThread(null);
    const first = deferred<ReturnType<typeof accepted>>();
    const second = deferred<ReturnType<typeof accepted>>();
    const a = entry(null, { chatStream: vi.fn(() => first.promise) }, 'one');
    const firstSend = a.controller.sendMessage('one');
    const b = entry(null, { chatStream: vi.fn(() => second.promise) }, 'two');
    const secondSend = b.controller.sendMessage('two');
    emit('agent:token', 'new-a', { token: 'alpha' });
    emit('agent:token', 'new-b', { token: 'beta' });
    second.resolve(accepted('new-b'));
    await secondSend;
    first.resolve(accepted('new-a'));
    await firstSend;
    await vi.advanceTimersByTimeAsync(100);
    expect(a.owner.presentation.getState().stream.streamingContent).toBe(
      'alpha',
    );
    expect(b.owner.presentation.getState().stream.streamingContent).toBe(
      'beta',
    );
    expect(useAgentChatStore.getState().activeThreadId).toBe('new-b');
  });
  it('shows a correlated receipt without adopting a run and suppresses it after buffered progress', async () => {
    const response = deferred<ReturnType<typeof accepted>>();
    const a = entry('a', { chatStream: vi.fn(() => response.promise) });
    const sending = a.controller.sendMessage('A');
    const receipt = {
      organizationId: 'org',
      userId: 'user',
      clientRequestId: 'request-a',
      acceptedAt: '2026-09-24T12:00:00Z',
    };
    emit('agent:turn_accepted', 'a', {
      ...receipt,
      clientRequestId: 'foreign',
    });
    expect(
      a.owner.presentation.getState().stream.acceptedReceipt,
    ).toBeUndefined();
    emit('agent:turn_accepted', 'a', receipt);
    expect(
      a.owner.presentation.getState().stream.acceptedReceipt?.clientRequestId,
    ).toBe('request-a');
    expect(a.owner.activeStreamRunIdRef.current).toBeNull();
    expect(a.owner.completionTimeoutRef.current).toBeNull();
    expect(a.owner.presentation.getState().runStartedAt).toBeNull();
    emit('agent:token', 'a', { token: 'hello' });
    emit('agent:turn_accepted', 'a', receipt);
    expect(
      a.owner.presentation.getState().stream.acceptedReceipt,
    ).toBeUndefined();
    response.resolve(accepted('a'));
    await sending;
    expect(
      a.owner.presentation.getState().stream.acceptedReceipt,
    ).toBeUndefined();
  });
  it('retains background pending input through asking-run completion and resolves only its own request', async () => {
    const a = entry('a');
    await a.controller.sendMessage('A');
    show('b');
    emit('agent:input_request', 'a', {
      inputRequestId: 'question',
      prompt: 'Choose',
      options: [],
      timestamp: '2026-09-24T12:00:00Z',
    });
    expect(a.owner.completionTimeoutRef.current).toBeNull();
    done('a');
    expect(
      a.owner.presentation.getState().pendingInputRequest?.inputRequestId,
    ).toBe('question');
    emit('agent:input_resolved', 'a', {
      inputRequestId: 'other',
      timestamp: '2026-09-24T12:00:01Z',
    });
    expect(a.owner.presentation.getState().pendingInputRequest).not.toBeNull();
    emit('agent:input_resolved', 'a', {
      inputRequestId: 'question',
      timestamp: '2026-09-24T12:00:02Z',
    });
    expect(a.owner.presentation.getState().pendingInputRequest).toBeNull();
    expect(useAgentChatStore.getState().pendingInputRequest).toBeNull();
  });
  it('invalidates stale recovery and hydration without affecting a replacement owner', async () => {
    const history = deferred<never[]>();
    const a = entry('a', { getMessages: vi.fn(() => history.promise) });
    await a.controller.sendMessage('A');
    const canHydrate = captureAgentStreamHydration('a');
    a.owner.recover?.();
    const next = entry('a');
    await next.controller.sendMessage('replacement');
    history.resolve([]);
    await Promise.resolve();
    await Promise.resolve();
    expect(canHydrate()).toBe(false);
    expect(next.owner.completionTimeoutRef.current).not.toBeNull();
    expect(useAgentChatStore.getState().activeRunStatus).toBe('running');
  });
  it('bounds terminal entries without evicting live executions', async () => {
    const a = entry('a');
    await a.controller.sendMessage('A');
    for (let i = 0; i < 55; i++) {
      const id = `finished-${i}`;
      const terminal = entry(id);
      await terminal.controller.sendMessage('finish');
      done(id);
    }
    expect(getAgentStreamRuntime().entries.size).toBe(51);
    expect(findAgentStreamEntry('a')).toBe(a.owner);
    vi.setSystemTime(Date.now() + 300_001);
    findAgentStreamEntry('a');
    expect(getAgentStreamRuntime().entries.size).toBe(1);
  });
  it('rebinds physical listeners once when the manager changes and disposes every timer', async () => {
    const a = entry('a');
    await a.controller.sendMessage('A');
    const b = entry('b');
    await b.controller.sendMessage('B');
    const replacement = vi.fn(subscribe.getMockImplementation());
    bindAgentStreamTransport(replacement, {});
    expect(
      replacement.mock.calls.filter(([event]) => event === 'agent:token'),
    ).toHaveLength(1);
    resetAgentStreamRuntime();
    expect(handlers.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

it.each([2049, 1])(
  'reconciles overflow at %s events instead of replaying partial data',
  async (count) => {
    const response = deferred<ReturnType<typeof accepted>>();
    const getThreadSnapshot = vi.fn().mockResolvedValue({
      activeRun: { runId: 'run-a', status: 'completed' },
      timeline: [],
      pendingInputRequests: [],
      pendingApprovals: [],
      lastAssistantMessage: {
        content: 'Persisted answer',
        createdAt: '2026-09-24T12:00:01Z',
      },
    });
    const getMessages = vi.fn().mockResolvedValue([
      {
        id: 'persisted',
        threadId: 'a',
        role: 'assistant',
        content: 'Persisted answer',
      },
    ]);
    const a = entry('a', {
      chatStream: vi.fn(() => response.promise),
      getThreadSnapshot,
      getMessages,
    });
    const sending = a.controller.sendMessage('A');
    for (let i = 0; i < count; i++)
      emit('agent:token', 'a', {
        token: count === 1 ? 'x'.repeat(1_048_577) : 'x',
      });
    expect(a.owner.bufferedEventsRef.current).toHaveLength(0);
    expect(a.owner.needsReconciliation).toBe(true);
    response.resolve(accepted('a'));
    await sending;
    await Promise.resolve();
    await Promise.resolve();
    expect(getThreadSnapshot).toHaveBeenCalledWith('a');
    expect(a.owner.presentation.getState().messages.at(-1)?.content).toBe(
      'Persisted answer',
    );
    expect(a.owner.presentation.getState().stream.streamingContent).toBe('');
    expect(a.owner.completionTimeoutRef.current).toBeNull();
  },
);
it('ignores an overflow snapshot that resolves after a same-thread replacement', async () => {
  const response = deferred<ReturnType<typeof accepted>>();
  const snapshot = deferred<never>();
  const a = entry('a', {
    chatStream: vi.fn(() => response.promise),
    getThreadSnapshot: vi.fn(() => snapshot.promise),
    getMessages: vi.fn().mockResolvedValue([]),
  });
  const sending = a.controller.sendMessage('A');
  emit('agent:token', 'a', { token: 'x'.repeat(1_048_577) });
  response.resolve(accepted('a'));
  await sending;
  const next = entry('a');
  await next.controller.sendMessage('replacement');
  snapshot.reject(new Error('late'));
  await Promise.resolve();
  await Promise.resolve();
  expect(findAgentStreamEntry('a')).toBe(next.owner);
  expect(next.owner.presentation.getState().error).toBeNull();
  expect(next.owner.completionTimeoutRef.current).not.toBeNull();
});
it('keeps watchdog clocks independent and releases an early recovered owner', async () => {
  const getA = vi.fn().mockResolvedValue([]);
  const getB = vi.fn().mockResolvedValue([
    {
      id: 'answer',
      threadId: 'b',
      role: 'assistant',
      content: 'Recovered',
      metadata: { runId: 'run-b' },
    },
  ]);
  const a = entry('a', { getMessages: getA });
  await a.controller.sendMessage('A');
  show('b');
  const b = entry('b', { getMessages: getB });
  await b.controller.sendMessage('B');
  await vi.advanceTimersByTimeAsync(9_000);
  emit('agent:token', 'a', { token: 'still going' });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(getA).not.toHaveBeenCalled();
  expect(getB).toHaveBeenCalledTimes(1);
  expect(b.owner.completionTimeoutRef.current).toBeNull();
  expect(a.owner.completionTimeoutRef.current).not.toBeNull();
  expect(useAgentChatStore.getState().messages.at(-1)?.content).toBe(
    'Recovered',
  );
});
it('preserves visible UI mutations when another token arrives', async () => {
  const a = entry('a');
  await a.controller.sendMessage('A');
  useAgentChatStore.getState().setActiveRunStatus('cancelling');
  useAgentChatStore.getState().prependOlderMessages({
    messages: [{ id: 'old', threadId: 'a', role: 'user', content: 'Older' }],
    hasMore: false,
    nextCursor: null,
  });
  emit('agent:token', 'a', { token: 'later' });
  await vi.advanceTimersByTimeAsync(100);
  expect(useAgentChatStore.getState().activeRunStatus).toBe('cancelling');
  expect(useAgentChatStore.getState().messages[0].content).toBe('Older');
});
it('discards a scheduled global token batch on a synchronous thread switch', async () => {
  useAgentChatStore.getState().setActiveRun('run-a');
  useAgentChatStore.getState().appendStreamToken('foreign');
  useAgentChatStore.getState().setActiveThread('b');
  useAgentChatStore.getState().setActiveRun('run-b');
  await vi.advanceTimersByTimeAsync(100);
  expect(useAgentChatStore.getState().stream.streamingContent).toBe('');
});

it('never revives a retained terminal run from stale hydration, but permits a distinct newer run', async () => {
  const a = entry('a');
  await a.controller.sendMessage('A');
  done('a');
  const canHydrate = captureAgentStreamHydration('a');
  const snapshot = {
    activeRun: {
      runId: 'run-a',
      status: 'running',
      startedAt: '2026-09-24T12:00:00Z',
    },
    pendingInputRequests: [],
    timeline: [],
  } as unknown as import('@genfeedai/agent/models/agent-chat.model').AgentThreadSnapshot;
  expect(canHydrate(snapshot)).toBe(false);
  expect(
    canHydrate({
      ...snapshot,
      activeRun: {
        runId: 'newer-run',
        status: 'running',
        startedAt: '2026-09-24T12:01:00Z',
      },
    }),
  ).toBe(true);
});
it('keeps the newest draft visible when an older unassigned ACK resolves first', async () => {
  useAgentChatStore.getState().setActiveThread(null);
  const first = deferred<ReturnType<typeof accepted>>();
  const second = deferred<ReturnType<typeof accepted>>();
  const a = entry(
    null,
    { chatStream: vi.fn(() => first.promise) },
    'old-draft',
  );
  const sendA = a.controller.sendMessage('old');
  const b = entry(
    null,
    { chatStream: vi.fn(() => second.promise) },
    'new-draft',
  );
  const sendB = b.controller.sendMessage('new');
  first.resolve(accepted('new-a'));
  await sendA;
  expect(useAgentChatStore.getState().activeThreadId).toBeNull();
  expect(useAgentChatStore.getState().messages.at(-1)?.content).toBe('new');
  second.resolve(accepted('new-b'));
  await sendB;
  expect(useAgentChatStore.getState().activeThreadId).toBe('new-b');
});
it('does not let a foreign pre-ACK run suppress a matching receipt', async () => {
  const response = deferred<ReturnType<typeof accepted>>();
  const a = entry('a', { chatStream: vi.fn(() => response.promise) });
  const sending = a.controller.sendMessage('A');
  emit('agent:token', 'a', { runId: 'old-run', token: 'old' });
  emit('agent:turn_accepted', 'a', {
    clientRequestId: 'request-a',
    acceptedAt: '2026-09-24T12:00:00Z',
    organizationId: 'org',
    userId: 'user',
  });
  expect(a.owner.presentation.getState().stream.acceptedReceipt?.runId).toBe(
    'run-a',
  );
  response.resolve(accepted('a'));
  await sending;
  expect(a.owner.presentation.getState().stream.acceptedReceipt?.runId).toBe(
    'run-a',
  );
});

it('cannot let an in-flight recovery erase a newly received question', async () => {
  const history =
    deferred<
      Array<{
        id: string;
        threadId: string;
        role: 'assistant';
        content: string;
        metadata: { runId: string };
      }>
    >();
  const a = entry('a', { getMessages: vi.fn(() => history.promise) });
  await a.controller.sendMessage('A');
  a.owner.recover?.();
  emit('agent:input_request', 'a', {
    inputRequestId: 'question',
    prompt: 'Choose',
    options: [],
    timestamp: '2026-09-24T12:00:00Z',
  });
  history.resolve([
    {
      id: 'asking-answer',
      threadId: 'a',
      role: 'assistant',
      content: 'Question',
      metadata: { runId: 'run-a' },
    },
  ]);
  await Promise.resolve();
  await Promise.resolve();
  expect(
    a.owner.presentation.getState().pendingInputRequest?.inputRequestId,
  ).toBe('question');
  expect(a.owner.presentation.getState().activeRunStatus).toBe(
    'awaiting_input',
  );
  expect(a.owner.completionTimeoutRef.current).toBeNull();
});
