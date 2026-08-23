import { XAdsRepositoryIngestionService } from '@api/services/x-ads-repository/services/x-ads-repository-ingestion.service';
import { Injectable } from '@nestjs/common';

type XAdsInspirationAction = 'xAdsInspirationIngestion';

export interface XAdsInspirationWorkflowResult {
  action: XAdsInspirationAction;
  advertisersChecked: number;
  errors: number;
  organizationId: string;
  reason?: string;
  recordsIngested: number;
  skipped: number;
  status: 'completed' | 'skipped';
}

/**
 * Installable workflow seam for X Ads Repository disclosure ingestion.
 *
 * The provider wire contract is not public enough to implement safely. Keep
 * the catalog entry visible, but make every execution exit before networking,
 * persistence, or the legacy ownerless long-running lock. A reviewed transport
 * can replace this cutoff only after readiness can truthfully become available.
 */
@Injectable()
export class XAdsInspirationWorkflowService {
  constructor(
    private readonly xAdsRepositoryIngestionService: XAdsRepositoryIngestionService,
  ) {}

  async runXAdsInspirationIngestion(
    organizationId: string,
  ): Promise<XAdsInspirationWorkflowResult> {
    const readiness = this.xAdsRepositoryIngestionService.getReadiness();
    return {
      action: 'xAdsInspirationIngestion',
      advertisersChecked: 0,
      errors: 0,
      organizationId,
      reason:
        readiness.blockers[0] ?? 'x_ads_repository_contract_fixtures_missing',
      recordsIngested: 0,
      skipped: 1,
      status: 'skipped',
    };
  }
}
