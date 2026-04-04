import { QueueService } from '@api/queues/core/queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronAdInsightsService } from '@workers/crons/ad-insights/cron.ad-insights.service';
import type { Mocked } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronAdInsightsService', () => {
  let service: CronAdInsightsService;
  let logger: Mocked<LoggerService>;
  let queueService: Mocked<QueueService>;

  beforeEach(async () => {
    const mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    const mockQueueService = {
      add: vi.fn().mockResolvedValue({ id: 'queue-insights-1' }),
    } as unknown as Mocked<QueueService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronAdInsightsService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get<CronAdInsightsService>(CronAdInsightsService);
    logger = module.get(LoggerService);
    queueService = module.get(QueueService);

    vi.clearAllMocks();
  });

  describe('computeWeeklyInsights (cron handler)', () => {
    it('should enqueue an ad-insights-aggregation job', async () => {
      await service.computeWeeklyInsights();

      expect(queueService.add).toHaveBeenCalledWith(
        'ad-insights-aggregation',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should include all required insight types', async () => {
      await service.computeWeeklyInsights();

      const jobData = queueService.add.mock.calls[0][1] as {
        insightTypes: string[];
      };
      expect(jobData.insightTypes).toContain('top_headlines');
      expect(jobData.insightTypes).toContain('best_ctas');
      expect(jobData.insightTypes).toContain('optimal_spend');
      expect(jobData.insightTypes).toContain('platform_comparison');
      expect(jobData.insightTypes).toContain('industry_benchmark');
    });

    it('should log start and enqueue completion messages', async () => {
      await service.computeWeeklyInsights();

      expect(logger.log).toHaveBeenCalledTimes(2);
    });

    it('should log a started message', async () => {
      await service.computeWeeklyInsights();

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('started'),
      );
    });

    it('should log enqueue confirmation', async () => {
      await service.computeWeeklyInsights();

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('weekly ad insights aggregation job enqueued'),
      );
    });

    it('should configure 2 retry attempts', async () => {
      await service.computeWeeklyInsights();

      expect(queueService.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ attempts: 2 }),
      );
    });

    it('should configure exponential backoff', async () => {
      await service.computeWeeklyInsights();

      expect(queueService.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          backoff: { delay: 10000, type: 'exponential' },
        }),
      );
    });

    it('should catch queue errors and log them without throwing', async () => {
      queueService.add = vi
        .fn()
        .mockRejectedValue(new Error('Queue unavailable'));

      await expect(service.computeWeeklyInsights()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
