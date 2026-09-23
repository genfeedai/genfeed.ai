import { resolveStreamFromMessages } from '@genfeedai/agent/hooks/agent-chat-stream.completion';
import { STREAM_COMPLETION_GRACE_PERIOD_MS } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { formatAgentError } from '@genfeedai/agent/utils/format-agent-error.util';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { expect, it, vi } from 'vitest';

it('emits a structured stream-recovery timeout after durable acknowledgement', async () => {
  const setError = vi.fn();
  const deps = {
    apiService: {
      getMessages: vi.fn().mockResolvedValue([]),
      getWorkflowExecution: vi.fn().mockResolvedValue({
        error: null,
        id: 'execution-1',
        status: WorkflowExecutionStatus.FAILED,
      }),
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
      runId: 'execution-1',
      startedAt: new Date().toISOString(),
      threadId: 'thread-1',
    },
    deps as never,
  );

  const persistedError = setError.mock.calls[0]?.[0];
  expect(persistedError).toEqual(expect.stringMatching(/^agent-error:/));
  expect(formatAgentError(persistedError).title).toBe('Run timed out');
});

it('keeps reconciling a durably queued run after the stream grace period', async () => {
  const deps = {
    apiService: {
      getMessages: vi.fn().mockResolvedValue([]),
      getWorkflowExecution: vi.fn().mockResolvedValue({
        id: 'execution-1',
        status: WorkflowExecutionStatus.PENDING,
      }),
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
    setError: vi.fn(),
    setMessages: vi.fn(),
    updateThreadSummary: vi.fn(),
  };

  await resolveStreamFromMessages(
    {
      initiatedAt: Date.now() - STREAM_COMPLETION_GRACE_PERIOD_MS,
      preAssistantIds: new Set(),
      runId: 'execution-1',
      startedAt: new Date().toISOString(),
      threadId: 'thread-1',
    },
    deps as never,
  );

  expect(deps.scheduleCompletionWatchdog).toHaveBeenCalledOnce();
  expect(deps.updateThreadSummary).toHaveBeenCalledWith('thread-1', {
    runStatus: 'queued',
  });
  expect(deps.setError).not.toHaveBeenCalled();
  expect(deps.clearPendingCompletion).not.toHaveBeenCalled();
  expect(deps.cleanupSubscriptions).not.toHaveBeenCalled();
});

it('recovers only the reply produced by the tracked run', async () => {
  const trackedReply = {
    content: 'Your setup is partially done.',
    createdAt: '2026-09-23T15:09:00.000Z',
    id: 'assistant-run-2',
    metadata: { runId: 'execution-2' },
    role: 'assistant' as const,
    threadId: 'thread-1',
  };
  const deps = {
    apiService: {
      getMessages: vi.fn().mockResolvedValue([
        {
          ...trackedReply,
          content: 'Reply from the earlier run',
          id: 'assistant-run-1',
          metadata: { runId: 'execution-1' },
        },
      ]),
      getWorkflowExecution: vi.fn(),
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
    setError: vi.fn(),
    setMessages: vi.fn(),
    updateThreadSummary: vi.fn(),
  };
  const pending = {
    initiatedAt: Date.now(),
    preAssistantIds: new Set<string>(),
    runId: 'execution-2',
    startedAt: '2026-09-23T15:08:00.000Z',
    threadId: 'thread-1',
  };

  await resolveStreamFromMessages(pending, deps as never);

  expect(deps.setMessages).not.toHaveBeenCalled();
  expect(deps.scheduleCompletionWatchdog).toHaveBeenCalledOnce();

  deps.apiService.getMessages.mockResolvedValue([trackedReply]);
  await resolveStreamFromMessages(pending, deps as never);

  expect(deps.setMessages).toHaveBeenCalledWith([trackedReply]);
  expect(deps.setActiveRun).toHaveBeenCalledWith('execution-2', {
    startedAt: '2026-09-23T15:08:00.000Z',
    status: 'completed',
  });
});
