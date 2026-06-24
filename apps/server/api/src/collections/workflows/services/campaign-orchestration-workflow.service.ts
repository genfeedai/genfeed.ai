import { CampaignMemoryQueueService } from '@api/services/agent-campaign/campaign-memory-queue.service';
import { OrchestratorQueueService } from '@api/services/agent-campaign/orchestrator-queue.service';
import { TriggerEvaluatorQueueService } from '@api/services/agent-campaign/trigger-evaluator-queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AgentCampaign } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type CampaignWorkflowAction =
  | 'agentCampaignOrchestration'
  | 'agentCampaignTriggerEvaluation';

type AgentCampaignConfig = {
  nextOrchestratedAt?: string;
  orchestrationEnabled?: boolean;
  status?: 'active' | 'completed' | 'draft' | 'paused';
};

type AgentCampaignWithConfig = AgentCampaign & {
  config: AgentCampaignConfig;
};

type AgentCampaignWithAgents = AgentCampaignWithConfig & {
  agents: unknown[];
};

export interface CampaignOrchestrationWorkflowResult {
  action: CampaignWorkflowAction;
  enqueued: number;
  organizationId: string;
  reason?: string;
  skipped: number;
  status: 'enqueued' | 'skipped';
}

const MAX_CAMPAIGNS_PER_CYCLE = 20;
const LOCK_TTL_SECONDS = 900;

@Injectable()
export class CampaignOrchestrationWorkflowService {
  private readonly logContext = 'CampaignOrchestrationWorkflowService';

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly campaignMemoryQueueService: CampaignMemoryQueueService,
    private readonly orchestratorQueueService: OrchestratorQueueService,
    private readonly triggerEvaluatorQueueService: TriggerEvaluatorQueueService,
  ) {}

  async runDueCampaignOrchestration(
    organizationId: string,
  ): Promise<CampaignOrchestrationWorkflowResult> {
    const lockKey = this.lockKey('agentCampaignOrchestration', organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return this.skipped(
        'agentCampaignOrchestration',
        organizationId,
        'campaign_orchestration_already_running',
      );
    }

    try {
      const now = new Date();
      const campaigns = (await this.prisma.agentCampaign.findMany({
        orderBy: { updatedAt: 'asc' },
        take: MAX_CAMPAIGNS_PER_CYCLE * 5,
        where: { isDeleted: false, organizationId },
      })) as AgentCampaignWithConfig[];

      const dueCampaigns = campaigns
        .filter((campaign) => this.isDueForOrchestration(campaign, now))
        .slice(0, MAX_CAMPAIGNS_PER_CYCLE);

      let enqueued = 0;
      let skipped = 0;

      for (const campaign of dueCampaigns) {
        const queued = await this.queueCampaignOrchestration(campaign, now);
        if (queued) {
          enqueued++;
        } else {
          skipped++;
        }
      }

      return this.result(
        'agentCampaignOrchestration',
        organizationId,
        enqueued,
        skipped,
        dueCampaigns.length === 0 ? 'no_due_campaigns' : undefined,
      );
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  async runTriggerEvaluations(
    organizationId: string,
  ): Promise<CampaignOrchestrationWorkflowResult> {
    const lockKey = this.lockKey(
      'agentCampaignTriggerEvaluation',
      organizationId,
    );
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return this.skipped(
        'agentCampaignTriggerEvaluation',
        organizationId,
        'campaign_trigger_evaluation_already_running',
      );
    }

    try {
      const campaigns = (await this.prisma.agentCampaign.findMany({
        include: { agents: true },
        orderBy: { updatedAt: 'desc' },
        take: MAX_CAMPAIGNS_PER_CYCLE * 5,
        where: { isDeleted: false, organizationId },
      })) as AgentCampaignWithAgents[];

      const eligibleCampaigns = campaigns
        .filter((campaign) => this.isEligibleForTriggerEvaluation(campaign))
        .slice(0, MAX_CAMPAIGNS_PER_CYCLE);

      let enqueued = 0;
      let skipped = 0;

      for (const campaign of eligibleCampaigns) {
        const queued = await this.queueCampaignTriggerEvaluation(campaign);
        if (queued) {
          enqueued++;
        } else {
          skipped++;
        }
      }

      return this.result(
        'agentCampaignTriggerEvaluation',
        organizationId,
        enqueued,
        skipped,
        eligibleCampaigns.length === 0
          ? 'no_trigger_evaluation_campaigns'
          : undefined,
      );
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  private isDueForOrchestration(
    campaign: AgentCampaignWithConfig,
    now: Date,
  ): boolean {
    const config = this.readConfig(campaign);
    const nextOrchestratedAt = this.parseDate(config.nextOrchestratedAt);

    return (
      config.orchestrationEnabled === true &&
      config.status === 'active' &&
      nextOrchestratedAt !== null &&
      nextOrchestratedAt <= now
    );
  }

  private isEligibleForTriggerEvaluation(
    campaign: AgentCampaignWithAgents,
  ): boolean {
    const config = this.readConfig(campaign);

    return (
      config.orchestrationEnabled === true &&
      config.status === 'active' &&
      campaign.agents.length > 0
    );
  }

  private async queueCampaignOrchestration(
    campaign: AgentCampaignWithConfig,
    now: Date,
  ): Promise<boolean> {
    try {
      const config = this.readConfig(campaign);
      const scheduledAt = this.parseDate(config.nextOrchestratedAt) ?? now;

      await this.orchestratorQueueService.queueCampaignRun({
        campaignId: campaign.id,
        organizationId: campaign.organizationId,
        scheduledAt,
        userId: campaign.userId,
      });
      await this.campaignMemoryQueueService.queueExtraction({
        campaignId: campaign.id,
        organizationId: campaign.organizationId,
        scheduledAt,
        userId: campaign.userId,
      });

      return true;
    } catch (error) {
      this.logger.error(`${this.logContext} failed campaign orchestration`, {
        campaignId: campaign.id,
        error,
        organizationId: campaign.organizationId,
      });
      return false;
    }
  }

  private async queueCampaignTriggerEvaluation(
    campaign: AgentCampaignWithAgents,
  ): Promise<boolean> {
    try {
      await this.triggerEvaluatorQueueService.queueCampaignEvaluation({
        campaignId: campaign.id,
        organizationId: campaign.organizationId,
        userId: campaign.userId,
      });

      return true;
    } catch (error) {
      this.logger.error(`${this.logContext} failed trigger evaluation`, {
        campaignId: campaign.id,
        error,
        organizationId: campaign.organizationId,
      });
      return false;
    }
  }

  private result(
    action: CampaignWorkflowAction,
    organizationId: string,
    enqueued: number,
    skipped: number,
    emptyReason?: string,
  ): CampaignOrchestrationWorkflowResult {
    if (enqueued === 0) {
      return this.skipped(
        action,
        organizationId,
        emptyReason ?? 'no_campaign_jobs_enqueued',
        skipped,
      );
    }

    return {
      action,
      enqueued,
      organizationId,
      skipped,
      status: 'enqueued',
    };
  }

  private skipped(
    action: CampaignWorkflowAction,
    organizationId: string,
    reason: string,
    skipped: number = 0,
  ): CampaignOrchestrationWorkflowResult {
    return {
      action,
      enqueued: 0,
      organizationId,
      reason,
      skipped,
      status: 'skipped',
    };
  }

  private readConfig(campaign: AgentCampaignWithConfig): AgentCampaignConfig {
    return campaign.config ?? {};
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value !== 'string' && !(value instanceof Date)) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private lockKey(
    action: CampaignWorkflowAction,
    organizationId: string,
  ): string {
    return `workflow-agent-campaign:${action}:${organizationId}`;
  }
}
