import type {
  PaidCreativeProviderAdapter,
  PaidCreativeReadiness,
} from '@api/services/paid-creative-research/interfaces/paid-creative-research.interface';
import type {
  NormalizedPaidCreativeRecord,
  PaidCreativeProvider,
} from '@genfeedai/integrations/ads';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const GOOGLE_ADS_TRANSPARENCY_DOCUMENTATION_URL =
  'https://adstransparency.google.com/';

/**
 * Fail-closed boundary for the Google Ads Transparency Center, which covers
 * both Search/Display creatives and YouTube video ads (YouTube has no separate
 * archive of its own).
 *
 * Google publishes the center as a web surface only: there is no documented
 * API, no stable response envelope, and no published quota or attribution
 * contract. Shipping a guessed scraper would produce silently wrong competitor
 * data, so the transport stays unreachable until reviewed fixtures establish
 * the contract in code. This blocker is intentionally unconditional and no
 * environment flag may bypass it.
 */
@Injectable()
export class GoogleAdsTransparencyProvider
  implements PaidCreativeProviderAdapter
{
  readonly provider: PaidCreativeProvider = 'google_ads_transparency_center';

  getReadiness(): PaidCreativeReadiness {
    return {
      available: false,
      blockers: ['google_ads_transparency_contract_fixtures_missing'],
      documentationUrl: GOOGLE_ADS_TRANSPARENCY_DOCUMENTATION_URL,
      status: 'unavailable',
    };
  }

  async fetchCreatives(): Promise<NormalizedPaidCreativeRecord[]> {
    throw new ServiceUnavailableException({
      detail:
        'Google Ads Transparency Center ingestion is unavailable until its provider contract is verified against reviewed fixtures.',
      errorCode: 'google_ads_transparency_contract_fixtures_missing',
      title: 'Google Ads Transparency Center unavailable',
    });
  }
}
