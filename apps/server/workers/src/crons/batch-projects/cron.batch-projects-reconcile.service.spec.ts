import { BatchProjectReconcileService } from '@api/collections/batch-projects/services/batch-project-reconcile.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { CronBatchProjectsReconcileService } from '@workers/crons/batch-projects/cron.batch-projects-reconcile.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronBatchProjectsReconcileService', () => {
  let service: CronBatchProjectsReconcileService;
  const reconcileService = { reconcileGeneratingProjects: vi.fn() };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronBatchProjectsReconcileService,
        { provide: LoggerService, useValue: logger },
        {
          provide: BatchProjectReconcileService,
          useValue: reconcileService,
        },
      ],
    }).compile();
    service = module.get(CronBatchProjectsReconcileService);
  });

  it('reconciles every generating batch project and logs the sweep', async () => {
    reconcileService.reconcileGeneratingProjects.mockResolvedValue(3);

    await service.reconcileGeneratingProjects();

    expect(reconcileService.reconcileGeneratingProjects).toHaveBeenCalledTimes(
      1,
    );
    expect(logger.log).toHaveBeenCalledWith(
      'CronBatchProjectsReconcileService completed',
      expect.objectContaining({ projectCount: 3 }),
    );
  });

  it('stays quiet when nothing is generating', async () => {
    reconcileService.reconcileGeneratingProjects.mockResolvedValue(0);

    await service.reconcileGeneratingProjects();

    expect(logger.log).not.toHaveBeenCalled();
  });
});
