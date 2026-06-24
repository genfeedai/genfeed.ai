import type { AdInsightsAggregationJobData } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AD_INSIGHTS_AGGREGATION_QUEUE,
  AD_INSIGHTS_MIN_ORGS_FOR_AGGREGATION,
  AD_INSIGHTS_PLATFORM_SCOPE,
} from '@workers/crons/ad-insights/ad-insights-scheduling.config';
import { Job } from 'bullmq';

@Injectable()
@Processor(AD_INSIGHTS_AGGREGATION_QUEUE)
export class AdInsightsAggregationProcessor extends WorkerHost {
  constructor(private readonly logger: LoggerService) {
    super();
  }

  async process(job: Job<AdInsightsAggregationJobData>): Promise<void> {
    const { aggregationWindow = 'legacy', insightTypes, scope } = job.data;

    try {
      if (scope !== AD_INSIGHTS_PLATFORM_SCOPE) {
        throw new BadRequestException(
          `Unsupported ad insights aggregation scope: ${String(scope)}`,
        );
      }

      this.logger.log(
        `Processing platform ad insights aggregation for window ${aggregationWindow}, min orgs ${AD_INSIGHTS_MIN_ORGS_FOR_AGGREGATION}, and types: ${insightTypes.join(', ')}`,
      );

      for (const insightType of insightTypes) {
        try {
          await this.computeInsight(insightType);
        } catch (error: unknown) {
          this.logger.error(
            `Failed to compute insight: ${insightType}`,
            (error as Error).message,
          );
        }
      }

      await job.updateProgress(100);
      this.logger.log('Ad insights aggregation completed');
    } catch (error: unknown) {
      this.logger.error(
        'Ad insights aggregation failed',
        (error as Error).message,
      );
      throw error;
    }
  }

  private async computeInsight(_insightType: string): Promise<void> {
    // Implementation will:
    // 1. Query ad_performance with scope: 'public'
    // 2. Check k-anonymity (>= AD_INSIGHTS_MIN_ORGS_FOR_AGGREGATION distinct orgs per slice)
    // 3. Compute aggregated metrics weighted by dataConfidence
    // 4. Store in ad_insights collection
    // 5. Set validUntil to 7 days from now
  }
}
