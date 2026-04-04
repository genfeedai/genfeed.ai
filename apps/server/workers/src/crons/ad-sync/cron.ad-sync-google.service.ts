import type { GoogleAdSyncJobData } from '@api/queues/ad-sync-google/ad-sync-google.processor';
import { QueueService } from '@api/queues/core/queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class CronAdSyncGoogleService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly QUEUE_NAME = 'ad-sync-google';

  constructor(
    private readonly logger: LoggerService,
    private readonly queueService: QueueService,
  ) {}

  @Cron('30 3 * * *') // 3:30 AM daily
  async syncGoogleAds(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      this.logger.log(`${url} completed scheduling`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  async enqueueAdSyncJob(data: GoogleAdSyncJobData): Promise<void> {
    const jitterMs = Math.random() * 30 * 60 * 1000;

    await this.queueService.add(this.QUEUE_NAME, data, {
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      delay: jitterMs,
    });

    this.logger.log(
      `${this.constructorName}: Enqueued Google ad sync for org ${data.organizationId} with ${Math.round(jitterMs / 1000)}s jitter`,
    );
  }
}
