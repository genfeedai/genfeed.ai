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
 * TikTok's Creative Center is a public top-ads showcase with no official API,
 * so it is read through an Apify actor. It discloses view counts and CTR but
 * never spend or impressions — the normalizer leaves those absent rather than
 * defaulting them to zero.
 */
@Injectable()
export class TikTokCreativeCenterProvider extends ApifyArchiveProvider {
  readonly documentationUrl =
    'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en';
  readonly provider: PaidCreativeProvider = 'tiktok_creative_center';

  constructor(apifyAdsService: ApifyAdsService, configService: ConfigService) {
    super(apifyAdsService, configService);
  }

  protected async runArchive(
    params: PaidCreativeFetchParams,
  ): Promise<NormalizedPaidCreativeRecord[]> {
    return this.apifyAdsService.fetchTikTokCreativeCenterCreatives(params);
  }
}
