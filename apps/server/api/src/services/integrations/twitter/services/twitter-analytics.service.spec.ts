import type { LoggerService } from '@libs/logger/logger.service';
import { TwitterApi } from 'twitter-api-v2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterAnalyticsService } from './twitter-analytics.service';
import { TwitterResponseMapper } from './twitter-response.mapper';

const { mockUserGet } = vi.hoisted(() => ({ mockUserGet: vi.fn() }));

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn(function TwitterApiMock() {
    return { v2: { get: mockUserGet } };
  }),
}));

const PRIVATE_FIELDS =
  'public_metrics,non_public_metrics,organic_metrics,promoted_metrics';

/** Serves `users/me` from `pinned` and queues the `tweets` responses in order. */
function mockUserClient(
  tweetResponses: unknown[],
  pinned: unknown = { data: { id: 'me' } },
) {
  const queue = [...tweetResponses];
  mockUserGet.mockImplementation(async (path: string) => {
    if (path === 'users/me') {
      if (pinned instanceof Error) throw pinned;
      return pinned;
    }
    return queue.length > 1 ? queue.shift() : queue[0];
  });
}

const tweetsCalls = () =>
  mockUserGet.mock.calls.filter(([path]) => path === 'tweets');

function tweet(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    public_metrics: {
      bookmark_count: 1,
      impression_count: 300,
      like_count: 10,
      quote_count: 0,
      reply_count: 2,
      retweet_count: 3,
    },
    ...extra,
  };
}

describe('TwitterAnalyticsService', () => {
  const bearerGet = vi.fn();
  const resolveDefaultClient = vi.fn(
    () => ({ v2: { get: bearerGet } }) as unknown as TwitterApi,
  );
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  let service: TwitterAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TwitterAnalyticsService(
      logger,
      new TwitterResponseMapper(),
      resolveDefaultClient,
    );
  });

  it('uses an OAuth2 user client and requests the private metrics', async () => {
    mockUserClient([
      {
        data: [
          tweet('t1', {
            non_public_metrics: { impression_count: 1200 },
            organic_metrics: { impression_count: 1000 },
          }),
        ],
      },
    ]);

    const result = await service.getMediaAnalyticsBatch(['t1'], 'oauth2-token');

    expect(TwitterApi).toHaveBeenCalledWith('oauth2-token');
    expect(resolveDefaultClient).not.toHaveBeenCalled();
    expect(bearerGet).not.toHaveBeenCalled();
    expect(tweetsCalls()).toHaveLength(1);
    expect(mockUserGet).toHaveBeenCalledWith('tweets', {
      expansions: 'attachments.media_keys',
      ids: 't1',
      'media.fields': `${PRIVATE_FIELDS},type`,
      'tweet.fields': `${PRIVATE_FIELDS},attachments`,
    });
    expect(result.get('t1')).toEqual(
      expect.objectContaining({ impressions: 1000, likes: 10 }),
    );
    expect(result.get('t1')?.breakoutExposures?.impressions).toEqual(
      expect.objectContaining({
        scope: 'organic',
        source: 'twitter:post:organic_metrics.impression_count',
        value: 1000,
      }),
    );
  });

  it('falls back to the app bearer with public metrics only when no token is given', async () => {
    bearerGet.mockResolvedValue({ data: [tweet('t1')] });

    const result = await service.getMediaAnalyticsBatch(['t1']);

    expect(TwitterApi).not.toHaveBeenCalled();
    expect(resolveDefaultClient).toHaveBeenCalledOnce();
    expect(bearerGet).toHaveBeenCalledWith('tweets', {
      expansions: 'attachments.media_keys',
      ids: 't1',
      'media.fields': 'public_metrics,type',
      'tweet.fields': 'public_metrics,attachments',
    });
    expect(result.get('t1')).toEqual(
      expect.objectContaining({ comments: 2, impressions: 300, likes: 10 }),
    );
  });

  it('uses public metrics for the single-post bearer read', async () => {
    bearerGet.mockResolvedValue({ data: [tweet('t1')] });

    const result = await service.getMediaAnalytics('t1');

    expect(bearerGet).toHaveBeenCalledWith(
      'tweets',
      expect.objectContaining({ 'tweet.fields': 'public_metrics,attachments' }),
    );
    expect(result.impressions).toBe(300);
  });

  it('re-reads posts X withheld private metrics for with public metrics', async () => {
    mockUserClient([
      {
        data: [tweet('recent', { organic_metrics: { impression_count: 900 } })],
        errors: [{ resource_id: 'old', title: 'Field Authorization Error' }],
      },
      { data: [tweet('old')] },
    ]);

    const result = await service.getMediaAnalyticsBatch(
      ['recent', 'old'],
      'oauth2-token',
    );

    expect(tweetsCalls()).toHaveLength(2);
    expect(mockUserGet).toHaveBeenLastCalledWith('tweets', {
      expansions: 'attachments.media_keys',
      ids: 'old',
      'media.fields': 'public_metrics,type',
      'tweet.fields': 'public_metrics,attachments',
    });
    expect(result.get('recent')?.impressions).toBe(900);
    expect(result.get('old')?.impressions).toBe(300);
  });

  describe('learning provenance', () => {
    const ownerMetrics = { organic_metrics: { impression_count: 900 } };

    it('marks owner-served, unpromoted, unpinned posts organic', async () => {
      mockUserClient([{ data: [tweet('t1', ownerMetrics)] }], {
        data: { id: 'me', pinned_tweet_id: 'other' },
      });

      const result = await service.getMediaAnalyticsBatch(['t1'], 'token');

      expect(mockUserGet).toHaveBeenCalledWith('users/me', {
        'user.fields': 'pinned_tweet_id',
      });
      const learning = result.get('t1')?.learningMetrics;
      expect(learning?.isPaid).toBe(false);
      expect(learning?.isPinned).toBe(false);
    });

    it('flags promoted posts as paid', async () => {
      mockUserClient([
        {
          data: [
            tweet('t1', {
              ...ownerMetrics,
              promoted_metrics: { impression_count: 50 },
            }),
          ],
        },
      ]);

      const result = await service.getMediaAnalyticsBatch(['t1'], 'token');

      expect(result.get('t1')?.learningMetrics?.isPaid).toBe(true);
    });

    it('flags the pinned post as pinned', async () => {
      mockUserClient([{ data: [tweet('t1', ownerMetrics)] }], {
        data: { id: 'me', pinned_tweet_id: 't1' },
      });

      const result = await service.getMediaAnalyticsBatch(['t1'], 'token');

      expect(result.get('t1')?.learningMetrics?.isPinned).toBe(true);
    });

    it('treats an account without a pinned post as unpinned', async () => {
      mockUserClient([{ data: [tweet('t1', ownerMetrics)] }]);

      const result = await service.getMediaAnalyticsBatch(['t1'], 'token');

      expect(result.get('t1')?.learningMetrics?.isPinned).toBe(false);
    });

    it('leaves pinned status unknown when the lookup fails', async () => {
      mockUserClient(
        [{ data: [tweet('t1', ownerMetrics)] }],
        new Error('rate limited'),
      );

      const result = await service.getMediaAnalyticsBatch(['t1'], 'token');

      const learning = result.get('t1')?.learningMetrics;
      expect(learning?.isPinned).toBeUndefined();
      expect(learning?.isPaid).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('leaves paid status unknown for posts served without private metrics', async () => {
      mockUserClient([
        {
          data: [tweet('recent', ownerMetrics)],
          errors: [{ resource_id: 'old', title: 'Field Authorization Error' }],
        },
        { data: [tweet('old')] },
      ]);

      const result = await service.getMediaAnalyticsBatch(
        ['recent', 'old'],
        'token',
      );

      expect(result.get('recent')?.learningMetrics?.isPaid).toBe(false);
      expect(result.get('old')?.learningMetrics?.isPaid).toBeUndefined();
    });

    it('treats null metric groups as absent, never as evidence', async () => {
      mockUserClient([
        {
          data: [
            tweet('t1', {
              non_public_metrics: null,
              organic_metrics: null,
              promoted_metrics: null,
            }),
          ],
        },
      ]);

      const result = await service.getMediaAnalyticsBatch(['t1'], 'token');

      expect(result.get('t1')?.learningMetrics?.isPaid).toBeUndefined();
    });

    it('never claims organic from the app bearer', async () => {
      bearerGet.mockResolvedValue({ data: [tweet('t1')] });

      const result = await service.getMediaAnalyticsBatch(['t1']);

      const learning = result.get('t1')?.learningMetrics;
      expect(learning?.isPaid).toBeUndefined();
      expect(learning?.isPinned).toBeUndefined();
    });
  });
});
