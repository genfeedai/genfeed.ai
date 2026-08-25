import type { PaidCreativeFetchParams } from '@api/services/integrations/apify/services/modules/apify-ads.service';
import { ApifyAdsService } from '@api/services/integrations/apify/services/modules/apify-ads.service';
import { ApifyArchiveProvider } from '@api/services/paid-creative-research/providers/apify-archive.provider';
import type {
  NormalizedPaidCreativeRecord,
  PaidCreativeProvider,
} from '@genfeedai/integrations/ads';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';

/**
 * Meta's Ad Library publishes every active ad on Facebook and Instagram, not
 * just political ones — but the official `ads_archive` Graph endpoint only
 * serves the political/issue subset (plus the EU DSA feed). Commercial
 * competitor research therefore reads the public library surface through an
 * Apify actor.
 */
@Injectable()
export class MetaAdLibraryProvider extends ApifyArchiveProvider {
  readonly documentationUrl = 'https://www.facebook.com/ads/library/';
  readonly provider: PaidCreativeProvider = 'meta_ads_library';

  constructor(apifyAdsService: ApifyAdsService, configService: ConfigService) {
    super(apifyAdsService, configService);
  }

  protected async runArchive(
    params: PaidCreativeFetchParams,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    return this.apifyAdsService.fetchMetaAdLibraryCreatives(params);
  }
}
