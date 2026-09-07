import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { AdWatchedAdvertisersService } from '@api/collections/ad-watched-advertisers/services/ad-watched-advertisers.service';
import { PerformanceSummaryService } from '@api/collections/content-performance/services/performance-summary.service';
import { SocialSourcesQueryDto } from '@api/collections/social-sources/dto/social-sources-query.dto';
import { SocialSourcesService } from '@api/collections/social-sources/services/social-sources.service';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import { PLAN_PERFORMANCE_WINDOW_DAYS } from '@api/services/content-engine/plan-performance-context.service';
import { PatternMatcherService } from '@api/services/pattern-matcher/pattern-matcher.service';
import type {
  IContentPlanSeedAdvertiser,
  IContentPlanSeedPreview,
  IContentPlanSeedSource,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** How many watched-advertiser ads to read when computing per-advertiser counts. */
const ADVERTISER_AD_PREVIEW_LIMIT = 200;
/** How many active social sources the preview shows a caller. */
const SOURCE_PREVIEW_LIMIT = 100;
/** Bounded read used only to size the pattern count, not to list patterns. */
const PATTERN_COUNT_LIMIT = 50;

/**
 * Builds the seed-selection preview a caller sees before generating a content
 * plan (#4511 Lane F): the same competitor-ad, followed-creator and
 * creative-pattern sources `PlanPerformanceContextService` seeds a cold-start
 * plan from by default, surfaced so the caller can choose a subset instead.
 */
@Injectable()
export class ContentPlanSeedsService {
  constructor(
    private readonly performanceSummaryService: PerformanceSummaryService,
    private readonly adWatchedAdvertisersService: AdWatchedAdvertisersService,
    private readonly adPerformanceService: AdPerformanceService,
    private readonly socialSourcesService: SocialSourcesService,
    private readonly sourcePostsService: SourcePostsService,
    private readonly patternMatcherService: PatternMatcherService,
    private readonly logger: LoggerService,
  ) {}

  async buildPreview(
    organizationId: string,
    brandId: string,
  ): Promise<IContentPlanSeedPreview> {
    const [dataset, advertisers, sources, patternCount] = await Promise.all([
      this.loadDataset(organizationId, brandId),
      this.loadAdvertisers(organizationId, brandId),
      this.loadSources(organizationId, brandId),
      this.loadPatternCount(organizationId, brandId),
    ]);

    return {
      advertisers,
      dataset,
      importedPostCount: dataset.importedPosts,
      isColdStart:
        dataset.confidence === 'none' || dataset.confidence === 'low',
      patternCount,
      sources,
    };
  }

  private async loadDataset(
    organizationId: string,
    brandId: string,
  ): Promise<IContentPlanSeedPreview['dataset']> {
    try {
      const summary = await this.performanceSummaryService.getWeeklySummary(
        organizationId,
        brandId,
        {
          startDate: new Date(
            Date.now() - PLAN_PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
          ),
        },
      );
      return summary.dataset;
    } catch (error: unknown) {
      this.logger.warn('Seed preview: performance summary unavailable', {
        brandId,
        error: (error as Error)?.message,
      });
      return {
        confidence: 'none',
        genfeedPosts: 0,
        importedPosts: 0,
        totalPosts: 0,
      };
    }
  }

  private async loadAdvertisers(
    organizationId: string,
    brandId: string,
  ): Promise<IContentPlanSeedAdvertiser[]> {
    try {
      const watched = await this.adWatchedAdvertisersService.findAllByAccount(
        organizationId,
        brandId,
      );
      const fresh = watched.filter(
        (advertiser) => advertiser.freshnessState === 'fresh',
      );
      if (fresh.length === 0) {
        return [];
      }

      const ads = await this.adPerformanceService.findByWatchedAdvertisers({
        advertiserIds: fresh.map((advertiser) => advertiser.id),
        brandId,
        limit: ADVERTISER_AD_PREVIEW_LIMIT,
        organizationId,
      });

      return fresh.map((advertiser) => {
        // findByWatchedAdvertisers orders by performanceScore desc, so the
        // first matching row is this advertiser's top performer.
        const advertiserAds = ads.filter(
          (ad) => ad.researchSnapshotKey === advertiser.id,
        );
        return {
          adCount: advertiserAds.length,
          id: advertiser.id,
          name: advertiser.advertiserName || advertiser.advertiserHandle,
          platform: advertiser.platform,
          topHeadline: advertiserAds[0]?.headlineText ?? null,
        };
      });
    } catch (error: unknown) {
      this.logger.warn('Seed preview: watched advertisers unavailable', {
        brandId,
        error: (error as Error)?.message,
      });
      return [];
    }
  }

  private async loadSources(
    organizationId: string,
    brandId: string,
  ): Promise<IContentPlanSeedSource[]> {
    try {
      const [sourcesResult, postCounts] = await Promise.all([
        this.socialSourcesService.findAllScoped({ brandId, organizationId }, {
          isActive: true,
          limit: SOURCE_PREVIEW_LIMIT,
          page: 1,
        } as SocialSourcesQueryDto),
        this.sourcePostsService.countRecentPostsBySource(
          organizationId,
          brandId,
          PLAN_PERFORMANCE_WINDOW_DAYS,
        ),
      ]);

      return sourcesResult.docs.map((source) => ({
        displayName: source.displayName ?? null,
        handle: source.handle,
        id: source.id,
        platform: source.platform,
        postCount: postCounts[source.id] ?? 0,
        sourceType: source.sourceType,
      }));
    } catch (error: unknown) {
      this.logger.warn('Seed preview: followed sources unavailable', {
        brandId,
        error: (error as Error)?.message,
      });
      return [];
    }
  }

  private async loadPatternCount(
    organizationId: string,
    brandId: string,
  ): Promise<number> {
    try {
      const patterns = await this.patternMatcherService.getTopPatternsForBrand(
        organizationId,
        brandId,
        { limit: PATTERN_COUNT_LIMIT },
      );
      return patterns?.length ?? 0;
    } catch (error: unknown) {
      this.logger.warn('Seed preview: creative patterns unavailable', {
        brandId,
        error: (error as Error)?.message,
      });
      return 0;
    }
  }
}
