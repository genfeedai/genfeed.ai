import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { TaskCommentsModule } from '@api/collections/task-comments/task-comments.module';
import { TaskCountersModule } from '@api/collections/task-counters/task-counters.module';
import { TasksController } from '@api/collections/tasks/controllers/tasks.controller';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [TasksController],
  exports: [TasksService],
  imports: [
    AgentMessagesModule,
    forwardRef(() => AgentOrchestratorModule),
    forwardRef(() => AgentRunsModule),
    AgentThreadsModule,
    forwardRef(() => IngredientsModule),
    NotificationsPublisherModule,
    SkillsModule,
    forwardRef(() => QueuesModule),
    TaskCommentsModule,
    TaskCountersModule,
    forwardRef(() => OrganizationsModule),
    LoggerModule,
  ],
  providers: [TasksService],
})
export class TasksModule {}
