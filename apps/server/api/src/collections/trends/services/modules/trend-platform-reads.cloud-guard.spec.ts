import {
  buildGuardedDelegate,
  type GuardedRow,
  idsOf,
} from '@api/collections/models/testing/cloud-guarded-delegate';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { TrendCorpusFreshnessService } from '@api/collections/trends/services/modules/trend-corpus-freshness.service';
import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { TrendQueryService } from '@api/collections/trends/services/modules/trend-query.service';
import { TrendRefreshHealthService } from '@api/collections/trends/services/modules/trend-refresh-health.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

function trendRow(
  id: string,
  organizationId: string | null,
  overrides: Partial<GuardedRow> = {},
): GuardedRow {
  return {
    brandId: null,
    createdAt: new Date('2026-03-10T00:00:00Z'),
    data: {
      isCurrent: true,
      platform: 'tiktok',
      topic: 'ai video',
      viralityScore: 70,
    },
    expiresAt: null,
    id,
    isCurrent: true,
    isDeleted: false,
    organizationId,
    platform: 'tiktok',
    updatedAt: new Date('2026-03-10T00:00:00Z'),
    ...overrides,
  };
}

function setup() {
  const trends = [
    trendRow('platform', null),
    trendRow('mine', ORG),
    trendRow('theirs', OTHER_ORG),
    trendRow('platform-old', null, {
      data: { isCurrent: false, platform: 'tiktok', topic: 'old' },
      isCurrent: false,
    }),
  ];
  const notificationEvents: GuardedRow[] = [
    {
      id: 'platform-health',
      isDeleted: false,
      occurredAt: new Date(),
      organizationId: null,
      payload: { outcome: 'native_available' },
      sourceId: 'trends:tiktok',
      sourceType: 'trend_refresh_health',
    },
    {
      id: 'foreign-health',
      isDeleted: false,
      occurredAt: new Date(),
      organizationId: OTHER_ORG,
      payload: { outcome: 'native_available' },
      sourceId: 'trends:tiktok',
      sourceType: 'trend_refresh_health',
    },
  ];
  const prisma = {
    notificationEvent: buildGuardedDelegate(
      'NotificationEvent',
      notificationEvents,
    ),
    trend: buildGuardedDelegate('Trend', trends),
    trendSourceReference: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  const logger = { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService;
  const inTenant = <T>(callback: () => Promise<T>) =>
    runWithTenantContext({ organizationId: ORG }, callback);

  return { inTenant, logger, prisma, trends };
}

describe('trend platform reads under the CLOUD tenant guard', () => {
  it('reads the platform trends for a tenant without leaking own or foreign rows', async () => {
    const { inTenant, prisma } = setup();
    const query = new TrendQueryService(prisma);

    const trends = await inTenant(() =>
      query.findActiveTrends({ brandId: null, organizationId: null }),
    );

    expect(idsOf(trends)).toEqual(['platform']);
  });

  it('reads the tenant own trends and the last-good platform fallback', async () => {
    const { inTenant, prisma } = setup();
    const query = new TrendQueryService(prisma);

    const own = await inTenant(() =>
      query.findActiveTrends({ brandId: null, organizationId: ORG }),
    );
    const lastGood = await inTenant(() =>
      query.findLastGoodTrends({ brandId: null, organizationId: null }),
    );

    expect(idsOf(own)).toEqual(['mine']);
    expect(idsOf(lastGood)).toEqual(['platform', 'platform-old']);
  });

  it('resolves a trend by id for platform and own rows, never a foreign one', async () => {
    const { inTenant, prisma } = setup();
    const query = new TrendQueryService(prisma);

    const platform = await inTenant(() => query.getTrendById('platform'));
    const mine = await inTenant(() => query.getTrendById('mine', ORG));
    const theirs = await inTenant(() => query.getTrendById('theirs', ORG));

    expect(platform?.id).toBe('platform');
    expect(mine?.id).toBe('mine');
    expect(theirs).toBeNull();
  });

  it('counts only the active platform trends', async () => {
    const { inTenant, prisma } = setup();
    const query = new TrendQueryService(prisma);

    await expect(inTenant(() => query.countActiveGlobalTrends())).resolves.toBe(
      1,
    );
  });

  it('lets the superadmin purge sweep every organization', async () => {
    const { inTenant, prisma, trends } = setup();
    trends.push(
      trendRow('seed-foreign', OTHER_ORG, {
        data: { metadata: { prelaunchCorpus: true }, platform: 'tiktok' },
      }),
    );
    const query = new TrendQueryService(prisma);

    const result = await inTenant(() => query.purgeSyntheticTrendRows());

    expect(result.purged).toBe(1);
    expect(trends.find((row) => row.id === 'seed-foreign')?.isDeleted).toBe(
      true,
    );
  });

  it('finds related trends from the platform corpus plus the tenant', async () => {
    const { inTenant, logger, prisma } = setup();
    const filtering = new TrendFilteringService(prisma, logger);

    const related = await inTenant(() =>
      filtering.getRelatedTrends('ai video', 'instagram', ORG),
    );

    expect(idsOf(related)).toEqual(['mine', 'platform']);
  });

  it('marks the platform corpus historical through the platform hatch', async () => {
    const { inTenant, logger, prisma, trends } = setup();
    const analysis = new TrendAnalysisService(prisma, logger);

    await inTenant(() => analysis.markCurrentTrendsAsHistorical());

    expect(trends.find((row) => row.id === 'platform')?.isCurrent).toBe(false);
    expect(trends.find((row) => row.id === 'mine')?.isCurrent).toBe(true);
  });

  it('reads the platform refresh health evidence for a tenant', async () => {
    const { inTenant, prisma } = setup();
    const health = new TrendRefreshHealthService(prisma);

    await inTenant(() => health.getHealth({ platform: 'tiktok' }));

    expect(prisma.notificationEvent.findFirst).toHaveBeenCalled();
  });

  it('reports corpus freshness for a tenant and for a platform admin', async () => {
    const { inTenant, prisma } = setup();
    const freshness = new TrendCorpusFreshnessService(
      prisma,
      new TrendRefreshHealthService(prisma),
    );

    await expect(
      inTenant(() =>
        freshness.getCorpusFreshnessHealth({ organizationId: ORG }),
      ),
    ).resolves.toBeDefined();
    await expect(
      inTenant(() =>
        freshness.getCorpusFreshnessHealth({
          isPlatformAdmin: true,
          organizationId: ORG,
        }),
      ),
    ).resolves.toBeDefined();
  });
});
