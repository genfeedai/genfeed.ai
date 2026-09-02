import { isSourcePostVariationPlatform } from '@utils/url/desktop-loop-url.util';

/**
 * Platforms with a durable source reference that can open the prefilled
 * Discovery remix surface directly, for both trend-content items and
 * source-post (Following) items — the single source of truth previously
 * duplicated between `TrendContentCard` and `following-page.tsx`.
 */
export const PREFILLED_REMIX_PLATFORMS = new Set([
  'instagram',
  'tiktok',
  'youtube',
]);

export interface RemixAvailability {
  /** True when the item can open the prefilled Discovery remix surface. */
  opensPrefilledRemix: boolean;
  /** True when the item falls back to the legacy `/publishing/remix` link. */
  opensLegacyRemix: boolean;
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
  const opensLegacyRemix =
    hasDurableSourceReference &&
    isSourcePostVariationPlatform(platform) &&
    !opensPrefilledRemix;
  const isRemixUnavailable =
    isPrefilledRemixPlatform &&
    hasDurableSourceReference &&
    !hasRemixSurface &&
    !opensLegacyRemix;

  return { isRemixUnavailable, opensLegacyRemix, opensPrefilledRemix };
}

/**
 * Source-post platforms (Social Sources feed / Following) always carry a
 * durable id, so the only gate is prefilled-platform + an active remix
 * surface; otherwise the caller falls back to `/publishing/remix`.
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
