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

const PRIVATE_FIELDS = 'public_metrics,non_public_metrics,organic_metrics';

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
    mockUserGet.mockResolvedValue({
      data: [
        tweet('t1', {
          non_public_metrics: { impression_count: 1200 },
          organic_metrics: { impression_count: 1000 },
        }),
      ],
    });

    const result = await service.getMediaAnalyticsBatch(['t1'], 'oauth2-token');

    expect(TwitterApi).toHaveBeenCalledWith('oauth2-token');
    expect(resolveDefaultClient).not.toHaveBeenCalled();
    expect(bearerGet).not.toHaveBeenCalled();
    expect(mockUserGet).toHaveBeenCalledOnce();
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
    mockUserGet
      .mockResolvedValueOnce({
        data: [tweet('recent', { organic_metrics: { impression_count: 900 } })],
        errors: [{ resource_id: 'old', title: 'Field Authorization Error' }],
      })
      .mockResolvedValueOnce({ data: [tweet('old')] });

    const result = await service.getMediaAnalyticsBatch(
      ['recent', 'old'],
      'oauth2-token',
    );

    expect(mockUserGet).toHaveBeenCalledTimes(2);
    expect(mockUserGet).toHaveBeenLastCalledWith('tweets', {
      expansions: 'attachments.media_keys',
      ids: 'old',
      'media.fields': 'public_metrics,type',
      'tweet.fields': 'public_metrics,attachments',
    });
    expect(result.get('recent')?.impressions).toBe(900);
    expect(result.get('old')?.impressions).toBe(300);
  });
});
