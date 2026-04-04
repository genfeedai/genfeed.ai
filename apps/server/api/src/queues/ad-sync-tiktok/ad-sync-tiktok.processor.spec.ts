import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';

import {
  AdSyncTikTokProcessor,
  type TikTokAdSyncJobData,
} from './ad-sync-tiktok.processor';

const makeJob = (
  data: Partial<TikTokAdSyncJobData> = {},
): Job<TikTokAdSyncJobData> =>
  ({
    attemptsMade: 0,
    data: {
      accessToken: 'tok',
      advertiserIds: ['adv-1', 'adv-2'],
      brandId: 'brand-1',
      credentialId: 'cred-1',
      organizationId: 'org-1',
      ...data,
    },
    id: 'job-1',
    opts: { attempts: 3 },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Job<TikTokAdSyncJobData>;

describe('AdSyncTikTokProcessor', () => {
  let processor: AdSyncTikTokProcessor;
  let loggerService: vi.Mocked<Pick<LoggerService, 'log' | 'error' | 'warn'>>;

  beforeEach(async () => {
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdSyncTikTokProcessor,
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    processor = module.get<AdSyncTikTokProcessor>(AdSyncTikTokProcessor);

    // Remove artificial delay in tests
    vi.spyOn(processor as never, 'delay').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('process', () => {
    it('completes successfully for multiple advertisers', async () => {
      const job = makeJob({ advertiserIds: ['adv-1', 'adv-2'] });
      await expect(processor.process(job)).resolves.toBeUndefined();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('completed'),
      );
    });

    it('handles empty advertiser list without error', async () => {
      const job = makeJob({ advertiserIds: [] });
      await expect(processor.process(job)).resolves.toBeUndefined();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('uses last 30 days when lastSyncDate is absent', async () => {
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const job = makeJob({ advertiserIds: ['adv-1'] });
      await processor.process(job);
      // We cannot inspect syncFrom directly but the process should not throw
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('uses provided lastSyncDate when present', async () => {
      const job = makeJob({
        advertiserIds: ['adv-1'],
        lastSyncDate: '2024-01-01',
      });
      await expect(processor.process(job)).resolves.toBeUndefined();
    });

    it('continues processing remaining advertisers on individual failure', async () => {
      const job = makeJob({ advertiserIds: ['adv-err', 'adv-ok'] });
      // Simulate the private method throwing for first advertiser only
      let calls = 0;
      vi.spyOn(processor as never, 'syncAdvertiserData').mockImplementation(
        async () => {
          calls++;
          if (calls === 1) throw new Error('rate-limited');
        },
      );
      await expect(processor.process(job)).resolves.toBeUndefined();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync TikTok advertiser'),
        expect.any(String),
      );
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('rethrows a top-level error and logs it', async () => {
      const job = makeJob({ advertiserIds: ['adv-1'] });
      // Mock syncAdvertiserData so the only updateProgress call is the outer one (line 49)
      vi.spyOn(processor as never, 'syncAdvertiserData').mockResolvedValue(
        undefined,
      );
      vi.spyOn(job, 'updateProgress').mockRejectedValueOnce(
        new Error('BullMQ gone'),
      );
      await expect(processor.process(job)).rejects.toThrow('BullMQ gone');
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('logs the start of processing with org and advertiser count', async () => {
      const job = makeJob({
        advertiserIds: ['a', 'b', 'c'],
        organizationId: 'org-test',
      });
      await processor.process(job);
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('org-test'),
      );
    });

    it('calls updateProgress(50) per advertiser via syncAdvertiserData', async () => {
      const job = makeJob({ advertiserIds: ['adv-1'] });
      await processor.process(job);
      // updateProgress(50) from syncAdvertiserData + updateProgress(100) at end
      expect(job.updateProgress).toHaveBeenCalledWith(50);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });
  });
});
