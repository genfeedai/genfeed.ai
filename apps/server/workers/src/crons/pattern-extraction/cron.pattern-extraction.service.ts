import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PatternExtractionQueueService } from '@workers/queues/pattern-extraction-queue.service';

@Injectable()
export class CronPatternExtractionService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly patternExtractionQueueService: PatternExtractionQueueService,
  ) {}

  @Cron('0 2 * * *') // 2 AM daily
  async computeDailyPatterns(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      await this.patternExtractionQueueService.enqueueScan();

      this.logger.log(`${url} enqueued 1 pattern extraction scan`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}
