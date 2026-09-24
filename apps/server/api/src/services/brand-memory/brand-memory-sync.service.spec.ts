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
    contentPerformance.findFirst.mockResolvedValue({
      id: 'analytics-sync:source-1',
      measuredAt,
      createdAt: new Date(),
      likes: 20,
      comments: 3,
      shares: 2,
      saves: 1,
      engagementRate: 13,
      platform: 'instagram',
      contentType: 'image',
      data: { likes: 0, engagementRate: 0, clicks: 4 },
    });
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
        timestamp: measuredAt,
      }),
    );
    expect(memory.updateMetrics).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      expect.objectContaining({ totalEngagement: 30, avgEngagementRate: 13 }),
    );
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
          }),
        }),
      );
    },
  );

  it('does not turn missing recent evidence into a drop', async () => {
    contentPerformance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ engagementRate: 2 }]);
    await expect(
      service.detectThresholdAlerts('org-1', 'brand-1'),
    ).resolves.toEqual([]);
    expect(memory.addInsight).not.toHaveBeenCalled();
  });
});
