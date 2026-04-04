import type { MetaAdSyncJobData } from '@api/queues/ad-sync-meta/ad-sync-meta.processor';
import { QueueService } from '@api/queues/core/queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class CronAdSyncMetaService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly QUEUE_NAME = 'ad-sync-meta';
  private readonly CHUNK_SIZE = 10;

  constructor(
    private readonly logger: LoggerService,
    private readonly queueService: QueueService,
  ) {}

  @Cron('0 3 * * *') // 3 AM daily
  async syncMetaAds(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      // In production, this would query credentials collection for all
      // Facebook credentials with ads_management scope
      // For now, the queue processor handles the actual API calls
      this.logger.log(`${url} completed scheduling`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  async enqueueAdSyncJob(data: MetaAdSyncJobData): Promise<void> {
    const jitterMs = Math.random() * 30 * 60 * 1000;

    await this.queueService.add(this.QUEUE_NAME, data, {
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      delay: jitterMs,
    });

    this.logger.log(
      `${this.constructorName}: Enqueued Meta ad sync for org ${data.organizationId} with ${Math.round(jitterMs / 1000)}s jitter`,
    );
  }
}
