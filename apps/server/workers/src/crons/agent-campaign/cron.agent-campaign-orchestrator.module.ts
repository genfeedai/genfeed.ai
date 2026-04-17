import { AgentCampaignOrchestratorModule } from '@api/services/agent-campaign/agent-campaign-orchestrator.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronAgentCampaignOrchestratorService } from '@workers/crons/agent-campaign/cron.agent-campaign-orchestrator.service';

@Module({
  exports: [CronAgentCampaignOrchestratorService],
  imports: [forwardRef(() => AgentCampaignOrchestratorModule)],
  providers: [CronAgentCampaignOrchestratorService],
})
export class CronAgentCampaignOrchestratorModule {}
