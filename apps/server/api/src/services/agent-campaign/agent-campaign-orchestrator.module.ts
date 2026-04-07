import { AgentCampaignsModule } from '@api/collections/agent-campaigns/agent-campaigns.module';
import { AgentGoalsModule } from '@api/collections/agent-goals/agent-goals.module';
import { AgentMemoriesModule } from '@api/collections/agent-memories/agent-memories.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { CampaignMemoryQueueService } from '@api/services/agent-campaign/campaign-memory-queue.service';
import { ContentEngineService } from '@api/services/agent-campaign/content-engine.service';
import {
  CAMPAIGN_MEMORY_EXTRACTION_QUEUE,
  ORCHESTRATOR_RUN_QUEUE,
  TRIGGER_EVALUATION_QUEUE,
} from '@api/services/agent-campaign/orchestrator.constants';
import { OrchestratorQueueService } from '@api/services/agent-campaign/orchestrator-queue.service';
import { TriggerEvaluatorService } from '@api/services/agent-campaign/trigger-evaluator.service';
import { TriggerEvaluatorQueueService } from '@api/services/agent-campaign/trigger-evaluator-queue.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [
    CampaignMemoryQueueService,
    ContentEngineService,
    OrchestratorQueueService,
    TriggerEvaluatorQueueService,
    TriggerEvaluatorService,
  ],
  imports: [
    LoggerModule,
    forwardRef(() => AgentCampaignsModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => AgentStrategiesModule),
    forwardRef(() => AgentGoalsModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => AgentMemoriesModule),
    forwardRef(() => AnalyticsModule),
    forwardRef(() => TrendsModule),
    forwardRef(() => QueuesModule),
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 10_000, type: 'exponential' },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      name: ORCHESTRATOR_RUN_QUEUE,
    }),
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 10_000, type: 'exponential' },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      name: CAMPAIGN_MEMORY_EXTRACTION_QUEUE,
    }),
    BullModule.registerQueue({
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 5_000, type: 'exponential' },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
      name: TRIGGER_EVALUATION_QUEUE,
    }),
  ],
  providers: [
    CampaignMemoryQueueService,
    ContentEngineService,
    OrchestratorQueueService,
    TriggerEvaluatorQueueService,
    TriggerEvaluatorService,
  ],
})
export class AgentCampaignOrchestratorModule {}
