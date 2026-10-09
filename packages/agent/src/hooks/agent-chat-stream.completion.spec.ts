import { resolveStreamFromMessages } from '@genfeedai/agent/hooks/agent-chat-stream.completion';
import { STREAM_COMPLETION_GRACE_PERIOD_MS } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type { AgentThreadSnapshot } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentApiDecodeError,
  AgentApiRequestError,
} from '@genfeedai/agent/services/agent-api-error';
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
    isCurrentPending: vi.fn(() => true),
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
    isCurrentPending: vi.fn(() => true),
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
  const onRecoveredReply = vi.fn();
  const deps = {
    onRecoveredReply,
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
    isCurrentPending: vi.fn(() => true),
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

  expect(onRecoveredReply).not.toHaveBeenCalled();
  expect(deps.setMessages).not.toHaveBeenCalled();
  expect(deps.scheduleCompletionWatchdog).toHaveBeenCalledOnce();

  deps.apiService.getMessages.mockResolvedValue([trackedReply]);
  await resolveStreamFromMessages(pending, deps as never);

  expect(onRecoveredReply).toHaveBeenCalledWith(trackedReply, 'thread-1');
  expect(deps.setMessages).toHaveBeenCalledWith([trackedReply]);
  expect(deps.setActiveRun).toHaveBeenCalledWith('execution-2', {
    startedAt: '2026-09-23T15:08:00.000Z',
    status: 'completed',
  });
});

it('abandons a recovery whose run was replaced while messages were loading', async () => {
  let isCurrent = true;
  const deps = {
    apiService: {
      getMessages: vi.fn(async () => {
        // A handoff replaces the pending completion mid-request.
        isCurrent = false;
        return [
          {
            content: 'Reply from the replaced run',
            createdAt: '2026-09-23T15:09:00.000Z',
            id: 'assistant-run-1',
            metadata: { runId: 'execution-1' },
            role: 'assistant' as const,
            threadId: 'thread-1',
          },
        ];
      }),
      getWorkflowExecution: vi.fn(),
    },
    cleanupSubscriptions: vi.fn(),
    clearCompletionWatchdog: vi.fn(),
    clearPendingCompletion: vi.fn(),
    clearPendingInputRequest: vi.fn(),
    isCurrentPending: vi.fn(() => isCurrent),
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
      preAssistantIds: new Set<string>(),
      runId: 'execution-1',
      startedAt: '2026-09-23T15:06:00.000Z',
      threadId: 'thread-1',
    },
    deps as never,
  );

  expect(deps.setMessages).not.toHaveBeenCalled();
  expect(deps.setActiveRun).not.toHaveBeenCalled();
  expect(deps.updateThreadSummary).not.toHaveBeenCalled();
  expect(deps.cleanupSubscriptions).not.toHaveBeenCalled();
});

function recoverySnapshot(): AgentThreadSnapshot {
  return {
    activeRun: { runId: 'execution-1', status: 'completed' },
    lastAssistantMessage: null,
    lastSequence: 1,
    latestProposedPlan: null,
    latestUiBlocks: null,
    memorySummaryRefs: [],
    pendingApprovals: [],
    pendingInputRequests: [],
    profileSnapshot: null,
    sessionBinding: null,
    source: null,
    threadId: 'thread-1',
    threadStatus: 'active',
    timeline: [],
    title: null,
    uiActionRuns: [],
  };
}

function missingExecutionError() {
  return new AgentApiDecodeError({
    cause: new TypeError('The legacy server returned no execution payload'),
    message: 'Failed to deserialize workflow execution',
    reason: 'missing-resource',
  });
}

function recoveryDeps(snapshot = recoverySnapshot()) {
  return {
    apiService: {
      getMessages: vi.fn().mockResolvedValue([]),
      getThreadSnapshot: vi.fn().mockResolvedValue(snapshot),
      getWorkflowExecution: vi.fn().mockRejectedValue(missingExecutionError()),
    },
    cleanupSubscriptions: vi.fn(),
    clearCompletionWatchdog: vi.fn(),
    clearPendingCompletion: vi.fn(),
    clearPendingInputRequest: vi.fn(),
    isCurrentPending: vi.fn(() => true),
    isThreadVisible: vi.fn(() => true),
    resetStreamState: vi.fn(),
    scheduleCompletionWatchdog: vi.fn(),
    setActiveRun: vi.fn(),
    setActiveRunStatus: vi.fn(),
    setError: vi.fn(),
    setMessages: vi.fn(),
    settleUiActionRun: vi.fn(),
    updateThreadSummary: vi.fn(),
  };
}

function recoveryPending() {
  return {
    initiatedAt: Date.now() - STREAM_COMPLETION_GRACE_PERIOD_MS,
    preAssistantIds: new Set<string>(),
    requireRunId: true,
    runId: 'execution-1',
    startedAt: '2026-10-08T20:15:00.000Z',
    threadId: 'thread-1',
  };
}

it('reconciles the exact completed interactive run from a freshly authorized snapshot', async () => {
  const deps = recoveryDeps();
  await resolveStreamFromMessages(recoveryPending(), deps as never);
  expect(deps.apiService.getThreadSnapshot).toHaveBeenCalledExactlyOnceWith(
    'thread-1',
  );
  expect(deps.settleUiActionRun).toHaveBeenCalledWith(
    'thread-1',
    'execution-1',
    { status: 'completed' },
  );
  expect(deps.setError).toHaveBeenCalledWith(null);
  expect(deps.clearPendingCompletion).toHaveBeenCalledOnce();
});

it('reconciles an exact UI-action run even after another run becomes active', async () => {
  const snapshot = recoverySnapshot();
  snapshot.activeRun = { runId: 'newer-run', status: 'running' };
  snapshot.uiActionRuns = [
    {
      action: 'approve',
      queuedSequence: 1,
      runId: 'execution-1',
      sourceId: 'card-1',
      status: 'completed',
      terminalSequence: 2,
      updatedAt: '2026-10-08T20:16:00.000Z',
    },
  ];
  const deps = recoveryDeps(snapshot);
  deps.apiService.getWorkflowExecution.mockRejectedValue(
    new AgentApiRequestError({
      message: 'Execution not found',
      status: 404,
      source: 'api',
    }),
  );
  await resolveStreamFromMessages(recoveryPending(), deps as never);
  expect(deps.settleUiActionRun).toHaveBeenCalledWith(
    'thread-1',
    'execution-1',
    { status: 'completed' },
  );
  expect(deps.setError).toHaveBeenCalledWith(null);
});

it.each(['queued', 'running', 'awaiting_input', 'awaiting_confirmation'])(
  'keeps reconciling an exact interactive run whose snapshot status is %s',
  async (status) => {
    const snapshot = recoverySnapshot();
    snapshot.activeRun = { runId: 'execution-1', status };
    const deps = recoveryDeps(snapshot);
    await resolveStreamFromMessages(recoveryPending(), deps as never);
    expect(deps.scheduleCompletionWatchdog).toHaveBeenCalledOnce();
    expect(deps.settleUiActionRun).not.toHaveBeenCalled();
    expect(deps.setError).not.toHaveBeenCalled();
    expect(deps.clearPendingCompletion).not.toHaveBeenCalled();
    expect(deps.updateThreadSummary).toHaveBeenCalledWith('thread-1', {
      runStatus: status === 'queued' ? 'queued' : 'running',
    });
  },
);

it.each(['wrong-thread', 'wrong-run', 'unknown-status'])(
  'does not infer completion from a %s snapshot',
  async (scenario) => {
    const snapshot = recoverySnapshot();
    if (scenario === 'wrong-thread') snapshot.threadId = 'another-thread';
    if (scenario === 'wrong-run')
      snapshot.activeRun = { runId: 'another-run', status: 'completed' };
    if (scenario === 'unknown-status')
      snapshot.activeRun = { runId: 'execution-1', status: 'unrecognized' };
    const deps = recoveryDeps(snapshot);
    await resolveStreamFromMessages(recoveryPending(), deps as never);
    expect(deps.settleUiActionRun).not.toHaveBeenCalledWith(
      'thread-1',
      'execution-1',
      { status: 'completed' },
    );
    expect(deps.setActiveRun).not.toHaveBeenCalled();
    expect(deps.setError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to deserialize workflow execution'),
    );
  },
);

it('does not use a snapshot after thread access has been revoked', async () => {
  const deps = recoveryDeps();
  deps.apiService.getThreadSnapshot.mockRejectedValue(
    new AgentApiRequestError({
      message: 'Thread not found',
      source: 'api',
      status: 404,
    }),
  );
  await resolveStreamFromMessages(recoveryPending(), deps as never);
  expect(deps.settleUiActionRun).not.toHaveBeenCalledWith(
    'thread-1',
    'execution-1',
    { status: 'completed' },
  );
  expect(deps.setActiveRun).not.toHaveBeenCalled();
  expect(deps.setError).toHaveBeenCalledWith(
    expect.stringContaining('Thread not found'),
  );
});

it.each([
  new AgentApiRequestError({
    message: 'Forbidden',
    status: 403,
    source: 'api',
  }),
  new AgentApiRequestError({
    message: 'Network failure',
    status: 0,
    source: 'network',
  }),
  new AgentApiDecodeError({
    cause: new SyntaxError('Unexpected HTML response'),
    message: 'Failed to decode JSON response',
  }),
  new AgentApiDecodeError({
    cause: new TypeError('Invalid JSON:API document: expected resource data'),
    message: 'Failed to deserialize workflow execution',
    reason: 'invalid-document',
  }),
  new AgentApiDecodeError({
    cause: new TypeError('Malformed relationship data'),
    message: 'Failed to deserialize workflow execution',
  }),
])(
  'does not relax workflow decoding or retry a nonmissing failure: %s',
  async (error) => {
    const deps = recoveryDeps();
    deps.apiService.getWorkflowExecution.mockRejectedValue(error);
    await resolveStreamFromMessages(recoveryPending(), deps as never);
    expect(deps.apiService.getThreadSnapshot).not.toHaveBeenCalled();
    expect(deps.settleUiActionRun).not.toHaveBeenCalledWith(
      'thread-1',
      'execution-1',
      { status: 'completed' },
    );
  },
);

it('abandons snapshot recovery when another run takes ownership during the request', async () => {
  const deps = recoveryDeps();
  deps.apiService.getThreadSnapshot.mockImplementation(async () => {
    deps.isCurrentPending.mockReturnValue(false);
    return recoverySnapshot();
  });
  await resolveStreamFromMessages(recoveryPending(), deps as never);
  expect(deps.settleUiActionRun).not.toHaveBeenCalled();
  expect(deps.setActiveRun).not.toHaveBeenCalled();
  expect(deps.clearPendingCompletion).not.toHaveBeenCalled();
  expect(deps.cleanupSubscriptions).not.toHaveBeenCalled();
});

it('preserves the exact UI-action failure rather than a different active run outcome', async () => {
  const snapshot = recoverySnapshot();
  snapshot.activeRun = { runId: 'newer-run', status: 'completed' };
  snapshot.uiActionRuns = [
    {
      action: 'approve',
      queuedSequence: 1,
      runId: 'execution-1',
      sourceId: 'card-1',
      status: 'failed',
      error: 'Approval did not finish',
      terminalSequence: 2,
      updatedAt: '2026-10-08T20:16:00.000Z',
    },
  ];
  const deps = recoveryDeps(snapshot);
  await resolveStreamFromMessages(recoveryPending(), deps as never);
  expect(deps.settleUiActionRun).toHaveBeenCalledWith(
    'thread-1',
    'execution-1',
    { status: 'failed', error: 'Approval did not finish' },
  );
  expect(deps.setError).toHaveBeenCalledWith(
    expect.stringContaining('Approval did not finish'),
  );
});

it('does not infer completion from a malformed thread snapshot', async () => {
  const deps = recoveryDeps();
  deps.apiService.getThreadSnapshot.mockResolvedValue(null);
  await resolveStreamFromMessages(recoveryPending(), deps as never);
  expect(deps.settleUiActionRun).not.toHaveBeenCalledWith(
    'thread-1',
    'execution-1',
    { status: 'completed' },
  );
  expect(deps.setActiveRun).not.toHaveBeenCalled();
  expect(deps.setError).toHaveBeenCalledWith(
    expect.stringContaining('Failed to deserialize workflow execution'),
  );
});
