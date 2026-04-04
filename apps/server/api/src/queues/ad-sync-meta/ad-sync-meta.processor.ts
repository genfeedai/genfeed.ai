import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

export interface MetaAdSyncJobData {
  credentialId: string;
  organizationId: string;
  brandId: string;
  accessToken: string;
  adAccountIds: string[];
  lastSyncDate?: string;
}

interface NormalizedAdRecord {
  adPlatform: 'meta';
  externalAccountId: string;
  externalCampaignId?: string;
  externalAdSetId?: string;
  externalAdId?: string;
  granularity: 'campaign' | 'adset' | 'ad';
  campaignName?: string;
  campaignObjective?: string;
  campaignStatus?: string;
  headlineText?: string;
  bodyText?: string;
  ctaText?: string;
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions?: number;
  revenue?: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa?: number;
  roas?: number;
  date: Date;
  dataConfidence: number;
}

@Injectable()
@Processor('ad-sync-meta')
export class AdSyncMetaProcessor extends WorkerHost {
  private readonly DEFAULT_DELAY_MS = 2000;

  constructor(private readonly logger: LoggerService) {
    super();
  }

  async process(job: Job<MetaAdSyncJobData>): Promise<void> {
    const { organizationId, adAccountIds, lastSyncDate } = job.data;

    this.logger.log(
      `Processing Meta ad sync for org ${organizationId}, ${adAccountIds.length} accounts`,
    );

    try {
      const syncFrom = lastSyncDate
        ? new Date(lastSyncDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const syncTo = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

      for (const accountId of adAccountIds) {
        try {
          await this.syncAccountData(job, accountId, syncFrom, syncTo);
          await this.delay(this.DEFAULT_DELAY_MS);
        } catch (error: unknown) {
          this.logger.error(
            `Failed to sync Meta account ${accountId}`,
            (error as Error).message,
          );
        }
      }

      await job.updateProgress(100);
      this.logger.log(`Meta ad sync completed for org ${organizationId}`);
    } catch (error: unknown) {
      this.logger.error(
        `Meta ad sync failed for org ${organizationId}`,
        (error as Error).message,
      );
      throw error;
    }
  }

  private async syncAccountData(
    job: Job<MetaAdSyncJobData>,
    _accountId: string,
    _syncFrom: Date,
    _syncTo: Date,
  ): Promise<void> {
    // Implementation will:
    // 1. Fetch campaigns from Meta Marketing API
    // 2. For each campaign, fetch insights
    // 3. Normalize to AdPerformance schema
    // 4. Upsert via AdPerformanceService.upsertBatch()
    // 5. Update progress
    await job.updateProgress(50);
  }

  private computeDataConfidence(record: NormalizedAdRecord): number {
    if (record.revenue !== undefined && record.conversions !== undefined) {
      return 1.0;
    }
    if (record.conversions !== undefined) {
      return 0.7;
    }
    return 0.5;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
