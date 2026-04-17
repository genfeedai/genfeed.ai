import { CampaignMemoryQueueService } from '@api/services/agent-campaign/campaign-memory-queue.service';
import { DEFAULT_TRIGGER_EVALUATION_INTERVAL_MINUTES } from '@api/services/agent-campaign/orchestrator.constants';
import { OrchestratorQueueService } from '@api/services/agent-campaign/orchestrator-queue.service';
import { TriggerEvaluatorQueueService } from '@api/services/agent-campaign/trigger-evaluator-queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { AgentCampaign } from '@prisma/client';

const MAX_CAMPAIGNS_PER_CYCLE = 20;

type AgentCampaignConfig = {
  orchestrationEnabled?: boolean;
  status?: 'draft' | 'active' | 'paused' | 'completed';
  nextOrchestratedAt?: string;
  agents?: string[];
};

type AgentCampaignWithConfig = AgentCampaign & {
  config: AgentCampaignConfig;
};

@Injectable()
export class CronAgentCampaignOrchestratorService {
  private static readonly LOCK_KEY = 'cron:agent-campaign-orchestrator';
  private static readonly LOCK_TTL_SECONDS = 900;

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignMemoryQueueService: CampaignMemoryQueueService,
    private readonly orchestratorQueueService: OrchestratorQueueService,
    private readonly triggerEvaluatorQueueService: TriggerEvaluatorQueueService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueCampaigns(): Promise<void> {
    const acquired = await this.cacheService.acquireLock(
      CronAgentCampaignOrchestratorService.LOCK_KEY,
      CronAgentCampaignOrchestratorService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      this.logger.debug(
        'Agent campaign orchestrator cron already running (lock held), skipping',
        'CronAgentCampaignOrchestratorService',
      );
      return;
    }

    const startedAt = Date.now();

    try {
      this.logger.log(
        'Starting agent campaign orchestration cycle',
        'CronAgentCampaignOrchestratorService',
      );

      const now = new Date();

      // Fetch non-deleted campaigns and filter in-memory for orchestration fields stored in config
      const allCampaigns = (await this.prisma.agentCampaign.findMany({
        orderBy: { updatedAt: 'asc' },
        take: MAX_CAMPAIGNS_PER_CYCLE * 5,
        where: { isDeleted: false },
      })) as AgentCampaignWithConfig[];

      const dueCampaigns = allCampaigns
        .filter((c) => {
          const cfg = (c.config ?? {}) as AgentCampaignConfig;
          const nextOrchestratedAt = cfg.nextOrchestratedAt
            ? new Date(cfg.nextOrchestratedAt)
            : null;
          return (
            cfg.orchestrationEnabled === true &&
            cfg.status === 'active' &&
            nextOrchestratedAt !== null &&
            nextOrchestratedAt <= now
          );
        })
        .slice(0, MAX_CAMPAIGNS_PER_CYCLE);

      this.logger.log(
        `Found ${dueCampaigns.length} campaigns due for orchestration`,
        'CronAgentCampaignOrchestratorService',
      );

      for (const campaign of dueCampaigns) {
        try {
          const cfg = (campaign.config ?? {}) as AgentCampaignConfig;
          const scheduledAt = cfg.nextOrchestratedAt
            ? new Date(cfg.nextOrchestratedAt)
            : now;

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
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Campaign ${campaign.id} orchestration queueing failed: ${message}`,
            'CronAgentCampaignOrchestratorService',
          );
        }
      }

      const duration = Date.now() - startedAt;
      this.logger.log(
        `Agent campaign orchestration cycle completed in ${duration}ms (${dueCampaigns.length} campaigns)`,
        'CronAgentCampaignOrchestratorService',
      );
    } catch (error: unknown) {
      this.logger.error(
        'Agent campaign orchestration cycle failed',
        error,
        'CronAgentCampaignOrchestratorService',
      );
    } finally {
      await this.cacheService.releaseLock(
        CronAgentCampaignOrchestratorService.LOCK_KEY,
      );
    }
  }

  @Cron('0 */15 * * * *')
  async processTriggerEvaluations(): Promise<void> {
    const acquired = await this.cacheService.acquireLock(
      `${CronAgentCampaignOrchestratorService.LOCK_KEY}:triggers`,
      CronAgentCampaignOrchestratorService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      this.logger.debug(
        'Agent campaign trigger cron already running (lock held), skipping',
        'CronAgentCampaignOrchestratorService',
      );
      return;
    }

    const startedAt = Date.now();

    try {
      this.logger.log(
        `Starting agent campaign trigger evaluation cycle (${DEFAULT_TRIGGER_EVALUATION_INTERVAL_MINUTES}m cadence)`,
        'CronAgentCampaignOrchestratorService',
      );

      // Fetch campaigns with agents relation to check for non-empty agents list
      const allCampaigns = (await this.prisma.agentCampaign.findMany({
        include: { agents: true },
        orderBy: { updatedAt: 'desc' },
        take: MAX_CAMPAIGNS_PER_CYCLE * 5,
        where: { isDeleted: false },
      })) as (AgentCampaignWithConfig & { agents: unknown[] })[];

      const activeCampaigns = allCampaigns
        .filter((c) => {
          const cfg = (c.config ?? {}) as AgentCampaignConfig;
          return (
            cfg.orchestrationEnabled === true &&
            cfg.status === 'active' &&
            c.agents.length > 0
          );
        })
        .slice(0, MAX_CAMPAIGNS_PER_CYCLE);

      this.logger.log(
        `Found ${activeCampaigns.length} campaigns eligible for trigger evaluation`,
        'CronAgentCampaignOrchestratorService',
      );

      for (const campaign of activeCampaigns) {
        try {
          await this.triggerEvaluatorQueueService.queueCampaignEvaluation({
            campaignId: campaign.id,
            organizationId: campaign.organizationId,
            userId: campaign.userId,
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Campaign ${campaign.id} trigger evaluation queueing failed: ${message}`,
            'CronAgentCampaignOrchestratorService',
          );
        }
      }

      const duration = Date.now() - startedAt;
      this.logger.log(
        `Agent campaign trigger evaluation cycle completed in ${duration}ms (${activeCampaigns.length} campaigns)`,
        'CronAgentCampaignOrchestratorService',
      );
    } catch (error: unknown) {
      this.logger.error(
        'Agent campaign trigger evaluation cycle failed',
        error,
        'CronAgentCampaignOrchestratorService',
      );
    } finally {
      await this.cacheService.releaseLock(
        `${CronAgentCampaignOrchestratorService.LOCK_KEY}:triggers`,
      );
    }
  }
}
