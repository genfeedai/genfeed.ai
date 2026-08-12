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
    it('should enqueue one scan that derives every platform', async () => {
      await service.computeDailyPatterns();

      expect(queueService.add).toHaveBeenCalledTimes(1);
      expect(queueService.add).toHaveBeenCalledWith(
        'pattern-extraction',
        {},
        expect.objectContaining({ attempts: 2 }),
      );
    });

    it('should enqueue the scan with exponential backoff config', async () => {
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
  });
});
