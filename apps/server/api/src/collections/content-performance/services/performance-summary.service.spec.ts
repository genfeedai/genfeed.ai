import type { ServerPrisma } from '@api/server.dependencies';
import {
  DEFAULT_WORST_PERFORMER_MIN_VIEWS,
  PerformanceSummaryService,
} from './performance-summary.service';

function makeAnalytics(overrides: Record<string, unknown> = {}) {
  return {
    engagementRate: 5,
    platform: 'instagram',
    postId: 'post-1',
    totalComments: 5,
    totalLikes: 10,
    totalSaves: 2,
    totalShares: 3,
    totalViews: 1000,
    ...overrides,
  };
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    description: 'A great description. Second sentence.',
    id: 'post-1',
    label: 'A great title',
    publicationDate: new Date('2026-07-20T14:00:00.000Z'),
    ...overrides,
  };
}

describe('PerformanceSummaryService', () => {
  const analyticsFindMany = vi.fn();
  const analyticsAggregate = vi.fn();
  const postFindMany = vi.fn();
  const queryRaw = vi.fn();

  const prisma = {
    $queryRaw: queryRaw,
    post: { findMany: postFindMany },
    postAnalytics: {
      aggregate: analyticsAggregate,
      findMany: analyticsFindMany,
    },
  } as unknown as ServerPrisma;

  let service: PerformanceSummaryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PerformanceSummaryService(prisma);
    analyticsFindMany.mockResolvedValue([]);
    postFindMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
    analyticsAggregate.mockResolvedValue({ _sum: {} });
  });

  describe('getTopPerformers', () => {
    it('scopes the query to the organization, brand and date range', async () => {
      await service.getTopPerformers('org-1', 'brand-1', 10, {
        endDate: '2026-07-31',
        startDate: '2026-07-01',
      });

      const where = analyticsFindMany.mock.calls[0]?.[0]?.where;
      expect(where.organizationId).toBe('org-1');
      expect(where.brandId).toBe('brand-1');
      expect(where.post).toEqual({
        is: { isDeleted: false, organizationId: 'org-1' },
      });
      expect(where.date.gte).toBeInstanceOf(Date);
      expect(where.date.lte).toBeInstanceOf(Date);
    });

    it('sorts descending by engagement rate and honours the limit', async () => {
      await service.getTopPerformers('org-1', 'brand-1', 3);

      expect(analyticsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { engagementRate: 'desc' },
          take: 3,
        }),
      );
    });

    it('joins analytics rows with their post title, description and publish date', async () => {
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValueOnce([makePost()]);

      const [item] = await service.getTopPerformers('org-1', 'brand-1');

      expect(item).toEqual({
        comments: 5,
        description: 'A great description. Second sentence.',
        engagementRate: 5,
        likes: 10,
        platform: 'instagram',
        postId: 'post-1',
        publishDate: '2026-07-20T14:00:00.000Z',
        saves: 2,
        shares: 3,
        title: 'A great title',
        views: 1000,
      });
    });

    it('falls back to empty strings and zeros when the post is missing', async () => {
      analyticsFindMany.mockResolvedValueOnce([
        makeAnalytics({
          engagementRate: null,
          platform: null,
          totalComments: null,
          totalLikes: null,
          totalSaves: null,
          totalShares: null,
          totalViews: null,
        }),
      ]);
      postFindMany.mockResolvedValueOnce([]);

      const [item] = await service.getTopPerformers('org-1', 'brand-1');

      expect(item.title).toBe('');
      expect(item.description).toBe('');
      expect(item.platform).toBe('');
      expect(item.views).toBe(0);
      expect(item.engagementRate).toBe(0);
      expect(item.publishDate).toBeUndefined();
    });

    it('skips the post lookup entirely when there are no analytics rows', async () => {
      await service.getTopPerformers('org-1', 'brand-1');

      expect(postFindMany).not.toHaveBeenCalled();
    });

    it('de-duplicates post ids before fetching posts', async () => {
      analyticsFindMany.mockResolvedValueOnce([
        makeAnalytics({ postId: 'post-1' }),
        makeAnalytics({ postId: 'post-1' }),
        makeAnalytics({ postId: 'post-2' }),
      ]);

      await service.getTopPerformers('org-1', 'brand-1');

      expect(postFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
          where: {
            id: { in: ['post-1', 'post-2'] },
            isDeleted: false,
            organizationId: 'org-1',
          },
        }),
      );
    });
  });

  describe('getWorstPerformers', () => {
    // DEFAULT_WORST_PERFORMER_MIN_VIEWS is 10: drop zero-reach / unpublished
    // rows without requiring a large audience before a post can count as an
    // anti-pattern.
    const topRow = makeAnalytics({
      engagementRate: 12.5,
      postId: 'top-post',
      totalViews: 8000,
    });
    const worstReachedRow = makeAnalytics({
      engagementRate: 0.4,
      postId: 'worst-reached',
      totalViews: 200,
    });
    const zeroReachRow = makeAnalytics({
      engagementRate: 0.01,
      postId: 'zero-reach',
      totalViews: 0,
    });

    type RankingQuery = {
      orderBy?: { engagementRate?: 'asc' | 'desc' };
      take?: number;
      where?: {
        organizationId?: string;
        post?: { is?: { isDeleted?: boolean; organizationId?: string } };
        totalViews?: { gte?: number };
      };
    };

    type PostLookupQuery = {
      where?: {
        id?: { in?: string[] };
        isDeleted?: boolean;
        organizationId?: string;
      };
    };

    function rankAnalyticsRows(
      rows: ReturnType<typeof makeAnalytics>[],
      query?: RankingQuery,
      deletedPostIds: ReadonlySet<string> = new Set(),
    ) {
      const minViews = query?.where?.totalViews?.gte;
      const excludeDeleted = query?.where?.post?.is?.isDeleted === false;
      const eligible = rows.filter((row) => {
        if (excludeDeleted && deletedPostIds.has(String(row.postId))) {
          return false;
        }
        return minViews === undefined || Number(row.totalViews) >= minViews;
      });
      const direction = query?.orderBy?.engagementRate === 'asc' ? 1 : -1;
      return [...eligible]
        .sort(
          (left, right) =>
            (Number(left.engagementRate) - Number(right.engagementRate)) *
            direction,
        )
        .slice(0, query?.take ?? eligible.length);
    }

    function stubMixedAnalytics() {
      analyticsFindMany.mockImplementation((query?: RankingQuery) => {
        return Promise.resolve(
          rankAnalyticsRows([topRow, worstReachedRow, zeroReachRow], query),
        );
      });
      postFindMany.mockImplementation((query?: PostLookupQuery) => {
        const ids = new Set(query?.where?.id?.in ?? []);
        return Promise.resolve(
          [
            makePost({ id: 'top-post', label: 'Winning hook' }),
            makePost({ id: 'worst-reached', label: 'Generic AI tips' }),
            makePost({ id: 'zero-reach', label: 'Unpublished draft' }),
          ].filter((post) => ids.has(post.id)),
        );
      });
    }

    it('scopes the query to the organization, brand and date range', async () => {
      await service.getWorstPerformers('org-1', 'brand-1', 10, {
        endDate: '2026-07-31',
        startDate: '2026-07-01',
      });

      const where = analyticsFindMany.mock.calls[0]?.[0]?.where;
      expect(where.organizationId).toBe('org-1');
      expect(where.brandId).toBe('brand-1');
      expect(where.date.gte).toBeInstanceOf(Date);
      expect(where.date.lte).toBeInstanceOf(Date);
    });

    it('ranks by lowest engagement and applies DEFAULT_WORST_PERFORMER_MIN_VIEWS so zero-reach posts cannot dominate', async () => {
      stubMixedAnalytics();

      const worst = await service.getWorstPerformers('org-1', 'brand-1', 5);

      expect(DEFAULT_WORST_PERFORMER_MIN_VIEWS).toBe(10);
      expect(analyticsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { engagementRate: 'asc' },
          take: 5,
          where: expect.objectContaining({
            brandId: 'brand-1',
            organizationId: 'org-1',
            totalViews: { gte: DEFAULT_WORST_PERFORMER_MIN_VIEWS },
          }),
        }),
      );
      expect(worst.map((item) => item.postId)).toEqual([
        'worst-reached',
        'top-post',
      ]);
      expect(worst.map((item) => item.postId)).not.toContain('zero-reach');
    });

    it('returns a different first item than getTopPerformers on a mixed fixture', async () => {
      stubMixedAnalytics();

      const [top] = await service.getTopPerformers('org-1', 'brand-1', 5);
      const [worst] = await service.getWorstPerformers('org-1', 'brand-1', 5);

      expect(top.postId).toBe('top-post');
      expect(worst.postId).toBe('worst-reached');
      expect(top.postId).not.toBe(worst.postId);
      expect(top.engagementRate).toBeGreaterThan(worst.engagementRate);
    });

    it('honours a caller-supplied minViews override', async () => {
      await service.getWorstPerformers('org-1', 'brand-1', 3, {
        minViews: 250,
      });

      expect(analyticsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            totalViews: { gte: 250 },
          }),
        }),
      );
    });

    it('applies the post soft-delete filter on the analytics query before take', async () => {
      await service.getWorstPerformers('org-1', 'brand-1', 2);

      expect(analyticsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { engagementRate: 'asc' },
          take: 2,
          where: expect.objectContaining({
            brandId: 'brand-1',
            organizationId: 'org-1',
            post: { is: { isDeleted: false, organizationId: 'org-1' } },
            totalViews: { gte: DEFAULT_WORST_PERFORMER_MIN_VIEWS },
          }),
        }),
      );
    });

    it('excludes soft-deleted posts from mixed fixtures and keeps active ranking order', async () => {
      const deletedLowest = makeAnalytics({
        engagementRate: 0.05,
        postId: 'deleted-lowest',
        totalViews: 400,
      });
      const deletedNext = makeAnalytics({
        engagementRate: 0.1,
        postId: 'deleted-next',
        totalViews: 500,
      });
      const activeWorst = makeAnalytics({
        engagementRate: 0.5,
        postId: 'active-worst',
        totalViews: 300,
      });
      const activeNext = makeAnalytics({
        engagementRate: 1.2,
        postId: 'active-next',
        totalViews: 800,
      });
      const deletedPostIds = new Set(['deleted-lowest', 'deleted-next']);

      analyticsFindMany.mockImplementation((query?: RankingQuery) => {
        return Promise.resolve(
          rankAnalyticsRows(
            [deletedLowest, deletedNext, activeWorst, activeNext],
            query,
            deletedPostIds,
          ),
        );
      });
      postFindMany.mockImplementation((query?: PostLookupQuery) => {
        const ids = new Set(query?.where?.id?.in ?? []);
        const excludeDeleted = query?.where?.isDeleted === false;
        return Promise.resolve(
          [
            makePost({ id: 'deleted-lowest', label: 'Deleted anti-pattern' }),
            makePost({ id: 'deleted-next', label: 'Also deleted' }),
            makePost({ id: 'active-worst', label: 'Active worst' }),
            makePost({ id: 'active-next', label: 'Active next' }),
          ].filter((post) => {
            if (!ids.has(post.id)) {
              return false;
            }
            return !excludeDeleted || !deletedPostIds.has(post.id);
          }),
        );
      });

      const worst = await service.getWorstPerformers('org-1', 'brand-1', 2);

      expect(worst.map((item) => item.postId)).toEqual([
        'active-worst',
        'active-next',
      ]);
      expect(worst.map((item) => item.title)).toEqual([
        'Active worst',
        'Active next',
      ]);
      expect(postFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['active-worst', 'active-next'] },
            isDeleted: false,
            organizationId: 'org-1',
          },
        }),
      );
    });

    it('returns an empty list when every ranking candidate is soft-deleted', async () => {
      const deletedOnly = [
        makeAnalytics({
          engagementRate: 0.05,
          postId: 'deleted-a',
          totalViews: 400,
        }),
        makeAnalytics({
          engagementRate: 0.2,
          postId: 'deleted-b',
          totalViews: 900,
        }),
      ];
      const deletedPostIds = new Set(['deleted-a', 'deleted-b']);

      analyticsFindMany.mockImplementation((query?: RankingQuery) => {
        return Promise.resolve(
          rankAnalyticsRows(deletedOnly, query, deletedPostIds),
        );
      });

      await expect(
        service.getWorstPerformers('org-1', 'brand-1', 5),
      ).resolves.toEqual([]);
      expect(postFindMany).not.toHaveBeenCalled();
    });
  });

  describe('getPromptPerformance', () => {
    it('scopes analytics through the post relation is-filter, not a relation alias', async () => {
      await service.getPromptPerformance('org-1', 'brand-1');

      const where = analyticsFindMany.mock.calls[0]?.[0]?.where;
      expect(where.organizationId).toBe('org-1');
      expect(where.brandId).toBe('brand-1');
      expect(where.post).toEqual({
        is: { isDeleted: false, organizationId: 'org-1' },
      });
    });

    it('returns an empty list when no analytics exist', async () => {
      await expect(
        service.getPromptPerformance('org-1', 'brand-1'),
      ).resolves.toEqual([]);
    });

    it('groups rows by the first 100 characters of the description', async () => {
      analyticsFindMany.mockResolvedValueOnce([
        makeAnalytics({ engagementRate: 10, postId: 'post-1' }),
        makeAnalytics({ engagementRate: 20, postId: 'post-2' }),
      ]);
      postFindMany.mockResolvedValueOnce([
        makePost({ description: 'shared prompt', id: 'post-1' }),
        makePost({ description: 'shared prompt', id: 'post-2' }),
      ]);

      const result = await service.getPromptPerformance('org-1', 'brand-1');

      expect(result).toEqual([
        {
          avgEngagementRate: 15,
          promptSnippet: 'shared prompt',
          totalPosts: 2,
          totalViews: 2000,
        },
      ]);
    });

    it('truncates the grouping key to 100 characters', async () => {
      const long = 'x'.repeat(150);
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValueOnce([makePost({ description: long })]);

      const [item] = await service.getPromptPerformance('org-1', 'brand-1');

      expect(item.promptSnippet).toHaveLength(100);
    });

    it('falls back to the post label when there is no description', async () => {
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValueOnce([
        makePost({ description: null, label: 'label only' }),
      ]);

      const [item] = await service.getPromptPerformance('org-1', 'brand-1');

      expect(item.promptSnippet).toBe('label only');
    });

    it('ignores rows whose post has neither description nor label', async () => {
      analyticsFindMany.mockResolvedValueOnce([makeAnalytics()]);
      postFindMany.mockResolvedValueOnce([
        makePost({ description: '   ', label: '' }),
      ]);

      await expect(
        service.getPromptPerformance('org-1', 'brand-1'),
      ).resolves.toEqual([]);
    });

    it('sorts prompts by average engagement descending', async () => {
      analyticsFindMany.mockResolvedValueOnce([
        makeAnalytics({ engagementRate: 1, postId: 'post-1' }),
        makeAnalytics({ engagementRate: 50, postId: 'post-2' }),
      ]);
      postFindMany.mockResolvedValueOnce([
        makePost({ description: 'low', id: 'post-1' }),
        makePost({ description: 'high', id: 'post-2' }),
      ]);

      const result = await service.getPromptPerformance('org-1', 'brand-1');

      expect(result.map((r) => r.promptSnippet)).toEqual(['high', 'low']);
    });
  });

  describe('getWeeklySummary', () => {
    it('aggregates every section into a single summary', async () => {
      analyticsFindMany.mockResolvedValue([makeAnalytics()]);
      postFindMany.mockResolvedValue([makePost()]);
      queryRaw
        // getAvgEngagementByPlatform
        .mockResolvedValueOnce([
          {
            avg_engagement_rate: '4.5',
            platform: 'instagram',
            total_posts: 3n,
          },
        ])
        // getAvgEngagementByContentType
        .mockResolvedValueOnce([
          { avg_engagement_rate: 2, category: 'reel', total_posts: 1 },
        ])
        // getBestPostingTimes
        .mockResolvedValueOnce([
          { avg_engagement_rate: 6, hour: '14', post_count: 2n },
        ]);

      const summary = await service.getWeeklySummary('org-1', 'brand-1');

      expect(summary.avgEngagementByPlatform).toEqual([
        { avgEngagementRate: 4.5, platform: 'instagram', totalPosts: 3 },
      ]);
      expect(summary.avgEngagementByContentType).toEqual([
        { avgEngagementRate: 2, category: 'reel', totalPosts: 1 },
      ]);
      expect(summary.bestPostingTimes).toEqual([
        { avgEngagementRate: 6, hour: 14, postCount: 2 },
      ]);
      expect(summary.topPerformers).toHaveLength(1);
      expect(summary.worstPerformers).toHaveLength(1);
      // first sentence of the description
      expect(summary.topHooks).toEqual(['A great description']);
    });

    it('defaults null raw aggregates to zero and unknown labels', async () => {
      queryRaw
        .mockResolvedValueOnce([
          { avg_engagement_rate: null, platform: null, total_posts: 0 },
        ])
        .mockResolvedValueOnce([
          { avg_engagement_rate: null, category: null, total_posts: 0 },
        ])
        .mockResolvedValueOnce([]);

      const summary = await service.getWeeklySummary('org-1', 'brand-1');

      expect(summary.avgEngagementByPlatform).toEqual([
        { avgEngagementRate: 0, platform: 'unknown', totalPosts: 0 },
      ]);
      expect(summary.avgEngagementByContentType).toEqual([
        { avgEngagementRate: 0, category: 'unknown', totalPosts: 0 },
      ]);
    });

    it('requests the caller-supplied top and worst counts', async () => {
      await service.getWeeklySummary('org-1', 'brand-1', {
        topN: 2,
        worstN: 7,
      });

      expect(analyticsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { engagementRate: 'desc' },
          take: 2,
        }),
      );
      expect(analyticsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { engagementRate: 'asc' },
          take: 7,
        }),
      );
    });

    it('reports an upward trend when engagement grew more than 5%', async () => {
      analyticsAggregate
        .mockResolvedValueOnce({
          _sum: { totalComments: 10, totalLikes: 100, totalShares: 10 },
        })
        .mockResolvedValueOnce({
          _sum: { totalComments: 5, totalLikes: 50, totalShares: 5 },
        });

      const { weekOverWeekTrend } = await service.getWeeklySummary(
        'org-1',
        'brand-1',
      );

      expect(weekOverWeekTrend).toEqual({
        currentEngagement: 120,
        direction: 'up',
        percentageChange: 100,
        previousEngagement: 60,
      });
    });

    it('reports a downward trend when engagement fell more than 5%', async () => {
      analyticsAggregate
        .mockResolvedValueOnce({ _sum: { totalLikes: 50 } })
        .mockResolvedValueOnce({ _sum: { totalLikes: 100 } });

      const { weekOverWeekTrend } = await service.getWeeklySummary(
        'org-1',
        'brand-1',
      );

      expect(weekOverWeekTrend.direction).toBe('down');
      expect(weekOverWeekTrend.percentageChange).toBe(-50);
    });

    it('reports a stable trend for movement inside the 5% band', async () => {
      analyticsAggregate
        .mockResolvedValueOnce({ _sum: { totalLikes: 102 } })
        .mockResolvedValueOnce({ _sum: { totalLikes: 100 } });

      const { weekOverWeekTrend } = await service.getWeeklySummary(
        'org-1',
        'brand-1',
      );

      expect(weekOverWeekTrend.direction).toBe('stable');
    });

    it('treats growth from a zero baseline as a 100% increase', async () => {
      analyticsAggregate
        .mockResolvedValueOnce({ _sum: { totalLikes: 10 } })
        .mockResolvedValueOnce({ _sum: {} });

      const { weekOverWeekTrend } = await service.getWeeklySummary(
        'org-1',
        'brand-1',
      );

      expect(weekOverWeekTrend).toEqual({
        currentEngagement: 10,
        direction: 'up',
        percentageChange: 100,
        previousEngagement: 0,
      });
    });

    it('stays flat when both periods have no engagement', async () => {
      const { weekOverWeekTrend } = await service.getWeeklySummary(
        'org-1',
        'brand-1',
      );

      expect(weekOverWeekTrend).toEqual({
        currentEngagement: 0,
        direction: 'stable',
        percentageChange: 0,
        previousEngagement: 0,
      });
    });

    it('tolerates an aggregate response with no _sum key', async () => {
      analyticsAggregate.mockResolvedValue({});

      const { weekOverWeekTrend } = await service.getWeeklySummary(
        'org-1',
        'brand-1',
      );

      expect(weekOverWeekTrend.currentEngagement).toBe(0);
    });

    it('drops hooks that reduce to an empty string', async () => {
      analyticsFindMany.mockResolvedValue([makeAnalytics()]);
      postFindMany.mockResolvedValue([
        makePost({ description: '', label: '' }),
      ]);

      const { topHooks } = await service.getWeeklySummary('org-1', 'brand-1');

      expect(topHooks).toEqual([]);
    });

    it('falls back to the title when a hook has no description', async () => {
      analyticsFindMany.mockResolvedValue([makeAnalytics()]);
      postFindMany.mockResolvedValue([
        makePost({ description: '', label: 'Title hook' }),
      ]);

      const { topHooks } = await service.getWeeklySummary('org-1', 'brand-1');

      expect(topHooks).toEqual(['Title hook']);
    });
  });

  describe('generatePerformanceContext', () => {
    it('returns the empty-state sentence when nothing is available', async () => {
      await expect(
        service.generatePerformanceContext('org-1', 'brand-1'),
      ).resolves.toBe('Engagement trending STABLE 0%.');
    });

    it('summarises hooks, best time, best platform and trend', async () => {
      analyticsFindMany.mockResolvedValue([makeAnalytics()]);
      postFindMany.mockResolvedValue([makePost()]);
      queryRaw
        // platform engagement
        .mockResolvedValueOnce([
          { avg_engagement_rate: 3, platform: 'instagram', total_posts: 1 },
          { avg_engagement_rate: 9, platform: 'tiktok', total_posts: 1 },
        ])
        // best posting times
        .mockResolvedValueOnce([
          { avg_engagement_rate: 6, hour: 14, post_count: 2 },
        ]);
      analyticsAggregate
        .mockResolvedValueOnce({ _sum: { totalLikes: 200 } })
        .mockResolvedValueOnce({ _sum: { totalLikes: 100 } });

      const context = await service.generatePerformanceContext(
        'org-1',
        'brand-1',
      );

      expect(context).toContain('Your top hooks last week: [A great title].');
      expect(context).toContain('Best posting time: 2PM.');
      expect(context).toContain('Best platform: tiktok.');
      expect(context).toContain('Engagement trending UP 100%.');
    });

    it('renders midnight as 12AM', async () => {
      queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { avg_engagement_rate: 1, hour: 0, post_count: 1 },
        ]);

      const context = await service.generatePerformanceContext(
        'org-1',
        'brand-1',
      );

      expect(context).toContain('Best posting time: 12AM.');
    });

    it('renders a morning hour with the AM suffix', async () => {
      queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { avg_engagement_rate: 1, hour: 9, post_count: 1 },
        ]);

      const context = await service.generatePerformanceContext(
        'org-1',
        'brand-1',
      );

      expect(context).toContain('Best posting time: 9AM.');
    });

    it('renders noon as 12PM', async () => {
      queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { avg_engagement_rate: 1, hour: 12, post_count: 1 },
        ]);

      const context = await service.generatePerformanceContext(
        'org-1',
        'brand-1',
      );

      expect(context).toContain('Best posting time: 12PM.');
    });

    it('omits the hook sentence when every top performer is blank', async () => {
      analyticsFindMany.mockResolvedValue([makeAnalytics()]);
      postFindMany.mockResolvedValue([
        makePost({ description: '', label: '' }),
      ]);

      const context = await service.generatePerformanceContext(
        'org-1',
        'brand-1',
      );

      expect(context).not.toContain('Your top hooks');
    });
  });
});
