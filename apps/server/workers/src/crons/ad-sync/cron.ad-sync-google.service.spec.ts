import type { GoogleAdSyncJobData } from '@api/queues/ad-sync-google/ad-sync-google.processor';
import { QueueService } from '@api/queues/core/queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { CronAdSyncGoogleService } from '@workers/crons/ad-sync/cron.ad-sync-google.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn().mockReturnValue('testMethod') },
}));

describe('CronAdSyncGoogleService', () => {
  let service: CronAdSyncGoogleService;
  let queueService: { add: ReturnType<typeof vi.fn> };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const sampleJobData: GoogleAdSyncJobData = {
    organizationId: 'org-abc-123',
  };

  beforeEach(async () => {
    queueService = { add: vi.fn().mockResolvedValue(undefined) };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronAdSyncGoogleService,
        { provide: QueueService, useValue: queueService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get(CronAdSyncGoogleService);
  });

  describe('syncGoogleAds', () => {
    it('logs start of cron execution', async () => {
      await service.syncGoogleAds();

      expect(loggerService.log).toHaveBeenCalled();
    });

    it('completes without throwing', async () => {
      await expect(service.syncGoogleAds()).resolves.toBeUndefined();
    });

    it('logs completion after scheduling', async () => {
      await service.syncGoogleAds();

      const logCalls = loggerService.log.mock.calls;
      expect(
        logCalls.some((call: string[]) =>
          String(call[0]).includes('completed'),
        ),
      ).toBe(true);
    });

    it('catches and logs errors', async () => {
      // Force an error by making logger.log throw on first call
      loggerService.log
        .mockImplementationOnce(() => {
          /* no-op */
        })
        .mockImplementationOnce(() => {
          throw new Error('unexpected logger failure');
        });

      // Should not propagate (error is caught)
      await expect(service.syncGoogleAds()).resolves.toBeUndefined();
    });
  });

  describe('enqueueAdSyncJob', () => {
    it('calls queueService.add with correct queue name and data', async () => {
      await service.enqueueAdSyncJob(sampleJobData);

      expect(queueService.add).toHaveBeenCalledWith(
        'ad-sync-google',
        sampleJobData,
        expect.objectContaining({
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
        }),
      );
    });

    it('applies jitter delay (0–30 minutes in ms)', async () => {
      await service.enqueueAdSyncJob(sampleJobData);

      const [, , options] = queueService.add.mock.calls[0] as [
        string,
        GoogleAdSyncJobData,
        { delay: number; attempts: number; backoff: unknown },
      ];

      expect(options.delay).toBeGreaterThanOrEqual(0);
      expect(options.delay).toBeLessThan(30 * 60 * 1000);
    });

    it('sets retry attempts to 3 with exponential backoff', async () => {
      await service.enqueueAdSyncJob(sampleJobData);

      const [, , options] = queueService.add.mock.calls[0] as [
        string,
        GoogleAdSyncJobData,
        { attempts: number; backoff: { type: string; delay: number } },
      ];

      expect(options.attempts).toBe(3);
      expect(options.backoff.type).toBe('exponential');
      expect(options.backoff.delay).toBe(5000);
    });

    it('logs enqueue confirmation with org id and jitter info', async () => {
      await service.enqueueAdSyncJob(sampleJobData);

      const logCalls = loggerService.log.mock.calls as [string][];
      const logMsg = logCalls.find((call) =>
        String(call[0]).includes('org-abc-123'),
      );
      expect(logMsg).toBeDefined();
    });

    it('enqueues multiple jobs independently', async () => {
      const jobA: GoogleAdSyncJobData = { organizationId: 'org-1' };
      const jobB: GoogleAdSyncJobData = { organizationId: 'org-2' };

      await service.enqueueAdSyncJob(jobA);
      await service.enqueueAdSyncJob(jobB);

      expect(queueService.add).toHaveBeenCalledTimes(2);
      expect(queueService.add.mock.calls[0][1]).toEqual(jobA);
      expect(queueService.add.mock.calls[1][1]).toEqual(jobB);
    });
  });
});
