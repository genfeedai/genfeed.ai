import { PendingWorkflowExecutionReconcileService } from '@workers/scheduling/pending-workflow-execution-reconcile.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildCandidates(count: number, prefix: string) {
  const start = new Date('2026-01-01T00:00:00.000Z').getTime();
  return Array.from({ length: count }, (_, index) => ({
    createdAt: new Date(start + index * 1000),
    id: `${prefix}-${String(index).padStart(4, '0')}`,
    organizationId: 'org-1',
  }));
}

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
  let service: PendingWorkflowExecutionReconcileService;

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
    // A fresh service per test: the keyset cursor is instance state, and a
    // starvation/pagination scenario deliberately spans multiple calls to
    // `reconcile()` within a single test.
    service = new PendingWorkflowExecutionReconcileService(
      workflowExecutions as never,
      staleExecutionFinder as never,
      queueService as never,
      logger as never,
    );
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

  describe('keyset cursor pagination and starvation avoidance (#5319)', () => {
    it('starts each cohort with no cursor', async () => {
      await service.reconcile();

      expect(staleExecutionFinder.findMany).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        { cursor: undefined, limit: 200 },
      );
      expect(staleExecutionFinder.findManyAncient).toHaveBeenCalledWith(
        expect.any(Date),
        { cursor: undefined, limit: 200 },
      );
    });

    it('advances the recent cursor to the last row of a full page for the next tick', async () => {
      const page = buildCandidates(200, 'recent');
      staleExecutionFinder.findMany.mockResolvedValueOnce(page);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true); // all still claimable — none transition

      await service.reconcile();
      await service.reconcile();

      const secondCallOptions = staleExecutionFinder.findMany.mock.calls[1][2];
      const last = page[page.length - 1];
      expect(secondCallOptions.cursor).toEqual({
        createdAt: last.createdAt,
        id: last.id,
      });
    });

    it('resets the cursor to undefined once a page comes back shorter than the page size (lap complete)', async () => {
      const page = buildCandidates(50, 'recent');
      staleExecutionFinder.findMany.mockResolvedValueOnce(page);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);

      await service.reconcile();
      await service.reconcile();

      const secondCallOptions = staleExecutionFinder.findMany.mock.calls[1][2];
      expect(secondCallOptions.cursor).toBeUndefined();
    });

    it('examines a candidate beyond the first 200 rows within a bounded number of sweeps even when every earlier row keeps a live job', async () => {
      // First tick: page 1 is 200 rows that all retain a claimable BullMQ
      // job — under the pre-#5319 unordered, cursor-less query this row
      // would never be reached because it would never leave the "first
      // page" of an unordered scan being requeried every tick.
      const firstPage = buildCandidates(200, 'recent');
      // Second tick: a fresh page of 200 more rows, the last of which has no
      // live job and must transition.
      const secondPage = buildCandidates(200, 'recent-2');
      const orphan = { ...secondPage[secondPage.length - 1] };

      staleExecutionFinder.findMany
        .mockResolvedValueOnce(firstPage)
        .mockResolvedValueOnce(secondPage);

      queueService.hasClaimableSystemWorkflowJob.mockImplementation(
        async (jobId: string) => jobId !== `system-workflow-${orphan.id}`,
      );

      // Sweep 1: examines rows 1-200, all skipped (still claimable).
      await service.reconcile();
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();

      // Sweep 2: cursor resumes past the first 200 rows and reaches the
      // orphaned row beyond them.
      await service.reconcile();

      expect(staleExecutionFinder.findMany.mock.calls[1][2].cursor).toEqual({
        createdAt: firstPage[firstPage.length - 1].createdAt,
        id: firstPage[firstPage.length - 1].id,
      });
      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        orphan.id,
        expect.stringContaining('no worker ever picked it up'),
      );
      expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(1);
    });

    it('tracks the ancient cohort cursor independently from the recent cohort', async () => {
      const recentPage = buildCandidates(200, 'recent');
      const ancientPage = buildCandidates(200, 'ancient');
      staleExecutionFinder.findMany.mockResolvedValueOnce(recentPage);
      staleExecutionFinder.findManyAncient.mockResolvedValueOnce(ancientPage);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(true);

      await service.reconcile();
      await service.reconcile();

      const recentCursor =
        staleExecutionFinder.findMany.mock.calls[1][2].cursor;
      const ancientCursor =
        staleExecutionFinder.findManyAncient.mock.calls[1][1].cursor;
      expect(recentCursor).toEqual({
        createdAt: recentPage[recentPage.length - 1].createdAt,
        id: recentPage[recentPage.length - 1].id,
      });
      expect(ancientCursor).toEqual({
        createdAt: ancientPage[ancientPage.length - 1].createdAt,
        id: ancientPage[ancientPage.length - 1].id,
      });
      // Neither cohort's cursor leaked into the other's call.
      expect(recentCursor).not.toEqual(ancientCursor);
    });

    it('does not re-issue a recovery transition for a candidate already reconciled in an earlier sweep', async () => {
      // A row skipped in sweep 1 (still claimable) transitions out of
      // PENDING before sweep 2. The finder's status=PENDING filter means it
      // simply would not be returned again in production; this pins that
      // the reconciler itself has no independent path that would re-issue
      // the transition for a row it already handled once it stops coming
      // back from the finder.
      const candidate = { id: 'execution-once', organizationId: 'org-1' };
      staleExecutionFinder.findMany
        .mockResolvedValueOnce([candidate])
        .mockResolvedValueOnce([]);
      queueService.hasClaimableSystemWorkflowJob.mockResolvedValue(false);

      await service.reconcile();
      await service.reconcile();

      expect(workflowExecutions.completeExecution).toHaveBeenCalledTimes(1);
    });
  });
});
