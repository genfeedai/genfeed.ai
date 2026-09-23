import type { PaidCreativeFetchParams } from '@api/services/integrations/apify/services/modules/apify-ads.service';
import { ApifyArchiveProvider } from '@api/services/paid-creative-research/providers/apify-archive.provider';
import type {
  NormalizedPaidCreativeRecord,
  PaidCreativeProvider,
} from '@genfeedai/integrations/ads';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GoogleAdsTransparencyProvider extends ApifyArchiveProvider {
  readonly documentationUrl = 'https://adstransparency.google.com/';
  readonly provider: PaidCreativeProvider = 'google_ads_transparency_center';

  protected runArchive(
    params: PaidCreativeFetchParams,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    return this.apifyAdsService.fetchGoogleAdsTransparencyCreatives(params);
  }
}
