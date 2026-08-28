import type { AgentCampaign } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { AgentCampaignWorkflowService } from '@server/services/agent-campaign/agent-campaign-workflow.service';
import { CacheService } from '@server/services/cache/cache.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

type CampaignWorkflowAction =
  | 'agentCampaignOrchestration'
  | 'agentCampaignTriggerEvaluation';

type AgentCampaignWithAgents = AgentCampaign & {
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
    private readonly agentCampaignWorkflow: AgentCampaignWorkflowService,
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
      const dueCampaigns = await this.prisma.agentCampaign.findMany({
        orderBy: { nextOrchestratedAt: 'asc' },
        take: MAX_CAMPAIGNS_PER_CYCLE,
        where: scopedWhere(organizationId, {
          nextOrchestratedAt: { lte: now },
          orchestrationEnabled: true,
          status: 'active',
        }),
      });

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
      const eligibleCampaigns = await this.prisma.agentCampaign.findMany({
        include: { agents: true },
        orderBy: { updatedAt: 'desc' },
        take: MAX_CAMPAIGNS_PER_CYCLE,
        where: scopedWhere(organizationId, {
          agents: { some: { isDeleted: false } },
          orchestrationEnabled: true,
          status: 'active',
        }),
      });

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

  private async queueCampaignOrchestration(
    campaign: AgentCampaign,
    now: Date,
  ): Promise<boolean> {
    try {
      const scheduledAt = campaign.nextOrchestratedAt ?? now;

      await this.agentCampaignWorkflow.queueOrchestration({
        campaignId: campaign.id,
        organizationId: campaign.organizationId,
        scheduledAt,
        userId: campaign.userId,
      });
      await this.agentCampaignWorkflow.queueMemoryExtraction({
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
      await this.agentCampaignWorkflow.queueTriggerEvaluation({
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

  private lockKey(
    action: CampaignWorkflowAction,
    organizationId: string,
  ): string {
    return `workflow-agent-campaign:${action}:${organizationId}`;
  }
}
