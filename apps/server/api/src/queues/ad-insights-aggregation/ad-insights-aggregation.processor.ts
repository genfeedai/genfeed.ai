import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

export interface AdInsightsAggregationJobData {
  insightTypes: string[];
  industries?: string[];
}

@Injectable()
@Processor('ad-insights-aggregation')
export class AdInsightsAggregationProcessor extends WorkerHost {
  private readonly MIN_ORGS_FOR_AGGREGATION = 5;

  constructor(private readonly logger: LoggerService) {
    super();
  }

  async process(job: Job<AdInsightsAggregationJobData>): Promise<void> {
    const { insightTypes } = job.data;

    this.logger.log(
      `Processing ad insights aggregation for types: ${insightTypes.join(', ')}`,
    );

    try {
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
    // 2. Check k-anonymity (>= 5 distinct orgs per slice)
    // 3. Compute aggregated metrics weighted by dataConfidence
    // 4. Store in ad_insights collection
    // 5. Set validUntil to 7 days from now
  }
}
