vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Measurement {
  brandId: string;
  comments: number;
  contentType: string | null;
  createdAt: Date;
  data: Record<string, unknown>;
  engagementRate: number;
  id: string;
  isDeleted: boolean;
  likes: number;
  measuredAt: Date;
  organizationId: string;
  platform: string | null;
  postId: string;
  saves: number;
  shares: number;
  views: number;
}

interface Range {
  gt?: number;
  gte?: Date;
  lt?: Date;
  lte?: Date;
}

interface Insight {
  category: string;
  insight: string;
  source: string;
}

const NOW = new Date('2026-09-24T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const inRange = (value: number | Date, range: Range) =>
  (range.gt === undefined || Number(value) > range.gt) &&
  (range.gte === undefined || value >= range.gte) &&
  (range.lt === undefined || value < range.lt) &&
  (range.lte === undefined || value <= range.lte);

// Prisma filters on content_performance as Postgres applies them.
const matches = (row: Measurement, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, condition]) => {
    const value = row[key as keyof Measurement];
    return condition && typeof condition === 'object'
      ? inRange(value as number | Date, condition as Range)
      : value === condition;
  });

const newestFirst = (left: Measurement, right: Measurement) =>
  right.measuredAt.getTime() - left.measuredAt.getTime() ||
  right.id.localeCompare(left.id);

describe('BrandMemorySyncService measured performance', () => {
  let rows: Measurement[];
  let entries: Map<string, { content: string; timestamp: Date }>;
  let insights: Map<string, Insight>;
  let metrics: Record<string, unknown> | undefined;
  let service: BrandMemorySyncService;

  const measure = (
    postId: string,
    fields: Partial<Measurement> = {},
  ): Measurement => {
    const row: Measurement = {
      brandId: 'brand-1',
      comments: 0,
      contentType: 'image',
      createdAt: NOW,
      data: {},
      engagementRate: 2,
      id: `analytics-sync:${postId}:${rows.length}`,
      isDeleted: false,
      likes: 0,
      measuredAt: new Date('2026-09-23T09:00:00Z'),
      organizationId: 'org-1',
      platform: 'instagram',
      postId,
      saves: 0,
      shares: 0,
      views: 100,
      ...fields,
    };
    rows.push(row);
    return row;
  };
  const measurePeers = (peers: Partial<Measurement>[]) => {
    for (const [index, fields] of peers.entries()) {
      measure(`post-${index}`, fields);
    }
  };
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    rows = [];
    entries = new Map();
    insights = new Map();
    metrics = undefined;

    const contentPerformance = {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((row) => matches(row, where)).sort(newestFirst)[0] ?? null,
      findMany: async ({
        take,
        where,
      }: {
        take: number;
        where: Record<string, unknown>;
      }) => {
        const latestPerPost = new Map<string, Measurement>();
        for (const row of rows
          .filter((candidate) => matches(candidate, where))
          .sort(newestFirst)) {
          if (!latestPerPost.has(row.postId)) {
            latestPerPost.set(row.postId, row);
          }
        }
        return [...latestPerPost.values()].slice(0, take);
      },
    };
    // Brand memory keeps one entry per key and one replay-keyed insight per
    // source, as the brand-memory service does for the day.
    const memory = {
      addInsight: async (_org: string, _brand: string, insight: Insight) => {
        insights.set(insight.source, insight);
      },
      logEntry: async (
        _org: string,
        _brand: string,
        entry: { content: string; key: string; timestamp: Date },
      ) => {
        entries.set(entry.key, {
          content: entry.content,
          timestamp: entry.timestamp,
        });
      },
      updateMetrics: async (
        _org: string,
        _brand: string,
        update: Record<string, unknown>,
      ) => {
        metrics = update;
      },
    };

    service = new BrandMemorySyncService(
      { contentPerformance } as unknown as PrismaService,
      memory as unknown as BrandMemoryService,
      { warn: () => undefined } as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records the latest typed measurement instead of stale JSON', async () => {
    measure('post-1', {
      likes: 1,
      measuredAt: new Date('2026-09-23T08:00:00Z'),
    });
    measure('post-1', {
      comments: 3,
      data: { clicks: 4, engagementRate: 0, likes: 0 },
      engagementRate: 13,
      likes: 20,
      saves: 1,
      shares: 2,
      views: 230,
    });
    measure('post-1', { likes: 900, organizationId: 'org-2' });
    measure('post-1', { brandId: 'brand-2', likes: 900 });

    await service.syncPostPerformance('org-1', 'brand-1', 'post-1');

    expect([...entries]).toEqual([
      [
        'post_performance:post-1',
        {
          content:
            'Post post-1 on instagram reached 30 engagements with 13.00% engagement rate.',
          timestamp: new Date('2026-09-23T09:00:00Z'),
        },
      ],
    ]);
    expect(metrics).toEqual({
      avgEngagementRate: 13,
      postsPublished: 1,
      topPerformingFormat: 'image',
      totalEngagement: 30,
    });
    expect(insights.size).toBe(0);
  });

  it('aggregates the day across posts and never invents a rate without views', async () => {
    const measuredAt = new Date('2026-09-23T00:00:00Z');
    measure('post-x', {
      comments: 1,
      contentType: 'text',
      engagementRate: 0,
      likes: 4,
      measuredAt,
      platform: null,
      views: 0,
    });
    measure('post-y', {
      comments: 1,
      contentType: 'video',
      engagementRate: 8,
      likes: 8,
      measuredAt,
    });
    measure('post-z', {
      engagementRate: 50,
      likes: 500,
      measuredAt: new Date('2026-09-22T12:00:00Z'),
    });

    await service.syncPostPerformance('org-1', 'brand-1', 'post-x');

    expect(entries.get('post_performance:post-x')?.content).toBe(
      'Post post-x reached 5 engagements with no reported views.',
    );
    expect(metrics).toEqual({
      avgEngagementRate: 8,
      postsPublished: 2,
      topPerformingFormat: 'video',
      totalEngagement: 14,
    });
  });

  describe('winning posts', () => {
    const seedWinner = () =>
      measure('post-w', {
        comments: 10,
        data: { hookUsed: 'Show the craft before the pitch' },
        engagementRate: 10,
        likes: 90,
        views: 1000,
      });

    it('keeps one entry and one insight when a winning post is replayed', async () => {
      seedWinner();
      measure('post-a');
      measure('post-b');
      measure('post-c');

      await service.syncPostPerformance('org-1', 'brand-1', 'post-w');
      await service.syncPostPerformance('org-1', 'brand-1', 'post-w');

      expect(entries.size).toBe(1);
      expect([...insights.values()]).toEqual([
        {
          category: 'performance',
          confidence: 0.3,
          createdAt: NOW,
          insight:
            'Winning post on instagram: 10.00% engagement versus a 2.00% baseline across 3 recent posts (5.00x). Hook: "Show the craft before the pitch"',
          source: 'analytics-winner:post-w',
        },
      ]);
    });

    it.each([
      ['only one baseline post', [{}]],
      [
        'baseline posts without views',
        [{ views: 0 }, { views: 0 }, { views: 0 }],
      ],
      [
        'baseline posts outside the ten-day window',
        [
          { measuredAt: daysAgo(12) },
          { measuredAt: daysAgo(12) },
          { measuredAt: daysAgo(12) },
        ],
      ],
    ])('makes no winner claim from %s', async (_case, peers) => {
      seedWinner();
      measurePeers(peers);

      await service.syncPostPerformance('org-1', 'brand-1', 'post-w');

      expect(insights.size).toBe(0);
    });
  });

  describe('threshold alerts', () => {
    it.each([
      [6, 'spike'],
      [0.5, 'drop'],
    ])(
      'records a rate of %s against a 2%% baseline once per day as a %s',
      async (rate, type) => {
        measure('recent', {
          data: { engagementRate: 99 },
          engagementRate: rate,
          measuredAt: daysAgo(1),
        });
        measure('baseline', { engagementRate: 2, measuredAt: daysAgo(5) });

        await expect(
          service.detectThresholdAlerts('org-1', 'brand-1'),
        ).resolves.toEqual([
          {
            baselineAverage: 2,
            metric: 'engagementRate',
            ratio: rate / 2,
            recentAverage: rate,
            type,
          },
        ]);
        await service.detectThresholdAlerts('org-1', 'brand-1');

        expect([...insights.keys()]).toEqual([
          'analytics-threshold:engagementRate:2026-09-24',
        ]);
      },
    );

    it('does not turn missing recent evidence into a drop', async () => {
      measure('baseline', { engagementRate: 2, measuredAt: daysAgo(5) });

      await expect(
        service.detectThresholdAlerts('org-1', 'brand-1'),
      ).resolves.toEqual([]);
      expect(insights.size).toBe(0);
    });

    it('ignores recent posts that reported no views', async () => {
      measure('recent', {
        engagementRate: 0,
        measuredAt: daysAgo(1),
        views: 0,
      });
      measure('baseline', { engagementRate: 2, measuredAt: daysAgo(5) });

      await expect(
        service.detectThresholdAlerts('org-1', 'brand-1'),
      ).resolves.toEqual([]);
    });
  });
});
