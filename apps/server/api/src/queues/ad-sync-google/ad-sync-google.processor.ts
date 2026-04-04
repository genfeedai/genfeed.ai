import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

export interface GoogleAdSyncJobData {
  credentialId: string;
  organizationId: string;
  brandId: string;
  accessToken: string;
  refreshToken: string;
  customerIds: string[];
  loginCustomerId?: string;
  lastSyncDate?: string;
}

@Injectable()
@Processor('ad-sync-google')
export class AdSyncGoogleProcessor extends WorkerHost {
  private readonly DEFAULT_DELAY_MS = 2000;

  constructor(private readonly logger: LoggerService) {
    super();
  }

  async process(job: Job<GoogleAdSyncJobData>): Promise<void> {
    const { organizationId, customerIds, lastSyncDate } = job.data;

    this.logger.log(
      `Processing Google Ads sync for org ${organizationId}, ${customerIds.length} customers`,
    );

    try {
      const syncFrom = lastSyncDate
        ? new Date(lastSyncDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const syncTo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const customerId of customerIds) {
        try {
          await this.syncCustomerData(job, customerId, syncFrom, syncTo);
          await this.delay(this.DEFAULT_DELAY_MS);
        } catch (error: unknown) {
          this.logger.error(
            `Failed to sync Google customer ${customerId}`,
            (error as Error).message,
          );
        }
      }

      await job.updateProgress(100);
      this.logger.log(`Google Ads sync completed for org ${organizationId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Google Ads sync failed for org ${organizationId}`,
        (error as Error).message,
      );
      throw error;
    }
  }

  private async syncCustomerData(
    job: Job<GoogleAdSyncJobData>,
    _customerId: string,
    _syncFrom: Date,
    _syncTo: Date,
  ): Promise<void> {
    // Implementation will:
    // 1. Execute GAQL queries for campaigns, ad groups, ads
    // 2. Convert cost_micros to USD (divide by 1,000,000)
    // 3. Normalize to AdPerformance schema
    // 4. Upsert via AdPerformanceService.upsertBatch()
    await job.updateProgress(50);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
