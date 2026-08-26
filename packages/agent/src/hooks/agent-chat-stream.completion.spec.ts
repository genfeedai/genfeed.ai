import { resolveStreamFromMessages } from '@genfeedai/agent/hooks/agent-chat-stream.completion';
import { STREAM_COMPLETION_GRACE_PERIOD_MS } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { Effect } from 'effect';
import { expect, it, vi } from 'vitest';

it('emits a structured stream-recovery timeout after durable acknowledgement', async () => {
  const setError = vi.fn();
  const deps = {
    apiService: {
      getMessagesEffect: vi.fn(() => Effect.succeed([])),
    },
    cleanupSubscriptions: vi.fn(),
    clearCompletionWatchdog: vi.fn(),
    clearPendingCompletion: vi.fn(),
    clearPendingInputRequest: vi.fn(),
    isCurrentPendingThread: vi.fn(() => true),
    isThreadVisible: vi.fn(() => true),
    resetStreamState: vi.fn(),
    scheduleCompletionWatchdog: vi.fn(),
    setActiveRun: vi.fn(),
    setActiveRunStatus: vi.fn(),
    setError,
    setMessages: vi.fn(),
    updateThreadSummary: vi.fn(),
  };

  await resolveStreamFromMessages(
    {
      initiatedAt: Date.now() - STREAM_COMPLETION_GRACE_PERIOD_MS,
      preAssistantIds: new Set(),
      runId: 'run-1',
      startedAt: new Date().toISOString(),
      threadId: 'thread-1',
    },
    deps as never,
  );

  const persistedError = setError.mock.calls[0]?.[0];
  expect(persistedError).toEqual(expect.stringMatching(/^agent-error:/));
  expect(formatAgentError(persistedError).title).toBe('Run timed out');
});
