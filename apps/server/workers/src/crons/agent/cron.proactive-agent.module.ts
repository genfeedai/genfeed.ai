import { AgentGoalsModule } from '@api/collections/agent-goals/agent-goals.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentStrategiesModule } from '@api/collections/agent-strategies/agent-strategies.module';
import {
  AgentStrategy,
  AgentStrategySchema,
} from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CronProactiveAgentService } from '@workers/crons/agent/cron.proactive-agent.service';

@Module({
  exports: [CronProactiveAgentService],
  imports: [
    forwardRef(() => AgentOrchestratorModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => AgentStrategiesModule),
    forwardRef(() => AgentGoalsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => QueuesModule),
    forwardRef(() => OrganizationSettingsModule),
    MongooseModule.forFeature(
      [{ name: AgentStrategy.name, schema: AgentStrategySchema }],
      DB_CONNECTIONS.AGENT,
    ),
  ],
  providers: [CronProactiveAgentService],
})
export class CronProactiveAgentModule {}
