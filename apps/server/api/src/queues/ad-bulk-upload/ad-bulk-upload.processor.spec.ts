import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { AdCreativeMappingsService } from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AdBulkUploadJobData,
  AdBulkUploadProcessor,
} from './ad-bulk-upload.processor';

function makeJob(data: AdBulkUploadJobData): Job<AdBulkUploadJobData> {
  return {
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<AdBulkUploadJobData>;
}

function makeJobData(
  overrides: Partial<AdBulkUploadJobData> = {},
): AdBulkUploadJobData {
  return {
    accessToken: 'access-token',
    adAccountId: 'act_123',
    adSetId: 'adset-1',
    bodyCopies: ['Buy now!'],
    campaignId: 'campaign-1',
    credentialId: 'cred-1',
    headlines: ['Great Deal'],
    images: [],
    jobId: 'job-abc',
    linkUrl: 'https://example.com',
    organizationId: 'org-xyz',
    videos: [],
    ...overrides,
  };
}

describe('AdBulkUploadProcessor', () => {
  let processor: AdBulkUploadProcessor;
  let metaAdsService: {
    uploadAdImage: ReturnType<typeof vi.fn>;
    uploadAdVideo: ReturnType<typeof vi.fn>;
    createAd: ReturnType<typeof vi.fn>;
  };
  let bulkUploadJobsService: {
    updateStatus: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    incrementProgress: ReturnType<typeof vi.fn>;
    addError: ReturnType<typeof vi.fn>;
  };
  let creativeMappingsService: {
    create: ReturnType<typeof vi.fn>;
  };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    metaAdsService = {
      createAd: vi.fn().mockResolvedValue('ad-id-1'),
      uploadAdImage: vi.fn().mockResolvedValue({ hash: 'img-hash-1' }),
      uploadAdVideo: vi.fn().mockResolvedValue({ videoId: 'vid-id-1' }),
    };

    bulkUploadJobsService = {
      addError: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue({ status: 'processing' }),
      incrementProgress: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    creativeMappingsService = {
      create: vi.fn().mockResolvedValue(undefined),
    };

    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdBulkUploadProcessor,
        { provide: MetaAdsService, useValue: metaAdsService },
        { provide: AdBulkUploadJobsService, useValue: bulkUploadJobsService },
        {
          provide: AdCreativeMappingsService,
          useValue: creativeMappingsService,
        },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    processor = module.get(AdBulkUploadProcessor);
    vi.spyOn(
      processor as unknown as { delay: () => Promise<void> },
      'delay',
    ).mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('marks job as processing at the start', async () => {
      const data = makeJobData({ images: ['https://example.com/img.jpg'] });
      const job = makeJob(data);

      await processor.process(job);

      expect(bulkUploadJobsService.updateStatus).toHaveBeenCalledWith(
        'job-abc',
        'processing',
      );
    });

    it('uploads images and creates an ad for each permutation', async () => {
      const data = makeJobData({
        bodyCopies: ['Act now'],
        headlines: ['Best Deal'],
        images: ['https://example.com/img.jpg'],
      });
      const job = makeJob(data);

      await processor.process(job);

      expect(metaAdsService.uploadAdImage).toHaveBeenCalledWith(
        'access-token',
        'act_123',
        'https://example.com/img.jpg',
      );
      expect(metaAdsService.createAd).toHaveBeenCalledTimes(1);
      expect(metaAdsService.createAd).toHaveBeenCalledWith(
        'access-token',
        'act_123',
        expect.objectContaining({
          adSetId: 'adset-1',
          creative: expect.objectContaining({
            body: 'Act now',
            imageHash: 'img-hash-1',
            title: 'Best Deal',
          }),
        }),
      );
    });

    it('uploads videos and creates video ads', async () => {
      const data = makeJobData({
        bodyCopies: ['Click here'],
        headlines: ['Watch This'],
        videos: ['https://example.com/video.mp4'],
      });
      const job = makeJob(data);

      await processor.process(job);

      expect(metaAdsService.uploadAdVideo).toHaveBeenCalledWith(
        'access-token',
        'act_123',
        'https://example.com/video.mp4',
      );
      expect(metaAdsService.createAd).toHaveBeenCalledWith(
        'access-token',
        'act_123',
        expect.objectContaining({
          creative: expect.objectContaining({
            videoId: 'vid-id-1',
          }),
        }),
      );
    });

    it('creates a creative mapping after each successful ad creation', async () => {
      const data = makeJobData({
        bodyCopies: ['Body'],
        brandId: 'brand-1',
        headlines: ['Headline'],
        images: ['https://example.com/img.jpg'],
      });
      const job = makeJob(data);

      await processor.process(job);

      expect(creativeMappingsService.create).toHaveBeenCalledTimes(1);
      expect(creativeMappingsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: 'brand-1',
          externalAdId: 'ad-id-1',
          organization: 'org-xyz',
          platform: 'meta',
          status: 'draft',
        }),
      );
    });

    it('marks job as completed when all permutations succeed', async () => {
      const data = makeJobData({
        bodyCopies: ['B1'],
        headlines: ['H1'],
        images: ['https://example.com/img.jpg'],
      });
      const job = makeJob(data);

      await processor.process(job);

      expect(bulkUploadJobsService.updateStatus).toHaveBeenLastCalledWith(
        'job-abc',
        'completed',
      );
    });

    it('marks job as partial when some permutations fail', async () => {
      metaAdsService.createAd
        .mockResolvedValueOnce('ad-id-1')
        .mockRejectedValueOnce(new Error('Ad creation failed'));

      const data = makeJobData({
        bodyCopies: ['B1'],
        headlines: ['H1'],
        images: ['https://img1.com/a.jpg', 'https://img2.com/b.jpg'],
      });
      // Two images → two permutations
      metaAdsService.uploadAdImage
        .mockResolvedValueOnce({ hash: 'hash-1' })
        .mockResolvedValueOnce({ hash: 'hash-2' });
      const job = makeJob(data);

      await processor.process(job);

      expect(bulkUploadJobsService.updateStatus).toHaveBeenLastCalledWith(
        'job-abc',
        'partial',
      );
    });

    it('marks job as failed when all permutations fail', async () => {
      metaAdsService.createAd.mockRejectedValue(new Error('Always fails'));

      const data = makeJobData({
        bodyCopies: ['B1'],
        headlines: ['H1'],
        images: ['https://example.com/img.jpg'],
      });
      const job = makeJob(data);

      await processor.process(job);

      expect(bulkUploadJobsService.updateStatus).toHaveBeenLastCalledWith(
        'job-abc',
        'failed',
      );
    });

    it('records errors for failed permutations', async () => {
      metaAdsService.createAd.mockRejectedValue(new Error('Meta rate limited'));

      const data = makeJobData({
        bodyCopies: ['B1'],
        headlines: ['H1'],
        images: ['https://example.com/img.jpg'],
      });
      const job = makeJob(data);

      await processor.process(job);

      expect(bulkUploadJobsService.addError).toHaveBeenCalledWith(
        'job-abc',
        expect.objectContaining({
          message: 'Meta rate limited',
          permutationIndex: 0,
        }),
      );
    });

    it('stops processing when the job is cancelled mid-run', async () => {
      bulkUploadJobsService.findById.mockResolvedValueOnce({
        status: 'cancelled',
      });

      const data = makeJobData({
        bodyCopies: ['B1'],
        headlines: ['H1'],
        images: ['https://img1.com/a.jpg', 'https://img2.com/b.jpg'],
      });
      metaAdsService.uploadAdImage
        .mockResolvedValueOnce({ hash: 'hash-1' })
        .mockResolvedValueOnce({ hash: 'hash-2' });

      const job = makeJob(data);

      await processor.process(job);

      // Should have checked cancellation status before first permutation and stopped
      expect(metaAdsService.createAd).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('cancelled'),
      );
    });

    it('throws and marks job as failed when image upload fails', async () => {
      metaAdsService.uploadAdImage.mockRejectedValue(
        new Error('Upload failed'),
      );

      const data = makeJobData({
        bodyCopies: ['B1'],
        headlines: ['H1'],
        images: ['https://example.com/img.jpg'],
      });
      const job = makeJob(data);

      await expect(processor.process(job)).rejects.toThrow('Upload failed');

      expect(bulkUploadJobsService.updateStatus).toHaveBeenLastCalledWith(
        'job-abc',
        'failed',
      );
    });

    it('generates correct permutation count for multiple headlines and body copies', async () => {
      const data = makeJobData({
        bodyCopies: ['B1', 'B2'],
        headlines: ['H1', 'H2'],
        images: ['https://example.com/img.jpg'],
      });
      const job = makeJob(data);

      await processor.process(job);

      // 2 headlines × 2 bodies × 1 image = 4 permutations
      expect(metaAdsService.createAd).toHaveBeenCalledTimes(4);
    });

    it('updates job progress after each permutation', async () => {
      const data = makeJobData({
        bodyCopies: ['B1'],
        headlines: ['H1'],
        images: ['https://example.com/img.jpg'],
      });
      const job = makeJob(data);

      await processor.process(job);

      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });
  });
});
