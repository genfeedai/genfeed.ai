import {
  AgentCampaign,
  AgentCampaignSchema,
} from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AgentCampaignOrchestratorModule } from '@api/services/agent-campaign/agent-campaign-orchestrator.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CronAgentCampaignOrchestratorService } from '@workers/crons/agent-campaign/cron.agent-campaign-orchestrator.service';

@Module({
  exports: [CronAgentCampaignOrchestratorService],
  imports: [
    forwardRef(() => AgentCampaignOrchestratorModule),
    MongooseModule.forFeature(
      [{ name: AgentCampaign.name, schema: AgentCampaignSchema }],
      DB_CONNECTIONS.AGENT,
    ),
  ],
  providers: [CronAgentCampaignOrchestratorService],
})
export class CronAgentCampaignOrchestratorModule {}
