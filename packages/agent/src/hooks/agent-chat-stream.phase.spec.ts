import { createAgentStreamController } from '@genfeedai/agent/hooks/agent-chat-stream.entry';
import {
  deriveAgentStreamPhase,
  readAgentStreamPhase,
} from '@genfeedai/agent/hooks/agent-chat-stream.phase';
import {
  bindAgentStreamTransport,
  createAgentStreamEntry,
  resetAgentStreamRuntime,
} from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import type {
  AgentStreamPhase,
  AgentStreamPhaseInput,
} from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { AgentApiRequestError } from '@genfeedai/agent/services/agent-api-error';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

type ApiOverrides = Partial<Record<keyof AgentApiService, Mock>>;

const THREAD_ID = 'thread-a';
const RUN_ID = 'run-a';
const handlers = new Map<string, (data: unknown) => void>();

function subscribe<T>(event: string, handler: (payload: T) => void) {
  handlers.set(event, (data) => handler(data as T));
  return () => {
    handlers.delete(event);
  };
}

function accepted(executionId = RUN_ID) {
  return {
    contextVersion: 1,
    executionId,
    queuedAt: '2026-11-09T12:00:00Z',
    threadId: THREAD_ID,
  };
}

function streamFor(api: ApiOverrides = {}) {
  const owner = createAgentStreamEntry(THREAD_ID, 'request-a');
  const controller = createAgentStreamController(owner, {
    apiService: Object.assign(
      new AgentApiService({
        baseUrl: 'http://genfeed.localhost:3010',
        getToken: async () => null,
      }),
      {
        chatStream: vi.fn().mockResolvedValue(accepted()),
        ...api,
      },
    ),
  });
  owner.controller = controller;
  return { controller, phase: () => readAgentStreamPhase(owner) };
}

function emit(event: string, data: Record<string, unknown> = {}) {
  handlers.get(event)?.({ runId: RUN_ID, threadId: THREAD_ID, ...data });
}

function inputRequest() {
  emit('agent:input_request', {
    inputRequestId: 'input-1',
    options: [],
    prompt: 'Which brand?',
    timestamp: '2026-11-09T12:00:05Z',
    title: 'Pick a brand',
  });
}

beforeEach(() => {
  resetAgentStreamRuntime();
  handlers.clear();
  vi.useFakeTimers();
  useAgentChatStore.getState().resetActiveConversationState();
  useAgentChatStore.setState({
    activeThreadId: THREAD_ID,
    threads: [
      {
        contextVersion: 1,
        createdAt: '2026-11-09T12:00:00Z',
        id: THREAD_ID,
        status: AgentThreadStatus.ACTIVE,
        title: 'A',
        updatedAt: '2026-11-09T12:00:00Z',
      },
    ],
  });
  bindAgentStreamTransport(subscribe);
});

afterEach(() => {
  resetAgentStreamRuntime();
  vi.useRealTimers();
});

describe('deriveAgentStreamPhase', () => {
  const none: AgentStreamPhaseInput = {
    hasPendingCompletion: false,
    hasPendingInputRequest: false,
    isAwaitingRunId: false,
    isRunStalled: false,
    isTerminal: false,
  };

  it.each<[Partial<AgentStreamPhaseInput>, AgentStreamPhase]>([
    [{}, 'idle'],
    [{ isAwaitingRunId: true }, 'awaiting_run_id'],
    [{ hasPendingCompletion: true }, 'streaming'],
    [{ hasPendingInputRequest: true }, 'awaiting_input'],
    [{ hasPendingCompletion: true, isRunStalled: true }, 'stalled'],
    [{ hasPendingCompletion: true, isAwaitingRunId: true }, 'awaiting_run_id'],
    [{ hasPendingCompletion: true, isTerminal: true }, 'terminal'],
    [
      { hasPendingInputRequest: true, isAwaitingRunId: true },
      'awaiting_run_id',
    ],
  ])('reads %o as %s', (fields, expected) => {
    expect(deriveAgentStreamPhase({ ...none, ...fields })).toBe(expected);
  });
});

describe('agent chat stream phases (#9737)', () => {
  it('sends, waits for the run id, streams, then settles on done', async () => {
    let acknowledge: (value: ReturnType<typeof accepted>) => void = () => {};
    const stream = streamFor({
      chatStream: vi.fn(
        () =>
          new Promise((resolve) => {
            acknowledge = resolve;
          }),
      ),
    });
    expect(stream.phase()).toBe('idle');

    const sending = stream.controller.sendMessage('Hello');
    expect(stream.phase()).toBe('awaiting_run_id');

    acknowledge(accepted());
    await sending;
    expect(stream.phase()).toBe('streaming');

    emit('agent:token', { token: 'Hi' });
    expect(stream.phase()).toBe('streaming');

    emit('agent:done', {
      creditsRemaining: 1,
      fullContent: 'Hi',
      toolCalls: [],
    });
    expect(stream.phase()).toBe('terminal');
  });

  it('settles on a stream error', async () => {
    const stream = streamFor();
    await stream.controller.sendMessage('Hello');

    emit('agent:error', { error: 'Provider down' });

    expect(stream.phase()).toBe('terminal');
  });

  it('settles a send whose request fails before the run is named', async () => {
    const stream = streamFor({
      chatStream: vi.fn().mockRejectedValue(new Error('offline')),
    });

    await stream.controller.sendMessage('Hello');

    expect(stream.phase()).toBe('terminal');
  });

  it('waits for input, hands the answer off, then streams the continuation', async () => {
    const stream = streamFor();
    await stream.controller.sendMessage('Hello');

    inputRequest();
    expect(stream.phase()).toBe('awaiting_input');

    const handoff = stream.controller.beginRunHandoff(THREAD_ID);
    expect(stream.phase()).toBe('awaiting_run_id');

    stream.controller.adoptRun(handoff, 'run-b', '2026-11-09T12:00:10Z');
    expect(stream.phase()).toBe('streaming');
  });

  it('settles a handoff that produced no execution', async () => {
    const stream = streamFor();
    await stream.controller.sendMessage('Hello');
    inputRequest();

    const handoff = stream.controller.beginRunHandoff(THREAD_ID);
    stream.controller.cancelRunHandoff(handoff);

    expect(stream.phase()).toBe('terminal');
  });

  it('stalls after repeated missing executions, resumes, and can be abandoned', async () => {
    const stream = streamFor({
      getMessages: vi.fn().mockResolvedValue([]),
      getThreadSnapshot: vi.fn().mockResolvedValue({
        activeRun: { runId: RUN_ID, status: 'running' },
        threadId: THREAD_ID,
      }),
      getWorkflowExecution: vi.fn().mockRejectedValue(
        new AgentApiRequestError({
          message: 'Execution not found',
          source: 'api',
          status: 404,
        }),
      ),
    });
    await stream.controller.sendMessage('Hello');

    await vi.advanceTimersByTimeAsync(150_000);
    expect(stream.phase()).toBe('stalled');

    stream.controller.resumeRunWatch(THREAD_ID);
    expect(stream.phase()).toBe('streaming');

    stream.controller.abandonRun(THREAD_ID);
    expect(stream.phase()).toBe('terminal');
  });
});
