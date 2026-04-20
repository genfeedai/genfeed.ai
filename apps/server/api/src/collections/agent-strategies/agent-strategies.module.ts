/**
 * Agent Strategies Module
 * Manages proactive AI agent strategy configurations.
 * Stores schedule, content mix, engagement, and budget settings for autonomous agents.
 */

import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AgentStrategiesController } from '@api/collections/agent-strategies/controllers/agent-strategies.controller';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.service';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentDraftsModule } from '@api/collections/content-drafts/content-drafts.module';
import { ContentPerformanceModule } from '@api/collections/content-performance/content-performance.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { EvaluationsModule } from '@api/collections/evaluations/evaluations.module';
import { OptimizersModule } from '@api/collections/optimizers/optimizers.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { TrendsModule } from '@api/collections/trends/trends.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ContentGatewayModule } from '@api/services/content-gateway/content-gateway.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [AgentStrategiesController],
  exports: [
    AgentStrategiesService,
    AgentStrategyAutopilotService,
    AgentStrategyOpportunitiesService,
    AgentStrategyReportsService,
  ],
  imports: [
    ActivitiesModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => ContentDraftsModule),
    ContentGatewayModule,
    BatchGenerationModule,
    forwardRef(() => ContentPerformanceModule),
    CredentialsModule,
    EvaluationsModule,
    OptimizersModule,
    PostsModule,
    TrendsModule,
  ],
  providers: [
    AgentStrategiesService,
    AgentStrategyOpportunitiesService,
    AgentStrategyReportsService,
    AgentStrategyAutopilotService,
  ],
})
export class AgentStrategiesModule {}
