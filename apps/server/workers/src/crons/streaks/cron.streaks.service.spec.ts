import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronStreaksService', () => {
  let service: CronStreaksService;
  let streaksService: {
    listStreakOrganizationIds: ReturnType<typeof vi.fn>;
    processStaleStreaks: ReturnType<typeof vi.fn>;
  };
  let provenanceService: { runAction: ReturnType<typeof vi.fn> };
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
      runAction: vi.fn(
        async (_input: unknown, action: () => Promise<unknown>) => ({
          provenance: {
            executionId: 'execution-1',
            workflowId: 'workflow-1',
            workflowLabel: 'Streak Maintenance',
          },
          result: await action(),
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
          provide: SystemWorkflowProvenanceService,
          useValue: provenanceService,
        },
        {
          provide: LoggerService,
          useValue: loggerService,
        },
      ],
    }).compile();

    service = module.get(CronStreaksService);
  });

  describe('processStreaks', () => {
    it('processes each organization inside a system workflow execution', async () => {
      await service.processStreaks();

      expect(provenanceService.runAction).toHaveBeenCalledTimes(2);
      expect(provenanceService.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.STREAK_MAINTENANCE,
          organizationId: 'org-1',
        }),
        expect.any(Function),
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
          atRisk: 10,
          broken: 4,
          frozen: 2,
          organizations: 2,
        },
      );
    });

    it('continues with remaining organizations when one fails', async () => {
      provenanceService.runAction
        .mockRejectedValueOnce(new Error('DB failure'))
        .mockImplementation(
          async (_input: unknown, action: () => Promise<unknown>) => ({
            provenance: {
              executionId: 'execution-2',
              workflowId: 'workflow-1',
              workflowLabel: 'Streak Maintenance',
            },
            result: await action(),
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
          atRisk: 5,
          broken: 2,
          frozen: 1,
          organizations: 2,
        },
      );
    });

    it('handles zero organizations without provenance calls', async () => {
      streaksService.listStreakOrganizationIds.mockResolvedValue([]);

      await service.processStreaks();

      expect(provenanceService.runAction).not.toHaveBeenCalled();
      expect(streaksService.processStaleStreaks).not.toHaveBeenCalled();
      expect(loggerService.log).toHaveBeenCalledWith(
        'CronStreaksService completed',
        {
          atRisk: 0,
          broken: 0,
          frozen: 0,
          organizations: 0,
        },
      );
    });

    it('should be instantiated as a NestJS provider', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(CronStreaksService);
    });
  });
});
