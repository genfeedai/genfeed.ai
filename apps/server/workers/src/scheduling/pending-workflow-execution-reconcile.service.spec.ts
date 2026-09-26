import { PendingWorkflowExecutionReconcileService } from '@workers/scheduling/pending-workflow-execution-reconcile.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PendingWorkflowExecutionReconcileService', () => {
  const workflowExecutions = {
    cancelExecution: vi.fn(),
    completeExecution: vi.fn(),
  };
  const staleExecutionFinder = {
    findMany: vi.fn(),
    findManyAncient: vi.fn(),
  };
  const queueService = { hasClaimableSystemWorkflowJob: vi.fn() };
  const logger = { error: vi.fn(), log: vi.fn() };
  const service = new PendingWorkflowExecutionReconcileService(
    workflowExecutions as never,
    staleExecutionFinder as never,
    queueService as never,
    logger as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    staleExecutionFinder.findMany.mockResolvedValue([]);
    staleExecutionFinder.findManyAncient.mockResolvedValue([]);
    queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);
    workflowExecutions.completeExecution.mockResolvedValue({
      id: 'execution-1',
      status: 'FAILED',
    });
    workflowExecutions.cancelExecution.mockResolvedValue({
      status: 'CANCELLED',
    });
  });

  it('does nothing when there are no stale pending executions', async () => {
    await service.reconcile();
    expect(queueService.hasClaimableSystemWorkflowJob).not.toHaveBeenCalled();
    expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
    expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
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
    expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
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

  describe('ancient (>24h) candidates (#5252 review)', () => {
    it('silently cancels an ancient never-claimed execution instead of failing it loudly', async () => {
      staleExecutionFinder.findManyAncient.mockResolvedValue([
        { id: 'execution-ancient-1', organizationId: 'org-1' },
      ]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).toHaveBeenCalledWith(
        'execution-ancient-1',
      );
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('silently cancelled'),
        expect.objectContaining({ executionId: 'execution-ancient-1' }),
      );
      // No error-level "surfaced" log — that would be a customer-visible signal.
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('leaves an ancient execution alone when its job is still somehow claimable', async () => {
      staleExecutionFinder.findManyAncient.mockResolvedValue([
        { id: 'execution-ancient-2', organizationId: 'org-1' },
      ]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).not.toHaveBeenCalled();
    });

    it('processes recent and ancient cohorts in the same reconcile pass', async () => {
      staleExecutionFinder.findMany.mockResolvedValue([
        { id: 'execution-recent', organizationId: 'org-1' },
      ]);
      staleExecutionFinder.findManyAncient.mockResolvedValue([
        { id: 'execution-old', organizationId: 'org-1' },
      ]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);

      await service.reconcile();

      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        'execution-recent',
        expect.any(String),
      );
      expect(workflowExecutions.cancelExecution).toHaveBeenCalledWith(
        'execution-old',
      );
    });

    it('keeps reconciling remaining ancient candidates when one fails', async () => {
      staleExecutionFinder.findManyAncient.mockResolvedValue([
        { id: 'execution-ancient-3', organizationId: 'org-1' },
        { id: 'execution-ancient-4', organizationId: 'org-2' },
      ]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);
      workflowExecutions.cancelExecution
        .mockRejectedValueOnce(new Error('db unavailable'))
        .mockResolvedValueOnce({ status: 'CANCELLED' });

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to reconcile'),
        expect.objectContaining({ executionId: 'execution-ancient-3' }),
      );
    });
  });
});
