import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

const TWITTER = 'TWITTER' as never;

function createHarness(post: unknown) {
  const upsert = vi.fn().mockResolvedValue({ id: 'analytics_1' });
  const findFirst = vi.fn().mockResolvedValue(null);
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const service = new PostAnalyticsService(
    {
      postAnalytics: { findFirst, upsert },
    } as unknown as PrismaService,
    logger,
    {
      findOne: vi.fn().mockResolvedValue(post),
    } as unknown as PostsService,
  );

  return { findFirst, logger, service, upsert };
}

const metrics = {
  totalComments: 3,
  totalLikes: 20,
  totalShares: 1,
  totalViews: 100,
};

describe('PostAnalyticsService.updateTodayAnalytics', () => {
  it('writes scalar foreign keys when the post carries populated relations', async () => {
    // Populated Prisma relations retain their canonical scalar foreign keys.
    const { service, upsert } = createHarness({
      brand: { id: 'brand_1', label: 'Acme' },
      brandId: 'brand_1',
      id: 'post_1',
      organization: { id: 'org_1' },
      organizationId: 'org_1',
      user: { id: 'user_1' },
      userId: 'user_1',
    } as unknown as PostDocument);

    await service.updateTodayAnalytics('post_1', TWITTER, metrics);

    const create = upsert.mock.calls[0][0].create;

    expect(create).toMatchObject({
      brandId: 'brand_1',
      organizationId: 'org_1',
      postId: 'post_1',
      userId: 'user_1',
    });

    for (const key of ['brandId', 'organizationId', 'userId'] as const) {
      expect(create[key]).not.toBe('undefined');
      expect(create[key]).not.toBe('[object Object]');
    }
  });

  it('prefers the scalar foreign key over the legacy alias', async () => {
    const { service, upsert } = createHarness({
      brand: 'stale_brand',
      brandId: 'brand_1',
      id: 'post_1',
      organization: 'stale_org',
      organizationId: 'org_1',
      user: 'stale_user',
      userId: 'user_1',
    } as unknown as PostDocument);

    await service.updateTodayAnalytics('post_1', TWITTER, metrics);

    expect(upsert.mock.calls[0][0].create).toMatchObject({
      brandId: 'brand_1',
      organizationId: 'org_1',
      userId: 'user_1',
    });
  });

  it('skips the upsert when an owner id cannot be resolved', async () => {
    const { logger, service, upsert } = createHarness({
      brandId: 'brand_1',
      id: 'post_1',
      organizationId: 'org_1',
    } as unknown as PostDocument);

    const result = await service.updateTodayAnalytics('post_1', TWITTER, {
      totalComments: 0,
      totalLikes: 0,
      totalViews: 0,
    });

    expect(result).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('PostAnalyticsService.trackPostAnalytics', () => {
  it('returns early instead of throwing when the credential is missing', async () => {
    const { logger, service, upsert } = createHarness(null);

    await service.trackPostAnalytics(
      {
        brandId: 'brand_1',
        externalId: 'ext_1',
        id: 'post_1',
        organizationId: 'org_1',
        userId: 'user_1',
      } as unknown as PostDocument,
      undefined,
      'test',
    );

    expect(upsert).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Missing credential'),
    );
  });
});

describe('PostAnalyticsService provider metric mapping', () => {
  it('converts YouTube total watch minutes while preserving average seconds', async () => {
    const { service } = createHarness(null);
    const update = vi
      .spyOn(service, 'updateTodayAnalytics')
      .mockResolvedValue(null);

    await service.processYouTubeAnalytics('post_1', {
      averageViewDuration: 12,
      comments: 3,
      estimatedMinutesWatched: 2.5,
      impressions: 80,
      likes: 20,
      views: 100,
    });

    expect(update).toHaveBeenCalledWith(
      'post_1',
      'YOUTUBE',
      expect.objectContaining({
        averageWatchTimeSeconds: 12,
        impressions: 80,
        metricAvailability: expect.objectContaining({
          averageWatchTimeSeconds: 'observed',
          watchTimeSeconds: 'observed',
        }),
        videoViews: 100,
        watchTimeSeconds: 150,
      }),
    );
  });

  it('preserves TikTok watch seconds and availability independently', async () => {
    const { service } = createHarness(null);
    const update = vi
      .spyOn(service, 'updateTodayAnalytics')
      .mockResolvedValue(null);

    await service.processTikTokAnalytics('post_1', {
      comments: 3,
      likes: 20,
      reach: 75,
      shares: 4,
      totalPlayTime: 240,
      views: 100,
    });

    expect(update).toHaveBeenCalledWith(
      'post_1',
      'TIKTOK',
      expect.objectContaining({
        averageWatchTimeSeconds: null,
        reach: 75,
        watchTimeSeconds: 240,
        metricAvailability: expect.objectContaining({
          averageWatchTimeSeconds: 'unavailable',
          watchTimeSeconds: 'observed',
        }),
      }),
    );
  });
});
