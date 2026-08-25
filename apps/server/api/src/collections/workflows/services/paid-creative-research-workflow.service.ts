import { PaidCreativeResearchIngestionService } from '@api/services/paid-creative-research/services/paid-creative-research-ingestion.service';
import { Injectable } from '@nestjs/common';

type PaidCreativeResearchAction = 'paidCreativeResearchIngestion';

export interface PaidCreativeResearchWorkflowResult {
  action: PaidCreativeResearchAction;
  advertisersChecked: number;
  errors: number;
  organizationId: string;
  reason?: string;
  recordsIngested: number;
  skipped: number;
  status: 'completed' | 'skipped';
}

/**
 * Scheduled competitor paid-creative research across every ad platform
 * (#3537, generalizing the X-only node from #3395).
 *
 * The run is attempted whenever at least one provider adapter reports ready —
 * today Meta Ad Library and TikTok Creative Center via Apify. When no adapter
 * is ready the node skips with the first blocker as the reason instead of
 * writing an empty snapshot, so "we could not look" never reads downstream as
 * "the competitor is running no ads".
 */
@Injectable()
export class PaidCreativeResearchWorkflowService {
  constructor(
    private readonly paidCreativeResearchIngestionService: PaidCreativeResearchIngestionService,
  ) {}

  async runPaidCreativeResearchIngestion(
    organizationId: string,
  ): Promise<PaidCreativeResearchWorkflowResult> {
    const readiness = this.paidCreativeResearchIngestionService.getReadiness();
    const availablePlatforms = readiness.filter((entry) => entry.available);

    if (availablePlatforms.length === 0) {
      return {
        action: 'paidCreativeResearchIngestion',
        advertisersChecked: 0,
        errors: 0,
        organizationId,
        reason:
          readiness.flatMap((entry) => entry.blockers)[0] ??
          'paid_creative_source_unavailable',
        recordsIngested: 0,
        skipped: 1,
        status: 'skipped',
      };
    }

    const results =
      await this.paidCreativeResearchIngestionService.ingestForAccount(
        organizationId,
      );

    return {
      action: 'paidCreativeResearchIngestion',
      advertisersChecked: results.length,
      errors: results.filter((result) => result.status === 'error').length,
      organizationId,
      recordsIngested: results.reduce(
        (total, result) => total + result.recordCount,
        0,
      ),
      skipped: results.filter((result) => result.status === 'unavailable')
        .length,
      status: 'completed',
    };
  }
}
