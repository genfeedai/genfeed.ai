import { QueueService } from '@api/queues/core/queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronPatternExtractionService } from '@workers/crons/pattern-extraction/cron.pattern-extraction.service';

describe('CronPatternExtractionService', () => {
  let service: CronPatternExtractionService;
  let queueService: {
    add: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    queueService = {
      add: vi.fn().mockResolvedValue(undefined),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronPatternExtractionService,
        { provide: QueueService, useValue: queueService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<CronPatternExtractionService>(
      CronPatternExtractionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('computeDailyPatterns', () => {
    it('should enqueue jobs for all platforms', async () => {
      await service.computeDailyPatterns();

      expect(queueService.add).toHaveBeenCalledTimes(6);
    });

    it('should enqueue jobs for tiktok platform', async () => {
      await service.computeDailyPatterns();

      expect(queueService.add).toHaveBeenCalledWith(
        'pattern-extraction',
        { platform: 'tiktok' },
        expect.objectContaining({ attempts: 2 }),
      );
    });

    it('should enqueue jobs for instagram platform', async () => {
      await service.computeDailyPatterns();

      expect(queueService.add).toHaveBeenCalledWith(
        'pattern-extraction',
        { platform: 'instagram' },
        expect.any(Object),
      );
    });

    it('should enqueue jobs for the "all" aggregation platform', async () => {
      await service.computeDailyPatterns();

      expect(queueService.add).toHaveBeenCalledWith(
        'pattern-extraction',
        { platform: 'all' },
        expect.any(Object),
      );
    });

    it('should enqueue jobs with exponential backoff config', async () => {
      await service.computeDailyPatterns();

      expect(queueService.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          backoff: { delay: 10000, type: 'exponential' },
        }),
      );
    });

    it('should log start and completion messages', async () => {
      await service.computeDailyPatterns();

      expect(loggerService.log).toHaveBeenCalledTimes(2);
    });

    it('should log error and not throw when queueService.add fails', async () => {
      const err = new Error('Queue connection failed');
      queueService.add.mockRejectedValue(err);

      await expect(service.computeDailyPatterns()).resolves.toBeUndefined();

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        err,
      );
    });

    it('should handle unknown error type in catch block', async () => {
      queueService.add.mockRejectedValue('string error');

      await expect(service.computeDailyPatterns()).resolves.toBeUndefined();
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should enqueue exactly the expected platform list', async () => {
      await service.computeDailyPatterns();

      const platforms = queueService.add.mock.calls.map(
        (call: [string, { platform: string }]) => call[1].platform,
      );
      expect(platforms).toEqual([
        'tiktok',
        'instagram',
        'facebook',
        'youtube',
        'google_ads',
        'all',
      ]);
    });
  });
});
