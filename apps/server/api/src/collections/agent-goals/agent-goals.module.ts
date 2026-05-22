import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [AgentGoalsService],
  imports: [LoggerModule, AnalyticsModule],
  providers: [AgentGoalsService],
})
export class AgentGoalsModule {}
