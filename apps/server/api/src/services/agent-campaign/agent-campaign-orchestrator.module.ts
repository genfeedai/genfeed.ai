import { AgentCampaignsModule } from '@api/collections/agent-campaigns/agent-campaigns.module';
import { AgentGoalsModule } from '@api/collections/agent-goals/agent-goals.module';
import { AgentMemoriesModule } from '@api/collections/agent-memories/agent-memories.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { AgentRuntimeModule } from '@api/services/agent-runtime/agent-runtime.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { AgentCampaignWorkflowService } from '@server/services/agent-campaign/agent-campaign-workflow.service';
import { CampaignWinnerExtractionService } from '@server/services/agent-campaign/campaign-winner-extraction.service';
import { ContentEngineService } from '@server/services/agent-campaign/content-engine.service';
import { ContentRotationService } from '@server/services/agent-campaign/content-rotation.service';
import { TriggerEvaluatorService } from '@server/services/agent-campaign/trigger-evaluator.service';

@Module({
  exports: [
    AgentCampaignWorkflowService,
    CampaignWinnerExtractionService,
    ContentEngineService,
    ContentRotationService,
    TriggerEvaluatorService,
  ],
  imports: [
    LoggerModule,
    AgentCampaignsModule,
    BrandsModule,
    AgentStrategiesModule,
    AgentGoalsModule,
    AgentMemoriesModule,
    AnalyticsModule,
    TrendsModule,
    AgentRuntimeModule,
    WorkflowsModule,
  ],
  providers: [
    AgentCampaignWorkflowService,
    CampaignWinnerExtractionService,
    ContentEngineService,
    ContentRotationService,
    TriggerEvaluatorService,
  ],
})
export class AgentCampaignOrchestratorModule {}
