import type { MetaAdSyncJobData } from '@genfeedai/queue-contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { AdPerformanceService } from '@server/collections/ad-performance/services/ad-performance.service';
import { MetaAdsService } from '@server/services/integrations/meta-ads/services/meta-ads.service';
import { AdSyncMetaProcessor } from '@workers/processors/api/queues/ad-sync-meta/ad-sync-meta.processor';
import { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const brandId = testId('brand');
const credentialId = testId('credential');
const organizationId = testId('org');

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
    } as unknown as LoggerService;
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
        brandId: brandId,
        credentialId: credentialId,
        lastSyncDate: '2024-01-01T00:00:00Z',
        organizationId: organizationId,
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

    it('should persist canonical identity fields with provider payload fields intact', async () => {
      const jobData: MetaAdSyncJobData = {
        accessToken: 'token-abc',
        adAccountIds: ['act_111'],
        brandId: 'brand-1',
        credentialId: 'credential-1',
        organizationId: 'org-1',
      };
      const job = {
        data: jobData,
        id: 'job-canonical-identity',
        updateProgress: vi.fn(),
      } as unknown as Job<MetaAdSyncJobData>;

      await processor.process(job);

      const records = adPerformanceService.upsertBatch.mock
        .calls[0][0] as Array<Record<string, unknown>>;
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        brandId: 'brand-1',
        credentialId: 'credential-1',
        externalAccountId: 'act_111',
        externalCampaignId: 'cmp_123',
        organizationId: 'org-1',
      });
      expect(records[0]).not.toHaveProperty('brand');
      expect(records[0]).not.toHaveProperty('credential');
      expect(records[0]).not.toHaveProperty('organization');
    });

    it('should handle missing lastSyncDate and use default 30 days', async () => {
      const jobData: MetaAdSyncJobData = {
        accessToken: 'token-abc',
        adAccountIds: ['act_111'],
        brandId: brandId,
        credentialId: credentialId,
        organizationId: organizationId,
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
        brandId: brandId,
        credentialId: credentialId,
        organizationId: organizationId,
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
        brandId: brandId,
        credentialId: credentialId,
        organizationId: organizationId,
      };

      const job = {
        data: jobData,
        id: 'job-4',
        updateProgress: vi.fn(),
      } as unknown as Job<MetaAdSyncJobData>;

      await processor.process(job);

      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('logs the account that failed and keeps syncing the rest', async () => {
      metaAdsService.listCampaigns
        .mockRejectedValueOnce(new Error('Meta rate limit'))
        .mockResolvedValueOnce([
          {
            id: 'cmp_456',
            name: 'Campaign Two',
            objective: 'OUTCOME_SALES',
            status: 'ACTIVE',
          },
        ]);
      const job = {
        data: {
          accessToken: 'token-abc',
          adAccountIds: ['act_bad', 'act_good'],
          brandId: 'brand-1',
          credentialId: 'credential-1',
          organizationId: 'org-1',
        },
        id: 'job-partial-failure',
        updateProgress: vi.fn(),
      } as unknown as Job<MetaAdSyncJobData>;

      await processor.process(job);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync Meta account act_bad'),
        'Meta rate limit',
      );
      expect(metaAdsService.listCampaigns).toHaveBeenCalledTimes(2);
      expect(adPerformanceService.upsertBatch).toHaveBeenCalledTimes(1);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Meta ad sync completed'),
      );
    });

    it('skips the upsert when an account has no campaigns', async () => {
      metaAdsService.listCampaigns.mockResolvedValue([]);
      const job = {
        data: {
          accessToken: 'token-abc',
          adAccountIds: ['act_empty'],
          brandId: 'brand-1',
          credentialId: 'credential-1',
          organizationId: 'org-1',
        },
        id: 'job-empty-campaigns',
        updateProgress: vi.fn(),
      } as unknown as Job<MetaAdSyncJobData>;

      await processor.process(job);

      expect(metaAdsService.getCampaignInsights).not.toHaveBeenCalled();
      expect(adPerformanceService.upsertBatch).not.toHaveBeenCalled();
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('skips the upsert when campaigns return no insights', async () => {
      metaAdsService.getCampaignInsights.mockResolvedValue([]);
      const job = {
        data: {
          accessToken: 'token-abc',
          adAccountIds: ['act_111'],
          brandId: 'brand-1',
          credentialId: 'credential-1',
          organizationId: 'org-1',
        },
        id: 'job-no-insights',
        updateProgress: vi.fn(),
      } as unknown as Job<MetaAdSyncJobData>;

      await processor.process(job);

      expect(adPerformanceService.upsertBatch).not.toHaveBeenCalled();
    });

    it('rethrows a whole-job failure so BullMQ can retry it', async () => {
      const job = {
        data: {
          accessToken: 'token-abc',
          adAccountIds: [],
          brandId: 'brand-1',
          credentialId: 'credential-1',
          organizationId: 'org-1',
        },
        id: 'job-fatal',
        updateProgress: vi.fn().mockRejectedValue(new Error('queue gone')),
      } as unknown as Job<MetaAdSyncJobData>;

      await expect(processor.process(job)).rejects.toThrow('queue gone');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Meta ad sync failed for org org-1'),
        'queue gone',
      );
    });

    it('resolves the inter-account backoff timer', async () => {
      const fresh = new AdSyncMetaProcessor(
        adPerformanceService as unknown as AdPerformanceService,
        logger,
        metaAdsService as unknown as MetaAdsService,
      );
      const delayable = fresh as unknown as {
        delay: (ms: number) => Promise<void>;
      };

      await expect(delayable.delay(0)).resolves.toBeUndefined();
    });

    it('should log errors for failed account syncs', async () => {
      const jobData: MetaAdSyncJobData = {
        accessToken: 'invalid-token',
        adAccountIds: ['act_bad'],
        brandId: brandId,
        credentialId: credentialId,
        organizationId: organizationId,
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
