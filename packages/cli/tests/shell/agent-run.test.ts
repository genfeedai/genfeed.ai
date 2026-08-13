import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentThreadEvent } from '../../src/api/threads';
import type { AgentLiveStreamEvent } from '../../src/shell/agent-live-stream';

let liveEventBatches: AgentLiveStreamEvent[][] = [];
const mockLiveStream = {
  bind: vi.fn(),
  close: vi.fn(),
  drain: vi.fn(() => liveEventBatches.shift() ?? []),
  waitForActivity: vi.fn(async () => undefined),
  waitUntilReady: vi.fn(async () => undefined),
};
const mockOpenAgentLiveStream = vi.fn(async () => mockLiveStream);

vi.mock('../../src/shell/agent-live-stream', () => ({
  openAgentLiveStream: () => mockOpenAgentLiveStream(),
}));

const mockGetThread = vi.fn();
const mockGetThreadEvents = vi.fn();
const mockGetThreadSnapshot = vi.fn();
const mockRespondToInputRequest = vi.fn();
const mockStartAgentChatStream = vi.fn();

vi.mock('../../src/api/threads', () => ({
  getThread: (...args: unknown[]) => mockGetThread(...args),
  getThreadEvents: (...args: unknown[]) => mockGetThreadEvents(...args),
  getThreadSnapshot: (...args: unknown[]) => mockGetThreadSnapshot(...args),
  respondToInputRequest: (...args: unknown[]) => mockRespondToInputRequest(...args),
  startAgentChatStream: (...args: unknown[]) => mockStartAgentChatStream(...args),
}));

function makeEvent(
  type: string,
  sequence: number,
  payload?: Record<string, unknown>
): AgentThreadEvent {
  return {
    commandId: `cmd-${sequence}`,
    eventId: `evt-${sequence}`,
    payload,
    sequence,
    threadId: 'thread-1',
    type,
  };
}

describe('shell/agent-run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveEventBatches = [];
    mockLiveStream.drain.mockImplementation(() => liveEventBatches.shift() ?? []);
    mockOpenAgentLiveStream.mockResolvedValue(mockLiveStream);
    mockGetThreadEvents.mockResolvedValue([]);
  });

  describe('runAgentTurn', () => {
    it('renders coalesced live chunks once and performs one token-independent terminal catch-up', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-live',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      liveEventBatches = [
        [
          {
            payload: { runId: 'run-live', threadId: 'thread-1', token: 'Hello ' },
            type: 'token',
          },
          {
            payload: { runId: 'run-live', threadId: 'thread-1', token: 'world' },
            type: 'token',
          },
          {
            payload: {
              fullContent: 'Hello world',
              metadata: { uiActions: [{ type: 'workflow_card' }] },
              runId: 'run-live',
              threadId: 'thread-1',
            },
            type: 'done',
          },
        ],
      ];
      mockGetThreadEvents.mockResolvedValue([
        { ...makeEvent('run.completed', 1, {}), runId: 'other-run' },
        {
          ...makeEvent('assistant.finalized', 2, { content: 'Hello world' }),
          runId: 'run-live',
        },
        { ...makeEvent('run.completed', 3, {}), runId: 'run-live' },
      ]);
      const onAssistantDelta = vi.fn();
      const onAssistantFinalized = vi.fn();

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' }, 120_000, {
        onAssistantDelta,
        onAssistantFinalized,
      });

      expect(onAssistantDelta.mock.calls).toEqual([
        ['Hello ', 'Hello '],
        ['world', 'Hello world'],
      ]);
      expect(onAssistantFinalized).toHaveBeenCalledOnce();
      expect(onAssistantFinalized).toHaveBeenCalledWith('Hello world', 'Hello world', {
        uiActions: [{ type: 'workflow_card' }],
      });
      expect(result.assistantMessage).toBe('Hello world');
      expect(result.lastSequence).toBe(3);
      expect(result.uiActions).toEqual([{ type: 'workflow_card' }]);
      expect(mockGetThreadEvents).toHaveBeenCalledOnce();
      expect(mockGetThreadEvents).toHaveBeenCalledWith('thread-1', 0);
      expect(mockLiveStream.bind).toHaveBeenCalledWith({
        runId: 'run-live',
        threadId: 'thread-1',
      });
      expect(mockLiveStream.close).toHaveBeenCalledOnce();
    });

    it('uses the finalized payload as the canonical replacement for partial live output', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-final',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      liveEventBatches = [
        [
          {
            payload: { runId: 'run-final', threadId: 'thread-1', token: 'partial' },
            type: 'token',
          },
          {
            payload: {
              fullContent: 'Canonical final answer',
              runId: 'run-final',
              threadId: 'thread-1',
            },
            type: 'done',
          },
        ],
      ];
      const onAssistantFinalized = vi.fn();

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' }, 120_000, {
        onAssistantFinalized,
      });

      expect(onAssistantFinalized).toHaveBeenCalledWith(
        'Canonical final answer',
        'partial',
        undefined
      );
      expect(result.assistantMessage).toBe('Canonical final answer');
    });

    it('recovers the full message from persisted finalization after a live disconnect', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-reconnect',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      liveEventBatches = [
        [
          {
            payload: { runId: 'run-reconnect', threadId: 'thread-1', token: 'Hello ' },
            type: 'token',
          },
          { reason: 'transport close', type: 'disconnected' },
        ],
        [
          { type: 'reconnected' },
          {
            payload: { runId: 'run-reconnect', threadId: 'thread-1', token: 'again' },
            type: 'token',
          },
        ],
      ];
      mockGetThreadEvents
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeEvent('assistant.finalized', 1, { content: 'Hello recovered world again' }),
          makeEvent('run.completed', 2, {}),
        ]);
      const onAssistantDelta = vi.fn();
      const onAssistantFinalized = vi.fn();
      const onTransportError = vi.fn();

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' }, 120_000, {
        onAssistantDelta,
        onAssistantFinalized,
        onTransportError,
      });

      expect(onAssistantDelta.mock.calls).toEqual([
        ['Hello ', 'Hello '],
        ['again', 'Hello again'],
      ]);
      expect(onAssistantFinalized).toHaveBeenCalledOnce();
      expect(onAssistantFinalized).toHaveBeenCalledWith(
        'Hello recovered world again',
        'Hello again',
        undefined
      );
      expect(onTransportError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('recovering') })
      );
      expect(result.assistantMessage).toBe('Hello recovered world again');
      expect(result.status).toBe('completed');
      expect(mockLiveStream.close).toHaveBeenCalledOnce();
    });

    it('falls back to persisted completion when the live transport errors', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-offline',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      liveEventBatches = [[{ error: new Error('connection refused'), type: 'transport-error' }]];
      mockGetThreadEvents.mockResolvedValue([
        makeEvent('assistant.finalized', 1, { content: 'Recovered result' }),
        makeEvent('run.completed', 2, {}),
      ]);
      const onTransportError = vi.fn();

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' }, 120_000, {
        onTransportError,
      });

      expect(onTransportError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'connection refused' })
      );
      expect(result.assistantMessage).toBe('Recovered result');
      expect(result.status).toBe('completed');
    });

    it('returns a failed result with partial content from an agent live error', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-failed',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      liveEventBatches = [
        [
          {
            payload: { runId: 'run-failed', threadId: 'thread-1', token: 'Partial' },
            type: 'token',
          },
          {
            payload: { error: 'provider failed', runId: 'run-failed', threadId: 'thread-1' },
            type: 'error',
          },
        ],
      ];

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' });

      expect(result).toEqual(
        expect.objectContaining({
          assistantMessage: 'Partial',
          error: 'provider failed',
          status: 'failed',
        })
      );
      expect(mockGetThreadEvents).toHaveBeenCalledOnce();
    });

    it('continues with persisted catch-up when opening the live transport throws', async () => {
      mockOpenAgentLiveStream.mockRejectedValueOnce(new Error('socket setup failed'));
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-catch-up',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      mockGetThreadEvents.mockResolvedValue([
        makeEvent('assistant.finalized', 1, { content: 'Persisted answer' }),
        makeEvent('run.completed', 2, {}),
      ]);
      const onTransportError = vi.fn();

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' }, 120_000, {
        onTransportError,
      });

      expect(onTransportError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'socket setup failed' })
      );
      expect(result.assistantMessage).toBe('Persisted answer');
      expect(result.status).toBe('completed');
    });

    it('completes from persisted terminal events without an existing thread', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-1',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      mockGetThreadEvents
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeEvent('assistant.finalized', 3, { content: 'Hello world' }),
          makeEvent('unknown.event', 4, {}),
          makeEvent('run.completed', 5, {}),
        ]);

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' });

      expect(mockGetThread).not.toHaveBeenCalled();
      expect(mockGetThreadSnapshot).not.toHaveBeenCalled();
      expect(mockStartAgentChatStream).toHaveBeenCalledWith({
        brandId: null,
        content: 'hi',
        expectedContextVersion: undefined,
      });
      expect(result.status).toBe('completed');
      expect(result.assistantMessage).toBe('Hello world');
      expect(result.lastSequence).toBe(5);
      expect(result.runId).toBe('run-1');
      expect(result.startedAt).toBe('2026-08-09T00:00:00.000Z');
      expect(result.threadId).toBe('thread-1');
    });

    it('reuses thread context when a threadId is provided', async () => {
      mockGetThread.mockResolvedValue({ brandId: 'brand-1', contextVersion: 4, id: 'thread-1' });
      mockGetThreadSnapshot.mockResolvedValue({
        lastSequence: 10,
        pendingInputRequests: [],
        threadId: 'thread-1',
        timeline: [],
      });
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-2',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      mockGetThreadEvents.mockResolvedValue([
        makeEvent('assistant.finalized', 11, {
          content: 'Final answer',
          metadata: { uiActions: [{ type: 'workflow_card' }, 'not-a-record'] },
        }),
        makeEvent('run.completed', 12, {}),
      ]);

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'continue', threadId: 'thread-1' });

      expect(mockGetThread).toHaveBeenCalledWith('thread-1');
      expect(mockStartAgentChatStream).toHaveBeenCalledWith({
        brandId: 'brand-1',
        content: 'continue',
        expectedContextVersion: 4,
        threadId: 'thread-1',
      });
      expect(mockGetThreadEvents).toHaveBeenCalledWith('thread-1', 10);
      expect(result.assistantMessage).toBe('Final answer');
      expect(result.uiActions).toEqual([{ type: 'workflow_card' }]);
    });

    it('ignores legacy persisted assistant.delta rows (#2793 removed the write)', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-3',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      mockGetThreadEvents.mockResolvedValue([
        makeEvent('assistant.delta', 1, { content: 'partial' }),
        makeEvent('assistant.finalized', 2, {}),
        makeEvent('run.completed', 3, {}),
      ]);

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' });

      expect(result.status).toBe('completed');
      expect(result.assistantMessage).toBeUndefined();
      expect(result.uiActions).toBeUndefined();
    });

    it('returns waiting-input with a normalized pending request', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-4',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      mockGetThreadEvents.mockResolvedValue([
        makeEvent('input.requested', 1, {
          allowFreeText: true,
          fieldId: 'field-1',
          metadata: { source: 'agent' },
          options: [{ id: 'a', label: 'Option A' }],
          prompt: 'Pick one',
          recommendedOptionId: 'a',
          requestId: 'req-1',
          title: 'Choose',
        }),
      ]);

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' });

      expect(result.status).toBe('waiting-input');
      expect(result.pendingInputRequest).toEqual({
        allowFreeText: true,
        fieldId: 'field-1',
        metadata: { source: 'agent' },
        options: [{ id: 'a', label: 'Option A' }],
        prompt: 'Pick one',
        recommendedOptionId: 'a',
        requestId: 'req-1',
        title: 'Choose',
      });
    });

    it('applies defaults for an empty input.requested payload', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-5',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      mockGetThreadEvents.mockResolvedValue([makeEvent('input.requested', 1, {})]);

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' });

      expect(result.pendingInputRequest).toEqual({
        allowFreeText: undefined,
        fieldId: undefined,
        metadata: undefined,
        options: undefined,
        prompt: 'Provide the requested input.',
        recommendedOptionId: undefined,
        requestId: '',
        title: 'Input requested',
      });
    });

    it('returns failed with the error message on run.failed', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-6',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      mockGetThreadEvents.mockResolvedValue([
        makeEvent('run.failed', 1, { error: 'model exploded' }),
      ]);

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('model exploded');
    });

    it('uses a default error message on error.raised without payload', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-7',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      mockGetThreadEvents.mockResolvedValue([makeEvent('error.raised', 1)]);

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Agent run failed');
    });

    it('times out when the deadline is exceeded before any event arrives', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-8',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });

      const { runAgentTurn } = await import('../../src/shell/agent-run');
      const result = await runAgentTurn({ content: 'hi' }, 0);

      expect(mockGetThreadEvents).not.toHaveBeenCalled();
      expect(result.status).toBe('timeout');
      expect(result.error).toContain('Timed out waiting for agent run');
      expect(result.assistantMessage).toBeUndefined();
    });
  });

  describe('answerPendingInput', () => {
    it('answers the request matching requestId and resumes collection', async () => {
      mockGetThread.mockResolvedValue({ brandId: null, contextVersion: 2, id: 'thread-1' });
      mockGetThreadSnapshot.mockResolvedValue({
        lastSequence: 5,
        pendingInputRequests: [
          { prompt: 'First', requestId: 'req-1', title: 'First' },
          { prompt: 'Second', requestId: 'req-2', title: 'Second' },
        ],
        threadId: 'thread-1',
        timeline: [],
      });
      mockRespondToInputRequest.mockResolvedValue({});
      mockGetThreadEvents.mockResolvedValue([makeEvent('run.completed', 6, {})]);

      const { answerPendingInput } = await import('../../src/shell/agent-run');
      const result = await answerPendingInput('thread-1', 'yes', 'req-1');

      expect(mockRespondToInputRequest).toHaveBeenCalledWith('thread-1', 'req-1', 'yes', {
        brandId: null,
        expectedContextVersion: 2,
      });
      expect(result.status).toBe('completed');
    });

    it('falls back to the latest pending request when requestId is omitted', async () => {
      mockGetThread.mockResolvedValue({ brandId: 'brand-1', contextVersion: 1, id: 'thread-1' });
      mockGetThreadSnapshot.mockResolvedValue({
        lastSequence: 0,
        pendingInputRequests: [
          { prompt: 'First', requestId: 'req-1', title: 'First' },
          { prompt: 'Second', requestId: 'req-2', title: 'Second' },
        ],
        threadId: 'thread-1',
        timeline: [],
      });
      mockRespondToInputRequest.mockResolvedValue({});
      mockGetThreadEvents.mockResolvedValue([makeEvent('run.completed', 1, {})]);

      const { answerPendingInput } = await import('../../src/shell/agent-run');
      await answerPendingInput('thread-1', 'answer');

      expect(mockRespondToInputRequest).toHaveBeenCalledWith('thread-1', 'req-2', 'answer', {
        brandId: 'brand-1',
        expectedContextVersion: 1,
      });
    });

    it('throws when the thread has no pending input requests', async () => {
      mockGetThread.mockResolvedValue({ brandId: null, contextVersion: 1, id: 'thread-1' });
      mockGetThreadSnapshot.mockResolvedValue({
        lastSequence: 0,
        pendingInputRequests: [],
        threadId: 'thread-1',
        timeline: [],
      });

      const { answerPendingInput } = await import('../../src/shell/agent-run');
      await expect(answerPendingInput('thread-1', 'answer')).rejects.toThrow(
        'Thread thread-1 has no pending input requests.'
      );
      expect(mockRespondToInputRequest).not.toHaveBeenCalled();
    });
  });
});
