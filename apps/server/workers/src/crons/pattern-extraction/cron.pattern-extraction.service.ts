import { QueueService } from '@api/queues/core/queue.service';
import type { PatternExtractionJobData } from '@api/queues/pattern-extraction/pattern-extraction.processor';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class CronPatternExtractionService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly QUEUE_NAME = 'pattern-extraction';

  constructor(
    private readonly logger: LoggerService,
    private readonly queueService: QueueService,
  ) {}

  @Cron('0 2 * * *') // 2 AM daily
  async computeDailyPatterns(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const platforms = [
        'tiktok',
        'instagram',
        'facebook',
        'youtube',
        'google_ads',
        'all',
      ];

      for (const platform of platforms) {
        const jobData: PatternExtractionJobData = { platform };

        await this.queueService.add(this.QUEUE_NAME, jobData, {
          attempts: 2,
          backoff: { delay: 10000, type: 'exponential' },
        });
      }

      this.logger.log(
        `${url} enqueued ${platforms.length} pattern extraction jobs`,
      );
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}
