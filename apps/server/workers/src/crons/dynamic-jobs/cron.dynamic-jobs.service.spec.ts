import { CronJobsService } from '@api/collections/cron-jobs/services/cron-jobs.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronDynamicJobsService } from '@workers/crons/dynamic-jobs/cron.dynamic-jobs.service';

describe('CronDynamicJobsService', () => {
  let service: CronDynamicJobsService;
  let cronJobsService: { processDueJobs: ReturnType<typeof vi.fn> };
  let cacheService: {
    acquireLock: ReturnType<typeof vi.fn>;
    releaseLock: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronDynamicJobsService,
        {
          provide: CronJobsService,
          useValue: {
            processDueJobs: vi.fn().mockResolvedValue(3),
          },
        },
        {
          provide: CacheService,
          useValue: {
            acquireLock: vi.fn().mockResolvedValue(true),
            releaseLock: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CronDynamicJobsService);
    cronJobsService = module.get(CronJobsService);
    cacheService = module.get(CacheService);
    logger = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processDueDynamicJobs', () => {
    it('acquires the distributed lock before running', async () => {
      await service.processDueDynamicJobs();
      expect(cacheService.acquireLock).toHaveBeenCalledWith(
        'cron:dynamic-jobs',
        300,
      );
    });

    it('calls processDueJobs when lock is acquired', async () => {
      await service.processDueDynamicJobs();
      expect(cronJobsService.processDueJobs).toHaveBeenCalledTimes(1);
    });

    it('logs the processed job count', async () => {
      await service.processDueDynamicJobs();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('processed 3 jobs'),
        'CronDynamicJobsService',
      );
    });

    it('releases the lock after successful processing', async () => {
      await service.processDueDynamicJobs();
      expect(cacheService.releaseLock).toHaveBeenCalledWith(
        'cron:dynamic-jobs',
      );
    });

    it('skips processing when lock is already held', async () => {
      cacheService.acquireLock.mockResolvedValue(false);
      await service.processDueDynamicJobs();
      expect(cronJobsService.processDueJobs).not.toHaveBeenCalled();
    });

    it('logs debug message when lock is not acquired', async () => {
      cacheService.acquireLock.mockResolvedValue(false);
      await service.processDueDynamicJobs();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('lock held'),
        'CronDynamicJobsService',
      );
    });

    it('releases the lock even when processDueJobs throws', async () => {
      cronJobsService.processDueJobs.mockRejectedValue(
        new Error('DB connection failed'),
      );
      await service.processDueDynamicJobs();
      expect(cacheService.releaseLock).toHaveBeenCalledWith(
        'cron:dynamic-jobs',
      );
    });

    it('logs error when processDueJobs throws', async () => {
      const err = new Error('DB connection failed');
      cronJobsService.processDueJobs.mockRejectedValue(err);
      await service.processDueDynamicJobs();
      expect(logger.error).toHaveBeenCalledWith(
        'Dynamic cron cycle failed',
        err,
        'CronDynamicJobsService',
      );
    });
  });
});
