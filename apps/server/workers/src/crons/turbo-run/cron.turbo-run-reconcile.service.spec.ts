import { TurboProjectReconcileService } from '@api/collections/turbo-projects/services/turbo-project-reconcile.service';
import { TurboRunReconcileService } from '@api/services/turbo-run/turbo-run-reconcile.service';
import { TurboRunWorkflowService } from '@api/services/turbo-run/turbo-run-workflow.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronTurboRunReconcileService } from '@workers/crons/turbo-run/cron.turbo-run-reconcile.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronTurboRunReconcileService', () => {
  let service: CronTurboRunReconcileService;
  let reconcileService: {
    findStrandedTurboRuns: ReturnType<typeof vi.fn>;
    reconcileSettlementShortfalls: ReturnType<typeof vi.fn>;
  };
  let queueService: { queueTurboRun: ReturnType<typeof vi.fn> };
  const turboProjectReconcile = { reconcileGeneratingProjects: vi.fn() };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const strandedTurboRuns = [
    {
      turboRunId: 'run-1',
      organizationId: 'org-1',
      resumeCount: 1,
      userId: 'user-1',
    },
    {
      turboRunId: 'run-2',
      organizationId: 'org-2',
      resumeCount: 0,
      userId: 'user-2',
    },
  ];

  beforeEach(async () => {
    reconcileService = {
      findStrandedTurboRuns: vi.fn().mockResolvedValue([]),
      reconcileSettlementShortfalls: vi.fn().mockResolvedValue(undefined),
    };
    queueService = { queueTurboRun: vi.fn().mockResolvedValue('job-1') };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronTurboRunReconcileService,
        { provide: LoggerService, useValue: logger },
        {
          provide: TurboRunReconcileService,
          useValue: reconcileService,
        },
        { provide: TurboRunWorkflowService, useValue: queueService },
        {
          provide: TurboProjectReconcileService,
          useValue: turboProjectReconcile,
        },
      ],
    }).compile();

    service = module.get(CronTurboRunReconcileService);
  });

  it('re-queues every stranded run as a resume', async () => {
    reconcileService.findStrandedTurboRuns.mockResolvedValue(strandedTurboRuns);

    await service.resumeStrandedTurboRuns();

    expect(queueService.queueTurboRun).toHaveBeenCalledTimes(2);
    expect(queueService.queueTurboRun).toHaveBeenCalledWith(
      {
        turboRunId: 'run-1',
        isResume: true,
        organizationId: 'org-1',
        userId: 'user-1',
      },
      SystemWorkflowDispatchClass.BACKGROUND,
    );
  });

  it('keeps sweeping after one run fails to enqueue', async () => {
    reconcileService.findStrandedTurboRuns.mockResolvedValue(strandedTurboRuns);
    queueService.queueTurboRun
      .mockRejectedValueOnce(new Error('redis unavailable'))
      .mockResolvedValue('job-2');

    await service.resumeStrandedTurboRuns();

    // The second run still gets its chance — one bad run is not the sweep.
    expect(queueService.queueTurboRun).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(
      'CronTurboRunReconcileService completed',
      expect.objectContaining({ resumedCount: 1, strandedCount: 2 }),
    );
  });

  it('touches the queue only when something is stranded', async () => {
    await service.resumeStrandedTurboRuns();

    expect(queueService.queueTurboRun).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('delegates settlement shortfall reconciliation to the API service', async () => {
    await service.reconcileSettlementShortfalls();

    expect(
      reconcileService.reconcileSettlementShortfalls,
    ).toHaveBeenCalledOnce();
  });

  it('advances every generating Studio Turbo project', async () => {
    turboProjectReconcile.reconcileGeneratingProjects.mockResolvedValue(3);

    await service.reconcileTurboProjects();

    expect(
      turboProjectReconcile.reconcileGeneratingProjects,
    ).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      'CronTurboRunReconcileService Turbo projects',
      expect.objectContaining({ projectCount: 3 }),
    );
  });
});
