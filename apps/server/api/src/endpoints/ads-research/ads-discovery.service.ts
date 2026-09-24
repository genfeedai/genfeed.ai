import { createHash } from 'node:crypto';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import {
  projectSavedDiscoveryCreative,
  type SavedDiscoveryCreative,
  savedDiscoveryMediaType,
} from '@api/collections/ad-performance/utils/ad-performance-discovery.util';
import { CacheService } from '@api/services/cache/cache.service';
import { PaidCreativeProviderRegistry } from '@api/services/paid-creative-research/providers/paid-creative-provider.registry';
import type {
  AdsDiscoveryAdvertiser,
  AdsDiscoveryQuery,
  AdsDiscoveryResponse,
  AdsDiscoverySample,
} from '@genfeedai/contracts/interfaces/integrations/ads-discovery.interface';
import {
  isPaidCreativePlatform,
  normalizeAdvertiserHandle,
  normalizeGoogleAdvertiserQuery,
  resolvePaidCreativeLongevity,
  TIKTOK_AD_LIBRARY_COUNTRIES,
} from '@genfeedai/integrations/ads';
import { BadRequestException, Injectable } from '@nestjs/common';

const COUNTRIES = new Set(
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  ),
);

export function validateDiscoveryQuery(
  input: AdsDiscoveryQuery,
): AdsDiscoveryQuery & { normalizedCountries: string[] } {
  if (!isPaidCreativePlatform(input.platform))
    throw new BadRequestException('Unsupported public ad platform');
  let keyword = typeof input.keyword === 'string' ? input.keyword.trim() : '';
  if (keyword.length < 2 || keyword.length > 120)
    throw new BadRequestException('Search must contain 2 to 120 characters');
  const mediaType = input.mediaType ?? 'visual';
  if (!['visual', 'image', 'video'].includes(mediaType))
    throw new BadRequestException('mediaType must be visual, image or video');
  const limit = input.limit ?? 24;
  if (
    !Number.isFinite(limit) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw new BadRequestException('limit must be an integer from 1 to 50');
  if (input.countries !== undefined && typeof input.countries !== 'string')
    throw new BadRequestException(
      'countries must be comma-separated ISO codes',
    );
  const normalizedCountries = [
    ...new Set(
      (input.countries ?? '')
        .split(',')
        .map((country) => country.trim().toUpperCase())
        .filter(Boolean),
    ),
  ].sort();
  if (
    normalizedCountries.length > 3 ||
    normalizedCountries.some((country) => !COUNTRIES.has(country))
  )
    throw new BadRequestException('Choose up to three ISO countries');
  if (limit < normalizedCountries.length)
    throw new BadRequestException('limit must cover every selected country');
  if (
    input.platform === 'tiktok' &&
    normalizedCountries.some(
      (country) => !TIKTOK_AD_LIBRARY_COUNTRIES.includes(country),
    )
  )
    throw new BadRequestException(
      'TikTok library covers EEA, UK and Switzerland',
    );
  if (input.platform === 'google' || input.platform === 'youtube') {
    const advertiser = normalizeGoogleAdvertiserQuery(keyword);
    if (!advertiser)
      throw new BadRequestException(
        'Enter a competitor website or Google AR advertiser ID',
      );
    keyword = advertiser;
  }
  return { ...input, keyword, limit, mediaType, normalizedCountries };
}

function domain(value?: string): string | undefined {
  try {
    return value ? new URL(value).hostname : undefined;
  } catch {
    return undefined;
  }
}
function archiveUrl(
  platform: string,
  advertiserId: string,
  creativeId: string,
): string | undefined {
  if (platform === 'meta')
    return (
      'https://www.facebook.com/ads/library/?id=' +
      encodeURIComponent(creativeId)
    );
  if (platform === 'tiktok')
    return `https://library.tiktok.com/ads/detail/${encodeURIComponent(creativeId)}`;
  if (/^AR\d+$/i.test(advertiserId) && /^CR\d+$/i.test(creativeId))
    return (
      'https://adstransparency.google.com/advertiser/' +
      encodeURIComponent(advertiserId) +
      '/creative/' +
      encodeURIComponent(creativeId)
    );
  return undefined;
}

function discoveryAdvertiserIdentity(
  record: SavedDiscoveryCreative,
): string | undefined {
  return (
    record.externalAccountId ||
    record.advertiserHandle ||
    domain(record.landingPageUrl)
  );
}

type SavedObservation = Pick<AdsDiscoverySample, 'observedAt' | 'freshness'>;
function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function readCachedAdvertisers(
  value: unknown,
  query: ReturnType<typeof validateDiscoveryQuery>,
): AdsDiscoveryAdvertiser[] {
  const cached = object(value);
  if (
    cached?.status !== 'ready' ||
    cached.platform !== query.platform ||
    typeof cached.query !== 'string' ||
    cached.query.toLowerCase() !== query.keyword.toLowerCase() ||
    JSON.stringify(cached.countries) !==
      JSON.stringify(query.normalizedCountries) ||
    !Array.isArray(cached.advertisers)
  )
    return [];
  const advertisers: AdsDiscoveryAdvertiser[] = [];
  let remaining = query.brandId ? 500 : (query.limit ?? 24);
  for (const value of cached.advertisers.slice(0, 500)) {
    const row = object(value);
    if (
      !row ||
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      !Array.isArray(row.samples)
    )
      continue;
    const actualCountries = Array.isArray(row.countries)
      ? [
          ...new Set(
            row.countries.filter(
              (country): country is string =>
                typeof country === 'string' && COUNTRIES.has(country),
            ),
          ),
        ]
      : [];
    if (
      !query.brandId &&
      query.normalizedCountries.length &&
      !query.normalizedCountries.some((country) =>
        actualCountries.includes(country),
      )
    )
      continue;
    const samples: AdsDiscoverySample[] = [];
    for (const value of row.samples.slice(0, 500)) {
      const sample = object(value);
      if (
        !sample ||
        typeof sample.id !== 'string' ||
        !Array.isArray(sample.imageUrls) ||
        !Array.isArray(sample.videoUrls) ||
        !Array.isArray(sample.mediaUrls)
      )
        continue;
      const creative = projectSavedDiscoveryCreative({
        ...sample,
        creativeMediaUrls: sample.mediaUrls,
        creativeType: sample.mediaType,
      });
      const mediaType = savedDiscoveryMediaType(creative);
      if (
        !mediaType ||
        (query.mediaType !== 'visual' && mediaType !== query.mediaType)
      )
        continue;
      samples.push({
        id: sample.id,
        adPerformanceId:
          typeof sample.adPerformanceId === 'string'
            ? sample.adPerformanceId
            : undefined,
        mediaType,
        headline:
          creative.headlineText ??
          (typeof sample.headline === 'string' ? sample.headline : undefined),
        imageUrls: creative.imageUrls ?? [],
        videoUrls: creative.videoUrls ?? [],
        mediaUrls: creative.creativeMediaUrls ?? [],
        archiveUrl: creative.archiveUrl,
        startedAt:
          typeof sample.startedAt === 'string' ? sample.startedAt : undefined,
      });
      if (samples.length >= remaining) break;
    }
    if (!samples.length) continue;
    const watch = object(row.watchInput);
    advertisers.push({
      id: row.id,
      name: row.name,
      handle: typeof row.handle === 'string' ? row.handle : undefined,
      landingDomain:
        typeof row.landingDomain === 'string' ? row.landingDomain : undefined,
      externalAdvertiserId:
        typeof row.externalAdvertiserId === 'string'
          ? row.externalAdvertiserId
          : undefined,
      platforms: [query.platform],
      countries: actualCountries,
      creativeCount: samples.length,
      samples,
      watchInput:
        watch &&
        watch.platform === query.platform &&
        typeof watch.advertiserHandle === 'string'
          ? {
              platform: query.platform,
              advertiserHandle: watch.advertiserHandle,
              advertiserName:
                typeof watch.advertiserName === 'string'
                  ? watch.advertiserName
                  : undefined,
              externalAdvertiserId:
                typeof watch.externalAdvertiserId === 'string'
                  ? watch.externalAdvertiserId
                  : undefined,
            }
          : undefined,
    });
    remaining -= samples.length;
    if (remaining <= 0) break;
  }
  return advertisers;
}

export function groupDiscoveryAdvertisers(
  records: SavedDiscoveryCreative[],
  platform: AdsDiscoveryQuery['platform'],
  now = new Date(),
  sourceIds: ReadonlyMap<SavedDiscoveryCreative, string> = new Map(),
  observations?: ReadonlyMap<SavedDiscoveryCreative, SavedObservation>,
): AdsDiscoveryAdvertiser[] {
  const groups = new Map<string, SavedDiscoveryCreative[]>();
  for (const record of records) {
    const identity = discoveryAdvertiserIdentity(record);
    if (!identity || !record.externalAdId) continue;
    const key = `${platform}:${identity}`;
    const group = groups.get(key) ?? [];
    if (
      !group.some((existing) => existing.externalAdId === record.externalAdId)
    )
      group.push(record);
    groups.set(key, group);
  }
  return [...groups].map(([id, rows]) => {
    const row = rows[0];
    const externalAdvertiserId = row.externalAccountId || undefined;
    const handle =
      normalizeAdvertiserHandle(platform, row.advertiserHandle ?? '') ??
      normalizeAdvertiserHandle(platform, externalAdvertiserId ?? '') ??
      undefined;
    const starts = rows
      .map((item) => item.presentationStartDate)
      .filter(
        (date): date is string =>
          Boolean(date) && Number.isFinite(Date.parse(date ?? '')),
      )
      .sort((left, right) => Date.parse(left) - Date.parse(right));
    const earliest = rows.find(
      (item) => item.presentationStartDate === starts[0],
    );
    const observation = earliest
      ? observations?.get(earliest)?.observedAt
      : undefined;
    const endedAt = earliest?.presentationEndDate
      ? Date.parse(earliest.presentationEndDate)
      : NaN;
    const hasEnd =
      Number.isFinite(endedAt) &&
      endedAt >= Date.parse(starts[0] ?? '') &&
      endedAt <= now.getTime();
    const longevity =
      starts[0] && (!observations || observation || hasEnd)
        ? resolvePaidCreativeLongevity(
            {
              presentationStartDate: starts[0],
              presentationEndDate: earliest?.presentationEndDate,
            },
            observation
              ? new Date(observation)
              : observations && hasEnd
                ? new Date(endedAt)
                : now,
          )
        : null;
    const activeKnown = rows.every(
      (item) =>
        typeof item.isHalted === 'boolean' &&
        (!observations || Boolean(observations.get(item)?.observedAt)),
    );
    return {
      id,
      name: row.advertiserName ?? handle ?? externalAdvertiserId ?? id,
      handle,
      externalAdvertiserId,
      fundingEntity: row.fundingEntity,
      landingDomain: domain(row.landingPageUrl),
      platforms: [
        ...new Set(
          rows.flatMap((item) =>
            item.targetingCriteria?.length
              ? item.targetingCriteria
              : [platform],
          ),
        ),
      ],
      countries: [
        ...new Set(rows.flatMap((item) => item.targetingCountries ?? [])),
      ],
      creativeCount: rows.length,
      activeCreativeCount: activeKnown
        ? rows.filter((item) => item.isHalted === false).length
        : undefined,
      earliestStartDate: starts[0],
      longevityDays: longevity?.daysLive,
      reachEstimateMin: row.reachEstimateMin,
      reachEstimateMax: row.reachEstimateMax,
      samples: rows.map((item) => ({
        adPerformanceId: sourceIds.get(item),
        ...observations?.get(item),
        mediaType: savedDiscoveryMediaType(item),
        id: item.externalAdId ?? '',
        archiveUrl:
          item.archiveUrl ??
          archiveUrl(platform, item.externalAccountId, item.externalAdId ?? ''),
        headline: item.headlineText ?? item.bodyText,
        imageUrls: item.imageUrls ?? [],
        videoUrls: item.videoUrls ?? [],
        mediaUrls: (item.creativeMediaUrls ?? [])
          .filter((url) => /^https?:\/\//i.test(url))
          .slice(0, 3),
        startedAt: item.presentationStartDate,
      })),
      watchInput:
        handle && (platform !== 'tiktok' || Boolean(row.advertiserName))
          ? {
              advertiserHandle: handle,
              advertiserName: row.advertiserName,
              externalAdvertiserId,
              platform,
            }
          : undefined,
    };
  });
}

@Injectable()
export class AdsDiscoveryService {
  constructor(
    private readonly registry: PaidCreativeProviderRegistry,
    private readonly cache: CacheService,
    private readonly adPerformanceService: AdPerformanceService,
  ) {}

  async discover(
    organizationId: string,
    input: AdsDiscoveryQuery,
  ): Promise<AdsDiscoveryResponse> {
    const query = validateDiscoveryQuery(input);
    const readiness = this.registry.resolve(query.platform).getReadiness();
    const id = createHash('sha256')
      .update(
        JSON.stringify([
          organizationId,
          query.brandId ?? '',
          query.platform,
          query.keyword.toLowerCase(),
          query.normalizedCountries,
          query.limit,
          query.mediaType,
        ]),
      )
      .digest('hex');
    const base: AdsDiscoveryResponse = {
      id,
      status: 'empty',
      capability:
        query.platform === 'x'
          ? 'unsupported'
          : ['google', 'youtube'].includes(query.platform)
            ? 'advertiser_lookup'
            : 'keyword',
      documentationUrl: readiness.documentationUrl,
      platform: query.platform,
      query: query.keyword,
      countries: query.normalizedCountries,
      advertisers: [],
      sampleCount: 0,
      reason: 'no_matching_saved_ads',
    };
    if (query.platform === 'x')
      return {
        ...base,
        status: 'unsupported',
        reason: 'paid_creative_platform_unsupported',
      };
    let cached: unknown;
    try {
      cached = await this.cache.get(`ads-discovery:v2:${id}`);
    } catch {
      cached = undefined;
    }
    const previews = readCachedAdvertisers(cached, query);
    if (!query.brandId) {
      if (!previews.length) return base;
      const advertisers = previews.map((advertiser) => ({
        ...advertiser,
        activeCreativeCount: undefined,
        longevityDays: undefined,
        samples: advertiser.samples.map((sample) => ({
          ...sample,
          adPerformanceId: undefined,
          observedAt: undefined,
          freshness: 'unknown' as const,
        })),
      }));
      return {
        ...base,
        status: 'ready',
        reason: undefined,
        advertisers,
        sampleCount: advertisers.reduce(
          (sum, item) => sum + item.samples.length,
          0,
        ),
      };
    }
    const cachedSourceIds = [
      ...new Set(
        previews.flatMap((advertiser) =>
          advertiser.samples.flatMap((sample) =>
            sample.adPerformanceId ? [sample.adPerformanceId] : [],
          ),
        ),
      ),
    ].slice(0, 500);
    try {
      const rows = await this.adPerformanceService.findSavedDiscoverySources({
        organizationId,
        brandId: query.brandId,
        platform: query.platform,
        keyword: query.keyword,
        normalizedCountries: query.normalizedCountries,
        mediaType: query.mediaType ?? 'visual',
        limit: query.limit ?? 24,
        cachedSourceIds,
      });
      const records = rows.map(projectSavedDiscoveryCreative);
      const sourceIds = new Map<SavedDiscoveryCreative, string>();
      const observations = new Map<SavedDiscoveryCreative, SavedObservation>();
      const now = new Date();
      records.forEach((record, index) => {
        const row = rows[index];
        sourceIds.set(record, row.id);
        const date =
          row.researchObservedAt instanceof Date
            ? row.researchObservedAt
            : typeof row.researchObservedAt === 'string'
              ? new Date(row.researchObservedAt)
              : undefined;
        const observedAt =
          date &&
          Number.isFinite(date.getTime()) &&
          date.getTime() <= now.getTime()
            ? date.toISOString()
            : undefined;
        observations.set(record, {
          observedAt,
          freshness:
            row.researchFreshnessState === 'stale'
              ? 'stale'
              : row.researchFreshnessState === 'fresh' && observedAt
                ? 'saved'
                : 'unknown',
        });
      });
      const advertisers = groupDiscoveryAdvertisers(
        records,
        query.platform,
        now,
        sourceIds,
        observations,
      );
      return {
        ...base,
        status: advertisers.length ? 'ready' : 'empty',
        reason: advertisers.length ? undefined : base.reason,
        advertisers,
        sampleCount: advertisers.reduce(
          (sum, item) => sum + item.creativeCount,
          0,
        ),
      };
    } catch {
      return {
        ...base,
        status: 'unavailable',
        reason: 'saved_ads_unavailable',
      };
    }
  }
}
