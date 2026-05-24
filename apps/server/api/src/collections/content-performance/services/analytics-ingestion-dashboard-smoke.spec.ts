import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PostAnalytics } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';

type AnalyticsRow = Pick<
  PostAnalytics,
  | 'brandId'
  | 'date'
  | 'engagementRate'
  | 'id'
  | 'organizationId'
  | 'platform'
  | 'postId'
  | 'totalComments'
  | 'totalCommentsIncrement'
  | 'totalLikes'
  | 'totalLikesIncrement'
  | 'totalSaves'
  | 'totalSavesIncrement'
  | 'totalShares'
  | 'totalSharesIncrement'
  | 'totalViews'
  | 'totalViewsIncrement'
  | 'userId'
>;

type SmokePost = Pick<
  PostDocument,
  | '_id'
  | 'brand'
  | 'category'
  | 'description'
  | 'externalId'
  | 'id'
  | 'ingredients'
  | 'label'
  | 'organization'
  | 'publicationDate'
  | 'user'
>;

function dateMatches(
  rowDate: Date,
  filter?: { gte?: Date; lte?: Date } | Date,
): boolean {
  if (!filter) return true;
  if (filter instanceof Date) {
    return rowDate.getTime() === filter.getTime();
  }

  if (filter.gte && rowDate < filter.gte) return false;
  if (filter.lte && rowDate > filter.lte) return false;
  return true;
}

describe('analytics ingestion to dashboard smoke path', () => {
  const organizationId = '507f1f77bcf86cd799439012';
  const brandId = '507f1f77bcf86cd799439013';
  const userId = '507f1f77bcf86cd799439011';
  const postId = '507f1f77bcf86cd799439014';

  const post: SmokePost = {
    _id: postId,
    brand: brandId,
    category: 'video',
    description: 'Opening hook: show the before state first.',
    externalId: 'yt-video-123',
    id: postId,
    ingredients: ['ingredient-1'],
    label: 'Before/after launch clip',
    organization: organizationId,
    publicationDate: new Date('2026-04-15T10:00:00.000Z'),
    user: userId,
  };

  const rows: AnalyticsRow[] = [];

  const prisma = {
    post: {
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.includes(postId) ? [post] : []),
      ),
    },
    postAnalytics: {
      findFirst: vi.fn(
        ({
          where,
        }: {
          where: { date?: Date; platform?: string; postId?: string };
        }) =>
          Promise.resolve(
            rows.find(
              (row) =>
                (!where.postId || row.postId === where.postId) &&
                (!where.platform || row.platform === where.platform) &&
                (!where.date || row.date.getTime() === where.date.getTime()),
            ) ?? null,
          ),
      ),
      findMany: vi.fn(
        ({
          orderBy,
          take,
          where,
        }: {
          orderBy?: { engagementRate?: 'asc' | 'desc' };
          take?: number;
          where?: {
            brandId?: string;
            date?: { gte?: Date; lte?: Date };
            organizationId?: string;
            postId?: string;
          };
        } = {}) => {
          let result = rows.filter(
            (row) =>
              (!where?.postId || row.postId === where.postId) &&
              (!where?.organizationId ||
                row.organizationId === where.organizationId) &&
              (!where?.brandId || row.brandId === where.brandId) &&
              dateMatches(row.date, where?.date),
          );

          if (orderBy?.engagementRate) {
            result = [...result].sort((a, b) =>
              orderBy.engagementRate === 'desc'
                ? b.engagementRate - a.engagementRate
                : a.engagementRate - b.engagementRate,
            );
          }

          return Promise.resolve(
            typeof take === 'number' ? result.slice(0, take) : result,
          );
        },
      ),
      upsert: vi.fn(
        ({
          create,
          update,
          where,
        }: {
          create: AnalyticsRow;
          update: Partial<AnalyticsRow>;
          where: {
            postId_platform_date: {
              date: Date;
              platform: string;
              postId: string;
            };
          };
        }) => {
          const key = where.postId_platform_date;
          const existing = rows.find(
            (row) =>
              row.postId === key.postId &&
              row.platform === key.platform &&
              row.date.getTime() === key.date.getTime(),
          );

          if (existing) {
            Object.assign(existing, update);
            return Promise.resolve(existing);
          }

          const next = {
            ...create,
            id: create.id ?? 'analytics-row-1',
          } as AnalyticsRow;
          rows.push(next);
          return Promise.resolve(next);
        },
      ),
    },
  };

  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const postsService = {
    findOne: vi.fn().mockResolvedValue(post),
  };

  const youtubeService = {
    getMediaAnalytics: vi.fn().mockResolvedValue({
      comments: 30,
      likes: 300,
      views: 3000,
    }),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));
    rows.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores provider analytics and exposes the same post in dashboard summaries', async () => {
    const postAnalyticsService = new PostAnalyticsService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
      postsService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      youtubeService as never,
    );
    const performanceSummaryService = new PerformanceSummaryService(
      prisma as unknown as PrismaService,
    );

    await postAnalyticsService.trackPostAnalytics(
      post as never,
      { platform: 'YOUTUBE' } as never,
      'analytics-ingestion-dashboard-smoke',
    );

    const postSummary =
      await postAnalyticsService.getPostAnalyticsSummary(postId);
    vi.setSystemTime(new Date('2026-04-17T12:00:00.000Z'));
    const dashboardSummary = await performanceSummaryService.getWeeklySummary(
      organizationId,
      brandId,
      {
        endDate: '2026-04-16T23:59:59.999Z',
        startDate: '2026-04-14T00:00:00.000Z',
        topN: 1,
        worstN: 1,
      },
    );

    expect(youtubeService.getMediaAnalytics).toHaveBeenCalledWith(
      organizationId,
      brandId,
      'yt-video-123',
    );
    expect(postSummary).toMatchObject({
      platforms: {
        YOUTUBE: {
          engagementRate: 11,
          totalComments: 30,
          totalLikes: 300,
          totalViews: 3000,
        },
      },
      totalComments: 30,
      totalLikes: 300,
      totalViews: 3000,
    });
    expect(dashboardSummary.topPerformers[0]).toMatchObject({
      comments: 30,
      description: post.description,
      engagementRate: 11,
      likes: 300,
      platform: 'YOUTUBE',
      postId,
      title: post.label,
      views: 3000,
    });
    expect(dashboardSummary.avgEngagementByPlatform).toEqual([
      {
        avgEngagementRate: 11,
        platform: 'YOUTUBE',
        totalPosts: 1,
      },
    ]);
    expect(dashboardSummary.topHooks).toEqual([
      'Opening hook: show the before state first',
    ]);
  });
});
