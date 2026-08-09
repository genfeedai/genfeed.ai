import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentThreadEvent } from '../../src/api/threads';

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
  });

  describe('runAgentTurn', () => {
    it('collects streamed deltas and completes without an existing thread', async () => {
      mockStartAgentChatStream.mockResolvedValue({
        runId: 'run-1',
        startedAt: '2026-08-09T00:00:00.000Z',
        threadId: 'thread-1',
      });
      mockGetThreadEvents
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeEvent('assistant.delta', 1, { content: 'Hello ' }),
          makeEvent('assistant.delta', 2, { content: 'world' }),
          makeEvent('assistant.delta', 3, {}),
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

    it('keeps accumulated deltas when finalized carries no content', async () => {
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

      expect(result.assistantMessage).toBe('partial');
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
