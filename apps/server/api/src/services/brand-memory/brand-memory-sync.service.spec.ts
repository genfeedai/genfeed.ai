import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BrandMemorySyncService } from './brand-memory-sync.service';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

describe('BrandMemorySyncService measured performance', () => {
  const contentPerformance = { findFirst: vi.fn(), findMany: vi.fn() };
  const memory = {
    addInsight: vi.fn(),
    logEntry: vi.fn(),
    updateMetrics: vi.fn(),
  };
  const logger = { warn: vi.fn() };
  const service = new BrandMemorySyncService(
    { contentPerformance } as unknown as PrismaService,
    memory as unknown as BrandMemoryService,
    logger as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('uses typed metrics and measurement time instead of stale JSON', async () => {
    const measuredAt = new Date('2026-09-23T09:00:00Z');
    const latest = {
      id: 'analytics-sync:source-1',
      postId: 'post-1',
      measuredAt,
      createdAt: new Date(),
      likes: 20,
      comments: 3,
      shares: 2,
      saves: 1,
      views: 230,
      engagementRate: 13,
      platform: 'instagram',
      contentType: 'image',
      data: { likes: 0, engagementRate: 0, clicks: 4 },
    };
    contentPerformance.findFirst.mockResolvedValue(latest);
    contentPerformance.findMany.mockResolvedValue([latest]);
    await service.syncPostPerformance('org-1', 'brand-1', 'post-1');
    expect(contentPerformance.findFirst).toHaveBeenCalledWith({
      orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
      where: {
        organizationId: 'org-1',
        brandId: 'brand-1',
        postId: 'post-1',
        isDeleted: false,
      },
    });
    expect(memory.logEntry).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      expect.objectContaining({
        content:
          'Post post-1 on instagram reached 30 engagements with 13.00% engagement rate.',
        key: 'post_performance:post-1',
        timestamp: measuredAt,
      }),
    );
    expect(memory.updateMetrics).toHaveBeenCalledWith('org-1', 'brand-1', {
      avgEngagementRate: 13,
      postsPublished: 1,
      topPerformingFormat: 'image',
      totalEngagement: 30,
    });
    expect(memory.addInsight).not.toHaveBeenCalled();
  });

  it('aggregates the day across posts and never invents a rate without views', async () => {
    const measuredAt = new Date('2026-09-23T00:00:00Z');
    const unviewed = {
      id: 'analytics-sync:x',
      postId: 'post-x',
      measuredAt,
      createdAt: measuredAt,
      likes: 4,
      comments: 1,
      shares: 0,
      saves: 0,
      views: 0,
      engagementRate: 0,
      platform: null,
      contentType: 'text',
      data: {},
    };
    contentPerformance.findFirst.mockResolvedValue(unviewed);
    contentPerformance.findMany.mockResolvedValue([
      unviewed,
      {
        ...unviewed,
        postId: 'post-y',
        views: 100,
        likes: 8,
        engagementRate: 8,
        contentType: 'video',
      },
    ]);
    await service.syncPostPerformance('org-1', 'brand-1', 'post-x');
    expect(memory.logEntry).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      expect.objectContaining({
        content: 'Post post-x reached 5 engagements with no reported views.',
      }),
    );
    expect(memory.updateMetrics).toHaveBeenCalledWith('org-1', 'brand-1', {
      avgEngagementRate: 8,
      postsPublished: 2,
      topPerformingFormat: 'video',
      totalEngagement: 14,
    });
    expect(contentPerformance.findMany).toHaveBeenCalledTimes(1);
    expect(contentPerformance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ['postId'],
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('emits one replay-keyed insight for a post that beats the brand baseline', async () => {
    const measuredAt = new Date('2026-09-23T00:00:00Z');
    const winner = {
      id: 'analytics-sync:w',
      postId: 'post-w',
      measuredAt,
      createdAt: measuredAt,
      likes: 90,
      comments: 10,
      shares: 0,
      saves: 0,
      views: 1000,
      engagementRate: 10,
      platform: 'instagram',
      contentType: 'image',
      data: { hookUsed: 'Show the craft before the pitch' },
    };
    const peers = ['a', 'b', 'c'].map((id) => ({
      ...winner,
      id: `analytics-sync:${id}`,
      postId: `post-${id}`,
      engagementRate: 2,
      data: {},
    }));
    contentPerformance.findFirst.mockResolvedValue(winner);
    contentPerformance.findMany.mockResolvedValue([winner, ...peers]);
    await service.syncPostPerformance('org-1', 'brand-1', 'post-w');
    await service.syncPostPerformance('org-1', 'brand-1', 'post-w');
    expect(memory.addInsight).toHaveBeenCalledTimes(2);
    for (const call of memory.addInsight.mock.calls) {
      expect(call).toEqual([
        'org-1',
        'brand-1',
        expect.objectContaining({
          category: 'performance',
          insight:
            'Winning post on instagram: 10.00% engagement versus a 2.00% baseline across 3 recent posts (5.00x). Hook: "Show the craft before the pitch"',
          source: 'analytics-winner:post-w',
        }),
      ]);
    }
    expect(contentPerformance.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ views: { gt: 0 } }),
      }),
    );
  });

  it('makes no winner claim without enough baseline posts', async () => {
    const measuredAt = new Date('2026-09-23T00:00:00Z');
    const row = {
      id: 'analytics-sync:w',
      postId: 'post-w',
      measuredAt,
      createdAt: measuredAt,
      likes: 90,
      comments: 10,
      shares: 0,
      saves: 0,
      views: 1000,
      engagementRate: 10,
      platform: 'instagram',
      contentType: 'image',
      data: {},
    };
    contentPerformance.findFirst.mockResolvedValue(row);
    contentPerformance.findMany.mockResolvedValue([
      row,
      { ...row, postId: 'post-a', engagementRate: 1 },
    ]);
    await service.syncPostPerformance('org-1', 'brand-1', 'post-w');
    expect(memory.addInsight).not.toHaveBeenCalled();
  });

  it.each([
    { rate: 6, type: 'spike' },
    { rate: 0, type: 'drop' },
  ])(
    'emits a $type insight keyed to the measurement period',
    async ({ rate, type }) => {
      contentPerformance.findMany.mockImplementation(({ where }) =>
        Promise.resolve([
          {
            engagementRate: 'lte' in where.measuredAt ? rate : 2,
            views: 100,
            data: { engagementRate: 99 },
          },
        ]),
      );
      await expect(
        service.detectThresholdAlerts('org-1', 'brand-1'),
      ).resolves.toEqual([
        {
          baselineAverage: 2,
          recentAverage: rate,
          ratio: rate / 2,
          metric: 'engagementRate',
          type,
        },
      ]);
      await service.detectThresholdAlerts('org-1', 'brand-1');
      expect(memory.addInsight).toHaveBeenCalledTimes(2);
      for (const call of memory.addInsight.mock.calls) {
        expect(call).toEqual([
          'org-1',
          'brand-1',
          expect.objectContaining({
            category: 'performance',
            source: 'analytics-threshold:engagementRate:2026-09-24',
          }),
        ]);
      }
      expect(contentPerformance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            brandId: 'brand-1',
            isDeleted: false,
            measuredAt: expect.any(Object),
            views: { gt: 0 },
          }),
          distinct: ['postId'],
        }),
      );
    },
  );

  it('does not turn missing recent evidence into a drop', async () => {
    contentPerformance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ engagementRate: 2, views: 100 }]);
    await expect(
      service.detectThresholdAlerts('org-1', 'brand-1'),
    ).resolves.toEqual([]);
    expect(memory.addInsight).not.toHaveBeenCalled();
  });
});
