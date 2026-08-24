/**
 * Campaign Processor
 *
 * BullMQ worker that processes campaign jobs:
 * - Reloads the campaign under organization + active + non-deleted scope
 * - Executes pending targets with rate limiting
 * - Updates campaign statistics
 */
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { DmCampaignExecutorService } from '@api/services/campaign/dm-campaign-executor.service';
import { CampaignStatus, CampaignType } from '@genfeedai/enums';
import {
  CAMPAIGN_PROCESSING_QUEUE,
  CampaignProcessingJobData,
  CampaignProcessingResult,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@libs/utils/circuit-breaker/circuit-breaker.util';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor(CAMPAIGN_PROCESSING_QUEUE)
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

      const campaign = await this.campaignsService.findOne({
        id: campaignId,
        isDeleted: false,
        organizationId,
      });

      const ineligibleReason = this.ineligibleReason(
        campaign,
        campaignId,
        organizationId,
      );
      if (ineligibleReason) {
        this.logger.log(`Campaign ${campaignId} is ineligible, skipping`, {
          campaignId,
          organizationId,
          reason: ineligibleReason,
        });
        return this.emptyResult(campaignId);
      }

      if (!campaign) {
        return this.emptyResult(campaignId);
      }

      await job.updateProgress(30);

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

      if (results.processed === 0) {
        await this.checkCampaignCompletion(campaignId, organizationId);
      }

      return summary;
    } catch (error: unknown) {
      this.logger.error(`Campaign processing failed for ${campaignId}`, {
        campaignId,
        organizationId,
        reason: 'campaign_processing_failed',
      });
      throw error;
    }
  }

  private ineligibleReason(
    campaign: {
      isDeleted?: boolean;
      organizationId?: string;
      status?: string;
    } | null,
    campaignId: string,
    organizationId: string,
  ): string | undefined {
    if (!campaign) {
      return 'campaign_not_found';
    }

    if (campaign.isDeleted === true) {
      return 'campaign_deleted';
    }

    if (campaign.organizationId !== organizationId) {
      return 'organization_mismatch';
    }

    if (campaign.status !== CampaignStatus.ACTIVE) {
      return 'campaign_not_active';
    }

    if (!campaignId) {
      return 'campaign_id_required';
    }

    return undefined;
  }

  private emptyResult(campaignId: string): CampaignProcessingResult {
    return {
      campaignId,
      failed: 0,
      processed: 0,
      skipped: 1,
      successful: 0,
    };
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
