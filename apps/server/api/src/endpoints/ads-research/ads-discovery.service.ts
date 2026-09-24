import { createHash, randomUUID } from 'node:crypto';
import { CacheService } from '@api/services/cache/cache.service';
import { PaidCreativeProviderRegistry } from '@api/services/paid-creative-research/providers/paid-creative-provider.registry';
import type {
  AdsDiscoveryAdvertiser,
  AdsDiscoveryQuery,
  AdsDiscoveryResponse,
} from '@genfeedai/contracts/interfaces/integrations/ads-discovery.interface';
import {
  isPaidCreativePlatform,
  type NormalizedPaidCreativeRecord,
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
  return { ...input, keyword, limit, normalizedCountries };
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

export function groupDiscoveryAdvertisers(
  records: NormalizedPaidCreativeRecord[],
  platform: AdsDiscoveryQuery['platform'],
  now = new Date(),
): AdsDiscoveryAdvertiser[] {
  const groups = new Map<string, NormalizedPaidCreativeRecord[]>();
  for (const record of records) {
    const identity =
      record.externalAccountId ||
      record.advertiserHandle ||
      domain(record.landingPageUrl);
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
      .sort();
    const longevity = starts[0]
      ? resolvePaidCreativeLongevity(
          {
            presentationStartDate: starts[0],
            presentationEndDate: rows.find(
              (item) => item.presentationStartDate === starts[0],
            )?.presentationEndDate,
          },
          now,
        )
      : null;
    const activeKnown = rows.every(
      (item) => typeof item.isHalted === 'boolean',
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
      samples: rows.slice(0, 3).map((item) => ({
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
  ) {}

  async discover(
    organizationId: string,
    input: AdsDiscoveryQuery,
  ): Promise<AdsDiscoveryResponse> {
    const query = validateDiscoveryQuery(input);
    const adapter = this.registry.resolve(query.platform);
    const readiness = adapter.getReadiness();
    const id = createHash('sha256')
      .update(
        JSON.stringify([
          organizationId,
          query.brandId ?? '',
          query.platform,
          query.keyword.toLowerCase(),
          query.normalizedCountries,
          query.limit,
        ]),
      )
      .digest('hex');
    const base: AdsDiscoveryResponse = {
      id,
      status: 'pending',
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
    };
    if (query.platform === 'x')
      return {
        ...base,
        status: 'unsupported',
        reason: 'paid_creative_platform_unsupported',
      };
    if (!readiness.available)
      return { ...base, status: 'unavailable', reason: readiness.blockers[0] };
    const key = `ads-discovery:v1:${id}`;
    const cached = await this.cache.get<AdsDiscoveryResponse>(key);
    if (cached) {
      if (
        cached.status === 'pending' &&
        Date.parse(cached.expiresAt ?? '') <= Date.now()
      )
        return {
          ...base,
          status: 'unavailable',
          reason: 'paid_creative_search_interrupted',
        };
      return cached;
    }
    const claimKey = `${key}:claim`;
    const token = randomUUID();
    const claim = await this.cache.acquireOwnedClaim(claimKey, token, 300);
    if (claim === 'unavailable')
      return {
        ...base,
        status: 'unavailable',
        reason: 'paid_creative_cache_unavailable',
      };
    if (claim === 'duplicate')
      return {
        ...base,
        status: 'unavailable',
        reason: 'paid_creative_search_busy',
      };
    const completedDuringClaim =
      await this.cache.get<AdsDiscoveryResponse>(key);
    if (completedDuringClaim) {
      await this.cache.releaseOwnedClaim(claimKey, token);
      return completedDuringClaim;
    }
    const pending = {
      ...base,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 180_000).toISOString(),
    };
    if (
      !(await this.cache.setOwnedClaimValue(claimKey, token, key, pending, 300))
    ) {
      await this.cache.releaseOwnedClaim(claimKey, token, key);
      return {
        ...base,
        status: 'unavailable',
        reason: 'paid_creative_cache_unavailable',
      };
    }
    const task = (async () => {
      try {
        const records = await adapter.fetchCreatives({
          countries: query.normalizedCountries,
          limit: query.limit ?? 24,
          mode: 'keyword',
          organizationId,
          platform: query.platform,
          query: query.keyword,
        });
        const advertisers = groupDiscoveryAdvertisers(records, query.platform);
        if (records.length && !advertisers.length)
          throw new Error('Unusable advertiser identities');
        const response: AdsDiscoveryResponse = {
          ...base,
          status: advertisers.length ? 'ready' : 'empty',
          advertisers,
          sampleCount: advertisers.reduce(
            (sum, item) => sum + item.creativeCount,
            0,
          ),
        };
        await this.cache.setOwnedClaimValue(
          claimKey,
          token,
          key,
          response,
          86400,
        );
      } catch {
        await this.cache.setOwnedClaimValue(
          claimKey,
          token,
          key,
          {
            ...base,
            status: 'unavailable',
            reason: 'paid_creative_source_unavailable',
          },
          60,
        );
      } finally {
        await this.cache.releaseOwnedClaim(claimKey, token);
      }
    })();
    void task.catch(() => undefined);
    return pending;
  }
}
