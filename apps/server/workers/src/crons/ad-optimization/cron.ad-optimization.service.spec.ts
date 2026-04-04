import { AdOptimizationConfigsService } from '@api/collections/ad-optimization-configs/services/ad-optimization-configs.service';
import { QueueService } from '@api/queues/core/queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronAdOptimizationService } from '@workers/crons/ad-optimization/cron.ad-optimization.service';

describe('CronAdOptimizationService', () => {
  let service: CronAdOptimizationService;
  let queueService: { add: ReturnType<typeof vi.fn> };
  let cacheService: {
    acquireLock: ReturnType<typeof vi.fn>;
    releaseLock: ReturnType<typeof vi.fn>;
  };
  let optimizationConfigService: {
    findAllEnabled: ReturnType<typeof vi.fn>;
  };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockConfigs = [
    { _id: 'cfg-1', organization: { toString: () => 'org-1' } },
    { _id: 'cfg-2', organization: { toString: () => 'org-2' } },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    queueService = { add: vi.fn().mockResolvedValue(undefined) };
    cacheService = {
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn().mockResolvedValue(undefined),
    };
    optimizationConfigService = {
      findAllEnabled: vi.fn().mockResolvedValue(mockConfigs),
    };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronAdOptimizationService,
        { provide: QueueService, useValue: queueService },
        { provide: CacheService, useValue: cacheService },
        {
          provide: AdOptimizationConfigsService,
          useValue: optimizationConfigService,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get(CronAdOptimizationService);
  });

  describe('runOptimization()', () => {
    it('acquires lock before processing', async () => {
      await service.runOptimization();

      expect(cacheService.acquireLock).toHaveBeenCalledWith(
        'cron:ad-optimization',
        expect.any(Number),
      );
    });

    it('skips processing when lock is not acquired', async () => {
      cacheService.acquireLock.mockResolvedValueOnce(false);

      await service.runOptimization();

      expect(optimizationConfigService.findAllEnabled).not.toHaveBeenCalled();
      expect(queueService.add).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('skipped'),
      );
    });

    it('enqueues one job per enabled config', async () => {
      await service.runOptimization();

      expect(queueService.add).toHaveBeenCalledTimes(2);
      expect(queueService.add).toHaveBeenCalledWith(
        'ad-optimization',
        expect.objectContaining({ organizationId: 'org-1' }),
        expect.any(Object),
      );
      expect(queueService.add).toHaveBeenCalledWith(
        'ad-optimization',
        expect.objectContaining({ organizationId: 'org-2' }),
        expect.any(Object),
      );
    });

    it('includes configId and runId in enqueued job data', async () => {
      await service.runOptimization();

      const firstCall = queueService.add.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(firstCall.configId).toBe('cfg-1');
      expect(typeof firstCall.runId).toBe('string');
      expect(firstCall.runId).toHaveLength(36); // UUID v4
    });

    it('uses the same runId for all jobs in a single run', async () => {
      await service.runOptimization();

      const runIds = queueService.add.mock.calls.map(
        (call: [string, Record<string, unknown>]) => call[1].runId,
      );
      expect(new Set(runIds).size).toBe(1);
    });

    it('always releases the lock in finally block', async () => {
      optimizationConfigService.findAllEnabled.mockRejectedValueOnce(
        new Error('DB error'),
      );

      await service.runOptimization();

      expect(cacheService.releaseLock).toHaveBeenCalledWith(
        'cron:ad-optimization',
      );
    });

    it('logs error when processing throws', async () => {
      optimizationConfigService.findAllEnabled.mockRejectedValueOnce(
        new Error('DB error'),
      );

      await service.runOptimization();

      expect(logger.error).toHaveBeenCalled();
    });

    it('exits early when no enabled configs found', async () => {
      optimizationConfigService.findAllEnabled.mockResolvedValueOnce([]);

      await service.runOptimization();

      expect(queueService.add).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('no enabled'),
      );
    });

    it('configures job with retry attempts and backoff', async () => {
      await service.runOptimization();

      const jobOptions = queueService.add.mock.calls[0][2] as Record<
        string,
        unknown
      >;
      expect(jobOptions.attempts).toBe(3);
      expect(jobOptions.backoff).toMatchObject({ type: 'exponential' });
    });
  });
});
