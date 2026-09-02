import { randomUUID } from 'node:crypto';
import { CreateOutreachCampaignDto } from '@api/collections/outreach-campaigns/dto/create-outreach-campaign.dto';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { runIdempotent } from '@api/helpers/utils/idempotency/idempotency.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { CacheService } from '@api/services/cache/cache.service';
import { requireExecutableOutreachPair } from '@api/services/campaign/outreach-capability.util';
import { APP_ROUTES } from '@genfeedai/constants';
import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

export type CampaignTransition = 'pause' | 'start';

export type PreparedCampaignTransition = {
  brandId: string | null;
  campaignId: string;
  confirmationPrompt: string;
  currentStatus: CampaignStatus;
  intendedStatus: CampaignStatus.ACTIVE | CampaignStatus.PAUSED;
  label: string;
  pendingConfirmation: boolean;
  sourceActionId: string;
  transition: CampaignTransition;
};

const CAMPAIGN_PREPARATION_TTL_SECONDS = 3_600;
const CAMPAIGN_TRANSITION_LOCK_TTL_SECONDS = 60;
const CAMPAIGN_SOURCE_ACTION_ID_PATTERN =
  /campaign-transition-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function readCampaignStatus(value: unknown): CampaignStatus | null {
  return (
    Object.values(CampaignStatus).find((status) => status === value) ?? null
  );
}

function isCampaignTransitionAllowed(
  transition: CampaignTransition,
  status: CampaignStatus,
): boolean {
  return transition === 'start'
    ? status === CampaignStatus.DRAFT || status === CampaignStatus.PAUSED
    : status === CampaignStatus.ACTIVE;
}

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

export function readCampaignConfirmationSourceActionId(
  confirmationPrompt: string,
): string | null {
  const match = confirmationPrompt.match(
    new RegExp(
      `Intent: (${CAMPAIGN_SOURCE_ACTION_ID_PATTERN.source})\\.$`,
      'i',
    ),
  );
  return match?.[1] ?? null;
}

export function readPreparedCampaignTransition(
  value: unknown,
): PreparedCampaignTransition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const brandId =
    candidate.brandId === null ? null : readNonEmptyString(candidate.brandId);
  const campaignId = readNonEmptyString(candidate.campaignId);
  const confirmationPrompt = readNonEmptyString(candidate.confirmationPrompt);
  const currentStatus = readCampaignStatus(candidate.currentStatus);
  const intendedStatus = readCampaignStatus(candidate.intendedStatus);
  const label = readNonEmptyString(candidate.label);
  const sourceActionId = readNonEmptyString(candidate.sourceActionId);
  const transition = candidate.transition;
  if (
    !campaignId ||
    !confirmationPrompt ||
    !currentStatus ||
    !label ||
    !sourceActionId ||
    (candidate.brandId !== null && !brandId) ||
    typeof candidate.pendingConfirmation !== 'boolean' ||
    (transition !== 'start' && transition !== 'pause') ||
    !isCampaignTransitionAllowed(transition, currentStatus) ||
    intendedStatus !==
      (transition === 'start'
        ? CampaignStatus.ACTIVE
        : CampaignStatus.PAUSED) ||
    readCampaignConfirmationSourceActionId(confirmationPrompt) !==
      sourceActionId ||
    confirmationPrompt !==
      buildCampaignConfirmationPrompt({
        campaignId,
        sourceActionId,
        transition,
      })
  ) {
    return null;
  }

  return {
    brandId,
    campaignId,
    confirmationPrompt,
    currentStatus,
    intendedStatus,
    label,
    pendingConfirmation: candidate.pendingConfirmation,
    sourceActionId,
    transition,
  };
}

/**
 * Outreach campaign tools (`create_campaign`, `start_campaign`,
 * `pause_campaign`, `complete_campaign`, `get_campaign_analytics`).
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentCampaignToolHandler {
  private readonly cacheService?: CacheService;

  constructor(
    private readonly campaignsService: OutreachCampaignsService,
    @Inject(CacheService) cacheService?: CacheService,
  ) {
    this.cacheService = cacheService;
  }

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
    const preparationKey = buildCampaignPreparationCacheKey({
      organizationId: ctx.organizationId,
      sourceActionId,
      threadId,
    });
    const preparedTransition = readPreparedCampaignTransition(
      await cacheService.get<unknown>(preparationKey),
    );
    if (
      preparedTransition?.campaignId !== campaignId ||
      preparedTransition.brandId !== (ctx.brandId ?? null) ||
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

    const result = await runIdempotent<AgentToolResult>(
      cacheService,
      idempotencyKey,
      async () => {
        if (!preparedTransition.pendingConfirmation) {
          throw new BadRequestException(
            'Campaign confirmation has already been consumed.',
          );
        }
        const currentCampaign = await this.campaignsService.findOneById(
          campaignId,
          ctx.organizationId,
          ctx.brandId,
        );
        if (!currentCampaign) {
          throw new NotFoundException('Campaign', campaignId);
        }
        if (currentCampaign.status !== preparedTransition.currentStatus) {
          throw new BadRequestException(
            'Campaign state changed after confirmation was prepared.',
          );
        }
        if (!isCampaignTransitionAllowed(transition, currentCampaign.status)) {
          throw new BadRequestException(
            `Campaign cannot ${transition} from ${currentCampaign.status}.`,
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
        lockTtlSeconds: CAMPAIGN_TRANSITION_LOCK_TTL_SECONDS,
        resultTtlSeconds: CAMPAIGN_PREPARATION_TTL_SECONDS,
      },
    );
    await cacheService.set(
      preparationKey,
      { ...preparedTransition, pendingConfirmation: false },
      { ttl: CAMPAIGN_PREPARATION_TTL_SECONDS },
    );
    return result;
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
      throw new NotFoundException('Campaign', campaignId);
    }

    const sourceActionId = `campaign-transition-${randomUUID()}`;
    const currentStatus = readCampaignStatus(campaign.status);
    if (!currentStatus) {
      throw new InternalServerErrorException(
        'Campaign has an unsupported lifecycle status.',
      );
    }
    if (!isCampaignTransitionAllowed(transition, currentStatus)) {
      throw new BadRequestException(
        `Campaign cannot ${transition} from ${currentStatus}.`,
      );
    }
    const preparation: PreparedCampaignTransition = {
      brandId: ctx.brandId ?? null,
      campaignId,
      confirmationPrompt: buildCampaignConfirmationPrompt({
        campaignId,
        sourceActionId,
        transition,
      }),
      currentStatus,
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
    if (!ctx.threadId) {
      throw new BadRequestException(
        'Campaign transitions require a thread context.',
      );
    }
    if (!this.cacheService) {
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
