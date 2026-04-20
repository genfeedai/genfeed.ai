/**
 * Campaign Processor
 *
 * BullMQ worker that processes campaign jobs:
 * - Fetches campaign and pending targets
 * - Executes targets with rate limiting
 * - Updates campaign statistics
 */
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@api/services/campaign/dm-campaign-executor.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { CampaignStatus, CampaignType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

import type {
  CampaignProcessingJobData,
  CampaignProcessingResult,
} from './campaign-job.interface';

@Processor('campaign-processing')
export class CampaignProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly campaignsService: OutreachCampaignsService,
    private readonly campaignExecutorService: CampaignExecutorService,
    private readonly dmCampaignExecutorService: DmCampaignExecutorService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'campaign-processing',
      this.logger,
    );
  }

  async process(
    job: Job<CampaignProcessingJobData>,
  ): Promise<CampaignProcessingResult> {
    try {
      return await this.circuitBreaker.execute(() => this.processInternal(job));
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn(error.message);
        throw error;
      }
      throw error;
    }
  }

  private async processInternal(
    job: Job<CampaignProcessingJobData>,
  ): Promise<CampaignProcessingResult> {
    const { campaignId, organizationId } = job.data;

    this.logger.log(`Campaign processing started for ${campaignId}`, {
      campaignId,
      jobId: job.id,
      organizationId,
    });

    try {
      await job.updateProgress(10);

      // Fetch campaign
      const campaign = await this.campaignsService.findOne({
        _id: campaignId,
        isDeleted: false,
        organization: organizationId,
      });

      if (!campaign) {
        this.logger.error(`Campaign ${campaignId} not found`);
        throw new Error(`Campaign ${campaignId} not found`);
      }

      // Check if campaign is still active
      if (campaign.status !== CampaignStatus.ACTIVE) {
        this.logger.log(`Campaign ${campaignId} is not active, skipping`);
        return {
          campaignId,
          failed: 0,
          processed: 0,
          skipped: 0,
          successful: 0,
        };
      }

      await job.updateProgress(30);

      // Branch by campaign type
      const results =
        campaign.campaignType === CampaignType.DM_OUTREACH
          ? await this.dmCampaignExecutorService.processPendingDmTargets(
              campaign,
              10,
            )
          : await this.campaignExecutorService.processPendingTargets(
              campaign,
              10,
            );

      await job.updateProgress(100);

      const summary: CampaignProcessingResult = {
        campaignId,
        failed: results.failed,
        processed: results.processed,
        skipped: results.skipped,
        successful: results.successful,
      };

      this.logger.log(
        `Campaign processing completed for ${campaignId}`,
        summary,
      );

      // Check if all targets have been processed
      if (results.processed === 0) {
        await this.checkCampaignCompletion(campaignId, organizationId);
      }

      return summary;
    } catch (error: unknown) {
      this.logger.error(`Campaign processing failed for ${campaignId}`, error);
      throw error;
    }
  }

  /**
   * Check if all targets have been processed and complete the campaign
   */
  private async checkCampaignCompletion(
    campaignId: string,
    organizationId: string,
  ): Promise<void> {
    const campaign = await this.campaignsService.findOneById(
      campaignId,
      organizationId,
    );

    if (!campaign) {
      return;
    }

    // If no pending targets and campaign is active, it might be complete
    // The frontend can determine this based on target stats
    this.logger.log(
      `Campaign ${campaignId} has no pending targets to process`,
      {
        totalFailed: campaign.totalFailed,
        totalSkipped: campaign.totalSkipped,
        totalSuccessful: campaign.totalSuccessful,
        totalTargets: campaign.totalTargets,
      },
    );
  }
}
