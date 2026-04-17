import { AgentGoalsModule } from '@api/collections/agent-goals/agent-goals.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { forwardRef, Module } from '@nestjs/common';
import { CronProactiveAgentService } from '@workers/crons/agent/cron.proactive-agent.service';

@Module({
  exports: [CronProactiveAgentService],
  imports: [
    forwardRef(() => AgentOrchestratorModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => AgentGoalsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => QueuesModule),
    forwardRef(() => OrganizationSettingsModule),
  ],
  providers: [CronProactiveAgentService],
})
export class CronProactiveAgentModule {}
