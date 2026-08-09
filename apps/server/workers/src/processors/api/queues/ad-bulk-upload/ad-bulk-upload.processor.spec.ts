import type { AdBulkUploadJobData } from '@genfeedai/queue-contracts';
import { AdBulkUploadProcessor } from '@workers/processors/api/queues/ad-bulk-upload/ad-bulk-upload.processor';
import type { Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(
  data: Partial<AdBulkUploadJobData>,
): Job<AdBulkUploadJobData> {
  return {
    data: {
      accessToken: 'access-token',
      adAccountId: 'act_1',
      adSetId: 'adset-1',
      bodyCopies: ['Body copy'],
      campaignId: 'campaign-1',
      credentialId: 'cred-1',
      headlines: ['Great headline'],
      images: [],
      jobId: 'job-1',
      linkUrl: 'https://example.com',
      organizationId: 'org-1',
      videos: [],
      ...data,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<AdBulkUploadJobData>;
}

describe('AdBulkUploadProcessor', () => {
  let processor: AdBulkUploadProcessor;
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let metaAdsService: {
    createAd: ReturnType<typeof vi.fn>;
    uploadAdImage: ReturnType<typeof vi.fn>;
    uploadAdVideo: ReturnType<typeof vi.fn>;
  };
  let bulkUploadJobsService: {
    addError: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    incrementProgress: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
  };
  let creativeMappingsService: { create: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    logger = { error: vi.fn(), log: vi.fn() };
    metaAdsService = {
      createAd: vi.fn().mockResolvedValue('ad-1'),
      uploadAdImage: vi.fn().mockResolvedValue({ hash: 'image-hash-1' }),
      uploadAdVideo: vi.fn().mockResolvedValue({ videoId: 'video-1' }),
    };
    bulkUploadJobsService = {
      addError: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue({ status: 'processing' }),
      incrementProgress: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };
    creativeMappingsService = { create: vi.fn().mockResolvedValue(undefined) };

    processor = new AdBulkUploadProcessor(
      logger as never,
      metaAdsService as never,
      bulkUploadJobsService as never,
      creativeMappingsService as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function run(job: Job<AdBulkUploadJobData>): Promise<void> {
    const processPromise = processor.process(job);
    await vi.runAllTimersAsync();
    await processPromise;
  }

  it('uploads media, creates every permutation, and completes the job', async () => {
    const job = buildJob({
      bodyCopies: ['Body A'],
      brandId: 'brand-1',
      headlines: ['Headline A'],
      images: ['https://img/one.png'],
      videos: ['https://vid/one.mp4'],
    });

    await run(job);

    expect(metaAdsService.uploadAdImage).toHaveBeenCalledWith(
      'access-token',
      'act_1',
      'https://img/one.png',
    );
    expect(metaAdsService.uploadAdVideo).toHaveBeenCalledWith(
      'access-token',
      'act_1',
      'https://vid/one.mp4',
    );
    expect(metaAdsService.createAd).toHaveBeenCalledTimes(2);
    const [, , imageAd] = metaAdsService.createAd.mock.calls[0] as [
      string,
      string,
      { creative: { imageHash?: string; videoId?: string } },
    ];
    expect(imageAd.creative.imageHash).toBe('image-hash-1');
    expect(imageAd.creative.videoId).toBeUndefined();
    const [, , videoAd] = metaAdsService.createAd.mock.calls[1] as [
      string,
      string,
      { creative: { imageHash?: string; videoId?: string } },
    ];
    expect(videoAd.creative.videoId).toBe('video-1');

    expect(creativeMappingsService.create).toHaveBeenCalledTimes(2);
    expect(creativeMappingsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'meta',
        status: 'draft',
      }),
    );
    expect(bulkUploadJobsService.updateStatus).toHaveBeenCalledWith(
      'job-1',
      'processing',
    );
    expect(bulkUploadJobsService.updateStatus).toHaveBeenLastCalledWith(
      'job-1',
      'completed',
    );
    expect(job.updateProgress).toHaveBeenLastCalledWith(100);
  });

  it('stops immediately when the job has been cancelled', async () => {
    bulkUploadJobsService.findById.mockResolvedValue({ status: 'cancelled' });
    const job = buildJob({ images: ['https://img/one.png'] });

    await run(job);

    expect(metaAdsService.createAd).not.toHaveBeenCalled();
    expect(bulkUploadJobsService.updateStatus).not.toHaveBeenCalledWith(
      'job-1',
      'completed',
    );
  });

  it('records per-permutation failures and finishes as partial', async () => {
    metaAdsService.createAd
      .mockRejectedValueOnce(new Error('creative rejected'))
      .mockResolvedValueOnce('ad-2');
    const job = buildJob({
      headlines: ['Headline A', 'Headline B'],
      images: ['https://img/one.png'],
    });

    await run(job);

    expect(bulkUploadJobsService.incrementProgress).toHaveBeenCalledWith(
      'job-1',
      'failedPermutations',
    );
    expect(bulkUploadJobsService.incrementProgress).toHaveBeenCalledWith(
      'job-1',
      'completedPermutations',
    );
    expect(bulkUploadJobsService.addError).toHaveBeenCalledWith('job-1', {
      message: 'creative rejected',
      permutationIndex: 0,
      timestamp: expect.any(Date),
    });
    expect(bulkUploadJobsService.updateStatus).toHaveBeenLastCalledWith(
      'job-1',
      'partial',
    );
  });

  it('marks the job failed when every permutation fails', async () => {
    metaAdsService.createAd.mockRejectedValue(new Error('creative rejected'));
    const job = buildJob({ images: ['https://img/one.png'] });

    await run(job);

    expect(bulkUploadJobsService.updateStatus).toHaveBeenLastCalledWith(
      'job-1',
      'failed',
    );
  });

  it('fails the whole job when a media upload fails', async () => {
    metaAdsService.uploadAdImage.mockRejectedValue(new Error('upload failed'));
    const job = buildJob({ images: ['https://img/one.png'] });

    const processPromise = processor.process(job);
    await expect(processPromise).rejects.toThrow('upload failed');
    expect(bulkUploadJobsService.updateStatus).toHaveBeenLastCalledWith(
      'job-1',
      'failed',
    );
  });

  it('fails the whole job when a video upload fails', async () => {
    metaAdsService.uploadAdVideo.mockRejectedValue(new Error('video too big'));
    const job = buildJob({ videos: ['https://vid/one.mp4'] });

    const processPromise = processor.process(job);
    await expect(processPromise).rejects.toThrow('video too big');
    expect(bulkUploadJobsService.updateStatus).toHaveBeenLastCalledWith(
      'job-1',
      'failed',
    );
  });
});
