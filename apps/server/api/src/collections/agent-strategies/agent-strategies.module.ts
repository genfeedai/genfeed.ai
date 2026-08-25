/**
 * Agent Strategies Module
 * Manages proactive AI agent strategy configurations.
 * Stores schedule, content mix, engagement, and budget settings for autonomous agents.
 */

import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AgentStrategiesController } from '@api/collections/agent-strategies/controllers/agent-strategies.controller';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentStrategyAutopilotExecutionService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-execution.service';
import { AgentStrategyAutopilotPerformanceService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service';
import { AgentStrategyAutopilotPlanningService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-planning.service';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { AgentStrategyWorkflowRunService } from '@api/collections/agent-strategies/services/agent-strategy-workflow-run.service';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { EvaluationsModule } from '@api/collections/evaluations/evaluations.module';
import { OptimizersModule } from '@api/collections/optimizers/optimizers.module';
import { PostAccountFanoutModule } from '@api/collections/posts/post-account-fanout.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ContentGatewayModule } from '@api/services/content-gateway/content-gateway.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentStrategiesController],
  exports: [
    AgentStrategiesService,
    AgentStrategyAutopilotService,
    AgentStrategyOpportunitiesService,
    AgentStrategyReportsService,
    AgentStrategyWorkflowRunService,
  ],
  imports: [
    ActivitiesModule,
    ContentGatewayModule,
    BatchGenerationModule,
    ContentPerformanceModule,
    CredentialsCoreModule,
    EvaluationsModule,
    OptimizersModule,
    PostAccountFanoutModule,
    PostsCoreModule,
    TrendsModule,
  ],
  providers: [
    AgentStrategiesService,
    AgentStrategyOpportunitiesService,
    AgentStrategyReportsService,
    AgentStrategyAutopilotExecutionService,
    AgentStrategyAutopilotPerformanceService,
    AgentStrategyAutopilotPlanningService,
    AgentStrategyAutopilotService,
    AgentStrategyWorkflowRunService,
  ],
})
export class AgentStrategiesModule {}
