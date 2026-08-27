import { CampaignQueueService } from '@api/queues/campaign/campaign-queue.service';
import { CacheService } from '@server/services/cache/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

const LOCK_TTL_SECONDS = 60;

export interface OutreachCampaignDispatchWorkflowResult {
  action: 'outreachCampaignDispatch';
  alreadyQueued: number;
  enqueued: number;
  failed: number;
  organizationId: string;
  reason?: string;
  skipped: number;
  status: 'completed' | 'failed' | 'skipped';
}

@Injectable()
export class OutreachCampaignDispatchWorkflowService {
  private readonly logContext = 'OutreachCampaignDispatchWorkflowService';

  constructor(
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
    @Optional() private readonly campaignQueueService?: CampaignQueueService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  async runActiveCampaignDispatch(
    organizationId: string,
  ): Promise<OutreachCampaignDispatchWorkflowResult> {
    const action = 'outreachCampaignDispatch' as const;
    const lockKey = this.lockKey(organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return this.skipped(
        organizationId,
        'outreach_campaign_dispatch_already_running',
      );
    }

    try {
      const campaignQueueService = this.resolveCampaignQueueService();
      if (!campaignQueueService) {
        this.logger.error(`${this.logContext} queue service unavailable`, {
          organizationId,
          reason: 'campaign_queue_service_unavailable',
        });
        return this.skipped(
          organizationId,
          'campaign_queue_service_unavailable',
        );
      }

      const result =
        await campaignQueueService.dispatchActiveCampaigns(organizationId);

      return {
        action,
        alreadyQueued: result.alreadyQueued,
        enqueued: result.enqueued,
        failed: result.failed,
        organizationId,
        reason: result.reason,
        skipped: result.skipped,
        status: result.status,
      };
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  private resolveCampaignQueueService(): CampaignQueueService | undefined {
    if (this.campaignQueueService) {
      return this.campaignQueueService;
    }

    return this.resolveProvider(CampaignQueueService);
  }

  private resolveProvider<T>(token: Type<T>): T | undefined {
    try {
      return this.moduleRef?.get(token, { strict: false });
    } catch {
      return undefined;
    }
  }

  private skipped(
    organizationId: string,
    reason: string,
  ): OutreachCampaignDispatchWorkflowResult {
    return {
      action: 'outreachCampaignDispatch',
      alreadyQueued: 0,
      enqueued: 0,
      failed: 0,
      organizationId,
      reason,
      skipped: 1,
      status: 'skipped',
    };
  }

  private lockKey(organizationId: string): string {
    return ['workflow-outreach-campaign-dispatch', organizationId].join(':');
  }
}
