import { XAdWatchedAdvertisersService } from '@api/collections/x-ad-watched-advertisers/services/x-ad-watched-advertisers.service';
import type {
  XAdsRepositoryIngestionResult,
  XAdsRepositoryReadiness,
} from '@api/services/x-ads-repository/interfaces/x-ads-repository.interface';
import { XAdsRepositoryExportService } from '@api/services/x-ads-repository/services/x-ads-repository-export.service';
import type { XAdsRepositoryExportRowInput } from '@genfeedai/integrations/ads';
import { normalizeXAdsRepositoryExportRecord } from '@genfeedai/integrations/ads';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { AdPerformanceService } from '@server/collections/ad-performance/services/ad-performance.service';

type WatchedAdvertiserScope = {
  advertiserHandle: string;
  brandId: string | null;
  credentialId: string | null;
  externalAdvertiserId: string | null;
  id: string;
  organizationId: string;
};

type AuthorizedSnapshotInput = {
  advertiser: WatchedAdvertiserScope;
  observedAt: Date;
  organizationId: string;
  rows: XAdsRepositoryExportRowInput[];
  snapshotId: string;
};

/**
 * Tenant-owned persistence boundary for X Ads Repository disclosures.
 *
 * The live export transport is intentionally unavailable until reviewed
 * provider fixtures and commercial-use approval exist. `applyAuthorizedSnapshot`
 * is the narrow future seam those reviewed fixtures can feed: it accepts only
 * provider-neutral rows, stamps explicit tenant/freshness provenance, and
 * replaces one watched advertiser's snapshot without publishing it globally.
 */
@Injectable()
export class XAdsRepositoryIngestionService {
  private readonly logContext = 'XAdsRepositoryIngestionService';

  constructor(
    private readonly adPerformanceService: AdPerformanceService,
    private readonly exportService: XAdsRepositoryExportService,
    private readonly loggerService: LoggerService,
    private readonly xAdWatchedAdvertisersService: XAdWatchedAdvertisersService,
  ) {}

  getReadiness(): XAdsRepositoryReadiness {
    return this.exportService.getReadiness();
  }

  async ingestForAccount(
    organizationId: string,
    brandId?: string,
  ): Promise<XAdsRepositoryIngestionResult[]> {
    const watchedAdvertisers =
      await this.xAdWatchedAdvertisersService.findAllByAccount(
        organizationId,
        brandId,
      );
    const readiness = this.getReadiness();
    const errorCode =
      readiness.blockers[0] ?? 'x_ads_repository_contract_fixtures_missing';

    const results: XAdsRepositoryIngestionResult[] = [];
    let firstStaleTransitionFailure: Error | undefined;
    for (const advertiser of watchedAdvertisers) {
      try {
        await this.markUnavailable(organizationId, advertiser, errorCode);
      } catch (error: unknown) {
        this.loggerService.error(
          `${this.logContext} stale transition failed for advertiser ${advertiser.id}`,
          error,
        );
        firstStaleTransitionFailure ??=
          error instanceof Error
            ? error
            : new Error('X Ads Repository stale transition failed');
        continue;
      }
      results.push({
        advertiserId: advertiser.id,
        errorCode,
        recordCount: 0,
        status: 'unavailable',
      });
    }

    if (firstStaleTransitionFailure) {
      throw firstStaleTransitionFailure;
    }

    return results;
  }

  async applyAuthorizedSnapshot(
    input: AuthorizedSnapshotInput,
  ): Promise<number> {
    if (input.advertiser.organizationId !== input.organizationId) {
      throw new Error(
        'Watched advertiser does not belong to this organization',
      );
    }

    const records = input.rows.map((row) => {
      const record = normalizeXAdsRepositoryExportRecord(row);
      const parsedDate = record.date ? new Date(record.date) : undefined;
      const date =
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate
          : undefined;

      return {
        adPlatform: 'x',
        advertiserHandle:
          record.advertiserHandle ?? input.advertiser.advertiserHandle,
        advertiserName: record.advertiserName,
        bodyText: record.bodyText,
        brandId: input.advertiser.brandId ?? undefined,
        campaignStatus: record.campaignStatus,
        clicks: record.clicks,
        conversions: record.conversions,
        cpa: record.cpa,
        cpc: record.cpc,
        cpm: record.cpm,
        creativeContent: record.creativeContent,
        creativeMediaUrls: record.creativeMediaUrls,
        ctaText: record.ctaText,
        ctr: record.ctr,
        currency: record.currency,
        dataConfidence: record.dataConfidence,
        date,
        estimatedReach: record.estimatedReach,
        externalAccountId:
          record.externalAccountId ||
          input.advertiser.externalAdvertiserId ||
          input.advertiser.advertiserHandle,
        externalAdId: record.externalAdId,
        fundingEntity: record.fundingEntity,
        granularity: record.granularity,
        headlineText: record.headlineText,
        imageUrls: record.creativeMediaUrls,
        impressions: record.impressions,
        isHalted: record.isHalted,
        landingPageUrl: record.landingPageUrl,
        organizationId: input.organizationId,
        performanceScore: record.performanceScore,
        presentationEndDate: record.presentationEndDate,
        presentationStartDate: record.presentationStartDate,
        reachEstimateMax: record.reachEstimateMax,
        reachEstimateMin: record.reachEstimateMin,
        researchFreshnessState: 'fresh',
        researchObservedAt: input.observedAt,
        researchSnapshotId: input.snapshotId,
        researchSnapshotKey: input.advertiser.id,
        researchSource: 'x_ads_repository',
        scope: 'organization',
        spend: record.spend,
        targetingCountries: record.targetingCountries,
        targetingCriteria: record.targetingCriteria,
      };
    });

    const replacement = await this.adPerformanceService.replaceResearchSnapshot(
      {
        expectedBrandId: input.advertiser.brandId,
        observedAt: input.observedAt,
        organizationId: input.organizationId,
        records,
        researchSource: 'x_ads_repository',
        snapshotId: input.snapshotId,
        snapshotKey: input.advertiser.id,
      },
    );
    return replacement.recordCount;
  }

  private async markUnavailable(
    organizationId: string,
    advertiser: WatchedAdvertiserScope,
    errorCode: string,
  ): Promise<void> {
    await this.adPerformanceService.markResearchSnapshotStale(
      organizationId,
      advertiser.id,
    );

    try {
      await this.xAdWatchedAdvertisersService.recordIngestionResult(
        advertiser.id,
        organizationId,
        {
          errorCode,
          freshnessState: 'unavailable',
          status: 'unavailable',
        },
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.logContext} status update failed for advertiser ${advertiser.id}`,
        error,
      );
    }
  }
}
