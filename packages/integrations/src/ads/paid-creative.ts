import type {
  NormalizedAdPlatform,
  PaidCreativePlatform,
  PaidCreativeProvider,
  PaidCreativeType,
  PaidCreativeUsagePolicy,
} from './types';

/**
 * Every `AdPerformance.researchSource` value produced by competitor
 * transparency ingestion. Rows carrying one of these are tenant-owned
 * research snapshots and must never leak into the global public pool.
 */
export const PAID_CREATIVE_RESEARCH_SOURCES = [
  'google_ads_transparency_center',
  'manual_paid_reference',
  'meta_ads_library',
  'tiktok_creative_center',
  'x_ads_repository',
] as const satisfies readonly PaidCreativeProvider[];

/** Every platform whose paid creatives can be watched in the shared pool. */
export const PAID_CREATIVE_PLATFORMS = [
  'google',
  'meta',
  'tiktok',
  'x',
  'youtube',
] as const satisfies readonly PaidCreativePlatform[];

const PROVIDER_BY_PLATFORM = {
  google: 'google_ads_transparency_center',
  meta: 'meta_ads_library',
  tiktok: 'tiktok_creative_center',
  x: 'x_ads_repository',
  // YouTube video ads are Google Ads creatives; the Google Ads Transparency
  // Center is their only public archive.
  youtube: 'google_ads_transparency_center',
} as const satisfies Record<PaidCreativePlatform, PaidCreativeProvider>;

const AD_PLATFORM_BY_PROVIDER = {
  google_ads_transparency_center: 'google-ads',
  manual_paid_reference: 'meta',
  meta_ads_library: 'meta',
  tiktok_creative_center: 'tiktok',
  x_ads_repository: 'x_ads',
} as const satisfies Record<PaidCreativeProvider, NormalizedAdPlatform>;

const SOURCE_LABEL_BY_PROVIDER = {
  google_ads_transparency_center: 'Google Ads Transparency Center',
  manual_paid_reference: 'Manual paid reference',
  meta_ads_library: 'Meta Ad Library',
  tiktok_creative_center: 'TikTok Creative Center',
  x_ads_repository: 'X Ads Repository disclosure',
} as const satisfies Record<PaidCreativeProvider, string>;

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m3u8', '.webm'];

export function isPaidCreativeResearchSource(
  value: string | null | undefined,
): value is PaidCreativeProvider {
  return (
    value !== null &&
    value !== undefined &&
    (PAID_CREATIVE_RESEARCH_SOURCES as readonly string[]).includes(value)
  );
}

export function resolvePaidCreativeProvider(
  platform: PaidCreativePlatform,
): PaidCreativeProvider {
  return PROVIDER_BY_PLATFORM[platform];
}

export function resolvePaidCreativeAdPlatform(
  provider: PaidCreativeProvider,
): NormalizedAdPlatform {
  return AD_PLATFORM_BY_PROVIDER[provider];
}

export function resolvePaidCreativeSourceLabel(
  provider: PaidCreativeProvider,
): string {
  return SOURCE_LABEL_BY_PROVIDER[provider];
}

/**
 * The X DSA repository discloses ads run by named advertisers for regulatory
 * transparency; reusing that creative as remix input is not what the archive
 * is published for. Every other archive publishes creatives as public
 * marketing inspiration, so they stay remixable.
 */
export function resolvePaidCreativeUsagePolicy(
  provider: PaidCreativeProvider,
): PaidCreativeUsagePolicy {
  return provider === 'x_ads_repository' ? 'disclosure_only' : 'remix_allowed';
}

function isVideoUrl(url: string): boolean {
  const path = url.toLowerCase().split('?')[0];

  return VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension));
}

/**
 * Split a creative's media into the image and video buckets `AdPerformance`
 * stores separately. A URL whose extension does not identify it as video is
 * treated as an image, because that is how every archive's still assets
 * appear — the alternative, dropping it, would silently lose the creative.
 */
export function partitionPaidCreativeMediaUrls(
  creativeMediaUrls: string[] | undefined,
): { imageUrls: string[]; videoUrls: string[] } {
  const urls = creativeMediaUrls ?? [];

  return {
    imageUrls: urls.filter((url) => !isVideoUrl(url)),
    videoUrls: urls.filter(isVideoUrl),
  };
}

export function resolvePaidCreativeType(
  creativeMediaUrls: string[] | undefined,
  adFormat?: string,
): PaidCreativeType {
  const normalizedFormat = adFormat?.toLowerCase() ?? '';

  if (normalizedFormat.includes('carousel')) {
    return 'carousel';
  }

  if (normalizedFormat.includes('video')) {
    return 'video';
  }

  if (creativeMediaUrls === undefined || creativeMediaUrls.length === 0) {
    return normalizedFormat.length > 0 ? 'unknown' : 'text';
  }

  if (creativeMediaUrls.some(isVideoUrl)) {
    return 'video';
  }

  return creativeMediaUrls.length > 1 ? 'carousel' : 'image';
}

/**
 * Advertiser-handle shape per platform. X caps usernames at 15 characters and
 * allows only underscores; TikTok allows dots; Meta page slugs and Google
 * advertiser identifiers are longer and may contain hyphens. Every pattern is
 * a subset of the `ad_watched_advertisers_handle_check` database constraint,
 * so a handle that normalizes here is always storable.
 */
const HANDLE_PATTERN_BY_PLATFORM = {
  google: /^[a-z0-9._-]{1,64}$/,
  meta: /^[a-z0-9._-]{1,64}$/,
  tiktok: /^[a-z0-9._]{1,24}$/,
  x: /^[a-z0-9_]{1,15}$/,
  youtube: /^[a-z0-9._-]{1,64}$/,
} as const satisfies Record<PaidCreativePlatform, RegExp>;

export function isPaidCreativePlatform(
  value: string | null | undefined,
): value is PaidCreativePlatform {
  return (
    value !== null &&
    value !== undefined &&
    (PAID_CREATIVE_PLATFORMS as readonly string[]).includes(value)
  );
}

/**
 * Returns the canonical stored handle, or `null` when the input cannot be a
 * handle on that platform. Callers own the error type — this stays free of
 * any HTTP or framework dependency.
 */
export function normalizeAdvertiserHandle(
  platform: PaidCreativePlatform,
  value: string,
): string | null {
  const normalized = value.trim().replace(/^@/, '').toLowerCase();

  return HANDLE_PATTERN_BY_PLATFORM[platform].test(normalized)
    ? normalized
    : null;
}
