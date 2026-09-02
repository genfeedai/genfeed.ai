import { type AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { isOrchestratorAgentType } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import { AgentRuntimeService } from '@api/services/agent-runtime/agent-runtime.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IAgentCampaignStatusResponse } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AgentCampaignExecutionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly agentCampaignsService: AgentCampaignsService,
    private readonly agentStrategiesService: AgentStrategiesService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AgentRuntimeService))
    private readonly agentRuntimeService: AgentRuntimeService,
  ) {}

  /**
   * Execute a campaign: validate, set status=active, trigger each agent strategy
   */
  async execute(
    campaignId: string,
    organizationId: string,
    userId: string,
  ): Promise<AgentCampaignDocument> {
    const campaign = await this.agentCampaignsService.findOneById(
      campaignId,
      organizationId,
    );

    if (!campaign) {
      throw new NotFoundException({
        message: `Campaign ${campaignId} not found in organization ${organizationId}`,
      });
    }

    if (campaign.status === 'active') {
      throw new BadRequestException('Campaign is already active');
    }

    if (campaign.status === 'completed') {
      throw new BadRequestException('Cannot execute a completed campaign');
    }

    const now = new Date();
    const updated = await this.agentCampaignsService.patch(
      campaignId,
      {
        nextOrchestratedAt: now,
        organizationId,
        status: 'active',
      },
      ['agents'],
    );

    if (!updated) {
      throw new NotFoundException({
        message: `Failed to update campaign ${campaignId}`,
      });
    }

    for (const agentId of campaign.agents) {
      try {
        const strategyId = agentId.toString();
        const strategy = await this.agentStrategiesService.findOneById(
          strategyId,
          organizationId,
        );

        if (!strategy) {
          this.logger.warn(
            `${this.constructorName} strategy ${strategyId} not found, skipping`,
            { campaignId },
          );
          continue;
        }

        if (!strategy.isActive) {
          await this.agentStrategiesService.setActive(
            strategyId,
            organizationId,
            true,
          );
        }

        // Orchestrator strategies are driven by the workflow-backed scanner,
        // not by an immediate run on campaign start.
        if (isOrchestratorAgentType(strategy.agentType)) {
          this.logger.log(
            `${this.constructorName} leaving orchestrator strategy ${strategyId} to workflow scanner`,
            { campaignId, strategyId },
          );
          continue;
        }

        const objective =
          campaign.brief || `Execute campaign: ${campaign.label}`;
        const creditBudget =
          typeof strategy.dailyCreditBudget === 'number'
            ? strategy.dailyCreditBudget
            : undefined;

        await this.agentRuntimeService.startTurn({
          agentType:
            typeof strategy.agentType === 'string'
              ? strategy.agentType
              : undefined,
          autonomyMode:
            typeof strategy.autonomyMode === 'string'
              ? strategy.autonomyMode
              : undefined,
          brandId: campaign.brandId ?? undefined,
          campaignId,
          creditBudget,
          label: `Campaign run: ${campaign.label} - ${strategy.label}`,
          model:
            typeof strategy.model === 'string' ? strategy.model : undefined,
          objective,
          organizationId,
          strategyId,
          threadTitle: `${campaign.label ?? 'Campaign'} · ${strategy.label ?? strategyId}`,
          userId,
        });

        this.logger.log(
          `${this.constructorName} started runtime turn for strategy ${strategyId}`,
          { campaignId, strategyId },
        );
      } catch (error: unknown) {
        this.logger.error(
          `${this.constructorName} failed to trigger strategy ${agentId.toString()}`,
          error,
        );
      }
    }

    this.logger.log(`${this.constructorName} campaign ${campaignId} executed`, {
      agentCount: campaign.agents.length,
      campaignId,
    });

    return updated;
  }

  /**
   * Pause a campaign: set status=paused, pause associated strategies
   */
  async pause(
    campaignId: string,
    organizationId: string,
  ): Promise<AgentCampaignDocument> {
    const campaign = await this.agentCampaignsService.findOneById(
      campaignId,
      organizationId,
    );

    if (!campaign) {
      throw new NotFoundException({
        message: `Campaign ${campaignId} not found in organization ${organizationId}`,
      });
    }

    if (campaign.status !== 'active') {
      throw new BadRequestException('Only active campaigns can be paused');
    }

    const updated = await this.agentCampaignsService.patch(
      campaignId,
      {
        nextOrchestratedAt: null,
        organizationId,
        status: 'paused',
      },
      ['agents'],
    );

    if (!updated) {
      throw new NotFoundException({
        message: `Failed to update campaign ${campaignId}`,
      });
    }

    for (const agentId of campaign.agents) {
      try {
        const strategyId = agentId.toString();
        await this.agentStrategiesService.pauseStrategy(strategyId);
      } catch (error: unknown) {
        this.logger.error(
          `${this.constructorName} failed to pause strategy ${agentId.toString()}`,
          error,
        );
      }
    }

    this.logger.log(`${this.constructorName} campaign ${campaignId} paused`, {
      campaignId,
    });

    return updated;
  }

  /**
   * Atomically increment creditsUsed on the campaign.
   */
  async updateCreditsUsed(
    campaignId: string,
    organizationId: string,
    credits: number,
  ): Promise<void> {
    await this.agentCampaignsService.prisma.agentCampaign.updateMany({
      data: { creditsUsed: { increment: credits } },
      where: scopedWhere(organizationId, { id: campaignId }),
    });

    this.logger.log(
      `${this.constructorName} updated credits for campaign ${campaignId}`,
      { campaignId, credits },
    );
  }

  /**
   * Check content quota and auto-complete campaign if reached
   */
  async checkQuota(
    campaignId: string,
    organizationId: string,
  ): Promise<boolean> {
    const campaign = await this.agentCampaignsService.findOneById(
      campaignId,
      organizationId,
    );

    if (campaign?.status !== 'active') {
      return false;
    }

    if (
      campaign.creditsAllocated > 0 &&
      campaign.creditsUsed >= campaign.creditsAllocated
    ) {
      await this.agentCampaignsService.prisma.agentCampaign.updateMany({
        data: {
          nextOrchestratedAt: null,
          status: 'completed',
        },
        where: scopedWhere(organizationId, { id: campaignId }),
      });

      this.logger.log(
        `${this.constructorName} campaign ${campaignId} auto-completed — credit budget reached`,
        { campaignId },
      );

      return true;
    }

    return false;
  }

  /**
   * Get campaign execution status
   */
  async getStatus(
    campaignId: string,
    organizationId: string,
  ): Promise<IAgentCampaignStatusResponse> {
    const campaign = await this.agentCampaignsService.findOneById(
      campaignId,
      organizationId,
    );

    if (!campaign) {
      throw new NotFoundException({
        message: `Campaign ${campaignId} not found in organization ${organizationId}`,
      });
    }

    let agentsRunning = 0;
    for (const agentId of campaign.agents) {
      const strategy = await this.agentStrategiesService.findOneById(
        agentId.toString(),
        organizationId,
      );
      if (strategy?.isActive) {
        agentsRunning++;
      }
    }

    const executions = await this.prisma.workflowExecution.findMany({
      select: { nodeResults: { select: { status: true } } },
      where: scopedWhere(organizationId, {
        result: {
          path: ['metadata', 'campaignId'],
          equals: campaignId,
        },
      }),
    });

    const contentProduced = executions.reduce(
      (total, execution) =>
        total +
        execution.nodeResults.filter((node) => node.status === 'COMPLETED')
          .length,
      0,
    );
    const status =
      campaign.status === 'active' ||
      campaign.status === 'completed' ||
      campaign.status === 'paused'
        ? campaign.status
        : 'draft';

    return {
      agentsRunning,
      campaignId,
      contentProduced,
      contentQuota: campaign.contentQuota,
      creditsAllocated: campaign.creditsAllocated ?? 0,
      creditsUsed: campaign.creditsUsed ?? 0,
      status,
    };
  }
}
