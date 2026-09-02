import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { CAMPAIGN_DISPATCH_ACTION_IDS } from '@api/services/campaign/campaign-dispatch-workflow-definition';
import { isCampaignOutreachPairExecutable } from '@api/services/campaign/outreach-capability.util';
import { CampaignType } from '@genfeedai/enums';
import { Injectable, type OnModuleInit } from '@nestjs/common';

const MAX_ACTIVE_CAMPAIGNS_PER_DISPATCH = 20;

type CampaignBatchRequest = {
  campaignId: string;
  limit: number;
  organizationId: string;
};

type CampaignDispatchDiscovery = {
  dmItems: CampaignBatchRequest[];
  organizationId: string;
  replyItems: CampaignBatchRequest[];
  skipped: number;
  total: number;
};

type ScheduledBatch = {
  count: number;
  results: Array<{ index: number; jobId: string }>;
};

export interface OutreachCampaignDispatchWorkflowResult {
  action: 'campaign.dispatch.active';
  alreadyQueued: number;
  enqueued: number;
  failed: number;
  organizationId: string;
  reason?: string;
  skipped: number;
  status: 'completed' | 'failed' | 'skipped';
}

@Injectable()
export class OutreachCampaignDispatchWorkflowService implements OnModuleInit {
  constructor(
    private readonly campaignsService: OutreachCampaignsService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerAction(
      CAMPAIGN_DISPATCH_ACTION_IDS.DISCOVER,
      (request) => this.discoverAction(request),
    );
    this.workflowRunner.registerAction(
      CAMPAIGN_DISPATCH_ACTION_IDS.FINALIZE,
      (request) => this.finalizeAction(request),
    );
  }

  private async discoverAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignDispatchDiscovery> {
    const request = this.readRecord(action.input.request);
    const organizationId = this.requiredString(
      request.organizationId ?? action.context.organizationId,
      'organizationId',
    );
    const campaigns =
      await this.campaignsService.findActiveForDispatch(organizationId);
    const bounded = campaigns.slice(0, MAX_ACTIVE_CAMPAIGNS_PER_DISPATCH);
    return bounded.reduce<CampaignDispatchDiscovery>(
      (discovery, campaign) => {
        if (
          campaign.organizationId !== organizationId ||
          campaign.isDeleted ||
          !isCampaignOutreachPairExecutable({
            campaignType: campaign.campaignType,
            platform: campaign.platform,
          })
        ) {
          discovery.skipped += 1;
          return discovery;
        }
        const item = {
          campaignId: campaign.id.toString(),
          limit: 10,
          organizationId,
        };
        if (campaign.campaignType === CampaignType.DM_OUTREACH) {
          discovery.dmItems.push(item);
        } else {
          discovery.replyItems.push(item);
        }
        return discovery;
      },
      {
        dmItems: [],
        organizationId,
        replyItems: [],
        skipped: campaigns.length - bounded.length,
        total: campaigns.length,
      },
    );
  }

  private async finalizeAction(
    action: SystemWorkflowActionRequest,
  ): Promise<OutreachCampaignDispatchWorkflowResult> {
    const discovery = this.readDiscovery(action.input.state);
    const replyBatch = this.readBatch(action.input.replyBatch);
    const dmBatch = this.readBatch(action.input.dmBatch);
    const enqueued = replyBatch.count + dmBatch.count;
    const hasCampaigns = discovery.total > 0;
    return {
      action: 'campaign.dispatch.active',
      alreadyQueued: 0,
      enqueued,
      failed: 0,
      organizationId: discovery.organizationId,
      ...(!hasCampaigns ? { reason: 'no_active_campaigns' } : {}),
      skipped: discovery.skipped,
      status: hasCampaigns ? 'completed' : 'skipped',
    };
  }

  private readDiscovery(value: unknown): CampaignDispatchDiscovery {
    const state = this.readRecord(value);
    return {
      dmItems: Array.isArray(state.dmItems)
        ? (state.dmItems as CampaignBatchRequest[])
        : [],
      organizationId: this.requiredString(
        state.organizationId,
        'organizationId',
      ),
      replyItems: Array.isArray(state.replyItems)
        ? (state.replyItems as CampaignBatchRequest[])
        : [],
      skipped: typeof state.skipped === 'number' ? state.skipped : 0,
      total: typeof state.total === 'number' ? state.total : 0,
    };
  }

  private readBatch(value: unknown): ScheduledBatch {
    const batch = this.readRecord(value);
    return {
      count: typeof batch.count === 'number' ? batch.count : 0,
      results: Array.isArray(batch.results)
        ? (batch.results as ScheduledBatch['results'])
        : [],
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${field} is required`);
    }
    return value.trim();
  }
}
