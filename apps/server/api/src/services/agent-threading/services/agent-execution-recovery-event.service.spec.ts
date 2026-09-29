import { AgentExecutionRecoveryEventService } from '@api/services/agent-threading/services/agent-execution-recovery-event.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orgId = 'a'.repeat(24);
const threadId = 'b'.repeat(24);
const userId = 'c'.repeat(24);
const executionId = 'execution-1';

describe('AgentExecutionRecoveryEventService', () => {
  const findUnique = vi.fn();
  const findOne = vi.fn();
  const appendEvent = vi.fn();
  const warn = vi.fn();
  let service: AgentExecutionRecoveryEventService;

  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({
      organizationId: orgId,
      result: { metadata: { threadId } },
    });
    findOne.mockResolvedValue({ id: threadId, userId });
    appendEvent.mockResolvedValue({ sequence: 4 });
    service = new AgentExecutionRecoveryEventService(
      { workflowExecution: { findUnique } } as never,
      { findOne } as never,
      { appendEvent } as never,
      { warn } as never,
    );
  });

  it('records a failed run on the execution thread with the orchestrator command id', async () => {
    await service.recordExecutionEnded(executionId, {
      error: 'never started',
      type: 'failed',
    });

    expect(findOne).toHaveBeenCalledWith({
      id: threadId,
      isDeleted: false,
      organizationId: orgId,
    });
    expect(appendEvent).toHaveBeenCalledWith({
      commandId: `run-failed:${threadId}:${executionId}`,
      metadata: { origin: 'execution-recovery' },
      organizationId: orgId,
      payload: {
        error: 'never started',
        label: 'Agent failed',
        status: 'failed',
      },
      runId: executionId,
      threadId,
      type: 'run.failed',
      userId,
    });
  });

  it('records a cancelled run', async () => {
    await service.recordExecutionEnded(executionId, { type: 'cancelled' });

    expect(appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: `run-cancelled:${threadId}:${executionId}`,
        runId: executionId,
        type: 'run.cancelled',
      }),
    );
  });

  it('records nothing for an execution that is not an agent turn', async () => {
    findUnique.mockResolvedValue({ organizationId: orgId, result: {} });

    await service.recordExecutionEnded(executionId, {
      error: 'x',
      type: 'failed',
    });

    expect(appendEvent).not.toHaveBeenCalled();
  });

  it('records nothing when the thread is gone or deleted', async () => {
    findOne.mockResolvedValue(null);

    await service.recordExecutionEnded(executionId, {
      error: 'x',
      type: 'failed',
    });

    expect(appendEvent).not.toHaveBeenCalled();
  });

  it('never throws, so recovery still closes the execution', async () => {
    appendEvent.mockRejectedValue(new Error('db down'));

    await expect(
      service.recordExecutionEnded(executionId, { error: 'x', type: 'failed' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to record the ended run'),
      expect.objectContaining({ error: 'db down', executionId }),
    );
  });
});
