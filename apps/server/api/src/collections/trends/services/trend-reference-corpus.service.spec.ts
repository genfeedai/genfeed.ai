import type { TrendSourceItem } from '@api/collections/trends/interfaces/trend.interfaces';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';

type ReferenceRow = {
  authorHandle: string | null;
  canonicalUrl: string;
  createdAt: Date;
  currentEngagementTotal: number;
  data: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  lastSeenAt: Date | null;
  latestTrendViralityScore: number;
  platform: string | null;
};

type QueryLike = {
  sql?: string;
  text?: string;
};

describe('TrendReferenceCorpusService', () => {
  const referenceRows: ReferenceRow[] = [
    {
      authorHandle: 'creator',
      canonicalUrl: 'https://example.com/a',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      currentEngagementTotal: 1200,
      data: {
        authorHandle: 'creator',
        canonicalUrl: 'https://example.com/a',
        contentType: 'video',
        currentEngagementTotal: 1200,
        firstSeenAt: '2026-06-01T00:00:00.000Z',
        lastSeenAt: '2026-06-12T00:00:00.000Z',
        latestTrendMentions: 300,
        latestTrendViralityScore: 91,
        matchedTrendTopics: ['ai tools'],
        platform: 'tiktok',
        sourceClassification: {
          capturedAt: '2026-06-01T00:00:00.000Z',
          confidence: 'medium',
          freshnessWindowDays: 2,
          intendedUse: 'organic_trend_discovery',
          sourceKind: 'public_platform_reference',
          sourceLabel: 'TikTok',
          sourceTopic: 'ai tools',
        },
        sourcePreviewState: 'live',
        title: 'AI tools clip',
      },
      id: 'ref_tiktok',
      isDeleted: false,
      lastSeenAt: new Date('2026-06-12T00:00:00.000Z'),
      latestTrendViralityScore: 91,
      platform: 'tiktok',
    },
    {
      authorHandle: 'creator',
      canonicalUrl: 'https://example.com/b',
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
      currentEngagementTotal: 400,
      data: {
        authorHandle: 'creator',
        canonicalUrl: 'https://example.com/b',
        contentType: 'post',
        currentEngagementTotal: 400,
        firstSeenAt: '2026-06-02T00:00:00.000Z',
        lastSeenAt: '2026-06-10T00:00:00.000Z',
        latestTrendMentions: 100,
        latestTrendViralityScore: 35,
        matchedTrendTopics: ['design'],
        platform: 'instagram',
        sourcePreviewState: 'live',
        title: 'Design post',
      },
      id: 'ref_instagram',
      isDeleted: false,
      lastSeenAt: new Date('2026-06-10T00:00:00.000Z'),
      latestTrendViralityScore: 35,
      platform: 'instagram',
    },
    {
      authorHandle: 'paid-lab',
      canonicalUrl: 'https://ads.example.com/library/creative-1',
      createdAt: new Date('2026-06-03T00:00:00.000Z'),
      currentEngagementTotal: 2400,
      data: {
        authorHandle: 'paid-lab',
        canonicalUrl: 'https://ads.example.com/library/creative-1',
        contentType: 'video',
        currentEngagementTotal: 2400,
        firstSeenAt: '2026-06-03T00:00:00.000Z',
        lastSeenAt: '2026-06-13T00:00:00.000Z',
        latestTrendMentions: 500,
        latestTrendViralityScore: 72,
        matchedTrendTopics: ['paid creative'],
        platform: 'meta',
        sourceClassification: {
          capturedAt: '2026-06-03T00:00:00.000Z',
          confidence: 'high',
          freshnessWindowDays: 30,
          intendedUse: 'paid_creative_analysis',
          paidCreative: {
            adFormat: 'feed',
            collectedAt: '2026-06-03T00:00:00.000Z',
            creativeType: 'video',
            hook: 'Show the before state in the first second',
            landingIntent: 'trial_signup',
            provider: 'meta_ads_library',
            visibleEngagementSignals: {
              comments: 40,
              likes: 1800,
              shares: 160,
              views: 400,
            },
          },
          sourceKind: 'paid_creative_reference',
          sourceLabel: 'Meta Ads Library',
          sourceTopic: 'paid creative',
        },
        sourcePreviewState: 'live',
        title: 'Paid creative reference',
      },
      id: 'ref_paid',
      isDeleted: false,
      lastSeenAt: new Date('2026-06-13T00:00:00.000Z'),
      latestTrendViralityScore: 72,
      platform: 'meta',
    },
  ];

  function filterReferences(where: {
    authorHandle?: string;
    canonicalUrl?: { in: string[] };
    id?: { in: string[] };
    isDeleted?: boolean;
    platform?: string | { not: null };
  }) {
    return referenceRows.filter((row) => {
      if (
        typeof where.isDeleted === 'boolean' &&
        row.isDeleted !== where.isDeleted
      ) {
        return false;
      }
      if (
        where.canonicalUrl?.in &&
        !where.canonicalUrl.in.includes(row.canonicalUrl)
      ) {
        return false;
      }
      if (where.id?.in && !where.id.in.includes(row.id)) {
        return false;
      }
      if (
        typeof where.platform === 'string' &&
        row.platform !== where.platform
      ) {
        return false;
      }
      if (
        typeof where.authorHandle === 'string' &&
        row.authorHandle !== where.authorHandle
      ) {
        return false;
      }
      return true;
    });
  }

  const prisma = {
    $queryRaw: vi.fn((query: QueryLike) => {
      const sql = String(query.sql ?? query.text ?? '');
      if (sql.includes('source_reference_id')) {
        return Promise.resolve([
          { remix_count: 2, source_reference_id: 'ref_tiktok' },
        ]);
      }
      if (sql.includes('author_handle')) {
        return Promise.resolve([
          {
            author_handle: 'creator',
            platform: 'tiktok',
            remix_count: 2,
          },
        ]);
      }
      return Promise.resolve([]);
    }),
    trend: {
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          where.id === 'trend_1' && where.organizationId === 'org_1'
            ? { id: 'trend_1' }
            : null,
        ),
      ),
      findMany: vi.fn(({ where }) =>
        Promise.resolve(
          where.id.in.includes('trend_1') && where.organizationId === 'org_1'
            ? [{ id: 'trend_1' }]
            : [],
        ),
      ),
    },
    trendRemixLineage: {
      create: vi.fn().mockResolvedValue({ id: 'lineage_1' }),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    trendSourceReference: {
      create: vi.fn(),
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          referenceRows.find(
            (row) =>
              row.canonicalUrl === where.canonicalUrl &&
              row.platform === where.platform &&
              row.isDeleted === where.isDeleted,
          ) ?? null,
        ),
      ),
      findMany: vi.fn(({ orderBy, take, where }) => {
        let rows = filterReferences(where);
        if (orderBy) {
          rows = [...rows].sort(
            (left, right) =>
              right.currentEngagementTotal - left.currentEngagementTotal ||
              right.latestTrendViralityScore - left.latestTrendViralityScore,
          );
        }
        return Promise.resolve(
          typeof take === 'number' ? rows.slice(0, take) : rows,
        );
      }),
      groupBy: vi.fn(({ take, where }) => {
        const rows = filterReferences(where).filter(
          (row) => row.platform && row.authorHandle,
        );
        const groups = new Map<string, ReferenceRow[]>();
        for (const row of rows) {
          groups.set(`${row.platform}:${row.authorHandle}`, [
            ...(groups.get(`${row.platform}:${row.authorHandle}`) ?? []),
            row,
          ]);
        }
        const result = Array.from(groups.entries())
          .map(([key, groupRows]) => {
            const [platform, authorHandle] = key.split(':');
            const engagement = groupRows.reduce(
              (total, row) => total + row.currentEngagementTotal,
              0,
            );
            const virality = groupRows.reduce(
              (total, row) => total + row.latestTrendViralityScore,
              0,
            );
            return {
              _avg: {
                latestTrendViralityScore: virality / groupRows.length,
              },
              _count: { _all: groupRows.length },
              _max: {
                lastSeenAt: groupRows.reduce<Date | null>(
                  (latest, row) =>
                    !latest || (row.lastSeenAt && row.lastSeenAt > latest)
                      ? row.lastSeenAt
                      : latest,
                  null,
                ),
              },
              _sum: { currentEngagementTotal: engagement },
              authorHandle,
              platform,
            };
          })
          .sort(
            (left, right) =>
              Number(right._avg.latestTrendViralityScore) -
              Number(left._avg.latestTrendViralityScore),
          );
        return Promise.resolve(
          typeof take === 'number' ? result.slice(0, take) : result,
        );
      }),
      update: vi.fn().mockResolvedValue({ id: 'ref_tiktok' }),
    },
    trendSourceReferenceLink: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(({ where }) =>
        Promise.resolve(
          where.trendId === 'trend_1'
            ? [{ sourceReferenceId: 'ref_tiktok' }]
            : [],
        ),
      ),
    },
    trendSourceReferenceSnapshot: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
  };

  const loggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: TrendReferenceCorpusService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TrendReferenceCorpusService(
      prisma as unknown as PrismaService,
      loggerService as unknown as LoggerService,
    );
  });

  it('filters reference corpus by trend, platform, and author without scanning recent references', async () => {
    const result = await service.getReferenceCorpus('org_1', 'brand_1', {
      authorHandle: 'creator',
      limit: 5,
      platform: 'tiktok',
      trendId: 'trend_1',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'ref_tiktok',
      platform: 'tiktok',
      sourceClassification: expect.objectContaining({
        intendedUse: 'organic_trend_discovery',
        sourceKind: 'public_platform_reference',
      }),
      remixCount: 2,
    });
    expect(prisma.trendSourceReferenceLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { sourceReferenceId: true },
        take: 100,
      }),
    );
    expect(prisma.trendSourceReference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        where: expect.objectContaining({
          authorHandle: 'creator',
          id: { in: ['ref_tiktok'] },
          platform: 'tiktok',
        }),
      }),
    );
  });

  it('excludes paid creative references from default corpus reads', async () => {
    const result = await service.getReferenceCorpus('org_1', 'brand_1', {
      limit: 10,
    });

    expect(result.items.map((item) => item.id)).toEqual([
      'ref_tiktok',
      'ref_instagram',
    ]);
    expect(result.items).not.toContainEqual(
      expect.objectContaining({ id: 'ref_paid' }),
    );
    expect(prisma.trendSourceReference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 40,
      }),
    );
  });

  it('returns paid creative references through explicit source filters', async () => {
    const result = await service.getReferenceCorpus('org_1', 'brand_1', {
      intendedUse: 'paid_creative_analysis',
      limit: 10,
      sourceKind: 'paid_creative_reference',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'ref_paid',
        sourceClassification: expect.objectContaining({
          intendedUse: 'paid_creative_analysis',
          paidCreative: expect.objectContaining({
            hook: 'Show the before state in the first second',
            provider: 'meta_ads_library',
          }),
          sourceKind: 'paid_creative_reference',
        }),
      }),
    ]);
  });

  it('annotates source items through indexed canonical URL lookup', async () => {
    const items: TrendSourceItem[] = [
      {
        contentType: 'video',
        id: 'source_1',
        platform: 'tiktok',
        sourceUrl: 'https://example.com/a?utm=1',
      },
    ];

    const result = await service.annotateSourceItemsWithReferenceIds(items);

    expect(result[0].sourceReferenceId).toBe('ref_tiktok');
    expect(prisma.trendSourceReference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1,
        where: {
          canonicalUrl: { in: ['https://example.com/a'] },
          isDeleted: false,
        },
      }),
    );
  });

  it('persists source classification when syncing public reference items', async () => {
    prisma.trendSourceReference.findFirst.mockResolvedValueOnce(null);
    prisma.trendSourceReference.create.mockResolvedValueOnce({
      id: 'ref_public',
    });

    await service.syncTrendReferences([
      {
        id: 'trend_public',
        mentions: 2400,
        platform: 'linkedin',
        sourcePreview: [
          {
            authorHandle: 'openai',
            contentType: 'post',
            id: 'linkedin:openai:primary',
            platform: 'linkedin',
            sourceClassification: {
              capturedAt: '2026-06-09T00:00:00.000Z',
              confidence: 'low',
              freshnessWindowDays: 7,
              intendedUse: 'organic_trend_discovery',
              sourceKind: 'public_platform_reference',
              sourceLabel: 'OpenAI',
              sourceTopic: '#openai',
            },
            sourceUrl: 'https://www.linkedin.com/company/openai/',
            title: 'OpenAI public reference',
          },
        ],
        sourcePreviewState: 'fallback',
        topic: '#openai',
        viralityScore: 42,
      },
    ]);

    expect(prisma.trendSourceReference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            sourceClassification: expect.objectContaining({
              intendedUse: 'organic_trend_discovery',
              sourceKind: 'public_platform_reference',
              sourceLabel: 'OpenAI',
            }),
          }),
        }),
      }),
    );
  });

  it('persists paid creative classification metadata when syncing references', async () => {
    prisma.trendSourceReference.findFirst.mockResolvedValueOnce(null);
    prisma.trendSourceReference.create.mockResolvedValueOnce({
      id: 'ref_paid_public',
    });

    await service.syncTrendReferences([
      {
        id: 'trend_paid',
        mentions: 5400,
        platform: 'meta',
        sourcePreview: [
          {
            authorHandle: 'paid-lab',
            contentType: 'video',
            id: 'meta:paid-lab:creative-1',
            metrics: {
              likes: 1800,
              shares: 160,
              views: 400,
            },
            platform: 'meta',
            sourceClassification: {
              capturedAt: '2026-06-09T00:00:00.000Z',
              confidence: 'high',
              freshnessWindowDays: 30,
              intendedUse: 'paid_creative_analysis',
              paidCreative: {
                adFormat: 'feed',
                collectedAt: '2026-06-09T00:00:00.000Z',
                creativeType: 'video',
                hook: 'Name the audience pain before the demo',
                landingIntent: 'trial_signup',
                provider: 'meta_ads_library',
                visibleEngagementSignals: {
                  likes: 1800,
                  shares: 160,
                  views: 400,
                },
              },
              sourceKind: 'paid_creative_reference',
              sourceLabel: 'Meta Ads Library',
              sourceTopic: 'creative analytics',
            },
            sourceUrl: 'https://ads.example.com/library/creative-2',
            title: 'Paid creative reference',
          },
        ],
        sourcePreviewState: 'live',
        topic: 'paid creative',
        viralityScore: 72,
      },
    ]);

    expect(prisma.trendSourceReference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({
            sourceClassification: expect.objectContaining({
              intendedUse: 'paid_creative_analysis',
              paidCreative: expect.objectContaining({
                creativeType: 'video',
                provider: 'meta_ads_library',
              }),
              sourceKind: 'paid_creative_reference',
            }),
          }),
        }),
      }),
    );
  });

  it('groups top reference accounts with scalar columns and brand remix counts', async () => {
    const result = await service.getTopReferenceAccounts('org_1', 'brand_1', {
      limit: 10,
      platform: 'tiktok',
    });

    expect(result.accounts).toEqual([
      {
        authorHandle: 'creator',
        avgTrendViralityScore: 91,
        brandRemixCount: 2,
        lastSeenAt: '2026-06-12T00:00:00.000Z',
        platform: 'tiktok',
        referenceCount: 1,
        totalEngagement: 1200,
      },
    ]);
    expect(prisma.trendSourceReference.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['platform', 'authorHandle'],
        take: 10,
        where: expect.objectContaining({ platform: 'tiktok' }),
      }),
    );
  });

  it('caps reference lookup limits before querying', async () => {
    await service.getReferenceCorpus('org_1', 'brand_1', { limit: 999 });
    await service.getTopReferenceAccounts('org_1', 'brand_1', { limit: 999 });

    expect(prisma.trendSourceReference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
      }),
    );
    expect(prisma.trendSourceReference.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
      }),
    );
  });

  it('resolves metadata source URLs before creating org-scoped remix lineage', async () => {
    await service.recordDraftRemixLineage({
      brandId: 'brand_1',
      contentDraftId: 'draft_1',
      generatedBy: 'test',
      metadata: {
        sourceUrl: 'https://example.com/a?utm=1',
        trendId: 'trend_1',
      },
      organizationId: 'org_1',
      platforms: ['tiktok'],
    });

    expect(prisma.trendSourceReference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1,
        where: {
          canonicalUrl: { in: ['https://example.com/a'] },
          isDeleted: false,
        },
      }),
    );
    expect(prisma.trendRemixLineage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandId: 'brand_1',
          organizationId: 'org_1',
          sourceReferences: { connect: [{ id: 'ref_tiktok' }] },
          trends: { connect: [{ id: 'trend_1' }] },
        }),
      }),
    );
  });
});
