import { isSourcePostVariationPlatform } from '@utils/url/desktop-loop-url.util';

/**
 * Platforms that open the Discovery remix brief (brand remix run).
 * `twitter`/`x` remix as copy on that same surface — not a separate page.
 */
export const PREFILLED_REMIX_PLATFORMS = new Set([
  'instagram',
  'tiktok',
  'twitter',
  'x',
  'youtube',
]);

export interface RemixAvailability {
  /** True when the item can open the prefilled Discovery remix surface. */
  opensPrefilledRemix: boolean;
  /** True when the item opens `/publishing/remix` (no Discovery surface). */
  opensRemixPage: boolean;
  /** True when neither remix path is reachable for this item. */
  isRemixUnavailable: boolean;
}

/**
 * Single source of truth for whether a trend-content item can be remixed, and
 * through which surface. Ported out of `TrendContentCard` so the Discovery
 * Desk's item adapters and row actions make the identical decision.
 */
export function getTrendRemixAvailability(
  platform: string,
  hasDurableSourceReference: boolean,
  hasRemixSurface: boolean,
): RemixAvailability {
  const isPrefilledRemixPlatform = PREFILLED_REMIX_PLATFORMS.has(platform);
  const opensPrefilledRemix =
    isPrefilledRemixPlatform && hasDurableSourceReference && hasRemixSurface;
  const opensRemixPage =
    hasDurableSourceReference &&
    isSourcePostVariationPlatform(platform) &&
    !opensPrefilledRemix;
  const isRemixUnavailable =
    isPrefilledRemixPlatform &&
    hasDurableSourceReference &&
    !hasRemixSurface &&
    !opensRemixPage;

  return { isRemixUnavailable, opensPrefilledRemix, opensRemixPage };
}

/**
 * Following source-posts always carry a durable id. Discovery remix is the
 * first-class path when the platform is in {@link PREFILLED_REMIX_PLATFORMS}.
 */
export function getSourcePostRemixAvailability(
  platform: string,
  hasRemixSurface: boolean,
): { opensPrefilledRemix: boolean } {
  return {
    opensPrefilledRemix:
      PREFILLED_REMIX_PLATFORMS.has(platform) && hasRemixSurface,
  };
}
