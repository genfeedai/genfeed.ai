import { AgentMemoriesModule } from '@api/collections/agent-memories/agent-memories.module';
import { AgentMessagesModule } from '@api/collections/agent-messages/agent-messages.module';
import { AgentRunsModule } from '@api/collections/agent-runs/agent-runs.module';
import { AgentThreadsModule } from '@api/collections/agent-threads/agent-threads.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SkillsModule } from '@api/collections/skills/skills.module';
import { TaskCommentsModule } from '@api/collections/task-comments/task-comments.module';
import { TaskCountersModule } from '@api/collections/task-counters/task-counters.module';
import { TasksController } from '@api/collections/tasks/controllers/tasks.controller';
import { TaskActionsService } from '@api/collections/tasks/services/task-actions.service';
import { TaskPlanningService } from '@api/collections/tasks/services/task-planning.service';
import { TaskRoutingService } from '@api/collections/tasks/services/task-routing.service';
import { TasksService } from '@api/collections/tasks/services/tasks.service';
import { TASKS_SERVICE } from '@api/collections/tasks/tasks.tokens';
import { QueuesModule } from '@api/queues/core/queues.module';
import { AgentOrchestratorModule } from '@api/services/agent-orchestrator/agent-orchestrator.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [TasksController],
  exports: [TasksService],
  imports: [
    forwardRef(() => AgentMessagesModule),
    forwardRef(() => AgentMemoriesModule),
    forwardRef(() => AgentOrchestratorModule),
    forwardRef(() => AgentRunsModule),
    forwardRef(() => AgentThreadsModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => SkillsModule),
    forwardRef(() => QueuesModule),
    forwardRef(() => TaskCommentsModule),
    forwardRef(() => TaskCountersModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => LoggerModule),
  ],
  providers: [
    TaskActionsService,
    TaskPlanningService,
    TaskRoutingService,
    TasksService,
    // Token alias so TaskActionsService/TaskPlanningService inject TasksService
    // without a load-time class reference (breaks the bundle TDZ — see
    // tasks.tokens.ts). Resolves to the same singleton instance.
    { provide: TASKS_SERVICE, useExisting: TasksService },
  ],
})
export class TasksModule {}
