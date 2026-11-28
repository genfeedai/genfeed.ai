/**
 * The Market view is the shared chart every account reads, so a topic seen once
 * or twice (a generic hashtag on one post) is noise there, not a trend. Brand
 * discovery keeps its own niche matching and is not cut by this floor.
 */
export const MARKET_MIN_TREND_MENTIONS = 5;

/**
 * Tags every account uses, so they say nothing about what is trending. They are
 * kept out of the Market view whatever their count; a niche match in a brand's
 * own view is not affected.
 */
const GENERIC_MARKET_TOPICS: ReadonlySet<string> = new Set([
  'explore',
  'explorepage',
  'follow',
  'foryou',
  'foryoupage',
  'fyp',
  'funny',
  'instadaily',
  'instagood',
  'instagram',
  'like',
  'likeforlike',
  'love',
  'photooftheday',
  'reel',
  'reels',
  'trending',
  'viral',
]);

const LEADING_HASHES_PATTERN = /^#+/;

interface TrendReadShape {
  expiresAt?: Date | string | null;
  isCurrent?: boolean | null;
  mentions?: number | null;
  platform?: string | null;
  topic?: string | null;
}

function normalizeTopic(topic: string | null | undefined): string {
  return (topic ?? '').trim().replace(LEADING_HASHES_PATTERN, '').toLowerCase();
}

/**
 * Market view: the shared chart keeps topics with enough mentions that are not
 * a tag everyone uses, and lists a topic once per platform.
 */
export function keepMarketTrends<T extends TrendReadShape>(
  trends: readonly T[],
): T[] {
  const seen = new Set<string>();
  return trends.filter((trend) => {
    const topic = normalizeTopic(trend.topic);
    const key = `${trend.platform ?? ''}:${topic}`;
    if (
      (trend.mentions ?? 0) < MARKET_MIN_TREND_MENTIONS ||
      GENERIC_MARKET_TOPICS.has(topic) ||
      seen.has(key)
    ) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Brand view: only trends still current and not past their expiry. */
export function isLiveTrend(trend: TrendReadShape): boolean {
  return (
    trend.isCurrent !== false &&
    (!trend.expiresAt || new Date(trend.expiresAt).getTime() > Date.now())
  );
}
