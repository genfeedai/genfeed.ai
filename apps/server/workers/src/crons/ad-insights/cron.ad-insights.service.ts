import { QueueService } from '@api/queues/core/queue.service';
import {
  AD_INSIGHTS_AGGREGATION_QUEUE,
  AdInsightsAggregationJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AD_INSIGHTS_INSIGHT_TYPES,
  AD_INSIGHTS_PLATFORM_SCOPE,
  AD_INSIGHTS_SCHEDULE_CRON,
  AD_INSIGHTS_SOURCE_ISSUE,
  buildAdInsightsAggregationJobId,
  buildAdInsightsAggregationWindow,
} from '@workers/crons/ad-insights/ad-insights-scheduling.config';

@Injectable()
export class CronAdInsightsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly queueService: QueueService,
  ) {}

  @Cron(AD_INSIGHTS_SCHEDULE_CRON) // 6 AM UTC every Sunday
  async computeWeeklyInsights(now: Date = new Date()): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const aggregationWindow = buildAdInsightsAggregationWindow(now);
      const idempotencyKey = buildAdInsightsAggregationJobId(aggregationWindow);
      const jobData: AdInsightsAggregationJobData = {
        aggregationWindow,
        idempotencyKey,
        insightTypes: [...AD_INSIGHTS_INSIGHT_TYPES],
        scope: AD_INSIGHTS_PLATFORM_SCOPE,
        sourceIssue: AD_INSIGHTS_SOURCE_ISSUE,
      };

      await this.queueService.add(AD_INSIGHTS_AGGREGATION_QUEUE, jobData, {
        attempts: 2,
        backoff: { delay: 10000, type: 'exponential' },
        jobId: idempotencyKey,
      });

      this.logger.log(
        `${url} weekly platform ad insights aggregation job enqueued for ${aggregationWindow}`,
      );
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}
