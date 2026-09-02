import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { AdWatchedAdvertisersService } from '@api/collections/ad-watched-advertisers/services/ad-watched-advertisers.service';
import { buildPaidCreativeReferenceClassification } from '@api/collections/trends/utils/trend-source-classification.util';
import type {
  PaidCreativeIngestionErrorCode,
  PaidCreativeIngestionResult,
  PaidCreativePlatformReadiness,
} from '@api/services/paid-creative-research/interfaces/paid-creative-research.interface';
import { PaidCreativeProviderRegistry } from '@api/services/paid-creative-research/providers/paid-creative-provider.registry';
import type {
  NormalizedPaidCreativeRecord,
  PaidCreativePlatform,
} from '@genfeedai/integrations/ads';
import {
  isPaidCreativePlatform,
  partitionPaidCreativeMediaUrls,
  resolvePaidCreativeProvider,
} from '@genfeedai/integrations/ads';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Ads pulled per advertiser per run. Transparency archives are long tails. */
const DEFAULT_CREATIVE_LIMIT = 50;

export type WatchedAdvertiserScope = {
  advertiserHandle: string;
  brandId: string | null;
  externalAdvertiserId: string | null;
  id: string;
  organizationId: string;
  platform: string;
};

export type PaidCreativeIngestionOptions = {
  brandId?: string;
  countries?: string[];
  limit?: number;
  platform?: PaidCreativePlatform;
};

/**
 * Tenant-owned persistence boundary for competitor paid-creative research
 * across every ad platform (#3537).
 *
 * One watched advertiser is one snapshot key. Each run replaces that
 * advertiser's snapshot inside `AdPerformanceService.replaceResearchSnapshot`,
 * which is transactional, concurrency-guarded, and scoped to the tenant —
 * research rows never enter the cross-organization public corpus, because
 * every `researchSource` written here is in `PAID_CREATIVE_RESEARCH_SOURCES`.
 *
 * An unavailable provider marks the existing rows stale rather than deleting
 * them or reporting an empty archive: "we could not look" and "the competitor
 * is running nothing" are different facts and the operator sees which one.
 */
@Injectable()
export class PaidCreativeResearchIngestionService {
  private readonly logContext = 'PaidCreativeResearchIngestionService';

  constructor(
    private readonly adPerformanceService: AdPerformanceService,
    private readonly adWatchedAdvertisersService: AdWatchedAdvertisersService,
    private readonly loggerService: LoggerService,
    private readonly providerRegistry: PaidCreativeProviderRegistry,
  ) {}

  getReadiness(): PaidCreativePlatformReadiness[] {
    return this.providerRegistry.getReadiness();
  }

  async discoverAdvertisers(
    organizationId: string,
    options: PaidCreativeIngestionOptions = {},
  ): Promise<WatchedAdvertiserScope[]> {
    return (await this.adWatchedAdvertisersService.findAllByAccount(
      organizationId,
      options.brandId,
      options.platform,
    )) as WatchedAdvertiserScope[];
  }

  async ingestOne(
    organizationId: string,
    advertiser: WatchedAdvertiserScope,
    options: PaidCreativeIngestionOptions,
  ): Promise<PaidCreativeIngestionResult> {
    const platform = isPaidCreativePlatform(advertiser.platform)
      ? advertiser.platform
      : undefined;
    if (!platform) {
      return this.markUnavailable(
        organizationId,
        advertiser,
        advertiser.platform,
        null,
        'paid_creative_platform_unsupported',
      );
    }

    const adapter = this.providerRegistry.resolve(platform);
    const readiness = adapter.getReadiness();
    if (!readiness.available) {
      return this.markUnavailable(
        organizationId,
        advertiser,
        platform,
        resolvePaidCreativeProvider(platform),
        readiness.blockers[0] ?? 'paid_creative_source_unavailable',
      );
    }

    const observedAt = new Date();
    const snapshotId = `${advertiser.id}:${observedAt.toISOString()}`;

    let creatives: NormalizedPaidCreativeRecord[];
    try {
      creatives = await adapter.fetchCreatives({
        ...(options.countries ? { countries: options.countries } : {}),
        limit: options.limit ?? DEFAULT_CREATIVE_LIMIT,
        query: advertiser.externalAdvertiserId ?? advertiser.advertiserHandle,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.logContext} fetch failed for advertiser ${advertiser.id}`,
        error,
      );

      return this.markUnavailable(
        organizationId,
        advertiser,
        platform,
        resolvePaidCreativeProvider(platform),
        'paid_creative_source_unavailable',
      );
    }

    try {
      const replacement =
        await this.adPerformanceService.replaceResearchSnapshot({
          expectedBrandId: advertiser.brandId,
          observedAt,
          organizationId,
          records: creatives.map((creative) =>
            this.toSnapshotRecord(
              creative,
              advertiser,
              platform,
              observedAt,
              snapshotId,
            ),
          ),
          researchSource: resolvePaidCreativeProvider(platform),
          snapshotId,
          snapshotKey: advertiser.id,
        });

      await this.recordOutcome(advertiser.id, organizationId, {
        freshnessState: replacement.recordCount === 0 ? 'empty' : 'fresh',
        recordCount: replacement.recordCount,
        snapshotId,
        status: 'success',
      });

      return {
        advertiserId: advertiser.id,
        platform,
        recordCount: replacement.recordCount,
        status: 'success',
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.logContext} snapshot replacement failed for advertiser ${advertiser.id}`,
        error,
      );

      return this.markUnavailable(
        organizationId,
        advertiser,
        platform,
        resolvePaidCreativeProvider(platform),
        'paid_creative_snapshot_write_failed',
        'error',
      );
    }
  }

  /**
   * Build the `AdPerformance` row for one normalized creative. Metrics a
   * transparency archive does not disclose stay absent — never zero — so a
   * downstream reader can tell "not disclosed" from "measured as none".
   */
  private toSnapshotRecord(
    creative: NormalizedPaidCreativeRecord,
    advertiser: WatchedAdvertiserScope,
    platform: PaidCreativePlatform,
    observedAt: Date,
    snapshotId: string,
  ): Record<string, unknown> {
    const parsedDate = creative.date ? new Date(creative.date) : undefined;
    const date =
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate
        : undefined;
    const { imageUrls, videoUrls } = partitionPaidCreativeMediaUrls(
      creative.creativeMediaUrls,
    );
    const provider = resolvePaidCreativeProvider(platform);

    return {
      adPlatform: creative.platform,
      advertiserHandle:
        creative.advertiserHandle ?? advertiser.advertiserHandle,
      advertiserName: creative.advertiserName,
      bodyText: creative.bodyText,
      brandId: advertiser.brandId ?? undefined,
      campaignStatus: creative.campaignStatus,
      clicks: creative.clicks,
      conversions: creative.conversions,
      cpa: creative.cpa,
      cpc: creative.cpc,
      cpm: creative.cpm,
      creativeContent: creative.creativeContent,
      creativeMediaUrls: creative.creativeMediaUrls,
      ctaText: creative.ctaText,
      ctr: creative.ctr,
      currency: creative.currency,
      dataConfidence: creative.dataConfidence,
      date,
      estimatedReach: creative.estimatedReach,
      externalAccountId:
        creative.externalAccountId ||
        advertiser.externalAdvertiserId ||
        advertiser.advertiserHandle,
      externalAdId: creative.externalAdId,
      fundingEntity: creative.fundingEntity,
      granularity: creative.granularity,
      headlineText: creative.headlineText,
      imageUrls,
      impressions: creative.impressions,
      isHalted: creative.isHalted,
      landingPageUrl: creative.landingPageUrl,
      organizationId: advertiser.organizationId,
      performanceScore: creative.performanceScore,
      presentationEndDate: creative.presentationEndDate,
      presentationStartDate: creative.presentationStartDate,
      reachEstimateMax: creative.reachEstimateMax,
      reachEstimateMin: creative.reachEstimateMin,
      researchFreshnessState: 'fresh',
      researchObservedAt: observedAt,
      researchSnapshotId: snapshotId,
      researchSnapshotKey: advertiser.id,
      researchSource: provider,
      scope: 'organization',
      /**
       * The same `paid_creative_reference` contract Discovery applies to trend
       * sources, carried on the snapshot so provider, advertiser, and freshness
       * read identically whichever surface loads the row.
       */
      sourceClassification: buildPaidCreativeReferenceClassification({
        adFormat: creative.adFormat,
        capturedAt: observedAt,
        creativeType: creative.creativeType,
        platform,
        provider,
        sourceAuthor: creative.advertiserHandle ?? advertiser.advertiserHandle,
        sourceTimestamp: creative.presentationStartDate ?? date,
        sourceTopic: creative.advertiserName ?? advertiser.advertiserHandle,
      }),
      spend: creative.spend,
      targetingCountries: creative.targetingCountries,
      targetingCriteria: creative.targetingCriteria,
      usagePolicy: creative.usagePolicy,
      videoUrls,
    };
  }

  /**
   * Keep the previous snapshot but stop presenting it as current. The stale
   * transition is scoped to `researchSource`, so a failed Meta run leaves an
   * advertiser's TikTok or X snapshot alone.
   */
  private async markUnavailable(
    organizationId: string,
    advertiser: WatchedAdvertiserScope,
    platform: string,
    researchSource: string | null,
    errorCode: PaidCreativeIngestionErrorCode,
    status: 'error' | 'unavailable' = 'unavailable',
  ): Promise<PaidCreativeIngestionResult> {
    if (researchSource) {
      await this.adPerformanceService.markResearchSnapshotStale(
        organizationId,
        advertiser.id,
        researchSource,
      );
    }

    await this.recordOutcome(advertiser.id, organizationId, {
      errorCode,
      freshnessState: 'unavailable',
      status,
    });

    return {
      advertiserId: advertiser.id,
      errorCode,
      platform,
      recordCount: 0,
      status,
    };
  }

  /**
   * Freshness bookkeeping is reporting, not the run itself: a failure to write
   * it must not turn a completed ingestion into an error.
   */
  private async recordOutcome(
    advertiserId: string,
    organizationId: string,
    result: Parameters<AdWatchedAdvertisersService['recordIngestionResult']>[2],
  ): Promise<void> {
    try {
      await this.adWatchedAdvertisersService.recordIngestionResult(
        advertiserId,
        organizationId,
        result,
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.logContext} status update failed for advertiser ${advertiserId}`,
        error,
      );
    }
  }
}
