import { AdAggregationService } from '@api/services/ad-aggregation/ad-aggregation.service';

describe('AdAggregationService', () => {
  let service: AdAggregationService;
  let prisma: {
    $queryRaw: ReturnType<typeof vi.fn>;
    adPerformance: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prisma = {
      $queryRaw: vi.fn(),
      adPerformance: { findMany: vi.fn() },
    };

    service = new AdAggregationService(
      prisma as never,
      {
        log: vi.fn(),
      } as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes headline pattern benchmarks from SQL aggregate rows', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        category: 'benefit-focused',
        sampleSize: 5,
        sumCtr: 0.5,
        sumRoas: 15,
      },
    ]);

    const result = await service.computeTopHeadlines('retail');

    expect(prisma.adPerformance.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.sampleSize).toBe(5);
    expect(result.patterns).toContainEqual({
      avgCtr: 0.1,
      avgRoas: 3,
      category: 'benefit-focused',
      sampleSize: 5,
    });
    expect(result.patterns).toContainEqual({
      avgCtr: 0,
      avgRoas: 0,
      category: 'comparison',
      sampleSize: 0,
    });
  });

  it('computes CTA benchmarks from SQL aggregate rows', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        category: 'shop-now',
        sampleSize: 6,
        sumConversionRate: 0.3,
        sumCtr: 0.6,
      },
    ]);

    const result = await service.computeBestCtas('fashion');

    expect(prisma.adPerformance.findMany).not.toHaveBeenCalled();
    expect(result.sampleSize).toBe(6);
    expect(result.patterns).toContainEqual({
      avgConversionRate: 0.05,
      avgCtr: 0.1,
      category: 'shop-now',
      sampleSize: 6,
    });
    expect(result.patterns).toContainEqual({
      avgConversionRate: 0,
      avgCtr: 0,
      category: 'book-now',
      sampleSize: 0,
    });
  });

  it('computes optimal spend buckets from bounded SQL groups', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        range: '$50-200/day',
        sampleSize: 5,
        sumPerformanceScore: 400,
        sumRoas: 20,
      },
      {
        range: '$1000+/day',
        sampleSize: 5,
        sumPerformanceScore: 300,
        sumRoas: 10,
      },
    ]);

    const result = await service.computeOptimalSpend('meta', 'saas');

    expect(prisma.adPerformance.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      buckets: [
        {
          avgPerformanceScore: 80,
          avgRoas: 4,
          range: '$50-200/day',
          sampleSize: 5,
        },
        {
          avgPerformanceScore: 60,
          avgRoas: 2,
          range: '$1000+/day',
          sampleSize: 5,
        },
      ],
      sampleSize: 10,
    });
  });

  it('computes platform benchmarks without hydrating raw ad rows', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        avgKey: 'google',
        sampleSize: 5,
        sumCpa: 20,
        sumCpc: 10,
        sumCtr: 0.5,
        sumRoas: 15,
      },
      {
        avgKey: 'meta',
        sampleSize: 5,
        sumCpa: 25,
        sumCpc: 5,
        sumCtr: 1,
        sumRoas: 10,
      },
    ]);

    const result = await service.computePlatformBenchmarks('retail');

    expect(prisma.adPerformance.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      google: {
        avgCpa: 4,
        avgCpc: 2,
        avgCtr: 0.1,
        avgRoas: 3,
        sampleSize: 5,
      },
      meta: {
        avgCpa: 5,
        avgCpc: 1,
        avgCtr: 0.2,
        avgRoas: 2,
        sampleSize: 5,
      },
      sampleSize: 10,
      tiktok: {
        avgCpa: 0,
        avgCpc: 0,
        avgCtr: 0,
        avgRoas: 0,
        sampleSize: 0,
      },
    });
  });

  it('computes industry benchmarks from SQL groups ordered by sample size', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        avgKey: 'retail',
        sampleSize: 7,
        sumCpa: 28,
        sumCpc: 14,
        sumCtr: 0.7,
        sumRoas: 21,
      },
      {
        avgKey: 'beauty',
        sampleSize: 5,
        sumCpa: 10,
        sumCpc: 5,
        sumCtr: 0.25,
        sumRoas: 15,
      },
    ]);

    const result = await service.computeIndustryBenchmarks();

    expect(prisma.adPerformance.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      industries: [
        {
          avgCpa: 4,
          avgCpc: 2,
          avgCtr: 0.1,
          avgRoas: 3,
          industry: 'retail',
          sampleSize: 7,
        },
        {
          avgCpa: 2,
          avgCpc: 1,
          avgCtr: 0.05,
          avgRoas: 3,
          industry: 'beauty',
          sampleSize: 5,
        },
      ],
      sampleSize: 12,
    });
  });

  it('caches benchmark aggregates by metric and filters until the ttl expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          avgKey: 'meta',
          sampleSize: 5,
          sumCpa: 20,
          sumCpc: 10,
          sumCtr: 0.5,
          sumRoas: 15,
        },
      ])
      .mockResolvedValueOnce([
        {
          avgKey: 'google',
          sampleSize: 5,
          sumCpa: 10,
          sumCpc: 5,
          sumCtr: 0.25,
          sumRoas: 10,
        },
      ])
      .mockResolvedValueOnce([
        {
          avgKey: 'meta',
          sampleSize: 5,
          sumCpa: 30,
          sumCpc: 15,
          sumCtr: 0.75,
          sumRoas: 20,
        },
      ]);

    const first = await service.computePlatformBenchmarks('retail');
    const cached = await service.computePlatformBenchmarks('retail');
    const differentFilter = await service.computePlatformBenchmarks('saas');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(cached).toBe(first);
    expect(first.meta.avgCtr).toBe(0.1);
    expect(differentFilter.google.avgCtr).toBe(0.05);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    const refreshed = await service.computePlatformBenchmarks('retail');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    expect(refreshed).not.toBe(first);
    expect(refreshed.meta.avgCtr).toBe(0.15);
  });
});
