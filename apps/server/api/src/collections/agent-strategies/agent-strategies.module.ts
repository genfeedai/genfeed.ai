/**
 * Agent Strategies Module
 * Manages proactive AI agent strategy configurations.
 * Stores schedule, content mix, engagement, and budget settings for autonomous agents.
 */

import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { AgentStrategiesController } from '@api/collections/agent-strategies/controllers/agent-strategies.controller';
import {
  AgentStrategy,
  AgentStrategySchema,
} from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import {
  AgentStrategyOpportunity,
  AgentStrategyOpportunitySchema,
} from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import {
  AgentStrategyReport,
  AgentStrategyReportSchema,
} from '@api/collections/agent-strategies/schemas/agent-strategy-report.schema';
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
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ContentGatewayModule } from '@api/services/content-gateway/content-gateway.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [AgentStrategiesController],
  exports: [
    AgentStrategiesService,
    AgentStrategyAutopilotService,
    AgentStrategyOpportunitiesService,
    AgentStrategyReportsService,
    MongooseModule,
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
    MongooseModule.forFeatureAsync(
      [
        {
          name: AgentStrategy.name,
          useFactory: () => {
            const schema = AgentStrategySchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Compound index for cron scheduler queries
            schema.index(
              {
                isActive: 1,
                isDeleted: 1,
                isEnabled: 1,
                nextRunAt: 1,
                organization: 1,
              },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Compound index for organization listing queries
            schema.index(
              { isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
        {
          name: AgentStrategyOpportunity.name,
          useFactory: () => {
            const schema = AgentStrategyOpportunitySchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1, strategy: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );
            schema.index(
              { expiresAt: 1, isDeleted: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
        {
          name: AgentStrategyReport.name,
          useFactory: () => {
            const schema = AgentStrategyReportSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { isDeleted: 1, organization: 1, periodEnd: -1, strategy: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AGENT,
    ),
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
