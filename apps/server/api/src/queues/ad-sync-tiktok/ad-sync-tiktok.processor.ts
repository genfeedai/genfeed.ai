import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

export interface TikTokAdSyncJobData {
  credentialId: string;
  organizationId: string;
  brandId: string;
  accessToken: string;
  advertiserIds: string[];
  lastSyncDate?: string;
}

@Injectable()
@Processor('ad-sync-tiktok')
export class AdSyncTikTokProcessor extends WorkerHost {
  private readonly DEFAULT_DELAY_MS = 2000;

  constructor(private readonly logger: LoggerService) {
    super();
  }

  async process(job: Job<TikTokAdSyncJobData>): Promise<void> {
    const { organizationId, advertiserIds, lastSyncDate } = job.data;

    this.logger.log(
      `Processing TikTok ad sync for org ${organizationId}, ${advertiserIds.length} advertisers`,
    );

    try {
      const syncFrom = lastSyncDate
        ? new Date(lastSyncDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const syncTo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const advertiserId of advertiserIds) {
        try {
          await this.syncAdvertiserData(job, advertiserId, syncFrom, syncTo);
          await this.delay(this.DEFAULT_DELAY_MS);
        } catch (error: unknown) {
          this.logger.error(
            `Failed to sync TikTok advertiser ${advertiserId}`,
            (error as Error).message,
          );
        }
      }

      await job.updateProgress(100);
      this.logger.log(`TikTok ad sync completed for org ${organizationId}`);
    } catch (error: unknown) {
      this.logger.error(
        `TikTok ad sync failed for org ${organizationId}`,
        (error as Error).message,
      );
      throw error;
    }
  }

  private async syncAdvertiserData(
    job: Job<TikTokAdSyncJobData>,
    _advertiserId: string,
    _syncFrom: Date,
    _syncTo: Date,
  ): Promise<void> {
    // Implementation will:
    // 1. Fetch campaigns from TikTok Marketing API
    // 2. For each campaign, fetch reporting data
    // 3. Normalize to AdPerformance schema
    // 4. Upsert via AdPerformanceService.upsertBatch()
    // 5. Update progress
    await job.updateProgress(50);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
