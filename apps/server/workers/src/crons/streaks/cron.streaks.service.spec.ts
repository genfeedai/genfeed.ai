import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { StreaksService } from '@server/collections/streaks/services/streaks.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  type SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronStreaksService', () => {
  let service: CronStreaksService;
  let streaksService: {
    listStreakOrganizationIds: ReturnType<typeof vi.fn>;
    processStaleStreaks: ReturnType<typeof vi.fn>;
  };
  let actionExecutor: SystemWorkflowActionExecutor;
  let provenanceService: { registerAction: ReturnType<typeof vi.fn> };
  let workflowQueue: { queueSystemAction: ReturnType<typeof vi.fn> };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockStreakResult = {
    atRisk: 5,
    broken: 2,
    frozen: 1,
  };

  beforeEach(async () => {
    streaksService = {
      listStreakOrganizationIds: vi.fn().mockResolvedValue(['org-1', 'org-2']),
      processStaleStreaks: vi.fn().mockResolvedValue(mockStreakResult),
    };

    provenanceService = {
      registerAction: vi.fn(
        (_actionId: string, executor: SystemWorkflowActionExecutor) => {
          actionExecutor = executor;
        },
      ),
    };
    workflowQueue = {
      queueSystemAction: vi.fn(
        async (input: { inputValues?: Record<string, unknown> }) =>
          actionExecutor({
            context: {} as never,
            input: input.inputValues ?? {},
            provenance: {
              executionId: 'execution-1',
              workflowId: 'workflow-1',
              workflowLabel: 'Streak Maintenance',
            },
          }),
      ),
    };

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronStreaksService,
        {
          provide: StreaksService,
          useValue: streaksService,
        },
        {
          provide: SystemWorkflowRunnerService,
          useValue: provenanceService,
        },
        { provide: WorkflowExecutionQueueService, useValue: workflowQueue },
        {
          provide: LoggerService,
          useValue: loggerService,
        },
      ],
    }).compile();

    service = module.get(CronStreaksService);
    service.onModuleInit();
  });

  describe('processStreaks', () => {
    it('processes each organization inside a system workflow execution', async () => {
      await service.processStreaks();

      expect(workflowQueue.queueSystemAction).toHaveBeenCalledTimes(2);
      expect(workflowQueue.queueSystemAction).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.STREAK_MAINTENANCE,
          organizationId: 'org-1',
        }),
        expect.any(String),
      );
      expect(streaksService.processStaleStreaks).toHaveBeenCalledWith(
        expect.any(Date),
        'org-1',
      );
      expect(streaksService.processStaleStreaks).toHaveBeenCalledWith(
        expect.any(Date),
        'org-2',
      );
    });

    it('logs aggregated totals across organizations', async () => {
      await service.processStreaks();

      expect(loggerService.log).toHaveBeenCalledWith(
        'CronStreaksService completed',
        {
          organizations: 2,
          queued: 2,
        },
      );
    });

    it('continues with remaining organizations when one fails', async () => {
      workflowQueue.queueSystemAction
        .mockRejectedValueOnce(new Error('DB failure'))
        .mockImplementationOnce(
          async (input: { inputValues?: Record<string, unknown> }) =>
            actionExecutor({
              context: {} as never,
              input: input.inputValues ?? {},
              provenance: {
                executionId: 'execution-2',
                workflowId: 'workflow-1',
                workflowLabel: 'Streak Maintenance',
              },
            }),
        );

      await expect(service.processStreaks()).resolves.toBeUndefined();

      expect(loggerService.error).toHaveBeenCalledWith(
        'Streak maintenance failed for organization',
        expect.objectContaining({ organizationId: 'org-1' }),
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        'CronStreaksService completed',
        {
          organizations: 2,
          queued: 1,
        },
      );
    });

    it('handles zero organizations without provenance calls', async () => {
      streaksService.listStreakOrganizationIds.mockResolvedValue([]);

      await service.processStreaks();

      expect(workflowQueue.queueSystemAction).not.toHaveBeenCalled();
      expect(streaksService.processStaleStreaks).not.toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        'CronStreaksService completed',
        {
          organizations: 0,
          queued: 0,
        },
      );
    });

    it('should be instantiated as a NestJS provider', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(CronStreaksService);
    });
  });
});
