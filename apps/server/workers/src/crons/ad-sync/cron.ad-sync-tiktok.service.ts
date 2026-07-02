import { QueueService } from '@api/queues/core/queue.service';
import {
  AD_SYNC_TIKTOK_QUEUE,
  TikTokAdSyncJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CronAdSyncTikTokService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly QUEUE_NAME = AD_SYNC_TIKTOK_QUEUE;

  constructor(
    private readonly logger: LoggerService,
    private readonly queueService: QueueService,
  ) {}

  async syncTikTokAds(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      // In production, this would query credentials collection for all
      // TikTok credentials with ads_management scope
      this.logger.log(`${url} completed scheduling`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  async enqueueAdSyncJob(data: TikTokAdSyncJobData): Promise<void> {
    const jitterMs = Math.random() * 30 * 60 * 1000;

    await this.queueService.add(this.QUEUE_NAME, data, {
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      delay: jitterMs,
    });

    this.logger.log(
      `${this.constructorName}: Enqueued TikTok ad sync for org ${data.organizationId} with ${Math.round(jitterMs / 1000)}s jitter`,
    );
  }
}
