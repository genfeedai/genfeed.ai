import { randomUUID } from 'node:crypto';
import { APP_ROUTES } from '@genfeedai/constants';
import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CreateOutreachCampaignDto } from '@server/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { OutreachCampaignsService } from '@server/collections/outreach-campaigns/services/outreach-campaigns.service';
import { runIdempotent } from '@server/helpers/utils/idempotency/idempotency.util';
import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@server/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { CacheService } from '@server/services/cache/cache.service';
import { requireExecutableOutreachPair } from '@server/services/campaign/outreach-capability.util';

export type CampaignTransition = 'pause' | 'start';

export type PreparedCampaignTransition = {
  campaignId: string;
  confirmationPrompt: string;
  currentStatus: string;
  intendedStatus: CampaignStatus.ACTIVE | CampaignStatus.PAUSED;
  label: string;
  pendingConfirmation: true;
  sourceActionId: string;
  transition: CampaignTransition;
};

const CAMPAIGN_PREPARATION_TTL_SECONDS = 3_600;

export function buildCampaignPreparationCacheKey(params: {
  organizationId: string;
  sourceActionId: string;
  threadId: string;
}): string {
  return [
    'agent-campaign-preparation',
    params.organizationId,
    params.threadId,
    params.sourceActionId,
  ].join(':');
}

export function buildCampaignConfirmationPrompt(params: {
  campaignId: string;
  sourceActionId: string;
  transition: CampaignTransition;
}): string {
  return `Confirm campaign ${params.transition} for campaign ${params.campaignId}. Intent: ${params.sourceActionId}.`;
}

/**
 * Outreach campaign tools (`create_campaign`, `start_campaign`,
 * `pause_campaign`, `complete_campaign`, `get_campaign_analytics`).
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentCampaignToolHandler {
  constructor(
    private readonly campaignsService: OutreachCampaignsService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  async createCampaign(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const platform = String(params.platform || '').toLowerCase();
    const campaignType = String(params.campaignType || '').toLowerCase();
    const credentialId = readOptionalString(params.credentialId);

    requireExecutableOutreachPair({ campaignType, platform });

    if (!credentialId) {
      throw new BadRequestException('credentialId is required');
    }

    const createDto: CreateOutreachCampaignDto = {
      campaignType: campaignType as CampaignType,
      credentialId,
      description: (params.description as string) || '',
      isActive: true,
      label: String(params.label || 'Agent Campaign'),
      platform: platform as CampaignPlatform,
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
              href: `${APP_ROUTES.MESSAGES.OUTREACH}/${campaignId}`,
              label: 'Open campaign',
            },
            {
              action: 'send_prompt',
              label: 'Prepare start',
              payload: {
                prompt: `Prepare to start campaign ${campaignId}.`,
              },
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
    return this.transitionCampaign('start', params, ctx);
  }

  async pauseCampaign(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    return this.transitionCampaign('pause', params, ctx);
  }

  private async transitionCampaign(
    transition: CampaignTransition,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const campaignId = readOptionalString(params.campaignId);
    if (!campaignId) {
      throw new BadRequestException('campaignId is required');
    }

    const sourceActionId = readOptionalString(params.sourceActionId);
    const isConfirmed =
      params.confirmed === true &&
      ctx.confirmationOrigin === 'thread-ui-action' &&
      sourceActionId !== undefined &&
      sourceActionId === ctx.sourceActionId;

    if (!isConfirmed) {
      return this.prepareCampaignTransition(transition, campaignId, ctx);
    }

    const { cacheService, threadId } = this.requireConfirmationPersistence(ctx);
    const preparedTransition =
      await cacheService.get<PreparedCampaignTransition>(
        buildCampaignPreparationCacheKey({
          organizationId: ctx.organizationId,
          sourceActionId,
          threadId,
        }),
      );
    if (
      preparedTransition?.pendingConfirmation !== true ||
      preparedTransition.campaignId !== campaignId ||
      preparedTransition.sourceActionId !== sourceActionId ||
      preparedTransition.transition !== transition
    ) {
      throw new BadRequestException(
        'Campaign confirmation does not match a persisted preparation.',
      );
    }

    const idempotencyKey = [
      'agent-campaign-confirmation',
      ctx.organizationId,
      threadId,
      transition,
      campaignId,
      sourceActionId,
    ].join(':');

    return runIdempotent(
      cacheService,
      idempotencyKey,
      async () => {
        const currentCampaign = await this.campaignsService.findOneById(
          campaignId,
          ctx.organizationId,
          ctx.brandId,
        );
        if (!currentCampaign) {
          throw new NotFoundException(`Campaign ${campaignId} not found`);
        }
        if (
          String(currentCampaign.status) !== preparedTransition.currentStatus
        ) {
          throw new BadRequestException(
            'Campaign state changed after confirmation was prepared.',
          );
        }

        const campaign =
          transition === 'start'
            ? await this.campaignsService.start(
                campaignId,
                ctx.organizationId,
                ctx.brandId,
              )
            : await this.campaignsService.pause(
                campaignId,
                ctx.organizationId,
                ctx.brandId,
              );

        return {
          creditsUsed: 0,
          data: {
            campaignId,
            sourceActionId,
            status: campaign.status,
            transition,
          },
          nextActions: [
            {
              ctas: [
                {
                  href: `${APP_ROUTES.MESSAGES.OUTREACH}/${campaignId}`,
                  label: 'Open campaign',
                },
              ],
              data: {
                campaignId,
                sourceActionId,
                status: campaign.status,
                transition,
              },
              id: `${sourceActionId}-completed`,
              title:
                transition === 'start' ? 'Campaign started' : 'Campaign paused',
              type: 'campaign_control_card' as const,
            },
          ],
          riskLevel: 'medium' as const,
          success: true,
        };
      },
      {
        lockTtlSeconds: CAMPAIGN_PREPARATION_TTL_SECONDS,
        resultTtlSeconds: CAMPAIGN_PREPARATION_TTL_SECONDS,
      },
    );
  }

  private async prepareCampaignTransition(
    transition: CampaignTransition,
    campaignId: string,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const { cacheService, threadId } = this.requireConfirmationPersistence(ctx);
    const campaign = await this.campaignsService.findOneById(
      campaignId,
      ctx.organizationId,
      ctx.brandId,
    );
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const sourceActionId = `campaign-transition-${randomUUID()}`;
    const preparation: PreparedCampaignTransition = {
      campaignId,
      confirmationPrompt: buildCampaignConfirmationPrompt({
        campaignId,
        sourceActionId,
        transition,
      }),
      currentStatus: String(campaign.status),
      intendedStatus:
        transition === 'start' ? CampaignStatus.ACTIVE : CampaignStatus.PAUSED,
      label: String(campaign.label),
      pendingConfirmation: true,
      sourceActionId,
      transition,
    };
    const persisted: boolean = await cacheService.set(
      buildCampaignPreparationCacheKey({
        organizationId: ctx.organizationId,
        sourceActionId,
        threadId,
      }),
      preparation,
      { ttl: CAMPAIGN_PREPARATION_TTL_SECONDS },
    );
    if (!persisted) {
      throw new InternalServerErrorException(
        'Campaign confirmation preparation could not be persisted.',
      );
    }

    return {
      creditsUsed: 0,
      data: preparation,
      nextActions: [
        {
          ctas: [
            {
              action: 'send_prompt',
              label: transition === 'start' ? 'Confirm start' : 'Confirm pause',
              payload: { prompt: preparation.confirmationPrompt },
            },
            {
              href: `${APP_ROUTES.MESSAGES.OUTREACH}/${campaignId}`,
              label: 'Open campaign',
            },
          ],
          data: preparation,
          description: `Review ${preparation.label} and confirm the transition from ${preparation.currentStatus} to ${preparation.intendedStatus}.`,
          id: sourceActionId,
          requiresConfirmation: true,
          riskLevel: 'medium',
          title:
            transition === 'start'
              ? `Start ${preparation.label}?`
              : `Pause ${preparation.label}?`,
          type: 'campaign_control_card',
        },
      ],
      requiresConfirmation: true,
      riskLevel: 'medium',
      success: true,
    };
  }

  private requireConfirmationPersistence(ctx: ToolExecutionContext): {
    cacheService: CacheService;
    threadId: string;
  } {
    if (!this.cacheService || !ctx.threadId) {
      throw new InternalServerErrorException(
        'Campaign confirmation persistence is unavailable.',
      );
    }

    return { cacheService: this.cacheService, threadId: ctx.threadId };
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
              href: `${APP_ROUTES.MESSAGES.OUTREACH}/${campaignId}`,
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
