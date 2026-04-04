import type { AdInsightsAggregationJobData } from '@api/queues/ad-insights-aggregation/ad-insights-aggregation.processor';
import { QueueService } from '@api/queues/core/queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class CronAdInsightsService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly QUEUE_NAME = 'ad-insights-aggregation';

  constructor(
    private readonly logger: LoggerService,
    private readonly queueService: QueueService,
  ) {}

  @Cron('0 6 * * 0') // 6 AM every Sunday
  async computeWeeklyInsights(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const jobData: AdInsightsAggregationJobData = {
        insightTypes: [
          'top_headlines',
          'best_ctas',
          'optimal_spend',
          'platform_comparison',
          'industry_benchmark',
        ],
      };

      await this.queueService.add(this.QUEUE_NAME, jobData, {
        attempts: 2,
        backoff: { delay: 10000, type: 'exponential' },
      });

      this.logger.log(`${url} weekly ad insights aggregation job enqueued`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}
