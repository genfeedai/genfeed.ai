import { CredentialPlatform } from '@genfeedai/enums';
import type { ServerAnalyticsCollectionState } from '@genfeedai/interfaces';
import type { YouTubeAnalyticsJobData } from '@genfeedai/queue-contracts';
import type {
  ServerLogger,
  ServerPostAnalytics,
  ServerYouTubeAnalytics,
} from '@server/server.dependencies';
import type { AnalyticsQueueJob } from '../analytics-job.types';
import { AnalyticsYouTubeJobService } from './analytics-youtube-job.service';

function createHarness(analyticsMap = new Map<string, unknown>()) {
  const analyticsCollectionState = {
    markFailed: vi.fn().mockResolvedValue(undefined),
    markFailedBatch: vi.fn().mockResolvedValue(undefined),
    markFailedTargets: vi.fn().mockResolvedValue(undefined),
    markReady: vi.fn().mockResolvedValue(undefined),
    markReadyBatch: vi.fn().mockResolvedValue(undefined),
  } satisfies ServerAnalyticsCollectionState;
  const postAnalytics = {
    processYouTubeAnalytics: vi.fn().mockResolvedValue(undefined),
  } as unknown as ServerPostAnalytics;
  const youtube = {
    getMediaAnalyticsBatch: vi.fn().mockResolvedValue(analyticsMap),
  } satisfies ServerYouTubeAnalytics;
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;

  const service = new AnalyticsYouTubeJobService(
    youtube,
    postAnalytics,
    analyticsCollectionState,
    logger,
  );

  return { analyticsCollectionState, logger, postAnalytics, service, youtube };
}

function createJob(
  posts: YouTubeAnalyticsJobData['posts'] = [
    {
      brandId: 'brand-1',
      externalId: 'video-1',
      id: 'target-1',
      organizationId: 'org-1',
    },
    {
      brandId: 'brand-1',
      externalId: 'video-2',
      id: 'target-2',
      organizationId: 'org-1',
    },
  ],
): AnalyticsQueueJob<YouTubeAnalyticsJobData> {
  return {
    data: {
      attemptKey: 'attempt-1',
      brandId: 'brand-1',
      organizationId: 'org-1',
      posts,
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AnalyticsYouTubeJobService', () => {
  it('marks every post ready when analytics land for all of them', async () => {
    const { analyticsCollectionState, postAnalytics, service, youtube } =
      createHarness(
        new Map<string, unknown>([
          ['video-1', { views: 10 }],
          ['video-2', { views: 20 }],
        ]),
      );
    const job = createJob();

    await service.process(job);

    expect(youtube.getMediaAnalyticsBatch).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      ['video-1', 'video-2'],
    );
    expect(postAnalytics.processYouTubeAnalytics).toHaveBeenCalledTimes(2);
    expect(analyticsCollectionState.markReadyBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        attemptKey: 'attempt-1',
        id: 'target-1',
        platform: CredentialPlatform.YOUTUBE,
      }),
      expect.objectContaining({ id: 'target-2' }),
    ]);
    expect(analyticsCollectionState.markFailedBatch).not.toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });

  it('returns early without touching collection state for an empty batch', async () => {
    const { analyticsCollectionState, logger, service, youtube } =
      createHarness();
    const job = createJob([]);

    await service.process(job);

    expect(youtube.getMediaAnalyticsBatch).not.toHaveBeenCalled();
    expect(analyticsCollectionState.markReadyBatch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'No posts provided for YouTube analytics batch',
    );
  });

  it('delays posts whose analytics have not appeared yet', async () => {
    const { analyticsCollectionState, service } = createHarness(
      new Map<string, unknown>([['video-1', { views: 10 }]]),
    );

    await service.process(createJob());

    expect(analyticsCollectionState.markReadyBatch).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'target-1' }),
    ]);
    expect(analyticsCollectionState.markFailedBatch).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'target-2' })],
      expect.objectContaining({ isRetryable: true }),
    );
  });

  it('isolates a per-post persistence failure from its already-written peers', async () => {
    const { analyticsCollectionState, postAnalytics, service } = createHarness(
      new Map<string, unknown>([
        ['video-1', { views: 10 }],
        ['video-2', { views: 20 }],
      ]),
    );
    vi.mocked(postAnalytics.processYouTubeAnalytics)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('write failed'));

    await service.process(createJob());

    expect(analyticsCollectionState.markReadyBatch).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'target-1' }),
    ]);
    expect(analyticsCollectionState.markFailedBatch).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'target-2' })],
      expect.objectContaining({ isRetryable: expect.any(Boolean) }),
    );
  });

  it('marks only unsettled posts failed when the batch fetch throws', async () => {
    const { analyticsCollectionState, logger, service, youtube } =
      createHarness();
    const fetchError = new Error('YouTube API down');
    vi.mocked(youtube.getMediaAnalyticsBatch).mockRejectedValue(fetchError);

    await expect(service.process(createJob())).rejects.toThrowError(fetchError);

    expect(analyticsCollectionState.markFailedBatch).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: 'target-1' }),
        expect.objectContaining({ id: 'target-2' }),
      ],
      expect.objectContaining({ isRetryable: expect.any(Boolean) }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process YouTube analytics batch'),
      fetchError,
    );
  });

  it('does not re-mark posts that already settled before the batch failed', async () => {
    const { analyticsCollectionState, service } = createHarness(
      new Map<string, unknown>([
        ['video-1', { views: 10 }],
        ['video-2', { views: 20 }],
      ]),
    );
    const stateError = new Error('state store unavailable');
    vi.mocked(analyticsCollectionState.markReadyBatch).mockRejectedValue(
      stateError,
    );

    await expect(service.process(createJob())).rejects.toThrowError(stateError);

    expect(analyticsCollectionState.markFailedBatch).not.toHaveBeenCalled();
  });
});
