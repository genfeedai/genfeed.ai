import {
  AgentCampaign,
  type AgentCampaignDocument,
} from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CampaignMemoryQueueService } from '@api/services/agent-campaign/campaign-memory-queue.service';
import { DEFAULT_TRIGGER_EVALUATION_INTERVAL_MINUTES } from '@api/services/agent-campaign/orchestrator.constants';
import { OrchestratorQueueService } from '@api/services/agent-campaign/orchestrator-queue.service';
import { TriggerEvaluatorQueueService } from '@api/services/agent-campaign/trigger-evaluator-queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';

const MAX_CAMPAIGNS_PER_CYCLE = 20;

@Injectable()
export class CronAgentCampaignOrchestratorService {
  private static readonly LOCK_KEY = 'cron:agent-campaign-orchestrator';
  private static readonly LOCK_TTL_SECONDS = 900;

  constructor(
    @InjectModel(AgentCampaign.name, DB_CONNECTIONS.AGENT)
    private readonly agentCampaignModel: Model<AgentCampaignDocument>,
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
      const dueCampaigns = await this.agentCampaignModel
        .find({
          isDeleted: false,
          nextOrchestratedAt: { $lte: now },
          orchestrationEnabled: true,
          status: 'active',
        })
        .sort({ nextOrchestratedAt: 1 })
        .limit(MAX_CAMPAIGNS_PER_CYCLE)
        .exec();

      this.logger.log(
        `Found ${dueCampaigns.length} campaigns due for orchestration`,
        'CronAgentCampaignOrchestratorService',
      );

      for (const campaign of dueCampaigns) {
        try {
          await this.orchestratorQueueService.queueCampaignRun({
            campaignId: String(campaign._id),
            organizationId: String(campaign.organization),
            scheduledAt: campaign.nextOrchestratedAt,
            userId: String(campaign.user),
          });

          await this.campaignMemoryQueueService.queueExtraction({
            campaignId: String(campaign._id),
            organizationId: String(campaign.organization),
            scheduledAt: campaign.nextOrchestratedAt,
            userId: String(campaign.user),
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Campaign ${String(campaign._id)} orchestration queueing failed: ${message}`,
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

      const activeCampaigns = await this.agentCampaignModel
        .find({
          agents: { $exists: true, $ne: [] },
          isDeleted: false,
          orchestrationEnabled: true,
          status: 'active',
        })
        .sort({ updatedAt: -1 })
        .limit(MAX_CAMPAIGNS_PER_CYCLE)
        .exec();

      this.logger.log(
        `Found ${activeCampaigns.length} campaigns eligible for trigger evaluation`,
        'CronAgentCampaignOrchestratorService',
      );

      for (const campaign of activeCampaigns) {
        try {
          await this.triggerEvaluatorQueueService.queueCampaignEvaluation({
            campaignId: String(campaign._id),
            organizationId: String(campaign.organization),
            userId: String(campaign.user),
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Campaign ${String(campaign._id)} trigger evaluation queueing failed: ${message}`,
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
