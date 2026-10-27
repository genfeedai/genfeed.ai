import { AgentStrategiesCoreModule } from '@api/collections/agent-strategies/agent-strategies-core.module';
import { AgentStrategyAutopilotPerformanceService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service';
import { AgentStrategyConversationQueueService } from '@api/collections/agent-strategies/services/agent-strategy-conversation-queue.service';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import { ContentPerformanceCoreModule } from '@api/collections/content-performance/content-performance-core.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    AgentStrategiesCoreModule,
    ContentPerformanceCoreModule,
    PostsCoreModule,
    PrismaModule,
    LoggerModule,
  ],
  providers: [
    AgentStrategyAutopilotPerformanceService,
    AgentStrategyConversationQueueService,
    AgentStrategyOpportunitiesService,
    AgentStrategyReportsService,
  ],
  exports: [
    AgentStrategyAutopilotPerformanceService,
    AgentStrategyConversationQueueService,
    AgentStrategyOpportunitiesService,
    AgentStrategyReportsService,
  ],
})
export class AgentStrategyPerformanceModule {}
