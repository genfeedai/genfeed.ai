/**
 * Campaign Queue Service
 *
 * Manages BullMQ jobs for campaign processing:
 * - Processing active campaigns
 * - Scheduling targets for execution
 * - Managing rate-limited job execution
 */
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import type { CampaignProcessingJobData } from '@api/queues/campaign/campaign.processor';
import { CampaignStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class CampaignQueueService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectQueue('campaign-processing')
    private readonly campaignQueue: Queue<CampaignProcessingJobData>,
    private readonly campaignsService: OutreachCampaignsService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger.log(`${this.constructorName} initialized`);
  }

  /**
   * Cron job to process active campaigns every 2 minutes
   * Currently disabled - uncomment to enable
   */
  // @Cron(CronExpression.EVERY_MINUTE)
  async scheduledProcessing(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Get all active campaigns
      const activeCampaigns = await this.getActiveCampaigns();

      this.logger.log(`${url} starting`, {
        campaignCount: activeCampaigns.length,
      });

      for (const campaign of activeCampaigns) {
        await this.queueCampaignProcessing(
          campaign.id,
          campaign.organizationId,
        );
      }

      this.logger.log(`${url} completed`, {
        jobsQueued: activeCampaigns.length,
      });
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  /**
   * Manually trigger processing for a specific campaign
   */
  async triggerProcessing(
    campaignId: string,
    organizationId: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const job = await this.queueCampaignProcessing(
        campaignId,
        organizationId,
      );

      this.logger.log(`${url} triggered`, {
        campaignId,
        jobId: job.id,
        organizationId,
      });

      return job.id!;
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Queue a campaign processing job
   * Uses deterministic job ID to prevent duplicate jobs without scanning the queue
   */
  private async queueCampaignProcessing(
    campaignId: string,
    organizationId: string,
  ): Promise<{ id?: string }> {
    // Use deterministic job ID - BullMQ will reject duplicates automatically
    const jobId = `campaign-${campaignId}`;

    try {
      // Check if job already exists by trying to get it
      const existingJob = await this.campaignQueue.getJob(jobId);
      if (existingJob) {
        const state = await existingJob.getState();
        if (state === 'active' || state === 'waiting' || state === 'delayed') {
          this.logger.log(
            `${this.constructorName} skipping - job already queued`,
            { campaignId, jobId, state },
          );
          return { id: undefined };
        }
        // Job exists but in completed/failed state - remove it to allow new job
        await existingJob.remove();
      }

      return this.campaignQueue.add(
        'process',
        {
          campaignId,
          organizationId,
        },
        {
          jobId,
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );
    } catch (error) {
      // If job ID already exists and is active, BullMQ throws an error
      this.logger.log(`${this.constructorName} job already exists`, {
        campaignId,
        error,
      });
      return { id: undefined };
    }
  }

  /**
   * Get all active campaigns
   */
  private async getActiveCampaigns(): Promise<
    Array<{ id: string; organizationId: string }>
  > {
    try {
      const campaigns = await this.campaignsService.find({
        isDeleted: false,
        status: CampaignStatus.ACTIVE,
      });

      return campaigns.map((campaign) => ({
        id: campaign._id.toString(),
        organizationId: campaign.organization.toString(),
      }));
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} getActiveCampaigns failed`,
        error,
      );
      return [];
    }
  }

  /**
   * Get queue status for monitoring
   */
  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.campaignQueue.getWaitingCount(),
      this.campaignQueue.getActiveCount(),
      this.campaignQueue.getCompletedCount(),
      this.campaignQueue.getFailedCount(),
    ]);

    return { active, completed, failed, waiting };
  }

  /**
   * Pause campaign processing
   */
  async pauseProcessing(): Promise<void> {
    await this.campaignQueue.pause();
    this.logger.log(`${this.constructorName} processing paused`);
  }

  /**
   * Resume campaign processing
   */
  async resumeProcessing(): Promise<void> {
    await this.campaignQueue.resume();
    this.logger.log(`${this.constructorName} processing resumed`);
  }
}
