import {
  AgentGoal,
  AgentGoalSchema,
} from '@api/collections/agent-goals/schemas/agent-goal.schema';
import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  exports: [AgentGoalsService, MongooseModule],
  imports: [
    LoggerModule,
    forwardRef(() => AnalyticsModule),
    MongooseModule.forFeature(
      [{ name: AgentGoal.name, schema: AgentGoalSchema }],
      DB_CONNECTIONS.AGENT,
    ),
  ],
  providers: [AgentGoalsService],
})
export class AgentGoalsModule {}
