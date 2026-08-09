import type { BufferedThreadEvent } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamSubscriptionDeps } from './agent-chat-stream.subscriptions';
import { attachAgentStreamSubscriptions } from './agent-chat-stream.subscriptions';

type Handler = (payload: unknown) => void;

function makeDeps(overrides: Partial<StreamSubscriptionDeps> = {}): {
  deps: StreamSubscriptionDeps;
  emit: (event: string, payload: unknown) => void;
  handlers: Map<string, Handler[]>;
} {
  const handlers = new Map<string, Handler[]>();

  const deps: StreamSubscriptionDeps = {
    activeStreamThreadRef: { current: 'thread-1' },
    addActiveToolCall: vi.fn(),
    addPendingUiActions: vi.fn(),
    addWorkEvent: vi.fn(),
    appendStreamToken: vi.fn(),
    bufferedEventsRef: { current: [] as BufferedThreadEvent[] },
    cleanupSubscriptions: vi.fn(),
    clearCompletionWatchdog: vi.fn(),
    clearPendingInputRequest: vi.fn(),
    completeOnboardingIfNeeded: vi.fn(),
    finalizeStream: vi.fn(),
    isThreadVisible: vi.fn(() => true),
    markThreadRunning: vi.fn(),
    pendingCompletionRef: { current: null },
    resetStreamState: vi.fn(),
    setActiveRun: vi.fn(),
    setActiveRunStatus: vi.fn(),
    setCreditsRemaining: vi.fn(),
    setError: vi.fn(),
    setPendingInputRequest: vi.fn(),
    setRunStartedAt: vi.fn(),
    setStreamingReasoning: vi.fn(),
    subscribe: <T>(event: string, handler: (payload: T) => void) => {
      const wrapped = handler as Handler;
      handlers.set(event, [...(handlers.get(event) ?? []), wrapped]);
      return () => {
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((item) => item !== wrapped),
        );
      };
    },
    touchCompletionWatchdog: vi.fn(),
    updateActiveToolCall: vi.fn(),
    updateThreadSummary: vi.fn(),
    ...overrides,
  };

  return {
    deps,
    emit: (event, payload) => {
      for (const handler of handlers.get(event) ?? []) {
        handler(payload);
      }
    },
    handlers,
  };
}

describe('attachAgentStreamSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers listeners and returns matching unsubscribers', () => {
    const { deps, handlers } = makeDeps();

    const unsubscribers = attachAgentStreamSubscriptions(deps);

    expect(unsubscribers.length).toBeGreaterThanOrEqual(10);
    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining([
        'agent:stream_start',
        'agent:token',
        'agent:done',
        'agent:error',
        'agent:input_request',
        'agent:input_resolved',
      ]),
    );

    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
    for (const registered of handlers.values()) {
      expect(registered).toHaveLength(0);
    }
  });

  it('buffers events while no stream thread is active', () => {
    const { deps, emit } = makeDeps({
      activeStreamThreadRef: { current: null },
    });
    attachAgentStreamSubscriptions(deps);

    emit('agent:token', { threadId: 'thread-1', token: 'hi' });

    expect(deps.appendStreamToken).not.toHaveBeenCalled();
    expect(deps.bufferedEventsRef.current).toHaveLength(1);
    expect(deps.bufferedEventsRef.current[0]?.threadId).toBe('thread-1');
  });

  it('drops events for other threads', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:token', { threadId: 'thread-9', token: 'hi' });

    expect(deps.appendStreamToken).not.toHaveBeenCalled();
    expect(deps.bufferedEventsRef.current).toHaveLength(0);
  });

  it('stream_start marks the thread running and sets the active run when visible', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:stream_start', {
      runId: 'run-1',
      startedAt: '2026-03-26T10:00:00.000Z',
      threadId: 'thread-1',
    });

    expect(deps.markThreadRunning).toHaveBeenCalledWith('thread-1', {
      lastActivityAt: '2026-03-26T10:00:00.000Z',
    });
    expect(deps.setActiveRun).toHaveBeenCalledWith('run-1', {
      startedAt: '2026-03-26T10:00:00.000Z',
      status: 'running',
    });
    expect(deps.setRunStartedAt).toHaveBeenCalledWith(
      '2026-03-26T10:00:00.000Z',
    );
  });

  it('stream_start skips run state for hidden threads', () => {
    const { deps, emit } = makeDeps({ isThreadVisible: vi.fn(() => false) });
    attachAgentStreamSubscriptions(deps);

    emit('agent:stream_start', {
      runId: 'run-1',
      startedAt: '2026-03-26T10:00:00.000Z',
      threadId: 'thread-1',
    });

    expect(deps.setActiveRun).not.toHaveBeenCalled();
    expect(deps.setRunStartedAt).not.toHaveBeenCalled();
  });

  it('token and reasoning events stream into the visible thread', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:token', { threadId: 'thread-1', token: 'Hello' });
    emit('agent:reasoning', { content: 'Thinking', threadId: 'thread-1' });

    expect(deps.appendStreamToken).toHaveBeenCalledWith('Hello');
    expect(deps.setStreamingReasoning).toHaveBeenCalledWith('Thinking');
  });

  it('tool_start adds an active tool call', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:tool_start', {
      label: 'Generate image',
      parameters: { prompt: 'cat' },
      phase: 'render',
      progress: 5,
      startedAt: '2026-03-26T10:00:00.000Z',
      threadId: 'thread-1',
      toolCallId: 'call-1',
      toolName: 'generate_image',
    });

    expect(deps.addActiveToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call-1',
        name: 'generate_image',
        status: 'running',
      }),
    );
  });

  it('tool_complete updates the call and forwards ui actions', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:tool_complete', {
      status: 'completed',
      threadId: 'thread-1',
      toolCallId: 'call-1',
      uiActions: [{ id: 'ui-1', type: 'completion_summary_card' }],
    });

    expect(deps.updateActiveToolCall).toHaveBeenCalledWith(
      'call-1',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(deps.addPendingUiActions).toHaveBeenCalledWith([
      { id: 'ui-1', type: 'completion_summary_card' },
    ]);
  });

  it('done finalizes the stream and cleans up', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:done', {
      creditsRemaining: 88,
      fullContent: 'All set.',
      metadata: {},
      runId: 'run-1',
      startedAt: '2026-03-26T10:00:00.000Z',
      threadId: 'thread-1',
      toolCalls: [],
    });

    expect(deps.clearCompletionWatchdog).toHaveBeenCalled();
    expect(deps.updateThreadSummary).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({
        attentionState: null,
        lastAssistantPreview: 'All set.',
        runStatus: 'completed',
      }),
    );
    expect(deps.finalizeStream).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'All set.', role: 'assistant' }),
    );
    expect(deps.setCreditsRemaining).toHaveBeenCalledWith(88);
    expect(deps.clearPendingInputRequest).toHaveBeenCalled();
    expect(deps.cleanupSubscriptions).toHaveBeenCalled();
    expect(deps.completeOnboardingIfNeeded).toHaveBeenCalledWith([]);
  });

  it('done marks hidden threads updated without touching stream state', () => {
    const { deps, emit } = makeDeps({ isThreadVisible: vi.fn(() => false) });
    attachAgentStreamSubscriptions(deps);

    emit('agent:done', {
      creditsRemaining: 88,
      fullContent: 'Hidden result',
      metadata: {},
      threadId: 'thread-1',
      toolCalls: [],
    });

    expect(deps.updateThreadSummary).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({ attentionState: 'updated' }),
    );
    expect(deps.finalizeStream).not.toHaveBeenCalled();
  });

  it('error events fail the run and reset stream state', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:error', { error: 'Provider exploded', threadId: 'thread-1' });

    expect(deps.setError).toHaveBeenCalledWith('Provider exploded');
    expect(deps.setActiveRunStatus).toHaveBeenCalledWith('failed');
    expect(deps.resetStreamState).toHaveBeenCalled();
    expect(deps.cleanupSubscriptions).toHaveBeenCalled();
  });

  it('cancellation errors map to the cancelled status', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:error', {
      error: 'Agent run cancelled',
      threadId: 'thread-1',
    });

    expect(deps.setActiveRunStatus).toHaveBeenCalledWith('cancelled');
    expect(deps.updateThreadSummary).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({ runStatus: 'cancelled' }),
    );
  });

  it('work events collapse onto a stable id', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:work_event', {
      event: AgentWorkEventType.TOOL_STARTED,
      label: 'generate',
      status: AgentWorkEventStatus.RUNNING,
      threadId: 'thread-1',
      timestamp: '2026-03-26T10:00:00.000Z',
      toolCallId: 'call-1',
      toolName: 'generate',
    });
    emit('agent:work_event', {
      event: AgentWorkEventType.STARTED,
      label: 'Working',
      status: AgentWorkEventStatus.RUNNING,
      threadId: 'thread-1',
      timestamp: '2026-03-26T10:00:01.000Z',
    });

    expect(deps.addWorkEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'call-1' }),
    );
    expect(deps.addWorkEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: `${AgentWorkEventType.STARTED}-2026-03-26T10:00:01.000Z`,
      }),
    );
  });

  it('input requests set the pending request and a pending work event', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:input_request', {
      allowFreeText: true,
      inputRequestId: 'req-1',
      options: [],
      prompt: 'Pick a direction',
      threadId: 'thread-1',
      timestamp: '2026-03-26T10:00:00.000Z',
      title: 'Choose',
    });

    expect(deps.updateThreadSummary).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({
        attentionState: 'needs-input',
        runStatus: 'waiting_input',
      }),
    );
    expect(deps.setPendingInputRequest).toHaveBeenCalledWith(
      expect.objectContaining({ inputRequestId: 'req-1', title: 'Choose' }),
    );
    expect(deps.addWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AgentWorkEventType.INPUT_REQUESTED,
        id: 'input-request-req-1',
        status: AgentWorkEventStatus.PENDING,
      }),
    );
  });

  it('input_resolved clears the request and records submission', () => {
    const { deps, emit } = makeDeps();
    attachAgentStreamSubscriptions(deps);

    emit('agent:input_resolved', {
      answer: 'Option A',
      inputRequestId: 'req-1',
      threadId: 'thread-1',
      timestamp: '2026-03-26T10:00:05.000Z',
    });

    expect(deps.markThreadRunning).toHaveBeenCalledWith('thread-1', {
      lastActivityAt: '2026-03-26T10:00:05.000Z',
      pendingInputCount: 0,
      runStatus: 'running',
    });
    expect(deps.clearPendingInputRequest).toHaveBeenCalled();
    expect(deps.addWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AgentWorkEventType.INPUT_SUBMITTED,
        id: 'input-resolved-req-1',
        status: AgentWorkEventStatus.COMPLETED,
      }),
    );
  });
});
