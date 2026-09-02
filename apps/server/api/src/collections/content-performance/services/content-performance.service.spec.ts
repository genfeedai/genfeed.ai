vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { CreateContentPerformanceDto } from '@api/collections/content-performance/dto/create-content-performance.dto';
import type { ManualInputDto } from '@api/collections/content-performance/dto/manual-input.dto';
import { PerformanceSource } from '@api/collections/content-performance/schemas/content-performance.schema';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('ContentPerformanceService persistence boundary', () => {
  const create = vi.fn();
  const findMany = vi.fn();
  const brandFindFirst = vi.fn();
  let service: ContentPerformanceService;

  beforeEach(() => {
    vi.clearAllMocks();

    create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        createdAt: new Date('2026-08-05T10:00:00.000Z'),
        id: 'performance-1',
        isDeleted: false,
        updatedAt: new Date('2026-08-05T10:00:00.000Z'),
        ...data,
      }),
    );
    brandFindFirst.mockResolvedValue({ id: 'brand-1' });

    service = new ContentPerformanceService(
      {
        brand: { findFirst: brandFindFirst },
        contentPerformance: { create, findMany },
        post: { findMany: vi.fn(), findFirst: vi.fn() },
      } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('persists canonical scalar and domain fields', async () => {
    const result = await service.createPerformance(
      {
        brandId: 'brand-1',
        clicks: 4,
        comments: 3,
        contentType: 'post',
        externalPostId: 'provider-post-1',
        hookUsed: 'Lead with proof',
        measuredAt: '2026-08-05T09:00:00.000Z',
        platform: 'instagram',
        postId: 'post-1',
        promptUsed: 'Write a proof-led launch post',
        views: 100,
      } as unknown as CreateContentPerformanceDto,
      'organization-1',
      'user-1',
    );

    const persisted = create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(persisted).toMatchObject({
      brandId: 'brand-1',
      comments: 3,
      contentType: 'post',
      data: {
        clicks: 4,
        hookUsed: 'Lead with proof',
        promptUsed: 'Write a proof-led launch post',
      },
      externalPostId: 'provider-post-1',
      organizationId: 'organization-1',
      platform: 'instagram',
      postId: 'post-1',
      userId: 'user-1',
      views: 100,
    });
    expect(result).toMatchObject({
      brandId: 'brand-1',
      clicks: 4,
      externalPostId: 'provider-post-1',
      organizationId: 'organization-1',
      postId: 'post-1',
      userId: 'user-1',
    });
  });

  it('applies the same canonical persistence mapping to bulk manual entries', async () => {
    await service.bulkManualImport(
      {
        brandId: 'brand-1',
        entries: [
          {
            clicks: 2,
            contentType: 'video',
            externalPostId: 'provider-video-1',
            measuredAt: '2026-08-05T09:00:00.000Z',
            platform: 'youtube',
            postId: 'post-1',
            views: 50,
          },
        ],
      } as unknown as ManualInputDto,
      'organization-1',
      'user-1',
    );

    const persisted = create.mock.calls[0]?.[0]?.data as Record<
      string,
      unknown
    >;
    expect(persisted).toMatchObject({
      brandId: 'brand-1',
      contentType: 'video',
      data: { clicks: 2 },
      externalPostId: 'provider-video-1',
      organizationId: 'organization-1',
      platform: 'youtube',
      postId: 'post-1',
      source: PerformanceSource.MANUAL,
      userId: 'user-1',
      views: 50,
    });
  });

  it('returns canonical scalar identity and generationId from reads', async () => {
    findMany.mockResolvedValue([
      {
        brandId: 'brand-1',
        comments: 2,
        data: {
          clicks: 5,
        },
        engagementRate: 10,
        generationId: 'generation-1',
        id: 'performance-1',
        organizationId: 'organization-1',
        performanceScore: 80,
        userId: 'user-1',
        views: 20,
      },
    ]);

    const records = await service.queryPerformance({}, 'organization-1');
    const aggregate = await service.aggregateByGenerationId(
      'organization-1',
      'generation-1',
    );

    expect(records[0]).toMatchObject({
      brandId: 'brand-1',
      clicks: 5,
      organizationId: 'organization-1',
      userId: 'user-1',
    });
    expect(aggregate).toMatchObject({
      generationId: 'generation-1',
      totalClicks: 5,
    });
  });
});
