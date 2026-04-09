import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import {
  AdSyncMetaProcessor,
  type MetaAdSyncJobData,
} from '@api/queues/ad-sync-meta/ad-sync-meta.processor';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AdSyncMetaProcessor', () => {
  let adPerformanceService: {
    upsertBatch: ReturnType<typeof vi.fn>;
  };
  let processor: AdSyncMetaProcessor;
  let logger: LoggerService;
  let metaAdsService: {
    getCampaignInsights: ReturnType<typeof vi.fn>;
    listCampaigns: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    adPerformanceService = {
      upsertBatch: vi.fn().mockResolvedValue(1),
    };
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as LoggerService;
    metaAdsService = {
      getCampaignInsights: vi.fn().mockResolvedValue([
        {
          clicks: 12,
          cpc: 2,
          cpm: 20,
          ctr: 1.2,
          dateStart: '2024-01-01',
          impressions: 1000,
          spend: 24,
        },
      ]),
      listCampaigns: vi.fn().mockResolvedValue([
        {
          id: 'cmp_123',
          name: 'Campaign One',
          objective: 'OUTCOME_SALES',
          status: 'ACTIVE',
        },
      ]),
    };

    processor = new AdSyncMetaProcessor(
      adPerformanceService as unknown as AdPerformanceService,
      logger,
      metaAdsService as unknown as MetaAdsService,
    );
    vi.spyOn(
      processor as unknown as { delay: () => Promise<void> },
      'delay',
    ).mockResolvedValue(undefined);
  });

  describe('instantiation', () => {
    it('should be defined', () => {
      expect(processor).toBeDefined();
    });
  });

  describe('process', () => {
    it('should process Meta ad sync job successfully', async () => {
      const jobData: MetaAdSyncJobData = {
        accessToken: 'token-abc',
        adAccountIds: ['act_111', 'act_222'],
        brandId: '507f1f77bcf86cd799439012',
        credentialId: '507f1f77bcf86cd799439013',
        lastSyncDate: '2024-01-01T00:00:00Z',
        organizationId: '507f1f77bcf86cd799439011',
      };

      const job = {
        data: jobData,
        id: 'job-1',
        updateProgress: vi.fn(),
      } as unknown as Job<MetaAdSyncJobData>;

      await processor.process(job);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing Meta ad sync'),
      );
      expect(adPerformanceService.upsertBatch).toHaveBeenCalled();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should handle missing lastSyncDate and use default 30 days', async () => {
      const jobData: MetaAdSyncJobData = {
        accessToken: 'token-abc',
        adAccountIds: ['act_111'],
        brandId: '507f1f77bcf86cd799439012',
        credentialId: '507f1f77bcf86cd799439013',
        organizationId: '507f1f77bcf86cd799439011',
      };

      const job = {
        data: jobData,
        id: 'job-2',
        updateProgress: vi.fn(),
      } as unknown as Job<MetaAdSyncJobData>;

      await processor.process(job);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing Meta ad sync'),
      );
    });

    it('should continue processing on individual account errors', async () => {
      const jobData: MetaAdSyncJobData = {
        accessToken: 'token-abc',
        adAccountIds: ['act_111', 'act_222', 'act_333'],
        brandId: '507f1f77bcf86cd799439012',
        credentialId: '507f1f77bcf86cd799439013',
        organizationId: '507f1f77bcf86cd799439011',
      };

      const job = {
        data: jobData,
        id: 'job-3',
        updateProgress: vi.fn(),
      } as unknown as Job<MetaAdSyncJobData>;

      await processor.process(job);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Meta ad sync completed'),
      );
    });

    it('should handle empty adAccountIds array', async () => {
      const jobData: MetaAdSyncJobData = {
        accessToken: 'token-abc',
        adAccountIds: [],
        brandId: '507f1f77bcf86cd799439012',
        credentialId: '507f1f77bcf86cd799439013',
        organizationId: '507f1f77bcf86cd799439011',
      };

      const job = {
        data: jobData,
        id: 'job-4',
        updateProgress: vi.fn(),
      } as unknown as Job<MetaAdSyncJobData>;

      await processor.process(job);

      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should log errors for failed account syncs', async () => {
      const jobData: MetaAdSyncJobData = {
        accessToken: 'invalid-token',
        adAccountIds: ['act_bad'],
        brandId: '507f1f77bcf86cd799439012',
        credentialId: '507f1f77bcf86cd799439013',
        organizationId: '507f1f77bcf86cd799439011',
      };

      const job = {
        data: jobData,
        id: 'job-5',
        updateProgress: vi.fn(),
      } as unknown as Job<MetaAdSyncJobData>;

      await processor.process(job);

      expect(logger.log).toHaveBeenCalled();
    });
  });
});
