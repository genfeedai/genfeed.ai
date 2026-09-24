import { normalizeMetaAdLibraryRecord } from './meta-ad-library';
import { resolvePaidCreativeType } from './paid-creative';
import type { NormalizedPaidCreativeRecord } from './types';

export function archiveObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(...values: unknown[]): string | undefined {
  for (const value of values)
    if (
      (typeof value === 'string' && value.trim()) ||
      (typeof value === 'number' && Number.isFinite(value))
    )
      return String(value);
  return undefined;
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function strings(value: unknown): string[] {
  return list(value)
    .map((value) => text(value))
    .filter((value): value is string => Boolean(value));
}
function number(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : undefined;
}
function date(value: unknown, scale = 1): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  const parsed = new Date(
    Number.isFinite(numeric) ? numeric * scale : String(value),
  );
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
function safeUrls(values: unknown[]): string[] {
  return [
    ...new Set(
      values.flatMap((value) => {
        const candidate = text(value);
        if (!candidate) return [];
        try {
          const url = new URL(candidate);
          return ['https:', 'http:'].includes(url.protocol)
            ? [url.toString()]
            : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
}

/** Wire fixtures: https://apify.com/apify/facebook-ads-scraper */
export function normalizeMetaArchiveRecord(
  value: unknown,
  _countries?: string[],
): NormalizedPaidCreativeRecord | undefined {
  const row = archiveObject(value),
    snapshot = archiveObject(row.snapshot);
  const id = text(row.adArchiveID, row.adArchiveId, row.ad_archive_id);
  if (!id) return undefined;
  const cards = list(snapshot.cards).map(archiveObject);
  const images = list(snapshot.images ?? row.images).map(archiveObject);
  const videos = list(snapshot.videos).map(archiveObject);
  const media = safeUrls(
    [...videos, ...cards]
      .flatMap((v) => [
        v.videoHdUrl ?? v.video_hd_url ?? v.videoSdUrl ?? v.video_sd_url,
      ])
      .concat(
        [...images, ...cards].map(
          (v) =>
            v.originalImageUrl ??
            v.original_image_url ??
            v.resizedImageUrl ??
            v.resized_image_url,
        ),
      ),
  );
  const active = row.isActive ?? row.is_active;
  const normalized = normalizeMetaAdLibraryRecord({
    adArchiveId: id,
    adFormat: text(
      snapshot.displayFormat,
      snapshot.display_format,
      row.display_format,
    ),
    bodyText: text(
      archiveObject(snapshot.body).text,
      strings(row.ad_creative_bodies)[0],
    ),
    creativeMediaUrls: media,
    ctaText: text(snapshot.ctaText, snapshot.cta_text),
    endDate: date(row.endDateFormatted ?? row.ad_delivery_stop_time),
    headlineText: text(snapshot.title, strings(row.ad_creative_link_titles)[0]),
    isActive: typeof active === 'boolean' ? active : undefined,
    landingPageUrl: safeUrls([
      snapshot.linkUrl ??
        snapshot.link_url ??
        row.link_url ??
        cards[0]?.linkUrl,
    ])[0],
    pageId: text(row.pageID, row.pageId, row.page_id),
    pageName: text(
      snapshot.pageName,
      snapshot.page_name,
      row.pageName,
      row.page_name,
    ),
    publisherPlatforms: strings(
      row.publisherPlatform ?? row.publisher_platforms,
    ),
    reachEstimateMax: number(
      row.euTotalReach ?? row.eu_total_reach ?? row.total_reach,
    ),
    reachEstimateMin: number(
      row.euTotalReach ?? row.eu_total_reach ?? row.total_reach,
    ),
    startDate: date(row.startDateFormatted ?? row.ad_delivery_start_time),
    targetingCountries: list(
      row.targetLocations ?? row.target_locations,
    ).flatMap((location) => {
      const code = text(
        archiveObject(location).code,
        archiveObject(location).name,
        location,
      );
      return code ? [code] : [];
    }),
  });
  normalized.imageUrls = safeUrls(
    [...images, ...cards].map(
      (v) =>
        v.originalImageUrl ??
        v.original_image_url ??
        v.resizedImageUrl ??
        v.resized_image_url,
    ),
  );
  normalized.videoUrls = safeUrls(
    [...videos, ...cards].map(
      (v) => v.videoHdUrl ?? v.video_hd_url ?? v.videoSdUrl ?? v.video_sd_url,
    ),
  );
  normalized.archiveUrl = `https://www.facebook.com/ads/library/?id=${encodeURIComponent(id)}`;
  normalized.advertiserHandle = normalized.externalAccountId || undefined;
  normalized.fundingEntity = text(row.fundingEntity, row.funding_entity);
  return normalized;
}

/** Wire fixtures: https://apify.com/lexis-solutions/tiktok-ads-scraper */
export function normalizeTikTokAdsLibraryRecord(
  value: unknown,
): NormalizedPaidCreativeRecord | undefined {
  const row = archiveObject(value),
    id = text(row.adId);
  if (!id) return undefined;
  const media = safeUrls([
    row.adVideoUrl,
    ...list(row.adImageUrls),
    row.adVideoCover,
  ]);
  const format = (
    { 1: 'text', 2: 'video', 3: 'image' } as Record<string, string>
  )[String(row.adType)];
  return {
    adFormat: format,
    archiveUrl: `https://library.tiktok.com/ads/detail/${encodeURIComponent(id)}`,
    imageUrls: safeUrls([...list(row.adImageUrls), row.adVideoCover]),
    videoUrls: safeUrls([row.adVideoUrl]),
    advertiserHandle: text(
      archiveObject(row.advertiserTtUserId).username,
      row.advertiserId,
    ),
    advertiserName: text(row.advertiserName),
    bodyText: text(row.adTitle),
    creativeContent: text(row.adTitle),
    creativeMediaUrls: media,
    creativeType: resolvePaidCreativeType(media, format),
    dataConfidence: 0.3,
    date: date(row.adStartDate) ?? '',
    externalAccountId: text(row.advertiserId) ?? '',
    externalAdId: id,
    fundingEntity: text(row.advertiserPaidForBy),
    granularity: 'ad',
    landingPageUrl: safeUrls([row.adLandingUrl])[0],
    performanceScore: null,
    platform: 'tiktok',
    presentationStartDate: date(row.adStartDate),
    presentationEndDate: date(row.adEndDate),
    targetingCountries: list(row.targetingByLocation)
      .map((item) => text(archiveObject(item).region))
      .filter((item): item is string => Boolean(item)),
    usagePolicy: 'remix_allowed',
  };
}

/** Wire fixtures: https://apify.com/lexis-solutions/google-ads-scraper */
export function normalizeGoogleAdsTransparencyRecord(
  value: unknown,
): NormalizedPaidCreativeRecord | undefined {
  const row = archiveObject(value),
    id = text(row.creativeId, row.id);
  if (!id) return undefined;
  const countries = list(row.countryStats).map(archiveObject);
  const variants = list(row.variants).map(archiveObject);
  const media = safeUrls([
    row.previewUrl,
    ...variants.flatMap((variant) => list(variant.images)),
  ]);
  const format = text(row.format);
  return {
    adFormat: format,
    archiveUrl: safeUrls([row.url])[0],
    imageUrls: media,
    videoUrls: [],
    bodyText: text(...variants.map((variant) => variant.textContent)),
    creativeContent: text(...variants.map((variant) => variant.textContent)),
    advertiserHandle: text(row.advertiserId),
    advertiserName: text(row.advertiserName),
    creativeMediaUrls: media,
    creativeType: resolvePaidCreativeType(media, format),
    dataConfidence: 0.3,
    date: date(row.firstShownAt, 1000) ?? '',
    externalAccountId: text(row.advertiserId) ?? '',
    externalAdId: id,
    granularity: 'ad',
    performanceScore: null,
    platform: 'google-ads',
    presentationStartDate: date(row.firstShownAt, 1000),
    presentationEndDate: date(row.lastShownAt, 1000),
    targetingCountries: [
      ...new Set([
        ...strings(row.shownCountries),
        ...countries.flatMap((item) =>
          text(item.code) ? [String(item.code)] : [],
        ),
      ]),
    ],
    targetingCriteria: [
      ...new Set(
        countries.flatMap((item) =>
          list(item.platformStats).flatMap((surface) =>
            text(archiveObject(surface).code)
              ? [String(archiveObject(surface).code)]
              : [],
          ),
        ),
      ),
    ],
    usagePolicy: 'remix_allowed',
  };
}

export const TIKTOK_AD_LIBRARY_COUNTRIES =
  'FR AT BE BG HR CY CZ DK EE FI DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH GB'.split(
    ' ',
  );

export function normalizeGoogleAdvertiserQuery(query: string): string | null {
  const value = query.trim();
  if (/^AR\d+$/i.test(value)) return value.toUpperCase();
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const host = url.hostname.toLowerCase();
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)
      ? host
      : null;
  } catch {
    return null;
  }
}
