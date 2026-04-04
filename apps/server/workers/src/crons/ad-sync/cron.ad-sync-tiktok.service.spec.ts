import { QueueService } from '@api/queues/core/queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronAdSyncTikTokService } from '@workers/crons/ad-sync/cron.ad-sync-tiktok.service';
import type { Mocked } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronAdSyncTikTokService', () => {
  let service: CronAdSyncTikTokService;
  let logger: Mocked<LoggerService>;
  let queueService: Mocked<QueueService>;

  const mockJobData = {
    accessToken: 'tok_test',
    advertiserIds: ['adv-1', 'adv-2'],
    brandId: 'brand-xyz',
    credentialId: 'cred-001',
    organizationId: 'org-abc',
  };

  beforeEach(async () => {
    const mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    const mockQueueService = {
      add: vi.fn().mockResolvedValue({ id: 'queue-job-1' }),
    } as unknown as Mocked<QueueService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronAdSyncTikTokService,
        { provide: LoggerService, useValue: mockLogger },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get<CronAdSyncTikTokService>(CronAdSyncTikTokService);
    logger = module.get(LoggerService);
    queueService = module.get(QueueService);

    vi.clearAllMocks();
  });

  describe('syncTikTokAds (cron handler)', () => {
    it('should log start and completion', async () => {
      await service.syncTikTokAds();

      expect(logger.log).toHaveBeenCalledTimes(2);
    });

    it('should log started message', async () => {
      await service.syncTikTokAds();

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('started'),
      );
    });

    it('should log scheduling completed message', async () => {
      await service.syncTikTokAds();

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('completed scheduling'),
      );
    });

    it('should not throw when executed', async () => {
      await expect(service.syncTikTokAds()).resolves.toBeUndefined();
    });

    it('should catch and log errors without throwing', async () => {
      // Simulate an error inside the try block by spying on logger.log
      logger.log = vi
        .fn()
        .mockImplementationOnce(() => {
          // first call (started) succeeds
        })
        .mockImplementationOnce(() => {
          throw new Error('unexpected error');
        });

      // Should not propagate the error
      await expect(service.syncTikTokAds()).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('enqueueAdSyncJob', () => {
    it('should call queueService.add with correct queue name', async () => {
      await service.enqueueAdSyncJob(mockJobData);

      expect(queueService.add).toHaveBeenCalledWith(
        'ad-sync-tiktok',
        mockJobData,
        expect.any(Object),
      );
    });

    it('should apply jitter delay to the job', async () => {
      await service.enqueueAdSyncJob(mockJobData);

      const callArgs = queueService.add.mock.calls[0][2] as { delay?: number };
      expect(callArgs.delay).toBeGreaterThanOrEqual(0);
      expect(callArgs.delay).toBeLessThanOrEqual(30 * 60 * 1000);
    });

    it('should configure 3 retry attempts', async () => {
      await service.enqueueAdSyncJob(mockJobData);

      expect(queueService.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('should configure exponential backoff', async () => {
      await service.enqueueAdSyncJob(mockJobData);

      expect(queueService.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          backoff: { delay: 5000, type: 'exponential' },
        }),
      );
    });

    it('should log enqueue message with organizationId', async () => {
      await service.enqueueAdSyncJob(mockJobData);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining(mockJobData.organizationId),
      );
    });

    it('should pass full job data to queue', async () => {
      await service.enqueueAdSyncJob(mockJobData);

      expect(queueService.add).toHaveBeenCalledWith(
        'ad-sync-tiktok',
        expect.objectContaining({
          advertiserIds: mockJobData.advertiserIds,
          brandId: mockJobData.brandId,
          organizationId: mockJobData.organizationId,
        }),
        expect.any(Object),
      );
    });
  });
});
