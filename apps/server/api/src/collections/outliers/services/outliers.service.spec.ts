import type { OutlierConfigurationService } from '@api/collections/outliers/services/outlier-configuration.service';
import type { OutlierInputsService } from '@api/collections/outliers/services/outlier-inputs.service';
import { OutliersService } from '@api/collections/outliers/services/outliers.service';
import { setTopLinks } from '@api/helpers/utils/response/response.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { OutlierObservation } from '@genfeedai/contracts/interfaces';
import type {
  OutlierBaselineSnapshot,
  OutlierPostPerformance,
  Prisma,
} from '@genfeedai/prisma';

const scope = {
  organizationId: 'org',
  brandId: 'brand',
  accountType: 'credential' as const,
  accountId: 'account',
  platform: 'twitter',
};
const now = new Date('2026-09-15T00:00:00Z');
function observation(
  id: string,
  views: number,
  extra: Partial<OutlierObservation> = {},
): OutlierObservation {
  return {
    ...scope,
    contentType: 'caption',
    id,
    views,
    isDeleted: false,
    isPinned: false,
    isPromoted: false,
    publishedAtMs: now.getTime() - 3 * 86400000,
    measuredAt: now,
    postId: id,
    sourcePostId: null,
    sourceIdentity: id,
    ...extra,
  };
}
function harness(initial: OutlierObservation[]) {
  let observations = initial;
  const snapshots: OutlierBaselineSnapshot[] = [];
  const measurements: OutlierPostPerformance[] = [];
  const config = {
    windowSize: 20,
    minimumSampleSize: 5,
    outlierThreshold: 3,
    breakoutThreshold: 10,
    maturityHoursByPlatform: {},
  };
  const create = vi.fn(
    async ({
      data,
    }: {
      data: Prisma.OutlierBaselineSnapshotUncheckedCreateInput;
    }) =>
      ({ ...data, id: `s${snapshots.length + 1}` }) as OutlierBaselineSnapshot,
  );
  const createMany = vi.fn(
    async ({ data }: { data: OutlierPostPerformance[] }) => {
      measurements.push(...structuredClone(data));
      return { count: data.length };
    },
  );
  const prisma = {
    outlierBaselineSnapshot: {
      groupBy: vi.fn(async () => {
        const seen = new Set<string>();
        return [...snapshots].reverse().filter((s) => {
          if (seen.has(s.contentType)) return false;
          seen.add(s.contentType);
          return true;
        });
      }),
      findFirst: vi.fn(async () => snapshots.at(-1) ?? null),
    },
    outlierPostPerformance: {
      findMany: vi.fn(
        async ({ where }: { where: { baselineSnapshotId: string } }) =>
          measurements
            .filter((p) => p.baselineSnapshotId === where.baselineSnapshotId)
            .map((p) => ({ logicalPostId: p.logicalPostId })),
      ),
    },
    $transaction: vi.fn(
      async (fn: (tx: unknown) => Promise<OutlierBaselineSnapshot>) => {
        const result = await fn({
          outlierBaselineSnapshot: { create },
          outlierPostPerformance: { createMany },
        });
        snapshots.push(structuredClone(result));
        return result;
      },
    ),
  };
  const service = new OutliersService(
    prisma as unknown as PrismaService,
    {
      authorize: vi.fn(async () => scope),
      read: vi.fn(async () => observations),
    } as unknown as OutlierInputsService,
    {
      resolve: vi.fn(async () => config),
    } as unknown as OutlierConfigurationService,
  );
  return {
    service,
    snapshots,
    measurements,
    config,
    create,
    createMany,
    prisma,
    setObservations: (value: OutlierObservation[]) => {
      observations = value;
    },
  };
}
describe('immutable outlier persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());
  it('persists 30k median, breakout 300k, pinned ratio and unknown provenance', async () => {
    const h = harness(
      Array.from({ length: 20 }, (_, i) => i)
        .map((i) => observation(`base${i}`, 30000))
        .concat([
          observation('breakout', 300000),
          observation('pinned', 2000000, { isPinned: true }),
          observation('unknown', 30000, {
            isPinned: null,
            isPromoted: null,
            publishedAtMs: now.getTime() - 60 * 3600000,
          }),
        ]),
    );
    const [snapshot] = await h.service.refresh(scope);
    expect(snapshot.medianViews).toBe(30000);
    expect(snapshot.sampleSize).toBe(20);
    expect(
      h.measurements.find((p) => p.logicalPostId === 'breakout'),
    ).toMatchObject({ outlierRatio: 10, outlierTier: 'breakout' });
    expect(
      h.measurements.find((p) => p.logicalPostId === 'pinned'),
    ).toMatchObject({
      outlierRatio: 2000000 / 30000,
      isContributor: false,
      exclusionReasons: ['pinned'],
    });
    expect(
      h.measurements.find((p) => p.logicalPostId === 'unknown'),
    ).toMatchObject({ eligibility: 'unknown', isPinnedUnknown: true });
  });
  it.each([
    [4, 30000, 'insufficient_data'],
    [5, 0, 'zero_baseline'],
  ] as const)(
    'keeps ratios null for %i posts at %i views',
    async (count, views, status) => {
      const h = harness(
        Array.from({ length: count }, (_, i) => observation(String(i), views)),
      );
      expect((await h.service.refresh(scope))[0].status).toBe(status);
      expect(h.measurements.every((p) => p.outlierRatio === null)).toBe(true);
    },
  );
  it('keeps 2M/4M at ratio0.5 and no tier', async () => {
    const h = harness(
      [1, 2, 3, 4, 5]
        .map((i) => observation(String(i), 4000000))
        .concat(observation('small', 2000000)),
    );
    await h.service.refresh(scope);
    expect(
      h.measurements.find((p) => p.logicalPostId === 'small'),
    ).toMatchObject({ outlierRatio: 0.5, outlierTier: null });
  });
  it('retries unchanged metrics despite new observation timestamps and preserves old rows after A B A', async () => {
    const input = [1, 2, 3, 4, 5].map((i) => observation(String(i), 30000));
    const h = harness(input);
    const [a] = await h.service.refresh(scope);
    const historical = structuredClone(h.measurements);
    h.setObservations(
      input.map((p) => ({ ...p, measuredAt: new Date(now.getTime() + 1000) })),
    );
    expect((await h.service.refresh(scope))[0].id).toBe(a.id);
    h.setObservations(input.map((p) => ({ ...p, views: 60000 })));
    await h.service.refresh(scope);
    h.setObservations(input);
    const [last] = await h.service.refresh(scope);
    expect(last.id).not.toBe(a.id);
    expect(h.snapshots).toHaveLength(3);
    expect(h.measurements.slice(0, 5)).toEqual(historical);
  });
  it('changes window 20 to10 without mutating historical ratios', async () => {
    const h = harness(
      Array.from({ length: 25 }, (_, i) => observation(String(i), 100 + i)),
    );
    await h.service.refresh(scope);
    h.config.windowSize = 10;
    await h.service.refresh(scope);
    expect(h.snapshots.map((s) => s.sampleSize)).toEqual([20, 10]);
  });
  it('records deleted history in now-empty buckets and never gives deleted rows ratios', async () => {
    const h = harness(
      [1, 2, 3, 4, 5].map((i) => observation(String(i), 30000)),
    );
    await h.service.refresh(scope);
    h.setObservations([]);
    const [snapshot] = await h.service.refresh(scope);
    expect(snapshot.sampleSize).toBe(0);
    expect(
      h.measurements
        .filter((p) => p.baselineSnapshotId === snapshot.id)
        .every(
          (p) =>
            p.outlierRatio === null &&
            p.postId === null &&
            (p.exclusionReasons as string[]).includes('soft_deleted'),
        ),
    ).toBe(true);
  });
  it('refreshes when maturity crosses the boundary without changed input metrics', async () => {
    const h = harness(
      [1, 2, 3, 4, 5].map((i) =>
        observation(String(i), 30000, {
          publishedAtMs: now.getTime() - 47 * 3600000,
        }),
      ),
    );
    expect((await h.service.refresh(scope))[0].status).toBe(
      'insufficient_data',
    );
    vi.setSystemTime(now.getTime() + 3600000);
    expect((await h.service.refresh(scope))[0].status).toBe('ready');
  });
  it('persists caption and video buckets independently', async () => {
    const h = harness([
      ...[1, 2, 3, 4, 5].map((i) => observation(`caption${i}`, 30000)),
      ...[1, 2, 3, 4, 5].map((i) =>
        observation(`video${i}`, 40000, { contentType: 'video' }),
      ),
    ]);
    const snapshots = await h.service.refresh(scope);
    expect(snapshots.map((s) => s.contentType).sort()).toEqual([
      'caption',
      'video',
    ]);
    expect(snapshots.map((s) => s.medianViews).sort()).toEqual([30000, 40000]);
  });
  it('returns the committed snapshot after a concurrent duplicate-key transaction', async () => {
    const h = harness(
      [1, 2, 3, 4, 5].map((i) => observation(String(i), 30000)),
    );
    const [first] = await h.service.refresh(scope);
    h.setObservations(
      [1, 2, 3, 4, 5].map((i) => observation(String(i), 60000)),
    );
    h.prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    expect((await h.service.refresh(scope))[0].id).toBe(first.id);
    expect(h.prisma.outlierBaselineSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          isDeleted: false,
          idempotencyKey: expect.any(String),
        }),
      }),
    );
  });
  it('persists every exclusion reason without manufactured ratios', async () => {
    const h = harness(
      [1, 2, 3, 4, 5]
        .map((i) => observation(String(i), 30000))
        .concat([
          observation('promoted', 100, { isPromoted: true }),
          observation('immature', 100, { publishedAtMs: now.getTime() }),
          observation('invalid-date', 100, { publishedAtMs: NaN }),
          observation('invalid-views', 100, { views: null }),
          observation('older', 100, {
            publishedAtMs: now.getTime() - 10 * 86400000,
          }),
        ]),
    );
    h.config.windowSize = 5;
    await h.service.refresh(scope);
    for (const [id, reason] of [
      ['promoted', 'promoted'],
      ['immature', 'immature'],
      ['invalid-date', 'invalid_publish_date'],
      ['invalid-views', 'invalid_views'],
      ['older', 'outside_window'],
    ])
      expect(
        h.measurements.find((p) => p.logicalPostId === id)?.exclusionReasons,
      ).toContain(reason);
  });

  it('does not return success when a transaction fails', async () => {
    const h = harness([observation('p', 30)]);
    h.createMany.mockRejectedValueOnce(new Error('write failed'));
    await expect(h.service.refresh(scope)).rejects.toThrow('write failed');
    expect(h.snapshots).toHaveLength(0);
  });
});

describe('outlier history read authorization', () => {
  function readHarness() {
    const snapshot = { ...scope, id: 'snapshot', contentType: 'caption' };
    const authorize = vi.fn().mockResolvedValue(scope);
    const findFirst = vi.fn().mockResolvedValue(snapshot);
    const findMany = vi.fn().mockResolvedValue([]);
    const performanceFind = vi.fn().mockResolvedValue([]);
    const prisma = {
      outlierBaselineSnapshot: {
        findFirst,
        findMany,
        count: vi.fn().mockResolvedValue(0),
      },
      outlierPostPerformance: {
        findMany: performanceFind,
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const service = new OutliersService(
      prisma as unknown as PrismaService,
      { authorize } as unknown as OutlierInputsService,
      {} as OutlierConfigurationService,
    );
    return { service, authorize, findFirst, findMany, performanceFind };
  }
  it('returns authorized empty history with scoped stable pagination', async () => {
    const h = readHarness();
    expect(await h.service.list(scope, { page: 2, limit: 10 })).toMatchObject({
      docs: [],
      total: 0,
      page: 2,
      limit: 10,
    });
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          brandId: 'brand',
          accountId: 'account',
          isDeleted: false,
        }),
        skip: 10,
        take: 10,
        orderBy: [{ computedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
  it('normalizes string pagination and supplies serializer metadata', async () => {
    const h = readHarness();
    const result = await h.service.list(scope, {
      page: '2',
      limit: '10',
    } as unknown as Parameters<OutliersService['list']>[1]);
    expect(result).toMatchObject({
      page: 2,
      limit: 10,
      totalDocs: 0,
      totalPages: 0,
    });
    const options = setTopLinks(
      { originalUrl: '/outlier-baselines?page=2&limit=10' },
      {},
      result,
    );
    expect(options).toMatchObject({
      topLevelLinks: { pagination: { page: 2, limit: 10, total: 0, pages: 0 } },
    });
    expect(h.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    const posts = await h.service.posts(
      'org',
      'snapshot',
      '2' as unknown as number,
      '10' as unknown as number,
    );
    expect(posts).toMatchObject({
      page: 2,
      limit: 10,
      totalDocs: 0,
      totalPages: 0,
    });
    expect(h.performanceFind).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });
  it('rejects missing or cross-org snapshots before account authorization', async () => {
    const h = readHarness();
    h.findFirst.mockResolvedValueOnce(null);
    await expect(h.service.findOne('foreign', 'snapshot')).rejects.toThrow(
      'not found',
    );
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'foreign', id: 'snapshot', isDeleted: false },
    });
    expect(h.authorize).not.toHaveBeenCalled();
  });
  it('ranks latest ready performances by ratio within a platform', async () => {
    const snapshot = {
      ...scope,
      id: 'snapshot',
      contentType: 'caption',
      medianViews: 30000,
      sampleSize: 20,
      windowSize: 20,
      status: 'ready',
      computedAt: now,
    };
    const authorize = vi.fn().mockResolvedValue(scope);
    const performanceFind = vi.fn().mockResolvedValue([
      {
        id: 'p1',
        baselineSnapshotId: 'snapshot',
        logicalPostId: 'breakout',
        outlierRatio: 10,
        outlierTier: 'breakout',
        platform: 'twitter',
      },
    ]);
    const prisma = {
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand' }) },
      outlierBaselineSnapshot: {
        groupBy: vi.fn().mockResolvedValue([
          {
            accountId: 'account',
            platform: 'twitter',
            contentType: 'caption',
          },
        ]),
        findFirst: vi.fn().mockResolvedValue({ id: 'snapshot' }),
        findMany: vi.fn().mockResolvedValue([snapshot]),
      },
      outlierPostPerformance: {
        findMany: performanceFind,
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const service = new OutliersService(
      prisma as unknown as PrismaService,
      { authorize } as unknown as OutlierInputsService,
      {} as OutlierConfigurationService,
    );
    const result = await service.listLatestPerformances('org', {
      brandId: 'brand',
      platform: 'twitter',
      tier: 'outlier',
    });
    expect(result.docs[0]).toMatchObject({
      outlierRatio: 10,
      medianViews: 30000,
      sampleSize: 20,
      snapshotStatus: 'ready',
    });
    expect(performanceFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          isDeleted: false,
          outlierTier: { in: ['outlier', 'breakout'] },
        }),
        orderBy: [
          { outlierRatio: { sort: 'desc', nulls: 'last' } },
          { id: 'asc' },
        ],
      }),
    );
  });
  it('rejects a foreign-organization ranked list without reading performances', async () => {
    const authorize = vi.fn();
    const prisma = {
      brand: { findFirst: vi.fn().mockResolvedValue(null) },
      outlierBaselineSnapshot: { groupBy: vi.fn(), findFirst: vi.fn() },
      outlierPostPerformance: { findMany: vi.fn(), count: vi.fn() },
    };
    const service = new OutliersService(
      prisma as unknown as PrismaService,
      { authorize } as unknown as OutlierInputsService,
      {} as OutlierConfigurationService,
    );
    await expect(
      service.listLatestPerformances('org', { brandId: 'foreign' }),
    ).rejects.toThrow('not found');
    expect(prisma.outlierPostPerformance.findMany).not.toHaveBeenCalled();
  });
  it('reauthorizes historical account reads and never fetches measurements for deleted accounts', async () => {
    const h = readHarness();
    h.authorize.mockRejectedValueOnce(new Error('account deleted'));
    await expect(h.service.posts('org', 'snapshot')).rejects.toThrow(
      'account deleted',
    );
    expect(h.performanceFind).not.toHaveBeenCalled();
  });
  it('scopes measurements to the authorized snapshot with stable ordering', async () => {
    const h = readHarness();
    await h.service.posts('org', 'snapshot', 2, 10);
    expect(h.performanceFind).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        isDeleted: false,
        baselineSnapshotId: 'snapshot',
      },
      orderBy: { logicalPostId: 'asc' },
      skip: 10,
      take: 10,
    });
  });
});
