import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SocketHandler = (...args: unknown[]) => void;

const handlers = new Map<string, Set<SocketHandler>>();
const mockSocket = {
  disconnect: vi.fn(),
  off: vi.fn((event: string, handler: SocketHandler) => {
    handlers.get(event)?.delete(handler);
    return mockSocket;
  }),
  on: vi.fn((event: string, handler: SocketHandler) => {
    const eventHandlers = handlers.get(event) ?? new Set<SocketHandler>();
    eventHandlers.add(handler);
    handlers.set(event, eventHandlers);
    return mockSocket;
  }),
};
const mockCreateWebSocketConnection = vi.fn(async () => mockSocket as unknown as Socket);

vi.mock('../../src/utils/websocket', () => ({
  createWebSocketConnection: () => mockCreateWebSocketConnection(),
}));

function emit(event: string, payload?: unknown): void {
  for (const handler of handlers.get(event) ?? []) {
    handler(payload);
  }
}

describe('shell/agent-live-stream', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buffers early events, then filters them to the bound run', async () => {
    const { openAgentLiveStream } = await import('../../src/shell/agent-live-stream');
    const stream = await openAgentLiveStream();
    const ready = stream.waitUntilReady();
    emit('connected', { userId: 'user-1' });
    await ready;

    emit('agent:token', { runId: 'other-run', threadId: 'thread-1', token: 'wrong' });
    emit('agent:token', { runId: 'run-1', threadId: 'thread-1', token: 'Hello ' });
    stream.bind({ runId: 'run-1', threadId: 'thread-1' });
    emit('agent:done', {
      fullContent: 'Hello world',
      metadata: {},
      runId: 'run-1',
      threadId: 'thread-1',
    });

    expect(stream.drain()).toEqual([
      {
        payload: { runId: 'run-1', threadId: 'thread-1', token: 'Hello ' },
        type: 'token',
      },
      {
        payload: {
          fullContent: 'Hello world',
          metadata: {},
          runId: 'run-1',
          threadId: 'thread-1',
        },
        type: 'done',
      },
    ]);
    expect(stream.drain()).toEqual([]);
  });

  it('ignores malformed and mismatched run events while retaining agent errors', async () => {
    const { openAgentLiveStream } = await import('../../src/shell/agent-live-stream');
    const stream = await openAgentLiveStream();
    const ready = stream.waitUntilReady();
    emit('connected');
    await ready;
    stream.bind({ runId: 'run-1', threadId: 'thread-1' });

    emit('agent:token', { threadId: 'thread-1', token: '' });
    emit('agent:token', { runId: 'run-2', threadId: 'thread-1', token: 'wrong run' });
    emit('agent:done', { fullContent: 42, runId: 'run-1', threadId: 'thread-1' });
    emit('agent:error', { error: 'provider failed', runId: 'run-1', threadId: 'thread-1' });
    emit('agent:error', { error: 'wrong thread', runId: 'run-1', threadId: 'thread-2' });

    expect(stream.drain()).toEqual([
      {
        payload: {
          error: 'provider failed',
          runId: 'run-1',
          threadId: 'thread-1',
        },
        type: 'error',
      },
    ]);
  });

  it('reports disconnect, reconnect, and transport errors without closing catch-up', async () => {
    const { openAgentLiveStream } = await import('../../src/shell/agent-live-stream');
    const stream = await openAgentLiveStream();
    const ready = stream.waitUntilReady();
    emit('connected');
    await ready;

    emit('disconnect', 'transport close');
    emit('connect_error', new Error('connection refused'));
    emit('connected');

    expect(stream.drain()).toEqual([
      { reason: 'transport close', type: 'disconnected' },
      {
        error: expect.objectContaining({ message: 'connection refused' }),
        type: 'transport-error',
      },
      { type: 'reconnected' },
    ]);
  });

  it('wakes an activity waiter when a matching live chunk arrives', async () => {
    const { openAgentLiveStream } = await import('../../src/shell/agent-live-stream');
    const stream = await openAgentLiveStream();
    const ready = stream.waitUntilReady();
    emit('connected');
    await ready;
    stream.bind({ runId: 'run-1', threadId: 'thread-1' });

    const activity = stream.waitForActivity(10_000);
    emit('agent:token', { runId: 'run-1', threadId: 'thread-1', token: 'awake' });

    await activity;
    expect(stream.drain()).toEqual([
      {
        payload: { runId: 'run-1', threadId: 'thread-1', token: 'awake' },
        type: 'token',
      },
    ]);
  });

  it('falls back after the server-ready confirmation times out', async () => {
    vi.useFakeTimers();
    const { openAgentLiveStream } = await import('../../src/shell/agent-live-stream');
    const stream = await openAgentLiveStream();
    const ready = stream.waitUntilReady();

    await vi.advanceTimersByTimeAsync(2_000);
    await ready;

    expect(stream.drain()).toEqual([
      {
        error: expect.objectContaining({
          message: 'Timed out waiting for the live stream connection',
        }),
        type: 'transport-error',
      },
    ]);
  });

  it('removes every listener and disconnects exactly once during cleanup', async () => {
    const { openAgentLiveStream } = await import('../../src/shell/agent-live-stream');
    const stream = await openAgentLiveStream();
    const ready = stream.waitUntilReady();
    emit('connected');
    await ready;

    stream.close();
    stream.close();

    expect(mockSocket.off).toHaveBeenCalledTimes(6);
    expect(mockSocket.disconnect).toHaveBeenCalledOnce();
    expect(Array.from(handlers.values()).every((eventHandlers) => eventHandlers.size === 0)).toBe(
      true
    );
  });
});
