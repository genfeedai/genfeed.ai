import type { OutliersService } from '@api/collections/outliers/services/outliers.service';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

const TWITTER = 'TWITTER' as never;

function createHarness(post: unknown) {
  const refresh = vi.fn().mockResolvedValue([]);
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
      credential: {
        findFirst: vi.fn().mockResolvedValue({ platform: 'TWITTER' }),
      },
    } as unknown as PrismaService,
    logger,
    {
      findOne: vi
        .fn()
        .mockResolvedValue(
          post && typeof post === 'object'
            ? { ...post, credentialId: 'credential_1' }
            : post,
        ),
    } as unknown as PostsService,
    {
      authorize: vi.fn().mockResolvedValue({}),
      refresh,
    } as unknown as OutliersService,
  );

  return { findFirst, logger, service, upsert, refresh };
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

    await service.updateTodayAnalytics('post_1', TWITTER, metrics, {
      organizationId: 'org_1',
      brandId: 'brand_1',
      credentialId: 'credential_1',
    });

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

    await service.updateTodayAnalytics('post_1', TWITTER, metrics, {
      organizationId: 'org_1',
      brandId: 'brand_1',
      credentialId: 'credential_1',
    });

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

    const result = await service.updateTodayAnalytics(
      'post_1',
      TWITTER,
      {
        totalComments: 0,
        totalLikes: 0,
        totalViews: 0,
      },
      {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      },
    );

    expect(result).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('PostAnalyticsService provider metric mapping', () => {
  it('converts YouTube total watch minutes while preserving average seconds', async () => {
    const { service } = createHarness(null);
    const update = vi
      .spyOn(service, 'updateTodayAnalytics')
      .mockResolvedValue(null);

    await service.processYouTubeAnalytics(
      'post_1',
      {
        averageViewDuration: 12,
        comments: 3,
        estimatedMinutesWatched: 2.5,
        impressions: 80,
        likes: 20,
        views: 100,
      },
      {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      },
    );

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
      {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      },
    );
  });

  it('preserves TikTok watch seconds and availability independently', async () => {
    const { service } = createHarness(null);
    const update = vi
      .spyOn(service, 'updateTodayAnalytics')
      .mockResolvedValue(null);

    await service.processTikTokAnalytics(
      'post_1',
      {
        comments: 3,
        likes: 20,
        reach: 75,
        shares: 4,
        totalPlayTime: 240,
        views: 100,
      },
      {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      },
    );

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
      {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      },
    );
  });
});

describe('analytics awaited outlier persistence', () => {
  it('propagates baseline failure after the analytics write', async () => {
    const h = createHarness({
      id: 'p',
      organizationId: 'org_1',
      brandId: 'brand_1',
      userId: 'u',
    });
    h.refresh.mockRejectedValueOnce(new Error('snapshot failed'));
    await expect(
      h.service.updateTodayAnalytics('p', TWITTER, metrics, {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      }),
    ).rejects.toThrow('snapshot failed');
    expect(h.upsert).toHaveBeenCalledOnce();
  });
  it('does not finish before refresh resolves', async () => {
    const h = createHarness({
      id: 'p',
      organizationId: 'org_1',
      brandId: 'brand_1',
      userId: 'u',
    });
    let release!: () => void;
    h.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let isFinished = false;
    const pending = h.service
      .updateTodayAnalytics('p', TWITTER, metrics, {
        organizationId: 'org_1',
        brandId: 'brand_1',
        credentialId: 'credential_1',
      })
      .then(() => {
        isFinished = true;
      });
    await vi.waitFor(() => expect(h.refresh).toHaveBeenCalledOnce());
    expect(isFinished).toBe(false);
    release();
    await pending;
    expect(isFinished).toBe(true);
  });
});

describe('active scoped daily analytics reads', () => {
  it('requires the caller organization for summaries and date ranges', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new PostAnalyticsService(
      { postAnalytics: { findMany } } as unknown as PrismaService,
      {} as LoggerService,
      {} as PostsService,
      {} as OutliersService,
    );
    await service.getPostAnalyticsSummary('post', 'org');
    expect(findMany).toHaveBeenLastCalledWith({
      where: { organizationId: 'org', isDeleted: false, postId: 'post' },
    });
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-31');
    await service.getAnalyticsByDateRange('post', start, end, 'org', 'TWITTER');
    expect(findMany).toHaveBeenLastCalledWith({
      orderBy: { date: 'asc' },
      where: {
        organizationId: 'org',
        isDeleted: false,
        postId: 'post',
        platform: 'TWITTER',
        date: { gte: start, lte: end },
      },
    });
    await expect(service.getPostAnalyticsSummary('post', '')).rejects.toThrow(
      'organizationId is required',
    );
  });
});
