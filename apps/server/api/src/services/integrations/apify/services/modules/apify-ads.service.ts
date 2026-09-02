import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import type { NormalizedPaidCreativeRecord } from '@genfeedai/integrations/ads';
import {
  normalizeMetaAdLibraryRecord,
  normalizeTikTokCreativeCenterRecord,
} from '@genfeedai/integrations/ads';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Raw Meta Ad Library rows as the Apify actor emits them. The actor mirrors
 * the public archive's field names, which are neither stable nor typed, so
 * every field is optional and coerced before it reaches the normalizer.
 */
interface ApifyMetaAdLibraryItem {
  ad_archive_id?: string;
  adArchiveId?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  display_format?: string;
  eu_total_reach?: number;
  is_active?: boolean;
  images?: Array<{ original_image_url?: string; resized_image_url?: string }>;
  link_url?: string;
  page_id?: string;
  page_name?: string;
  publisher_platforms?: string[];
  snapshot?: {
    body?: { text?: string };
    cards?: Array<{
      body?: string;
      link_url?: string;
      resized_image_url?: string;
      video_hd_url?: string;
      video_sd_url?: string;
    }>;
    cta_text?: string;
    display_format?: string;
    images?: Array<{ original_image_url?: string; resized_image_url?: string }>;
    link_url?: string;
    page_name?: string;
    title?: string;
    videos?: Array<{ video_hd_url?: string; video_sd_url?: string }>;
  };
  target_locations?: Array<{ name?: string } | string>;
  total_reach?: number;
}

/** Raw TikTok Creative Center rows as the Apify actor emits them. */
interface ApifyTikTokCreativeItem {
  ad_title?: string;
  brand_name?: string;
  cost?: number;
  countries?: string[];
  ctr?: number;
  favorite?: boolean;
  first_seen?: string;
  id?: string;
  landing_page?: string;
  last_seen?: string;
  like?: number;
  objective_key?: string;
  video_info?: {
    cover?: string;
    duration?: number;
    video_url?: Record<string, string> | string;
  };
  videos?: string[];
  view?: number;
}

export interface PaidCreativeFetchParams {
  /** ISO country codes the archive should be queried for. */
  countries?: string[];
  limit: number;
  /** Advertiser page/handle to scope the archive query to. */
  query: string;
}

/**
 * ApifyAdsService
 *
 * Reads competitor creatives from public paid-transparency archives through
 * Apify actors. Meta's official `ads_archive` Graph endpoint only returns
 * political and issue ads outside the EU, and TikTok's Creative Center has no
 * official API at all, so the actor transport is the only way to observe a
 * competitor's live commercial creatives.
 *
 * Every fetch degrades to an empty array when Apify is unconfigured — the
 * caller records that as an empty snapshot rather than failing the run.
 */
@Injectable()
export class ApifyAdsService {
  private readonly constructorName: string = String(this.constructor.name);

  readonly ADS_ACTORS = {
    META_AD_LIBRARY: 'apify/facebook-ads-scraper',
    TIKTOK_CREATIVE_CENTER: 'clockworks/tiktok-ads-scraper',
  };

  constructor(
    private readonly baseService: ApifyBaseService,
    private readonly loggerService: LoggerService,
  ) {}

  async fetchMetaAdLibraryCreatives(
    params: PaidCreativeFetchParams,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    const items = await this.runAdsActor<ApifyMetaAdLibraryItem>(
      this.ADS_ACTORS.META_AD_LIBRARY,
      {
        activeStatus: 'all',
        count: params.limit,
        country: params.countries?.[0] ?? 'ALL',
        scrapeAdDetails: true,
        startUrls: [{ url: this.buildMetaAdLibraryUrl(params) }],
      },
    );

    return items
      .map((item) => this.mapMetaItem(item, params.countries))
      .filter((record): record is NormalizedPaidCreativeRecord =>
        Boolean(record),
      );
  }

  async fetchTikTokCreativeCenterCreatives(
    params: PaidCreativeFetchParams,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    const items = await this.runAdsActor<ApifyTikTokCreativeItem>(
      this.ADS_ACTORS.TIKTOK_CREATIVE_CENTER,
      {
        countries: params.countries ?? ['US'],
        keyword: params.query,
        maxItems: params.limit,
        period: 30,
      },
    );

    return items
      .map((item) => this.mapTikTokItem(item, params))
      .filter((record): record is NormalizedPaidCreativeRecord =>
        Boolean(record),
      );
  }

  /**
   * An unconfigured or failing actor is a missing observation, not a failed
   * run: the caller persists an empty snapshot so the watchlist row reports
   * `empty` instead of pretending the competitor stopped advertising.
   */
  private async runAdsActor<T>(actorId: string, input: object): Promise<T[]> {
    try {
      return await this.baseService.runActor<T>(actorId, input);
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}.runAdsActor failed for ${actorId}`,
        error,
      );
      return [];
    }
  }

  private buildMetaAdLibraryUrl(params: PaidCreativeFetchParams): string {
    const country = params.countries?.[0] ?? 'ALL';
    const search = new URLSearchParams({
      active_status: 'all',
      ad_type: 'all',
      country,
      q: params.query,
      search_type: 'keyword_unordered',
    });

    return `https://www.facebook.com/ads/library/?${search.toString()}`;
  }

  private mapMetaItem(
    item: ApifyMetaAdLibraryItem,
    countries: string[] | undefined,
  ): NormalizedPaidCreativeRecord | undefined {
    const adArchiveId = item.ad_archive_id ?? item.adArchiveId;

    if (!adArchiveId) {
      return undefined;
    }

    const snapshot = item.snapshot;
    const mediaUrls = [
      ...(snapshot?.videos ?? []).map(
        (video) => video.video_hd_url ?? video.video_sd_url,
      ),
      ...(snapshot?.cards ?? []).map(
        (card) => card.video_hd_url ?? card.video_sd_url,
      ),
      ...(snapshot?.images ?? item.images ?? []).map(
        (image) => image.original_image_url ?? image.resized_image_url,
      ),
      ...(snapshot?.cards ?? []).map((card) => card.resized_image_url),
    ].filter((url): url is string => Boolean(url));

    return normalizeMetaAdLibraryRecord({
      adArchiveId,
      adFormat: snapshot?.display_format ?? item.display_format,
      bodyText: snapshot?.body?.text ?? item.ad_creative_bodies?.[0],
      creativeMediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      ctaText: snapshot?.cta_text,
      endDate: item.ad_delivery_stop_time,
      headlineText: snapshot?.title ?? item.ad_creative_link_titles?.[0],
      isActive: item.is_active,
      landingPageUrl: snapshot?.link_url ?? item.link_url,
      pageId: item.page_id,
      pageName: snapshot?.page_name ?? item.page_name,
      publisherPlatforms: item.publisher_platforms,
      reachEstimateMax: item.eu_total_reach ?? item.total_reach,
      reachEstimateMin: item.eu_total_reach ?? item.total_reach,
      startDate: item.ad_delivery_start_time,
      targetingCountries: this.resolveMetaCountries(item, countries),
    });
  }

  private resolveMetaCountries(
    item: ApifyMetaAdLibraryItem,
    fallback: string[] | undefined,
  ): string[] | undefined {
    const locations = (item.target_locations ?? [])
      .map((location) =>
        typeof location === 'string' ? location : location.name,
      )
      .filter((name): name is string => Boolean(name));

    return locations.length > 0 ? locations : fallback;
  }

  private mapTikTokItem(
    item: ApifyTikTokCreativeItem,
    params: PaidCreativeFetchParams,
  ): NormalizedPaidCreativeRecord | undefined {
    if (!item.id) {
      return undefined;
    }

    const videoUrl = item.video_info?.video_url;
    const mediaUrls = [
      ...(item.videos ?? []),
      ...(typeof videoUrl === 'string'
        ? [videoUrl]
        : Object.values(videoUrl ?? {})),
    ].filter((url): url is string => Boolean(url));

    return normalizeTikTokCreativeCenterRecord({
      adFormat: item.objective_key,
      advertiserHandle: item.brand_name ?? params.query,
      advertiserName: item.brand_name,
      bodyText: item.ad_title,
      creativeMediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      ctr: item.ctr,
      endDate: item.last_seen,
      id: item.id,
      landingPageUrl: item.landing_page,
      startDate: item.first_seen,
      targetingCountries: item.countries ?? params.countries,
      videoViews: item.view,
    });
  }
}
