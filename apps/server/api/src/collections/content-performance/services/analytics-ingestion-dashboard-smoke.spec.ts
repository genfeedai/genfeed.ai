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

  function filterAnalyticsRows(where?: {
    brandId?: string;
    date?: { gte?: Date; lte?: Date };
    organizationId?: string;
    postId?: string;
  }): AnalyticsRow[] {
    return rows.filter(
      (row) =>
        (!where?.postId || row.postId === where.postId) &&
        (!where?.organizationId ||
          row.organizationId === where.organizationId) &&
        (!where?.brandId || row.brandId === where.brandId) &&
        dateMatches(row.date, where?.date),
    );
  }

  function aggregateAnalyticsRows(where?: {
    brandId?: string;
    date?: { gte?: Date; lte?: Date };
    organizationId?: string;
    postId?: string;
  }) {
    const matchingRows = filterAnalyticsRows(where);
    const sum = (field: keyof AnalyticsRow) =>
      matchingRows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
    const avgEngagementRate =
      matchingRows.length > 0
        ? sum('engagementRate') / matchingRows.length
        : null;

    return {
      _avg: { engagementRate: avgEngagementRate },
      _count: { _all: matchingRows.length, postId: matchingRows.length },
      _sum: {
        totalComments: sum('totalComments'),
        totalLikes: sum('totalLikes'),
        totalSaves: sum('totalSaves'),
        totalShares: sum('totalShares'),
        totalViews: sum('totalViews'),
      },
    };
  }

  function getQueryText(query: unknown): string {
    if (typeof query === 'string') return query;
    if (typeof query !== 'object' || query === null) return '';
    if ('sql' in query) return String(query.sql);
    if ('text' in query) return String(query.text);
    return '';
  }

  const prisma = {
    $queryRaw: vi.fn((query: unknown) => {
      const matchingRows = filterAnalyticsRows({
        brandId,
        organizationId,
      });
      const totalEngagement = matchingRows.reduce(
        (total, row) => total + row.engagementRate,
        0,
      );
      const avgEngagementRate =
        matchingRows.length > 0 ? totalEngagement / matchingRows.length : 0;
      const queryText = getQueryText(query);

      if (queryText.includes('pa."platform"::text AS platform')) {
        return Promise.resolve(
          matchingRows.length > 0
            ? [
                {
                  avg_engagement_rate: avgEngagementRate,
                  platform: String(matchingRows[0]?.platform ?? 'unknown'),
                  total_posts: new Set(matchingRows.map((row) => row.postId))
                    .size,
                },
              ]
            : [],
        );
      }

      if (queryText.includes('COALESCE(p."category"')) {
        return Promise.resolve(
          matchingRows.length > 0
            ? [
                {
                  avg_engagement_rate: avgEngagementRate,
                  category: String(post.category),
                  total_posts: new Set(matchingRows.map((row) => row.postId))
                    .size,
                },
              ]
            : [],
        );
      }

      if (queryText.includes('EXTRACT(HOUR FROM p."publicationDate")')) {
        const hour = post.publicationDate?.getHours();
        return Promise.resolve(
          matchingRows.length > 0 && typeof hour === 'number'
            ? [
                {
                  avg_engagement_rate: avgEngagementRate,
                  hour,
                  post_count: new Set(matchingRows.map((row) => row.postId))
                    .size,
                },
              ]
            : [],
        );
      }

      return Promise.resolve([]);
    }),
    post: {
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.includes(postId) ? [post] : []),
      ),
    },
    postAnalytics: {
      aggregate: vi.fn(({ where }) =>
        Promise.resolve(aggregateAnalyticsRows(where)),
      ),
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
      groupBy: vi.fn(
        ({
          take,
          where,
        }: {
          take?: number;
          where?: {
            brandId?: string;
            date?: { gte?: Date; lte?: Date };
            organizationId?: string;
          };
        }) => {
          const grouped = new Map<string, AnalyticsRow[]>();
          for (const row of filterAnalyticsRows(where)) {
            const key = String(row.platform);
            grouped.set(key, [...(grouped.get(key) ?? []), row]);
          }

          const result = Array.from(grouped.entries())
            .map(([platform, platformRows]) => {
              const sum = (field: keyof AnalyticsRow) =>
                platformRows.reduce(
                  (total, row) => total + Number(row[field] ?? 0),
                  0,
                );
              return {
                _avg: {
                  engagementRate:
                    platformRows.length > 0
                      ? sum('engagementRate') / platformRows.length
                      : null,
                },
                _count: { postId: platformRows.length },
                platform,
              };
            })
            .sort(
              (left, right) =>
                Number(right._avg.engagementRate ?? 0) -
                Number(left._avg.engagementRate ?? 0),
            );

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
