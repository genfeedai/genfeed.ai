/**
 * Agent Campaigns Module
 * Manages multi-agent campaign configurations for coordinated content production.
 * Groups agent strategies under a shared campaign with budget and quota controls.
 */
import { AgentCampaignsController } from '@api/collections/agent-campaigns/controllers/agent-campaigns.controller';
import { AgentCampaignExecutionService } from '@api/collections/agent-campaigns/services/agent-campaign-execution.service';
import { AgentCampaignsService } from '@api/collections/agent-campaigns/services/agent-campaigns.service';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import { UsersModule } from '@api/collections/users/users.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentRuntimeModule } from '@api/services/agent-runtime/agent-runtime.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentCampaignsController],
  exports: [AgentCampaignsService, AgentCampaignExecutionService],
  imports: [
    AgentStrategiesModule,
    QueuesModule,
    UsersModule,
    AgentRuntimeModule,
  ],
  providers: [AgentCampaignsService, AgentCampaignExecutionService],
})
export class AgentCampaignsModule {}
