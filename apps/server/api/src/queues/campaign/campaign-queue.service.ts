/**
 * Campaign Queue Service
 *
 * Enqueues BullMQ jobs for outreach campaign processing. Recurring dispatch is
 * owned by the outreach-campaign-dispatch system workflow, not a static @Cron.
 */

import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { CampaignStatus } from '@genfeedai/enums';
import {
  CAMPAIGN_PROCESSING_QUEUE,
  CampaignProcessingJobData,
} from '@genfeedai/queue-contracts';
import { reserveIdempotentJob } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

export const CAMPAIGN_PROCESSING_JOB_NAME = 'process';
export const MAX_ACTIVE_CAMPAIGNS_PER_DISPATCH = 20;

export type CampaignDispatchStatus = 'completed' | 'failed' | 'skipped';

export interface CampaignDispatchResult {
  alreadyQueued: number;
  enqueued: number;
  failed: number;
  organizationId: string;
  reason?: string;
  skipped: number;
  status: CampaignDispatchStatus;
}

export function buildCampaignProcessingJobId(campaignId: string): string {
  return `campaign-${campaignId}`;
}

@Injectable()
export class CampaignQueueService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectQueue(CAMPAIGN_PROCESSING_QUEUE)
    @Optional()
    private readonly campaignQueue: Queue<CampaignProcessingJobData>,
    @Optional() private readonly campaignsService: OutreachCampaignsService,
    @Optional() private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger.log(`${this.constructorName} initialized`);
  }

  /**
   * Queue processing for every eligible active campaign in one organization.
   * Production owner is the outreach-campaign-dispatch workflow executor.
   */
  async dispatchActiveCampaigns(
    organizationId: string,
  ): Promise<CampaignDispatchResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!organizationId) {
      return this.emptyDispatch(organizationId, 'organization_id_required');
    }

    if (!this.campaignsService) {
      this.logger.error(`${url} skipped`, {
        organizationId,
        reason: 'campaigns_service_unavailable',
      });
      return this.emptyDispatch(
        organizationId,
        'campaigns_service_unavailable',
      );
    }

    if (!this.campaignQueue) {
      this.logger.error(`${url} skipped`, {
        organizationId,
        reason: 'campaign_queue_unavailable',
      });
      return this.emptyDispatch(organizationId, 'campaign_queue_unavailable');
    }

    try {
      const campaigns = await this.campaignsService.find({
        isDeleted: false,
        organizationId,
        status: CampaignStatus.ACTIVE,
      });

      this.logger.log(`${url} starting`, {
        campaignCount: campaigns.length,
        organizationId,
      });

      let alreadyQueued = 0;
      let enqueued = 0;
      let failed = 0;
      let skipped = 0;
      const bounded = campaigns.slice(0, MAX_ACTIVE_CAMPAIGNS_PER_DISPATCH);

      if (campaigns.length > bounded.length) {
        skipped += campaigns.length - bounded.length;
        this.logger.log(`${url} bounded active-campaign scan`, {
          bounded: bounded.length,
          organizationId,
          total: campaigns.length,
        });
      }

      for (const campaign of bounded) {
        const campaignId = String(campaign.id);
        if (
          !campaignId ||
          campaign.organizationId !== organizationId ||
          campaign.isDeleted === true
        ) {
          skipped += 1;
          continue;
        }

        try {
          const outcome = await this.enqueueCampaignProcessing(
            campaignId,
            organizationId,
          );
          if (outcome === 'already_queued') {
            alreadyQueued += 1;
          } else {
            enqueued += 1;
          }
        } catch {
          failed += 1;
          this.logger.error(`${url} enqueue failed`, {
            campaignId,
            organizationId,
            reason: 'campaign_enqueue_failed',
          });
        }
      }

      const status: CampaignDispatchStatus =
        failed > 0 && enqueued === 0 && alreadyQueued === 0
          ? 'failed'
          : campaigns.length === 0
            ? 'skipped'
            : 'completed';

      this.logger.log(`${url} completed`, {
        alreadyQueued,
        enqueued,
        failed,
        organizationId,
        skipped,
        status,
      });

      return {
        alreadyQueued,
        enqueued,
        failed,
        organizationId,
        reason:
          campaigns.length === 0
            ? 'no_active_campaigns'
            : failed > 0
              ? 'campaign_enqueue_failed'
              : undefined,
        skipped,
        status,
      };
    } catch {
      this.logger.error(`${url} failed`, {
        organizationId,
        reason: 'campaign_dispatch_failed',
      });
      return {
        alreadyQueued: 0,
        enqueued: 0,
        failed: 1,
        organizationId,
        reason: 'campaign_dispatch_failed',
        skipped: 0,
        status: 'failed',
      };
    }
  }

  /**
   * Manually trigger processing for a specific campaign.
   * Queue failures surface to the caller; already-queued is idempotent success.
   */
  async triggerProcessing(
    campaignId: string,
    organizationId: string,
  ): Promise<string | undefined> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const outcome = await this.enqueueCampaignProcessing(
        campaignId,
        organizationId,
      );
      const jobId = buildCampaignProcessingJobId(campaignId);

      this.logger.log(`${url} triggered`, {
        campaignId,
        jobId,
        organizationId,
        outcome,
      });

      return jobId;
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, {
        campaignId,
        organizationId,
        reason: 'campaign_enqueue_failed',
      });
      throw error;
    }
  }

  /**
   * Queue a campaign processing job with a deterministic job id so overlapping
   * ticks and retries cannot create a second in-flight send.
   */
  private async enqueueCampaignProcessing(
    campaignId: string,
    organizationId: string,
  ): Promise<'already_queued' | 'enqueued'> {
    if (!this.campaignQueue) {
      throw new Error('campaign_queue_unavailable');
    }

    const jobId = buildCampaignProcessingJobId(campaignId);
    const reservation = await reserveIdempotentJob(this.campaignQueue, jobId);
    if (reservation.alreadyQueued) {
      this.logger.log(`${this.constructorName} skipping - job already queued`, {
        campaignId,
        jobId,
        organizationId,
        state: reservation.state,
      });
      return 'already_queued';
    }

    await this.campaignQueue.add(
      CAMPAIGN_PROCESSING_JOB_NAME,
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

    return 'enqueued';
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

  private emptyDispatch(
    organizationId: string,
    reason: string,
  ): CampaignDispatchResult {
    return {
      alreadyQueued: 0,
      enqueued: 0,
      failed: 0,
      organizationId,
      reason,
      skipped: 0,
      status: 'skipped',
    };
  }
}
