import type { AdPerformance } from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import {
  type NormalizedAdPerformanceRecord,
  normalizeMetaCampaignInsightRecord,
} from '@genfeedai/integrations/ads';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { Types } from 'mongoose';

export interface MetaAdSyncJobData {
  credentialId: string;
  organizationId: string;
  brandId: string;
  accessToken: string;
  adAccountIds: string[];
  lastSyncDate?: string;
}

@Injectable()
@Processor('ad-sync-meta')
export class AdSyncMetaProcessor extends WorkerHost {
  private readonly DEFAULT_DELAY_MS = 2000;

  constructor(
    private readonly adPerformanceService: AdPerformanceService,
    private readonly logger: LoggerService,
    private readonly metaAdsService: MetaAdsService,
  ) {
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
    accountId: string,
    syncFrom: Date,
    syncTo: Date,
  ): Promise<void> {
    const campaigns = await this.metaAdsService.listCampaigns(
      job.data.accessToken,
      accountId,
      { limit: 100 },
    );

    if (campaigns.length === 0) {
      await job.updateProgress(100);
      return;
    }

    const normalizedRecords: Partial<AdPerformance>[] = [];

    for (const campaign of campaigns) {
      const insights = await this.metaAdsService.getCampaignInsights(
        job.data.accessToken,
        campaign.id,
        {
          timeRange: {
            since: this.toDateString(syncFrom),
            until: this.toDateString(syncTo),
          },
        },
      );

      for (const insight of insights) {
        normalizedRecords.push(
          this.toAdPerformanceRecord(
            job.data,
            normalizeMetaCampaignInsightRecord({
              campaign,
              externalAccountId: accountId,
              insight,
            }),
          ),
        );
      }
    }

    if (normalizedRecords.length > 0) {
      await this.adPerformanceService.upsertBatch(normalizedRecords);
    }

    await job.updateProgress(100);
  }

  private toAdPerformanceRecord(
    jobData: MetaAdSyncJobData,
    record: NormalizedAdPerformanceRecord,
  ): Partial<AdPerformance> {
    return {
      adPlatform: 'meta',
      bodyText: record.bodyText,
      brand: new Types.ObjectId(jobData.brandId),
      campaignName: record.campaignName,
      campaignObjective: record.campaignObjective,
      campaignStatus: record.campaignStatus,
      clicks: record.clicks,
      conversions: record.conversions,
      cpa: record.cpa,
      cpc: record.cpc,
      cpm: record.cpm,
      credential: new Types.ObjectId(jobData.credentialId),
      ctaText: record.ctaText,
      ctr: record.ctr,
      currency: record.currency,
      dataConfidence: record.dataConfidence,
      date: new Date(record.date),
      externalAccountId: record.externalAccountId,
      externalAdId: record.externalAdId,
      externalAdSetId: record.externalAdSetId,
      externalCampaignId: record.externalCampaignId,
      granularity: record.granularity,
      headlineText: record.headlineText,
      impressions: record.impressions,
      organization: new Types.ObjectId(jobData.organizationId),
      revenue: record.revenue,
      roas: record.roas,
      spend: record.spend,
    };
  }

  private toDateString(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
