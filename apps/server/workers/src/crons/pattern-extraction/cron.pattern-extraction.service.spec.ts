import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronPatternExtractionService } from '@workers/crons/pattern-extraction/cron.pattern-extraction.service';
import { PatternExtractionQueueService } from '@workers/queues/pattern-extraction-queue.service';

describe('CronPatternExtractionService', () => {
  let service: CronPatternExtractionService;
  let patternExtractionQueueService: {
    enqueueScan: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    patternExtractionQueueService = {
      enqueueScan: vi.fn().mockResolvedValue(undefined),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronPatternExtractionService,
        {
          provide: PatternExtractionQueueService,
          useValue: patternExtractionQueueService,
        },
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

      expect(patternExtractionQueueService.enqueueScan).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should log start and completion messages', async () => {
      await service.computeDailyPatterns();

      expect(loggerService.log).toHaveBeenCalledTimes(2);
    });

    it('should log error and not throw when enqueueScan fails', async () => {
      const err = new Error('Queue connection failed');
      patternExtractionQueueService.enqueueScan.mockRejectedValue(err);

      await expect(service.computeDailyPatterns()).resolves.toBeUndefined();

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        err,
      );
    });

    it('should handle unknown error type in catch block', async () => {
      patternExtractionQueueService.enqueueScan.mockRejectedValue(
        'string error',
      );

      await expect(service.computeDailyPatterns()).resolves.toBeUndefined();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
