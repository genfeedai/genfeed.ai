import { BatchGenerationReconcileService } from '@api/services/batch-generation/batch-generation-reconcile.service';
import { BatchGenerationWorkflowService } from '@api/services/batch-generation/batch-generation-workflow.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronBatchGenerationReconcileService } from '@workers/crons/batch-generation/cron.batch-generation-reconcile.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronBatchGenerationReconcileService', () => {
  let service: CronBatchGenerationReconcileService;
  let reconcileService: {
    findStrandedBatches: ReturnType<typeof vi.fn>;
    reconcileSettlementShortfalls: ReturnType<typeof vi.fn>;
  };
  let queueService: { queueBatch: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const strandedBatches = [
    {
      batchId: 'batch-1',
      organizationId: 'org-1',
      resumeCount: 1,
      userId: 'user-1',
    },
    {
      batchId: 'batch-2',
      organizationId: 'org-2',
      resumeCount: 0,
      userId: 'user-2',
    },
  ];

  beforeEach(async () => {
    reconcileService = {
      findStrandedBatches: vi.fn().mockResolvedValue([]),
      reconcileSettlementShortfalls: vi.fn().mockResolvedValue(undefined),
    };
    queueService = { queueBatch: vi.fn().mockResolvedValue('job-1') };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronBatchGenerationReconcileService,
        { provide: LoggerService, useValue: logger },
        {
          provide: BatchGenerationReconcileService,
          useValue: reconcileService,
        },
        { provide: BatchGenerationWorkflowService, useValue: queueService },
      ],
    }).compile();

    service = module.get(CronBatchGenerationReconcileService);
  });

  it('re-queues every stranded batch as a resume', async () => {
    reconcileService.findStrandedBatches.mockResolvedValue(strandedBatches);

    await service.resumeStrandedBatches();

    expect(queueService.queueBatch).toHaveBeenCalledTimes(2);
    expect(queueService.queueBatch).toHaveBeenCalledWith({
      batchId: 'batch-1',
      isResume: true,
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('keeps sweeping after one batch fails to enqueue', async () => {
    reconcileService.findStrandedBatches.mockResolvedValue(strandedBatches);
    queueService.queueBatch
      .mockRejectedValueOnce(new Error('redis unavailable'))
      .mockResolvedValue('job-2');

    await service.resumeStrandedBatches();

    // The second batch still gets its chance — one bad batch is not the sweep.
    expect(queueService.queueBatch).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(
      'CronBatchGenerationReconcileService completed',
      expect.objectContaining({ resumedCount: 1, strandedCount: 2 }),
    );
  });

  it('touches the queue only when something is stranded', async () => {
    await service.resumeStrandedBatches();

    expect(queueService.queueBatch).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('delegates settlement shortfall reconciliation to the API service', async () => {
    await service.reconcileSettlementShortfalls();

    expect(
      reconcileService.reconcileSettlementShortfalls,
    ).toHaveBeenCalledOnce();
  });
});
