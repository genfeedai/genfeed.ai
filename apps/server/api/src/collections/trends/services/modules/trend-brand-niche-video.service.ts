import type { TrendingVideoDocument } from '@api/collections/trends/schemas/trending-video.schema';
import { CacheService } from '@api/services/cache/cache.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const BRAND_NICHE_VIDEOS_LIMIT = 30;
const BRAND_NICHE_CACHE_PREFIX = 'trends:brand-niche-videos';
// The scoped refresh runs twice a day; keep the snapshot across a missed run.
const BRAND_NICHE_TTL_SECONDS = 36 * 60 * 60;

/**
 * Videos found by searching a brand's own niche on TikTok, kept per
 * organization and brand. They are deliberately not written to the shared
 * trending-video table: that table has no tenant column and feeds the global
 * market view.
 */
@Injectable()
export class TrendBrandNicheVideoService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly cacheService: CacheService,
    private readonly apifyService: ApifyService,
  ) {}

  private cacheKey(organizationId: string, brandId: string): string {
    return this.cacheService.generateKey(
      BRAND_NICHE_CACHE_PREFIX,
      organizationId,
      brandId,
    );
  }

  async fetchAndCache(
    organizationId: string,
    brandId: string,
    queries: string[],
    limit: number = BRAND_NICHE_VIDEOS_LIMIT,
  ): Promise<number> {
    if (!organizationId || !brandId || queries.length === 0) {
      return 0;
    }

    const videos = await this.apifyService.searchTikTokByQueries(
      queries,
      { limit },
      { organizationId, origin: 'social-source' },
    );
    const expiresAt = new Date(Date.now() + BRAND_NICHE_TTL_SECONDS * 1000);
    const seen = new Set<string>();
    const stored: TrendingVideoDocument[] = [];
    for (const video of videos) {
      if (!video.externalId || seen.has(video.externalId)) continue;
      seen.add(video.externalId);
      stored.push({
        ...video,
        expiresAt,
        isCurrent: true,
        lastSeenAt: new Date(),
      } as unknown as TrendingVideoDocument);
    }

    // An empty result must not wipe the last good snapshot.
    if (stored.length === 0) {
      return 0;
    }
    const isCached = await this.cacheService.set(
      this.cacheKey(organizationId, brandId),
      stored,
      {
        tags: ['trends', 'videos', `videos:brand:${brandId}`],
        ttl: BRAND_NICHE_TTL_SECONDS,
      },
    );
    if (!isCached) {
      return 0;
    }
    this.loggerService.log(
      `Cached ${stored.length} niche videos for brand ${brandId}`,
    );
    return stored.length;
  }

  async get(
    organizationId: string,
    brandId: string,
  ): Promise<TrendingVideoDocument[]> {
    if (!organizationId || !brandId) return [];
    return (
      (await this.cacheService.get<TrendingVideoDocument[]>(
        this.cacheKey(organizationId, brandId),
      )) ?? []
    );
  }
}
