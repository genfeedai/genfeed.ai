import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import {
  type NormalizedPaidCreativeRecord,
  normalizeGoogleAdsTransparencyRecord,
  normalizeGoogleAdvertiserQuery,
  normalizeMetaArchiveRecord,
  normalizeTikTokAdsLibraryRecord,
  TIKTOK_AD_LIBRARY_COUNTRIES,
} from '@genfeedai/integrations/ads';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface PaidCreativeFetchParams {
  countries?: string[];
  mediaType?: 'visual' | 'image' | 'video';
  externalAdvertiserId?: string;
  limit: number;
  mode?: 'keyword' | 'advertiser';
  organizationId?: string;
  platform?: string;
  query: string;
}

@Injectable()
export class ApifyAdsService {
  readonly ADS_ACTORS = {
    GOOGLE_ADS_TRANSPARENCY: 'lexis-solutions/google-ads-scraper',
    META_AD_LIBRARY: 'apify/facebook-ads-scraper',
    TIKTOK_ADS_LIBRARY: 'lexis-solutions/tiktok-ads-scraper',
  };

  constructor(
    private readonly baseService: ApifyBaseService,
    private readonly loggerService: LoggerService,
  ) {}

  async fetchMetaAdLibraryCreatives(
    params: PaidCreativeFetchParams,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    return this.fetchCountries(params, async (country, limit) => {
      const search = new URLSearchParams({
        active_status: 'all',
        ad_type: 'all',
        country: country ?? 'ALL',
      });
      if (params.mediaType === 'image' || params.mediaType === 'video')
        search.set('media_type', params.mediaType);
      const pageId = params.externalAdvertiserId ?? params.query;
      if (params.mode === 'advertiser' && /^\d+$/.test(pageId)) {
        search.set('search_type', 'page');
        search.set('view_all_page_id', pageId);
      } else {
        search.set('search_type', 'keyword_unordered');
        search.set('q', params.query);
      }
      const rows = await this.runAdsActor(
        this.ADS_ACTORS.META_AD_LIBRARY,
        {
          activeStatus: 'all',
          count: limit,
          country: country ?? 'ALL',
          scrapeAdDetails: true,
          startUrls: [
            {
              url: `https://www.facebook.com/ads/library/?${search.toString()}`,
            },
          ],
        },
        params.organizationId,
      );
      return this.normalize(rows, (row) =>
        normalizeMetaArchiveRecord(row, country ? [country] : undefined),
      );
    });
  }

  async fetchTikTokAdsLibraryCreatives(
    params: PaidCreativeFetchParams,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    if (
      params.countries?.some(
        (country) => !TIKTOK_AD_LIBRARY_COUNTRIES.includes(country),
      )
    )
      throw new ServiceUnavailableException(
        'paid_creative_country_unsupported',
      );
    return this.fetchCountries(params, async (country, limit) => {
      const rows = await this.runAdsActor(
        this.ADS_ACTORS.TIKTOK_ADS_LIBRARY,
        {
          ...(params.mode === 'advertiser'
            ? { advertiserName: params.query }
            : { query: params.query }),
          country: country ?? 'all',
          maxPages: Math.ceil(limit / 12),
          quickSearch: false,
          sortBy: 'last_shown_date,desc',
        },
        params.organizationId,
      );
      const records = this.normalize(rows, normalizeTikTokAdsLibraryRecord);
      return params.mode === 'advertiser' && params.externalAdvertiserId
        ? records.filter(
            (record) =>
              record.externalAccountId === params.externalAdvertiserId,
          )
        : records;
    });
  }

  async fetchGoogleAdsTransparencyCreatives(
    params: PaidCreativeFetchParams,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    const query = normalizeGoogleAdvertiserQuery(
      params.externalAdvertiserId ?? params.query,
    );
    if (!query)
      throw new ServiceUnavailableException(
        'paid_creative_advertiser_lookup_required',
      );
    return this.fetchCountries(params, async (country, limit) => {
      const url = new URL(
        /^AR\d+$/.test(query)
          ? `https://adstransparency.google.com/advertiser/${query}`
          : 'https://adstransparency.google.com/',
      );
      url.searchParams.set('region', country ?? 'anywhere');
      if (params.mediaType === 'image' || params.mediaType === 'video')
        url.searchParams.set('format', params.mediaType.toUpperCase());
      if (!query.startsWith('AR')) url.searchParams.set('domain', query);
      if (params.platform === 'youtube')
        url.searchParams.set('platform', 'YOUTUBE');
      const rows = await this.runAdsActor(
        this.ADS_ACTORS.GOOGLE_ADS_TRANSPARENCY,
        {
          startUrls: [{ url: url.toString() }],
          maxItems: limit,
          downloadMedia: false,
          proxyConfiguration: { useApifyProxy: true },
        },
        params.organizationId,
      );
      const records = this.normalize(
        rows,
        normalizeGoogleAdsTransparencyRecord,
      );
      return params.platform === 'youtube'
        ? records.filter((record) =>
            record.targetingCriteria?.includes('YOUTUBE'),
          )
        : records;
    });
  }

  private async fetchCountries(
    params: PaidCreativeFetchParams,
    fetch: (
      country: string | undefined,
      limit: number,
    ) => Promise<NormalizedPaidCreativeRecord[]>,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    const countries = [...new Set(params.countries ?? [])].slice(0, 3);
    const scopes = countries.length ? countries : [undefined];
    const total = Math.min(50, Math.max(1, Math.floor(params.limit)));
    const batches = await Promise.all(
      scopes.map((country, index) => {
        const limit =
          Math.floor(total / scopes.length) +
          (index < total % scopes.length ? 1 : 0);
        return limit
          ? fetch(country, limit).then((records) => records.slice(0, limit))
          : Promise.resolve([]);
      }),
    );
    const unique = new Map<string, NormalizedPaidCreativeRecord>();
    for (const record of batches.flat()) {
      const key = record.externalAdId ?? '';
      const existing = unique.get(key);
      if (existing)
        existing.targetingCountries = [
          ...new Set([
            ...(existing.targetingCountries ?? []),
            ...(record.targetingCountries ?? []),
          ]),
        ];
      else unique.set(key, record);
    }
    return [...unique.values()].slice(0, total);
  }

  private normalize(
    rows: unknown[],
    normalizer: (row: unknown) => NormalizedPaidCreativeRecord | undefined,
  ): NormalizedPaidCreativeRecord[] {
    const records = rows
      .map(normalizer)
      .filter((row): row is NormalizedPaidCreativeRecord => Boolean(row));
    if (rows.length && !records.length)
      throw new ServiceUnavailableException('paid_creative_source_unavailable');
    return records;
  }

  private async runAdsActor(
    actor: string,
    input: object,
    organizationId?: string,
  ): Promise<unknown[]> {
    try {
      return organizationId
        ? (
            await this.baseService.runActorForOrg<unknown>(
              organizationId,
              actor,
              input,
            )
          ).data
        : await this.baseService.runActor<unknown>(actor, input);
    } catch {
      this.loggerService.error('Paid creative source failed', { actor });
      throw new ServiceUnavailableException('paid_creative_source_unavailable');
    }
  }
}
