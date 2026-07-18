import { TrendCorpusFreshnessService } from '@api/collections/trends/services/modules/trend-corpus-freshness.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';

type ReferenceDoc = {
  createdAt: Date;
  data: Record<string, unknown>;
  id: string;
  lastSeenAt: Date;
  platform: string;
};

type TrendDoc = {
  createdAt: Date;
  data: Record<string, unknown>;
  id: string;
  lastSeenAt: Date;
  organizationId: string | null;
  platform: string;
  updatedAt: Date;
};

const referenceDocs: ReferenceDoc[] = [
  {
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    data: {
      authorHandle: 'creator',
      firstSeenAt: '2026-06-01T00:00:00.000Z',
      lastSeenAt: '2026-06-12T00:00:00.000Z',
      matchedTrendTopics: ['ai tools'],
      platform: 'tiktok',
      sourceClassification: {
        capturedAt: '2026-06-01T00:00:00.000Z',
        confidence: 'medium',
        freshnessWindowDays: 2,
        intendedUse: 'organic_trend_discovery',
        sourceKind: 'public_platform_reference',
        sourceLabel: 'TikTok',
      },
    },
    id: 'ref_tiktok',
    lastSeenAt: new Date('2026-06-12T00:00:00.000Z'),
    platform: 'tiktok',
  },
  {
    createdAt: new Date('2026-06-02T00:00:00.000Z'),
    data: {
      authorHandle: 'designer',
      firstSeenAt: '2026-06-02T00:00:00.000Z',
      lastSeenAt: '2026-06-10T00:00:00.000Z',
      matchedTrendTopics: ['design'],
      platform: 'instagram',
      sourceClassification: {
        capturedAt: '2026-06-02T00:00:00.000Z',
        confidence: 'medium',
        freshnessWindowDays: 30,
        intendedUse: 'organic_trend_discovery',
        sourceKind: 'public_platform_reference',
        sourceLabel: 'Instagram',
      },
    },
    id: 'ref_instagram',
    lastSeenAt: new Date('2026-06-10T00:00:00.000Z'),
    platform: 'instagram',
  },
];

const makeTrend = (
  id: string,
  platform: string,
  metadata: Record<string, unknown>,
  organizationId: string | null = null,
): TrendDoc => ({
  createdAt: new Date('2026-06-10T00:00:00.000Z'),
  data: {
    expiresAt: '2026-07-01T00:00:00.000Z',
    isCurrent: true,
    metadata,
    platform,
  },
  id,
  lastSeenAt: new Date('2026-06-12T00:00:00.000Z'),
  organizationId,
  platform,
  updatedAt: new Date('2026-06-12T00:00:00.000Z'),
});

const trendDocs: TrendDoc[] = [
  makeTrend(
    'trend_live',
    'tiktok',
    {
      source: 'apify',
      sourcePreviewCachedAt: '2026-06-12T00:00:00.000Z',
      sourcePreviewState: 'live',
    },
    'org_1',
  ),
  makeTrend('trend_empty', 'youtube', {
    source: 'apify',
    sourcePreviewCachedAt: '2026-06-13T00:00:00.000Z',
    sourcePreviewState: 'empty',
  }),
  makeTrend('trend_fallback', 'instagram', {
    source: 'apify',
    sourcePreviewCachedAt: '2026-06-11T00:00:00.000Z',
    sourcePreviewState: 'fallback',
  }),
  makeTrend('trend_stale', 'twitter', {
    source: 'apify',
    sourcePreviewCachedAt: '2026-06-01T00:00:00.000Z',
    sourcePreviewState: 'live',
  }),
  makeTrend('trend_prelaunch', 'linkedin', {
    prelaunchCorpus: true,
    source: 'public-reference',
    sourcePreviewCachedAt: '2026-06-01T00:00:00.000Z',
    sourcePreviewState: 'fallback',
  }),
];

describe('TrendCorpusFreshnessService', () => {
  let service: TrendCorpusFreshnessService;
  let prisma: {
    trend: { findMany: ReturnType<typeof vi.fn> };
    trendSourceReference: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      trend: {
        findMany: vi.fn(({ where }) =>
          Promise.resolve(
            where.platform
              ? trendDocs.filter((doc) => doc.platform === where.platform)
              : trendDocs,
          ),
        ),
      },
      trendSourceReference: {
        findMany: vi.fn(({ where }) =>
          Promise.resolve(
            where.platform
              ? referenceDocs.filter((doc) => doc.platform === where.platform)
              : referenceDocs,
          ),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendCorpusFreshnessService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TrendCorpusFreshnessService);
  });

  it('reports freshness segments and every live provider failure class', async () => {
    const result = await service.getCorpusFreshnessHealth({
      isPlatformAdmin: true,
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(result.status).toBe('stale');
    expect(result.summary).toMatchObject({
      activeTrends: 5,
      failingProviders: 3,
      freshSegments: 2,
      referenceRecords: 2,
      staleSegments: 0,
      totalSegments: 2,
    });
    expect(result.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: 'tiktok',
          provider: 'TikTok',
          status: 'healthy',
        }),
        expect.objectContaining({
          platform: 'instagram',
          provider: 'Instagram',
          status: 'healthy',
        }),
      ]),
    );
    expect(result.providerFailures.map((failure) => failure.reason)).toEqual([
      'fallback_source_preview',
      'stale_source_preview',
      'empty_source_preview',
    ]);
    expect(
      result.providerFailures.some(
        (failure) => failure.provider === 'public-reference',
      ),
    ).toBe(false);
  });

  it('marks segments stale when their source windows expire', async () => {
    const result = await service.getCorpusFreshnessHealth({
      isPlatformAdmin: true,
      now: new Date('2026-07-20T00:00:00.000Z'),
      sourcePreviewStaleAfterDays: 100,
    });

    expect(result.status).toBe('stale');
    expect(result.summary.staleSegments).toBe(2);
    expect(result.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: 'tiktok',
          staleReferenceCount: 1,
          status: 'stale',
        }),
        expect.objectContaining({
          platform: 'instagram',
          staleReferenceCount: 1,
          status: 'stale',
        }),
      ]),
    );
  });

  it('filters both corpus queries by platform and preserves record caps', async () => {
    const result = await service.getCorpusFreshnessHealth({
      isPlatformAdmin: true,
      now: new Date('2026-06-14T00:00:00.000Z'),
      platform: 'tiktok',
    });

    expect(result.summary.platforms).toEqual(['tiktok']);
    expect(result.summary.referenceRecords).toBe(1);
    expect(result.summary.failingProviders).toBe(0);
    expect(prisma.trendSourceReference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5000,
        where: { isDeleted: false, platform: 'tiktok' },
      }),
    );
    expect(prisma.trend.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2000,
        where: { isDeleted: false, platform: 'tiktok' },
      }),
    );
  });

  it('scopes non-admin trend health to the caller organization and global rows', async () => {
    await service.getCorpusFreshnessHealth({
      now: new Date('2026-06-14T00:00:00.000Z'),
      organizationId: 'org_1',
    });

    expect(prisma.trend.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ organizationId: 'org_1' }, { organizationId: null }],
          isDeleted: false,
        },
      }),
    );
  });

  it('restricts non-admin callers without an organization to global trends', async () => {
    await service.getCorpusFreshnessHealth({
      now: new Date('2026-06-14T00:00:00.000Z'),
    });

    expect(prisma.trend.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ organizationId: null }],
          isDeleted: false,
        },
      }),
    );
  });

  it('keeps the platform-admin trend aggregate cross-organization', async () => {
    await service.getCorpusFreshnessHealth({
      isPlatformAdmin: true,
      now: new Date('2026-06-14T00:00:00.000Z'),
      organizationId: 'org_1',
    });

    const trendWhere = prisma.trend.findMany.mock.calls.at(-1)?.[0]?.where;
    expect(trendWhere).toEqual({ isDeleted: false });
    expect(trendWhere).not.toHaveProperty('OR');
  });
});
