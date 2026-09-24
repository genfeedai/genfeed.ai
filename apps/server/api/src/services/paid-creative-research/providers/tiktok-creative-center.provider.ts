import type { PaidCreativeFetchParams } from '@api/services/integrations/apify/services/modules/apify-ads.service';
import { ApifyArchiveProvider } from '@api/services/paid-creative-research/providers/apify-archive.provider';
import type {
  NormalizedPaidCreativeRecord,
  PaidCreativeProvider,
} from '@genfeedai/integrations/ads';
import { Injectable } from '@nestjs/common';

/** TikTok public ads library: EEA, UK and Switzerland coverage. */
@Injectable()
export class TikTokCreativeCenterProvider extends ApifyArchiveProvider {
  readonly documentationUrl = 'https://library.tiktok.com/ads';
  readonly provider: PaidCreativeProvider = 'tiktok_ads_library';

  protected async runArchive(
    params: PaidCreativeFetchParams,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    return this.apifyAdsService.fetchTikTokAdsLibraryCreatives(params);
  }
}
