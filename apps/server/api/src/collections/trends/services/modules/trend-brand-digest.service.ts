import type { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type { TrendingVideoDocument } from '@api/collections/trends/schemas/trending-video.schema';
import { TrendSourcePreviewService } from '@api/collections/trends/services/modules/trend-source-preview.service';
import { matchedNicheTerms } from '@api/collections/trends/utils/brand-niche.util';
import type { TrendDigestSourcePost } from '@genfeedai/helpers';
import { Injectable } from '@nestjs/common';

export interface BrandDigestTopic {
  matchedTerms: string[];
  mentions: number;
  platform: string;
  posts: TrendDigestSourcePost[];
  topic: string;
  url?: string;
  viralityScore: number;
}

export type BrandDigestVideo = TrendingVideoDocument & {
  matchedTerms: string[];
};

export interface BrandDigestSources {
  brand: { description?: string; id: string; label: string };
  topics: BrandDigestTopic[];
  videos: BrandDigestVideo[];
}

/** Topics read from the corpus per digest before the score gate and the cap. */
const DIGEST_TOPIC_POOL = 20;

/**
 * Shapes the brand-niche videos and topics the daily digest is built from:
 * which niche terms each one matched, and the stored source posts (X,
 * LinkedIn...) shown as cards. Reads stored previews only, never a live fetch.
 */
@Injectable()
export class TrendBrandDigestService {
  constructor(
    private readonly trendSourcePreviewService: TrendSourcePreviewService,
  ) {}

  async buildTopics(
    trends: TrendEntity[],
    queries: string[],
    organizationId: string,
  ): Promise<BrandDigestTopic[]> {
    return Promise.all(
      [...trends]
        .sort((a, b) => b.viralityScore - a.viralityScore)
        .slice(0, DIGEST_TOPIC_POOL)
        .map(async (trend) => {
          const discovery =
            await this.trendSourcePreviewService.buildTrendDiscoveryItem(
              trend,
              organizationId,
            );
          return {
            matchedTerms: matchedNicheTerms(
              { hashtags: trend.metadata?.hashtags, title: trend.topic },
              queries,
            ),
            mentions: trend.mentions,
            platform: trend.platform,
            posts: discovery.sourcePreview
              .filter(
                (item) =>
                  item.contentType !== 'video' && Boolean(item.sourceUrl),
              )
              .map((item) => ({
                authorHandle: item.authorHandle,
                likes: item.metrics?.likes,
                platform: item.platform,
                text: item.text ?? item.title,
                url: item.sourceUrl,
                views: item.metrics?.views,
              })),
            topic: trend.topic,
            url: trend.metadata?.videoUrl ?? trend.metadata?.urls?.[0],
            viralityScore: trend.viralityScore,
          };
        }),
    );
  }

  tagVideos(
    videos: TrendingVideoDocument[],
    queries: string[],
  ): BrandDigestVideo[] {
    return videos.map((video) => {
      const matched = matchedNicheTerms(video, queries);
      const nicheQuery =
        typeof video.nicheQuery === 'string' ? video.nicheQuery : undefined;
      return {
        ...video,
        matchedTerms:
          matched.length > 0 ? matched : nicheQuery ? [nicheQuery] : [],
      };
    });
  }
}
