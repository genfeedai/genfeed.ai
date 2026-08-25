import type { PaidCreativeFetchParams } from '@api/services/integrations/apify/services/modules/apify-ads.service';
import { ApifyAdsService } from '@api/services/integrations/apify/services/modules/apify-ads.service';
import type {
  PaidCreativeFetchRequest,
  PaidCreativeProviderAdapter,
  PaidCreativeReadiness,
} from '@api/services/paid-creative-research/interfaces/paid-creative-research.interface';
import type {
  NormalizedPaidCreativeRecord,
  PaidCreativeProvider,
} from '@genfeedai/integrations/ads';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';

/**
 * Shared base for the two archives Genfeed reads through an Apify actor.
 *
 * Readiness is gated on the Apify token rather than swallowed: without it the
 * actor run would return nothing, and reporting "no competitor ads found" when
 * the truth is "we never asked" is the failure mode this class exists to
 * prevent.
 */
@Injectable()
export abstract class ApifyArchiveProvider
  implements PaidCreativeProviderAdapter
{
  abstract readonly documentationUrl: string;
  abstract readonly provider: PaidCreativeProvider;

  constructor(
    protected readonly apifyAdsService: ApifyAdsService,
    protected readonly configService: ConfigService,
  ) {}

  getReadiness(): PaidCreativeReadiness {
    const hasToken = Boolean(this.configService.get('APIFY_API_TOKEN'));

    return {
      available: hasToken,
      blockers: hasToken ? [] : ['paid_creative_apify_token_missing'],
      documentationUrl: this.documentationUrl,
      status: hasToken ? 'available' : 'unavailable',
    };
  }

  async fetchCreatives(
    request: PaidCreativeFetchRequest,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    return this.runArchive({
      ...(request.countries ? { countries: request.countries } : {}),
      limit: request.limit,
      query: request.query,
    });
  }

  protected abstract runArchive(
    params: PaidCreativeFetchParams,
  ): Promise<NormalizedPaidCreativeRecord[]>;
}
