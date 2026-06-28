import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type { TrendDocument } from '@api/collections/trends/schemas/trend.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/**
 * Owns trend read queries against Prisma and the curated bootstrap fallback.
 *
 * Extracted from TrendsService (issue #752). The previously near-duplicate
 * `findActiveTrends` / `findLastGoodTrends` helpers are unified behind a single
 * parameterized {@link queryTrendsByFilter}.
 */
@Injectable()
export class TrendQueryService {
  private readonly BOOTSTRAP_TRENDS = [
    {
      growthRate: 68,
      mentions: 42_000,
      metadata: {
        hashtags: ['#AIAgents', '#WorkflowAutomation'],
        sampleContent:
          'Creators are showing how AI agents turn recurring workflows into reusable content systems.',
        source: 'curated',
        sourcePreviewState: 'fallback',
        trendType: 'topic',
        urls: ['https://genfeed.ai/articles'],
      },
      platform: 'twitter',
      topic: 'AI agent workflow demos',
      viralityScore: 78,
    },
    {
      growthRate: 55,
      mentions: 31_000,
      metadata: {
        hashtags: ['#CreatorOps', '#ContentSystems'],
        sampleContent:
          'Teams are packaging trend research, briefs, reviews, and publishing into repeatable creator ops loops.',
        source: 'curated',
        sourcePreviewState: 'fallback',
        trendType: 'topic',
        urls: ['https://genfeed.ai/workflows'],
      },
      platform: 'linkedin',
      topic: 'Creator ops playbooks',
      viralityScore: 72,
    },
    {
      growthRate: 49,
      mentions: 27_500,
      metadata: {
        hashtags: ['#VideoRepurposing', '#ShortFormVideo'],
        sampleContent:
          'Short-form creators are remixing long-form clips into hooks, captions, and platform-native edits.',
        source: 'curated',
        sourcePreviewState: 'fallback',
        trendType: 'video',
        urls: ['https://genfeed.ai/studio'],
      },
      platform: 'youtube',
      topic: 'Clip remix systems',
      viralityScore: 69,
    },
    {
      growthRate: 61,
      mentions: 38_500,
      metadata: {
        hashtags: ['#CarouselDesign', '#CreatorStrategy'],
        sampleContent:
          'Instagram teams are turning dense strategy notes into swipeable carousel lessons and remixable Reel hooks.',
        source: 'curated',
        sourcePreviewState: 'fallback',
        trendType: 'topic',
        urls: ['https://genfeed.ai/studio'],
      },
      platform: 'instagram',
      topic: 'Carousel-to-Reel content systems',
      viralityScore: 74,
    },
    {
      growthRate: 64,
      mentions: 44_200,
      metadata: {
        hashtags: ['#TikTokTrends', '#AICreators'],
        sampleContent:
          'TikTok creators are testing fast before-and-after demos that show a manual content workflow becoming automated.',
        source: 'curated',
        sourcePreviewState: 'fallback',
        trendType: 'video',
        urls: ['https://genfeed.ai/workflows'],
      },
      platform: 'tiktok',
      topic: 'Automation before-and-after demos',
      viralityScore: 76,
    },
    {
      growthRate: 42,
      mentions: 18_700,
      metadata: {
        hashtags: ['#CreatorTools', '#SaaS'],
        sampleContent:
          'Reddit discussions are comparing lightweight creator stacks for briefs, assets, scheduling, and analytics.',
        source: 'curated',
        sourcePreviewState: 'fallback',
        trendType: 'topic',
        urls: ['https://genfeed.ai/articles'],
      },
      platform: 'reddit',
      topic: 'Lean creator stack comparisons',
      viralityScore: 63,
    },
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find current (active) trends for a tenant/platform scope, sorted by
   * virality.
   */
  findActiveTrends(filter: {
    organizationId: string | null;
    brandId: string | null;
    platform?: string;
  }): Promise<TrendEntity[]> {
    return this.queryTrendsByFilter(filter, { activeOnly: true });
  }

  /**
   * Find the most recent good trends regardless of expiry, used as a
   * last-good fallback when no active trends exist.
   */
  findLastGoodTrends(filter: {
    organizationId: string | null;
    brandId: string | null;
    platform?: string;
  }): Promise<TrendEntity[]> {
    return this.queryTrendsByFilter(filter, { activeOnly: false });
  }

  /**
   * Get a single trend by ID, scoped to the organization or global trends.
   */
  async getTrendById(
    trendId: string,
    organizationId?: string,
  ): Promise<TrendEntity | null> {
    const doc = await this.prisma.trend.findFirst({
      where: {
        id: trendId,
        isDeleted: false,
        ...(organizationId
          ? { OR: [{ organizationId }, { organizationId: null }] }
          : { organizationId: null }),
      },
    });

    if (!doc) {
      return null;
    }

    // If organizationId provided, trend must belong to that org or be global
    if (organizationId) {
      const docOrgId = (doc as unknown as Record<string, unknown>)
        .organizationId;
      if (docOrgId !== organizationId && docOrgId !== null) {
        return null;
      }
    }

    return this.toTrendEntity(doc);
  }

  /**
   * Curated bootstrap trends used as a final fallback when no data is cached.
   */
  getBootstrapTrends(platform?: string): TrendEntity[] {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    return this.BOOTSTRAP_TRENDS.filter(
      (trend) => !platform || trend.platform === platform,
    ).map((trend, index) => {
      const id = `bootstrap-trend-${trend.platform}-${index + 1}`;
      const metadata = {
        ...trend.metadata,
        sourcePreviewCache: [
          {
            contentType:
              trend.platform === 'twitter'
                ? 'tweet'
                : trend.metadata.trendType === 'video'
                  ? 'video'
                  : 'post',
            id: `${id}-fallback-1`,
            platform: trend.platform,
            sourceUrl: trend.metadata.urls[0],
            text: trend.metadata.sampleContent,
            title: trend.topic,
          },
        ],
        sourcePreviewCachedAt: now.toISOString(),
      };

      return new TrendEntity({
        brandId: null,
        createdAt: now,
        data: {
          ...trend,
          expiresAt,
          isCurrent: true,
          isDeleted: false,
          metadata,
          requiresAuth: false,
        },
        expiresAt,
        growthRate: trend.growthRate,
        id,
        isCurrent: true,
        isDeleted: false,
        mentions: trend.mentions,
        metadata,
        organizationId: null,
        platform: trend.platform,
        requiresAuth: false,
        topic: trend.topic,
        updatedAt: now,
        viralityScore: trend.viralityScore,
      } as never);
    });
  }

  /**
   * Hydrate a Prisma trend document (with its nested `data` blob) into a
   * flattened TrendEntity.
   */
  toTrendEntity(
    doc: {
      data: unknown;
    } & Record<string, unknown>,
  ): TrendEntity {
    return new TrendEntity({
      ...doc,
      ...(doc.data as Record<string, unknown>),
    } as unknown as TrendDocument);
  }

  private async queryTrendsByFilter(
    filter: {
      organizationId: string | null;
      brandId: string | null;
      platform?: string;
    },
    options: { activeOnly: boolean },
  ): Promise<TrendEntity[]> {
    const now = new Date();
    const docs = await this.prisma.trend.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      where: {
        brandId: filter.brandId,
        isDeleted: false,
        organizationId: filter.organizationId,
      },
    });

    return docs
      .filter((doc) => {
        const d = doc.data as unknown as Record<string, unknown>;
        if (options.activeOnly) {
          if (d.isCurrent !== true) return false;
          if (d.expiresAt && new Date(d.expiresAt as string) <= now) {
            return false;
          }
        }
        if (filter.platform && d.platform !== filter.platform) return false;
        return true;
      })
      .sort((a, b) => {
        const ad = a.data as unknown as Record<string, number>;
        const bd = b.data as unknown as Record<string, number>;
        const viralityDelta = (bd.viralityScore ?? 0) - (ad.viralityScore ?? 0);
        if (options.activeOnly) {
          return viralityDelta;
        }
        return (
          viralityDelta ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      })
      .slice(0, 50)
      .map((doc) => this.toTrendEntity(doc));
  }
}
