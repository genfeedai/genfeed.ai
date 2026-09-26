import { PendingWorkflowExecutionReconcileService } from '@workers/scheduling/pending-workflow-execution-reconcile.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PendingWorkflowExecutionReconcileService', () => {
  const workflowExecutions = { completeExecution: vi.fn() };
  const staleExecutionFinder = { findMany: vi.fn() };
  const queueService = { hasClaimableSystemWorkflowJob: vi.fn() };
  const logger = { error: vi.fn() };
  const service = new PendingWorkflowExecutionReconcileService(
    workflowExecutions as never,
    staleExecutionFinder as never,
    queueService as never,
    logger as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    staleExecutionFinder.findMany.mockResolvedValue([]);
    queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);
    workflowExecutions.completeExecution.mockResolvedValue({
      id: 'execution-1',
      status: 'FAILED',
    });
  });

  it('does nothing when there are no stale pending executions', async () => {
    await service.reconcile();
    expect(queueService.hasClaimableSystemWorkflowJob).not.toHaveBeenCalled();
    expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
  });

  it('fails a stale execution with no live BullMQ job (#5162)', async () => {
    staleExecutionFinder.findMany.mockResolvedValue([
      { id: 'execution-1', organizationId: 'org-1' },
    ]);
    queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);

    await service.reconcile();

    expect(queueService.hasClaimableSystemWorkflowJob).toHaveBeenCalledWith(
      'system-workflow-execution-1',
    );
    expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
      'execution-1',
      expect.stringContaining('no worker ever picked it up'),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('never-claimed'),
      expect.objectContaining({
        executionId: 'execution-1',
        organizationId: 'org-1',
      }),
    );
  });

  it('leaves an execution alone when its job is still claimable — merely slow, not stuck', async () => {
    staleExecutionFinder.findMany.mockResolvedValue([
      { id: 'execution-2', organizationId: 'org-1' },
    ]);
    queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);

    await service.reconcile();

    expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
  });

  it('keeps reconciling remaining candidates when one fails', async () => {
    staleExecutionFinder.findMany.mockResolvedValue([
      { id: 'execution-3', organizationId: 'org-1' },
      { id: 'execution-4', organizationId: 'org-2' },
    ]);
    queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);
    workflowExecutions.completeExecution
      .mockRejectedValueOnce(new Error('db unavailable'))
      .mockResolvedValueOnce({ id: 'execution-4', status: 'FAILED' });

    await service.reconcile();

    expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to reconcile'),
      expect.objectContaining({ executionId: 'execution-3' }),
    );
  });
});
