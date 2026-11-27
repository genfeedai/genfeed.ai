import { TrendBrandNicheVideoService } from '@api/collections/trends/services/modules/trend-brand-niche-video.service';
import { ResearchScanLimitReachedException } from '@api/helpers/exceptions/research-scan-limit/research-scan-limit.exception';
import { CacheService } from '@api/services/cache/cache.service';
import { runWithApifyCaller } from '@api/services/integrations/apify/utils/apify-caller.context';
import { ResearchScanService } from '@api/services/research-access/research-scan.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const BRAND_READ_PREFIX = 'trends:brand-read';
const BRAND_NICHE_CLAIM_PREFIX = 'trends:brand-niche-claim';

/** A brand that read its trends this recently is still worth a nightly niche search. */
export const BRAND_READ_WINDOW_SECONDS = 7 * 24 * 60 * 60;
/**
 * One on-demand niche search per brand in this window, even when it finds
 * nothing, so a brand whose search comes back empty cannot start a paid run on
 * every read.
 */
export const BRAND_NICHE_CLAIM_SECONDS = 12 * 60 * 60;

/**
 * Remembers which brands looked at their Trends feed lately. The nightly niche
 * search is billed per run, so it only runs for brands that read, and the first
 * read of a brand with no niche videos claims one search for it.
 */
@Traced()
@Injectable()
export class TrendBrandReadService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
    private readonly nicheVideoService: TrendBrandNicheVideoService,
    private readonly researchScanService: ResearchScanService,
  ) {}

  private readKey(organizationId: string, brandId: string): string {
    return this.cacheService.generateKey(
      BRAND_READ_PREFIX,
      organizationId,
      brandId,
    );
  }

  async recordRead(organizationId: string, brandId: string): Promise<void> {
    await this.cacheService.set(
      this.readKey(organizationId, brandId),
      new Date().toISOString(),
      { tags: ['trends'], ttl: BRAND_READ_WINDOW_SECONDS },
    );
  }

  async hasReadRecently(
    organizationId: string,
    brandId: string,
  ): Promise<boolean> {
    return (
      (await this.cacheService.get<string>(
        this.readKey(organizationId, brandId),
      )) !== null
    );
  }

  /**
   * True for exactly one caller in the window. An unreachable cache claims
   * nothing: a paid run is never started on a guess.
   */
  async claimNicheRefresh(
    organizationId: string,
    brandId: string,
  ): Promise<boolean> {
    return (
      (await this.cacheService.claimOnce(
        this.cacheService.generateKey(
          BRAND_NICHE_CLAIM_PREFIX,
          organizationId,
          brandId,
        ),
        BRAND_NICHE_CLAIM_SECONDS,
        ['trends'],
      )) === 'claimed'
    );
  }

  /**
   * A person (or an agent over MCP or the API) looked at this brand's Trends.
   * Remembers it, so the nightly niche search keeps running for the brand, and
   * when the brand has no niche videos yet claims one search for it. The read
   * serves the shared feed meanwhile and never waits for the search. Never
   * throws: a read must not fail because of this.
   */
  async noteRead(
    organizationId: string | undefined,
    brandId: string | undefined,
    refreshNiche: (organizationId: string, brandId: string) => Promise<number>,
  ): Promise<void> {
    if (!organizationId || !brandId) return;
    try {
      await this.recordRead(organizationId, brandId);
      if (await this.nicheVideoService.hasSnapshot(organizationId, brandId))
        return;
      if (!(await this.claimNicheRefresh(organizationId, brandId))) return;
      void runWithApifyCaller('trends.niche-on-read', () =>
        this.scanNicheOnRead(organizationId, brandId, refreshNiche),
      ).catch((error: unknown) => {
        this.loggerService.warn('On-demand brand niche refresh failed', {
          error: error instanceof Error ? error.message : 'unknown',
        });
      });
    } catch (error: unknown) {
      this.loggerService.warn('Could not note a brand trends read', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  /**
   * The search a first read may start. It is a scan like any other, but it
   * starts on its own, so it runs only for an organization on a plan and
   * leaves the weekly scan of an organization without one for the person to
   * spend (#11623). Both refusals are expected, not failures.
   */
  private async scanNicheOnRead(
    organizationId: string,
    brandId: string,
    refreshNiche: (organizationId: string, brandId: string) => Promise<number>,
  ): Promise<number> {
    try {
      return await this.researchScanService.runScan(
        {
          library: 'trends',
          organizationId,
          requiresPlan: true,
          subjectKey: brandId,
        },
        () => refreshNiche(organizationId, brandId),
      );
    } catch (error: unknown) {
      if (
        error instanceof ResearchScanLimitReachedException ||
        (error instanceof ServiceUnavailableException &&
          error.message === 'research_paid_access_required')
      ) {
        return 0;
      }
      throw error;
    }
  }
}
