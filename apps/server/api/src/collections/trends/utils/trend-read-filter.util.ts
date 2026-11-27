/**
 * The Market view is the shared chart every account reads, so a topic seen once
 * or twice (a generic hashtag on one post) is noise there, not a trend. Brand
 * discovery keeps its own niche matching and is not cut by this floor.
 */
export const MARKET_MIN_TREND_MENTIONS = 5;

interface TrendReadShape {
  expiresAt?: Date | string | null;
  isCurrent?: boolean | null;
  mentions?: number | null;
}

/** Market view: the shared chart keeps topics with enough mentions. */
export function hasEnoughMarketMentions(trend: TrendReadShape): boolean {
  return (trend.mentions ?? 0) >= MARKET_MIN_TREND_MENTIONS;
}

/** Brand view: only trends still current and not past their expiry. */
export function isLiveTrend(trend: TrendReadShape): boolean {
  return (
    trend.isCurrent !== false &&
    (!trend.expiresAt || new Date(trend.expiresAt).getTime() > Date.now())
  );
}
