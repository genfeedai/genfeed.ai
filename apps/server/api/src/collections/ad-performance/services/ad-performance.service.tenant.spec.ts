import type { AdPerformance } from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PAID_CREATIVE_RESEARCH_SOURCES } from '@genfeedai/integrations/ads';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockAdPerformanceDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

type MockWatchedAdvertiserDelegate = {
  findFirst: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

const TENANT_RESEARCH_SOURCES = [...PAID_CREATIVE_RESEARCH_SOURCES];

const buildRecord = (
  overrides: Partial<AdPerformance> & { data?: Record<string, unknown> } = {},
): AdPerformance =>
  ({
    adPlatform: 'meta',
    brandId: null,
    conversionRate: 0.08,
    cpa: 12,
    cpc: 1.5,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    credentialId: null,
    ctr: 0.04,
    ctaPatternCategories: [],
    ctaText: 'Shop now',
    data: {},
    dataConfidence: 0.9,
    headlinePatternCategories: [],
    headlineText: 'Save 20 today',
    id: 'ad-1',
    industry: 'fitness',
    isDeleted: false,
    organizationId: 'org-1',
    performanceScore: 80,
    roas: 2.4,
    scope: 'public',
    spend: 150,
    spendBucket: '$50-200/day',
    updatedAt: new Date('2026-06-02T00:00:00.000Z'),
    ...overrides,
  }) as AdPerformance;

describe('AdPerformanceService', () => {
  let adPerformance: MockAdPerformanceDelegate;
  let transaction: ReturnType<typeof vi.fn>;
  let service: AdPerformanceService;
  let adWatchedAdvertiser: MockWatchedAdvertiserDelegate;

  beforeEach(() => {
    adPerformance = {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(
          buildRecord({
            ...args.data,
            data: args.data.data as Record<string, unknown>,
          }),
        ),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn((args: { create: Record<string, unknown> }) =>
        Promise.resolve(
          buildRecord({
            ...args.create,
            data: args.create.data as Record<string, unknown>,
          }),
        ),
      ),
    };
    adWatchedAdvertiser = {
      findFirst: vi.fn().mockResolvedValue({
        brandId: null,
        id: 'watch-1',
        lastSnapshotId: null,
        lastSuccessfulAt: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    transaction = vi.fn(
      async (
        callback: (client: {
          adPerformance: MockAdPerformanceDelegate;
          adWatchedAdvertiser: MockWatchedAdvertiserDelegate;
        }) => Promise<unknown>,
      ) => callback({ adPerformance, adWatchedAdvertiser }),
    );
    service = new AdPerformanceService({
      $transaction: transaction,
      adPerformance,
      adWatchedAdvertiser,
    } as unknown as PrismaService);
  });

  describe('findTopPerformers', () => {
    it('pushes platform, industry, scope, metric ordering, and limit into Prisma', async () => {
      adPerformance.findMany.mockResolvedValue([
        buildRecord({ id: 'ad-roas', roas: 3.1 }),
      ]);

      const result = await service.findTopPerformers({
        adPlatform: 'meta',
        industry: 'fitness',
        limit: 3,
        metric: 'roas',
        scope: 'public',
      });

      expect(adPerformance.findMany).toHaveBeenCalledWith({
        orderBy: [{ roas: 'desc' }, { updatedAt: 'desc' }],
        take: 3,
        where: {
          adPlatform: 'meta',
          industry: 'fitness',
          isDeleted: false,
          roas: { not: null },
          scope: 'public',
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ad-roas');
    });

    it('defaults to performanceScore and a ten-row Prisma limit', async () => {
      await service.findTopPerformers({});

      expect(adPerformance.findMany).toHaveBeenCalledWith({
        orderBy: [
          { performanceScore: { nulls: 'last', sort: 'desc' } },
          { updatedAt: 'desc' },
        ],
        take: 10,
        where: {
          isDeleted: false,
          performanceScore: { not: null },
        },
      });
    });

    it('includes tenant-owned repository rows only for the requesting organization', async () => {
      await service.findTopPerformers({
        adPlatform: 'x',
        brandId: 'brand-1',
        organizationId: 'org-1',
        scope: 'public',
      });

      expect(adPerformance.findMany).toHaveBeenCalledWith({
        orderBy: [
          { performanceScore: { nulls: 'last', sort: 'desc' } },
          { updatedAt: 'desc' },
        ],
        take: 10,
        where: {
          AND: [
            {
              OR: [
                { performanceScore: { not: null } },
                {
                  OR: [{ brandId: 'brand-1' }, { brandId: null }],
                  organizationId: 'org-1',
                  performanceScore: null,
                  researchFreshnessState: 'fresh',
                  researchSource: { in: TENANT_RESEARCH_SOURCES },
                  scope: 'organization',
                },
              ],
            },
          ],
          OR: [
            {
              OR: [
                { researchSource: null },
                { researchSource: { notIn: TENANT_RESEARCH_SOURCES } },
              ],
              scope: 'public',
            },
            {
              OR: [{ brandId: 'brand-1' }, { brandId: null }],
              organizationId: 'org-1',
              researchFreshnessState: 'fresh',
              researchSource: { in: TENANT_RESEARCH_SOURCES },
              scope: 'organization',
            },
          ],
          adPlatform: 'x',
          isDeleted: false,
        },
      });
      const rankingWhere = adPerformance.findMany.mock.calls[0][0].where as {
        organizationId?: string;
      };
      expect(rankingWhere).not.toHaveProperty('organizationId');
    });

    it('limits tenant repository rows to explicitly organization-wide rows when no brand is active', async () => {
      await service.findTopPerformers({
        adPlatform: 'x',
        organizationId: 'org-1',
        scope: 'public',
      });

      expect(adPerformance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              {
                OR: [
                  { researchSource: null },
                  { researchSource: { notIn: TENANT_RESEARCH_SOURCES } },
                ],
                scope: 'public',
              },
              expect.objectContaining({
                brandId: null,
                organizationId: 'org-1',
                researchSource: { in: TENANT_RESEARCH_SOURCES },
              }),
            ],
          }),
        }),
      );
    });

    it('uses a bounded candidate query for JSON-backed metrics', async () => {
      adPerformance.findMany.mockResolvedValue([
        buildRecord({
          data: { conversions: 1 },
          id: 'low-conversions',
          performanceScore: 99,
        }),
        buildRecord({
          data: { conversions: 15 },
          id: 'high-conversions',
          performanceScore: 70,
        }),
      ]);

      const result = await service.findTopPerformers({
        limit: 1,
        metric: 'conversions',
        scope: 'public',
      });

      expect(adPerformance.findMany).toHaveBeenCalledWith({
        orderBy: [
          { performanceScore: { nulls: 'last', sort: 'desc' } },
          { updatedAt: 'desc' },
        ],
        take: 500,
        where: {
          isDeleted: false,
          performanceScore: { not: null },
          scope: 'public',
        },
      });
      expect(result.map((record) => record.id)).toEqual(['high-conversions']);
    });

    it('does not query when the requested limit is zero', async () => {
      const result = await service.findTopPerformers({ limit: 0 });

      expect(result).toEqual([]);
      expect(adPerformance.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findPublicById', () => {
    it('requires public scope for public ad detail lookups', async () => {
      adPerformance.findFirst.mockResolvedValue(
        buildRecord({
          data: {
            brand: 'stale-brand',
            organization: 'stale-organization',
          },
          id: 'public-ad',
        }),
      );

      const result = await service.findPublicById('public-ad');

      expect(adPerformance.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { researchSource: null },
            { researchSource: { notIn: TENANT_RESEARCH_SOURCES } },
          ],
          id: 'public-ad',
          isDeleted: false,
          scope: 'public',
        },
      });
      expect(result?.id).toBe('public-ad');
      expect(result).not.toHaveProperty('brand');
      expect(result).not.toHaveProperty('organization');
      expect(result?.data).toEqual({});
    });

    it('admits an organization-owned repository detail only for that organization', async () => {
      adPerformance.findFirst.mockResolvedValue(
        buildRecord({ id: 'repository-ad', scope: 'organization' }),
      );

      await service.findPublicById('repository-ad', 'org-1', 'brand-1');

      expect(adPerformance.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            {
              OR: [
                { researchSource: null },
                { researchSource: { notIn: TENANT_RESEARCH_SOURCES } },
              ],
              scope: 'public',
            },
            {
              OR: [{ brandId: 'brand-1' }, { brandId: null }],
              organizationId: 'org-1',
              researchFreshnessState: 'fresh',
              researchSource: { in: TENANT_RESEARCH_SOURCES },
              scope: 'organization',
            },
          ],
          id: 'repository-ad',
          isDeleted: false,
        },
      });
      const detailWhere = adPerformance.findFirst.mock.calls[0][0].where as {
        organizationId?: string;
      };
      expect(detailWhere).not.toHaveProperty('organizationId');
    });

    it('does not include another brand in a repository detail lookup', async () => {
      await service.findPublicById('repository-ad', 'org-1', 'brand-1');

      const query = adPerformance.findFirst.mock.calls[0][0];
      expect(query.where.OR[1]).toMatchObject({
        OR: [{ brandId: 'brand-1' }, { brandId: null }],
        organizationId: 'org-1',
      });
      expect(JSON.stringify(query)).not.toContain('brand-2');
    });
  });

  describe('repository snapshot lifecycle', () => {
    it('tombstones rows missing from a successful replacement snapshot', async () => {
      const observedAt = new Date('2026-08-23T10:00:00.000Z');
      await service.replaceResearchSnapshot({
        expectedBrandId: null,
        observedAt,
        organizationId: 'org-1',
        records: [
          {
            adPlatform: 'x',
            externalAdId: 'ad-current',
            granularity: 'ad',
            organizationId: 'org-1',
            researchObservedAt: observedAt,
            researchSnapshotId: 'snapshot-1',
            researchSnapshotKey: 'watch-1',
            researchSource: 'x_ads_repository',
          },
        ],
        researchSource: 'x_ads_repository',
        snapshotId: 'snapshot-1',
        snapshotKey: 'watch-1',
      });

      expect(adPerformance.updateMany).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: {
          OR: [
            { researchObservedAt: { lte: observedAt } },
            { researchObservedAt: null },
          ],
          brandId: null,
          identityKey: {
            notIn: [
              'v1|research|x_ads_repository|__organization__|watch-1|x||ad||||ad-current',
            ],
          },
          isDeleted: false,
          organizationId: 'org-1',
          researchSnapshotKey: 'watch-1',
          researchSource: 'x_ads_repository',
        },
      });
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(adWatchedAdvertiser.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          freshnessState: 'fresh',
          lastSnapshotId: 'snapshot-1',
          lastSuccessfulAt: observedAt,
        }),
        where: expect.objectContaining({
          id: 'watch-1',
          organizationId: 'org-1',
        }),
      });
    });

    it('tombstones the entire prior snapshot when a successful export is empty', async () => {
      const observedAt = new Date('2026-08-23T10:00:00.000Z');
      await service.replaceResearchSnapshot({
        expectedBrandId: null,
        observedAt,
        organizationId: 'org-1',
        records: [],
        researchSource: 'x_ads_repository',
        snapshotId: 'snapshot-empty',
        snapshotKey: 'watch-1',
      });

      expect(adPerformance.upsert).not.toHaveBeenCalled();
      expect(adPerformance.updateMany).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: {
          OR: [
            { researchObservedAt: { lte: observedAt } },
            { researchObservedAt: null },
          ],
          brandId: null,
          isDeleted: false,
          organizationId: 'org-1',
          researchSnapshotKey: 'watch-1',
          researchSource: 'x_ads_repository',
        },
      });
      expect(adWatchedAdvertiser.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          freshnessState: 'empty',
          lastSnapshotId: 'snapshot-empty',
          lastSnapshotRecordCount: 0,
          lastSuccessfulAt: observedAt,
        }),
        where: expect.objectContaining({ id: 'watch-1' }),
      });
    });

    it('rejects an older overlapping snapshot before it can overwrite or retire newer rows', async () => {
      adWatchedAdvertiser.findFirst.mockResolvedValue({
        brandId: null,
        id: 'watch-1',
        lastSnapshotId: 'snapshot-newer',
        lastSuccessfulAt: new Date('2026-08-23T11:00:00.000Z'),
      });

      await expect(
        service.replaceResearchSnapshot({
          expectedBrandId: null,
          observedAt: new Date('2026-08-23T10:00:00.000Z'),
          organizationId: 'org-1',
          records: [],
          researchSource: 'x_ads_repository',
          snapshotId: 'snapshot-older',
          snapshotKey: 'watch-1',
        }),
      ).resolves.toEqual({ applied: false, recordCount: 0 });

      expect(adPerformance.upsert).not.toHaveBeenCalled();
      expect(adPerformance.updateMany).not.toHaveBeenCalled();
      expect(adWatchedAdvertiser.updateMany).not.toHaveBeenCalled();
    });

    it('rejects records outside the watched advertiser brand before writing', async () => {
      const observedAt = new Date('2026-08-23T10:00:00.000Z');
      adWatchedAdvertiser.findFirst.mockResolvedValue({
        brandId: 'brand-1',
        id: 'watch-1',
        lastSnapshotId: null,
        lastSuccessfulAt: null,
      });

      await expect(
        service.replaceResearchSnapshot({
          expectedBrandId: 'brand-1',
          observedAt,
          organizationId: 'org-1',
          records: [
            {
              adPlatform: 'x',
              brandId: 'brand-2',
              externalAdId: 'ad-foreign',
              granularity: 'ad',
              organizationId: 'org-1',
              researchObservedAt: observedAt,
              researchSnapshotId: 'snapshot-1',
              researchSnapshotKey: 'watch-1',
              researchSource: 'x_ads_repository',
            },
          ],
          researchSource: 'x_ads_repository',
          snapshotId: 'snapshot-1',
          snapshotKey: 'watch-1',
        }),
      ).rejects.toThrow(
        'Research snapshot records must match the watched advertiser brand',
      );

      expect(adPerformance.upsert).not.toHaveBeenCalled();
      expect(adPerformance.updateMany).not.toHaveBeenCalled();
      expect(adWatchedAdvertiser.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an empty snapshot when its expected brand differs from the watch', async () => {
      adWatchedAdvertiser.findFirst.mockResolvedValue({
        brandId: 'brand-1',
        id: 'watch-1',
        lastSnapshotId: null,
        lastSuccessfulAt: null,
      });

      await expect(
        service.replaceResearchSnapshot({
          expectedBrandId: 'brand-2',
          observedAt: new Date('2026-08-23T10:00:00.000Z'),
          organizationId: 'org-1',
          records: [],
          researchSource: 'x_ads_repository',
          snapshotId: 'snapshot-empty',
          snapshotKey: 'watch-1',
        }),
      ).rejects.toThrow(
        'Research snapshot expected brand does not match the watched advertiser',
      );

      expect(adPerformance.upsert).not.toHaveBeenCalled();
      expect(adPerformance.updateMany).not.toHaveBeenCalled();
      expect(adWatchedAdvertiser.updateMany).not.toHaveBeenCalled();
    });

    it('rolls the replacement back when retirement fails before watch freshness advances', async () => {
      adPerformance.updateMany.mockRejectedValueOnce(
        new Error('retirement failed'),
      );

      await expect(
        service.replaceResearchSnapshot({
          expectedBrandId: null,
          observedAt: new Date('2026-08-23T10:00:00.000Z'),
          organizationId: 'org-1',
          records: [],
          researchSource: 'x_ads_repository',
          snapshotId: 'snapshot-1',
          snapshotKey: 'watch-1',
        }),
      ).rejects.toThrow('retirement failed');

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(adWatchedAdvertiser.updateMany).not.toHaveBeenCalled();
    });

    it('marks a failed source snapshot stale so reads hide it without destroying last-known data', async () => {
      await service.markResearchSnapshotStale(
        'org-1',
        'watch-1',
        'x_ads_repository',
      );

      expect(adPerformance.updateMany).toHaveBeenCalledWith({
        data: { researchFreshnessState: 'stale' },
        where: {
          isDeleted: false,
          organizationId: 'org-1',
          researchSnapshotKey: 'watch-1',
          researchSource: 'x_ads_repository',
        },
      });
    });

    it('scopes the stale transition to the failing provider so a sibling platform snapshot on the same advertiser stays fresh (#3537)', async () => {
      await service.markResearchSnapshotStale(
        'org-1',
        'watch-1',
        'meta_ads_library',
      );

      expect(adPerformance.updateMany).toHaveBeenCalledWith({
        data: { researchFreshnessState: 'stale' },
        where: {
          isDeleted: false,
          organizationId: 'org-1',
          researchSnapshotKey: 'watch-1',
          researchSource: 'meta_ads_library',
        },
      });
    });
  });

  describe('upsert', () => {
    it('persists canonical identity columns without duplicating identity in JSON', async () => {
      await service.upsert({
        adPlatform: 'meta',
        brand: 'stale-brand',
        brandId: 'brand-1',
        credential: 'stale-credential',
        credentialId: 'credential-1',
        date: '2026-06-01',
        externalAccountId: 'act-1',
        externalCampaignId: 'campaign-1',
        granularity: 'campaign',
        organization: 'stale-org',
        organizationId: 'org-1',
        providerPayload: { attributionSetting: '7d_click' },
      });

      const createData = adPerformance.upsert.mock.calls[0][0].create as Record<
        string,
        unknown
      >;
      expect(createData).toMatchObject({
        brandId: 'brand-1',
        credentialId: 'credential-1',
        date: new Date('2026-06-01'),
        externalAccountId: 'act-1',
        externalCampaignId: 'campaign-1',
        granularity: 'campaign',
        identityKey:
          'v1|meta|2026-06-01T00:00:00.000Z|campaign|act-1|campaign-1||',
        organizationId: 'org-1',
      });
      expect(createData.data).toEqual({
        adPlatform: 'meta',
        date: '2026-06-01',
        externalAccountId: 'act-1',
        externalCampaignId: 'campaign-1',
        granularity: 'campaign',
        providerPayload: { attributionSetting: '7d_click' },
      });
    });

    it('does not accept a legacy organization alias as persistence identity', async () => {
      await expect(
        service.upsert({
          adPlatform: 'meta',
          date: '2026-06-01',
          externalAccountId: 'act-1',
          granularity: 'campaign',
          organization: 'legacy-org',
        }),
      ).rejects.toThrow('AdPerformance organizationId is required');

      expect(adPerformance.upsert).not.toHaveBeenCalled();
    });
  });
});
