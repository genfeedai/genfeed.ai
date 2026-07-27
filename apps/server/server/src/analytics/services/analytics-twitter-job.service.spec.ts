import { CredentialPlatform } from '@genfeedai/enums';
import type { ServerAnalyticsCollectionState } from '@genfeedai/interfaces';
import type { TwitterAnalyticsJobData } from '@genfeedai/queue-contracts';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import type {
  ServerCredentialStore,
  ServerLogger,
  ServerPostAnalytics,
  ServerTwitterAnalytics,
} from '@server/server.dependencies';
import type { AnalyticsQueueJob } from '../analytics-job.types';
import { AnalyticsTwitterJobService } from './analytics-twitter-job.service';

function createHarness(analyticsMap = new Map<string, unknown>()) {
  vi.spyOn(EncryptionUtil, 'decrypt').mockImplementation((value) => value);
  const analyticsCollectionState = {
    markFailed: vi.fn().mockResolvedValue(undefined),
    markReady: vi.fn().mockResolvedValue(undefined),
  } satisfies ServerAnalyticsCollectionState;
  const postAnalytics = {
    processTwitterAnalytics: vi.fn().mockResolvedValue(undefined),
  } as unknown as ServerPostAnalytics;
  const twitter = {
    getMediaAnalyticsBatch: vi.fn().mockResolvedValue(analyticsMap),
  } satisfies ServerTwitterAnalytics;
  const credentials = {
    findOne: vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      accessTokenSecret: 'access-secret',
    }),
  } satisfies ServerCredentialStore;
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } satisfies ServerLogger;

  const service = new AnalyticsTwitterJobService(
    twitter,
    postAnalytics,
    credentials,
    analyticsCollectionState,
    logger,
  );

  return { analyticsCollectionState, postAnalytics, service, twitter };
}

function createJob(): AnalyticsQueueJob<TwitterAnalyticsJobData> {
  return {
    data: {
      attemptKey: 'attempt-1',
      credentialId: 'credential-1',
      posts: [
        {
          brand: 'brand-1',
          externalId: 'tweet-1',
          id: 'target-1',
          organization: 'org-1',
        },
        {
          brand: 'brand-1',
          externalId: 'tweet-2',
          id: 'target-2',
          organization: 'org-1',
        },
      ],
    },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AnalyticsTwitterJobService collection state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records ready and delayed states independently for a partial batch', async () => {
    const { analyticsCollectionState, postAnalytics, service } = createHarness(
      new Map([['tweet-1', { views: 42 }]]),
    );

    await service.process(createJob());

    expect(postAnalytics.processTwitterAnalytics).toHaveBeenCalledWith(
      'target-1',
      { views: 42 },
    );
    expect(analyticsCollectionState.markReady).toHaveBeenCalledWith({
      attemptKey: 'attempt-1',
      brandId: 'brand-1',
      id: 'target-1',
      organizationId: 'org-1',
      platform: CredentialPlatform.TWITTER,
    });
    expect(analyticsCollectionState.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptKey: 'attempt-1',
        id: 'target-2',
      }),
      expect.objectContaining({
        code: 'analytics.metrics_delayed',
        isRetryable: true,
      }),
    );
  });

  it('marks every target retryable and rethrows when the provider fails', async () => {
    const { analyticsCollectionState, service, twitter } = createHarness();
    const providerError = { status: 429 };
    const job = createJob();
    vi.mocked(twitter.getMediaAnalyticsBatch).mockRejectedValue(providerError);

    await expect(service.process(job)).rejects.toBe(providerError);

    expect(analyticsCollectionState.markFailed).toHaveBeenCalledTimes(2);
    expect(analyticsCollectionState.markFailed).toHaveBeenCalledWith(
      expect.any(Object),
      {
        code: 'analytics.rate_limited',
        isRetryable: true,
        message: 'Twitter analytics is temporarily rate limited.',
      },
    );
  });
});
