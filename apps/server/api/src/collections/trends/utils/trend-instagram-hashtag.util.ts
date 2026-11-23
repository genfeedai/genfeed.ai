import type { TrendData } from '@api/collections/trends/interfaces/trend.interfaces';
import { INSTAGRAM_HASHTAG_SEARCH_PROVIDER } from '@api/collections/trends/services/modules/trend-source.constants';
import type { InstagramHashtagSearchService } from '@api/services/integrations/instagram/services/instagram-hashtag-search.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { InstagramHashtagMedia } from '@genfeedai/contracts/interfaces';
import { traced } from '@libs/tracing/traced';

/** Hashtags and keywords a brand may offer the hashtag search per refresh. */
const INSTAGRAM_TRACKED_HASHTAG_CANDIDATES = 10;

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.trim().length > 0,
      )
    : [];
}

/**
 * The hashtags a brand has chosen to track, then its trend keywords as
 * hashtags: the niche, in the order the brand set it. The search service
 * decides how many the week's budget affords.
 */
const readTrackedInstagramHashtags = traced(
  'readTrackedInstagramHashtags',
  async (
    prisma: PrismaService,
    organizationId: string,
    brandId: string,
  ): Promise<string[]> => {
    const preferences = await prisma.trendPreferences.findFirst({
      select: { config: true },
      where: { brandId, organizationId, isDeleted: false },
    });
    const config = preferences?.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return [];
    }

    return [
      ...readStrings(config.hashtags),
      ...readStrings(config.keywords),
    ].slice(0, INSTAGRAM_TRACKED_HASHTAG_CANDIDATES);
  },
);

/** One trend per hashtag; its media is the stored source preview, so no scraper is asked for it. */
function toInstagramHashtagTrends(
  results: InstagramHashtagMedia[],
): TrendData[] {
  const cachedAt = new Date().toISOString();
  return results
    .filter((result) => result.items.length > 0)
    .map(({ hashtag, items }) => ({
      growthRate: 0,
      mentions: items.reduce(
        (total, item) => total + item.likeCount + item.commentsCount,
        0,
      ),
      metadata: {
        provider: INSTAGRAM_HASHTAG_SEARCH_PROVIDER,
        source: 'native-api',
        sourcePreviewCache: items.map((item) => ({
          contentType: item.mediaType === 'VIDEO' ? 'video' : 'image',
          id: item.id,
          // `media_url` is absent for albums and some reels: the preview
          // then rests on the permalink alone.
          ...(item.mediaUrl ? { mediaUrl: item.mediaUrl } : {}),
          metrics: { comments: item.commentsCount, likes: item.likeCount },
          platform: 'instagram',
          publishedAt: item.timestamp,
          sourceUrl: item.permalink,
          text: item.caption,
          ...(item.mediaUrl && item.mediaType !== 'VIDEO'
            ? { thumbnailUrl: item.mediaUrl }
            : {}),
        })),
        sourcePreviewCachedAt: cachedAt,
        sourcePreviewState: 'live',
        trendType: 'hashtag',
      },
      platform: 'instagram',
      topic: `#${hashtag}`,
    }));
}

/**
 * The trends for a brand's tracked hashtags, or null when it tracks none (the
 * caller then reads the account's own posts). A refusal from the search
 * propagates: refresh health classifies it.
 */
export const fetchInstagramHashtagTrends = traced(
  'fetchInstagramHashtagTrends',
  async (
    prisma: PrismaService,
    search: InstagramHashtagSearchService,
    organizationId: string,
    brandId: string,
  ): Promise<TrendData[] | null> => {
    const hashtags = await readTrackedInstagramHashtags(
      prisma,
      organizationId,
      brandId,
    );
    if (hashtags.length === 0) return null;

    return toInstagramHashtagTrends(
      await search.readTopMedia(organizationId, brandId, hashtags),
    );
  },
);
