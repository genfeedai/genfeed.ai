import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { CampaignPlatform, CampaignType } from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * Outreach campaign tools (`create_campaign`, `start_campaign`,
 * `pause_campaign`, `complete_campaign`, `get_campaign_analytics`).
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentCampaignToolHandler {
  constructor(private readonly campaignsService: OutreachCampaignsService) {}

  async createCampaign(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const platform = String(params.platform || 'twitter').toLowerCase();
    const campaignType = String(params.campaignType || 'manual').toLowerCase();

    const createDto: CreateOutreachCampaignDto = {
      campaignType: campaignType as CampaignType,
      credential: String(params.credential),
      description: (params.description as string) || '',
      isActive: true,
      label: String(params.label || 'Agent Campaign'),
      organization: ctx.organizationId,
      platform: platform as CampaignPlatform,
      user: ctx.userId,
    };

    const campaign = await this.campaignsService.createScoped(createDto, {
      brandId: ctx.brandId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    });
    const campaignId = String(campaign.id);

    return {
      creditsUsed: 1,
      data: {
        campaignId,
        label: campaign.label,
        platform: campaign.platform,
        status: campaign.status,
      },
      nextActions: [
        {
          ctas: [
            {
              href: `/orchestration/outreach-campaigns/${campaignId}`,
              label: 'Open campaign',
            },
            {
              action: 'start_campaign',
              label: 'Start campaign',
              payload: { campaignId },
            },
          ],
          data: {
            campaignId,
            label: campaign.label,
            platform: campaign.platform,
            status: campaign.status,
          },
          id: `campaign-created-${campaignId}`,
          title: `Campaign created: ${campaign.label}`,
          type: 'campaign_create_card',
        },
      ],
      success: true,
    };
  }

  async startCampaign(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const campaignId = String(params.campaignId || '');
    const campaign = await this.campaignsService.start(
      campaignId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        campaignId,
        status: campaign.status,
      },
      requiresConfirmation: true,
      riskLevel: 'medium',
      success: true,
    };
  }

  async pauseCampaign(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const campaignId = String(params.campaignId || '');
    const campaign = await this.campaignsService.pause(
      campaignId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        campaignId,
        status: campaign.status,
      },
      success: true,
    };
  }

  async completeCampaign(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const campaignId = String(params.campaignId || '');
    const campaign = await this.campaignsService.complete(
      campaignId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        campaignId,
        status: campaign.status,
      },
      success: true,
    };
  }

  async getCampaignAnalytics(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const campaignId = String(params.campaignId || '');
    const analytics = await this.campaignsService.getAnalytics(
      campaignId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        campaignId,
        repliesPerHour: analytics.repliesPerHour,
        successRate: analytics.successRate,
      },
      nextActions: [
        {
          ctas: [
            {
              href: `/orchestration/outreach-campaigns/${campaignId}`,
              label: 'Open campaign',
            },
          ],
          id: `campaign-analytics-${campaignId}-${Date.now()}`,
          metrics: {
            items: [
              {
                decimals: 1,
                label: 'Replies / hour',
                value: analytics.repliesPerHour ?? 0,
              },
              {
                decimals: 1,
                label: 'Success rate',
                suffix: '%',
                value: analytics.successRate ?? 0,
              },
            ],
          },
          title: 'Campaign analytics snapshot',
          type: 'analytics_snapshot_card',
        },
      ],
      success: true,
    };
  }
}
