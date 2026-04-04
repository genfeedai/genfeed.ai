/**
 * Agent Campaigns Module
 * Manages multi-agent campaign configurations for coordinated content production.
 * Groups agent strategies under a shared campaign with budget and quota controls.
 */
import { AgentCampaignsController } from '@api/collections/agent-campaigns/controllers/agent-campaigns.controller';
import {
  AgentCampaign,
  AgentCampaignSchema,
} from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { UsersModule } from '@api/collections/users/users.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { QueuesModule } from '@api/queues/core/queues.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [AgentCampaignsController],
  exports: [
    AgentCampaignsService,
    AgentCampaignExecutionService,
    MongooseModule,
  ],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: AgentCampaign.name,
          useFactory: () => {
            const schema = AgentCampaignSchema;
            schema.plugin(mongooseAggregatePaginateV2);

            // Compound index for organization listing queries
            schema.index(
              { isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Compound index for status filtering
            schema.index(
              { isDeleted: 1, organization: 1, status: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index(
              {
                isDeleted: 1,
                nextOrchestratedAt: 1,
                orchestrationEnabled: 1,
                organization: 1,
                status: 1,
              },
              {
                partialFilterExpression: {
                  isDeleted: false,
                  orchestrationEnabled: true,
                  status: 'active',
                },
              },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AGENT,
    ),
    forwardRef(() => AgentStrategiesModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => QueuesModule),
    forwardRef(() => UsersModule),
  ],
  providers: [AgentCampaignsService, AgentCampaignExecutionService],
})
export class AgentCampaignsModule {}
