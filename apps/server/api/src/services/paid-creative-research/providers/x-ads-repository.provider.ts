import type {
  PaidCreativeProviderAdapter,
  PaidCreativeReadiness,
  PaidCreativeReadinessBlocker,
} from '@api/services/paid-creative-research/interfaces/paid-creative-research.interface';
import type {
  NormalizedPaidCreativeRecord,
  PaidCreativeProvider,
} from '@genfeedai/integrations/ads';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const X_ADS_REPOSITORY_DOCUMENTATION_URL =
  'https://business.x.com/en/help/ads-policies/product-policies/ads-transparency';

/**
 * Fail-closed boundary for X Ads Repository exports.
 *
 * X documents two persisted operations and their required high-level inputs,
 * but does not publish the create/status response envelopes, CSV column
 * contract, geo-code vocabulary, status vocabulary, quotas, or download-auth
 * rules. Shipping a guessed client would create both data-integrity and
 * credential-exfiltration risk. The transport therefore remains unreachable
 * until sanitized, authorized fixtures establish those contracts in code and
 * X entitlement/commercial-use approval is recorded explicitly.
 *
 * Unlike the other archives, the X repository is a DSA disclosure feed: even
 * once it is reachable, its creatives are `disclosure_only` and never remix
 * input (`resolvePaidCreativeUsagePolicy`).
 */
@Injectable()
export class XAdsRepositoryProvider implements PaidCreativeProviderAdapter {
  readonly provider: PaidCreativeProvider = 'x_ads_repository';

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  getReadiness(): PaidCreativeReadiness {
    const blockers: PaidCreativeReadinessBlocker[] = [];

    if (
      this.configService.get('X_ADS_REPOSITORY_ENTITLEMENT_CONFIRMED') !==
      'true'
    ) {
      blockers.push('x_ads_repository_entitlement_not_confirmed');
    }

    if (
      this.configService.get('X_ADS_REPOSITORY_COMMERCIAL_USE_APPROVED') !==
      'true'
    ) {
      blockers.push('x_ads_repository_commercial_use_not_approved');
    }

    // This blocker is intentionally unconditional. It can be removed only by
    // a code change that adds reviewed fixtures and implements their exact
    // wire/CSV contract; an environment flag must never bypass that review.
    blockers.push('x_ads_repository_contract_fixtures_missing');

    return {
      available: false,
      blockers,
      documentationUrl: X_ADS_REPOSITORY_DOCUMENTATION_URL,
      status: 'unavailable',
    };
  }

  async fetchCreatives(): Promise<NormalizedPaidCreativeRecord[]> {
    const readiness = this.getReadiness();
    this.loggerService.warn('X Ads Repository export is unavailable', {
      blockers: readiness.blockers,
    });

    throw new ServiceUnavailableException({
      detail:
        'X Ads Repository ingestion is unavailable until its provider contract and commercial-use prerequisites are verified.',
      errorCode: readiness.blockers[0],
      title: 'X Ads Repository unavailable',
    });
  }
}
