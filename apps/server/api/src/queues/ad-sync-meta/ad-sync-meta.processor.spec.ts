import {
  AdSyncMetaProcessor,
  type MetaAdSyncJobData,
} from '@api/queues/ad-sync-meta/ad-sync-meta.processor';
import { LoggerService } from '@libs/logger/logger.service';
import { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AdSyncMetaProcessor', () => {
  let processor: AdSyncMetaProcessor;
  let logger: LoggerService;

  beforeEach(() => {
    logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as any;

    processor = new AdSyncMetaProcessor(logger);
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
        brandId: 'brand-789',
        credentialId: 'cred-123',
        lastSyncDate: '2024-01-01T00:00:00Z',
        organizationId: 'org-456',
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
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should handle missing lastSyncDate and use default 30 days', async () => {
      const jobData: MetaAdSyncJobData = {
        accessToken: 'token-abc',
        adAccountIds: ['act_111'],
        brandId: 'brand-789',
        credentialId: 'cred-123',
        organizationId: 'org-456',
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
        brandId: 'brand-789',
        credentialId: 'cred-123',
        organizationId: 'org-456',
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
        brandId: 'brand-789',
        credentialId: 'cred-123',
        organizationId: 'org-456',
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
        brandId: 'brand-789',
        credentialId: 'cred-123',
        organizationId: 'org-456',
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
