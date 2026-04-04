import { type AgentCampaignDocument } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { isOrchestratorAgentType } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import type { IAgentCampaignStatusResponse } from '@genfeedai/interfaces';
import { AgentExecutionTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

@Injectable()
export class AgentCampaignExecutionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly agentCampaignsService: AgentCampaignsService,
    private readonly agentStrategiesService: AgentStrategiesService,
    private readonly agentRunsService: AgentRunsService,
    private readonly agentRunQueueService: AgentRunQueueService,
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
      throw new NotFoundException(
        `Campaign ${campaignId} not found in organization ${organizationId}`,
      );
    }

    if (campaign.status === 'active') {
      throw new BadRequestException('Campaign is already active');
    }

    if (campaign.status === 'completed') {
      throw new BadRequestException('Cannot execute a completed campaign');
    }

    // Set campaign to active
    const now = new Date();
    const updated = await this.agentCampaignsService.patch(campaignId, {
      nextOrchestratedAt: now,
      status: 'active',
    } as Record<string, unknown>);

    if (!updated) {
      throw new NotFoundException(`Failed to update campaign ${campaignId}`);
    }

    // Trigger each agent strategy
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

        // Activate strategy if not already active
        if (!strategy.isActive) {
          await this.agentStrategiesService.toggleActive(
            strategyId,
            organizationId,
          );
        }

        if (isOrchestratorAgentType(strategy.agentType)) {
          this.logger.log(
            `${this.constructorName} scheduled campaign orchestration for strategy ${strategyId}`,
            { campaignId, strategyId },
          );
          continue;
        }

        // Create a run for this strategy
        const run = await this.agentRunsService.create({
          label: `Campaign run: ${campaign.label} - ${strategy.label}`,
          organization: new Types.ObjectId(organizationId),
          strategy: new Types.ObjectId(strategyId),
          trigger: AgentExecutionTrigger.MANUAL,
          user: new Types.ObjectId(userId),
        });

        // Queue the run
        await this.agentRunQueueService.queueRun({
          campaignId,
          objective: campaign.brief || `Execute campaign: ${campaign.label}`,
          organizationId,
          runId: String(run._id),
          strategyId,
          userId,
        });

        this.logger.log(
          `${this.constructorName} queued run for strategy ${strategyId}`,
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
      throw new NotFoundException(
        `Campaign ${campaignId} not found in organization ${organizationId}`,
      );
    }

    if (campaign.status !== 'active') {
      throw new BadRequestException('Only active campaigns can be paused');
    }

    // Set campaign to paused
    const updated = await this.agentCampaignsService.patch(campaignId, {
      nextOrchestratedAt: null,
      status: 'paused',
    } as Record<string, unknown>);

    if (!updated) {
      throw new NotFoundException(`Failed to update campaign ${campaignId}`);
    }

    // Pause each agent strategy
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
   * Increment creditsUsed on the campaign
   */
  async updateCreditsUsed(campaignId: string, credits: number): Promise<void> {
    await this.agentCampaignsService.patchAll(
      { _id: new Types.ObjectId(campaignId), isDeleted: false },
      { $inc: { creditsUsed: credits } },
    );

    this.logger.log(
      `${this.constructorName} updated credits for campaign ${campaignId}`,
      { campaignId, credits },
    );
  }

  /**
   * Check content quota and auto-complete campaign if reached
   */
  async checkQuota(campaignId: string): Promise<boolean> {
    const campaign = await this.agentCampaignsService.findOne({
      _id: new Types.ObjectId(campaignId),
      isDeleted: false,
    });

    if (!campaign || campaign.status !== 'active') {
      return false;
    }

    // Check credits budget
    if (
      campaign.creditsAllocated > 0 &&
      campaign.creditsUsed >= campaign.creditsAllocated
    ) {
      await this.agentCampaignsService.patch(campaignId, {
        nextOrchestratedAt: null,
        status: 'completed',
      } as Record<string, unknown>);

      this.logger.log(
        `${this.constructorName} campaign ${campaignId} auto-completed — credit budget reached`,
        { campaignId },
      );

      return true;
    }

    // Content quota checking is best-effort; actual counting would require
    // querying runs/outputs. For now, we rely on creditsAllocated as the primary gate.

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
      throw new NotFoundException(
        `Campaign ${campaignId} not found in organization ${organizationId}`,
      );
    }

    // Count running agents by checking which strategies are active
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

    // Count completed content via runs associated with this campaign
    const runs = await this.agentRunsService.find({
      campaignId,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });

    const contentProduced = Array.isArray(runs)
      ? runs.reduce(
          (total, run) =>
            total +
            (run.toolCalls?.filter(
              (tc: { status: string }) => tc.status === 'completed',
            ).length ?? 0),
          0,
        )
      : 0;

    return {
      agentsRunning,
      campaignId,
      contentProduced,
      contentQuota: campaign.contentQuota,
      creditsAllocated: campaign.creditsAllocated,
      creditsUsed: campaign.creditsUsed,
      status: campaign.status,
    };
  }
}
