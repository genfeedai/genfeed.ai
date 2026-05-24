import { ContentRunRecommendationsService } from '@api/collections/content-runs/services/content-run-recommendations.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdAt = new Date('2026-05-03T10:00:00.000Z');

const runConfig = {
  brief: {
    angle: 'AI workflow proof',
    hypothesis: 'Proof-led hooks beat generic AI claims',
  },
  skillSlug: 'trend-remix',
  variants: [
    {
      angle: 'Founder proof thread',
      format: 'post-thread',
      id: 'variant-a',
      metadata: {},
      platform: 'twitter',
      type: 'text',
    },
    {
      angle: 'Generic image',
      format: 'social-image-creative',
      id: 'variant-b',
      metadata: {},
      platform: 'instagram',
      type: 'image',
    },
  ],
};

describe('ContentRunRecommendationsService', () => {
  const contentRun = {
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const contentPerformance = {
    findMany: vi.fn(),
  };
  let service: ContentRunRecommendationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContentRunRecommendationsService({
      contentPerformance,
      contentRun,
    } as unknown as PrismaService);
  });

  it('scores run variants, persists a winner summary, and creates next actions', async () => {
    contentRun.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      config: runConfig,
      createdAt,
      id: 'run-1',
      organizationId: 'org-1',
      status: ContentRunStatus.COMPLETED,
    });
    contentPerformance.findMany.mockResolvedValue([
      {
        clicks: 12,
        comments: 30,
        contentRunId: 'run-1',
        engagementRate: 8.4,
        likes: 220,
        performanceScore: 88,
        platform: 'twitter',
        saves: 14,
        shares: 40,
        variantId: 'variant-a',
        views: 10_000,
      },
      {
        clicks: 1,
        comments: 2,
        contentRunId: 'run-1',
        engagementRate: 1.2,
        likes: 12,
        performanceScore: 25,
        platform: 'instagram',
        saves: 1,
        shares: 1,
        variantId: 'variant-b',
        views: 900,
      },
    ]);
    contentRun.update.mockImplementation(({ data }) =>
      Promise.resolve({
        brandId: 'brand-1',
        config: data.config,
        createdAt,
        id: 'run-1',
        organizationId: 'org-1',
        status: ContentRunStatus.COMPLETED,
      }),
    );

    const result = await service.analyzeRun('org-1', 'run-1');

    expect(result.analyticsSummary).toMatchObject({
      winningVariantId: 'variant-a',
      metadata: {
        sampleSize: 2,
      },
    });
    expect(result.scores[0]).toMatchObject({
      rank: 1,
      variantId: 'variant-a',
    });
    expect(result.recommendations.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        'extend_winner_format',
        'clone_hook_into_trend',
        'create_follow_up_from_engagement',
        'retire_low_performing_variants',
      ]),
    );
    expect(contentRun.update).toHaveBeenCalledWith({
      data: {
        config: expect.objectContaining({
          analyticsSummary: expect.objectContaining({
            winningVariantId: 'variant-a',
          }),
          recommendations: expect.arrayContaining([
            expect.objectContaining({
              metadata: expect.objectContaining({ variantId: 'variant-a' }),
              type: 'extend_winner_format',
            }),
          ]),
          variants: runConfig.variants,
        }),
      },
      where: { id: 'run-1' },
    });
    expect(result.updatedRun).toMatchObject({
      _id: 'run-1',
      analyticsSummary: expect.objectContaining({
        winningVariantId: 'variant-a',
      }),
      recommendations: expect.any(Array),
    });
  });

  it('persists a structured analytics collection recommendation when no rows exist', async () => {
    contentRun.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      config: runConfig,
      createdAt,
      id: 'run-1',
      organizationId: 'org-1',
      status: ContentRunStatus.COMPLETED,
    });
    contentPerformance.findMany.mockResolvedValue([]);
    contentRun.update.mockImplementation(({ data }) =>
      Promise.resolve({
        brandId: 'brand-1',
        config: data.config,
        createdAt,
        id: 'run-1',
        organizationId: 'org-1',
        status: ContentRunStatus.COMPLETED,
      }),
    );

    const result = await service.analyzeRun('org-1', 'run-1');

    expect(result.analyticsSummary).toMatchObject({
      summary: 'No variant performance has been synced for this run.',
    });
    expect(result.recommendations).toEqual([
      expect.objectContaining({
        metadata: { reason: 'missing_performance_rows' },
        type: 'collect_run_analytics',
      }),
    ]);
  });

  it('throws when the run is not scoped to the organization', async () => {
    contentRun.findFirst.mockResolvedValue(null);

    await expect(service.analyzeRun('org-1', 'missing')).rejects.toThrow(
      NotFoundException,
    );
    expect(contentPerformance.findMany).not.toHaveBeenCalled();
    expect(contentRun.update).not.toHaveBeenCalled();
  });
});
